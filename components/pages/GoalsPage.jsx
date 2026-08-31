"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Popover from "@/components/ui/Popover";
import {
  Plus, Target, Trash2, Pencil, Copy, Pin, Check, X, TrendingUp, Heart,
  ChevronDown, ChevronRight, Calendar, AlertCircle, Flag, Sparkles,
  Dumbbell, BookOpen, Users, GraduationCap, Wallet, Briefcase, Activity, Code,
  Clock, Trophy, Footprints, MessageCircle,
} from "lucide-react";
import { getCurrencySymbol } from "@/lib/userPrefs";
// Coquille de modale et boutons de la nouvelle DA (pages Comptes / Calendrier) :
// le formulaire d'objectif s'y range plutôt que d'inventer sa propre fenêtre.
import { ModalShell, PrimaryBtn } from "@/components/modals/AccountModals";
import { useTrades, useTradingAccounts } from "@/lib/hooks/useTradeData";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useUndo } from "@/lib/contexts/UndoContext";
import { t, useLang } from "@/lib/i18n";
import {
  RPG_STORAGE_KEY, RPG_CLOUD_KEY, DEFAULT_CATEGORIES as RPG_DEFAULT_CATEGORIES,
  CatIcon as RpgCatIcon,
} from "@/lib/lifeRpgCategories";
import {
  GOALS_STORAGE_KEY, GOALS_CLOUD_KEY,
  STORAGE_HABITS, STORAGE_HABITS_HISTORY, CLOUD_HABITS, CLOUD_HABITS_HISTORY,
  HABIT_AUTO_TYPE, HABIT_WEEKDAYS,
  HABIT_ONTRACK_RATE, countHabitDays, habitAssiduityOf, habitGoalHabitIds,
  habitGoalRangeLabel, habitGoalTargetDays, habitGoalWindow, isHabitGoal,
} from "@/lib/habitGoals";

import { T as BaseT } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { PALETTE, PALETTE_DARK, GREY } from "@/lib/ui/palette";
import { Field as DAField, FIELD as DA_FIELD } from "@/components/ui/form";
import { FIELD_BG as DA_FIELD_BG, WRITING_BG as DA_WRITING_BG } from "@/lib/ui/tokens";
import { FIELD_FOCUS_RING as DA_FOCUS_RING } from "@/components/ui/form";
// `bg` local (#F5F5F5) = fond subtil : mappé sur la var de survol pour suivre le
// thème sombre (BaseT.bg vaut #FFFFFF, ce qui ferait perdre le gris léger).
const T = { ...BaseT, bg: "var(--color-hover-bg, #F5F5F5)" };

/* Les clés de stockage des objectifs vivent dans `lib/habitGoals` (module
   neutre) : la page Habitudes doit pouvoir rattacher un objectif sans importer
   cette page-ci, ce qui ferait un cycle. Ré-exportées telles quelles. */
export { GOALS_STORAGE_KEY, GOALS_CLOUD_KEY };
const STORAGE_KEY = GOALS_STORAGE_KEY;

const HORIZONS = [
  { id: "week",  label: "Cette semaine", short: "semaine" },
  { id: "month", label: "Ce mois",       short: "mois" },
  { id: "year",  label: "Cette année",   short: "année" },
];
// Priorités (remplace les anciens niveaux facile/moyen/difficile)
const LEVELS = [
  { id: "low",     label: "Basse",    color: GREY.grey700 },
  { id: "normal",  label: "Normale",  color: PALETTE.blue },
  { id: "high",    label: "Haute",    color: PALETTE.orange },
  { id: "urgent",  label: "Urgente",  color: PALETTE.red },
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
  /* Trading porte le vert de marque — c'est la catégorie phare de l'app, et le
     jaune qu'elle avait ne tenait pas sur une barre de 3 px. Le jaune passe à
     « Pas journalier », qui lui cède ce vert : les onze couleurs restent donc
     toutes distinctes, aucune autre catégorie ne bouge. */
  { id: "trading",   label: "Trading",       color: PALETTE.green, icon: TrendingUp },
  { id: "personal",  label: "Personnel",     color: PALETTE.red, icon: Heart },
  { id: "sport",     label: "Sport",         color: PALETTE.orange, icon: Dumbbell },
  { id: "reading",   label: "Lecture",       color: PALETTE_DARK.purple, icon: BookOpen },
  { id: "relations", label: "Relations",     color: PALETTE.purple, icon: Users },
  { id: "learning",  label: "Apprentissage", color: PALETTE.blue, icon: GraduationCap },
  { id: "health",    label: "Santé",         color: PALETTE.pink, icon: Activity },
  { id: "steps",     label: "Pas journalier", color: PALETTE.yellow, icon: Footprints },
  { id: "finance",   label: "Finances",      color: PALETTE_DARK.green, icon: Wallet },
  { id: "work",      label: "Travail",       color: PALETTE.brown, icon: Briefcase },
  { id: "code",      label: "Dev",           color: PALETTE_DARK.blue, icon: Code },
  /* Douzième catégorie : les huit principales et trois de leurs crans sombres
     étant pris, celle-ci prend le cran sombre de l'orange — le seul restant qui
     ne se confonde ni avec Sport (orange vif) ni avec Travail (brun clair). */
  { id: "communication", label: "Communication", color: PALETTE_DARK.orange, icon: MessageCircle },
];
/* Catégorie d'un objectif — c'est elle qui porte son icône et sa couleur, et
   qui teinte sa barre de progression partout où l'objectif apparaît : la liste
   de cette page comme les cartes de la Quête de soi. Sur une carte annuelle,
   seule la carte elle-même garde sa propre couleur (vignette, jauge globale,
   jalons) ; les barres des objectifs qu'elle agrège disent, elles, de quel
   domaine chaque mesure vient. */
