"use client";

import React from "react";
import {
  VelocityTracker,
  project,
  rubberband,
  FLICK_VELOCITY,
  DRAG_HYSTERESIS,
} from "@/lib/ui/gesture";

export interface SwipeToDismissOptions {
  /** Appelé quand le geste conclut au renvoi. */
  onDismiss?: () => void;
  /** Sens du renvoi : -1 vers la gauche/le haut, +1 vers la droite/le bas. */
  direction?: -1 | 1;
  axis?: "x" | "y";
  /** Le geste n'existe que quand la surface est ouverte. */
  enabled?: boolean;
  /**
   * `true` pour réserver le geste au tactile. Sur un tiroir, la souris a déjà
   * le voile et la touche Échap ; l'y ajouter volerait la sélection de texte.
   */
  touchOnly?: boolean;
}

/**
 * Renvoi d'une surface au glissé — le geste commun aux tiroirs et aux feuilles.
 *
 * Ce que le hook apporte par rapport à un simple suivi de position :
 *
 *   • Le suivi est au pixel près pendant TOUT le geste. La surface est collée
 *     au doigt, elle ne rattrape pas son retard à la fin.
 *   • La VITESSE de relâchement décide, pas seulement la distance parcourue.
 *     On projette où la surface se serait immobilisée si on l'avait laissée
 *     filer, exactement comme une inertie de défilement, et on tranche
 *     là-dessus. Sans cela une chiquenaude — le geste le plus naturel pour
 *     écarter quelque chose — ne fait rien parce qu'elle est courte.
 *   • Tirer dans le mauvais sens RÉSISTE au lieu de buter. Un arrêt net se lit
 *     comme un blocage ; une résistance progressive dit « il n'y a rien de plus
 *     par là » tout en continuant visiblement d'écouter.
 *   • Le geste reste vivant quand le doigt sort de la surface (capture de
 *     pointeur) — ce qui arrive à tous les coups, puisque le but est justement
 *     de l'emmener hors de l'écran.
 *   • Un seul doigt à la fois : changer de doigt en cours de route ferait
 *     sauter la surface, l'origine du geste ayant changé.
 *
 * La transition CSS est coupée pendant le glissé (suivi 1:1) puis rendue à
 * l'élément au relâchement — la surface repart alors de la valeur affichée à
 * l'écran, jamais d'une valeur théorique, donc sans saut visible.
 */
export function useSwipeToDismiss<T extends HTMLElement>({
  onDismiss,
  direction = 1,
  axis = "x",
  enabled = true,
  touchOnly = true,
}: SwipeToDismissOptions) {
  const ref = React.useRef<T>(null);
  const tracker = React.useRef(new VelocityTracker());
  const drag = React.useRef({ id: -1, startX: 0, startY: 0, decided: -1, offset: 0, size: 0 });

  const paint = (offset: number) => {
    const el = ref.current;
    if (!el) return;
    /* Écrit sur l'élément, jamais dans une variable CSS d'un parent : une
       variable est héritée, donc chaque frame forcerait le recalcul de style
       de tous les descendants — la liste complète du tiroir, soixante fois par
       seconde. */
    el.style.transform = offset
      ? (axis === "x" ? `translateX(${offset}px)` : `translateY(${offset}px)`)
      : "";
  };

  const release = (dismiss: boolean) => {
    const el = ref.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
      el.style.willChange = "";
    }
    drag.current.id = -1;
    drag.current.decided = -1;
    drag.current.offset = 0;
    tracker.current.reset();
    if (dismiss) onDismiss?.();
  };

  const onPointerDown = (e: React.PointerEvent<T>) => {
    if (!enabled || drag.current.id !== -1) return;
    if (touchOnly && e.pointerType === "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      decided: -1,
      offset: 0,
      size: axis === "x" ? r.width : r.height,
    };
    tracker.current.reset();
    tracker.current.add(e.clientX, e.clientY, e.timeStamp);
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    const d = drag.current;
    if (d.id !== e.pointerId || d.decided === 0) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const along = axis === "x" ? dx : dy;
    const across = axis === "x" ? dy : dx;

    if (d.decided === -1) {
      // Hystérésis : en deçà, l'intention n'est pas lisible — et un simple
      // appui sur un contenu deviendrait un glissé parasite.
      if (Math.abs(along) < DRAG_HYSTERESIS && Math.abs(across) < DRAG_HYSTERESIS) return;
      // L'axe perpendiculaire appartient au défilement du contenu : on s'efface.
      if (Math.abs(across) > Math.abs(along)) { d.decided = 0; return; }
      d.decided = 1;
      const el = ref.current;
      if (el) {
        el.style.transition = "none";
        el.style.willChange = "transform";
        el.setPointerCapture?.(e.pointerId);
      }
    }

    tracker.current.add(e.clientX, e.clientY, e.timeStamp);
    const towards = along * direction;          // > 0 = va vers la sortie
    d.offset = towards >= 0 ? along : direction * -rubberband(-towards, d.size);
    paint(d.offset);
  };

  const onPointerUp = (e: React.PointerEvent<T>) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    if (d.decided !== 1) { release(false); return; }

    const v = tracker.current.velocity();
    const vAlong = axis === "x" ? v.x : v.y;
    const projected = d.offset + project(vAlong);
    const flick = (vAlong * direction) / 1000 > FLICK_VELOCITY;
    release(flick || projected * direction > d.size / 2);
  };

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
