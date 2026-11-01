/**
 * Objectifs de séance — des MÉTRIQUES de trading et un seuil, comme les règles
 * de la page Discipline (`lib/compliance`), et non des phrases à cocher. Une
 * case qu'on coche soi-même le soir se coche toujours ; un plafond de trades se
 * lit dans les trades, il ne se négocie pas.
 *
 * Les objectifs vivent en SETS nommés (« Prop firm », « Scalp NY »…), dont un
 * actif — même idée que les listes de routine par stratégie : on ne trade pas
 * un compte financé avec les objectifs d'un compte perso.
 *
 * Deux familles, qui ne se lisent pas pareil pendant la séance :
 *   • les PLAFONDS sont tenus tant qu'on ne les franchit pas — vrais dès le
 *     matin, perdus au premier dépassement ;
 *   • les CIBLES restent « en cours » tant qu'elles ne sont pas atteintes —
 *     rien n'est raté avant la clôture.
 */

import { rMultiple } from "@/lib/userPrefs";
import { calculateFees } from "@/lib/tradeFees";

export type GoalUnit = "count" | "money" | "percent" | "ratio" | "r" | "time" | "minutes";
export type GoalGroup = "risk" | "volume" | "timing" | "performance";

/* Le sens dans lequel une mesure peut encore bouger d'ici la clôture. C'est ce
   qui dit si un objectif non tenu est PERDU ou seulement en cours : un nombre
   de trades ne redescend jamais, un P&L si. */
type Trend = "up" | "down" | "free";

interface MetricDef {
  group: GoalGroup;
  unit: GoalUnit;
  trend: Trend;
  /** Comparaison proposée à la création : « au plus » pour un plafond, « au moins » pour une cible. */
  op: GoalOp;
  /** Seuil proposé à la création — un point de départ, pas une recommandation. */
  suggested: number;
  /** Le seuil peut être négatif : « P&L net ≥ -200 », « R total ≥ -1 ». */
  signed?: boolean;
}

/** Plus que (≥), moins que (≤), égal à (=). */
export const GOAL_OPS = ["gte", "lte", "eq"] as const;
export type GoalOp = typeof GOAL_OPS[number];
export const OP_SYMBOL: Record<GoalOp, string> = { gte: "≥", lte: "≤", eq: "=" };

/* L'ordre est celui du sélecteur : par famille, du plus courant au plus fin. */
export const GOAL_METRICS = {
  // Risque — ce qui coule un compte.
  max_loss:               { group: "risk",        unit: "money",   trend: "up",   op: "lte", suggested: 500 },
  max_loss_per_trade:     { group: "risk",        unit: "money",   trend: "up",   op: "lte", suggested: 200 },
  max_giveback:           { group: "risk",        unit: "money",   trend: "up",   op: "lte", suggested: 300 },
  max_consecutive_losses: { group: "risk",        unit: "count",   trend: "up",   op: "lte", suggested: 2 },
  max_losing_trades:      { group: "risk",        unit: "count",   trend: "up",   op: "lte", suggested: 3 },
  max_contracts:          { group: "risk",        unit: "count",   trend: "up",   op: "lte", suggested: 2 },
  // Volume — ce qui trahit le surtrading.
  max_trades:             { group: "volume",      unit: "count",   trend: "up",   op: "lte", suggested: 3 },
  max_symbols:            { group: "volume",      unit: "count",   trend: "up",   op: "lte", suggested: 1 },
  max_fees:               { group: "volume",      unit: "money",   trend: "up",   op: "lte", suggested: 50 },
  // Horaires — quand on a le droit d'appuyer. La première entrée ne peut que
  // reculer, la dernière qu'avancer, la pause la plus courte que raccourcir.
  earliest_entry:         { group: "timing",      unit: "time",    trend: "down", op: "gte", suggested: 9 * 60 + 30 },
  latest_entry:           { group: "timing",      unit: "time",    trend: "up",   op: "lte", suggested: 11 * 60 + 30 },
  min_cooldown_after_loss:{ group: "timing",      unit: "minutes", trend: "down", op: "gte", suggested: 15 },
  // Performance — ce qu'on vient chercher.
  profit_target:          { group: "performance", unit: "money",   trend: "free", op: "gte", suggested: 300, signed: true },
  min_win_rate:           { group: "performance", unit: "percent", trend: "free", op: "gte", suggested: 50 },
  min_profit_factor:      { group: "performance", unit: "ratio",   trend: "free", op: "gte", suggested: 1.5 },
  min_payoff:             { group: "performance", unit: "ratio",   trend: "free", op: "gte", suggested: 1.5 },
  min_total_r:            { group: "performance", unit: "r",       trend: "free", op: "gte", suggested: 2, signed: true },
  min_avg_r:              { group: "performance", unit: "r",       trend: "free", op: "gte", suggested: 1, signed: true },
} satisfies Record<string, MetricDef>;

