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
 *
 * 3. Un doublon n'est pas forcément SANS INTÉRÊT. Les trades entrés avant que
 *    la base sache stocker les frais (migration 035) n'en portent aucun, et le
 *    site leur applique alors son barème moyen — le P&L net affiché s'écarte
 *    du relevé de plusieurs centaines de dollars sans que rien ne le dise.
 *    Recoller le relevé est le geste naturel pour réparer ça ; encore faut-il
 *    que l'import en tire quelque chose. D'où `toRefresh` : les frais réels que
 *    le lot apporte à des trades déjà en base qui ne les ont pas.
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
  /** Présent côté base seulement ; c'est la cible d'un rafraîchissement. */
  id?: unknown;
  /** Frais réels. `null` en base = jamais renseignés. */
  fees?: unknown;
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

/** Frais réels à poser sur un trade déjà en base. */
export interface FeeRefresh {
  id: unknown;
  fees: number;
}

export interface DedupeResult<T> {
  toInsert: T[];
  duplicates: number;
  /** Doublons dont le lot corrige les frais. Vide dans le cas courant. */
  toRefresh: FeeRefresh[];
}

/**
 * Sépare le lot en « à insérer » et « déjà là ». `existing` sont les trades du
 * MÊME compte : un relevé importé sur deux comptes doit rentrer deux fois.
 */
export const splitNewTrades = <T extends SignableTrade>(
  batch: T[],
  existing: SignableTrade[]
): DedupeResult<T> => {
  /* Les trades DÉJÀ en base, rangés par signature. Une file et non un simple
     compteur : compter suffisait à décider d'insérer ou non, mais pas à dire
     QUEL trade un doublon retrouve — or c'est lui qu'il faut corriger quand le
     lot apporte des frais que la base n'a pas. On dépile dans l'ordre, ce qui
     garde le comportement du compteur (le lot en a m, la base n, on insère
     m − n) sans rien changer aux scale-outs. */
  const left = new Map<string, SignableTrade[]>();
  for (const tr of existing || []) {
    const sig = tradeSignature(tr);
    const queue = left.get(sig);
    if (queue) queue.push(tr);
    else left.set(sig, [tr]);
  }

  const toInsert: T[] = [];
  const toRefresh: FeeRefresh[] = [];
  let duplicates = 0;
  for (const tr of batch) {
    const sig = tradeSignature(tr);
    const queue = left.get(sig);
    const prev = queue && queue.length ? queue.shift() : undefined;
    if (prev) {
      duplicates += 1;
      const fees = feeRefreshFor(prev, tr);
      if (fees !== null) toRefresh.push({ id: prev.id, fees });
      continue;
    }
    toInsert.push(tr);
  }

  return { toInsert, duplicates, toRefresh };
};

/**
 * Les frais que le lot apporte à un trade déjà en base, ou `null` s'il n'y a
 * rien à corriger.
 *
 * On ne rafraîchit QUE vers une valeur connue : un relevé muet sur les frais ne
 * doit jamais effacer ceux qu'un autre import avait chiffrés. Un trade sans id
 * est hors de portée (l'appelant n'a pas relu la colonne), et une valeur
 * identique au centime ne vaut pas une écriture.
 */
function feeRefreshFor(prev: SignableTrade, incoming: SignableTrade): number | null {
  if (prev.id == null) return null;
  if (incoming.fees == null || incoming.fees === "") return null;
  const next = Number(incoming.fees);
  if (!Number.isFinite(next) || next < 0) return null;
  const before = prev.fees == null || prev.fees === "" ? null : Number(prev.fees);
  if (before !== null && Number.isFinite(before) && round2(before) === round2(next)) return null;
  return round2(next);
}
