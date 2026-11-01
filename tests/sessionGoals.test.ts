import { describe, it, expect } from "vitest";
import { GOAL_TYPES, evaluateGoal, goalProgress, measure, validValue, type GoalType } from "@/lib/sessionGoals";

/* Une séance type : deux pertes d'affilée, puis un gros gagnant. Le creux est
   à -250, le plus haut à +150 (clôture). */
const day = [
  { id: "1", symbol: "NQ", pnl: -100, quantity: 1, entryTime: "09:35", exitTime: "09:40" },
  { id: "2", symbol: "NQ", pnl: -150, quantity: 2, entryTime: "09:48", exitTime: "09:55" },
  { id: "3", symbol: "ES", pnl: 400,  quantity: 1, entryTime: "11:45", exitTime: "12:10" },
];
const goal = (type: GoalType, value: number) => ({ id: type, type, value });

describe("objectifs lus dans les trades", () => {
  it("mesure chaque métrique sans planter, même sur une journée vide", () => {
    for (const type of GOAL_TYPES) {
      expect(() => evaluateGoal(goal(type, 1), day)).not.toThrow();
      expect(() => evaluateGoal(goal(type, 1), [])).not.toThrow();
    }
  });

  it("tient un plafond tant qu'il n'est pas franchi", () => {
    expect(evaluateGoal(goal("max_trades", 3), day).status).toBe("met");
    expect(evaluateGoal(goal("max_trades", 2), day).status).toBe("missed");
    expect(evaluateGoal(goal("max_consecutive_losses", 1), day)).toMatchObject({ actual: 2, status: "missed" });
    expect(evaluateGoal(goal("max_contracts", 1), day)).toMatchObject({ actual: 2, status: "missed" });
    expect(evaluateGoal(goal("max_symbols", 2), day).status).toBe("met");
  });

  it("juge la perte max au pire moment de la séance, pas à la clôture", () => {
    expect(evaluateGoal(goal("max_loss", 200), day)).toMatchObject({ actual: 250, status: "missed" });
    expect(evaluateGoal(goal("max_loss", 300), day).status).toBe("met");
    expect(measure("max_loss_per_trade", day)).toBe(150);
  });

  it("mesure le gain rendu depuis le plus haut du jour", () => {
    const fade = [{ pnl: 300 }, { pnl: -200 }, { pnl: 50 }];
    expect(measure("max_giveback", fade)).toBe(200);
  });

  it("lit les horaires comme des bornes, et la pause comme un plancher", () => {
    expect(evaluateGoal(goal("latest_entry", 11 * 60 + 30), day).status).toBe("missed");
    expect(evaluateGoal(goal("earliest_entry", 9 * 60 + 30), day).status).toBe("met");
    expect(evaluateGoal(goal("earliest_entry", 9 * 60 + 40), day).status).toBe("missed");
    // 8 min entre la sortie perdante de 09:40 et la reprise de 09:48.
    expect(evaluateGoal(goal("min_cooldown_after_loss", 15), day)).toMatchObject({ actual: 8, status: "missed" });
  });

  it("laisse une cible en cours tant qu'elle n'est pas atteinte", () => {
    expect(evaluateGoal(goal("profit_target", 300), day).status).toBe("pending");
    expect(evaluateGoal(goal("profit_target", 100), day).status).toBe("met");
    expect(evaluateGoal(goal("min_win_rate", 50), []).status).toBe("pending");
    expect(measure("min_profit_factor", day)).toBeCloseTo(1.6);
    expect(measure("min_payoff", day)).toBeCloseTo(400 / 125);
  });

  it("compte les objectifs tenus", () => {
    expect(goalProgress([goal("max_trades", 3), goal("profit_target", 300)], day)).toMatchObject({ done: 1, total: 2 });
  });
});

describe("période des objectifs", () => {
  it("ne note que les objectifs du jour", () => {
    const week = { id: "w", type: "profit_target" as GoalType, value: 2000, period: "week" as const };
    expect(goalProgress([goal("max_trades", 3), week], day)).toMatchObject({ done: 1, total: 1 });
  });
});

describe("comparaison choisie", () => {
  const withOp = (type: GoalType, op: "gte" | "lte" | "eq", value: number) => ({ id: type, type, value, op });

  it("dit perdu ce qui ne peut plus revenir, en cours ce qui le peut encore", () => {
    // Trois trades : « ≥ 5 » peut encore arriver, « ≤ 2 » est perdu pour de bon.
    expect(evaluateGoal(withOp("max_trades", "gte", 5), day).status).toBe("pending");
    expect(evaluateGoal(withOp("max_trades", "lte", 2), day)).toMatchObject({ status: "missed", settled: true });
    // Un P&L sous la barre peut remonter : jamais perdu avant la clôture.
    expect(evaluateGoal(withOp("profit_target", "lte", 100), day).status).toBe("pending");
  });

  it("tient « dans les clous » un plafond encore exposé, et « atteint » une cible qui ne peut plus reculer", () => {
    expect(evaluateGoal(withOp("max_trades", "lte", 3), day)).toMatchObject({ status: "met", settled: false });
    expect(evaluateGoal(withOp("max_trades", "gte", 3), day)).toMatchObject({ status: "met", settled: true });
  });

  it("accepte une égalité au demi-centime près, et la perd une fois dépassée", () => {
    expect(evaluateGoal(withOp("profit_target", "eq", 150.004), day).status).toBe("met");
    expect(evaluateGoal(withOp("max_trades", "eq", 2), day).status).toBe("missed");
    expect(evaluateGoal(withOp("max_trades", "eq", 4), day).status).toBe("pending");
  });
});

describe("seuils négatifs", () => {
  it("les accepte pour un P&L ou un R, pas pour un compte de trades", () => {
    expect(validValue("profit_target", -200)).toBe(true);
    expect(validValue("min_total_r", -1)).toBe(true);
    expect(validValue("max_trades", -1)).toBe(false);
    expect(evaluateGoal({ id: "p", type: "profit_target", value: -200 }, day).status).toBe("met");
  });
});
