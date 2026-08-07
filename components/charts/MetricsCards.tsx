import React from "react";
import { T } from "@/lib/ui/tokens";

interface MetricsCardsProps {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalPnL: number;
  monthlyPnL: number;
  avgRiskReward: number;
}

// Fond de carte neutre, dark-aware.
const CARD_BG = "var(--color-hover-bg, #FAFAFA)";
const CARD_BG_HOVER = "var(--color-border, #E5E5E5)";

export function MetricsCards({
  totalTrades,
  winRate,
  profitFactor,
  totalPnL,
  monthlyPnL,
  avgRiskReward,
}: MetricsCardsProps) {
  // Couleurs neutres par défaut (T.text) ; seul le P&L porte un sens vert/rouge.
  const pnlColor = (v: number) => (v > 0 ? T.green : v < 0 ? T.red : T.text);

  const metrics: Array<{ label: string; value: number; format: string; color: string; icon: string }> = [
    { label: "Total Trades", value: totalTrades, format: "number", color: T.text, icon: "📊" },
    { label: "Win Rate", value: winRate, format: "percent", color: T.text, icon: "🎯" },
    { label: "Profit Factor", value: profitFactor, format: "decimal", color: T.text, icon: "📈" },
    { label: "Total P&L", value: totalPnL, format: "currency", color: pnlColor(totalPnL), icon: "💰" },
    { label: "Monthly P&L", value: monthlyPnL, format: "currency", color: pnlColor(monthlyPnL), icon: "📅" },
    { label: "Avg R:R", value: avgRiskReward, format: "decimal", color: T.text, icon: "⚖️" },
  ];

  const formatValue = (val: number, format: string) => {
    // profitFactor (et R:R) peuvent valoir Infinity (aucune perte) → afficher "∞".
    if (!isFinite(val)) return "∞";
    switch (format) {
      case "percent":
        return `${val.toFixed(1)}%`;
      case "currency":
        return `${val > 0 ? "+" : ""}${val.toFixed(2)}$`;
      case "decimal":
        return val.toFixed(2);
      default:
        return val.toFixed(0);
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}
    >
      {metrics.map((metric, i) => (
        <div
          key={i}
          style={{
            padding: 16,
            background: CARD_BG,
            border: `1px solid ${T.border}`,
            borderRadius: "var(--radius-card)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = CARD_BG_HOVER;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = CARD_BG;
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 20 }}>{metric.icon}</span>
            <span
              style={{
                fontSize: 11,
                color: T.textSub,
                fontWeight: 500,
                letterSpacing: 0.2,
              }}
            >
              {metric.label}
            </span>
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: metric.color,
            }}
          >
            {formatValue(metric.value, metric.format)}
          </div>
        </div>
      ))}
    </div>
  );
}
