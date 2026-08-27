/**
 * Moteur de suivi d'activité — échantillonne, découpe en sessions, persiste.
 *
 * Modèle : on interroge le poste toutes `pollSeconds` secondes (cf.
 * lib/activity/native.ts) et on ATTRIBUE l'intervalle écoulé à l'application
 * relevée. Un jour est donc une suite de segments `{ début, fin, app, catégorie }`
 * sans trou volontaire : les trous SONT l'information (pause, poste quitté, app
 * fermée), et les statistiques les lisent comme telles.
 *
 * Où vivent les données : dans le localStorage de CE poste — lecture immédiate,
 * écriture sans réseau — ET dans le compte, une ligne par jour, une tranche par
 * poste (cf. lib/activity/cloud). Le local est le cache du poste qui mesure ; le
 * compte est la mémoire. On peut donc relire sa journée depuis le téléphone ou
 * un autre poste, et la mesure survit au changement de machine.
 *
 * Ce que ça imposait de régler, et qui l'est : deux postes ne s'écrasent pas (ils
 * écrivent chacun leur tranche), leurs minutes communes ne comptent qu'une fois
 * (les chevauchements sont rognés à la lecture), et SEUL un poste de bureau
 * mesure — le navigateur et le téléphone ne voient rien du système, ils lisent.
 *
 * Le moteur est un singleton hors React : le suivi doit continuer quand on
 * quitte la page « Activité », et deux boucles d'échantillonnage compteraient
 * le même temps deux fois.
 */

import { getLocalDateString } from "@/lib/dateUtils";
import {
  classify, classifyDetailed, hostOf, isBrowser,
  type CategoryEdit, type ClassifyRule, type CustomCategory, type Productivity,
} from "@/lib/activity/categories";
import { snapshot, type Snapshot } from "@/lib/activity/native";
import { device, fetchDays, forgetDevice, pushDay, type CloudDay } from "@/lib/activity/cloud";
import { mergeSlices } from "@/lib/activity/merge";
import { frontTab } from "@/lib/focus/native";
import { phoneDay } from "@/lib/activity/phone";

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
  /** Hôte de l'onglet, quand le navigateur a pu le dire. Absent sinon. */
  site?: string;
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
  schedulePush(day.date);
}

export function deleteDay(date: string): void {
  try {
    localStorage.removeItem(DAY_KEY(date));
    writeIndex(readIndex().filter(d => d !== date));
  } catch {}
}

/**
 * Efface l'historique de CE poste, ici et dans le compte.
 *
 * La tranche des autres postes n'est pas touchée : effacer son historique n'a
 * jamais voulu dire effacer celui d'une autre machine.
 */
export function clearAll(): void {
  const dates = readIndex();
  for (const d of dates) {
    try { localStorage.removeItem(DAY_KEY(d)); } catch {}
  }
  writeIndex([]);
  cache = null;
  pushQueue.clear();
  void forgetDevice(dates);
  for (const d of dates) remote.delete(d);
  emit();
}

/** Les jours d'un intervalle inclusif, dans l'ordre chronologique. */
export function loadRange(fromDate: string, toDate: string): DayLog[] {
  const out: DayLog[] = [];
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const dates: string[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) dates.push(getLocalDateString(d));
  // Une seule requête pour tout l'intervalle : trente jours demandés un par un
  // seraient trente allers-retours.
  pull(dates);
  for (const key of dates) {
    // Le jour courant peut n'être qu'en mémoire (pas encore vidé sur disque).
    out.push(withRemote(key === cache?.date ? { ...cache } : loadDay(key)));
  }
  return out;
}

/* ─── Le compte ──────────────────────────────────────────────────────────
   Le local est le cache de CE poste ; le compte est la mémoire commune. Deux
   mouvements, jamais mélangés :

     • on VERSE la tranche de ce poste, en différé (une journée bouge toutes les
       quelques secondes, la verser à chaque échantillon serait une requête par
       échantillon) ;
     • on TIRE les journées demandées, une fois par session, et on prévient les
       pages quand elles arrivent — c'est ce qui fait apparaître une journée
       mesurée ailleurs sans avoir à recharger.
   -------------------------------------------------------------------- */

/**
 * La synchronisation ne s'allume qu'une fois un compte connu.
 *
 * Sans ce drapeau, chaque lecture de journée lançait une requête — même sans
 * personne de connecté, où il n'y a par définition rien à lire ni à écrire. Elle
 * est donc armée par le branchement React (`useActivityTracker`), qui est le
 * seul à savoir s'il y a un utilisateur.
 */
let cloudOn = false;

export function setCloudSync(on: boolean): void {
  cloudOn = on;
}

/** Journées du compte déjà tirées, par date. */
const remote = new Map<string, CloudDay>();
const pulling = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const pushQueue = new Set<string>();

