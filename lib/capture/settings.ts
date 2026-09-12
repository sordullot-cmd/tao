"use client";

/**
 * Réglages d'enregistrement — LOCAUX à ce poste, et c'est le fond du sujet.
 *
 * Un dossier de destination, un écran, un périphérique audio : trois choses qui
 * ne décrivent QUE cette machine. Les faire suivre dans le compte par
 * `useCloudState` donnerait, sur l'autre poste, un chemin qui n'existe pas et un
 * micro qui n'y est pas branché — des réglages faux qui paraissent justes.
 *
 * D'où le même patron que le journal des captures : localStorage et un relais
 * pour que deux lecteurs de la même page s'accordent.
 */

export interface RecordSettings {
  /** Dossier de destination, choisi dans une fenêtre native. Vide = pas encore. */
  dir: string;
  /** Écran visé : 1 = principal. */
  display: number;
  /** `null` muet, "default" l'entrée par défaut, sinon l'id d'un périphérique. */
  audio: string | null;
  /** Marquer les clics dans la vidéo (`screencapture -k`). */
  showClicks: boolean;
}

export const RECORD_SETTINGS_KEY = "tr4de_record_settings";

export const DEFAULT_RECORD_SETTINGS: RecordSettings = {
  dir: "",
  display: 1,
  /* Muet par défaut. Le son passe par le micro et donc par une autorisation :
     l'activer sans que ce soit demandé ferait enregistrer la pièce à quelqu'un
     qui voulait seulement filmer son écran. */
  audio: null,
  showClicks: false,
};

export function normalizeRecordSettings(value: unknown): RecordSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_RECORD_SETTINGS };
  const o = value as Record<string, unknown>;
  const display = Number(o.display);
  return {
    dir: typeof o.dir === "string" ? o.dir : "",
    display: Number.isFinite(display) && display >= 1 ? Math.floor(display) : 1,
    audio: typeof o.audio === "string" && o.audio ? o.audio : null,
    showClicks: o.showClicks === true,
  };
}

export function readRecordSettings(): RecordSettings {
  try {
    return normalizeRecordSettings(JSON.parse(localStorage.getItem(RECORD_SETTINGS_KEY) || "null"));
  } catch {
    return { ...DEFAULT_RECORD_SETTINGS };
  }
}

const CHANGE_EVENT = "tr4de:record-settings";

export function writeRecordSettings(next: RecordSettings): RecordSettings {
  const clean = normalizeRecordSettings(next);
  try {
    localStorage.setItem(RECORD_SETTINGS_KEY, JSON.stringify(clean));
  } catch { /* quota : l'état en mémoire reste juste */ }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: clean }));
  } catch { /* pas de fenêtre (SSR) */ }
  return clean;
}

export function onRecordSettingsChange(fn: (s: RecordSettings) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as RecordSettings | undefined;
    if (detail) fn(detail);
  };
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/** Nom de fichier lisible ET accepté par le Rust (`[A-Za-z0-9_-]`). */
export function recordFileName(at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `tao-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`;
}
