"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface WinRateChartProps {
  trades: any[];
}

export function WinRateChart({ trades }: WinRateChartProps) {
  // Calculer le win rate par jour
  const dataByDay = trades.reduce(
    (acc: any, trade: any) => {
      const dObj = new Date(trade.entry_time);
      const date = dObj.toLocaleDateString("fr-FR");
      const ts = dObj.getTime();
      if (!acc[date]) {
        acc[date] = { date, ts, wins: 0, total: 0, winRate: 0 };
      }
      if (!isNaN(ts)) acc[date].ts = Math.min(acc[date].ts || ts, ts);
      acc[date].total++;
      if (trade.pnl > 0) acc[date].wins++;
      acc[date].winRate = ((acc[date].wins / acc[date].total) * 100).toFixed(1);
      return acc;
    },
    {}
  );

  const data = Object.values(dataByDay)
    .sort((a: any, b: any) => (a.ts || 0) - (b.ts || 0))
    .slice(-30)
    .map((d: any) => ({
      ...d,
      winRate: parseFloat(d.winRate),
    }));

  if (data.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          background: "var(--color-bg-subtle, #F1F2F4)",
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
        Évolution du win rate (30 derniers jours)
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
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
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "var(--color-text-muted, #6B6B6B)" }}
            stroke="var(--color-border-strong, #D4D4D4)"
            label={{ value: "%", angle: -90, position: "insideLeft", fill: "var(--color-text-muted, #6B6B6B)" }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-card-bg, #FFFFFF)",
              border: "1px solid var(--color-border, #E5E5E5)",
              borderRadius: 8,
              padding: 8,
              color: "var(--color-text)",
            }}
            formatter={(value: any) => [`${value.toFixed(1)}%`, "Win Rate"]}
            labelFormatter={(label) => `Date : ${label}`}
          />
          <Line
            type="monotone"
            dataKey="winRate"
            stroke="var(--color-green, #58CC02)"
            strokeWidth={3}
            dot={{ fill: "var(--color-green, #58CC02)", r: 4 }}
            activeDot={{ r: 6 }}
            name="Win Rate %"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
