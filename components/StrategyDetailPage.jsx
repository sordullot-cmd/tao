"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getCurrencySymbol, rMultiple, fmtR } from "@/lib/userPrefs";
import { withNetPnl } from "@/lib/tradeFees";
import TradesPage from "@/components/pages/TradesPage";
import LoadingScreen from "@/components/ui/LoadingScreen";
import { t, useLang } from "@/lib/i18n";
import { AreaDotsDefs, areaDotsFill } from "@/components/ui/da";
import { T as BaseT } from "@/lib/ui/tokens";

/* ─── TOKENS (palette monochrome partagée, dark-aware) ─────────────── */
const T = { ...BaseT };

const fmt = (n, sign=false) => `${sign && n>0?"+":""}${n<0?"-":""}${getCurrencySymbol()}${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function Pill({ children, color="gray", small }) {
  const map = {
    green: { bg:T.greenBg, bd:T.greenBd, txt:T.green },
    red:   { bg:T.redBg,   bd:T.redBd,   txt:T.red   },
    blue:  { bg:T.blueBg,  bd:"#DCFCE7",  txt:T.blue  },
    gray:  { bg:T.bg,      bd:T.border,   txt:T.textSub },
  };
  const s = map[color] || map.gray;
  return <span style={{display:"inline-flex", alignItems:"center", padding: small ? "1px 7px" : "3px 10px", borderRadius: "var(--radius-modal)", fontSize: small ? 11 : 12, fontWeight: 500, background: s.bg, border: `1px solid ${s.bd}`, color: s.txt,}}>{children}</span>;
}

export default function StrategyDetailPage({ setPage = () => {} }) {
  useLang();
  const [trades, setTrades] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tradeStrategiesData, setTradeStrategiesData] = useState({});
  const [checkedRules, setCheckedRules] = useState({});
  const [hoveredDayIdx, setHoveredDayIdx] = useState(null);

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      // ✅ Load from CORRECT keys (tr4de_trades, not apex_trades)
      const tradesData = localStorage.getItem('tr4de_trades');
      if (tradesData) {
        try {
          setTrades(withNetPnl(JSON.parse(tradesData)));
        } catch {
          // Fallback to apex_trades for backward compatibility
          const apexTrades = localStorage.getItem('apex_trades');
          if (apexTrades) setTrades(withNetPnl(JSON.parse(apexTrades)));
        }
      }

      const strategiesData = localStorage.getItem('tr4de_strategies');
      if (strategiesData) {
        try {
          setStrategies(JSON.parse(strategiesData));
        } catch {
          // Fallback to apex_strategies
          const apexStrats = localStorage.getItem('apex_strategies');
          if (apexStrats) setStrategies(JSON.parse(apexStrats));
        }
      }

      // Load trade-strategy mappings
      const mappingsData = localStorage.getItem('tr4de_trade_strategies');
      if (mappingsData) setTradeStrategiesData(JSON.parse(mappingsData));

      const checkedRulesData = localStorage.getItem('tr4de_checked_rules');
      if (checkedRulesData) setCheckedRules(JSON.parse(checkedRulesData));

      // Load selected strategy ID
      const selectedId = localStorage.getItem('selectedStrategyId');
      if (selectedId) {
        // First try tr4de_strategies, then apex_strategies
        let strats = [];
        try {
          const stored = localStorage.getItem('tr4de_strategies');
          strats = stored ? JSON.parse(stored) : [];
        } catch {
          const apexStrats = localStorage.getItem('apex_strategies');
          strats = apexStrats ? JSON.parse(apexStrats) : [];
        }
        
        if (strats.length > 0) {
          const found = strats.find(s => s.id == selectedId);
          if (found) setSelectedStrategy(found);
        }
      }
    } catch (err) {
      console.error("Error loading data:", err);
    }
    setLoading(false);
  }, []);

  // Re-sync checkedRules quand TradesPage (même onglet) coche/décoche une règle,
  // ou quand un autre onglet modifie localStorage.
  useEffect(() => {
    const reload = () => {
      try {
        const data = localStorage.getItem('tr4de_checked_rules');
        setCheckedRules(data ? JSON.parse(data) : {});
      } catch {}
    };
    const onStorage = (e) => { if (e.key === 'tr4de_checked_rules') reload(); };
    window.addEventListener('tr4de:checked-rules-changed', reload);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('tr4de:checked-rules-changed', reload);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Filter trades by selected strategy
  const filteredTrades = selectedStrategy 
    ? trades.filter(t => {
        // Try multiple key formats for compatibility
        let strategyIds = [];
        
        // Format 1: Direct ID (UUID)
        if (t.id && tradeStrategiesData[t.id]) {
          strategyIds = tradeStrategiesData[t.id];
        }
        
        // Format 2: Composite key (no underscores)
        if (strategyIds.length === 0 && t.date && t.symbol && t.entry) {
          const compositeKey = `${t.date}${t.symbol}${t.entry}`;
          if (tradeStrategiesData[compositeKey]) {
            strategyIds = tradeStrategiesData[compositeKey];
          }
        }
        
        // Format 3: Normalized composite key
        if (strategyIds.length === 0 && t.date && t.symbol && t.entry) {
          const normalizedEntry = parseFloat(t.entry).toFixed(2);
          const normalizedKey = `${t.date}${t.symbol}${normalizedEntry}`;
          if (tradeStrategiesData[normalizedKey]) {
            strategyIds = tradeStrategiesData[normalizedKey];
          }
        }
        
        // Convert to string for reliable comparison
        return strategyIds.map(id => String(id)).includes(String(selectedStrategy.id));
      })
    : [];

  // GROUP TRADES BY RULE ADHERENCE
  // Get all rules from the strategy
  const allStrategyRules = selectedStrategy?.groups 
    ? selectedStrategy.groups.flatMap(g => g.rules || [])
    : [];
  
  // Function to get the count of checked rules for a specific trade
  const getCheckedRulesCount = (trade) => {
    let checkedCount = 0;
    let totalCount = 0;
    
    allStrategyRules.forEach(rule => {
      // Clé unique format: date_symbol_entry_exit_direction_stratId_ruleId
      const ruleKey = `${trade.date}_${trade.symbol}_${trade.entry}_${trade.exit}_${trade.direction}_${selectedStrategy.id}_${rule.id}`;
      totalCount++;
      if (checkedRules[ruleKey] === true) {
        checkedCount++;
      }
    });
    
    return { checkedCount, totalCount };
  };
  
  // Categorize trades: all rules checked vs without rules (partial or none) 
  const tradesGroupedByRuleState = {
    allChecked: [],      // All rules are checked
    none: []             // Partial or no rules checked
  };
  
  filteredTrades.forEach(trade => {
    const { checkedCount, totalCount } = getCheckedRulesCount(trade);
    
    // TOUTES les règles cochées?
    if (totalCount > 0 && checkedCount === totalCount) {
      tradesGroupedByRuleState.allChecked.push(trade);
    } else {
      // Sinon: partial ou aucune
      tradesGroupedByRuleState.none.push(trade);
    }
  });
  
  // Function to calculate stats for a group
  const getGroupStats = (tradeGroup) => {
    if (tradeGroup.length === 0) {
      return { wins: 0, losses: 0, winRate: 0, totalPnL: 0, avgPnL: 0 };
    }
    
    const wins = tradeGroup.filter(t => t.pnl > 0).length;
    const losses = tradeGroup.filter(t => t.pnl < 0).length;
    const totalPnL = tradeGroup.reduce((s, t) => s + t.pnl, 0);
    const winRate = ((wins / (wins + losses)) * 100).toFixed(1);
    const avgPnL = (totalPnL / tradeGroup.length).toFixed(2);
    
    return { wins, losses, winRate, totalPnL, avgPnL };
  };
  
  const statsAllChecked = getGroupStats(tradesGroupedByRuleState.allChecked);
  const statsNone = getGroupStats(tradesGroupedByRuleState.none);

  // Calculate stats
  const totalPnL = filteredTrades.reduce((s,t)=>s+t.pnl,0);
  const wins = filteredTrades.filter(t=>t.pnl>0);
  const losses = filteredTrades.filter(t=>t.pnl<0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = filteredTrades.length > 0 ? ((winCount/(winCount+lossCount))*100).toFixed(1) : 0;
  
  // IMPACT CALCULATION
  const winRateWithRules = parseFloat(statsAllChecked.winRate || 0);
  const allTradesWins = trades.filter(t => t.pnl > 0).length;
  const allTradesLosses = trades.filter(t => t.pnl < 0).length;
  const winRateWithoutRules = trades.length > 0 
    ? ((allTradesWins / (allTradesWins + allTradesLosses)) * 100).toFixed(1)
    : 0;
  const rulesImpact = (winRateWithRules - winRateWithoutRules).toFixed(1);
  const impactColor = rulesImpact > 0 ? T.green : T.red;

  const profitFactor = filteredTrades.length > 0 ? (wins.reduce((s,t)=>s+t.pnl,0)/Math.abs(losses.reduce((s,t)=>s+t.pnl,0)||1)).toFixed(2) : 0;
  const avgWin = wins.length ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s,t)=>s+t.pnl,0)/losses.length : 0;
  const maxWin = filteredTrades.length > 0 ? Math.max(...filteredTrades.map(t=>t.pnl)) : 0;
  const maxLoss = filteredTrades.length > 0 ? Math.min(...filteredTrades.map(t=>t.pnl)) : 0;

  // Calcul des statistiques par jour, heure, et symbole
  // Helper pour extraire l'heure : priorité à entryTime/entry_time (format "HH:MM[:SS]"),
  // fallback sur le timestamp de t.date si une heure y est encodée.
  const getTradeHour = (t) => {
    const timeStr = t.entryTime || t.entry_time;
    if (timeStr && typeof timeStr === "string") {
      const m = timeStr.match(/^(\d{1,2}):/);
      if (m) return parseInt(m[1], 10);
    }
    if (t.date) {
      const d = new Date(t.date);
      if (!isNaN(d.getTime()) && (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0)) {
        return d.getHours();
      }
    }
    return null;
  };
  const dayNameFr = (d) => {
    const days = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
    return days[d.getDay()];
  };

  // Stats agrégées par jour / heure / symbole
  const dayPnLAgg = {};
  const hourPnLAgg = {};
  const symbolPnLAgg = {};
  filteredTrades.forEach(t => {
    if (t.date) {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) {
        const day = dayNameFr(d);
        dayPnLAgg[day] = (dayPnLAgg[day] || 0) + (t.pnl || 0);
      }
    }
    const h = getTradeHour(t);
    if (h !== null) {
      const hourStr = `${String(h).padStart(2, '0')}h–${String((h + 1) % 24).padStart(2, '0')}h`;
      hourPnLAgg[hourStr] = (hourPnLAgg[hourStr] || 0) + (t.pnl || 0);
    }
    if (t.symbol) {
      symbolPnLAgg[t.symbol] = (symbolPnLAgg[t.symbol] || 0) + (t.pnl || 0);
    }
  });

  const pickBest = (agg) => {
    const entries = Object.entries(agg);
    if (entries.length === 0) return null;
    return entries.reduce((a, b) => b[1] > a[1] ? b : a);
  };
  const pickWorst = (agg) => {
    const entries = Object.entries(agg);
    if (entries.length === 0) return null;
    return entries.reduce((a, b) => b[1] < a[1] ? b : a);
  };

  const bd = pickBest(dayPnLAgg);
  const wd = pickWorst(dayPnLAgg);
  const bh = pickBest(hourPnLAgg);
  const wh = pickWorst(hourPnLAgg);
  const bs = pickBest(symbolPnLAgg);
  const ws = pickWorst(symbolPnLAgg);

  const bestDay   = { day:    bd ? bd[0] : "—", pnl: bd ? bd[1] : 0 };
  const worstDay  = { day:    wd && wd !== bd ? wd[0] : "—", pnl: wd ? wd[1] : 0 };
  const bestHour  = { hour:   bh ? bh[0] : "—", pnl: bh ? bh[1] : 0 };
  const worstHour = { hour:   wh && wh !== bh ? wh[0] : "—", pnl: wh ? wh[1] : 0 };
  const bestSymbol  = { symbol: bs ? bs[0] : "—", pnl: bs ? bs[1] : 0 };
  const worstSymbol = { symbol: ws && ws !== bs ? ws[0] : "—", pnl: ws ? ws[1] : 0 };

  // Early return if still loading or no strategy selected
  if (loading || !selectedStrategy) {
    return <LoadingScreen fullscreen={false} />;
  }

  // RÈGLES WIN RATE CALCULATION
  const hasRules = selectedStrategy.groups && selectedStrategy.groups.some(g => g.rules && g.rules.length > 0);

  // MOST RELIABLE RULE CALCULATION
  const ruleStats = (() => {
    const stats = {};
    
    if (selectedStrategy.groups) {
      selectedStrategy.groups.forEach(group => {
        if (group.rules) {
          group.rules.forEach(rule => {
            stats[rule.text] = { wins: 0, losses: 0, pnl: 0, trades: [] };
          });
        }
      });
    }

    filteredTrades.forEach(trade => {
      // Simuler l'assignation des rules aux trades (pour demo, tous les trades utilisent les règles)
      Object.keys(stats).forEach(ruleName => {
        stats[ruleName].trades.push(trade);
        stats[ruleName].pnl += trade.pnl;
        if (trade.pnl > 0) {
          stats[ruleName].wins++;
        } else if (trade.pnl < 0) {
          stats[ruleName].losses++;
        }
      });
    });
    
    return stats;
  })();

  // Find most reliable rule
  const mostReliableRule = (() => {
    let best = null;
    let bestWinRate = -1;
    
    Object.entries(ruleStats).forEach(([ruleName, stats]) => {
      if (stats.trades.length > 0) {
        const winRate = stats.wins / (stats.wins + stats.losses) * 100;
        if (winRate > bestWinRate) {
          bestWinRate = winRate;
          best = { name: ruleName, winRate, wins: stats.wins, losses: stats.losses, pnl: stats.pnl, trades: stats.trades.length };
        }
      }
    });
    
    return best || { name: 'N/A', winRate: 0, wins: 0, losses: 0, pnl: 0, trades: 0 };
  })();

  // BEST PERFORMING RR AVG CALCULATION
  const rrStats = (() => {
    let totalRR = 0;
    let validTrades = 0;
    let bestRR = 0;
    let worstRR = Infinity;

    filteredTrades.forEach(trade => {
      const risk = Math.abs(trade.entry - trade.exit);
      const reward = Math.abs(trade.pnl);
      
      if (risk > 0) {
        const rr = reward / risk;
        totalRR += rr;
        validTrades++;
        
        if (rr > bestRR) bestRR = rr;
        if (rr < worstRR) worstRR = rr;
      }
    });

    const avgRR = validTrades > 0 ? (totalRR / validTrades).toFixed(2) : 0;
    
    return { avgRR, bestRR: bestRR.toFixed(2), worstRR: worstRR === Infinity ? 0 : worstRR.toFixed(2), trades: validTrades };
  })();

  // TRADEPATH PENTAGON SCORE CALCULATION
  const pentagonMetrics = (() => {
    // 1. Win % (0-100)
    const winPercent = parseFloat(winRate);

    // 2. Profit Factor (normalize to 0-100: 2.0+ = 100, 1.0 = 50, 0 = 0)
    const pf = parseFloat(profitFactor);
    const profitFactorScore = Math.min(100, (pf / 2) * 100);

    // 3. Win/Loss Ratio (normalize: 3.0+ = 100, 1.0 = 33, 0 = 0)
    const winLossRatio = winCount > 0 && lossCount > 0 ? winCount / lossCount : (winCount > 0 ? 100 : 0);
    const winLossScore = Math.min(100, (winLossRatio / 3) * 100);

    // 4. Consistency (std dev normalization - lower is better, so we invert)
    // Calculate consistency based on PnL variance
    const avgPnL = filteredTrades.length > 0 ? filteredTrades.reduce((s, t) => s + t.pnl, 0) / filteredTrades.length : 0;
    const variance = filteredTrades.length > 0 
      ? filteredTrades.reduce((s, t) => s + Math.pow(t.pnl - avgPnL, 2), 0) / filteredTrades.length 
      : 0;
    const stdDev = Math.sqrt(variance);
    // Consistency score: lower stdDev = higher score (invert and normalize)
    const consistencyScore = Math.max(0, 100 - (stdDev / Math.max(...filteredTrades.map(t => t.pnl), 1000) * 100));

    // 5. Rule Adherence — moyenne, sur les trades de la stratégie, du
    // pourcentage de règles cochées (= respectées) par trade.
    // Si la stratégie n'a aucune règle définie → 100 (rien à respecter).
    // Si aucun trade rattaché → 0.
    let ruleAdherenceScore = 0;
    if (allStrategyRules.length === 0) {
      ruleAdherenceScore = 100;
    } else if (filteredTrades.length > 0) {
      const sumPct = filteredTrades.reduce((sum, t) => {
        const { checkedCount, totalCount } = getCheckedRulesCount(t);
        return sum + (totalCount > 0 ? (checkedCount / totalCount) * 100 : 0);
      }, 0);
      ruleAdherenceScore = sumPct / filteredTrades.length;
    }

    // Calculate overall TradePath Score (average of all 5 metrics)
    const overallScore = ((winPercent + profitFactorScore + winLossScore + consistencyScore + ruleAdherenceScore) / 5).toFixed(2);

    return {
      winPercent: winPercent.toFixed(1),
      profitFactor: profitFactorScore.toFixed(1),
      winLoss: winLossScore.toFixed(1),
      consistency: consistencyScore.toFixed(1),
      ruleAdherence: ruleAdherenceScore.toFixed(1),
      overallScore
    };
  })();

  // Pentagon Radar Component
  function PentagonRadar({ metrics, size = 320 }) {
    const center = size / 2;
    const radius = (size / 2) - 40;
    const values = [
      parseFloat(metrics.winPercent),
      parseFloat(metrics.profitFactor),
      parseFloat(metrics.winLoss),
      parseFloat(metrics.consistency),
      parseFloat(metrics.ruleAdherence)
    ];
    
    const labels = ["Win %", "Profit Factor", "Win/Loss Ratio", "Consistency", "Rule Adherence"];
    const points = [];
    
    // Calculate pentagon points
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
      const normalizedValue = values[i] / 100;
      const x = center + radius * normalizedValue * Math.cos(angle);
      const y = center + radius * normalizedValue * Math.sin(angle);
      points.push({ x, y, value: values[i], label: labels[i], angle });
    }

    // Background pentagon (100%)
    const bgPoints = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      bgPoints.push(`${x},${y}`);
    }

    return (
      <svg width={size} height={size} style={{display:"block",margin:"0 auto"}}>
        {/* Background grid */}
        {[20, 40, 60, 80, 100].map((val, i) => {
          const gridPoints = [];
          for (let j = 0; j < 5; j++) {
            const angle = (j * 2 * Math.PI / 5) - Math.PI / 2;
            const normalizedValue = val / 100;
            const x = center + radius * normalizedValue * Math.cos(angle);
            const y = center + radius * normalizedValue * Math.sin(angle);
            gridPoints.push(`${x},${y}`);
          }
          return (
            <polygon
              key={i}
              points={gridPoints.join(" ")}
              fill="none"
              stroke={T.border2}
              strokeWidth="1"
              opacity="0.7"
            />
          );
        })}

        {/* Axes lines */}
        {points.map((p, i) => (
          <line key={`axis-${i}`} x1={center} y1={center} x2={p.x} y2={p.y} stroke={T.border2} strokeWidth="1" opacity="0.5" />
        ))}

        {/* Data polygon */}
        <polygon
          points={points.map(p => `${p.x},${p.y}`).join(" ")}
          fill={`${selectedStrategy.color}20`}
          stroke={selectedStrategy.color}
          strokeWidth="2"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r="5"
            fill={selectedStrategy.color}
            stroke={T.white}
            strokeWidth="2"
          />
        ))}

        {/* Labels */}
        {points.map((p, i) => {
          const labelRadius = radius + 35;
          const labelAngle = p.angle;
          const labelX = center + labelRadius * Math.cos(labelAngle);
          const labelY = center + labelRadius * Math.sin(labelAngle);
          
          return (
            <g key={`label-${i}`}>
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="600"
                fill={T.textMut}
                style={{pointerEvents:"none"}}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // SemiCircle Component
  function SemiCircle({ percentage, color, size = 200 }) {
    const radius = size / 2 - 10;
    const circumference = Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    
    return (
      <svg width={size} height={size / 2 + 20} style={{display:"block"}}>
        {/* Background semicircle */}
        <path
          d={`M 10 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2}`}
          stroke={T.border}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        {/* Progress semicircle */}
        <path
          d={`M 10 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2}`}
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{transition:"stroke-dashoffset 0.6s ease"}}
        />
      </svg>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}} className="anim-1">
      {/* HEADER */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <button
          type="button"
          onClick={() => setPage('strategies')}
          aria-label={t("strat.detail.back")}
          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:999,border:`1px solid ${T.border}`,background:T.white,color:T.text,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.bg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.white; }}
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
        </button>
        <div>
          <h1 className="t-h2" style={{color:T.text,margin:0,display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:10,height:10,borderRadius:"50%",background:selectedStrategy.color}}/>
            {selectedStrategy.name}
          </h1>
          {selectedStrategy.description && (
            <p style={{fontSize:12,color:T.textMut,marginTop:2,marginBottom:0,fontFamily:"var(--font-sans)"}}>{selectedStrategy.description}</p>
          )}
        </div>
      </div>

      {/* CARD 1 : 8 KPIs en 2 rangées */}
      {filteredTrades.length > 0 && (
        <div className="tr4de-kpi-row" style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:"var(--radius-card) var(--radius-card) 0 0",borderBottom:"none",overflow:"hidden"}}>
          {/* ROW 1 - 4 KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)"}}>
            {/* 1. P&L Net */}
            <div style={{flex:1,padding:"16px 20px",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:500}}>{t("strat.kpi.netPnl")}</div>
              <div style={{fontSize:20,fontWeight:600,color:totalPnL >= 0 ? T.green : T.red,letterSpacing:-0.2,lineHeight:1.1,marginBottom:6}}>
                {fmt(totalPnL,true)}
              </div>
              <div style={{fontSize:11,color:T.textMut}}>{filteredTrades.length} trades</div>
            </div>

            {/* 2. Profit factor */}
            <div style={{flex:1,padding:"16px 20px",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:500}}>{t("strat.kpi.profitFactor")}</div>
              <div style={{fontSize:20,fontWeight:600,color:T.text,letterSpacing:-0.2,lineHeight:1.1,marginBottom:6}}>
                {profitFactor === Infinity ? "∞" : (filteredTrades.length > 0 ? profitFactor : "—")}
              </div>
              <div style={{fontSize:11,color:T.textMut}}>{t("strat.kpi.profitFactorSub")}</div>
            </div>

            {/* 3. Drawdown max */}
            <div style={{flex:1,padding:"16px 20px",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:500}}>{t("strat.kpi.maxDrawdown")}</div>
              <div style={{fontSize:20,fontWeight:600,color:T.red,letterSpacing:-0.2,lineHeight:1.1,marginBottom:6}}>
                −{fmt(Math.max(...filteredTrades.map(t=>t.pnl||0),0), false)}
              </div>
              <div style={{fontSize:11,color:T.textMut}}>{t("strat.kpi.maxDrawdownSub")}</div>
            </div>

            {/* 4. Trades */}
            <div style={{flex:1,padding:"16px 20px"}}>
              <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:500}}>Trades</div>
              <div style={{fontSize:20,fontWeight:600,color:T.text,letterSpacing:-0.2,lineHeight:1.1,marginBottom:6}}>
                {filteredTrades.length}
              </div>
              <div style={{fontSize:11,color:T.textMut}}>{winCount}W / {lossCount}L</div>
            </div>
          </div>

          {/* ROW 2 - 4 KPIs - séparateur */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",borderTop:`1px solid ${T.border}`}}>
            {/* 5. Taux de victoire */}
            <div style={{flex:1,padding:"16px 20px",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:500}}>{t("strat.kpi.winRate")}</div>
              <div style={{fontSize:20,fontWeight:600,color:T.text,letterSpacing:-0.2,lineHeight:1.1,marginBottom:6}}>
                {winRate}%
              </div>
              <div style={{fontSize:11,color:T.textMut}}>{filteredTrades.length > 0 ? t("strat.kpi.winRateSub") : "—"}</div>
            </div>

            {/* 6. Espérance/trade */}
            <div style={{flex:1,padding:"16px 20px",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:500}}>{t("strat.kpi.expectancy")}</div>
              <div style={{fontSize:20,fontWeight:600,color:totalPnL/filteredTrades.length >= 0 ? T.green : T.red,letterSpacing:-0.2,lineHeight:1.1,marginBottom:6}}>
                {filteredTrades.length > 0 ? fmt(totalPnL/filteredTrades.length, true) : "—"}
              </div>
              <div style={{fontSize:11,color:T.textMut}}>{t("strat.kpi.expectancySub")}</div>
            </div>

            {/* 7. Meilleur trade */}
            <div style={{flex:1,padding:"16px 20px",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:500}}>{t("strat.kpi.bestTrade")}</div>
              <div style={{fontSize:20,fontWeight:600,color:T.green,letterSpacing:-0.2,lineHeight:1.1,marginBottom:6}}>
                {fmt(maxWin)}
              </div>
              <div style={{fontSize:11,color:T.textMut}}>{t("strat.kpi.bestTradeSub")}</div>
            </div>

            {/* 8. Pire trade */}
            <div style={{flex:1,padding:"16px 20px"}}>
              <div style={{fontSize:12,color:T.textSub,marginBottom:8,fontWeight:500}}>{t("strat.kpi.worstTrade")}</div>
              <div style={{fontSize:20,fontWeight:600,color:T.red,letterSpacing:-0.2,lineHeight:1.1,marginBottom:6}}>
                {fmt(maxLoss)}
              </div>
              <div style={{fontSize:11,color:T.textMut}}>{t("strat.kpi.worstTradeSub")}</div>
            </div>
          </div>
        </div>
      )}

      {/* PERFORMANCE COMPARISON — toutes les stratégies + highlight de la courante */}
      {strategies.length > 0 && trades.length > 0 && (() => {
        const getStrategyIdsForTrade = (tr) => {
          let ids = tradeStrategiesData[tr.id] || [];
          if (ids.length === 0 && tr.date && tr.symbol && tr.entry) {
            const ck = `${tr.date}${tr.symbol}${tr.entry}`;
            ids = tradeStrategiesData[ck] || [];
            if (ids.length === 0) {
              const norm = `${tr.date}${tr.symbol}${parseFloat(tr.entry).toFixed(2)}`;
              ids = tradeStrategiesData[norm] || [];
            }
          }
          return ids.map(String);
        };

        // Pour chaque stratégie, calculer la série cumulative par date
        const seriesPerStrategy = strategies.map(s => {
          const sTrades = trades.filter(tr => getStrategyIdsForTrade(tr).includes(String(s.id)));
          if (sTrades.length === 0) return null;
          const sorted = [...sTrades].sort((a, b) =>
            new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
          );
          // Group by day
          const byDay = {};
          sorted.forEach(tr => {
            const d = String(tr.date).split("T")[0];
            byDay[d] = (byDay[d] || 0) + (tr.pnl || 0);
          });
          const dates = Object.keys(byDay).sort();
          let cum = 0;
          const points = dates.map(d => {
            cum += byDay[d];
            return { date: d, value: cum };
          });
          return { strategy: s, points };
        }).filter(Boolean);

        if (seriesPerStrategy.length === 0) return null;

        // Toutes les dates uniques pour l'axe X
        const allDatesSet = new Set();
        seriesPerStrategy.forEach(s => s.points.forEach(p => allDatesSet.add(p.date)));
        const allDates = Array.from(allDatesSet).sort();

        // Forward-fill chaque stratégie sur toutes les dates
        const seriesFilled = seriesPerStrategy.map(s => {
          const map = Object.fromEntries(s.points.map(p => [p.date, p.value]));
          let lastVal = 0;
          const filled = allDates.map(d => {
            if (map[d] !== undefined) lastVal = map[d];
            return { date: d, value: lastVal };
          });
          return { ...s, filled };
        });

        // Min / max global pour l'axe Y
        let yMin = 0, yMax = 0;
        seriesFilled.forEach(s => s.filled.forEach(p => {
          if (p.value < yMin) yMin = p.value;
          if (p.value > yMax) yMax = p.value;
        }));
        const yRange = (yMax - yMin) || 1;

        // SVG layout — ratio raisonnable, on évite preserveAspectRatio="none" qui distord les courbes
        const W = 800;
        const H = 220;
        const padL = 0;
        const padR = 28; // espace pour les Y labels à droite
        const padT = 10;
        const padB = 18;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;

        const xFor = (i) => padL + (allDates.length === 1 ? plotW / 2 : (i / (allDates.length - 1)) * plotW);
        const yFor = (v) => padT + plotH - ((v - yMin) / yRange) * plotH;

        // Format date
        const fmtD = (d) => {
          const [, m, dd] = d.split("-");
          const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
          return `${parseInt(dd)} ${months[parseInt(m) - 1]}`;
        };
        const fmtVal = (v) => {
          const sign = v >= 0 ? "+" : "-";
          const abs = Math.abs(v);
          // Arrondi "rond" : nearest 10k pour ≥10k, nearest 1k pour ≥1k
          if (abs >= 10000) return `${sign}${Math.round(abs / 10000) * 10}k`;
          if (abs >= 1000)  return `${sign}${Math.round(abs / 1000)}k`;
          return `${sign}${Math.round(abs)}`;
        };

        // Y-axis ticks (4 niveaux)
        const yTicks = [];
        const N = 3;
        for (let i = 0; i <= N; i++) {
          const ratio = i / N;
          const v = yMax - ratio * yRange;
          yTicks.push({ y: padT + plotH * ratio, value: v });
        }

        return (
          <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:"0 0 var(--radius-card) var(--radius-card)",overflow:"visible",marginTop:-24,position:"relative",zIndex:1}}>
            <div style={{padding:"16px 20px"}}>
              <div style={{fontSize:13,fontWeight:600,color:T.text}}>{t("strat.detail.compareTitle")}</div>
              <div style={{fontSize:11,color:T.textMut,marginTop:2}}>{t("strat.detail.compareSub")}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"180px 1fr"}}>
              {/* Légende — triée par P&L décroissant */}
              <div style={{padding:"16px 16px 16px 20px",borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:8}}>
                {[...seriesFilled]
                  .sort((a, b) => b.filled[b.filled.length - 1].value - a.filled[a.filled.length - 1].value)
                  .map(s => {
                    const isSelected = String(s.strategy.id) === String(selectedStrategy?.id);
                    const last = s.filled[s.filled.length - 1].value;
                    return (
                      <div key={s.strategy.id} style={{display:"flex",alignItems:"center",gap:8,opacity:isSelected ? 1 : 0.5}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:s.strategy.color,flexShrink:0}}/>
                        <span style={{fontSize:12,fontWeight:isSelected ? 600 : 500,color:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.strategy.name}</span>
                        <span style={{fontSize:11,fontWeight:500,color:last >= 0 ? T.green : T.red}}>{fmtVal(last)}</span>
                      </div>
                    );
                  })}
              </div>

              {/* Chart — la courbe touche le bord gauche de la carte (le padding
                  n'est repris qu'à droite, où les libellés de valeur respirent). */}
              <div style={{padding:"12px 12px 12px 0", position:"relative"}}>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:"block",overflow:"visible",aspectRatio:`${W} / ${H}`}}>
                  {/* Y labels (colonne à droite, alignés verticalement sur chaque tick) */}
                  {yTicks.map((tk, i) => (
                    <text key={i} x={W - 2} y={tk.y + 2.5} fill={T.textMut} fontSize="6" fontWeight="500" textAnchor="end" dominantBaseline="middle">{fmtVal(tk.value)}</text>
                  ))}

                  {/* Lines : non-selected first (so selected stays on top) */}
                  {seriesFilled.filter(s => String(s.strategy.id) !== String(selectedStrategy?.id)).map(s => {
                    const path = s.filled.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(" ");
                    return (
                      <path key={s.strategy.id} d={path} fill="none" stroke={s.strategy.color} strokeWidth="1" strokeOpacity="0.4" strokeLinecap="round" strokeLinejoin="round"/>
                    );
                  })}
                  {/* Selected on top — with gradient fill */}
                  {seriesFilled.filter(s => String(s.strategy.id) === String(selectedStrategy?.id)).map(s => {
                    const path = s.filled.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(" ");
                    const baselineY = yFor(yMin);
                    const lastX = xFor(s.filled.length - 1).toFixed(1);
                    const firstX = xFor(0).toFixed(1);
                    const areaPath = `${path} L ${lastX} ${baselineY.toFixed(1)} L ${firstX} ${baselineY.toFixed(1)} Z`;
                    const areaId = `strat-area-${s.strategy.id}`;
                    return (
                      <g key={s.strategy.id}>
                        {/* Aire tramée — trame commune à tous les graphiques du
                            site, à la couleur de la stratégie. */}
                        <defs>
                          <AreaDotsDefs id={areaId} color={s.strategy.color} bottom={baselineY} width={W} height={H} />
                        </defs>
                        <path d={areaPath} {...areaDotsFill(areaId)} stroke="none"/>
                        <path d={path} fill="none" stroke={s.strategy.color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                      </g>
                    );
                  })}

                  {/* Vertical hover indicator */}
                  {hoveredDayIdx !== null && allDates[hoveredDayIdx] && (
                    <line x1={xFor(hoveredDayIdx)} y1={padT} x2={xFor(hoveredDayIdx)} y2={padT + plotH} stroke={T.textMut} strokeWidth="0.5" strokeDasharray="2 2"/>
                  )}

                  {/* Hover capture rects (transparent) */}
                  {allDates.map((d, i) => {
                    const cellW = (allDates.length === 1 ? plotW : plotW / (allDates.length - 1));
                    const x = xFor(i) - cellW / 2;
                    return (
                      <rect
                        key={`hov-${i}`}
                        x={Math.max(0, x)}
                        y={padT}
                        width={cellW}
                        height={plotH + padB}
                        fill="transparent"
                        style={{cursor:"crosshair"}}
                        onMouseEnter={() => setHoveredDayIdx(i)}
                        onMouseLeave={() => setHoveredDayIdx(null)}
                      />
                    );
                  })}
                </svg>

                {/* Tooltip HTML overlay (n'est pas étiré par preserveAspectRatio) */}
                {hoveredDayIdx !== null && allDates[hoveredDayIdx] && (() => {
                  const date = allDates[hoveredDayIdx];
                  // Trier les stratégies par P&L décroissant à cette date
                  const items = [...seriesFilled]
                    .map(s => ({ strategy: s.strategy, value: s.filled[hoveredDayIdx]?.value ?? 0 }))
                    .sort((a, b) => b.value - a.value);
                  const leftPct = (xFor(hoveredDayIdx) / W) * 100;
                  // Position verticale : on suit le point de la stratégie sélectionnée (sinon le max).
                  const selSeries = seriesFilled.find(s => String(s.strategy.id) === String(selectedStrategy?.id));
                  const trackVal = selSeries ? (selSeries.filled[hoveredDayIdx]?.value ?? 0) : Math.max(...items.map(i => i.value));
                  const trackY = yFor(trackVal);
                  const topPct = (trackY / H) * 100;
                  // Si on est à droite, basculer la tooltip à gauche du curseur
                  const shouldFlip = leftPct > 60;
                  return (
                    <div
                      style={{
                        position:"absolute",
                        left:`calc(12px + ${leftPct}% * (100% - 24px) / 100%)`,
                        top:`${topPct}%`,
                        transform: `translateY(-100%) translateY(-12px) ${shouldFlip ? "translateX(-100%) translateX(-8px)" : "translateX(8px)"}`,
                        background:T.white,
                        color:T.text,
                        border:`1px solid ${T.border}`,
                        padding:"8px 10px",
                        borderRadius:6,
                        fontSize:11,
                        fontFamily:"var(--font-sans)",
                        boxShadow:"var(--elev-overlay)",
                        pointerEvents:"none",
                        zIndex:9999,
                        whiteSpace:"nowrap",
                      }}
                    >
                      <div style={{fontWeight:600,marginBottom:6,color:T.textSub,fontSize:11}}>{fmtD(date)}</div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {items.map(it => {
                          const isSelected = String(it.strategy.id) === String(selectedStrategy?.id);
                          return (
                            <div key={it.strategy.id} style={{display:"flex",alignItems:"center",gap:6,opacity:isSelected ? 1 : 0.85}}>
                              <span style={{width:6,height:6,borderRadius:"50%",background:it.strategy.color,flexShrink:0}}/>
                              <span style={{fontWeight:isSelected ? 600 : 500,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis"}}>{it.strategy.name}</span>
                              <span style={{marginLeft:"auto",fontWeight:600,color:it.value > 0 ? T.green : it.value < 0 ? T.red : T.text}}>{fmtVal(it.value)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* CARDS 2 + 3 : cote a cote avec gap */}
      {filteredTrades.length > 0 && (
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"stretch"}}>
        {/* CARD 2 : Condition probabilite */}
        <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:"var(--radius-card)",overflow:"hidden"}}>
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text,display:"inline-flex",alignItems:"center",gap:4}}>
              {t("strat.detail.condProb")} <span style={{color:T.textMut,fontWeight:500}}>›</span>
            </div>
            <div style={{fontSize:11,color:T.textMut,marginTop:2}}>{t("strat.detail.condProbSub")}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
            {/* BEST */}
            <div style={{padding:16,borderRight:`1px solid ${T.border}`}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.bestDay")}</div>
                  <div style={{fontSize:15,fontWeight:600,color:T.text}}>{bestDay.day}</div>
                </div>
                <div style={{paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.bestWindow")}</div>
                  <div style={{fontSize:15,fontWeight:600,color:T.text}}>{bestHour.hour}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.bestAsset")}</div>
                  <div style={{fontSize:15,fontWeight:600,color:T.text}}>{bestSymbol.symbol}</div>
                </div>
              </div>
            </div>
            {/* WORST */}
            <div style={{padding:16}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.worstDay")}</div>
                  <div style={{fontSize:15,fontWeight:600,color:T.text}}>{worstDay.day}</div>
                </div>
                <div style={{paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.worstWindow")}</div>
                  <div style={{fontSize:15,fontWeight:600,color:T.text}}>{worstHour.hour}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.worstAsset")}</div>
                  <div style={{fontSize:15,fontWeight:600,color:T.text}}>{worstSymbol.symbol}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 3 : tao score */}
        <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:"var(--radius-card)",overflow:"hidden"}}>
          <div style={{padding:"16px 20px"}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text,display:"inline-flex",alignItems:"center",gap:4}}>
              tao score <span style={{color:T.textMut,fontWeight:500}}>›</span>
            </div>
            <div style={{fontSize:11,color:T.textMut,marginTop:2}}>{t("strat.detail.taoScoreSub")}</div>
          </div>
          <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"center"}}>
              <PentagonRadar metrics={pentagonMetrics} size={280} />
            </div>
            <div>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"baseline",gap:5}}>
                  <span style={{fontSize:20,fontWeight:600,color:T.text,letterSpacing:-0.2,lineHeight:1}}>{pentagonMetrics.overallScore}</span>
                  <span style={{fontSize:12,color:T.textMut,fontWeight:500}}>/ 100</span>
                </div>
                <span style={{fontSize:11,color:T.textMut,fontWeight:500}}>{t("strat.detail.overallScore")}</span>
              </div>
              <div style={{position:"relative",height:10,paddingTop:2}}>
                <div style={{position:"relative",height:6,background:"var(--color-hover-bg, #F0F0F0)",borderRadius:"var(--radius-field)",overflow:"hidden"}}>
                  <div
                    style={{
                      width:`${parseFloat(pentagonMetrics.overallScore)}%`,
                      height:"100%",
                      background:selectedStrategy.color,
                      transition:"width 0.6s ease",
                      borderRadius:"var(--radius-field)",
                    }}
                  />
                  {[20,40,60,80].map(v => (
                    <div key={v} style={{position:"absolute",left:`${v}%`,top:0,bottom:0,width:1,background:"rgba(255,255,255,0.65)",transform:"translateX(-0.5px)",pointerEvents:"none"}} />
                  ))}
                </div>
                <div
                  style={{
                    position:"absolute",
                    left:`${parseFloat(pentagonMetrics.overallScore)}%`,
                    top:"50%",
                    transform:"translate(-50%, -50%)",
                    width:14,
                    height:14,
                    borderRadius:"50%",
                    background:selectedStrategy.color,
                    border:`2px solid ${T.white}`,
                    boxShadow:"0 1px 3px rgba(0,0,0,0.15)",
                    transition:"left 0.6s ease",
                    pointerEvents:"none",
                  }}
                />
              </div>
              <div style={{position:"relative",height:12,marginTop:4}}>
                {[0,20,40,60,80,100].map(v => {
                  const tx = v === 0 ? "translateX(0)" : v === 100 ? "translateX(-100%)" : "translateX(-50%)";
                  return (
                    <span key={v} style={{position:"absolute",left:`${v}%`,transform:tx,fontSize: 9,color:T.textMut,fontWeight:500,fontVariantNumeric:"tabular-nums"}}>{v}</span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* HEADER VISUEL collé au tableau — petite barre titre + bouton "Tout
          voir". Le tableau réel est rendu juste en-dessous via TradesPage
          embedded ; un trait 1px sépare le header du tableau. */}
      <div style={{display:"flex",flexDirection:"column",gap:0}}>
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"14px 18px",
          background:T.white,
          border:`1px solid ${T.border}`,
          borderRadius:"var(--radius-card) var(--radius-card) 0 0",
          borderBottom:"none",
          marginBottom:0,
        }}>
          <div style={{fontSize:13,fontWeight:600,color:T.text}}>{t("strat.detail.recentTrades")}</div>
          <button
            type="button"
            onClick={() => setPage?.("trades")}
            style={{
              display:"inline-flex",alignItems:"center",gap:6,
              padding:"6px 14px",borderRadius:999,
              border:`1px solid ${T.border}`,background:T.white,
              color:T.textSub,fontSize:11,fontWeight:500,cursor:"pointer",
              fontFamily:"inherit",
            }}
          >
            {t("strat.detail.viewAll")} <ArrowRight size={11} />
          </button>
        </div>

        {/* Séparateur explicite entre le titre du bloc et le tableau */}
        <div style={{height:1,background:T.border,borderLeft:`1px solid ${T.border}`,borderRight:`1px solid ${T.border}`,boxSizing:"border-box"}} />

        {filteredTrades.length === 0 ? (
          <div style={{
            background:T.white,
            border:`1px solid ${T.border}`,
            borderRadius:"0 0 var(--radius-card) var(--radius-card)",
            padding:"40px 24px",textAlign:"center",color:T.textSub,fontSize:13,
          }}>
            {t("strat.detail.noTrade")}
          </div>
        ) : (
          <TradesPage trades={filteredTrades} strategies={strategies} embedded />
        )}
      </div>
    </div>
  );
}

