import { describe, it, expect } from "vitest";
import {
  normalizePlaybook, emptySetup, completeness, CRITERIA, exampleStats, tradeStats, tradesOfStrategy,
} from "@/lib/playbook/model";

describe("normalizePlaybook", () => {
  it("rend un playbook vide pour un magasin absent ou corrompu", () => {
    expect(normalizePlaybook(undefined)).toEqual({ setups: [] });
    expect(normalizePlaybook("n'importe quoi")).toEqual({ setups: [] });
    expect(normalizePlaybook({ setups: "pas une liste" })).toEqual({ setups: [] });
  });

  it("complète une fiche d'une version antérieure avec les valeurs par défaut", () => {
    const { setups } = normalizePlaybook({ setups: [{ id: "a", name: "iFVG", entry: "Au CE" }] });
    expect(setups[0]).toMatchObject({
      id: "a", name: "iFVG", entry: "Au CE", status: "testing", strategyId: null,
      invalidation: "", checklist: [], screenshots: [], examples: [], mistakes: [],
    });
  });

  it("garde un R non relevé à null au lieu d'en faire un scratch", () => {
    const { setups } = normalizePlaybook({ setups: [{ id: "a", examples: [
      { id: "e1", outcome: "win", r: "" },
      { id: "e2", outcome: "loss", r: null },
      { id: "e3", outcome: "win", r: "2.5" },
    ] }] });
    expect(setups[0].examples.map(e => e.r)).toEqual([null, null, 2.5]);
  });

  it("écarte les captures sans adresse et accepte des chaînes nues", () => {
    const { setups } = normalizePlaybook({ setups: [{ id: "a",
      screenshots: [{ id: "i1", url: "" }, "https://x/y.png"],
      mistakes: ["FOMO"],
    }] });
    expect(setups[0].screenshots.map(i => i.url)).toEqual(["https://x/y.png"]);
    expect(setups[0].mistakes.map(m => m.text)).toEqual(["FOMO"]);
  });

  it("ramène l'id de stratégie à une chaîne et dédoublonne les fiches", () => {
    const { setups } = normalizePlaybook({ setups: [
      { id: "a", name: "premier", strategyId: 42 },
      { id: "a", name: "doublon" },
    ] });
    expect(setups).toHaveLength(1);
    expect(setups[0]).toMatchObject({ name: "premier", strategyId: "42" });
  });
});

describe("completeness", () => {
  it("couvre au moins les onze critères demandés", () => {
    expect(CRITERIA.map(c => c.label)).toEqual([
      "Captures", "Contexte", "Setup", "Entrée", "Stop loss", "Take profit", "Invalidation",
      "Exemples gagnants", "Exemples perdants", "Erreurs", "Statistiques",
    ]);
  });

  it("compte ce qui manque à une fiche neuve, puis à une fiche remplie", () => {
    const blank = emptySetup("Test");
    expect(completeness(blank).done).toBe(0);

    const full = {
      ...blank,
      screenshots: [{ id: "i", url: "u", caption: "" }],
      context: "c", setup: "s", entry: "e", stopLoss: "sl", takeProfit: "tp", invalidation: "inv",
      examples: [
        { id: "1", outcome: "win" as const, date: "", symbol: "", r: 2, note: "", image: "" },
        { id: "2", outcome: "loss" as const, date: "", symbol: "", r: -1, note: "", image: "" },
      ],
      mistakes: [{ id: "m", text: "FOMO" }],
    };
    expect(completeness(full)).toEqual({ done: 11, total: 11, missing: [] });
  });

  it("ne compte pas un champ rempli d'espaces", () => {
    expect(completeness({ ...emptySetup(), context: "   " }).missing).toContain("Contexte");
  });
});

describe("statistiques", () => {
  it("compte ±1R pour un exemple sans R relevé, comme le journal de backtest", () => {
    const s = exampleStats([
      { id: "1", outcome: "win", date: "", symbol: "", r: null, note: "", image: "" },
      { id: "2", outcome: "loss", date: "", symbol: "", r: null, note: "", image: "" },
      { id: "3", outcome: "win", date: "", symbol: "", r: 3, note: "", image: "" },
    ]);
    expect(s).toMatchObject({ count: 3, wins: 2, losses: 1, winRate: 67, totalR: 3 });
  });

  it("calcule réussite, P&L et payoff des trades réels", () => {
    const s = tradeStats([{ pnl: 200 }, { pnl: 100 }, { pnl: -50 }, { pnl: 0 }]);
    expect(s).toMatchObject({ count: 4, wins: 2, losses: 1, winRate: 67, totalPnl: 250 });
    expect(s.payoff).toBe(3);
  });

  it("retrouve les trades d'une stratégie par id ou par l'ancienne clé composite", () => {
    const trades = [
      { id: "t1", date: "2026-10-01", symbol: "NQ", entry: 20000, pnl: 1 },
      { id: "t2", date: "2026-10-02", symbol: "ES", entry: 5000.5, pnl: 1 },
      { id: "t3", date: "2026-10-03", symbol: "NQ", entry: 1, pnl: 1 },
    ];
    const links = { t1: ["s1"], "2026-10-02ES5000.50": [7], t3: ["s2"] };
    expect(tradesOfStrategy(trades, links, "s1").map(t => t.id)).toEqual(["t1"]);
    expect(tradesOfStrategy(trades, links, "7").map(t => t.id)).toEqual(["t2"]);
    expect(tradesOfStrategy(trades, links, null)).toEqual([]);
  });
});
