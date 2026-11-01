/* Filtres de la page Trades. Sortis du composant pour se tester sans monter
   le tableau — et parce que le composant fait déjà deux mille lignes. */

export const PERIODS = ["today", "7d", "30d", "month", "year"] as const;
export type PeriodId = (typeof PERIODS)[number];
export const OUTCOMES = ["win", "loss", "be"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface TradeFilters {
  query: string;
  period: PeriodId | "";
  outcome: Outcome | "";
  side: "long" | "short" | "";
  account: string;
  /** Ids de stratégie ; `NO_STRATEGY` retient les trades sans stratégie. */
  strategies: string[];
}

export const NO_STRATEGY = "__none__";

export const EMPTY_FILTERS: TradeFilters = {
  query: "", period: "", outcome: "", side: "", account: "", strategies: [],
};

export const activeFilterCount = (f: TradeFilters): number =>
  [f.query.trim(), f.period, f.outcome, f.side, f.account, f.strategies.length > 0].filter(Boolean).length;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Première date (YYYY-MM-DD, incluse) d'une période qui finit aujourd'hui. */
export function periodStart(period: PeriodId, today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (period) {
    case "today": return iso(d);
    // « 7 derniers jours » compte aujourd'hui : six jours en arrière, pas sept.
    case "7d":    d.setDate(d.getDate() - 6); return iso(d);
    case "30d":   d.setDate(d.getDate() - 29); return iso(d);
    case "month": return iso(new Date(d.getFullYear(), d.getMonth(), 1));
    case "year":  return iso(new Date(d.getFullYear(), 0, 1));
  }
}

export interface FilterableTrade {
  date?: string | null;
  symbol?: string | null;
  direction?: string | null;
  account_id?: string | null;
}

interface Ctx<Tr> {
  outcomeOf: (trade: Tr) => Outcome;
  strategyIdsOf: (trade: Tr) => string[];
  /** Ce que la recherche lit en plus du symbole : noms de stratégie, de compte. */
  searchTextOf?: (trade: Tr) => string;
  today?: Date;
}

export function filterTrades<Tr extends FilterableTrade>(trades: Tr[], f: TradeFilters, ctx: Ctx<Tr>): Tr[] {
  const q = f.query.trim().toLowerCase();
  const from = f.period ? periodStart(f.period, ctx.today) : null;
  const wanted = new Set(f.strategies);
  return trades.filter(tr => {
    if (from && String(tr.date || "").slice(0, 10) < from) return false;
    if (f.account && tr.account_id !== f.account) return false;
    if (f.side && String(tr.direction || "").toLowerCase().startsWith("s") !== (f.side === "short")) return false;
    if (f.outcome && ctx.outcomeOf(tr) !== f.outcome) return false;
    if (wanted.size) {
      const ids = ctx.strategyIdsOf(tr);
      const hit = ids.length ? ids.some(id => wanted.has(id)) : wanted.has(NO_STRATEGY);
      if (!hit) return false;
    }
    if (q) {
      const hay = `${tr.symbol || ""} ${ctx.searchTextOf?.(tr) || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface TradeStats {
  count: number;
  net: number;
  /** En %, arrondi. Les break-even comptent au dénominateur, comme ailleurs dans l'app. */
  winRate: number;
  /** Gains bruts / pertes brutes. `Infinity` sans perte, `null` sans trade. */
  profitFactor: number | null;
  best: number | null;
  worst: number | null;
}

export function tradeStats(nets: number[], isWin: (net: number) => boolean): TradeStats {
  if (!nets.length) return { count: 0, net: 0, winRate: 0, profitFactor: null, best: null, worst: null };
  let net = 0, gains = 0, losses = 0, wins = 0;
  for (const n of nets) {
    net += n;
    if (n > 0) gains += n; else losses -= n;
    if (isWin(n)) wins++;
  }
  return {
    count: nets.length,
    net,
    winRate: Math.round((wins / nets.length) * 100),
    profitFactor: losses > 0 ? gains / losses : gains > 0 ? Infinity : null,
    best: Math.max(...nets),
    worst: Math.min(...nets),
  };
}