export function goalCategoryOf(g) {
  return CATEGORIES.find(c => c.id === g?.category) || CATEGORIES[0];
}
// Sources de suivi. `trading: true` = calculé à partir des trades et filtré
// sur l'horizon de l'objectif. Ces types ne sont proposés qu'en catégorie
// "Trading".
const AUTO_TYPES = [
  { id: "manual",     label: "Manuel",              unit: "",  trading: false, group: "Général" },
  /* Source « habitudes » : l'objectif compte les JOURS où l'une des habitudes
     rattachées a été cochée (page Habitudes). 365 jours = une année tenue, d'où
     la cible par défaut ; la fenêtre de dates et les jours de semaine comptés
     se règlent dans le formulaire. */
  { id: HABIT_AUTO_TYPE, label: "Habitudes cochées", unit: "", trading: false, group: "Général" },
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
export function computeGoalProgress(g, trades = [], accounts = [], habitHistory = {}) {
  /* Source habitudes : la cible n'est pas saisie, elle EST la deadline — le
     nombre de jours comptables d'ici là. La recalculer plutôt que lire
     `g.target` garde l'objectif juste quand l'échéance bouge. */
  const tgt = isHabitGoal(g) ? habitGoalTargetDays(g) : (parseFloat(g.target) || 0);
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
  // Jours cochés (union des habitudes rattachées, un jour ne compte qu'une fois).
  else if (g.autoType === HABIT_AUTO_TYPE) current = countHabitDays(g, habitHistory);
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

/* Naissance d'un objectif. `createdAt` d'abord ; à défaut l'id, qui EST
   l'horodatage de création — sauf pour les tout premiers objectifs, semés avec
   les ids 1, 2 et 3 : `new Date(1)` donnait le 1er janvier 1970, soit un
   objectif vieux de cinquante ans, donc en retard quoi qu'il arrive. */
function goalStartDate(g) {
  if (g?.createdAt) {
    const d = new Date(g.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  const n = Number(g?.id);
  // 10^12 ms ≈ septembre 2001 : au-dessus, c'est bien un horodatage.
  return Number.isFinite(n) && n > 1e12 ? new Date(n) : null;
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
  if (at?.horizon) {
    /* Métrique à fenêtre FIXE (P&L du jour / de la semaine / du mois / de
       l'année) : elle se remet à zéro avec sa période, et ne peut donc être
       jugée que sur cette période. La confronter au temps qui reste jusqu'à une
       échéance lointaine — le mois en cours contre l'année entière — la
       déclarait en retard tous les jours de l'année. */
    const r = rangeOf(at.horizon);
    start = r.start; end = r.end;
  } else if (isHabitGoal(g)) {
    // Fenêtre de l'objectif d'habitude : de sa création à son échéance (une
    // année pleine par défaut).
    const w = habitGoalWindow(g);
    start = new Date(w.from + "T00:00:00");
    end = new Date(w.to + "T23:59:59");
  } else if (g.deadline) {
    // La DEADLINE fixée par l'utilisateur PRIME sur la fenêtre civile : le
    // rythme doit se calculer sur cette durée (« 10 000 € en 30 j » → / 30 j).
    // Sinon, pour un objectif trading créé en fin de mois, on diviserait par les
    // 2-3 jours restants du mois → rythme requis aberrant (≈ 3k/jour).
    end = new Date(g.deadline + "T23:59:59");
    start = goalStartDate(g);
    // Naissance inconnue : pas de fenêtre, donc pas de verdict. Mieux vaut ne
    // rien dire que dater l'objectif de 1970 et le déclarer en retard à vie.
    if (!start) return null;
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
  /* Repère « où je devrais en être » sur la barre. Pour une habitude, ce repère
     vaudrait la perfection (un jour tenu par jour écoulé) : toujours devant la
     barre, il redirait « en retard » en silence. On ne le pose donc pas. */
  const expectedPct = isHabitGoal(g) ? 0 : Math.round(timeFrac * 100);
  const delta = progressFrac - timeFrac; // > 0 = en avance, < 0 = en retard

  // Rythme requis sur le temps restant pour atteindre la cible — seulement pour
  // les métriques ADDITIVES (un win rate ou un type de compte ne « s'accumule »
  // pas par jour, le rythme n'aurait aucun sens).
  const additive = g.autoType === "manual" || g.autoType === "trades"
    || (g.autoType || "").startsWith("pnl");
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
  if (pct >= 100)            { status = "done";    color = PALETTE.green; label = "Atteint"; }
  else if (timeFrac >= 1)    { status = "ended";   color = PALETTE.red;      label = "Échéance passée"; }
  else if (isHabitGoal(g)) {
    /* Une habitude se juge à sa RÉGULARITÉ, pas au temps écoulé : voir
       `habitGoalAssiduity`. En dessous du seuil, l'objectif décroche vraiment ;
       au-dessus, un jour sauté ne mérite pas une alerte. */
    const rate = habitAssiduityOf(current, g);
    if (rate < HABIT_ONTRACK_RATE) {
      status = "behind"; color = PALETTE.orange;
      label = `Irrégulier · ${Math.round(rate * 100)}%`;
    } else {
      status = "ontrack"; color = PALETTE.blue;
      label = `Régulier · ${Math.round(rate * 100)}%`;
    }
  }
  else if (delta >= 0.05)    { status = "ahead";   color = PALETTE.green; label = "En avance"; }
  else if (delta <= -0.05)   { status = "behind";  color = PALETTE.orange;   label = "En retard"; }
  else                       { status = "ontrack"; color = PALETTE.blue;     label = "Dans les temps"; }

  return { status, color, label, expectedPct, timeFrac, progressFrac, requiredRate, rateUnit };
}

// { prefix, suffix } pour formater la valeur d'un objectif (pur, exporté).
export function goalUnitOf(g) {
  // Source habitudes : on compte des jours, quelle que soit l'unité choisie
  // avant de basculer la source.
  if (g.autoType === HABIT_AUTO_TYPE) return { prefix: "", suffix: " j" };
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
/* Vrai quand la valeur d'un objectif se lit DÉJÀ comme un pourcentage : soit
   son unité est le %, soit sa source est les habitudes (dont le nombre de jours
   n'apprend rien de plus que la barre). Là où une barre porte déjà son %,
   réafficher « 45 % / 60 % » ou « 128 j / 365 j » à côté fait doublon — les
   cartes de la Quête de soi s'en servent pour ne montrer qu'un seul chiffre. */
export function goalReadsAsPct(g) {
  return isHabitGoal(g) || goalUnitOf(g).suffix === "%";
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
/**
 * @param {object}    props
 * @param {boolean=}  props.embedded  Rendu à l'intérieur d'une autre page
 *   (« Quête de soi », qui l'a absorbée) : la bande de KPI et la barre d'action
 *   propres à la page disparaissent — la page hôte porte déjà son en-tête — et
 *   le bouton « Nouvel objectif » est remonté chez elle via `onRequestCreate`.
 * @param {Function=} props.registerCreate  Reçoit l'ouverture du formulaire de
 *   création, pour que l'hôte puisse la déclencher depuis son propre bouton.
 */
export default function GoalsPage({ embedded = false, registerCreate }) {
  useLang();
  const tradesHook = useTrades();
  const trades = tradesHook?.trades || [];
  const accountsHook = useTradingAccounts();
  const accounts = accountsHook?.accounts || [];

  const [goals, setGoals, goalsReady] = useCloudState(STORAGE_KEY, "goals", defaultGoals());
  const { pushUndo } = useUndo();

  /* Habitudes + leur historique, en LECTURE seule : un objectif dont la source
     est « Habitudes cochées » compte ses jours ici. L'écriture (cocher un jour)
     reste l'affaire de la page Habitudes — deux écrivains sur la même clé
     divergeraient. */
  const [habitsRaw] = useCloudState(STORAGE_HABITS, CLOUD_HABITS, []);
  const habits = useMemo(() => (Array.isArray(habitsRaw) ? habitsRaw : []), [habitsRaw]);
  const [habitHistory] = useCloudState(STORAGE_HABITS_HISTORY, CLOUD_HABITS_HISTORY, {});

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
  const emptyForm = { label: "", level: "normal", category: "trading", autoType: "manual", target: "", deadline: "", unit: "count", customUnit: "", accountTypeFilter: "live", accountIdFilter: "all", rpgCategory: "", rpgXp: "", habitIds: [], habitDays: [] };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const openCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  /* En mode intégré, l'hôte porte le bouton « Nouvel objectif » : on lui confie
     l'ouverture du formulaire. La référence est stable (pas de re-souscription
     à chaque rendu) car `registerCreate` n'est appelée qu'au montage. */
  const openCreateRef = useRef(openCreate);
  openCreateRef.current = openCreate;
  useEffect(() => {
    registerCreate?.(() => openCreateRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openEdit = (g) => { setForm({ label: g.label, level: g.level || "normal", category: g.category || "trading", autoType: g.autoType || "manual", target: String(g.target), deadline: g.deadline || "", unit: g.unit || "count", customUnit: g.customUnit || "", accountTypeFilter: g.accountTypeFilter || "live", accountIdFilter: g.accountIdFilter || "all", rpgCategory: g.rpgCategory || "", rpgXp: g.rpgXp != null ? String(g.rpgXp) : "", habitIds: habitGoalHabitIds(g), habitDays: Array.isArray(g.habitDays) ? g.habitDays : [] }); setEditingId(g.id); setShowForm(true); };
  const close = () => { setForm(emptyForm); setEditingId(null); setShowForm(false); };

  // Auto-save : dès qu'un champ change et qu'il y a assez d'infos, on enregistre
  // (édition → mise à jour live, création → insertion unique au 1er passage valide).
  useEffect(() => {
    if (!showForm) return;
    // Validation stricte avant insertion : évite les « objectifs fantômes » créés
    // par l'auto-save sur une saisie partielle. On exige un label ET une cible
    // numérique finie strictement positive (parseFloat filtre NaN / « 12ab »).
    const habitSource = form.autoType === HABIT_AUTO_TYPE;
    const targetNum = parseFloat(form.target);
    /* La source « habitudes » n'a pas de cible saisie — c'est sa deadline qui la
       fixe. Lui réclamer un nombre ici interdirait purement et simplement de
       l'enregistrer. */
    if (!form.label.trim()) return;
    if (!habitSource && (!Number.isFinite(targetNum) || targetNum <= 0)) return;
    const horizon = horizonFromDeadline(form.deadline);
    const handle = setTimeout(() => {
      // Lien Vie RPG : catégorie rattachée + XP versée (au prorata) à 100 %.
      const rpgCategory = form.rpgCategory || null;
      // Réglages de la source « habitudes ». Écrits même quand la source est
      // autre : on garde le rattachement sous le coude, pour qu'un aller-retour
      // Manuel ↔ Habitudes ne le perde pas.
      const habitFields = {
        habitIds: Array.isArray(form.habitIds) ? form.habitIds.map(String) : [],
        habitDays: Array.isArray(form.habitDays) ? form.habitDays : [],
      };
      const rpgXp = rpgCategory ? Math.max(0, parseInt(form.rpgXp, 10) || 0) : 0;
      if (editingId) {
        setGoals(prev => updateGoalById(prev, editingId, g => ({
          ...g, label: form.label.trim(), horizon, level: form.level,
          category: form.category, autoType: form.autoType,
          target: habitSource
            ? habitGoalTargetDays({ ...g, ...habitFields, deadline: form.deadline })
            : parseFloat(form.target),
          deadline: form.deadline, unit: form.unit,
          customUnit: form.customUnit || "",
          accountTypeFilter: form.accountTypeFilter,
          accountIdFilter: form.accountIdFilter,
          ...habitFields,
          rpgCategory, rpgXp,
          // L'étape porteuse (« Quête de soi ») appartient à la carte quittée :
          // changer de carte, ou se détacher, la laisse pointer dans le vide.
          rpgStep: rpgCategory && g.rpgCategory === rpgCategory ? (g.rpgStep || null) : null,
        })));
      } else {
        // Créer le nouveau goal et passer immédiatement en mode édition
        const id = Date.now();
        const createdAt = new Date(id).toISOString();
        setGoals(prev => [...prev, {
          id, createdAt,
          label: form.label.trim(), horizon, level: form.level,
          category: form.category, autoType: form.autoType,
          target: habitSource
            ? habitGoalTargetDays({ ...habitFields, createdAt, deadline: form.deadline })
            : parseFloat(form.target),
          deadline: form.deadline, unit: form.unit,
          customUnit: form.customUnit || "",
          accountTypeFilter: form.accountTypeFilter,
          accountIdFilter: form.accountIdFilter,
          ...habitFields,
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
  const compute = (g) => computeGoalProgress(g, trades, accounts, habitHistory);
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

  if (useFirstLoad(goalsReady, STORAGE_KEY)) {
    return <PageSkeleton variant="list" label={t("nav.goals")} gap={16} stats={4} toolbarRight={[152]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className={embedded ? undefined : "anim-1"}>
      {/* Header : l'action de la page. Intégré, l'hôte la porte — la rendre
          deux fois donnerait deux boutons identiques. */}
      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={openCreate}
            style={{ marginLeft: "auto", padding: "8px 16px", height: 34, minHeight: 34, borderRadius: 999, background: T.brand, border: "none", color: T.onSolid, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} strokeWidth={2} /> Nouvel objectif
          </button>
        </div>
      )}

      {/* La liste occupe toute la largeur : le formulaire n'est plus un panneau
          latéral qui la comprimait, mais une modale centrée (cf. plus bas). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Bande de KPI + son séparateur : masqués en mode intégré. */}
      {!embedded && (
        <>
          <StatStrip kpis={kpis} goals={goals} compute={compute} />
          <div style={{ height: 1, background: T.border, margin: "0 16px" }} />
        </>
      )}

      {/* Ni en-têtes de colonnes ni onglets de catégorie : les valeurs des
          lignes se lisent seules (date, x/y, %) et ces deux bandeaux
          n'apportaient que du bruit au-dessus de la liste. */}

      {/* Timeline */}
      {goals.length === 0 ? (
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
            const onGoing = goals.filter(g => {
              const { pct, current, target } = compute(g);
              return g.autoType === "max_dd" ? current > target : pct < 100;
            }).sort(byPriority);
            const done = goals.filter(g => {
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
                        color: T.textSub, fontSize:12, fontWeight: 500,
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

    {/* ─── Formulaire : une MODALE, plus un panneau latéral ───
        Le drawer volait 360 px à la liste et se retrouvait à l'étroit dès qu'un
        champ conditionnel s'ouvrait. La modale reprend la coquille des pages
        Comptes / Calendrier (titre, corps défilant, pied d'action) et laisse la
        liste intacte derrière elle. L'enregistrement reste automatique. */}
    {showForm && (
      <ModalShell
        title={editingId ? "Détail de l'objectif" : "Nouvel objectif"}
        subtitle={editingId
          ? "Les modifications sont enregistrées au fil de la saisie."
          : "Nomme l'objectif et donne-lui une cible : il apparaîtra dès qu'il sera mesurable."}
        onClose={close}
        width={560}
        footer={
          <>
            <span style={{ marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textMut }}>
              <Check size={13} strokeWidth={2.5} color={T.green} /> Enregistré automatiquement
            </span>
            <PrimaryBtn onClick={close}>Terminé</PrimaryBtn>
          </>
        }
      >
        <style>{`
          .no-spin::-webkit-outer-spin-button,
          .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
          .no-spin { -moz-appearance: textfield; }
        `}</style>

        {/* Nom */}
        <GoalField label="Nom de l'objectif">
          <input type="text" autoFocus value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={"ex : P&L du mois"}
            style={goalInput()}
            onFocus={(e) => { e.currentTarget.style.boxShadow = DA_FOCUS_RING; }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }} />
        </GoalField>

        {/* Échéance : une date, choisie au calendrier. Elle donne à l'objectif
            sa fenêtre — donc son rythme requis, sa frise, et la cible d'un
            objectif d'habitude. */}
        <DeadlineField value={form.deadline} onChange={(v) => setForm({ ...form, deadline: v })} />

        {/* Pas de champ de priorité : il se remplissait par réflexe (« Normale »
            partout) sans rien décider. `form.level` reste dans l'état, relu à
            l'édition et réécrit tel quel — les priorités déjà posées survivent
            et continuent de trier la liste. */}

        {/* Cible + son unité (ou l'unité imposée par la source de suivi).
            Masquée pour la source « habitudes » : sa cible se déduit de sa
            fenêtre (le nombre de jours à tenir), elle ne se saisit pas. */}
        {form.autoType !== HABIT_AUTO_TYPE && (
        <GoalField label="Cible">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="1000" className="no-spin"
              style={{ ...goalInput(), flex: 1, minWidth: 0, MozAppearance: "textfield", appearance: "textfield" }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = DA_FOCUS_RING; }}
              onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }} />
            {form.autoType === "manual" ? (
              <div style={{ width: 150, flexShrink: 0 }}>
                <FancyDropdown
                  variant="field"
                  value={form.unit}
                  options={UNITS}
                  onChange={(v) => setForm({ ...form, unit: v })}
                  renderValue={(u) => (
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{u.label}</span>
                  )}
                  renderOption={(u, active) => (
                    <>
                      <span style={{ flex: 1 }}>{u.label}</span>
                      {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
                    </>
                  )}
                />
              </div>
            ) : form.autoType === "account_type" ? (
              <div style={{ width: 150, flexShrink: 0 }}>
                <FancyDropdown
                  variant="field"
                  value={form.accountTypeFilter || "live"}
                  options={[
                    { id: "live",   label: "Live" },
                    { id: "eval",   label: "Eval" },
                    { id: "funded", label: "Funded" },
                  ]}
                  onChange={(v) => setForm({ ...form, accountTypeFilter: v })}
                  renderValue={(o) => (
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{o.label}</span>
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
              const label = form.autoType === HABIT_AUTO_TYPE ? "jours"
                : a?.unit === "$" ? getCurrencySymbol() : a?.unit === "%" ? "%" : "trades";
              return (
                <span style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 8, background: T.accentBg, color: T.textSub, fontSize: 13, fontWeight: 500 }}>
                  {label}
                </span>
              );
            })()}
          </div>
          {form.autoType === "manual" && form.unit === "custom" && (
            <input type="text" value={form.customUnit}
              onChange={(e) => setForm({ ...form, customUnit: e.target.value })}
              placeholder="ex : séances"
              style={{ ...goalInput(), marginTop: 8 }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = DA_FOCUS_RING; }}
              onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }} />
          )}
        </GoalField>
        )}

        {/* Catégorie — grille d'icônes (deux lignes) */}
        <GoalField label="Catégorie"
          aside={(() => {
            const cat = CATEGORIES.find(c => c.id === form.category) || CATEGORIES[0];
            return <span style={{ fontSize: 11, fontWeight: 600, color: cat.color }}>{cat.label}</span>;
          })()}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
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
                    padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                    minWidth: 0, overflow: "hidden",
                  }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: active ? c.color : T.accentBg,
                    color: active ? "#fff" : T.textSub,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    transition: "background .15s ease, color .15s ease",
                  }}>
                    <Icon size={15} strokeWidth={1.75} />
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: active ? c.color : T.textMut,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                    transition: "color .15s ease",
                  }}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </GoalField>

        {/* Source de suivi. Les métriques de trading restent réservées à la
            catégorie Trading (elles n'ont de sens que là) ; « Manuel » et
            « Habitudes cochées » valent pour toutes les catégories — c'est ce
            qui permet à un objectif ordinaire de se nourrir des habitudes. */}
        {/* Sans phrase d'explication sous le champ : le nom de chaque source
            (« Manuel », « Habitudes cochées », « P&L du mois »…) dit déjà ce
            qu'elle compte, et la ligne d'aide changeait à chaque choix — un
            texte qui bouge se relit à chaque fois et ne s'apprend jamais. */}
        <GoalField label="Source de suivi">
            <FancyDropdown
              variant="field"
              value={form.autoType}
              options={AUTO_TYPES.filter(a => form.category === "trading" || !a.trading)}
              onChange={(v) => setForm({ ...form, autoType: v })}
              renderValue={(a) => (
                <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{a?.label}</span>
              )}
              renderOption={(a, active) => (
                <>
                  <span style={{ flex: 1 }}>{a.label}</span>
                  {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
                </>
              )}
            />
        </GoalField>

        {/* Réglages de la source « habitudes » : quelles habitudes, sur quelle
            fenêtre de dates, et quels jours de la semaine comptent. */}
        {form.autoType === HABIT_AUTO_TYPE && (
          <HabitSourceField form={form} setForm={setForm} habits={habits} habitHistory={habitHistory}
            goal={editingId ? goals.find(gg => gg.id === editingId) : null} />
        )}

        {/* Compte ciblé — pour les sources de perf (PnL / WR / Nb trades / DD) */}
        {form.category === "trading" && ["pnl","pnl_day","pnl_week","pnl_month","pnl_year","winrate","trades","max_dd"].includes(form.autoType) && (
          <GoalField label="Compte ciblé">
            <FancyDropdown
              variant="field"
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
                <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{o?.label}</span>
              )}
              renderOption={(o, active) => (
                <>
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {active && <Check size={12} strokeWidth={2.5} color={T.green} />}
                </>
              )}
            />
          </GoalField>
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
            <GoalField label="Progression actuelle">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" value={g.manual || 0} className="no-spin"
                  onChange={(e) => setGoals(prev => prev.map(x => x.id === g.id ? { ...x, manual: parseFloat(e.target.value) || 0 } : x))}
                  style={{ ...goalInput(), flex: 1, minWidth: 0, MozAppearance: "textfield", appearance: "textfield" }}
                  onFocus={(e) => { e.currentTarget.style.boxShadow = DA_FOCUS_RING; }}
                  onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }} />
                {suffix && <span style={{ fontSize: 12, color: T.textMut, fontWeight: 500, flexShrink: 0 }}>{suffix.trim()}</span>}
                <button type="button" onClick={() => adjustManual(g.id, -1)} aria-label="Retirer 1"
                  style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, border: "none", background: DA_FIELD_BG, color: T.text, cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit" }}>−</button>
                <button type="button" onClick={() => adjustManual(g.id, 1)} aria-label="Ajouter 1"
                  style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, border: "none", background: T.brand, color: T.onSolid, cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit" }}>+</button>
              </div>
            </GoalField>
          );
        })()}

        {/* Lien « Quête de soi » (tout en bas) — pilules comme la page
            Habitudes. Rattache l'objectif à l'un des trois objectifs de
            l'année : sa progression le fait avancer, et donne de l'XP au
            prorata. */}
        <GoalField label="Objectif de l'année (XP)"
          hint={form.rpgCategory ? "L'XP est versée au prorata de l'avancement de cet objectif." : undefined}>
          {rpgCategories.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textMut, lineHeight: 1.5 }}>
              {"Aucun objectif d'année défini — rends-toi sur la page « Objectifs » pour en créer un."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {rpgCategories.map((c) => {
                  const active = form.rpgCategory === c.id;
                  return (
                    <button key={c.id} type="button"
                      onClick={() => setForm({ ...form, rpgCategory: active ? "" : c.id })}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", minHeight: 34, borderRadius: 999, border: `1px solid ${active ? c.color : T.border}`, background: active ? `color-mix(in srgb, ${c.color} 10%, transparent)` : T.white, color: active ? c.color : T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                      {active
                        ? <Check size={13} strokeWidth={2.5} color={c.color} />
                        : <RpgCatIcon name={c.icon} size={13} strokeWidth={1.9} color={T.textMut} />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
              {form.rpgCategory && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <input type="number" min={0} value={form.rpgXp}
                    onChange={(e) => setForm({ ...form, rpgXp: e.target.value })}
                    placeholder="500" className="no-spin"
                    style={{ ...goalInput(), width: 96, textAlign: "center", MozAppearance: "textfield", appearance: "textfield" }}
                    onFocus={(e) => { e.currentTarget.style.boxShadow = DA_FOCUS_RING; }}
                    onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }} />
                  <span style={{ fontSize: 12, color: T.textMut, fontWeight: 500 }}>XP à 100 %</span>
                </div>
              )}
            </div>
          )}
        </GoalField>
      </ModalShell>
    )}
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

function TimelineSection({ title, rows, compute, unitOf, fmtVal, onEdit, onDelete, onDuplicate, onTogglePin, onSetPinnedOpen, onAdjustManual, onSetManual, onSubtasksChange, doneSection, drag, setDrag, onDrop }) {
  return (
    /* 12 px entre les lignes : ce sont désormais des cartes, elles ont besoin
       d'un intervalle pour se lire comme des blocs distincts (2 px les
       recollait en un pavé continu). */
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, letterSpacing: -0.1, padding: "0 16px 6px" }}>{title}</div>
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
        />
      ))}
    </div>
  );
}

/* Exportée pour ses tests : l'ARMEMENT du glissé dépend de l'ordre dans
   lequel le moteur envoie ses évènements de pointeur, et cet ordre diffère
   d'un navigateur à l'autre — c'est exactement ce qu'un test doit tenir. */
export function TimelineRow({ goal: g, compute, unitOf, fmtVal, onEdit, onDelete, onDuplicate, onTogglePin, onSetPinnedOpen, onAdjustManual, onSetManual, onSubtasksChange, doneSection, drag, setDrag, onDrop, nested }) {
  const cat = goalCategoryOf(g);
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
  /* Le glissé est autorisé par un REF, jamais par un état.
     La ligne portait `draggable={armed}`, armé au `pointerdown` : le navigateur
     décide s'il y a un glissé au `mousedown` qui suit immédiatement, bien avant
     qu'un rendu React ait pu poser l'attribut, et le geste partait en sélection
     de texte. La ligne est donc `draggable` en permanence, et c'est
     `onDragStart` qui refuse les départs illégitimes — un test synchrone, lui. */
  const armedRef = useRef(false);
  const prevSubCount = useRef((g.subtasks || []).length);
  useEffect(() => {
    const count = (g.subtasks || []).length;
    if (count > prevSubCount.current) setOpen(true);
    prevSubCount.current = count;
  }, [g.subtasks]);
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

  /* Désarme quand le geste se termine SANS glissé.
     Surtout pas sur `pointercancel` ni `pointerleave`, et c'est là qu'était le
     bug : ces deux évènements sont précisément ce que le navigateur envoie
     QUAND un glissé commence. WebKit les émet AVANT `dragstart` — la spec
     Pointer Events le permet, Chromium les envoie après. Le ref retombait donc
     à faux juste avant le test, `dragstart` était refusé, et rien ne bougeait :
     dans Arc tout marchait, dans l'app de bureau (WKWebView) le glissé ne
     partait jamais, sans le moindre message. */
  const releaseDrag = () => { armedRef.current = false; };

  /* Le tri part de la ligne, mais pas de ses commandes : on n'attrape pas un
     objectif en tirant sur sa case à cocher. */
  const handlePointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    armedRef.current = !e.target.closest("button, input, a, select, textarea");
  };

  const handleDragStart = (e) => {
    if (!armedRef.current) { e.preventDefault(); return; }
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
    armedRef.current = false;
  };

  const handleDragEnd = () => {
    setDrag && setDrag({ sourceId: null, overId: null, mode: null });
    armedRef.current = false;
  };

  return (
    <>
      <div
        className="tr4de-goals-row"
        draggable
        onPointerDown={handlePointerDown}
        onPointerUp={releaseDrag}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropEvt}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => {
          if (drag?.sourceId) { e.preventDefault(); return; }
          // Toggle l'expansion (persisté si épinglé, transient sinon).
          setOpen(v => !v);
        }}
        style={{
          display: "grid",
          gridTemplateColumns: nested
            ? "minmax(0, 1fr) minmax(80px, 130px) minmax(110px, 160px) 120px"
            : "minmax(70px, 110px) minmax(0, 1fr) minmax(90px, 160px) minmax(110px, 160px) 124px",
          gap: nested ? 14 : 20,
          alignItems: "center",
          padding: nested ? "12px 14px" : "18px 20px",
          /* Chaque objectif est sa PROPRE carte blanche posée sur le fond gris
             de la page : au repos il est blanc, le survol et l'ouverture le
             teintent comme n'importe quelle ligne cliquable de l'app. Les
             sous-objectifs gardent leur contour fin — imbriqués dans la carte
             du parent, une seconde ombre les ferait flotter. */
          background: overMode === "into" ? T.blueBg : (hover || open ? T.accentBg : T.white),
          border: nested ? `1px solid ${T.border}` : "none",
          boxShadow: nested ? "none" : T.elevCard,
          /* Ouvert, la carte perd ses coins bas : le panneau de détail se colle
             dessous et les deux ne forment plus qu'un bloc. */
          borderRadius: nested ? "var(--radius-card)" : (open ? "12px 12px 0 0" : 12),
          cursor: isDragging ? "grabbing" : "pointer",
          transition: "background .12s ease",
          opacity: isDragging ? 0.45 : 1,
          boxShadow: overMode === "before" ? `inset 0 2px 0 0 ${T.blue}`
                  : overMode === "after"  ? `inset 0 -2px 0 0 ${T.blue}`
                  : "none",
          userSelect: isDragging ? "none" : "auto",
          touchAction: isDragging ? "none" : "auto",
        }}
      >
        {!nested && (
          <div style={{ fontSize: 12, color: T.textMut, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{createdLabel}</div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: nested ? 12 : 14, minWidth: 0 }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, fontSize: 11, color: T.textMut, overflow: "hidden", whiteSpace: "nowrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{cat.label}</span>
              {(() => {
                /* La priorité ne se saisit plus (champ retiré du formulaire) :
                   afficher « Normale » sur tout objectif ne dirait plus rien.
                   Seules celles posées du temps du champ restent visibles. */
                const lv = g.level && g.level !== "normal" ? LEVELS.find(l => l.id === g.level) : null;
                if (!lv) return null;
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
            <div style={{ fontSize: 10, color: dl < 0 ? T.red : dl <= 3 ? T.amber : T.textMut, fontWeight: 500, marginTop: 4 }}>
              {dl < 0 ? `${Math.abs(dl)}j dépassée` : dl === 0 ? "aujourd'hui" : `${dl}j restants`}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: T.text }}>
          {/* Objectif « habitudes » : pas de « 128 j / 365 j ». Le nombre de
              jours ne dit rien que la barre ne dise mieux, et son pourcentage
              est déjà à droite d'elle. */}
          {!isHabitGoal(g) && (
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
                style={{ width: 52, padding: "1px 4px", border: "none", borderRadius: 999, background: DA_FIELD_BG, boxShadow: DA_FOCUS_RING, fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "inherit", outline: "none", textAlign: "center", MozAppearance: "textfield", appearance: "textfield" }}
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
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: isHabitGoal(g) ? 0 : 10 }}>
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
                {/* La barre porte la couleur de la CATÉGORIE de l'objectif — la
                    teinte exacte de son icône, pas une version assombrie — et
                    non plus son état : c'est elle qui dit de quoi on parle d'un
                    coup d'œil dans une liste qui en empile vingt. L'état reste
                    lu par le pourcentage à droite, qui garde son rouge et son
                    vert. */}
                <div style={{ height: "100%", width: `${pct}%`, background: goalCategoryOf(g).color, borderRadius: "var(--radius-field)", transition: "width .4s ease" }} />
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
              style={{ fontSize: 10, color: T.textMut, fontWeight: 500, marginTop: 6, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
          /* Le panneau prolonge la carte de l'objectif : même largeur qu'elle
             (plus de retrait de 16 px, qui l'aurait fait paraître plus étroit
             et détaché) et coins arrondis en bas seulement. */
          margin: nested ? "0 0 4px" : "0 0 8px",
          padding: nested ? "8px 10px" : "4px 14px 12px",
          background: T.accentBg,
          borderRadius: nested ? "var(--radius-card)" : "0 0 12px 12px",
          boxShadow: nested ? "none" : T.elevCard,
          borderTop: `1px solid ${T.border}`,
          marginTop: -2,
        }}>
          {!nested && <RoadmapStrip subtasks={subtasks} deadline={g.deadline} createdAt={g.createdAt || g.id} color={cat.color} />}
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
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6, letterSpacing: -0.1 }}>Pas d&apos;objectif pour le moment</div>
      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 16, maxWidth: 380, margin: "0 auto 16px" }}>Crée ton premier objectif pour commencer à suivre ta progression.</div>
      <button onClick={onClick}
        style={{ padding: "8px 16px", minHeight: 34, borderRadius: 999, background: T.brand, color: T.onSolid, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Plus size={13} strokeWidth={2} /> Créer un objectif
      </button>
    </div>
  );
}

