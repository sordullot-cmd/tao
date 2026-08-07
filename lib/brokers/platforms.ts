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
  const hit = PLATFORMS.find((p) => p.id === key || p.name.toLowerCase() === key);
  if (hit?.iconPath) return hit.iconPath;
  // Correspondances partielles (données historiques saisies à la main).
  const partial = PLATFORMS.find(
    (p) => key.includes(p.id) || key.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(key)
  );
  return partial?.iconPath || null;
}

/** Nom affiché d'une plateforme depuis son id (ou la valeur telle quelle). */
export function platformName(idOrName: unknown): string {
  if (!idOrName) return "";
  const key = String(idOrName).trim().toLowerCase();
  return PLATFORMS.find((p) => p.id === key)?.name || String(idOrName);
}
