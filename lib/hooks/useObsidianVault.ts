"use client";

/**
 * useObsidianVault — pilote la synchronisation des notes avec un dossier de
 * vault Obsidian.
 *
 * Le hook ne détient PAS les notes : il reçoit celles de la page (state cloud
 * partagé) et renvoie le tableau rapproché à enregistrer. Il gère en revanche
 * tout le reste : dossier lié, autorisation d'accès, index de synchro, cadence.
 *
 * Deux garde-fous importants :
 * - rien ne part avant `hydrated` : synchroniser sur la valeur par défaut d'un
 *   `useCloudState` non encore hydraté viderait le vault ;
 * - un seul passage à la fois (`running`), et si les notes ont changé pendant la
 *   passe, le résultat n'est pas appliqué — une autre passe est programmée. Sans
 *   cela, une frappe en cours de synchro serait écrasée par un instantané périmé.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type SyncIndex,
  type SyncReport,
  describeReport,
  emptyIndex,
  syncVault,
} from "@/lib/notes/obsidianSync";
import type { Note } from "@/lib/notes/markdown";
import {
  forgetVault,
  pickVault,
  restoreVault,
  vaultMode,
  type VaultFs,
  type VaultMode,
} from "@/lib/notes/vaultFs";

const INDEX_KEY = "tr4de_obsidian_index";
const AUTO_KEY = "tr4de_obsidian_autosync";
const LAST_KEY = "tr4de_obsidian_last_sync";

/** Cadence de fond : attrape les modifications faites dans Obsidian. */
const POLL_MS = 90_000;
/** Après une modification dans l'app, on laisse la frappe se poser. */
const DEBOUNCE_MS = 5_000;

export type VaultStatus = "unsupported" | "unlinked" | "linked" | "permission";

function loadIndex(): SyncIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.entries) return parsed as SyncIndex;
    }
  } catch {
    /* index illisible : on repart de zéro, les fichiers seront retrouvés par
       leur `tr4de-id` */
  }
  return emptyIndex();
}

function saveIndex(index: SyncIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* ignore */
  }
}

interface UseObsidianVaultArgs {
  notes: Note[];
  setNotes: (updater: Note[] | ((prev: Note[]) => Note[])) => void;
  /** `true` quand la vraie valeur des notes est chargée (cf. useCloudState). */
  hydrated: boolean;
}

export interface ObsidianVaultApi {
  status: VaultStatus;
  mode: VaultMode;
  /** Chemin (desktop) ou nom (navigateur) du dossier lié. */
  label: string | null;
  syncing: boolean;
  /** Horodatage de la dernière passe réussie, en ms. */
  lastSync: number | null;
  /** Résumé de la dernière passe. */
  summary: string | null;
  error: string | null;
  conflicts: string[];
  autoSync: boolean;
  setAutoSync: (on: boolean) => void;
  link: () => Promise<void>;
  unlink: () => Promise<void>;
  reconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
}

