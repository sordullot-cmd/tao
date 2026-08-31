/**
 * Catalogue des plateformes d'exécution ET des prop firms — deux natures
 * distinctes, dans un seul catalogue.
 *
 * La distinction est le fond de ce module : une prop firm (Apex, Topstep…)
 * n'exécute rien, elle FINANCE un compte que l'on trade sur la plateforme
 * qu'elle fournit (Tradovate, WealthCharts, ProjectX…). Les deux vivaient
 * mélangées ici, donc « Apex » se proposait comme plateforme d'exécution : un
 * choix sans sens, et un import sans parseur nommable.
 *
 * D'où :
 *  - `kind` sépare les deux familles ; `EXECUTION_PLATFORMS` est la seule liste
 *    à présenter dans un champ « plateforme », `PROP_FIRM_PRESETS` la seule à
 *    présenter comme maison ;
 *  - une prop firm déclare `platformIds` — les plateformes qu'elle propose
 *    vraiment. Choisir Alpha Futures ne doit pas offrir MetaTrader.
 *
 * `PLATFORMS` reste le catalogue COMPLET : la résolution d'un logo ou d'un nom
 * part d'une valeur libre saisie en base (`accounts.broker`, `prop_firms.brand`)
 * qui peut désigner l'une ou l'autre famille.
 */

export type PlatformKind = "platform" | "propfirm";

export interface Platform {
  id: string;
  name: string;
  /** Plateforme d'exécution, ou maison de prop trading. */
  kind: PlatformKind;
  /** Format de fichier attendu à l'import (oriente le parseur). */
  format: "csv" | "html";
  iconPath?: string;
  /**
   * Plateformes d'exécution proposées par cette maison (`kind: "propfirm"`),
   * la principale en tête. C'est ce qui restreint le champ « plateforme » une
   * fois la maison choisie, et ce qui donne son parseur à un import hérité
   * dont le compte ne porte que le nom de la firme.
   */
  platformIds?: string[];
  /**
   * Parseur de repli quand l'auto-détection ne reconnaît pas les en-têtes
   * (`kind: "platform"`). Absent = parseur générique.
   */
  hint?: "tradovate" | "mt5" | "generic";
  /**
   * La plateforme n'offre aucun bouton d'export : son relevé se recopie à la
   * main. L'écran d'import propose alors son convertisseur de copier-coller.
   * Réservé à celles qui n'ont vraiment pas d'export — partout ailleurs, coller
   * un relevé serait un détour plus fragile que déposer le fichier.
   */
  pasteImport?: boolean;
  /**
   * Autres graphies reconnues, en minuscules.
   *
   * Une firme n'est pas toujours créée depuis un preset : elle peut être saisie
   * à la main, et le nom tapé n'est pas forcément celui du catalogue.
   * « TradeDay » s'écrit couramment en deux mots, et « MyFundedFutures » sous
   * son sigle — ni l'un ni l'autre ne se rapproche du nom exact par le simple
   * `includes` du bas de fichier, faute d'être un sous-mot.
   */
  aliases?: string[];
}