/* ---------- Tiny helpers ---------- */
// Dropdown stylé (popover) — remplace les <select> natifs
/* Champ Échéance : la date, et rien d'autre.
   Les six raccourcis (« Ce mois », « Dans 1 mois »… « Dans 1 an ») ont été
   retirés : posés d'un clic, ils faisaient choisir une échéance ronde plutôt
   que la vraie, et pesaient six pilules dans un formulaire qui en compte déjà
   beaucoup. Qui veut une date la prend au calendrier. */
function DeadlineField({ value, onChange }) {
  const [calOpen, setCalOpen] = useState(false);
  const calBtnRef = React.useRef(null);
  // Mois affiché dans le popover — celui de la date posée, sinon le mois courant.
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });

  return (
    <GoalField label="Échéance" hint="Facultative — sans elle, l'objectif court sur un an.">
      <button ref={calBtnRef} type="button" onClick={() => setCalOpen(v => !v)}
        style={{
          ...goalInput(), width: "100%", cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 8, minHeight: 38,
          /* Ouvert = l'anneau de focus, pas une bordure assombrie : le champ
             n'en a plus. */
          boxShadow: calOpen ? DA_FOCUS_RING : "none",
          color: value ? T.text : T.textMut,
        }}>
        <Calendar size={14} strokeWidth={1.75} color={T.textMut} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value
            ? new Date(value + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
            : "Choisir une date…"}
        </span>
        {value && (
          <span role="button" tabIndex={0} aria-label="Retirer l'échéance"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onChange(""); } }}
            style={{ display: "inline-flex", alignItems: "center", color: T.textMut, flexShrink: 0 }}>
            <X size={13} strokeWidth={2} />
          </span>
        )}
      </button>
      <Popover
        anchorRef={calBtnRef}
        open={calOpen}
        onClose={() => setCalOpen(false)}
        align="start"
        maxHeight={360}
        style={{
          width: 280, background: T.white, border: "none",
          borderRadius: "var(--radius-card)", boxShadow: "var(--elev-overlay)", padding: 12,
        }}
      >
        <MiniCalendar
          value={value}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onPick={(iso) => { onChange(iso); setCalOpen(false); }}
        />
      </Popover>
    </GoalField>
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

  /* Panneau nu : le placement (ancrage, bascule, bornage) appartient au Popover
     qui l'enveloppe, plus au calendrier lui-même. */
  return (
    <>
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
                fontSize: 12, fontWeight: 500,
                color: isSel ? T.onSolid : T.text,
                background: isSel ? T.brand : "transparent",
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
    </>
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
            fontSize:11, fontWeight: 500, color: T.textMut,
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
          fontSize:13, fontWeight: 500, color: T.text,
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
        fontSize:13, fontWeight: 500, color: T.text,
        transition: "background .12s ease",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.bg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      {renderOption ? renderOption(o, active) : o.label}
    </button>
  );
}

