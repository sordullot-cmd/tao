"use client";

import { useState, useMemo } from "react";
import { getLocalDateString } from "@/lib/dateUtils";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";

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
];

const INITIAL_RULES = [
  { id: 1, name: "ada", rule: "Always", adherence: 0 },
];

export default function StrategiesNew() {
  const [trades, setTrades] = useState(INITIAL_TRADES);
  const [rules, setRules] = useState(INITIAL_RULES);
  const [activeTab, setActiveTab] = useState("rules");
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [editingTradeId, setEditingTradeId] = useState(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  
  const [tradeFormData, setTradeFormData] = useState({
    symbol: "",
    direction: "Long",
    setup: "",
    entry: "",
    exit: "",
    quantity: 1,
    emotion: "Neutral",
  });

  const [ruleFormData, setRuleFormData] = useState({
    name: "",
    rule: "",
  });

  // Calcul des métriques
  const metrics = useMemo(() => {
    const closedTrades = trades.filter(t => t.status === "closed");
    const winners = closedTrades.filter(t => t.pnl > 0);
    const losers = closedTrades.filter(t => t.pnl <= 0);
    
    const totalPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = closedTrades.length > 0 ? ((winners.length / closedTrades.length) * 100).toFixed(1) : 0;
    const totalWins = winners.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : 0;
    const avgRR = closedTrades.length > 0 ? (closedTrades.reduce((sum, t) => sum + t.rr, 0) / closedTrades.length).toFixed(2) : 0;

    return {
      netPnL: totalPnL,
      winRate: winRate,
      tradeCount: closedTrades.length,
      profitFactor: profitFactor,
      avgRR: avgRR,
      winners: winners.length,
      losers: losers.length,
    };
  }, [trades]);

  const handleAddTrade = () => {
    if (!tradeFormData.symbol || !tradeFormData.entry || !tradeFormData.exit) return;

    const entry = parseFloat(tradeFormData.entry);
    const exit = parseFloat(tradeFormData.exit);
    const pnl = tradeFormData.direction === "Long" 
      ? ((exit - entry) * tradeFormData.quantity)
      : ((entry - exit) * tradeFormData.quantity);

    const newTrade = {
      id: editingTradeId || (Math.max(...trades.map(t => t.id), 0) + 1),
      date: getLocalDateString(),
      ...tradeFormData,
      entry: parseFloat(entry),
      exit: parseFloat(exit),
      pnl: parseFloat(pnl.toFixed(2)),
      rr: 1.5,
      quantity: parseInt(tradeFormData.quantity),
      status: "closed",
    };

    if (editingTradeId) {
      setTrades(trades.map(t => t.id === editingTradeId ? newTrade : t));
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
    setTrades(trades.filter(t => t.id !== id));
  };

  const handleAddRule = () => {
    if (!ruleFormData.name.trim() || !ruleFormData.rule.trim()) return;

    const newRule = {
      id: Math.max(...rules.map(r => r.id), 0) + 1,
      name: ruleFormData.name,
      rule: ruleFormData.rule,
      adherence: 0,
    };

    setRules([...rules, newRule]);
    setRuleFormData({ name: "", rule: "" });
    setShowRuleForm(false);
  };

  const handleDeleteRule = (id) => {
    setRules(rules.filter(r => r.id !== id));
  };

  return (
    <div style={{ background: "#0F0F23", minHeight: "100vh", color: "#FFFFFF", padding: "24px", fontFamily: "var(--font-sans)" }}>
      <style>{`
        * { box-sizing: border-box; }
        .metric-card {
          background: #1A1A2E;
          border: 1px solid #2D2D44;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .metric-label {
          font-size: 12px;
          color: #8B95AA;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .metric-value {
          font-size: 28px;
          font-weight: 700;
          color: #FFFFFF;
        }
        .metric-value.positive {
          color: #4A9D6F;
        }
        .metric-value.negative {
          color: #AD6B6B;
        }
        .metric-sub {
          font-size: 12px;
          color: #8B95AA;
          display: flex;
          gap: 16px;
        }
        .metric-stat {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .metric-stat-label { color: #5F6B7E; }
        .metric-stat-value { color: #FFFFFF; font-weight: 600; }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }
        .tabs {
          display: flex;
          gap: 24px;
          border-bottom: 1px solid #2D2D44;
          margin-bottom: 24px;
        }
        .tab-btn {
          background: none;
          border: none;
          color: #5F6B7E;
          padding: 12px 0;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
        }
        .tab-btn.active {
          color: #4A9D6F;
          border-bottom-color: #4A9D6F;
        }
        .tab-btn:hover {
          color: #FFFFFF;
        }
        .content-area {
          display: grid;
          gap: 20px;
        }
        .rules-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        .rule-card {
          background: #1A1A2E;
          border: 1px solid #2D2D44;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .rule-info h3 {
          font-size: 14px;
          margin-bottom: 8px;
          color: #FFFFFF;
        }
        .rule-info p {
          font-size: 12px;
          color: #8B95AA;
        }
        .rule-accuracy {
          font-size: 18px;
          font-weight: 700;
          color: #AD6B6B;
        }
        .trades-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .trade-row {
          background: #1A1A2E;
          border: 1px solid #2D2D44;
          border-radius: 8px;
          padding: 12px;
          display: grid;
          grid-template-columns: 80px 80px 80px 80px 80px 1fr;
          gap: 12px;
          align-items: center;
        }
        .trade-cell {
          font-size: 12px;
        }
        .trade-cell-label {
          color: #8B95AA;
          font-size: 10px;
        }
        .trade-cell-value {
          color: #FFFFFF;
          font-weight: 600;
          margin-top: 4px;
        }
        .trade-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .btn-action {
          background: rgba(74, 157, 111, 0.1);
          border: 1px solid rgba(74, 157, 111, 0.3);
          color: #4A9D6F;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-action:hover {
          background: rgba(74, 157, 111, 0.2);
          border-color: rgba(74, 157, 111, 0.5);
        }
        .btn-action.delete {
          background: rgba(173, 107, 107, 0.1);
          border-color: rgba(173, 107, 107, 0.3);
          color: #AD6B6B;
        }
        .btn-action.delete:hover {
          background: rgba(173, 107, 107, 0.2);
          border-color: rgba(173, 107, 107, 0.5);
        }
        .btn-primary {
          background: #4A9D6F;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s ease;
        }
        .btn-primary:hover {
          background: #3D7D58;
        }
        .btn-secondary {
          background: #2D2D44;
          color: white;
          border: 1px solid #3D3D54;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s ease;
        }
        .btn-secondary:hover {
          background: #3D3D54;
        }
        .form-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .form-modal {
          background: #1A1A2E;
          border: 1px solid #2D2D44;
          border-radius: 12px;
          padding: 24px;
          width: 90%;
          max-width: 500px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }
        .form-modal h2 {
          color: #FFFFFF;
          margin-bottom: 20px;
          font-size: 18px;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-label {
          display: block;
          color: #8B95AA;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .form-input,
        .form-select {
          width: 100%;
          background: #0F0F23;
          border: 1px solid #2D2D44;
          color: #FFFFFF;
          padding: 10px 12px;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: #4A9D6F;
          box-shadow: 0 0 0 3px rgba(74, 157, 111, 0.1);
        }
        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }
        .add-btn-area {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16px;
        }
        .empty-state {
          color: #5F6B7E;
          text-align: center;
          padding: 40px 20px;
        }
        .chart-placeholder {
          background: #1A1A2E;
          border: 1px solid #2D2D44;
          border-radius: 8px;
          padding: 60px 20px;
          text-align: center;
          color: #5F6B7E;
          font-size: 14px;
        }
      `}</style>

      {/* METRICS SECTION */}
      <div className="metrics-grid">
        {/* Net PNL */}
        <div className="metric-card">
          <div className="metric-label">Net PNL</div>
          <div className={`metric-value ${metrics.netPnL >= 0 ? "positive" : "negative"}`}>
            ${metrics.netPnL >= 0 ? "+" : ""}{metrics.netPnL.toFixed(2)}
          </div>
        </div>

        {/* Rule Adherence */}
        <div className="metric-card">
          <div className="metric-label">Rule adherence winrate</div>
          <div style={{ display: "flex", gap: "20px", marginBottom: "8px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#8B95AA", marginBottom: "4px" }}>With Rules</div>
              <div style={{ fontSize: "20px", color: "#4A9D6F", fontWeight: 700 }}>0%</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#8B95AA", marginBottom: "4px" }}>Without Rules</div>
              <div style={{ fontSize: "20px", color: "#AD6B6B", fontWeight: 700 }}>0%</div>
            </div>
          </div>
          <div className="metric-sub">
            <div className="metric-stat">
              <span className="metric-stat-label">0 trades</span>
              <span className="metric-stat-value" style={{ color: "#4A9D6F" }}>0</span>
            </div>
            <div className="metric-stat">
              <span className="metric-stat-label">0 trades</span>
              <span className="metric-stat-value" style={{ color: "#AD6B6B" }}>0</span>
            </div>
          </div>
        </div>

        {/* Most Reliable Rule */}
        <div className="metric-card">
          <div className="metric-label">Most Reliable Rule</div>
          <div style={{ color: "#5F6B7E", fontSize: "14px", marginTop: "16px" }}>No data available</div>
        </div>

        {/* Best Performing RR */}
        <div className="metric-card">
          <div className="metric-label">Best Performing RR avg</div>
          <div style={{ color: "#5F6B7E", fontSize: "14px", marginTop: "16px" }}>No data available</div>
        </div>

        {/* Profitability Criteria */}
        <div className="metric-card" style={{ gridColumn: "1 / -1" }}>
          <div className="metric-label">Profitability Criteria</div>
          <div style={{ color: "#5F6B7E", fontSize: "14px", marginTop: "16px" }}>No data available</div>
        </div>

        {/* TradePath Score */}
        <div className="metric-card" style={{ gridColumn: "1 / -1" }}>
          <div className="metric-label">TradePath Score</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "20px", marginTop: "16px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "12px", color: "#8B95AA", marginBottom: "8px" }}>Win %</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#FFFFFF" }}>-</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "12px", color: "#8B95AA", marginBottom: "8px" }}>Rule Adherence</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#FFFFFF" }}>-</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "12px", color: "#8B95AA", marginBottom: "8px" }}>Profit Factor</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#FFFFFF" }}>-</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "12px", color: "#8B95AA", marginBottom: "8px" }}>Consistency</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#FFFFFF" }}>-</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "12px", color: "#8B95AA", marginBottom: "8px" }}>Win/Loss Ratio</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#FFFFFF" }}>-</div>
            </div>
          </div>
          <div style={{ height: "150px", marginTop: "20px" }} className="chart-placeholder">
            Your Tradepath Score: 0
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === "rules" ? "active" : ""}`}
          onClick={() => setActiveTab("rules")}
        >
          Rules
        </button>
        <button 
          className={`tab-btn ${activeTab === "trades" ? "active" : ""}`}
          onClick={() => setActiveTab("trades")}
        >
          Trades
        </button>
        <button 
          className={`tab-btn ${activeTab === "notes" ? "active" : ""}`}
          onClick={() => setActiveTab("notes")}
        >
          Notes
        </button>
        <button 
          className={`tab-btn ${activeTab === "data" ? "active" : ""}`}
          onClick={() => setActiveTab("data")}
        >
          Data
        </button>
      </div>

      {/* RULES TAB */}
      {activeTab === "rules" && (
        <div className="content-area">
          <div className="add-btn-area">
            <button className="btn-primary" onClick={() => setShowRuleForm(true)}>
              + Add Rule
            </button>
          </div>
          {rules.length === 0 ? (
            <div className="empty-state">No rules yet</div>
          ) : (
            <div className="rules-grid">
              {rules.map(rule => (
                <div key={rule.id} className="rule-card">
                  <div className="rule-info">
                    <h3>{rule.name}</h3>
                    <p>{rule.rule}</p>
                    <p style={{ marginTop: "8px", color: "#AD6B6B", fontSize: "12px" }}>
                      Adherence <span style={{ fontWeight: 700 }}>{rule.adherence}%</span>
                    </p>
                  </div>
                  <button 
                    className="btn-action delete"
                    onClick={() => handleDeleteRule(rule.id)}
                    style={{ cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TRADES TAB */}
      {activeTab === "trades" && (
        <div className="content-area">
          <div className="add-btn-area">
            <button 
              className="btn-primary" 
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
              + Add Trade
            </button>
          </div>
          {trades.length === 0 ? (
            <div className="empty-state">No trades yet</div>
          ) : (
            <div className="trades-list">
              {trades.map(trade => (
                <div key={trade.id} className="trade-row">
                  <div className="trade-cell">
                    <div className="trade-cell-label">Symbol</div>
                    <div className="trade-cell-value">{trade.symbol}</div>
                  </div>
                  <div className="trade-cell">
                    <div className="trade-cell-label">Direction</div>
                    <div className="trade-cell-value">{trade.direction}</div>
                  </div>
                  <div className="trade-cell">
                    <div className="trade-cell-label">Entry</div>
                    <div className="trade-cell-value">{trade.entry}</div>
                  </div>
                  <div className="trade-cell">
                    <div className="trade-cell-label">Exit</div>
                    <div className="trade-cell-value">{trade.exit}</div>
                  </div>
                  <div className="trade-cell">
                    <div className="trade-cell-label">PnL</div>
                    <div className="trade-cell-value" style={{ color: trade.pnl >= 0 ? "#4A9D6F" : "#AD6B6B" }}>
                      ${trade.pnl.toFixed(2)}
                    </div>
                  </div>
                  <div className="trade-actions">
                    <button 
                      className="btn-action"
                      onClick={() => handleEditTrade(trade)}
                    >
                      Edit
                    </button>
                    <button 
                      className="btn-action delete"
                      onClick={() => handleDeleteTrade(trade.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NOTES TAB */}
      {activeTab === "notes" && (
        <div className="empty-state">
          Notes section coming soon
        </div>
      )}

      {/* DATA TAB */}
      {activeTab === "data" && (
        <div className="empty-state">
          Data section coming soon
        </div>
      )}

      {/* TRADE FORM MODAL */}
      {showTradeForm && (
        <div className="form-overlay" {...backdropDismiss(() => {
          setShowTradeForm(false);
          setEditingTradeId(null);
        })}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingTradeId ? "Edit Trade" : "Add New Trade"}</h2>

            <div className="form-group">
              <label className="form-label">Symbol *</label>
              <input
                type="text"
                className="form-input"
                placeholder="NQ"
                value={tradeFormData.symbol}
                onChange={(e) => setTradeFormData({ ...tradeFormData, symbol: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Direction</label>
              <select
                className="form-select"
                value={tradeFormData.direction}
                onChange={(e) => setTradeFormData({ ...tradeFormData, direction: e.target.value })}
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
                placeholder="Break & Retest"
                value={tradeFormData.setup}
                onChange={(e) => setTradeFormData({ ...tradeFormData, setup: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Entry *</label>
              <input
                type="number"
                className="form-input"
                placeholder="19842"
                value={tradeFormData.entry}
                onChange={(e) => setTradeFormData({ ...tradeFormData, entry: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Exit *</label>
              <input
                type="number"
                className="form-input"
                placeholder="19920"
                value={tradeFormData.exit}
                onChange={(e) => setTradeFormData({ ...tradeFormData, exit: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                className="form-input"
                placeholder="1"
                value={tradeFormData.quantity}
                onChange={(e) => setTradeFormData({ ...tradeFormData, quantity: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Emotion</label>
              <select
                className="form-select"
                value={tradeFormData.emotion}
                onChange={(e) => setTradeFormData({ ...tradeFormData, emotion: e.target.value })}
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
                className="btn-secondary"
                onClick={() => {
                  setShowTradeForm(false);
                  setEditingTradeId(null);
                }}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={handleAddTrade}>
                {editingTradeId ? "Update" : "Add"} Trade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RULE FORM MODAL */}
      {showRuleForm && (
        <div className="form-overlay" {...backdropDismiss(() => setShowRuleForm(false))}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add New Rule</h2>

            <div className="form-group">
              <label className="form-label">Rule Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Rule name"
                value={ruleFormData.name}
                onChange={(e) => setRuleFormData({ ...ruleFormData, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rule Description *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Rule description"
                value={ruleFormData.rule}
                onChange={(e) => setRuleFormData({ ...ruleFormData, rule: e.target.value })}
              />
            </div>

            <div className="form-actions">
              <button 
                className="btn-secondary"
                onClick={() => setShowRuleForm(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={handleAddRule}>
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
