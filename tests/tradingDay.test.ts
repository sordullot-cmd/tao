import { describe, it, expect } from "vitest";
import {
  appliedGoalSets,
  applyGoalSet,
  dayEntry,
  daySummary,
  executionIds,
  isTradeRecapped,
  mergeExecutions,
  normalizeTradingDayStore,
  perAccount,
  addPremarketItem,
  premarketProgress,
  removeGoalSet,
  reopenDay,
  saveGoalSet,
  signOffDay,
  taskListIds,
  togglePremarket,
  applyTaskList,
  unapplyTaskList,
  setGrade,
  setMood,
  tradesOfDay,
  unapplyGoalSet,
} from "@/lib/tradingDay";
import { DEFAULT_GOAL_SET } from "@/lib/sessionGoals";

const DAY = "2026-10-27";

describe("magasin de la journée de trading", () => {
  it("part du set de départ tant que rien n'a été écrit", () => {
    const st = normalizeTradingDayStore(null);
    expect(st.goalSets).toEqual([DEFAULT_GOAL_SET]);
    expect(appliedGoalSets(st)).toEqual([DEFAULT_GOAL_SET]);
  });

  it("écarte un objectif illisible au lieu de le réparer", () => {
    const st = normalizeTradingDayStore({ goalSets: [{ id: "s", name: "Prop", goals: [
      { id: "a", type: "max_trades", value: 3 },
      { id: "b", label: "Phrase à cocher d'avant" },
      { id: "c", type: "max_trades", value: -1 },
      { id: "d", type: "latest_entry", value: 24 * 60 },
    ] }] });
    expect(appliedGoalSets(st)[0].goals.map(g => g.id)).toEqual(["a"]);
  });

  it("écarte une humeur ou une note inconnue au lieu de la garder", () => {
    const st = normalizeTradingDayStore({ days: { [DAY]: { mood: "euphorique", grade: "Z" } } });
    expect(dayEntry(st, DAY)).toEqual({ mood: null, grade: null, premarket: {}, signedOff: null });
  });

  it("retire l'humeur au second clic, et la note avec « non noté »", () => {
    let st = normalizeTradingDayStore(null);
    st = setMood(st, DAY, "calm");
    expect(dayEntry(st, DAY).mood).toBe("calm");
    st = setMood(st, DAY, "calm");
    expect(dayEntry(st, DAY).mood).toBeNull();
    st = setGrade(setGrade(st, DAY, "B"), DAY, "A");
    expect(dayEntry(st, DAY).grade).toBe("A");
    expect(dayEntry(setGrade(st, DAY, null), DAY).grade).toBeNull();
  });
});

describe("pré-market, tâches et clôture", () => {
  it("compte les vérifications du jour sur la liste actuelle", () => {
    let st = addPremarketItem(normalizeTradingDayStore(null), "Biais H4 posé");
    st = togglePremarket(st, DAY, st.premarketItems[0].id);
    expect(premarketProgress(st, DAY)).toEqual({ done: 1, total: 3 });
    // Une liste vidée à la main reste vide.
    expect(normalizeTradingDayStore({ premarketItems: [] }).premarketItems).toEqual([]);
  });

  it("prend la liste active de Discipline tant qu'on n'a pas choisi, et ignore les listes disparues", () => {
    const st = normalizeTradingDayStore(null);
    expect(taskListIds(st, ["a", "b"], "b")).toEqual(["b"]);
    const two = applyTaskList(st, ["b"], "a");
    expect(taskListIds(two, ["a", "b"], "b")).toEqual(["b", "a"]);
    expect(taskListIds(two, ["a"], "b")).toEqual(["a"]);
    expect(taskListIds(unapplyTaskList(two, ["b", "a"], "b"), ["a", "b"], "b")).toEqual(["a"]);
  });

  it("clôture la journée avec sa phrase, et la rouvre", () => {
    const at = new Date("2026-10-27T17:42:00");
    let st = signOffDay(normalizeTradingDayStore(null), DAY, "  Patience payée  ", at);
    expect(dayEntry(st, DAY).signedOff).toEqual({ at: at.toISOString(), line: "Patience payée" });
    st = reopenDay(st, DAY);
    expect(dayEntry(st, DAY).signedOff).toBeNull();
  });
});

