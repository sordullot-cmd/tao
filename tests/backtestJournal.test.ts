import { describe, it, expect } from "vitest";
import {
  emptyJournal, normalizeJournal, effectiveR, tagStats, strategyStats, summarize,
  DEFAULT_CONFLUENCES, groupBySession, equityBySession, sessionLabel,
} from "@/lib/backtest/journal";

/** Raccourci de saisie : tout ce qui n'est pas dit n'a pas d'importance pour
 *  le cas qu'on vérifie. */
const entry = (over: Record<string, unknown> = {}) => ({
  id: String(Math.random()),
  date: "2026-01-05",
  symbol: "NQ",
  direction: "long",
  outcome: "win",
  strategyId: null,
  r: null,
  confluences: [],
  mistakes: [],
  better: "",
  createdAt: "2026-01-05T10:00:00.000Z",
  ...over,
});

describe("normalizeJournal()", () => {
  it("garde le vocabulaire d'une entrée que le catalogue a perdu", () => {
    const store = normalizeJournal({
      entries: [entry({ confluences: ["Fibonacci"] })],
      confluences: ["Order block"],
      mistakes: [],
    });
    expect(store.confluences).toContain("Fibonacci");
  });

  it("ne remet pas la liste d'usine sur un catalogue vidé exprès", () => {
    const store = normalizeJournal({ entries: [], confluences: [], mistakes: [] });
    expect(store.confluences).toEqual([]);
  });

  it("pose la liste d'usine quand le magasin n'en a jamais eu", () => {
    expect(normalizeJournal({}).confluences).toEqual(DEFAULT_CONFLUENCES);
    expect(emptyJournal().confluences).toEqual(DEFAULT_CONFLUENCES);
  });

  it("écarte ce qui n'a pas de date — une entrée sans elle ne se classe nulle part", () => {
    const store = normalizeJournal({ entries: [entry(), { symbol: "ES" }, null] });
    expect(store.entries).toHaveLength(1);
  });

  it("range du plus récent au plus ancien", () => {
    const store = normalizeJournal({
      entries: [entry({ date: "2026-01-02" }), entry({ date: "2026-03-09" })],
    });
    expect(store.entries.map(e => e.date)).toEqual(["2026-03-09", "2026-01-02"]);
  });

  it("distingue le R absent du R nul", () => {
    const store = normalizeJournal({
      entries: [entry({ date: "2026-01-02", r: "" }), entry({ date: "2026-01-01", r: 0 })],
    });
    expect(store.entries[0].r).toBeNull();
    expect(store.entries[1].r).toBe(0);
  });
});

describe("effectiveR()", () => {
  it("retombe sur ±1R quand rien n'a été mesuré", () => {
    expect(effectiveR({ r: null, outcome: "win" })).toBe(1);
    expect(effectiveR({ r: null, outcome: "loss" })).toBe(-1);
    expect(effectiveR({ r: null, outcome: "be" })).toBe(0);
  });

  it("préfère toujours la mesure à la convention", () => {
    expect(effectiveR({ r: 3.2, outcome: "win" })).toBe(3.2);
    expect(effectiveR({ r: 0, outcome: "win" })).toBe(0);
  });
});

describe("summarize()", () => {
  it("compte la réussite sur le résultat déclaré, pas sur le signe du R", () => {
    // Un gagnant sorti en partiel à +0,2R reste un gagnant.
    const s = summarize([
      normalizeJournal({ entries: [entry({ outcome: "win", r: 0.2 })] }).entries[0],
      normalizeJournal({ entries: [entry({ outcome: "loss", r: -1 })] }).entries[0],
    ]);
    expect(s.winRate).toBe(50);
    expect(s.wins).toBe(1);
  });

  it("sort les scratchs du dénominateur sans les sortir du total", () => {
    const entries = normalizeJournal({
      entries: [
        entry({ date: "2026-01-01", outcome: "win" }),
        entry({ date: "2026-01-02", outcome: "be" }),
        entry({ date: "2026-01-03", outcome: "be" }),
      ],
    }).entries;
    const s = summarize(entries);
    expect(s.winRate).toBe(100);
    expect(s.count).toBe(3);
    expect(s.breakevens).toBe(2);
  });

  it("ne divise pas par zéro sur un journal vide", () => {
    expect(summarize([])).toMatchObject({ count: 0, winRate: 0, totalR: 0, avgR: 0 });
  });
});

