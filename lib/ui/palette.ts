/**
 * Palette des graphiques — source unique des teintes d'IDENTITÉ des sections
 * « Vie perso » et « Finance ».
 *
 * Les trente-huit teintes de la charte, sous leur nom d'origine (`HUE`), puis
 * les sélections dont l'app se sert. Plus AUCUNE valeur calculée : chaque
 * couleur posée à l'écran est une couleur publiée.
 *
 * Ces couleurs ne passent PAS par les tokens `--color-*` : ce sont des couleurs
 * de catégorie (classe d'actif, poste de dépense, carte d'objectif), pas des
 * couleurs de surface. Elles ne bougent donc pas en thème sombre — deux
 * catégories voisines doivent rester distinguables, ce qu'une palette
 * recalculée par thème ne garantit pas.
 *
 * ── Où ces couleurs vont TELLES QUELLES, et où non ────────────────────────
 * Elles sont conçues pour les APLATS : secteur d'anneau, ruban de Sankey, barre
 * de graphique. Là, la surface porte la teinte et tout se lit.
 *
 * Elles ne tiennent PAS sur un petit objet : Bee rend 1,55:1 sur blanc, Owl
 * 2,09:1 — une puce de 8 px, un trait de progression, un libellé ou une coche
 * blanche posée dessus disparaissent. Ces cas passent donc par `deepen()` ou
 * `dotRing()` (cf. lib/ui/color), qui gardent la teinte en la cernant ou en la
 * descendant vers le NOIR : les couleurs déjà sombres ne bougent pas, et une
 * puce reste reconnaissable à côté de sa part d'anneau.
 *
 * Règle courte : aplat → la couleur brute ; puce, trait, texte, glyphe blanc →
 * `deepen()` / `dotRing()`.
 * ------------------------------------------------------------------------- */

/**
 * Les trente-huit teintes de la charte, sous leur nom d'origine.
 *
 * On garde les noms d'animaux ici — c'est le vocabulaire de la charte, et c'est
 * lui qui permet de vérifier une valeur contre la planche sans la chercher au
 * jugé. Les sélections plus bas les rebaptisent en noms courants, qui sont ce
 * que le code manipule au quotidien.
 */
export const HUE = {
  // Gris
  polar: "#F7F7F7",
  swan: "#E5E5E5",
  hare: "#AFAFAF",
  wolf: "#777777",
  eel: "#4B4B4B",
  // Rouges et roses
  squid: "#EBE3E3",
  walkingFish: "#FFDFE0",
  flamingo: "#FFB2B2",
  pig: "#F5A4A4",
  crab: "#FF7878",
  cardinal: "#FF4B4B",
  fireAnt: "#EA2B2B",
  // Jaunes, oranges et bruns
  canary: "#FFF5D3",
  duck: "#FBE56D",
  bee: "#FFC800",
  lion: "#FFB100",
  fox: "#FF9600",
  cheetah: "#FFCE8E",
  monkey: "#E5A259",
  camel: "#E7A601",
  guineaPig: "#CD7900",
  grizzly: "#A56644",
  // Verts — Owl est le vert de marque
  seaSponge: "#D7FFB8",
  turtle: "#A5ED6E",
  owl: "#58CC02",
  treeFrog: "#58A700",
  // Bleus
  iguana: "#DDF4FF",
  anchovy: "#D2E4E8",
  beluga: "#BBF2FF",
  moonJelly: "#7AF0F2",
  blueJay: "#84D8FF",
  macaw: "#1CB0F6",
  whale: "#1899D6",
  humpback: "#2B70C9",
  narwhal: "#1453A3",
  // Violets et roses vifs
  starfish: "#FFAADE",
  beetle: "#CE82FF",
  betta: "#9069CD",
  butterfly: "#6F4EA1",
} as const;

/**
 * Les huit couleurs principales, sous leur nom courant.
 *
 * Ce sont elles qu'on sert EN PREMIER, partout. `PALETTE_DARK` n'intervient que
 * lorsque les huit sont prises, `PALETTE_LIGHT` qu'une fois les seize épuisées.
 * Une palette qui tient dans les huit n'a donc aucune variante — c'est le cas
 * de tout ce qui compte moins de neuf entrées.
 */
