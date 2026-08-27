import type { BrokerAdapter, BrokerId } from "@/lib/brokers/types";
import { tradovate } from "@/lib/brokers/tradovate";
import { parseCSV, parseMT5CSV, parseMT5HTML, parseWealthChartsCSV, parseNinjaTraderCSV } from "@/lib/csvParsers";

/**
 * Registry des brokers supportés. Pour ajouter un broker :
 *   1) implémenter `BrokerAdapter` dans lib/brokers/<id>.ts
 *   2) l'ajouter ici
 */

/**
 * Fabrique un adapter "prop firm" : import fichier uniquement, parsing
 * auto-détecté (`parseCSV` reconnaît le format Tradovate/Rithmic/CSV générique
 * exporté par la plupart des prop firms). `hint` oriente le fallback de parsing.
 */
function propFirm(
  id: BrokerId,
  name: string,
  description: string,
  color: string,
  initial: string,
  logoPath?: string,
  hint: "tradovate" | "generic" = "tradovate",
): BrokerAdapter {
  return {
    meta: {
      id,
      name,
      description,
      features: { fileImport: true, apiSync: false },
      color,
      initial,
      logoPath,
    },
    parseFile(content: string) {
      return parseCSV(content, hint);
    },
  };
}

export const BROKERS: Record<BrokerId, BrokerAdapter> = {
  tradovate,
  rithmic: {
    meta: {
      id: "rithmic",
      name: "Rithmic",
      description: "Futures broker. Format compatible Tradovate (mêmes colonnes Orders).",
      features: { fileImport: true, apiSync: false },
      color: "#7C3AED",
      initial: "R",
      logoPath: "/brokers/rithmic.png",
    },
    parseFile: tradovate.parseFile,
  },
  mt5: {
    meta: {
      id: "mt5",
      name: "MetaTrader 5",
      description: "Forex / CFD. Export CSV ou rapport HTML depuis Historique > Détaillé.",
      features: { fileImport: true, apiSync: false },
      color: "#0891B2",
      initial: "M",
      logoPath: "/MetaTrader_5.png",
    },
    parseFile(content: string) {
      // Détecte HTML vs CSV selon le contenu
      if (/<html/i.test(content) || /<table/i.test(content)) {
        return parseMT5HTML(content);
      }
      return parseMT5CSV(content);
    },
  },
  ninjatrader: {
    meta: {
      id: "ninjatrader",
      name: "NinjaTrader",
      description: "Futures (live & sim/démo). Export depuis Control Center → Trade Performance → Right-click → Export.",
      features: { fileImport: true, apiSync: false },
      color: "#F97316",
      initial: "N",
      logoPath: "/brokers/ninja%20trader.png",
    },
    parseFile(content: string) {
      return parseNinjaTraderCSV(content);
    },
  },
  ibkr: {
    meta: {
      id: "ibkr",
      name: "Interactive Brokers",
      description: "Stocks, options, futures. Export Activity Statement → CSV.",
      features: { fileImport: false, apiSync: false },
      color: "#DC2626",
      initial: "I",
      logoPath: "/brokers/Interactive%20broker.png",
    },
  },
  wealthcharts: {
    meta: {
      id: "wealthcharts",
      name: "WealthCharts",
      description: "Plateforme de trading. Export trades → CSV.",
      features: { fileImport: true, apiSync: false },
      color: "#059669",
      initial: "W",
      logoPath: "/weal.webp",
    },
    parseFile(content: string) {
      return parseWealthChartsCSV(content);
    },
  },

  // ── Prop firms futures (exécution via Tradovate / Rithmic / NinjaTrader / ProjectX) ──
  topstep: propFirm("topstep", "Topstep", "Prop firm futures. Export CSV depuis TopstepX (Performance → Trades).", "#16A34A", "T", "/brokers/Topstep_Logo.jpg"),
  apex: propFirm("apex", "Apex Trader Funding", "Prop firm futures. Export CSV depuis la plateforme (Tradovate / Rithmic).", "#8B5CF6", "A", "/brokers/apex.avif"),
  alphafutures: propFirm("alphafutures", "Alpha Futures", "Prop firm futures. Export CSV depuis le dashboard (plateforme ProjectX).", "#0EA5E9", "A", "/brokers/alpha%20futur.svg"),
  tradeify: propFirm("tradeify", "Tradeify", "Prop firm futures. Export CSV depuis le dashboard (plateforme ProjectX).", "#F43F5E", "T", "/brokers/Tradeify.png"),
  lucid: propFirm("lucid", "Lucid Trading", "Prop firm futures. Export CSV depuis le dashboard (plateforme ProjectX).", "#6366F1", "L", "/brokers/lucid.png"),
  traday: propFirm("traday", "Traday", "Prop firm futures. Export CSV depuis le dashboard (plateforme ProjectX).", "#7A5CFF", "TR"),
  myfundedfutures: propFirm("myfundedfutures", "MyFundedFutures", "Prop firm futures. Export CSV depuis la plateforme (Tradovate / Rithmic / ProjectX).", "#12E29A", "MF"),

  // ── Prop firms forex / CFD ──
  ftmo: propFirm("ftmo", "FTMO", "Prop firm forex/CFD. Export CSV ou rapport HTML MetaTrader.", "#2563EB", "F", "/brokers/ftmo.png", "generic"),
};

export function getBroker(id: string): BrokerAdapter | null {
  return BROKERS[id as BrokerId] || null;
}

export function listBrokers(): BrokerAdapter[] {
  return Object.values(BROKERS);
}
