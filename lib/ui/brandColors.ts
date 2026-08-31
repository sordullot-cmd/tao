import { accountColor } from "@/lib/ui/accountTypes";

/**
 * Couleurs d'identité des brokers et prop firms.
 *
 * Un compte est d'abord reconnu à sa MAISON : deux comptes Topstep se lisent
 * comme du Topstep, quel que soit leur type. La couleur de type (eval ambre,
 * funded bleu…) reste le repli quand la maison est inconnue — voir
 * lib/ui/accountTypes.
 *
 * Chaque marque porte trois teintes : la principale, puis deux secondaires.
 * Les secondaires ne sont pas décoratives — elles servent à distinguer
 * plusieurs comptes d'une MÊME maison sur un même graphique (page d'une prop
 * firm, courbes empilées du dashboard), cf. `assignSeriesColors`.
 *
 * Provenance des teintes : charte publique de la marque quand elle existe
 * (Tradeify), sinon les accents relevés dans le CSS du site officiel, sinon
 * les couleurs du logo embarqué dans /public (script
 * scripts/extract-logo-colors.mjs).
 *
 * Chaque marque porte sa VRAIE couleur, sans chercher à écarter artificiellement
 * les teintes voisines : plusieurs bleus et deux rouges coexistent donc. Deux
 * séries d'un même graphique restent distinctes grâce aux secondaires, qui ne
 * sont attribuées qu'à l'intérieur d'une même marque.
 */
export interface BrandPalette {
  /** Clés supplémentaires reconnues en plus de l'id et du nom de la plateforme. */
  aliases?: string[];
  primary: string;
  secondary: [string, string];
  /** Maison de prop trading — prioritaire sur une plateforme d'exécution. */
  propFirm?: boolean;
}

export const BRAND_COLORS: Record<string, BrandPalette> = {
  // ── Prop firms ─────────────────────────────────────────────────────────
  apex: {
    aliases: ["apex trader funding", "apex trader"],
    primary: "#0026FF",                      // bleu électrique, l'accent de leur site
    secondary: ["#FFB000", "#5AC7FA"],       // ambre (rappel du logo historique) puis cyan
    propFirm: true,
  },
  tradeify: {
    primary: "#10D38D",                      // teinte retenue pour les courbes
    secondary: ["#00DFFF", "#FF4F40"],       // verticales FX et 24/7
    propFirm: true,
  },
  lucid: {
    aliases: ["lucid trading"],
    primary: "#00D98B",
    secondary: ["#61F8AB", "#6D8CCD"],
    propFirm: true,
  },
  topstep: {
    aliases: ["topstep x", "topstepx"],
    primary: "#44E0F5",
    secondary: ["#CF8432", "#0FB5CE"],
    propFirm: true,
  },
  ftmo: {
    primary: "#0781FE",
    /* L'indigo passe devant le vert : celui-ci frôlait le menthe de Lucid et le
       néon de Tradeify. */
    secondary: ["#615FFF", "#00C951"],
    propFirm: true,
  },
  alphafutures: {
    aliases: ["alpha futures"],
    primary: "#1B5DFC",                      // bleu du logo SVG
    secondary: ["#06246C", "#4C86FF"],
    propFirm: true,
  },
  tradeday: {
    aliases: ["trade day"],
    /* Les barres du logo. Le fond, un marine quasi noir (#110338), ferait une
       courbe indistinguable de l'encre du graphique : il monte en secondaire,
       éclairci de ce qu'il faut pour rester lisible dans les deux thèmes.
       Ce cyan frôle celui de Topstep — c'est le sien, on ne l'écarte pas
       artificiellement (cf. l'en-tête du fichier). */
    primary: "#48C3C8",
    secondary: ["#2D1B69", "#7FDCE1"],
    propFirm: true,
  },
  myfundedfutures: {
    /* « MFFU » est le sigle courant : un compte nommé ainsi doit se rattacher
       à la maison, comme « TopstepX » se rattache à Topstep. */
    aliases: ["my funded futures", "mffu", "mff"],
    /* Les trois teintes sortent du SVG : l'or du trophée, le bleu de son
       couvercle, puis la fin claire du dégradé. */
    primary: "#D8AE5E",
    secondary: ["#3A82F7", "#F3CC81"],
    propFirm: true,
  },

  // ── Plateformes d'exécution ────────────────────────────────────────────
  // Chacune porte SA couleur, quitte à ce que deux marques se ressemblent
  // (Tradovate et ProjectX sont deux bleus) : mieux vaut une teinte juste
  // qu'une teinte distincte mais fausse.
  tradovate: {
    primary: "#267FFF",                      // azur du logo
    secondary: ["#61BC46", "#4594C8"],
  },
  mt5: {
    aliases: ["metatrader 5", "metatrader5"],
    primary: "#2C91C6",
    secondary: ["#014B7D", "#E3A91C"],
  },
  mt4: {
    aliases: ["metatrader 4", "metatrader4"],
    primary: "#DED139",                      // le jaune du logo : MT4 et MT5 partagent le même visuel
    secondary: ["#014B7D", "#E3A91C"],
  },
  rithmic: {
    aliases: ["rithmic r|trader", "r|trader", "rtrader"],
    primary: "#63A703",                      // vert du logo
    secondary: ["#72BF03", "#4F8903"],
  },
  ninjatrader: {
    aliases: ["ninja trader"],
    primary: "#FF4200",                      // orange du logo, confirmé par le site
    secondary: ["#FF6A00", "#FF4D1A"],
  },
  tradingview: {
    aliases: ["trading view"],
    primary: "#2962FF",                      // bleu signature des boutons
    secondary: ["#0047F9", "#5B9CF6"],       // relevés dans leur CSS
  },
  wealthcharts: {
    aliases: ["wealth charts"],
    primary: "#5DC6E0",                      // cyan du logo, sur fond nuit
    secondary: ["#2B5A66", "#8FDDEE"],
  },
  /* Teintes relevées sur les logos livrés, comme les précédentes. AlphaTrader
     fait exception d'un cran : le vert de son logo (#032F20) est trop sombre
     pour une pastille — c'est son vert clair qui sert, la nuance foncée passant
     en secondaire. */
  alphatrader: {
    aliases: ["alpha trader"],
    primary: "#07513A",
    secondary: ["#0B7A55", "#032F20"],
  },
  quantower: {
    primary: "#00566C",                      // l'unique teinte du SVG
    secondary: ["#017A99", "#003C4C"],
  },
  deepchart: {
    aliases: ["deep chart"],
    primary: "#3800A4",                      // violet du dégradé
    secondary: ["#5A2BD6", "#14003C"],
  },
  tradesea: {
    aliases: ["trade sea"],
    primary: "#0057B0",                      // bleu du logo
    secondary: ["#5797FB", "#003D7D"],
  },
};

