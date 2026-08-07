"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  Plus, Target, Trash2, Pencil, Copy, Pin, Check, X, TrendingUp, Heart,
  ChevronDown, ChevronRight, Calendar, AlertCircle, Flag, Sparkles,
  Dumbbell, BookOpen, Users, GraduationCap, Wallet, Briefcase, Activity, Code,
  Clock, Trophy, Footprints,
} from "lucide-react";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { useTrades, useTradingAccounts } from "@/lib/hooks/useTradeData";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useUndo } from "@/lib/contexts/UndoContext";
import { t, useLang } from "@/lib/i18n";
import {
  RPG_STORAGE_KEY, RPG_CLOUD_KEY, DEFAULT_CATEGORIES as RPG_DEFAULT_CATEGORIES,
  CatIcon as RpgCatIcon,
} from "@/lib/lifeRpgCategories";

import { T as BaseT } from "@/lib/ui/tokens";
// `bg` local (#F5F5F5) = fond subtil : mappé sur la var de survol pour suivre le
// thème sombre (BaseT.bg vaut #FFFFFF, ce qui ferait perdre le gris léger).
const T = { ...BaseT, bg: "var(--color-hover-bg, #F5F5F5)" };

export const GOALS_STORAGE_KEY = "tr4de_goals_v2";
export const GOALS_CLOUD_KEY = "goals";
const STORAGE_KEY = GOALS_STORAGE_KEY;

const HORIZONS = [
  { id: "week",  label: "Cette semaine", short: "semaine" },
  { id: "month", label: "Ce mois",       short: "mois" },
  { id: "year",  label: "Cette année",   short: "année" },
];
// Priorités (remplace les anciens niveaux facile/moyen/difficile)
const LEVELS = [
  { id: "low",     label: "Basse",    color: "#8E8E8E" },
  { id: "normal",  label: "Normale",  color: "#3B82F6" },
  { id: "high",    label: "Haute",    color: "#F59E0B" },
  { id: "urgent",  label: "Urgente",  color: "#EF4444" },
];

// Unités de cible pour les objectifs manuels (ignoré pour les sources trading
// qui ont déjà leur propre unité).
const UNITS = [
  { id: "count",   label: "Nombre",    suffix: "" },
  { id: "money",   label: "Argent",    suffix: "" /* utilise getCurrencySymbol() */, isMoney: true },
  { id: "percent", label: "Pourcent",  suffix: "%" },
  { id: "kg",      label: "Kilos",     suffix: " kg" },
  { id: "km",      label: "Kilomètres", suffix: " km" },
  { id: "hours",   label: "Heures",    suffix: " h" },
  { id: "minutes", label: "Minutes",   suffix: " min" },
  { id: "pages",   label: "Pages",     suffix: " pages" },
  { id: "times",   label: "Fois",      suffix: "×" },
  { id: "steps",   label: "Pas",       suffix: " pas" },
  { id: "custom",  label: "Autre…",    suffix: "", isCustom: true },
];
const CATEGORIES = [
  { id: "trading",   label: "Trading",       color: "#16A34A", icon: TrendingUp },
  { id: "personal",  label: "Personnel",     color: "#EF4444", icon: Heart },
  { id: "sport",     label: "Sport",         color: "#EF4444", icon: Dumbbell },
  { id: "reading",   label: "Lecture",       color: "#8B5CF6", icon: BookOpen },
  { id: "relations", label: "Relations",     color: "#EC4899", icon: Users },
  { id: "learning",  label: "Apprentissage", color: "#3B82F6", icon: GraduationCap },
  { id: "health",    label: "Santé",         color: "#06B6D4", icon: Activity },
  { id: "steps",     label: "Pas journalier", color: "#10B981", icon: Footprints },
  { id: "finance",   label: "Finances",      color: "#059669", icon: Wallet },
  { id: "work",      label: "Travail",       color: "#64748B", icon: Briefcase },
  { id: "code",      label: "Dev",           color: "#6366F1", icon: Code },
];
// Sources de suivi. `trading: true` = calculé à partir des trades et filtré
// sur l'horizon de l'objectif. Ces types ne sont proposés qu'en catégorie
// "Trading".
const AUTO_TYPES = [
  { id: "manual",     label: "Manuel",              unit: "",  trading: false, group: "Général" },
  { id: "pnl",        label: "P&L (sur l'horizon)", unit: "$", trading: true,  group: "P&L" },
  { id: "pnl_day",    label: "P&L du jour",         unit: "$", trading: true,  group: "P&L", horizon: "day"   },
  { id: "pnl_week",   label: "P&L de la semaine",   unit: "$", trading: true,  group: "P&L", horizon: "week"  },
  { id: "pnl_month",  label: "P&L du mois",         unit: "$", trading: true,  group: "P&L", horizon: "month" },
  { id: "pnl_year",   label: "P&L de l'année",      unit: "$", trading: true,  group: "P&L", horizon: "year"  },
  { id: "winrate",    label: "Win rate",            unit: "%", trading: true,  group: "Performance" },
  { id: "trades",     label: "Nb de trades",        unit: "",  trading: true,  group: "Performance" },
  { id: "max_dd",     label: "Drawdown max",        unit: "$", trading: true,  group: "Risque" },
  { id: "account_type", label: "Type de compte",    unit: "",  trading: true,  group: "Compte" },
];

