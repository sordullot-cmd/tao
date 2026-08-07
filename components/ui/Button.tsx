"use client";

import React, { forwardRef } from "react";
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

  const sizeStyles: Record<Size, React.CSSProperties> = {
    sm: { padding: "6px 12px", fontSize: 12, height: 28, borderRadius: 999 },
    md: { padding: "8px 16px", fontSize: 13, height: 34, borderRadius: 999 },
    lg: { padding: "10px 20px", fontSize: 14, height: 40, borderRadius: 999 },
  };

  const iconSize = size === "sm" ? 13 : size === "md" ? 14 : 16;

  const variantStyles: Record<Variant, React.CSSProperties> = {
    primary: { background: "var(--color-btn-primary-bg, #0D0D0D)", color: "var(--color-btn-primary-text, #FFFFFF)", border: "1px solid var(--color-btn-primary-bg, #0D0D0D)" },
    secondary: { background: "var(--color-card-bg, #FFFFFF)", color: "var(--color-text, #0D0D0D)", border: "1px solid var(--color-border, #E5E5E5)" },
    ghost: { background: "transparent", color: "var(--color-text, #0D0D0D)", border: "1px solid transparent" },
    danger: { background: "var(--color-danger, #EF4444)", color: "#FFFFFF", border: "1px solid var(--color-danger, #EF4444)" },
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
    transition:
      "background 150ms cubic-bezier(0.23,1,0.32,1), color 150ms cubic-bezier(0.23,1,0.32,1), border-color 150ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1), box-shadow 150ms cubic-bezier(0.23,1,0.32,1)",
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
        if (!isDisabled) e.currentTarget.style.background = hoverBg[variant];
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = variantStyles[variant].background as string;
        onMouseLeave?.(e);
      }}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} strokeWidth={2} style={{ animation: "spin 0.8s linear infinite" }} />
      ) : (
        Icon && iconPosition === "left" && <Icon size={iconSize} strokeWidth={1.75} />
      )}
      {children && <span>{children}</span>}
      {!loading && Icon && iconPosition === "right" && <Icon size={iconSize} strokeWidth={1.75} />}
    </button>
  );
});

export default Button;