export const PLATFORMS: Platform[] = [
  // ── Plateformes d'exécution ────────────────────────────────────────────
  { id: "tradovate",    name: "Tradovate",        kind: "platform", format: "csv",  iconPath: "/trado.png",                  hint: "tradovate" },
  { id: "rithmic",      name: "Rithmic R|Trader", kind: "platform", format: "csv",  iconPath: "/brokers/rithmic.png",        hint: "tradovate" },
  { id: "ninjatrader",  name: "NinjaTrader",      kind: "platform", format: "csv",  iconPath: "/brokers/ninja%20trader.png", hint: "tradovate" },
  /* Les quatre plateformes servies par les firmes futures. Leurs exports
     reprennent les colonnes Orders de Tradovate, d'où le même repli de
     parsing. */
  { id: "alphatrader",  name: "AlphaTrader",      kind: "platform", format: "csv",  iconPath: "/brokers/alphatrader.png",    hint: "tradovate", aliases: ["alpha trader"], pasteImport: true },
  { id: "quantower",    name: "Quantower",        kind: "platform", format: "csv",  iconPath: "/brokers/quantower.svg",      hint: "tradovate" },
  { id: "deepchart",    name: "DeepChart",        kind: "platform", format: "csv",  iconPath: "/brokers/deepchart.png",      hint: "tradovate", aliases: ["deep chart"] },
  { id: "tradesea",     name: "TradeSea",         kind: "platform", format: "csv",  iconPath: "/brokers/tradesea.jpg",       hint: "tradovate", aliases: ["trade sea"] },
  { id: "tradingview",  name: "TradingView",      kind: "platform", format: "csv",  iconPath: "/brokers/tradingview.webp",   aliases: ["trading view"] },
  { id: "wealthcharts", name: "WealthCharts",     kind: "platform", format: "csv",  iconPath: "/weal.webp",                  aliases: ["wealth charts"] },
  { id: "mt5",          name: "MetaTrader 5",     kind: "platform", format: "html", iconPath: "/MetaTrader_5.png",           hint: "mt5", aliases: ["metatrader 5", "metatrader5"] },
  { id: "mt4",          name: "MetaTrader 4",     kind: "platform", format: "html", iconPath: "/brokers/MetaTrader_4.png",   hint: "mt5", aliases: ["metatrader 4", "metatrader4"] },

  // ── Prop firms futures ─────────────────────────────────────────────────
  { id: "topstep",      name: "Topstep",             kind: "propfirm", format: "csv", iconPath: "/brokers/Topstep_Logo.jpg",  platformIds: ["tradovate", "ninjatrader", "rithmic", "quantower"] },
  { id: "apex",         name: "Apex Trader Funding", kind: "propfirm", format: "csv", iconPath: "/brokers/apex.avif",         platformIds: ["tradovate", "wealthcharts", "ninjatrader", "rithmic", "tradingview"], aliases: ["apex trader"] },
  { id: "alphafutures", name: "Alpha Futures",       kind: "propfirm", format: "csv", iconPath: "/brokers/alpha%20futur.svg", platformIds: ["alphatrader", "quantower", "deepchart", "wealthcharts"] },
  { id: "tradeify",     name: "Tradeify",            kind: "propfirm", format: "csv", iconPath: "/brokers/Tradeify.png",      platformIds: ["wealthcharts", "tradovate", "rithmic", "tradesea"] },
  { id: "lucid",        name: "Lucid Trading",       kind: "propfirm", format: "csv", iconPath: "/brokers/lucid.png",         platformIds: ["ninjatrader", "rithmic", "tradovate", "tradesea"] },
  { id: "tradeday",     name: "TradeDay",            kind: "propfirm", format: "csv", iconPath: "/brokers/tradeday_logo.jpeg", platformIds: ["rithmic", "ninjatrader", "tradovate"], aliases: ["trade day"] },
  { id: "myfundedfutures", name: "MyFundedFutures",  kind: "propfirm", format: "csv", iconPath: "/brokers/myfundedfuture.svg", platformIds: ["tradovate", "rithmic", "tradingview"], aliases: ["my funded futures", "mffu"] },

  // ── Prop firms forex / CFD ─────────────────────────────────────────────
  { id: "ftmo",         name: "FTMO",                kind: "propfirm", format: "csv", iconPath: "/brokers/ftmo.png",          platformIds: ["mt5", "mt4"] },
];

/* Les deux listes sont triées par NOM, pas dans l'ordre de déclaration : un
   sélecteur se parcourt à l'œil, et l'ordre alphabétique est le seul où l'on
   sait d'avance où regarder. Le tableau ci-dessus reste groupé par famille,
   qui est la lecture utile pour qui l'édite. */
const byName = (a: Platform, b: Platform) => a.name.localeCompare(b.name, "fr");

/** Les seules entrées à proposer dans un champ « plateforme d'exécution ». */
export const EXECUTION_PLATFORMS = PLATFORMS.filter((p) => p.kind === "platform").sort(byName);

/** Maisons proposées en un clic dans la modale de création de firme. */
export const PROP_FIRM_PRESETS = PLATFORMS.filter((p) => p.kind === "propfirm").sort(byName);

/** Plateforme retenue quand rien n'est choisi (la plus courante en futures). */
export const DEFAULT_PLATFORM_ID = "tradovate";

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

