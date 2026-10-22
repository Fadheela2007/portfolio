import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ══════════════════════════════════════════════════════════════════════
   VERS QUOI PART LE DÉBIT DE CETTE MACHINE

   Le classement dit QUI consomme. Cet encadré dit VERS QUOI — et c'est
   la question suivante, toujours : « la machine du comptoir consomme
   3 Mbit/s » n'amène à rien tant qu'on ne sait pas si c'est la
   sauvegarde ou une plateforme vidéo.

   ── « INDÉSIRABLE » EST UNE ÉTIQUETTE, PAS UN CONSTAT DE BLOCAGE ──

   Ces flux ont été OBSERVÉS : ils ont eu lieu. Écrire « bloqué » à côté
   de quelque chose qu'on vient de voir passer serait un mensonge visible
   à l'œil nu.

   L'étiquette dit une seule chose : ce correspondant figure dans une
   liste que la politique d'accès web de ce site désigne comme
   indésirable. Si la politique est ACTIVE et que le flux a eu lieu quand
   même, l'encadré le signale — ça veut dire que le blocage n'atteint pas
   cette machine, et c'est une information qui vaut d'être vue.
   ══════════════════════════════════════════════════════════════════════ */

function formaterOctets(octets) {
  const n = Number(octets);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${Math.round(n)} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} Mo`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

/** Une barre fine, proportionnelle au plus gros correspondant. */
function Part({ valeur, maximum }) {
  const pct = maximum > 0 ? Math.min(100, (valeur / maximum) * 100) : 0;
  return (
    <div className="h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: "var(--color-signal)" }}
      />
    </div>
  );
}

export default function DestinationsEquipement({ idEquipement, heures = 24 }) {
  const [donnees, setDonnees] = useState(null);
  const [indisponible, setIndisponible] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!idEquipement) return undefined;
    let annule = false;
    setEnCours(true);
    setIndisponible(null);

    axios
      .get(`${API_URL}/equipements/${idEquipement}/destinations`, {
        params: { heures, limite: 8 },
      })
      .then(({ data }) => {
        if (!annule) setDonnees(data);
      })
      .catch((err) => {
        if (annule) return;
        setDonnees(null);
        /* ON RÉPÈTE LA RAISON DU SERVEUR. Un 404 ici ne veut pas dire
           « machine introuvable » mais « le collecteur de flux n'est pas
           installé sur cette base » — deux pannes qu'on ne cherche pas
           au même endroit. */
        setIndisponible(
          err.response?.data?.error || "Lecture des destinations impossible."
        );
      })
      .finally(() => {
        if (!annule) setEnCours(false);
      });

    return () => {
      annule = true;
    };
  }, [idEquipement, heures]);

  if (enCours && !donnees) {
    return (
      <div>
        <h3 className="text-sm font-medium text-[var(--color-ink)]">
          Vers quoi part ce débit
        </h3>
        <p className="text-sm text-[var(--color-mute)] py-6 text-center">Lecture…</p>
      </div>
    );
  }

  if (indisponible) {
    return (
      <div>
        <h3 className="text-sm font-medium text-[var(--color-ink)]">
          Vers quoi part ce débit
        </h3>
        <p className="text-xs text-[var(--color-mute)] mt-1.5">{indisponible}</p>
      </div>
    );
  }

  const liste = donnees?.destinations || [];
  const maximum = liste.reduce((m, d) => Math.max(m, Number(d.octets_total) || 0), 0);
  const nbIndesirables = liste.filter((d) => d.indesirable).length;
  const politique = donnees?.politique;

  return (
    <div>
      <h3 className="text-sm font-medium text-[var(--color-ink)]">
        Vers quoi part ce débit
      </h3>
      <p className="text-xs text-[var(--color-mute)] mt-0.5 mb-2">
        Les correspondants de cette machine, vus par le collecteur de flux.
      </p>

      {liste.length === 0 ? (
        /* LE VIDE A UNE CAUSE, ET ELLE N'EST PAS « CETTE MACHINE NE PARLE
           À PERSONNE ». Le dire évite de chercher la panne sur le poste
           alors qu'elle est sur le routeur. */
        <p className="text-sm text-[var(--color-mute)] py-6 text-center">
          Aucun flux observé sur cette période. Cette lecture demande que le
          routeur envoie ses flux (NetFlow) à la plateforme.
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {liste.map((d) => (
              <li key={`${d.destination}|${d.service}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-[var(--color-ink)] break-all">
                    {d.destination}
                    <span className="text-xs text-[var(--color-mute)]"> · {d.service}</span>

                    {/* L'ÉTIQUETTE NE PORTE PAS QUE DE LA COULEUR : elle
                        porte un mot. Un point rouge seul ne se lit pas
                        quand on ne distingue pas les couleurs, et ne se
                        lit pas du tout à l'impression. */}
                    {d.indesirable && (
                      <span
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border align-middle whitespace-nowrap"
                        style={{
                          borderColor: "var(--color-warn)",
                          color: "var(--color-warn)",
                        }}
                        title={
                          d.indesirable.raison === "regle_manuelle"
                            ? "Une règle écrite à la main dans votre politique d'accès web désigne ce domaine."
                            : `Ce domaine figure dans la catégorie « ${d.indesirable.categorie} », que votre politique désigne comme indésirable.`
                        }
                      >
                        indésirable
                        {d.indesirable.categorie ? ` · ${d.indesirable.categorie}` : ""}
                      </span>
                    )}
                  </span>

                  <span className="text-sm tabular-nums text-[var(--color-ink)] whitespace-nowrap">
                    {formaterOctets(d.octets_total)}
                  </span>
                </div>

                <div className="mt-1">
                  <Part valeur={Number(d.octets_total) || 0} maximum={maximum} />
                </div>

                <div className="text-[11px] text-[var(--color-mute)] mt-1 tabular-nums">
                  ↓ {formaterOctets(d.octets_entrants)} · ↑{" "}
                  {formaterOctets(d.octets_sortants)}
                </div>
              </li>
            ))}
          </ul>

          {/* ── CE QUE L'ÉTIQUETTE VEUT DIRE, ET CE QU'ELLE NE DIT PAS ── */}
          {nbIndesirables > 0 && (
            <p
              className="text-[11px] mt-3 pt-3 border-t border-[var(--color-line)]"
              style={{ color: politique?.active ? "var(--color-warn)" : "var(--color-mute)" }}
            >
              {politique?.active
                ? `${nbIndesirables} correspondant(s) figurent dans votre politique « ${politique.nom} », pourtant active : ces flux ont eu lieu quand même. Le blocage n'atteint donc pas cette machine.`
                : `${nbIndesirables} correspondant(s) figurent dans votre politique d'accès web, qui n'est pas active. Rien n'est bloqué : l'étiquette dit ce qui le serait.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
