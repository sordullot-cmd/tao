"use client";

import React, { useState, useEffect } from "react";
import { Pencil, Trash2, Plus, X, Target } from "lucide-react";

import { getCurrencySymbol } from "@/lib/userPrefs";
import { parseCSV, calculateStats } from "@/lib/csvParsers";
import { t, useLang } from "@/lib/i18n";
import { useStrategies } from "@/lib/hooks/useUserData";
import { useTrades } from "@/lib/hooks/useTradeData";
import { useUndo } from "@/lib/contexts/UndoContext";
import { CARD } from "@/components/ui/da";
import { T as BaseT } from "@/lib/ui/tokens";
import { STRATEGY_COLORS, STRATEGY_COLOR_DEFAULT } from "@/lib/ui/tradingColors";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";
import { Modal as DAModal, PillButton as DAPillButton, FIELD as DA_FIELD, FIELD_AREA as DA_FIELD_AREA } from "@/components/ui/form";

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
  const [formData, setFormData] = useState({name:"",description:"",color:STRATEGY_COLOR_DEFAULT,groups:[{id:Date.now(),name:"",rules:[{id:Date.now()+1,text:""}]}]});
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

  /* La palette de la charte, servie ici comme dans « Ajouter un trade » :
     les deux pages creent le meme objet, elles ne peuvent pas proposer deux
     jeux de couleurs differents. */
  const colors = STRATEGY_COLORS;

  const getDefaultFormData = () => ({name:"",description:"",color:STRATEGY_COLOR_DEFAULT,groups:[{id:Date.now(),name:"",rules:[{id:Date.now()+1,text:""}]}]});

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

  /* Ouvrir le détail d'une stratégie : la carte, mais aussi les quatre records
     de la barre du haut, y mènent. Le `localStorage` double la prop parce que
     la coquille remonte la page depuis cette clé après un rechargement. */
  const openDetail = (strategyId) => {
    setSelectedStrategyId(strategyId);
    localStorage.setItem("selectedStrategyId", strategyId);
    setPage("strategy-detail");
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

  /* Stratégies d'un trade. Les assignations sont indexées tantôt par id de
     trade, tantôt par une clé composite (date+symbole+entrée) selon l'âge de
     la donnée — d'où les trois tentatives. */
  const getStrategyIdsForTrade = React.useCallback((trade) => {
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
  }, [tradeStrategiesData]);

  return (
    /* Même ossature que les autres pages de la DA : fond gris hérité de la
       coquille, sections espacées de 24, léger retrait haut. */
    <div style={{display:"flex",flexDirection:"column",gap:24,fontFamily:"var(--font-sans)"}} className="anim-1">
      {/* Le bouton de création vit DANS la barre de records, calé sur la ligne
          de ses intitulés (cf. plus bas) : sur sa propre rangée, il laissait une
          bande vide en travers du haut de page. Il ne subsiste ici que pour
          l'état « aucune stratégie », où la barre n'est pas rendue. */}
      {(!strategies || strategies.length === 0) && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:16,flexWrap:"wrap"}}>
          <button
            onClick={() => setShowStrategyForm(true)}
            style={{display:"inline-flex",alignItems:"center",gap:6,padding: "8px 16px",minHeight: 34, borderRadius:999,background:T.text,border:"none",color:T.textInverted,fontSize: 13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}
          >
            <Plus size={14} strokeWidth={1.75}/> {t("strat.createBtn")}
          </button>
        </div>
      )}

      {/* TOP-STRATEGY LEADERBOARD — 4 blocs : meilleure performance, meilleure
          espérance, meilleur win rate, meilleur profit factor (par stratégie) */}
      {strategies && Array.isArray(strategies) && strategies.length > 0 && (() => {
        /* `getStrategyIdsForTrade` vit maintenant au niveau du composant : il
           servait ici ET aux totaux d'en-tête, deux copies auraient dérivé. */
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

        /* Segment d'une barre de records : intitulé en capitales 11 px, la
           MÉTRIQUE en 16 px semi-gras coloré — c'est elle qu'on compare — puis
           le nom de la stratégie en 11 px atténué. Les segments se lisent comme
           les colonnes d'un même tableau, pas comme quatre cartes empilées. */
        /* Trois lignes de hauteurs FIXES (17 / 25 / 16) : sans elles, un suffixe
           « par trade » ou un nom absent décalait la ligne suivante et les
           quatre colonnes ne s'alignaient plus entre elles. C'est ce
           désalignement qui donnait l'impression de bâclé. */
        const Cell = ({ label, strat, value, suffix, valueColor }) => {
          const open = () => { if (strat) openDetail(strat.strategy.id); };
          return (
            <button
              type="button"
              disabled={!strat}
              onClick={open}
              /* Chaque record MÈNE à sa stratégie : le nom était affiché sans
                 pouvoir y aller, il fallait le retrouver dans la liste. Le
                 survol dessine la même pilule grise que la navigation. */
              title={strat ? strat.strategy.name : undefined}
              style={{
                flex: "1 1 0", minWidth: 140,
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5,
                margin: "-8px -12px", padding: "8px 12px", borderRadius: 12,
                background: "transparent", border: "none", font: "inherit", textAlign: "left",
                cursor: strat ? "pointer" : "default",
                transition: "background var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => { if (strat) e.currentTarget.style.background = T.accentBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{
                fontSize: 13, lineHeight: "16px", height: 16, color: T.textSub,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
              }}>
                {label}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 5, height: 28, maxWidth: "100%", minWidth: 0 }}>
                <span style={{
                  fontSize: 24, fontWeight: 600, lineHeight: "28px", letterSpacing: -0.5,
                  color: strat ? (valueColor || T.text) : T.textMut,
                  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {strat ? value : "—"}
                </span>
                {strat && suffix && (
                  <span style={{
                    fontSize: 12, lineHeight: "17px", color: T.text, opacity: 0.4,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
                  }}>
                    {suffix}
                  </span>
                )}
              </span>
              {/* Pastille de la stratégie devant son nom : le même repère de
                  couleur que sa carte plus bas, qui relie les deux d'un coup
                  d'œil. */}
              <span style={{ display: "flex", alignItems: "center", gap: 6, height: 16, maxWidth: "100%", minWidth: 0 }}>
                {strat && (
                  <span aria-hidden style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: strat.strategy.color || T.textMut,
                  }} />
                )}
                <span style={{
                  fontSize: 12, lineHeight: "16px", color: T.textSub,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {strat ? strat.strategy.name : "—"}
                </span>
              </span>
            </button>
          );
        };

        return (
          /* Plus de filets : ce sont les colonnes elles-mêmes, régulièrement
             espacées, qui structurent la barre. */
          <div className="tr4de-kpi-cards" style={{ display: "flex", alignItems: "flex-start", gap: 40, flexWrap: "wrap", minWidth: 0 }}>
            {/* Ces quatre valeurs sont les MEILLEURES de chaque catégorie : les
                peindre en vert n'apporte rien, elles sont bonnes par
                définition. Elles restent donc en encre pleine — seule une perte
                reste signalée en rouge, puisque là l'information compte. */}
            <Cell
              label="Meilleure perf"
              strat={bestPnl}
              value={bestPnl ? fmt(bestPnl.pnl, true) : "—"}
              valueColor={bestPnl && bestPnl.pnl < 0 ? T.red : T.text}
            />
            <Cell
              label="Espérance"
              strat={bestExp}
              value={bestExp ? fmt(bestExp.expectancy, true) : "—"}
              suffix={bestExp ? "par trade" : null}
              valueColor={bestExp && bestExp.expectancy < 0 ? T.red : T.text}
            />
            <Cell
              label="Win rate"
              strat={bestWR}
              value={bestWR ? `${bestWR.winRate.toFixed(1)}%` : "—"}
            />
            <Cell
              label="Profit factor"
              strat={bestPF}
              value={bestPF ? (bestPF.profitFactor === Infinity ? "∞" : bestPF.profitFactor.toFixed(2)) : "—"}
            />

            {/* Le bouton se cale sur le HAUT du bloc, comme l'action de toutes
                les autres pages. Il portait un retrait de -9 px pour centrer sa
                hauteur (34) sur la ligne des intitulés (16) : l'alignement était
                juste vis-à-vis des intitulés, mais il posait ce bouton 9 px plus
                haut que son équivalent partout ailleurs, et le saut se voyait en
                passant d'une page à l'autre. */}
            <button
              onClick={() => setShowStrategyForm(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                marginLeft: "auto", alignSelf: "flex-start", flexShrink: 0,
                padding: "8px 16px", minHeight: 34, borderRadius: 999, background: T.text, border: "none",
                color: T.textInverted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={14} strokeWidth={1.75}/> {t("strat.createBtn")}
            </button>
          </div>
        );
      })()}

      {/* STRATEGIES LIST - VERTICAL */}
      {strategies && Array.isArray(strategies) && strategies.length > 0 && (
        <div className="anim-stagger" style={{display:"flex",flexDirection:"column",gap:12}}>
          {trades.length === 0 && (
            <div style={{padding:"16px 20px",background:T.amberBg,borderRadius:12,borderLeft:`4px solid ${T.amber}`,fontSize:14,lineHeight:1.5}}>
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
            
            /* Courbe d'équity de la maquette (447:4183) : un TRAIT SEUL sur
               131 px de haut, pleine largeur, sans aire ni trame — la carte
               reste légère et la courbe se lit d'un coup. */
            const EquityLine = ({ trades }) => {
              if (trades.length === 0) {
                return (
                  <div style={{ height: 131, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.textMut }}>
                    {t("strat.noData")}
                  </div>
                );
              }
              const sorted = [...trades].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
              let cum = 0;
              const values = sorted.map(tr => (cum += typeof tr.pnl === "number" ? tr.pnl : 0));
              const minVal = Math.min(...values, 0);
              const maxVal = Math.max(...values, 0);
              const range = (maxVal - minVal) || 1;
              const last = values[values.length - 1] || 0;
              const lineColor = last >= 0 ? T.green : T.red;

              const W = 512, H = 131, pad = 4;
              const xFor = (i) => (values.length === 1 ? W / 2 : (i / (values.length - 1)) * W);
              const yFor = (v) => pad + (H - pad * 2) - ((v - minVal) / range) * (H - pad * 2);
              const d = values.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(" ");

              return (
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  width="100%"
                  height={131}
                  preserveAspectRatio="none"
                  style={{ display: "block", overflow: "visible" }}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
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
                  ...CARD,
                  position: "relative",
                  display: "flex",
                  alignItems: "stretch",
                  gap: 48,
                  padding: 20,
                  cursor: "pointer",
                  transition: "box-shadow var(--dur-fast) var(--ease-out)",
                }}
                onMouseEnter={(e)=>{ e.currentTarget.style.boxShadow = "var(--elev-hover)"; }}
                onMouseLeave={(e)=>{ e.currentTarget.style.boxShadow = T.elevCard; }}
                /* La carte entière navigue, mais elle porte aussi ses deux
                   boutons d'action dans un coin. Le `stopPropagation` de ces
                   boutons suppose que le clic leur parvient — or il ne leur
                   parvenait que sur une frange : quelque chose se glisse
                   au-dessus de leur coin haut-gauche et l'événement remontait
                   ici, ouvrant le détail au lieu de supprimer.
                   D'où la décision par la GÉOMÉTRIE plutôt que par la cible :
                   un clic tombé dans le rectangle d'un bouton exécute ce
                   bouton, quelle que soit la couche qui l'a intercepté. Quand
                   le clic atteint vraiment le bouton, son propre gestionnaire
                   coupe la propagation et on ne passe jamais ici. */
                onClick={(e) => {
                  const visee = [...e.currentTarget.querySelectorAll("[data-card-actions] button")]
                    .find((b) => {
                      /* Au repos les actions sont effacées : leur rectangle
                         existe encore, mais un clic là ne doit rien déclencher. */
                      if (getComputedStyle(b).opacity === "0") return false;
                      const r = b.getBoundingClientRect();
                      if (!r.width || !r.height) return false;
                      return e.clientX >= r.left && e.clientX <= r.right
                          && e.clientY >= r.top && e.clientY <= r.bottom;
                    });
                  if (visee) {
                    if (visee.dataset.action === "delete") handleDeleteStrategy(strategy.id);
                    else handleEditStrategy(strategy);
                    return;
                  }
                  if (e.target.closest?.("[data-card-actions]")) return;
                  openDetail(strategy.id);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  openDetail(strategy.id);
                }}
              >
                {/* ══ COLONNE GAUCHE : identité, courbe, P&L + winrate ══ */}
                {/* `pointerEvents: none` sur les trois blocs de contenu : ils
                    n'ont rien à cliquer, et le titre « Règles » de la colonne
                    droite s'étend sur toute sa largeur — il passait SOUS les
                    deux boutons du coin et leur volait le clic. Seule la frange
                    du bouton qui dépassait de ce bandeau répondait encore. Le
                    clic traverse maintenant jusqu'à la carte, qui navigue ;
                    les boutons restent les seuls à capter. */}
                <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 16, pointerEvents: "none" }}>
                  {/* Pastille de couleur 10 px + nom 16 px, description dessous
                      à 40 % d'opacité (maquette 447:4177). */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 36, background: strategy.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 16, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {strategy.name}
                      </span>
                    </div>
                    {strategy.description && (
                      <div style={{ fontSize: 14, color: T.text, opacity: 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {strategy.description}
                      </div>
                    )}
                  </div>

                  <EquityLine trades={strategyTrades} />

                  {/* Pied : P&L à gauche, winrate + anneau à droite. */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{
                      fontSize: 20, fontWeight: 500, lineHeight: "31px", letterSpacing: -0.65,
                      color: totalPnL > 0 ? T.green : totalPnL < 0 ? T.red : T.textSub,
                      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                    }}>
                      {fmt(totalPnL, true)}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }}>
                        <span style={{ fontSize: 12, color: T.text, opacity: 0.4, whiteSpace: "nowrap" }}>{t("common.winRate")}</span>
                        <span style={{ fontSize: 14, fontWeight: 500, color: T.text, whiteSpace: "nowrap" }}>{winRate}%</span>
                      </div>
                      <DonutChart winRate={parseInt(winRate)} size={33} />
                    </div>
                  </div>
                </div>

                {/* Filet vertical de séparation (maquette 447:4198). */}
                <div aria-hidden style={{ width: 1, alignSelf: "stretch", background: T.border, flexShrink: 0, pointerEvents: "none" }} />

                {/* ========== ACTIONS (top-right, absolu) ========== */}
                <div data-card-actions style={{position:"absolute",top:12,right:12,display:"flex",gap:2,zIndex:2}}>
                  <button
                    type="button"
                    data-action="edit"
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
                    type="button"
                    data-action="delete"
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

                {/* ══ COLONNE DROITE : les règles, par groupe ══ */}
                <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 16, pointerEvents: "none" }}>
                  <span style={{ fontSize: 16, fontWeight: 500, color: T.text }}>{t("strat.rules")}</span>

                  {strategy.groups && strategy.groups.length > 0 ? (
                    /* Les groupes s'écoulent en colonnes de 150 px minimum : la
                       maquette en pose trois de front, la grille en met plus ou
                       moins selon la place réellement disponible. */
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 100%), 1fr))",
                      gap: "24px 12px",
                    }}>
                      {strategy.groups.map(group => (
                        <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                          {group.name && (
                            <span style={{ fontSize: 14, color: T.text, opacity: 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {group.name}
                            </span>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 16, minWidth: 0 }}>
                            {(group.rules || []).map((rule, idx) => (
                              <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: T.text, flexShrink: 0 }} />
                                <span style={{ fontSize: 16, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {rule.text || t("strat.ruleFallback").replace("{n}", String(idx + 1))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: T.textMut }}>{t("strat.noRules")}</div>
                  )}
                </div>
              </div>
            );
            });
          })()}
        </div>
      )}

      {/* EMPTY STATE */}
      {(!strategies || !Array.isArray(strategies) || strategies.length === 0) && (
        <div style={{...CARD,padding:"64px 40px",textAlign:"center",minHeight:"50vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
          <div style={{width:48,height:48,borderRadius:"var(--radius-card)",background:T.accentBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
            <Target size={22} strokeWidth={1.75} color={T.text}/>
          </div>
          <div style={{fontSize:16,fontWeight:600,color:T.text,marginBottom:6,letterSpacing:-0.1}}>{t("strat.empty")}</div>
          <div style={{fontSize:13,color:T.textSub,marginBottom:20,maxWidth:380,lineHeight:1.5}}>{t("strat.emptySub")}</div>
          <button onClick={()=>setShowStrategyForm(true)} style={{display:"inline-flex",alignItems:"center",gap:6,minHeight: 34, padding: "8px 16px",borderRadius:999,background:T.white,color:T.text,fontSize: 13,fontWeight:500,cursor:"pointer",border:`1px solid ${T.text}`,fontFamily:"var(--font-sans)"}}>
            <Plus size={14} strokeWidth={2}/> {t("strat.createBtn")}
          </button>
        </div>
      )}

      {/* ─── MODALE DE CONFIRMATION DE SUPPRESSION ─── */}
      {showDeleteConfirm && (
        <DAModal
          title={t("strat.deleteTitle")}
          onClose={cancelDelete}
          width={420}
          draggable={false}
          scrim
          /* Le corps remonte contre l'en-tête : sans poignée à afficher, celui-ci
             ne porte que la croix, et les 18 px de gouttière haute par défaut
             ouvraient une bande blanche entre elle et l'avertissement. */
          bodyStyle={{ padding: "0 18px 14px", gap: 6 }}
          footer={<>
            <DAPillButton onClick={cancelDelete}>{t("common.cancel")}</DAPillButton>
            <DAPillButton
              variant="primary"
              disabled={loading}
              style={loading ? undefined : {background:T.red,color:"#fff"}}
              onClick={confirmDelete}>
              {loading ? t("common.loading") : t("common.delete")}
            </DAPillButton>
          </>}>
          <div style={{fontSize:14,fontWeight:600,color:T.text,letterSpacing:-0.1}}>{t("strat.deleteTitle")}</div>
          <div style={{fontSize:13,color:T.text,opacity:0.6,lineHeight:1.55}}>{t("strat.deleteWarn")}</div>
        </DAModal>
      )}

      {/* ─── MODALE DE CRÉATION/ÉDITION ─── */}
      {showStrategyForm && (
        <DAModal
          title={editingStrategyId ? t("strat.edit") : t("strat.new")}
          onClose={handleCancelEdit}
          width={560}
          maxHeight="90vh"
          bodyStyle={{padding:"8px 24px 20px",gap:18}}
          footer={<>
            <DAPillButton onClick={handleCancelEdit}>{t("common.cancel")}</DAPillButton>
            <DAPillButton variant="primary" disabled={!formData.name.trim()} onClick={handleCreateStrategy}>
              {editingStrategyId ? t("common.save") : t("strat.createBtn2")}
            </DAPillButton>
          </>}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:formData.color}}/>
            <div style={{fontSize:14,fontWeight:600,color:T.text,letterSpacing:-0.1}}>
              {editingStrategyId ? t("strat.edit") : t("strat.new")}
            </div>
          </div>

              {/* Nom */}
              <div>
                <label style={{display:"block",fontSize:12,fontWeight:500,marginBottom:6,color:T.textSub}}>{t("strat.name")}</label>
                <input type="text" value={formData.name} onChange={(e)=>setFormData({...formData,name:e.target.value})} placeholder={t("strat.namePh")}
                  style={DA_FIELD}
                  />
              </div>

              {/* Description */}
              <div>
                <label style={{display:"block",fontSize:12,fontWeight:500,marginBottom:6,color:T.textSub}}>{t("strat.description")}</label>
                <textarea value={formData.description} onChange={(e)=>setFormData({...formData,description:e.target.value})} placeholder={t("strat.descPh")}
                  style={{...DA_FIELD_AREA,minHeight:64}}
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
                  <button onClick={addGroup} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,color:T.text,background:"transparent",border:"none",cursor:"pointer",padding: "4px 8px",borderRadius:6,fontFamily:"inherit",fontWeight:500}}
                    onMouseEnter={(e)=>{e.currentTarget.style.background=T.accentBg}} onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}>
                    <Plus size={13} strokeWidth={2}/> {t("strat.addGroup")}
                  </button>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {formData.groups && formData.groups.map((group)=>(
                    <div key={group.id} style={{padding:12,border:"none",borderRadius:12,background:DA_FIELD_BG}}>
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
                      <div style={{height:8}}/>

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
                        <button onClick={()=>addRule(group.id)} style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:4,fontSize:12,color:T.textSub,background:"transparent",border:"none",cursor:"pointer",textAlign:"left",padding: "4px 8px",borderRadius:6,fontFamily:"inherit",alignSelf:"flex-start"}}
                          onMouseEnter={(e)=>{e.currentTarget.style.background=T.accentBg;e.currentTarget.style.color=T.text}}
                          onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textSub}}>
                          <Plus size={11} strokeWidth={2}/> {t("strat.addRule")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
        </DAModal>
      )}
    </div>
  );
}
