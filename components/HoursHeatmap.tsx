"use client";

import React, { useMemo } from "react";
import { Clock, TrendingUp, TrendingDown } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { fmt } from "@/lib/ui/format";

/**
 * HoursHeatmap — révèle les heures les plus rentables / les plus dangereuses.
 *
 * Grille 7 jours × 24 heures. Chaque cellule = somme P&L de cette tranche.
 * Vert intense = profitable, rouge intense = pertes, gris = peu de trades.
 *
 * Affiche aussi top 3 et bottom 3 créneaux pour décision rapide.
 */

interface MinimalTrade {
  date?: string;
  pnl?: number;
}

interface HoursHeatmapProps {
  trades: MinimalTrade[];
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourFromDate(d: Date): number {
  return d.getHours();
}
function dayIndexMonFirst(d: Date): number {
  // Date.getDay(): 0=Dim, 1=Lun, ..., 6=Sam
  // On veut: 0=Lun ... 6=Dim
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

interface Cell {
  pnl: number;
  trades: number;
  wins: number;
}

export default function HoursHeatmap({ trades }: HoursHeatmapProps) {
  const grid = useMemo(() => {
    const g: Cell[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ pnl: 0, trades: 0, wins: 0 }))
    );
    for (const t of trades) {
      if (!t.date) continue;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) continue;
      const day = dayIndexMonFirst(d);
      const hour = hourFromDate(d);
      const cell = g[day][hour];
      cell.pnl += t.pnl || 0;
      cell.trades += 1;
      if ((t.pnl || 0) > 0) cell.wins += 1;
    }
    return g;
  }, [trades]);

  // Top 3 / bottom 3 créneaux (au moins 2 trades)
  const ranked = useMemo(() => {
    const list: { day: number; hour: number; cell: Cell }[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const c = grid[d][h];
        if (c.trades >= 2) list.push({ day: d, hour: h, cell: c });
      }
    }
    list.sort((a, b) => b.cell.pnl - a.cell.pnl);
    return {
      best: list.slice(0, 3),
      worst: list.slice(-3).reverse(),
    };
  }, [grid]);

  const max = useMemo(() => {
    let m = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        m = Math.max(m, Math.abs(grid[d][h].pnl));
      }
    }
    return m || 1;
  }, [grid]);

  const cellColor = (pnl: number, trades: number): string => {
    if (trades === 0) return "transparent";
    const intensity = Math.min(1, Math.abs(pnl) / max);
    if (pnl > 0) {
      // Vert avec opacité variable
      return `rgba(16, 163, 127, ${0.15 + intensity * 0.65})`;
    }
    if (pnl < 0) {
      return `rgba(239, 68, 68, ${0.15 + intensity * 0.65})`;
    }
    return T.bg;
  };

  const totalTrades = trades.length;

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Clock size={16} strokeWidth={1.75} color={T.text} />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>
          Heatmap par heure
        </h3>
        <span style={{ fontSize: 11, color: T.textMut, marginLeft: "auto" }}>
          {totalTrades} trade{totalTrades !== 1 ? "s" : ""} analysés
        </span>
      </div>

      {totalTrades === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: T.textMut, fontSize: 13 }}>
          Aucune donnée pour générer la heatmap.
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 9, fontVariantNumeric: "tabular-nums", minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  {HOURS.map(h => (
                    <th key={h} style={{ padding: "2px 0", color: T.textMut, fontWeight: 500, textAlign: "center", minWidth: 22 }}>
                      {h % 3 === 0 ? `${h}h` : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d, di) => (
                  <tr key={d}>
                    <td style={{ padding: "2px 6px 2px 0", color: T.textMut, fontWeight: 600, fontSize: 10, textAlign: "right", whiteSpace: "nowrap" }}>{d}</td>
                    {HOURS.map(h => {
                      const c = grid[di][h];
                      return (
                        <td key={h} style={{ padding: 1 }}>
                          <div
                            role="img"
                            aria-label={c.trades > 0
                              ? `${d} ${h}h — ${c.trades} trade${c.trades > 1 ? "s" : ""} — ${fmt(c.pnl, true)}`
                              : `${d} ${h}h — aucun trade`}
                            title={c.trades > 0
                              ? `${d} ${h}h — ${c.trades} trade${c.trades > 1 ? "s" : ""} — ${fmt(c.pnl, true)}`
                              : `${d} ${h}h — aucun trade`}
                            style={{
                              width: "100%", height: 22, minWidth: 18,
                              background: cellColor(c.pnl, c.trades),
                              borderRadius: 3,
                              border: `1px solid ${c.trades > 0 ? "transparent" : T.border}`,
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top / Worst */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <RankBox
              title="Meilleurs créneaux"
              icon={TrendingUp}
              color={T.green}
              items={ranked.best}
              empty="Pas assez de données"
            />
            <RankBox
              title="Pires créneaux"
              icon={TrendingDown}
              color={T.red}
              items={ranked.worst}
              empty="Pas assez de données"
            />
          </div>
        </>
      )}
    </div>
  );
}

function RankBox({ title, icon: Icon, color, items, empty }: {
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  color: string;
  items: { day: number; hour: number; cell: Cell }[];
  empty: string;
}) {
  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Icon size={12} strokeWidth={2} color={color} />
        <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {title}
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: T.textMut }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <span style={{ color: T.textMut, minWidth: 60 }}>{DAYS[it.day]} {it.hour}h-{it.hour + 1}h</span>
              <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3 }}>
                {/* Double encodage : flèche en plus de la couleur (daltonisme) */}
                <span aria-hidden="true">{it.cell.pnl >= 0 ? "▲" : "▼"}</span>
                {fmt(it.cell.pnl, true)}
              </span>
              <span style={{ color: T.textMut, fontSize: 10 }}>{it.cell.trades}t</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
