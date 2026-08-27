"use client";

import { useState } from "react";
import { showSkeleton } from "@/lib/ui/skeletonPreview";

/**
 * useFirstLoad — « faut-il montrer un squelette ? » pour un écran adossé à
 * `useCloudState`.
 *
 * Le piège de ces écrans est qu'ils ont DEUX sources : localStorage, qui répond
 * dans la frame, et Supabase, qui répond en quelques centaines de millisecondes.
 * Brancher le squelette sur le seul `hydrated` du hook le ferait donc apparaître
 * à CHAQUE visite, y compris quand le contenu est déjà là, prêt à peindre —
 * on remplacerait des données réelles par des barres grises. C'est un
 * ralentissement perçu, pas un chargement.
 *
 * Le squelette n'a lieu d'être que dans le cas inverse : rien en cache, donc
 * rien à peindre, donc l'écran afficherait son état vide (« Aucune note ») avant
 * de se remplir — le faux message qu'on cherche justement à éviter.
 *
 * D'où la condition : aucune clé en cache AU MONTAGE, et hydratation non
 * terminée. La lecture est figée dans l'initialiseur de `useState` — la relire
 * à chaque rendu ferait basculer la réponse dès la première écriture locale,
 * et le squelette disparaîtrait au milieu du chargement.
 *
 *   const [store, setStore, hydrated] = useCloudState(KEY, CLOUD_KEY, DEFAULT);
 *   if (useFirstLoad(hydrated, KEY)) return <PageSkeleton variant="list" />;
 *
 * ⚠️ Comme tout hook, l'appel doit précéder tout `return` conditionnel.
 */
export function useFirstLoad(hydrated: boolean, ...storageKeys: string[]): boolean {
  const [coldStart] = useState(() => {
    if (typeof window === "undefined") return false;
    return storageKeys.every(key => {
      try {
        return localStorage.getItem(key) == null;
      } catch {
        /* Stockage refusé (navigation privée, cookies bloqués) : on ne peut
           rien affirmer sur le cache, et un squelette permanent serait pire
           qu'un état vide fugace. */
        return false;
      }
    });
  });
  return showSkeleton(coldStart && !hydrated);
}
