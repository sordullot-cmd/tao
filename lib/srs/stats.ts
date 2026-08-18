/**
 * Statistiques de révision.
 *
 * Tout se recalcule depuis le journal et l'état courant des cartes : rien n'est
 * agrégé au fil de l'eau. C'est plus de calcul à l'affichage, mais un chiffre
 * qui ne peut pas mentir — et l'historique reste réinterprétable si la
 * définition d'une mesure change.
 */

import { forgettingCurve, type SrsConfig } from "./fsrs";
import {
  MATURE_DAYS, currentIntervalDays, srsDay,
  type SrsCard, type SrsStore,
} from "./model";
import { isAvailable, queueKindOf } from "./queue";

/** Décale un jour `AAAA-MM-JJ` de `delta` jours. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${`${dt.getMonth() + 1}`.padStart(2, "0")}-${`${dt.getDate()}`.padStart(2, "0")}`;
}

/* ── Répartition des cartes ───────────────────────────────────────────────── */

export interface StateBreakdown {
  new: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
  buried: number;
  total: number;
}

/** Où en est le paquet. « Jeune » et « mûre » séparent les cartes en révision
 *  selon le seuil de 21 jours : c'est là que la mémorisation cesse d'être
 *  fragile, et voir les deux ensemble masquerait un paquet entièrement récent. */
export function stateBreakdown(cards: SrsCard[], now: Date): StateBreakdown {
  const out: StateBreakdown = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0, buried: 0, total: cards.length };
  for (const c of cards) {
    if (c.suspended) { out.suspended++; continue; }
    if (c.buriedUntil && new Date(c.buriedUntil) > now) out.buried++;
    const kind = queueKindOf(c);
    if (kind === "new") out.new++;
    else if (kind === "learning") out.learning++;
    else if (currentIntervalDays(c) >= MATURE_DAYS) out.mature++;
    else out.young++;
  }
  return out;
}

/* ── Prévision de charge ──────────────────────────────────────────────────── */

export interface ForecastDay {
  day: string;
  young: number;
  mature: number;
  total: number;
  /** Cumul depuis aujourd'hui — la courbe qui dit à quoi ressemble le mois. */
  cumulative: number;
}

/**
 * Ce qui tombera dans les `days` prochains jours, à état constant.
 *
 * C'est une prévision BASSE par construction : elle ne compte que les cartes
 * déjà programmées. Les nouvelles cartes qu'on introduira d'ici là, et les
 * oublis qui ramèneront des cartes plus tôt que prévu, n'y figurent pas — on ne
 * peut pas les connaître. À lire comme un plancher de charge, pas comme un
 * emploi du temps.
 */
export function forecast(cards: SrsCard[], now: Date, cutoffHour: number, days = 30): ForecastDay[] {
  const today = srsDay(now, cutoffHour);
  const buckets = new Map<string, { young: number; mature: number }>();
  for (let i = 0; i < days; i++) buckets.set(shiftDay(today, i), { young: 0, mature: 0 });

  for (const c of cards) {
    if (!isAvailable(c, now) || queueKindOf(c) === "new") continue;
    // Une carte en retard compte pour AUJOURD'HUI : elle n'a pas disparu parce
    // que sa date est passée, elle attend.
    const raw = srsDay(new Date(c.due), cutoffHour);
    const day = raw < today ? today : raw;
    const bucket = buckets.get(day);
    if (!bucket) continue;
    if (currentIntervalDays(c) >= MATURE_DAYS) bucket.mature++;
    else bucket.young++;
  }

  let cumulative = 0;
  return [...buckets.entries()].map(([day, b]) => {
    const total = b.young + b.mature;
    cumulative += total;
    return { day, young: b.young, mature: b.mature, total, cumulative };
  });
}

/* ── Historique ───────────────────────────────────────────────────────────── */

export interface HistoryDay {
  day: string;
  learning: number;
  young: number;
  mature: number;
  total: number;
  /** Temps passé, en minutes. */
  minutes: number;
}

/** Le travail des `days` derniers jours, jour par jour. Les jours vides sont
 *  présents et à zéro : une frise avec des trous ne se lit pas. */
export function history(store: SrsStore, now: Date, days = 30): HistoryDay[] {
  const today = srsDay(now, store.dayCutoffHour);
  const start = shiftDay(today, -(days - 1));
  const buckets = new Map<string, HistoryDay>();
  for (let i = 0; i < days; i++) {
    const day = shiftDay(start, i);
    buckets.set(day, { day, learning: 0, young: 0, mature: 0, total: 0, minutes: 0 });
  }
  for (const e of store.log) {
    const day = srsDay(new Date(e.at), store.dayCutoffHour);
    const b = buckets.get(day);
    if (!b) continue;
    if (e.state !== "review") b.learning++;
    else if ((e.elapsed ?? 0) >= MATURE_DAYS) b.mature++;
    else b.young++;
    b.total++;
    b.minutes += (e.durationMs ?? 0) / 60000;
  }
  return [...buckets.values()];
}

/* ── Rétention réelle ─────────────────────────────────────────────────────── */

