/**
 * Accès au dossier du vault dans un navigateur, via la File System Access API.
 *
 * Le handle du dossier est conservé dans IndexedDB (et non localStorage : un
 * handle est un objet structuré, `JSON.stringify` le viderait) pour ne demander
 * le dossier qu'UNE fois. Au retour sur l'app, l'autorisation peut être
 * retombée sur « prompt » : elle ne se redemande que sur un geste utilisateur,
 * d'où `access()` / `request()` exposés séparément — le panneau de synchro
 * affiche alors un bouton « Reconnecter ».
 *
 * Disponible sur Chrome / Edge ; Firefox et Safari n'implémentent pas
 * `showDirectoryPicker` (l'app propose alors l'app desktop, cf. vaultFsTauri).
 */

import type { VaultFs, VaultAccess } from "./vaultFs";

/** État d'une autorisation — `PermissionState` de lib.dom, réécrit ici pour
 *  rester lisible par le lint (qui ne connaît que les globales d'exécution). */
type PermState = "granted" | "denied" | "prompt";

interface FsHandle {
  kind: "file" | "directory";
  name: string;
  queryPermission?: (o: { mode: string }) => Promise<PermState>;
  requestPermission?: (o: { mode: string }) => Promise<PermState>;
}

interface FsFileHandle extends FsHandle {
  getFile: () => Promise<File>;
  createWritable: (o?: { keepExistingData?: boolean }) => Promise<{
    write: (data: Blob | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface FsDirHandle extends FsHandle {
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<FsFileHandle>;
  getDirectoryHandle: (name: string, o?: { create?: boolean }) => Promise<FsDirHandle>;
  removeEntry: (name: string, o?: { recursive?: boolean }) => Promise<void>;
  values: () => AsyncIterable<FsHandle>;
}

const DB_NAME = "tr4de-vault";
const STORE = "handles";
const KEY = "notesDir";

interface PickerWindow {
  showDirectoryPicker?: (o: { id?: string; mode?: string; startIn?: string }) => Promise<FsDirHandle>;
}

function picker(): PickerWindow["showDirectoryPicker"] | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as PickerWindow).showDirectoryPicker;
}

export function isWebVaultSupported(): boolean {
  return typeof picker() === "function";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: "readonly" | "readwrite", run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

async function loadHandle(): Promise<FsDirHandle | null> {
  try {
    return ((await tx("readonly", (s) => s.get(KEY))) as FsDirHandle) || null;
  } catch {
    return null;
  }
}

async function saveHandle(handle: FsDirHandle): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put(handle, KEY) as unknown as IDBRequest<void>);
  } catch {
    /* mode privé, quota… : le dossier sera à redemander au prochain lancement */
  }
}

export async function clearWebVault(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(KEY) as unknown as IDBRequest<void>);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ adapteur

function splitPath(path: string): { parts: string[]; name: string } {
  const segs = path.split("/").filter(Boolean);
  return { parts: segs.slice(0, -1), name: segs[segs.length - 1] || "" };
}

function makeFs(root: FsDirHandle): VaultFs {
  const dirFor = async (parts: string[], create: boolean): Promise<FsDirHandle | null> => {
    let cur = root;
    for (const p of parts) {
      try {
        cur = await cur.getDirectoryHandle(p, { create });
      } catch {
        return null;
      }
    }
    return cur;
  };

  const fileFor = async (path: string, create: boolean): Promise<FsFileHandle | null> => {
    const { parts, name } = splitPath(path);
    const dir = await dirFor(parts, create);
    if (!dir || !name) return null;
    try {
      return await dir.getFileHandle(name, { create });
    } catch {
      return null;
    }
  };

  return {
    kind: "web",
    label: root.name,

    async list(dir = "") {
      const handle = await dirFor(dir.split("/").filter(Boolean), false);
      if (!handle) return [];
      const out: string[] = [];
      for await (const entry of handle.values()) {
        if (entry.kind === "file") out.push(entry.name);
      }
      return out;
    },

    async readText(path) {
      const file = await fileFor(path, false);
      if (!file) throw new Error(`Fichier introuvable : ${path}`);
      return (await file.getFile()).text();
    },

    async writeText(path, text) {
      const file = await fileFor(path, true);
      if (!file) throw new Error(`Écriture impossible : ${path}`);
      const w = await file.createWritable();
      await w.write(text);
      await w.close();
    },

    async writeBytes(path, bytes) {
      const file = await fileFor(path, true);
      if (!file) throw new Error(`Écriture impossible : ${path}`);
      const w = await file.createWritable();
      // Copie dans un Blob : certains handles refusent une vue Uint8Array
      // adossée à un ArrayBuffer partagé.
      await w.write(new Blob([bytes.slice().buffer as ArrayBuffer]));
      await w.close();
    },

    async remove(path) {
      const { parts, name } = splitPath(path);
      const dir = await dirFor(parts, false);
      if (!dir || !name) return;
      try {
        await dir.removeEntry(name);
      } catch {
        /* déjà absent */
      }
    },

    async mtime(path) {
      const file = await fileFor(path, false);
      if (!file) return null;
      try {
        return (await file.getFile()).lastModified;
      } catch {
        return null;
      }
    },

    async ensureDir(path) {
      await dirFor(path.split("/").filter(Boolean), true);
    },

    async access(): Promise<VaultAccess> {
      if (!root.queryPermission) return "granted";
      try {
        const state = await root.queryPermission({ mode: "readwrite" });
        return state === "granted" ? "granted" : state === "denied" ? "denied" : "prompt";
      } catch {
        return "denied";
      }
    },

    async request() {
      if (!root.requestPermission) return true;
      try {
        return (await root.requestPermission({ mode: "readwrite" })) === "granted";
      } catch {
        return false;
      }
    },
  };
}

/** Ouvre le sélecteur de dossier et mémorise le choix. */
export async function pickWebVault(): Promise<VaultFs | null> {
  const show = picker();
  if (!show) return null;
  let handle: FsDirHandle;
  try {
    handle = await show({ id: "tr4de-obsidian", mode: "readwrite", startIn: "documents" });
  } catch {
    return null; // l'utilisateur a annulé
  }
  if (handle.requestPermission) {
    const state = await handle.requestPermission({ mode: "readwrite" });
    if (state !== "granted") return null;
  }
  await saveHandle(handle);
  return makeFs(handle);
}

/** Reprend le dossier déjà choisi lors d'une session précédente. */
export async function restoreWebVault(): Promise<VaultFs | null> {
  const handle = await loadHandle();
  if (!handle) return null;
  return makeFs(handle);
}
