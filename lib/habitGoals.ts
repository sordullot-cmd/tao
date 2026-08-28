/**
 * Pont « Habitudes ↔ Objectifs ».
 *
 * Un objectif chiffré peut prendre pour source non plus seulement les trades ou
 * un compteur manuel, mais LES HABITUDES elles-mêmes : sa progression est alors
 * le nombre de jours cochés — la MOYENNE de ces jours quand plusieurs habitudes
 * sont rattachées, si bien qu'il faut les tenir toutes pour boucler l'objectif.
 *
 * Ces objectifs-là n'ont PAS de cible à saisir : leur cible, c'est leur
 * DEADLINE. On compte les jours de la création à l'échéance — une échéance à un
 * an demande donc 365 jours tenus pour faire 100 % — et les jours de la semaine
 * retenus (week-ends exclus, par exemple) rabotent ce total d'autant.
 *
 * Module neutre (aucune dépendance aux pages), comme `lib/lifeRpgCategories` :
 * la page Habitudes (DailyPlannerPage) et la page Objectifs (GoalsPage) doivent
 * toutes deux le lire, et elles s'importent désormais l'une l'autre par les
 * clés qui vivent ici — les faire dépendre directement l'une de l'autre créerait
 * un cycle d'import.
 */

// Clés de persistance des habitudes (localStorage + Supabase). Elles vivaient
// dans DailyPlannerPage ; elles ont déménagé ici pour que la page Objectifs
// puisse les lire sans importer la page Habitudes. DailyPlannerPage les
// ré-exporte : les imports existants (Vie RPG, tests) ne bougent pas.
export const STORAGE_HABITS = "tr4de_habits";
export const STORAGE_HABITS_HISTORY = "tr4de_habits_history";
export const CLOUD_HABITS = "habits";
export const CLOUD_HABITS_HISTORY = "habits_history";

// Idem pour les objectifs chiffrés, que la page Habitudes doit pouvoir
// rattacher. GoalsPage les ré-exporte.
export const GOALS_STORAGE_KEY = "tr4de_goals_v2";
export const GOALS_CLOUD_KEY = "goals";

// Identifiant de la source de suivi « habitudes » (champ `autoType` d'un objectif).
export const HABIT_AUTO_TYPE = "habit";

/* Une année de constance = 100 %. C'est la promesse de cette source : cocher
   365 jours boucle l'objectif. Rien n'y oblige — la cible reste un simple
   nombre de jours que l'on baisse (30, 90…) ou monte à volonté. */
export const HABIT_TARGET_DAYS = 365;

// Jours de la semaine, dans l'ordre français (lundi d'abord). `id` = valeur de
// `Date.getDay()`, pour comparer sans conversion.
export const HABIT_WEEKDAYS = [
  { id: 1, label: "L", full: "Lundi" },
  { id: 2, label: "M", full: "Mardi" },
  { id: 3, label: "M", full: "Mercredi" },
  { id: 4, label: "J", full: "Jeudi" },
  { id: 5, label: "V", full: "Vendredi" },
  { id: 6, label: "S", full: "Samedi" },
  { id: 0, label: "D", full: "Dimanche" },
] as const;

/** Historique des habitudes : { [idHabitude]: { "YYYY-MM-DD": true } }. */
export type HabitHistory = Record<string, Record<string, unknown> | undefined>;

/** La part « source habitudes » d'un objectif. Tous les champs sont optionnels. */
export type HabitGoal = {
  autoType?: string;
  habitIds?: Array<string | number>;
  habitDays?: number[];
  /* La fenêtre comptée se déduit de ces deux-là : la naissance de l'objectif et
     son échéance. `id` sert de repli quand `createdAt` manque (anciens objets :
     l'id est l'horodatage de création). */
  createdAt?: string;
  id?: string | number;
  deadline?: string;
};

/** Vrai si l'objectif tire sa progression des habitudes cochées. */
export function isHabitGoal(g: HabitGoal | null | undefined): boolean {
  return !!g && g.autoType === HABIT_AUTO_TYPE;
}

/** Habitudes rattachées à un objectif, normalisées en chaînes (les ids
 *  viennent de `Date.now()` et transitent en JSON : parfois nombre, parfois
 *  chaîne — on compare toujours en chaîne). */
export function habitGoalHabitIds(g: HabitGoal | null | undefined): string[] {
  if (!Array.isArray(g?.habitIds)) return [];
  return g!.habitIds!.filter(id => id != null).map(String);
}

