/**
 * Types canoniques pour un trade et ses statistiques.
 *
 * Un `ParsedTrade` est la sortie standardisée des parsers CSV / HTML.
 * Tous les champs hors core sont optionnels car les brokers exportent
 * des sous-ensembles différents (Tradovate vs MT5 vs WealthCharts...).
 */

export type Direction = "Long" | "Short";

export interface ParsedTrade {
  /** ID stable (broker order ID si dispo, sinon timestamp). */
  id?: string | number;

  /** Date du trade au format ISO ou YYYY-MM-DD. Toujours rempli. */
  date: string;

  /** Symbole (ex. "ES", "NQ", "EURUSD"). Uppercase. */
  symbol: string;

  /** "Long" ou "Short". `side` est un alias historique. */
  direction?: Direction | string;
  side?: Direction | string;

  /** Prix d'entrée et de sortie (en devise du contrat). */
  entry: number;
  exit: number;

  /** P&L réalisé en USD/EUR. Toujours rempli (peut être 0). */
  pnl: number;

  /** Quantité de contrats / lots. */
  quantity?: number;
  qty?: number;
  lot_size?: number;

  /** Heures HH:MM. */
  entryTime?: string;
  exitTime?: string;
  /** Alias historique de entryTime (legacy WealthCharts). */
  time?: string;

  /** Montant notionnel total (qty × prix × multiplicateur). */
  volume?: number;

  /** Frais RÉELS lus sur le relevé. Priment sur le barème de lib/tradeFees.ts —
      d'où l'exigence que `pnl` reste BRUT partout où ce champ est rempli. */
  fees?: number;

  /** Nombre d'ordres ayant constitué ce trade (Tradovate). */
  ordersCount?: number;

  /** "tradovate" | "mt5" | "wealthcharts" | "generic" | ... */
  broker?: string;

  /** "micro" | "mini" | "standard" — déduit du symbole. */
  contract_type?: ContractType;

  /** True si la position n'était pas fermée à l'export (parsing partial). */
  _unclosed?: boolean;

  /** Ordres bruts ayant produit ce trade (Tradovate uniquement). */
  _orders?: unknown[];

  /** Champs additionnels broker-specific (points, pnlPercent, formatted*, etc.). */
  [key: string]: unknown;
}

export type ContractType = "micro" | "mini" | "standard";

export interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;          // 0-100
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;     // 999 = no losses
  sharpeRatio: number;      // annualisé
  maxDrawdown: number;
}

/** Hint passé à `parseCSV` pour court-circuiter la détection auto. */
export type BrokerHint =
  | "tradovate"
  | "ninjatrader"
  | "rithmic"
  | "mt5"
  | "mt5-html"
  | "wealthcharts"
  | "broker-export"
  | "export"
  | "generic"
  | null;
