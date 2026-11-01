/**
 * Journée de trading — la chaîne pré-market → discipline → recap → bilan.
 *
 * Ce module ne porte que ce qui n'existait nulle part : les vérifications du
 * pré-market et l'humeur, les sets d'OBJECTIFS (leurs métriques sont dans
 * `lib/sessionGoals`), la liste des sets et des listes de tâches ajoutés à la
 * séance, la note de la journée et sa clôture. Le reste est LU là où il vit
 * déjà, pour qu'une coche ou une note n'ait jamais deux sources :
 *   • les listes de tâches  → `lib/routineChecklist` (page Discipline, tray) ;
 *   • le recap d'un trade   → checklist, émotions et note, dans les magasins du
 *                             panneau de détail de la page Trades ;
 *   • le journal du jour    → les notes (`tao_notes`), rangées sous la date.
 *
 * Le magasin vit dans une clé de `useCloudState` et se normalise à la lecture,
 * jamais migré (cf. CLAUDE.md) : un champ ajouté plus tard prend sa valeur par
 * défaut chez ceux qui ont déjà un magasin.
 */

import { groupExecutions } from "@/lib/tradeGrouping";
import {
  DEFAULT_GOAL_SET,
  newGoalSetId,
  normalizeGoalSet,
  type GoalSet,
  type SessionGoal,
} from "@/lib/sessionGoals";

export const TRADING_DAY_KEY = "tao_trading_day";
export const TRADING_DAY_CLOUD_KEY = "trading_day";

export const MOODS = ["focused", "confident", "calm", "neutral", "tired", "anxious", "frustrated"] as const;
export type Mood = typeof MOODS[number];

/* Cinq lettres et pas de « + » : une note qu'on pose en dix secondes à la
   clôture doit se choisir d'un coup d'œil. A+ / A- appellerait à pinailler sur
   un cran qui ne change rien à ce qu'on fera demain. */
export const GRADES = ["F", "D", "C", "B", "A"] as const;
export type Grade = typeof GRADES[number];

export interface CheckItem {
  id: string;
  label: string;
}

export interface SignOff {
  /** ISO — l'heure à laquelle on a clôturé. */
  at: string;
  /** La phrase de clôture, facultative. */
  line: string;
}

export interface DayEntry {
  mood: Mood | null;
  grade: Grade | null;
  /** `{ [id de vérification]: cochée }` pour le pré-market du jour. */
  premarket: Record<string, boolean>;
  signedOff: SignOff | null;
}

export interface TradingDayStore {
  /** Vérifications du pré-market — une seule liste, la même chaque matin. */
  premarketItems: CheckItem[];
  goalSets: GoalSet[];
  /** Sets AJOUTÉS à la séance : leurs objectifs sont ceux qu'on lit dans les
   *  trades. Plusieurs à la fois — « Prop firm » et « Scalp NY » s'empilent. */
  appliedSetIds: string[];
  /** Listes de tâches (listes de routine) ajoutées à la séance. `null` tant
   *  qu'on n'y a pas touché : la liste ACTIVE de la page Discipline, alors. */
  appliedTaskListIds: string[] | null;
  days: Record<string, DayEntry>;
}

/* Le pré-market vérifie le TERRAIN, pas le comportement — celui-là se suit
   dans les listes de tâches de l'étape suivante. */
export const DEFAULT_PREMARKET: CheckItem[] = [
  { id: "pm_calendar", label: "Calendrier économique vérifié" },
  { id: "pm_levels", label: "Niveaux clés tracés" },
];

export const EMPTY_DAY: DayEntry = { mood: null, grade: null, premarket: {}, signedOff: null };

const uid = (prefix: string): string => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function normalizeDay(value: unknown): DayEntry {
  const v = (value && typeof value === "object" ? value : {}) as Partial<DayEntry>;
  const so = v.signedOff as Partial<SignOff> | null | undefined;
  return {
    mood: MOODS.includes(v.mood as Mood) ? (v.mood as Mood) : null,
    grade: GRADES.includes(v.grade as Grade) ? (v.grade as Grade) : null,
    premarket: v.premarket && typeof v.premarket === "object" ? { ...v.premarket } : {},
    signedOff: so && typeof so.at === "string" ? { at: so.at, line: String(so.line ?? "") } : null,
  };
}

