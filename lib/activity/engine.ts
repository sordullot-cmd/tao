/**
 * Moteur de suivi d'activité — échantillonne, découpe en sessions, persiste.
 *
 * Modèle : on interroge le poste toutes `pollSeconds` secondes (cf.
 * lib/activity/native.ts) et on ATTRIBUE l'intervalle écoulé à l'application
 * relevée. Un jour est donc une suite de segments `{ début, fin, app, catégorie }`
 * sans trou volontaire : les trous SONT l'information (pause, poste quitté, app
 * fermée), et les statistiques les lisent comme telles.
 *
 * Où vivent les données : dans le localStorage de CE poste, un enregistrement
 * par jour. C'est délibéré et non une facilité — l'activité mesurée est celle
 * d'une machine ; la remonter dans le cloud mélangerait deux postes dans la
 * même journée et ferait des totaux faux. Seuls les RÉGLAGES (règles, objectifs)
 * sont synchronisés, eux étant les mêmes partout (cf. useActivitySettings).
 *
 * Le moteur est un singleton hors React : le suivi doit continuer quand on
 * quitte la page « Activité », et deux boucles d'échantillonnage compteraient
 * le même temps deux fois.
 */

import { getLocalDateString } from "@/lib/dateUtils";
import {
  classify,
  type CategoryEdit, type ClassifyRule, type CustomCategory, type Productivity,
} from "@/lib/activity/categories";
import { snapshot, type Snapshot } from "@/lib/activity/native";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface Segment {
  /** Début (ms epoch). */
  s: number;
  /** Fin (ms epoch). */
  e: number;
  /** Nom brut de l'application relevée par l'OS. */
  app: string;
  /** Nom affiché : le site pour un navigateur, l'app sinon. */
  label: string;
  /** Titre de fenêtre au moment où le segment a commencé. */
  title: string;
  /** Identifiant de catégorie (cf. lib/activity/categories). */
  cat: string;
}

export interface DayLog {
  date: string;
  segments: Segment[];
  /** Temps où le poste était allumé mais l'utilisateur absent (ms). */
  awayMs: number;
  updatedAt: number;
}

export interface ActivitySettings {
  enabled: boolean;
  /** Période d'échantillonnage, en secondes. */
  pollSeconds: number;
  /** Inactivité au-delà de laquelle on arrête de compter (secondes). */
  afkSeconds: number;
  /** Durée minimale d'une session de focus (minutes). */
  focusMinMinutes: number;
  /** Interruption tolérée à l'intérieur d'une session de focus (minutes). */
  focusGapMinutes: number;
  /** Objectif de temps actif par jour (heures). */
  workGoalHours: number;
  /** Objectif de temps de focus par jour (heures). */
  focusGoalHours: number;
  /** Rappel de pause après N minutes de travail d'affilée (0 = jamais). */
  breakEveryMinutes: number;
  /** Alerte de surtravail au-delà de N heures actives (0 = jamais). */
  overworkHours: number;
  /** Alerte après N minutes continues de catégorie « distraction » (0 = jamais). */
  distractionAlertMinutes: number;
  /** Notifications système (pause, surtravail, distraction). */
  notifications: boolean;
  /** Règles de classement de l'utilisateur — prioritaires sur les règles par défaut. */
  rules: ClassifyRule[];
  /** Nature d'une catégorie revue par l'utilisateur (id → productif/neutre/distraction). */
  productivity: Record<string, Productivity>;
  /** Catégories créées par l'utilisateur. */
  customCategories: CustomCategory[];
  /** Nom et couleur revus sur les catégories livrées avec l'app. */
  categoryEdits: Record<string, CategoryEdit>;
  /** Ordre choisi par l'utilisateur (identifiants). Les absents suivent. */
  categoryOrder: string[];
}

export const DEFAULT_SETTINGS: ActivitySettings = {
  enabled: true,
  pollSeconds: 5,
  afkSeconds: 180,
  focusMinMinutes: 15,
  focusGapMinutes: 2,
  workGoalHours: 6,
  focusGoalHours: 4,
  breakEveryMinutes: 50,
  overworkHours: 9,
  distractionAlertMinutes: 20,
  notifications: true,
  rules: [],
  productivity: {},
  customCategories: [],
  categoryEdits: {},
  categoryOrder: [],
};

