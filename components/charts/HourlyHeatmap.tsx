"use client";

import React from "react";

interface HourlyHeatmapProps {
  trades: any[];
}

export function HourlyHeatmap({ trades }: HourlyHeatmapProps) {
  // Créer une heatmap jour × heure
  const heatmapData: Record<number, Record<number, { count: number; pnl: number }>> = {};

  trades.forEach((trade: any) => {
    const date = new Date(trade.entry_time);
    const dayOfWeek = date.getDay(); // 0-6
    const hour = date.getHours(); // 0-23

    if (!heatmapData[dayOfWeek]) {
      heatmapData[dayOfWeek] = {};
    }
    if (!heatmapData[dayOfWeek][hour]) {
      heatmapData[dayOfWeek][hour] = { count: 0, pnl: 0 };
    }

    heatmapData[dayOfWeek][hour].count++;
    heatmapData[dayOfWeek][hour].pnl += trade.pnl || 0;
  });

  const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Intensité normalisée par le MAX ABSOLU du P&L moyen observé (comme HoursHeatmap),
  // pour rester lisible quelle que soit la taille de compte. Les anciens seuils $
  // figés (-50/-20/0/20/50) étaient inadaptés aux gros/petits comptes.
  let maxAbs = 0;
  for (const dKey of Object.keys(heatmapData)) {
    const d = Number(dKey);
    for (const hKey of Object.keys(heatmapData[d])) {
      const cell = heatmapData[d][Number(hKey)];
      const avg = cell.count > 0 ? cell.pnl / cell.count : 0;
      maxAbs = Math.max(maxAbs, Math.abs(avg));
    }
  }
  maxAbs = maxAbs || 1;

  const EMPTY = "var(--color-hover-bg, #F1F5F9)";

  const getColor = (avgPnL: number, count: number) => {
    if (count === 0) return EMPTY;
    const intensity = Math.min(1, Math.abs(avgPnL) / maxAbs);
    if (avgPnL > 0) return `rgba(16, 163, 127, ${0.15 + intensity * 0.65})`; // Vert (gain)
    if (avgPnL < 0) return `rgba(239, 68, 68, ${0.15 + intensity * 0.65})`; // Rouge (perte)
    return EMPTY;
  };

  return (
    <div style={{ background: "var(--color-card-bg, #FFFFFF)", border: "1px solid var(--color-border, #E5E5E5)", padding: 20, borderRadius: 12 }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600, color: "var(--color-text, #0D0D0D)" }}>
        Heatmap Jour × Heure (P&amp;L moyen)
      </h3>

      <div
        style={{
          overflowX: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Header avec heures */}
        <div style={{ display: "flex", gap: 2, marginLeft: 80 }}>
          {hours.map((h) => (
            <div
              key={h}
              style={{
                width: 30,
                textAlign: "center",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--color-text-muted, #6B6B6B)",
              }}
            >
              {h}h
            </div>
          ))}
        </div>

        {/* Rows par jour */}
        {dayNames.map((day, dayIndex) => (
          <div key={dayIndex} style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <div
              style={{
                width: 80,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--color-text, #0D0D0D)",
              }}
            >
              {day}
            </div>
            {hours.map((hour) => {
              const data = heatmapData[dayIndex]?.[hour];
              const count = data?.count || 0;
              const pnl = data?.pnl || 0;
              const avgPnL = count > 0 ? pnl / count : 0;
              const intensity = count > 0 ? Math.min(1, Math.abs(avgPnL) / maxAbs) : 0;
              // Seuil de contraste texte dépendant de l'intensité (pas d'un seuil $ fixe).
              const textColor = intensity > 0.55 ? "#fff" : "#1A1A1A";
              const label =
                count > 0
                  ? `${day} ${hour}h : ${count} trade${count > 1 ? "s" : ""}, P&L moyen ${avgPnL > 0 ? "+" : ""}${avgPnL.toFixed(0)}$`
                  : `${day} ${hour}h : aucun trade`;

              return (
                <div
                  key={`${dayIndex}-${hour}`}
                  role="img"
                  aria-label={label}
                  style={{
                    width: 30,
                    height: 30,
                    background: getColor(avgPnL, count),
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 600,
                    color: textColor,
                    transition: "all 0.2s ease",
                  }}
                  title={label}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.1)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {count > 0 ? count : ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Légende : intensité relative (perte ↔ gain), échelle normalisée */}
      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, alignItems: "center", color: "var(--color-text-muted, #6B6B6B)" }}>
        <span>Perte</span>
        {[0.8, 0.45, 0.15].map((op) => (
          <div key={`r${op}`} style={{ width: 18, height: 18, background: `rgba(239, 68, 68, ${op})`, borderRadius: 4 }} />
        ))}
        <div style={{ width: 18, height: 18, background: EMPTY, borderRadius: 4 }} title="Aucun trade" />
        {[0.15, 0.45, 0.8].map((op) => (
          <div key={`g${op}`} style={{ width: 18, height: 18, background: `rgba(16, 163, 127, ${op})`, borderRadius: 4 }} />
        ))}
        <span>Gain</span>
        <span style={{ marginLeft: 8, opacity: 0.85 }}>Le chiffre = nombre de trades · la couleur = P&amp;L moyen (relatif au max)</span>
      </div>
    </div>
  );
}
