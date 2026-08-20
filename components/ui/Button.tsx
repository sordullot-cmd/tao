"use client";

import React, { forwardRef } from "react";
import { BTN } from "@/lib/ui/buttons";
import { Loader2, LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon: Icon,
    iconPosition = "left",
    fullWidth = false,
    children,
    style,
    onMouseEnter,
    onMouseLeave,
    disabled,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  /* Les trois tailles ne sont plus décrites ici : elles viennent de BTN
     (lib/ui/buttons.ts), qui est la seule table de hauteurs de boutons du
     site. Ce composant en donnait sa propre version — proche, mais pas
     identique à celle de `PillButton` — et deux boutons de la même « taille
     md » ne faisaient donc pas la même hauteur selon le composant employé.
     `height` et non `minHeight` : ce bouton-ci fixe sa hauteur. */
  const sizeStyles: Record<Size, React.CSSProperties> = {
    sm: { padding: BTN.sm.padding, fontSize: BTN.sm.fontSize, height: BTN.sm.minHeight, borderRadius: BTN.sm.borderRadius },
    md: { padding: BTN.md.padding, fontSize: BTN.md.fontSize, height: BTN.md.minHeight, borderRadius: BTN.md.borderRadius },
    lg: { padding: BTN.lg.padding, fontSize: BTN.lg.fontSize, height: BTN.lg.minHeight, borderRadius: BTN.lg.borderRadius },
  };

  const iconSize = size === "sm" ? 13 : size === "md" ? 14 : 16;

  const variantStyles: Record<Variant, React.CSSProperties> = {
    primary: { background: "var(--color-btn-primary-bg, #0D0D0D)", color: "var(--color-btn-primary-text, #FFFFFF)", border: "1px solid var(--color-btn-primary-bg, #0D0D0D)" },
    secondary: { background: "var(--color-card-bg, #FFFFFF)", color: "var(--color-text, #0D0D0D)", border: "1px solid var(--color-border, #E5E5E5)" },
    ghost: { background: "transparent", color: "var(--color-text, #0D0D0D)", border: "1px solid transparent" },
    danger: { background: "var(--color-danger, #FF4B4B)", color: "#FFFFFF", border: "1px solid var(--color-danger, #FF4B4B)" },
  };

  const hoverBg: Record<Variant, string> = {
    primary: "var(--color-btn-primary-hover, #262626)",
    secondary: "var(--color-hover-bg, #F5F5F5)",
    ghost: "var(--color-hover-bg, #F0F0F0)",
    danger: "#DC2626",
  };

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontWeight: variant === "primary" || variant === "danger" ? 600 : 500,
    fontFamily: "var(--font-sans)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.55 : 1,
    /* `background-color` et non `background` : le raccourci embarque aussi
       `background-image`, `background-position` et compagnie — on demandait au
       navigateur de surveiller cinq propriétés pour n'en faire varier qu'une.
       Courbes prises dans les tokens plutôt que réécrites à la main : elles
       étaient recopiées littéralement à douze endroits du site, ce qui rendait
       toute correction de la courbe illusoire. */
    transition:
      "background-color 150ms var(--ease-out), color 150ms var(--ease-out), border-color 150ms var(--ease-out), transform 160ms var(--ease-out), box-shadow 150ms var(--ease-out)",
    width: fullWidth ? "100%" : undefined,
    whiteSpace: "nowrap",
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style,
  };

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          const el = e.currentTarget;
          /* Valeur de départ réelle, pas celle de la variante : un bouton avec
             `style={{ background: … }}` se voyait repeindre aux couleurs de sa
             variante dès qu'on le survolait une fois. */
          el.dataset.restBg = el.style.background || (variantStyles[variant].background as string);
          el.style.background = hoverBg[variant];
        }
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = el.dataset.restBg || (variantStyles[variant].background as string);
        onMouseLeave?.(e);
      }}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} strokeWidth={2} className="anim-spin" />
      ) : (
        Icon && iconPosition === "left" && <Icon size={iconSize} strokeWidth={1.75} />
      )}
      {children && <span>{children}</span>}
      {!loading && Icon && iconPosition === "right" && <Icon size={iconSize} strokeWidth={1.75} />}
    </button>
  );
});

export default Button;
