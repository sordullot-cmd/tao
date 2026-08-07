"use client";

import React, { useEffect, useRef, useState } from "react";

interface CountUpProps {
  /** Valeur cible à atteindre. */
  value: number;
  /** Durée de l'animation en ms (par défaut 550ms). */
  duration?: number;
  /** Nombre de décimales affichées. */
  decimals?: number;
  /** Formateur custom (prioritaire sur `decimals`) — ex. montant, %, etc. */
  format?: (n: number) => string;
  /** Préfixe / suffixe collés à la valeur (ex. "$", "%"). */
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

// Courbe ease-out (miroir de --ease-out) : démarre vite, ralentit à la fin.
// Un count-up doit se sentir réactif dès la première frame.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Anime un nombre de sa valeur précédente vers `value`. Idéal pour les KPI
 * (P&L, win rate, XP) : les chiffres « montent » à l'arrivée sur la page ou
 * quand la donnée change, ce qui les rend vivants sans être distrayant.
 *
 * - Respecte `prefers-reduced-motion` (affiche la valeur finale directement).
 * - Interruptible : si `value` change en cours d'animation, repart de la
 *   valeur courante affichée (pas de saut).
 */
export function CountUp({
  value, duration = 550, decimals = 0, format, prefix = "", suffix = "",
  className, style,
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || duration <= 0) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    startRef.current = null;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const current = from + (to - from) * easeOutCubic(t);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // Mémorise la dernière valeur affichée comme point de départ suivant.
      fromRef.current = display;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const text = format
    ? format(display)
    : display.toLocaleString("fr-FR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {prefix}{text}{suffix}
    </span>
  );
}

export default CountUp;
