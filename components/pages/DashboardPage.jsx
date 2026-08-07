"use client";

import React, { useState, useEffect } from "react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { useApp } from "@/lib/contexts/AppContext";
import { LayoutDashboard, Plus, ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight } from "lucide-react";

/* ============================================================================
   Briques visuelles de la nouvelle DA (maquette Figma « Tableau de bord »).
   Toutes les couleurs passent par les tokens pour suivre le thème sombre.
   ========================================================================== */

/** Carte blanche : coins 12, ombre très douce, pas de bordure. */
const CARD = {
  background: T.white,
  borderRadius: 12,
  padding: 16,
  boxShadow: T.elevCard,
  overflow: "hidden",
};

/** Titre de section (24px Medium), posé hors carte. */
function SectionTitle({ children, action }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
      <h2 style={{fontSize:24,fontWeight:500,lineHeight:"26.35px",color:T.text,margin:0}}>{children}</h2>
      {action}
    </div>
  );
}

/** En-tête de tableau : 12px Medium en capitales, atténué. */
const TH = { fontSize:12, fontWeight:500, lineHeight:"17.05px", color:T.text, textTransform:"uppercase" };

/** Pastille Long / Short. */
function DirectionTag({ direction }) {
  const isShort = String(direction || "").toLowerCase().startsWith("s");
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      padding:"2px 12px", borderRadius:48, fontSize:14, lineHeight:"17.05px",
      background: isShort ? T.tagShortBg : T.tagLongBg,
      color: isShort ? T.tagShortText : T.tagLongText,
    }}>
      {isShort ? "Short" : "Long"}
    </span>
  );
}

/**
 * Vignette 32×32 du symbole. La maquette montre le logo Nasdaq ; les autres
 * instruments retombent sur une pastille d'initiales plutôt qu'une image vide.
 */
const SYMBOL_LOGOS = [
  { match: /^(mnq|nq|nasdaq|ndx|us100)/i, name: "Nasdaq", src: "/symbols/nasdaq.png" },
  { match: /^(mes|es|spx|us500)/i,        name: "S&P 500" },
  { match: /^(mym|ym|dow|us30)/i,         name: "Dow Jones" },
  { match: /^(m2k|rty|russell)/i,         name: "Russell 2000" },
];

/**
 * Décompose un symbole en nom lisible + code, comme dans la maquette
 * (« Nasdaq » au-dessus de « MNQU6 »). Sans correspondance connue, le code
 * seul est affiché plutôt qu'un libellé inventé.
 */
function symbolLabel(symbol) {
  const code = String(symbol || "").trim();
  const known = SYMBOL_LOGOS.find(l => l.match.test(code));
  return known ? { name: known.name, code } : { name: code, code: null };
}

function SymbolBadge({ symbol }) {
  const logo = SYMBOL_LOGOS.find(l => l.match.test(String(symbol || "")) && l.src);
  if (logo) {
    return (
      <img
        src={logo.src}
        alt=""
        width={32}
        height={32}
        style={{width:32,height:32,borderRadius:4,objectFit:"cover",flexShrink:0,display:"block"}}
      />
    );
  }
  const initials = String(symbol || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width:32, height:32, borderRadius:4, flexShrink:0,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:T.accentBg, color:T.textSub, fontSize:12, fontWeight:500,
    }}>
      {initials}
    </div>
  );
}

/** Montant sur deux tons : partie entière en encre pleine, décimales grisées. */
function HeroAmount({ value }) {
  const text = fmt(value, false);          // ex. "-€98.16"
  const dot = text.lastIndexOf(".");
  const head = dot === -1 ? text : text.slice(0, dot);
  const tail = dot === -1 ? "" : text.slice(dot);
  return (
    <div style={{fontSize:40,fontWeight:500,lineHeight:"31px",letterSpacing:-0.2,whiteSpace:"nowrap"}}>
      <span style={{color:T.text}}>{head}</span>
      <span style={{color:T.numMuted}}>{tail}</span>
    </div>
  );
}

/** Montant sur deux lignes : valeur puis pourcentage entre parenthèses. */
function StackedAmount({ value, percent, align = "flex-end" }) {
  const color = value > 0 ? T.pnlPos : value < 0 ? T.pnlNeg : T.textSub;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:align,justifyContent:"center",color,fontWeight:500,whiteSpace:"nowrap"}}>
      <span style={{fontSize:16,lineHeight:"18.6px"}}>{value > 0 ? "+" : ""}{fmt(value, false)}</span>
      {percent != null && <span style={{fontSize:12,lineHeight:1}}>( {percent.toFixed(2)}% )</span>}
    </div>
  );
}

