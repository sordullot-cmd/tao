import { describe, it, expect } from "vitest";
import {
  bucketStats, valencesOf, directionOf, confluenceKey, payingConfluences,
} from "@/lib/tradeInsights";

const ORDERS = { entry: ["fvg", "ifvg", "ob"], liquidity: ["pdhpdl", "equalhl"] };

describe("bucketStats", () => {
  it("compte un trade dans chacun de ses groupes, une seule fois par groupe", () => {
    const trades = [
      { id: 1, pnl: 100, tags: ["a", "b", "a"] },
      { id: 2, pnl: -40, tags: ["a"] },
      { id: 3, pnl: 10, tags: [] },
    ];
    const [a, b] = bucketStats(trades, t => t.tags);
    expect(a).toMatchObject({ id: "a", count: 2, wins: 1, pnl: 60, winrate: 50, expectancy: 30 });
    expect(b).toMatchObject({ id: "b", count: 1, wins: 1, pnl: 100 });
  });

  it("suit l'ordre imposé et saute les groupes vides", () => {
    const trades = [{ pnl: 1, g: "C" }, { pnl: 1, g: "A" }];
    expect(bucketStats(trades, t => [t.g], ["A", "B", "C"]).map(b => b.id)).toEqual(["A", "C"]);
  });
});

describe("valencesOf", () => {
  it("range un trade aux émotions mêlées des deux côtés", () => {
    expect(valencesOf(["calm", "fomo"])).toEqual(["positive", "negative"]);
    expect(valencesOf(["followed"])).toEqual(["positive"]);
    expect(valencesOf(["earlyexit"])).toEqual(["negative"]);
    expect(valencesOf(undefined)).toEqual([]);
  });
});

describe("directionOf", () => {
  it("lit les variantes d'écriture des imports", () => {
    expect(directionOf({ pnl: 0, direction: "BUY" })).toBe("long");
    expect(directionOf({ pnl: 0, direction: "Short" })).toBe("short");
    expect(directionOf({ pnl: 0, direction: "" })).toBeNull();
  });
});

describe("confluenceKey", () => {
  it("ordonne par famille puis par liste, pas par ordre alphabétique", () => {
    expect(confluenceKey(["ob", "fvg"], ["pdhpdl"], "M5", ORDERS)).toBe("fvg|ob|pdhpdl|M5");
  });

  it("ne voit pas de confluence dans un tag isolé", () => {
    expect(confluenceKey(["fvg"], [], null, ORDERS)).toBeNull();
    expect(confluenceKey(["fvg"], [], "M1", ORDERS)).toBe("fvg|M1");
  });
});

describe("payingConfluences", () => {
  it("ne garde que les confluences gagnantes, la plus rentable en tête", () => {
    const b = (id: string, pnl: number, count = 1) => ({ id, pnl, count, wins: 0, winrate: 0, expectancy: 0 });
    const out = payingConfluences([b("x", -5), b("y", 50), b("z", 50, 3), b("w", 10)]);
    expect(out.map(r => r.id)).toEqual(["z", "y", "w"]);
  });
});
