/**
 * Couleurs de la partie Trading — toutes prises dans la charte.
 *
 * Avant, chaque page choisissait les siennes à l'œil : la page « Stratégies »
 * offrait une rampe de treize couleurs, « Ajouter un trade » douze AUTRES pour
 * le même objet, et les tags d'un trade (émotion, erreur, type d'entrée,
 * liquidité) portaient un jeu de cinq teintes sourdes recopié dans trois
 * fichiers. Tout vient désormais de `lib/ui/palette.ts`.
 *
 * Ce ne sont PAS des tokens `--color-*` : ce sont des couleurs de catégorie
 * (un tag, une stratégie), pas des couleurs de surface. Elles ne bougent donc
 * pas en thème sombre — deux tags voisins doivent rester distinguables, ce
 * qu'une palette recalculée par thème ne garantit pas. Ce qui relève de la
 * SURFACE (P&L, tags Long/Short, calendrier) vit en face, dans `globals.css`.
 */

import { PALETTE, GREY } from "@/lib/ui/palette";

/**
 * Les cinq teintes des tags d'un trade — les principales de la charte, brutes.
 *
 * Les clés sont des noms de couleur et non des rôles : le même bleu sert à
 * « trade ennui » et à « FVG », qui n'ont rien à voir. C'est la liste de tags
 * qui donne le sens, pas la teinte.
 */
export const TAG_COLORS = {
  red: PALETTE.red, // Cardinal
  orange: PALETTE.orange, // Fox
  green: PALETTE.green, // Owl
  blue: PALETTE.blue, // Macaw
  purple: PALETTE.purple, // Beetle
} as const;

/**
 * Palette de choix de la couleur d'une stratégie : les huit principales, plus
 * le gris pour une stratégie qu'on ne veut pas colorer.
 *
 * Pas de cran plus sombre ni plus clair dans la liste : la charte les réserve
 * au cas où les huit sont déjà prises, et personne ne suit neuf stratégies de
 * front. Neuf choix valent mieux que vingt qui se ressemblent.
 *
 * Une seule liste, servie aux deux endroits où l'on crée une stratégie. Avant,
 * une stratégie créée depuis « Ajouter un trade » ne pouvait tomber sur aucune
 * des couleurs de la page « Stratégies », et inversement.
 */
export const STRATEGY_COLORS: readonly string[] = [
  PALETTE.green,
  PALETTE.blue,
  PALETTE.red,
  PALETTE.yellow,
  PALETTE.orange,
  PALETTE.purple,
  PALETTE.pink,
  PALETTE.brown,
  GREY.grey700,
];

/** Couleur d'une stratégie qu'on vient de créer, avant tout choix. */
export const STRATEGY_COLOR_DEFAULT = PALETTE.green;
