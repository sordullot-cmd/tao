/**
 * Palette des graphiques — source unique des teintes d'IDENTITÉ des sections
 * « Vie perso » et « Finance ».
 *
 * Reprise de la planche Figma `mqFgieIhnaljGeybhJRY0V`, nœud 590:4381, relevée
 * au pixel : première ligne les huit couleurs principales, deuxième ligne leur
 * version sombre, troisième ligne les gris.
 *
 * Ces couleurs ne passent PAS par les tokens `--color-*` : ce sont des couleurs
 * de catégorie (classe d'actif, poste de dépense, carte d'objectif), pas des
 * couleurs de surface. Elles ne bougent donc pas en thème sombre — deux
 * catégories voisines doivent rester distinguables, ce qu'une palette
 * recalculée par thème ne garantit pas.
 *
 * ── Règle d'emploi ────────────────────────────────────────────────────────
 * On sert d'abord les huit couleurs de `PALETTE`. `PALETTE_DARK` n'intervient
 * QUE lorsque les huit sont prises, et `PALETTE_LIGHT` qu'une fois les seize
 * épuisées. Une palette qui tient dans les huit principales n'a donc aucune
 * couleur dérivée — c'est le cas de tout ce qui compte moins de neuf entrées.
 * Les gris ferment la marche pour ce qui n'est pas une catégorie (le
 * non-catégorisé, les frais, les virements).
 *
 * ── D'où viennent les six sombres non fournies ────────────────────────────
 * La planche ne donne la version sombre que du vert (#89E219 → #58CC02) et du
 * bleu (#1CB0F6 → #2B70C9). Ces deux paires ne suivent pas la même
 * transformation : en OKLCH, la clarté tombe de 9 % pour le vert et de 24 %
 * pour le bleu, le chroma est conservé (×1,02) dans les deux cas. On garde donc
 * les deux valeurs de la planche telles quelles, et les six autres sont
 * assombries d'un même pas — la MOYENNE des deux mesures, soit clarté ×0,836 à
 * chroma et teinte constants. C'est la seule façon d'obtenir une deuxième ligne
 * cohérente à partir de deux références qui ne le sont pas entre elles.
 * ------------------------------------------------------------------------- */

/** Les huit couleurs principales, relevées sur la planche. */
export const PALETTE = {
  green: "#89E219",
  blue: "#1CB0F6",
  red: "#FF4B4B",
  yellow: "#FFC800",
  orange: "#FF9600",
  purple: "#CE82FF",
  pink: "#FFCAFF",
  brown: "#B66E28",
} as const;

export type PaletteColor = keyof typeof PALETTE;

/**
 * Les mêmes en sombre. `green` et `blue` sont les valeurs de la planche ; les
 * six autres sont dérivées (clarté ×0,836 en OKLCH, chroma et teinte gardés).
 */
export const PALETTE_DARK: Record<PaletteColor, string> = {
  green: "#58CC02",
  blue: "#2B70C9",
  red: "#D71929",
  yellow: "#C99D07",
  orange: "#C97505",
  purple: "#A75CD6",
  pink: "#CE9BCE",
  brown: "#945204",
};

/**
 * Les mêmes en clair — dernier recours, seulement quand les seize précédentes
 * sont prises. Obtenues en mélangeant la couleur principale à 40 % de blanc.
 */
export const PALETTE_LIGHT: Record<PaletteColor, string> = {
  green: "#B8EE75",
  blue: "#77D0FA",
  red: "#FF9393",
  yellow: "#FFDE66",
  orange: "#FFC066",
  purple: "#E2B4FF",
  pink: "#FFDFFF",
  brown: "#D3A87E",
};

/** Les gris de la planche, du plus sombre au blanc. */
export const GREY = {
  grey900: "#4B4B4B",
  grey700: "#777777",
  grey500: "#AFAFAF",
  grey300: "#E5E5E5",
  grey100: "#F7F7F7",
  white: "#FFFFFF",
} as const;

/**
 * Pastilles : fond très clair de la teinte + encre lisible dessus.
 *
 * Ce n'est pas une couleur d'identité, c'est du texte : l'encre part de la
 * version sombre et descend encore si besoin, jusqu'à 4,5:1 sur son propre
 * fond. Aucune couleur principale ne tient ce seuil telle quelle.
 */
export const CHIP: Record<PaletteColor | "grey", { bg: string; text: string }> = {
  green:  { bg: "#EEFBDF", text: "#377E01" },
  blue:   { bg: "#DFF4FE", text: "#296CC1" },
  red:    { bg: "#FFE6E6", text: "#CE1827" },
  yellow: { bg: "#FFF7DB", text: "#896B05" },
  orange: { bg: "#FFF0DB", text: "#9D5B04" },
  purple: { bg: "#F8EEFF", text: "#904FB8" },
  pink:   { bg: "#FFF8FF", text: "#886688" },
  brown:  { bg: "#F5EBE1", text: "#945204" },
  grey:   { bg: "#ECECEC", text: "#4B4B4B" },
};