/** Index nom/alias → clé de marque, construit une seule fois. */
const KEY_BY_LABEL = (() => {
  const map = new Map<string, string>();
  for (const [key, palette] of Object.entries(BRAND_COLORS)) {
    map.set(key, key);
    for (const alias of palette.aliases || []) map.set(alias, key);
  }
  return map;
})();

/** Retrouve la marque depuis un id de plateforme ou un nom saisi à la main. */
export function resolveBrandKey(value: unknown): string | null {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  const exact = KEY_BY_LABEL.get(key);
  if (exact) return exact;
  // Saisies libres (« Topstep 50k », « compte FTMO ») : on cherche la marque
  // la plus longue contenue dans la chaîne, pour que « metatrader 5 » ne soit
  // pas capté par « mt5 » ni l'inverse.
  let best: string | null = null;
  for (const label of KEY_BY_LABEL.keys()) {
    if (label.length < 3 || !key.includes(label)) continue;
    if (!best || label.length > best.length) best = label;
  }
  return best ? KEY_BY_LABEL.get(best) || null : null;
}

/** Les trois teintes d'une marque, principale en tête. */
export function brandPalette(value: unknown): string[] | null {
  const key = resolveBrandKey(value);
  if (!key) return null;
  const p = BRAND_COLORS[key];
  return [p.primary, ...p.secondary];
}

/** Couleur principale d'une marque, ou null si elle n'est pas au catalogue. */
export function brandColor(value: unknown): string | null {
  return brandPalette(value)?.[0] || null;
}

/** Vrai si la clé désigne une maison de prop trading (et non une plateforme). */
const isPropFirm = (key: string | null) => !!key && !!BRAND_COLORS[key]?.propFirm;

/**
 * Marque d'un compte. La règle tient en une phrase : **une prop firm gagne
 * toujours**, où qu'on la trouve — dans la firme rattachée, dans le nom du
 * compte, ou même saisie comme broker.
 *
 * La plateforme d'exécution (Tradovate, Rithmic, MetaTrader…) ne sert qu'à
 * l'import : elle ne colore un compte que si AUCUNE maison n'est identifiable,
 * et ne peut jamais évincer celle d'un compte de prop firm.
 *
 * Ordre effectif :
 *  1. une prop firm, cherchée dans la firme rattachée puis dans le compte ;
 *  2. à défaut, une plateforme (celle de la firme, puis celle du compte) ;
 *  3. rien : l'appelant retombe sur la couleur de type.
 */
export function resolveAccountBrandKey(account: unknown, firm?: unknown): string | null {
  const acc = account as { broker?: string; name?: string } | null | undefined;
  const firmObj = firm as { platform?: string; name?: string } | null | undefined;

  for (const candidate of [firmObj?.name, acc?.name, acc?.broker, firmObj?.platform]) {
    const key = resolveBrandKey(candidate);
    if (isPropFirm(key)) return key;
  }
  for (const candidate of [firmObj?.platform, acc?.broker, acc?.name]) {
    const key = resolveBrandKey(candidate);
    if (key) return key;
  }
  return null;
}

