"use client";

import React, { useState, useEffect } from "react";
import { getCurrencySymbol, rMultiple, fmtR } from "@/lib/userPrefs";
import { withNetPnl } from "@/lib/tradeFees";
import TradesPage from "@/components/pages/TradesPage";
import LoadingScreen from "@/components/ui/LoadingScreen";
import { t, useLang } from "@/lib/i18n";
import {
  CARD, HAIRLINE, BackLink, SectionTitle, SectionAction, HeroAmount, MiniKpi, PnlChart,
} from "@/components/ui/da";
import { T as BaseT } from "@/lib/ui/tokens";

/* ─── TOKENS (palette monochrome partagée, dark-aware) ─────────────── */
const T = { ...BaseT };

const fmt = (n, sign=false) => `${sign && n>0?"+":""}${n<0?"-":""}${getCurrencySymbol()}${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function Pill({ children, color="gray", small }) {
  const map = {
    green: { bg:T.greenBg, bd:T.greenBd, txt:T.green },
    red:   { bg:T.redBg,   bd:T.redBd,   txt:T.red   },
    // Le fond bleu portait un contour VERT (#DCFCE7) : un copier-coller de la
    // pastille verte, resté en dur alors que la page passe par les tokens.
    blue:  { bg:T.blueBg,  bd:T.blueBd,   txt:T.blue  },
    gray:  { bg:T.accentBg, bd:T.border,  txt:T.textSub },
  };
  const s = map[color] || map.gray;
  // Pastille pleine, sans contour : la DA délimite ses badges par l'aplat.
  return <span style={{display:"inline-flex", alignItems:"center", padding: small ? "2px 8px" : "3px 12px", borderRadius: 999, fontSize: small ? 11 : 12, fontWeight: 500, background: s.bg, color: s.txt,}}>{children}</span>;
}

export default function StrategyDetailPage({ setPage = () => {} }) {
  useLang();
  const [trades, setTrades] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tradeStrategiesData, setTradeStrategiesData] = useState({});
  const [checkedRules, setCheckedRules] = useState({});
  /* Stratégie mise en avant DANS LE GRAPHIQUE — cliquer une entrée de la légende
     la fait passer au premier plan (aire tramée + trait épais), les autres
     repassant en lignes fines. `null` = celle dont la page affiche les stats.
     C'est un état propre au graphique : les chiffres du haut, le tao score et le
     tableau de trades continuent de porter sur la stratégie de la page. */
  const [chartFocusId, setChartFocusId] = useState(null);

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
    <div style={{display:"flex",flexDirection:"column",gap:24,fontFamily:"var(--font-sans)"}} className="anim-1">
      {/* ═══ 1. BARRE D'ACTIONS ═══ retour nommé, comme les fiches de compte et
          de firme : le rond de 28 px portant une flèche seule ne disait pas où
          il ramenait. */}
      <div style={{display:"flex",alignItems:"center",minWidth:0,margin:"-7px -8px",marginBottom:8}}>
        <BackLink label={t("nav.strategies")} onClick={() => setPage('strategies')} />
      </div>

      {/* ═══ 2. IDENTITÉ ═══ pastille de couleur, nom 16/500, description en
          sous-titre atténué. */}
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span style={{width:10,height:10,borderRadius:"50%",background:selectedStrategy.color,flexShrink:0}}/>
        <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:0}}>
          <h1 style={{margin:0,fontSize:16,fontWeight:500,lineHeight:1.25,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {selectedStrategy.name}
          </h1>
          {selectedStrategy.description && (
            <span style={{fontSize:14,lineHeight:1.25,color:T.text,opacity:0.4}}>{selectedStrategy.description}</span>
          )}
        </div>
      </div>

      {/* ═══ 3. CHIFFRE HÉROS + MINI-KPI ═══
          Les huit mesures formaient un tableau 4×2 quadrillé de bordures, aux
          coins soudés au bloc suivant. Elles prennent la lecture des fiches de
          compte : le P&L en chiffre héros, le reste en mesures secondaires
          alignées dessous. */}
      {filteredTrades.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <HeroAmount value={totalPnL} size={28} />
          <div style={{display:"flex",alignItems:"center",gap:28,flexWrap:"wrap"}}>
            <MiniKpi
              label={t("strat.kpi.winRate")}
              value={`${winRate}%`}
              tone={Number(winRate) >= 50 ? "pos" : "neg"}
            />
            <MiniKpi
              label={t("strat.kpi.profitFactor")}
              value={profitFactor === Infinity ? "∞" : String(profitFactor)}
            />
            <MiniKpi
              label={t("strat.kpi.expectancy")}
              value={fmt(totalPnL / filteredTrades.length, true)}
              tone={totalPnL / filteredTrades.length >= 0 ? "pos" : "neg"}
            />
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
          /* Un point par TRADE : chaque exécution fait sa marche sur la courbe,
             les jours ne sont pas agrégés. L'abscisse reste temporelle (c'est ce
             que lit `PnlChart`), et on lui donne l'heure d'entrée quand elle est
             connue — sans elle, plusieurs trades du même jour tomberaient au même
             point et le tracé sauterait à la verticale. */
          const points = [];
          let cum = 0;
          for (const tr of sorted) {
            cum += tr.pnl || 0;
            const day = String(tr.date || "").split("T")[0];
            const time = tr.entryTime || tr.entry_time;
            const stamp = /^\d{2}:\d{2}/.test(String(time || ""))
              ? `${day}T${String(time).slice(0, 5)}:00`
              : (String(tr.date || "").includes("T") ? String(tr.date) : day);
            points.push({ date: stamp, value: cum });
          }
          return { strategy: s, points };
        }).filter(Boolean);

        if (seriesPerStrategy.length === 0) return null;

        /* Le graphique est celui de TOUTES les pages de stats — `PnlChart` de
           components/ui/da.jsx, la même brique que les fiches de compte et de
           prop firm : trame de points sous la courbe, quadrillage ouvert,
           estompage de ce qui suit le curseur, tracé à fond perdu à gauche.
           La page en portait sa propre version (SVG maison, légende en colonne
           de 180 px, tooltip multi-séries) : ~200 lignes qui refaisaient, en
           moins bien, ce que la brique partagée fait déjà.

           Le format attendu est { date, cum }. Le recadrage des séries
           secondaires sur la fenêtre affichée est fait par la brique elle-même
           (ancrage à plat avant le premier trade et après le dernier). */
        const asPoints = (s) => s.points.map((p) => ({ date: p.date, cum: p.value }));

        /* Série de premier plan : celle de la page, ou celle que l'utilisateur a
           choisie dans la légende. Si la stratégie focalisée n'a plus de trades
           (données rechargées entre-temps), on retombe sur celle de la page. */
        const focusId = seriesPerStrategy.some((s) => String(s.strategy.id) === String(chartFocusId))
          ? chartFocusId
          : selectedStrategy?.id;
        const isFocused = (s) => String(s.strategy.id) === String(focusId);

        const current = seriesPerStrategy.find(isFocused);
        // Aucun trade sur la stratégie mise en avant : pas de série au premier
        // plan, donc rien à comparer — on ne trace pas les autres toutes seules.
        if (!current) return null;

        const others = seriesPerStrategy.filter((s) => !isFocused(s)).map((s) => ({
          id: s.strategy.id,
          name: s.strategy.name,
          color: s.strategy.color,
          points: asPoints(s),
        }));

        const lastValue = (s) => s.points[s.points.length - 1]?.value ?? 0;

        return (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <PnlChart points={asPoints(current)} others={others} color={current.strategy.color} />

            {/* Légende sous le tracé, à la façon d'un axe : elle nomme les
                courbes qu'on vient de lire. Sans elle, les lignes fines derrière
                la principale seraient muettes — les fiches de compte s'en
                passent parce que la liste des comptes rappelle leurs couleurs,
                ici rien ne le fait.

                Chaque entrée est un bouton : elle fait passer sa stratégie au
                premier plan du graphique. Cliquer celle qui y est déjà revient à
                la stratégie de la page. */}
            <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              {[...seriesPerStrategy]
                .sort((a, b) => lastValue(b) - lastValue(a))
                .map((s) => {
                  const active = isFocused(s);
                  const last = lastValue(s);
                  return (
                    <button
                      key={s.strategy.id}
                      type="button"
                      onClick={() => setChartFocusId(active ? selectedStrategy?.id : s.strategy.id)}
                      aria-pressed={active}
                      title={active ? undefined : `Mettre « ${s.strategy.name} » au premier plan`}
                      /* Aucun décor : pas d'aplat, pas de contour. La stratégie
                         au premier plan se signale par sa pleine encre et son
                         nom en gras — les autres restent en retrait. */
                      style={{
                        display:"inline-flex",alignItems:"center",gap:6,minWidth:0,
                        padding:0,border:"none",background:"transparent",cursor:"pointer",
                        fontFamily:"inherit",
                        opacity: active ? 1 : 0.5,
                        transition:"opacity 120ms ease",
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.opacity = 1; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = 0.5; }}
                    >
                      <span style={{width:8,height:8,borderRadius:"50%",background:s.strategy.color,flexShrink:0}}/>
                      <span style={{fontSize:12,fontWeight:500,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>
                        {s.strategy.name}
                      </span>
                      <span style={{fontSize:12,fontWeight:500,whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums",color:last > 0 ? T.pnlPos : last < 0 ? T.pnlNeg : T.textSub}}>
                        {last > 0 ? "+" : ""}{fmt(last, false)}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        );
      })()}

      {/* CARDS 2 + 3 : cote a cote avec gap.
          Respiration supplémentaire au-dessus : le graphique et sa légende
          terminent la lecture « performance », ces cartes ouvrent autre chose —
          les 24 px du rythme de page ne suffisaient pas à marquer la coupure. */}
      {filteredTrades.length > 0 && (
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"stretch",marginTop:16}}>
        {/* CARD 2 : Condition probabilite */}
        <div style={{...CARD, padding:0}}>
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${HAIRLINE}`}}>
            <div style={{fontSize:14,fontWeight:600,color:T.text,display:"inline-flex",alignItems:"center",gap:4}}>
              {t("strat.detail.condProb")} <span style={{color:T.textMut,fontWeight:500}}>›</span>
            </div>
            <div style={{fontSize:11,color:T.textMut,marginTop:2}}>{t("strat.detail.condProbSub")}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
            {/* BEST */}
            <div style={{padding:16,borderRight:`1px solid ${T.border}`}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{paddingBottom:14,borderBottom:`1px solid ${HAIRLINE}`}}>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.bestDay")}</div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text}}>{bestDay.day}</div>
                </div>
                <div style={{paddingBottom:14,borderBottom:`1px solid ${HAIRLINE}`}}>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.bestWindow")}</div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text}}>{bestHour.hour}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.bestAsset")}</div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text}}>{bestSymbol.symbol}</div>
                </div>
              </div>
            </div>
            {/* WORST */}
            <div style={{padding:16}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{paddingBottom:14,borderBottom:`1px solid ${HAIRLINE}`}}>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.worstDay")}</div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text}}>{worstDay.day}</div>
                </div>
                <div style={{paddingBottom:14,borderBottom:`1px solid ${HAIRLINE}`}}>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.worstWindow")}</div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text}}>{worstHour.hour}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:T.textMut,marginBottom:6,fontWeight:500}}>{t("strat.detail.worstAsset")}</div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text}}>{worstSymbol.symbol}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 3 : tao score */}
        <div style={{...CARD, padding:0}}>
          <div style={{padding:"16px 20px"}}>
            <div style={{fontSize:14,fontWeight:600,color:T.text,display:"inline-flex",alignItems:"center",gap:4}}>
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
                    <span key={v} style={{position:"absolute",left:`${v}%`,transform:tx,fontSize: 10,color:T.textMut,fontWeight:500,fontVariantNumeric:"tabular-nums"}}>{v}</span>
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
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <SectionTitle
          action={<SectionAction onClick={() => setPage?.("trades")}>{t("strat.detail.viewAll")}</SectionAction>}
        >
          <span style={{display:"inline-flex",alignItems:"baseline",gap:8}}>
            <span>{t("strat.detail.recentTrades")}</span>
            <span style={{fontSize:20,fontWeight:400,color:T.text,opacity:0.4}}>{filteredTrades.length}</span>
          </span>
        </SectionTitle>

        {filteredTrades.length === 0 ? (
          <div style={{...CARD, padding:"40px 24px",textAlign:"center",color:T.textMut,fontSize:13}}>
            {t("strat.detail.noTrade")}
          </div>
        ) : (
          <TradesPage trades={filteredTrades} strategies={strategies} embedded />
        )}
      </div>
    </div>
  );
}