/** Ce que l'interface affiche « en direct », en haut de la page Activité. */
export interface LiveState {
  /** Vrai si la boucle tourne. */
  running: boolean;
  /** Relevé courant, ou null avant le premier échantillon. */
  app: string | null;
  label: string | null;
  title: string | null;
  cat: string | null;
  /** Début du segment courant (ms epoch). */
  since: number | null;
  idleSeconds: number;
  /** Vrai quand l'utilisateur est considéré absent. */
  away: boolean;
  /** Vrai si la source couvre tout le poste. */
  full: boolean;
  ok: boolean;
  platform: string;
  error?: string | null;
}

/* ─── Persistance ───────────────────────────────────────────────────────── */

const DAY_KEY = (date: string) => `tr4de_activity_day_${date}`;
const INDEX_KEY = "tr4de_activity_days";
/** Au-delà, les vieux jours sont effacés : le localStorage n'est pas un entrepôt. */
const KEEP_DAYS = 120;

function readIndex(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(d => typeof d === "string") : [];
  } catch { return []; }
}

function writeIndex(dates: string[]): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(dates)); } catch {}
}

function touchIndex(date: string): void {
  const idx = readIndex();
  if (idx.includes(date)) return;
  const next = [...idx, date].sort();
  // Purge des jours hors fenêtre, index ET enregistrements : garder l'index
  // propre sans supprimer les données laisserait des clés orphelines.
  while (next.length > KEEP_DAYS) {
    const gone = next.shift();
    if (gone) { try { localStorage.removeItem(DAY_KEY(gone)); } catch {} }
  }
  writeIndex(next);
}

/** Jours enregistrés, du plus ancien au plus récent. */
export function listDays(): string[] {
  return readIndex();
}

export function emptyDay(date: string): DayLog {
  return { date, segments: [], awayMs: 0, updatedAt: 0 };
}

export function loadDay(date: string): DayLog {
  if (typeof window === "undefined") return emptyDay(date);
  try {
    const raw = localStorage.getItem(DAY_KEY(date));
    if (!raw) return emptyDay(date);
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.segments)) return emptyDay(date);
    return { date, segments: parsed.segments, awayMs: parsed.awayMs || 0, updatedAt: parsed.updatedAt || 0 };
  } catch { return emptyDay(date); }
}

export function saveDay(day: DayLog): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DAY_KEY(day.date), JSON.stringify({
      segments: day.segments, awayMs: day.awayMs, updatedAt: Date.now(),
    }));
    touchIndex(day.date);
  } catch {
    /* Quota atteint : on préfère perdre l'échantillon que casser l'app. */
  }
}

export function deleteDay(date: string): void {
  try {
    localStorage.removeItem(DAY_KEY(date));
    writeIndex(readIndex().filter(d => d !== date));
  } catch {}
}

/** Efface tout l'historique d'activité de ce poste. */
export function clearAll(): void {
  for (const d of readIndex()) {
    try { localStorage.removeItem(DAY_KEY(d)); } catch {}
  }
  writeIndex([]);
  cache = null;
  emit();
}

/** Les jours d'un intervalle inclusif, dans l'ordre chronologique. */
export function loadRange(fromDate: string, toDate: string): DayLog[] {
  const out: DayLog[] = [];
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = getLocalDateString(d);
    // Le jour courant peut n'être qu'en mémoire (pas encore vidé sur disque).
    out.push(key === cache?.date ? { ...cache } : loadDay(key));
  }
  return out;
}

/* ─── Boucle d'échantillonnage ──────────────────────────────────────────── */

