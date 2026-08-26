"use client";

/**
 * Application du blocage — ce qui est réellement tenu, et par quoi.
 *
 * Il faut être honnête sur la portée, sinon la page promet ce qu'elle ne peut
 * pas faire. Une page web n'a AUCUN moyen d'empêcher une autre application de
 * s'ouvrir, ni de fermer un onglet qu'elle n'a pas ouvert. Ce que cette couche
 * tient, en revanche :
 *
 *   1. LES DÉPARTS DEPUIS L'APP. Tout lien de l'app vers un domaine coupé est
 *      intercepté avant la navigation (capture, donc avant les gestionnaires de
 *      la page), `window.open` compris. C'est la fuite la plus fréquente : on ne
 *      décide pas d'aller sur YouTube, on clique un lien qui y mène.
 *   2. LES ÉCARTS. Quitter l'app pendant une session — changer d'onglet,
 *      basculer sur une autre fenêtre — est mesuré, et au-delà d'un délai de
 *      grâce, compté comme un écart. C'est ce que voit vraiment un navigateur,
 *      et c'est déjà la mesure la plus utile : elle dit combien de fois
 *      l'attention est partie, sans prétendre l'avoir retenue.
 *   3. LA SORTIE DE PAGE. Une session ferme avec un avertissement natif du
 *      navigateur, la seule friction qu'il concède avant de laisser partir.
 *
 * Ce qu'il faudrait pour bloquer POUR DE VRAI : la coquille Tauri (src-tauri).
 * Un blocage système passe par le pare-feu ou le fichier hosts pour les sites,
 * et par la surveillance des processus pour les applis — donc du code natif et
 * une autorisation de l'utilisateur. `nativeBlocking()` est le point
 * d'accrochage prévu pour ça : le jour où la commande existe, elle lira les
 * mêmes listes, et cette couche web restera le filet côté navigateur.
 */

import { useEffect, useRef, useState } from "react";
import {
  dayKey, sessionFromSchedule, shouldFire, verdictFor,
  type FocusSchedule, type FocusStore, type RunningSession,
} from "./model";

/** Un blocage constaté, tel qu'il remonte à l'interface. */
export interface GuardHit {
  /** Identifiant catalogue, domaine libre, ou `away`. */
  target: string;
  /** URL refusée, quand c'est une navigation. */
  url?: string;
  /** Nom de la liste qui a tranché. */
  listName?: string;
  /** Durée de l'absence, pour un écart (ms). */
  awayMs?: number;
}

/**
 * Le blocage au niveau du système est-il disponible ?
 *
 * Faux partout aujourd'hui : la commande Tauri correspondante n'existe pas
 * encore. La fonction est là pour que l'interface dise la vérité sur ce qu'elle
 * bloque — une bannière « blocage navigateur » plutôt qu'un bouclier qui laisse
 * croire à une coupure système.
 */
export function nativeBlocking(): boolean {
  return false;
}

/**
 * Intercepte ce qui peut l'être, tant qu'une session tourne.
 *
 * `onHit` est appelé pour chaque tentative. Le rappel est tenu dans une
 * référence : les écouteurs sont posés une fois par session, et doivent voir la
 * dernière version du rappel sans être redéployés à chaque rendu de la page.
 */
export function useFocusGuard(
  running: RunningSession | null,
  store: FocusStore,
  onHit: (hit: GuardHit) => void
): void {
  /* Rappel et magasin tenus dans des références, ÉCRITES DANS UN EFFET et non
     pendant le rendu : les écouteurs sont posés une fois par session et doivent
     voir la dernière version sans être redéployés à chaque rendu de la page.
     L'effet sans tableau de dépendances tourne après chaque rendu — c'est
     exactement ce qu'on veut ici, et c'est ce que réclame la règle
     `react-hooks/refs`. */
  const onHitRef = useRef(onHit);
  const storeRef = useRef(store);
  useEffect(() => { onHitRef.current = onHit; storeRef.current = store; });

  const active = Boolean(running) && !running?.pausedAt;
  const blocklistIds = running?.blocklistIds;
  const graceMs = Math.max(0, (store.settings.awayGraceSec || 0) * 1000);

  /* ── Liens et fenêtres ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!active || !blocklistIds) return;

    const check = (url: string) => verdictFor(url, storeRef.current, blocklistIds);

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!el) return;
      const href = el.getAttribute("href") || "";
      const v = check(href);
      if (!v.blocked) return;
      // `preventDefault` seul suffirait pour la navigation, mais un composant
      // peut aussi réagir au clic : on coupe la propagation dans la foulée.
      e.preventDefault();
      e.stopPropagation();
      onHitRef.current({ target: v.target || href, url: href, listName: v.list?.name });
    };

    // `window.open` échappe au clic (appelé depuis du code, pas depuis un lien) :
    // on l'enveloppe le temps de la session et on rend l'original en sortant.
    const nativeOpen = window.open;
    window.open = function guarded(url?: string | URL, ...rest: unknown[]) {
      const target = typeof url === "string" ? url : url?.toString() || "";
      const v = check(target);
      if (v.blocked) {
        onHitRef.current({ target: v.target || target, url: target, listName: v.list?.name });
        return null;
      }
      // @ts-expect-error — signature variadique de window.open, rendue telle quelle.
      return nativeOpen.call(window, url, ...rest);
    } as typeof window.open;

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = nativeOpen;
    };
  }, [active, blocklistIds]);

  /* ── Écarts : l'attention qui part ailleurs ────────────────────────────── */
  useEffect(() => {
    if (!active) return;
    let leftAt: number | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        leftAt = Date.now();
        return;
      }
      if (leftAt === null) return;
      const away = Date.now() - leftAt;
      leftAt = null;
      if (away >= graceMs) onHitRef.current({ target: "away", awayMs: away });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, graceMs]);

  /* ── Fermeture de la page ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Les navigateurs ignorent le texte depuis longtemps et affichent le leur ;
      // seule la présence de `returnValue` déclenche encore la confirmation.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);
}

/**
 * Horloge de rendu : une valeur qui change à intervalle régulier.
 *
 * Le décompte d'une session n'est pas un état à faire avancer — l'état, c'est
 * l'heure de départ. Ce compteur ne sert qu'à provoquer un rendu, et il s'arrête
 * dès que plus rien ne défile, pour ne pas réveiller React une fois par seconde
 * sur une page au repos.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return tick;
}

/**
 * Déclenche les programmes arrivés à l'heure.
 *
 * Contrôle toutes les trente secondes, avec la fenêtre de rattrapage du modèle :
 * l'app n'est pas forcément ouverte à la seconde prévue. Ne fait rien si une
 * session tourne déjà — un programme ne remplace pas une session en cours, il
 * la laisse finir.
 */
export function useScheduleRunner(
  store: FocusStore,
  onStart: (session: RunningSession, schedule: FocusSchedule) => void
): void {
  const onStartRef = useRef(onStart);
  const storeRef = useRef(store);
  useEffect(() => { onStartRef.current = onStart; storeRef.current = store; });

  const enabled = store.settings.autoSchedule && !store.running;

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const s = storeRef.current;
      if (s.running) return;
      const now = new Date();
      const due = s.schedules.find(sc => shouldFire(sc, now));
      if (!due) return;
      onStartRef.current(sessionFromSchedule(due, s, now), { ...due, lastFired: dayKey(now) });
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [enabled]);
}