describe("sets d'objectifs", () => {
  const base = () => normalizeTradingDayStore(null);

  it("ajoute à la séance le set qu'on vient de créer", () => {
    const st = saveGoalSet(base(), { name: " Prop firm ", goals: [{ id: "g1", type: "max_loss", value: 500 }] });
    expect(appliedGoalSets(st).map(gs => gs.name)).toEqual(["Mon plan", "Prop firm"]);
  });

  it("modifie un set existant sans en créer un second", () => {
    const st = saveGoalSet(base(), { id: DEFAULT_GOAL_SET.id, name: "Plan A", goals: [] });
    expect(st.goalSets).toHaveLength(1);
    expect(st.goalSets[0]).toMatchObject({ name: "Plan A", goals: [] });
  });

  it("retire un set de la séance sans le supprimer, et le rajoute une seule fois", () => {
    let st = unapplyGoalSet(base(), DEFAULT_GOAL_SET.id);
    expect(appliedGoalSets(st)).toEqual([]);
    expect(st.goalSets).toHaveLength(1);
    st = applyGoalSet(applyGoalSet(st, DEFAULT_GOAL_SET.id), DEFAULT_GOAL_SET.id);
    expect(st.appliedSetIds).toEqual([DEFAULT_GOAL_SET.id]);
  });

  it("supprime un set et le retire de la séance", () => {
    const st = removeGoalSet(base(), DEFAULT_GOAL_SET.id);
    expect(st).toMatchObject({ goalSets: [], appliedSetIds: [] });
    // Une liste vidée à la main reste vide : le set de départ ne revient pas.
    expect(normalizeTradingDayStore(st).goalSets).toEqual([]);
  });

  it("reprend l'ancien set actif unique comme set ajouté", () => {
    const st = normalizeTradingDayStore({ goalSets: [DEFAULT_GOAL_SET, { id: "b", name: "B", goals: [] }], activeSetId: "b" });
    expect(st.appliedSetIds).toEqual(["b"]);
  });
});

describe("trades du jour", () => {
  const trades = [
    { id: "b", date: `${DAY}T00:00:00`, entryTime: "10:15", pnl: -50 },
    { id: "a", date: DAY, entryTime: "09:31", pnl: 120 },
    { id: "c", date: "2026-10-26", entryTime: "09:00", pnl: 999 },
  ];

  it("ne garde que la journée, dans l'ordre de prise", () => {
    expect(tradesOfDay(trades, DAY).map(t => t.id)).toEqual(["a", "b"]);
  });

  it("résume la journée et trace le P&L cumulé", () => {
    const s = daySummary(tradesOfDay(trades, DAY));
    expect(s).toMatchObject({ count: 2, wins: 1, net: 70, winRate: 50 });
    expect(s.curve).toEqual([120, 70]);
  });

  it("tient pour recappé un trade noté, passé par la checklist ou tagué", () => {
    expect(isTradeRecapped({ id: "a" }, {})).toBe(false);
    expect(isTradeRecapped({ id: "a" }, { notes: { a: "  " } })).toBe(false);
    expect(isTradeRecapped({ id: "a" }, { notes: { a: "Entrée trop tôt" } })).toBe(true);
    expect(isTradeRecapped({ id: "a" }, { checklist: { a: { plan: "no" } } })).toBe(true);
    expect(isTradeRecapped({ id: "b" }, { emotions: { b: ["calm"] } })).toBe(true);
  });

  it("fusionne un même ordre passé sur plusieurs comptes en une ligne", () => {
    const copies = [
      { id: "x1", date: DAY, symbol: "NQ", direction: "long", entry: 21000, entryTime: "09:31:00", account_id: "A", pnl: 100, quantity: 1 },
      { id: "x2", date: DAY, symbol: "NQ", direction: "long", entry: 21000, entryTime: "09:31:20", account_id: "B", pnl: 90, quantity: 1 },
      { id: "y",  date: DAY, symbol: "ES", direction: "short", entry: 5800, entryTime: "10:00:00", account_id: "A", pnl: -40 },
    ];
    const rows = mergeExecutions(copies);
    expect(rows).toHaveLength(2);
    const nq = rows.find(r => r.symbol === "NQ")!;
    expect(nq.pnl).toBe(190);
    expect(nq.quantity).toBe(2);
    expect(executionIds(nq)).toEqual(["x1", "x2"]);
    // Un recap posé sur une seule exécution suffit à la ligne.
    expect(isTradeRecapped(nq, { notes: { x2: "ok" } })).toBe(true);
  });
});

describe("objectifs vus depuis un compte", () => {
  it("garde l'exécution d'accueil d'une ligne fusionnée", () => {
    const rows = mergeExecutions([
      { id: "a", date: DAY, symbol: "NQ", direction: "long", entry: 1, entryTime: "09:30:00", account_id: "A", pnl: 100 },
      { id: "b", date: DAY, symbol: "NQ", direction: "long", entry: 1, entryTime: "09:30:05", account_id: "B", pnl: 90 },
    ]);
    expect(rows[0].pnl).toBe(190);
    expect(perAccount(rows)).toEqual([expect.objectContaining({ id: "a", pnl: 100 })]);
  });
});
