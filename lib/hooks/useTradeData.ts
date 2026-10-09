import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import { useState, useEffect, useCallback, useMemo } from "react";
import { withNetPnl } from "@/lib/tradeFees";

/**
 * Hook pour gérer les détails de trades (notes, tags, etc.)
 */
export function useTradeDetails() {
  const { user } = useAuth();
  const supabase = createClient();
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charger les détails des trades
  useEffect(() => {
    if (!user?.id) return;

    const fetchDetails = async () => {
      try {
        setLoading(true);
        const { data, error: err } = await supabase
          .from("trade_details")
          .select("*")
          .eq("user_id", user.id);

        if (err) throw err;

        // Convertir en map pour accès rapide
        const detailsMap: Record<string, any> = {};
        data?.forEach((detail) => {
          detailsMap[detail.trade_id] = detail;
        });
        setDetails(detailsMap);
      } catch (err) {
        console.error("❌ Erreur récupération détails trades:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [user?.id]);

  // Obtenir les détails d'un trade spécifique
  const getTradeDetail = useCallback(
    (tradeId) => {
      return details[tradeId];
    },
    [details]
  );

  // Ajouter des détails pour un trade
  const addTradeDetail = useCallback(
    async (tradeId, detailData) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("trade_details")
          .insert([
            {
              ...detailData,
              trade_id: tradeId,
              user_id: user.id,
            },
          ])
          .select();

        if (err) throw err;
        setDetails({
          ...details,
          [tradeId]: data[0],
        });
        return data[0];
      } catch (err) {
        console.error("❌ Erreur ajout détails trade:", err);
        throw err;
      }
    },
    [user?.id, details]
  );

  // Mettre à jour les détails d'un trade
  const updateTradeDetail = useCallback(
    async (detailId, updates) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("trade_details")
          .update(updates)
          .eq("id", detailId)
          .eq("user_id", user.id)
          .select();

        if (err) throw err;

        // Trouver le tradeId et mettre à jour
        const tradeId = data[0].trade_id;
        setDetails({
          ...details,
          [tradeId]: data[0],
        });
        return data[0];
      } catch (err) {
        console.error("❌ Erreur mise à jour détails trade:", err);
        throw err;
      }
    },
    [user?.id, details]
  );

  // Supprimer les détails d'un trade
  const deleteTradeDetail = useCallback(
    async (detailId, tradeId) => {
      if (!user?.id) return;

      try {
        const { error: err } = await supabase
          .from("trade_details")
          .delete()
          .eq("id", detailId)
          .eq("user_id", user.id);

        if (err) throw err;

        const newDetails = { ...details };
        delete newDetails[tradeId];
        setDetails(newDetails);
      } catch (err) {
        console.error("❌ Erreur suppression détails trade:", err);
        throw err;
      }
    },
    [user?.id, details]
  );

  return {
    details,
    loading,
    error,
    getTradeDetail,
    addTradeDetail,
    updateTradeDetail,
    deleteTradeDetail,
  };
}

/**
 * Hook pour gérer les comptes de trading
 */
export function useTradingAccounts() {
  const { user } = useAuth();
  const supabase = createClient();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charger les comptes de trading
  useEffect(() => {
    if (!user?.id) return;

    const fetchAccounts = async () => {
      try {
        setLoading(true);
        const { data, error: err } = await supabase
          .from("trading_accounts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (err) throw err;
        setAccounts(data || []);
      } catch (err) {
        console.error("❌ Erreur récupération comptes trading:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, [user?.id]);

  // Ajouter un compte de trading
  const addAccount = useCallback(
    async (accountData) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("trading_accounts")
          .insert([{ ...accountData, user_id: user.id }])
          .select();

        if (err) throw err;
        setAccounts([...accounts, data[0]]);
        return data[0];
      } catch (err) {
        console.error("❌ Erreur ajout compte:", err);
        throw err;
      }
    },
    [user?.id, accounts]
  );

  // Mettre à jour un compte de trading
  const updateAccount = useCallback(
    async (id, updates) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("trading_accounts")
          .update(updates)
          .eq("id", id)
          .eq("user_id", user.id)
          .select();

        if (err) throw err;
        setAccounts(
          accounts.map((a) => (a.id === id ? data[0] : a))
        );
        return data[0];
      } catch (err) {
        console.error("❌ Erreur mise à jour compte:", err);
        throw err;
      }
    },
    [user?.id, accounts]
  );

  // Supprimer un compte de trading
  const deleteAccount = useCallback(
    async (id) => {
      if (!user?.id) return;

      try {
        const { error: err } = await supabase
          .from("trading_accounts")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (err) throw err;
        setAccounts(accounts.filter((a) => a.id !== id));
      } catch (err) {
        console.error("❌ Erreur suppression compte:", err);
        throw err;
      }
    },
    [user?.id, accounts]
  );

  return {
    accounts,
    loading,
    error,
    addAccount,
    updateAccount,
    deleteAccount,
  };
}

/**
 * Hook pour gérer les trades
 */
export function useTrades() {
  const { user } = useAuth();
  const supabase = createClient();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ⚡ FAST PATH: Charger localStorage immédiatement, puis syncer Supabase en arrière-plan
  useEffect(() => {
    if (!user?.id) {
      console.log("🚫 useTrades: Pas d'utilisateur, skip fetch");
      setLoading(false);
      return;
    }

    // Charger localStorage IMMÉDIATEMENT
    try {
      const stored = localStorage.getItem("tao_trades");
      const cachedTrades = stored ? JSON.parse(stored) : [];
      setTrades(cachedTrades);
      setLoading(false); // ✅ UI prête instantanément
      console.log("⚡ Trades chargés depuis localStorage:", cachedTrades.length);
    } catch (parseErr) {
      console.error("Erreur parsing localStorage:", parseErr);
      setTrades([]);
      setLoading(false);
    }

    // 🔄 Syncer Supabase en arrière-plan sans bloquer l'UI
    const syncFromSupabase = async () => {
      try {
        console.log("📥 useTrades: Syncing trades for user:", user.id);
        const { data, error: err } = await supabase
          .from("apex_trades")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (err) {
          console.error("❌ Erreur Supabase récupération trades:", {
            message: err.message,
            code: err.code,
            details: err.details
          });
          return;
        }
        console.log(`✅ ${data?.length || 0} trades depuis Supabase`);
        
        // Fusionner: Supabase comme source de vérité, mais garder les additions locales
        setTrades(prev => {
          const merged = data || [];
          // Ajouter les trades locaux qui ne sont pas sur Supabase (en cas d'offline)
          prev.forEach(local => {
            if (!merged.find(s => s.id === local.id)) {
              merged.push(local);
            }
          });
          return merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        });
        
        // Sauvegarder dans localStorage
        const tradesArray = data || [];
        localStorage.setItem("tao_trades", JSON.stringify(tradesArray));
      } catch (err) {
        console.error("❌ Erreur sync trades:", getErrorMessage(err) || JSON.stringify(err));
      }
    };

    syncFromSupabase(); // Fire and forget

    // ✅ NEW: Listen for custom trades-refreshed event (from import process)
    const handleTradesRefreshed = (e) => {
      console.log("📡 Custom event detected - trades refreshed, reloading...");
      const newTrades = e.detail?.trades;
      if (newTrades && Array.isArray(newTrades)) {
        console.log(`📥 Loaded ${newTrades.length} trades from refresh event`);
        setTrades(newTrades);
      }
    };

    // ✅ NEW: Listen for storage changes from other tabs/windows
    const handleStorageChange = (e) => {
      if (e.key === "tao_trades" && e.newValue) {
        try {
          const updatedTrades = JSON.parse(e.newValue);
          console.log("📡 Storage change detected - updating trades from:", updatedTrades.length);
          setTrades(updatedTrades);
        } catch (err) {
          console.error("❌ Error parsing storage update:", err);
        }
      }
    };

    window.addEventListener("trades-refreshed", handleTradesRefreshed);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("trades-refreshed", handleTradesRefreshed);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [user?.id]);

  // Ajouter un trade
  const addTrade = useCallback(
    async (tradeData) => {
      if (!user?.id) return;

      try {
        console.log("➕ Adding trade:", tradeData);
        
        // Créer localement d'abord (mapping camelCase → snake_case pour Supabase)
        const newTrade: any = {
          ...tradeData,
          id: tradeData.id || crypto.randomUUID?.() || Date.now().toString(),
          user_id: user.id,
          created_at: new Date().toISOString()
        };
        if (tradeData.entryTime && !newTrade.entry_time) newTrade.entry_time = tradeData.entryTime;
        if (tradeData.exitTime && !newTrade.exit_time) newTrade.exit_time = tradeData.exitTime;
        
        // Update local state
        setTrades(prev => [newTrade, ...prev]);
        
        // Sauvegarder dans localStorage
        setTrades(prev => {
          localStorage.setItem("tao_trades", JSON.stringify(prev));
          return prev;
        });
        
        // Essayer Supabase en arrière-plan (ne garder que les colonnes existantes)
        const allowed = [
          "id","user_id","account_id","date","symbol","direction","entry","exit",
          "pnl","entry_time","exit_time","contract_type","quantity","volume","created_at"
        ];
        const dbTrade: any = {};
        for (const k of allowed) if (newTrade[k] !== undefined) dbTrade[k] = newTrade[k];

        const { data, error: err } = await supabase
          .from("apex_trades")
          .insert([dbTrade])
          .select();

        if (err) {
          console.error("⚠️ Erreur Supabase ajout trade:", err);
          // Mais on garde le trade localement
          return;
        }
        console.log("✅ Trade ajouté à Supabase:", data?.[0]);
        
        // Mettre à jour avec l'ID Supabase si nouveau
        if (data?.[0]?.id && data[0].id !== newTrade.id) {
          setTrades(prev => prev.map(t => t.id === newTrade.id ? data[0] : t));
          localStorage.setItem("tao_trades", JSON.stringify(trades.map(t => t.id === newTrade.id ? data[0] : t)));
        }
        return data?.[0] || newTrade;
      } catch (err) {
        console.error("❌ Erreur ajout trade:", getErrorMessage(err) || JSON.stringify(err));
      }
    },
    [user?.id]
  );

  // Mettre à jour un trade
  const updateTrade = useCallback(
    async (id, updates) => {
      if (!user?.id) return;

      try {
        console.log("📄 Updating trade:", id, updates);
        
        // Update local state immédiatement
        setTrades(prev => {
          const updated = prev.map(t => t.id === id ? { ...t, ...updates } : t);
          localStorage.setItem("tao_trades", JSON.stringify(updated));
          return updated;
        });

        // Sync Supabase en arrière-plan
        const { data, error: err } = await supabase
          .from("apex_trades")
          .update(updates)
          .eq("id", id)
          .eq("user_id", user.id)
          .select();

        if (err) {
          console.error("⚠️ Erreur Supabase mise à jour trade:", err);
          return;
        }
        console.log("✅ Trade mis à jour:", data?.[0]);
        return data?.[0];
      } catch (err) {
        console.error("❌ Erreur mise à jour trade:", getErrorMessage(err) || JSON.stringify(err));
      }
    },
    [user?.id]
  );

  // Supprimer un trade
  const deleteTrade = useCallback(
    async (id) => {
      if (!user?.id) return;

      try {
        console.log("🗑 Deleting trade:", id);
        
        // Supprimer localement IMMÉDIATEMENT
        setTrades(prev => {
          const filtered = prev.filter(t => t.id !== id);
          localStorage.setItem("tao_trades", JSON.stringify(filtered));
          console.log("✅ Trade supprimé localement, now", filtered.length, "trades");
          return filtered;
        });

        // Supprimer de Supabase en arrière-plan
        const { error: err } = await supabase
          .from("apex_trades")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (err) {
          console.error("⚠️ Erreur Supabase suppression trade:", err);
          // Mais on a déjà supprimé localement, c'est bon
          return;
        }
        console.log("✅ Trade supprimé de Supabase");
      } catch (err) {
        console.error("❌ Erreur suppression trade:", getErrorMessage(err) || JSON.stringify(err));
      }
    },
    [user?.id]
  );

  // Le state interne (et localStorage / Supabase) conserve le P&L BRUT ; on
  // expose aux consommateurs un P&L NET de frais (brut préservé dans pnlGross).
  // La transformation est idempotente, donc aucune écriture ne re-déduit.
  const netTrades = useMemo(() => withNetPnl(trades), [trades]);

  return {
    trades: netTrades,
    loading,
    error,
    addTrade,
    updateTrade,
    deleteTrade,
  };
}
