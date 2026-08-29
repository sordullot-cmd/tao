"use client";

import { useState, useMemo } from "react";
import { getLocalDateString } from "@/lib/dateUtils";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { useEscapeDismiss } from "@/lib/hooks/useEscapeDismiss";

const INITIAL_TRADES = [
  {
    id: 1,
    date: "2026-03-31",
    symbol: "NQ",
    direction: "Long",
    setup: "Break & Retest",
    entry: 19842,
    exit: 19920,
    pnl: 312,
    rr: 2.1,
    emotion: "Calm",
    quantity: 1,
    status: "closed",
  },
  {
    id: 2,
    date: "2026-03-31",
    symbol: "ES",
    direction: "Short",
    setup: "Supply Zone",
    entry: 5290,
    exit: 5268,
    pnl: 440,
    rr: 2.4,
    emotion: "Focused",
    quantity: 1,
    status: "closed",
  },
  {
    id: 3,
    date: "2026-03-31",
    symbol: "NQ",
    direction: "Long",
    setup: "VWAP Reclaim",
    entry: 19760,
    exit: 19742,
    pnl: -180,
    rr: -0.8,
    emotion: "FOMO",
    quantity: 1,
    status: "closed",
  },
];

const RULES = [
  { id: "ada", name: "ada", rule: "Always", accuracy: 0 },
];

const STRATEGIES = [
  {
    id: 1,
    name: "Break & Retest",
    description: "Entrée au cassure avec retest de la zone",
    winRate: 72,
    profitFactor: 2.1,
    avgRR: 2.3,
    trades: 28,
    pnl: 2840,
    status: "active",
    timeframe: "1H",
    instruments: ["NQ", "ES"],
  },
  {
    id: 2,
    name: "Supply Zone",
    description: "Vente aux zones de résistance majeure",
    winRate: 65,
    profitFactor: 1.8,
    avgRR: 1.9,
    trades: 31,
    pnl: 1950,
    status: "active",
    timeframe: "4H",
    instruments: ["NQ", "CL"],
  },
  {
    id: 3,
    name: "VWAP Reclaim",
    description: "Achat au reprise du VWAP quotidien",
    winRate: 58,
    profitFactor: 1.5,
    avgRR: 1.6,
    trades: 24,
    pnl: 840,
    status: "testing",
    timeframe: "30M",
    instruments: ["ES"],
  },
  {
    id: 4,
    name: "EMA Bounce",
    description: "Bounce sur l'EMA 20 en trend",
    winRate: 68,
    profitFactor: 1.9,
    avgRR: 2.1,
    trades: 35,
    pnl: 3120,
    status: "active",
    timeframe: "15M",
    instruments: ["NQ", "ES", "CL"],
  },
  {
    id: 5,
    name: "Liquidity Grab",
    description: "Stop hunt suivi d'une continuation",
    winRate: 55,
    profitFactor: 1.4,
    avgRR: 1.5,
    trades: 18,
    pnl: 620,
    status: "paused",
    timeframe: "5M",
    instruments: ["EURUSD"],
  },
];

