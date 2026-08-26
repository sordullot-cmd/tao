/**
 * Statistiques du Focus — tout ce qui se recalcule depuis le journal.
 *
 * Aucun compteur n'est stocké : ni série, ni total du jour, ni score. Tout se
 * déduit de `store.log`, la liste des sessions terminées. C'est plus lent à lire
 * et infiniment plus sûr à écrire : un compteur incrémenté à la main finit
 * toujours par mentir (session fermée deux fois, appareil hors ligne, horloge
 * qui recule), et un chiffre de discipline qui ment ne sert à rien.
 *
 * Le temps de référence est TOUJOURS passé en argument (`now`) : la page fixe un
 * instant par rendu, sinon deux compteurs de la même carte peuvent se
 * contredire sur le passage d'une seconde.
 */

import { dayKey, type FocusStore, type SessionLog, type FocusSettings } from "./model";

export const MIN_MS = 60_000;
export const DAY_MS = 86_400_000;

/** Journée d'un enregistrement : celle de son DÉBUT. Une session commencée à
 *  23 h 40 et finie à 0 h 20 compte pour la veille — c'est le soir qu'on l'a
 *  décidée. */
export function logDay(e: SessionLog): string {
  return dayKey(new Date(e.startedAt));
}

export interface DayTotals {
  key: string;
  date: Date;
  focusedMs: number;
  sessions: number;
  completed: number;
  attempts: number;
}

/** Cumul d'une journée. */
export function dayTotals(log: SessionLog[], day: Date): DayTotals {
  const key = dayKey(day);
  const entries = log.filter(e => logDay(e) === key);
  return {
    key,
    date: day,
    focusedMs: entries.reduce((s, e) => s + (e.focusedMs || 0), 0),
    sessions: entries.length,
    completed: entries.filter(e => e.completed).length,
    attempts: entries.reduce((s, e) => s + (e.attempts?.length || 0), 0),
  };
}

/** Les `n` derniers jours, du plus ancien au plus récent — l'ordre d'un
 *  graphique en barres. */
export function daySeries(log: SessionLog[], n: number, now = new Date()): DayTotals[] {
  const out: DayTotals[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - i);
    out.push(dayTotals(log, d));
  }
  return out;
}

/**
 * Série de jours qui atteignent l'objectif.
 *
 * La journée EN COURS ne casse pas la série tant qu'elle n'est pas finie : à
 * 9 h du matin, personne n'a encore fait ses deux heures, et afficher « série
 * perdue » serait faux. On part donc d'hier, et aujourd'hui ne s'ajoute que
 * s'il est déjà rempli.
 */
export function streak(log: SessionLog[], goalMs: number, now = new Date()): { current: number; best: number } {
  if (!log.length) return { current: 0, best: 0 };
  const reached = new Set(
    Object.entries(groupByDay(log))
      .filter(([, ms]) => ms >= goalMs)
      .map(([k]) => k)
  );

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let current = reached.has(dayKey(today)) ? 1 : 0;
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);
  while (reached.has(dayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Record : on parcourt les journées atteintes dans l'ordre chronologique.
  const days = [...reached].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of days) {
    const t = new Date(`${k}T00:00:00`).getTime();
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best: Math.max(best, current) };
}

function groupByDay(log: SessionLog[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of log) {
    const k = logDay(e);
    out[k] = (out[k] || 0) + (e.focusedMs || 0);
  }
  return out;
}

/**
 * Score de focus sur sept jours, de 0 à 100.
 *
 * Trois choses, pondérées : le temps tenu face à l'objectif (60 %), la part de
 * sessions menées à leur terme (25 %), et l'absence d'écarts (15 %). Le temps
 * pèse le plus parce que c'est la seule mesure qu'on ne peut pas simuler ; les
 * écarts pèsent le moins parce qu'une tentative bloquée est un succès du
 * dispositif, pas seulement un échec de la volonté.
 */
export function focusScore(log: SessionLog[], settings: FocusSettings, now = new Date()): number {
  const week = daySeries(log, 7, now);
  const goal = Math.max(1, settings.dailyGoalMin) * MIN_MS;
  const timePart = week.reduce((s, d) => s + Math.min(1, d.focusedMs / goal), 0) / week.length;

  const entries = log.filter(e => new Date(e.startedAt).getTime() >= now.getTime() - 7 * DAY_MS);
  const timed = entries.filter(e => e.plannedMs > 0);
  const donePart = timed.length ? timed.filter(e => e.completed).length / timed.length : timePart;

  const attempts = entries.reduce((s, e) => s + (e.attempts?.length || 0), 0);
  // Cinq écarts sur la semaine annulent la composante ; au-delà elle est nulle,
  // pas négative — un score ne doit pas pouvoir tomber sous zéro.
  const calmPart = entries.length ? Math.max(0, 1 - attempts / (entries.length * 5)) : 1;

  return Math.round(100 * (0.6 * timePart + 0.25 * donePart + 0.15 * calmPart));
}

export interface TargetCount {
  target: string;
  count: number;
}

/** Ce qui a été tenté le plus souvent, du plus fréquent au moins fréquent. */
export function topTargets(log: SessionLog[], sinceMs: number, now = new Date()): TargetCount[] {
  const from = now.getTime() - sinceMs;
  const counts: Record<string, number> = {};
  for (const e of log) {
    if (new Date(e.startedAt).getTime() < from) continue;
    for (const a of e.attempts || []) counts[a.target] = (counts[a.target] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count);
}

/** Temps concentré par liste de blocage : à quoi ont servi ces listes. */
export function byBlocklist(log: SessionLog[], store: FocusStore, sinceMs: number, now = new Date()): { id: string; name: string; color: string; ms: number }[] {
  const from = now.getTime() - sinceMs;
  const totals: Record<string, number> = {};
  for (const e of log) {
    if (new Date(e.startedAt).getTime() < from) continue;
    for (const id of e.blocklistIds || []) totals[id] = (totals[id] || 0) + (e.focusedMs || 0);
  }
  return store.blocklists
    .filter(b => totals[b.id])
    .map(b => ({ id: b.id, name: b.name, color: b.color, ms: totals[b.id] }))
    .sort((a, b) => b.ms - a.ms);
}

/**
 * Répartition du temps concentré par heure de la journée (24 cases).
 *
 * Une session est ventilée sur les heures qu'elle traverse, au prorata : une
 * session de 90 minutes commencée à 8 h 45 met 15 minutes dans la case 8 et
 * 60 dans la case 9. La répartir entièrement sur son heure de départ ferait
 * croire à des pics qui n'existent pas.
 */
export function hourHistogram(log: SessionLog[], sinceMs: number, now = new Date()): number[] {
  const from = now.getTime() - sinceMs;
  const bins = new Array(24).fill(0);
  for (const e of log) {
    const start = new Date(e.startedAt);
    if (start.getTime() < from) continue;
    let cursor = start.getTime();
    let left = e.focusedMs || 0;
    while (left > 0) {
      const d = new Date(cursor);
      const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const slice = Math.min(left, nextHour - cursor);
      bins[d.getHours()] += slice;
      cursor = nextHour;
      left -= slice;
    }
  }
  return bins;
}

/** « 1 h 25 », « 40 min », « —» pour rien. */
export function fmtDur(ms: number): string {
  const min = Math.round(ms / MIN_MS);
  if (min <= 0) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
}

/** Décompte d'une session en cours : « 42:07 ». */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