/**
 * Teintes attribuées aux firmes absentes du catalogue.
 *
 * Une firme nommée librement (« ATF », « Ma prop », un surnom) n'était
 * rattachable à aucune marque : elle héritait alors de la couleur de sa
 * plateforme, si bien que toutes les firmes tournant sur Tradovate sortaient
 * du même azur. Elle reçoit désormais une teinte à elle, tirée de son
 * identité — donc stable d'une session à l'autre et d'un écran à l'autre.
 *
 * Les teintes sont choisies dans les familles que le catalogue laisse libres
 * (rouges, violets, magentas, turquoises) : aucune ne se confond avec une
 * marque connue.
 */
const FALLBACK_FIRM_COLORS = [
  "#E5484D", // rouge
  "#6E56CF", // violet
  "#D6409F", // magenta
  "#17A398", // turquoise
  "#E07B39", // orange brûlé
  "#8DB600", // vert pomme
  "#9333EA", // violet vif
  "#F76B8A", // rose
];

/**
 * Couleur de secours d'une firme, dérivée de son identité.
 * On préfère l'id au nom : renommer une firme ne doit pas changer sa couleur.
 */
export function fallbackFirmColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_FIRM_COLORS[h % FALLBACK_FIRM_COLORS.length];
}

/**
 * Couleur d'une firme : sa marque si elle est au catalogue, sinon une teinte
 * qui lui est propre. Jamais celle de sa plateforme d'exécution — deux firmes
 * distinctes ne doivent pas se confondre parce qu'elles passent par le même
 * broker.
 */
export function firmBrandColor(firm: unknown): string | null {
  const f = firm as { id?: string; name?: string; platform?: string } | null | undefined;
  if (!f) return null;
  const key = resolveBrandKey(f.name) || resolveBrandKey(f.platform);
  if (isPropFirm(key)) return BRAND_COLORS[key!].primary;
  const seed = f.id || f.name;
  if (seed) return fallbackFirmColor(String(seed));
  return key ? BRAND_COLORS[key].primary : null;
}

/**
 * Couleur d'un compte : la marque de sa maison, la teinte propre de sa firme
 * si celle-ci n'est pas au catalogue, sa plateforme à défaut de toute firme,
 * et en dernier ressort la couleur de son type.
 */
export function accountBrandColor(account: unknown, firm?: unknown): string {
  const key = resolveAccountBrandKey(account, firm);
  // Une maison identifiée gagne toujours, même trouvée via le compte.
  if (isPropFirm(key)) return BRAND_COLORS[key!].primary;
  // Firme rattachée mais inconnue : sa teinte propre, pas celle du broker.
  const fromFirm = firmBrandColor(firm);
  if (fromFirm) return fromFirm;
  return key ? BRAND_COLORS[key].primary : accountColor(account);
}

/** Éclaircit (`amount` > 0) ou assombrit un hex, pour décliner une palette. */
function shade(hex: string, amount: number): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) =>
    Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount));
  const [r, g, b] = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Couleurs d'un graphique à plusieurs comptes.
 *
 * Colorer chaque compte par sa maison rendrait indistinguables les comptes
 * d'une même firme — or c'est exactement ce qu'affiche la page d'une prop
 * firm. Le premier compte d'une maison prend donc sa couleur principale, les
 * suivants ses deux secondaires, puis des variantes éclaircies/assombries.
 *
 * @param entries un objet par série, dans l'ordre d'affichage.
 * @param options `skipPrimary` réserve la couleur principale à une autre
 *   courbe — celle de la firme elle-même, sur sa page : sans ça son premier
 *   compte aurait exactement la teinte de la courbe agrégée qui passe devant.
 * @returns une Map id → couleur.
 */
export function assignSeriesColors(
  entries: Array<{ id: string; account?: unknown; firm?: unknown }>,
  options: { skipPrimary?: boolean } = {}
): Map<string, string> {
  const offset = options.skipPrimary ? 1 : 0;
  const used = new Map<string, number>();
  const out = new Map<string, string>();
  for (const { id, account, firm } of entries || []) {
    const base = accountBrandColor(account, firm);
    const seen = used.get(base) || 0;
    used.set(base, seen + 1);
    const rank = seen + offset;
    if (rank === 0) { out.set(id, base); continue; }
    /* La déclinaison doit rester dans la palette de LA marque retenue — et
       seulement si c'est bien elle qui a donné la couleur de base : une firme
       hors catalogue n'a pas de secondaires, elle se décline par nuances. */
    const key = resolveAccountBrandKey(account, firm);
    const palette = key && BRAND_COLORS[key].primary === base
      ? [BRAND_COLORS[key].primary, ...BRAND_COLORS[key].secondary]
      : null;
    const alt = palette?.[rank];
    // Au-delà des trois teintes de la marque : éclaircir, puis assombrir, par
    // paliers de 18 % — assez pour rester lisibles côte à côte.
    out.set(id, alt || shade(base, rank % 2 ? 0.18 * Math.ceil(rank / 2) : -0.18 * (rank / 2)));
  }
  return out;
}
