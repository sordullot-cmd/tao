"use client";

/**
 * useCloudState — hook générique pour persister un state JSON dans
 * Supabase (table user_productivity) avec fallback localStorage en cache rapide.
 *
 * - Au montage : lit localStorage (instantané) puis synchronise depuis Supabase.
 * - À chaque setValue : écrit localStorage immédiat + upsert Supabase debouncé.
 * - Écoute l'événement "focus" pour refetch après inactivité.
 *
 * ── HORS LIGNE ────────────────────────────────────────────────────────────
 * Une écriture qui n'atteint pas Supabase n'est pas perdue : elle reste en
 * ATTENTE, dans localStorage, sous la clé `<storageKey>:pending`. Trois choses
 * en découlent, et les trois comptent :
 *
 *   1. L'attente survit au rechargement et à la fermeture de l'app. Une session
 *      de travail entière sans réseau se retrouve intacte au retour.
 *   2. Tant qu'une écriture attend, la lecture cloud NE REMPLACE PLUS la valeur
 *      locale. C'était le vrai danger d'avant : l'échec était avalé dans un
 *      `console.warn`, le drapeau « modifié » retombait, et le premier refetch
 *      au retour du réseau écrasait le travail hors ligne par la version
 *      périmée du serveur. Silencieusement.
 *   3. La reprise est tentée au retour de la connexion (`online`), au retour sur
 *      la fenêtre (`focus`) et au montage suivant.
 *
 * Ce qui n'est PAS traité : deux appareils qui modifient la même clé chacun de
 * leur côté pendant une coupure. Le dernier à se reconnecter gagne. Un vrai
 * fusionnement demanderait un horodatage par champ, donc un autre magasin — et
 * la coupure réseau d'un poste de travail dure des heures, pas des jours.
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

/** Où dort une écriture qui n'a pas pu partir. */
function pendingKey(storageKey: string): string {
  return `${storageKey}:pending`;
}

function readPending<T>(storageKey: string): T | undefined {
  try {
    const raw = localStorage.getItem(pendingKey(storageKey));
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function writePending(storageKey: string, value: unknown): void {
  try { localStorage.setItem(pendingKey(storageKey), JSON.stringify(value)); } catch {}
}

function clearPending(storageKey: string): void {
  try { localStorage.removeItem(pendingKey(storageKey)); } catch {}
}

/** Vrai quand le navigateur se sait hors ligne. Absent côté serveur, et faux
 *  négatif possible (réseau branché mais sans route) : ce n'est qu'un raccourci
 *  pour ne pas tenter une requête vouée à échouer. L'échec, lui, est toujours
 *  traité. */
function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

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
      /* L'attente est posée AVANT la tentative, pas après son échec : entre les
         deux il y a une fermeture d'app possible, et c'est exactement le moment
         où l'on perd une saisie. */
      writePending(storageKey, next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void flush(next); }, 500);
    }
  };

  /**
   * Tente d'envoyer `next` à Supabase. Ne jette jamais.
   *
   * Le drapeau `dirty` ne retombe QUE sur un succès. C'est lui qui interdit à la
   * lecture cloud de remplacer la valeur locale : tant qu'une écriture attend,
   * la version du serveur est la périmée des deux.
   */
  const flush = async (next: T): Promise<boolean> => {
    if (!user?.id) return false;
    if (offline()) return false;
    saving.current = true;
    try {
      const { error } = await supabase
        .from("user_productivity")
        .upsert(
          { user_id: user.id, key: cloudKey, value: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
      if (error) {
        /* Table absente : ce n'est pas une panne de réseau, c'est un schéma qui
           n'existe pas. Retenir l'écriture n'y changerait rien et bloquerait
           toute lecture cloud pour toujours — on abandonne, comme avant. */
        if (error.message?.includes("Could not find the table")) {
          clearPending(storageKey);
          dirty.current = false;
          return false;
        }
        console.warn(`[useCloudState:${cloudKey}] save error:`, error.message);
        return false;
      }
      clearPending(storageKey);
      dirty.current = false;
      return true;
    } catch (e) {
      console.warn(`[useCloudState:${cloudKey}] save failed:`, e instanceof Error ? e.message : e);
      return false;
    } finally {
      saving.current = false;
    }
  };

  /* Reprise des écritures restées en attente — au retour de la connexion, au
     retour sur la fenêtre, et au montage. Les trois, parce qu'aucun des trois
     ne couvre les deux autres : `online` manque le cas d'une app relancée après
     la coupure, `focus` celui d'une fenêtre restée au premier plan, et le
     montage celui d'une session qui dure. */
  useEffect(() => {
    if (!user?.id) return;
    const retry = () => {
      const waiting = readPending<T>(storageKey);
      if (waiting === undefined) return;
      dirty.current = true;
      valueRef.current = waiting;
      void flush(waiting);
    };
    retry();
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, cloudKey, storageKey]);

  return [value, setValue, isHydrated];
}
