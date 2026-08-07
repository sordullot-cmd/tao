"use client";

/**
 * ⚠️ COMPOSANT HORS CHARTE / PROBABLEMENT MORT.
 *
 * "TAO TRADE AI" — thème cyberpunk (slate/cyan, dégradés Tailwind) qui ne suit
 * PAS le design system de l'app (tokens `T` / var(--color-*), dark-aware).
 * Recherche d'imports : `Agentia` n'est référencé nulle part ailleurs dans le
 * codebase → très probablement orphelin. Candidat à la suppression.
 *
 * Tokenisation « a minima » impossible ici sans réécriture complète : tout le
 * style repose sur des classes utilitaires Tailwind (from-slate-900, text-cyan-400,
 * bg-gradient-to-*, …), pas sur des styles inline mappables aux tokens.
 * → Laissé tel quel volontairement. À retirer plutôt qu'à re-thémer.
 */

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { withNetPnl } from "@/lib/tradeFees";
import ApexChat from "@/components/ApexChatNew";
import AgentNotifications from "@/components/AgentNotifications";
import TradeForm from "@/components/TradeForm";

export default function Agentia({ trades: initialTrades = [] }) {
  const supabase = createClient();
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState(initialTrades);
  const [journalNotes, setJournalNotes] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [dailyNotes, setDailyNotes] = useState({});
  const [strategyStats, setStrategyStats] = useState([]);
  const [activeTab, setActiveTab] = useState("chat");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id || "demo-" + Math.random().toString(36).substr(2, 9));
      } catch (err) {
        setUserId("demo-" + Math.random().toString(36).substr(2, 9));
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, [supabase]);

  // Fonction pour calculer les stats de stratégie
  const calculateStrategyStats = (tradesData, strategiesData) => {
    if (!tradesData || !strategiesData) return [];
    
    const stats = strategiesData.map(strategy => {
      // Charger les assignments depuis localStorage
      let assignments = {};
      try {
        const stored = localStorage.getItem('tr4de_trade_strategies');
        assignments = stored ? JSON.parse(stored) : {};
      } catch (err) {
        console.warn("Erreur loading trade assignments:", err);
      }

      // Filtrer les trades de cette stratégie
      const strategyTrades = tradesData.filter(trade => {
        let strategyIds = assignments[trade.id] || [];
        if (!strategyIds.length && trade.date && trade.symbol && trade.entry) {
          strategyIds = assignments[`${trade.date}${trade.symbol}${trade.entry}`] || [];
        }
        return strategyIds.includes(strategy.id);
      });

      if (strategyTrades.length === 0) return null;

      // Calculer les stats
      const wins = strategyTrades.filter(t => t.pnl > 0).length;
      const losses = strategyTrades.filter(t => t.pnl < 0).length;
      const totalPnL = strategyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const winRate = strategyTrades.length > 0 ? (wins / strategyTrades.length * 100) : 0;
      const avgPnL = strategyTrades.length > 0 ? totalPnL / strategyTrades.length : 0;

      return {
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        tradeCount: strategyTrades.length,
        wins,
        losses,
        winRate: winRate.toFixed(1),
        totalPnL: totalPnL.toFixed(2),
        avgPnL: avgPnL.toFixed(2),
        color: strategy.color,
      };
    }).filter(s => s !== null);

    return stats;
  };

  useEffect(() => {
    if (!userId) return;

    const readLocal = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    };

    // Convertit une map { tradeId: "note" } en tableau [{ trade_id, notes }]
    const tradeNotesMapToArray = (map) =>
      Object.entries(map || {})
        .filter(([, notes]) => notes && String(notes).trim())
        .map(([trade_id, notes]) => ({ trade_id, notes: String(notes) }));

    // 1️⃣ Charger IMMÉDIATEMENT depuis localStorage (marche pour démo + auth)
    const localStrategies = readLocal("tr4de_strategies", []);
    const localDailyNotes = readLocal("tr4de_daily_notes", {});
    const localTradeNotes = tradeNotesMapToArray(readLocal("tr4de_trade_notes", {}));

    console.log("⚡ Agentia: chargement localStorage", {
      strategies: localStrategies.length,
      dailyNotes: Object.keys(localDailyNotes).length,
      tradeNotes: localTradeNotes.length,
    });

    setStrategies(localStrategies);
    setDailyNotes(localDailyNotes);
    setJournalNotes(localTradeNotes);

    // Stats calculées à partir des trades déjà en state et des stratégies locales
    setTrades((currentTrades) => {
      if (currentTrades && currentTrades.length && localStrategies.length) {
        setStrategyStats(calculateStrategyStats(currentTrades, localStrategies));
      }
      return currentTrades;
    });

    // 2️⃣ Utilisateur démo → on s'arrête là (localStorage suffit)
    if (userId.startsWith("demo-")) return;

    // 3️⃣ Sync Supabase en arrière-plan et fusion avec le local
    const syncFromSupabase = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          console.log("ℹ️ Pas d'auth → on garde les données localStorage");
          return;
        }

        console.log("🔄 Agentia: sync Supabase pour", userId);

        const [tradesRes, notesRes, stratsRes, dailyRes] = await Promise.all([
          supabase.from("trades").select("*").eq("user_id", userId).order("entry_time", { ascending: false }),
          supabase.from("trade_details").select("trade_id, notes").eq("user_id", userId).not("notes", "is", null),
          supabase.from("strategies").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
          supabase.from("daily_session_notes").select("date, notes").eq("user_id", userId).order("date", { ascending: false }),
        ]);

        // Trades
        let mergedTrades = [];
        if (tradesRes.data?.length) {
          const netData = withNetPnl(tradesRes.data);
          setTrades(netData);
          mergedTrades = netData;
        }

        // Stratégies : Supabase prioritaire, sinon on garde le local
        const mergedStrategies = stratsRes.data?.length ? stratsRes.data : localStrategies;
        if (stratsRes.data?.length) setStrategies(stratsRes.data);

        // Stats recalculées avec les données fusionnées
        if (mergedTrades.length && mergedStrategies.length) {
          setStrategyStats(calculateStrategyStats(mergedTrades, mergedStrategies));
        }

        // Notes de trade : fusion Supabase + localStorage (clé = trade_id)
        if (notesRes.data?.length) {
          const byTrade = new Map(localTradeNotes.map((n) => [n.trade_id, n]));
          notesRes.data.forEach((n) => {
            if (n.notes) byTrade.set(n.trade_id, { trade_id: n.trade_id, notes: n.notes });
          });
          setJournalNotes(Array.from(byTrade.values()));
        }

        // Notes journalières : fusion (local prioritaire sur remote en cas de conflit)
        if (dailyRes.data?.length) {
          const remoteMap = {};
          dailyRes.data.forEach((e) => { if (e.notes) remoteMap[e.date] = e.notes; });
          setDailyNotes({ ...remoteMap, ...localDailyNotes });
        }

        console.log("✅ Agentia: sync terminée", {
          trades: tradesRes.data?.length || 0,
          tradeNotes: notesRes.data?.length || 0,
          strategies: stratsRes.data?.length || 0,
          dailyNotes: dailyRes.data?.length || 0,
          errors: {
            trades: tradesRes.error?.code,
            notes: notesRes.error?.code,
            strats: stratsRes.error?.code,
            daily: dailyRes.error?.code,
          },
        });
      } catch (err) {
        console.error("❌ Sync Supabase:", err);
      }
    };

    syncFromSupabase();
  }, [userId, supabase]);

  const handleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) setAuthError(error.message);
      else setShowAuth(false);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const renderTrade = (trade) => (
    <div key={trade.id} className="p-4 bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-lg hover:border-cyan-500 transition-all">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-slate-400">Symbole</p>
          <p className="text-lg font-bold text-cyan-400">{trade.symbol}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">P&L</p>
          <p className={`text-lg font-bold ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            ${trade.pnl?.toFixed(2) || 0}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Entrée</p>
          <p className="text-sm text-white">{trade.entry_price}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Heure</p>
          <p className="text-sm text-slate-300">{new Date(trade.entry_time).toLocaleString("fr-FR")}</p>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-cyan-400 text-lg">Initialisation tao...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">⚡</span>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              TAO TRADE AI
            </h1>
          </div>
          <button
            onClick={() => setShowAuth(!showAuth)}
            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-white font-medium transition-all"
          >
            {userId?.startsWith("demo-") ? "Mode Démo" : "Profil"}
          </button>
        </div>
      </header>

      {/* Auth Modal */}
      {showAuth && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-96">
            <h2 className="text-xl font-bold text-cyan-400 mb-4">Connexion</h2>
            <input type="email" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded mb-3 text-white" />
            <input type="password" placeholder="Mot de passe" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded mb-3 text-white" />
            {authError && <p className="text-red-400 text-sm mb-3">{authError}</p>}
            <div className="flex gap-2">
              <button onClick={handleLogin} className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-white font-medium">Se connecter</button>
              <button onClick={() => setShowAuth(false)} className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white font-medium">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-700 pb-0">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-6 py-3 font-medium transition-all border-b-2 ${
              activeTab === "chat"
                ? "text-cyan-400 border-cyan-400"
                : "text-slate-400 border-transparent hover:text-slate-300"
            }`}
          >
            💬 Agent IA
          </button>
          <button
            onClick={() => setActiveTab("trades")}
            className={`px-6 py-3 font-medium transition-all border-b-2 ${
              activeTab === "trades"
                ? "text-cyan-400 border-cyan-400"
                : "text-slate-400 border-transparent hover:text-slate-300"
            }`}
          >
            📊 Mes Trades ({trades.length})
          </button>
          <button
            onClick={() => setActiveTab("addtrade")}
            className={`px-6 py-3 font-medium transition-all border-b-2 ${
              activeTab === "addtrade"
                ? "text-cyan-400 border-cyan-400"
                : "text-slate-400 border-transparent hover:text-slate-300"
            }`}
          >
            ➕ Ajouter Trade
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "chat" && (
          <div className="animate-fadeIn">
            <ApexChat 
              userId={userId} 
              trades={trades} 
              journalNotes={journalNotes}
              strategies={strategies}
              strategyStats={strategyStats}
              dailyNotes={dailyNotes}
            />
          </div>
        )}

        {activeTab === "trades" && (
          <div className="animate-fadeIn">
            <div className="mb-6 grid grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600 rounded-lg p-4">
                <p className="text-sm text-slate-400">Total Trades</p>
                <p className="text-3xl font-bold text-cyan-400">{trades.length}</p>
              </div>
              <div className="bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600 rounded-lg p-4">
                <p className="text-sm text-slate-400">Win Rate</p>
                <p className="text-3xl font-bold text-green-400">
                  {trades.length > 0
                    ? ((trades.filter((t) => t.pnl > 0).length / trades.length) * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
              <div className="bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600 rounded-lg p-4">
                <p className="text-sm text-slate-400">Total P&L</p>
                <p className={`text-3xl font-bold ${
                  trades.reduce((sum, t) => sum + (t.pnl || 0), 0) >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}>
                  ${trades.reduce((sum, t) => sum + (t.pnl || 0), 0).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {trades.length === 0 ? (
                <p className="text-slate-400 text-center py-8">Aucun trade enregistré</p>
              ) : (
                trades.map((trade) => renderTrade(trade))
              )}
            </div>
          </div>
        )}

        {activeTab === "addtrade" && (
          <div className="animate-fadeIn">
            <TradeForm userId={userId} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 text-sm">
          <p>tao trade AI © 2026 | Coach IA Spécialisé en Trading</p>
        </div>
      </footer>

      <AgentNotifications />
    </div>
  );
}
