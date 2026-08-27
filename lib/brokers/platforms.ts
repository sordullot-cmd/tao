/**
 * Catalogue des plateformes d'exécution et des prop firms connues.
 *
 * Source unique partagée par la page Ajouter un trade (choix du format de
 * fichier à parser), les modales de création de compte/firme et la page détail
 * d'une firme. Avant, la liste était dupliquée dans AddTradePage.
 */

export interface Platform {
  id: string;
  name: string;
  /** Format de fichier attendu à l'import (oriente le parseur). */
  format: "csv" | "html";
  iconPath?: string;
  /** true = maison de prop trading (proposée comme preset de firme). */
  propFirm?: boolean;
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
  // Plateformes / brokers futures (exécution)
  { id: "tradovate",    name: "Tradovate",           format: "csv",  iconPath: "/trado.png" },
  { id: "rithmic",      name: "Rithmic R|Trader",    format: "csv",  iconPath: "/brokers/rithmic.png" },
  { id: "ninjatrader",  name: "NinjaTrader",         format: "csv",  iconPath: "/brokers/ninja%20trader.png" },
  // Prop firms futures
  { id: "topstep",      name: "Topstep",             format: "csv",  iconPath: "/brokers/Topstep_Logo.jpg", propFirm: true },
  { id: "apex",         name: "Apex Trader Funding", format: "csv",  iconPath: "/brokers/apex.avif",         propFirm: true },
  { id: "alphafutures", name: "Alpha Futures",       format: "csv",  iconPath: "/brokers/alpha%20futur.svg", propFirm: true },
  { id: "tradeify",     name: "Tradeify",            format: "csv",  iconPath: "/brokers/Tradeify.png",      propFirm: true },
  { id: "lucid",        name: "Lucid Trading",       format: "csv",  iconPath: "/brokers/lucid.png",         propFirm: true },
  { id: "tradeday",     name: "TradeDay",            format: "csv",  iconPath: "/brokers/tradeday_logo.jpeg", propFirm: true, aliases: ["trade day"] },
  { id: "myfundedfutures", name: "MyFundedFutures",  format: "csv",  iconPath: "/brokers/myfundedfuture.svg", propFirm: true, aliases: ["my funded futures", "mffu"] },
  // Prop firms forex / CFD
  { id: "ftmo",         name: "FTMO",                format: "csv",  iconPath: "/brokers/ftmo.png",          propFirm: true },
  // Plateformes
  { id: "tradingview",  name: "TradingView",         format: "csv",  iconPath: "/brokers/tradingview.webp" },
  { id: "mt5",          name: "MetaTrader 5",        format: "html", iconPath: "/MetaTrader_5.png" },
  { id: "mt4",          name: "MetaTrader 4",        format: "html", iconPath: "/brokers/MetaTrader_4.png" },
  { id: "thinkorswim",  name: "thinkorswim",         format: "csv",  iconPath: "/brokers/thinkorswim.png" },
  { id: "wealthcharts", name: "WealthCharts",        format: "csv",  iconPath: "/weal.webp" },
  // Brokers actions / CFD
  { id: "ibkr",         name: "Interactive Brokers", format: "csv",  iconPath: "/brokers/Interactive%20broker.png" },
  { id: "capitalcom",   name: "Capital.com",         format: "csv",  iconPath: "/brokers/capital.png" },
  { id: "ig",           name: "IG",                  format: "csv",  iconPath: "/brokers/ig%20logo.png" },
  { id: "webull",       name: "Webull",              format: "csv",  iconPath: "/brokers/webull.png" },
];

/** Firmes proposées en un clic dans la modale de création de firme. */
export const PROP_FIRM_PRESETS = PLATFORMS.filter((p) => p.propFirm);

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
  const key = String(idOrName).trim().toLowerCase();
  return PLATFORMS.find((p) => p.id === key)?.name || String(idOrName);
}
