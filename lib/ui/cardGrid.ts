/**
 * Variables d'une grille de cartes qui remplit la largeur.
 *
 * Le CSS ne sait pas compter les enfants d'une grille : `repeat()` réclame un
 * entier, et `auto-fill` garde ses colonnes vides plutôt que d'étirer les
 * cartes présentes. Le nombre de colonnes se décide donc ici, où le nombre de
 * cartes est connu, et part en variables CSS (cf. `.card-grid` dans
 * app/globals.css).
 *
 * Trois paliers, parce qu'une carte a une largeur minimale lisible : six
 * colonnes au large, trois sur une fenêtre moyenne, deux sur un téléphone. Ce
 * qui dépasse passe à la ligne — c'est la grille qui s'en charge, sans qu'on
 * ait à découper la liste.
 */

import type { CSSProperties } from "react";

/** Nombre maximal de cartes par rangée, du plus large au plus étroit. */
const CAPS = { lg: 6, md: 3, sm: 2 } as const;

export function cardGrid(count: number): CSSProperties {
  const n = Math.max(1, count);
  return {
    "--cols": Math.min(n, CAPS.lg),
    "--cols-md": Math.min(n, CAPS.md),
    "--cols-sm": Math.min(n, CAPS.sm),
  } as CSSProperties;
}
