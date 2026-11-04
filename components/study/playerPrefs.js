"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Réglages du lecteur de la page Étude : disposition, hauteur, coin du mini
 * lecteur, horodatage automatique.
 *
 * Dans le localStorage et non dans le magasin cloud : ce sont des réglages
 * d'APPAREIL. La hauteur qui convient à un écran 27" n'a aucun sens sur un
 * portable, et la disposition « Côté » ne tient pas sur un téléphone.
 */
const KEY = "tao_study_player";
const EVENT = "tao:study-player";

export const DEFAULT_PREFS = { mode: "top", height: null, corner: "br", stamps: true, tradePlace: "below" };
export const MODES = ["top", "side", "mini"];
export const CORNERS = ["br", "bl", "tl", "tr"];
/* Où va la carte du trade quand la vidéo est en haut : dessous, ou à côté
   d'elle. Réglage d'appareil lui aussi — « à côté » n'a de sens que sur un
   écran large. */
export const TRADE_PLACES = ["below", "side"];

function parse(text) {
  try {
    const raw = JSON.parse(text || "{}");
    return {
      mode: MODES.includes(raw.mode) ? raw.mode : DEFAULT_PREFS.mode,
      height: Number.isFinite(raw.height) ? raw.height : null,
      corner: CORNERS.includes(raw.corner) ? raw.corner : DEFAULT_PREFS.corner,
      stamps: raw.stamps !== false,
      tradePlace: TRADE_PLACES.includes(raw.tradePlace) ? raw.tradePlace : DEFAULT_PREFS.tradePlace,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

const read = () => parse(rawPrefs());

function rawPrefs() {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

function subscribe(fn) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener("storage", fn); };
}

/** Les réglages, partagés entre la page et la note (la page élargit sa colonne
 *  en disposition « Côté »). Un magasin externe plutôt qu'un état copié dans
 *  chaque composant : les deux lisent la même chaîne, et le rendu serveur
 *  prend les défauts. */
export function usePlayerPrefs() {
  const raw = useSyncExternalStore(subscribe, rawPrefs, () => "");
  const prefs = useMemo(() => parse(raw), [raw]);
  const update = (patch) => {
    const next = { ...read(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* navigation privée */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return [prefs, update];
}
