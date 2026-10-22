/**
 * services/editionService.js
 * Quelle édition de NetSecureManager tourne ici, et ce qu'elle débloque.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DEUX ÉDITIONS
 *
 *   OUVERTE      — gratuite, sans clé. Un site, découverte, inventaire,
 *                  plan d'adressage, supervision, alertes, bande passante
 *                  SNMP, latence, rapports à la demande.
 *
 *   ENTREPRISE   — payante, activée par une clé de licence. Multi-sites et
 *                  agents distants, agent de poste, NetFlow, contrôle
 *                  d'accès web, failles et certificats, rapports
 *                  planifiés, rôles et cloisonnement.
 *
 * L'édition ouverte doit résoudre COMPLÈTEMENT le problème d'une petite
 * entreprise d'un seul site. Une version mutilée ne s'installe pas, donc
 * ne crée ni référence ni bouche-à-oreille — et une plateforme de
 * supervision se vend d'abord sur la confiance de ceux qui l'utilisent.
 *
 * La limite qui fait basculer vers le payant est une dimension qui
 * GRANDIT AVEC LE CLIENT : un deuxième site, des postes Windows à
 * inventorier, des obligations de traçabilité. L'entreprise qui ouvre une
 * agence paie de bon cœur ; celle qui passe de vingt à vingt-cinq postes
 * se sentirait rançonnée. C'est pourquoi il n'y a AUCUNE limite au nombre
 * de machines supervisées.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * POURQUOI UNE SIGNATURE ASYMÉTRIQUE, ET PAS UN SIMPLE CODE
 *
 * Une clé vérifiée par un secret partagé — HMAC, ou pire une comparaison
 * de chaîne — se contrefait dès que quelqu'un lit le code. Or le code part
 * chez le client : c'est le principe même d'une plateforme qu'on installe
 * chez lui.
 *
 * La vérification se fait donc avec une clé PUBLIQUE, inscrite ci-dessous.
 * La clé privée qui signe les licences ne quitte jamais ton poste et n'est
 * dans aucun dépôt. Lire ce fichier permet de vérifier une licence ; ça
 * n'a jamais permis d'en fabriquer une.
 *
 * ── CE QUE CE DISPOSITIF NE PRÉTEND PAS FAIRE ──
 *
 * Il n'empêche pas quelqu'un de modifier le code source pour se dispenser
 * de la vérification. Rien ne l'empêche, sur un logiciel installé chez le
 * client — ni ici, ni chez les éditeurs qui y consacrent des budgets
 * entiers. Ce que la signature empêche, c'est la fraude ORDINAIRE : le
 * code de licence qu'on se passe entre collègues, la date qu'on repousse,
 * le fichier de configuration qu'on édite. C'est-à-dire l'essentiel.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PRINCIPE DE REPLI : EN CAS DE DOUTE, ÉDITION OUVERTE
 *
 * Clé absente, illisible, mal signée, expirée : la plateforme retombe sur
 * l'édition ouverte et CONTINUE DE FONCTIONNER. Elle ne s'arrête jamais,
 * et n'efface rien.
 *
 * Une licence expirée qui couperait la supervision d'une PME un lundi
 * matin ferait bien plus de tort que les quelques euros qu'elle protège.
 * Les fonctions Entreprise se referment ; ce qui a déjà été mesuré reste
 * lisible. Le client est prévenu, pas puni.
 */

const crypto = require("node:crypto");

/* ═══════════════════════════════════════════════════════════════════════
   CLÉ PUBLIQUE DE VÉRIFICATION

   Remplacée par la tienne au premier `node tools/generer-licence.js --creer-cles`.
   Tant qu'elle vaut la valeur ci-dessous, AUCUNE licence n'est acceptée et
   la plateforme tourne en édition ouverte : c'est l'état par défaut d'un
   dépôt public, et c'est le bon.
   ═══════════════════════════════════════════════════════════════════════ */
const CLE_PUBLIQUE = process.env.LICENCE_CLE_PUBLIQUE || "";