export function useObsidianVault({ notes, setNotes, hydrated }: UseObsidianVaultArgs): ObsidianVaultApi {
  const [mode, setMode] = useState<VaultMode>("none");
  const [status, setStatus] = useState<VaultStatus>("unsupported");
  const [label, setLabel] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [autoSync, setAutoSyncState] = useState(true);

  const fsRef = useRef<VaultFs | null>(null);
  const indexRef = useRef<SyncIndex>(emptyIndex());
  const notesRef = useRef<Note[]>(notes);
  const hydratedRef = useRef(hydrated);
  /* `setNotes` de useCloudState est recréé à chaque rendu : le garder en ref
     donne une identité stable à `runSync`, dont les minuteries et l'écouteur de
     focus capturent la référence au moment où ils sont posés. */
  const setNotesRef = useRef(setNotes);
  const running = useRef(false);
  const pending = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  notesRef.current = notes;
  hydratedRef.current = hydrated;
  setNotesRef.current = setNotes;

  // -------------------------------------------------- reprise du dossier lié
  useEffect(() => {
    let cancelled = false;
    setMode(vaultMode());
    indexRef.current = loadIndex();
    try {
      const raw = localStorage.getItem(AUTO_KEY);
      if (raw != null) setAutoSyncState(raw !== "0");
      const last = localStorage.getItem(LAST_KEY);
      if (last) setLastSync(Number(last) || null);
    } catch {
      /* ignore */
    }
    if (vaultMode() === "none") {
      setStatus("unsupported");
      return;
    }
    setStatus("unlinked");
    (async () => {
      const fs = await restoreVault();
      if (cancelled || !fs) return;
      fsRef.current = fs;
      setLabel(fs.label);
      setStatus((await fs.access()) === "granted" ? "linked" : "permission");
    })();
    return () => { cancelled = true; };
  }, []);

  // ------------------------------------------------------------- une passe
  const runSync = useCallback(async (): Promise<void> => {
    const fs = fsRef.current;
    if (!fs || !hydratedRef.current) return;
    if (running.current) { pending.current = true; return; }
    if ((await fs.access()) !== "granted") { setStatus("permission"); return; }

    running.current = true;
    setSyncing(true);
    setError(null);
    const snapshot = notesRef.current;
    try {
      const result = await syncVault(fs, snapshot, indexRef.current);
      indexRef.current = result.index;
      saveIndex(result.index);
      if (result.changed) {
        // Les notes ont bougé pendant la passe (frappe en cours) : appliquer
        // l'instantané rapproché écraserait la saisie. On refait un tour.
        if (notesRef.current === snapshot) setNotesRef.current(result.notes);
        else pending.current = true;
      }
      setStatus("linked");
      setSummary(describeReport(result.report));
      setConflicts(result.report.conflicts);
      const stamp = Date.now();
      setLastSync(stamp);
      try { localStorage.setItem(LAST_KEY, String(stamp)); } catch {}
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Synchronisation impossible.");
    } finally {
      running.current = false;
      setSyncing(false);
      if (pending.current) {
        pending.current = false;
        setTimeout(() => { void runSync(); }, 800);
      }
    }
  }, []);

  // ---------------------------------------------------------------- cadence
  // Première passe dès que le dossier est prêt et les notes hydratées.
  useEffect(() => {
    if (status !== "linked" || !hydrated || !autoSync) return;
    void runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hydrated, autoSync]);

  // Modification dans l'app : on pousse après une pause de frappe.
  useEffect(() => {
    if (status !== "linked" || !hydrated || !autoSync) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { void runSync(); }, DEBOUNCE_MS);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, status, hydrated, autoSync]);

  // Modification dans Obsidian : ni l'API navigateur ni le plugin Tauri ne
  // notifient les changements, donc on repasse régulièrement et au retour sur
  // la fenêtre (le cas le plus fréquent : on quitte Obsidian pour l'app).
  useEffect(() => {
    if (status !== "linked" || !autoSync) return;
    const tick = () => { if (!document.hidden) void runSync(); };
    const timer = setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoSync]);

  // ------------------------------------------------------------------- API
  const setAutoSync = useCallback((on: boolean) => {
    setAutoSyncState(on);
    try { localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch {}
  }, []);

  const link = useCallback(async () => {
    setError(null);
    try {
      const fs = await pickVault();
      if (!fs) return;
      fsRef.current = fs;
      setLabel(fs.label);
      setStatus("linked");
      await runSync();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Dossier inaccessible.");
    }
  }, [runSync]);

  const reconnect = useCallback(async () => {
    const fs = fsRef.current;
    if (!fs) return;
    const ok = await fs.request();
    if (!ok) { setError("Accès au dossier refusé."); return; }
    setStatus("linked");
    await runSync();
  }, [runSync]);

  const unlink = useCallback(async () => {
    await forgetVault();
    fsRef.current = null;
    indexRef.current = emptyIndex();
    try {
      localStorage.removeItem(INDEX_KEY);
      localStorage.removeItem(LAST_KEY);
    } catch {}
    setLabel(null);
    setStatus(vaultMode() === "none" ? "unsupported" : "unlinked");
    setSummary(null);
    setConflicts([]);
    setLastSync(null);
    setError(null);
  }, []);

  const syncNow = useCallback(async () => {
    if (status === "permission") { await reconnect(); return; }
    await runSync();
  }, [status, reconnect, runSync]);

  return {
    status, mode, label, syncing, lastSync, summary, error, conflicts,
    autoSync, setAutoSync, link, unlink, reconnect, syncNow,
  };
}

export type { SyncReport };
