/**
 * Types pour l'intégration brokers.
 *
 * Chaque broker supporté implémente l'interface `BrokerAdapter`. L'app
 * utilise ces adapters via le registry (`lib/brokers/registry.ts`) sans
 * connaître les détails de chaque API.
 */

import type { ParsedTrade } from "@/lib/types/trade";

export type BrokerId =
  // Plateformes / brokers d'exécution
  | "tradovate"
  | "rithmic"
  | "mt5"
  | "ibkr"
  | "wealthcharts"
  | "ninjatrader"
  // Prop firms futures
  | "topstep"
  | "apex"
  | "alphafutures"
  | "tradeify"
  | "lucid"
  | "tradeday"
  | "myfundedfutures"
  // Prop firms forex / CFD
  | "ftmo";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface BrokerMeta {
  id: BrokerId;
  name: string;
  description: string;
  /** Capacités supportées par cet adapter. */
  features: {
    /** Import via fichier (CSV/HTML) — toujours dispo. */
    fileImport: boolean;
    /** OAuth + sync auto via API. */
    apiSync: boolean;
  };
  /** URL de la doc broker pour l'export manuel. */
  docsUrl?: string;
  /** Couleur d'accent (header card). */
  color: string;
  /** Lettre/abréviation pour le placeholder logo (fallback si pas de logoPath). */
  initial: string;
  /** Chemin du logo (public/). Si absent, on affiche la pastille `initial`. */
  logoPath?: string;
}

export interface BrokerConnection {
  brokerId: BrokerId;
  status: ConnectionStatus;
  /** ISO date du dernier import / sync réussi. */
  lastSyncAt?: string;
  /** Compte à l'origine de la connexion (display). */
  accountLabel?: string;
  /** Erreur dernière en cas de status="error". */
  errorMessage?: string;
}

export interface BrokerAdapter {
  meta: BrokerMeta;

  /** Parse un fichier (CSV/HTML) brut → ParsedTrade[]. */
  parseFile?(content: string): ParsedTrade[];

  /**
   * Démarre l'OAuth en redirigeant l'utilisateur vers le broker.
   * Renvoie l'URL d'authorize ou null si non implémenté.
   */
  buildAuthUrl?(redirectUri: string, state: string): string | null;

  /**
   * Échange le code OAuth contre un access token.
   * À appeler uniquement côté serveur (la fonction peut throw si elle est
   * exécutée côté client).
   */
  exchangeCode?(code: string, redirectUri: string): Promise<BrokerTokens>;

  /**
   * Synchronise les trades depuis l'API et renvoie ParsedTrade[].
   * À appeler côté serveur (utilise les tokens stockés).
   */
  syncTrades?(tokens: BrokerTokens, since?: Date): Promise<ParsedTrade[]>;
}

export interface BrokerTokens {
  accessToken: string;
  refreshToken?: string;
  /** Date d'expiration ISO (ou null si pas connue). */
  expiresAt?: string | null;
  /** Données brutes (provider-specific) pour debug. */
  raw?: unknown;
}
