/**
 * tests/agentTelechargement.test.js
 *
 * LE DÉFAUT QUE CES TESTS EMPÊCHENT DE REVENIR
 *
 * L'écran de mise en service affichait une commande commençant par
 * `.\installer.ps1`. Elle ne peut fonctionner que dans le dossier du
 * dépôt. Le client d'une plateforme hébergée n'a pas de dépôt : il
 * obtenait un « CommandNotFoundException » à la première minute de son
 * utilisation du produit.
 *
 * Ce défaut a une propriété désagréable : il ne se voit PAS depuis le
 * développement. Sur le poste qui a cloné le projet, la commande marche.
 * Elle ne casse que chez quelqu'un d'autre, et ce quelqu'un d'autre est
 * un prospect. D'où ces tests, qui vérifient la forme de la commande et
 * la disponibilité de ce qu'elle télécharge.
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const Module = require("node:module");

process.env.JWT_SECRET = process.env.JWT_SECRET || "secret-de-test-sans-valeur";

const CHEMIN_DB = require.resolve("../src/db");

/** Fausse base : un seul site, jeton connu. */
function poserFausseBase(jeton) {
  const faux = {
    query: async (sql, params) => {
      if (/FROM SITE/i.test(sql)) {
        return Number(params[0]) === 3
          ? [[{ id_site: 3, agent_token: jeton }]]
          : [[]];
      }
      return [[]];
    },
    getConnection: async () => ({ release() {} }),
  };
  require.cache[CHEMIN_DB] = new Module(CHEMIN_DB, null);
  require.cache[CHEMIN_DB].filename = CHEMIN_DB;
  require.cache[CHEMIN_DB].loaded = true;
  require.cache[CHEMIN_DB].exports = faux;
}

function chargerRouteur() {
  const chemin = require.resolve("../src/routes/agentTelechargement");
  delete require.cache[chemin];
  return require(chemin);
}

/** Appelle un gestionnaire de route sans démarrer de serveur HTTP. */
function appeler(routeur, methode, chemin, { entetes = {}, query = {} } = {}) {
  const couche = routeur.stack.find(
    (c) => c.route && c.route.path === chemin && c.route.methods[methode]
  );
  assert.ok(couche, `la route ${methode.toUpperCase()} ${chemin} doit exister`);

  return new Promise((resolve) => {
    const req = { headers: entetes, query, params: {} };
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(charge) {
        resolve({ statut: this.statusCode, corps: charge });
        return this;
      },
      type() {
        return this;
      },
      send(charge) {
        resolve({ statut: this.statusCode, corps: charge });
        return this;
      },
      sendFile(cheminFichier) {
        resolve({ statut: this.statusCode, fichier: cheminFichier });
        return this;
      },
    };
    couche.route.stack[0].handle(req, res, () => {});
  });
}

test.afterEach(() => {
  delete require.cache[CHEMIN_DB];
  delete require.cache[require.resolve("../src/routes/agentTelechargement")];
});

/* ═══════════════════════════════════════════════════════════════════════
   CE QUI PART CHEZ LE CLIENT
   ═══════════════════════════════════════════════════════════════════════ */

test("la fermeture contient l'agent et ce dont il a besoin", () => {
  poserFausseBase("jeton");
  const { calculerFermeture } = chargerRouteur();
  const liste = calculerFermeture();

  for (const attendu of [
    "src/agent/agent.js",
    "src/services/discoveryService.js",
    "src/services/traficService.js",
    "package.json",
  ]) {
    assert.ok(liste.includes(attendu), `${attendu} doit être servi à l'agent`);
  }
});

test("le serveur lui-même ne part PAS chez le client", () => {
  poserFausseBase("jeton");
  const { calculerFermeture } = chargerRouteur();
  const liste = calculerFermeture();

  /* L'ancien installateur copiait src/ en entier : l'authentification, la
     vérification de licence et les routes de la plateforme atterrissaient
     sur la machine de chaque client, pour faire tourner un agent qui ne
     s'en sert pas. Moins il y a de code chez le client, moins il y a de
     surface à défendre. */
  for (const interdit of [
    "src/server.js",
    "src/routes/sites.js",
    "src/services/editionService.js",
    "src/middleware/authMiddleware.js",
  ]) {
    assert.ok(!liste.includes(interdit), `${interdit} n'a rien à faire chez le client`);
  }
});

test("une fermeture vide est reconnue comme une panne, pas comme un résultat", () => {
  poserFausseBase("jeton");
  const { fermetureSuspecte } = chargerRouteur();

  assert.equal(fermetureSuspecte([]), true);
  assert.equal(fermetureSuspecte(["package.json"]), true);
  assert.equal(
    fermetureSuspecte(["src/agent/agent.js", "a", "b", "c", "d"]),
    false
  );
});

/* ═══════════════════════════════════════════════════════════════════════
   LE JETON
   ═══════════════════════════════════════════════════════════════════════ */

test("sans jeton, la liste des fichiers est refusée", async () => {
  poserFausseBase("le-bon-jeton");
  const routeur = chargerRouteur();

  const r = await appeler(routeur, "get", "/agent/fichiers.json", {
    query: { site: "3" },
  });
  assert.equal(r.statut, 401);
});

test("un mauvais jeton est refusé", async () => {
  poserFausseBase("le-bon-jeton");
  const routeur = chargerRouteur();

  const r = await appeler(routeur, "get", "/agent/fichiers.json", {
    entetes: { authorization: "Bearer un-autre-jeton" },
    query: { site: "3" },
  });
  assert.equal(r.statut, 401);
});

