/**
 * Lectures croisées du tableau de bord : P&L par note, émotions positives
 * contre négatives, confluences gagnantes, winrate par type de trade.
 *
 * Fonctions pures, à part de DashboardPage : la page fait déjà 1 300 lignes de
 * rendu, et ces regroupements ont des cas limites (trade à émotions mêlées,
 * confluence d'un seul tag, direction écrite « BUY ») qui se testent mieux
 * sans monter le composant.
 */

export interface InsightTrade {
  id?: string | number | null;
  pnl: number;
  direction?: string | null;
}

export interface Bucket {
  id: string;
  count: number;
  wins: number;
  pnl: number;
  /** wins / count, en %. Même définition que le bloc « Impacts » voisin : les
   *  deux se lisent côte à côte, ils ne doivent pas compter différemment. */
  winrate: number;
  expectancy: number;
}

/**
 * Regroupe les trades par clé. Un trade peut appartenir à plusieurs groupes
 * (un tag FVG ET un tag OB) ou à aucun (`keysOf` rend un tableau vide). L'ordre
 * de sortie est celui de `order` quand il est donné, sinon celui de première
 * apparition — c'est à l'appelant de trier selon ce qu'il montre.
 */
export function bucketStats<T extends InsightTrade>(
  trades: T[],
  keysOf: (t: T) => string[],
  order?: string[],
): Bucket[] {
  const acc = new Map<string, { count: number; wins: number; pnl: number }>();
  for (const tr of trades) {
    const pnl = Number(tr.pnl) || 0;
    // Dédoublonné : un tag saisi deux fois ne doit pas compter le trade deux fois.
    for (const k of new Set(keysOf(tr))) {
      const b = acc.get(k) ?? { count: 0, wins: 0, pnl: 0 };
      b.count++;
      if (pnl > 0) b.wins++;
      b.pnl += pnl;
      acc.set(k, b);
    }
  }
  const ids = order ? order.filter(id => acc.has(id)) : [...acc.keys()];
  return ids.map(id => {
    const b = acc.get(id)!;
    return {
      id,
      ...b,
      winrate: b.count ? (b.wins / b.count) * 100 : 0,
      expectancy: b.count ? b.pnl / b.count : 0,
    };
  });
}

/* Partage des émotions de TradesPage. « Sortie anticipée » et « ennui » sont
   rangés du côté négatif : ce ne sont pas des erreurs de marché, mais ce sont
   des écarts au plan — exactement ce que la comparaison doit isoler. */
export const POSITIVE_EMOTIONS = ["calm", "followed"] as const;
export const NEGATIVE_EMOTIONS = ["fomo", "revenge", "overconfident", "hesitation", "boredom", "earlyexit"] as const;

export type Valence = "positive" | "negative";

/**
 * Valence(s) d'un trade. Un trade tagué « calme » ET « FOMO » compte des deux
 * côtés : le forcer dans un camp aurait demandé une règle de priorité
 * arbitraire, et l'écarter ferait disparaître justement les trades ambigus.
 */
export function valencesOf(tags: string[] | undefined | null): Valence[] {
  if (!tags?.length) return [];
  const out: Valence[] = [];
  if (tags.some(t => (POSITIVE_EMOTIONS as readonly string[]).includes(t))) out.push("positive");
  if (tags.some(t => (NEGATIVE_EMOTIONS as readonly string[]).includes(t))) out.push("negative");
  return out;
}

/** Sens du trade. Les imports écrivent « LONG », « Long », « BUY »… */
export function directionOf(t: InsightTrade): "long" | "short" | null {
  const d = String(t.direction ?? "").toUpperCase();
  if (!d) return null;
  if (d.includes("LONG") || d === "BUY") return "long";
  if (d.includes("SHORT") || d === "SELL") return "short";
  return null;
}

/** Séparateur des clés de confluence — absent des ids de tags. */
export const CONFLUENCE_SEP = "|";

/**
 * Clé de confluence d'un trade : ses tags d'entrée, de liquidité puis d'unité
 * de temps, dans cet ordre et dans l'ordre de chaque liste — pas triés
 * alphabétiquement, sinon « M5 + FVG » et « FVG + M5 » se liraient à l'envers
 * d'un trade à l'autre selon les ids. Moins de deux éléments : ce n'est pas une
 * confluence, rien n'est rendu.
 */
export function confluenceKey(
  entry: string[] | undefined | null,
  liquidity: string[] | undefined | null,
  timeframe: string | undefined | null,
  orders: { entry: string[]; liquidity: string[] },
): string | null {
  const sortBy = (list: string[] | undefined | null, ref: string[]) =>
    [...new Set(list ?? [])].sort((a, b) => ref.indexOf(a) - ref.indexOf(b));
  const parts = [
    ...sortBy(entry, orders.entry),
    ...sortBy(liquidity, orders.liquidity),
    ...(timeframe ? [timeframe] : []),
  ];
  return parts.length >= 2 ? parts.join(CONFLUENCE_SEP) : null;
}

/**
 * Les confluences qui paient : P&L strictement positif, de la plus rentable à
 * la moins rentable. À P&L égal, la plus fréquente d'abord — elle est la mieux
 * établie.
 */
export function payingConfluences(buckets: Bucket[], limit = 6): Bucket[] {
  return buckets
    .filter(b => b.pnl > 0)
    .sort((a, b) => b.pnl - a.pnl || b.count - a.count)
    .slice(0, limit);
}