export type GoalType = keyof typeof GOAL_METRICS;
export const GOAL_TYPES = Object.keys(GOAL_METRICS) as GoalType[];
export const GOAL_GROUPS: GoalGroup[] = ["risk", "volume", "timing", "performance"];
export const metricOf = (type: GoalType): MetricDef => GOAL_METRICS[type];
export const isGoalType = (v: unknown): v is GoalType => typeof v === "string" && v in GOAL_METRICS;

/* La période d'un objectif. Une journée ne dit rien d'un objectif de semaine :
   « +2 000 cette semaine » n'est ni tenu ni raté un mardi à 11 h. Ceux-là sont
   listés pour mémoire, pas notés — les juger sur le jour donnerait un rouge
   permanent qui ne veut rien dire. */
export const GOAL_PERIODS = ["day", "week", "month"] as const;
export type GoalPeriod = typeof GOAL_PERIODS[number];

export interface SessionGoal {
  id: string;
  type: GoalType;
  value: number;
  /** Absent : la comparaison proposée par la métrique (cf. `GOAL_METRICS`). */
  op?: GoalOp;
  period?: GoalPeriod;
}

export const periodOf = (g: SessionGoal): GoalPeriod => g.period ?? "day";
export const opOf = (g: SessionGoal): GoalOp => g.op ?? metricOf(g.type).op;

export interface GoalSet {
  id: string;
  name: string;
  goals: SessionGoal[];
}

const uid = (prefix: string): string => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newGoalSetId = (): string => uid("gs_");

/* Set de départ : deux plafonds de COMPORTEMENT, qui valent quel que soit le
   compte. Une perte max ou une cible de gain dépendent de la taille du compte —
   les proposer avec un montant inventé serait pire que rien. */
export const DEFAULT_GOAL_SET: GoalSet = {
  id: "gs_default",
  name: "Mon plan",
  goals: [
    { id: "g_trades", type: "max_trades", value: 3 },
    { id: "g_streak", type: "max_consecutive_losses", value: 2 },
  ],
};

export function validValue(type: GoalType, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < 0) return !!metricOf(type).signed;
  const unit = metricOf(type).unit;
  if (unit === "percent") return value <= 100;
  if (unit === "time") return value < 24 * 60;
  return true;
}

export function normalizeGoal(g: unknown): SessionGoal | null {
  const x = g as Partial<SessionGoal> | null;
  if (!x || typeof x.id !== "string" || !isGoalType(x.type)) return null;
  const value = Number(x.value);
  if (!validValue(x.type, value)) return null;
  const period = GOAL_PERIODS.includes(x.period as GoalPeriod) && x.period !== "day" ? { period: x.period } : null;
  const op = GOAL_OPS.includes(x.op as GoalOp) ? { op: x.op } : null;
  return { id: x.id, type: x.type, value, ...op, ...period };
}

export function normalizeGoalSet(s: unknown): GoalSet | null {
  const x = s as Partial<GoalSet> | null;
  if (!x || typeof x.id !== "string") return null;
  const goals = Array.isArray(x.goals) ? x.goals.map(normalizeGoal).filter((g): g is SessionGoal => !!g) : [];
  return { id: x.id, name: String(x.name ?? "").trim() || "Objectifs", goals };
}

/* Un seul objectif par métrique dans un set : « max 3 trades » et « max 5
   trades » côte à côte ne disent rien de plus que le plus strict des deux.
   Rajouter une métrique déjà présente en REMPLACE donc le seuil. */
