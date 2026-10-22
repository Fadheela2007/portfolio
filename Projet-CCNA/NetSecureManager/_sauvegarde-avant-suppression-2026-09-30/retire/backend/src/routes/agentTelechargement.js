/**
 * routes/agentTelechargement.js
 * De quoi installer l'agent sur une machine qui n'a pas le dépôt.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LE TROU QUE CE FICHIER BOUCHE
 *
 * L'écran de mise en service donnait une commande à coller :
 *
 *     .\installer.ps1 -Url "…" -Token "…" -Site 3 -Cidr "…"
 *
 * Cette commande suppose deux choses que le client n'a pas :
 *   1. le fichier installer.ps1, quelque part sur son disque ;
 *   2. les sources de l'agent à côté, puisque l'installateur les copie
 *      depuis `..\..` — le dossier backend du dépôt.
 *
 * Sur une plateforme hébergée, le client ne clone rien. Il s'inscrit sur
 * un site web. Il n'a NI le script NI les sources. La commande échouait
 * donc à la toute première étape du parcours qu'elle était censée ouvrir,
 * avec un « CommandNotFoundException » qui ne dit rien à personne.
 *
 * Le serveur central sert donc lui-même ce qu'il demande d'exécuter.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DEUX NIVEAUX D'ACCÈS, ET LA RAISON DE CHACUN
 *
 * LES SCRIPTS D'INSTALLATION SONT PUBLICS. Ils ne contiennent aucun
 * secret : le jeton leur est passé en paramètre, il n'est pas dedans. Les
 * rendre publics permet à la commande collée de tenir sur une ligne, sans
 * en-tête d'authentification à recopier. Un script d'installation qu'on
 * ne peut pas télécharger simplement n'est pas installé du tout.
 *
 * LES FICHIERS DE L'AGENT DEMANDENT LE JETON DU SITE. C'est le même
 * `Authorization: Bearer <jeton>` que les remontées, vérifié contre la
 * table SITE. Ce n'est pas du secret — le code est ouvert — mais servir
 * des centaines de kilo-octets à quiconque le demande transforme le
 * serveur en hébergement de fichiers gratuit, et laisse une porte ouverte
 * à qui veut le saturer.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CE QUI PART CHEZ LE CLIENT, ET CE QUI N'EN PART PAS
 *
 * PAS tout `src/`. L'installateur copiait le dossier entier : les routes,
 * l'authentification, la vérification de licence, les rapports — tout le
 * serveur, sur la machine de chaque client, pour faire tourner un agent
 * qui ping et interroge en SNMP.
 *
 * Ce qui part ici est la FERMETURE DES DÉPENDANCES de `agent.js` : ce
 * fichier, et de proche en proche tout ce qu'il require. Une quinzaine de
 * fichiers au lieu de plusieurs centaines.
 *
 * Elle est CALCULÉE, pas écrite à la main. Une liste manuelle vieillit en
 * silence : quelqu'un ajoute un `require` dans un service de l'agent, les
 * tests passent — le dépôt a tous les fichiers — et l'installation casse
 * chez le prochain client avec un MODULE_NOT_FOUND que personne ne relie
 * au commit. Le calcul, lui, suit le code.
 */

const express = require("express");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const db = require("../db");

const router = express.Router();

/** Racine du backend : ce fichier est dans src/routes/. */
const RACINE = path.resolve(__dirname, "..", "..");

/* ═══════════════════════════════════════════════════════════════════════
   LA FERMETURE DES DÉPENDANCES
   ═══════════════════════════════════════════════════════════════════════ */

/** Fichiers joints à l'agent sans être atteints par un `require`. */
const SUPPLEMENTS = ["package.json", "data/oui-ieee.json.gz"];

/**
 * Suit les `require("./…")` depuis agent.js, de proche en proche.
 *
 * Seuls les chemins RELATIFS sont suivis : `require("axios")` désigne une
 * dépendance npm, que `npm install` posera chez le client à partir du
 * package.json. Les copier serait copier node_modules — des dizaines de
 * mégaoctets, et des binaires compilés pour la mauvaise plateforme.
 */
function calculerFermeture() {
  const vus = new Set();
  const aVoir = ["src/agent/agent.js"];

  while (aVoir.length > 0) {
    const relatif = aVoir.shift();
    if (vus.has(relatif)) continue;

    const absolu = path.join(RACINE, relatif);
    let contenu;
    try {
      contenu = fs.readFileSync(absolu, "utf8");
    } catch {
      // Un require vers un fichier absent est un bug du dépôt, pas de
      // l'installation : on l'ignore ici et node le dira au démarrage.
      continue;
    }
    vus.add(relatif);

    for (const trouve of contenu.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      let cible = path.resolve(path.dirname(absolu), trouve[1]);
      if (fs.existsSync(cible) && fs.statSync(cible).isDirectory()) {
        cible = path.join(cible, "index.js");
      } else if (!fs.existsSync(cible)) {
        cible += ".js";
      }
      // Normalisé en séparateurs `/` : ces chemins voyagent dans du JSON
      // et servent d'identifiants — ils ne doivent pas changer de forme
      // selon que le serveur tourne sous Windows ou sous Linux.
      aVoir.push(path.relative(RACINE, cible).split(path.sep).join("/"));
    }
  }

  for (const supplement of SUPPLEMENTS) {
    if (fs.existsSync(path.join(RACINE, supplement))) vus.add(supplement);
  }

  return [...vus].sort();
}

