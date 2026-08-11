"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTrades } from "@/lib/hooks/useTradeData";
import { useStrategies } from "@/lib/hooks/useUserData";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { useTradingAccounts } from "@/lib/hooks/useTradingAccounts";
import { isPlaceholderAccount } from "@/lib/utils/placeholderAccount";

type AccountType = "live" | "eval";

export interface AppContextValue {
  // Auth
  userId: string | null;
  userEmail: string | null;

  // Trades + strategies (already cloud-backed)
  trades: any[];
  /** Trades filtrés par les comptes sélectionnés (sans filtre de date — celui-ci est par-page). */
  tradesByAccount: any[];
  tradesLoading: boolean;
  addTrade: (trade: any) => Promise<void> | void;
  updateTrade: (id: string, patch: any) => Promise<void> | void;
  deleteTrade: (id: string) => Promise<void> | void;
  strategies: any[];
  addStrategy: (s: any) => Promise<void> | void;
  updateStrategy: (id: string, patch: any) => Promise<void> | void;
  deleteStrategy: (id: string) => Promise<void> | void;

  /** Liste des comptes de trading de l'utilisateur. */
  accounts: { id: string; name: string }[];

  // Account selection (UI state — persisted in localStorage)
  selectedAccountIds: string[];

  accountType: AccountType;
  setAccountType: (t: AccountType) => void;

  selectedEvalAccount: string;
  setSelectedEvalAccount: (s: string) => void;

  // Routing
  page: string;
  setPage: (p: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    if (typeof fallback === "string") return v as unknown as T;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {}
}

interface AppProviderProps {
  children: ReactNode;
  initialPage?: string;
}

export function AppProvider({ children, initialPage = "dashboard" }: AppProviderProps) {
  const { user } = useAuth();
  const tradesApi = useTrades();
  const strategiesApi = useStrategies();
  const { accounts: rawAccounts } = useTradingAccounts(user?.id);

  // Init depuis le hash de l'URL (#agenda, …) — utilisé notamment par le
  // retour OAuth Google Agenda. Sinon, page par défaut.
  const [page, setPage] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const h = window.location.hash.replace(/^#/, "").trim();
      if (h) return h;
    }
    return initialPage;
  });

  // Synchronise la navigation par hash (#page) après le montage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => {
      const h = window.location.hash.replace(/^#/, "").trim();
      if (h) setPage(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [accountType, _setAccountType] = useState<AccountType>(() =>
    readLS<AccountType>("accountType", "live")
  );
  const [selectedEvalAccount, _setSelectedEvalAccount] = useState<string>(() =>
    readLS<string>("selectedEvalAccount", "25k")
  );

  /* La sélection de comptes a été supprimée du produit : tous les comptes
     actifs comptent, tout le temps. `selectedAccountIds` reste exposé comme
     valeur dérivée (tous les comptes réels) pour les consommateurs existants,
     et `tradesByAccount` ne filtre plus que le compte placeholder. */
  const rawTrades = tradesApi.trades || [];
  const selectedAccountIds = useMemo(
    () => (rawAccounts || []).map(a => a.id).filter(id => !isPlaceholderAccount(id)),
    [rawAccounts]
  );
  const tradesByAccount = useMemo(
    () => rawTrades.filter((t: { account_id?: string }) => !isPlaceholderAccount(t.account_id || "")),
    [rawTrades]
  );
  const setAccountType = (t: AccountType) => {
    _setAccountType(t);
    writeLS("accountType", t);
  };
  const setSelectedEvalAccount = (s: string) => {
    _setSelectedEvalAccount(s);
    writeLS("selectedEvalAccount", s);
  };

  const value: AppContextValue = {
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,

    trades: tradesApi.trades || [],
    tradesByAccount,
    tradesLoading: !!(tradesApi as { loading?: boolean }).loading,
    addTrade: tradesApi.addTrade,
    updateTrade: tradesApi.updateTrade,
    deleteTrade: tradesApi.deleteTrade,

    strategies: strategiesApi.strategies || [],
    addStrategy: strategiesApi.addStrategy,
    updateStrategy: strategiesApi.updateStrategy,
    deleteStrategy: strategiesApi.deleteStrategy,

    accounts: (rawAccounts || []).map(a => ({ id: a.id, name: a.name })),
    selectedAccountIds,
    accountType,
    setAccountType,
    selectedEvalAccount,
    setSelectedEvalAccount,

    page,
    setPage,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/**
 * useApp — accède à l'état applicatif global (auth, trades, comptes, page).
 * À utiliser dans les composants pages au lieu de receveur les mêmes valeurs
 * via props. Le composant appelant doit être dans <AppProvider/>.
 */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp() must be used within <AppProvider>");
  return ctx;
}
