"use client";

/**
 * Le popover de la barre d'état — le pont vers la coquille.
 *
 * Même contrat que `lib/capture/native.ts`, `lib/focus/native.ts` et
 * `lib/activity/native.ts` : hors de l'app de bureau, rien ne jette. Les
 * fonctions rendent un état vide, et la page `/tray` dit alors ce qu'elle est
 * au lieu d'afficher un panneau mort.
 *
 * Cette frontière n'est pas qu'une convention recopiée. Le popover est une
 * SECONDE webview, dont tout le contenu arrive par des événements : sans module
 * de bord, chaque appel serait un `import("@tauri-apps/api/…")` au milieu du
 * rendu, impossible à remplacer dans un test — et une page qu'on ne peut pas
 * éprouver est une page dont on ne saura pas qu'elle a cessé de fonctionner.
 *
 * ── LE SENS DE CIRCULATION ────────────────────────────────────────────────
 *
 * Le popover LIT par `trayState` / `onTrayState`, et AGIT en émettant — jamais
 * en écrivant. La fenêtre principale reçoit, tranche, écrit, puis repousse
 * (cf. components/TrayBridge.jsx). Les événements sont ceux que le menu natif
 * émettait déjà : le chemin était éprouvé avant d'être réemprunté.
 */

import { isTauri } from "@/lib/notify";

export interface TrayEntry {
  id: string;
  label: string;
  done: boolean;
}

export interface TrayList {
  id: string;
  name: string;
  active: boolean;
}

/** Ce que la coquille tient à afficher, dans la forme que le Rust sérialise. */
export interface TrayState {
  title: string;
  items: TrayEntry[];
  lists: TrayList[];
  recording: boolean;
}

export const EMPTY_TRAY_STATE: TrayState = {
  title: "",
  items: [],
  lists: [],
  recording: false,
};

/* Les événements. Les quatre premiers existaient pour le menu natif ; le
   dernier est né avec le popover, qui est la première surface où l'on puisse
   écrire. */
export const TRAY_TOGGLE = "tray-checklist-toggle";
export const TRAY_SELECT = "tray-routine-select";
export const TRAY_CAPTURE = "tray-capture-request";
export const TRAY_RECORD = "tray-record-toggle";
export const TRAY_JOURNAL = "tray-journal-append";
export const TRAY_STATE = "tray-checklist-state";

async function core() {
  return import("@tauri-apps/api/core");
}

async function events() {
  return import("@tauri-apps/api/event");
}

/** L'état déjà poussé, pour se peindre dès le montage. */
export async function trayState(): Promise<TrayState> {
  if (!isTauri()) return EMPTY_TRAY_STATE;
  try {
    const { invoke } = await core();
    return await invoke<TrayState>("tray_get_checklist");
  } catch (e) {
    console.warn("[tray] état illisible", e);
    return EMPTY_TRAY_STATE;
  }
}

/**
 * S'abonne aux poussées suivantes. Rend de quoi se désabonner — y compris
 * quand le montage a été défait avant que l'abonnement ne soit posé, cas
 * banal d'un popover qu'on referme aussitôt ouvert.
 */
export function onTrayState(cb: (state: TrayState) => void): () => void {
  if (!isTauri()) return () => {};
  let dropped = false;
  let unlisten: (() => void) | null = null;
  events()
    .then(({ listen }) => listen<TrayState>(TRAY_STATE, e => {
      if (e?.payload) cb(e.payload);
    }))
    .then(fn => { if (dropped) fn(); else unlisten = fn; })
    .catch(e => console.warn("[tray] écoute de l'état impossible", e));
  return () => { dropped = true; if (unlisten) unlisten(); };
}

/** Émet vers la fenêtre principale, qui décidera. */
export async function trayEmit(event: string, payload?: unknown): Promise<void> {
  if (!isTauri()) return;
  try {
    const { emit } = await events();
    await emit(event, payload);
  } catch (e) {
    console.warn("[tray] émission impossible", event, e);
  }
}

/** Ajuste la hauteur de la fenêtre à ce que la page occupe réellement. */
export async function trayResize(height: number): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await core();
    await invoke("tray_popover_resize", { height });
  } catch (e) {
    console.warn("[tray] redimensionnement impossible", e);
  }
}

async function command(name: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await core();
    await invoke(name);
  } catch (e) {
    console.warn("[tray] commande impossible", name, e);
  }
}

export const trayClose = () => command("tray_popover_close");
export const trayOpenMain = () => command("tray_open_main");
export const trayQuit = () => command("tray_quit");