let timer: ReturnType<typeof setInterval> | null = null;
let getSettings: () => ActivitySettings = () => DEFAULT_SETTINGS;
let cache: DayLog | null = null;
let dirtyTicks = 0;
let lastTickAt = 0;
let live: LiveState = {
  running: false, app: null, label: null, title: null, cat: null, since: null,
  idleSeconds: 0, away: false, full: false, ok: false, platform: "unknown", error: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

/** S'abonne aux changements (nouvel échantillon, jour modifié). */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

export function getLive(): LiveState {
  return live;
}

/** Le jour courant, mémoire comprise (l'écriture disque est différée). */
export function getDay(date: string): DayLog {
  if (cache && cache.date === date) return cache;
  return loadDay(date);
}

function flush(): void {
  if (cache && dirtyTicks > 0) {
    saveDay(cache);
    dirtyTicks = 0;
  }
}

/** Ajoute un intervalle mesuré au jour concerné, en fusionnant si possible. */
function append(startMs: number, endMs: number, app: string, label: string, title: string, cat: string): void {
  if (endMs <= startMs) return;

  const date = getLocalDateString(new Date(startMs));
  const endDate = getLocalDateString(new Date(endMs));
  if (date !== endDate) {
    // Intervalle à cheval sur minuit : on le coupe, sinon la journée d'hier
    // absorberait les premières minutes d'aujourd'hui.
    const midnight = new Date(endMs);
    midnight.setHours(0, 0, 0, 0);
    append(startMs, midnight.getTime() - 1, app, label, title, cat);
    append(midnight.getTime(), endMs, app, label, title, cat);
    return;
  }

  if (!cache || cache.date !== date) {
    flush();
    cache = loadDay(date);
  }

  const last = cache.segments[cache.segments.length - 1];
  const poll = Math.max(1, getSettings().pollSeconds) * 1000;
  const contiguous = last && startMs - last.e <= poll * 2.5;
  if (last && contiguous && last.app === app && last.label === label && last.cat === cat) {
    // Même activité qui continue : on étire le segment plutôt que d'en empiler
    // un par échantillon — un jour ferait sinon 17 000 entrées.
    last.e = Math.max(last.e, endMs);
  } else {
    cache.segments.push({ s: startMs, e: endMs, app, label, title, cat });
  }
  dirtyTicks += 1;
  if (dirtyTicks >= 4) flush();
}

async function tick(): Promise<void> {
  const settings = getSettings();
  const now = Date.now();
  const poll = Math.max(1, settings.pollSeconds) * 1000;
  const snap: Snapshot = await snapshot();

  // Intervalle réellement écoulé, borné : après une veille ou un onglet en
  // arrière-plan, le navigateur rend la main des minutes plus tard et l'écart
  // brut attribuerait tout ce temps à l'app affichée.
  const elapsed = lastTickAt ? Math.min(now - lastTickAt, poll * 2) : poll;
  lastTickAt = now;

  const away = !snap.ok || snap.idleSeconds >= Math.max(30, settings.afkSeconds);

  if (away) {
    if (snap.ok && cache) {
      cache.awayMs += elapsed;
      dirtyTicks += 1;
    }
    live = {
      ...live, running: true, away: true, idleSeconds: snap.idleSeconds,
      ok: snap.ok, full: snap.full, platform: snap.platform, error: snap.error ?? null,
      app: snap.app || live.app, title: snap.title || live.title,
    };
    flush();
    emit();
    return;
  }

  const { category, label } = classify(snap.app, snap.title, settings.rules);
  const changed = live.app !== snap.app || live.label !== label || live.cat !== category;
  append(now - elapsed, now, snap.app, label, snap.title, category);

  live = {
    running: true,
    app: snap.app,
    label,
    title: snap.title,
    cat: category,
    since: changed || !live.since ? now - elapsed : live.since,
    idleSeconds: snap.idleSeconds,
    away: false,
    full: snap.full,
    ok: true,
    platform: snap.platform,
    error: snap.error ?? null,
  };
  emit();
}

let ticking = false;
async function safeTick(): Promise<void> {
  // Un échantillon lent (osascript peut prendre ~100 ms, plus si l'app est
  // occupée) ne doit pas se superposer au suivant : deux `append` concurrents
  // compteraient le même intervalle deux fois.
  if (ticking) return;
  ticking = true;
  try { await tick(); } catch { /* on retentera au prochain tour */ }
  finally { ticking = false; }
}

/**
 * Démarre (ou redémarre) la boucle. `read` est relu à CHAQUE échantillon :
 * changer un réglage prend donc effet tout de suite, sans redémarrer.
 */
export function startTracker(read: () => ActivitySettings): void {
  if (typeof window === "undefined") return;
  getSettings = read;
  const settings = read();
  if (timer) clearInterval(timer);
  if (!settings.enabled) { stopTracker(); return; }

  lastTickAt = 0;
  live = { ...live, running: true };
  timer = setInterval(safeTick, Math.max(1, settings.pollSeconds) * 1000);
  void safeTick();

  if (!unloadWired) {
    unloadWired = true;
    // Dernière écriture avant fermeture : sinon les 20 dernières secondes de la
    // journée partent avec la fenêtre.
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }
}

let unloadWired = false;

export function stopTracker(): void {
  if (timer) clearInterval(timer);
  timer = null;
  flush();
  live = { ...live, running: false };
  emit();
}

export function isRunning(): boolean {
  return timer != null;
}
