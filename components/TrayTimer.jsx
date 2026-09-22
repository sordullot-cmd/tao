"use client";

/**
 * Le décompte de la barre de menus — monté dans la coquille, jamais dans une page.
 *
 * Même raison que `FocusSentinel` et `TrayBridge` : seule la page courante est
 * montée (cf. CLAUDE.md), or c'est en allant AILLEURS — ou en cachant la
 * fenêtre — qu'on a besoin de voir le temps qui reste. Accroché à la page
 * Focus, ce chronomètre se serait tu exactement quand il sert.
 *
 * Il ne rend rien : son seul effet est le titre posé à côté de l'icône.
 *
 * ── POURQUOI UNE SECONDE, TOUJOURS ─────────────────────────────────────────
 *
 * Le pomodoro de la page Focus n'a pas d'état partagé : il vit dans
 * localStorage, écrit par une page qui, la plupart du temps, n'est pas montée.
 * Aucun événement ne prévient donc qu'une session vient de démarrer — il faut
 * relire. Le relevé est deux `JSON.parse` de quelques octets, et l'intervalle
 * n'est même pas posé hors de l'app de bureau : c'est moins cher qu'un relais
 * à établir entre deux minuteurs qui s'ignorent.
 *
 * La poussée, elle, est gardée : on n'appelle la commande que lorsque le titre
 * CHANGE. Une session en pause ou terminée ne traverse donc plus le pont.
 */

import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/notify";
import { useFocusStore } from "@/lib/focus/useFocusStore";
import { loadDurations, loadTimer, resolveDurations } from "@/lib/focus/pomodoro";
import { trayClockLabel, traySetTimer } from "@/lib/tray/timer";

const TICK_MS = 1000;

export default function TrayTimer() {
  const [store] = useFocusStore();
  /* La session vit dans un état React, le pomodoro dans le stockage : la
     référence évite de reposer l'intervalle à chaque rendu du magasin. */
  const runningRef = useRef(store.running);
  useEffect(() => { runningRef.current = store.running; });

  useEffect(() => {
    if (!isTauri()) return;
    /* `undefined` et non `null` : la première poussée doit partir même quand il
       n'y a rien à afficher, pour effacer le titre d'une session d'avant le
       rechargement. */
    let last;
    const push = () => {
      const label = trayClockLabel(runningRef.current, loadTimer(), resolveDurations(loadDurations()));
      if (label === last) return;
      last = label;
      void traySetTimer(label);
    };
    push();
    const id = setInterval(push, TICK_MS);
    return () => {
      clearInterval(id);
      void traySetTimer(null);
    };
  }, []);

  return null;
}
