"use client";

import React from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PnLTrendChartProps {
  trades: any[];
}

export function PnLTrendChart({ trades }: PnLTrendChartProps) {
  // Calculer le P&L par jour (on conserve un horodatage `ts` pour trier
  // chronologiquement — la clé `date` en "JJ/MM/AAAA" n'est pas triable telle quelle).
  const dataByDay = trades.reduce(
    (acc: any, trade: any) => {
      const d = new Date(trade.entry_time);
      const date = d.toLocaleDateString("fr-FR");
      const ts = d.getTime();
      if (!acc[date]) {
        acc[date] = { date, ts, pnl: 0, wins: 0, losses: 0 };
      }
      if (!isNaN(ts)) acc[date].ts = Math.min(acc[date].ts || ts, ts);
      acc[date].pnl += trade.pnl || 0;
      if (trade.pnl > 0) acc[date].wins++;
      if (trade.pnl < 0) acc[date].losses++;
      return acc;
    },
    {}
  );

  const data = Object.values(dataByDay)
    .sort((a: any, b: any) => (a.ts || 0) - (b.ts || 0))
    .slice(-30)
    .map((d: any) => ({
      ...d,
      pnl: parseFloat(d.pnl.toFixed(2)),
    }));

  if (data.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          background: "var(--color-bg-subtle, #FAFAFA)",
          borderRadius: 12,
          textAlign: "center",
          color: "var(--color-text-muted, #6B6B6B)",
        }}
      >
        Pas assez de données
      </div>
    );
  }

  return (
    <div style={{ background: "var(--color-card-bg, #FFFFFF)", padding: 20, borderRadius: 12 }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600, color: "var(--color-text)" }}>
        P&L par jour (30 derniers jours)
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #E5E5E5)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "var(--color-text-muted, #6B6B6B)" }}
            stroke="var(--color-border-strong, #D4D4D4)"
            interval="preserveStartEnd"
            minTickGap={24}
            tickFormatter={(val) => {
              const parts = val.split("/");
              return `${parts[0]}/${parts[1]}`;
            }}
          />
          <YAxis tick={{ fontSize: 12, fill: "var(--color-text-muted, #6B6B6B)" }} stroke="var(--color-border-strong, #D4D4D4)" />
          <Tooltip
            contentStyle={{
              background: "var(--color-card-bg, #FFFFFF)",
              border: "1px solid var(--color-border, #E5E5E5)",
              borderRadius: 8,
              padding: 8,
              color: "var(--color-text)",
            }}
            cursor={{ fill: "var(--color-hover-bg, #F0F0F0)", opacity: 0.4 }}
            formatter={(value: any) => [`${value.toFixed(2)}$`, "P&L"]}
            labelFormatter={(label) => `Date : ${label}`}
          />
          <Bar dataKey="pnl" radius={[4, 4, 0, 0]} name="P&L ($)">
            {data.map((entry: any, i: number) => (
              <Cell key={i} fill={entry.pnl >= 0 ? "var(--color-green, #16A34A)" : "var(--color-red, #EF4444)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
