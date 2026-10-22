#!/usr/bin/env node
/**
 * tools/generer-licence.js
 * Fabrique les clés de licence Entreprise. À exécuter SUR TON POSTE.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LA RÈGLE QUI TIENT TOUT LE DISPOSITIF
 *
 * La clé PRIVÉE ne quitte jamais ton ordinateur. Elle n'est ni dans le
 * dépôt, ni chez le client, ni dans une sauvegarde partagée. Celui qui
 * l'obtient peut émettre autant de licences qu'il veut, et tu n'aurais
 * aucun moyen de les distinguer des tiennes.
 *
 * La clé PUBLIQUE, elle, est faite pour être distribuée : elle part chez
 * chaque client, dans son fichier .env. Elle permet de VÉRIFIER une
 * signature, jamais d'en produire une.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * UTILISATION
 *
 *   1) Une seule fois, au tout début :
 *
 *        node tools/generer-licence.js --creer-cles
 *
 *      Écrit `licence-privee.pem` dans le dossier courant et affiche la
 *      clé publique. SAUVEGARDE le fichier privé ailleurs que sur ce seul
 *      disque : le perdre signifie ne plus jamais pouvoir émettre de
 *      licence pour les clients existants.
 *
 *   2) Pour chaque client :
 *
 *        node tools/generer-licence.js --client "Cabinet Ngando" --mois 12
 *        node tools/generer-licence.js --client "Groupe X" --mois 12 --sites 5
 *
 *      Sans --sites, le nombre de sites est illimité.
 *      Avec --mois 0, la licence n'expire pas.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CE QUE LE CLIENT REÇOIT
 *
 * Deux lignes à coller dans son `backend/.env`, puis un redémarrage. Au
 * démarrage, la console confirme le nom sur la licence et sa date de fin :
 * s'il ne voit pas ce message, la clé n'a pas été acceptée et il le sait
 * tout de suite.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const FICHIER_PRIVE = path.resolve(process.cwd(), "licence-privee.pem");

function creerCles() {
  if (fs.existsSync(FICHIER_PRIVE)) {
    console.error(
      `\n⚠  ${FICHIER_PRIVE} existe déjà.\n` +
        "   Le remplacer INVALIDERAIT toutes les licences déjà émises :\n" +
        "   elles ne seraient plus reconnues chez tes clients.\n" +
        "   Déplace l'ancien fichier à la main si c'est vraiment ce que tu veux.\n"
    );
    process.exit(1);
  }

  // Ed25519 : signatures courtes, vérification rapide, aucun paramètre à
  // choisir — donc aucun paramètre à choisir de travers.
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");

  const prive = privateKey.export({ type: "pkcs8", format: "pem" });
  const publique = publicKey.export({ type: "spki", format: "pem" });

  // 0600 : lisible par toi seule. Sur Windows le mode est ignoré, d'où le
  // rappel écrit juste en dessous.
  fs.writeFileSync(FICHIER_PRIVE, prive, { mode: 0o600 });

  console.log(`\nClé privée écrite dans ${FICHIER_PRIVE}`);
  console.log("⚠  Ne la commite JAMAIS. Sauvegarde-la ailleurs que sur ce disque.\n");
  console.log("Clé publique — à mettre dans le .env de CHAQUE client :\n");
  console.log(`LICENCE_CLE_PUBLIQUE="${publique.trim().replace(/\n/g, "\\n")}"\n`);
}

function emettre({ client, mois, sites }) {
  if (!fs.existsSync(FICHIER_PRIVE)) {
    console.error(
      `\n⚠  Aucune clé privée. Lance d'abord :\n\n    node tools/generer-licence.js --creer-cles\n`
    );
    process.exit(1);
  }

  const charge = { client, edition: "entreprise", emise: new Date().toISOString() };

  if (mois > 0) {
    const fin = new Date();
    fin.setMonth(fin.getMonth() + mois);
    charge.expire = fin.toISOString();
  }
  if (sites > 0) charge.sites = sites;

  const chargeEncodee = Buffer.from(JSON.stringify(charge), "utf8").toString("base64url");

  const signature = crypto
    .sign(null, Buffer.from(chargeEncodee, "utf8"), fs.readFileSync(FICHIER_PRIVE))
    .toString("base64url");

  const licence = `${chargeEncodee}.${signature}`;

  console.log(`\nLicence pour : ${client}`);
  console.log(`Édition      : Entreprise`);
  console.log(`Expire       : ${charge.expire ? new Date(charge.expire).toLocaleDateString("fr-FR") : "jamais"}`);
  console.log(`Sites        : ${charge.sites || "illimité"}`);
  console.log("\nÀ coller dans le backend/.env du client :\n");
  console.log(`LICENCE="${licence}"\n`);
  console.log("(La ligne LICENCE_CLE_PUBLIQUE doit aussi y être — la même pour tous.)\n");
}

function lireArguments(argv) {
  const a = { mois: 12, sites: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--client") a.client = argv[++i];
    else if (argv[i] === "--mois") a.mois = Number(argv[++i]);
    else if (argv[i] === "--sites") a.sites = Number(argv[++i]);
    else if (argv[i] === "--creer-cles") a.creerCles = true;
  }
  return a;
}

const args = lireArguments(process.argv.slice(2));

if (args.creerCles) {
  creerCles();
} else if (args.client) {
  if (!Number.isFinite(args.mois) || args.mois < 0) {
    console.error("--mois attend un nombre positif, ou 0 pour une licence sans fin.");
    process.exit(1);
  }
  emettre(args);
} else {
  console.log(
    "\nFabrique les licences Entreprise de NetSecureManager.\n\n" +
      "  node tools/generer-licence.js --creer-cles\n" +
      "      Crée la paire de clés. Une seule fois, au début.\n\n" +
      '  node tools/generer-licence.js --client "Nom du client" [--mois 12] [--sites 5]\n' +
      "      Émet une licence. --mois 0 = sans expiration, --sites absent = illimité.\n"
  );
}
