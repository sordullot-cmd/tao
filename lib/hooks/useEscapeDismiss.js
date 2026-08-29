"use client";

/**
 * Échap ferme la couche ouverte — et UNE SEULE.
 *
 * Chaque modale du site posait (ou oubliait de poser) son propre
 * `document.addEventListener("keydown")`. Deux défauts, et le second est le
 * plus coûteux :
 *
 *  1. l'oubli. Sept modales ne se fermaient pas au clavier ;
 *  2. la fermeture en cascade. Un menu ouvert DANS une modale, deux écouteurs
 *     sur `document` : Échap fermait les deux d'un coup, et le travail en cours
 *     dans la modale disparaissait pour avoir voulu refermer un menu.
 *     `stopPropagation()` n'y peut rien — les écouteurs posés sur le même nœud
 *     s'exécutent tous, seul `stopImmediatePropagation` les arrêterait, et il
 *     dépendrait alors de l'ordre d'enregistrement.
 *
 * D'où une pile partagée : la couche la plus récemment ouverte est la première
 * à répondre, et elle est la seule. L'ordre vient de React lui-même — un menu
 * ouvert dans une modale est monté après elle, donc empilé au-dessus.
 */

import { useEffect, useRef } from "react";

/** Couches ouvertes, de la plus ancienne à la plus récente. */
const stack = [];
let listening = false;

function onKeyDown(e) {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  // Une saisie en cours d'édition (autocomplétion d'un champ, composition IME)
  // a déjà consommé la touche : la fermeture serait une seconde réaction à un
  // seul appui.
  if (e.defaultPrevented || e.isComposing) return;
  e.preventDefault();
  top.onClose?.(e);
}

function subscribe(entry) {
  stack.push(entry);
  if (!listening && typeof document !== "undefined") {
    document.addEventListener("keydown", onKeyDown);
    listening = true;
  }
  return () => {
    const i = stack.indexOf(entry);
    if (i !== -1) stack.splice(i, 1);
    if (!stack.length && listening && typeof document !== "undefined") {
      document.removeEventListener("keydown", onKeyDown);
      listening = false;
    }
  };
}

/**
 * Ferme au clavier tant que `open` est vrai.
 *
 * @param onClose appelé sur Échap. Peut changer à chaque rendu — c'est la
 *                dernière version qui est appelée, sans re-souscrire (une
 *                re-souscription remonterait la couche au sommet de la pile et
 *                lui volerait la priorité).
 * @param open    faux = la couche ne participe pas.
 */
export function useEscapeDismiss(onClose, open = true) {
  const ref = useRef(onClose);
  ref.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    return subscribe({ onClose: (e) => ref.current?.(e) });
  }, [open]);
}

/** Pour les tests : l'état de la pile, qu'aucun rendu n'expose autrement. */
export function __escapeStackSize() {
  return stack.length;
}
