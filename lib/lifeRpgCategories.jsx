"use client";

/**
 * Constantes partagées des cartes de la page « Quête de soi » (Vie RPG).
 *
 * Depuis la refonte « 3 objectifs de l'année », une carte n'est plus une
 * catégorie de vie parmi une dizaine : c'est l'UN DES TROIS OBJECTIFS MAJEURS
 * de l'année civile en cours. Trois cartes maximum, pas une de plus — c'est le
 * cœur du système : on ne peut pas mener dix combats de front.
 *
 * La clé de données reste `life_rpg.categories` (et `rpgCategory` côté
 * objectifs, `categories` côté tâches d'agenda) : le rattachement habitudes /
 * tâches / objectifs continue de fonctionner à l'identique, seul le sens et le
 * nombre changent.
 *
 * Module neutre (aucune dépendance aux pages) afin d'éviter tout import
 * circulaire : la page « Habitudes » (DailyPlannerPage), l'Agenda, les
 * Objectifs et la page « Quête de soi » l'importent tous.
 */

import React from "react";
import {
  Dumbbell, GraduationCap, Users, ShieldCheck, Wallet, Star, Sparkles, Zap,
  Calendar, Heart, Activity, BookOpen, Target, TrendingUp, Briefcase, Code,
  Trophy, Flame,
} from "lucide-react";
import { DUO, DUO_TONES } from "@/lib/ui/duoPalette";

// Clés de persistance de l'état Vie RPG (localStorage + Supabase).
export const RPG_STORAGE_KEY = "tr4de_life_rpg";
export const RPG_CLOUD_KEY = "life_rpg";

// Lien « tâche d'agenda → cartes Vie RPG » (+ état de complétion), partagé entre
// la page Agenda (qui l'écrit) et la page Vie RPG (qui le lit pour l'XP). On
// l'indexe par id de Google Task : { [taskId]: { categories, completedAt, title } }.
export const TASK_RPG_STORAGE_KEY = "tr4de_agenda_task_rpg";
export const TASK_RPG_CLOUD_KEY = "agenda_task_rpg";
// XP gagnée pour une tâche terminée, par catégorie liée (≈ une habitude « normale »).
export const TASK_XP = 25;

// Lien « page Discipline → page Vie RPG » : chaque règle de discipline respectée
// (cochée un jour donné) crédite de l'XP à la catégorie « Trading ». Source
// indépendante des habitudes/objectifs/tâches → pas de double comptage.
export const TRADING_CATEGORY_ID = "trading";
export const DISCIPLINE_RULE_XP = 10;

// Résout l'id de la catégorie « Trading » RÉELLEMENT présente chez l'utilisateur.
// Historiquement, l'XP de discipline (et le seed automatique) ciblaient un id
// figé "trading". Si l'utilisateur a renommé ou recréé sa carte Trading à la
// main (id `cat_...`), cet XP tombait dans le vide et pouvait faire naître une
// 2ᵉ carte "trading" en double au moment du seed. On cible donc en priorité la
// carte par son LIBELLÉ « Trading », puis par l'id historique, sinon on retombe
// sur la constante. Ainsi l'XP se consolide sur une seule carte.
export function resolveTradingCatId(categories) {
  const cats = Array.isArray(categories) ? categories : [];
  const byLabel = cats.find(c => String(c?.label || "").trim().toLowerCase() === "trading");
  if (byLabel) return byLabel.id;
  const byId = cats.find(c => c?.id === TRADING_CATEGORY_ID);
  if (byId) return byId.id;
  return TRADING_CATEGORY_ID;
}

// Vrai si une catégorie « Trading » existe déjà (par id historique OU par
// libellé), pour éviter de créer un doublon au seed.
export function hasTradingCategory(categories) {
  const cats = Array.isArray(categories) ? categories : [];
  return cats.some(c => c?.id === TRADING_CATEGORY_ID
    || String(c?.label || "").trim().toLowerCase() === "trading");
}

// Horaires locaux d'une tâche d'agenda (jour planifié + heure éventuelle),
// indexés par id de Google Task : { [taskId]: { day, startTime?, endTime?, colorId } }.
// Partagé entre la page Agenda et la page Vie RPG (qui peut créer une tâche datée
// rattachée à une carte). Google Tasks ne stocke que la date limite (`due`), pas
// le jour où l'on pose la tâche → on le conserve côté tr4de.
export const TASK_TIMES_STORAGE_KEY = "tr4de_task_times";
export const TASK_TIMES_CLOUD_KEY = "task_times";

// Catégories (« cartes ») rattachées à une habitude. Une habitude peut être
// liée à PLUSIEURS cartes. Rétrocompatible avec l'ancien champ `attribute`
// (id unique) : on le convertit en tableau à un élément.
export function habitCategoryIds(h) {
  if (Array.isArray(h?.attributes)) return h.attributes.filter(Boolean);
  return h?.attribute ? [h.attribute] : [];
}

// Banque d'icônes disponibles pour les catégories (clé string ↔ composant).
export const CATEGORY_ICONS = {
  dumbbell: Dumbbell, graduation: GraduationCap, users: Users, shield: ShieldCheck,
  heart: Heart, activity: Activity, wallet: Wallet, book: BookOpen, sparkles: Sparkles,
  star: Star, zap: Zap, target: Target, trending: TrendingUp, calendar: Calendar,
  trophy: Trophy, flame: Flame, briefcase: Briefcase, code: Code,
};
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

