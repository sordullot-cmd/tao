"use client";

import React from "react";

/**
 * Le disque de l'utilisateur : sa photo, ou ses initiales.
 *
 * Sans teinte choisie, les initiales prennent le voile de l'accent de marque —
 * la barre reste calme, les initiales portent la couleur. Avec une teinte, le
 * même dessin est recalculé à partir d'elle, mêlée au fond de carte et au texte
 * plutôt qu'à du blanc et du noir fixes : c'est ce qui la fait tenir dans les
 * deux thèmes. Le liseré intérieur dessine le disque sans bordure franche.
 */
export default function UserAvatar({ src, initials, color, size = 34, fontSize = 14 }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }}
      />
    );
  }
  const base = color || "var(--accent)";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color ? `color-mix(in srgb, ${color} 22%, var(--color-card-bg))` : "var(--accent-pastel)",
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${base} 28%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 700, letterSpacing: 0.2,
      color: color ? `color-mix(in srgb, ${color} 70%, var(--color-text))` : "var(--accent-ink)",
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}
