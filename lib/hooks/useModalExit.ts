"use client";

import React from "react";

/**
 * Sortie animée d'une couche flottante (modale, feuille, panneau).
 *
 * Le problème : dans ce site, une modale est rendue en `{open && <Modal/>}`.
 * Quand `open` repasse à faux, React démonte le nœud dans la foulée — la
 * surface disparaît d'un coup, sans transition. C'est la moitié manquante du
 * mouvement : quinze dialogues entraient (ou pas) mais aucun ne sortait, alors
 * qu'un élément qui s'évanouit sans transition se lit comme un bug d'affichage.
 *
 * Le principe : la coque intercepte la demande de fermeture au lieu de la
 * transmettre. Elle marque la surface comme sortante — ce qui déclenche
 * l'animation — puis prévient le parent une fois l'animation terminée. Le
 * parent, lui, n'a rien à savoir de tout ça.
 *
 * Limite assumée : cela ne couvre que les fermetures qui PASSENT par la coque
 * (voile, croix, Échap). Un parent qui remet `open` à faux de lui-même — par
 * exemple après un enregistrement réussi — démonte toujours immédiatement.
 * Couvrir ce cas demanderait de remonter l'état de sortie dans chaque page.
 *
 * @param onClose    fermeture réelle, appelée à la fin de l'animation
 * @param durationMs doit correspondre à la durée CSS de la classe de sortie
 */
export function useModalExit(onClose?: () => void, durationMs = 160) {
  const [closing, setClosing] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const requestClose = React.useCallback(() => {
    // Double clic sur le voile, ou croix pendant que Échap est déjà parti :
    // une seule sortie, un seul `onClose`.
    if (timer.current != null) return;
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onClose?.();
    }, durationMs);
  }, [onClose, durationMs]);

  return { closing, requestClose };
}