/** Entrée du catalogue par identifiant, quelle que soit sa famille. */
export function platformById(id: unknown): Platform | null {
  return BY_ID.get(String(id ?? "").trim().toLowerCase()) || null;
}

export function isPropFirmId(id: unknown): boolean {
  return platformById(id)?.kind === "propfirm";
}

/**
 * Plateformes d'exécution ouvertes à une maison : celles qu'elle propose
 * réellement. Sans maison — ou pour une maison hors catalogue, créée à la
 * main — tout le catalogue, faute de savoir restreindre.
 */
export function platformsForFirm(brandId: unknown): Platform[] {
  const firm = platformById(brandId);
  if (!firm || firm.kind !== "propfirm" || !firm.platformIds?.length) return EXECUTION_PLATFORMS;
  const allowed = firm.platformIds
    .map((id) => BY_ID.get(id))
    .filter((p): p is Platform => !!p && p.kind === "platform");
  return allowed.length ? [...allowed].sort(byName) : EXECUTION_PLATFORMS;
}

/**
 * Plateforme PRINCIPALE d'une maison : la première de `platformIds`, l'ordre du
 * catalogue portant la préséance (les listes affichées, elles, sont triées par
 * nom). C'est le choix par défaut quand on ne sait rien de plus.
 */
export function primaryPlatformForFirm(brandId: unknown): Platform | null {
  const firm = platformById(brandId);
  if (!firm || firm.kind !== "propfirm") return null;
  return firm.platformIds?.map((id) => BY_ID.get(id)).find((p) => p?.kind === "platform") || null;
}

/**
 * Plateforme d'EXÉCUTION derrière une valeur libre. Les comptes d'avant la
 * séparation portent parfois le nom de la firme dans `broker` (« Apex Trader
 * Funding ») : il faut alors le parseur de la plateforme qu'elle fournit, sinon
 * l'import repart du générique et ne trouve plus rien.
 */
export function resolveExecutionPlatform(value: unknown): Platform | null {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  if (!key) return null;
  const hit = PLATFORMS.find((p) => matchesExactly(p, key)) || PLATFORMS.find((p) => matchesLoosely(p, key));
  if (!hit) return null;
  if (hit.kind === "platform") return hit;
  // Une maison rend sa plateforme principale : le parseur le plus probable.
  return primaryPlatformForFirm(hit.id);
}

/** Résout le logo d'une plateforme/firme depuis son id OU son nom affiché. */
export function resolvePlatformIcon(value: unknown): string | null {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  const hit = PLATFORMS.find((p) => matchesExactly(p, key));
  /* Une correspondance EXACTE fait loi, même quand l'entrée n'a pas de logo :
     c'est `null` qu'il faut rendre, pas la suite. Sans ce `return`, une marque
     identifiée mais sans fichier embarqué repartait dans la recherche
     approchante du dessous, où elle pouvait hériter du logo d'une AUTRE marque
     dont le nom la contient — un logo faux étant pire que pas de logo. Toutes
     les entrées portent un fichier aujourd'hui ; la prochaine qui arrivera sans
     n'aura pas à retrouver le piège. */
  if (hit) return hit.iconPath || null;
  // Correspondances partielles (données historiques saisies à la main).
  const partial = PLATFORMS.find((p) => matchesLoosely(p, key));
  return partial?.iconPath || null;
}

/** Nom exact, identifiant, ou l'une des graphies déclarées. */
export function matchesExactly(p: Platform, key: string): boolean {
  return p.id === key || p.name.toLowerCase() === key || !!p.aliases?.includes(key);
}

/**
 * Le nom saisi CONTIENT la marque, ou l'inverse : « Topstep #2 », « Apex 50k ».
 * À n'employer qu'après avoir épuisé les correspondances exactes — un
 * `includes` sur des chaînes courtes se trompe vite de maison.
 */
export function matchesLoosely(p: Platform, key: string): boolean {
  if (key.includes(p.id) || key.includes(p.name.toLowerCase())) return true;
  if (p.name.toLowerCase().includes(key)) return true;
  return !!p.aliases?.some((a) => key.includes(a));
}

/** Nom affiché d'une plateforme depuis son id (ou la valeur telle quelle). */
export function platformName(idOrName: unknown): string {
  if (!idOrName) return "";
  return platformById(idOrName)?.name || String(idOrName);
}
