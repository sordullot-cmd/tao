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
 *
 * 4. Le même raisonnement vaut pour le P&L et les lots. La signature ne porte
 *    ni l'un ni l'autre — c'est voulu, elle identifie le trade, pas son
 *    résultat —, si bien qu'un trade entré faux (collage partiel : 1 lot sur
 *    les 1 + 18 + 1 d'une même position) était reconnu au recollage du relevé
 *    complet, déclaré doublon, et gardait son P&L faux pour toujours. Seuls
 *    ses frais étaient mis à jour : le P&L net d'un +223 $ ressortait à −11 $.
 *    Le relevé fait foi ; ce qu'il chiffre remplace ce que la base a gardé.
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
  /** P&L BRUT, comme en base. */
  pnl?: unknown;
  quantity?: unknown;
  volume?: unknown;
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

/** Ce que le relevé corrige sur un trade déjà en base — seuls les champs qui
    changent sont présents, pour que la mise à jour n'écrive que ceux-là. */
export interface FeeRefresh {
  id: unknown;
  fees?: number;
  pnl?: number;
  quantity?: number;
  volume?: number;
}

export interface DedupeResult<T> {
  toInsert: T[];
  duplicates: number;
  /** Doublons dont le lot corrige frais, P&L ou lots. Vide dans le cas courant. */
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
      const refresh = refreshFor(prev, tr);
      if (refresh) toRefresh.push(refresh);
      continue;
    }
    toInsert.push(tr);
  }

  return { toInsert, duplicates, toRefresh };
};

/**
 * Ce que le lot corrige sur un trade déjà en base, ou `null` s'il n'y a rien.
 *
 * On ne rafraîchit QUE vers une valeur connue : un relevé muet sur un champ ne
 * doit jamais effacer ce qu'un autre import avait chiffré. Un trade sans id
 * est hors de portée (l'appelant n'a pas relu la colonne), et une valeur
 * identique au centime ne vaut pas une écriture.
 */
function refreshFor(prev: SignableTrade, incoming: SignableTrade): FeeRefresh | null {
  if (prev.id == null) return null;
  const out: FeeRefresh = { id: prev.id };
  let changed = false;
  for (const field of ["fees", "pnl", "quantity", "volume"] as const) {
    const raw = incoming[field];
    if (raw == null || raw === "") continue;
    const next = Number(raw);
    if (!Number.isFinite(next)) continue;
    // Des frais ou des lots négatifs n'ont pas de sens ; un P&L, si.
    if (field !== "pnl" && next < 0) continue;
    const old = prev[field];
    const before = old == null || old === "" ? null : Number(old);
    if (before !== null && Number.isFinite(before) && round2(before) === round2(next)) continue;
    out[field] = round2(next);
    changed = true;
  }
  return changed ? out : null;
}
