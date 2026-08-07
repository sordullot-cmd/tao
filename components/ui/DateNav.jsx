"use client";

import React from "react";
import { T } from "@/lib/ui/tokens";

/**
 * Flèche de navigation (chevron) — composant partagé entre le Calendrier et le
 * Daily Planner pour garantir un design strictement identique.
 */
export function NavArrow({ direction = "left", onClick, title }) {
  return (
    <button
      onClick={onClick}
      aria-label={title}
      title={title}
      style={{
        padding: 6, borderRadius: "var(--radius-field)", background: "transparent", border: "none",
        cursor: "pointer", color: T.textSub, display: "inline-flex",
        alignItems: "center", transition: "background .12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1 }}>
        {direction === "left" ? "‹" : "›"}
      </span>
    </button>
  );
}

/**
 * Libellé central de navigation (année, date…). Même typographie partout.
 * Cliquable si `onClick` est fourni (ex. « revenir à aujourd'hui »).
 */
export function NavLabel({ children, onClick, title, minWidth = 48 }) {
  const base = {
    fontSize: 15, fontWeight: 600, color: T.text, textAlign: "center",
    minWidth, fontFamily: "var(--font-sans)", letterSpacing: -0.1,
  };
  if (onClick) {
    return (
      <button
        onClick={onClick}
        title={title}
        style={{
          ...base, background: "transparent", border: "none", cursor: "pointer",
          padding: "4px 8px", borderRadius: "var(--radius-field)", transition: "background .12s ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {children}
      </button>
    );
  }
  return <div style={base}>{children}</div>;
}
