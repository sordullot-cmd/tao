/**
 * Anti-doublons de l'import — extrait de la page pour être testable, et parce
 * que c'est une règle métier : ce qui fait qu'un trade est « le même » ne
 * dépend pas de l'écran qui l'insère.
 *
 * Deux pièges, tous deux rencontrés sur un relevé Alpha Futures collé à la
 * main :
 *
 * 1. La signature doit porter l'heure de SORTIE. Un scale-out laisse plusieurs
 *    lignes qui partagent date, symbole, prix d'entrée, prix de sortie ET heure
 *    d'entrée — seule la sortie les sépare. Sans elle, sortir trois contrats au
 *    même niveau ne rentrait qu'une fois : trois trades du relevé, un seul en
 *    base, sans que rien ne le signale (le compte rendu les annonçait
 *    « doublons ignorés »).
 *
 * 2. On compte les OCCURRENCES, on ne travaille pas sur un ensemble. Deux
 *    lignes réellement identiques d'un même relevé sont deux trades, pas une
 *    copie ; c'est le RÉIMPORT du même relevé qu'il faut arrêter. Compter
 *    donne les deux d'un coup : le lot en contient m, la base en a déjà n, on
 *    insère m − n. Réimporter le même relevé n'insère rien (m = n), et un
 *    relevé qui porte trois fois la même ligne en insère trois.
 */

const norm = (v: unknown): string => (v == null ? "" : String(v).trim());
const round2 = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100;

/** Champs comparés. Tous existent en base ET dans un trade fraîchement parsé. */
export interface SignableTrade {
  date?: unknown;
  symbol?: unknown;
  direction?: unknown;
  entry?: unknown;
  exit?: unknown;
  entry_time?: unknown;
  exit_time?: unknown;
}

/**
 * Ce qui fait qu'un trade est « le même ». Les prix sont arrondis au centime
 * (la base rend des `numeric`, le CSV du texte), la date tronquée au jour (un
 * `timestamp` traînerait son heure), le reste comparé tel quel — `entry_time`
 * et `exit_time` sont du TEXT des deux côtés (migration 014), donc la valeur
 * relue est exactement celle qui a été écrite.
 */
export const tradeSignature = (tr: SignableTrade): string =>
  [
    norm(tr.date).slice(0, 10),
    norm(tr.symbol).toUpperCase(),
    norm(tr.direction).toUpperCase(),
    round2(tr.entry),
    round2(tr.exit),
    norm(tr.entry_time),
    norm(tr.exit_time),
  ].join("|");

export interface DedupeResult<T> {
  toInsert: T[];
  duplicates: number;
}

/**
 * Sépare le lot en « à insérer » et « déjà là ». `existing` sont les trades du
 * MÊME compte : un relevé importé sur deux comptes doit rentrer deux fois.
 */
export const splitNewTrades = <T extends SignableTrade>(
  batch: T[],
  existing: SignableTrade[]
): DedupeResult<T> => {
  /* Combien de fois chaque signature est DÉJÀ en base. Un compteur, pas un
     Set : c'est ce qui laisse passer la deuxième ligne légitime d'un scale-out
     tout en arrêtant le réimport d'un relevé entier. */
  const left = new Map<string, number>();
  for (const tr of existing || []) {
    const sig = tradeSignature(tr);
    left.set(sig, (left.get(sig) || 0) + 1);
  }

  const toInsert: T[] = [];
  let duplicates = 0;
  for (const tr of batch) {
    const sig = tradeSignature(tr);
    const remaining = left.get(sig) || 0;
    if (remaining > 0) {
      left.set(sig, remaining - 1);
      duplicates += 1;
      continue;
    }
    toInsert.push(tr);
  }

  return { toInsert, duplicates };
};
