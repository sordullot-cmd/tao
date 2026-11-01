import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, NO_STRATEGY, activeFilterCount, filterTrades, periodStart, tradeStats } from "@/lib/tradeFilters";

const today = new Date(2026, 10, 15); // 15 nov. 2026
const trades = [
  { id: 1, date: "2026-11-15", symbol: "MNQZ6", direction: "Long", pnl: 120, account_id: "a" },
  { id: 2, date: "2026-11-10", symbol: "ESZ6", direction: "Short", pnl: -80, account_id: "b" },
  { id: 3, date: "2026-10-20", symbol: "MNQZ6", direction: "short", pnl: 5, account_id: "a" },
  { id: 4, date: "2025-12-31", symbol: "GC", direction: "long", pnl: 300, account_id: "a" },
];
const strat: Record<number, string[]> = { 1: ["s1"], 2: ["s2"], 3: [], 4: ["s1"] };
const ctx = {
  today,
  outcomeOf: (tr: any) => (tr.pnl > 25 ? "win" : tr.pnl < -25 ? "loss" : "be") as any,
  strategyIdsOf: (tr: any) => strat[tr.id],
  searchTextOf: (tr: any) => (strat[tr.id].includes("s1") ? "Opening range" : ""),
};
const ids = (f: Partial<typeof EMPTY_FILTERS>) => filterTrades(trades, { ...EMPTY_FILTERS, ...f }, ctx).map(t => t.id);

describe("filterTrades", () => {
  it("sans filtre, rend tout", () => {
    expect(ids({})).toEqual([1, 2, 3, 4]);
  });

  it("borne la période sur la date du trade, aujourd'hui compris", () => {
    expect(periodStart("7d", today)).toBe("2026-11-09");
    expect(ids({ period: "today" })).toEqual([1]);
    expect(ids({ period: "7d" })).toEqual([1, 2]);
    expect(ids({ period: "month" })).toEqual([1, 2]);
    expect(ids({ period: "year" })).toEqual([1, 2, 3]);
  });

  it("filtre le résultat, le sens et le compte", () => {
    expect(ids({ outcome: "be" })).toEqual([3]);
    expect(ids({ side: "short" })).toEqual([2, 3]);
    expect(ids({ account: "b" })).toEqual([2]);
  });

  it("retient les trades sans stratégie quand on le demande", () => {
    expect(ids({ strategies: ["s1"] })).toEqual([1, 4]);
    expect(ids({ strategies: [NO_STRATEGY, "s2"] })).toEqual([2, 3]);
  });

  it("cherche dans le symbole et dans le texte fourni, sans casse", () => {
    expect(ids({ query: "mnq" })).toEqual([1, 3]);
    expect(ids({ query: "opening" })).toEqual([1, 4]);
  });

  it("compte les filtres posés, pas la recherche faite d'espaces", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: "  ", period: "7d", strategies: ["s1"] })).toBe(2);
  });
});

describe("tradeStats", () => {
  const isWin = (n: number) => n > 25;
  it("résume net, taux, profit factor et extrêmes", () => {
    const s = tradeStats([120, -80, 5, 300], isWin);
    expect(s).toMatchObject({ count: 4, net: 345, winRate: 50, best: 300, worst: -80 });
    expect(s.profitFactor).toBeCloseTo(425 / 80);
  });
  it("sans perte, le profit factor est infini ; sans trade, il n'existe pas", () => {
    expect(tradeStats([10, 40], isWin).profitFactor).toBe(Infinity);
    expect(tradeStats([], isWin)).toMatchObject({ count: 0, profitFactor: null, best: null });
  });
});
