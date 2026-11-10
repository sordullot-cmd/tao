import { describe, it, expect } from "vitest";
import { applyNetPnl, toStoredTrade } from "@/lib/tradeFees";

describe("toStoredTrade", () => {
  it("remet le brut dans pnl : un trade restauré ne perd pas ses frais deux fois", () => {
    const stored = { symbol: "MNQ", quantity: 20, pnl: 250, fees: 26.4 };
    const shown = applyNetPnl(stored);
    expect(shown.pnl).toBeCloseTo(223.6);

    const rewritten = toStoredTrade(shown);
    expect(rewritten.pnl).toBe(250);
    expect("pnlGross" in rewritten).toBe(false);
    // Relu après réinsertion : le même net qu'avant la suppression.
    expect(applyNetPnl(rewritten).pnl).toBeCloseTo(223.6);
  });

  it("garde les frais réels plutôt que de laisser revenir le barème", () => {
    const shown = applyNetPnl({ symbol: "NQ", quantity: 2, pnl: 290, fees: 9.56 });
    expect(toStoredTrade(shown).fees).toBe(9.56);
  });

  it("laisse intact un trade brut qui n'a jamais été normalisé", () => {
    const raw = { symbol: "MNQ", pnl: -53.5, fees: 1.32 };
    expect(toStoredTrade(raw)).toEqual(raw);
  });
});
