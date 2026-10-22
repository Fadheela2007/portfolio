import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ══════════════════════════════════════════════════════════════════════
   LES PREMIERS PAS

   Ce que voyait un nouvel inscrit : un tableau de bord vide, et un menu
   de huit écrans tous vides. Rien ne lui disait quoi faire. Une
   plateforme qu'on découvre et qui ne dit pas la première chose à faire,
   on la quitte en deux minutes — c'est là qu'on perd quelqu'un, pas sur
   le prix.

   ── POURQUOI IL FAUT INSTALLER QUELQUE CHOSE ──

   C'est la question que tout le monde se pose, et y répondre AVANT
   qu'elle soit posée évite de perdre la moitié des inscrits.

   Un ping, une requête SNMP, un balayage de ports ne traversent pas
   l'Internet : ils ne fonctionnent que depuis l'intérieur du réseau. Un
   serveur hébergé ailleurs ne peut donc pas voir les machines d'une
   entreprise — son pare-feu l'en empêche, et c'est heureux. Il faut un
   agent à l'intérieur, qui regarde et qui raconte.

   Cette explication est à l'écran, en une phrase. Sans elle, « installez
   ce programme » ressemble à une exigence arbitraire.

   ── L'ÉCRAN SE RETIRE DE LUI-MÊME ──

   Dès qu'une machine est remontée, il disparaît. Un guide de démarrage
   qui reste après le démarrage devient un encombrement, puis un reproche.
   ══════════════════════════════════════════════════════════════════════ */

/** Toutes les 10 s tant qu'on attend l'agent. C'est court, et ça ne dure
    que le temps de l'installation — l'écran disparaît ensuite. */
const CADENCE_MS = 10000;

function Bloc({ commande }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(commande);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers refusé (page non sécurisée, permission) : la
      // commande reste sélectionnable à la main, et on ne prétend pas
      // avoir copié.
      setCopie(false);
    }
  }

  return (
    <div className="relative">
      <pre className="bg-[var(--color-abyss)] border border-[var(--color-line)] rounded-lg p-3 pr-20 text-[11px] text-[var(--color-ink)] overflow-x-auto whitespace-pre-wrap break-all">
        {commande}
      </pre>
      <button
        onClick={copier}
        className="absolute top-2 right-2 text-[11px] px-2.5 py-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-mute)] hover:text-[var(--color-ink)] transition cible-tactile"
      >
        {copie ? "Copié" : "Copier"}
      </button>
    </div>
  );
}