const normalizeItems = (value: unknown): CheckItem[] =>
  (Array.isArray(value) ? value : [])
    .filter((x): x is CheckItem => !!x && typeof x.id === "string")
    .map(x => ({ id: x.id, label: String(x.label ?? "") }))
    .filter(x => x.label.trim());

export function normalizeTradingDayStore(value: unknown): TradingDayStore {
  const v = (value && typeof value === "object" ? value : {}) as Partial<TradingDayStore> & { activeSetId?: unknown };
  /* `goalSets` absent = magasin jamais écrit → le set de départ, ajouté. Une
     liste VIDE, elle, est un choix : on ne remet pas sous le nez des sets que
     l'utilisateur a supprimés. Même règle pour le pré-market. */
  const goalSets = Array.isArray(v.goalSets)
    ? v.goalSets.map(normalizeGoalSet).filter((x): x is GoalSet => !!x)
    : [DEFAULT_GOAL_SET];
  const known = new Set(goalSets.map(x => x.id));
  /* `appliedSetIds` absent : un magasin d'avant les sets multiples portait un
     `activeSetId` unique — il devient le seul set ajouté. */
  const applied = Array.isArray(v.appliedSetIds)
    ? v.appliedSetIds.map(String)
    : typeof v.activeSetId === "string" ? [v.activeSetId] : goalSets.slice(0, 1).map(x => x.id);
  const appliedSetIds = Array.from(new Set(applied.filter(id => known.has(id))));
  const days: Record<string, DayEntry> = {};
  if (v.days && typeof v.days === "object") {
    for (const [date, entry] of Object.entries(v.days)) days[date] = normalizeDay(entry);
  }
  return {
    premarketItems: Array.isArray(v.premarketItems) ? normalizeItems(v.premarketItems) : DEFAULT_PREMARKET,
    goalSets,
    appliedSetIds,
    appliedTaskListIds: Array.isArray(v.appliedTaskListIds) ? Array.from(new Set(v.appliedTaskListIds.map(String))) : null,
    days,
  };
}

export function dayEntry(store: TradingDayStore, date: string): DayEntry {
  return store.days[date] ?? EMPTY_DAY;
}

function patchDay(store: TradingDayStore, date: string, patch: Partial<DayEntry>): TradingDayStore {
  return { ...store, days: { ...store.days, [date]: { ...dayEntry(store, date), ...patch } } };
}

/** Un second clic sur l'humeur déjà prise la retire. */
export function setMood(store: TradingDayStore, date: string, mood: Mood): TradingDayStore {
  return patchDay(store, date, { mood: dayEntry(store, date).mood === mood ? null : mood });
}

/** `null` = « non noté » : la note est facultative, on doit pouvoir la retirer. */
export function setGrade(store: TradingDayStore, date: string, grade: Grade | null): TradingDayStore {
  return patchDay(store, date, { grade });
}

/* ── Pré-market ─────────────────────────────────────────────────────────── */

export function togglePremarket(store: TradingDayStore, date: string, id: string): TradingDayStore {
  const checks = dayEntry(store, date).premarket;
  return patchDay(store, date, { premarket: { ...checks, [id]: !checks[id] } });
}

export function addPremarketItem(store: TradingDayStore, label: string): TradingDayStore {
  const clean = label.trim();
  if (!clean) return store;
  return { ...store, premarketItems: [...store.premarketItems, { id: uid("pm_"), label: clean }] };
}

export function removePremarketItem(store: TradingDayStore, id: string): TradingDayStore {
  return { ...store, premarketItems: store.premarketItems.filter(x => x.id !== id) };
}

export function premarketProgress(store: TradingDayStore, date: string): { done: number; total: number } {
  const checks = dayEntry(store, date).premarket;
  return { done: store.premarketItems.filter(x => checks[x.id]).length, total: store.premarketItems.length };
}

