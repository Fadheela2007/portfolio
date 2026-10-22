import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ══════════════════════════════════════════════════════════════════════
   SUPPRIMER UN SITE

   Le geste le plus destructeur de la plateforme. Les clés étrangères
   sont en cascade : effacer un site efface ses équipements, et avec eux
   tout l'historique de relevés, les alertes, les incidents, les plages,
   la politique d'accès web. Des mois de mesures, sans retour possible.

   ── CE QUI SERA PERDU EST DIT EN CHIFFRES, AVANT ──

   « Supprimer ce site ? » ne veut rien dire et se clique par réflexe.
   « 47 équipements, 190 000 relevés, 12 alertes » se décide.

   ── ET LE NOM SE RECOPIE À LA MAIN ──

   Un bouton se clique sans regarder lequel. Un nom oblige à vérifier
   qu'on a choisi le bon site — c'est exactement la seconde d'attention
   qu'on veut provoquer.

   ── PAS DE CORBEILLE, ET C'EST ASSUMÉ ──

   Elle mentirait : les cascades ont déjà effacé les relevés quand la
   ligne du site disparaît. Restaurer ne rendrait qu'une coquille vide.
   Mieux vaut un refus clair qu'une annulation qui ne rend pas ce qu'elle
   promet.
   ══════════════════════════════════════════════════════════════════════ */

function Ligne({ libelle, valeur }) {
  // `null` = la table n'existe pas sur cette base. Ce n'est pas zéro,
  // c'est « inconnu » : on n'affiche pas un chiffre qu'on n'a pas.
  if (valeur === null || valeur === undefined) return null;
  return (
    <li className="flex justify-between gap-4 tabular-nums">
      <span className="text-[var(--color-mute)]">{libelle}</span>
      <span className="text-[var(--color-ink)]">{Number(valeur).toLocaleString("fr-FR")}</span>
    </li>
  );
}

export default function SupprimerSite({ idSite, onFerme, onSupprime }) {
  const [infos, setInfos] = useState(null);
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState(null);
  const [comptesBloquants, setComptesBloquants] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    axios
      .get(`${API_URL}/sites/${idSite}/suppression`)
      .then(({ data }) => {
        if (!annule) setInfos(data);
      })
      .catch((err) => {
        if (!annule) {
          setErreur(err.response?.data?.error || "Lecture impossible.");
        }
      });
    return () => {
      annule = true;
    };
  }, [idSite]);

  async function supprimer(e) {
    e.preventDefault();
    setErreur(null);
    setComptesBloquants(null);
    setEnvoi(true);
    try {
      const { data } = await axios.delete(`${API_URL}/sites/${idSite}`, {
        data: { confirmation: saisie },
      });
      onSupprime(data);
    } catch (err) {
      setErreur(err.response?.data?.aide || err.response?.data?.error || "Suppression impossible.");
      /* Les comptes qui bloquent sont NOMMÉS : « rattachez-les ailleurs »
         sans dire lesquels obligerait à les chercher un par un. */
      setComptesBloquants(err.response?.data?.comptes || null);
      setEnvoi(false);
    }
  }

  const bloque =
    infos && (infos.dernier_site || (infos.comptes && infos.comptes.length > 0));
  const nomExact = infos?.confirmation_attendue || "";

  return (
    <div
      className="rounded-xl border bg-[var(--color-surface)] p-5 space-y-4"
      style={{ borderColor: "var(--color-crit)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-[var(--font-display)] text-sm font-semibold">
          Supprimer {infos ? `« ${infos.site.nom} »` : "ce site"}
        </h2>
        <button
          onClick={onFerme}
          className="text-sm text-[var(--color-mute)] hover:text-[var(--color-ink)] transition cible-tactile"
        >
          Annuler
        </button>
      </div>

      {!infos ? (
        <p className="text-sm text-[var(--color-mute)]">Lecture de ce qui sera perdu…</p>
      ) : (
        <>
          {/* ══ CE QUI DISPARAÎT ══ */}
          <div>
            <p className="text-xs text-[var(--color-mute)] mb-2">
              Cette suppression efface aussi, définitivement :
            </p>
            <ul className="text-sm space-y-1 max-w-sm">
              <Ligne libelle="Équipements" valeur={infos.perdu.equipements} />
              <Ligne libelle="Relevés de mesure" valeur={infos.perdu.releves} />
              <Ligne libelle="Alertes" valeur={infos.perdu.alertes} />
              <Ligne libelle="Plages de scan" valeur={infos.perdu.plages} />
              <Ligne libelle="Politiques d'accès web" valeur={infos.perdu.politiques} />
            </ul>
          </div>

          {/* ══ CE QUI EMPÊCHE ══ */}
          {infos.dernier_site && (
            <p className="text-sm" style={{ color: "var(--color-warn)" }}>
              C'est le dernier site de la plateforme. Sans aucun site, plus rien
              ne peut être supervisé ni scanné : créez son remplaçant d'abord.
            </p>
          )}

          {infos.comptes?.length > 0 && (
            <div className="text-sm" style={{ color: "var(--color-warn)" }}>
              <p>
                {infos.comptes.length} compte(s) sont rattachés à ce site. Les
                laisser les rendrait <strong>globaux</strong> — ils verraient
                alors tous les autres sites.
              </p>
              <ul className="text-xs mt-1.5 text-[var(--color-mute)]">
                {infos.comptes.map((c) => (
                  <li key={c.email}>
                    {c.nom} — {c.email} ({c.role})
                  </li>
                ))}
              </ul>
              <p className="text-xs mt-1.5 text-[var(--color-mute)]">
                Rattachez-les ailleurs, ou supprimez-les, depuis la page
                Utilisateurs.
              </p>
            </div>
          )}

          {/* ══ LA CONFIRMATION ══
              Le formulaire n'apparaît pas tant qu'un obstacle demeure :
              proposer un bouton qui ne peut pas fonctionner déçoit. */}
          {!bloque && (
            <form onSubmit={supprimer} className="space-y-2">
              <label className="block text-xs text-[var(--color-mute)]">
                Pour confirmer, recopiez le nom du site :{" "}
                <span className="text-[var(--color-ink)]">{nomExact}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  value={saisie}
                  onChange={(e) => setSaisie(e.target.value)}
                  placeholder={nomExact}
                  autoComplete="off"
                  className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-3 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={envoi || saisie.trim() !== nomExact}
                  className="text-sm px-3 py-1.5 rounded-lg border transition cible-tactile disabled:opacity-40"
                  style={{ borderColor: "var(--color-crit)", color: "var(--color-crit)" }}
                >
                  {envoi ? "Suppression…" : "Supprimer définitivement"}
                </button>
              </div>
            </form>
          )}

          {erreur && (
            <p className="text-sm" style={{ color: "var(--color-crit)" }}>
              {erreur}
            </p>
          )}

          {comptesBloquants?.length > 0 && (
            <ul className="text-xs text-[var(--color-mute)]">
              {comptesBloquants.map((c) => (
                <li key={c.email}>
                  {c.nom} — {c.email} ({c.role})
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