/* ═══════════════════════════════════════════════════════════════════════
   CE QUE CHAQUE ÉDITION DÉBLOQUE

   ⚠ C'EST LA SEULE LISTE. Déplacer une fonction d'une édition à l'autre,
   c'est déplacer une ligne d'ici — pas toucher au reste du code.

   Une fonction absente de cette table est OUVERTE. Le défaut penche donc
   du côté gratuit : oublier d'inscrire une nouveauté la rend disponible à
   tous, ce qui déçoit personne. L'inverse — une fonction verrouillée par
   omission — casserait l'installation d'un client sans que personne
   comprenne pourquoi.
   ═══════════════════════════════════════════════════════════════════════ */
const ENTREPRISE = "entreprise";

const FONCTIONS = {
  /* Plusieurs sites. C'est la limite principale : elle suit la croissance
     du client — l'entreprise qui ouvre une agence paie de bon cœur.

     ── `agent_distant` A ÉTÉ RETIRÉ DE CETTE LISTE, LE 30/09 ──

     Sur une plateforme HÉBERGÉE, l'agent n'est pas un supplément : c'est
     la seule façon dont le produit fonctionne. Un ping ne traverse pas
     Internet, donc le serveur central ne voit aucun réseau client sans
     agent à l'intérieur.

     Le verrouiller revenait à vendre une plateforme qui ne supervise
     rien, et à faire payer pour la fonction « marcher ». */
  multi_sites: ENTREPRISE,

  /* Voir l'intérieur des postes Windows : logiciels, processus, santé. */
  agent_poste: ENTREPRISE,

  /* Vers quoi part le débit, et le blocage qui en découle. */
  netflow: ENTREPRISE,
  acces_web: ENTREPRISE,
  observation_dns: ENTREPRISE,

  /* Ce qui relève de la conformité et de la preuve. */
  failles: ENTREPRISE,
  certificats: ENTREPRISE,
  rapports_planifies: ENTREPRISE,
  roles_avances: ENTREPRISE,
};

/** Nombre de sites autorisés en édition ouverte. */
const SITES_EDITION_OUVERTE = 1;

/* ═══════════════════════════════════════════════════════════════════════
   LECTURE DE LA LICENCE
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Format : <charge utile en base64url>.<signature en base64url>
 *
 * La charge utile est un JSON lisible — client, édition, date d'expiration,
 * nombre de sites. Elle n'est pas chiffrée, et il n'y a aucune raison
 * qu'elle le soit : le client a le droit de lire ce qu'il a acheté. C'est
 * la SIGNATURE qui empêche de le modifier, pas le secret.
 */