describe("strategyStats()", () => {
  it("classe les stratégies par leur ID, pas par leur nom", () => {
    const entries = normalizeJournal({
      entries: [
        entry({ date: "2026-01-01", outcome: "win",  r: 3, strategyId: "s1" }),
        entry({ date: "2026-01-02", outcome: "loss", r: -1, strategyId: "s2" }),
      ],
    }).entries;
    expect(strategyStats(entries).map(s => s.tag)).toEqual(["s1", "s2"]);
  });

  it("laisse dehors les backtests sans stratégie", () => {
    const entries = normalizeJournal({
      entries: [entry({ strategyId: null }), entry({ date: "2026-01-02", strategyId: "" })],
    }).entries;
    expect(strategyStats(entries)).toEqual([]);
  });

  it("ramène l'ID à une chaîne — Supabase rend des uuid, le local des nombres", () => {
    const entries = normalizeJournal({ entries: [entry({ strategyId: 42 })] }).entries;
    expect(entries[0].strategyId).toBe("42");
  });
});

describe("tagStats()", () => {
  it("classe les confluences par ce qu'elles rapportent", () => {
    const entries = normalizeJournal({
      entries: [
        entry({ date: "2026-01-01", outcome: "win",  r: 3, confluences: ["Order block"] }),
        entry({ date: "2026-01-02", outcome: "loss", r: -1, confluences: ["Order block", "FOMO zone"] }),
        entry({ date: "2026-01-03", outcome: "loss", r: -1, confluences: ["FOMO zone"] }),
      ],
    }).entries;
    const stats = tagStats(entries, "confluences");
    expect(stats.map(s => s.tag)).toEqual(["Order block", "FOMO zone"]);
    expect(stats[0]).toMatchObject({ count: 2, wins: 1, losses: 1, winRate: 50, totalR: 2 });
    expect(stats[1].totalR).toBe(-2);
  });

  it("laisse un tag qui n'a que des scratchs à 0 % sans le dire perdant", () => {
    const entries = normalizeJournal({
      entries: [entry({ outcome: "be", confluences: ["Killzone"] })],
    }).entries;
    const [stat] = tagStats(entries, "confluences");
    expect(stat).toMatchObject({ count: 1, wins: 0, losses: 0, winRate: 0, totalR: 0 });
  });

  it("ignore les tags de l'autre catégorie", () => {
    const entries = normalizeJournal({
      entries: [entry({ confluences: ["Order block"], mistakes: ["FOMO"] })],
    }).entries;
    expect(tagStats(entries, "mistakes").map(s => s.tag)).toEqual(["FOMO"]);
  });
});

describe("sessions de backtest", () => {
  it("rend « sans session » un backtest dont la session a disparu", () => {
    const store = normalizeJournal({
      sessions: [{ id: "a", date: "2026-03-01" }],
      entries: [
        { id: "1", date: "2026-03-01", outcome: "win", sessionId: "a" },
        { id: "2", date: "2026-03-02", outcome: "win", sessionId: "fantome" },
      ],
    });
    expect(store.entries.find(e => e.id === "1")?.sessionId).toBe("a");
    expect(store.entries.find(e => e.id === "2")?.sessionId).toBeNull();
  });

  it("garde les anciens journaux, sans session, tels quels", () => {
    const store = normalizeJournal({ entries: [{ id: "1", date: "2026-01-01", outcome: "loss" }] });
    expect(store.sessions).toEqual([]);
    expect(store.entries[0].sessionId).toBeNull();
  });

  it("groupe par session, la plus récente d'abord, les orphelins à la fin", () => {
    const store = normalizeJournal({
      sessions: [{ id: "a", date: "2026-03-01" }, { id: "b", date: "2026-04-01" }],
      entries: [
        { id: "1", date: "2026-03-01", outcome: "win", sessionId: "a" },
        { id: "2", date: "2026-02-01", outcome: "win" },
      ],
    });
    const groups = groupBySession(store.entries, store.sessions);
    expect(groups.map(g => g.session?.id ?? null)).toEqual(["b", "a", null]);
    expect(groups[0].entries).toEqual([]);
  });

  it("marque où une session en remplace une autre sur la courbe", () => {
    const store = normalizeJournal({
      sessions: [{ id: "a", date: "2026-03-01" }, { id: "b", date: "2026-04-01" }],
      entries: [
        { id: "1", date: "2026-03-01", outcome: "win", sessionId: "a" },
        { id: "2", date: "2026-03-01", outcome: "win", sessionId: "a", createdAt: "2026-03-01T10:00:00Z" },
        { id: "3", date: "2026-04-01", outcome: "loss", sessionId: "b" },
      ],
    });
    const { points, breaks } = equityBySession(store.entries);
    expect(points.map(p => p.cum)).toEqual([1, 2, 1]);
    expect(breaks).toEqual([2]);
  });

  it("nomme une session sans nom par sa date", () => {
    expect(sessionLabel({ name: "", date: "2026-03-01" })).toMatch(/^Session du /);
    expect(sessionLabel({ name: "Test NY", date: "2026-03-01" })).toBe("Test NY");
  });
});