/* Calculée une fois. Le code ne change pas en cours d'exécution, et
   relire quinze fichiers à chaque installation ne servirait à rien. */
let fermeture = null;

function listeFichiers() {
  if (!fermeture) fermeture = calculerFermeture();
  return fermeture;
}

/**
 * Garde-fou : une fermeture réduite à rien signifie que le calcul a
 * échoué, pas que l'agent n'a besoin de rien.
 *
 * Sans ce contrôle, l'échec serait SILENCIEUX et lointain : le serveur
 * répond 200 avec une liste vide, l'installateur ne copie rien, et le
 * client découvre l'agent mort sur SA machine. Mieux vaut un 500 ici,
 * lisible dans les journaux du serveur.
 */
function fermetureSuspecte(liste) {
  return !liste.includes("src/agent/agent.js") || liste.length < 5;
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTHENTIFICATION PAR JETON D'AGENT
   Même mécanique que les remontées : Bearer <jeton>, comparé au site.
   ═══════════════════════════════════════════════════════════════════════ */

async function siteAuthentifie(req) {
  const entete = req.headers.authorization || "";
  if (!entete.startsWith("Bearer ")) return null;

  const idSite = Number(req.query.site);
  if (!Number.isInteger(idSite) || idSite <= 0) return null;

  const [lignes] = await db.query(
    "SELECT id_site, agent_token FROM SITE WHERE id_site = ?",
    [idSite]
  );
  const site = lignes[0];
  if (!site || site.agent_token !== entete.slice(7)) return null;
  return site;
}

/* ═══════════════════════════════════════════════════════════════════════
   LES SCRIPTS D'INSTALLATION — PUBLICS
   ═══════════════════════════════════════════════════════════════════════ */

/* Deux routes déclarées séparément, et non un paramètre contraint par une
   expression régulière : Express 5 a retiré la syntaxe `:script(a|b)` et
   lève au chargement du module. Deux lignes explicites ne se cassent pas
   à la prochaine montée de version. */
function servirScript(nomFichier) {
  return async (req, res) => {
    const relatif = `src/agent/${nomFichier}`;
    try {
      const contenu = await fsp.readFile(path.join(RACINE, relatif), "utf8");
      // text/plain, jamais un type qui invite le navigateur à exécuter :
      // cette adresse est publique et peut être ouverte à la main.
      res.type("text/plain; charset=utf-8").send(contenu);
    } catch (err) {
      console.error(`Script ${nomFichier} illisible :`, err.message);
      res.status(500).json({
        error: "Le script d'installation est introuvable sur le serveur",
        aide: `Il doit se trouver dans backend/${relatif}.`,
      });
    }
  };
}

router.get("/agent/installer.ps1", servirScript("installer.ps1"));
router.get("/agent/installer.sh", servirScript("installer.sh"));

/* ═══════════════════════════════════════════════════════════════════════
   LES FICHIERS DE L'AGENT — JETON EXIGÉ
   ═══════════════════════════════════════════════════════════════════════ */

/** La liste, telle que l'installateur la parcourt. */
router.get("/agent/fichiers.json", async (req, res) => {
  if (!(await siteAuthentifie(req))) {
    return res.status(401).json({ error: "Jeton d'agent invalide" });
  }

  const liste = listeFichiers();
  if (fermetureSuspecte(liste)) {
    console.error("Fermeture des dépendances de l'agent vide ou incomplète :", liste);
    return res.status(500).json({
      error: "La liste des fichiers de l'agent n'a pas pu être calculée",
    });
  }

  res.json({
    fichiers: liste.map((chemin) => ({
      chemin,
      octets: fs.statSync(path.join(RACINE, chemin)).size,
    })),
  });
});

/**
 * Un fichier, et un seul.
 *
 * `chemin` n'est JAMAIS utilisé pour construire un accès disque : il sert
 * à chercher dans la liste calculée, et c'est l'entrée TROUVÉE qui ouvre
 * le fichier. Un `../../.env` n'est donc pas « nettoyé » puis lu — il ne
 * figure dans aucune liste, la recherche ne rend rien, la réponse est 404.
 *
 * C'est la différence entre filtrer ce qu'on refuse, qu'on finit toujours
 * par sous-estimer, et n'autoriser que ce qu'on a énuméré soi-même.
 */
router.get("/agent/fichier", async (req, res) => {
  if (!(await siteAuthentifie(req))) {
    return res.status(401).json({ error: "Jeton d'agent invalide" });
  }

  const autorise = listeFichiers().find((chemin) => chemin === req.query.chemin);
  if (!autorise) return res.status(404).json({ error: "Fichier inconnu" });

  res.sendFile(path.join(RACINE, autorise), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Fichier illisible sur le serveur" });
    }
  });
});

module.exports = router;
module.exports.calculerFermeture = calculerFermeture;
module.exports.fermetureSuspecte = fermetureSuspecte;
