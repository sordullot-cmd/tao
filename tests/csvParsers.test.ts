import { describe, it, expect } from "vitest";
import {
  detectContractType,
  getContractMultiplier,
  calculateStats,
  parseCSV,
} from "@/lib/csvParsers";
import type { ParsedTrade } from "@/lib/types/trade";

describe("detectContractType()", () => {
  it("returns 'micro' for MNQ/MES/MYM/M2K", () => {
    expect(detectContractType("MNQ")).toBe("micro");
    expect(detectContractType("MES")).toBe("micro");
    expect(detectContractType("MYMU5")).toBe("micro");
    expect(detectContractType("M2K")).toBe("micro");
  });

  it("returns 'mini' for NQ/ES/YM", () => {
    expect(detectContractType("NQ")).toBe("mini");
    expect(detectContractType("ES")).toBe("mini");
    expect(detectContractType("YMZ5")).toBe("mini");
  });

  it("returns 'standard' for unknown symbols", () => {
    expect(detectContractType("XYZ")).toBe("standard");
    expect(detectContractType("EURUSD")).toBe("standard");
  });

  it("returns 'standard' for empty input", () => {
    expect(detectContractType("")).toBe("standard");
    expect(detectContractType(null)).toBe("standard");
    expect(detectContractType(undefined)).toBe("standard");
  });

  it("uses Tradovate Product hint when present", () => {
    expect(detectContractType("XYZ", "E-Micro NASDAQ")).toBe("micro");
    expect(detectContractType("XYZ", "E-Mini S&P")).toBe("mini");
  });
});

describe("getContractMultiplier()", () => {
  it("returns correct multiplier for major futures", () => {
    expect(getContractMultiplier("ES")).toBe(50);  // E-Mini S&P
    expect(getContractMultiplier("NQ")).toBe(20);  // E-Mini NASDAQ
    expect(getContractMultiplier("MES")).toBe(5);  // Micro S&P
    expect(getContractMultiplier("MNQ")).toBe(2);  // Micro NASDAQ
    expect(getContractMultiplier("GC")).toBe(100); // Gold
    expect(getContractMultiplier("CL")).toBe(1000); // Crude Oil
  });

  it("returns 1 for unknown symbols", () => {
    expect(getContractMultiplier("XYZ")).toBe(1);
  });

  it("returns 1 for null/undefined input", () => {
    expect(getContractMultiplier(null)).toBe(1);
    expect(getContractMultiplier(undefined)).toBe(1);
  });

  it("strips quarterly suffix (M6, U5, Z4, H7)", () => {
    expect(getContractMultiplier("ESM6")).toBe(50);
    expect(getContractMultiplier("NQU5")).toBe(20);
  });

  it("Tradovate Product 'E-Micro' downsizes the multiplier", () => {
    // ES base = 50 normally, but with E-Micro hint should fall to micro tier (5)
    expect(getContractMultiplier("ES", "E-Micro S&P")).toBe(5);
    expect(getContractMultiplier("NQ", "E-Micro NASDAQ")).toBe(2);
  });
});

describe("calculateStats()", () => {
  it("returns zeroed stats for empty input", () => {
    const s = calculateStats([]);
    expect(s.totalTrades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.totalPnL).toBe(0);
    expect(s.profitFactor).toBe(0);
  });

  it("computes basic stats for a winning + losing mix", () => {
    const trades: ParsedTrade[] = [
      { date: "2026-01-01", symbol: "ES", entry: 5000, exit: 5010, pnl: 100 },
      { date: "2026-01-02", symbol: "ES", entry: 5000, exit: 5005, pnl: 50 },
      { date: "2026-01-03", symbol: "ES", entry: 5000, exit: 4990, pnl: -50 },
    ];
    const s = calculateStats(trades);
    expect(s.totalTrades).toBe(3);
    expect(s.winningTrades).toBe(2);
    expect(s.losingTrades).toBe(1);
    expect(s.winRate).toBe(67);                          // 2/3 rounded
    expect(s.totalPnL).toBe(100);
    expect(s.avgWin).toBe(75);                           // (100+50)/2
    expect(s.avgLoss).toBe(50);                          // |−50|
    expect(s.profitFactor).toBe(3);                      // 150 / 50
  });

  it("returns 999 profit factor when no losses", () => {
    const trades: ParsedTrade[] = [
      { date: "2026-01-01", symbol: "ES", entry: 100, exit: 110, pnl: 10 },
    ];
    const s = calculateStats(trades);
    expect(s.profitFactor).toBe(999);
  });

  it("computes max drawdown from cumulative equity curve", () => {
    const trades: ParsedTrade[] = [
      { date: "2026-01-01", symbol: "ES", entry: 0, exit: 0, pnl: 100 },  // peak: 100
      { date: "2026-01-02", symbol: "ES", entry: 0, exit: 0, pnl: -40 },  // dd: 40
      { date: "2026-01-03", symbol: "ES", entry: 0, exit: 0, pnl: -30 },  // dd: 70
      { date: "2026-01-04", symbol: "ES", entry: 0, exit: 0, pnl: 50 },   // recover
    ];
    const s = calculateStats(trades);
    expect(s.maxDrawdown).toBe(70);
  });
});

describe("parseGenericCSV() — colonnes facultatives", () => {
  const csv = (rows: string) =>
    "Date,Symbol,Direction,Entry,Exit,PnL,Entry Time,Exit Time,Quantity,Volume\n" + rows;

  it("retient l'heure, la quantité et le notionnel quand les colonnes existent", () => {
    const [tr] = parseCSV(csv("2026-09-01,MNQ,Long,29523.25,29508,-31.82,00:00:11,00:01:01,2,59046.50\n"), null);
    expect(tr.entryTime).toBe("00:00:11");
    expect(tr.exitTime).toBe("00:01:01");
    expect(tr.quantity).toBe(2);
    expect(tr.volume).toBe(59046.5);
  });

  it("lit « Entry Time » sans la confondre avec le prix d'entrée", () => {
    const [tr] = parseCSV(csv("2026-09-01,MNQ,Long,29523.25,29508,-31.82,00:00:11,00:01:01,1,0\n"), null);
    expect(tr.entry).toBe(29523.25);
  });

  it("ramène une heure AM/PM sur 24 h mais laisse un export déjà en 24 h", () => {
    const [nuit] = parseCSV(csv("2026-09-01,MNQ,Long,1,2,10,12:03:43.25 AM,01:04:07 PM,1,0\n"), null);
    expect(nuit.entryTime).toBe("00:03:43");
    expect(nuit.exitTime).toBe("13:04:07");
    const [jour] = parseCSV(csv("2026-09-01,MNQ,Long,1,2,10,14:30:00,15:45:10,1,0\n"), null);
    expect(jour.entryTime).toBe("14:30:00");
  });

  it("omet les champs dont la colonne manque plutôt que d'inventer une valeur", () => {
    const [tr] = parseCSV("Date,Symbol,Direction,Entry,Exit,PnL\n2026-09-01,MNQ,Long,1,2,10\n", null);
    expect(tr.entryTime).toBeUndefined();
    expect(tr.volume).toBeUndefined();
    expect(tr.quantity).toBe(1);
  });
});
