"use client";

import React from "react";

/**
 * Ombres de bord d'une zone défilante — le remplaçant du filet gris.
 *
 * Le problème que ça résout : dans une modale, un `borderBottom` sous
 * l'en-tête sert deux buts à la fois, dont un seul est légitime. Il découpe la
 * surface en blocs — ce que la DA refuse, puisque la carte EST la surface — et
 * il signale qu'un contenu passe dessous — ce qui, lui, est utile.
 *
 * La distinction, c'est que le second n'est vrai que **par moments** : tant que
 * la liste tient entière dans la modale, il n'y a rien sous l'en-tête et le
 * trait ne dit rien. Ce hook rend l'indication conditionnelle : un dégradé
 * apparaît en haut seulement une fois le contenu décollé, en bas seulement
 * s'il en reste à voir.
 *
 * Usage :
 *   const ref = React.useRef(null);
 *   const edges = useScrollEdges(ref);
 *   <div ref={ref} style={{ overflowY: "auto", boxShadow: scrollEdgeShadow(edges) }}>
 */
export interface ScrollEdges { top: boolean; bottom: boolean; }

export function useScrollEdges(ref: React.RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = React.useState<ScrollEdges>({ top: false, bottom: false });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setEdges((prev) => {
        const next = {
          top: scrollTop > 1,
          bottom: scrollTop + clientHeight < scrollHeight - 1,
        };
        // Comparaison avant écriture : sans elle, le ResizeObserver ci-dessous
        // se rappellerait à chaque rendu qu'il provoque lui-même.
        return prev.top === next.top && prev.bottom === next.bottom ? prev : next;
      });
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", read); ro?.disconnect(); };
  }, [ref]);

  return edges;
}

/** Teinte du dégradé de bord — de l'encre diluée, donc juste en thème sombre. */
export const EDGE_SHADOW = "color-mix(in srgb, var(--color-text) 7%, transparent)";

/** Traduit l'état des bords en `box-shadow` (à poser sur la zone défilante). */
export function scrollEdgeShadow(edges: ScrollEdges): string {
  return [
    edges.top ? `inset 0 8px 8px -8px ${EDGE_SHADOW}` : null,
    edges.bottom ? `inset 0 -8px 8px -8px ${EDGE_SHADOW}` : null,
  ].filter(Boolean).join(", ") || "none";
}
