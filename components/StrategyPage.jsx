"use client";

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Pencil, Trash2, Plus, X, Target } from "lucide-react";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { parseCSV, calculateStats } from "@/lib/csvParsers";
import { t, useLang } from "@/lib/i18n";
import { useStrategies } from "@/lib/hooks/useUserData";
import { useTrades } from "@/lib/hooks/useTradeData";
import { useUndo } from "@/lib/contexts/UndoContext";
import { T as BaseT } from "@/lib/ui/tokens";

/* ─── TOKENS (palette monochrome partagée, dark-aware) ─────────────── */
const T = { ...BaseT };

// Émet un toast d'erreur via le système global (voir components/AlertToast.tsx).
const fireError = (title, body) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tr4de:alert", { detail: { title, body, severity: "danger" } }));
  }
};

const css = `
  button { font-family: inherit; cursor: pointer; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .anim-1 { animation: fadeUp .25s var(--ease-out) both; }
`;

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

export default function StrategyPage({ setPage = () => {}, setSelectedStrategyId = () => {} }) {
  useLang();
  // ✅ Utiliser les hooks Supabase au lieu de localStorage
  const strategiesHook = useStrategies();
  const tradesHook = useTrades();
  
  // ✅ Destructure with safe defaults
  const { strategies = [], addStrategy = async () => {}, updateStrategy = async () => {}, deleteStrategy = async () => {} } = strategiesHook || {};
  const { pushUndo } = useUndo();
  const { trades = [] } = tradesHook || {};

  const [loading, setLoading] = useState(false);
  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [strategyToDelete, setStrategyToDelete] = useState(null);
  const [formData, setFormData] = useState({name:"",description:"",color:"#16A34A",groups:[{id:Date.now(),name:"",rules:[{id:Date.now()+1,text:""}]}]});
  const [editingStrategyId, setEditingStrategyId] = useState(null);
  
  // ✅ Rendre tradeStrategiesData réactif
  const [tradeStrategiesData, setTradeStrategiesData] = useState({});
  const [checkedRules, setCheckedRules] = useState({});

  // ✅ Charger et synchroniser les données de localStorage
  React.useEffect(() => {
    const loadTradeStrategiesData = () => {
      try {
        const saved = localStorage.getItem('tr4de_trade_strategies');
        const data = saved ? JSON.parse(saved) : {};
        setTradeStrategiesData(data);
      } catch (err) {
        console.error("❌ Error loading trade strategies:", err);
        setTradeStrategiesData({});
      }
    };
    
    const loadCheckedRules = () => {
      try {
        const saved = localStorage.getItem('tr4de_checked_rules');
        if (!saved) {
          setCheckedRules({});
          return;
        }
        const parsed = JSON.parse(saved);
        const cleaned = {};
        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === 'boolean') {
            cleaned[key] = value;
          }
        });
        setCheckedRules(cleaned);
      } catch (err) {
        console.error("❌ Error loading checked rules:", err);
        setCheckedRules({});
      }
    };
    
    // Charger les données
    loadTradeStrategiesData();
    loadCheckedRules();
    
    // Écouter les changements de localStorage
    const handleStorageChange = (e) => {
      if (e.key === 'tr4de_trade_strategies') {
        loadTradeStrategiesData();
      }
      if (e.key === 'tr4de_checked_rules') {
        loadCheckedRules();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const colors = ["#EF4444","#F97316","#F59E0B","#EAB308","#84CC16","#22C55E","#10B981","#06B6D4","#3B82F6","#6366F1","#A855F7","#EC4899","#D1D5DB"];

  const getDefaultFormData = () => ({name:"",description:"",color:"#16A34A",groups:[{id:Date.now(),name:"",rules:[{id:Date.now()+1,text:""}]}]});

  // ✅ Synchroniser les stratégies avec localStorage pour que DashboardNew les voit
  React.useEffect(() => {
    if (strategies && strategies.length > 0) {
      localStorage.setItem("apex_strategies", JSON.stringify(strategies));
      localStorage.setItem("tr4de_strategies", JSON.stringify(strategies));
    }
  }, [strategies]);

  const handleCreateStrategy = async () => {
    if(formData.name.trim() && formData.groups.length > 0){
      // Check that all groups have at least one rule
      const validGroups = formData.groups.every(g => g.rules && g.rules.length > 0);
      if(validGroups){
        try {
          setLoading(true);
          if(editingStrategyId){
            // ✅ Mettre à jour via le hook Supabase
            await updateStrategy(editingStrategyId, formData);
          } else {
            // ✅ Créer via le hook Supabase
            await addStrategy(formData);
          }
          setFormData(getDefaultFormData());
          setShowStrategyForm(false);
          setEditingStrategyId(null);
        } catch (err) {
          const errMsg = err?.message || JSON.stringify(err) || "Unknown error";
          console.error("Erreur sauvegarde stratégie:", errMsg);
          fireError("Erreur", `Impossible d'enregistrer la stratégie : ${errMsg}`);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleEditStrategy = (strat) => {
    setFormData(strat);
    setEditingStrategyId(strat.id);
    setShowStrategyForm(true);
  };

  const handleDeleteStrategy = async (strategyId) => {
    // Open confirmation dialog
    setStrategyToDelete(strategyId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!strategyToDelete) return;
    try {
      setLoading(true);
      const snap = strategies.find(s => s.id === strategyToDelete);
      await deleteStrategy(strategyToDelete);
      if (snap) pushUndo({
        label: "Suppression de la stratégie",
        undo: async () => { try { await addStrategy({ name: snap.name, description: snap.description, color: snap.color, groups: snap.groups }); } catch (e) { console.error("undo strategy failed:", e); } },
      });
      setShowDeleteConfirm(false);
      setStrategyToDelete(null);
    } catch (err) {
      const errMsg = err?.message || JSON.stringify(err) || 'Unknown error';
      console.error('Erreur suppression stratégie:', errMsg);
      fireError("Erreur", `Impossible de supprimer la stratégie : ${errMsg}`);
      setShowDeleteConfirm(false);
      setStrategyToDelete(null);
    } finally {
      setLoading(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setStrategyToDelete(null);
  };

  const handleCancelEdit = () => {
    setShowStrategyForm(false);
    setEditingStrategyId(null);
    setFormData(getDefaultFormData());
  };

  // Fermeture des modales à la touche Échap.
  React.useEffect(() => {
    if (!showStrategyForm && !showDeleteConfirm) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showDeleteConfirm) cancelDelete();
      else if (showStrategyForm) handleCancelEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showStrategyForm, showDeleteConfirm]);

  const addGroup = () => {
    setFormData({
      ...formData,
      groups:[...formData.groups,{id:Date.now(),name:"",rules:[{id:Date.now(),text:""}]}]
    });
  };

  const removeGroup = (groupId) => {
    setFormData({
      ...formData,
      groups:formData.groups.filter(g=>g.id!==groupId)
    });
  };

  const updateGroup = (groupId,field,value) => {
    setFormData({
      ...formData,
      groups:formData.groups.map(g=>g.id===groupId?{...g,[field]:value}:g)
    });
  };

  const addRule = (groupId) => {
    setFormData({
      ...formData,
      groups:formData.groups.map(g=>g.id===groupId?{...g,rules:[...g.rules,{id:Date.now(),text:""}]}:g)
    });
  };

  const removeRule = (groupId,ruleId) => {
    setFormData({
      ...formData,
      groups:formData.groups.map(g=>g.id===groupId?{...g,rules:g.rules.filter(r=>r.id!==ruleId)}:g)
    });
  };

  const updateRule = (groupId,ruleId,value) => {
    setFormData({
      ...formData,
      groups:formData.groups.map(g=>g.id===groupId?{...g,rules:g.rules.map(r=>r.id===ruleId?{...r,text:value}:r)}:g)
    });
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}} className="anim-1">
      {/* HEADER */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <button onClick={() => setShowStrategyForm(true)} style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:6,padding:"7px 16px",height:34,borderRadius:999,background:T.text,border:`1px solid ${T.text}`,color:T.white,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"var(--font-sans)"}}>
          <Plus size={14} strokeWidth={2}/> {t("strat.createBtn")}
        </button>
        <div id="tr4de-page-header-slot" />
      </div>

      {/* TOP-STRATEGY LEADERBOARD — 4 blocs : meilleure performance, meilleure
          espérance, meilleur win rate, meilleur profit factor (par stratégie) */}
      {strategies && Array.isArray(strategies) && strategies.length > 0 && (() => {
        const getStrategyIdsForTrade = (trade) => {
          let ids = tradeStrategiesData[trade.id] || [];
          if (ids.length === 0 && trade.date && trade.symbol && trade.entry) {
            const composite = `${trade.date}${trade.symbol}${trade.entry}`;
            ids = tradeStrategiesData[composite] || [];
            if (ids.length === 0) {
              const norm = `${trade.date}${trade.symbol}${parseFloat(trade.entry).toFixed(2)}`;
              ids = tradeStrategiesData[norm] || [];
            }
          }
          return ids.map(String);
        };

        const perStrat = strategies.map(s => {
          const sId = String(s.id);
          const sTrades = trades.filter(tr => getStrategyIdsForTrade(tr).includes(sId));
          const total = sTrades.length;
          const pnl = sTrades.reduce((acc, tr) => acc + (typeof tr.pnl === "number" ? tr.pnl : 0), 0);
          const wins = sTrades.filter(tr => (tr.pnl || 0) > 0);
          const losses = sTrades.filter(tr => (tr.pnl || 0) < 0);
          const winRate = (wins.length + losses.length) > 0 ? (wins.length / (wins.length + losses.length)) * 100 : 0;
          const sumWins = wins.reduce((a, tr) => a + (tr.pnl || 0), 0);
          const sumLosses = Math.abs(losses.reduce((a, tr) => a + (tr.pnl || 0), 0));
          const profitFactor = sumLosses > 0 ? sumWins / sumLosses : (sumWins > 0 ? Infinity : 0);
          const expectancy = total > 0 ? pnl / total : 0;
          return { strategy: s, total, pnl, winRate, profitFactor, expectancy };
        }).filter(x => x.total > 0);

        const pickBest = (metric) => {
          if (perStrat.length === 0) return null;
          return perStrat.reduce((best, cur) => (cur[metric] > best[metric] ? cur : best), perStrat[0]);
        };

        const bestPnl = pickBest("pnl");
        const bestExp = pickBest("expectancy");
        const bestWR  = pickBest("winRate");
        const bestPF  = pickBest("profitFactor");

        const Cell = ({ label, strat, value, valueColor, last }) => (
          <div style={{
            padding: "16px 20px",
            borderRight: last ? "none" : `1px solid ${T.border}`,
            display: "flex", flexDirection: "column", gap: 6, minWidth: 0,
          }}>
            <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: T.text, letterSpacing: -0.2, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {strat ? (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{strat.strategy.name}</span>
              ) : "—"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: valueColor || T.textSub, fontVariantNumeric: "tabular-nums" }}>{value}</div>
          </div>
        );

        return (
          <div className="tr4de-kpi-row" style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
              <Cell
                label="Meilleure performance"
                strat={bestPnl}
                value={bestPnl ? fmt(bestPnl.pnl, true) : "—"}
                valueColor={bestPnl && bestPnl.pnl > 0 ? T.green : bestPnl && bestPnl.pnl < 0 ? T.red : T.textSub}
              />
              <Cell
                label="Meilleure espérance"
                strat={bestExp}
                value={bestExp ? `${fmt(bestExp.expectancy, true)} / trade` : "—"}
                valueColor={bestExp && bestExp.expectancy > 0 ? T.green : bestExp && bestExp.expectancy < 0 ? T.red : T.textSub}
              />
              <Cell
                label="Plus haut win rate"
                strat={bestWR}
                value={bestWR ? `${bestWR.winRate.toFixed(1)}%` : "—"}
                valueColor={T.text}
              />
              <Cell
                label="Plus haut profit factor"
                strat={bestPF}
                value={bestPF ? (bestPF.profitFactor === Infinity ? "∞" : bestPF.profitFactor.toFixed(2)) : "—"}
                valueColor={T.text}
                last
              />
            </div>
          </div>
        );
      })()}

      {/* STRATEGIES LIST - VERTICAL */}
      {strategies && Array.isArray(strategies) && strategies.length > 0 && (
        <div className="anim-stagger" style={{display:"flex",flexDirection:"column",gap:12}}>
          {trades.length === 0 && (
            <div style={{padding:"20px",background:T.amberBg,borderRadius:"var(--radius-card)",borderLeft:`4px solid ${T.amber}`}}>
              <strong>{t("strat.noTradesLoaded")}</strong><br/>
              {t("strat.noTradesLoadedSub")}
            </div>
          )}
          
          {(() => {
            // ✅ Fonction helper pour obtenir les stratégies assignées à un trade
            const getStrategyIdsForTrade = (trade) => {
              // Chercher d'abord par ID du trade Supabase
              let strategyIds = tradeStrategiesData[trade.id] || [];
              
              // Si pas trouvé, essayer l'ancien format (pour compatibilité)
              if (strategyIds.length === 0 && trade.date && trade.symbol && trade.entry) {
                // ✅ IMPORTANT: Pas de tirets bas! Doit correspondre exactement aux clés créées dans DashboardNew.jsx
                const compositeId = `${trade.date}${trade.symbol}${trade.entry}`;
                strategyIds = tradeStrategiesData[compositeId] || [];
                
                // Aussi essayer avec entry normalisée
                if (strategyIds.length === 0) {
                  const normalizedEntry = parseFloat(trade.entry).toFixed(2);
                  const compositeIdNormalized = `${trade.date}${trade.symbol}${normalizedEntry}`;
                  strategyIds = tradeStrategiesData[compositeIdNormalized] || [];
                }
              }
              
              return strategyIds;
            };

            // 📊 Compter les trades pour chaque stratégie
            const strategyTradeCountMap = {};
            strategies.forEach(s => {
              strategyTradeCountMap[s.id] = 0;
            });
            
            trades.forEach(t => {
              const strategyIds = getStrategyIdsForTrade(t);
              strategyIds.forEach(stratId => {
                if (strategyTradeCountMap.hasOwnProperty(stratId)) {
                  strategyTradeCountMap[stratId]++;
                }
              });
            });

            // 🔄 Trier les stratégies par nombre de trades (décroissant)
            const sortedStrategies = [...strategies].sort((a, b) => {
              return (strategyTradeCountMap[b.id] || 0) - (strategyTradeCountMap[a.id] || 0);
            });

            return sortedStrategies.map((strategy, sIdx) => {
            // Compter les trades assignés à cette stratégie
            const strategyTradeCount = trades.filter(t => {
              const strategyIds = getStrategyIdsForTrade(t);
              // Convertir tous les IDs en string pour comparaison fiable
              return strategyIds.map(id => String(id)).includes(String(strategy.id));
            }).length;

            // Calculer stats rapides (pour l'aperçu)
            const strategyTrades = trades.filter(t => {
              const strategyIds = getStrategyIdsForTrade(t);
              // Convertir tous les IDs en string pour comparaison fiable
              return strategyIds.map(id => String(id)).includes(String(strategy.id));
            });
            
            const totalPnL = strategyTrades.reduce((s, t) => {
              // Assurer que pnl est un nombre valide
              const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
              return s + pnl;
            }, 0);
            
            const winCount = strategyTrades.filter(t => {
              const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
              return pnl > 0;
            }).length;
            
            const lossCount = strategyTrades.filter(t => {
              const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
              return pnl < 0;
            }).length;
            
            const winRate = strategyTradeCount > 0 ? ((winCount / (winCount + lossCount)) * 100).toFixed(1) : 0;
            
            // Calculate total rules count
            const totalRulesCount = strategy.groups.reduce((sum, group) => sum + (group.rules?.length || 0), 0);

            // Calculer combien de trades ont TOUTES leurs règles cochées
            let rulesRespectedCount = 0;
            if (totalRulesCount > 0) {
              strategyTrades.forEach(trade => {
                // Vérifier si TOUTES les règles de cette stratégie sont cochées pour ce trade
                let allRulesChecked = true;
                strategy.groups.forEach(group => {
                  group.rules?.forEach(rule => {
                    // Clé unique format: date_symbol_entry_exit_direction_stratId_ruleId
                    const ruleKey = `${trade.date}_${trade.symbol}_${trade.entry}_${trade.exit || 'none'}_${trade.direction || 'long'}_${strategy.id}_${rule.id}`;
                    if (!(checkedRules[ruleKey] === true)) {
                      allRulesChecked = false;
                    }
                  });
                });
                if (allRulesChecked) {
                  rulesRespectedCount++;
                }
              });
            }
            const rulesPercent = strategyTradeCount > 0 ? ((rulesRespectedCount / strategyTradeCount) * 100).toFixed(0) : 0;
            
            // ✅ Fonction helper pour créer un graphique en anneau (donut chart)
            const DonutChart = ({ winRate, size = 80 }) => {
              const radius = size / 2 - 8;
              const circumference = 2 * Math.PI * radius;
              const offset = circumference - (winRate / 100) * circumference;
              const color = winRate >= 50 ? T.green : T.red;
              
              return (
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.05))"}}>
                  {/* Background circle */}
                  <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={T.border} strokeWidth="6"/>
                  {/* Progress circle */}
                  <circle 
                    cx={size/2} cy={size/2} r={radius} 
                    fill="none" stroke={color} strokeWidth="6"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size/2} ${size/2})`}
                    style={{transition: "stroke-dashoffset 0.3s ease"}}
                  />
                </svg>
              );
            };
            
            // ✅ Fonction helper pour créer un Area Chart
            const AreaChart = ({ trades, width = 280, height = 110 }) => {
              if (trades.length === 0) {
                return <div style={{width:"100%", height: 110, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.textMut}}>{t("strat.noData")}</div>;
              }

              // Cumulative P&L par trade (ordre chronologique)
              const sorted = [...trades].sort((a, b) =>
                new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
              );
              let cum = 0;
              const data = sorted.map(tr => {
                cum += typeof tr.pnl === "number" ? tr.pnl : 0;
                return { date: tr.date, value: cum };
              });

              const values = data.map(d => d.value);
              const minVal = Math.min(...values, 0);
              const maxVal = Math.max(...values, 0);
              const range = (maxVal - minVal) || 1;
              const isPositive = values[values.length - 1] >= 0;
              const lineColor = isPositive ? T.green : T.red;

              // Layout — chart prend toute la place, pas d'ordonnée à droite
              const W = 800;
              const H = 220;
              const padL = 0;
              const padR = 0;
              const padT = 6;
              const padB = 16;
              const plotW = W - padL - padR;
              const plotH = H - padT - padB;

              const xFor = (i) => padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
              const yFor = (v) => padT + plotH - ((v - minVal) / range) * plotH;

              const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(d.value).toFixed(1)}`).join(" ");
              // Surface fermée pour le dégradé : on referme la courbe vers le bas du chart.
              const baselineY = padT + plotH;
              const areaPath = data.length === 0
                ? ""
                : `${linePath} L ${xFor(data.length - 1).toFixed(1)} ${baselineY} L ${xFor(0).toFixed(1)} ${baselineY} Z`;
              const gradientId = `strat-grad-${strategy.id}`;

              const fmtD = (d) => {
                if (!d) return "";
                const parts = String(d).split("T")[0].split("-");
                if (parts.length !== 3) return d;
                const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
                return `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]}`;
              };

              return (
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:"block",overflow:"visible",aspectRatio:`${W} / ${H}`}}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Surface dégradée sous la courbe */}
                  <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
                  {/* Courbe par-dessus */}
                  <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              );
            };
            
            return (
              <div
                key={strategy.id}
                data-card
                role="button"
                tabIndex={0}
                aria-label={strategy.name}
                style={{
                  position:"relative",
                  display:"grid",
                  gridTemplateColumns:"30% 40% 30%",
                  gap:24,
                  padding:20,
                  background:T.white,
                  border:`1px solid ${T.border}`,
                  borderRadius: "var(--radius-card)",
                  cursor:"pointer",
                  minHeight:200,
                  alignItems:"stretch"
                }}
                onMouseEnter={(e)=>{ e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.boxShadow = "var(--elev-hover)"; }}
                onMouseLeave={(e)=>{ e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}
                onClick={() => {
                  setSelectedStrategyId(strategy.id);
                  localStorage.setItem('selectedStrategyId', strategy.id);
                  setPage('strategy-detail');
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedStrategyId(strategy.id);
                    localStorage.setItem('selectedStrategyId', strategy.id);
                    setPage('strategy-detail');
                  }
                }}
              >
                {/* ========== LEFT SECTION: STATISTICS ========== */}
                <div style={{display:"flex",flexDirection:"column",gap:8,paddingRight:20,borderRight:`1px solid ${T.border}`}}>
                  {/* Strategy Name & Color Dot */}
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:strategy.color,flexShrink:0}}/>
                    <div style={{fontSize:15,fontWeight:600,color:T.text,lineHeight:1.3,letterSpacing:-0.1}}>{strategy.name}</div>
                  </div>

                  {/* Description */}
                  {strategy.description && (
                    <div style={{fontSize:12,color:T.textSub,lineHeight:1.45,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                      {strategy.description}
                    </div>
                  )}

                  {/* PnL */}
                  <div style={{fontSize:20,fontWeight:600,color:totalPnL >= 0 ? T.green : T.red,letterSpacing:-0.2}}>{fmt(totalPnL,true)}</div>

                  <div style={{flex:1}} />

                  {/* Win Rate (donut) */}
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <DonutChart winRate={parseInt(winRate)} size={48}/>
                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                      <div style={{fontSize:12,color:T.textSub,fontWeight:500}}>{t("common.winRate")}</div>
                      <div style={{fontSize:13,fontWeight:500,color:T.text}}>{winRate}% · {winCount}W / {lossCount}L</div>
                    </div>
                  </div>
                </div>

                {/* ========== CENTER SECTION: AREA CHART ========== */}
                {/* paddingLeft 13 + paddingRight 12 + borderRight 1px = 13px visible de chaque côté */}
                <div style={{display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 12px 0 13px",borderRight:`1px solid ${T.border}`}}>
                  <div style={{width:"100%"}}>
                    <AreaChart trades={strategyTrades} width={280} height={110}/>
                  </div>
                </div>

                {/* ========== ACTIONS (top-right, absolu) ========== */}
                <div style={{position:"absolute",top:12,right:12,display:"flex",gap:2,zIndex:2}}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditStrategy(strategy); }}
                    title={t("strat.editTip")}
                    aria-label={t("strat.editTip")}
                    style={{
                      width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",
                      borderRadius:6,border:"none",background:"transparent",
                      color:T.textMut,cursor:"pointer",transition:"background .15s ease, color .15s ease",
                    }}
                    onMouseEnter={(e)=>{ e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                    onMouseLeave={(e)=>{ e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}
                  >
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteStrategy(strategy.id); }}
                    title={t("strat.deleteTip")}
                    aria-label={t("strat.deleteTip")}
                    style={{
                      width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",
                      borderRadius:6,border:"none",background:"transparent",
                      color:T.textMut,cursor:"pointer",transition:"background .15s ease, color .15s ease",
                    }}
                    onMouseEnter={(e)=>{ e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
                    onMouseLeave={(e)=>{ e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>

                {/* ========== RIGHT SECTION: RULES ========== */}
                <div style={{display:"flex",flexDirection:"column",gap:10,paddingLeft:20}}>
                  <div style={{display:"flex",alignItems:"center"}}>
                    <div style={{fontSize:12,color:T.textSub,fontWeight:500}}>{t("strat.rules")}</div>
                  </div>

                  <div style={{display:"flex",flexDirection:"column",gap:10,flex:1,overflowY:"auto",maxHeight:170,paddingRight:4}} className="scroll-thin">
                    {strategy.groups && strategy.groups.length > 0 ? (
                      strategy.groups.map(group => (
                        <div key={group.id} style={{display:"flex",flexDirection:"column",gap:4}}>
                          {group.name && (
                            <div style={{fontSize:11,fontWeight:500,color:T.textMut}}>
                              {group.name}
                            </div>
                          )}
                          {group.rules && group.rules.map((rule, idx) => (
                            <div key={rule.id} style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:3,height:3,borderRadius:"50%",background:T.textMut,flexShrink:0}}/>
                              <div style={{fontSize:12,color:T.text,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                {rule.text || t("strat.ruleFallback").replace("{n}", String(idx+1))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                    ) : (
                      <div style={{fontSize:12,color:T.textMut}}>{t("strat.noRules")}</div>
                    )}
                  </div>
                </div>
              </div>
            );
            });
          })()}
        </div>
      )}

      {/* EMPTY STATE */}
      {(!strategies || !Array.isArray(strategies) || strategies.length === 0) && (
        <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:"var(--radius-card)",padding:"64px 40px",textAlign:"center",minHeight:"50vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
          <div style={{width:48,height:48,borderRadius:"var(--radius-card)",background:T.accentBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
            <Target size={22} strokeWidth={1.75} color={T.text}/>
          </div>
          <div style={{fontSize:17,fontWeight:600,color:T.text,marginBottom:6,letterSpacing:-0.1}}>{t("strat.empty")}</div>
          <div style={{fontSize:13,color:T.textSub,marginBottom:20,maxWidth:380,lineHeight:1.5}}>{t("strat.emptySub")}</div>
          <button onClick={()=>setShowStrategyForm(true)} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:999,background:T.white,color:T.text,fontSize:13,fontWeight:600,cursor:"pointer",border:`1px solid ${T.text}`,fontFamily:"var(--font-sans)"}}>
            <Plus size={14} strokeWidth={2}/> {t("strat.createBtn")}
          </button>
        </div>
      )}

      {/* ─── MODALE DE CONFIRMATION DE SUPPRESSION ─── */}
      {showDeleteConfirm && ReactDOM.createPortal(
        <div onClick={cancelDelete} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div role="dialog" aria-modal="true" aria-label={t("strat.deleteTitle")} onClick={(e)=>e.stopPropagation()} style={{background:T.white,borderRadius:"var(--radius-card)",padding:32,maxWidth:400,width:"90%",boxShadow:"var(--elev-overlay)"}}>
            <h2 style={{fontSize:18,fontWeight:700,color:T.text,textAlign:"left",marginBottom:12}}>{t("strat.deleteTitle")}</h2>
            <p style={{fontSize:14,color:T.textSub,textAlign:"left",marginBottom:24,lineHeight:1.5}}>{t("strat.deleteWarn")}</p>
            
            <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
              <button
                onClick={cancelDelete}
                style={{padding:"10px 20px",borderRadius:"var(--radius-card)",border:`1px solid ${T.border}`,background:T.white,fontSize:13,fontWeight:600,cursor:"pointer",color:T.text,transition:"all .2s"}}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmDelete}
                disabled={loading}
                style={{padding:"10px 20px",borderRadius:"var(--radius-card)",border:"none",background:T.red,fontSize:13,fontWeight:600,cursor:loading?"not-allowed":"pointer",color:"#fff",transition:"all .2s",opacity:loading?0.6:1}}
              >
                {loading ? (t("common.loading")) : t("common.delete")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── MODALE DE CRÉATION/ÉDITION ─── */}
      {showStrategyForm && ReactDOM.createPortal(
        <div {...backdropDismiss(handleCancelEdit)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-sans)"}}>
          <div role="dialog" aria-modal="true" aria-label={editingStrategyId ? t("strat.edit") : t("strat.new")} onClick={(e)=>e.stopPropagation()} style={{background:T.white,borderRadius:14,maxWidth:560,width:"92%",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"var(--elev-overlay)",border:`1px solid ${T.border}`,overflow:"hidden"}}>

            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:formData.color}}/>
                <h2 style={{fontSize:16,fontWeight:600,color:T.text,margin:0,letterSpacing:-0.1}}>
                  {editingStrategyId ? t("strat.edit") : t("strat.new")}
                </h2>
              </div>
              <button onClick={handleCancelEdit} aria-label={t("common.cancel")} style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,background:"transparent",border:"none",cursor:"pointer",color:T.textMut,borderRadius:6}}
                onMouseEnter={(e)=>{e.currentTarget.style.background=T.accentBg}} onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}>
                <X size={16} strokeWidth={1.75}/>
              </button>
            </div>

            {/* Body (scroll) */}
            <div style={{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:18}}>

              {/* Nom */}
              <div>
                <label style={{display:"block",fontSize:12,fontWeight:500,marginBottom:6,color:T.textSub}}>{t("strat.name")}</label>
                <input type="text" value={formData.name} onChange={(e)=>setFormData({...formData,name:e.target.value})} placeholder={t("strat.namePh")}
                  style={{width:"100%",padding:"9px 12px",border:`1px solid ${T.border}`,borderRadius:"var(--radius-card)",fontSize:13,outline:"none",fontFamily:"inherit",color:T.text,background:T.white}}
                  />
              </div>

              {/* Description */}
              <div>
                <label style={{display:"block",fontSize:12,fontWeight:500,marginBottom:6,color:T.textSub}}>{t("strat.description")}</label>
                <textarea value={formData.description} onChange={(e)=>setFormData({...formData,description:e.target.value})} placeholder={t("strat.descPh")}
                  style={{width:"100%",padding:"9px 12px",border:`1px solid ${T.border}`,borderRadius:"var(--radius-card)",fontSize:13,outline:"none",resize:"vertical",minHeight:64,fontFamily:"inherit",color:T.text,background:T.white,lineHeight:1.5}}
                  />
              </div>

              {/* Couleur */}
              <div>
                <label style={{display:"block",fontSize:12,fontWeight:500,marginBottom:8,color:T.textSub}}>{t("strat.color")}</label>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%"}}>
                  {colors.map(color=>{
                    const selected = formData.color === color;
                    return (
                      <button key={color} type="button" onClick={()=>setFormData({...formData,color})} aria-label={`Couleur ${color}`} aria-pressed={selected}
                        style={{width:24,height:24,borderRadius:"50%",background:color,border:"none",cursor:"pointer",padding:0,boxShadow:selected?`0 0 0 2px ${T.white}, 0 0 0 4px ${T.text}`:"none",transition:"box-shadow .15s ease",flexShrink:0}}/>
                    );
                  })}
                </div>
              </div>

              {/* Groupes de règles */}
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <label style={{fontSize:12,fontWeight:500,color:T.textSub}}>{t("strat.rules")}</label>
                  <button onClick={addGroup} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,color:T.text,background:"transparent",border:"none",cursor:"pointer",padding:"4px 8px",borderRadius:6,fontFamily:"inherit",fontWeight:500}}
                    onMouseEnter={(e)=>{e.currentTarget.style.background=T.accentBg}} onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}>
                    <Plus size={13} strokeWidth={2}/> {t("strat.addGroup")}
                  </button>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {formData.groups && formData.groups.map((group)=>(
                    <div key={group.id} style={{padding:12,border:`1px solid ${T.border}`,borderRadius:10,background:T.white}}>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <input type="text" placeholder={t("strat.groupNamePh")} value={group.name} onChange={(e)=>updateGroup(group.id,"name",e.target.value)}
                          style={{flex:1,padding:"6px 8px",border:"none",fontSize:12,fontWeight:600,outline:"none",color:T.text,background:"transparent",fontFamily:"inherit",letterSpacing:0.2}}/>
                        {formData.groups.length > 1 && (
                          <button onClick={()=>removeGroup(group.id)} title={t("strat.removeGroupTip")} aria-label={t("strat.removeGroupTip")}
                            style={{display:"flex",alignItems:"center",justifyContent:"center",width:24,height:24,background:"transparent",border:"none",cursor:"pointer",color:T.textMut,borderRadius:6}}
                            onMouseEnter={(e)=>{e.currentTarget.style.background=T.redBg;e.currentTarget.style.color=T.red}}
                            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textMut}}>
                            <X size={13} strokeWidth={2}/>
                          </button>
                        )}
                      </div>
                      <div style={{height:1,background:T.border,margin:"8px 0"}}/>

                      <div style={{display:"flex",flexDirection:"column",gap:4,marginLeft:16}}>
                        {group.rules && group.rules.map((rule)=>(
                          <div key={rule.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6}}
                            onMouseEnter={(e)=>{e.currentTarget.style.background=T.accentBg}}
                            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}>
                            <div style={{width:4,height:4,borderRadius:"50%",background:T.textMut,flexShrink:0}}/>
                            <input type="text" placeholder={t("strat.rulePh")} value={rule.text} onChange={(e)=>updateRule(group.id,rule.id,e.target.value)}
                              style={{flex:1,padding:"4px 0",border:"none",fontSize:12,outline:"none",color:T.text,background:"transparent",fontFamily:"inherit"}}/>
                            {group.rules.length > 1 && (
                              <button onClick={()=>removeRule(group.id,rule.id)} aria-label={t("strat.removeGroupTip")}
                                style={{display:"flex",alignItems:"center",justifyContent:"center",width:20,height:20,background:"transparent",border:"none",cursor:"pointer",color:T.textMut,borderRadius:"var(--radius-field)"}}
                                onMouseEnter={(e)=>{e.currentTarget.style.color=T.red}} onMouseLeave={(e)=>{e.currentTarget.style.color=T.textMut}}>
                                <X size={11} strokeWidth={2}/>
                              </button>
                            )}
                          </div>
                        ))}
                        <button onClick={()=>addRule(group.id)} style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:4,fontSize:12,color:T.textSub,background:"transparent",border:"none",cursor:"pointer",textAlign:"left",padding:"4px 8px",borderRadius:6,fontFamily:"inherit",alignSelf:"flex-start"}}
                          onMouseEnter={(e)=>{e.currentTarget.style.background=T.accentBg;e.currentTarget.style.color=T.text}}
                          onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textSub}}>
                          <Plus size={11} strokeWidth={2}/> {t("strat.addRule")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",padding:"14px 24px",borderTop:`1px solid ${T.border}`,background:T.bg}}>
              <button onClick={handleCancelEdit} style={{padding:"8px 18px",height:34,borderRadius:999,border:`1px solid ${T.border}`,background:T.white,fontSize:13,fontWeight:600,cursor:"pointer",color:T.text,fontFamily:"var(--font-sans)"}}>{t("common.cancel")}</button>
              <button onClick={handleCreateStrategy} disabled={!formData.name.trim()}
                style={{padding:"8px 18px",height:34,borderRadius:999,border:`1px solid ${T.text}`,background:T.text,color:T.white,fontSize:13,fontWeight:600,cursor:formData.name.trim()?"pointer":"not-allowed",opacity:formData.name.trim()?1:0.5,fontFamily:"var(--font-sans)"}}>
                {editingStrategyId ? t("common.save") : t("strat.createBtn2")}
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
