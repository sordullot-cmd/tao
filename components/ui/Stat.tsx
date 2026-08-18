"use client";

import React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { CountUp } from "./CountUp";

interface StatProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  trend?: { value: number; period?: string };
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  positive?: boolean;
  negative?: boolean;
  onClick?: () => void;
  /** Sans bordure ni arrondi propre — pour coller plusieurs Stat dans un conteneur commun. */
  flat?: boolean;
  /**
   * Anime la valeur en count-up. Passe la valeur numérique cible ici (au lieu
   * de `value`) ; `format`/`prefix`/`suffix`/`decimals` contrôlent l'affichage.
   * Si absent, `value` (ReactNode) est rendu tel quel.
   */
  countUp?: number;
  countUpFormat?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function Stat({ label, value, subtext, trend, icon: Icon, size = "md", positive, negative, onClick, flat, countUp, countUpFormat, prefix, suffix, decimals }: StatProps) {
  const valueSize = size === "sm" ? 18 : size === "md" ? 24 : 32;
  const labelSize = 11;

  const valueColor = positive ? "var(--color-green, #58CC02)" : negative ? "var(--color-red, #FF4B4B)" : "var(--color-text, #0D0D0D)";

  const content = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {Icon && <Icon size={13} strokeWidth={1.75} color="var(--color-text-muted, #6B6B6B)" />}
        <span style={{ fontSize: labelSize, fontWeight: 500, color: "var(--color-text-muted, #6B6B6B)", textTransform: "uppercase", letterSpacing: 0.4 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: valueSize, fontWeight: 600, color: valueColor, lineHeight: 1.1, fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>
        {typeof countUp === "number"
          ? <CountUp value={countUp} format={countUpFormat} prefix={prefix} suffix={suffix} decimals={decimals ?? 0} />
          : value}
      </div>
      {(subtext || trend) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11, color: "var(--color-text-sub, #5C5C5C)" }}>
          {trend && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: trend.value >= 0 ? "var(--color-green, #58CC02)" : "var(--color-red, #FF4B4B)", fontWeight: 600 }}>
              {trend.value >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {trend.value >= 0 ? "+" : ""}{trend.value.toFixed(1)}%
              {trend.period && <span style={{ color: "var(--color-text-muted, #6B6B6B)", fontWeight: 400 }}>{trend.period}</span>}
            </span>
          )}
          {subtext && <span>{subtext}</span>}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        style={{
          background: "var(--color-card-bg, #FFFFFF)",
          border: flat ? "none" : "1px solid var(--color-border, #E5E5E5)",
          borderRadius: flat ? 0 : "var(--radius-card, 10px)",
          padding: 20,
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border-strong, #D4D4D4)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.06)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border, #E5E5E5)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div style={{
      background: "var(--color-card-bg, #FFFFFF)",
      border: flat ? "none" : "1px solid var(--color-border, #E5E5E5)",
      borderRadius: flat ? 0 : 12,
      padding: 20,
    }}>
      {content}
    </div>
  );
}
