/**
 * Design Tokens — Charte graphique inspiree d'OpenAI Platform
 * Source unique de verite pour couleurs, typo, espacements, radius, ombres.
 *
 * Utilisation dans les fichiers .ts/.tsx:
 *   import { tokens } from "@/lib/design/tokens";
 *   <div style={{ background: tokens.color.bg, color: tokens.color.text }} />
 *
 * Variables CSS equivalentes definies dans app/globals.css.
 */

export const tokens = {
  color: {
    // Surfaces
    bg: "#FFFFFF",
    bgSubtle: "#FAFAFA",
    sidebarBg: "#FFFFFF",
    cardBg: "#FFFFFF",
    hoverBg: "#F0F0F0",
    activeBg: "#EBEBEB",

    // Texte
    text: "#0D0D0D",
    textSub: "#5C5C5C",
    textMuted: "#8E8E8E",
    textInverted: "#FFFFFF",

    // Bordures
    border: "#E5E5E5",
    borderStrong: "#D4D4D4",
    borderFocus: "#0D0D0D",

    // Boutons
    btnPrimaryBg: "#0D0D0D",
    btnPrimaryText: "#FFFFFF",
    btnPrimaryHoverBg: "#262626",
    btnSecondaryBg: "#FFFFFF",
    btnSecondaryText: "#0D0D0D",
    btnSecondaryHoverBg: "#F5F5F5",

    // Status / accents
    success: "#16A34A",       // vert OpenAI signature
    successBg: "#F0FDF4",
    successBorder: "#86EFAC",
    warning: "#F97316",
    warningBg: "#FFF4E6",
    warningBorder: "#FCD9B6",
    danger: "#EF4444",
    dangerBg: "#FEF2F2",
    dangerBorder: "#FECACA",
    info: "#A855F7",
    infoBg: "#F5EDFF",
    infoBorder: "#DABFFC",

    // Charts
    chartGreen: "#16A34A",
    chartPurple: "#A855F7",
    chartOrange: "#F97316",
    chartRed: "#EF4444",
    chartBlue: "#3B82F6",
  },

  font: {
    sans: "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  // Echelle typo cible
  text: {
    pageTitle:    { size: 24, weight: 700, lineHeight: 1.2 },
    sectionTitle: { size: 16, weight: 600, lineHeight: 1.3 },
    cardTitle:    { size: 14, weight: 600, lineHeight: 1.4 },
    statValue:    { size: 28, weight: 600, lineHeight: 1.1 },
    body:         { size: 14, weight: 400, lineHeight: 1.55 },
    bodyStrong:   { size: 14, weight: 500, lineHeight: 1.55 },
    label:        { size: 12, weight: 500, lineHeight: 1.4 },
    muted:        { size: 11, weight: 500, lineHeight: 1.4 },
  },

  radius: {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 12,
    "2xl": 16,
    full: 9999,
  },

  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
  },

  shadow: {
    none: "none",
    xs: "0 1px 2px rgba(0, 0, 0, 0.04)",
    sm: "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
    md: "0 4px 12px rgba(0, 0, 0, 0.08)",
    lg: "0 10px 30px rgba(0, 0, 0, 0.10)",
    focus: "0 0 0 2px #FFFFFF, 0 0 0 4px #0D0D0D",
  },

  // Aligné sur les courbes custom de globals.css (--ease-out / --ease-in-out).
  // La courbe Material (0.4,0,0.2,1) est trop molle → on utilise la même
  // ease-out punchy que le reste du site pour une cohérence totale.
  motion: {
    fast: "150ms cubic-bezier(0.23, 1, 0.32, 1)",
    base: "200ms cubic-bezier(0.23, 1, 0.32, 1)",
    slow: "280ms cubic-bezier(0.23, 1, 0.32, 1)",
    easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
    easeInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },

  layout: {
    sidebarWidth: 220,
    sidebarWidthCollapsed: 56,
    contentMaxWidth: 1200,
  },
} as const;

export type Tokens = typeof tokens;

// Helpers ergonomiques
export const t = tokens;