export default function DashboardPage({ trades = [], allTrades = [], accounts = [], selectedAccountIds = [], strategies = [], setPage }) {
  useLang();
  // Le site n'a plus de filtre de dates : le clic sur un jour ouvre simplement
  // la page Trades, qui liste tout l'historique.
  const goToTradesForDate = () => {
    if (typeof setPage === "function") setPage("trades");
  };
  const [hoveredDayIdx, setHoveredDayIdx] = React.useState(null);
  // Mapping trades → stratégies (depuis localStorage)
  const tradeStrategiesData = React.useMemo(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("tr4de_trade_strategies") || "{}"); }
    catch { return {}; }
  }, []);
  // État des règles cochées par trade × stratégie × règle.
  // Live-updated quand TradesPage (même onglet) émet
  // 'tr4de:checked-rules-changed', ou quand un autre onglet modifie le storage.
  const [checkedRules, setCheckedRules] = React.useState(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("tr4de_checked_rules") || "{}"); }
    catch { return {}; }
  });
  React.useEffect(() => {
    const reload = () => {
      try { setCheckedRules(JSON.parse(localStorage.getItem("tr4de_checked_rules") || "{}")); }
      catch { setCheckedRules({}); }
    };
    const onStorage = (e) => { if (e.key === "tr4de_checked_rules") reload(); };
    window.addEventListener("tr4de:checked-rules-changed", reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("tr4de:checked-rules-changed", reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const [emotionTags, setEmotionTags] = React.useState({});
  const [errorTags, setErrorTags] = React.useState({});
  // Tags par trade partagés avec TradesPage (miroir localStorage de useCloudState)
  const [liquidityTags, setLiquidityTags] = React.useState({});
  const [entryTags, setEntryTags] = React.useState({});
  const [timeframeTags, setTimeframeTags] = React.useState({});
  const [selectedMonth, setSelectedMonth] = React.useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = React.useState(null);
  const [hoveredChart, setHoveredChart] = React.useState(null);
  const [tooltipPos, setTooltipPos] = React.useState({ x: 0, y: 0 });
  // Fenêtre de la courbe P&L — pastilles de la maquette. C'est un zoom sur la
  // fin de la courbe, pas un filtre de données : « Tout » (par défaut) montre
  // l'historique complet depuis le premier trade déposé.
  const PERIODS = [
    { id: "1S", days: 7 },
    { id: "1M", days: 30 },
    { id: "3M", days: 90 },
    { id: "6M", days: 180 },
    { id: "1A", days: 365 },
    { id: "Tout", days: null },
  ];
  const [period, setPeriod] = React.useState("Tout");
  // Largeur réelle de la zone de graphique. La trame de points qui remplit
  // l'aire sous la courbe est un <pattern> SVG : il faut dessiner à l'échelle
  // 1:1, sinon preserveAspectRatio="none" écraserait les points en ellipses.
  const chartRef = React.useRef(null);
  const [chartWidth, setChartWidth] = React.useState(1160);
  React.useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setChartWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allEmotionTags = [
    { id: "fomo", label: t("tag.fomo"), color: "#C94F4F" },
    { id: "revenge", label: t("tag.revenge"), color: "#C94F4F" },
    { id: "overconfident", label: t("tag.overconfident"), color: "#D4A574" },
    { id: "hesitation", label: t("tag.hesitation"), color: "#D4A574" },
    { id: "calm", label: t("tag.calm"), color: "#4A9D6F" },
    { id: "followed", label: t("tag.followed"), color: "#4A9D6F" },
    { id: "boredom", label: t("tag.boredom"), color: "#5B7EC9" },
    { id: "earlyexit", label: t("tag.earlyexit"), color: "#8B6BB6" }
  ];

  const allErrorTags = [
    { id: "poorentry", label: t("errtag.poorentry"), color: "#C94F4F" },
    { id: "poorexit", label: t("errtag.poorexit"), color: "#C94F4F" },
    { id: "nosltp", label: t("errtag.nosltp"), color: "#D4A574" },
    { id: "overleveraged", label: t("errtag.overleveraged"), color: "#D4A574" },
    { id: "ignoredsignal", label: t("errtag.ignoredsignal"), color: "#8B6BB6" },
    { id: "badtiming", label: t("errtag.badtiming"), color: "#C94F4F" },
    { id: "slttoosmall", label: t("errtag.slttoosmall"), color: "#D4A574" },
    { id: "wronganalysis", label: t("errtag.wronganalysis"), color: "#8B6BB6" }
  ];

  // Catégories ICT/SMC + unité de temps — identiques à TradesPage (pour recouper les stats).
  const allEntryTags = [
    { id: "fvg", label: "FVG", color: "#5B7EC9" },
    { id: "ifvg", label: "IFVG", color: "#4A9D6F" },
    { id: "ob", label: "OB", color: "#8B6BB6" },
    { id: "rejectionblock", label: "RB", color: "#D4A574" }
  ];
  const allLiquidityTags = [
    { id: "pdhpdl", label: "PDH/PDL", color: "#5B7EC9" },
    { id: "equalhl", label: "Equal Highs/Lows", color: "#4A9D6F" },
    { id: "asianhl", label: "Asian H/L", color: "#D4A574" },
    { id: "sessionhl", label: "Session H/L", color: "#8B6BB6" },
    { id: "trendline", label: "Trendline", color: "#C94F4F" }
  ];
  const allTimeframeTags = [
    { id: "M1", label: "M1", color: "#C94F4F" },
    { id: "M5", label: "M5", color: "#D4A574" },
    { id: "M15", label: "M15", color: "#4A9D6F" },
    { id: "H1", label: "H1", color: "#5B7EC9" },
    { id: "H4", label: "H4", color: "#8B6BB6" }
  ];

  // Load emotion tags from localStorage
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("tr4de_emotion_tags");
      if (saved) {
        const parsed = JSON.parse(saved);
        setEmotionTags(parsed);
      }
    } catch (err) {
      console.error("Error loading emotion tags:", err);
    }
  }, []);

  // Load error tags from localStorage
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("tr4de_error_tags");
      if (saved) {
        const parsed = JSON.parse(saved);
        setErrorTags(parsed);
      }
    } catch (err) {
      console.error("Error loading error tags:", err);
    }
  }, []);

  // Load liquidity / entry / timeframe tags from localStorage (miroir useCloudState)
  React.useEffect(() => {
    const load = (key, setter) => {
      try {
        const saved = localStorage.getItem(key);
        if (saved) setter(JSON.parse(saved));
      } catch (err) {
        console.error(`Error loading ${key}:`, err);
      }
    };
    load("tr4de_trade_liquidity_tags", setLiquidityTags);
    load("tr4de_trade_entry_tags", setEntryTags);
    load("tr4de_trade_timeframe", setTimeframeTags);
  }, []);

  // Pendant que les trades arrivent depuis Supabase, afficher un skeleton
  // plutôt que l'état vide (évite le flash "Aucun trade" puis re-render).
  const { tradesLoading } = useApp();
  if (tradesLoading && (!trades || trades.length === 0)) {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:24,paddingTop:14,fontFamily:"var(--font-sans)"}} className="anim-1" aria-busy="true" aria-live="polite">
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <h1 style={{fontSize:20,fontWeight:500,lineHeight:1,color:T.text,margin:0,fontFamily:"var(--font-sans)"}}>{t("dash.title")}</h1>
          <div id="tr4de-page-header-slot" style={{marginLeft:"auto"}} />
        </div>
        <Skeleton width={90} height={14} />
        <Skeleton width={220} height={40} />
        <div style={{background:T.white,borderRadius:12,boxShadow:T.elevCard,padding:16}}>
          <SkeletonRows rows={6} height={32} />
        </div>
      </div>
    );
  }
  if (!trades || trades.length === 0) {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:24,paddingTop:14,fontFamily:"var(--font-sans)"}} className="anim-1">
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <h1 style={{fontSize:20,fontWeight:500,lineHeight:1,color:T.text,margin:0,fontFamily:"var(--font-sans)"}}>{t("dash.title")}</h1>
          <div id="tr4de-page-header-slot" style={{marginLeft:"auto"}} />
        </div>
        <div style={{background:T.white,borderRadius:12,boxShadow:T.elevCard,padding:"64px 40px",textAlign:"center",minHeight:"50vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
          <div style={{width:48,height:48,borderRadius:12,background:T.accentBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
            <LayoutDashboard size={22} strokeWidth={1.75} color={T.text}/>
          </div>
          <div style={{fontSize:20,fontWeight:500,color:T.text,marginBottom:6}}>{t("dash.noTrades")}</div>
          <div style={{fontSize:14,color:T.textSub,marginBottom:20,maxWidth:380,lineHeight:1.5}}>{t("dash.noTradesSub")}</div>
          <button onClick={()=>setPage?.("add-trade")} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:999,background:T.white,color:T.text,fontSize:13,fontWeight:500,cursor:"pointer",boxShadow:T.elevPill,border:"none",fontFamily:"var(--font-sans)"}}>
            <Plus size={14} strokeWidth={2}/> {t("trades.importBtn").replace(/^\+\s*/, "")}
          </button>
        </div>
      </div>
    );
  }

  // P&L par jour de la semaine (sur tous les trades, tous mois confondus).
  // Utilise plus bas par la table "Performance par jour".
  const pnlByDay = {0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[]};
  trades.forEach(t => {
    try {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) {
        const dayOfWeek = d.getDay();
        if (pnlByDay[dayOfWeek]) pnlByDay[dayOfWeek].push(t);
      }
    } catch (e) {}
  });

  // Trades du mois affiché dans le calendrier — servent UNIQUEMENT au calendrier
  // (cases du mois et pourcentages associés). Les autres blocs du dashboard ne
  // sont pas bornés au mois affiché.
  const monthTrades = trades.filter(t => {
    try {
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return false;
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    } catch (e) {
      return false;
    }
  });
  const monthPnL = monthTrades.reduce((s,t)=>s+t.pnl,0);

  // Base de toutes les stats du dashboard (Tao Score, performance par jour,
  // radar, trades récents) : l'historique complet, indépendamment du mois
  // affiché dans le calendrier. Seul un clic sur un jour de la semaine dans
  // « Performance par jour » restreint la page à ce jour-là.
  const filteredTrades = selectedDay !== null
    ? (pnlByDay[selectedDay] || [])
    : trades;

  // Le bloc « P&L total » et sa courbe ne sont PAS bornés au mois affiché dans
  // le calendrier : ils couvrent toute la plage sélectionnée (comme la maquette,
  // dont l'axe va du 26 juillet au 2 août). Sans ça, un mois sans trade affiche
  // 0 € et « Pas de données » alors que le compte a un historique.
  const curveTrades = selectedDay !== null
    ? (pnlByDay[selectedDay] || [])
    : trades;

  const totalPnL = curveTrades.reduce((s,t)=>s+t.pnl,0);
  // P&L de référence des blocs de stats — sert de dénominateur aux pourcentages
  // « part du total » (cartes Tao Score, trades récents).
  const statsPnL = filteredTrades.reduce((s,t)=>s+t.pnl,0);
  const wins = filteredTrades.filter(t=>t.pnl>0);
  const losses = filteredTrades.filter(t=>t.pnl<0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = ((winCount/(winCount+lossCount||1))*100).toFixed(1);
  const profitFactor = (wins.reduce((s,t)=>s+t.pnl,0)/Math.abs(losses.reduce((s,t)=>s+t.pnl,0)||1)).toFixed(2);

  // WR Today = winrate sur les trades d'aujourd'hui
  const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
  const todayTrades = (allTrades || []).filter(tr => (tr.date || "").slice(0,10) === todayIso);
  const todayWins = todayTrades.filter(t => t.pnl > 0).length;
  const todayLosses = todayTrades.filter(t => t.pnl < 0).length;
  const wrToday = (todayWins + todayLosses) > 0
    ? ((todayWins / (todayWins + todayLosses)) * 100).toFixed(1)
    : "0.0";
  const avgWin = wins.length ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s,t)=>s+t.pnl,0)/losses.length : 0;
  const maxWin = filteredTrades.length ? Math.max(...filteredTrades.map(t=>t.pnl)) : 0;
  const maxLoss = filteredTrades.length ? Math.min(...filteredTrades.map(t=>t.pnl)) : 0;

  // P&L by hour
  const pnlByHour = {};
  trades.forEach(t => {
    try {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) {
        const hour = d.getHours();
        if (!pnlByHour[hour]) pnlByHour[hour] = 0;
        pnlByHour[hour] += t.pnl;
      }
    } catch (e) {}
  });

  const dayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Calendar heatmap for selected month
  const year = selectedYear;
  const month = selectedMonth;
  let firstDay = new Date(year, month, 1).getDay();
  firstDay = firstDay === 0 ? 6 : firstDay - 1;  // Convertir pour calendrier commençant lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarDays = [];
  
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const dayPnLMap = {};
  trades.forEach(t => {
    try {
      const d = new Date(t.date);
      if (!isNaN(d.getTime()) && d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        if (!dayPnLMap[day]) dayPnLMap[day] = 0;
        dayPnLMap[day] += t.pnl;
      }
    } catch (e) {}
  });


  // PENTAGON RADAR COMPONENT
  const PentagonRadar = ({ metrics, size = 280 }) => {
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
    
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
      const normalizedValue = values[i] / 100;
      const x = center + radius * normalizedValue * Math.cos(angle);
      const y = center + radius * normalizedValue * Math.sin(angle);
      points.push({ x, y, value: values[i], label: labels[i], angle });
    }

    const bgPoints = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      bgPoints.push(`${x},${y}`);
    }

    return (
      <svg width={size} height={size} style={{display:"block",margin:"0 auto",overflow:"visible"}}>
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
              stroke={T.border}
              strokeWidth="1"
              opacity="0.7"
            />
          );
        })}

        {points.map((p, i) => (
          <line key={`axis-${i}`} x1={center} y1={center} x2={p.x} y2={p.y} stroke={T.border} strokeWidth="1" opacity="0.5" />
        ))}

        <polygon
          points={points.map(p => `${p.x},${p.y}`).join(" ")}
          fill={T.krakenBg}
          stroke={T.kraken}
          strokeWidth="2"
        />

        {points.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r="5"
            fill={T.kraken}
            stroke={T.white}
            strokeWidth="2"
          />
        ))}

        {points.map((p, i) => {
          const labelRadius = radius + 35;
          const labelAngle = p.angle;
          const labelX = center + labelRadius * Math.cos(labelAngle);
          const labelY = center + labelRadius * Math.sin(labelAngle);
          
          return (
            <g key={`label-${i}`}>
              <text
                x={labelX}
                y={labelY - 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="600"
                fill={T.textMut}
                style={{pointerEvents:"none"}}
              >
                {p.label}
              </text>
              <text
                x={labelX}
                y={labelY + 8}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="700"
                fill={T.text}
                style={{pointerEvents:"none"}}
              >
                {p.value.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // PENTAGON METRICS CALCULATION
  const pentagonMetrics = (() => {
    const winPercent = parseFloat(winRate);
    const pf = parseFloat(profitFactor);
    const profitFactorScore = Math.min(100, (pf / 2) * 100);
    const winLossRatio = winCount > 0 && lossCount > 0 ? winCount / lossCount : (winCount > 0 ? 100 : 0);
    const winLossScore = Math.min(100, (winLossRatio / 3) * 100);
    
    const avgPnL = filteredTrades.length > 0 ? filteredTrades.reduce((s, t) => s + t.pnl, 0) / filteredTrades.length : 0;
    const variance = filteredTrades.length > 0
      ? filteredTrades.reduce((s, t) => s + Math.pow(t.pnl - avgPnL, 2), 0) / filteredTrades.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = filteredTrades.length > 0
      ? Math.max(0, 100 - (stdDev / Math.max(...filteredTrades.map(t => t.pnl), 1000) * 100))
      : 0;
    // Rule Adherence — moyenne, sur les trades rattachés à une stratégie,
    // du % de règles cochées (= respectées). Trades sans stratégie ou sans
    // règle ignorés (n'influent pas sur la moyenne). Pas de trade évaluable
    // → 100 (neutre, rien à pénaliser).
    const adherencePcts = [];
    filteredTrades.forEach((t) => {
      // Récupère les IDs de stratégie du trade (3 formats de clé possibles)
      let strategyIds = [];
      if (t.id && tradeStrategiesData[t.id]) {
        strategyIds = tradeStrategiesData[t.id];
      } else if (t.date && t.symbol && t.entry != null) {
        const k1 = `${t.date}${t.symbol}${t.entry}`;
        const k2 = `${t.date}${t.symbol}${parseFloat(t.entry).toFixed(2)}`;
        strategyIds = tradeStrategiesData[k1] || tradeStrategiesData[k2] || [];
      }
      if (!strategyIds.length) return;

      let checked = 0, total = 0;
      strategyIds.forEach((sid) => {
        const strat = (strategies || []).find((s) => String(s.id) === String(sid));
        if (!strat?.groups) return;
        strat.groups.forEach((g) => {
          (g.rules || []).forEach((rule) => {
            const ruleKey = `${t.date}_${t.symbol}_${t.entry}_${t.exit}_${t.direction}_${strat.id}_${rule.id}`;
            total++;
            if (checkedRules[ruleKey] === true) checked++;
          });
        });
      });
      if (total > 0) adherencePcts.push((checked / total) * 100);
    });
    const ruleAdherenceScore = adherencePcts.length === 0
      ? 100
      : adherencePcts.reduce((s, v) => s + v, 0) / adherencePcts.length;

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

  // P&L curve - grouped by day (sur toute la plage, pas seulement le mois affiché)
  const sortedTrades = [...curveTrades].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const dailyPnL = {};
  sortedTrades.forEach(t=>{
    try {
      const dateKey = new Date(t.date).toISOString().split('T')[0];
      if (!dailyPnL[dateKey]) dailyPnL[dateKey] = 0;
      dailyPnL[dateKey] += t.pnl;
    } catch (e) {}
  });
  
  const pnlCurveFull = [];
  let cum = 0;
  const sortedDates = Object.keys(dailyPnL).sort();
  // Point de départ à 0, la veille du premier trade
  if (sortedDates.length > 0) {
    const first = new Date(sortedDates[0]);
    first.setDate(first.getDate() - 1);
    pnlCurveFull.push({ cum: 0, pnl: 0, date: first.toISOString().split('T')[0] });
  }
  sortedDates.forEach(date=>{
    cum += dailyPnL[date];
    pnlCurveFull.push({cum, pnl:dailyPnL[date], date});
  });

  // Fenêtre de la courbe : on ne garde que la fin. Le cumulé reste celui du
  // début (on ne recalcule pas à zéro), la pastille est un zoom et non un
  // filtre de données. `days: null` (« Tout ») = historique complet.
  const pnlCurve = (() => {
    const days = (PERIODS.find(p => p.id === period) || PERIODS[PERIODS.length - 1]).days;
    if (days == null || pnlCurveFull.length === 0) return pnlCurveFull;
    const last = new Date(pnlCurveFull[pnlCurveFull.length - 1].date);
    if (isNaN(last.getTime())) return pnlCurveFull;
    const from = new Date(last);
    from.setDate(from.getDate() - days);
    const windowed = pnlCurveFull.filter(p => {
      const d = new Date(p.date);
      return !isNaN(d.getTime()) && d >= from;
    });
    // Une courbe a besoin d'au moins deux points pour être tracée : si la
    // fenêtre est trop étroite, on retombe sur les deux derniers points.
    return windowed.length > 1 ? windowed : pnlCurveFull.slice(-2);
  })();

  // Symbol stats
  const symbolStats = {};
  filteredTrades.forEach(t => {
    if (!symbolStats[t.symbol]) symbolStats[t.symbol] = {pnl:0,trades:0,wins:0};
    symbolStats[t.symbol].pnl += t.pnl;
    symbolStats[t.symbol].trades++;
    if (t.pnl > 0) symbolStats[t.symbol].wins++;
  });
  const topSymbols = Object.entries(symbolStats).sort((a,b)=>b[1].trades-a[1].trades).slice(0,5);
  
  // Prepare day labels
  const dayLabelsFull = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const dayLabelsFr = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

  // Winrate + P&L par valeur de catégorie. `getTags(trade)` renvoie la liste
  // des ids de tags du trade (valeur unique → tableau à 1 élément).
  const categoryStats = (items, getTags) =>
    items
      .map(item => {
        const matched = filteredTrades.filter(tr => getTags(tr).includes(item.id));
        const count = matched.length;
        const wins = matched.filter(tr => tr.pnl > 0).length;
        const pnl = matched.reduce((s, tr) => s + tr.pnl, 0);
        return { ...item, count, wins, pnl, winrate: count ? (wins / count) * 100 : 0 };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.pnl - a.pnl);

  const entryStats = categoryStats(allEntryTags, tr => entryTags[tr.id] || []);
  const liquidityStats = categoryStats(allLiquidityTags, tr => liquidityTags[tr.id] || []);
  const timeframeStats = categoryStats(allTimeframeTags, tr => {
    const v = timeframeTags[tr.id];
    return v ? [v] : [];
  });
  const emotionStats = categoryStats(allEmotionTags, tr => emotionTags[tr.id] || []);

  // Carte « Winrate + P&L par catégorie » — une des 4 cases du bloc Tao Score.
  const renderCategoryCard = (title, subtitle, rows) => (
    <div style={{...CARD,display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <div style={{fontSize:20,fontWeight:500,lineHeight:"21.7px",color:T.text}}>{title}</div>
        <div style={{fontSize:14,lineHeight:"18.6px",color:T.textSub}}>{subtitle}</div>
      </div>
      {rows.length === 0 ? (
        <div style={{fontSize:14,color:T.textMut,padding:"12px 8px"}}>Aucune donnée renseignée</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {rows.map(r => (
            <div key={r.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 8px"}}>
              <div style={{display:"flex",flex:"1 0 0",minWidth:0,alignItems:"center",gap:8}}>
                <span style={{width:9,height:9,borderRadius:96,background:r.color,flexShrink:0}}/>
                <span style={{fontSize:16,fontWeight:500,lineHeight:"17.05px",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</span>
              </div>
              <div style={{width:100,textAlign:"right",fontSize:16,fontWeight:500,lineHeight:"17.05px",color:T.text,flexShrink:0}}>{r.count}X</div>
              <div style={{width:117,display:"flex",flexDirection:"column",alignItems:"flex-end",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:16,fontWeight:500,lineHeight:"18.6px",color:r.winrate>=50?T.pnlPos:T.pnlNeg}}>{r.winrate.toFixed(0)}%</span>
              </div>
              <div style={{width:117,flexShrink:0}}>
                {/* % = part de cette catégorie dans le P&L total de l'historique */}
                <StackedAmount value={r.pnl} percent={statsPnL !== 0 ? Math.abs((r.pnl / statsPnL) * 100) : 0} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Delta affiché sous le chiffre héros : variation du cumulé sur toute la
  // fenêtre visible (et non entre les deux derniers points, qui affichait
  // presque toujours un delta insignifiant).
  const lastCum = pnlCurve.length ? pnlCurve[pnlCurve.length - 1].cum : 0;
  const firstCum = pnlCurve.length ? pnlCurve[0].cum : 0;
  const deltaAbs = lastCum - firstCum;
  const deltaPct = firstCum !== 0 ? Math.abs((deltaAbs / firstCum) * 100) : 0;
  const deltaColor = deltaAbs > 0 ? T.pnlPos : deltaAbs < 0 ? T.pnlNeg : T.textSub;
  const DeltaIcon = deltaAbs >= 0 ? ArrowUpRight : ArrowDownRight;

  // gap 48 et 14 px de retrait haut : la barre du haut (vide en desktop)
  // apporte déjà 20 px, ce qui place le titre aux 34 px de la maquette.
  return (
    <div style={{display:"flex",flexDirection:"column",gap:48,paddingTop:14,fontFamily:"var(--font-sans)"}} className="anim-1">
      {/* PAGE TITLE */}
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <h1 style={{fontSize:20,fontWeight:500,lineHeight:1,color:T.text,margin:0,fontFamily:"var(--font-sans)"}}>{t("dash.title")}</h1>
        <div id="tr4de-page-header-slot" style={{marginLeft:"auto"}} />
      </div>

      {/* P&L TOTAL + COURBE — posés à même le fond, sans carte (DA Figma) */}
      <div style={{display:"flex",flexDirection:"column",gap:24}}>

        {/* Chiffre héros + fenêtre de la courbe */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontSize:14,lineHeight:"18.6px",color:T.textSub}}>{t("dash.kpi.totalPnL")}</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <HeroAmount value={totalPnL} />
              <div style={{display:"flex",alignItems:"center",gap:8,fontSize:16,fontWeight:500,lineHeight:"18.6px",color:deltaColor}}>
                <span>{deltaAbs > 0 ? "+" : ""}{fmt(deltaAbs, false)}</span>
                <span style={{display:"inline-flex",alignItems:"center"}}>
                  <span>(</span>
                  <DeltaIcon size={20} strokeWidth={1.75} style={{margin:"0 1px"}} />
                  <span>{deltaPct.toFixed(2)}%</span>
                  <span>&nbsp;)</span>
                </span>
              </div>
            </div>
          </div>

          {/* Fenêtre temporelle (maquette) */}
          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
            {PERIODS.map(p => {
              const active = period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  aria-pressed={active}
                  style={{
                    padding:"6px 14px", borderRadius:999, border:"none",
                    background: active ? T.white : "transparent",
                    boxShadow: active ? T.elevPill : "none",
                    color: T.text, opacity: active ? 1 : 0.6,
                    fontSize:12, lineHeight:"18.6px", cursor:"pointer", fontFamily:"inherit",
                    transition:"background 140ms ease, opacity 140ms ease",
                  }}
                >
                  {p.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* Zone graphique */}
        <div style={{position:"relative",display:"flex",flexDirection:"column"}}>

          {pnlCurve.length > 1 ? (
            (() => {
              // Géométrie reprise de la maquette : 358 px de haut, 4 séparateurs
              // verticaux à 10 % d'opacité. On dessine à l'échelle 1:1 (W = la
              // largeur réellement mesurée) pour que la trame de points qui
              // remplit l'aire reste circulaire.
              const H = 358, W = chartWidth;
              const topY = 30, plotBottom = 340;
              const plotH = plotBottom - topY;
              const maxCum = Math.max(...pnlCurve.map(x => x.cum));
              const minCum = Math.min(...pnlCurve.map(x => x.cum));
              const span = (maxCum - minCum) || 1;
              const xFor = (i) => (i / (pnlCurve.length - 1 || 1)) * W;
              const yFor = (v) => plotBottom - ((v - minCum) / span) * plotH;
              const points = pnlCurve.map((p, i) => [xFor(i), yFor(p.cum)]);
              const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
              // Aire fermée sous la courbe : c'est elle qui porte la trame.
              const areaD = `${pathD} L ${points[points.length - 1][0]} ${H} L ${points[0][0]} ${H} Z`;

              // Graduations : 4 paliers réguliers entre le min et le max.
              const fmtTick = (v) => {
                const sign = v < 0 ? "-" : "";
                const abs = Math.abs(v);
                if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
                return `${sign}${Math.round(abs)}`;
              };
              const ticks = [0, 1, 2, 3].map(i => {
                const ratio = i / 3;
                return { value: maxCum - ratio * span, top: 16 + ratio * (348 - 16) };
              });

              // 5 repères de date répartis sur la fenêtre affichée.
              const xLabels = [0, 1, 2, 3, 4].map(i => {
                const idx = Math.round((i / 4) * (pnlCurve.length - 1));
                const d = new Date(pnlCurve[idx]?.date || "");
                return isNaN(d.getTime())
                  ? ""
                  : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).toUpperCase();
              });

              return (
                <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>
                  <div
                    ref={chartRef}
                    style={{position:"relative",width:"100%",height:H}}
                    onMouseLeave={() => setHoveredChart(null)}
                  >
                    {/* Séparateurs verticaux */}
                    <div style={{position:"absolute",inset:0,display:"flex",justifyContent:"space-between",opacity:0.10,pointerEvents:"none"}}>
                      {[0,1,2,3].map(i => (
                        <span key={i} style={{width:1,height:"100%",background:T.text,display:"block"}} />
                      ))}
                    </div>

                    {/* Repères de valeur — libellés seuls, sans trait horizontal */}
                    <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
                      {ticks.map((tk, i) => (
                        <div key={i} style={{position:"absolute",left:0,right:0,top:tk.top}}>
                          <span style={{display:"block",fontSize:14,color:T.text,opacity:0.4,textAlign:"right",lineHeight:1}}>
                            {fmtTick(tk.value)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Courbe + trame de l'aire */}
                    <svg
                      width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
                      preserveAspectRatio="none"
                      style={{display:"block",position:"absolute",inset:0,overflow:"visible"}}
                    >
                      <defs>
                        {/* Trame de points de la maquette : pas 11 px, points
                            violets à 15 % — elle remplit l'aire SOUS la courbe. */}
                        <pattern id="dash-area-dots" width="11" height="11" patternUnits="userSpaceOnUse">
                          <circle cx="1" cy="1" r="1" fill={T.kraken} fillOpacity="0.15" />
                        </pattern>
                      </defs>
                      <path d={areaD} fill="url(#dash-area-dots)" stroke="none" />
                      <path
                        d={pathD}
                        stroke={T.kraken}
                        strokeWidth="4"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {hoveredChart !== null && points[hoveredChart] && (
                        <line
                          x1={points[hoveredChart][0]} y1={topY}
                          x2={points[hoveredChart][0]} y2={plotBottom}
                          stroke={T.kraken} strokeWidth="1" strokeDasharray="3 3"
                          vectorEffect="non-scaling-stroke" pointerEvents="none"
                        />
                      )}
                      {points.map((point, i) => (
                        <rect
                          key={`hover-${i}`}
                          x={point[0] - (W / Math.max(pnlCurve.length - 1, 1)) / 2}
                          y="0"
                          width={W / Math.max(pnlCurve.length - 1, 1)}
                          height={H}
                          fill="transparent"
                          style={{cursor:"pointer"}}
                          onMouseEnter={() => {
                            setHoveredChart(i);
                            setTooltipPos({ x: point[0], y: point[1] });
                          }}
                        />
                      ))}
                    </svg>

                    {/* Tooltip */}
                    {hoveredChart !== null && pnlCurve[hoveredChart] && (() => {
                      const p = pnlCurve[hoveredChart];
                      const leftPct = (xFor(hoveredChart) / W) * 100;
                      const topPct = (yFor(p.cum) / H) * 100;
                      const flip = leftPct > 60;
                      const d = new Date(p.date);
                      const label = isNaN(d.getTime())
                        ? p.date
                        : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
                      return (
                        <div style={{
                          position:"absolute",
                          left:`${leftPct}%`,
                          top:`${topPct}%`,
                          transform:`translateY(-100%) translateY(-12px) ${flip ? "translateX(-100%) translateX(-8px)" : "translateX(8px)"}`,
                          background:T.white,
                          borderRadius:8,
                          boxShadow:T.elevCard,
                          padding:"8px 10px",
                          pointerEvents:"none",
                          zIndex:20,
                          whiteSpace:"nowrap",
                          fontFamily:"var(--font-sans)",
                        }}>
                          <div style={{fontSize:12,color:T.textSub,marginBottom:4}}>{label}</div>
                          <div style={{fontSize:14,fontWeight:500,color:p.cum > 0 ? T.pnlPos : p.cum < 0 ? T.pnlNeg : T.text}}>
                            {p.cum > 0 ? "+" : ""}{fmt(p.cum, false)}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Axe des dates */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:14,color:T.text}}>
                    {xLabels.map((l, i) => (
                      <span key={i} style={{opacity:0.4,whiteSpace:"nowrap"}}>{l}</span>
                    ))}
                  </div>
                </div>
              );
            })()
          ) : (
            <div style={{height:200,display:"flex",alignItems:"center",justifyContent:"center",background:"#EFEFEF",borderRadius:8,color:"#8E8E8E"}}>
              Pas de données
            </div>
          )}
        </div>

      </div>  {/* fin bloc P&L total + courbe */}

      {/* CALENDRIER P&L + TRADES RÉCENTS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"stretch"}}>

        {/* Calendrier P&L */}
        <div style={{display:"flex",flexDirection:"column",gap:16,minWidth:0}}>
          <SectionTitle>{t("dash.calendar")}</SectionTitle>
          <div style={{...CARD,display:"flex",flexDirection:"column",gap:12,height:429}}>
            {/* Navigation du mois */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
              <button
                type="button"
                aria-label="Mois précédent"
                onClick={() => {
                  if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); }
                  else setSelectedMonth(selectedMonth - 1);
                }}
                style={{background:"none",border:"none",padding:0,cursor:"pointer",color:T.text,display:"flex",alignItems:"center",justifyContent:"center"}}
              >
                <ChevronLeft size={16} strokeWidth={1.75} />
              </button>
              <div style={{fontSize:16,lineHeight:1,color:T.text}}>
                {new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" })}
              </div>
              <button
                type="button"
                aria-label="Mois suivant"
                onClick={() => {
                  if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); }
                  else setSelectedMonth(selectedMonth + 1);
                }}
                style={{background:"none",border:"none",padding:0,cursor:"pointer",color:T.text,display:"flex",alignItems:"center",justifyContent:"center"}}
              >
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
            </div>

            {/* Grille du mois */}
            <div style={{paddingTop:8,flex:1,minHeight:0}}>
              <div style={{
                display:"grid",
                gridTemplateColumns:"repeat(7,minmax(0,1fr))",
                gridTemplateRows:`auto repeat(${Math.ceil(calendarDays.length / 7)},minmax(0,1fr))`,
                gap:3,
                height:"100%",
              }}>
                {["L","M","M","J","V","S","D"].map((d, idx) => (
                  <div key={`h-${idx}`} style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:8,lineHeight:"12.4px",color:T.textMut,textAlign:"center"}}>{d}</span>
                  </div>
                ))}
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} />;
                  const pnl = dayPnLMap[day] || 0;
                  const dayIso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const clickable = pnl !== 0;
                  const pct = monthPnL !== 0 ? Math.abs((pnl / monthPnL) * 100) : 0;
                  const bg = pnl > 0 ? T.calPosBg : pnl < 0 ? T.calNegBg : T.calEmptyBg;
                  const fg = pnl > 0 ? T.calPosText : pnl < 0 ? T.calNegText : T.calEmptyText;
                  return (
                    <div
                      key={`d-${i}`}
                      onClick={clickable ? () => goToTradesForDate(dayIso) : undefined}
                      title={clickable ? "Voir les trades du jour" : undefined}
                      style={{
                        background:bg, borderRadius:3,
                        display:"flex", flexDirection:"column",
                        alignItems:"center", justifyContent:"center",
                        color:fg, cursor: clickable ? "pointer" : "default",
                        transition:"filter .15s ease", minWidth:0, overflow:"hidden",
                      }}
                      onMouseEnter={clickable ? (e) => { e.currentTarget.style.filter = "brightness(0.96)"; } : undefined}
                      onMouseLeave={clickable ? (e) => { e.currentTarget.style.filter = "none"; } : undefined}
                    >
                      {pnl !== 0 ? (
                        <>
                          <span style={{fontSize:14,lineHeight:"17.05px",whiteSpace:"nowrap"}}>{pnl > 0 ? "+" : ""}{fmt(pnl, false)}</span>
                          <span style={{fontSize:10,lineHeight:"17.05px",whiteSpace:"nowrap"}}>( {pct.toFixed(2)}% )</span>
                        </>
                      ) : (
                        <span style={{fontSize:14,lineHeight:"17.05px"}}>{day}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Trades récents */}
        <div style={{display:"flex",flexDirection:"column",gap:16,minWidth:0}}>
          <SectionTitle
            action={
              <button
                type="button"
                onClick={() => setPage?.("trades")}
                style={{background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit",fontSize:14,lineHeight:"26.35px",color:T.text,opacity:0.4}}
              >
                Voir plus
              </button>
            }
          >
            {selectedDay !== null
              ? t("trades.tradesOfDay").replace("{day}", [t("wd.monday"),t("wd.tuesday"),t("wd.wednesday"),t("wd.thursday"),t("wd.friday"),t("wd.saturday"),t("wd.sunday")][selectedDay])
              : t("dash.recentTrades")}
          </SectionTitle>
          <div style={{...CARD,display:"flex",flexDirection:"column",gap:12,flex:1,minHeight:0}}>
            {/* En-tête de colonnes */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 12px",opacity:0.4}}>
              <div style={{flex:"1 0 0",minWidth:0,display:"flex",alignItems:"center",gap:8}}>
                <span style={{...TH}}>{t("dash.asset")}</span>
              </div>
              <div style={{width:133,flexShrink:0}}><span style={TH}>type</span></div>
              <div style={{width:100,flexShrink:0}}><span style={TH}>Date</span></div>
              <div style={{width:117,flexShrink:0,textAlign:"right"}}><span style={TH}>P&L</span></div>
            </div>

            {/* Lignes */}
            <div style={{display:"flex",flexDirection:"column",gap:8,overflowY:"auto",minHeight:0}}>
              {(() => {
                const source = selectedDay !== null ? (pnlByDay[selectedDay] || []) : filteredTrades;
                const list = [...source]
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .slice(0, 5);
                if (list.length === 0) {
                  return <div style={{fontSize:14,color:T.textMut,padding:"12px 8px"}}>Aucun trade sur la période</div>;
                }
                return list.map((tr, i) => {
                  const d = new Date(tr.date);
                  const dateLabel = isNaN(d.getTime())
                    ? String(tr.date || "")
                    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
                  const pct = statsPnL !== 0 ? Math.abs(((tr.pnl || 0) / statsPnL) * 100) : 0;
                  return (
                    <div
                      key={tr.id || i}
                      style={{
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:12, borderRadius:12, background:"transparent",
                        transition:"background 140ms ease",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = T.rowHighlight; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{flex:"1 0 0",minWidth:0,display:"flex",alignItems:"center",gap:8}}>
                        <SymbolBadge symbol={tr.symbol} />
                        {(() => {
                          const { name, code } = symbolLabel(tr.symbol);
                          return (
                            <div style={{display:"flex",flexDirection:"column",minWidth:0}}>
                              <span style={{fontSize:16,fontWeight:500,lineHeight:"17.05px",color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                {name}
                              </span>
                              {code && (
                                <span style={{fontSize:12,lineHeight:"13.95px",color:T.textMut,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {code}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div style={{width:133,flexShrink:0,display:"flex",alignItems:"center"}}>
                        <DirectionTag direction={tr.direction} />
                      </div>
                      <div style={{width:100,flexShrink:0,fontSize:16,fontWeight:500,lineHeight:"17.05px",color:T.text}}>
                        {dateLabel}
                      </div>
                      <div style={{width:117,flexShrink:0}}>
                        <StackedAmount value={tr.pnl || 0} percent={pct} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* TAO SCORE — 4 cartes de catégories */}
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <SectionTitle>{t("dash.tr4deScore")}</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,alignItems:"stretch"}}>
          {renderCategoryCard(t("dash.emotionalImpact"), t("dash.emotionalImpactSub"), emotionStats)}
          {renderCategoryCard("Type d'entrée", "Winrate & P&L par point d'entrée", entryStats)}
          {renderCategoryCard("Liquidité ciblée", "Winrate & P&L par liquidité visée", liquidityStats)}
          {renderCategoryCard("Unité de temps", "Winrate & P&L par timeframe d'analyse", timeframeStats)}
        </div>
      </div>

      {/* PERFORMANCE PAR JOUR */}
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <SectionTitle>{t("dash.perfByDay")}</SectionTitle>
        <div style={{...CARD,display:"flex",flexDirection:"column",gap:12}}>
          {/* En-tête de colonnes */}
          <div style={{display:"flex",alignItems:"center",gap:60,padding:"0 12px",opacity:0.4}}>
            <div style={{flex:"1 0 0",minWidth:0}}><span style={TH}>{t("dash.day")}</span></div>
            <div style={{flex:"1 0 0",minWidth:0}}><span style={TH}>{t("common.trades")}</span></div>
            <div style={{flex:"1 0 0",minWidth:0}}><span style={TH}>%{t("common.total")}</span></div>
            <div style={{flex:"1 0 0",minWidth:0}}><span style={TH}>{t("common.winRate")}</span></div>
            <div style={{flex:"1 0 0",minWidth:0}}><span style={TH}>{t("dash.avgGain")}</span></div>
            <div style={{flex:"1 0 0",minWidth:0}}><span style={TH}>{t("dash.avgLossHdr")}</span></div>
            <div style={{flex:"1 0 0",minWidth:0,textAlign:"right"}}><span style={TH}>{t("dash.expectancy")}</span></div>
          </div>

          {/* Lignes — un clic restreint tout le dashboard à ce jour */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {(() => {
              const dayNames = [t("wd.monday"),t("wd.tuesday"),t("wd.wednesday"),t("wd.thursday"),t("wd.friday"),t("wd.saturday"),t("wd.sunday")]
                .map(s => s.charAt(0).toUpperCase() + s.slice(1));
              const days = [0,1,2,3,4];
              if (selectedDay !== null) days.sort((a, b) => (a === selectedDay ? -1 : b === selectedDay ? 1 : 0));
              return days.map(idx => {
                const dayTrades = pnlByDay[idx] || [];
                const dayPnL = dayTrades.reduce((s, tr) => s + tr.pnl, 0);
                const dayWins = dayTrades.filter(tr => tr.pnl > 0).length;
                const dayWinRate = dayTrades.length ? ((dayWins / dayTrades.length) * 100).toFixed(0) : "0";
                const dayAvgWin = dayWins ? dayTrades.filter(tr => tr.pnl > 0).reduce((s, tr) => s + tr.pnl, 0) / dayWins : 0;
                const dayLosses = dayTrades.length - dayWins;
                const dayAvgLoss = dayLosses ? dayTrades.filter(tr => tr.pnl < 0).reduce((s, tr) => s + tr.pnl, 0) / dayLosses : 0;
                const expectancy = dayPnL / Math.max(dayTrades.length, 1);
                const isSelected = selectedDay === idx;
                const isHidden = selectedDay !== null && !isSelected;
                if (isHidden) return null;
                const CELL = { flex:"1 0 0", minWidth:0, fontSize:16, fontWeight:500, lineHeight:"17.05px", color:T.text };
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDay(isSelected ? null : idx)}
                    style={{
                      display:"flex", alignItems:"center", gap:60, padding:12, borderRadius:12,
                      background: isSelected ? T.rowHighlight : "transparent",
                      cursor:"pointer", transition:"background 140ms ease",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = T.rowHighlight; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={CELL}>{dayNames[idx]}</div>
                    <div style={CELL}>{dayTrades.length}</div>
                    <div style={CELL}>{((dayTrades.length / Math.max(trades.length, 1)) * 100).toFixed(1)}%</div>
                    <div style={CELL}>{dayWinRate}%</div>
                    <div style={CELL}>{fmt(dayAvgWin, true)}</div>
                    <div style={CELL}>{fmt(dayAvgLoss, true)}</div>
                    <div style={{...CELL,textAlign:"right",lineHeight:"18.6px",color: expectancy > 0 ? T.pnlPos : expectancy < 0 ? T.pnlNeg : T.textSub}}>
                      {fmt(expectancy, true)}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* TAO SCORE — radar */}
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <SectionTitle
          action={
            <span style={{display:"inline-flex",alignItems:"baseline",gap:5}}>
              <span style={{fontSize:20,fontWeight:500,color:T.text,lineHeight:1}}>{pentagonMetrics.overallScore}</span>
              <span style={{fontSize:14,color:T.textMut}}>/ 100</span>
            </span>
          }
        >
          {t("dash.tr4deScore")}
        </SectionTitle>
        <div style={{...CARD,display:"flex",alignItems:"center",justifyContent:"center",height:429}}>
          <PentagonRadar metrics={pentagonMetrics} size={320} />
        </div>
      </div>
    </div>
  );
}
