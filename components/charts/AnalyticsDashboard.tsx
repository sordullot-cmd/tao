"use client";

import React from "react";
import {
  MetricsCards,
  WinRateChart,
  PnLTrendChart,
  EmotionDistribution,
  HourlyHeatmap,
} from "./index";

interface AnalyticsDashboardProps {
  trades: any[];
  stats: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    totalPnL: number;
    monthlyPnL: number;
    avgRiskReward: number;
    topEmotions: Array<{ emotion: string; frequency: number; avgPnL: number }>;
  };
}

export function AnalyticsDashboard({ trades, stats }: AnalyticsDashboardProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Metrics Cards */}
      <MetricsCards
        totalTrades={stats.totalTrades}
        winRate={stats.winRate}
        profitFactor={stats.profitFactor}
        totalPnL={stats.totalPnL}
        monthlyPnL={stats.monthlyPnL}
        avgRiskReward={stats.avgRiskReward}
      />

      {/* Row 1: Win Rate Chart + P&L Trend */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: 20,
        }}
      >
        <WinRateChart trades={trades} />
        <PnLTrendChart trades={trades} />
      </div>

      {/* Row 2: Emotion Distribution — pleine largeur assumée (un seul enfant,
          pas de grid auto-fit qui étirerait une carte solitaire). */}
      <EmotionDistribution topEmotions={stats.topEmotions} />

      {/* Row 3: Full-width Heatmap */}
      <HourlyHeatmap trades={trades} />
    </div>
  );
}