export function upsertGoal(set: GoalSet, type: GoalType, value: number): GoalSet {
  if (!isGoalType(type) || !validValue(type, value)) return set;
  const existing = set.goals.find(g => g.type === type);
  if (existing) return { ...set, goals: set.goals.map(g => (g.id === existing.id ? { ...g, value } : g)) };
  return { ...set, goals: [...set.goals, { id: uid("g_"), type, value }] };
}

export function dropGoal(set: GoalSet, goalId: string): GoalSet {
  return { ...set, goals: set.goals.filter(g => g.id !== goalId) };
}

/* ── Évaluation ─────────────────────────────────────────────────────────── */

export interface GoalTrade {
  id?: string | null;
  pnl?: number | string | null;
  pnlGross?: number | string | null;
  symbol?: string;
  quantity?: number | string | null;
  qty?: number | string | null;
  lots?: number | string | null;
  entryTime?: string;
  entry_time?: string;
  exitTime?: string;
  exit_time?: string;
}

export type GoalStatus = "met" | "missed" | "pending";

export interface GoalResult {
  goal: SessionGoal;
  /** Valeur mesurée sur la journée, dans l'unité du seuil ; null si rien à mesurer. */
  actual: number | null;
  status: GoalStatus;
  /** `true` : l'état ne peut plus changer d'ici la clôture. Un objectif tenu
   *  mais encore exposé (« ≤ 3 trades » à 11 h) est « dans les clous », pas
   *  « atteint ». */
  settled: boolean;
}

const pnlOf = (t: GoalTrade): number => Number(t.pnl) || 0;

/** Minutes depuis minuit d'une heure « HH:MM(:SS) » ou d'une date ISO. */
function minutesOf(v: unknown): number | null {
  const m = String(v ?? "").match(/(\d{1,2}):(\d{2})/);
  if (m && !String(v).includes("T")) return (+m[1]) * 60 + (+m[2]);
  const d = new Date(String(v ?? ""));
  return isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
}

const entryMin = (t: GoalTrade) => minutesOf(t.entryTime || t.entry_time);
const exitMin = (t: GoalTrade) => minutesOf(t.exitTime || t.exit_time);
const qtyOf = (t: GoalTrade) => Number(t.quantity ?? t.qty ?? t.lots) || 0;
/* Le P&L de useTrades() est déjà NET : si le brut est connu, les frais en sont
   l'écart, sinon le barème central (même règle que la liste de trades). */
const feesOf = (t: GoalTrade): number =>
  t.pnlGross != null && Number.isFinite(Number(t.pnlGross))
    ? Number(t.pnlGross) - pnlOf(t)
    : calculateFees(t as Parameters<typeof calculateFees>[0]);

