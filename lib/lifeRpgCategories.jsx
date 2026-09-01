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
import { PALETTE, PALETTE_DARK, GREY } from "@/lib/ui/palette";

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

// Lien « objectifs d'un ÉVÈNEMENT d'agenda » : les cartes qu'un créneau fait
// avancer. Écrit par la page Agenda, lu par la page Vie RPG — même partage que
// `taskRpg` ci-dessus, mais indexé par identifiant d'ÉVÈNEMENT (les deux
// espaces d'identifiants sont distincts, et un créneau n'est pas une tâche).
export const EVENT_RPG_STORAGE_KEY = "tr4de_agenda_event_rpg";
export const EVENT_RPG_CLOUD_KEY = "agenda_event_rpg";

/* XP d'une étape cochée dans un évènement lié à un objectif.
   Le barème du site, du plus gros au plus petit : un jalon d'objectif vaut 75,
   une tâche terminée 25, une règle de discipline respectée 10. Une étape de
   créneau est de cette dernière famille — un geste unitaire dans une journée,
   pas un livrable — d'où la même valeur. Trois étapes d'une séance de lecture
   valent donc un peu plus qu'une tâche : c'est voulu, on a fait trois choses au
   lieu d'en cocher une. */
export const EVENT_STEP_XP = 10;

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

// Palette proposée pour les catégories. Les huit couleurs principales de la
// planche (cf. lib/ui/palette) viennent en premier, telles quelles : ce sont
// celles qu'on choisit le plus souvent. Les trois suivantes ne sortent qu'une
// fois les huit prises, et le gris ferme la liste.
export const CATEGORY_PALETTE = [
  PALETTE.orange, PALETTE.blue, PALETTE.purple, PALETTE.green,
  PALETTE.red, PALETTE.yellow, PALETTE.pink, PALETTE.brown,
  PALETTE_DARK.purple, PALETTE_DARK.blue, PALETTE_DARK.red, GREY.grey700,
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
// (nom + couleur + icône), immédiatement modifiable ensuite.
export const YEAR_GOAL_TEMPLATES = [
  { label: "Forme physique", color: PALETTE.orange,   icon: "dumbbell",   outcome: "" },
  // Vert comme la catégorie « Trading » de la page Objectifs : une carte créée
  // depuis ce modèle doit s'accorder aux objectifs chiffrés qu'on y rattachera.
  { label: "Trading",        color: PALETTE.green,    icon: "trending",   outcome: "" },
  { label: "Finances",       color: PALETTE.green,    icon: "wallet",     outcome: "" },
  { label: "Savoir",         color: PALETTE.blue,     icon: "graduation", outcome: "" },
  { label: "Relations",      color: PALETTE.purple,   icon: "users",      outcome: "" },
  { label: "Sérénité",       color: PALETTE.pink,     icon: "heart",      outcome: "" },
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
/**
 * Repère de temps d'UNE carte : la part écoulée entre le jour où l'objectif a
 * été défini et son échéance.
 *
 * C'est ce qui remplace « % de l'année écoulée » pour juger une carte en avance
 * ou en retard. Comparer un objectif défini en septembre aux 70 % de l'année
 * déjà passés le déclarait en retard avant son premier jour — et comme les
 * trois cartes sont refaites chaque année, tout le monde était toujours en
 * retard. On part donc du plus TARDIF entre le 1er janvier et la naissance de
 * la carte (son id porte l'horodatage de création : `cat_1725...`).
 */
export function categoryTimeProgress(cat, year = currentYear(), now = new Date()) {
  const yearStart = new Date(year, 0, 1).getTime();
  const m = /^cat_(\d{10,})$/.exec(String(cat?.id || ""));
  const born = m ? Number(m[1]) : NaN;
  const start = Number.isFinite(born) ? Math.max(yearStart, born) : yearStart;
  const dl = String(cat?.deadline || yearDeadline(cat?.year || year)).split("-").map(Number);
  const end = dl.length === 3 && dl[0]
    ? new Date(dl[0], dl[1] - 1, dl[2], 23, 59, 59).getTime()
    : new Date(year + 1, 0, 1).getTime();
  const total = end - start;
  // Une carte créée le jour même de son échéance n'a pas de durée : on la dit
  // à 0 % de temps écoulé plutôt que de diviser par zéro.
  if (total <= 0) return { pct: 0, daysLeft: 0 };
  const t = Math.min(Math.max(now.getTime(), start), end);
  return {
    pct: ((t - start) / total) * 100,
    daysLeft: Math.max(0, Math.ceil((end - now.getTime()) / 86400000)),
  };
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