export interface Retention {
  /** Part de bonnes réponses, 0 à 1. `null` si l'échantillon est vide. */
  rate: number | null;
  passed: number;
  total: number;
}

export interface RetentionReport {
  young: Retention;
  mature: Retention;
  overall: Retention;
}

/**
 * La rétention CONSTATÉE, à comparer à la rétention visée.
 *
 * Ne comptent que les cartes déjà en régime de croisière : les paliers
 * d'apprentissage sont conçus pour qu'on rate, les inclure gonflerait le taux
 * d'échec sans rien dire de la mémorisation à long terme. Une carte revue
 * plusieurs fois le même jour n'est comptée qu'à sa PREMIÈRE réponse — les
 * suivantes sont des reprises, pas des tests.
 *
 * Un écart durable entre constaté et visé est le signal qu'il faut relancer
 * l'optimiseur de paramètres.
 */
export function retention(store: SrsStore, now: Date, windowDays = 365): RetentionReport {
  const today = srsDay(now, store.dayCutoffHour);
  const from = shiftDay(today, -(windowDays - 1));
  const seenToday = new Set<string>();
  const acc = {
    young: { passed: 0, total: 0 },
    mature: { passed: 0, total: 0 },
  };
  const ordered = [...store.log].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of ordered) {
    const day = srsDay(new Date(e.at), store.dayCutoffHour);
    if (day < from) continue;
    if (e.state !== "review") continue;
    const key = `${day}:${e.cardId}`;
    if (seenToday.has(key)) continue;
    seenToday.add(key);
    const bucket = (e.elapsed ?? 0) >= MATURE_DAYS ? acc.mature : acc.young;
    bucket.total++;
    if (e.rating > 1) bucket.passed++;
  }
  const mk = (b: { passed: number; total: number }): Retention => ({
    rate: b.total ? b.passed / b.total : null,
    passed: b.passed,
    total: b.total,
  });
  const overall = { passed: acc.young.passed + acc.mature.passed, total: acc.young.total + acc.mature.total };
  return { young: mk(acc.young), mature: mk(acc.mature), overall: mk(overall) };
}

/* ── Série de jours ───────────────────────────────────────────────────────── */

export interface Streak {
  current: number;
  best: number;
  /** Jours où au moins une carte a été révisée. */
  activeDays: number;
}

/** La série en cours ne casse pas si on n'a pas ENCORE révisé aujourd'hui : la
 *  journée n'est pas finie. Elle repart de la veille dans ce cas. */
export function streak(store: SrsStore, now: Date): Streak {
  const days = new Set(store.log.map(e => srsDay(new Date(e.at), store.dayCutoffHour)));
  if (days.size === 0) return { current: 0, best: 0, activeDays: 0 };
  const today = srsDay(now, store.dayCutoffHour);

  let current = 0;
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  while (days.has(cursor)) { current++; cursor = shiftDay(cursor, -1); }

  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best, activeDays: days.size };
}

/* ── Charge mémorielle ────────────────────────────────────────────────────── */

/**
 * Somme des probabilités de rappel de toutes les cartes actives, à l'instant t.
 *
 * C'est la mesure la plus honnête de « combien je sais » : une carte qu'on va
 * réviser demain compte pour ~0,9 souvenir, une carte oubliée depuis six mois
 * pour presque rien. Le simple décompte de cartes, lui, ne distingue pas un
 * paquet entretenu d'un paquet abandonné.
 */
export function knownCount(cards: SrsCard[], now: Date, cfg: SrsConfig): number {
  let sum = 0;
  for (const c of cards) {
    if (c.stability == null || !c.lastReview || c.suspended) continue;
    const elapsed = Math.max(0, (now.getTime() - new Date(c.lastReview).getTime()) / 86_400_000);
    sum += forgettingCurve(elapsed, c.stability, cfg);
  }
  return sum;
}

/** Répartition des intervalles en cours, par tranches — la forme du paquet. */
export function intervalHistogram(cards: SrsCard[]): { label: string; count: number }[] {
  const bins = [
    { label: "< 1 j", max: 1 },
    { label: "1-7 j", max: 7 },
    { label: "1-3 sem.", max: 21 },
    { label: "3 sem.-3 mois", max: 90 },
    { label: "3-12 mois", max: 365 },
    { label: "> 1 an", max: Infinity },
  ];
  const counts = bins.map(b => ({ label: b.label, count: 0 }));
  for (const c of cards) {
    if (c.state !== "review" || c.suspended) continue;
    const iv = currentIntervalDays(c);
    const idx = bins.findIndex(b => iv < b.max);
    counts[idx === -1 ? bins.length - 1 : idx].count++;
  }
  return counts;
}

/** Répartition des quatre boutons sur la fenêtre — dit si on note trop mou. */
export function ratingBreakdown(store: SrsStore, now: Date, windowDays = 30): Record<1 | 2 | 3 | 4, number> {
  const from = shiftDay(srsDay(now, store.dayCutoffHour), -(windowDays - 1));
  const out = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<1 | 2 | 3 | 4, number>;
  for (const e of store.log) {
    if (srsDay(new Date(e.at), store.dayCutoffHour) < from) continue;
    out[e.rating]++;
  }
  return out;
}