/**
 * @param {"bare"|"field"} [variant]  `bare` = déclencheur nu (texte + chevron),
 *   posé dans une ligne de type « valeur à droite ». `field` = déclencheur
 *   bordé pleine largeur, à la manière d'un champ de la nouvelle DA — c'est
 *   celui qu'utilise le formulaire d'objectif en modale.
 */
function FancyDropdown({ value, options, onChange, renderValue, renderOption, align = "right", variant = "bare" }) {
  const [open, setOpen] = useState(false);
  const btnRef = React.useRef(null);
  // Placement, suivi du défilement, bascule vers le haut et bornage à l'écran :
  // tout est passé au Popover. L'ancienne version portalisait déjà, mais gardait
  // une hauteur de 320 px quelle que soit la place disponible — en bas de page,
  // la fin de la liste sortait sous la fenêtre.
  const close = React.useCallback(() => setOpen(false), []);
  const selected = options.find(o => o.id === value) || options[0];
  const field = variant === "field";
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button ref={btnRef} type="button" onClick={() => setOpen(v => !v)}
        style={field ? {
          ...DA_FIELD,
          /* Ouvert = l'anneau de focus : le champ n'a plus de bordure a
             assombrir, et rien ne bouge d'un pixel a l'ouverture. */
          boxShadow: open ? DA_FOCUS_RING : "none",
          cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          minHeight: 38,
          transition: "box-shadow var(--dur-fast) var(--ease-out)",
        } : {
          width: "100%", padding: 0, border: "none", background: "transparent",
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: align === "left" ? "flex-start" : "flex-end", gap: 6,
          color: T.text,
        }}>
        {/* En variante champ, la valeur peut être longue (« Tous les comptes
            Funded ») : elle doit s'élider au lieu de pousser le chevron dehors. */}
        {field ? (
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {renderValue ? renderValue(selected) : (
              <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{selected?.label}</span>
            )}
          </span>
        ) : renderValue ? renderValue(selected) : (
          <span style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{selected?.label}</span>
        )}
        <ChevronDown size={14} strokeWidth={1.75} color={T.textMut}
          style={{ transition: "transform .15s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }} />
      </button>
      <Popover
        anchorRef={btnRef}
        open={open}
        onClose={close}
        align={field || align === "left" ? "start" : "end"}
        minWidth={200}
        atLeastAnchorWidth
        maxHeight={320}
        style={{
          background: T.white, border: "none", borderRadius: 10,
          boxShadow: "var(--elev-overlay)", padding: 4,
        }}
      >
        <DropdownBody
          options={options} value={value} renderOption={renderOption}
          onSelect={(id) => { onChange(id); setOpen(false); }}
        />
      </Popover>
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
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });
  // Placement et fermeture : Popover.
  const close = React.useCallback(() => setOpen(false), []);

  const label = value
    ? new Date(value + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
    : placeholder;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button ref={btnRef} type="button" onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "8px 16px", minHeight: 34, borderRadius: 999,
          border: `1px dashed ${value ? "transparent" : T.border}`,
          background: value ? T.accentBg : "transparent",
          color: value ? T.text : T.textMut,
          fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
        }}>
        <Calendar size={10} strokeWidth={1.75} />
        {label}
        {value && (
          <span onClick={(e) => { e.stopPropagation(); onChange(""); }}
            style={{ marginLeft: 2, color: T.textMut, fontSize: 11, lineHeight: 1 }}>×</span>
        )}
      </button>
      <Popover
        anchorRef={btnRef}
        open={open}
        onClose={close}
        maxHeight={360}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 280, background: T.white, border: "none",
          borderRadius: "var(--radius-card)", boxShadow: "var(--elev-overlay)", padding: 12,
        }}
      >
        <MiniCalendar
          value={value}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onPick={(iso) => { onChange(iso); setOpen(false); }}
        />
      </Popover>
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
          padding: "8px 16px", minHeight: 34, borderRadius: 999,
          border: `1px dashed ${T.border}`, background: "transparent",
          color: T.textMut, fontSize: 13, fontWeight: 500,
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
        background: DA_WRITING_BG, border: "none", borderRadius: 6,
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
        boxShadow: dotRing(color),
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
          border: "none",
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

