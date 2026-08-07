"use client";

import React, { useEffect, useRef, useState } from "react";
import { CountUp } from "./CountUp";

interface XpBarProps {
  /** Niveau courant. */
  level: number;
  /** Remplissage de la barre (0–100). */
  pct: number;
  /** XP dans le niveau courant / XP requis pour le suivant. */
  intoLevel: number;
  neededForNext: number;
  /** XP cumulée globale — sert à détecter les gains (delta > 0 → +XP flottant). */
  totalXp: number;
  /** Couleurs (injectées depuis le thème de la page). */
  fillColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
  width?: number;
}

interface FloatItem { id: number; amount: number; }

/**
 * Barre de niveau RPG avec feedback : les gains d'XP font apparaître un
 * « +N XP » flottant, et une montée de niveau déclenche un pop en spring du
 * badge + un flash de la barre + un petit burst de particules.
 *
 * Détection des changements via le pattern officiel React « ajuster l'état
 * pendant le rendu » (comparaison à la valeur précédente stockée en state),
 * ce qui évite les setState synchrones dans un effet. Les retraits différés
 * (fin d'animation) sont confinés dans des setTimeout.
 */
export function XpBar({
  level, pct, intoLevel, neededForNext, totalXp,
  fillColor, trackColor, textColor, mutedColor, width = 110,
}: XpBarProps) {
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [nextId, setNextId] = useState(1);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [prevXp, setPrevXp] = useState(totalXp);
  const [prevLevel, setPrevLevel] = useState(level);
  const scheduled = useRef<Set<number>>(new Set());

  // --- Détection en phase de rendu (pattern React sanctionné) ---
  if (totalXp !== prevXp) {
    const delta = totalXp - prevXp;
    setPrevXp(totalXp);
    if (delta > 0) {
      const id = nextId;
      setNextId(n => n + 1);
      setFloats(prev => [...prev, { id, amount: Math.round(delta) }]);
    }
  }
  if (level !== prevLevel) {
    const up = level > prevLevel;
    setPrevLevel(level);
    if (up) {
      setCelebrateKey(k => k + 1);
      setCelebrating(true);
    }
  }

  // Retrait des +XP flottants une fois l'animation terminée (un timer/float).
  useEffect(() => {
    floats.forEach(f => {
      if (scheduled.current.has(f.id)) return;
      scheduled.current.add(f.id);
      window.setTimeout(() => {
        setFloats(prev => prev.filter(x => x.id !== f.id));
        scheduled.current.delete(f.id);
      }, 900);
    });
  }, [floats]);

  // Fin de la célébration de level-up (retire les classes d'anim / le burst).
  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => setCelebrating(false), 720);
    return () => window.clearTimeout(timer);
  }, [celebrating, celebrateKey]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
      {/* Badge « Nv X » — pop en spring au level-up */}
      <span
        key={`lvl-${celebrateKey}`}
        className={celebrating ? "anim-level-pop" : undefined}
        style={{
          position: "relative",
          fontSize: 13, fontWeight: 700, color: textColor,
          whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
          transformOrigin: "center",
          display: "inline-block",
        }}
      >
        Nv {level}
        {/* Burst de particules au level-up */}
        {celebrating && (
          <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {[0, 1, 2, 3, 4, 5].map(i => {
              const angle = (i / 6) * Math.PI * 2;
              const bx = `${Math.round(Math.cos(angle) * 16)}px`;
              const by = `${Math.round(Math.sin(angle) * 16 - 8)}px`;
              return (
                <span
                  key={`${celebrateKey}-${i}`}
                  className="anim-xp-burst"
                  style={{
                    position: "absolute", left: "50%", top: "50%",
                    width: 4, height: 4, borderRadius: "50%",
                    background: fillColor,
                    "--bx": bx,
                    "--by": by,
                  } as React.CSSProperties}
                />
              );
            })}
          </span>
        )}
      </span>

      {/* Barre */}
      <div style={{ width, height: 6, borderRadius: 999, background: trackColor, overflow: "hidden", position: "relative" }}>
        <div
          key={celebrating ? `flash-${celebrateKey}` : "fill"}
          className={celebrating ? "anim-bar-flash" : undefined}
          style={{
            width: `${pct}%`, height: "100%", background: fillColor,
            borderRadius: 999, transition: "width var(--dur-slow) var(--ease-out)",
          }}
        />
      </div>

      {/* XP courant (count-up) */}
      <span style={{ fontSize: 11, color: mutedColor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        <CountUp value={intoLevel} duration={450} /> / {neededForNext} XP
      </span>

      {/* +XP flottants */}
      {floats.map((f, idx) => (
        <span
          key={f.id}
          className="anim-xp-float"
          style={{
            position: "absolute",
            left: 42, top: -2 - idx * 2,
            fontSize: 12, fontWeight: 700, color: fillColor,
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        >
          +{f.amount} XP
        </span>
      ))}
    </div>
  );
}

export default XpBar;
