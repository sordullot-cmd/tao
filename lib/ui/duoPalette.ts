/**
 * Palette Duolingo — source unique des teintes d'IDENTITÉ des sections
 * « Vie perso » et « Finance ».
 *
 * Reprise telle quelle de la page « color » de la charte Duolingo
 * (Figma `mqFgieIhnaljGeybhJRY0V`, nœud 582:5101) : les valeurs de `DUO` sont
 * les hex publiés, sans retouche. C'est volontaire — on veut d'abord voir la
 * marque à l'écran, la question de la lisibilité se tranche ensuite.
 *
 * Ces couleurs ne passent PAS par les tokens `--color-*` : ce sont des couleurs
 * de catégorie (classe d'actif, poste de dépense, carte d'objectif), pas des
 * couleurs de surface. Elles ne bougent donc pas en thème sombre — deux
 * catégories voisines doivent rester distinguables, ce qu'une palette
 * recalculée par thème ne garantit pas.
 *
 * ── Pourquoi des tons dérivés ─────────────────────────────────────────────
 * La charte ne publie que HUIT teintes chromatiques, là où les palettes de
 * l'app en demandent bien plus (29 postes de dépense, 12 cartes, 9 types
 * d'actif…). `DUO_TONES` décline donc chaque teinte en quatre valeurs de
 * clarté, obtenues par mélange vers le noir (`deep`, `dark`) ou vers le blanc
 * (`light`, `pale`) — jamais par changement de teinte. Une famille de postes
 * partage ainsi une gamme et ses membres s'y séparent par la clarté, ce qui est
 * exactement la logique des palettes d'origine.
 *
 * `pastel` / `ink` forment le couple des pastilles (fond très clair + encre de
 * la même teinte) : l'encre est descendue jusqu'à 4,5:1 sur son propre fond,
 * seuil sans lequel le libellé d'une pastille n'est plus lisible.
 * ------------------------------------------------------------------------- */

/** Les hex publiés par la charte, sans retouche. */
export const DUO = {
  // Core brand
  featherGreen: "#58CC02",
  maskGreen: "#89E219",
  eel: "#4B4B4B",
  snow: "#FFFFFF",
  // Secondary
  macaw: "#1CB0F6",
  cardinal: "#FF4B4B",
  bee: "#FFC800",
  fox: "#FF9600",
  beetle: "#CE82FF",
  humpback: "#2B70C9",
  // Neutrals
  wolf: "#777777",
  hare: "#AFAFAF",
  swan: "#E5E5E5",
  polar: "#F7F7F7",
} as const;

export type DuoHue =
  | "featherGreen" | "maskGreen" | "macaw" | "humpback"
  | "cardinal" | "bee" | "fox" | "beetle" | "wolf";

export interface DuoTone {
  /** ~40 % vers le noir — la marche « sombre » d'une gamme. */
  dark: string;
  /** ~22 % vers le noir — la marche « profonde ». */
  deep: string;
  /** ~42 % vers le blanc — la marche « claire ». */
  light: string;
  /** ~66 % vers le blanc — la marche la plus claire encore colorée. */
  pale: string;
  /** Fond de pastille (~86 % vers le blanc). */
  pastel: string;
  /** Encre de pastille : ≥ 4,5:1 sur `pastel`. */
  ink: string;
}

/** Déclinaisons de clarté de chaque teinte. Valeurs calculées, pas estimées. */
export const DUO_TONES: Record<DuoHue, DuoTone> = {
  featherGreen: { dark: "#337601", deep: "#459F02", light: "#9EE16C", pale: "#C6EEA9", pastel: "#E8F8DC", ink: "#357A01" },
  maskGreen:    { dark: "#4F830F", deep: "#6BB014", light: "#BBEE7A", pale: "#D7F5B1", pastel: "#EEFBDF", ink: "#4A7A0D" },
  macaw:        { dark: "#10668F", deep: "#1689C0", light: "#7BD1FA", pale: "#B2E4FC", pastel: "#DFF4FE", ink: "#12719D" },
  humpback:     { dark: "#194175", deep: "#22579D", light: "#84ACE0", pale: "#B7CEED", pastel: "#E1EBF7", ink: "#2867B9" },
  cardinal:     { dark: "#942C2C", deep: "#C73B3B", light: "#FF9797", pale: "#FFC2C2", pastel: "#FFE6E6", ink: "#BD3838" },
  bee:          { dark: "#947400", deep: "#C79C00", light: "#FFDF6B", pale: "#FFECA8", pastel: "#FFF7DB", ink: "#8A6C00" },
  fox:          { dark: "#945700", deep: "#C77500", light: "#FFC26B", pale: "#FFDBA8", pastel: "#FFF0DB", ink: "#9E5D00" },
  beetle:       { dark: "#774B94", deep: "#A165C7", light: "#E3B7FF", pale: "#EED5FF", pastel: "#F8EEFF", ink: "#8856A8" },
  wolf:         { dark: "#454545", deep: "#5D5D5D", light: "#B0B0B0", pale: "#D1D1D1", pastel: "#ECECEC", ink: "#696969" },
};

/** Pastille prête à l'emploi : fond pastel + encre de la même teinte. */
export const duoChip = (hue: DuoHue): { bg: string; text: string } => ({
  bg: DUO_TONES[hue].pastel,
  text: DUO_TONES[hue].ink,
});
