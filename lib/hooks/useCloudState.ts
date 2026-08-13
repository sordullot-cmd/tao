"use client";

/**
 * useCloudState — hook générique pour persister un state JSON dans
 * Supabase (table user_productivity) avec fallback localStorage en cache rapide.
 *
 * - Au montage : lit localStorage (instantané) puis synchronise depuis Supabase.
 * - À chaque setValue : écrit localStorage immédiat + upsert Supabase debouncé.
 * - Écoute l'événement "focus" pour refetch après inactivité.
 * - Sans user connecté : fonctionne en localStorage uniquement.
 *
 * Le 3ᵉ élément retourné, `hydrated`, passe à `true` une fois la première
 * lecture Supabase terminée (immédiatement s'il n'y a pas d'utilisateur). Il
 * sert aux traitements DESTRUCTIFS (migrations qui suppriment des données) :
 * les lancer avant l'hydratation les ferait travailler sur la valeur par défaut.
 * Les usages simples continuent de déstructurer seulement `[value, setValue]`.
 */

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";

/* Relais entre les instances qui partagent une clé.
   Une modale et la page qui l'a ouverte appellent le hook chacune de son côté :
   ce sont deux états React distincts. Sans ce relais, la page n'apprenait un
   enregistrement qu'au prochain montage — un actif saisi restait invisible dans
   la liste, et paraissait donc perdu, alors qu'il était bien écrit. */
type Listener = (value: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

function broadcast(key: string, value: unknown, from: Listener): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const fn of set) if (fn !== from) fn(value);
}

export function useCloudState<T>(
  storageKey: string,
  cloudKey: string,
  defaultValue: T
): [T, (updater: T | ((prev: T) => T)) => void, boolean] {
  const { user } = useAuth();
  const supabase = createClient();

  const [value, setLocalValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved != null) {
        const parsed = JSON.parse(saved);
        if (parsed !== null && parsed !== undefined) return parsed as T;
      }
    } catch {}
    return defaultValue;
  });

  /* Valeur courante tenue HORS du cycle de rendu.
     `setValue` doit calculer la valeur suivante et la persister tout de suite.
     Tant que ce calcul vivait dans l'updater de `setLocalValue`, React ne
     l'exécutait qu'au rendu suivant — et il n'y en a pas quand l'appelant se
     démonte dans la foulée : une modale qui enregistre puis se ferme perdait
     toute la saisie, ni localStorage ni Supabase n'étant jamais atteints.

     Cette référence n'est JAMAIS resynchronisée depuis le rendu : deux
     écritures rapprochées doivent s'enchaîner (la seconde part du résultat de
     la première), là où une synchronisation après commit ferait ressurgir la
     valeur précédente. Elle n'est écrite qu'ici et à l'hydratation cloud. */
  const valueRef = useRef<T>(value);

  /* Réception d'une valeur écrite par une AUTRE instance de la même clé. Créée
     une seule fois : elle sert aussi de jeton pour ne pas se notifier soi-même. */
  const applyRemote = useRef<Listener | null>(null);
  if (applyRemote.current === null) {
    applyRemote.current = (v: unknown) => {
      valueRef.current = v as T;
      setLocalValue(v as T);
    };
  }

  useEffect(() => {
    const fn = applyRemote.current!;
    let set = listeners.get(storageKey);
    if (!set) { set = new Set(); listeners.set(storageKey, set); }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) listeners.delete(storageKey);
    };
  }, [storageKey]);

  // `hydrated` (ref) sert au flux interne ; `isHydrated` (state) est exposé aux
  // appelants qui doivent attendre la vraie valeur avant d'agir dessus.
  const [isHydrated, setIsHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);
  const dirty = useRef(false);
  const saving = useRef(false);

  // Fetch depuis Supabase au mount + sur focus
  useEffect(() => {
    if (!user?.id) { hydrated.current = true; setIsHydrated(true); return; }
    let cancelled = false;
    const fetchCloud = async () => {
      // Ne jamais écraser des modifications locales non encore persistées
      // (debounce en cours ou save en vol). Sinon un refetch sur focus peut
      // perdre les changements qui viennent juste d'être tapés.
      if (dirty.current || saving.current) return;
      try {
        const { data, error } = await supabase
          .from("user_productivity")
          .select("value")
          .eq("user_id", user.id)
          .eq("key", cloudKey)
          .maybeSingle();
        if (error) {
          if (!error.message?.includes("Could not find the table")) {
            console.warn(`[useCloudState:${cloudKey}] load error:`, error.message);
          }
          return;
        }
        if (cancelled) return;
        if (dirty.current || saving.current) return;
        if (data && data.value !== null && data.value !== undefined) {
          valueRef.current = data.value as T;
          setLocalValue(data.value as T);
          broadcast(storageKey, data.value, applyRemote.current!);
          try { localStorage.setItem(storageKey, JSON.stringify(data.value)); } catch {}
        }
      } catch (e: any) {
        console.warn(`[useCloudState:${cloudKey}] load failed:`, e?.message || e);
      } finally {
        if (!cancelled) { hydrated.current = true; setIsHydrated(true); }
      }
    };
    fetchCloud();
    const onFocus = () => fetchCloud();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, cloudKey]);

  // Persiste les changements (localStorage immédiat + Supabase debouncé 500ms)
  const setValue = (updater: T | ((prev: T) => T)) => {
    const next = typeof updater === "function" ? (updater as (p: T) => T)(valueRef.current) : updater;
    valueRef.current = next;
    setLocalValue(next);
    // Les autres instances de la même clé (la page qui a ouvert cette modale,
    // par exemple) doivent afficher la nouvelle valeur sans attendre un remontage.
    broadcast(storageKey, next, applyRemote.current!);

    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    if (user?.id) {
      dirty.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        saving.current = true;
        dirty.current = false;
        try {
          const { error } = await supabase
            .from("user_productivity")
            .upsert(
              { user_id: user.id, key: cloudKey, value: next, updated_at: new Date().toISOString() },
              { onConflict: "user_id,key" }
            );
          if (error && !error.message?.includes("Could not find the table")) {
            console.warn(`[useCloudState:${cloudKey}] save error:`, error.message);
          }
        } catch (e: any) {
          console.warn(`[useCloudState:${cloudKey}] save failed:`, e?.message || e);
        } finally {
          saving.current = false;
        }
      }, 500);
    }
  };

  return [value, setValue, isHydrated];
}