export default function PremiersPas({ idSite, onTermine }) {
  const [infos, setInfos] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [systeme, setSysteme] = useState("windows");

  const charger = useCallback(async () => {
    if (!idSite) return;
    try {
      const { data } = await axios.get(`${API_URL}/sites/${idSite}/agent`);
      setInfos(data);
      setErreur(null);
      /* Dès qu'une machine est remontée, la mise en route est finie : on
         prévient le parent, qui rendra le tableau de bord normal. */
      if (data?.equipements_remontes > 0 && onTermine) onTermine();
    } catch (err) {
      setErreur(
        err.response?.data?.error ||
          "Impossible de lire les informations de mise en service."
      );
    }
  }, [idSite, onTermine]);

  useEffect(() => {
    charger();
  }, [charger]);

  /* La scrutation s'arrête dès que l'agent est actif : continuer à
     interroger un serveur pour une réponse qu'on a déjà est du gaspillage
     pur, et sur une plateforme hébergée c'est multiplié par le nombre
     d'inscrits. */
  const agentActif = infos?.agent?.etat === "actif";

  useEffect(() => {
    if (agentActif) return undefined;
    const minuterie = setInterval(charger, CADENCE_MS);
    return () => clearInterval(minuterie);
  }, [agentActif, charger]);

  if (erreur) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl p-5">
        <p className="text-sm" style={{ color: "var(--color-crit)" }}>{erreur}</p>
      </div>
    );
  }

  if (!infos) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl p-5">
        <p className="text-sm text-[var(--color-mute)]">Préparation de votre espace…</p>
      </div>
    );
  }

  const commande = infos.commandes?.[systeme] || "";

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl p-6 space-y-5">
      <div>
        <h1 className="font-[var(--font-display)] text-xl font-semibold">
          Votre espace est prêt
        </h1>
        <p className="text-sm text-[var(--color-mute)] mt-1 max-w-2xl">
          Il ne reste qu'une chose à faire pour voir votre réseau apparaître.
        </p>
      </div>

      {/* ── POURQUOI ── */}
      <p className="text-xs text-[var(--color-mute)] max-w-2xl leading-relaxed">
        Un ping ou une requête SNMP ne traversent pas Internet : ils ne
        fonctionnent que depuis l'intérieur de votre réseau. Notre serveur ne
        peut donc pas voir vos machines — votre pare-feu l'en empêche, et c'est
        une bonne chose. Un petit programme installé chez vous les observe et
        nous transmet le résultat.
      </p>

      {/* ══ ÉTAPE 1 ══ */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold"
            style={{
              background: agentActif ? "var(--color-ok)" : "var(--color-signal)",
              color: "var(--color-sur-accent)",
            }}
          >
            {agentActif ? "✓" : "1"}
          </span>
          <h2 className="text-sm font-medium text-[var(--color-ink)]">
            Lancez cette commande sur une machine de votre bureau
          </h2>
        </div>

        <p className="text-xs text-[var(--color-mute)] mb-2.5">
          N'importe quelle machine allumée et branchée au réseau : un poste, un
          serveur, un vieil ordinateur. Elle doit simplement rester allumée.
        </p>

        <div className="flex gap-1.5 mb-2">
          {[
            ["windows", "Windows"],
            ["linux", "Linux"],
          ].map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => setSysteme(cle)}
              className="text-[11px] px-2.5 py-1 rounded-full border transition cible-tactile"
              style={{
                borderColor:
                  systeme === cle ? "var(--color-signal)" : "var(--color-line)",
                color: systeme === cle ? "var(--color-signal)" : "var(--color-mute)",
              }}
            >
              {libelle}
            </button>
          ))}
        </div>

        <Bloc commande={commande} />

        {/* OÙ COLLER, ET AVEC QUELS DROITS.

            La commande seule ne suffisait pas : collée dans une fenêtre
            ordinaire, elle échoue sur « ouvrez PowerShell en tant
            qu'administrateur » — message que l'installateur affiche, mais
            après le téléchargement, donc après une attente pour rien. Le
            dire avant coûte une ligne. */}
        <p className="text-[11px] text-[var(--color-mute)] mt-2">
          {systeme === "windows"
            ? "Dans PowerShell ouvert en tant qu'administrateur (clic droit sur le menu Démarrer → « Terminal (administrateur) »). Rien d'autre à installer : la commande récupère elle-même ce dont elle a besoin."
            : "Dans un terminal, sur une machine où vous avez sudo. Rien d'autre à installer : la commande récupère elle-même ce dont elle a besoin."}
        </p>

        {/* L'ADRESSE PEUT AVOIR ÉTÉ CORRIGÉE — et le serveur le dit. Une
            substitution silencieuse serait une deuxième surprise au lieu
            d'une première évitée. */}
        {infos.url_corrigee && infos.avertissement_url && (
          <p className="text-[11px] text-[var(--color-warn)] mt-2">
            {infos.avertissement_url}
          </p>
        )}

        {/* LE JETON EST DANS CETTE COMMANDE. Il donne le droit d'envoyer
            des relevés au nom de ce site : le dire évite qu'elle soit
            collée dans un groupe de discussion. */}
        <p className="text-[11px] text-[var(--color-mute)] mt-2">
          Cette commande contient votre clé d'accès : ne la publiez pas, ne la
          partagez qu'avec la personne qui fera l'installation.
        </p>
      </section>

      {/* ── ÉTAT DE L'ATTENTE ── */}
      <div
        className="rounded-lg border px-3 py-2.5"
        style={{
          borderColor: agentActif ? "var(--color-ok)" : "var(--color-line)",
          background: "var(--color-surface-2)",
        }}
      >
        {agentActif ? (
          <p className="text-sm" style={{ color: "var(--color-ok)" }}>
            Connecté — votre réseau nous parle.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-mute)]">
            En attente du premier envoi… Cette page se mettra à jour toute seule,
            dans la minute qui suit le lancement de la commande.
          </p>
        )}
      </div>

      {/* ══ ÉTAPE 2 ══
          Annoncée dès le départ mais présentée comme inactive tant que
          l'agent n'a pas parlé : savoir ce qui vient après rassure, et
          proposer un bouton qui ne peut pas fonctionner déçoit. */}
      <section style={{ opacity: agentActif ? 1 : 0.5 }}>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold border border-[var(--color-line)] text-[var(--color-mute)]"
          >
            2
          </span>
          <h2 className="text-sm font-medium text-[var(--color-ink)]">
            Lancez votre premier scan
          </h2>
        </div>
        <p className="text-xs text-[var(--color-mute)] max-w-2xl">
          {agentActif
            ? "L'agent a commencé à explorer votre réseau. Vos machines vont apparaître dans les minutes qui viennent — vous pouvez aussi déclencher un scan immédiat depuis l'écran Équipements."
            : "Disponible dès que l'agent aura envoyé son premier relevé."}
        </p>
      </section>

      {/* CE QUI EST MESURÉ, ET CE QUI NE L'EST PAS — dit dès le premier
          écran, parce que c'est ce qui distingue cette plateforme et que
          la découvrir plus tard ressemblerait à une omission. */}
      <p className="text-[11px] text-[var(--color-mute)] border-t border-[var(--color-line)] pt-3">
        Rien n'est deviné : chaque machine inscrite à votre inventaire le sera
        avec la preuve datée de ce qui l'a fait apparaître — une réponse au ping,
        un port ouvert, une entrée dans la table ARP.
      </p>
    </div>
  );
}
