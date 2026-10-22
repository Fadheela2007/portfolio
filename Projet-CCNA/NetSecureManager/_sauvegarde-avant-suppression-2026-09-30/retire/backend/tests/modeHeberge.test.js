/**
 * tests/modeHeberge.test.js
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CES TESTS EMPÊCHENT DE REVENIR
 *
 * `SITE.supervision_par_agent` vaut FALSE par défaut en base. Sur une
 * plateforme installée DANS le réseau du client, c'est juste : le
 * serveur central pingue, il est sur place.
 *
 * Sur une plateforme HÉBERGÉE, c'est faux pour tous les sites. Le
 * serveur est sur Internet, les réseaux des clients sont privés, aucun
 * ping ne les atteint. Un site créé en supervision centrale y produit
 * ceci : l'agent du client remonte quarante machines, le serveur central
 * les pingue en vain, elles passent toutes `down`, et le client reçoit
 * une alerte d'indisponibilité sur une agence qui fonctionne.
 *
 * L'inscription posait déjà TRUE sur le premier site (routes/auth.js).
 * L'écran Sites, non : le deuxième site d'un client était traité
 * autrement que le premier.
 */

const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

process.env.JWT_SECRET = process.env.JWT_SECRET || "secret-de-test-sans-valeur";

const CHEMIN_DB = require.resolve("../src/db");
const CHEMIN_SITES = require.resolve("../src/routes/sites");

/* ═══════════════════════════════════════════════════════════════════════
   LA LECTURE DU RÉGLAGE
   ═══════════════════════════════════════════════════════════════════════ */