/* ── Listes de tâches ───────────────────────────────────────────────────── */

/**
 * Ids des listes de tâches de la séance. Tant qu'on n'a rien choisi, la liste
 * active de la page Discipline — celle qu'on cochait déjà là-bas. Les ids qui
 * ne désignent plus aucune liste sont écartés ici plutôt que purgés du
 * magasin : une liste supprimée par erreur et recréée n'a pas d'autre id.
 */
export function taskListIds(store: TradingDayStore, existing: string[], activeId: string): string[] {
  const ids = store.appliedTaskListIds ?? [activeId];
  return ids.filter(id => existing.includes(id));
}

export function applyTaskList(store: TradingDayStore, current: string[], id: string): TradingDayStore {
  return current.includes(id) ? store : { ...store, appliedTaskListIds: [...current, id] };
}

export function unapplyTaskList(store: TradingDayStore, current: string[], id: string): TradingDayStore {
  return { ...store, appliedTaskListIds: current.filter(x => x !== id) };
}

/* ── Clôture ────────────────────────────────────────────────────────────── */

export function signOffDay(store: TradingDayStore, date: string, line: string, at: Date = new Date()): TradingDayStore {
  return patchDay(store, date, { signedOff: { at: at.toISOString(), line: line.trim() } });
}

/** Rouvrir garde la phrase : on rouvre pour corriger, pas pour tout réécrire. */
export function reopenDay(store: TradingDayStore, date: string): TradingDayStore {
  return patchDay(store, date, { signedOff: null });
}

/** Sets ajoutés à la séance, dans l'ordre où on les a ajoutés. */
export function appliedGoalSets(store: TradingDayStore): GoalSet[] {
  return store.appliedSetIds
    .map(id => store.goalSets.find(x => x.id === id))
    .filter((x): x is GoalSet => !!x);
}

export function applyGoalSet(store: TradingDayStore, id: string): TradingDayStore {
  if (!store.goalSets.some(x => x.id === id) || store.appliedSetIds.includes(id)) return store;
  return { ...store, appliedSetIds: [...store.appliedSetIds, id] };
}

/** Retire un set de la séance — sans le supprimer : il reste à rajouter. */
export function unapplyGoalSet(store: TradingDayStore, id: string): TradingDayStore {
  return { ...store, appliedSetIds: store.appliedSetIds.filter(x => x !== id) };
}

/**
 * Enregistre le set édité dans la modale. Sans `id`, c'est une CRÉATION : le
 * set est ajouté à la séance dans la foulée — on le crée pour s'en servir.
 */
export function saveGoalSet(
  store: TradingDayStore,
  draft: { id?: string; name: string; goals: SessionGoal[] },
): TradingDayStore {
  const name = draft.name.trim();
  if (!name) return store;
  if (draft.id && store.goalSets.some(x => x.id === draft.id)) {
    return {
      ...store,
      goalSets: store.goalSets.map(x => (x.id === draft.id ? { ...x, name, goals: draft.goals } : x)),
    };
  }
  const id = newGoalSetId();
  return {
    ...store,
    goalSets: [...store.goalSets, { id, name, goals: draft.goals }],
    appliedSetIds: [...store.appliedSetIds, id],
  };
}

export function removeGoalSet(store: TradingDayStore, id: string): TradingDayStore {
  return {
    ...store,
    goalSets: store.goalSets.filter(x => x.id !== id),
    appliedSetIds: store.appliedSetIds.filter(x => x !== id),
  };
}

/* ── Trades du jour ─────────────────────────────────────────────────────── */

interface TradeLike {
  id?: string | null;
  date?: string;
  pnl?: number | string | null;
  entryTime?: string;
  entry_time?: string;
  /** Exécutions réunies sous cette ligne (cf. `mergeExecutions`). */
  _children?: TradeLike[];
}

/** Clé « YYYY-MM-DD » d'un trade, ou null si la date est inexploitable. */
export const tradeDayKey = (tr: TradeLike): string | null => {
  const key = String(tr?.date || "").trim().split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
};

