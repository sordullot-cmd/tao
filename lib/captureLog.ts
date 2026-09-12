"use client";

/**
 * Journal des captures — ce qui a été pris, quand, et où c'est posé.
 *
 * POURQUOI PAS `useCloudState`. Une capture est un FICHIER sur CE disque. Faire
 * suivre la fiche dans le compte donnerait, sur le téléphone et sur l'autre
 * poste, une liste d'images dont aucune n'est ouvrable — un journal qui promet
 * ce qu'il ne peut pas montrer. Le local est donc ici la bonne portée, et non
 * un pis-aller : la fiche vit là où vit l'image.
 *
 * Rangé par jour, comme la routine (cf. lib/routineChecklist) et pour la même
 * raison : le journal d'une session relit une PLAGE d'horaires, et une clé par
 * jour évite de charger l'historique entier pour afficher l'après-midi.
 *
 * L'identifiant d'une prise est son horodatage en millisecondes, en base 36. Il
 * sert à la fois de nom de fichier et de clé de tri — deux besoins, une seule
 * valeur, et rien à réconcilier. La collision demanderait deux captures dans la
 * même milliseconde.
 */

import { getLocalDateString } from "@/lib/dateUtils";

export interface CaptureEntry {
  /** Identifiant ET nom de fichier (sans extension). */
  id: string;
  /** Prise de vue (ms epoch). */
  at: number;
  /** Chemin absolu sur ce poste. `null` si la prise a échoué. */
  path: string | null;
  bytes: number;
  /** Application au premier plan au moment de la prise, si on la connaît. */
  app?: string;
  /** Titre de la fenêtre active — souvent l'instrument et l'unité de temps. */
  title?: string;
  /** Ce qui a déclenché la prise : le menu, une session, l'utilisateur. */
  source: "tray" | "session" | "manual";
  /** Renseigné quand la prise a échoué : la cause, telle quelle. */
  error?: string | null;
}

export const CAPTURE_LOG_PREFIX = "tr4de_captures_";

/* Un identifiant est aussi un nom de fichier, et le Rust refuse tout ce qui
   sort de `[A-Za-z0-9_-]`. La base 36 n'en sort jamais. */
export function newCaptureId(at: number = Date.now()): string {
  return at.toString(36);
}

export function captureLogKey(date: string = getLocalDateString()): string {
  return `${CAPTURE_LOG_PREFIX}${date}`;
}

export function readCaptureLog(date?: string): CaptureEntry[] {
  try {
    const raw = localStorage.getItem(captureLogKey(date));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as CaptureEntry[]) : [];
  } catch {
    return [];
  }
}

const CHANGE_EVENT = "tr4de:captures";

function write(entries: CaptureEntry[], date?: string): CaptureEntry[] {
  try {
    localStorage.setItem(captureLogKey(date), JSON.stringify(entries));
  } catch { /* quota : l'état en mémoire reste juste */ }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
      detail: { date: date ?? getLocalDateString(), entries },
    }));
  } catch { /* pas de fenêtre (SSR) */ }
  return entries;
}

/** Ajoute une prise au journal du jour et rend le journal complet. */
export function appendCapture(entry: CaptureEntry, date?: string): CaptureEntry[] {
  /* Tri à l'insertion plutôt qu'à la lecture : le journal est lu bien plus
     souvent qu'il n'est écrit, et une prise arrive presque toujours en dernier
     — le tri ne coûte donc rien ici. */
  const next = [...readCaptureLog(date), entry].sort((a, b) => a.at - b.at);
  return write(next, date);
}

/** Retire une prise (l'image, elle, reste sur le disque). */
export function forgetCapture(id: string, date?: string): CaptureEntry[] {
  const current = readCaptureLog(date);
  const next = current.filter(e => e.id !== id);
  return next.length === current.length ? current : write(next, date);
}

/** Les prises d'une plage horaire — ce que lira le journal d'une session. */
export function capturesBetween(from: number, to: number, date?: string): CaptureEntry[] {
  return readCaptureLog(date).filter(e => e.at >= from && e.at <= to);
}

export function onCaptureLogChange(
  fn: (entries: CaptureEntry[], date: string) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { date: string; entries: CaptureEntry[] } | undefined;
    if (detail) fn(detail.entries, detail.date);
  };
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
