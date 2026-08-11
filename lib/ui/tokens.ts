/**
 * Design tokens (OpenAI-style palette). Centralisé pour éviter la duplication
 * dans chaque composant. Les composants peuvent aussi utiliser les CSS vars
 * directement pour supporter le dark mode (var(--color-text), etc.).
 */
// Tokens passés en CSS vars : ainsi les composants qui font
// `style={{ background: T.white, border: \`1px solid ${T.border}\` }}`
// suivent automatiquement le thème sombre via les overrides définis dans
// app/globals.css (`:root[data-theme="dark"] { --color-bg: …; }`).
// Les fallbacks après la virgule conservent le comportement clair par défaut.
export const T = {
  white:    "var(--color-card-bg, #FFFFFF)",
  bg:       "var(--color-bg, #FFFFFF)",
  surface:  "var(--color-card-bg, #FFFFFF)",
  border:   "var(--color-border, #E5E5E5)",
  border2:  "var(--color-border-strong, #D4D4D4)",
  text:     "var(--color-text, #0D0D0D)",
  textSub:  "var(--color-text-sub, #5C5C5C)",
  textMut:  "var(--color-text-muted, #6B6B6B)",
  green:    "var(--color-green, #16A34A)",
  greenBg:  "var(--color-green-bg, #F0FDF4)",
  greenBd:  "var(--color-green-bd, #86EFAC)",
  red:      "var(--color-red, #EF4444)",
  redBg:    "var(--color-red-bg, #FEF2F2)",
  redBd:    "var(--color-red-bd, #FECACA)",
  accent:   "var(--color-text, #0D0D0D)",
  accentBg: "var(--color-hover-bg, #F0F0F0)",
  accentBd: "var(--color-border-strong, #D4D4D4)",
  amber:    "var(--color-amber, #F97316)",
  amberBg:  "var(--color-amber-bg, #FFF4E6)",
  amberBd:  "var(--color-amber-bd, #FED7AA)",
  blue:     "var(--color-blue, #3B82F6)",
  blueBd:   "var(--color-blue-bd, #BFDBFE)",
  blueBg:   "var(--color-blue-bg, #EFF6FF)",
  purple:   "var(--color-purple, #8B5CF6)",
  purpleBg: "var(--color-purple-bg, #F5F3FF)",
  purpleBd: "var(--color-purple-bd, #DDD6FE)",
  cyan:     "var(--color-cyan, #06B6D4)",
  // Accent signature style Kraken (violet/indigo) — courbe portefeuille & pastilles
  kraken:   "var(--color-kraken, #7C4DFF)",
  krakenBg: "var(--color-kraken-bg, #F4F0FF)",

  // === Nouvelle DA (maquette Figma « Tableau de bord ») ===
  // Navigation
  navActiveBg:   "var(--color-nav-active-bg, rgba(156,123,255,0.10))",
  navActiveText: "var(--color-nav-active-text, #9C7BFF)",
  // Chiffres P&L
  pnlPos:   "var(--color-pnl-pos, #008932)",
  pnlNeg:   "var(--color-pnl-neg, #B90707)",
  numMuted: "var(--color-num-muted, #C0C0C0)",
  // Tags de direction (Long / Short)
  tagShortBg:   "var(--color-tag-short-bg, #FFE7CA)",
  tagShortText: "var(--color-tag-short-text, #AD4E00)",
  tagLongBg:    "var(--color-tag-long-bg, #CAFFF3)",
  tagLongText:  "var(--color-tag-long-text, #007E6B)",
  // Vignette ronde d'un instrument (maquette « Trades », node 283:6381)
  symbolBadge:     "var(--color-symbol-badge, #018FBF)",
  symbolBadgeText: "var(--color-symbol-badge-text, #FFFFFF)",
  // Calendrier P&L
  calEmptyBg:   "var(--color-cal-empty-bg, #FAFBFB)",
  calEmptyText: "var(--color-cal-empty-text, rgba(13,13,13,0.30))",
  calPosBg:     "var(--color-cal-pos-bg, rgba(0,255,106,0.20))",
  calPosText:   "var(--color-cal-pos-text, #06700D)",
  calNegBg:     "var(--color-cal-neg-bg, rgba(255,0,4,0.20))",
  calNegText:   "var(--color-cal-neg-text, #D30004)",
  // Variante « grande cellule » (page Calendrier) : aplat dilué + encres dédiées
  calPosSurface: "var(--color-cal-pos-surface, rgba(0,255,106,0.05))",
  calNegSurface: "var(--color-cal-neg-surface, rgba(255,0,4,0.05))",
  calPosDay:     "var(--color-cal-pos-day, rgba(10,54,13,0.51))",
  calNegDay:     "var(--color-cal-neg-day, rgba(95,8,9,0.51))",
  calPosSub:     "var(--color-cal-pos-sub, #06590C)",
  // Piste d'un sélecteur segmenté
  segmentTrack: "var(--color-segment-track, rgba(28,31,33,0.05))",
  // Ligne de tableau mise en avant
  rowHighlight: "var(--color-row-highlight, rgba(13,13,13,0.04))",
  // Ombres
  elevCard: "var(--elev-card, 0 0 2.2px 0 rgba(0,0,0,0.07))",
  elevPill: "var(--elev-pill, 0 0 1.1px rgba(0,0,0,0.07))",
  // Encre sur fond contrasté
  textInverted: "var(--color-text-inverted, #FFFFFF)",
  onSolid:      "var(--color-on-solid, #FFFFFF)",
  scrim:        "var(--color-scrim, rgba(0,0,0,0.45))",
} as const;

/** Opacité des séries secondaires d'un graphique multi-comptes. */
export const SERIES_BG_OPACITY = "var(--opacity-series-bg, 0.35)";

export type Tokens = typeof T;