/** Objectifs (arbre aplati) rattachés à une habitude donnée. */
export function goalsForHabit<T extends HabitGoal & { id?: unknown }>(
  goals: T[] | null | undefined,
  habitId: string | number,
): T[] {
  const key = String(habitId);
  return (goals || []).filter(g => isHabitGoal(g) && habitGoalHabitIds(g).includes(key));
}

// "YYYY-MM-DD" -> Date locale (minuit). `new Date(iso)` lirait la chaîne en UTC
// et décalerait le jour le soir venu.
function dateOf(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekdayOf(key: string): number | null {
  const d = dateOf(key);
  return d ? d.getDay() : null;
}

/** Jours de la semaine retenus, ou `null` quand tous comptent. */
function weekdayFilterOf(g: HabitGoal | null | undefined): number[] | null {
  const days = Array.isArray(g?.habitDays) ? g!.habitDays!.filter(d => d >= 0 && d <= 6) : [];
  return days.length > 0 && days.length < 7 ? days : null;
}

/* Naissance de l'objectif, en heure LOCALE. `createdAt` est un instant ISO
   complet ; le lire comme une simple chaîne de date ferait tomber un objectif
   créé le soir sur le jour suivant (ou précédent selon le fuseau), et le jour
   même de la création cesserait alors de compter. Une chaîne de date nue, elle,
   doit rester locale — `new Date("2026-01-01")` la lirait en UTC. */
function createdDateOf(g: HabitGoal | null | undefined): Date {
  const raw = String(g?.createdAt || "");
  if (raw.length > 10) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  const plain = dateOf(raw);
  if (plain) return plain;
  if (g?.id != null && Number.isFinite(Number(g.id))) return new Date(Number(g.id));
  return new Date();
}

/**
 * Fenêtre comptée : de la naissance de l'objectif à son échéance, bornes
 * incluses. Rien à saisir — c'est la deadline qui fixe l'ampleur de l'objectif,
 * et les jours d'avant sa création ne comptent pas (ils n'ont pas été tenus
 * POUR lui).
 *
 * Sans échéance, on retient une année pleine à partir de la création : c'est la
 * promesse par défaut de cette source, et elle laisse un objectif tout neuf
 * afficher un pourcentage sensé avant même qu'on lui donne une date.
 */
export function habitGoalWindow(g: HabitGoal | null | undefined): { from: string; to: string } {
  const created = createdDateOf(g);
  const start = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const deadline = dateOf(g?.deadline || "");
  if (deadline) return { from: isoOf(start), to: isoOf(deadline) };
  const end = new Date(start);
  end.setDate(end.getDate() + HABIT_TARGET_DAYS - 1); // bornes incluses
  return { from: isoOf(start), to: isoOf(end) };
}

/**
 * Cible de l'objectif : le nombre de jours COMPTABLES de sa fenêtre. Un an
 * d'échéance = 365 ; les mêmes douze mois « du lundi au vendredi » = 261.
 * C'est ce que remplace la cible saisie à la main.
 */
export function habitGoalTargetDays(g: HabitGoal | null | undefined): number {
  const { from, to } = habitGoalWindow(g);
  const start = dateOf(from);
  const end = dateOf(to);
  if (!start || !end) return 0;
  const total = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (total <= 0) return 0;
  const days = weekdayFilterOf(g);
  if (!days) return total;
  // Semaines pleines + reste, plutôt qu'une boucle jour à jour : la fonction
  // est appelée à chaque rendu de chaque ligne d'objectif.
  const weeks = Math.floor(total / 7);
  let count = weeks * days.length;
  const rest = total % 7;
  for (let i = 0; i < rest; i++) {
    if (days.includes((start.getDay() + weeks * 7 + i) % 7)) count++;
  }
  return count;
}

// Jours retenus pour UNE habitude : ses jours cochés, filtrés par la fenêtre de
// dates et les jours de semaine de l'objectif.
function keptDaysOf(
  g: HabitGoal | null | undefined,
  history: HabitHistory | null | undefined,
  habitId: string,
): string[] {
  const { from, to } = habitGoalWindow(g);
  const days = weekdayFilterOf(g);

  const map = (history || {})[habitId] || {};
  const out: string[] = [];
  for (const key of Object.keys(map)) {
    if (!map[key]) continue;
    // Les bornes sont INCLUSES et comparées en chaîne : le format
    // "YYYY-MM-DD" se trie comme la date qu'il représente.
    if (from && key < from) continue;
    if (to && key > to) continue;
    if (days) {
      const wd = weekdayOf(key);
      if (wd === null || !days.includes(wd)) continue;
    }
    out.push(key);
  }
  return out;
}

/** Jours cochés de chaque habitude rattachée, dans l'ordre du rattachement. */
export function habitDayCounts(
  g: HabitGoal | null | undefined,
  history: HabitHistory | null | undefined,
): number[] {
  return habitGoalHabitIds(g).map(id => keptDaysOf(g, history, id).length);
}

/**
 * Union des jours retenus, triée — « quels jours ont compté », pour l'affichage.
 * À ne pas confondre avec l'avancement, qui est une MOYENNE (cf. plus bas).
 */
export function habitGoalDayKeys(
  g: HabitGoal | null | undefined,
  history: HabitHistory | null | undefined,
): string[] {
  const kept = new Set<string>();
  for (const id of habitGoalHabitIds(g)) {
    for (const key of keptDaysOf(g, history, id)) kept.add(key);
  }
  return [...kept].sort();
}

/**
 * Avancement de l'objectif, en jours : la MOYENNE des jours cochés de chaque
 * habitude rattachée.
 *
 * Diviser par le nombre d'habitudes est ce qui rend le rattachement multiple
 * honnête : à trois habitudes, il faut les tenir TOUTES LES TROIS pendant la
 * durée visée pour atteindre 100 %. Additionner (ou dédoublonner) les jours
 * ferait bondir l'objectif au simple ajout d'une habitude déjà ancienne, sans
 * qu'un seul jour de plus ait été tenu.
 *
 * La valeur peut être fractionnaire (2 habitudes à 10 et 11 jours → 10,5) :
 * c'est un pourcentage qu'on affiche, jamais ce nombre brut.
 */
export function countHabitDays(
  g: HabitGoal | null | undefined,
  history: HabitHistory | null | undefined,
): number {
  const counts = habitDayCounts(g, history);
  if (counts.length === 0) return 0;
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

const frDate = (iso: string): string => {
  const d = dateOf(iso);
  return d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : iso;
};

/** Jours comptables déjà PASSÉS dans la fenêtre, aujourd'hui inclus. */
export function habitGoalElapsedDays(
  g: HabitGoal | null | undefined,
  now: Date = new Date(),
): number {
  const { from, to } = habitGoalWindow(g);
  const today = isoOf(now);
  if (today < from) return 0;
  return habitGoalTargetDays({ ...(g || {}), deadline: today < to ? today : to });
}

/** Jours comptables qu'il RESTE avant l'échéance, aujourd'hui exclu. */
export function habitGoalRemainingDays(
  g: HabitGoal | null | undefined,
  now: Date = new Date(),
): number {
  return Math.max(0, habitGoalTargetDays(g) - habitGoalElapsedDays(g, now));
}

/**
 * Assiduité : la part des jours passés qui ont été tenus, de 0 à 1.
 *
 * C'est la seule mesure de retard qui ait un sens pour cette source. Un jour
 * manqué ne se rattrape JAMAIS — on ne coche qu'un jour par jour — donc
 * l'avancement est structurellement sous le temps écoulé, et le comparer à lui
 * (comme pour un objectif de P&L) afficherait « en retard » à vie dès le
 * premier écart. Ce qui se pilote, c'est la régularité.
 */
export function habitAssiduityOf(
  currentDays: number,
  g: HabitGoal | null | undefined,
  now: Date = new Date(),
): number {
  const elapsed = habitGoalElapsedDays(g, now);
  if (elapsed <= 0) return 1;
  return Math.max(0, Math.min(1, currentDays / elapsed));
}

/** La même, en partant de l'historique plutôt que d'un avancement déjà calculé.
 *  La fenêtre est alors ramenée à aujourd'hui : une case cochée d'avance (rien
 *  n'empêche d'avancer d'un jour sur la page Habitudes) ne doit pas gonfler une
 *  régularité qui ne parle que du passé. */
export function habitGoalAssiduity(
  g: HabitGoal | null | undefined,
  history: HabitHistory | null | undefined,
  now: Date = new Date(),
): number {
  const { to } = habitGoalWindow(g);
  const today = isoOf(now);
  const upToNow = today < to ? { ...(g || {}), deadline: today } : g;
  return habitAssiduityOf(countHabitDays(upToNow, history), g, now);
}

/* En dessous de cette régularité, l'objectif décroche vraiment : un jour sur
   quatre manqué, ce n'est plus un écart, c'est un rythme. Au-dessus, on ne dit
   rien — un objectif d'habitude n'est pas « en retard » parce qu'il a sauté un
   dimanche. */
export const HABIT_ONTRACK_RATE = 0.75;

/** Résumé lisible de la fenêtre comptée, pour l'aide sous le champ. */
export function habitGoalRangeLabel(g: HabitGoal | null | undefined): string {
  const { from, to } = habitGoalWindow(g);
  return `du ${frDate(from)} au ${frDate(to)}`;
}