export const PALETTE = {
  green: HUE.owl,
  blue: HUE.macaw,
  red: HUE.cardinal,
  yellow: HUE.bee,
  orange: HUE.fox,
  purple: HUE.beetle,
  pink: HUE.flamingo,
  brown: HUE.monkey,
} as const;

export type PaletteColor = keyof typeof PALETTE;

/** Le cran plus sombre de chaque principale, pris dans la même famille. */
export const PALETTE_DARK: Record<PaletteColor, string> = {
  green: HUE.treeFrog,
  blue: HUE.humpback,
  red: HUE.fireAnt,
  yellow: HUE.camel,
  orange: HUE.guineaPig,
  purple: HUE.betta,
  pink: HUE.crab,
  brown: HUE.grizzly,
};

/** Le cran plus clair. Dernier recours, quand les seize précédentes sont prises. */
export const PALETTE_LIGHT: Record<PaletteColor, string> = {
  green: HUE.turtle,
  blue: HUE.blueJay,
  red: HUE.pig,
  yellow: HUE.duck,
  orange: HUE.lion,
  // La charte n'a pas de violet plus clair que Beetle : Starfish est son voisin
  // immédiat dans la bande « violets et roses vifs », c'est lui qui tient le
  // rôle.
  purple: HUE.starfish,
  pink: HUE.walkingFish,
  brown: HUE.cheetah,
};

/** Les gris de la charte, du plus sombre au blanc. */
export const GREY = {
  grey900: HUE.eel,
  grey700: HUE.wolf,
  grey500: HUE.hare,
  grey300: HUE.swan,
  grey100: HUE.polar,
  white: "#FFFFFF",
} as const;

/**
 * Pastilles : la teinte ramenée à une clarté constante + son encre.
 *
 * Les fonds étaient des pastels à 86 % de blanc : ils se lisaient tous comme du
 * blanc, et dans une liste d'actifs on ne distinguait plus un PEA d'un livret.
 * Ils sont maintenant tous à la MÊME luminance (0,75), donc seule la teinte les
 * sépare — c'est précisément ce qu'on leur demande de dire. Ça revient à poser
 * la couleur à un quart de sa force sur du blanc : assez pour qu'on la nomme,
 * pas assez pour que la pastille pèse. Même échelle que les vignettes de poste
 * (cf. `DISC_LUM` dans components/ui/CategoryIcon) : les deux familles se
 * croisent dans les listes de la section Finance et doivent avoir le même poids.
 *
 * C'est le seul endroit du module où les valeurs sont CALCULÉES et non prises
 * dans la charte : la charte publie des teintes, pas des couples fond/encre, et
 * un couple doit tenir un ratio de contraste que le choix à l'œil ne garantit
 * pas.
 *
 * L'aplat est OPAQUE, pas une vraie transparence, et c'est voulu : une pastille
 * en `rgba()` prendrait le fond de la carte, donc du sombre en thème sombre, et
 * l'encre foncée y disparaîtrait. En restant autonome, la pastille se lit à
 * l'identique sur les deux thèmes.
 *
 * L'encre descend de la même teinte jusqu'à 4,5:1 sur son propre fond. Un noir
 * neutre casserait la parenté entre la pastille et ses initiales.
 */
export const CHIP: Record<PaletteColor | "grey", { bg: string; text: string }> = {
  green:  { bg: "#C4EDA5", text: "#2F6D02" },
  blue:   { bg: "#BBE8FC", text: "#116891" },
  red:    { bg: "#FFD8D8", text: "#A73232" },
  yellow: { bg: "#FFDE68", text: "#7A5F00" },
  orange: { bg: "#FFDBA9", text: "#875000" },
  purple: { bg: "#F0D9FF", text: "#7A4D96" },
  pink:   { bg: "#FFD7D7", text: "#7A5656" },
  brown:  { bg: "#F5DDC2", text: "#7A5630" },
  grey:   { bg: "#E0E0E0", text: "#606060" },
};
