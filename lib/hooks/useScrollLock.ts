"use client";

import React from "react";

/** Compteur de surfaces verrouillantes : deux couches empilées ne se marchent pas dessus. */
let locks = 0;
let restoreY = 0;

/**
 * Gèle le défilement de la page tant qu'une surface modale est ouverte.
 *
 * Pourquoi pas simplement `document.body.style.overflow = "hidden"` :
 *
 *   1. La feuille de styles pose `overflow: auto !important` sur `body` en
 *      mobile (le défilement tactile y appartient au document, pas à un
 *      conteneur interne). Un style INLINE perd contre `!important` : le
 *      verrou n'aurait tenu que sur ordinateur, c'est-à-dire exactement là où
 *      il ne sert à rien.
 *   2. Sur iOS, `overflow: hidden` sur `body` ne suffit de toute façon pas —
 *      Safari continue de faire défiler le document sous la couche. Seul
 *      `position: fixed` l'arrête vraiment.
 *
 * D'où la manœuvre classique : on fige le corps de page à l'endroit exact où
 * l'utilisateur en était (`top: -scrollY`), puis on l'y remet au
 * déverrouillage. Sans cette restitution, refermer une feuille renverrait en
 * haut de page — on perdrait sa place à chaque aller-retour.
 */
export function useScrollLock(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    const body = document.body;

    if (locks === 0) {
      restoreY = window.scrollY;
      body.classList.add("tr4de-scroll-locked");
      body.style.top = `${-restoreY}px`;
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks > 0) return;
      body.classList.remove("tr4de-scroll-locked");
      body.style.top = "";
      /* `instant` et non `smooth` : ce n'est pas un déplacement, c'est la
         restitution d'une position. L'animer donnerait un saut visible là où
         l'utilisateur n'a rien demandé. */
      window.scrollTo({ top: restoreY, behavior: "instant" });
    };
  }, [active]);
}
