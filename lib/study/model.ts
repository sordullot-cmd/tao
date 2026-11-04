/**
 * Étude — le modèle, hors React.
 *
 * Des dossiers qui s'emboîtent, et des notes dedans. Une note d'étude n'est pas
 * une note de la page Notes : elle porte un STATUT (à étudier, en cours,
 * maîtrisé), des vidéos et des liens, des captures, et surtout des trades réels
 * qui l'illustrent. C'est ce dernier lien qui fait la différence entre un cours
 * qu'on a lu et un concept qu'on sait reconnaître sur un graphique.
 *
 * ── Pourquoi pas dans la page Notes ───────────────────────────────────────
 * Notes vit par tags, se synchronise avec un coffre Obsidian et réécrit ses
 * fichiers .md : y loger statut, vidéos et trades aurait demandé un
 * front-matter de plus, relu par l'export. Le rendu markdown, lui, est partagé
 * (`components/notes/NotePreview`) — c'est la seule pièce qui gagnait à l'être.
 *
 * ── Dossiers : un `parentId`, pas des listes imbriquées ───────────────────
 * Un arbre stocké tel quel oblige à le parcourir pour chaque écriture et rend
 * le déplacement d'un dossier coûteux. Une liste plate avec `parentId` se met à
 * jour d'un `map`, et l'arbre se reconstruit à l'affichage.
 */

import { stripStamps } from "./stamps";

export type StudyStatus = "todo" | "learning" | "mastered";

export const STATUSES: readonly StudyStatus[] = ["todo", "learning", "mastered"];

export interface StudyFolder {
  id: string;
  name: string;
  /** `null` = à la racine. */
  parentId: string | null;
  createdAt: string;
}

export interface StudyVideo {
  id: string;
  /** L'identifiant YouTube (11 caractères), pas l'URL : c'est lui qui sert à
   *  construire la vignette et le lecteur, et deux formes d'URL (youtu.be,
   *  watch?v=) désignent la même vidéo. */
  youtubeId: string;
  /** Seconde de départ — un cours d'une heure ne vaut souvent que pour cinq
   *  minutes, et c'est celles-là qu'on veut retrouver. */
  start: number;
  title: string;
  /** Où l'on s'est arrêté (secondes), pour « Reprendre à ». 0 = jamais lue. */
  position: number;
}

export interface StudyLink {
  id: string;
  label: string;
  url: string;
}

export interface StudyImage {
  id: string;
  url: string;
  caption: string;
}