test("le mode hébergé se lit dans l'environnement, et vaut non par défaut", () => {
  const { estHeberge } = require("../src/services/deploiement");
  const avant = process.env.MODE_HEBERGE;

  try {
    delete process.env.MODE_HEBERGE;
    assert.equal(estHeberge(), false, "absent = installation chez le client");

    for (const oui of ["1", "true", "TRUE", "oui", "Oui", "yes", "on"]) {
      process.env.MODE_HEBERGE = oui;
      assert.equal(estHeberge(), true, `« ${oui} » doit valoir oui`);
    }

    /* Une valeur quelconque ne doit PAS valoir oui. Le mode hébergé
       coupe la supervision centrale : on ne l'active pas sur une faute
       de frappe. */
    for (const non of ["", "false", "non", "0", "peut-être", "off"]) {
      process.env.MODE_HEBERGE = non;
      assert.equal(estHeberge(), false, `« ${non} » ne doit pas valoir oui`);
    }
  } finally {
    if (avant === undefined) delete process.env.MODE_HEBERGE;
    else process.env.MODE_HEBERGE = avant;
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   LA CRÉATION D'UN SITE
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Charge routes/sites.js avec une fausse base et appelle POST /sites.
 *
 * @param {boolean} colonnePresente  false simule une base sans la
 *                                   migration du 8 septembre.
 */
function creerSite({ heberge, colonnePresente = true }) {
  const requetes = [];

  const faux = {
    query: async (sql, params) => {
      const propre = sql.replace(/\s+/g, " ").trim();
      requetes.push({ sql: propre, params });

      if (/INSERT INTO SITE/i.test(propre)) {
        if (!colonnePresente && /supervision_par_agent/i.test(propre)) {
          throw new Error("Unknown column 'supervision_par_agent' in 'field list'");
        }
        return [{ insertId: 7 }];
      }
      if (/COUNT\(\*\)/i.test(propre)) return [[{ n: 0 }]];
      if (/INSERT INTO JOURNAL/i.test(propre)) return [{ insertId: 1 }];
      return [[]];
    },
    getConnection: async () => ({ release() {} }),
  };

  require.cache[CHEMIN_DB] = new Module(CHEMIN_DB, null);
  require.cache[CHEMIN_DB].filename = CHEMIN_DB;
  require.cache[CHEMIN_DB].loaded = true;
  require.cache[CHEMIN_DB].exports = faux;

  if (heberge) process.env.MODE_HEBERGE = "true";
  else delete process.env.MODE_HEBERGE;

  delete require.cache[CHEMIN_SITES];
  const routeur = require(CHEMIN_SITES);

  const couche = routeur.stack.find(
    (c) => c.route && c.route.path === "/sites" && c.route.methods.post
  );
  assert.ok(couche, "la route POST /sites doit exister");

  // Le dernier maillon est le gestionnaire ; celui d'avant est requireRole,
  // qu'on court-circuite : ces tests portent sur la création, pas sur les
  // droits — vérifiés ailleurs.
  const gestionnaire = couche.route.stack[couche.route.stack.length - 1].handle;

  return new Promise((resolve, reject) => {
    const req = {
      body: { nom: "Agence Bonanjo", ville: "Douala" },
      headers: {},
      query: {},
      params: {},
      ip: "10.0.0.1",
      utilisateur: { id_utilisateur: 1, role: "admin", id_site: null, id_organisation: 4 },
    };
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(charge) {
        resolve({ statut: this.statusCode, corps: charge, requetes });
        return this;
      },
    };
    Promise.resolve(gestionnaire(req, res, reject)).catch(reject);
  });
}

test.afterEach(() => {
  delete require.cache[CHEMIN_DB];
  delete require.cache[CHEMIN_SITES];
  delete process.env.MODE_HEBERGE;
});

test("en hébergé, un site créé attend son agent local", async () => {
  const r = await creerSite({ heberge: true });

  assert.equal(r.statut, 200);
  assert.equal(r.corps.supervision_par_agent, true);

  const insertion = r.requetes.find((q) => /INSERT INTO SITE/i.test(q.sql));
  assert.ok(/supervision_par_agent/i.test(insertion.sql));
  assert.equal(insertion.params[4], true, "la colonne doit être posée à TRUE");
});

test("hors hébergement, le comportement historique ne change pas", async () => {
  const r = await creerSite({ heberge: false });

  assert.equal(r.statut, 200);
  assert.equal(r.corps.supervision_par_agent, false);

  const insertion = r.requetes.find((q) => /INSERT INTO SITE/i.test(q.sql));
  assert.equal(insertion.params[4], false, "le serveur central garde la main");
});

test("une base sans la colonne crée quand même le site", async () => {
  /* Refuser la création pour une colonne de confort priverait le client
     de la fonction principale de l'écran — pour une migration en retard,
     qui n'est pas de son fait. */
  const r = await creerSite({ heberge: true, colonnePresente: false });

  assert.equal(r.statut, 200);
  assert.equal(r.corps.id_site, 7);

  const insertions = r.requetes.filter((q) => /INSERT INTO SITE/i.test(q.sql));
  assert.equal(insertions.length, 2, "une tentative, puis le repli");
  assert.ok(!/supervision_par_agent/i.test(insertions[1].sql));
});

/* ═══════════════════════════════════════════════════════════════════════
   L'AVERTISSEMENT QUI AURAIT TORT
   ═══════════════════════════════════════════════════════════════════════ */

test("le cycle vide n'est pas signalé comme une panne en hébergé", () => {
  const source = require("node:fs").readFileSync(
    require.resolve("../src/services/monitoringService"),
    "utf8"
  );

  /* En hébergé, un cycle central qui ne supervise rien est l'état NORMAL
     et voulu. L'avertissement annoncerait une panne à chaque démarrage,
     en conseillant de décocher la supervision par agent — ce qui
     casserait le fonctionnement au lieu de le rétablir. */
  assert.ok(
    /supervisionVideSignalee\s*&&\s*!deploiement\.estHeberge\(\)/.test(source),
    "l'avertissement « supervision centrale à l'arrêt » doit être muet en hébergé"
  );
});
