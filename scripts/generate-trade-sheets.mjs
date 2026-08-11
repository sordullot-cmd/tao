#!/usr/bin/env node
/**
 * Génère 3 feuilles de trades distinctes sur 4 mois (jours ouvrés uniquement).
 *
 * Format de sortie : Date,Symbol,Direction,Entry,Exit,PnL
 * -> compatible parseGenericCSV() de lib/csvParsers.ts
 *
 * Le PnL écrit est le BRUT : (exit - entry) * multiplicateur * sens.
 * L'app dérive le net via lib/tradeFees.ts (0,91 $/côté micro, 2,88 $/côté mini).
 *
 * Usage : node scripts/generate-trade-sheets.mjs [--end 2026-08-11] [--out .]
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

// --- PRNG déterministe (mulberry32) : mêmes fichiers à chaque exécution -----
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- Instruments : multiplicateur aligné sur getContractMultiplier() --------
const INSTRUMENTS = {
  MNQ: { mult: 2, tick: 0.25, base: 19500, vol: 120 },
  MES: { mult: 5, tick: 0.25, base: 5350, vol: 30 },
  MYM: { mult: 0.5, tick: 1, base: 39800, vol: 180 },
  M2K: { mult: 0.2, tick: 0.1, base: 2180, vol: 14 },
  NQ: { mult: 20, tick: 0.25, base: 19500, vol: 120 },
  ES: { mult: 50, tick: 0.25, base: 5350, vol: 30 },
  GC: { mult: 100, tick: 0.1, base: 2380, vol: 18 },
  CL: { mult: 1000, tick: 0.01, base: 74.5, vol: 0.9 },
};

const DEC = { 0.25: 2, 1: 2, 0.1: 2, 0.01: 2 };

// --- Profils ----------------------------------------------------------------
const PROFILES = [
  {
    file: "trades_scalper_micro.csv",
    label: "Scalper micros — régulier, légèrement profitable",
    seed: 1337,
    symbols: ["MNQ", "MNQ", "MNQ", "MES", "MES", "MYM"],
    tradesPerDay: [3, 9],
    tradingDayRate: 0.92,
    winRate: 0.58,
    win: [30, 150], // gain brut en $
    loss: [30, 140],
    // dérive lente du winrate : mise en route difficile, progression sur la fin
    drift: (p) => -0.07 + 0.14 * p,
  },
  {
    file: "trades_swing_mini.csv",
    label: "Swing minis — peu de trades, R:R élevé, très volatil",
    seed: 90210,
    symbols: ["ES", "NQ", "NQ", "GC", "CL"],
    tradesPerDay: [1, 3],
    tradingDayRate: 0.68,
    winRate: 0.43,
    win: [350, 2000],
    loss: [280, 900],
    // drawdown marqué au milieu de la période, reprise ensuite
    drift: (p) => (p < 0.35 ? 0.06 : p < 0.62 ? -0.18 : 0.1),
  },
  {
    file: "trades_overtrading_loss.csv",
    label: "Overtrading / revenge trading — perdant sur la période",
    seed: 4242,
    symbols: ["MNQ", "MNQ", "MNQ", "MNQ", "M2K", "MES"],
    tradesPerDay: [4, 12],
    tradingDayRate: 0.97,
    winRate: 0.44,
    win: [25, 110],
    loss: [40, 140],
    drift: (p) => 0.04 - 0.12 * p,
  },
];

// --- Dates : 4 mois de jours ouvrés ----------------------------------------
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const endDate = new Date(`${arg("end", "2026-08-11")}T00:00:00Z`);
const startDate = new Date(endDate);
startDate.setUTCMonth(startDate.getUTCMonth() - 4);

const businessDays = [];
for (const d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
  const dow = d.getUTCDay();
  if (dow !== 0 && dow !== 6) businessDays.push(d.toISOString().slice(0, 10));
}

// --- Génération -------------------------------------------------------------
const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const roundTick = (v, tick) => Math.round(v / tick) * tick;

const generate = (profile) => {
  const r = rng(profile.seed);
  const rows = [];
  // niveau courant par instrument (marche aléatoire jour après jour)
  const level = {};
  for (const s of new Set(profile.symbols)) level[s] = INSTRUMENTS[s].base;

  businessDays.forEach((date, dayIdx) => {
    const progress = dayIdx / (businessDays.length - 1);

    // dérive quotidienne des prix
    for (const s of Object.keys(level)) {
      const inst = INSTRUMENTS[s];
      level[s] = Math.max(inst.base * 0.75, level[s] + (r() - 0.45) * inst.vol);
    }

    if (r() > profile.tradingDayRate) return; // jour sans trade

    const [lo, hi] = profile.tradesPerDay;
    let n = Math.round(between(r, [lo, hi]));
    // journée de tilt : rafale de trades après une série perdante
    if (r() < 0.08) n = Math.round(n * 1.8);

    let dayLosses = 0;
    for (let i = 0; i < n; i++) {
      const symbol = profile.symbols[Math.floor(r() * profile.symbols.length)];
      const inst = INSTRUMENTS[symbol];
      const direction = r() < 0.52 ? "Long" : "Short";
      const sign = direction === "Long" ? 1 : -1;

      // le tilt dégrade le winrate en cours de journée
      const tilt = dayLosses >= 3 ? 0.08 : 0;
      const wr = profile.winRate + profile.drift(progress) - tilt;
      const isWin = r() < Math.min(0.85, Math.max(0.1, wr));

      // montant brut visé, puis conversion en points arrondis au tick
      const target = between(r, isWin ? profile.win : profile.loss) * (isWin ? 1 : -1);
      let points = roundTick(target / inst.mult, inst.tick);
      if (points === 0) points = inst.tick * (isWin ? 1 : -1);

      const entry = roundTick(level[symbol] + (r() - 0.5) * inst.vol * 0.6, inst.tick);
      const exit = roundTick(entry + points * sign, inst.tick);
      const pnl = (exit - entry) * inst.mult * sign;

      if (pnl < 0) dayLosses++;

      const d = DEC[inst.tick];
      rows.push(
        [date, symbol, direction, entry.toFixed(d), exit.toFixed(d), pnl.toFixed(2).replace(/\.00$/, "")].join(",")
      );
    }
  });

  return rows;
};

const outDir = arg("out", process.cwd());

for (const profile of PROFILES) {
  const rows = generate(profile);
  const csv = ["Date,Symbol,Direction,Entry,Exit,PnL", ...rows].join("\n") + "\n";
  writeFileSync(join(outDir, profile.file), csv, "utf8");

  const pnls = rows.map((l) => parseFloat(l.split(",")[5]));
  const gross = pnls.reduce((a, b) => a + b, 0);
  const wins = pnls.filter((p) => p > 0).length;
  const fees = rows.reduce((a, l) => {
    const sym = l.split(",")[1];
    return a + (sym.startsWith("M") ? 1.82 : 5.76);
  }, 0);
  const days = new Set(rows.map((l) => l.split(",")[0])).size;

  console.log(
    `${profile.file.padEnd(30)} ${String(rows.length).padStart(4)} trades / ${days} j — ` +
      `WR ${((wins / rows.length) * 100).toFixed(1)}% — ` +
      `brut ${gross.toFixed(2)} $ — frais ${fees.toFixed(2)} $ — net ${(gross - fees).toFixed(2)} $`
  );
}

console.log(`\nPériode : ${businessDays[0]} → ${businessDays[businessDays.length - 1]} (${businessDays.length} jours ouvrés)`);
