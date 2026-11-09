"use client";

import { useSyncExternalStore } from "react";

/**
 * La vidéo d'étude qui continue en fenêtre flottante quand on quitte la note.
 *
 * Seule la page courante est montée (cf. CLAUDE.md) : quitter l'Étude démonte
 * le lecteur, et l'iframe YouTube avec lui. On ne peut pas la « garder » —
 * déplacer une iframe dans le DOM la recharge de toute façon. Le lecteur passe
 * donc la main : au démontage, s'il jouait, il dépose ici où il en était, et
 * `FloatingStudyVideo`, monté dans la coquille, reprend au même instant.
 *
 * Un magasin de module plutôt qu'un contexte : le lecteur se démonte, la
 * coquille ne l'est jamais, et les deux n'ont pas d'ancêtre commun utile entre
 * eux.
 */

/** @type {null | { noteId: string, videoId: string, youtubeId: string, title: string, time: number }} */
let current = null;
/** Note à rouvrir dans l'Étude — demandé par « Revenir à la note ». */
let openRequest = null;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Le lecteur de la note se démonte en pleine lecture : la fenêtre flottante prend le relais. */
export function handOff(entry) {
  current = { ...entry };
  emit();
}

/** Le lecteur flottant tient l'horloge à jour sans faire re-rendre personne :
 *  seul `claim` la relit, au moment où la note reprend la main. */
export function track(time) {
  if (current) current.time = time;
}

/**
 * La note se remonte. Si la vidéo flottante est la sienne, elle la reprend :
 * la fenêtre se ferme et le temps atteint revient au lecteur — `null` sinon.
 *
 * Même note mais autre vidéo (« Changer de vidéo », « Regarder » sur une vidéo
 * secondaire) : on ferme aussi sans rien rendre. C'est un geste DANS la note,
 * pas un départ — la vidéo remplacée ne doit pas se mettre à flotter.
 */
export function claim(noteId, youtubeId) {
  if (!current || current.noteId !== noteId) return null;
  const time = current.youtubeId === youtubeId ? current.time : null;
  current = null;
  emit();
  return time;
}

export function dismiss() {
  if (!current) return;
  current = null;
  emit();
}

export function requestOpen(noteId) {
  openRequest = noteId;
  emit();
}

/** Lue une seule fois : une demande servie ne doit pas rouvrir la note au
 *  prochain passage sur l'Étude. */
export function takeOpenRequest() {
  const id = openRequest;
  openRequest = null;
  return id;
}

export function onOpenRequest(fn) {
  return subscribe(() => { if (openRequest) fn(); });
}

export function useFloatingVideo() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Pour les tests : repartir d'un état vide entre deux cas. */
export function resetFloatingVideo() {
  current = null;
  openRequest = null;
  emit();
}
