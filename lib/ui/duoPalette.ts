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
 * l'app en demandent bien plus (28 postes de dépense, 12 cartes, 9 types
 * d'actif…). `DUO_TONES` décline donc chaque teinte en une ÉCHELLE CLAIRE —
 * `soft`, `light`, `pale`, `mist` —, obtenue par mélange vers le blanc
 * uniquement, jamais par changement de teinte. Une famille de postes partage
 * ainsi une gamme et ses membres s'y séparent par la clarté, ce qui est
 * exactement la logique des palettes d'origine.
 *
 * L'échelle ne descend PAS vers le noir : assombrir une base reviendrait à
 * corriger la charte, et on préfère corriger le rendu quand il délave
 * (cf. `RIBBON_TINT` dans components/ui/SankeyGraph.jsx). Seule exception,
 * `ink` : le texte d'une pastille posé sur son propre fond pastel doit tenir
 * 4,5:1, ce qu'aucune base claire ne fait. Ce n'est pas une couleur
 * d'identité, c'est de l'encre.
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
  | "cardinal" | "bee" | "fox" | "beetle"
  | "eel" | "wolf" | "hare";

export interface DuoTone {
  /** 15 % vers le blanc — la marche juste sous la base. */
  soft: string;
  /** 32 % vers le blanc. */
  light: string;
  /** 50 % vers le blanc. */
  pale: string;
  /** 68 % vers le blanc — la dernière marche encore colorée. */
  mist: string;
  /** Fond de pastille (86 % vers le blanc). */
  pastel: string;
  /** Encre de pastille : ≥ 4,5:1 sur `pastel`. Seul ton assombri du module. */
  ink: string;
}

/** Échelle claire de chaque teinte. Valeurs calculées, pas estimées. */
export const DUO_TONES: Record<DuoHue, DuoTone> = {
  featherGreen: { soft: "#71D428", light: "#8DDC53", pale: "#ACE681", mist: "#CAEFAE", pastel: "#E8F8DC", ink: "#357A01" },
  maskGreen:    { soft: "#9BE63C", light: "#AFEB63", pale: "#C4F18C", mist: "#D9F6B5", pastel: "#EEFBDF", ink: "#4A7A0D" },
  macaw:        { soft: "#3EBCF7", light: "#65C9F9", pale: "#8ED8FB", mist: "#B6E6FC", pastel: "#DFF4FE", ink: "#12719D" },
  humpback:     { soft: "#4B85D1", light: "#6F9EDA", pale: "#95B8E4", mist: "#BBD1EE", pastel: "#E1EBF7", ink: "#2867B9" },
  cardinal:     { soft: "#FF6666", light: "#FF8585", pale: "#FFA5A5", mist: "#FFC5C5", pastel: "#FFE6E6", ink: "#BD3838" },
  bee:          { soft: "#FFD026", light: "#FFDA52", pale: "#FFE480", mist: "#FFEDAD", pastel: "#FFF7DB", ink: "#8A6C00" },
  fox:          { soft: "#FFA626", light: "#FFB852", pale: "#FFCB80", mist: "#FFDDAD", pastel: "#FFF0DB", ink: "#9E5D00" },
  beetle:       { soft: "#D595FF", light: "#DEAAFF", pale: "#E7C1FF", mist: "#EFD7FF", pastel: "#F8EEFF", ink: "#8856A8" },
  eel:          { soft: "#666666", light: "#858585", pale: "#A5A5A5", mist: "#C5C5C5", pastel: "#E6E6E6", ink: "#4B4B4B" },
  wolf:         { soft: "#8B8B8B", light: "#A3A3A3", pale: "#BBBBBB", mist: "#D3D3D3", pastel: "#ECECEC", ink: "#696969" },
  hare:         { soft: "#BBBBBB", light: "#C9C9C9", pale: "#D7D7D7", mist: "#E5E5E5", pastel: "#F4F4F4", ink: "#6C6C6C" },
};

/** Pastille prête à l'emploi : fond pastel + encre de la même teinte. */
export const duoChip = (hue: DuoHue): { bg: string; text: string } => ({
  bg: DUO_TONES[hue].pastel,
  text: DUO_TONES[hue].ink,
});