/** Délai avant de verser : assez long pour regrouper, assez court pour ne rien
 *  perdre si l'app se ferme (le versement est aussi tenté à la fermeture). */
const PUSH_DELAY_MS = 20_000;

function schedulePush(date: string): void {
  if (!cloudOn) return;
  pushQueue.add(date);
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const dates = [...pushQueue];
    pushQueue.clear();
    for (const d of dates) {
      const day = d === cache?.date ? cache : loadDay(d);
      if (day.segments.length === 0 && !day.awayMs) continue;
      void pushDay(day).then(ok => { if (!ok) pushQueue.add(d); });
    }
  }, PUSH_DELAY_MS);
}

/** Verse tout de suite ce qui attend (fermeture de l'app, onglet masqué). */
export function syncNow(): void {
  if (!cloudOn) return;
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  const dates = [...pushQueue];
  pushQueue.clear();
  for (const d of dates) {
    const day = d === cache?.date ? cache : loadDay(d);
    void pushDay(day);
  }
}

/**
 * Va chercher au compte les journées demandées, une seule fois chacune.
 * Les pages ne l'appellent pas : c'est la lecture qui la déclenche.
 */
function pull(dates: string[]): void {
  if (!cloudOn) return;
  const missing = dates.filter(d => !remote.has(d) && !pulling.has(d));
  if (!missing.length || typeof window === "undefined") return;
  for (const d of missing) pulling.add(d);
  void fetchDays(missing).then(rows => {
    // Une date sans ligne est une réponse : on la mémorise vide pour ne pas la
    // redemander à chaque rendu.
    for (const d of missing) remote.set(d, { date: d, devices: {} });
    for (const row of rows) remote.set(row.date, row);
    for (const d of missing) pulling.delete(d);
    emit();
  }).catch(() => { for (const d of missing) pulling.delete(d); });
}

/**
 * La journée telle que le COMPTE la connaît : ce poste, plus les tranches des
 * autres postes. `mergeSegments` rogne les minutes communes — deux machines
 * allumées ensemble ne font pas deux fois la même heure.
 */
function withRemote(local: DayLog): DayLog {
  const row = remote.get(local.date);
  const me = device().id;
  const others = row ? Object.entries(row.devices).filter(([id]) => id !== me) : [];
  if (!others.length) return local;
  return {
    ...local,
    segments: mergeSlices([
      { kind: device().kind, segments: local.segments },
      ...others.map(([, slice]) => ({ kind: slice.kind ?? "desktop", segments: slice.segments })),
    ]),
    awayMs: (local.awayMs || 0) + others.reduce((n, [, slice]) => n + (slice.awayMs || 0), 0),
  };
}

