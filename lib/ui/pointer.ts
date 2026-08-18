/**
 * Détection de pointeur fin — l'équivalent JS de
 * `@media (hover: hover) and (pointer: fine)`.
 *
 * Pourquoi c'est nécessaire : sur un écran tactile, un simple appui déclenche
 * `mouseenter` avant le `click`. Un état de survol posé en JavaScript
 * s'applique donc au doigt, et il y RESTE — il n'y a pas de `mouseleave`
 * puisque le doigt ne se « déplace » pas hors de la cible. Une carte survolée
 * au tap reste soulevée jusqu'au prochain appui ailleurs.
 *
 * En CSS on écarte ce cas avec la media query. Les survols écrits en style
 * inline, eux, n'ont aucun moyen de la consulter — d'où cette fonction.
 *
 * On ne garde QUE les effets de déplacement. Un changement de couleur au tap
 * est sans conséquence, et le retirer coûterait plus qu'il ne rapporte ; un
 * élément qui reste soulevé, lui, se lit comme un état sélectionné qu'on ne
 * peut plus annuler.
 */

/** Vrai si l'appareil dispose d'un pointeur précis capable de survoler. */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    // Rendu serveur : on suppose le desktop, le client corrigera au premier
    // événement réel (il n'y a pas de survol tant qu'il n'y a pas de pointeur).
    return true;
  }
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