/** Plus longue série de trades perdants consécutifs, dans l'ordre de prise. */
export function maxLosingStreak(trades: GoalTrade[]): number {
  let best = 0, run = 0;
  for (const tr of trades) {
    if (pnlOf(tr) < 0) { run += 1; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

/** Écart le plus court (min) entre la sortie d'un perdant et l'entrée suivante. */
function shortestCooldown(trades: GoalTrade[]): number | null {
  let best: number | null = null;
  for (let i = 1; i < trades.length; i++) {
    if (pnlOf(trades[i - 1]) >= 0) continue;
    const out = exitMin(trades[i - 1]) ?? entryMin(trades[i - 1]);
    const back = entryMin(trades[i]);
    if (out == null || back == null) continue;
    const gap = back - out;
    best = best == null ? gap : Math.min(best, gap);
  }
  return best;
}

/** Mesure brute d'une métrique sur les trades d'une journée, dans l'ordre de prise. */
export function measure(type: GoalType, trades: GoalTrade[]): number | null {
  const pnls = trades.map(pnlOf);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  let cum = 0, peak = 0, trough = 0, giveback = 0;
  for (const p of pnls) {
    cum += p;
    peak = Math.max(peak, cum);
    trough = Math.min(trough, cum);
    giveback = Math.max(giveback, peak - cum);
  }
  const rs = trades.map(t => rMultiple({ pnl: pnlOf(t) })).filter((r): r is number => r != null && Number.isFinite(r));
  const entries = trades.map(entryMin).filter((m): m is number => m != null);

  switch (type) {
    case "max_trades":             return trades.length;
    case "max_losing_trades":      return losses.length;
    case "max_consecutive_losses": return maxLosingStreak(trades);
    // Au PIRE moment de la séance, pas à la clôture : être descendu à -800
    // sous un plafond de 500 reste un plafond franchi, même fini à -200.
    case "max_loss":               return -trough;
    case "max_loss_per_trade":     return losses.length ? -Math.min(...losses) : 0;
    // Ce qu'on a rendu depuis le plus haut du jour — le gain qu'on laisse filer.
    case "max_giveback":           return giveback;
    case "max_contracts":          return trades.length ? Math.max(...trades.map(qtyOf)) : 0;
    case "max_symbols":            return new Set(trades.map(t => String(t.symbol || "").toUpperCase()).filter(Boolean)).size;
    case "max_fees":               return sum(trades.map(feesOf));
    // Pour les horaires, la mesure est l'entrée la plus tôt / la plus tardive.
    case "earliest_entry":         return entries.length ? Math.min(...entries) : null;
    case "latest_entry":           return entries.length ? Math.max(...entries) : null;
    case "min_cooldown_after_loss":return shortestCooldown(trades);
    case "profit_target":          return cum;
    case "min_win_rate":           return trades.length ? (wins.length / trades.length) * 100 : null;
    case "min_profit_factor":      return losses.length ? sum(wins) / -sum(losses) : wins.length ? Infinity : null;
    case "min_payoff":             return wins.length && losses.length ? (sum(wins) / wins.length) / (-sum(losses) / losses.length) : null;
    case "min_total_r":            return rs.length ? sum(rs) : null;
    case "min_avg_r":              return rs.length ? sum(rs) / rs.length : null;
  }
}

/* Une égalité sur un montant ou un ratio ne tombe jamais au centime près : la
   tolérance est d'un demi-cran de ce qu'on affiche. */
const EQ_TOLERANCE: Record<GoalUnit, number> = { count: 0, money: 0.005, percent: 0.5, ratio: 0.005, r: 0.005, time: 0, minutes: 0 };

/**
 * Lit un objectif dans les trades de la journée (lignes FUSIONNÉES : une copie
 * sur quatre comptes reste un trade).
 *
 * Tenu ou pas se lit tout de suite ; PERDU ou seulement en cours dépend du sens
 * dans lequel la mesure peut encore bouger. « ≤ 3 trades » franchi à 11 h est
 * perdu — on ne dé-prend pas un trade ; « ≥ 500 € » sous la barre à 11 h est
 * en cours — le P&L peut remonter.
 */
export function evaluateGoal(goal: SessionGoal, trades: GoalTrade[]): GoalResult {
  const { unit, trend } = metricOf(goal.type);
  const op = opOf(goal);
  const v = goal.value;
  const raw = measure(goal.type, trades);
  /* Rien à mesurer (aucun trade, aucune perte suivie d'une reprise…) : pour
     une mesure qui ne fait que croître, c'est un zéro ; pour une heure ou une
     pause, il n'y a encore rien eu à franchir — rien ne peut être perdu. */
  if (raw == null) {
    const nothingYet = op === "lte" || trend === "down";
    return { goal, actual: null, status: nothingYet && op !== "eq" ? "met" : "pending", settled: false };
  }
  const actual = raw;
  const holds = op === "gte" ? actual >= v : op === "lte" ? actual <= v : Math.abs(actual - v) <= EQ_TOLERANCE[unit];

  // Ce qui reste possible : une mesure « up » ne redescend pas, une « down » ne remonte pas.
  const canStillGoUp = trend !== "down";
  const canStillGoDown = trend !== "up";
  if (holds) {
    const settled = op === "gte" ? !canStillGoDown : op === "lte" ? !canStillGoUp : false;
    return { goal, actual, status: "met", settled };
  }
  const tooHigh = op === "lte" || (op === "eq" && actual > v);
  const lost = tooHigh ? !canStillGoDown : !canStillGoUp;
  return { goal, actual, status: lost ? "missed" : "pending", settled: lost };
}

/** Progression sur les objectifs DU JOUR — ceux d'une autre période ne comptent pas. */
export function goalProgress(goals: SessionGoal[], trades: GoalTrade[]): { done: number; total: number; results: GoalResult[] } {
  const results = goals.filter(g => periodOf(g) === "day").map(g => evaluateGoal(g, trades));
  return { done: results.filter(r => r.status === "met").length, total: results.length, results };
}