test("le jeton d'un site ne donne pas accès au nom d'un autre site", async () => {
  poserFausseBase("le-bon-jeton");
  const routeur = chargerRouteur();

  const r = await appeler(routeur, "get", "/agent/fichiers.json", {
    entetes: { authorization: "Bearer le-bon-jeton" },
    query: { site: "9" }, // site inexistant dans la fausse base
  });
  assert.equal(r.statut, 401);
});

test("avec le bon jeton, la liste est servie", async () => {
  poserFausseBase("le-bon-jeton");
  const routeur = chargerRouteur();

  const r = await appeler(routeur, "get", "/agent/fichiers.json", {
    entetes: { authorization: "Bearer le-bon-jeton" },
    query: { site: "3" },
  });
  assert.equal(r.statut, 200);
  assert.ok(r.corps.fichiers.length >= 5);
  assert.ok(r.corps.fichiers.every((f) => Number.isInteger(f.octets)));
});

/* ═══════════════════════════════════════════════════════════════════════
   LE CHEMIN DEMANDÉ NE CONSTRUIT JAMAIS UN ACCÈS DISQUE
   ═══════════════════════════════════════════════════════════════════════ */

test("un chemin hors de la liste est introuvable, pas nettoyé", async () => {
  poserFausseBase("le-bon-jeton");
  const routeur = chargerRouteur();

  for (const tentative of [
    "../.env",
    "../../.env",
    "src/../.env",
    "/etc/passwd",
    "src/routes/sites.js",
    "licence-privee.pem",
  ]) {
    const r = await appeler(routeur, "get", "/agent/fichier", {
      entetes: { authorization: "Bearer le-bon-jeton" },
      query: { site: "3", chemin: tentative },
    });
    assert.equal(r.statut, 404, `${tentative} ne doit jamais être servi`);
  }
});

test("un fichier de la liste est bien servi", async () => {
  poserFausseBase("le-bon-jeton");
  const routeur = chargerRouteur();

  const r = await appeler(routeur, "get", "/agent/fichier", {
    entetes: { authorization: "Bearer le-bon-jeton" },
    query: { site: "3", chemin: "src/agent/agent.js" },
  });
  assert.equal(r.statut, 200);
  assert.ok(r.fichier.endsWith(path.join("src", "agent", "agent.js")));
});

/* ═══════════════════════════════════════════════════════════════════════
   LA COMMANDE AFFICHÉE À L'INSCRIT
   ═══════════════════════════════════════════════════════════════════════ */

test("la commande Windows est autonome : elle ne suppose aucun fichier local", () => {
  const { commandesInstallation } = require("../src/routes/sites");
  const { windows } = commandesInstallation(
    { id_site: 3, agent_token: "JETON", cidr_suggere: "192.168.0.0/24" },
    "http://192.168.0.71:5000/api"
  );

  assert.ok(
    windows.includes("http://192.168.0.71:5000/api/agent/installer.ps1"),
    "la commande doit récupérer le script auprès de la plateforme"
  );
  assert.ok(
    !/^\.\\installer\.ps1/.test(windows),
    "la commande ne doit plus commencer par un chemin relatif"
  );
  assert.ok(
    windows.includes("-Scope Process"),
    "la politique d'exécution ne doit être modifiée que pour la fenêtre courante"
  );
  assert.ok(
    !/LocalMachine|CurrentUser/.test(windows),
    "la machine du client ne doit pas être modifiée durablement"
  );
  assert.ok(
    !windows.includes("\n"),
    "une commande PowerShell collée doit tenir sur une seule ligne"
  );
  assert.ok(windows.includes("-Site 3") && windows.includes("JETON"));
});

test("la commande Linux écrit le script avant de l'exécuter", () => {
  const { commandesInstallation } = require("../src/routes/sites");
  const { linux } = commandesInstallation(
    { id_site: 3, agent_token: "JETON", cidr_suggere: "10.0.0.0/24" },
    "https://superviseur.exemple.com/api"
  );

  assert.ok(linux.includes("/agent/installer.sh"));
  /* Surtout PAS `curl … | sudo bash` : une coupure réseau en cours de
     transfert exécuterait la moitié du script, donc la moitié d'une
     installation, sans que rien ne le signale. */
  assert.ok(!/\|\s*(sudo\s+)?bash/.test(linux), "jamais de tube vers bash");
  assert.ok(linux.includes("-o /tmp/nsm-installer.sh"));
  assert.ok(linux.includes("--site 3"));
});

/* ═══════════════════════════════════════════════════════════════════════
   LES DEUX INSTALLATEURS SAVENT SE PASSER DU DÉPÔT
   ═══════════════════════════════════════════════════════════════════════ */

test("les installateurs téléchargent les fichiers quand le dépôt est absent", () => {
  const fs = require("node:fs");
  const racine = path.resolve(__dirname, "..");

  const ps1 = fs.readFileSync(path.join(racine, "src/agent/installer.ps1"), "utf8");
  assert.ok(ps1.includes("/agent/fichiers.json"), "installer.ps1 doit savoir télécharger");
  assert.ok(
    !ps1.includes("Rouge \"Sources introuvables"),
    "installer.ps1 ne doit plus abandonner faute de dépôt"
  );

  const sh = fs.readFileSync(path.join(racine, "src/agent/installer.sh"), "utf8");
  assert.ok(sh.includes("/agent/fichiers.json"), "installer.sh doit savoir télécharger");
  assert.ok(
    !sh.includes("rouge \"Sources introuvables"),
    "installer.sh ne doit plus abandonner faute de dépôt"
  );
});
