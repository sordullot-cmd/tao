"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { hasFinePointer } from "@/lib/ui/pointer";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hoverable?: boolean;
  accent?: "default" | "primary" | "success" | "warning" | "danger" | "info";
}

export function Card({ padded = true, hoverable = false, accent = "default", style, children, onMouseEnter, onMouseLeave, ...rest }: CardProps) {
  const accentBorders: Record<string, string> = {
    default: "transparent",
    primary: "var(--color-text, #0D0D0D)",
    success: "var(--color-green, #58CC02)",
    warning: "var(--color-amber, #FF9600)",
    danger: "var(--color-red, #FF4B4B)",
    info: "var(--color-info, #CE82FF)",
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
          "border-color 200ms var(--ease-out), box-shadow 200ms var(--ease-out), transform 200ms var(--ease-out)",
        position: "relative",
        ...(accent !== "default" && { borderLeft: `3px solid ${accentColor}` }),
        ...style,
      }}
      onMouseEnter={(e) => {
        /* Le soulèvement est réservé aux pointeurs précis : au doigt, le survol
           se déclenche à l'appui et ne se relâche jamais — la carte resterait
           levée. */
        if (hoverable && hasFinePointer()) {
          const el = e.currentTarget;
          /* On mémorise les valeurs RÉELLES de départ au lieu de réécrire
             celles de la variante au relâchement. Une carte à qui l'appelant
             passe `style={{ borderColor: … }}` perdait sa bordure au premier
             survol : on lui rendait le gris par défaut, jamais la sienne. */
          /* Lecture avec repli. `border` est posé en raccourci et contient un
             `var()` : le navigateur ne peut pas le décomposer à l'analyse, si
             bien que relire `style.borderColor` renvoie une chaîne vide. La
             restaurer telle quelle effacerait la couleur de bordure — qui
             retomberait sur `currentColor`, donc sur la couleur du texte. */
          el.dataset.restBorder = el.style.borderColor || "var(--color-border, #E5E5E5)";
          el.dataset.restShadow = el.style.boxShadow || "var(--elev-rest, 0 1px 2px rgba(0, 0, 0, 0.04))";
          el.dataset.restTransform = el.style.transform || "translateY(0)";
          el.style.borderColor = "var(--color-border-strong, #D4D4D4)";
          el.style.boxShadow = "var(--elev-hover, 0 4px 12px rgba(0, 0, 0, 0.06))";
          el.style.transform = "translateY(-1px)";
        }
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (hoverable) {
          const el = e.currentTarget;
          el.style.borderColor = el.dataset.restBorder || "var(--color-border, #E5E5E5)";
          el.style.boxShadow = el.dataset.restShadow || "var(--elev-rest, 0 1px 2px rgba(0, 0, 0, 0.04))";
          el.style.transform = el.dataset.restTransform || "translateY(0)";
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
