import { describe, it, expect } from "vitest";
import { computeGoalProgress } from "@/components/pages/GoalsPage";

/* Un compte en échec ne compte plus pour aucun objectif. */
const today = new Date().toISOString().slice(0, 10);
const accounts = [
  { id: "ok", account_type: "funded" },
  { id: "ko", account_type: "failed" },
];
const trades = [
  { id: "1", account_id: "ok", date: today, pnl: 500 },
  { id: "2", account_id: "ko", date: today, pnl: 900 },
];

describe("objectifs et comptes en échec", () => {
  it("ne compte pas les trades d'un compte en échec", () => {
    const g = { id: "g", autoType: "trades", target: "10", accountIdFilter: "all" };
    expect(computeGoalProgress(g, trades, accounts).current).toBe(1);
  });

  it("retombe à zéro pour un objectif rattaché au compte tombé", () => {
    const g = { id: "g", autoType: "trades", target: "10", accountIdFilter: "ko" };
    expect(computeGoalProgress(g, trades, accounts).current).toBe(0);
  });
});