/** Trades d'une journée, dans l'ordre où ils ont été pris. */
export function tradesOfDay<Tr extends TradeLike>(trades: Tr[], date: string): Tr[] {
  return trades
    .filter(tr => tradeDayKey(tr) === date)
    .sort((a, b) => String(a.entryTime || a.entry_time || "").localeCompare(String(b.entryTime || b.entry_time || "")));
}

/**
 * Un même ordre envoyé sur plusieurs comptes ne fait qu'UNE ligne : on le
 * relit une fois, et « 4 trades » pour un seul setup copié sur quatre comptes
 * gonflerait le compte du jour. Même partition que la page Trades
 * (`lib/tradeGrouping`) ; la ligne porte la somme des P&L et des quantités.
 */
export function mergeExecutions<Tr extends TradeLike>(trades: Tr[]): Tr[] {
  type Row = Tr & Record<string, unknown>;
  return groupExecutions(trades as Row[]).map(children => {
    if (children.length === 1) return children[0];
    const sum = (f: (x: Row) => number) => children.reduce((s, x) => s + (f(x) || 0), 0);
    const qty = sum(x => Number(x.quantity ?? x.qty ?? x.lots ?? x.lot_size));
    return {
      ...children[0],
      pnl: sum(x => Number(x.pnl)),
      ...(qty > 0 ? { quantity: qty } : null),
      _children: children,
    } as Tr;
  });
}

/**
 * Lignes vues depuis UN compte — pour les objectifs seulement. Un ordre copié
 * sur quatre comptes est un trade, et son P&L celui d'un compte : les seuils
 * d'un objectif (« perte max 500 », « P&L net ≥ 300 ») se fixent à l'échelle
 * d'un compte, et la somme des copies les dépasserait quatre fois trop tôt.
 * On garde l'exécution d'accueil (la première prise) : c'est elle que la
 * ligne fusionnée affiche déjà.
 */
export function perAccount<Tr extends TradeLike>(rows: Tr[]): Tr[] {
  return rows.map(tr => (Array.isArray(tr._children) && tr._children.length > 1 ? (tr._children[0] as Tr) : tr));
}

/** Ids de toutes les exécutions d'une ligne — elle-même si elle est seule. */
export const executionIds = (tr: TradeLike): string[] =>
  (Array.isArray(tr?._children) && tr._children.length ? tr._children : [tr])
    .map(x => x?.id)
    .filter((id): id is string => !!id);

export interface RecapState {
  notes?: Record<string, string>;
  checklist?: Record<string, Record<string, string>>;
  emotions?: Record<string, string[]>;
  ratings?: Record<string, number>;
}

/**
 * Un trade est « recappé » dès qu'il porte une trace de relecture : une note
 * écrite, une note sur 10, une réponse à la checklist ou une émotion. Exiger tout aurait
 * rendu le compteur rouge pour quelqu'un qui recappe sérieusement, mais en
 * mots. Pour une ligne fusionnée, une exécution suffit : le recap s'écrit sur
 * toutes, mais un ancien recap fait depuis la page Trades n'en a parfois
 * touché qu'une.
 */
export function isTradeRecapped(tr: TradeLike, state: RecapState = {}): boolean {
  const { notes = {}, checklist = {}, emotions = {}, ratings = {} } = state;
  return executionIds(tr).some(id =>
    !!String(notes[id] ?? "").trim()
    || Object.keys(checklist[id] || {}).length > 0
    || (emotions[id] || []).length > 0
    || !!ratings[id],
  );
}

export interface DaySummary {
  count: number;
  wins: number;
  net: number;
  winRate: number | null;
  /** P&L cumulé après chaque trade, dans l'ordre de prise. */
  curve: number[];
}

export function daySummary(trades: TradeLike[]): DaySummary {
  let net = 0;
  const curve: number[] = [];
  let wins = 0;
  for (const tr of trades) {
    const pnl = Number(tr.pnl) || 0;
    net += pnl;
    if (pnl > 0) wins += 1;
    curve.push(net);
  }
  return {
    count: trades.length,
    wins,
    net,
    winRate: trades.length ? (wins / trades.length) * 100 : null,
    curve,
  };
}
