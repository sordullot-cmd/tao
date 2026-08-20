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
  green:    "var(--color-green, #58CC02)",
  greenBg:  "var(--color-green-bg, color-mix(in srgb, #58CC02 12%, transparent))",
  greenBd:  "var(--color-green-bd, color-mix(in srgb, #58CC02 45%, transparent))",
  red:      "var(--color-red, #FF4B4B)",
  redBg:    "var(--color-red-bg, color-mix(in srgb, #FF4B4B 12%, transparent))",
  redBd:    "var(--color-red-bd, color-mix(in srgb, #FF4B4B 45%, transparent))",
  accent:   "var(--color-text, #0D0D0D)",
  accentBg: "var(--color-hover-bg, #F0F0F0)",
  accentBd: "var(--color-border-strong, #D4D4D4)",
  amber:    "var(--color-amber, #FF9600)",
  amberBg:  "var(--color-amber-bg, color-mix(in srgb, #FF9600 12%, transparent))",
  amberBd:  "var(--color-amber-bd, color-mix(in srgb, #FF9600 45%, transparent))",
  blue:     "var(--color-blue, #1CB0F6)",
  blueBd:   "var(--color-blue-bd, color-mix(in srgb, #1CB0F6 45%, transparent))",
  blueBg:   "var(--color-blue-bg, color-mix(in srgb, #1CB0F6 12%, transparent))",
  purple:   "var(--color-purple, #CE82FF)",
  purpleBg: "var(--color-purple-bg, color-mix(in srgb, #CE82FF 12%, transparent))",
  purpleBd: "var(--color-purple-bd, color-mix(in srgb, #CE82FF 45%, transparent))",
  cyan:     "var(--color-cyan, #7AF0F2)",
  // Accent signature style Kraken — courbe portefeuille & pastilles.
  // La teinte vient de `--accent-*` (bloc « ACCENT DE MARQUE » de globals.css) ;
  // les hex ici ne servent que de repli si la feuille n'est pas chargée.
  kraken:   "var(--color-kraken, #4CC72C)",
  krakenBg: "var(--color-kraken-bg, #EEFBEA)",
  // Couleur PRINCIPALE de l'app (`--accent`, réglable dans Réglages →
  // Apparence) : aplats d'action, éléments actifs, remplissages de jauge. Là où
  // l'interface posait un aplat d'encre noire pour dire « action principale »,
  // c'est `brand` qu'il faut. L'encre lisible dessus est `onSolid` (blanc dans
  // les deux thèmes) — PAS `textInverted`, qui s'inverse en sombre alors que
  // l'accent, lui, ne change pas. `brandSoft` est son voile (fonds discrets).
  brand:     "var(--accent, #64D741)",
  brandSoft: "var(--accent-soft, rgba(100,215,65,0.10))",

  // === Nouvelle DA (maquette Figma « Tableau de bord ») ===
  // Navigation
  navActiveBg:   "var(--color-nav-active-bg, rgba(100,215,65,0.10))",
  navActiveText: "var(--color-nav-active-text, #64D741)",
  // Chiffres P&L
  pnlPos:   "var(--color-pnl-pos, #58CC02)",
  pnlNeg:   "var(--color-pnl-neg, #FF4B4B)",
  numMuted: "var(--color-num-muted, #C0C0C0)",
  // Tags de direction (Long / Short)
  tagShortBg:   "var(--color-tag-short-bg, color-mix(in srgb, #FF9600 16%, transparent))",
  tagShortText: "var(--color-tag-short-text, #FF9600)",
  tagLongBg:    "var(--color-tag-long-bg, color-mix(in srgb, #58CC02 16%, transparent))",
  tagLongText:  "var(--color-tag-long-text, #58CC02)",
  // Vignette ronde d'un instrument (maquette « Trades », node 283:6381)
  symbolBadge:     "var(--color-symbol-badge, #018FBF)",
  /* Le sigle du disque est blanc, sans variable qui puisse le reprendre : une
     passe de palette l'avait descendu à l'encre et les « 100 » / « 500 » des
     vignettes d'instruments s'écrivaient en noir sur leur couleur de marque.
     Ces vignettes sont des logos, pas une surface de thème. */
  symbolBadgeText: "#FFFFFF",
  // Calendrier P&L
  calEmptyBg:   "var(--color-cal-empty-bg, #FAFBFB)",
  calEmptyText: "var(--color-cal-empty-text, rgba(13,13,13,0.30))",
  calPosBg:     "var(--color-cal-pos-bg, color-mix(in srgb, #58CC02 24%, transparent))",
  calPosText:   "var(--color-cal-pos-text, #58CC02)",
  calNegBg:     "var(--color-cal-neg-bg, color-mix(in srgb, #FF4B4B 24%, transparent))",
  calNegText:   "var(--color-cal-neg-text, #FF4B4B)",
  // Variante « grande cellule » (page Calendrier) : aplat dilué + encres dédiées
  calPosSurface: "var(--color-cal-pos-surface, color-mix(in srgb, #58CC02 7%, transparent))",
  calNegSurface: "var(--color-cal-neg-surface, color-mix(in srgb, #FF4B4B 7%, transparent))",
  calPosDay:     "var(--color-cal-pos-day, color-mix(in srgb, #58CC02 85%, transparent))",
  calNegDay:     "var(--color-cal-neg-day, color-mix(in srgb, #FF4B4B 85%, transparent))",
  calPosSub:     "var(--color-cal-pos-sub, #58CC02)",
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

/* ── Aplats et traits de la DA ──────────────────────────────────────────────
   Exprimés en TRANSPARENCE d'encre plutôt qu'en gris opaque : ils s'assombrissent
   ou s'éclaircissent tout seuls avec la surface qui les porte, et n'ont donc pas
   besoin d'un équivalent défini pour le thème sombre.

   Ils vivent ici, et non dans `components/ui/da.jsx` où ils étaient définis,
   parce que `components/ui/form.jsx` en a besoin AUSSI : les faire transiter
   par `da.jsx` — qui réexporte form.jsx — formait un cycle d'import, et le
   premier des deux modules chargés lisait alors des constantes encore dans
   leur zone morte. `da.jsx` les réexporte pour ne casser aucun import existant.
   -------------------------------------------------------------------------- */

/** Trait dilué : contour d'une case à cocher, d'une zone de dépôt, limite d'une
 *  zone qui défile — là où un bord doit se deviner sans devenir un cadre. */
export const HAIRLINE = "color-mix(in srgb, var(--color-text) 8%, transparent)";

/** Aplat d'un contrôle (pastille, champ, piste, ligne survolée). Assez pour
 *  délimiter une petite surface, trop peu pour faire un bloc dans le bloc. */
export const FIELD_BG = "color-mix(in srgb, var(--color-text) 4%, transparent)";

/** Aplat d'une zone d'écriture. Plus dilué que `FIELD_BG` : sur cent pixels de
 *  haut, le même gris ferait un pavé. */
export const WRITING_BG = "color-mix(in srgb, var(--color-text) 1.2%, transparent)";

/** Opacité des séries secondaires d'un graphique multi-comptes. */
export const SERIES_BG_OPACITY = "var(--opacity-series-bg, 0.35)";

export type Tokens = typeof T;