/** Les postes qui ont mesuré cette journée, pour que la page puisse le dire. */
export function daySources(date: string): { id: string; label: string; ms: number }[] {
  const row = remote.get(date);
  const me = device();
  const out: { id: string; label: string; ms: number }[] = [];
  const localDay = date === cache?.date ? cache : loadDay(date);
  const localMs = localDay.segments.reduce((n, s) => n + Math.max(0, s.e - s.s), 0);
  if (localMs > 0) out.push({ id: me.id, label: me.label, ms: localMs });
  for (const [id, slice] of Object.entries(row?.devices ?? {})) {
    if (id === me.id) continue;
    out.push({ id, label: slice.label, ms: slice.segments.reduce((n, s) => n + Math.max(0, s.e - s.s), 0) });
  }
  return out.sort((a, b) => b.ms - a.ms);
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

/** Le jour courant, mémoire ET compte compris (l'écriture disque est différée). */
export function getDay(date: string): DayLog {
  pull([date]);
  const local = cache && cache.date === date ? cache : loadDay(date);
  return withRemote(local);
}

function flush(): void {
  if (cache && dirtyTicks > 0) {
    saveDay(cache);
    dirtyTicks = 0;
  }
}

/** Ajoute un intervalle mesuré au jour concerné, en fusionnant si possible. */
function append(startMs: number, endMs: number, app: string, label: string, title: string, cat: string, site = ""): void {
  if (endMs <= startMs) return;

  const date = getLocalDateString(new Date(startMs));
  const endDate = getLocalDateString(new Date(endMs));
  if (date !== endDate) {
    // Intervalle à cheval sur minuit : on le coupe, sinon la journée d'hier
    // absorberait les premières minutes d'aujourd'hui.
    const midnight = new Date(endMs);
    midnight.setHours(0, 0, 0, 0);
    append(startMs, midnight.getTime() - 1, app, label, title, cat, site);
    append(midnight.getTime(), endMs, app, label, title, cat, site);
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
    cache.segments.push({ s: startMs, e: endMs, app, label, title, cat, ...(site ? { site } : {}) });
  }
  dirtyTicks += 1;
  if (dirtyTicks >= 4) flush();
}

/* ─── Le téléphone ───────────────────────────────────────────────────────── */

/**
 * Remplace le journal d'un jour par ce que le système du téléphone a enregistré.
 *
 * On ÉCRASE au lieu de fusionner, et c'est le point important : le système est
 * la source de vérité sur Android, pas nous. Fusionner reviendrait à empiler
 * plusieurs reconstructions de la même journée à chaque ouverture de l'app, et
 * à compter le même temps deux fois.
 *
 * Rend le nombre de segments repris, ou `null` quand il n'y avait rien à lire
 * (hors Android, autorisation refusée) — dans ce cas le journal existant n'est
 * pas touché.
 */
export async function importPhoneDay(date: string): Promise<number | null> {
  const segments = await phoneDay(date, getSettings().rules);
  if (!segments) return null;

  flush();
  const day: DayLog = { date, segments, awayMs: 0, updatedAt: Date.now() };
  if (cache?.date === date) cache = day;
  saveDay(day);
  emit();
  return segments.length;
}

/* ─── L'hôte de l'onglet ─────────────────────────────────────────────────── */

/**
 * Hôte de la page ouverte dans le navigateur, quand le titre ne suffit pas.
 *
 * Le problème qu'il résout : beaucoup de sites n'écrivent pas leur nom dans le
 * titre de la fenêtre. Le lecteur web de Spotify affiche le morceau en cours
 * — « ELEVEN OCEANS • Moji x Sboy » —, si bien que CHAQUE chanson écoutée
 * ressortait comme un site différent, qu'aucune ne pouvait être rangée, et que
 * le temps de musique se retrouvait éparpillé en dizaines de lignes d'une
 * minute. L'hôte, lui, est le même du premier au dernier morceau.
 *
 * Trois précautions, parce que lire l'onglet coûte cher (un `osascript` et un
 * Apple Event, de l'ordre de 400 ms — cf. src-tauri/src/blocker.rs) :
 *
 *  • on ne demande RIEN quand le titre suffit déjà à reconnaître le site. La
 *    question est posée au catalogue seul, règles de l'utilisateur écartées :
 *    une règle donne la bonne catégorie mais laisse le nom deviné, donc la
 *    ligne resterait éclatée.
 *  • le résultat est mis en cache par (application, titre). Une même page ne se
 *    demande donc qu'une fois — et pendant l'écoute, c'est une lecture par
 *    morceau, pas une par échantillon.
 *  • l'échec est mémorisé comme un vide. Un navigateur non pilotable ou une
 *    autorisation d'automatisation refusée ne doit pas faire relancer la
 *    question toutes les deux secondes.
 *
 * Le cache vit en mémoire, pas sur le disque : il n'est qu'une économie, et une
 * URL est ce qu'un suivi d'activité a de plus intime — elle n'a rien à faire
 * dans un enregistrement permanent. Seul l'HÔTE part dans le segment.
 */
const siteByTitle = new Map<string, string>();
/** Au-delà, on repart de zéro : le cache est une économie, pas un journal. */
const SITE_CACHE_MAX = 500;

async function resolveSite(snap: Snapshot): Promise<string> {
  if (!snap.full || !snap.app || !isBrowser(snap.app) || !snap.title) return "";

  const key = `${snap.app}\n${snap.title}`;
  const known = siteByTitle.get(key);
  if (known !== undefined) return known;

  // Le titre nomme déjà le site : inutile de déranger le navigateur.
  if (classifyDetailed(snap.app, snap.title, []).via !== "none") {
    siteByTitle.set(key, "");
    return "";
  }

  let host = "";
  try {
    const tab = await frontTab(snap.app);
    host = tab?.ok ? hostOf(tab.url) : "";
  } catch {
    /* Rien de rattrapable ici : on note l'échec comme un vide et on continue de
       mesurer avec le titre seul. */
  }
  if (siteByTitle.size >= SITE_CACHE_MAX) siteByTitle.clear();
  siteByTitle.set(key, host);
  return host;
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

  /* Chaque appareil mesure ce qu'il VOIT : l'app de bureau tout le poste, une
     page web le seul temps passé dans tao trade. Aucun ne se tait — une soirée
     passée sur le téléphone, poste éteint, n'a que le téléphone pour la
     raconter. Ce qui est arbitré, c'est le CHEVAUCHEMENT, à la lecture et non à
     l'écriture : l'appareil le mieux renseigné garde la minute (cf.
     lib/activity/merge). Écrire ici « le poste a raison » aurait demandé de
     savoir, au moment de mesurer, ce qu'une autre machine était en train de
     faire. */
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

  const site = await resolveSite(snap);
  const { category, label } = classify(snap.app, snap.title, settings.rules, site);
  const changed = live.app !== snap.app || live.label !== label || live.cat !== category;
  append(now - elapsed, now, snap.app, label, snap.title, category, site);

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
    window.addEventListener("beforeunload", () => { flush(); syncNow(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") { flush(); syncNow(); }
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
