"use client";

/**
 * useAccentSetting — la teinte de marque, rangée sur le COMPTE.
 *
 * `lib/ui/accent.ts` sait appliquer un couple de teintes et le garder en
 * localStorage ; ce hook lui ajoute le seul étage qui manquait : la valeur de
 * référence vit dans `user_productivity`, donc elle suit l'utilisateur d'un
 * appareil à l'autre au lieu de rester sur le navigateur qui l'a choisie.
 *
 * Deux instances (les Réglages qui écrivent, la coquille qui applique) partagent
 * la clé : `useCloudState` relaie entre elles, un changement fait dans les
 * Réglages repeint l'app immédiatement.
 *
 * MONTER LE HOOK DANS LA COQUILLE, pas seulement dans la page Réglages : seule
 * la page courante est montée, et la teinte doit être relue au démarrage même
 * quand on n'ouvre jamais les Réglages.
 */

import { useEffect, useRef, useState } from "react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import {
  ACCENT_CLOUD_KEY, ACCENT_STATE_KEY,
  applyAccent, isDefaultAccent, normalizeAccent, readAccent,
} from "@/lib/ui/accent";

/** Marque « la teinte de cet appareil a déjà été proposée au compte ». */
const SEEDED_KEY = "tr4de_accent_seeded";

export function useAccentSetting(): {
  accent: { primary: string; secondary: string };
  setAccent: (primary: string, secondary: string) => void;
} {
  /* Repli calculé UNE fois : sans ligne cloud ni cache, on repart de ce que les
     deux anciennes clés portaient déjà — la couleur choisie avant que le
     réglage ne monte au compte ne doit pas sauter au premier chargement. */
  const [fallback] = useState(() => readAccent());
  const [stored, setStored, hydrated] = useCloudState(ACCENT_STATE_KEY, ACCENT_CLOUD_KEY, fallback);
  const accent = normalizeAccent(stored);

  // Repeint <html> et rafraîchit le cache lu avant l'hydratation.
  useEffect(() => {
    applyAccent(accent.primary, accent.secondary);
  }, [accent.primary, accent.secondary]);

  /* Reprise des installations d'avant ce réglage : leur teinte n'existe que
     localement, et rien ne l'enverrait au compte tant que l'utilisateur ne
     retouche pas la couleur. On la pousse une seule fois, après l'hydratation
     — donc APRÈS avoir laissé la valeur du compte gagner si elle existe — et
     seulement si elle n'est pas la teinte livrée, qu'il est inutile d'écrire. */
  const seeded = useRef(false);
  useEffect(() => {
    if (!hydrated || seeded.current) return;
    seeded.current = true;
    try {
      if (localStorage.getItem(SEEDED_KEY)) return;
      localStorage.setItem(SEEDED_KEY, "1");
    } catch { return; }
    if (isDefaultAccent(accent)) return;
    setStored(accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const setAccent = (primary: string, secondary: string) => {
    const next = normalizeAccent({ primary, secondary });
    applyAccent(next.primary, next.secondary);
    setStored(next);
  };

  return { accent, setAccent };
}
