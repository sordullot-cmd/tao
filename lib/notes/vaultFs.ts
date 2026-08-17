/**
 * Interface d'accès au dossier du vault, indépendante du support.
 *
 * Deux implémentations derrière la même façade : les plugins natifs quand l'app
 * tourne en desktop (vaultFsTauri), la File System Access API sinon
 * (vaultFsWeb). Le moteur de synchro ne connaît que cette interface — ce qui
 * permet aussi de le tester sur un système de fichiers en mémoire.
 *
 * Tous les chemins sont RELATIFS au dossier choisi, séparés par `/`
 * (« note.md », « attachments/schema.svg ») ; chaque implémentation les traduit.
 */

import { isTauri } from "@/lib/notify";

export type VaultAccess = "granted" | "prompt" | "denied";

export interface VaultFs {
  /** Support utilisé — sert à expliquer la situation dans l'UI. */
  kind: "web" | "tauri" | "memory";
  /** Chemin (desktop) ou nom du dossier (navigateur), pour affichage. */
  label: string;
  /** Fichiers (pas les dossiers) contenus dans `dir`, non récursif. */
  list(dir?: string): Promise<string[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /** Date de modification en ms, ou `null` si indisponible. */
  mtime(path: string): Promise<number | null>;
  ensureDir(path: string): Promise<void>;
  /** État de l'autorisation d'accès (le navigateur peut la remettre à zéro). */
  access(): Promise<VaultAccess>;
  /** Redemande l'autorisation — nécessite un geste utilisateur côté web. */
  request(): Promise<boolean>;
}

export type VaultMode = "tauri" | "web" | "none";

const MODE_KEY = "tr4de_obsidian_vault_mode";

/** Comment ce poste peut accéder au disque. */
export function vaultMode(): VaultMode {
  if (typeof window === "undefined") return "none";
  // L'app desktop d'abord : dans sa WebView, `showDirectoryPicker` est absent ou
  // inopérant, alors que les plugins natifs sont toujours là.
  if (isTauri()) return "tauri";
  const w = window as unknown as { showDirectoryPicker?: unknown };
  if (typeof w.showDirectoryPicker === "function") return "web";
  return "none";
}

export function isVaultSupported(): boolean {
  return vaultMode() !== "none";
}

function rememberMode(mode: VaultMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function rememberedMode(): VaultMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "web" || v === "tauri" ? v : null;
  } catch {
    return null;
  }
}

/** Demande à l'utilisateur le dossier de notes du vault. */
export async function pickVault(): Promise<VaultFs | null> {
  const mode = vaultMode();
  if (mode === "tauri") {
    const { pickTauriVault } = await import("./vaultFsTauri");
    const fs = await pickTauriVault();
    if (fs) rememberMode("tauri");
    return fs;
  }
  if (mode === "web") {
    const { pickWebVault } = await import("./vaultFsWeb");
    const fs = await pickWebVault();
    if (fs) rememberMode("web");
    return fs;
  }
  return null;
}

/**
 * Reprend le dossier lié lors d'une session précédente. Le mode mémorisé passe
 * avant le mode courant : un même compte peut ouvrir l'app tantôt dans le
 * navigateur, tantôt en desktop, chacun avec son propre dossier lié.
 */
export async function restoreVault(): Promise<VaultFs | null> {
  const mode = rememberedMode() || vaultMode();
  if (mode === "tauri" && vaultMode() === "tauri") {
    const { restoreTauriVault } = await import("./vaultFsTauri");
    return restoreTauriVault();
  }
  if (mode === "web" && vaultMode() === "web") {
    const { restoreWebVault } = await import("./vaultFsWeb");
    return restoreWebVault();
  }
  return null;
}

/** Oublie le dossier lié (les fichiers déjà écrits restent dans le vault). */
export async function forgetVault(): Promise<void> {
  const mode = rememberedMode();
  if (mode === "tauri") {
    const { clearTauriVault } = await import("./vaultFsTauri");
    clearTauriVault();
  }
  if (mode === "web") {
    const { clearWebVault } = await import("./vaultFsWeb");
    await clearWebVault();
  }
  try {
    localStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
}
