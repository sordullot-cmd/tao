"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hoverable?: boolean;
  accent?: "default" | "primary" | "success" | "warning" | "danger" | "info";
}

export function Card({ padded = true, hoverable = false, accent = "default", style, children, onMouseEnter, onMouseLeave, ...rest }: CardProps) {
  const accentBorders: Record<string, string> = {
    default: "transparent",
    primary: "var(--color-text, #0D0D0D)",
    success: "var(--color-green, #16A34A)",
    warning: "var(--color-amber, #F97316)",
    danger: "var(--color-red, #EF4444)",
    info: "var(--color-info, #A855F7)",
  };
  const accentColor = accentBorders[accent];

  return (
    <div
      style={{
        background: "var(--color-card-bg, #FFFFFF)",
        border: "1px solid var(--color-border, #E5E5E5)",
        borderRadius: "var(--radius-card, 10px)",
        padding: padded ? 20 : 0,
        boxShadow: "var(--elev-rest, 0 1px 2px rgba(0, 0, 0, 0.04))",
        transition:
          "border-color 200ms cubic-bezier(0.23,1,0.32,1), box-shadow 200ms cubic-bezier(0.23,1,0.32,1), transform 200ms cubic-bezier(0.23,1,0.32,1)",
        position: "relative",
        ...(accent !== "default" && { borderLeft: `3px solid ${accentColor}` }),
        ...style,
      }}
      onMouseEnter={(e) => {
        if (hoverable) {
          e.currentTarget.style.borderColor = "var(--color-border-strong, #D4D4D4)";
          e.currentTarget.style.boxShadow = "var(--elev-hover, 0 4px 12px rgba(0, 0, 0, 0.06))";
          e.currentTarget.style.transform = "translateY(-1px)";
        }
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (hoverable) {
          e.currentTarget.style.borderColor = "var(--color-border, #E5E5E5)";
          e.currentTarget.style.boxShadow = "var(--elev-rest, 0 1px 2px rgba(0, 0, 0, 0.04))";
          e.currentTarget.style.transform = "translateY(0)";
        }
        onMouseLeave?.(e);
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  onClick?: () => void;
  showChevron?: boolean;
}

export function CardHeader({ title, subtitle, action, onClick, showChevron = false }: CardHeaderProps) {
  const titleNode = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text, #0D0D0D)" }}>{title}</span>
      {showChevron && <ChevronRight size={14} strokeWidth={2} color="var(--color-text-muted, #6B6B6B)" />}
    </span>
  );

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: subtitle ? 4 : 12 }}>
      <div>
        {onClick ? (
          <button
            onClick={onClick}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {titleNode}
          </button>
        ) : (
          titleNode
        )}
        {subtitle && <div style={{ fontSize: 11, color: "var(--color-text-muted, #6B6B6B)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
