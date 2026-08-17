/**
 * Accès au dossier du vault dans l'app desktop (Tauri).
 *
 * La File System Access API n'est pas une option ici : la fenêtre desktop
 * charge le site distant, et l'API n'est pas exposée dans cette WebView. On
 * passe donc par les plugins natifs `dialog` (choix du dossier) et `fs`
 * (lecture / écriture).
 *
 * Le plugin `fs` refuse par défaut tout chemin hors des dossiers déclarés dans
 * les capabilities. Un vault vit n'importe où sur le disque, donc le chemin
 * choisi est autorisé au RUNTIME par la commande Rust `allow_vault_dir`
 * (cf. src-tauri/src/lib.rs), rappelée à chaque reprise du dossier mémorisé —
 * l'autorisation runtime ne survit pas au redémarrage de l'app.
 *
 * Les imports des plugins sont paresseux : ce module est aussi chargé côté
 * navigateur (le sélecteur de mode dans vaultFs.ts) et les bundles Tauri n'y
 * ont rien à faire.
 */

import type { VaultFs, VaultAccess } from "./vaultFs";
import { isTauri } from "@/lib/notify";

const PATH_KEY = "tr4de_obsidian_vault_path";

export function isTauriVaultSupported(): boolean {
  return isTauri();
}

function sep(base: string): string {
  return base.includes("\\") && !base.includes("/") ? "\\" : "/";
}

function join(base: string, rel: string): string {
  const s = sep(base);
  const tail = rel.split("/").filter(Boolean).join(s);
  if (!tail) return base;
  return base.endsWith(s) ? base + tail : base + s + tail;
}

/** Autorise le dossier auprès du scope `fs` du process Rust. */
async function grantScope(path: string): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("allow_vault_dir", { path });
  } catch (e) {
    // Version de l'app desktop antérieure à cette commande : les écritures
    // échoueront avec « forbidden path », message relayé tel quel à l'UI.
    console.warn("[vault] scope fs non accordé:", e);
  }
}

function makeFs(base: string): VaultFs {
  const fs = () => import("@tauri-apps/plugin-fs");

  return {
    kind: "tauri",
    label: base,

    async list(dir = "") {
      const { readDir } = await fs();
      try {
        const entries = await readDir(join(base, dir));
        return entries.filter((e) => e.isFile).map((e) => e.name);
      } catch {
        return [];
      }
    },

    async readText(path) {
      const { readTextFile } = await fs();
      return readTextFile(join(base, path));
    },

    async writeText(path, text) {
      const { writeTextFile } = await fs();
      await writeTextFile(join(base, path), text);
    },

    async writeBytes(path, bytes) {
      const { writeFile } = await fs();
      await writeFile(join(base, path), bytes);
    },

    async remove(path) {
      const { remove } = await fs();
      try {
        await remove(join(base, path));
      } catch {
        /* déjà absent */
      }
    },

    async mtime(path) {
      const { stat } = await fs();
      try {
        const info = await stat(join(base, path));
        return info.mtime ? new Date(info.mtime).getTime() : null;
      } catch {
        return null;
      }
    },

    async ensureDir(path) {
      const { mkdir } = await fs();
      try {
        await mkdir(join(base, path), { recursive: true });
      } catch {
        /* existe déjà */
      }
    },

    async access(): Promise<VaultAccess> {
      const { exists } = await fs();
      try {
        return (await exists(base)) ? "granted" : "denied";
      } catch {
        return "denied";
      }
    },

    async request() {
      await grantScope(base);
      return (await this.access()) === "granted";
    },
  };
}

/** Ouvre le sélecteur de dossier natif et mémorise le chemin. */
export async function pickTauriVault(): Promise<VaultFs | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Choisis le dossier de notes dans ton vault Obsidian",
  });
  const path = Array.isArray(picked) ? picked[0] : picked;
  if (!path) return null;
  await grantScope(path);
  try {
    localStorage.setItem(PATH_KEY, path);
  } catch {
    /* ignore */
  }
  return makeFs(path);
}

/** Reprend le dossier mémorisé et réautorise son accès. */
export async function restoreTauriVault(): Promise<VaultFs | null> {
  if (!isTauri()) return null;
  let path: string | null = null;
  try {
    path = localStorage.getItem(PATH_KEY);
  } catch {
    /* ignore */
  }
  if (!path) return null;
  await grantScope(path);
  return makeFs(path);
}

export function clearTauriVault(): void {
  try {
    localStorage.removeItem(PATH_KEY);
  } catch {
    /* ignore */
  }
}
