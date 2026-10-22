import { Fragment, useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ══════════════════════════════════════════════════════════════════════
   VERS QUOI PART LE DÉBIT — ET COMMENT LE COUPER

   Le reste de cette page répond à « qui consomme ». Cette section répond
   à la question suivante, et c'est la seule des deux sur laquelle on peut
   agir : savoir qu'un poste consomme 8 Mbit/s ne dit pas s'il sauvegarde
   ou s'il regarde des vidéos.

   ── ELLE DISPARAÎT QUAND ELLE N'A RIEN À DIRE ──

   Pas de collecteur NetFlow configuré, migration non appliquée, aucun
   flux enregistré : la section ne s'affiche pas du tout. Un tableau vide
   avec un message d'excuse occuperait un écran entier pour dire « rien »,
   et ferait croire à une panne là où il n'y a qu'une fonction non
   activée.

   ── CE QU'ELLE N'AFFIRME PAS ──

   Le nom vient du DNS inverse : c'est ce que le propriétaire de l'adresse
   publie, pas une preuve d'usage. L'en-tête le dit en une ligne, à
   l'écran, plutôt que dans une documentation que personne n'ouvre.
   ══════════════════════════════════════════════════════════════════════ */

/** Octets → l'échelle qui se lit. Une décimale suffit toujours. */
function formaterOctets(octets) {
  const n = Number(octets) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${(n / 1024 ** 3).toFixed(2)} Go`;
}

/**
 * Un domaine se bloque par DNS. Une adresse IP, non.
 *
 * Le bouton n'apparaît donc que sur les lignes qui portent un vrai nom.
 * L'afficher partout et répondre « les adresses IP ne se bloquent pas par
 * DNS » après le clic serait une porte peinte sur un mur.
 */
function estDomaine(texte) {
  const t = String(texte || "").trim();
  if (/^\d+\.\d+\.\d+\.\d+/.test(t)) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(t);
}

/* Barre de proportion : la même forme que celle du classement au-dessus,
   pour que les deux tableaux se lisent du même geste. */
function Part({ valeur, total }) {
  const part = total > 0 ? (valeur / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 rounded-full bg-[var(--color-surface-2)] flex-1 min-w-[48px] overflow-hidden"
        role="presentation"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(2, Math.min(100, part))}%`,
            background: "var(--color-signal)",
          }}
        />
      </div>
      <span className="text-xs text-[var(--color-mute)] tabular-nums w-11 text-right">
        {part < 1 ? "<1 %" : `${part.toFixed(0)} %`}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   LE PANNEAU DE BLOCAGE

   TROIS GARDE-FOUS, ET AUCUN N'EST FACULTATIF.

   1. ON MONTRE D'ABORD CE QUE ÇA COÛTE. Le panneau s'ouvre sur la liste
      des machines qui ont réellement utilisé ce domaine. « Bloquer
      dropbox.com » paraît anodin jusqu'à ce qu'on lise « 14 machines,
      dont COMPTA-02 ». Le chiffre arrive avant le bouton, pas après.

   2. UNE DURÉE PAR DÉFAUT, ET COURTE. Le permanent existe, mais il faut
      le choisir. C'est l'inverse de l'habitude — et c'est l'habitude
      inverse qui produit ces règles vieilles de six mois dont plus
      personne ne connaît la raison.

   3. UN MOTIF OBLIGATOIRE. Pas pour la forme : c'est ce que lira la
      personne qui, dans trois mois, se demandera pourquoi ce domaine est
      coupé. Sans lui, elle n'osera pas retirer la règle, et le blocage
      deviendra permanent par timidité.
   ══════════════════════════════════════════════════════════════════════ */

const DUREES = [
  { heures: 2, label: "2 heures" },
  { heures: 24, label: "1 jour" },
  { heures: 24 * 7, label: "1 semaine" },
  { heures: null, label: "Sans limite" },
];