/* ---------- Helpers ---------- */
function dayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start, end };
}
function weekRange() {
  const now = new Date();
  const dow = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59);
  return { start, end };
}
function monthRange() {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
}
function yearRange() {
  const now = new Date();
  return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
}
function tradesInRange(trades, start, end) {
  return (trades || []).filter(t => {
    const d = new Date(t.date);
    return !isNaN(d.getTime()) && d >= start && d <= end;
  });
}
function daysLeft(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline + "T23:59:59");
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
}
// Nombre de jours OUVRÉS (lun-ven) entre deux dates. Les marchés étant fermés le
// week-end, le rythme des objectifs trading se calcule sur ces seuls jours.
function businessDaysBetween(from, to) {
  if (!(from instanceof Date) || !(to instanceof Date) || to <= from) return 0;
  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  const end = new Date(to);   end.setHours(0, 0, 0, 0);
  let count = 0;
  while (cur < end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Fenêtre temporelle selon l'horizon (pour les métriques trading).
function rangeOf(horizon) {
  if (horizon === "day") return dayRange();
  if (horizon === "week") return weekRange();
  if (horizon === "year") return yearRange();
  return monthRange();
}

// Calcule { current, target, pct } d'un objectif. Pur : dépend uniquement de
// l'objectif et des données passées (trades, comptes). Réutilisé tel quel par la
// page « Vie RPG » pour dériver l'XP des catégories rattachées.
export function computeGoalProgress(g, trades = [], accounts = []) {
  const tgt = parseFloat(g.target) || 0;
  const at = AUTO_TYPES.find(a => a.id === g.autoType);
  const horizonForCompute = at?.horizon || g.horizon || "month";
  const { start, end } = rangeOf(horizonForCompute);
  // Filtre de compte : "all" (aucun filtre), "type:<live|eval|funded>" (tous les
  // comptes d'un type donné, ex. « Tous les comptes funded ») ou un id précis.
  const accountFilter = g.accountIdFilter && g.accountIdFilter !== "all" ? g.accountIdFilter : null;
  let scopedTrades = trades || [];
  if (accountFilter) {
    if (String(accountFilter).startsWith("type:")) {
      const wantedType = String(accountFilter).slice(5);
      const idsOfType = new Set(
        (accounts || [])
          .filter(a => (a.account_type || "live") === wantedType)
          .map(a => String(a.id))
      );
      scopedTrades = (trades || []).filter(t => idsOfType.has(String(t.account_id)));
    } else {
      scopedTrades = (trades || []).filter(t => String(t.account_id) === String(accountFilter));
    }
  }
  let current = 0;
  if (g.autoType === "manual") current = parseFloat(g.manual) || 0;
  else if (g.autoType === "pnl" || (g.autoType || "").startsWith("pnl_")) current = tradesInRange(scopedTrades, start, end).reduce((s, t) => s + (t.pnl || 0), 0);
  else if (g.autoType === "winrate") {
    const list = tradesInRange(scopedTrades, start, end);
    const w = list.filter(t => (t.pnl || 0) > 0).length;
    const l = list.filter(t => (t.pnl || 0) < 0).length;
    current = (w + l) > 0 ? (w / (w + l)) * 100 : 0;
  }
  else if (g.autoType === "trades") current = tradesInRange(scopedTrades, start, end).length;
  else if (g.autoType === "account_type") {
    const wanted = g.accountTypeFilter || "live";
    current = (accounts || []).filter(a => (a.account_type || "live") === wanted).length;
  }
  else if (g.autoType === "max_dd") {
    const list = tradesInRange(scopedTrades, start, end).sort((a, b) => new Date(a.date) - new Date(b.date));
    let peak = 0, cum = 0, mdd = 0;
    for (const tr of list) { cum += (tr.pnl || 0); if (cum > peak) peak = cum; if (peak - cum > mdd) mdd = peak - cum; }
    current = mdd;
  }
  // rawPct : pourcentage NON borné (peut être négatif) — sert à l'affichage du
  // « % » et à signaler un objectif dans le rouge (ex. compte de trading en perte).
  // pct : borné 0-100, utilisé pour la largeur de barre et la dérivation d'XP RPG.
  const rawPct = tgt === 0 ? 0 : (current / tgt) * 100;
  const pct = Math.max(0, Math.min(100, rawPct));
  return { current, target: tgt, pct, rawPct };
}

// Statut de RYTHME (« pace ») d'un objectif : compare l'avancement réel à
// l'avancement ATTENDU si l'on progressait linéairement sur la fenêtre de temps
// de l'objectif. C'est ce qui transforme une cible passive en boussole : « suis-je
// en avance ou en retard sur le tempo nécessaire pour tenir l'échéance ? ».
// Pur et déterministe (hormis l'instant présent). Renvoie null quand il n'y a
// pas de fenêtre temporelle exploitable (ni horizon trading ni deadline), ou
// pour le drawdown (logique inversée, le pace n'a pas de sens).
//   - Objectif trading auto → fenêtre = celle de son horizon (jour/semaine/mois/année).
//   - Objectif manuel/autre avec deadline → fenêtre = [création, deadline].
export function computeGoalPace(g, current, target, pct) {
  if (!g || g.autoType === "max_dd") return null;
  const at = AUTO_TYPES.find(a => a.id === g.autoType);
  let start, end;
  // La DEADLINE fixée par l'utilisateur PRIME toujours : le rythme doit se
  // calculer sur cette durée (« 10 000 € en 30 j » → / 30 j). Sinon, pour un
  // objectif trading créé en fin de mois, on diviserait par les 2-3 jours
  // restants de la fenêtre civile → rythme requis aberrant (≈ 3k/jour).
  if (g.deadline) {
    end = new Date(g.deadline + "T23:59:59");
    start = g.createdAt ? new Date(g.createdAt) : new Date(g.id);
  } else if (at?.trading) {
    const r = rangeOf(at.horizon || g.horizon || "month");
    start = r.start; end = r.end;
  } else {
    return null;
  }
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;

  const now = Date.now();
  const timeFrac = Math.max(0, Math.min(1, (now - start.getTime()) / total));
  const progressFrac = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  const expectedPct = Math.round(timeFrac * 100);
  const delta = progressFrac - timeFrac; // > 0 = en avance, < 0 = en retard

  // Rythme requis sur le temps restant pour atteindre la cible — seulement pour
  // les métriques ADDITIVES (un win rate ou un type de compte ne « s'accumule »
  // pas par jour, le rythme n'aurait aucun sens).
  const additive = g.autoType === "manual" || g.autoType === "trades" || (g.autoType || "").startsWith("pnl");
  const isTrading = !!at?.trading || g.category === "trading";
  // En trading, les marchés sont fermés le week-end : on ne compte que les jours
  // OUVRÉS, une « semaine » = 5 jours de bourse et un « mois » ≈ 21. Hors trading,
  // on garde les jours calendaires (semaine = 7, mois = 30).
  const daysLeftForRate = isTrading ? businessDaysBetween(new Date(now), end) : (end.getTime() - now) / 86400000;
  const wDiv = isTrading ? 5 : 7;
  const mDiv = isTrading ? 21 : 30;
  const remaining = Math.max(0, target - current);
  let requiredRate = null, rateUnit = null;
  if (additive && daysLeftForRate > 0.5 && remaining > 0) {
    // Choisit l'unité de temps la plus FINE qui reste lisible (rythme ≥ 1) :
    // par jour si possible, sinon par semaine, sinon par mois. Évite à la fois
    // les « 0,03/jour » illisibles et les « 3k/jour » aberrants des gros écarts.
    const perDay = remaining / daysLeftForRate;
    if (perDay >= 1)             { requiredRate = perDay;        rateUnit = "jour"; }
    else if (perDay * wDiv >= 1) { requiredRate = perDay * wDiv; rateUnit = "semaine"; }
    else                         { requiredRate = perDay * mDiv; rateUnit = "mois"; }
    // Arrondi propre : entier au-delà de 10, sinon une décimale (jamais de centimes).
    requiredRate = requiredRate >= 10 ? Math.round(requiredRate) : Math.round(requiredRate * 10) / 10;
  }

  let status, color, label;
  if (pct >= 100)            { status = "done";    color = "#16A34A"; label = "Atteint"; }
  else if (timeFrac >= 1)    { status = "ended";   color = "#EF4444"; label = "Échéance passée"; }
  else if (delta >= 0.05)    { status = "ahead";   color = "#16A34A"; label = "En avance"; }
  else if (delta <= -0.05)   { status = "behind";  color = "#F59E0B"; label = "En retard"; }
  else                       { status = "ontrack"; color = "#3B82F6"; label = "Dans les temps"; }

  return { status, color, label, expectedPct, timeFrac, progressFrac, requiredRate, rateUnit };
}

// { prefix, suffix } pour formater la valeur d'un objectif (pur, exporté).
export function goalUnitOf(g) {
  if (g.autoType !== "manual") {
    const u = AUTO_TYPES.find(a => a.id === g.autoType)?.unit || "";
    if (u === "$") return { prefix: getCurrencySymbol(), suffix: "" };
    if (u === "%") return { prefix: "", suffix: "%" };
    return { prefix: "", suffix: "" };
  }
  const unit = UNITS.find(u => u.id === (g.unit || "count")) || UNITS[0];
  if (unit.isMoney) return { prefix: getCurrencySymbol(), suffix: "" };
  if (unit.isCustom) return { prefix: "", suffix: g.customUnit ? ` ${g.customUnit}` : "" };
  return { prefix: "", suffix: unit.suffix };
}
// Formate un nombre : au-delà de 10 000, on abrège en milliers avec « k »
// (ex. 10000 -> « 10k », 12500 -> « 12,5k »). En dessous, valeur complète.
function fmtGoalNum(x) {
  const abs = Math.abs(x);
  if (abs >= 10000) {
    return `${(abs / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`;
  }
  return abs.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function fmtGoalVal(v, u) {
  // Le signe est placé en tête (ex. « -€500 » plutôt que « €-500 ») pour rendre
  // lisibles les valeurs négatives (compte en perte, drawdown, etc.).
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (typeof u === "string") {
    if (u === "%") return `${Math.round(v)}%`;
    if (u === "") return `${sign}${fmtGoalNum(Math.round(abs))}`;
    return `${sign}${u}${fmtGoalNum(abs)}`;
  }
  const { prefix = "", suffix = "" } = u || {};
  return `${sign}${prefix}${fmtGoalNum(abs)}${suffix}`;
}

// Walk the goals tree (top level + 1 level of nested goal-subtasks) and apply
// `updater` to the goal whose id matches. Used so that nested goals (créés
// via drag d'un objectif sur un autre) ont les mêmes opérations que les goals
// top-level (édition, ajustement manuel, mutation des sous-objectifs).
function updateGoalById(goals, id, updater) {
  let changed = false;
  const out = goals.map(g => {
    if (g.id === id) { changed = true; return updater(g); }
    if (Array.isArray(g.subtasks) && g.subtasks.length > 0) {
      const nextSubs = updateGoalById(g.subtasks, id, updater);
      if (nextSubs !== g.subtasks) { changed = true; return { ...g, subtasks: nextSubs }; }
    }
    return g;
  });
  return changed ? out : goals;
}
// Retire récursivement le goal d'id `id` de l'arbre et renvoie l'arbre allégé
// + le goal extrait. Utilisé par le drag & drop pour pouvoir le ré-insérer.
function findAndRemoveGoal(goals, id) {
  let source = null;
  const recurse = (arr) => {
    let changed = false;
    const out = [];
    for (const g of arr) {
      if (g.id === id) { source = g; changed = true; continue; }
      if (Array.isArray(g.subtasks) && g.subtasks.length > 0) {
        const newSubs = recurse(g.subtasks);
        if (newSubs !== g.subtasks) {
          changed = true;
          out.push({ ...g, subtasks: newSubs });
          continue;
        }
      }
      out.push(g);
    }
    return changed ? out : arr;
  };
  return { without: recurse(goals), source };
}
function containsGoalId(goal, id) {
  if (!goal) return false;
  if (goal.id === id) return true;
  return (goal.subtasks || []).some(s => containsGoalId(s, id));
}
function insertGoalAtTarget(goals, source, targetId, mode) {
  if (mode === "into") {
    const recurse = (arr) => arr.map(g => {
      if (g.id === targetId) return { ...g, subtasks: [source, ...(g.subtasks || [])] };
      if (Array.isArray(g.subtasks) && g.subtasks.length > 0) {
        return { ...g, subtasks: recurse(g.subtasks) };
      }
      return g;
    });
    return recurse(goals);
  }
  // before / after: insertion en tant que frère de la cible (au niveau où elle vit)
  const topIdx = goals.findIndex(g => g.id === targetId);
  if (topIdx !== -1) {
    const insertIdx = mode === "after" ? topIdx + 1 : topIdx;
    const next = [...goals];
    next.splice(insertIdx, 0, source);
    return next.map((g, i) => ({ ...g, position: i }));
  }
  return goals.map(g => {
    if (Array.isArray(g.subtasks) && g.subtasks.length > 0) {
      const sIdx = g.subtasks.findIndex(s => s.id === targetId);
      if (sIdx !== -1) {
        const insertIdx = mode === "after" ? sIdx + 1 : sIdx;
        const newSubs = [...g.subtasks];
        newSubs.splice(insertIdx, 0, source);
        return { ...g, subtasks: newSubs };
      }
      return { ...g, subtasks: insertGoalAtTarget(g.subtasks, source, targetId, mode) };
    }
    return g;
  });
}

function removeGoalById(goals, id) {
  if (goals.some(g => g.id === id)) return goals.filter(g => g.id !== id);
  let changed = false;
  const out = goals.map(g => {
    if (Array.isArray(g.subtasks) && g.subtasks.length > 0) {
      const nextSubs = removeGoalById(g.subtasks, id);
      if (nextSubs !== g.subtasks) { changed = true; return { ...g, subtasks: nextSubs }; }
    }
    return g;
  });
  return changed ? out : goals;
}

function defaultGoals() {
  return [
    { id: 1, label: "P&L du mois",  horizon: "month", level: "high",   category: "trading",  autoType: "pnl",     target: 1000, manual: 0, deadline: "", subtasks: [] },
    { id: 2, label: "Win rate",     horizon: "month", level: "normal", category: "trading",  autoType: "winrate", target: 60,   manual: 0, deadline: "", subtasks: [] },
    { id: 3, label: "Lire 1 livre", horizon: "month", level: "low",    category: "personal", autoType: "manual",  target: 1,    manual: 0, deadline: "", subtasks: [] },
  ];
}

/* ---------- Donut ---------- */
function Donut({ pct, color, size = 56, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.accentBg} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset .45s var(--ease-out)" }} />
    </svg>
  );
}

/* ---------- Page ---------- */
export default function GoalsPage() {
  useLang();
  const tradesHook = useTrades();
  const trades = tradesHook?.trades || [];
  const accountsHook = useTradingAccounts();
  const accounts = accountsHook?.accounts || [];

  const [goals, setGoals] = useCloudState(STORAGE_KEY, "goals", defaultGoals());
  const { pushUndo } = useUndo();

  // Catégories Vie RPG persistées (pour rattacher un objectif à une catégorie
  // et lui faire alimenter l'XP du RPG au prorata de l'avancement).
  const [rpgState] = useCloudState(RPG_STORAGE_KEY, RPG_CLOUD_KEY, { categories: RPG_DEFAULT_CATEGORIES });
  const rpgCategories = Array.isArray(rpgState?.categories) ? rpgState.categories : RPG_DEFAULT_CATEGORIES;

  // Migration : anciens autoType et anciens levels -> nouveaux
  useEffect(() => {
    const autoMap  = { trades_month: "trades" };
    const levelMap = { easy: "low", medium: "normal", hard: "high" };
    let changed = false;
    const migrated = goals.map(g => {
      let next = g;
      if (autoMap[g.autoType]) { next = { ...next, autoType: autoMap[g.autoType] }; changed = true; }
      if (levelMap[g.level])   { next = { ...next, level: levelMap[g.level] };     changed = true; }
      if (!g.level)            { next = { ...next, level: "normal" };              changed = true; }
      return next;
    });
    if (changed) setGoals(migrated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Déduit l'horizon (fenêtre de calcul pour les métriques trading) à partir
  // d'une deadline. Si la deadline est < 10 jours → semaine, < 45 → mois, sinon année.
  // Pas de deadline → mois par défaut.
  const horizonFromDeadline = (deadline) => {
    if (!deadline) return "month";
    const d = new Date(deadline + "T23:59:59");
    if (isNaN(d.getTime())) return "month";
    const diff = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
    if (diff <= 10) return "week";
    if (diff <= 45) return "month";
    return "year";
  };

  // Modal d'ajout/édition
  const emptyForm = { label: "", level: "normal", category: "trading", autoType: "manual", target: "", deadline: "", unit: "count", customUnit: "", accountTypeFilter: "live", accountIdFilter: "all", rpgCategory: "", rpgXp: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const openCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const openEdit = (g) => { setForm({ label: g.label, level: g.level || "normal", category: g.category || "trading", autoType: g.autoType || "manual", target: String(g.target), deadline: g.deadline || "", unit: g.unit || "count", customUnit: g.customUnit || "", accountTypeFilter: g.accountTypeFilter || "live", accountIdFilter: g.accountIdFilter || "all", rpgCategory: g.rpgCategory || "", rpgXp: g.rpgXp != null ? String(g.rpgXp) : "" }); setEditingId(g.id); setShowForm(true); };
  const close = () => { setForm(emptyForm); setEditingId(null); setShowForm(false); };

  // Auto-save : dès qu'un champ change et qu'il y a assez d'infos, on enregistre
  // (édition → mise à jour live, création → insertion unique au 1er passage valide).
  useEffect(() => {
    if (!showForm) return;
    // Validation stricte avant insertion : évite les « objectifs fantômes » créés
    // par l'auto-save sur une saisie partielle. On exige un label ET une cible
    // numérique finie strictement positive (parseFloat filtre NaN / « 12ab »).
    const targetNum = parseFloat(form.target);
    if (!form.label.trim() || !Number.isFinite(targetNum) || targetNum <= 0) return;
    const horizon = horizonFromDeadline(form.deadline);
    const handle = setTimeout(() => {
      // Lien Vie RPG : catégorie rattachée + XP versée (au prorata) à 100 %.
      const rpgCategory = form.rpgCategory || null;
      const rpgXp = rpgCategory ? Math.max(0, parseInt(form.rpgXp, 10) || 0) : 0;
      if (editingId) {
        setGoals(prev => updateGoalById(prev, editingId, g => ({
          ...g, label: form.label.trim(), horizon, level: form.level,
          category: form.category, autoType: form.autoType,
          target: parseFloat(form.target), deadline: form.deadline, unit: form.unit,
          customUnit: form.customUnit || "",
          accountTypeFilter: form.accountTypeFilter,
          accountIdFilter: form.accountIdFilter,
          rpgCategory, rpgXp,
        })));
      } else {
        // Créer le nouveau goal et passer immédiatement en mode édition
        const id = Date.now();
        setGoals(prev => [...prev, {
          id, createdAt: new Date(id).toISOString(),
          label: form.label.trim(), horizon, level: form.level,
          category: form.category, autoType: form.autoType,
          target: parseFloat(form.target), deadline: form.deadline, unit: form.unit,
          customUnit: form.customUnit || "",
          accountTypeFilter: form.accountTypeFilter,
          accountIdFilter: form.accountIdFilter,
          rpgCategory, rpgXp,
          manual: 0,
        }]);
        setEditingId(id);
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, showForm, editingId]);
  // Bascule l'état "épinglé" d'un objectif. Un goal épinglé persiste son
  // état ouvert/fermé entre les rechargements (le clic sur la ligne reste
  // libre de toggle l'expansion comme d'habitude).
  const togglePin = (id) => {
    setGoals(prev => updateGoalById(prev, id, g => ({
      ...g,
      pinned: !g.pinned,
      // Quand on épingle, on initialise pinnedOpen à true par défaut
      // (utile : on pin généralement parce qu'on veut garder ouvert).
      pinnedOpen: g.pinned ? g.pinnedOpen : true,
    })));
  };
  // Met à jour l'état ouvert persisté d'un goal épinglé.
  const setGoalPinnedOpen = (id, open) => {
    setGoals(prev => updateGoalById(prev, id, g => ({ ...g, pinnedOpen: open })));
  };

  const remove = (id) => {
    const snap = goals;
    const after = removeGoalById(goals, id);
    setGoals(after);
    pushUndo({
      label: "Suppression de l'objectif",
      undo: async () => setGoals(snap),
      redo: async () => setGoals(after),
    });
  };

  // Duplique un objectif (top-level ou imbriqué) : insère une copie juste
  // après l'original, avec de nouveaux ids pour le goal et tous ses
  // sous-objectifs / sous-tâches.
  const duplicate = (id) => {
    let nextId = Date.now();
    const newId = () => ++nextId;
    const cloneNode = (n) => ({
      ...n,
      id: newId(),
      subtasks: (n.subtasks || []).map(cloneNode),
    });
    const insertAfter = (arr) => {
      const idx = arr.findIndex(g => g.id === id);
      if (idx === -1) return null;
      const orig = arr[idx];
      const copy = cloneNode({ ...orig, label: `${orig.label || ""} (copie)`.trim() });
      const next = [...arr];
      next.splice(idx + 1, 0, copy);
      return next;
    };
    setGoals(prev => {
      const atTop = insertAfter(prev);
      if (atTop) return atTop.map((g, i) => (typeof g.position === "number" ? { ...g, position: i } : g));
      return prev.map(g => {
        if (Array.isArray(g.subtasks) && g.subtasks.length > 0) {
          const next = insertAfter(g.subtasks);
          if (next) return { ...g, subtasks: next };
        }
        return g;
      });
    });
  };

  const adjustManual = (gid, delta) =>
    setGoals(prev => updateGoalById(prev, gid, g => ({ ...g, manual: Math.max(0, (parseFloat(g.manual) || 0) + delta) })));

  // Fixe la progression manuelle à une valeur absolue (saisie au clavier).
  const setManual = (gid, value) =>
    setGoals(prev => updateGoalById(prev, gid, g => ({ ...g, manual: Math.max(0, parseFloat(value) || 0) })));

  const setSubtasksFor = (gid, nextSubtasks) =>
    setGoals(prev => updateGoalById(prev, gid, g => ({ ...g, subtasks: nextSubtasks })));

  // Drag & drop state: long-press a goal row to drag, drop on another row
  // to nest it as a subtask, drop between rows to reorder. Source et cible
  // peuvent être à n'importe quel niveau de l'arbre.
  const [drag, setDrag] = useState({ sourceId: null, overId: null, mode: null });
  const reorderOrNest = (sourceId, targetId, mode) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setGoals(prev => {
      const { without, source } = findAndRemoveGoal(prev, sourceId);
      if (!source) return prev;
      // Empêche de déposer un objectif dans un de ses propres descendants
      if (containsGoalId(source, targetId)) return prev;
      return insertGoalAtTarget(without, source, targetId, mode);
    });
  };

  // Compute current/target/pct pour un goal — délègue au helper module pur.
  const compute = (g) => computeGoalProgress(g, trades, accounts);
  const unitOf = goalUnitOf;
  const fmtVal = fmtGoalVal;

  // KPIs
  const kpis = useMemo(() => {
    const total = goals.length;
    let achieved = 0, onTrack = 0, atRisk = 0;
    for (const g of goals) {
      const { pct } = compute(g);
      const dl = daysLeft(g.deadline);
      if (pct >= 100) achieved++;
      else if (dl !== null && dl < 3 && pct < 80) atRisk++;
      else onTrack++;
    }
    return { total, achieved, onTrack, atRisk };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, trades]);

  // Filtre catégorie
  const [catFilter, setCatFilter] = useState("all"); // all | trading | personal
  const filtered = catFilter === "all" ? goals : goals.filter(g => (g.category || "trading") === catFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      {/* Header : pleine largeur au-dessus du drawer */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={openCreate}
          style={{ marginLeft: "auto", padding: "7px 16px", height: 34, borderRadius: 999, background: T.text, border: `1px solid ${T.text}`, color: T.white, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} strokeWidth={2} /> Nouvel objectif
        </button>
      </div>

      {/* À partir d'ici : le drawer occupe la colonne de droite */}
      <div className="tr4de-goals-layout" style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats strip (style timeline) */}
      <StatStrip kpis={kpis} goals={goals} compute={compute} />

      {/* Séparateur entre les KPIs et la liste des objectifs */}
      <div style={{ height: 1, background: T.border, margin: "0 16px" }} />

      {/* Column headers */}
      <div className="tr4de-goals-headers" style={{ display: "grid", gridTemplateColumns: "minmax(70px, 110px) minmax(0, 1fr) minmax(90px, 160px) minmax(110px, 160px) 124px", gap: 12, padding: "0 16px", fontSize: 11, color: T.textMut, fontWeight: 500 }}>
        <div>Créé le</div>
        <div>Objectif</div>
        <div>Échéance</div>
        <div>Cible</div>
        <div />
      </div>

      {/* Category tabs : n'afficher que les catégories qui contiennent au moins un objectif */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px", flexWrap: "wrap" }}>
        {(() => {
          const tabs = [{ id: "all", label: "Tous", icon: null }];
          CATEGORIES.forEach(c => {
            const count = goals.filter(g => (g.category || "trading") === c.id).length;
            if (count > 0) tabs.push(c);
          });
          return tabs.map(c => {
            const Icon = c.icon;
            const count = c.id === "all" ? goals.length : goals.filter(g => (g.category || "trading") === c.id).length;
            return (
              <button key={c.id} onClick={() => setCatFilter(c.id)}
                style={{
                  padding: "6px 12px", borderRadius: 999,
                  border: `1px solid ${catFilter === c.id ? T.text : T.border}`,
                  background: catFilter === c.id ? T.text : T.white,
                  color: catFilter === c.id ? T.white : T.text,
                  fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                {Icon && <Icon size={11} strokeWidth={1.75} />}
                {c.label}
                <span style={{ padding: "0 6px", borderRadius: 999, fontSize: 10, background: catFilter === c.id ? "rgba(255,255,255,0.18)" : T.accentBg, color: catFilter === c.id ? T.white : T.textSub }}>{count}</span>
              </button>
            );
          });
        })()}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <EmptyState onClick={openCreate} />
      ) : (
        <>
          {(() => {
            // Si l'utilisateur a réordonné manuellement (drag & drop), on respecte
            // l'ordre via le champ `position`. Sinon : tri par priorité puis deadline.
            const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 };
            const hasManualOrder = goals.some(g => typeof g.position === "number");
            const byPriority = (a, b) => {
              if (hasManualOrder) {
                const pa = typeof a.position === "number" ? a.position : Infinity;
                const pb = typeof b.position === "number" ? b.position : Infinity;
                if (pa !== pb) return pa - pb;
              }
              const ra = priorityRank[a.level || "normal"] ?? 2;
              const rb = priorityRank[b.level || "normal"] ?? 2;
              if (ra !== rb) return ra - rb;
              const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
              const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
              return da - db;
            };
            const onGoing = filtered.filter(g => {
              const { pct, current, target } = compute(g);
              return g.autoType === "max_dd" ? current > target : pct < 100;
            }).sort(byPriority);
            const done = filtered.filter(g => {
              const { pct, current, target } = compute(g);
              return g.autoType === "max_dd" ? current <= target : pct >= 100;
            }).sort(byPriority);
            return (
              <>
                {onGoing.length > 0 && (
                  <TimelineSection title="En cours" rows={onGoing}
                    compute={compute} unitOf={unitOf} fmtVal={fmtVal}
                    onEdit={openEdit} onDelete={remove} onDuplicate={duplicate} onTogglePin={togglePin}
                    onSetPinnedOpen={setGoalPinnedOpen}
                    onAdjustManual={adjustManual}
                    onSetManual={setManual}
                    onSubtasksChange={setSubtasksFor}
                    drag={drag} setDrag={setDrag} onDrop={reorderOrNest}
                    drawerOpen={showForm}
                  />
                )}
                {done.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button
                      onClick={() => setShowDone(s => !s)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        alignSelf: "flex-start",
                        margin: "8px 16px 0",
                        padding: "6px 10px",
                        border: "none", background: "transparent",
                        color: T.textSub, fontSize: 12, fontWeight: 500,
                        cursor: "pointer", fontFamily: "inherit",
                        borderRadius: 6, transition: "background .12s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <ChevronRight size={12} strokeWidth={2} style={{ transform: showDone ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} />
                      {showDone ? "Masquer" : "Afficher"} les {done.length} objectif{done.length > 1 ? "s" : ""} terminé{done.length > 1 ? "s" : ""}
                    </button>
                    {showDone && (
                      <TimelineSection title="Terminés" rows={done}
                        compute={compute} unitOf={unitOf} fmtVal={fmtVal}
                        onEdit={openEdit} onDelete={remove} onDuplicate={duplicate} onTogglePin={togglePin}
                        onAdjustManual={adjustManual}
                        onSetManual={setManual}
                        onSubtasksChange={setSubtasksFor}
                        drag={drag} setDrag={setDrag} onDrop={reorderOrNest}
                        drawerOpen={showForm}
                        doneSection
                      />
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

    </div>
    {/* Drawer inline : s'étire pleine hauteur, aligné avec le contenu */}
    {showForm && (
        <div
          className="tr4de-drawer"
          style={{
            width: 360, flexShrink: 0,
            background: T.white,
            border: `1px solid ${T.border}`,
            borderRadius: "var(--radius-card)",
            display: "flex", flexDirection: "column",
            alignSelf: "stretch",
            minHeight: "100%",
            overflow: "hidden",
            animation: "goalDrawerIn .28s var(--ease-drawer) both",
            fontFamily: "var(--font-sans)",
          }}>
            <style>{`
              @keyframes goalDrawerIn { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
              .no-spin::-webkit-outer-spin-button,
              .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
              .no-spin { -moz-appearance: textfield; }
              .fancy-date::-webkit-calendar-picker-indicator {
                opacity: 0; position: absolute; right: 0; top: 0; bottom: 0; width: 100%; cursor: pointer;
              }
              .fancy-date { position: relative; }
            `}</style>

            {/* Header : titre + close */}
            <div style={{ padding: "16px 18px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text, margin: 0, letterSpacing: -0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {editingId ? "Détail de l'objectif" : "Nouvel objectif"}
              </h3>
              <button onClick={close} aria-label="Fermer"
                style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>

            {/* Body : style stacked (label au-dessus, valeur en gros), séparé par fines lignes */}
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 16px" }}>
              {/* Nom */}
              <StackField label="Nom de l'objectif" icon={Pencil}>
                <input type="text" autoFocus value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Nom de l'objectif..."
                  style={stackInput()} />
              </StackField>

              {/* Deadline (full width) avec presets + calendrier custom */}
              <DeadlineField value={form.deadline} onChange={(v) => setForm({ ...form, deadline: v })} />


              {/* Priorité (full width, sous la deadline) */}
              <StackField label="Priorité">
                <FancyDropdown
                  value={form.level}
                  options={LEVELS}
                  onChange={(v) => setForm({ ...form, level: v })}
                  renderValue={(lv) => (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: lv.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 400, color: lv.color }}>{lv.label}</span>
                    </span>
                  )}
                  renderOption={(lv, active) => (
                    <>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: lv.color, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{lv.label}</span>
                      {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
                    </>
                  )}
                />
              </StackField>

              {/* Cible (full width, sous la priorité) avec sélecteur d'unité à droite */}
              <StackField label="Cible">
                <input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                  placeholder="1000"
                  className="no-spin"
                  style={{ ...stackInput(), MozAppearance: "textfield", appearance: "textfield" }} />
                {form.autoType === "manual" ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ padding: "4px 10px 4px 12px", background: T.bg, borderRadius: 999, border: `1px solid ${T.border}` }}>
                      <FancyDropdown
                        value={form.unit}
                        options={UNITS}
                        onChange={(v) => setForm({ ...form, unit: v })}
                        renderValue={(u) => (
                          <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{u.label}</span>
                        )}
                        renderOption={(u, active) => (
                          <>
                            <span style={{ flex: 1 }}>{u.label}</span>
                            {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
                          </>
                        )}
                      />
                    </div>
                    {form.unit === "custom" && (
                      <input
                        type="text"
                        value={form.customUnit}
                        onChange={(e) => setForm({ ...form, customUnit: e.target.value })}
                        placeholder="ex: séances"
                        style={{ width: 120, padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 999, background: T.bg, fontSize: 12, fontWeight: 500, color: T.text, fontFamily: "inherit", outline: "none" }}
                      />
                    )}
                  </div>
                ) : form.autoType === "account_type" ? (
                  <div style={{ flexShrink: 0, marginLeft: 8, padding: "4px 10px 4px 12px", background: T.bg, borderRadius: 999, border: `1px solid ${T.border}` }}>
                    <FancyDropdown
                      value={form.accountTypeFilter || "live"}
                      options={[
                        { id: "live",   label: "Live" },
                        { id: "eval",   label: "Eval" },
                        { id: "funded", label: "Funded" },
                      ]}
                      onChange={(v) => setForm({ ...form, accountTypeFilter: v })}
                      renderValue={(o) => (
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{o.label}</span>
                      )}
                      renderOption={(o, active) => (
                        <>
                          <span style={{ flex: 1 }}>{o.label}</span>
                          {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
                        </>
                      )}
                    />
                  </div>
                ) : (() => {
                  const a = AUTO_TYPES.find(x => x.id === form.autoType);
                  const label = a?.unit === "$" ? getCurrencySymbol() : a?.unit === "%" ? "%" : "trades";
                  return (
                    <span style={{ flexShrink: 0, marginLeft: 8, padding: "6px 12px", borderRadius: 999, background: T.bg, border: `1px solid ${T.border}`, color: T.textSub, fontSize: 12, fontWeight: 600 }}>
                      {label}
                    </span>
                  );
                })()}
              </StackField>

              {/* Catégorie — grille compacte (2 lignes de 5) */}
              <div style={{ padding: "12px 0", borderBottom: form.category === "trading" ? `1px solid ${T.border}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500 }}>Catégorie</div>
                  {(() => {
                    const cat = CATEGORIES.find(c => c.id === form.category) || CATEGORIES[0];
                    return (
                      <span style={{ fontSize: 11, fontWeight: 600, color: cat.color }}>{cat.label}</span>
                    );
                  })()}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                  {CATEGORIES.map(c => {
                    const Icon = c.icon;
                    const active = form.category === c.id;
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setForm(prev => {
                          const next = { ...prev, category: c.id };
                          if (c.id !== "trading" && AUTO_TYPES.find(a => a.id === prev.autoType)?.trading) next.autoType = "manual";
                          return next;
                        })}
                        title={c.label}
                        style={{
                          background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                          padding: 0,
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                          minWidth: 0, overflow: "hidden",
                        }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%",
                          background: active ? c.color : T.bg,
                          color: active ? "#fff" : T.textSub,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          transition: "all .15s ease",
                          boxShadow: active ? `0 2px 8px color-mix(in srgb, ${c.color} 25%, transparent)` : "none",
                        }}>
                          <Icon size={14} strokeWidth={1.75} />
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 600,
                          color: active ? c.color : T.textMut,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                          transition: "color .15s ease",
                        }}>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Source de suivi — visible uniquement pour Trading */}
              {form.category === "trading" && (
                <StackField label="Source de suivi" last={form.autoType !== "manual" && !["pnl","pnl_day","pnl_week","pnl_month","pnl_year","winrate","trades","max_dd"].includes(form.autoType)}>
                  <FancyDropdown
                    value={form.autoType}
                    options={AUTO_TYPES}
                    onChange={(v) => setForm({ ...form, autoType: v })}
                    renderOption={(a, active) => (
                      <>
                        <span style={{ flex: 1 }}>{a.label}</span>
                        {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
                      </>
                    )}
                  />
                </StackField>
              )}

              {/* Compte ciblé — pour les sources de perf (PnL / WR / Nb trades / DD) */}
              {form.category === "trading" && ["pnl","pnl_day","pnl_week","pnl_month","pnl_year","winrate","trades","max_dd"].includes(form.autoType) && (
                <StackField label="Compte ciblé" last={form.autoType !== "manual"}>
                  <FancyDropdown
                    value={form.accountIdFilter || "all"}
                    options={(() => {
                      // Groupes par type : n'affiche « Tous les comptes <type> » que
                      // pour les types réellement présents parmi les comptes.
                      const TYPE_LABELS = { live: "Live", funded: "Funded" };
                      const presentTypes = ["live", "funded"].filter(ty =>
                        (accounts || []).some(a => (a.account_type || "live") === ty)
                      );
                      return [
                        { id: "all", label: "Tous mes comptes" },
                        ...presentTypes.map(ty => ({
                          id: `type:${ty}`,
                          label: `Tous les comptes ${TYPE_LABELS[ty]}`,
                        })),
                        ...((accounts || []).map(a => ({
                          id: String(a.id),
                          label: `${a.name || "Compte"}${a.account_type ? ` · ${a.account_type}` : ""}`,
                        }))),
                      ];
                    })()}
                    onChange={(v) => setForm({ ...form, accountIdFilter: v })}
                    renderValue={(o) => (
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{o.label}</span>
                    )}
                    renderOption={(o, active) => (
                      <>
                        <span style={{ flex: 1 }}>{o.label}</span>
                        {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
                      </>
                    )}
                  />
                </StackField>
              )}

{/* Sous-objectifs — visibles uniquement après création */}
              {editingId && (() => {
                const g = goals.find(gg => gg.id === editingId);
                if (!g) return null;
                return (
                  <SubtasksField
                    subtasks={g.subtasks || []}
                    onChange={(next) => setSubtasksFor(g.id, next)}
                  />
                );
              })()}

              {/* Progression actuelle — visible uniquement pour les objectifs manuels */}
              {form.autoType === "manual" && editingId && (() => {
                const g = goals.find(gg => gg.id === editingId);
                if (!g) return null;
                const unit = UNITS.find(u => u.id === (form.unit || "count")) || UNITS[0];
                const suffix = unit.isMoney ? getCurrencySymbol() : (unit.isCustom ? (form.customUnit ? ` ${form.customUnit}` : "") : unit.suffix);
                return (
                  <StackField label="Progression actuelle">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                      <input type="number" value={g.manual || 0}
                        className="no-spin"
                        onChange={(e) => setGoals(prev => prev.map(x => x.id === g.id ? { ...x, manual: parseFloat(e.target.value) || 0 } : x))}
                        style={{ ...stackInput(), MozAppearance: "textfield", appearance: "textfield" }} />
                      {suffix && <span style={{ fontSize: 12, color: T.textMut, fontWeight: 500, flexShrink: 0 }}>{suffix.trim()}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                      <button onClick={() => adjustManual(g.id, -1)}
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: T.white, color: T.text, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>−</button>
                      <button onClick={() => adjustManual(g.id, 1)}
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.text}`, background: T.text, color: T.white, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>+</button>
                    </div>
                  </StackField>
                );
              })()}

              {/* Lien Vie RPG (tout en bas) — pills comme la page Habitudes.
                  Rattache l'objectif à une carte de la page Vie RPG : sa
                  progression donne de l'XP à cette catégorie, au prorata. */}
              <StackField label="Catégorie Vie RPG (XP)" last>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {rpgCategories.map((c) => {
                      const active = form.rpgCategory === c.id;
                      return (
                        <button key={c.id} type="button"
                          onClick={() => setForm({ ...form, rpgCategory: active ? "" : c.id })}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999, border: `1px solid ${active ? c.color : T.border}`, background: active ? `color-mix(in srgb, ${c.color} 8%, transparent)` : T.white, color: active ? c.color : T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          {active
                            ? <Check size={13} strokeWidth={2.5} color={c.color} />
                            : <RpgCatIcon name={c.icon} size={13} strokeWidth={1.9} color={T.textMut} />}
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  {form.rpgCategory && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input type="number" min={0} value={form.rpgXp}
                        onChange={(e) => setForm({ ...form, rpgXp: e.target.value })}
                        placeholder="500" className="no-spin"
                        style={{ width: 80, padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 999, background: T.bg, fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "inherit", outline: "none", textAlign: "center", MozAppearance: "textfield", appearance: "textfield" }} />
                      <span style={{ fontSize: 12, color: T.textMut, fontWeight: 500 }}>XP à 100 %</span>
                    </div>
                  )}
                </div>
              </StackField>
            </div>

          </div>
      )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */
function StatStrip({ kpis, goals, compute }) {
  const now = new Date();

  // Objectifs actifs (pas atteints, non archivés)
  const active = goals.filter(g => {
    const { pct, current, target } = compute(g);
    return g.autoType === "max_dd" ? current > target : pct < 100;
  });

  // Objectifs actifs avec deadline dans le mois courant
  const dueThisMonth = active.filter(g => {
    if (!g.deadline) return false;
    const d = new Date(g.deadline + "T23:59:59");
    if (isNaN(d.getTime())) return false;
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  // Prochaine deadline à venir (objectif actif)
  const upcoming = (() => {
    const list = active
      .filter(g => g.deadline)
      .map(g => ({ g, d: new Date(g.deadline + "T23:59:59") }))
      .filter(x => !isNaN(x.d.getTime()) && x.d >= now)
      .sort((a, b) => a.d - b.d);
    return list[0] || null;
  })();

  // Progression moyenne (% moyen sur tous les objectifs actifs)
  const avgProgress = active.length > 0
    ? Math.round(active.reduce((s, g) => s + compute(g).pct, 0) / active.length)
    : 0;

  // Bilan de rythme sur les objectifs actifs : combien sont en retard sur le
  // tempo nécessaire pour tenir leur échéance.
  const behindCount = active.reduce((n, g) => {
    const { current, target, pct } = compute(g);
    const p = computeGoalPace(g, current, target, pct);
    return n + (p && (p.status === "behind" || p.status === "ended") ? 1 : 0);
  }, 0);
  const paceLabel = active.length === 0
    ? "—"
    : behindCount > 0
      ? `${behindCount} en retard sur le rythme`
      : "Tout dans les temps";

  // Taux de succès global
  const successRate = kpis.total > 0 ? Math.round((kpis.achieved / kpis.total) * 100) : 0;

  return (
    <div style={{ display: "flex", background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      <StatCell
        icon={Calendar}
        label="Objectifs ce mois"
        subLabel={`${active.length} actif${active.length > 1 ? "s" : ""} au total`}
        value={`${dueThisMonth.length}`}
      />
      <StatCell
        icon={TrendingUp}
        label="Progression moyenne"
        subLabel={paceLabel}
        value={`${avgProgress}%`}
      />
      <StatCell
        icon={Clock}
        label="Prochaine échéance"
        subLabel={upcoming ? upcoming.g.label : "Aucune deadline"}
        value={upcoming ? upcoming.d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—"}
      />
      <StatCell
        icon={Trophy}
        label="Objectifs atteints"
        subLabel={kpis.total > 0 ? `${successRate}% de réussite` : "—"}
        value={`${kpis.achieved}/${kpis.total}`}
        isLast
      />
    </div>
  );
}
function StatCell({ icon: Icon, label, subLabel, value, isLast }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: 16, borderRight: isLast ? "none" : `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {Icon && (
          <div style={{ width: 26, height: 26, borderRadius: "var(--radius-card)", background: T.accentBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={14} strokeWidth={1.75} color={T.text} />
          </div>
        )}
        <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: T.text, letterSpacing: -0.2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textMut, fontWeight: 500, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subLabel}</div>
    </div>
  );
}

function TimelineSection({ title, rows, compute, unitOf, fmtVal, onEdit, onDelete, onDuplicate, onTogglePin, onSetPinnedOpen, onAdjustManual, onSetManual, onSubtasksChange, doneSection, drag, setDrag, onDrop, drawerOpen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, letterSpacing: -0.1, padding: "0 16px 8px" }}>{title}</div>
      {rows.map(g => (
        <TimelineRow key={g.id} goal={g}
          compute={compute} unitOf={unitOf} fmtVal={fmtVal}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onTogglePin={onTogglePin}
          onSetPinnedOpen={onSetPinnedOpen}
          onAdjustManual={onAdjustManual}
          onSetManual={onSetManual}
          onSubtasksChange={onSubtasksChange}
          doneSection={doneSection}
          drag={drag} setDrag={setDrag} onDrop={onDrop}
          drawerOpen={drawerOpen}
        />
      ))}
    </div>
  );
}

function TimelineRow({ goal: g, compute, unitOf, fmtVal, onEdit, onDelete, onDuplicate, onTogglePin, onSetPinnedOpen, onAdjustManual, onSetManual, onSubtasksChange, doneSection, drag, setDrag, onDrop, nested, drawerOpen }) {
  const cat = CATEGORIES.find(c => c.id === g.category) || CATEGORIES[0];
  const Ic = cat.icon;
  const { current, target, pct, rawPct } = compute(g);
  const unit = unitOf(g);
  // Objectif « dans le rouge » : progression réelle négative (ex. compte de
  // trading en perte). rawPct peut manquer sur d'anciens calculs → fallback pct.
  const displayPct = rawPct != null ? rawPct : pct;
  const isNegative = displayPct < 0;
  const dl = daysLeft(g.deadline);
  const isAchieved = doneSection || (g.autoType === "max_dd" ? current <= target : pct >= 100);
  const atRisk = !isAchieved && dl !== null && dl < 3 && pct < 80;
  // Rythme : avancement réel vs avancement attendu sur la fenêtre de l'objectif.
  const pace = computeGoalPace(g, current, target, pct);

  // Date de création courte (format 09:05 si created same day, ou dd MMM)
  const createdLabel = (() => {
    const d = new Date(g.id); // l'id est un timestamp
    if (isNaN(d.getTime())) return "—";
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  })();

  const dueLabel = g.deadline
    ? new Date(g.deadline + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  const [hover, setHover] = useState(false);
  const [openLocal, setOpenLocal] = useState(false);
  // Quand le goal est épinglé, l'état ouvert/fermé est lu et persisté sur
  // l'objet goal (`pinnedOpen`). Sinon on garde un state local éphémère.
  const open = g.pinned ? !!g.pinnedOpen : openLocal;
  const setOpen = (val) => {
    const next = typeof val === "function" ? val(open) : val;
    if (g.pinned) onSetPinnedOpen?.(g.id, next);
    else setOpenLocal(next);
  };
  const [armed, setArmed] = useState(false);
  const prevSubCount = useRef((g.subtasks || []).length);
  useEffect(() => {
    const count = (g.subtasks || []).length;
    if (count > prevSubCount.current) setOpen(true);
    prevSubCount.current = count;
  }, [g.subtasks]);
  const longPressTimer = useRef(null);
  const pressedRef = useRef(false);
  const subtasks = g.subtasks || [];

  // Objectifs manuels : la molette sur la valeur « courant / cible » fait
  // avancer (vers le haut) ou reculer (vers le bas) la progression, sans ouvrir
  // le formulaire. Listener non-passif pour pouvoir bloquer le scroll de la page.
  const valueRef = useRef(null);
  useEffect(() => {
    const el = valueRef.current;
    if (!el || g.autoType !== "manual" || !onAdjustManual) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onAdjustManual(g.id, e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [g.autoType, g.id, onAdjustManual]);

  // Édition au clavier de la progression manuelle (clic sur le chiffre courant).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const startEdit = () => { setDraft(String(current ?? 0)); setEditing(true); };
  const commitEdit = () => { if (onSetManual) onSetManual(g.id, draft); setEditing(false); };

  const isDragging = drag?.sourceId === g.id;
  const isOver = drag?.overId === g.id && drag?.sourceId && drag.sourceId !== g.id;
  const overMode = isOver ? drag.mode : null;

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    pressedRef.current = false;
    if (drag?.sourceId !== g.id) setArmed(false);
  };

  const handlePointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("button, input, a")) return;
    pressedRef.current = true;
    longPressTimer.current = setTimeout(() => {
      if (pressedRef.current) setArmed(true);
    }, 5);
  };

  const handleDragStart = (e) => {
    if (!armed) { e.preventDefault(); return; }
    setDrag && setDrag({ sourceId: g.id, overId: null, mode: null });
    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(g.id)); } catch {}
  };

  const handleDragOver = (e) => {
    if (!drag?.sourceId || drag.sourceId === g.id) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "move"; } catch {}
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let mode = "into";
    if (y < h * 0.28) mode = "before";
    else if (y > h * 0.72) mode = "after";
    if (drag.overId !== g.id || drag.mode !== mode) setDrag({ ...drag, overId: g.id, mode });
  };

  const handleDragLeave = (e) => {
    if (!drag?.sourceId) return;
    const rel = e.relatedTarget;
    if (rel && e.currentTarget.contains(rel)) return;
    if (drag.overId === g.id) setDrag({ ...drag, overId: null, mode: null });
  };

  const handleDropEvt = (e) => {
    if (!drag?.sourceId) return;
    e.preventDefault();
    const mode = drag.mode || "into";
    onDrop && onDrop(drag.sourceId, g.id, mode);
    setDrag({ sourceId: null, overId: null, mode: null });
    setArmed(false);
    pressedRef.current = false;
  };

  const handleDragEnd = () => {
    setDrag && setDrag({ sourceId: null, overId: null, mode: null });
    setArmed(false);
    pressedRef.current = false;
  };

  return (
    <>
      <div
        className="tr4de-goals-row"
        draggable={armed}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropEvt}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => {
          if (armed || drag?.sourceId) { e.preventDefault(); return; }
          // Toggle l'expansion (persisté si épinglé, transient sinon).
          setOpen(v => !v);
          // Si le drawer d'édition est ouvert, on bascule l'objectif édité.
          if (drawerOpen) onEdit(g);
        }}
        style={{
          display: "grid",
          gridTemplateColumns: nested
            ? "minmax(0, 1fr) minmax(80px, 130px) minmax(110px, 160px) 120px"
            : "minmax(70px, 110px) minmax(0, 1fr) minmax(90px, 160px) minmax(110px, 160px) 124px",
          gap: nested ? 10 : 12,
          alignItems: "center",
          padding: nested ? "8px 10px" : "12px 16px",
          background: overMode === "into" ? T.blueBg : (hover || open ? T.accentBg : (nested ? T.white : "transparent")),
          border: nested ? `1px solid ${T.border}` : "none",
          borderRadius: "var(--radius-card)",
          cursor: armed ? "grabbing" : "pointer",
          transition: "background .12s ease",
          opacity: isDragging ? 0.45 : 1,
          boxShadow: overMode === "before" ? `inset 0 2px 0 0 ${T.blue}`
                  : overMode === "after"  ? `inset 0 -2px 0 0 ${T.blue}`
                  : "none",
          userSelect: armed ? "none" : "auto",
          touchAction: armed ? "none" : "auto",
        }}
      >
        {!nested && (
          <div style={{ fontSize: 12, color: T.textMut, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{createdLabel}</div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: nested ? 10 : 12, minWidth: 0 }}>
          {/* Icon bubble — fond plein à la couleur de la catégorie,
              icône en blanc pour le contraste. */}
          <div style={{
            width: nested ? 26 : 34, height: nested ? 26 : 34, borderRadius: "50%",
            background: isAchieved ? T.accentBg : `color-mix(in srgb, ${cat.color} 80%, transparent)`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            color: isAchieved ? T.textMut : "#FFFFFF",
          }}>
            <Ic size={nested ? 12 : 15} strokeWidth={2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: nested ? 12.5 : 13, fontWeight: 600,
              color: T.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              textDecoration: doneSection ? "line-through" : "none",
            }}>{g.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, fontSize: 11, color: T.textMut, overflow: "hidden", whiteSpace: "nowrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{cat.label}</span>
              {(() => {
                const lv = LEVELS.find(l => l.id === (g.level || "normal")) || LEVELS[1];
                return (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "2px 8px", borderRadius: 999,
                    color: lv.color,
                    background: `color-mix(in srgb, ${lv.color} 10%, transparent)`,
                  }}>{lv.label}</span>
                );
              })()}
              {(g.subtasks || []).length > 0 && (() => {
                const countAll = (arr) => arr.reduce((acc, s) => {
                  acc.total += 1;
                  if (s.done) acc.done += 1;
                  const child = countAll(s.subtasks || []);
                  acc.total += child.total;
                  acc.done += child.done;
                  return acc;
                }, { total: 0, done: 0 });
                const { total, done } = countAll(g.subtasks);
                return (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "2px 8px", borderRadius: 999,
                    color: T.textSub, background: T.accentBg,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    <Check size={9} strokeWidth={2.5} />
                    {done}/{total}
                  </span>
                );
              })()}
              {!isAchieved && pace ? (
                <span title={pace.expectedPct > 0 && pace.expectedPct < 100 ? `Rythme attendu : ${pace.expectedPct}% à ce stade` : undefined}
                  style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "2px 8px", borderRadius: 999,
                    color: pace.color, background: `color-mix(in srgb, ${pace.color} 10%, transparent)`,
                    flexShrink: 0,
                  }}>{pace.label}</span>
              ) : (atRisk && <span style={{ color: T.amber, marginLeft: 2, fontWeight: 600 }}>· à risque</span>)}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>
          {dueLabel}
          {dl !== null && !isAchieved && (
            <div style={{ fontSize: 10, color: dl < 0 ? T.red : dl <= 3 ? T.amber : T.textMut, fontWeight: 500, marginTop: 1 }}>
              {dl < 0 ? `${Math.abs(dl)}j dépassée` : dl === 0 ? "aujourd'hui" : `${dl}j restants`}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: T.text }}>
          <span ref={valueRef}
            title={g.autoType === "manual" && !editing ? "Clic pour saisir · molette ↕ pour ajuster" : undefined}
            style={{
              display: "inline-block",
              cursor: g.autoType === "manual" && !editing ? "ns-resize" : "default",
              padding: g.autoType === "manual" ? "1px 5px" : 0,
              margin: g.autoType === "manual" ? "0 -5px" : 0,
              borderRadius: "var(--radius-field)",
              background: g.autoType === "manual" && hover && !editing ? T.accentBg : "transparent",
              transition: "background .12s ease",
            }}>
            {g.autoType === "manual" && editing ? (
              <input
                type="number" autoFocus value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitEdit();
                  else if (e.key === "Escape") setEditing(false);
                }}
                onBlur={commitEdit}
                style={{ width: 52, padding: "1px 4px", border: `1px solid ${T.text}`, borderRadius: "var(--radius-field)", background: T.white, fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "inherit", outline: "none", textAlign: "center", MozAppearance: "textfield", appearance: "textfield" }}
              />
            ) : (
              <span
                onPointerDown={g.autoType === "manual" ? (e) => e.stopPropagation() : undefined}
                onClick={g.autoType === "manual" ? (e) => { e.stopPropagation(); startEdit(); } : undefined}
                style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtVal(current, unit)}</span>
            )}
            <span style={{ color: T.textMut, margin: "0 3px" }}>/</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtVal(target, unit)}</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              {/* Repère « où je devrais en être » : petit triangle POSÉ au-dessus de
                  la barre (ne la traverse pas), pointant vers le niveau attendu. */}
              {!isAchieved && pace && pace.expectedPct > 0 && pace.expectedPct < 100 && (
                <div title={`Tu devrais être à ${pace.expectedPct}% à ce stade`}
                  style={{
                    position: "absolute", top: -5, left: `${pace.expectedPct}%`, transform: "translateX(-50%)",
                    width: 0, height: 0,
                    borderLeft: "3px solid transparent", borderRight: "3px solid transparent",
                    borderTop: `4px solid ${T.textMut}`,
                  }} />
              )}
              <div role="progressbar" aria-valuenow={Math.max(0, Math.min(100, Math.round(pct)))} aria-valuemin={0} aria-valuemax={100} aria-label={`Progression : ${Math.round(displayPct)}%`}
                style={{ height: 3, background: T.accentBg, borderRadius: "var(--radius-field)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: isNegative ? T.red : isAchieved ? T.green : pct >= 50 ? T.blue : T.amber, borderRadius: "var(--radius-field)", transition: "width .4s ease" }} />
              </div>
            </div>
            {/* Pourcentage d'avancement à droite de la barre (négatif si dans le rouge). */}
            <span style={{
              fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums",
              color: isNegative ? T.red : isAchieved ? T.green : T.textSub,
              flexShrink: 0, minWidth: 30, textAlign: "right",
            }}>{Math.round(displayPct)}%</span>
          </div>
          {/* Rythme requis pour tenir l'échéance (métriques additives uniquement). */}
          {!isAchieved && pace?.requiredRate != null && (
            <div title="Ce qu'il reste à accomplir, réparti sur le temps restant jusqu'à l'échéance (jours de bourse pour le trading : le week-end ne compte pas)"
              style={{ fontSize: 9, color: T.textMut, fontWeight: 500, marginTop: 4, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ≈ {fmtVal(pace.requiredRate, unit)}/{pace.rateUnit === "semaine" ? "sem." : pace.rateUnit === "mois" ? "mois" : "j"} requis
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 2, justifyContent: "flex-end", alignItems: "center" }}>
          <ChevronRight size={12} strokeWidth={2}
            color={T.textMut}
            style={{
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform .15s ease",
              flexShrink: 0,
              marginRight: 2,
              opacity: subtasks.length > 0 || hover ? 1 : 0,
            }}
          />
          <div style={{ display: "flex", gap: 2, opacity: (hover || g.pinned) ? 1 : 0, transition: "opacity .12s ease" }}>
          <button onClick={(e) => { e.stopPropagation(); onEdit(g); }}
            aria-label="Modifier"
            style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s ease, color .12s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
            <Pencil size={11} strokeWidth={1.75} />
          </button>
          {onDuplicate && (
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(g.id); }}
              aria-label="Dupliquer"
              title="Dupliquer"
              style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s ease, color .12s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
              <Copy size={11} strokeWidth={1.75} />
            </button>
          )}
          {onTogglePin && (
            <button onClick={(e) => { e.stopPropagation(); onTogglePin(g.id); }}
              aria-label={g.pinned ? "Désépingler" : "Épingler"}
              title={g.pinned ? "Désépingler" : "Épingler"}
              style={{
                width: 24, height: 24, borderRadius: 6, border: "none",
                background: g.pinned ? T.accentBg : "transparent",
                color: g.pinned ? T.text : T.textMut,
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                transition: "background .15s ease, color .12s ease",
              }}
              onMouseEnter={(e) => { if (!g.pinned) { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; } }}
              onMouseLeave={(e) => { if (!g.pinned) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; } }}>
              <Pin size={11} strokeWidth={1.75} style={{ transform: g.pinned ? "rotate(-30deg)" : "none", transition: "transform .15s ease" }} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDelete(g.id); }}
            aria-label="Supprimer"
            style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s ease, color .12s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
            <Trash2 size={11} strokeWidth={1.75} />
          </button>
          </div>
        </div>
      </div>

      {open && (
        <div style={{
          margin: nested ? "0 0 4px" : "0 16px 8px",
          padding: nested ? "8px 10px" : "4px 14px 12px",
          background: T.accentBg,
          borderRadius: "var(--radius-card)",
          borderTop: `1px solid ${T.border}`,
          marginTop: -2,
        }}>
          {!nested && <RoadmapStrip subtasks={subtasks} deadline={g.deadline} createdAt={g.createdAt || g.id} />}
          {subtasks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {(() => {
                // Les sous-objectifs++ (objectifs déposés ici) passent toujours
                // avant les sous-tâches simples, peu importe la deadline.
                const goalSubs = sortByDeadline(subtasks.filter(s => s.autoType));
                const simpleSubs = sortByDeadline(subtasks.filter(s => !s.autoType));
                return [...goalSubs, ...simpleSubs];
              })().map((s) => (
                s.autoType ? (
                  <div key={s.id} style={{ position: "relative", paddingLeft: 28 }}>
                    <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 2, background: T.border, borderRadius: "var(--radius-field)" }} />
                    <div style={{ position: "absolute", left: 10, top: "50%", width: 14, height: 2, background: T.border, borderRadius: "var(--radius-field)" }} />
                    <TimelineRow
                      goal={s}
                      compute={compute} unitOf={unitOf} fmtVal={fmtVal}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                      onTogglePin={onTogglePin}
                      onSetPinnedOpen={onSetPinnedOpen}
                      onAdjustManual={onAdjustManual}
                      onSetManual={onSetManual}
                      onSubtasksChange={onSubtasksChange}
                      drag={drag} setDrag={setDrag} onDrop={onDrop}
                      drawerOpen={drawerOpen}
                      nested
                    />
                  </div>
                ) : (
                  <div key={s.id} style={{ position: "relative", paddingLeft: 28 }}>
                    <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 2, background: T.border, borderRadius: "var(--radius-field)" }} />
                    <div style={{ position: "absolute", left: 10, top: 14, width: 14, height: 2, background: T.border, borderRadius: "var(--radius-field)" }} />
                    <SubtaskNode
                      node={s}
                      onChange={(next) => onSubtasksChange(g.id, subtasks.map(x => x.id === s.id ? next : x))}
                      onRemove={() => onSubtasksChange(g.id, subtasks.filter(x => x.id !== s.id))}
                    />
                  </div>
                )
              ))}
            </div>
          )}
          <SubtaskAdder
            onAdd={(label) => onSubtasksChange(g.id, [...subtasks, { id: Date.now(), label, done: false, subtasks: [] }])}
          />
        </div>
      )}
    </>
  );
}


function EmptyState({ onClick }) {
  return (
    <div style={{ background: T.white, border: `1px dashed ${T.border}`, borderRadius: 14, padding: "56px 24px", textAlign: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "var(--radius-card)", background: T.accentBg, marginBottom: 12 }}>
        <Target size={22} strokeWidth={1.75} color={T.textSub} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6, letterSpacing: -0.1 }}>Pas d&apos;objectif pour le moment</div>
      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 16, maxWidth: 380, margin: "0 auto 16px" }}>Crée ton premier objectif pour commencer à suivre ta progression.</div>
      <button onClick={onClick}
        style={{ padding: "8px 20px", borderRadius: 999, background: T.white, color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${T.text}`, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Plus size={13} strokeWidth={2} /> Créer un objectif
      </button>
    </div>
  );
}

/* ---------- Tiny helpers ---------- */
// Dropdown stylé (popover) — remplace les <select> natifs
// Champ Deadline : dropdown de presets à gauche + popover calendrier custom
function DeadlineField({ value, onChange }) {
  const today = new Date();
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const plusMonths = (n) => { const d = new Date(today); d.setMonth(d.getMonth() + n); return d; };
  const plusYears = (n) => { const d = new Date(today); d.setFullYear(d.getFullYear() + n); return d; };

  const presets = [
    { id: toISO(endOfMonth),     label: "Ce mois" },
    { id: toISO(plusMonths(1)),  label: "Dans 1 mois" },
    { id: toISO(plusMonths(2)),  label: "Dans 2 mois" },
    { id: toISO(plusMonths(3)),  label: "Dans 3 mois" },
    { id: toISO(plusMonths(6)),  label: "Dans 6 mois" },
    { id: toISO(plusYears(1)),   label: "Dans 1 an" },
  ];
  const activePreset = presets.find(p => p.id === value);

  const [calOpen, setCalOpen] = useState(false);
  const calBtnRef = React.useRef(null);
  const calPopRef = React.useRef(null);
  const [calRect, setCalRect] = useState(null);
  useEffect(() => {
    if (!calOpen) { setCalRect(null); return; }
    const update = () => { if (calBtnRef.current) setCalRect(calBtnRef.current.getBoundingClientRect()); };
    update();
    const onDoc = (e) => {
      if ((calPopRef.current && calPopRef.current.contains(e.target)) ||
          (calBtnRef.current && calBtnRef.current.contains(e.target))) return;
      setCalOpen(false);
    };
    const onScroll = (e) => {
      if (calPopRef.current && calPopRef.current.contains(e.target)) return;
      setCalOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", update);
    };
  }, [calOpen]);

  // État du mois affiché dans le popover
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });

  return (
    <StackField label="Deadline">
      {/* Dropdown de presets (colé à gauche) */}
      <div style={{ flex: "0 0 auto" }}>
        <FancyDropdown
          value={activePreset ? activePreset.id : "__custom"}
          options={[...presets, { id: "__custom", label: value && !activePreset
            ? new Date(value + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
            : "Personnalisée…" }]}
          onChange={(v) => { if (v !== "__custom") onChange(v); }}
          align="left"
          renderValue={(opt) => (
            <span style={{ fontSize: 14, fontWeight: 400, color: value ? T.text : T.textMut }}>
              {value ? (activePreset ? activePreset.label : new Date(value + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })) : "Choisir…"}
            </span>
          )}
          renderOption={(opt, active) => (
            <>
              <span style={{ flex: 1 }}>{opt.label}</span>
              {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
            </>
          )}
        />
      </div>
      {/* Bouton calendrier : poussé à droite */}
      <div style={{ position: "relative", flexShrink: 0, marginLeft: "auto" }}>
        <button ref={calBtnRef} type="button" title="Choisir une date" onClick={() => setCalOpen(v => !v)}
          style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: calOpen ? T.accentBg : T.white, color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Calendar size={13} strokeWidth={1.75} />
        </button>
        {calOpen && calRect && typeof document !== "undefined" && ReactDOM.createPortal(
          (() => {
            const POPOVER_H = 320;
            const vh = typeof window !== "undefined" ? window.innerHeight : 800;
            const wouldOverflow = calRect.bottom + POPOVER_H + 12 > vh;
            const top = wouldOverflow ? Math.max(4, vh - POPOVER_H - 4) :calRect.bottom + 6;
            return (
              <div ref={calPopRef}
                style={{ position: "fixed", top, right: Math.max(8, (typeof window !== "undefined" ? window.innerWidth : 0) - calRect.right), zIndex: 10000 }}>
                <MiniCalendar
                  value={value}
                  viewDate={viewDate}
                  setViewDate={setViewDate}
                  onPick={(iso) => { onChange(iso); setCalOpen(false); }}
                />
              </div>
            );
          })(),
          document.body
        )}
      </div>
    </StackField>
  );
}

// Popover calendrier 1 mois, à la DateRangePicker
function MiniCalendar({ value, viewDate, setViewDate, onPick }) {
  const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const WD = ["L", "M", "M", "J", "V", "S", "D"];
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const dow = first.getDay(); // 0 = dim
  const lead = dow === 0 ? 6 : dow - 1; // Lundi en 1ère colonne
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const selected = value ? new Date(value + "T00:00:00") : null;
  const todayISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const goPrev = () => setViewDate(new Date(year, month - 1, 1));
  const goNext = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div style={{
      position: "absolute", top: "calc(100% + 6px)", right: 0,
      width: 280, background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)",
      boxShadow: "var(--elev-overlay)", zIndex: 200, padding: 12,
    }}>
      {/* Header mois */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" onClick={goPrev}
          style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} />
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{MONTHS[month]} {year}</div>
        <button type="button" onClick={goNext}
          style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>

      {/* Weekdays */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {WD.map((w, i) => (
          <div key={i} style={{ fontSize: 10, color: T.textMut, textAlign: "center", padding: "4px 0", fontWeight: 500 }}>{w}</div>
        ))}
      </div>

      {/* Jours */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = toISO(d);
          const isSel = selected && toISO(selected) === iso;
          const isToday = iso === todayISO;
          return (
            <button key={i} type="button" onClick={() => onPick(iso)}
              style={{
                width: "100%", aspectRatio: "1 / 1",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: isSel ? 600 : 500,
                color: isSel ? T.white : T.text,
                background: isSel ? T.text : "transparent",
                border: isToday && !isSel ? `1px solid ${T.border2 || T.border}` : "none",
                borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                transition: "background .1s ease",
              }}
              onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = T.accentBg; }}
              onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Body du dropdown : si les options ont un champ `group`, on affiche un
// mini-menu avec drill-down (clic sur une catégorie → items de la catégorie
// avec un bouton retour). Sinon liste plate.
function DropdownBody({ options, value, onSelect, renderOption }) {
  const hasGroups = options.some(o => o.group);
  // Catégorie courante (null = niveau racine). On n'ouvre PAS sur un groupe
  // qui ne contient qu'un seul item — il est de toute façon montré à la
  // racine, sans dossier intermédiaire.
  const current = options.find(o => o.id === value);
  const initialGroup = (() => {
    const g = current?.group;
    if (!g) return null;
    const count = options.filter(o => (o.group || "Autres") === g).length;
    return count > 1 ? g : null;
  })();
  const [activeGroup, setActiveGroup] = useState(initialGroup);

  if (!hasGroups) {
    return options.map(o => (
      <DropdownItem key={o.id} option={o} active={value === o.id}
        renderOption={renderOption} onSelect={() => onSelect(o.id)} />
    ));
  }

  // Construit la liste des groupes et items "racine" (sans group ou groupe à 1 entrée)
  const groupOrder = [];
  const groups = {};
  options.forEach(o => {
    const g = o.group || "Autres";
    if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
    groups[g].push(o);
  });

  if (activeGroup && groups[activeGroup]) {
    return (
      <>
        <button type="button"
          onClick={() => setActiveGroup(null)}
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 6, border: "none",
            background: "transparent", cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6, textAlign: "left",
            fontSize: 11, fontWeight: 600, color: T.textMut,
            textTransform: "uppercase", letterSpacing: 0.4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.bg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <ChevronRight size={12} strokeWidth={2} style={{ transform: "rotate(180deg)" }} />
          {activeGroup}
        </button>
        <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
        {groups[activeGroup].map(o => (
          <DropdownItem key={o.id} option={o} active={value === o.id}
            renderOption={renderOption} onSelect={() => onSelect(o.id)} />
        ))}
      </>
    );
  }

  // Vue racine : 1 entrée par groupe (ou item direct si groupe à 1)
  return groupOrder.map(gName => {
    const items = groups[gName];
    if (items.length === 1) {
      const o = items[0];
      return (
        <DropdownItem key={o.id} option={o} active={value === o.id}
          renderOption={renderOption} onSelect={() => onSelect(o.id)} />
      );
    }
    const isActiveGroup = items.some(o => o.id === value);
    return (
      <button key={gName} type="button"
        onClick={() => setActiveGroup(gName)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 6, border: "none",
          background: isActiveGroup ? T.accentBg : "transparent",
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 8, textAlign: "left",
          fontSize: 13, fontWeight: isActiveGroup ? 600 : 500, color: T.text,
          transition: "background .12s ease",
        }}
        onMouseEnter={(e) => { if (!isActiveGroup) e.currentTarget.style.background = T.bg; }}
        onMouseLeave={(e) => { if (!isActiveGroup) e.currentTarget.style.background = "transparent"; }}>
        <span style={{ flex: 1 }}>{gName}</span>
        <span style={{ fontSize: 10, color: T.textMut, fontWeight: 500 }}>{items.length}</span>
        <ChevronRight size={12} strokeWidth={2} color={T.textMut} />
      </button>
    );
  });
}

function DropdownItem({ option: o, active, onSelect, renderOption }) {
  return (
    <button type="button"
      onClick={onSelect}
      style={{
        width: "100%", padding: "8px 10px", borderRadius: 6, border: "none",
        background: active ? T.accentBg : "transparent",
        cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: 8, textAlign: "left",
        fontSize: 13, fontWeight: active ? 600 : 500, color: T.text,
        transition: "background .12s ease",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.bg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      {renderOption ? renderOption(o, active) : o.label}
    </button>
  );
}

function FancyDropdown({ value, options, onChange, renderValue, renderOption, align = "right" }) {
  const [open, setOpen] = useState(false);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!open) { setRect(null); return; }
    const update = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    update();
    const onDoc = (e) => {
      if ((menuRef.current && menuRef.current.contains(e.target)) ||
          (btnRef.current && btnRef.current.contains(e.target))) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  const selected = options.find(o => o.id === value) || options[0];
  const menuStyle = rect ? {
    position: "fixed",
    top: rect.bottom + 6,
    minWidth: Math.max(200, rect.width),
    background: T.white, border: `1px solid ${T.border}`, borderRadius: 10,
    boxShadow: "var(--elev-overlay)",
    padding: 4, zIndex: 10000, maxHeight: 320, overflowY: "auto",
    ...(align === "left"
      ? { left: rect.left }
      : { right: Math.max(8, (typeof window !== "undefined" ? window.innerWidth : 0) - rect.right) }),
  } : null;
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button ref={btnRef} type="button" onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", padding: 0, border: "none", background: "transparent",
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: align === "left" ? "flex-start" : "flex-end", gap: 6,
          color: T.text,
        }}>
        {renderValue ? renderValue(selected) : (
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{selected?.label}</span>
        )}
        <ChevronDown size={14} strokeWidth={1.75} color={T.textMut}
          style={{ transition: "transform .15s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }} />
      </button>
      {open && rect && typeof document !== "undefined" && ReactDOM.createPortal(
        <div ref={menuRef} style={menuStyle}>
          <DropdownBody
            options={options} value={value} renderOption={renderOption}
            onSelect={(id) => { onChange(id); setOpen(false); }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

function sortByDeadline(arr) {
  return [...(arr || [])].sort((a, b) => {
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (da !== db) return da - db;
    return (a.id || 0) - (b.id || 0);
  });
}

function countSubtasks(arr) {
  return (arr || []).reduce((acc, s) => {
    acc.total += 1;
    if (s.done) acc.done += 1;
    const child = countSubtasks(s.subtasks || []);
    acc.total += child.total;
    acc.done += child.done;
    return acc;
  }, { total: 0, done: 0 });
}

function DateChip({ value, onChange, placeholder = "Date" }) {
  const [open, setOpen] = useState(false);
  const btnRef = React.useRef(null);
  const popRef = React.useRef(null);
  const [rect, setRect] = useState(null);
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });
  useEffect(() => {
    if (!open) { setRect(null); return; }
    const update = () => { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); };
    update();
    const onDoc = (e) => {
      if ((popRef.current && popRef.current.contains(e.target)) ||
          (btnRef.current && btnRef.current.contains(e.target))) return;
      setOpen(false);
    };
    const onScroll = (e) => {
      // On laisse passer le scroll interne du popover lui-même.
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const label = value
    ? new Date(value + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
    : placeholder;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button ref={btnRef} type="button" onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 8px", borderRadius: 999,
          border: `1px dashed ${value ? "transparent" : T.border}`,
          background: value ? T.accentBg : "transparent",
          color: value ? T.text : T.textMut,
          fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
        }}>
        <Calendar size={10} strokeWidth={1.75} />
        {label}
        {value && (
          <span onClick={(e) => { e.stopPropagation(); onChange(""); }}
            style={{ marginLeft: 2, color: T.textMut, fontSize: 11, lineHeight: 1 }}>×</span>
        )}
      </button>
      {open && rect && typeof document !== "undefined" && ReactDOM.createPortal(
        (() => {
          // Si le calendrier débordait par le bas de la fenêtre, on le colle
          // juste au-dessus de la fin de la page (8 px de marge).
          const POPOVER_H = 320;
          const vh = typeof window !== "undefined" ? window.innerHeight : 800;
          const wouldOverflow = rect.bottom + POPOVER_H + 12 > vh;
          const top = wouldOverflow ? Math.max(4, vh - POPOVER_H - 4) : rect.bottom + 6;
          return (
            <div ref={popRef} onClick={(e) => e.stopPropagation()}
              style={{ position: "fixed", top, left: rect.left, zIndex: 10000 }}>
              <MiniCalendar
                value={value}
                viewDate={viewDate}
                setViewDate={setViewDate}
                onPick={(iso) => { onChange(iso); setOpen(false); }}
              />
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}

function NoteChip({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const hasNote = !!(value || "").trim();
  if (!editing && !hasNote) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 8px", borderRadius: 999,
          border: `1px dashed ${T.border}`, background: "transparent",
          color: T.textMut, fontSize: 11, fontWeight: 500,
          cursor: "pointer", fontFamily: "inherit",
        }}>
        <BookOpen size={10} strokeWidth={1.75} /> Ajouter une note
      </button>
    );
  }
  return (
    <textarea
      autoFocus={editing}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onClick={(e) => e.stopPropagation()}
      placeholder="Note…"
      rows={2}
      style={{
        flex: 1, minWidth: 200,
        padding: "6px 10px",
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
        fontSize: 12, color: T.text, outline: "none",
        fontFamily: "inherit", resize: "vertical",
        lineHeight: 1.4,
      }}
    />
  );
}

function RoadmapDot({ item: it, pct, color }) {
  const [hover, setHover] = useState(false);
  const dateLabel = it._date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  // Le dernier élément du chemin est l'item lui-même ; les autres sont ses ancêtres.
  const ancestors = (it._path || []).slice(0, -1).filter(Boolean);
  const onLeftHalf = pct > 60;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        // Hit-area élargie (28×28) centrée sur le point visible — plus
        // facile à cibler. Le point lui-même garde sa taille (12×12) en
        // tant qu'enfant, sans pointer-events.
        position: "absolute", top: -3, left: `${pct}%`,
        transform: "translateX(-50%)",
        width: 28, height: 28,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent",
        cursor: "default",
      }}>
      <div style={{
        width: 12, height: 12, borderRadius: "50%",
        background: color,
        border: `2px solid ${T.white}`,
        boxShadow: hover
          ? "0 0 0 3px rgba(59,130,246,0.20), 0 2px 6px rgba(0,0,0,0.18)"
          : "0 0 0 1px rgba(0,0,0,0.06)",
        opacity: it._depth >= 2 && !it.level ? 0.7 : 1,
        transition: "box-shadow .12s ease, transform .12s ease",
        pointerEvents: "none",
      }} />
      {hover && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)",
          [onLeftHalf ? "right" : "left"]: 0,
          padding: "8px 10px",
          background: T.white, color: T.text,
          border: `1px solid ${T.border}`,
          borderRadius: "var(--radius-card)", fontSize: 11, lineHeight: 1.35,
          whiteSpace: "nowrap", maxWidth: 260,
          boxShadow: "var(--elev-overlay)",
          pointerEvents: "none", zIndex: 10,
        }}>
          {ancestors.length > 0 && (
            <div style={{ fontSize: 10, color: T.textMut, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
              {ancestors.join(" › ")}
            </div>
          )}
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{it.label || "Sans titre"}</div>
          <div style={{ fontSize: 10, color: T.textMut, marginTop: 2 }}>{dateLabel}</div>
        </div>
      )}
    </div>
  );
}

function RoadmapStrip({ subtasks, deadline, createdAt }) {
  // Bornes fixes : début = date de création de l'objectif, fin = deadline.
  // La barre n'évolue plus avec le temps ; à la place, un curseur "Aujourd'hui"
  // se déplace le long pour montrer la progression.
  const start = (() => {
    if (createdAt == null) return null;
    const v = typeof createdAt === "number" ? new Date(createdAt) : new Date(createdAt);
    if (isNaN(v.getTime())) return null;
    v.setHours(0, 0, 0, 0);
    return v;
  })();
  const end = deadline ? new Date(deadline + "T23:59:59") : null;
  if (!start || !end || isNaN(end.getTime()) || end <= start) return null;

  // Aplatit récursivement l'arbre des sous-objectifs : on récupère aussi
  // les sous-sous-objectifs (sous-objectifs du sous-objectif imbriqué).
  // Chaque item garde la chaîne de ses ancêtres dans `_path` pour pouvoir
  // afficher au survol à quel objectif il est lié.
  const flatten = (arr, depth, parents) => {
    const out = [];
    (arr || []).forEach(s => {
      const path = [...parents, s.label];
      if (s.deadline) {
        const d = new Date(s.deadline + "T12:00:00");
        if (!isNaN(d.getTime())) out.push({ ...s, _date: d, _depth: depth, _path: path });
      }
      if (Array.isArray(s.subtasks) && s.subtasks.length > 0) {
        out.push(...flatten(s.subtasks, depth + 1, path));
      }
    });
    return out;
  };
  const items = flatten(subtasks, 1, []).sort((a, b) => a._date - b._date);

  const totalMs = end.getTime() - start.getTime();
  const now = Date.now();
  const todayPct = Math.max(0, Math.min(100, ((now - start.getTime()) / totalMs) * 100));

  // Couleur d'un point :
  //  - objectif (a un `level` de priorité) → couleur de sa priorité
  //  - sous-tâche simple à profondeur ≥ 2 (sous-objectif du sous-objectif++) → gris
  //  - sous-tâche simple à profondeur 1 → vert si done, sinon bleu
  const dotColor = (it) => {
    if (it.level) {
      const lv = LEVELS.find(l => l.id === it.level);
      if (lv) return lv.color;
    }
    if (it._depth >= 2) return T.textMut;
    return it.done ? T.green : T.blue;
  };

  return (
    <div style={{ marginBottom: 18, padding: "10px 12px", background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 10, color: T.textMut, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
        <span>{start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
        <span>{end.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
      </div>
      <div style={{ position: "relative", height: 22 }}>
        {/* Rail de fond */}
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, height: 2, background: T.accentBg, borderRadius: "var(--radius-field)" }} />
        {/* Portion écoulée (de la création à aujourd'hui) */}
        <div style={{ position: "absolute", top: 10, left: 0, width: `${todayPct}%`, height: 2, background: T.text, borderRadius: "var(--radius-field)" }} />
        {/* Curseur "Aujourd'hui" : pastille noire qui se déplace */}
        {todayPct >= 0 && todayPct <= 100 && (
          <div title="Aujourd'hui"
            style={{
              position: "absolute", top: 5, left: `${todayPct}%`, transform: "translateX(-50%)",
              width: 12, height: 12, borderRadius: "50%",
              background: T.text,
              border: `2px solid ${T.white}`,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.06)",
              zIndex: 2,
            }} />
        )}
        {items.map(it => {
          const pct = Math.max(0, Math.min(100, ((it._date.getTime() - start.getTime()) / totalMs) * 100));
          return (
            <RoadmapDot key={it.id} item={it} pct={pct} color={dotColor(it)} />
          );
        })}
      </div>
      {items.length === 0 && (
        <div style={{ fontSize: 11, color: T.textMut, textAlign: "center", marginTop: 4 }}>
          Ajoute des dates à tes sous-objectifs pour les voir sur la frise
        </div>
      )}
    </div>
  );
}

function SubtaskAdder({ onAdd, label = "Ajouter" }) {
  return (
    <button type="button"
      onClick={(e) => { e.stopPropagation(); onAdd(""); }}
      style={{
        alignSelf: "flex-start",
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 8px", marginTop: 4, marginLeft: 42,
        border: "none", background: "transparent",
        color: T.textMut, fontSize: 11, fontWeight: 500,
        cursor: "pointer", fontFamily: "inherit",
        borderRadius: 6, transition: "color .12s ease, background .12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.accentBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.background = "transparent"; }}>
      <Plus size={11} strokeWidth={2} /> {label}
    </button>
  );
}

function SubtaskNode({ node, onChange, onRemove, depth = 0 }) {
  const [open, setOpen] = useState(false);
  const children = node.subtasks || [];
  const { total, done } = countSubtasks(children);

  const updateChild = (sid, next) => {
    if (next === null) {
      onChange({ ...node, subtasks: children.filter(c => c.id !== sid) });
    } else {
      onChange({ ...node, subtasks: children.map(c => c.id === sid ? next : c) });
    }
  };
  const addChild = (label) => {
    const arr = [...children, { id: Date.now(), label, done: false, subtasks: [] }];
    onChange({ ...node, subtasks: arr });
    setOpen(true);
  };

  const hasChildren = children.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
        <button type="button" onClick={() => setOpen(v => !v)} aria-label={open ? "Replier" : "Déplier"}
          title={hasChildren ? (open ? "Replier" : "Déplier") : "Ajouter un sous-objectif"}
          style={{
            width: 18, height: 18, flexShrink: 0, borderRadius: "var(--radius-field)",
            border: "none", background: "transparent",
            color: T.textSub,
            cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
            opacity: hasChildren ? 1 : 0.55,
          }}>
          <ChevronRight size={12} strokeWidth={2}
            style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} />
        </button>
        <button type="button" onClick={() => onChange({ ...node, done: !node.done })}
          style={{
            width: 18, height: 18, flexShrink: 0, borderRadius: "var(--radius-field)",
            border: `1.5px solid ${node.done ? T.green : T.border}`,
            background: node.done ? T.green : T.white,
            color: "#fff", cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
          }}>
          {node.done && <Check size={11} strokeWidth={3} />}
        </button>
        <input
          type="text"
          value={node.label}
          autoFocus={!node.label}
          placeholder="Sans titre"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ ...node, label: e.target.value })}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 13, fontWeight: 400,
            color: node.done ? T.textMut : T.text,
            textDecoration: node.done ? "line-through" : "none",
            fontFamily: "inherit", padding: 0, minWidth: 0,
          }}
        />
        {total > 0 && (
          <span style={{ fontSize: 10, color: T.textMut, fontWeight: 500, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {done}/{total}
          </span>
        )}
        <button type="button" onClick={onRemove}
          title="Supprimer"
          style={{ width: 22, height: 22, borderRadius: "var(--radius-field)", border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
          <Trash2 size={11} strokeWidth={1.75} />
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 42, paddingBottom: 4, flexWrap: "wrap" }}>
        <DateChip
          value={node.deadline || ""}
          onChange={(iso) => onChange({ ...node, deadline: iso })}
          placeholder="Date"
        />
        <NoteChip
          value={node.note || ""}
          onChange={(v) => onChange({ ...node, note: v })}
        />
      </div>

      {open && (
        <div style={{ marginLeft: 22, paddingLeft: 10, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 2, paddingTop: 2, paddingBottom: 4 }}>
          {sortByDeadline(children).map((child) => (
            <SubtaskNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onChange={(next) => updateChild(child.id, next)}
              onRemove={() => updateChild(child.id, null)}
            />
          ))}
          <SubtaskAdder onAdd={addChild} placeholder="Ajouter un sous-objectif…" />
        </div>
      )}
    </div>
  );
}

function SubtasksField({ subtasks, onChange }) {
  const { total, done } = countSubtasks(subtasks);
  const updateById = (sid, next) => {
    if (next === null) onChange(subtasks.filter(s => s.id !== sid));
    else onChange(subtasks.map(s => s.id === sid ? next : s));
  };
  const add = (label) => onChange([...subtasks, { id: Date.now(), label, done: false, subtasks: [] }]);
  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500 }}>Sous-objectifs</div>
        {total > 0 && (
          <div style={{ fontSize: 11, color: T.textMut, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{done}/{total}</div>
        )}
      </div>

      {subtasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
          {sortByDeadline(subtasks).map((s) => (
            <SubtaskNode
              key={s.id}
              node={s}
              onChange={(next) => updateById(s.id, next)}
              onRemove={() => updateById(s.id, null)}
            />
          ))}
        </div>
      )}

      <SubtaskAdder onAdd={add} />
    </div>
  );
}

function StackField({ label, icon: Icon, valueColor, last, children }) {
  return (
    <div style={{
      padding: "14px 0",
      borderBottom: last ? "none" : `1px solid ${T.border}`,
    }}>
      <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", color: valueColor || T.text }}>
        {children}
        {Icon && <Icon size={14} strokeWidth={1.75} color={T.textMut} style={{ flexShrink: 0, marginLeft: 10 }} />}
      </div>
    </div>
  );
}
function stackInput() {
  return {
    flex: 1, background: "transparent", border: "none", outline: "none",
    fontSize: 14, fontWeight: 400, color: T.text, padding: 0,
    fontFamily: "inherit", letterSpacing: -0.05, minWidth: 0,
  };
}

function RowField({ label, children, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "16px 0",
      borderBottom: last ? "none" : `1px solid ${T.border}`,
    }}>
      <div style={{ fontSize: 13, color: T.textSub, fontWeight: 500, flexShrink: 0, minWidth: 120 }}>{label}</div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", flex: 1, minWidth: 0, justifyContent: "flex-end" }}>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, required, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: -0.05 }}>
          {label}
        </label>
        {required && <span style={{ color: T.red, fontSize: 12, fontWeight: 600 }}>*</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function DetailField({ label, children }) {
  return (
    <div style={{ background: T.bg, borderRadius: "var(--radius-card)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10, color: T.textMut, fontWeight: 500, textTransform: "none", letterSpacing: 0.2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 22 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, color: T.textMut, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}
function inputStyle() {
  return { width: "100%", padding: "8px 12px", border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", fontSize: 13, outline: "none", fontFamily: "inherit", color: T.text, background: T.white };
}
function iconBtnStyle() {
  return { width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
}
function chipBtn() {
  return { padding: "5px 14px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.white, color: T.text, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" };
}