export interface StudyNote {
  id: string;
  /** `null` = hors dossier (visible dans « Toutes les notes »). */
  folderId: string | null;
  title: string;
  /** Markdown, rendu par le même moteur que la page Notes. */
  content: string;
  status: StudyStatus;
  videos: StudyVideo[];
  links: StudyLink[];
  images: StudyImage[];
  /** Ids des trades réels. Le P&L n'est jamais recopié : il se relit sur le
   *  trade, seule source fiable des chiffres. */
  tradeIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Une séance d'étude chronométrée (« Fermer la porte » → « Rouvrir »). */
export interface StudySession {
  id: string;
  /** ISO. */
  start: string;
  end: string;
}

export interface StudyStore {
  version: 1;
  folders: StudyFolder[];
  notes: StudyNote[];
  sessions: StudySession[];
  /** Début de la séance en cours, `null` porte ouverte. Un horodatage et non
   *  un compteur : rien n'a à tourner en fond, la durée se recalcule depuis
   *  l'heure — elle survit à un changement de page, un rechargement, une
   *  fermeture de l'app, et se lit pareil sur un autre appareil. */
  running: string | null;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyStudy(): StudyStore {
  return { version: 1, folders: [], notes: [], sessions: [], running: null };
}

export function emptyNote(folderId: string | null, title = ""): StudyNote {
  const now = new Date().toISOString();
  return {
    id: newId(), folderId, title, content: "", status: "todo",
    videos: [], links: [], images: [], tradeIds: [], createdAt: now, updatedAt: now,
  };
}

/* ── Normalisation ─────────────────────────────────────────────────────── */

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * Remet d'aplomb un magasin lu du cache ou du cloud. Lu à chaque rendu plutôt
 * que migré une fois : un champ ajouté plus tard prend sa valeur par défaut
 * chez qui ne l'a jamais eu, sans script à faire tourner.
 */
export function normalizeStudy(raw: unknown): StudyStore {
  const src = obj(raw);
  const folders: StudyFolder[] = arr(src.folders)
    .map(obj)
    .filter(f => typeof f.id === "string")
    .map(f => ({
      id: f.id as string,
      name: str(f.name, "Sans nom"),
      parentId: typeof f.parentId === "string" ? f.parentId : null,
      createdAt: str(f.createdAt),
    }));
  const known = new Set(folders.map(f => f.id));
  /* Un parent disparu (supprimé sur un autre appareil) remonte l'enfant à la
     racine plutôt que de le rendre invisible : un dossier qu'aucun chemin
     n'atteint est un dossier perdu. */
  for (const f of folders) if (f.parentId && !known.has(f.parentId)) f.parentId = null;
  breakCycles(folders);

  const notes: StudyNote[] = arr(src.notes)
    .map(obj)
    .filter(n => typeof n.id === "string")
    .map(n => {
      const folderId = typeof n.folderId === "string" && known.has(n.folderId) ? n.folderId : null;
      const status = STATUSES.includes(n.status as StudyStatus) ? (n.status as StudyStatus) : "todo";
      return {
        id: n.id as string,
        folderId,
        title: str(n.title),
        content: str(n.content),
        status,
        videos: arr(n.videos).map(obj).filter(v => typeof v.youtubeId === "string").map(v => ({
          id: str(v.id) || newId(),
          youtubeId: v.youtubeId as string,
          start: Number.isFinite(Number(v.start)) ? Math.max(0, Math.floor(Number(v.start))) : 0,
          title: str(v.title),
          position: Number.isFinite(Number(v.position)) ? Math.max(0, Math.floor(Number(v.position))) : 0,
        })),
        links: arr(n.links).map(obj).filter(l => typeof l.url === "string").map(l => ({
          id: str(l.id) || newId(), label: str(l.label), url: l.url as string,
        })),
        images: arr(n.images).map(obj).filter(i => typeof i.url === "string").map(i => ({
          id: str(i.id) || newId(), url: i.url as string, caption: str(i.caption),
        })),
        /* Les ids de trades arrivent parfois en nombre selon la source : on
           compare toujours en chaîne, donc on les range en chaîne. */
        tradeIds: [...new Set(arr(n.tradeIds).filter(t => t != null && t !== "").map(String))],
        createdAt: str(n.createdAt),
        updatedAt: str(n.updatedAt) || str(n.createdAt),
      };
    });
  const sessions: StudySession[] = arr(src.sessions).map(obj)
    .filter(x => isDate(x.start) && isDate(x.end) && Date.parse(x.end as string) > Date.parse(x.start as string))
    .map(x => ({ id: str(x.id) || newId(), start: x.start as string, end: x.end as string }));
  const running = isDate(src.running) ? (src.running as string) : null;
  return { version: 1, folders, notes, sessions, running };
}

const isDate = (v: unknown): boolean => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** Un dossier qui se retrouverait son propre ancêtre (deux déplacements
 *  croisés sur deux appareils) sortirait de l'arbre ; on le remet à la racine. */
function breakCycles(folders: StudyFolder[]): void {
  const byId = new Map(folders.map(f => [f.id, f]));
  for (const f of folders) {
    const seen = new Set<string>([f.id]);
    let cur = f.parentId ? byId.get(f.parentId) : undefined;
    while (cur) {
      if (seen.has(cur.id)) { f.parentId = null; break; }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
}

/* ── Arbre ─────────────────────────────────────────────────────────────── */

export function childFolders(store: StudyStore, parentId: string | null): StudyFolder[] {
  return store.folders
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
}

/** Le dossier et tous ceux qu'il contient, à n'importe quelle profondeur. */
export function descendantIds(store: StudyStore, folderId: string): Set<string> {
  const out = new Set<string>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of store.folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; }
    }
  }
  return out;
}

/** Racine → dossier, pour le fil d'Ariane. */
export function folderPath(store: StudyStore, folderId: string | null): StudyFolder[] {
  const byId = new Map(store.folders.map(f => [f.id, f]));
  const path: StudyFolder[] = [];
  let cur = folderId ? byId.get(folderId) : undefined;
  while (cur && path.length <= store.folders.length) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** Les notes d'un dossier, sous-dossiers compris. `null` = toutes. */
export function notesUnder(store: StudyStore, folderId: string | null): StudyNote[] {
  if (folderId === null) return store.notes;
  const ids = descendantIds(store, folderId);
  return store.notes.filter(n => n.folderId !== null && ids.has(n.folderId));
}

export interface Progress {
  total: number;
  todo: number;
  learning: number;
  mastered: number;
  /** 0–1. Une note « en cours » compte pour moitié : sinon une étude entamée
   *  partout et finie nulle part afficherait 0 %, ce qui décourage à tort. */
  ratio: number;
}

export function progressOf(notes: StudyNote[]): Progress {
  const p = { total: notes.length, todo: 0, learning: 0, mastered: 0, ratio: 0 };
  for (const n of notes) p[n.status] += 1;
  p.ratio = p.total === 0 ? 0 : (p.mastered + p.learning * 0.5) / p.total;
  return p;
}

/**
 * Retire un dossier, ses sous-dossiers et leurs notes. Rend aussi ce qui est
 * parti, pour que l'annulation le remette sans relire tout le magasin — une
 * restauration par instantané écraserait ce qui a été écrit entre-temps.
 */
export function removeFolder(store: StudyStore, folderId: string): {
  store: StudyStore; folders: StudyFolder[]; notes: StudyNote[];
} {
  const ids = descendantIds(store, folderId);
  const notes = store.notes.filter(n => n.folderId !== null && ids.has(n.folderId));
  const folders = store.folders.filter(f => ids.has(f.id));
  return {
    store: {
      ...store,
      folders: store.folders.filter(f => !ids.has(f.id)),
      notes: store.notes.filter(n => !(n.folderId !== null && ids.has(n.folderId))),
    },
    folders,
    notes,
  };
}

/** Faux si le déplacement mettrait un dossier dans lui-même ou sa descendance. */
export function canMoveFolder(store: StudyStore, folderId: string, parentId: string | null): boolean {
  return parentId === null || !descendantIds(store, folderId).has(parentId);
}

/* ── Recherche ─────────────────────────────────────────────────────────── */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Titre, contenu et titres de vidéos ; sans accents ni casse — on cherche
 *  « liquidite » en tapant vite, pas « liquidité ». */
export function searchNotes(notes: StudyNote[], query: string): StudyNote[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return notes;
  return notes.filter(n => {
    const hay = fold([n.title, n.content, ...n.videos.map(v => v.title), ...n.links.map(l => l.label)].join(" "));
    return terms.every(t => hay.includes(t));
  });
}

/* ── YouTube ───────────────────────────────────────────────────────────── */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** `90`, `1m30s`, `1h2m3s` → secondes. */
function parseStart(raw: string | null): number {
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0]) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/**
 * Reconnaît un lien YouTube sous toutes ses formes courantes — watch, youtu.be,
 * shorts, embed, live, m. — et en tire l'identifiant et le départ. Rend `null`
 * pour tout le reste : un lien qui n'est pas une vidéo reste un lien.
 */
export function parseYouTube(input: string): { youtubeId: string; start: number } | null {
  const raw = input.trim();
  if (YT_ID.test(raw)) return { youtubeId: raw, start: 0 };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  if (!id || !YT_ID.test(id)) return null;
  return { youtubeId: id, start: parseStart(url.searchParams.get("t") || url.searchParams.get("start")) };
}

export function youTubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

/** Vignettes du lecteur, de la plus nette à la plus sûre. `mqdefault` (320 px)
 *  étiré sur toute la largeur du lecteur donnait une image pixelisée ;
 *  `maxresdefault` n'existe pas pour toutes les vidéos (404), `hq720` presque
 *  toujours. `hqdefault`/`sddefault` sont écartées : en 4:3, leurs bandes
 *  noires resteraient visibles dans un cadre 16:9. */
export function youTubeThumbs(id: string): string[] {
  return ["maxresdefault", "hq720", "mqdefault"].map(n => `https://i.ytimg.com/vi/${id}/${n}.jpg`);
}

/** Le lecteur sans cookie : regarder un cours ne doit pas nourrir le profil
 *  publicitaire de l'utilisateur plus que nécessaire. */
export function youTubeEmbed(id: string, start: number): string {
  const q = new URLSearchParams({ rel: "0", modestbranding: "1", autoplay: "1" });
  if (start > 0) q.set("start", String(start));
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
}

export function youTubeWatch(id: string, start: number): string {
  return `https://www.youtube.com/watch?v=${id}${start > 0 ? `&t=${start}s` : ""}`;
}

export function fmtStart(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/* ── Trades reliés ─────────────────────────────────────────────────────── */

interface TradeLike { id?: unknown; pnl?: unknown }

export interface TradeStats {
  /** Trades encore présents ; un trade supprimé depuis ne compte plus. */
  count: number;
  wins: number;
  pnl: number;
  /** 0–1, `null` sans trade. */
  winRate: number | null;
}

export function tradeStats(tradeIds: string[], tradeById: Map<string, TradeLike>): TradeStats {
  let count = 0, wins = 0, pnl = 0;
  for (const id of tradeIds) {
    const tr = tradeById.get(id);
    if (!tr) continue;
    const v = typeof tr.pnl === "number" ? tr.pnl : Number(tr.pnl) || 0;
    count += 1;
    pnl += v;
    if (v > 0) wins += 1;
  }
  return { count, wins, pnl, winRate: count === 0 ? null : wins / count };
}

/* ── Temps d'étude ─────────────────────────────────────────────────────── */

/** Au-delà, une porte restée fermée est un oubli, pas une séance : on la
 *  plafonne plutôt que d'inscrire une nuit entière au compteur. */
export const MAX_SESSION_MS = 6 * 3600 * 1000;

/** Jour LOCAL (YYYY-MM-DD) : une séance à 23 h compte pour ce soir, pas pour
 *  le lendemain UTC. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ferme la séance en cours et la range ; sans effet porte ouverte. */
export function closeSession(store: StudyStore, now: Date): StudyStore {
  if (!store.running) return store;
  const start = Date.parse(store.running);
  const end = Math.min(now.getTime(), start + MAX_SESSION_MS);
  const sessions = end - start >= 1000
    ? [...store.sessions, { id: newId(), start: store.running, end: new Date(end).toISOString() }]
    : store.sessions;
  return { ...store, sessions, running: null };
}

/** Écart en deçà duquel deux morceaux de temps forment la même séance : un
 *  détour de quelques secondes ailleurs ne doit pas multiplier les séances. */
export const SESSION_GAP_MS = 2 * 60 * 1000;

/**
 * Ajoute un morceau de temps d'étude mesuré automatiquement. Il prolonge la
 * dernière séance s'il la suit de près, sinon il en ouvre une. Le suivi
 * écrit toutes les minutes : sans cette fusion, une heure d'étude laisserait
 * soixante séances.
 */
export function addStudySpan(store: StudyStore, startMs: number, endMs: number): StudyStore {
  if (!(endMs - startMs >= 1000)) return store;
  const last = store.sessions[store.sessions.length - 1];
  if (last) {
    const lastEnd = Date.parse(last.end);
    if (startMs <= lastEnd + SESSION_GAP_MS && endMs > lastEnd && endMs - Date.parse(last.start) <= MAX_SESSION_MS) {
      return { ...store, sessions: [...store.sessions.slice(0, -1), { ...last, end: new Date(endMs).toISOString() }] };
    }
    /* Déjà compté (deux onglets ouverts sur l'Étude) : rien à ajouter. */
    if (endMs <= lastEnd) return store;
    startMs = Math.max(startMs, lastEnd);
  }
  return {
    ...store,
    sessions: [...store.sessions, { id: newId(), start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() }],
  };
}

/**
 * Minutes d'étude par jour local, séance en cours comprise. Une séance à cheval
 * sur minuit est coupée en deux : chaque jour reçoit ce qui lui revient.
 */
export function minutesByDay(store: StudyStore, now: Date): Map<string, number> {
  const ms = new Map<string, number>();
  const spans = store.sessions.map(x => [Date.parse(x.start), Date.parse(x.end)]);
  if (store.running) {
    const start = Date.parse(store.running);
    spans.push([start, Math.min(now.getTime(), start + MAX_SESSION_MS)]);
  }
  for (const [a, b] of spans) {
    let cur = a;
    while (cur < b) {
      const d = new Date(cur);
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const stop = Math.min(b, midnight);
      const key = localDay(d);
      ms.set(key, (ms.get(key) || 0) + (stop - cur));
      cur = stop;
    }
  }
  const out = new Map<string, number>();
  for (const [k, v] of ms) out.set(k, v / 60000);
  return out;
}

export interface StudyWeek {
  today: number;
  week: number;
  /** Les 7 derniers jours, du plus ancien à aujourd'hui. */
  days: { day: string; minutes: number }[];
  /** Jours consécutifs avec au moins une minute d'étude. Aujourd'hui vide ne
   *  casse pas la série tant que la journée n'est pas finie : elle part
   *  d'hier, on a encore jusqu'à minuit pour la prolonger. */
  streak: number;
}

export function studyWeek(store: StudyStore, now: Date): StudyWeek {
  const byDay = minutesByDay(store, now);
  const at = (offset: number) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = at(6 - i);
    return { day, minutes: byDay.get(day) || 0 };
  });
  let streak = 0;
  let offset = (byDay.get(at(0)) || 0) >= 1 ? 0 : 1;
  while ((byDay.get(at(offset)) || 0) >= 1) { streak += 1; offset += 1; }
  return {
    today: byDay.get(at(0)) || 0,
    week: days.reduce((sum, d) => sum + d.minutes, 0),
    days,
    streak,
  };
}

/** « 3 min », « 1 h 05 ». */
export function fmtMinutes(min: number): string {
  const m = Math.floor(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** Mots du contenu, markdown retiré — l'échelle d'une note, pas sa date. */
export function wordCount(content: string): number {
  const text = stripStamps(content).replace(/[#>*_`~[\]()|-]/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}