function decoder(cle) {
  const morceaux = String(cle).trim().split(".");
  if (morceaux.length !== 2) return null;

  const [charge, signature] = morceaux;
  let donnees;
  try {
    donnees = JSON.parse(Buffer.from(charge, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  return { charge, signature, donnees };
}

function signatureValide(charge, signature) {
  if (!CLE_PUBLIQUE) return false;
  try {
    return crypto.verify(
      null, // Ed25519 : l'algorithme de hachage fait partie du schéma
      Buffer.from(charge, "utf8"),
      CLE_PUBLIQUE,
      Buffer.from(signature, "base64url")
    );
  } catch {
    // Clé publique mal formée, signature tronquée : pas de licence.
    return false;
  }
}

/**
 * État de la licence, calculé une fois au chargement.
 *
 * Volontairement pas relu à chaque appel : une licence ne change pas en
 * cours d'exécution, et `fonctionActive()` est appelée sur des chemins
 * fréquents. Un changement de clé demande un redémarrage — ce qui est
 * aussi une bonne chose : l'exploitant voit alors le message de démarrage
 * qui confirme ce qui a été accepté.
 */
function lireLicence() {
  const brut = (process.env.LICENCE || "").trim();
  if (!brut) {
    return { edition: "ouverte", raison: "aucune clé de licence", licence: null };
  }

  const decodee = decoder(brut);
  if (!decodee) {
    return { edition: "ouverte", raison: "clé de licence illisible", licence: null };
  }

  if (!signatureValide(decodee.charge, decodee.signature)) {
    return { edition: "ouverte", raison: "signature invalide", licence: null };
  }

  const d = decodee.donnees || {};

  if (d.expire) {
    const expire = new Date(d.expire);
    if (!Number.isNaN(expire.getTime()) && expire.getTime() < Date.now()) {
      return {
        edition: "ouverte",
        raison: `licence expirée le ${expire.toLocaleDateString("fr-FR")}`,
        licence: d,
      };
    }
  }

  if (d.edition !== ENTREPRISE) {
    return { edition: "ouverte", raison: "édition inconnue dans la licence", licence: d };
  }

  return { edition: ENTREPRISE, raison: null, licence: d };
}

let etatCourant = null;

function etat() {
  if (!etatCourant) etatCourant = lireLicence();
  return etatCourant;
}

/** Relit la licence — pour les tests, et un éventuel rechargement à chaud. */
function relire() {
  etatCourant = null;
  return etat();
}

/* ═══════════════════════════════════════════════════════════════════════
   CE QUE LE RESTE DU CODE UTILISE
   ═══════════════════════════════════════════════════════════════════════ */

/** `true` si cette installation a le droit d'utiliser cette fonction. */
function fonctionActive(code) {
  const requise = FONCTIONS[code];
  if (!requise) return true; // absente de la table = ouverte. Voir plus haut.
  return etat().edition === requise;
}

/** Nombre de sites autorisés. `Infinity` en édition Entreprise. */
function sitesAutorises() {
  const e = etat();
  if (e.edition !== ENTREPRISE) return SITES_EDITION_OUVERTE;
  const n = Number(e.licence?.sites);
  return Number.isInteger(n) && n > 0 ? n : Infinity;
}

/**
 * Ce que l'interface affiche : l'édition, et la liste des fonctions
 * verrouillées AVEC leur nom.
 *
 * On rend la liste entière plutôt qu'un simple drapeau, parce que le
 * principe de la plateforme est de ne jamais montrer un contrôle qui ne
 * fait rien. Les écrans peuvent ainsi afficher une fonction Entreprise
 * comme verrouillée, en disant ce qu'elle ferait, plutôt que de la cacher.
 * Un client qui voit chaque jour ce qu'il n'a pas est la meilleure
 * vitrine qui soit — et c'est plus honnête que de faire disparaître des
 * pans du produit sans explication.
 */
function resume() {
  const e = etat();
  return {
    edition: e.edition,
    raison: e.raison,
    client: e.licence?.client || null,
    expire: e.licence?.expire || null,
    sites_autorises: sitesAutorises() === Infinity ? null : sitesAutorises(),
    fonctions: Object.fromEntries(
      Object.keys(FONCTIONS).map((code) => [code, fonctionActive(code)])
    ),
  };
}

/**
 * Message de démarrage. Écrit une fois, et il dit la VÉRITÉ : quand une
 * clé est présente mais refusée, l'exploitant doit l'apprendre au
 * démarrage, pas le jour où il cherche pourquoi une fonction a disparu.
 */
function annoncer() {
  const e = etat();
  if (e.edition === ENTREPRISE) {
    const fin = e.licence?.expire
      ? `, jusqu'au ${new Date(e.licence.expire).toLocaleDateString("fr-FR")}`
      : "";
    console.log(
      `\nÉdition Entreprise — licence au nom de ${e.licence?.client || "?"}${fin}.\n`
    );
    return;
  }

  if ((process.env.LICENCE || "").trim()) {
    console.warn(
      `\n⚠  Licence refusée : ${e.raison}.\n` +
        "   La plateforme tourne en ÉDITION OUVERTE. Rien n'est perdu :\n" +
        "   les fonctions Entreprise sont simplement indisponibles.\n"
    );
    return;
  }

  console.log(
    "\nÉdition ouverte — un site, supervision complète.\n" +
      "  Multi-sites, agents, NetFlow, contrôle d'accès web, failles et\n" +
      "  rapports planifiés relèvent de l'édition Entreprise.\n"
  );
}

module.exports = {
  fonctionActive,
  sitesAutorises,
  resume,
  etat,
  relire,
  annoncer,
  FONCTIONS,
  ENTREPRISE,
  SITES_EDITION_OUVERTE,
};
