/**
 * Ordre chronologique des trades.
 *
 * Trier sur la seule `date` ne départage pas deux trades du même jour : la
 * comparaison rend 0 et l'ordre d'arrivée l'emporte. Or les trades arrivent de
 * Supabase dans l'ordre d'insertion à `created_at` égal — c'est-à-dire du plus
 * ANCIEN au plus récent pour un relevé importé d'un coup. Une liste « trades
 * récents » se retrouvait donc à l'envers dès que la journée tenait en un seul
 * import, et son « douze premiers » retenait les douze plus anciens.
 *
 * D'où une clé qui descend à la seconde. L'heure retenue est celle de SORTIE :
 * c'est le moment où le trade existe en tant que résultat. À défaut, l'entrée ;
 * à défaut encore, minuit — un trade sans heure passe avant ceux du même jour
 * qui en ont une, plutôt que de flotter au hasard.
 */

export interface DatedTrade {
  date?: unknown;
  exitTime?: unknown;
  exit_time?: unknown;
  entryTime?: unknown;
  entry_time?: unknown;
}

/** `HH:MM:SS` sur deux chiffres, seul format comparable lettre à lettre. */
const hhmmss = (raw: unknown): string | null => {
  const m = String(raw ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}` : null;
};

/**
 * Instant du trade, en chaîne triable (`2026-09-01T17:01:15`). Les chaînes se
 * comparent directement : pas de `Date` à construire par élément comparé, et
 * aucun fuseau ne vient décaler une date déjà écrite en local.
 */
export const tradeInstant = (t: DatedTrade): string => {
  /* Date manquante → une date qui trie avant toutes les vraies. Sans ce repli,
     la chaîne commençait par « T », qui passe APRÈS les chiffres : un trade sans
     date se hissait en tête des plus récents. */
  const day = String(t?.date ?? "").slice(0, 10) || "0000-00-00";
  const time = hhmmss(t?.exitTime ?? t?.exit_time) || hhmmss(t?.entryTime ?? t?.entry_time) || "00:00:00";
  return `${day}T${time}`;
};

/** Comparateur « du plus récent au plus ancien ». */
export const byMostRecent = (a: DatedTrade, b: DatedTrade): number =>
  tradeInstant(b).localeCompare(tradeInstant(a));

/** Comparateur « du plus ancien au plus récent » (courbes, cumuls). */
export const byOldest = (a: DatedTrade, b: DatedTrade): number =>
  tradeInstant(a).localeCompare(tradeInstant(b));