/**
 * Frise des échéances d'un objectif : rail du temps, curseur « aujourd'hui »,
 * et un point par sous-tâche datée.
 *
 * `color` est la teinte de la CATÉGORIE de l'objectif — la même que son icône et
 * que sa barre de progression, pour qu'une ligne d'objectif se lise d'une seule
 * couleur. Les points, eux, gardent leur propre code (priorité, fait ou non) :
 * c'est l'information qu'ils portent.
 */
function RoadmapStrip({ subtasks, deadline, createdAt, color }) {
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
        <div style={{ position: "absolute", top: 10, left: 0, width: `${todayPct}%`, height: 2, background: color || T.brand, borderRadius: "var(--radius-field)" }} />
        {/* Curseur "Aujourd'hui" : pastille à l'accent qui se déplace */}
        {todayPct >= 0 && todayPct <= 100 && (
          <div title="Aujourd'hui"
            style={{
              position: "absolute", top: 5, left: `${todayPct}%`, transform: "translateX(-50%)",
              width: 12, height: 12, borderRadius: "50%",
              background: color || T.brand,
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
        color: T.textMut, fontSize:11, fontWeight: 500,
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
        <div style={{ marginLeft: 22, paddingLeft: 12, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6, paddingTop: 6, paddingBottom: 6 }}>
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
    <GoalField label="Sous-objectifs"
      aside={total > 0
        ? <span style={{ fontSize: 11, color: T.textMut, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{done}/{total}</span>
        : null}>
      {subtasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
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
    </GoalField>
  );
}

/* ---------- Champs du formulaire d'objectif (modale) ----------
   Même grammaire que les modales des pages Comptes / Calendrier : libellé
   discret au-dessus, contrôle bordé en dessous, aide facultative sous le
   contrôle. `aside` sert au rappel de valeur aligné à droite du libellé
   (la catégorie choisie, par exemple).
   ------------------------------------------------------------------------ */
/* ------------------------------------------------------------------------
   Réglages de la source « Habitudes cochées ».

   Trois questions, dans cet ordre : QUELLES habitudes, sur QUELLE fenêtre de
   dates, et QUELS jours de la semaine comptent. Les deux dernières sont
   facultatives — sans elles, tout l'historique compte, tous les jours — mais
   elles sont ce qui rend la cible réglable : « 100 jours de sport entre janvier
   et juin, week-ends exclus » se dit ici sans une ligne de code.
   ------------------------------------------------------------------------ */
function HabitSourceField({ form, setForm, habits, habitHistory, goal }) {
  const selected = Array.isArray(form.habitIds) ? form.habitIds.map(String) : [];
  const days = Array.isArray(form.habitDays) ? form.habitDays : [];
  const toggleHabit = (id) => {
    const key = String(id);
    setForm({ ...form, habitIds: selected.includes(key) ? selected.filter(x => x !== key) : [...selected, key] });
  };
  const toggleDay = (d) => {
    setForm({ ...form, habitDays: days.includes(d) ? days.filter(x => x !== d) : [...days, d] });
  };
  /* Aperçu : ce que l'objectif vaut AUJOURD'HUI avec les réglages en cours.
     La cible n'étant plus saisie mais déduite de la deadline, c'est le seul
     endroit où l'on voit ce que celle-ci coûte en jours à tenir. */
  const preview = {
    autoType: HABIT_AUTO_TYPE, habitIds: selected, habitDays: days,
    createdAt: goal?.createdAt, id: goal?.id, deadline: form.deadline,
  };
  const counted = countHabitDays(preview, habitHistory);
  const targetDays = habitGoalTargetDays(preview);
  const pct = targetDays > 0 ? Math.round((counted / targetDays) * 100) : 0;

  return (
    <>
      <GoalField label="Habitudes suivies"
        hint={habits.length > 0
          ? "À plusieurs habitudes, l'avancement est leur moyenne : il faut les tenir toutes pour aller à 100 %."
          : undefined}>
        {habits.length === 0 ? (
          <div style={{ fontSize: 12, color: T.textMut, lineHeight: 1.5 }}>
            {"Aucune habitude — crée-la d'abord sur la page « Habitudes »."}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {habits.map(h => {
              const active = selected.includes(String(h.id));
              return (
                <button key={h.id} type="button" onClick={() => toggleHabit(h.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", minHeight: 34,
                    borderRadius: 999, border: `1px solid ${active ? T.brand : T.border}`,
                    background: active ? `color-mix(in srgb, ${T.brand} 10%, transparent)` : T.white,
                    color: active ? T.brand : T.text,
                    fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                  }}>
                  {active
                    ? <Check size={13} strokeWidth={2.5} color={T.brand} />
                    : <Clock size={13} strokeWidth={1.9} color={T.textMut} />}
                  {h.name}
                </button>
              );
            })}
          </div>
        )}
      </GoalField>

      <GoalField label="Jours comptés"
        aside={<span style={{ fontSize: 11, fontWeight: 600, color: T.textMut }}>
          {days.length === 0 || days.length === 7 ? "Tous les jours" : `${days.length} jour${days.length > 1 ? "s" : ""} / semaine`}
        </span>}
        hint="Aucun jour sélectionné = tous comptent.">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {HABIT_WEEKDAYS.map(d => {
            const active = days.includes(d.id);
            return (
              <button key={d.id} type="button" onClick={() => toggleDay(d.id)}
                title={d.full} aria-label={d.full} aria-pressed={active}
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  border: `1px solid ${active ? T.brand : T.border}`,
                  background: active ? `color-mix(in srgb, ${T.brand} 10%, transparent)` : T.white,
                  color: active ? T.brand : T.textSub,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>
                {d.label}
              </button>
            );
          })}
        </div>
      </GoalField>

      <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5, padding: "10px 14px", borderRadius: 10, background: T.accentBg }}>
        {selected.length === 0
          ? "Rattache au moins une habitude : sans elle, l'objectif reste à zéro."
          : <>
              <strong style={{ fontWeight: 600, color: T.text }}>{pct}%</strong>
              {` — ${targetDays} jour${targetDays > 1 ? "s" : ""} à tenir ${habitGoalRangeLabel(preview)}`}
              {selected.length > 1 ? ` (moyenne des ${selected.length} habitudes).` : "."}
              {!form.deadline && " Sans échéance, l'objectif court sur un an."}
            </>}
      </div>
    </>
  );
}
function GoalField({ label, hint, aside, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: T.textSub }}>{label}</label>
        {aside && <span style={{ marginLeft: "auto" }}>{aside}</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}
/* Delegue a la brique commune (components/ui/form.jsx) : un champ est un aplat
   en pilule, pas un rectangle cerne. */
function goalInput() {
  return { ...DA_FIELD };
}

