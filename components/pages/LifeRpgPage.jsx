"use client";

/**
 * LifeRpgPage — « Gamification de vie ».
 *
 * Page de productivité qui transforme les HABITUDES DU QUOTIDIEN en jeu de rôle.
 * Il n'existe plus de « quêtes » propres à cette page : les quêtes SONT les
 * habitudes de la page « Habitudes » (clés cloud `habits` / `habits_history`),
 * partagées entre les deux pages. Cocher une habitude (depuis l'une ou l'autre)
 * fait gagner de l'XP et des pièces, monter de niveau et progresser dans les
 * catégories (Force, Intellect, Social, Discipline… + catégories perso).
 *
 * Modèle de données :
 *  - XP, pièces gagnées, niveaux, attributs par catégorie, streaks et nombre de
 *    complétions sont DÉRIVÉS de `habits_history` (chaque jour coché = la
 *    récompense de la difficulté de l'habitude). Aucune valeur de progression
 *    n'est persistée → jamais de double comptage, synchronisation parfaite.
 *  - La méta « RPG » de chaque habitude (catégorie `attribute` + `difficulty`)
 *    vit directement sur l'objet habitude (clé `habits`) : une seule source de
 *    vérité, invisible côté page « Habitudes ».
 *  - Seuls les échanges de récompenses (`redemptions`) et les catégories
 *    (`categories`, avec leurs objectifs chiffrés) sont persistés dans `life_rpg`.
 *
 * Vue unique « Aventure » : héros, cartes de catégorie (identité, objectif
 * chiffré, habitudes rattachées) affichées sur une ligne défilable, habitudes,
 * visualisation, récompenses et badges. Les catégories se créent / éditent
 * directement depuis leurs cartes (carte « Nouvelle catégorie » en bout de ligne).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  Plus, X, Trash2, Pencil, Target, UserRound, Check,
  CalendarPlus, CalendarClock,
} from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useGoogleCalendar } from "@/lib/hooks/useGoogleCalendar";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import MiniCalendar from "@/components/ui/MiniCalendar";
import { XpBar } from "@/components/ui/XpBar";
import { TimeField } from "@/components/pages/AgendaDateFields";
import { useApp } from "@/lib/contexts/AppContext";
import { useUndo } from "@/lib/contexts/UndoContext";
import { useTrades, useTradingAccounts } from "@/lib/hooks/useTradeData";
import { getLocalDateString } from "@/lib/dateUtils";
import { nearestGcalColorId } from "@/lib/gcalColors";
import { t, useLang } from "@/lib/i18n";
import {
  STORAGE_HABITS, STORAGE_HABITS_HISTORY, CLOUD_HABITS, CLOUD_HABITS_HISTORY,
  defaultHabits, autoDescription,
} from "@/components/pages/DailyPlannerPage";
import GoalsPage, {
  GOALS_STORAGE_KEY, GOALS_CLOUD_KEY, computeGoalProgress, goalUnitOf, fmtGoalVal,
} from "@/components/pages/GoalsPage";
import {
  RPG_STORAGE_KEY as STORAGE_KEY, RPG_CLOUD_KEY as CLOUD_KEY,
  CATEGORY_ICON_KEYS as ICON_KEYS, CatIcon,
  CATEGORY_PALETTE as PALETTE, DEFAULT_CATEGORIES, habitCategoryIds,
  TASK_RPG_STORAGE_KEY, TASK_RPG_CLOUD_KEY, TASK_XP,
  TASK_TIMES_STORAGE_KEY, TASK_TIMES_CLOUD_KEY,
  TRADING_CATEGORY_ID, DISCIPLINE_RULE_XP,
  resolveTradingCatId, hasTradingCategory,
} from "@/lib/lifeRpgCategories";
import { useDisciplineTracking } from "@/lib/hooks/useDisciplineTracking";

import { CARD, SectionTitle } from "@/components/ui/da";
import { T as BaseT } from "@/lib/ui/tokens";
// `bg` local (#F5F5F5) = fond subtil : mappé sur la var de survol pour suivre le
// thème sombre (BaseT.bg vaut #FFFFFF, ce qui ferait perdre le gris léger).
const T = { ...BaseT, bg: "var(--color-hover-bg, #F5F5F5)" };

// Difficulté → récompense. Plus c'est dur, plus ça rapporte d'XP et de pièces.
const DIFFICULTIES = [
  { id: "easy",   label: "Facile",    xp: 10, coins: 5,  color: "#8E8E8E" },
  { id: "normal", label: "Normale",   xp: 25, coins: 12, color: "#3B82F6" },
  { id: "hard",   label: "Difficile", xp: 50, coins: 25, color: "#F59E0B" },
];
const DIFF_BY_ID = Object.fromEntries(DIFFICULTIES.map(d => [d.id, d]));
const DEFAULT_DIFF = DIFF_BY_ID.normal;

/* ---------- Helpers habitudes / temps ---------- */
// Jour précédent (clé "YYYY-MM-DD") sans dépendre du fuseau via Date(iso).
function dayBefore(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return getLocalDateString(dt);
}
// Série en cours : jours consécutifs cochés en terminant aujourd'hui (ou hier
// si pas encore coché aujourd'hui — la série n'est pas « cassée » avant le soir).
function currentStreak(set) {
  const today = getLocalDateString();
  let cursor = set.has(today) ? today : (set.has(dayBefore(today)) ? dayBefore(today) : null);
  if (!cursor) return 0;
  let s = 0;
  while (set.has(cursor)) { s++; cursor = dayBefore(cursor); }
  return s;
}
// Plus longue série de jours consécutifs (clés triées en ordre croissant).
function bestStreakOf(sortedKeys) {
  let best = 0, run = 0, prev = null;
  for (const k of sortedKeys) {
    run = (prev && dayBefore(k) === prev) ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  return best;
}
// Jour suivant (clé "YYYY-MM-DD").
function dayAfter(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return getLocalDateString(dt);
}

/* ---------- Multiplicateur de série & pénalité ---------- */
// Multiplicateur progressif plafonné : +10 % par jour de série, max ×3.
// Série 1 → ×1, série 11 → ×2, série 21+ → ×3.
const STREAK_MULT_STEP = 0.1;
const STREAK_MULT_MAX = 3;
function streakMultiplier(streak) {
  return Math.min(STREAK_MULT_MAX, 1 + STREAK_MULT_STEP * Math.max(0, streak - 1));
}
// Pénalité À LA RUPTURE d'une série (une seule fois quand on casse une série),
// proportionnelle à la série perdue et plafonnée : `diff.xp × min(série, cap)`.
// Une pause longue ne coûte donc qu'UNE pénalité, pas une par jour.
const STREAK_PENALTY_CAP = 5;
function streakBreakPenalty(streak, baseXp) {
  return streak > 0 ? baseXp * Math.min(streak, STREAK_PENALTY_CAP) : 0;
}
/* ---------- Courbe de niveau ---------- */
// XP nécessaire pour passer du niveau L au niveau L+1 : 100 + (L-1)*50.
function xpForLevel(level) { return 100 + (level - 1) * 50; }
function levelInfo(totalXp) {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  const needed = xpForLevel(level);
  return { level, intoLevel: remaining, neededForNext: needed, pct: Math.round((remaining / needed) * 100) };
}

// Niveau d'une catégorie DÉRIVÉ de son XP (habitudes + objectifs liés). Non
// plafonné : courbe générique progressive (facile au début, de plus en plus dur).
function categoryLevel(xp) {
  const info = levelInfo(Math.max(0, xp || 0));
  return { level: info.level, intoLevel: info.intoLevel, neededForNext: info.neededForNext, levelPct: info.pct };
}

function computeProgress(habits, history, goals = [], trades = [], accounts = [], taskRpg = {}, disciplineData = {}, categories = []) {
  const attributes = {};
  // Catégorie « Trading » réelle (par libellé/id) — l'XP de discipline y est
  // créditée plutôt qu'à un id figé, pour ne pas la disperser sur un doublon.
  const tradingCatId = resolveTradingCatId(categories);
  let totalXp = 0, coinsEarned = 0, totalCompletions = 0, bestStreak = 0;
  const perHabit = {};
  const activityLog = [];
  for (const h of habits) {
    const diff = DIFF_BY_ID[h.difficulty] || DEFAULT_DIFF;
    const map = history[h.id] || {};
    const done = new Set(Object.keys(map).filter(k => map[k]));
    const keys = [...done].sort();
    const completions = keys.length;
    const catIds = habitCategoryIds(h);
    totalCompletions += completions;
    coinsEarned += completions * diff.coins;
    const cur = currentStreak(done);
    const bst = bestStreakOf(keys);
    if (bst > bestStreak) bestStreak = bst;
    perHabit[h.id] = { completions, streak: cur, best: bst };
    // Parcourt chaque jour de la 1re complétion à aujourd'hui :
    //  - jour coché → diff.xp × multiplicateur(série en cours) → pousse aux séries ;
    //  - jour raté (passé, hors aujourd'hui) → perte de diff.xp + série remise à 0.
    if (completions > 0) {
      const today = getLocalDateString();
      let streak = 0, day = keys[0], guard = 0;
      while (guard++ < 100000) {
        if (done.has(day)) {
          streak += 1;
          const gain = Math.round(diff.xp * streakMultiplier(streak));
          totalXp += gain;
          for (const cid of catIds) attributes[cid] = (attributes[cid] || 0) + gain;
          activityLog.push({ ts: `${day}T12:00:00`, label: h.name, xp: gain, attribute: catIds[0] || null });
        } else if (day !== today) {
          // Rupture de série : une seule pénalité (proportionnelle, plafonnée).
          const pen = streakBreakPenalty(streak, diff.xp);
          if (pen > 0) {
            totalXp -= pen;
            for (const cid of catIds) attributes[cid] = (attributes[cid] || 0) - pen;
          }
          streak = 0;
        }
        if (day === today) break;
        day = dayAfter(day);
      }
    }
  }
  // XP des objectifs liés : prorata de l'avancement (pct) × `rpgXp`.
  for (const g of flattenGoals(goals)) {
    const xpFull = Math.max(0, parseInt(g.rpgXp, 10) || 0);
    if (!g.rpgCategory || xpFull <= 0) continue;
    const { pct } = computeGoalProgress(g, trades, accounts);
    const gained = Math.round((pct / 100) * xpFull);
    if (gained <= 0) continue;
    totalXp += gained;
    attributes[g.rpgCategory] = (attributes[g.rpgCategory] || 0) + gained;
  }
  // XP des tâches d'agenda terminées et liées à des cartes : `TASK_XP` fixe par
  // tâche, crédité à chaque carte liée (comme une complétion d'habitude). Source
  // indépendante des habitudes et objectifs → pas de double comptage.
  for (const taskId in (taskRpg || {})) {
    const entry = taskRpg[taskId];
    if (!entry || !entry.completedAt) continue;
    const cats = Array.isArray(entry.categories) ? entry.categories.filter(Boolean) : [];
    if (!cats.length) continue;
    totalXp += TASK_XP;
    for (const cid of cats) attributes[cid] = (attributes[cid] || 0) + TASK_XP;
    activityLog.push({ ts: entry.completedAt, label: entry.title || "Tâche", xp: TASK_XP, attribute: cats[0] || null });
  }
  // XP de la DISCIPLINE : chaque règle respectée (cochée) un jour donné crédite
  // `DISCIPLINE_RULE_XP` à la catégorie « Trading ». On agrège par jour pour le
  // journal d'activité (une ligne par jour = nombre de règles × XP).
  for (const date in (disciplineData || {})) {
    const rules = disciplineData[date] || {};
    const n = Object.values(rules).filter(Boolean).length;
    if (n <= 0) continue;
    const gain = n * DISCIPLINE_RULE_XP;
    totalXp += gain;
    attributes[tradingCatId] = (attributes[tradingCatId] || 0) + gain;
    activityLog.push({ ts: `${date}T09:00:00`, label: `Discipline (${n} règle${n > 1 ? "s" : ""})`, xp: gain, attribute: tradingCatId });
  }
  // Les pénalités peuvent rendre une valeur négative : on borne à 0.
  for (const k in attributes) attributes[k] = Math.max(0, attributes[k]);
  activityLog.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return { attributes, totalXp: Math.max(0, totalXp), coinsEarned, totalCompletions, bestStreak, perHabit, activityLog };
}
// Aplatit l'arbre des objectifs (top-level + sous-objectifs imbriqués).
function flattenGoals(goals) {
  const out = [];
  const walk = (arr) => {
    for (const g of arr || []) {
      out.push(g);
      if (Array.isArray(g.subtasks) && g.subtasks.length) walk(g.subtasks);
    }
  };
  walk(goals);
  return out;
}
// Sous-objectifs « ++ » d'un objectif : ses descendants qui sont eux-mêmes de
// vrais objectifs (`autoType`), aplatis. On IGNORE les sous-tâches simples
// (checklist, sans autoType) et on s'arrête à tout descendant qui possède son
// propre `rpgCategory` — celui-ci a déjà sa propre entrée dans une carte.
function collectSubGoals(goal) {
  const out = [];
  const walk = (arr) => {
    for (const s of arr || []) {
      if (!s.autoType) continue;   // sous-tâche simple → pas un sous-objectif
      if (s.rpgCategory) continue; // rattaché ailleurs → entrée à part entière
      out.push(s);
      if (Array.isArray(s.subtasks) && s.subtasks.length) walk(s.subtasks);
    }
  };
  walk(goal.subtasks);
  return out;
}
// Applique `patch` à l'objectif d'id `id` (récursif sur les sous-objectifs).
function patchGoal(goals, id, patch) {
  return (Array.isArray(goals) ? goals : []).map(g => {
    if (g.id === id) return { ...g, ...patch };
    if (Array.isArray(g.subtasks) && g.subtasks.length) return { ...g, subtasks: patchGoal(g.subtasks, id, patch) };
    return g;
  });
}

/* ---------- État par défaut ---------- */
function defaultState() {
  return {
    categories: DEFAULT_CATEGORIES,
    rewards: [
      { id: 1, label: "Épisode de série",  cost: 30 },
      { id: 2, label: "Sortie restaurant", cost: 150 },
    ],
    redemptions: [],      // { ts, label, cost }
    questsMigrated: true, // les nouveaux comptes n'ont pas d'anciennes quêtes
  };
}

// Anciennes quêtes par défaut — pour migrer les comptes existants qui n'avaient
// jamais personnalisé leurs quêtes (état hérité sans champ `quests`).
const LEGACY_DEFAULT_QUESTS = [
  { id: 1, label: "Séance de sport",   attribute: "force",      difficulty: "hard" },
  { id: 2, label: "Lire 20 pages",     attribute: "intellect",  difficulty: "normal" },
  { id: 3, label: "Appeler un proche", attribute: "social",     difficulty: "easy" },
  { id: 4, label: "Méditer 10 min",    attribute: "discipline", difficulty: "easy" },
];

/* ---------- Page ---------- */
export default function LifeRpgPage() {
  useLang();
  const { setPage } = useApp();
  const [state, setState] = useCloudState(STORAGE_KEY, CLOUD_KEY, defaultState());
  // Habitudes partagées avec la page « Habitudes » (même source de vérité).
  const [habits, setHabits] = useCloudState(STORAGE_HABITS, CLOUD_HABITS, defaultHabits());
  const [habitHistory, setHabitHistory] = useCloudState(STORAGE_HABITS_HISTORY, CLOUD_HABITS_HISTORY, {});
  // Objectifs partagés avec la page « Objectifs » : ceux rattachés à une
  // catégorie (rpgCategory) alimentent son XP au prorata de leur avancement.
  const [goals, setGoals] = useCloudState(GOALS_STORAGE_KEY, GOALS_CLOUD_KEY, []);
  // Liaison « tâche d'agenda → cartes » partagée avec la page Agenda : les tâches
  // terminées et liées créditent de l'XP. On peut désormais en créer ici (une
  // tâche rattachée à une carte), d'où l'accès en écriture.
  const [taskRpg, setTaskRpg] = useCloudState(TASK_RPG_STORAGE_KEY, TASK_RPG_CLOUD_KEY, {});
  // Jour de planification des tâches (écrit aussi par l'Agenda) : une tâche créée
  // ici avec une date y est posée pour apparaître dans le calendrier ; on le lit
  // aussi pour afficher la date des tâches sur les cartes.
  const [taskTimes, setTaskTimes] = useCloudState(TASK_TIMES_STORAGE_KEY, TASK_TIMES_CLOUD_KEY, {});
  // Accès à Google Tasks : une tâche de carte est une VRAIE Google Task, visible
  // et cochable depuis l'Agenda (où sa complétion créditera l'XP de la carte).
  const gcal = useGoogleCalendar();
  const tradesHook = useTrades();
  const trades = useMemo(() => tradesHook?.trades || [], [tradesHook?.trades]);
  const accountsHook = useTradingAccounts();
  const accounts = useMemo(() => accountsHook?.accounts || [], [accountsHook?.accounts]);
  // Discipline quotidienne (page Discipline) : chaque règle respectée crédite
  // la catégorie « Trading » en XP. Source Supabase (90 derniers jours).
  const { disciplineData } = useDisciplineTracking();
  const { pushUndo } = useUndo();

  // Migration : les anciennes sauvegardes n'avaient pas de `categories`.
  useEffect(() => {
    if (!Array.isArray(state.categories)) {
      setState(prev => ({ ...prev, categories: DEFAULT_CATEGORIES }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed UNIQUE de la catégorie « Trading » (alimentée par la page Discipline).
  // Ajoutée une seule fois si absente ; on respecte ensuite une suppression
  // manuelle par l'utilisateur grâce au drapeau `tradingCatSeeded`.
  useEffect(() => {
    setState(prev => {
      if (prev.tradingCatSeeded) return prev;
      const cats = Array.isArray(prev.categories) ? prev.categories : DEFAULT_CATEGORIES;
      // Dédoublonnage par LIBELLÉ + id : si une carte « Trading » existe déjà
      // (même avec un id personnalisé `cat_...`), on ne recrée pas la carte
      // par défaut (id "trading") qui ferait apparaître un doublon.
      if (hasTradingCategory(cats)) {
        return { ...prev, tradingCatSeeded: true };
      }
      const def = DEFAULT_CATEGORIES.find(c => c.id === TRADING_CATEGORY_ID);
      return { ...prev, categories: [...cats, def], tradingCatSeeded: true };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Migration unique : convertit les anciennes quêtes du RPG en habitudes.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    if (state.questsMigrated) return;

    // Comptes existants : on lit les quêtes persistées ; à défaut (état hérité
    // sans champ `quests`) on prend les anciennes quêtes par défaut.
    const quests = Array.isArray(state.quests) && state.quests.length > 0
      ? state.quests
      : (state.quests === undefined ? LEGACY_DEFAULT_QUESTS : []);

    if (quests.length === 0) {
      setState(prev => ({ ...prev, questsMigrated: true, quests: undefined }));
      return;
    }

    const existing = new Set(habits.map(h => (h.name || "").trim().toLowerCase()));
    const base = Date.now();
    const additions = [];
    quests.forEach((q, i) => {
      const nm = (q.label || "").trim();
      if (!nm || existing.has(nm.toLowerCase())) return;
      existing.add(nm.toLowerCase());
      additions.push({
        id: base + i,
        name: nm,
        description: autoDescription(nm),
        icon: "",
        attributes: q.attribute ? [q.attribute] : [],
        difficulty: q.difficulty,
        completedAt: q.completedAt,
      });
    });

    if (additions.length) {
      setHabits(prev => [...prev, ...additions.map(a => ({
        id: a.id, name: a.name, description: a.description, icon: a.icon,
        attributes: a.attributes, difficulty: a.difficulty,
      }))]);
      setHabitHistory(prev => {
        const next = { ...prev };
        for (const a of additions) {
          if (!a.completedAt) continue;
          const dt = new Date(a.completedAt);
          if (isNaN(dt.getTime())) continue;
          const k = getLocalDateString(dt);
          next[a.id] = { ...(next[a.id] || {}), [k]: true };
        }
        return next;
      });
    }
    setState(prev => ({ ...prev, questsMigrated: true, quests: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = Array.isArray(state.categories) ? state.categories : DEFAULT_CATEGORIES;
  const habitsList = useMemo(() => (Array.isArray(habits) ? habits : []), [habits]);
  const goalsList = useMemo(() => (Array.isArray(goals) ? goals : []), [goals]);

  const progress = useMemo(() => computeProgress(habitsList, habitHistory, goalsList, trades, accounts, taskRpg, disciplineData, categories), [habitsList, habitHistory, goalsList, trades, accounts, taskRpg, disciplineData, categories]);
  // Objectifs liés, regroupés par catégorie, avec leur avancement (pour les cartes).
  const goalsByCat = useMemo(() => {
    const map = {};
    const toEntry = (g) => {
      const { current, target, pct, rawPct } = computeGoalProgress(g, trades, accounts);
      const xpFull = Math.max(0, parseInt(g.rpgXp, 10) || 0);
      return {
        id: g.id, label: g.label, pct, rawPct: rawPct != null ? rawPct : pct, current, target, unit: goalUnitOf(g),
        xpGained: Math.round((pct / 100) * xpFull), xpFull,
      };
    };
    for (const g of flattenGoals(goalsList)) {
      if (!g.rpgCategory) continue;
      const entry = toEntry(g);
      // Sous-objectifs ++ (déposés dans cet objectif) affichés sous lui.
      entry.subGoals = collectSubGoals(g).map(toEntry);
      (map[g.rpgCategory] = map[g.rpgCategory] || []).push(entry);
    }
    return map;
  }, [goalsList, trades, accounts]);
  // Tâches liées, regroupées par catégorie (pour les afficher sur les cartes).
  // Dérivées de `taskRpg` (titre + état terminé) + `taskTimes` (jour planifié).
  const tasksByCat = useMemo(() => {
    const map = {};
    const today = getLocalDateString();
    for (const taskId in (taskRpg || {})) {
      const e = taskRpg[taskId];
      const cats = Array.isArray(e?.categories) ? e.categories.filter(Boolean) : [];
      if (!cats.length) continue;
      const tt = taskTimes?.[taskId] || {};
      const day = tt.day || null;
      // Masquage VISUEL propre à cette page (les vraies tâches ne sont pas
      // touchées) : une tâche disparaît des cartes une fois sa date passée.
      //  - date planifiée (deadline) → masquée dès le lendemain de ce jour ;
      //  - sans date → masquée 1 jour après sa création ;
      //  - aucun repère de date connu (ancienne tâche) → conservée.
      const refDay = day || (e.createdAt ? getLocalDateString(new Date(e.createdAt)) : null);
      if (refDay && refDay < today) continue;
      const item = { id: taskId, title: e.title || "Tâche", done: !!e.completedAt, day, startTime: tt.startTime || null, endTime: tt.endTime || null };
      for (const cid of cats) (map[cid] = map[cid] || []).push(item);
    }
    // Non terminées d'abord, puis par date croissante.
    for (const cid in map) map[cid].sort((a, b) => (Number(a.done) - Number(b.done)) || String(a.day || "").localeCompare(String(b.day || "")));
    return map;
  }, [taskRpg, taskTimes]);
  const lvl = useMemo(() => levelInfo(progress.totalXp), [progress.totalXp]);

  // Coche / décoche une tâche de carte : met à jour l'horodatage de complétion
  // (source de vérité locale qui pilote l'affichage ET l'XP), puis synchronise la
  // vraie Google Task en arrière-plan. On NE revient PAS en arrière si Google
  // échoue : l'état local prime, sinon un hoquet réseau décocherait la tâche
  // ~1 s après le clic. La tâche cochée reste « finie » puis quitte la carte le
  // lendemain de sa date (masquage géré dans `tasksByCat`).
  const toggleTaskDone = async (taskId) => {
    const entry = taskRpg[taskId];
    if (!entry) return;
    const nowDone = !(entry.completedAt || null);
    setTaskRpg(prev => {
      const e = prev[taskId];
      if (!e) return prev;
      return { ...prev, [taskId]: { ...e, completedAt: nowDone ? new Date().toISOString() : null } };
    });
    // Synchro Google en best-effort : on laisse l'état local tel quel en cas
    // d'échec (l'utilisateur reverra son action, l'XP est créditée).
    try {
      await gcal.toggleTask(taskId, nowDone);
    } catch (e) {
      console.warn("[LifeRpg] synchro Google de la complétion échouée:", e?.message || e);
    }
  };

  // Supprime une tâche de carte : efface la vraie Google Task et ses liens
  // locaux (MAJ optimiste, restaurés en cas d'échec réseau).
  const deleteTaskFromCard = async (taskId) => {
    const prevRpg = taskRpg[taskId];
    const prevTime = taskTimes[taskId];
    setTaskRpg(prev => { if (!prev[taskId]) return prev; const n = { ...prev }; delete n[taskId]; return n; });
    setTaskTimes(prev => { if (!prev[taskId]) return prev; const n = { ...prev }; delete n[taskId]; return n; });
    try {
      await gcal.deleteTask(taskId);
    } catch {
      if (prevRpg) setTaskRpg(prev => ({ ...prev, [taskId]: prevRpg }));
      if (prevTime) setTaskTimes(prev => ({ ...prev, [taskId]: prevTime }));
    }
  };

  // Création RAPIDE d'une tâche depuis une carte : à partir d'un simple titre
  // (saisie inline dans la carte, sans modale ni date). Crée la vraie Google
  // Task et la rattache à la catégorie. Renvoie/propage une erreur lisible pour
  // que la ligne d'édition inline puisse l'afficher et rester ouverte.
  const createTaskInline = async (cat, rawTitle) => {
    const name = (rawTitle || "").trim();
    if (!name) return;
    const today = getLocalDateString();
    try {
      // Date limite par défaut = aujourd'hui (planifiée comme dans la modale).
      const r = await gcal.createTask({ title: name, notes: "", due: `${today}T00:00:00.000Z` });
      const taskId = r?.task?.id;
      if (!taskId) throw new Error("La tâche n'a pas pu être créée.");
      setTaskRpg(prev => ({ ...prev, [taskId]: { categories: [cat.id], title: name, completedAt: null, createdAt: new Date().toISOString() } }));
      // Couleur de la tâche = couleur de la catégorie (colorId Google le plus proche).
      setTaskTimes(prev => ({ ...prev, [taskId]: { day: today, colorId: nearestGcalColorId(cat.color) } }));
    } catch (e) {
      const msg = e?.message;
      if (msg === "insufficient_scope") throw new Error("Autorisation Google Tasks manquante (reconnecte Google depuis l'Agenda).");
      if (msg === "not_connected") throw new Error("Connecte Google Agenda depuis la page Agenda.");
      if (msg === "refresh_unavailable") throw new Error("Connexion à Google indisponible, réessaie.");
      throw new Error(msg || "Erreur d'enregistrement.");
    }
  };

  /* --- Actions : catégories --- */
  // Sauvegarde automatique d'une catégorie (création ou édition), sans fermer le
  // formulaire : appelée à chaque modification de champ. Upsert par id ; on ne
  // crée une nouvelle catégorie qu'une fois qu'elle a un nom.
  const upsertCategory = (form) => {
    setState(prev => {
      const cats = Array.isArray(prev.categories) ? prev.categories : DEFAULT_CATEGORIES;
      const fields = {
        label: (form.label || "").trim(), color: form.color, icon: form.icon,
        identity: (form.identity || "").trim(),
        roleModel: (form.roleModel || "").trim(),
        roleModelWhy: (form.roleModelWhy || "").trim(),
      };
      const exists = cats.some(c => c.id === form.id);
      if (exists) {
        return { ...prev, categories: cats.map(c => c.id === form.id ? { ...c, ...fields } : c) };
      }
      if (!fields.label) return prev; // pas de création tant qu'il n'y a pas de nom
      return { ...prev, categories: [...cats, { id: form.id, ...fields }] };
    });
  };


  const removeCategory = (id) => {
    const cats = categories;
    if (cats.length <= 1) return; // on garde toujours au moins une catégorie
    const snapCats = state.categories;
    const snapHabits = habits;
    // On retire la catégorie supprimée de la liste des cartes de chaque habitude.
    const dropCat = (prev) => prev.map(h => habitCategoryIds(h).includes(id)
      ? { ...h, attributes: habitCategoryIds(h).filter(x => x !== id), attribute: undefined }
      : h);
    setState(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== id) }));
    setHabits(dropCat);
    pushUndo({
      label: "Suppression de la catégorie",
      undo: async () => { setState(prev => ({ ...prev, categories: snapCats })); setHabits(snapHabits); },
      redo: async () => {
        setState(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== id) }));
        setHabits(dropCat);
      },
    });
  };

  /* --- Modales & vue --- */
  const [categoryModal, setCategoryModal] = useState(null);
  // Modale « + Tâche » d'une carte : porte la catégorie ciblée (la tâche créée
  // lui sera rattachée). null = fermée.
  const [taskModal, setTaskModal] = useState(null);

  const openNewCategory = () => setCategoryModal({ id: `cat_${Date.now()}`, isNew: true, label: "", color: PALETTE[0], icon: "star", identity: "", roleModel: "", roleModelWhy: "" });
  const editCategory = (c) => setCategoryModal({ id: c.id, isNew: false, label: c.label, color: c.color, icon: c.icon, identity: c.identity || "", roleModel: c.roleModel || "", roleModelWhy: c.roleModelWhy || "" });

  // Fermeture du formulaire : nettoie une catégorie tout juste créée mais restée
  // sans nom (cas « ouvert puis abandonné »).
  const closeCategory = () => {
    const cur = categoryModal;
    if (cur && cur.isNew && cur.id) {
      setState(prev => {
        const cats = prev.categories || [];
        const c = cats.find(x => x.id === cur.id);
        if (c && !(c.label || "").trim() && cats.length > 1) {
          return { ...prev, categories: cats.filter(x => x.id !== cur.id) };
        }
        return prev;
      });
    }
    setCategoryModal(null);
  };

  /* --- Rattachement / détachement d'objectifs depuis le menu déroulant d'une
         carte. Cocher = rattacher (XP par défaut), décocher = détacher.
         Pour créer un nouvel objectif, on va sur la page Objectifs. --- */
  const DEFAULT_RPG_XP = 500;
  const toggleObjectiveLink = (catId, goalId) => {
    setGoals(prev => {
      const cur = flattenGoals(prev).find(g => g.id === goalId);
      const linkedHere = cur && cur.rpgCategory === catId;
      return patchGoal(prev, goalId, linkedHere
        ? { rpgCategory: null, rpgXp: 0 }
        : { rpgCategory: catId, rpgXp: DEFAULT_RPG_XP });
    });
  };
  // Détache un objectif (utilisé par le « × » sur la barre de progression).
  const detachObjective = (goalId) => setGoals(prev => patchGoal(prev, goalId, { rpgCategory: null, rpgXp: 0 }));

  /* Création d'un objectif : la liste des objectifs vit désormais DANS cette
     page (GoalsPage en mode intégré), qui nous confie l'ouverture de son
     formulaire. Les boutons « Nouvel objectif » de l'en-tête et des cartes
     passent donc par là, au lieu de renvoyer vers une autre page. */
  const createGoalRef = useRef(null);
  const openGoalForm = () => createGoalRef.current?.();

  return (
    /* 14 px de retrait haut ; blocs à 28 px (les autres pages sont à 36, mais
       celle-ci en empile davantage et respirait trop). */
    <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">

      {/* ─── Barre d'en-tête : seulement le slot de la barre du haut ─── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div id="tr4de-page-header-slot" style={{ marginLeft: "auto" }} />
      </div>

      {/* ─── Bloc héros : le niveau, comme le P&L du dashboard ───
          Libellé atténué, chiffre en gros, puis la barre d'XP (qui porte le
          feedback « +N XP » et le pop de montée de niveau) et l'action de la
          page, posée juste à côté d'elle. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, lineHeight: "17.05px", color: T.textSub }}>Niveau global</span>
          <span style={{ fontSize: 26, fontWeight: 500, lineHeight: 1, letterSpacing: -0.2, color: T.text }}>
            Niveau {lvl.level}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <XpBar
            level={lvl.level}
            pct={lvl.pct}
            intoLevel={lvl.intoLevel}
            neededForNext={lvl.neededForNext}
            totalXp={progress.totalXp}
            fillColor={T.text}
            trackColor={T.accentBg}
            textColor={T.text}
            mutedColor={T.textMut}
            width={180}
          />
          <button type="button" onClick={() => createGoalRef.current?.()} style={btnGhost()}>
            <Plus size={13} strokeWidth={1.75} /> Nouvel objectif
          </button>
          <button type="button" onClick={openNewCategory} style={btnPrimary()}>
            <Plus size={13} strokeWidth={1.75} /> Nouvelle catégorie
          </button>
        </div>
      </div>

      {/* ─── Catégories ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionTitle size="sm">Catégories</SectionTitle>
        {/* Grille pleine largeur : les cartes s'étirent (auto-fit + 1fr). */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {[...categories].sort((a, b) => (progress.attributes[b.id] || 0) - (progress.attributes[a.id] || 0)).map(cat => (
              <PortraitCard key={cat.id} cat={cat}
                xp={progress.attributes[cat.id] || 0}
                habits={habitsList.filter(h => habitCategoryIds(h).includes(cat.id))}
                linkedGoals={goalsByCat[cat.id] || []}
                allObjectives={flattenGoals(goalsList)}
                onToggleObjective={(goalId) => toggleObjectiveLink(cat.id, goalId)}
                onCreateObjective={openGoalForm}
                onDetachObjective={detachObjective}
                tasks={tasksByCat[cat.id] || []}
                onCreateTask={(title) => createTaskInline(cat, title)}
                onToggleTask={toggleTaskDone}
                onEditTask={(tk) => setTaskModal({ cat, task: tk })}
                onDeleteTask={deleteTaskFromCard}
                onEdit={() => editCategory(cat)}
                onDelete={categories.length > 1 ? () => removeCategory(cat.id) : null} />
            ))}
        </div>
      </div>

      {/* ─── Objectifs (la page Objectifs, absorbée ici) ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionTitle size="sm">Objectifs</SectionTitle>
        <GoalsPage embedded registerCreate={(fn) => { createGoalRef.current = fn; }} />
      </div>

      {categoryModal && <CategoryModal initial={categoryModal} onSave={upsertCategory} onClose={closeCategory} onGoToObjectives={() => { closeCategory(); openGoalForm(); }} />}

      {taskModal && (
        <CreateTaskModal cat={taskModal.cat} task={taskModal.task} gcal={gcal}
          setTaskRpg={setTaskRpg} setTaskTimes={setTaskTimes}
          onClose={() => setTaskModal(null)}
          onGoToAgenda={() => { setTaskModal(null); setPage("agenda"); }} />
      )}

      {/* Repli mobile / tablette. */}
      <style>{`
        @media (max-width: 760px) { .tr4de-rpg-grid { grid-template-columns: 1fr !important; } }
        .tr4de-portrait > * + * { margin-top: 14px; }
      `}</style>
    </div>
  );
}

function PortraitCard({ cat, xp, habits, linkedGoals = [], allObjectives = [], tasks = [], onToggleObjective, onCreateObjective, onDetachObjective, onCreateTask, onToggleTask, onEditTask, onDeleteTask, onEdit, onDelete }) {
  const cl = categoryLevel(xp);
  const [hover, setHover] = useState(false);
  const [taskAddHov, setTaskAddHov] = useState(false);
  // Ajout de tâche INLINE : le bouton fait apparaître une ligne éditable vide
  // dans la carte (pas de modale). Enter/clic ailleurs → crée ; vide → annule.
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [taskErr, setTaskErr] = useState(null);
  const submittedRef = useRef(false);
  const openAdd = () => { submittedRef.current = false; setTaskErr(null); setNewTitle(""); setAdding(true); };
  const closeAdd = () => { setAdding(false); setNewTitle(""); setSavingTask(false); };
  const submitNewTask = async () => {
    if (submittedRef.current) return;          // évite le double-appel Enter + blur
    const name = newTitle.trim();
    if (!name) { closeAdd(); return; }
    submittedRef.current = true;
    setSavingTask(true); setTaskErr(null);
    try {
      await onCreateTask(name);
      closeAdd();
    } catch (e) {
      submittedRef.current = false;            // laisse réessayer
      setTaskErr(e?.message || "La tâche n'a pas pu être créée.");
      setSavingTask(false);
    }
  };
  return (
    <div className="tr4de-portrait" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      /* `overflow: visible` contre le réglage par défaut de CARD : le menu
         « Ajouter un objectif » s'ouvre en position absolue sous son
         déclencheur et serait sinon coupé par le bord de la carte. */
      style={{ ...CARD, overflow: "visible", padding: 16, display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Vignette ronde, comme le logo d'un compte sur les pages Comptes. */}
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: `color-mix(in srgb, ${cat.color} 12%, transparent)`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CatIcon name={cat.icon} size={17} strokeWidth={1.75} color={cat.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.25, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label}</div>
          <div style={{ fontSize: 12, lineHeight: 1.25, color: T.text, opacity: 0.45, fontVariantNumeric: "tabular-nums", marginTop: 3 }}>Niveau {cl.level} · {xp} XP</div>
        </div>
        {/* Boutons modifier / supprimer : masqués, visibles au survol de la carte */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0, opacity: hover ? 1 : 0.55, pointerEvents: "auto", transition: "opacity 120ms var(--ease-out)" }}>
          <button onClick={onEdit} title="Modifier" aria-label={`Modifier ${cat.label}`} style={iconBtnSm()}><Pencil size={14} strokeWidth={1.75} /></button>
          {onDelete && <button onClick={onDelete} title="Supprimer" aria-label={`Supprimer ${cat.label}`} style={iconBtnSm()}><Trash2 size={14} strokeWidth={1.75} /></button>}
        </div>
      </div>

      {/* Progression de niveau (illimitée, courbe progressive) */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.text, opacity: 0.5, marginBottom: 6 }}>
          <span>Vers le niveau {cl.level + 1}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{cl.intoLevel} / {cl.neededForNext} XP</span>
        </div>
        <div role="progressbar" aria-valuenow={Math.round(cl.levelPct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progression vers le niveau ${cl.level + 1}`}
          style={{ height: 8, borderRadius: 999, background: T.accentBg, overflow: "hidden" }}>
          <div style={{ width: `${cl.levelPct}%`, height: "100%", background: cat.color, borderRadius: 999, transition: "width var(--dur-slow) var(--ease-out)" }} />
        </div>
      </div>

      {/* Identité future : qui je veux devenir */}
      {cat.identity ? (
        <div style={{ fontSize: 13, color: T.textSub, fontStyle: "italic", lineHeight: 1.45, borderLeft: `3px solid ${cat.color}`, paddingLeft: 10 }}>« {cat.identity} »</div>
      ) : (
        <div style={{ fontSize: 12, color: T.textMut, fontStyle: "italic" }}>{"Aucune identité définie — cliquez sur ✎ pour décrire qui vous voulez devenir."}</div>
      )}

      {/* Personne à qui je veux ressembler (modèle) — couleur atténuée, moins visible que l'objectif */}
      {cat.roleModel && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 14px", borderRadius: "var(--radius-card)", background: `color-mix(in srgb, ${cat.color} 3%, transparent)`, border: `1px solid color-mix(in srgb, ${cat.color} 11%, transparent)` }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: `color-mix(in srgb, ${cat.color} 8%, transparent)`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <UserRound size={15} strokeWidth={1.75} color={cat.color} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: cat.color, marginBottom: 3, opacity: 0.85 }}>Mon modèle</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{cat.roleModel}</div>
            {cat.roleModelWhy && <div style={{ fontSize: 11.5, color: T.textSub, marginTop: 3, lineHeight: 1.45 }}>{cat.roleModelWhy}</div>}
          </div>
        </div>
      )}

      {/* Objectifs liés depuis la page « Objectifs » (rpgCategory). La progression
          se gère sur la page Objectifs ; ici elle donne l'XP au prorata. On peut
          créer un objectif directement (il devient un vrai objectif rattaché). */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMut, marginBottom: 8 }}>Objectifs</div>
        {linkedGoals.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {linkedGoals.map(g => {
              const reached = g.pct >= 100;
              const negative = g.rawPct < 0;
              return (
                <div key={g.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: reached ? T.green : T.textSub, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtGoalVal(g.current, g.unit)} / {fmtGoalVal(g.target, g.unit)}</span>
                    {onDetachObjective && (
                      <button onClick={() => onDetachObjective(g.id)} title="Retirer de cette catégorie" aria-label={`Retirer « ${g.label} » de cette catégorie`}
                        style={{ ...iconBtnSm(), width: 18, height: 18, opacity: hover ? 1 : 0.5, pointerEvents: "auto", transition: "opacity .15s ease" }}>
                        <X size={12} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }} title={`+${g.xpGained} / ${g.xpFull} XP`}>
                    <div role="progressbar" aria-valuenow={Math.round(g.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.label} : ${Math.round(g.rawPct)}%`}
                      style={{ flex: 1, height: 6, borderRadius: 999, background: T.accentBg, overflow: "hidden" }}>
                      <div style={{ width: `${g.pct}%`, height: "100%", background: negative ? T.red : reached ? T.green : cat.color, borderRadius: 999, transition: "width var(--dur-slow) var(--ease-out)" }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: negative ? T.red : reached ? T.green : T.textMut, fontVariantNumeric: "tabular-nums", flexShrink: 0, minWidth: 32, textAlign: "right" }}>{reached ? "100%" : `${Math.round(g.rawPct)}%`}</span>
                  </div>
                  {/* Sous-objectifs ++ (déposés dans cet objectif) : en dessous,
                      plus petits. Label et valeurs à CÔTÉ de la barre (une ligne). */}
                  {Array.isArray(g.subGoals) && g.subGoals.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8, paddingLeft: 12 }}>
                      {g.subGoals.map(sg => {
                        const sgReached = sg.pct >= 100;
                        const sgNegative = sg.rawPct < 0;
                        return (
                          <div key={sg.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ flexShrink: 0, maxWidth: "42%", fontSize: 11.5, fontWeight: 600, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sg.label}</span>
                            <div role="progressbar" aria-valuenow={Math.round(sg.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${sg.label} : ${Math.round(sg.rawPct)}%`}
                              style={{ flex: 1, minWidth: 0, height: 4, borderRadius: 999, background: T.accentBg, overflow: "hidden" }}>
                              <div style={{ width: `${sg.pct}%`, height: "100%", background: sgNegative ? T.red : sgReached ? T.green : cat.color, borderRadius: 999, opacity: 0.75, transition: "width var(--dur-slow) var(--ease-out)" }} />
                            </div>
                            <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: sgNegative ? T.red : sgReached ? T.green : T.textMut, fontVariantNumeric: "tabular-nums" }}>{fmtGoalVal(sg.current, sg.unit)} / {fmtGoalVal(sg.target, sg.unit)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {onToggleObjective && (
          <div style={{ marginTop: linkedGoals.length > 0 ? 10 : 0 }}>
            <ObjectiveMultiSelect objectives={allObjectives} catId={cat.id} color={cat.color}
              onToggle={onToggleObjective} onCreate={onCreateObjective} compact />
          </div>
        )}
      </div>


      {/* Tâches liées au calendrier : créées ici, ce sont de vraies tâches de
          l'Agenda dont la complétion crédite l'XP de la carte. Cochables ici.
          La liste s'affiche dès qu'il y a des tâches ; le bouton d'ajout pleine
          largeur reste toujours présent en dessous. */}
      {onCreateTask && (
        <div>
          {(tasks.length > 0 || adding) && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMut, marginBottom: 8 }}>Tâches</div>
              <div style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
                {tasks.map((tk) => (
                  <TaskRow key={tk.id} tk={tk} cat={cat}
                    onToggle={() => onToggleTask && onToggleTask(tk.id)}
                    onEdit={onEditTask ? () => onEditTask(tk) : null}
                    onDelete={onDeleteTask ? () => onDeleteTask(tk.id) : null} />
                ))}
                {/* Ligne d'ajout inline : petite tâche vide, cochage désactivé
                    tant qu'elle n'existe pas ; champ de titre auto-focus. */}
                {adding && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <span style={{ width: 15, height: 15, borderRadius: "var(--radius-field)", flexShrink: 0, border: `1.5px solid ${T.border}`, background: T.white }} />
                    <input autoFocus value={newTitle} disabled={savingTask}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") submitNewTask();
                        else if (e.key === "Escape") { submittedRef.current = true; closeAdd(); setTaskErr(null); }
                      }}
                      onBlur={submitNewTask}
                      placeholder="Nouvelle tâche…"
                      style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: T.text, fontFamily: "inherit", padding: 0 }} />
                  </div>
                )}
              </div>
            </>
          )}
          {taskErr && <div style={{ fontSize: 11, color: T.red, marginBottom: 8, lineHeight: 1.4 }}>{taskErr}</div>}
          {/* Dès qu'une tâche existe, l'ajout devient un lien discret « + Ajouter »
              (même style que celui des objectifs) ; sinon un bouton pleine largeur.
              Masqué pendant la saisie inline. */}
          {!adding && (tasks.length > 0 ? (
            <button type="button" onClick={openAdd}
              onMouseEnter={() => setTaskAddHov(true)} onMouseLeave={() => setTaskAddHov(false)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: taskAddHov ? T.textSub : T.textMut, opacity: taskAddHov ? 1 : 0.65, transition: "color .15s ease, opacity .15s ease" }}>
              <Plus size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
              Ajouter
            </button>
          ) : (
            <button onClick={openAdd}
              style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", borderRadius: 999, border: `1px dashed color-mix(in srgb, ${cat.color} 40%, transparent)`, background: `color-mix(in srgb, ${cat.color} 5%, transparent)`, color: cat.color, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${cat.color} 10%, transparent)`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `color-mix(in srgb, ${cat.color} 5%, transparent)`; }}>
              <CalendarPlus size={14} strokeWidth={2} /> Ajouter une tâche
            </button>
          ))}
        </div>
      )}

      {/* Habitudes rattachées */}
      <div>
        <div style={{ fontSize: 11, color: T.textMut, marginBottom: 6 }}>{habits.length} habitude{habits.length > 1 ? "s" : ""} rattachée{habits.length > 1 ? "s" : ""}</div>
        {habits.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {habits.slice(0, 6).map(h => (
              <span key={h.id} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: T.bg, border: `1px solid ${T.border}`, color: T.textSub, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
            ))}
            {habits.length > 6 && <span style={{ fontSize: 11, color: T.textMut, alignSelf: "center" }}>+{habits.length - 6}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// Formate un jour "YYYY-MM-DD" en libellé court « 5 juil. » (fuseau local).
function fmtDayShort(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Idem en libellé long « sam. 5 juillet » (déclencheur du sélecteur de date).
function fmtDayLong(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
}

// Ligne d'une tâche de carte : case à cocher (complétion → XP), titre, date, et
// actions modifier / supprimer révélées au survol de la ligne.
function TaskRow({ tk, cat, onToggle, onEdit, onDelete }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
      <button onClick={onToggle} title={tk.done ? "Marquer à faire" : "Marquer terminée"}
        role="checkbox" aria-checked={tk.done} aria-label={`${tk.title} — ${tk.done ? "terminée" : "à faire"}`}
        style={{ width: 15, height: 15, borderRadius: "var(--radius-field)", flexShrink: 0, border: `1.5px solid ${tk.done ? cat.color : T.border}`, background: tk.done ? cat.color : T.white, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
        {tk.done && <Check size={10} strokeWidth={3} />}
      </button>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: tk.done ? T.textMut : T.text, textDecoration: tk.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.title}</span>
      {/* Date cliquable : ouvre la modale d'édition (choix/modification de la date
          via le mini-calendrier). Sans date, un « Dater » discret apparaît au survol. */}
      {onEdit ? (
        <button type="button" onClick={onEdit} title={tk.day ? "Modifier la date" : "Ajouter une date"}
          style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: "2px 5px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: tk.day ? T.textMut : T.blue, opacity: tk.day ? 1 : (hov ? 1 : 0), transition: "opacity .15s ease, background .12s ease" }}
          onMouseEnter={e => { e.currentTarget.style.background = T.accentBg; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
          <CalendarClock size={11} strokeWidth={2} />
          {tk.day ? (tk.startTime ? `${fmtDayShort(tk.day)} · ${tk.startTime}` : fmtDayShort(tk.day)) : "Dater"}
        </button>
      ) : (
        tk.day && <span style={{ fontSize: 10.5, color: T.textMut, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{tk.startTime ? `${fmtDayShort(tk.day)} · ${tk.startTime}` : fmtDayShort(tk.day)}</span>
      )}
      {onDelete && (
        <div style={{ display: "flex", gap: 2, flexShrink: 0, opacity: hov ? 1 : 0.5, pointerEvents: "auto", transition: "opacity .15s ease" }}>
          <button onClick={onDelete} title="Supprimer" aria-label={`Supprimer la tâche ${tk.title}`} style={iconBtnSm()}><Trash2 size={12} strokeWidth={1.75} /></button>
        </div>
      )}
    </div>
  );
}

// Menu déroulant multi-sélection des objectifs (même principe que les émotions
// du formulaire de trade) : un déclencheur, puis une liste cochable de TOUS les
// objectifs. Cocher rattache à la catégorie, décocher détache. Ferme au clic
// dehors. Dernière entrée : créer un objectif (redirige vers la page Objectifs).
function ObjectiveMultiSelect({ objectives, catId, color, onToggle, onCreate, compact = false }) {
  const [open, setOpen] = useState(false);
  const [hov, setHov] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  // En mode compact (des objectifs sont déjà rattachés), le déclencheur s'efface :
  // simple lien discret « + Ajouter », qui ne s'illumine qu'au survol ou à l'ouverture.
  return (
    <div ref={ref} style={{ position: "relative", fontFamily: "var(--font-sans)" }}>
      {compact ? (
        <button type="button" onClick={() => setOpen(o => !o)}
          onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: (open || hov) ? T.textSub : T.textMut, opacity: (open || hov) ? 1 : 0.65, transition: "color .15s ease, opacity .15s ease" }}>
          <Plus size={13} strokeWidth={2} style={{ flexShrink: 0, transform: open ? "rotate(45deg)" : "none", transition: "transform .15s ease" }} />
          Ajouter
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", border: `1px solid ${T.border}`, borderRadius: 999, background: T.white, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: T.textSub }}>Ajouter un objectif</span>
          <Plus size={14} strokeWidth={2} color={T.textMut} style={{ flexShrink: 0, transform: open ? "rotate(45deg)" : "none", transition: "transform .15s ease" }} />
        </button>
      )}
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: 6, boxShadow: "var(--elev-overlay)", maxHeight: 260, overflowY: "auto" }}>
          {objectives.map(g => {
            const here = g.rpgCategory === catId;
            const elsewhere = !!g.rpgCategory && !here;
            return (
              <button key={g.id} type="button" onClick={() => onToggle(g.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "none", borderRadius: "var(--radius-card)", background: here ? T.accentBg : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                onMouseEnter={e => { if (!here) e.currentTarget.style.background = T.bg; }}
                onMouseLeave={e => { if (!here) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: 16, height: 16, borderRadius: "var(--radius-field)", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${here ? color : T.border}`, background: here ? color : T.white, color: "#fff" }}>{here && <Check size={11} strokeWidth={3} />}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label || "Objectif"}</span>
                {elsewhere && <span style={{ fontSize: 9, color: T.textMut, flexShrink: 0 }}>rattaché ailleurs</span>}
              </button>
            );
          })}
          {onCreate && (
            <button type="button" onClick={() => { setOpen(false); onCreate(); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginTop: objectives.length ? 4 : 0, borderTop: objectives.length ? `1px solid ${T.border}` : "none", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: T.textSub, fontSize: 12.5, fontWeight: 600 }}>
              <Plus size={14} strokeWidth={2} /> Créer un objectif
            </button>
          )}
        </div>
      )}
    </div>
  );
}


/* ---------- Graphique de progression du niveau ---------- */
/* ---------- Modales ---------- */
function CategoryModal({ initial, onSave, onClose, onGoToObjectives }) {
  const [form, setForm] = useState(initial);
  // Sélecteur d'icône + couleur, déplié en cliquant sur l'icône à côté du nom.
  const [showStyle, setShowStyle] = useState(false);
  // Sauvegarde automatique : chaque modification est persistée (petit debounce).
  // Le tout premier rendu (valeurs initiales) est ignoré, et on « flush » la
  // dernière valeur à la fermeture pour ne rien perdre.
  const onSaveRef = useRef(onSave);
  const formRef = useRef(form);
  useEffect(() => { onSaveRef.current = onSave; formRef.current = form; });
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    const tid = setTimeout(() => onSaveRef.current(formRef.current), 300);
    return () => clearTimeout(tid);
  }, [form]);
  useEffect(() => () => onSaveRef.current(formRef.current), []);
  return (
    <Overlay onClose={onClose} title={initial.isNew ? "Nouvelle catégorie" : "Modifier la catégorie"}>
      <Field label="Nom de la catégorie">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setShowStyle(v => !v)} title="Changer l'icône et la couleur"
            style={{ width: 40, height: 40, borderRadius: 10, background: `color-mix(in srgb, ${form.color} 10%, transparent)`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: showStyle ? `1.5px solid ${form.color}` : "1.5px solid transparent", padding: 0, cursor: "pointer" }}>
            <CatIcon name={form.icon} size={18} strokeWidth={1.75} color={form.color} />
          </button>
          <input autoFocus value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
            placeholder="ex : Spiritualité" style={input()} />
        </div>
      </Field>

      {showStyle && (
        <div style={{ marginTop: -4, marginBottom: 14, padding: 12, borderRadius: 10, background: T.bg, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={objLbl}>Couleur</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PALETTE.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} title={c}
                  style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: form.color === c ? `2px solid ${T.text}` : `2px solid transparent`, cursor: "pointer", boxShadow: `0 0 0 1px ${T.border}` }} />
              ))}
            </div>
          </div>
          <div>
            <div style={objLbl}>Icône</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 6 }}>
              {ICON_KEYS.map(key => {
                const active = form.icon === key;
                return (
                  <button key={key} onClick={() => setForm({ ...form, icon: key })}
                    style={{ aspectRatio: "1", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-card)", border: `1px solid ${active ? form.color : T.border}`, background: active ? `color-mix(in srgb, ${form.color} 8%, transparent)` : T.white, cursor: "pointer" }}>
                    <CatIcon name={key} size={15} strokeWidth={1.75} color={active ? form.color : T.textSub} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Field label="Qui je veux devenir dans le futur">
        <AutoTextarea value={form.identity} onChange={e => setForm({ ...form, identity: e.target.value })}
          placeholder="ex : Je suis quelqu'un qui médite et cultive la gratitude chaque jour."
          minRows={2} />
      </Field>

      <Field label="La personne à qui je veux ressembler">
        <input value={form.roleModel} onChange={e => setForm({ ...form, roleModel: e.target.value })}
          placeholder="ex : un mentor, un athlète, un proche inspirant…" style={input()} />
      </Field>

      <Field label="Ce que j'admire chez cette personne (optionnel)">
        <textarea value={form.roleModelWhy} onChange={e => setForm({ ...form, roleModelWhy: e.target.value })}
          placeholder="ex : sa rigueur, sa bienveillance, sa constance au quotidien…"
          rows={2} style={{ ...input(), resize: "vertical", lineHeight: 1.4 }} />
      </Field>

      <Field label="Objectifs">
        <button onClick={onGoToObjectives}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.white, color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <Target size={14} strokeWidth={1.9} /> Gérer les objectifs
        </button>
      </Field>


      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: T.textMut }}>
          <Check size={12} strokeWidth={2.5} color={T.green} /> Enregistré automatiquement
        </span>
        <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 999, border: `1px solid ${T.text}`, background: T.text, color: T.white, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
      </div>
    </Overlay>
  );
}

// Modale de tâche d'une carte. En création : crée une VRAIE Google Task (visible
// et cochable depuis l'Agenda), la rattache à la carte via `taskRpg` (XP à la
// complétion) et, si une date est fournie, la pose ce jour-là via `taskTimes`.
// En édition (prop `task`) : met à jour le titre et la date de la tâche existante.
function CreateTaskModal({ cat, task, gcal, setTaskRpg, setTaskTimes, onClose, onGoToAgenda }) {
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title || "");
  const [date, setDate] = useState(isEdit ? (task.day || "") : getLocalDateString());
  // Heure de planification (facultative) : sans heure, la tâche est « toute la
  // journée » ; avec heure, elle est posée sur ce créneau dans l'Agenda.
  const [hasTime, setHasTime] = useState(!!task?.startTime);
  const [startTime, setStartTime] = useState(task?.startTime || "09:00");
  const [endTime, setEndTime] = useState(task?.endTime || "10:00");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Ancre du popover : le calendrier est rendu via un portail (position fixe) pour
  // ne pas être rogné par l'`overflow` de la modale ; on mémorise la position du
  // déclencheur au moment de l'ouverture.
  const dateBtnRef = useRef(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const openPicker = () => {
    if (dateBtnRef.current) setAnchorRect(dateBtnRef.current.getBoundingClientRect());
    setPickerOpen(o => !o);
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // On n'affiche le pont « connexion » qu'une fois l'état des tokens chargé.
  const needsConnect = gcal.ready && !gcal.connected;

  const save = async () => {
    const name = title.trim();
    if (!name) { setError("Donne un titre à la tâche."); return; }
    setSaving(true);
    setError(null);
    try {
      const due = date ? `${date}T00:00:00.000Z` : null;
      // Recalcule l'entrée `taskTimes` (jour + heure) au même format que l'Agenda :
      // avec heure → { day, startTime, endTime } ; sinon tâche « toute la journée ».
      // On préserve les autres champs (couleur) déjà posés.
      const applyTimes = (prevEntry) => {
        const base = { ...(prevEntry || {}), day: date || null };
        if (date && hasTime) { base.startTime = startTime; base.endTime = endTime; }
        else { delete base.startTime; delete base.endTime; }
        return base;
      };
      if (isEdit) {
        await gcal.updateTask(task.id, { title: name, notes: "", due });
        // Met à jour le titre du lien (catégories et complétion inchangés).
        setTaskRpg(prev => { const e = prev[task.id]; if (!e) return prev; return { ...prev, [task.id]: { ...e, title: name } }; });
        // Recale le jour/l'heure planifiés ; sans date, la tâche redevient à planifier.
        setTaskTimes(prev => ({ ...prev, [task.id]: applyTimes(prev[task.id]) }));
      } else {
        const r = await gcal.createTask({ title: name, notes: "", due });
        const taskId = r?.task?.id;
        if (!taskId) throw new Error("La tâche n'a pas pu être créée.");
        // Lien carte → XP (même format que celui écrit par la page Agenda).
        setTaskRpg(prev => ({ ...prev, [taskId]: { categories: [cat.id], title: name, completedAt: null, createdAt: new Date().toISOString() } }));
        // Jour (et heure éventuelle) de planification pour l'afficher dans l'Agenda ;
        // sans date, la tâche reste non posée jusqu'à sa planification.
        if (date) setTaskTimes(prev => ({ ...prev, [taskId]: applyTimes({ colorId: nearestGcalColorId(cat.color) }) }));
      }
      onClose();
    } catch (e) {
      const msg = e?.message;
      if (msg === "insufficient_scope") setError("Autorisation Google Tasks manquante. Reconnecte Google depuis l'Agenda.");
      else if (msg === "not_connected") setError("Connecte d'abord Google Agenda depuis la page Agenda.");
      else if (msg === "refresh_unavailable") setError("Connexion à Google indisponible, réessaie dans un instant.");
      else setError(msg || "Erreur d'enregistrement.");
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose} title={isEdit ? "Modifier la tâche" : "Nouvelle tâche"}>
      {/* Rappel de la carte à laquelle la tâche est rattachée */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 12.5, color: T.textSub }}>
        <span style={{ width: 24, height: 24, borderRadius: "var(--radius-card)", background: `color-mix(in srgb, ${cat.color} 10%, transparent)`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CatIcon name={cat.icon} size={14} strokeWidth={1.9} color={cat.color} />
        </span>
        <span>Rattachée à <strong style={{ color: cat.color }}>{cat.label}</strong></span>
      </div>

      {needsConnect ? (
        <div>
          <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.55, marginBottom: 14 }}>
            Les tâches sont synchronisées avec Google Agenda. Connecte ton compte Google (depuis la page Agenda) pour créer une tâche liée au calendrier.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} style={btnGhost()}>Annuler</button>
            <button onClick={onGoToAgenda} style={btnDark()}>
              <CalendarClock size={14} strokeWidth={2} /> {"Aller à l'Agenda"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <Field label="Titre de la tâche">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !saving && title.trim()) save(); }}
              placeholder="ex : Séance de sport 1h" style={input()} />
          </Field>

          <Field label="Date (optionnelle)">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Déclencheur : ouvre le mini-calendrier (même composant que l'Agenda). */}
              <button type="button" ref={dateBtnRef} onClick={openPicker}
                style={{ ...input(), flex: 1, cursor: "pointer", textAlign: "left", color: date ? T.text : T.textMut, textTransform: date ? "capitalize" : "none" }}>
                {date ? fmtDayLong(date) : "Choisir une date"}
              </button>
              {/* Retirer la date (redevient « à planifier »). */}
              {date && (
                <button type="button" onClick={() => setDate("")} title="Retirer la date" style={iconBtn()}>
                  <X size={15} strokeWidth={2} />
                </button>
              )}
            </div>
            {/* Heure (facultative) : uniquement si une date est posée. */}
            {date && (
              <div style={{ marginTop: 10 }}>
                {hasTime ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <TimeField value={startTime} onChange={setStartTime} portal
                        triggerStyle={{ ...input(), display: "inline-flex", alignItems: "center", justifyContent: "space-between", width: "100%", cursor: "pointer" }} />
                    </div>
                    <span style={{ color: T.textMut, fontSize: 13, flexShrink: 0 }}>→</span>
                    <div style={{ flex: 1 }}>
                      <TimeField value={endTime} onChange={setEndTime} portal
                        triggerStyle={{ ...input(), display: "inline-flex", alignItems: "center", justifyContent: "space-between", width: "100%", cursor: "pointer" }} />
                    </div>
                    <button type="button" onClick={() => setHasTime(false)} title="Toute la journée" style={iconBtn()}>
                      <X size={15} strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setHasTime(true)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: T.blue }}>
                    <CalendarClock size={13} strokeWidth={2} /> Ajouter une heure
                  </button>
                )}
              </div>
            )}
            {/* Popover via portail (position fixe) : déborde librement au lieu d'être
                coupé par le défilement/`overflow` de la modale. */}
            {pickerOpen && anchorRect && ReactDOM.createPortal(
              <div style={{ position: "fixed", top: anchorRect.bottom, left: anchorRect.left, width: anchorRect.width, zIndex: 11000 }}>
                <MiniCalendar
                  value={date ? new Date(`${date}T00:00:00`) : new Date()}
                  onSelect={(d) => setDate(getLocalDateString(d))}
                  onClose={() => setPickerOpen(false)}
                  align="left"
                />
              </div>,
              document.body
            )}
          </Field>

          <div style={{ fontSize: 11, color: T.textMut, marginTop: -6, marginBottom: 14, lineHeight: 1.5 }}>
            {date
              ? `Elle apparaîtra dans l'Agenda. En la cochant terminée, tu gagneras ${TASK_XP} XP en ${cat.label}.`
              : `Sans date, elle restera à planifier. Une fois cochée terminée, tu gagneras ${TASK_XP} XP en ${cat.label}.`}
          </div>

          {error && <div style={{ fontSize: 12, color: T.red, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} disabled={saving} style={btnGhost()}>Annuler</button>
            <button onClick={save} disabled={saving || !title.trim()}
              style={{ ...btnDark(), opacity: (saving || !title.trim()) ? 0.55 : 1, cursor: (saving || !title.trim()) ? "default" : "pointer" }}>
              {saving ? "Enregistrement…" : (isEdit ? "Enregistrer" : "Créer la tâche")}
            </button>
          </div>
        </>
      )}
    </Overlay>
  );
}

/* ---------- Primitifs UI ---------- */
function Overlay({ title, children, onClose }) {
  // Rendu via un portail sur document.body : la div racine de la page est
  // animée (transform), ce qui ferait d'elle le bloc conteneur d'un élément
  // `position: fixed` et décalerait la modale. Le portail l'en sort.
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  if (typeof document === "undefined") return null;

  // Déplacement de la fenêtre par l'en-tête (exactement comme la page Sport).
  const startWindowDrag = (e) => {
    if (e.target.closest("button")) return; // pas de drag en cliquant un bouton
    e.preventDefault();
    setDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
    const onMove = (ev) => {
      const d = dragRef.current; if (!d) return;
      setPos({ x: d.baseX + (ev.clientX - d.startX), y: d.baseY + (ev.clientY - d.startY) });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return ReactDOM.createPortal(
    // `backdropDismiss` : ne ferme QUE si le clic commence ET finit sur le fond
    // (plus de fermeture quand on relâche la souris hors du formulaire / drag).
    <div {...backdropDismiss(onClose)}
      style={{ position: "fixed", inset: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      {/* Pas d'animation `transform` sur le modal : elle écraserait le translate du drag. */}
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: 440, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", background: T.white, borderRadius: 14, padding: 20, fontFamily: "var(--font-sans)", border: `1px solid ${T.border}`, boxShadow: "var(--elev-overlay)", transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        {/* En-tête = poignée de déplacement (barre grise centrée), façon Sport. */}
        <div onMouseDown={startWindowDrag} title="Glisser pour déplacer la fenêtre"
          style={{ position: "relative", display: "flex", alignItems: "center", marginBottom: 16, paddingTop: 8, cursor: "move", userSelect: "none" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", width: 40, height: 4, borderRadius: 999, background: dragging ? T.textMut : T.border, transition: "background-color 120ms ease" }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text, margin: 0 }}>{title}</h3>
          <button onMouseDown={e => e.stopPropagation()} onClick={onClose} style={{ ...iconBtn(), marginLeft: "auto" }}><X size={16} strokeWidth={1.75} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

// Zone de texte qui s'agrandit automatiquement avec son contenu (pas de scroll
// interne) : hauteur de départ = `minRows` lignes, puis croît ligne par ligne.
function AutoTextarea({ value, onChange, placeholder, minRows = 3, style }) {
  const ref = useRef(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // Resynchronise la hauteur quand la valeur change (saisie, ouverture en édition).
  useEffect(() => { resize(); }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={onChange} placeholder={placeholder}
      rows={minRows} onInput={resize}
      style={{ ...input(), resize: "none", overflow: "hidden", lineHeight: 1.5, ...style }} />
  );
}


/* ---------- Styles partagés ----------
   Les pilules reprennent celles des barres d'en-tête de la nouvelle DA (pages
   Comptes et Calendrier) : 12 px, pas de bordure, l'action principale en aplat
   d'encre, les secondaires en blanc posé sur l'ombre de pilule. */
function btnPrimary() {
  return { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", minHeight: 32, borderRadius: 999, border: "none", background: T.text, color: T.textInverted, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
}
// Bouton d'action principal d'une modale (fond sombre, cible plus généreuse).
function btnDark() {
  return { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", minHeight: 40, borderRadius: 999, border: "none", background: T.text, color: T.textInverted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
}
// Bouton secondaire d'une modale.
function btnGhost() {
  return { padding: "9px 16px", minHeight: 40, borderRadius: 999, border: "none", background: T.white, boxShadow: T.elevPill, color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
}
function iconBtn() {
  return { width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
}
/* Variante des cartes de catégorie. 28 px comme les actions de ligne de la page
   Comptes (RowIconButton) : l'icône reste petite, la cible reste atteignable. */
function iconBtnSm() {
  return { width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
}
// Petit libellé au-dessus des champs de la modale de catégorie.
const objLbl = { fontSize: 11, color: T.textSub, fontWeight: 500, marginBottom: 4 };
function input() {
  return { width: "100%", padding: "9px 12px", border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", background: T.white, fontSize: 14, color: T.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
}