export default function Strategies({ trades: propTrades = [], tradeStrategies = {} }) {
  const [strategies, setStrategies] = useState(STRATEGIES);
  const [trades, setTrades] = useState(propTrades.length > 0 ? propTrades : INITIAL_TRADES);
  const [showForm, setShowForm] = useState(false);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTradeId, setEditingTradeId] = useState(null);
  /* Échap referme la modale ouverte. Les deux fermetures reprennent exactement
     ce que fait le clic sur le fond, remise à zéro de l'édition comprise. */
  useEscapeDismiss(() => setShowForm(false), showForm);
  useEscapeDismiss(() => { setShowTradeForm(false); setEditingTradeId(null); }, showTradeForm);
  const [activeTab, setActiveTab] = useState("strategies");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    winRate: 60,
    trades: 0,
    pnl: 0,
    profitFactor: 1.5,
    avgRR: 1.8,
    timeframe: "1H",
    instruments: [],
  });
  const [tradeFormData, setTradeFormData] = useState({
    symbol: "",
    direction: "Long",
    setup: "",
    entry: "",
    exit: "",
    quantity: 1,
    emotion: "Neutral",
  });

  // Calculer les métriques basées sur les trades liés
  const strategiesWithCalculatedMetrics = useMemo(() => {
    return strategies.map((strategy) => {
      // Filtrer les trades liés à cette stratégie via les instruments
      const linkedTrades = trades.filter((trade) =>
        strategy.instruments.includes(trade.Symbol || trade.symbol)
      );

      if (linkedTrades.length === 0) {
        return strategy;
      }

      // Calculer les métriques
      const totalTrades = linkedTrades.length;
      const winningTrades = linkedTrades.filter((t) => (t.PnL || t.pnl) > 0);
      const losingTrades = linkedTrades.filter((t) => (t.PnL || t.pnl) < 0);
      const calculatedWinRate =
        totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 100) : 0;
      const calculatedPnL = linkedTrades.reduce((sum, t) => sum + (t.PnL || t.pnl || 0), 0);
      const totalWinPnL = winningTrades.reduce((sum, t) => sum + (t.PnL || t.pnl || 0), 0);
      const totalLossPnL = losingTrades.reduce((sum, t) => sum + (t.PnL || t.pnl || 0), 0);
      const calculatedProfitFactor =
        totalLossPnL !== 0 ? Math.round((totalWinPnL / Math.abs(totalLossPnL)) * 10) / 10 : 0;

      return {
        ...strategy,
        trades: totalTrades,
        winRate: calculatedWinRate,
        pnl: Math.round(calculatedPnL),
        profitFactor: calculatedProfitFactor,
      };
    });
  }, [strategies, trades]);

  // Stats des trades
  const tradeStats = useMemo(() => {
    const validTrades = trades.filter((t) => t.status === "closed");
    const winners = validTrades.filter((t) => t.pnl > 0);
    const losers = validTrades.filter((t) => t.pnl < 0);
    const totalPnL = validTrades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = (totalPnL / (validTrades.length || 1)).toFixed(2);
    const winRate = ((winners.length / (validTrades.length || 1)) * 100).toFixed(1);

    return {
      total: validTrades.length,
      winners: winners.length,
      losers: losers.length,
      winRate,
      totalPnL,
      avgPnL,
    };
  }, [trades]);

  // Filtrer et trier les trades
  const filteredTrades = useMemo(() => {
    let result = [...trades];

    if (filter !== "all") {
      result = result.filter((t) => t.status === filter);
    }

    result.sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.date) - new Date(a.date);
      }
      if (sortBy === "pnl") {
        return b.pnl - a.pnl;
      }
      if (sortBy === "rr") {
        return b.rr - a.rr;
      }
      return 0;
    });

    return result;
  }, [trades, filter, sortBy]);

  const handleAddStrategy = () => {
    if (!formData.name.trim()) return;
    const newStrategy = {
      id: Math.max(...strategies.map(s => s.id), 0) + 1,
      name: formData.name,
      description: formData.description,
      winRate: parseInt(formData.winRate) || 60,
      profitFactor: parseFloat(formData.profitFactor) || 1.5,
      avgRR: parseFloat(formData.avgRR) || 1.8,
      trades: parseInt(formData.trades) || 0,
      pnl: parseInt(formData.pnl) || 0,
      timeframe: formData.timeframe,
      instruments: formData.instruments,
      status: "testing",
    };
    setStrategies([...strategies, newStrategy]);
    setFormData({ name: "", description: "", winRate: 60, trades: 0, pnl: 0, profitFactor: 1.5, avgRR: 1.8, timeframe: "1H", instruments: [] });
    setShowForm(false);
  };

  const handleAddTrade = () => {
    if (!tradeFormData.symbol || !tradeFormData.entry || !tradeFormData.exit) return;

    const entry = parseFloat(tradeFormData.entry);
    const exit = parseFloat(tradeFormData.exit);
    const pnl = tradeFormData.direction === "Long" 
      ? ((exit - entry) * tradeFormData.quantity).toFixed(2)
      : ((entry - exit) * tradeFormData.quantity).toFixed(2);

    const newTrade = {
      id: editingTradeId || (Math.max(...trades.map((t) => t.id), 0) + 1),
      date: getLocalDateString(),
      ...tradeFormData,
      entry: parseFloat(entry),
      exit: parseFloat(exit),
      pnl: parseFloat(pnl),
      rr: 1.5,
      hold: "0m 0s",
      quantity: parseInt(tradeFormData.quantity),
      status: "closed",
    };

    if (editingTradeId) {
      setTrades(
        trades.map((t) => (t.id === editingTradeId ? newTrade : t))
      );
      setEditingTradeId(null);
    } else {
      setTrades([...trades, newTrade]);
    }

    setTradeFormData({
      symbol: "",
      direction: "Long",
      setup: "",
      entry: "",
      exit: "",
      quantity: 1,
      emotion: "Neutral",
    });
    setShowTradeForm(false);
  };

  const handleEditTrade = (trade) => {
    setTradeFormData({
      symbol: trade.symbol,
      direction: trade.direction,
      setup: trade.setup,
      entry: trade.entry,
      exit: trade.exit,
      quantity: trade.quantity,
      emotion: trade.emotion,
    });
    setEditingTradeId(trade.id);
    setShowTradeForm(true);
  };

  const handleDeleteTrade = (id) => {
    setTrades(trades.filter((t) => t.id !== id));
  };

  const getStatusColor = (status) => {
    const colors = {
      active: "#4A9D6F",
      testing: "#9D8555",
      paused: "#AD6B6B",
    };
    return colors[status] || "#5F6B7E";
  };

  const getStatusBg = (status) => {
    const colors = {
      active: "#E6F3EB",
      testing: "#F5EAE0",
      paused: "#F5E6E6",
    };
    return colors[status] || "#F8FAFB";
  };

  return (
    <div className="strategies-container">
      <style>{`
        .strategies-container {
          padding: 24px;
          background: #F7F8FA;
          min-height: 100vh;
          font-family: var(--font-sans);
        }

        .main-layout {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 24px;
        }

        .trades-sidebar {
          background: white;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #E8E9EF;
          max-height: 90vh;
          overflow-y: auto;
        }

        .sidebar-header {
          font-size: 16px;
          font-weight: 700;
          color: #0F0F1A;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid #E8E9EF;
        }

        .tab-btn {
          padding: 10px 16px;
          background: none;
          border: none;
          color: #6B6C80;
          font-weight: 600;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
          font-size: 14px;
        }

        .tab-btn.active {
          color: #6366F1;
          border-bottom-color: #6366F1;
        }

        .tab-btn:hover {
          color: #0F0F1A;
        }

        .trade-stats {
          background: #F7F8FA;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          font-size: 13px;
        }

        .stat-item:last-child {
          margin-bottom: 0;
        }

        .stat-label {
          color: #6B6C80;
          font-weight: 500;
        }

        .stat-value {
          font-weight: 700;
          color: #0F0F1A;
        }

        .stat-value.positive {
          color: #22C55E;
        }

        .stat-value.negative {
          color: #EF4444;
        }

        .trades-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .trade-item {
          background: #F7F8FA;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #E8E9EF;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
        }

        .trade-item:hover {
          border-color: #D4D6DF;
          background: white;
        }

        .trade-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          font-weight: 600;
        }

        .trade-item-symbol {
          color: #6366F1;
        }

        .trade-item-pnl {
          font-weight: 700;
        }

        .trade-item-pnl.positive {
          color: #22C55E;
        }

        .trade-item-pnl.negative {
          color: #EF4444;
        }

        .trade-item-details {
          display: flex;
          justify-content: space-between;
          color: #6B6C80;
          font-size: 11px;
        }

        .trade-item-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .btn-action {
          background: white;
          border: 1px solid #D4D6DF;
          color: #6B6C80;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          transition: all 0.2s ease;
          flex: 1;
          text-align: center;
        }

        .btn-action:hover {
          border-color: #6366F1;
          color: #6366F1;
        }

        .btn-action.delete:hover {
          border-color: #EF4444;
          color: #EF4444;
        }

        .content-area {
          display: flex;
          flex-direction: column;
        }
        
        .strategies-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        
        .strategies-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #0F0F1A;
          margin: 0;
        }
        
        .btn-primary {
          background: #6366F1;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s ease;
        }
        
        .btn-primary:hover {
          background: #4F46E5;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        
        .strategies-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }
        
        .strategy-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #E8E9EF;
          transition: all 0.2s ease;
          cursor: pointer;
        }
        
        .strategy-card:hover {
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
          border-color: #D4D6DF;
        }
        
        .strategy-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 12px;
        }
        
        .strategy-name {
          font-size: 16px;
          font-weight: 700;
          color: #0F0F1A;
          margin: 0;
        }
        
        .strategy-status {
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .strategy-description {
          font-size: 13px;
          color: #6B6C80;
          margin: 8px 0;
          line-height: 1.4;
        }
        
        .strategy-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 16px 0;
          padding-top: 16px;
          padding-bottom: 16px;
          border-top: 1px solid #E8E9EF;
          border-bottom: 1px solid #E8E9EF;
        }
        
        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .meta-label {
          font-size: 11px;
          color: #A0A1B0;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        
        .meta-value {
          font-size: 16px;
          font-weight: 700;
          color: #0F0F1A;
        }
        
        .meta-value.positive {
          color: #22C55E;
        }
        
        .meta-value.negative {
          color: #EF4444;
        }
        
        .strategy-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: #6B6C80;
        }
        
        .instruments-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        
        .tag {
          background: #EEF2FF;
          color: #6366F1;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
        
        .form-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .form-modal {
          background: white;
          border-radius: 12px;
          padding: 24px;
          width: 90%;
          max-width: 500px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
        }
        
        .form-modal h2 {
          font-size: 20px;
          font-weight: 700;
          color: #0F0F1A;
          margin: 0 0 16px 0;
        }
        
        .form-group {
          margin-bottom: 16px;
        }
        
        .form-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #0F0F1A;
          margin-bottom: 6px;
        }
        
        .form-input,
        .form-select,
        .form-textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #D4D6DF;
          border-radius: 8px;
          font-family: inherit;
          font-size: 14px;
          color: #0F0F1A;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        
        .form-input:focus,
        .form-select:focus,
        .form-textarea:focus {
          outline: none;
          border-color: #6366F1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        
        .form-textarea {
          resize: vertical;
          min-height: 80px;
        }
        
        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }
        
        .btn-cancel {
          background: #E8E9EF;
          color: #0F0F1A;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .btn-cancel:hover {
          background: #D4D6DF;
        }

        @media (max-width: 1024px) {
          .main-layout {
            grid-template-columns: 1fr;
          }

          .trades-sidebar {
            max-height: 400px;
          }
        }
      `}</style>

      <div className="main-layout">
        {/* Sidebar - Trade Management */}
        <div className="trades-sidebar">
          <div className="sidebar-header">
            <span>💱 Trades</span>
            <button 
              className="btn-primary" 
              style={{ padding: "6px 12px", fontSize: "12px" }}
              onClick={() => {
                setEditingTradeId(null);
                setTradeFormData({
                  symbol: "",
                  direction: "Long",
                  setup: "",
                  entry: "",
                  exit: "",
                  quantity: 1,
                  emotion: "Neutral",
                });
                setShowTradeForm(true);
              }}
            >
              + Nouveau
            </button>
          </div>

          <div className="tabs">
            <button 
              className={`tab-btn ${activeTab === "stats" ? "active" : ""}`}
              onClick={() => setActiveTab("stats")}
            >
              Stats
            </button>
            <button 
              className={`tab-btn ${activeTab === "list" ? "active" : ""}`}
              onClick={() => setActiveTab("list")}
            >
              Liste
            </button>
          </div>

          {activeTab === "stats" && (
            <div className="trade-stats">
              <div className="stat-item">
                <span className="stat-label">Total Trades</span>
                <span className="stat-value">{tradeStats.total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Gagnants</span>
                <span className="stat-value positive">{tradeStats.winners}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Perdants</span>
                <span className="stat-value negative">{tradeStats.losers}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Win Rate</span>
                <span className="stat-value positive">{tradeStats.winRate}%</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total PnL</span>
                <span className={`stat-value ${tradeStats.totalPnL >= 0 ? "positive" : "negative"}`}>
                  ${tradeStats.totalPnL >= 0 ? "+" : ""}{tradeStats.totalPnL}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Avg PnL</span>
                <span className={`stat-value ${tradeStats.avgPnL >= 0 ? "positive" : "negative"}`}>
                  ${tradeStats.avgPnL >= 0 ? "+" : ""}{tradeStats.avgPnL}
                </span>
              </div>
            </div>
          )}

          {activeTab === "list" && (
            <div className="trades-list">
              {filteredTrades.map((trade) => (
                <div key={trade.id} className="trade-item">
                  <div className="trade-item-header">
                    <span className="trade-item-symbol">{trade.symbol}</span>
                    <span className={`trade-item-pnl ${trade.pnl >= 0 ? "positive" : "negative"}`}>
                      ${trade.pnl >= 0 ? "+" : ""}{trade.pnl}
                    </span>
                  </div>
                  <div className="trade-item-details">
                    <span>{trade.direction}</span>
                    <span>{trade.setup}</span>
                    <span>R/R: {trade.rr}</span>
                  </div>
                  <div className="trade-item-actions">
                    <button 
                      className="btn-action"
                      onClick={() => handleEditTrade(trade)}
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      className="btn-action delete"
                      onClick={() => handleDeleteTrade(trade.id)}
                    >
                      🗑️ Del
                    </button>
                  </div>
                </div>
              ))}
              {filteredTrades.length === 0 && (
                <div style={{ textAlign: "center", color: "#A0A1B0", fontSize: "13px", padding: "20px" }}>
                  Aucun trade pour le moment
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Content - Strategies */}
        <div className="content-area">
          <div className="strategies-header">
            <h1>🎯 Stratégies de Trading</h1>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Nouvelle Stratégie
            </button>
          </div>

          <div className="strategies-grid">
            {strategiesWithCalculatedMetrics.map((strategy) => (
              <div key={strategy.id} className="strategy-card">
                <div className="strategy-header">
                  <h3 className="strategy-name">{strategy.name}</h3>
                  <div
                    className="strategy-status"
                    style={{
                      backgroundColor: getStatusBg(strategy.status),
                      color: getStatusColor(strategy.status),
                    }}
                  >
                    {strategy.status === "active" && "✓ Actif"}
                    {strategy.status === "testing" && "🧪 Test"}
                    {strategy.status === "paused" && "⏸ Pausé"}
                  </div>
                </div>

                <p className="strategy-description">{strategy.description}</p>

                <div className="strategy-meta">
                  <div className="meta-item">
                    <span className="meta-label">🎯 Nombre de Trades</span>
                    <span className="meta-value">{strategy.trades}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">📈 Win Rate</span>
                    <span className="meta-value positive">{strategy.winRate}%</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">💰 PnL Total</span>
                    <span className="meta-value" style={{ color: strategy.pnl >= 0 ? "#22C55E" : "#EF4444" }}>
                      ${strategy.pnl >= 0 ? "+" : ""}{strategy.pnl}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Profit Factor</span>
                    <span className="meta-value positive">{strategy.profitFactor}x</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Avg R/R</span>
                    <span className="meta-value positive">{strategy.avgRR}</span>
                  </div>
                </div>

                <div className="strategy-footer">
                  <div>
                    <span>{strategy.timeframe}</span>
                  </div>
                  <div className="instruments-tags">
                    {strategy.instruments.map((inst) => (
                      <span key={inst} className="tag">
                        {inst}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal - Ajouter/Éditer une Stratégie */}
      {showForm && (
        <div className="form-overlay" {...backdropDismiss(() => setShowForm(false))}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nouvelle Stratégie</h2>

            <div className="form-group">
              <label className="form-label">Nom de la Stratégie *</label>
              <input
                type="text"
                className="form-input"
                placeholder="ex: Break & Retest"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                placeholder="Décrivez votre stratégie..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nombre de Trades</label>
              <input
                type="number"
                className="form-input"
                placeholder="ex: 28"
                value={formData.trades}
                onChange={(e) =>
                  setFormData({ ...formData, trades: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Win Rate (%)</label>
              <input
                type="number"
                className="form-input"
                placeholder="ex: 72"
                min="0"
                max="100"
                value={formData.winRate}
                onChange={(e) =>
                  setFormData({ ...formData, winRate: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">PnL Total ($)</label>
              <input
                type="number"
                className="form-input"
                placeholder="ex: 2840"
                value={formData.pnl}
                onChange={(e) =>
                  setFormData({ ...formData, pnl: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Profit Factor</label>
              <input
                type="number"
                className="form-input"
                placeholder="ex: 2.1"
                step="0.1"
                value={formData.profitFactor}
                onChange={(e) =>
                  setFormData({ ...formData, profitFactor: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Avg R/R</label>
              <input
                type="number"
                className="form-input"
                placeholder="ex: 2.3"
                step="0.1"
                value={formData.avgRR}
                onChange={(e) =>
                  setFormData({ ...formData, avgRR: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Timeframe</label>
              <select
                className="form-select"
                value={formData.timeframe}
                onChange={(e) =>
                  setFormData({ ...formData, timeframe: e.target.value })
                }
              >
                <option>5M</option>
                <option>15M</option>
                <option>30M</option>
                <option selected>1H</option>
                <option>4H</option>
                <option>Daily</option>
              </select>
            </div>

            <div className="form-actions">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowForm(false);
                  setFormData({
                    name: "",
                    description: "",
                    winRate: 60,
                    trades: 0,
                    pnl: 0,
                    profitFactor: 1.5,
                    avgRR: 1.8,
                    timeframe: "1H",
                    instruments: [],
                  });
                }}
              >
                Annuler
              </button>
              <button className="btn-primary" onClick={handleAddStrategy}>
                Créer Stratégie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Ajouter/Éditer un Trade */}
      {showTradeForm && (
        <div className="form-overlay" {...backdropDismiss(() => {
          setShowTradeForm(false);
          setEditingTradeId(null);
        })}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingTradeId ? "Modifier Trade" : "Nouveau Trade"}</h2>

            <div className="form-group">
              <label className="form-label">Symbole *</label>
              <input
                type="text"
                className="form-input"
                placeholder="ex: NQ"
                value={tradeFormData.symbol}
                onChange={(e) =>
                  setTradeFormData({ ...tradeFormData, symbol: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Direction</label>
              <select
                className="form-select"
                value={tradeFormData.direction}
                onChange={(e) =>
                  setTradeFormData({ ...tradeFormData, direction: e.target.value })
                }
              >
                <option>Long</option>
                <option>Short</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Setup</label>
              <input
                type="text"
                className="form-input"
                placeholder="ex: Break & Retest"
                value={tradeFormData.setup}
                onChange={(e) =>
                  setTradeFormData({ ...tradeFormData, setup: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Entry *</label>
              <input
                type="number"
                className="form-input"
                placeholder="ex: 19842"
                value={tradeFormData.entry}
                onChange={(e) =>
                  setTradeFormData({ ...tradeFormData, entry: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Exit *</label>
              <input
                type="number"
                className="form-input"
                placeholder="ex: 19920"
                value={tradeFormData.exit}
                onChange={(e) =>
                  setTradeFormData({ ...tradeFormData, exit: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                className="form-input"
                placeholder="ex: 1"
                value={tradeFormData.quantity}
                onChange={(e) =>
                  setTradeFormData({ ...tradeFormData, quantity: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Emotion</label>
              <select
                className="form-select"
                value={tradeFormData.emotion}
                onChange={(e) =>
                  setTradeFormData({ ...tradeFormData, emotion: e.target.value })
                }
              >
                <option>Calm</option>
                <option>Focused</option>
                <option>Neutral</option>
                <option>FOMO</option>
                <option>Greedy</option>
              </select>
            </div>

            <div className="form-actions">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowTradeForm(false);
                  setEditingTradeId(null);
                  setTradeFormData({
                    symbol: "",
                    direction: "Long",
                    setup: "",
                    entry: "",
                    exit: "",
                    quantity: 1,
                    emotion: "Neutral",
                  });
                }}
              >
                Annuler
              </button>
              <button className="btn-primary" onClick={handleAddTrade}>
                {editingTradeId ? "Mettre à jour" : "Créer"} Trade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