function PanneauBlocage({ domaine, idPolitique, onFerme, onBloque }) {
  const [impact, setImpact] = useState(null);
  const [impactIndispo, setImpactIndispo] = useState(false);
  const [duree, setDuree] = useState(24);
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    axios
      .get(`${API_URL}/bande-passante/impact-blocage`, {
        params: { domaine, heures: 168 },
      })
      .then(({ data }) => !annule && setImpact(data))
      .catch(() => !annule && setImpactIndispo(true));
    return () => {
      annule = true;
    };
  }, [domaine]);

  async function confirmer() {
    if (!motif.trim()) {
      setErreur("Indiquez pourquoi ce domaine est bloqué.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await axios.post(`${API_URL}/acces-web/politique/${idPolitique}/domaine`, {
        domaine,
        action: "bloquer",
        commentaire: motif.trim(),
        duree_heures: duree,
        origine: "bande_passante",
      });
      onBloque(domaine);
    } catch (err) {
      setErreur(
        err.response?.data?.aide ||
          err.response?.data?.error ||
          "Le blocage n'a pas pu être enregistré."
      );
      setEnvoi(false);
    }
  }

  return (
    <tr>
      <td colSpan={6} className="px-4 py-4 bg-[var(--color-surface-2)]">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm text-[var(--color-ink)]">
            Bloquer <span className="font-medium">{domaine}</span> pour tout le site
          </p>

          {/* ── CE QUE ÇA COÛTE ── */}
          {impactIndispo ? (
            <p className="text-xs text-[var(--color-warn)]">
              Impossible de vérifier qui utilise ce domaine. Le blocage reste
              possible, mais à l'aveugle.
            </p>
          ) : !impact ? (
            <p className="text-xs text-[var(--color-mute)]">Vérification des usages…</p>
          ) : impact.nb_machines === 0 ? (
            <p className="text-xs text-[var(--color-mute)]">
              Aucune machine n'a utilisé ce domaine sur les{" "}
              {impact.conservation_jours} derniers jours. Attention : un service
              utilisé une fois par mois — paie, déclaration fiscale — n'apparaît
              pas ici.
            </p>
          ) : (
            <div className="text-xs text-[var(--color-ink)]">
              <p>
                <span className="font-medium">{impact.nb_machines}</span> machine
                {impact.nb_machines > 1 ? "s" : ""} l'
                {impact.nb_machines > 1 ? "ont" : "a"} utilisé (
                {formaterOctets(impact.octets_total)} sur {impact.conservation_jours}{" "}
                jours) :
              </p>
              <ul className="mt-1 space-y-0.5 text-[var(--color-mute)]">
                {impact.machines.slice(0, 6).map((m) => (
                  <li key={m.id_equipement}>
                    {m.nom || m.adresse_ip}{" "}
                    <span className="tabular-nums">— {formaterOctets(m.octets)}</span>
                    {m.jours_actifs > 1 && (
                      <span> sur {m.jours_actifs} jours</span>
                    )}
                  </li>
                ))}
                {impact.machines.length > 6 && (
                  <li>et {impact.nb_machines - 6} autre(s)…</li>
                )}
              </ul>
            </div>
          )}

          {/* ── DURÉE ── */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[var(--color-mute)] mr-1">Pendant</span>
            {DUREES.map((d) => {
              const choisi = duree === d.heures;
              return (
                <button
                  key={String(d.heures)}
                  onClick={() => setDuree(d.heures)}
                  className="text-[11px] px-2.5 py-1 rounded-full border transition cible-tactile"
                  style={{
                    borderColor: choisi ? "var(--color-signal)" : "var(--color-line)",
                    color: choisi ? "var(--color-signal)" : "var(--color-mute)",
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          {duree === null && (
            <p className="text-[11px] text-[var(--color-warn)]">
              Sans limite : cette règle restera en place jusqu'à ce que quelqu'un
              la retire à la main.
            </p>
          )}

          {/* ── MOTIF ── */}
          <input
            type="text"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            maxLength={200}
            placeholder="Pourquoi ? (lu par celui qui trouvera cette règle dans six mois)"
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)] placeholder:text-[var(--color-mute)]"
          />

          {erreur && (
            <p className="text-xs" style={{ color: "var(--color-crit)" }}>
              {erreur}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={confirmer}
              disabled={envoi}
              className="text-xs px-3 py-1.5 rounded-lg border transition cible-tactile disabled:opacity-60"
              style={{ borderColor: "var(--color-crit)", color: "var(--color-crit)" }}
            >
              {envoi ? "Enregistrement…" : "Bloquer"}
            </button>
            <button
              onClick={onFerme}
              disabled={envoi}
              className="text-xs px-3 py-1.5 text-[var(--color-mute)] hover:text-[var(--color-ink)] cible-tactile"
            >
              Annuler
            </button>
          </div>

          {/* CE QUE LE BLOCAGE FAIT VRAIMENT. Sans cette ligne, on croit
              que le clic coupe le trafic dans la seconde — alors qu'il
              inscrit une règle dans une politique qu'un résolveur DNS doit
              appliquer. Le découvrir après coup détruit la confiance. */}
          <p className="text-[11px] text-[var(--color-mute)]">
            La règle entre dans votre politique d'accès web. Elle prend effet
            quand le résolveur DNS recharge sa configuration, et ne couvre pas
            un poste qui utilise un DNS chiffré de son côté.
          </p>
        </div>
      </td>
    </tr>
  );
}

export default function DestinationsTrafic({ idSite, heures = 24 }) {
  const [donnees, setDonnees] = useState(null);
  /* `indisponible` et « pas encore chargé » sont deux états distincts :
     confondus, la section clignoterait à chaque changement de période. */
  const [indisponible, setIndisponible] = useState(false);
  const [tout, setTout] = useState(false);

  const [estAdmin, setEstAdmin] = useState(false);
  /* Identifiant de la politique d'accès web du site. Sans elle, il n'y a
     nulle part où poser une règle : le bouton n'apparaît pas du tout. */
  const [idPolitique, setIdPolitique] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [bloques, setBloques] = useState([]);

  useEffect(() => {
    try {
      const brut = localStorage.getItem("utilisateur");
      if (brut) setEstAdmin(JSON.parse(brut).role === "admin");
    } catch {
      setEstAdmin(false);
    }
  }, []);

  useEffect(() => {
    let annule = false;
    axios
      .get(`${API_URL}/bande-passante/destinations`, {
        params: { heures, limite: 25, id_site: idSite || undefined },
      })
      .then(({ data }) => {
        if (annule) return;
        setDonnees(data);
        setIndisponible(false);
      })
      .catch(() => {
        if (!annule) setIndisponible(true);
      });
    return () => {
      annule = true;
    };
  }, [idSite, heures]);

  useEffect(() => {
    let annule = false;
    axios
      .get(`${API_URL}/acces-web/politique`, {
        params: { id_site: idSite || undefined },
      })
      .then(({ data }) => {
        if (!annule) setIdPolitique(data?.politique?.id_politique ?? null);
      })
      .catch(() => {
        // Fonction d'accès web non installée sur cette version : pas de
        // bouton. On ne le signale pas ici — ce n'est pas le sujet de
        // cette page, et l'écran Accès web le dit déjà.
        if (!annule) setIdPolitique(null);
      });
    return () => {
      annule = true;
    };
  }, [idSite]);

  if (indisponible || !donnees) return null;

  const liste = donnees.destinations || [];
  if (liste.length === 0) return null;

  const total = donnees.octets_total || 0;
  const visibles = tout ? liste : liste.slice(0, 8);
  const blocagePossible = estAdmin && idPolitique !== null;

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">
          Vers quoi part le débit
        </h2>
        <p className="text-xs text-[var(--color-mute)] mt-0.5">
          Les correspondants les plus servis, tous équipements confondus.
          Le nom vient du DNS inverse : il désigne le serveur contacté, pas
          ce qui y a été fait.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-mute)] border-b border-[var(--color-line)]">
              <th className="px-4 py-3 font-medium">Correspondant</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Service</th>
              <th className="px-4 py-3 font-medium">Volume</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell w-44">Part</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Machines</th>
              <th className="px-4 py-3 font-medium w-24" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((d, i) => {
              const cle = `${d.destination}|${d.service}|${i}`;
              const dejaBloque = bloques.includes(d.destination);
              const blocable = blocagePossible && estDomaine(d.destination);
              return (
                <Fragment key={cle}>
                  <tr className="border-b border-[var(--color-line)] last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="text-[var(--color-ink)] break-all">
                        {d.destination}
                      </span>
                      {d.nb_adresses > 1 && (
                        /* Un grand service répond depuis des dizaines de
                           serveurs. On les additionne sous un seul nom, et
                           on dit combien pour que le chiffre reste
                           vérifiable. */
                        <span className="text-[11px] text-[var(--color-mute)] ml-1.5">
                          {d.nb_adresses} serveurs
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--color-mute)] sm:hidden block">
                        {d.service}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-mute)] hidden sm:table-cell whitespace-nowrap">
                      {d.service}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-ink)] tabular-nums whitespace-nowrap">
                      {formaterOctets(d.octets_total)}
                      <span className="text-[11px] text-[var(--color-mute)] ml-1.5">
                        ↓ {formaterOctets(d.octets_entrants)} · ↑{" "}
                        {formaterOctets(d.octets_sortants)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <Part valeur={d.octets_total} total={total} />
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-mute)] tabular-nums hidden md:table-cell">
                      {d.nb_machines}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {dejaBloque ? (
                        <span className="text-[11px]" style={{ color: "var(--color-crit)" }}>
                          Bloqué
                        </span>
                      ) : blocable ? (
                        <button
                          onClick={() =>
                            setOuvert(ouvert === cle ? null : cle)
                          }
                          className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--color-line)] text-[var(--color-mute)] hover:text-[var(--color-ink)] transition cible-tactile"
                        >
                          {ouvert === cle ? "Fermer" : "Bloquer"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {ouvert === cle && (
                    <PanneauBlocage
                      domaine={d.destination}
                      idPolitique={idPolitique}
                      onFerme={() => setOuvert(null)}
                      onBloque={(dom) => {
                        setBloques((v) => [...v, dom]);
                        setOuvert(null);
                      }}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {liste.length > 8 && (
        <button
          onClick={() => setTout((v) => !v)}
          className="w-full px-4 py-2.5 text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)] border-t border-[var(--color-line)] transition cible-tactile"
        >
          {tout
            ? "Réduire"
            : `Voir les ${liste.length - 8} autres correspondants`}
        </button>
      )}

      {/* CE QUI EST MESURÉ, ET CE QUI NE L'EST PAS. Sans cette ligne, un
          exploitant lirait ce tableau comme la totalité du trafic — alors
          que seul ce qui a été ROUTÉ y figure. */}
      <p className="px-4 py-2.5 text-[11px] text-[var(--color-mute)] border-t border-[var(--color-line)]">
        Mesuré par le routeur, sur les {donnees.heures} dernières heures. Le
        trafic entre deux machines d'un même réseau ne passe pas par lui et
        n'apparaît pas ici. Ces relevés sont effacés au bout de{" "}
        {donnees.conservation_jours} jours.
      </p>
    </div>
  );
}
