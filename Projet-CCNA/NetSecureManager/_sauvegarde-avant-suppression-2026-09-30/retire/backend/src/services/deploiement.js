/**
 * services/deploiement.js
 * Où tourne ce serveur, et ce que ça change.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LA MÊME PLATEFORME, DEUX SITUATIONS QUI N'ONT RIEN À VOIR
 *
 * INSTALLÉE CHEZ LE CLIENT — le serveur est dans le réseau qu'il
 * supervise. Il pingue, il interroge en SNMP, il balaie les ports : tout
 * lui est accessible. Un site créé depuis l'écran Sites est, par défaut,
 * supervisé par ce serveur-là. C'est juste, et c'est le comportement
 * historique.
 *
 * HÉBERGÉE — le serveur est ailleurs, sur Internet. AUCUN réseau de
 * client ne lui est accessible, et c'est heureux : un pare-feu qui
 * laisserait entrer des pings depuis l'extérieur serait le vrai
 * problème. La supervision passe forcément par un agent installé à
 * l'intérieur.
 *
 * ── CE QUE LE DÉFAUT « SUPERVISION CENTRALE » COÛTE EN HÉBERGÉ ──
 *
 * Ce n'est pas du temps de calcul perdu. C'est pire.
 *
 * Le client ajoute sa deuxième agence depuis l'écran Sites. Le site est
 * créé en supervision centrale. Son agent s'installe, remonte quarante
 * machines — et le serveur central, lui, se met à pinguer ces quarante
 * adresses privées qu'il ne peut pas joindre. Elles passent `down`. Le
 * client reçoit une alerte d'indisponibilité sur une agence qui va très
 * bien.
 *
 * Une fausse alerte sur un parc entier apprend à ignorer les alertes.
 * C'est exactement ce qu'un outil de supervision ne doit jamais faire.
 *
 * ── POURQUOI UN RÉGLAGE, ET NON UNE DÉTECTION ──
 *
 * On pourrait essayer de deviner : adresse publique, nom de domaine,
 * variable d'environnement d'un hébergeur. Chacun de ces indices se
 * trompe dans un cas réel — un serveur sur IP publique à l'intérieur
 * d'une entreprise, un hébergement chez soi, un tunnel. Se tromper ici
 * coupe la supervision d'un parc, ou la rend fausse.
 *
 * Une ligne dans le .env, écrite par celle qui installe le serveur et
 * qui sait où il tourne, ne se trompe jamais. Le défaut — absent — est
 * le comportement historique : une installation existante ne change pas.
 */

/** Valeurs qui veulent dire « oui » dans un fichier .env. */
const VRAI = new Set(["1", "true", "vrai", "oui", "yes", "on"]);

/**
 * `true` si ce serveur est hébergé hors des réseaux qu'il supervise.
 *
 * Lu à CHAQUE appel, et non mis en cache : les tests changent la
 * variable d'un cas à l'autre, et cette lecture n'arrive que sur des
 * chemins rares — la création d'un site, un avertissement de démarrage.
 * Un cache n'y ferait gagner rien et y ferait perdre la testabilité.
 */
function estHeberge() {
  return VRAI.has(String(process.env.MODE_HEBERGE || "").trim().toLowerCase());
}

/**
 * Comment un site nouvellement créé doit être supervisé.
 *
 * En hébergé : par son agent, toujours. Le serveur central ne peut pas
 * joindre le réseau du client, et prétendre le superviser reviendrait à
 * afficher un contrôle qui ne fait rien.
 */
function supervisionParAgentParDefaut() {
  return estHeberge();
}

/** Une ligne au démarrage, pour que le mode retenu ne soit pas une surprise. */
function annoncer() {
  if (!estHeberge()) return;
  console.log(
    "\nMode hébergé — le serveur ne supervise aucun réseau lui-même.\n" +
      "  Chaque site nouvellement créé attend son agent local.\n"
  );
}

module.exports = { estHeberge, supervisionParAgentParDefaut, annoncer };