// Rend l'icône d'une catégorie. Composant défini au niveau module (et non via
// un alias obtenu pendant le rendu) pour respecter la règle ESLint « ne pas
// créer de composant pendant le rendu ».
export function CatIcon({ name, ...rest }) {
  const Ic = CATEGORY_ICONS[name] || Star;
  return <Ic {...rest} />;
}

// Palette de couleurs proposée pour les catégories. Les huit teintes de la
// charte Duolingo (cf. lib/ui/duoPalette) viennent en premier, telles quelles :
// ce sont celles qu'on choisit le plus souvent, et elles doivent se lire comme
// la marque. Les trois suivantes sont des marches CLAIRES des mêmes teintes —
// la charte n'en publie pas douze, et il vaut mieux une gamme reconnaissable
// qu'une teinte inventée. Le gris d'Eel ferme la liste.
export const CATEGORY_PALETTE = [
  DUO.fox, DUO.macaw, DUO.beetle, DUO.featherGreen,
  DUO.cardinal, DUO.humpback, DUO.bee, DUO.maskGreen,
  DUO_TONES.beetle.soft, DUO_TONES.fox.soft, DUO_TONES.macaw.soft, DUO.eel,
];

// Nombre d'objectifs de l'année. Trois, volontairement : c'est la contrainte
// qui donne sa valeur à la page. La grille affiche toujours trois emplacements
// (définis ou à définir).
export const MAX_YEAR_GOALS = 3;

// Aucun objectif imposé au départ : l'utilisateur définit lui-même ses trois
// combats de l'année. Sert aussi de repli aux pages qui LISENT les cartes
// (Habitudes, Agenda, Objectifs) quand l'état n'est pas encore chargé.
export const DEFAULT_CATEGORIES = [];

// Modèles proposés dans l'emplacement vide : un point de départ cliquable
// (nom + couleur + icône + intention), immédiatement modifiable ensuite.
export const YEAR_GOAL_TEMPLATES = [
  { label: "Forme physique", color: DUO.fox,          icon: "dumbbell",   identity: "Je prends soin de mon corps et je m'entraîne régulièrement.",   outcome: "" },
  { label: "Trading",        color: DUO.bee,          icon: "trending",   identity: "Je respecte mon plan et ma discipline chaque jour.",            outcome: "" },
  { label: "Finances",       color: DUO.featherGreen, icon: "wallet",     identity: "Je gère mon argent avec sagesse et sérénité.",                  outcome: "" },
  { label: "Savoir",         color: DUO.macaw,        icon: "graduation", identity: "J'apprends quelque chose de nouveau chaque jour.",              outcome: "" },
  { label: "Relations",      color: DUO.beetle,       icon: "users",      identity: "Je cultive des relations sincères et profondes.",               outcome: "" },
  { label: "Sérénité",       color: DUO.humpback,     icon: "heart",      identity: "Je cultive le calme, la gratitude et la présence.",             outcome: "" },
];

// Sélectionne les objectifs à CONSERVER lors de la migration depuis l'ancien
// système (jusqu'à neuf catégories) : les plus avancés d'abord — XP décroissante,
// départage par nombre d'objectifs chiffrés rattachés, puis ordre d'origine pour
// rester déterministe. Les autres sont archivés, jamais effacés.
export function pickTopYearGoals(categories, xpById = {}, goalCountById = {}, max = MAX_YEAR_GOALS) {
  return (Array.isArray(categories) ? categories : [])
    .map((c, i) => ({ c, i, xp: xpById[c.id] || 0, goals: goalCountById[c.id] || 0 }))
    .sort((a, b) => (b.xp - a.xp) || (b.goals - a.goals) || (a.i - b.i))
    .slice(0, max)
    .map(s => s.c);
}

/* ---------- Année en cours ---------- */
// Année civile de référence des objectifs (1er janv. → 31 déc.).
export function currentYear() { return new Date().getFullYear(); }
// Échéance par défaut d'un objectif de l'année : le 31 décembre de cette année.
export function yearDeadline(year = currentYear()) { return `${year}-12-31`; }
// Avancement du CALENDRIER dans l'année : `pct` (temps écoulé) et `daysLeft`.
// Sert de repère honnête en face de l'avancement réel des objectifs.
export function yearProgress(year = currentYear(), now = new Date()) {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const t = Math.min(Math.max(now.getTime(), start), end);
  const pct = ((t - start) / (end - start)) * 100;
  const daysLeft = Math.max(0, Math.ceil((end - now.getTime()) / 86400000));
  const daysDone = Math.max(0, Math.floor((t - start) / 86400000));
  return { pct, daysLeft, daysDone, totalDays: Math.round((end - start) / 86400000) };
}
// Jours restants avant une échéance "YYYY-MM-DD" (négatif si dépassée). Même
// convention que la page Objectifs : le jour en cours compte, l'échéance court
// jusqu'à sa fin de journée.
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d, 23, 59, 59).getTime();
  return Math.ceil((target - Date.now()) / 86400000);
}
