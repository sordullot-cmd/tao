"use client";

/**
 * Le magasin de la page Focus, partagé par tout ce qui en dépend.
 *
 * Les clés vivaient dans `FocusPage`, seule à lire le magasin. Elles n'y sont
 * plus : la surveillance (blocage, programmes) tourne désormais dans la coquille
 * de l'app, hors de la page, et deux endroits qui liraient des clés recopiées
 * finiraient par en oublier une. Une seule source, donc, et une seule
 * normalisation.
 *
 * Deux composants qui appellent ce hook partagent bien le même état :
 * `useCloudState` relaie les écritures entre ses instances (cf. son `broadcast`).
 * Rien à synchroniser à la main.
 */

import { useCallback, useMemo } from "react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { emptyStore, normalizeStore, type FocusStore } from "./model";

const STORAGE_KEY = "tr4de_focus_block";
const CLOUD_KEY = "focus_blocker";

export function useFocusStore(): [FocusStore, (u: FocusStore | ((p: FocusStore) => FocusStore)) => void] {
  const [raw, setRaw] = useCloudState<FocusStore>(STORAGE_KEY, CLOUD_KEY, emptyStore());

  /* Le magasin lu du stockage peut venir d'une version antérieure : on le
     complète à la lecture plutôt qu'en écrivant une migration. */
  const store = useMemo(() => normalizeStore(raw), [raw]);

  const setStore = useCallback((updater: FocusStore | ((p: FocusStore) => FocusStore)) => {
    setRaw(prev => {
      const base = normalizeStore(prev);
      return typeof updater === "function" ? updater(base) : updater;
    });
  }, [setRaw]);

  return [store, setStore];
}
