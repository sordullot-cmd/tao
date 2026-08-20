"use client";

import React from "react";
import { T } from "@/lib/ui/tokens";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { ArrowUpRight, ArrowDownRight, Pencil, Link2, Check, Plus } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { ARCHIVED_VIEW_ID } from "@/lib/utils/archivedAccounts";
import { parseAccountSize, updateTradingAccount } from "@/lib/propFirms";
import { PLATFORMS } from "@/lib/brokers/platforms";
import {
  CARD, SectionTitle, SectionAction, HeroAmount, BackLink,
  PeriodPills, windowSeries, AGGREGATE_CURVE_COLOR,
  PnlChart, msOf, MiniKpi, StatsCard, TableFilter,
} from "@/components/ui/da";
import { accountBrandColor, assignSeriesColors } from "@/lib/ui/brandColors";
import TradesList from "@/components/ui/tradesList";
import MonthCalendar from "@/components/ui/monthCalendar";
import { RoundLogo } from "@/components/ui/accountRows";
import Popover from "@/components/ui/Popover";
import { accountBrand, firmLogo } from "@/lib/accountBrand";
import { AccountModal, firmErrorLabel } from "@/components/modals/AccountModals";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";

/* ---------------------------------------------------------------------------
   Page « détail d'un compte » — portée depuis la maquette Figma
   (fichier mqFgieIhnaljGeybhJRY0V, node 369:3984).

   Ordre des sections, identique à celui de la page d'une prop firm (24 px entre
   chaque) : barre d'actions → identité → chiffre héros + 4 mini-KPI + graphique
   → calendrier du mois → Statistiques → trades. Les deux pages sont des fiches
   de détail : elles partagent leur squelette ET leurs briques (`MiniKpi`,
   `StatsCard` de components/ui/da.jsx), sinon elles dérivent l'une de l'autre.

   Règle du projet : aucune couleur en dur, tout passe par les tokens `T`
   (ce sont des var(--color-*), c'est ce qui fait suivre le thème sombre).
   ------------------------------------------------------------------------- */

const fmtNoCents = (n) => {
  const sym = getCurrencySymbol();
  const v = Math.round(Number(n) || 0);
  const prefix = v < 0 ? "-" : "";
  return `${prefix}${sym}${Math.abs(v).toLocaleString("en-US")}`;
};

const BROKER_LOGOS = {
  "tradovate":           "/trado.png",
  "rithmic":             "/brokers/rithmic.png",
  "rithmic r|trader":    "/brokers/rithmic.png",
  "ninjatrader":         "/brokers/ninja trader.png",
  "ninja trader":        "/brokers/ninja trader.png",
  "topstep":             "/brokers/Topstep_Logo.jpg",
  "topstep x":           "/brokers/Topstep_Logo.jpg",
  "ftmo":                "/brokers/ftmo.png",
  "tradingview":         "/brokers/tradingview.webp",
  "metatrader 5":        "/MetaTrader_5.png",
  "metatrader 4":        "/brokers/MetaTrader_4.png",
  "mt5":                 "/MetaTrader_5.png",
  "mt4":                 "/brokers/MetaTrader_4.png",
  "thinkorswim":         "/brokers/thinkorswim.png",
  "wealthcharts":        "/weal.webp",
  "interactive brokers": "/brokers/Interactive broker.png",
  "ibkr":                "/brokers/Interactive broker.png",
  "capital.com":         "/brokers/capital.png",
  "capital":             "/brokers/capital.png",
  "ig":                  "/brokers/ig logo.png",
  "webull":              "/brokers/webull.png",
};
const getBrokerLogo = (b) => b ? (BROKER_LOGOS[String(b).trim().toLowerCase()] || null) : null;

const dayKey = (d) => String(d || "").slice(0, 10);

/* Les dérivations des colonnes de trades (durée, session, jour, frais, lots,
   clés de stratégie) vivent avec la liste elle-même, dans
   components/ui/tradesList.jsx — une seule source pour toutes les pages. */

/** Cumul du P&L par jour (dernier cumul connu de la journée). */
function cumulativeByDay(list) {
  const sorted = [...(list || [])].sort(
    (a, b) => msOf(a.date || a.entry_time || 0) - msOf(b.date || b.entry_time || 0)
  );
  const byDay = new Map();
  let cum = 0;
  for (const tr of sorted) {
    const k = dayKey(tr.date || tr.entry_time);
    if (!k) continue;
    cum += Number(tr.pnl) || 0;
    byDay.set(k, cum);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, value]) => ({ date, cum: value }))
    .filter(p => !isNaN(msOf(p.date)));
}

export default function AccountDetailPage({ accountId, accounts = [], firms = [], trades = [], strategies = [], setPage, setSelectedFirmId, setAccounts, archivedMeta = {} }) {
  useLang();
  const { user } = useAuth();
  /* Les couleurs de courbe suivent la prop firm du compte avant son broker :
     il faut donc pouvoir remonter de `firm_id` à la firme. */
  const firmById = React.useMemo(() => new Map((firms || []).map((f) => [f.id, f])), [firms]);

  /* Assignations trade ↔ stratégie : même source que la page Trades (table
     Supabase `trade_strategies`, miroir local `tr4de_trade_strategies`). Sans
     ça la colonne « stratégie » du tableau serait vide alors que la donnée
     existe. */
  const [tradeStrategies, setTradeStrategies] = React.useState({});
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("tr4de_trade_strategies");
      if (raw) setTradeStrategies(JSON.parse(raw) || {});
    } catch {}
  }, []);
  React.useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("trade_strategies")
          .select("trade_id, strategy_id")
          .eq("user_id", user.id);
        if (error || cancelled) return;
        const map = {};
        (data || []).forEach((row) => {
          if (!map[row.trade_id]) map[row.trade_id] = [];
          map[row.trade_id].push(row.strategy_id);
        });
        setTradeStrategies(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Vue agrégée « Comptes eval passés » : accountId === ARCHIVED_VIEW_ID.
  // On unit les données de tous les comptes archivés, avec un filtre pour trier
  // par compte individuel.
  const isArchivedView = accountId === ARCHIVED_VIEW_ID;
  // Comptes eval passés : reconstruits depuis les métadonnées d'archivage (le
  // compte a été supprimé de la base). Chacun porte ses trade_ids.
  const archivedAccts = React.useMemo(
    () => Object.entries(archivedMeta || {}).map(([id, m]) => ({
      id,
      name: m?.name || "Compte",
      broker: m?.broker || null,
      eval_account_size: m?.eval_account_size || null,
      account_type: "eval",
      trade_ids: Array.isArray(m?.trade_ids) ? m.trade_ids : [],
    })),
    [archivedMeta]
  );

  // Trades des comptes archivés re-taggués avec leur ancien account_id (leur
  // account_id réel est devenu NULL à la suppression du compte). Toute la
  // logique aval (filtre, courbe, comparaison) fonctionne alors par account_id.
  const archivedTrades = React.useMemo(() => {
    const idToAcc = {};
    archivedAccts.forEach(a => (a.trade_ids || []).forEach(tid => { idToAcc[tid] = a.id; }));
    return (trades || []).filter(t => idToAcc[t.id]).map(t => ({ ...t, account_id: idToAcc[t.id] }));
  }, [archivedAccts, trades]);

  // Modale de modification du compte affiché.
  const [editing, setEditing] = React.useState(false);
  const [filterId, setFilterId] = React.useState("all"); // "all" | id d'un compte passé
  const [period, setPeriod] = React.useState("1A");
  const [statsExpanded, setStatsExpanded] = React.useState(false);
  const [allTradesShown, setAllTradesShown] = React.useState(false);
  React.useEffect(() => {
    if (isArchivedView && filterId !== "all" && !archivedAccts.some(a => a.id === filterId)) {
      setFilterId("all");
    }
  }, [isArchivedView, filterId, archivedAccts]);

  // Compte « courant » : vue normale = le compte ciblé ; vue archivée = le
  // compte filtré (null quand « tous » → on affiche l'agrégat).
  const account = isArchivedView
    ? (filterId !== "all" ? archivedAccts.find(a => a.id === filterId) : null)
    : (accounts || []).find(a => a.id === accountId);

  // Trades agrégés selon le périmètre.
  const accountTrades = React.useMemo(() => {
    if (isArchivedView) {
      const ids = filterId !== "all" ? [filterId] : archivedAccts.map(a => a.id);
      return archivedTrades.filter(t => ids.includes(t.account_id));
    }
    return (trades || []).filter(t => t.account_id === accountId);
  }, [isArchivedView, filterId, archivedAccts, archivedTrades, trades, accountId]);

  const stats = React.useMemo(() => {
    let pnl = 0, wins = 0, losses = 0, scratch = 0, grossWin = 0, grossLoss = 0;
    let bestTrade = null, worstTrade = null;
    let longCount = 0, shortCount = 0;
    let totalFees = 0, totalVolume = 0, openPositions = 0, totalExecutions = 0;
    let holdWinSum = 0, holdWinCount = 0, holdLossSum = 0, holdLossCount = 0;
    let maxWinStreak = 0, maxLossStreak = 0, curStreak = 0, curStreakSign = 0;
    const dayMap = new Map();
    const sorted = [...accountTrades].sort((a, b) => {
      const da = new Date(a.date || a.entry_time || 0).getTime();
      const db = new Date(b.date || b.entry_time || 0).getTime();
      return da - db;
    });
    let cum = 0, peak = 0, maxDD = 0;
    const curve = [];
    const pnlValues = [];
    const durationSec = (entry, exit) => {
      if (!entry || !exit) return null;
      const e = new Date(entry).getTime();
      const x = new Date(exit).getTime();
      if (isNaN(e) || isNaN(x)) return null;
      return Math.max(0, (x - e) / 1000);
    };
    for (const t of sorted) {
      const p = Number(t.pnl) || 0;
      pnl += p;
      cum += p;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDD) maxDD = dd;
      curve.push({ date: t.date, cum });
      pnlValues.push(p);

      // Direction
      const dir = String(t.direction || "long").toLowerCase();
      if (dir === "short") shortCount += 1; else longCount += 1;

      // Volume / Fees / Executions
      const qty = Number(t.qty ?? t.quantity ?? t.size ?? t.contracts) || 0;
      totalVolume += qty;
      // Frais réellement déduits = brut − net (sinon valeur saisie manuellement).
      totalFees += t.pnlGross != null ? (Number(t.pnlGross) - p) : (Number(t.fees ?? t.commission) || 0);
      totalExecutions += Number(t.executions ?? 0) || 1;

      // Open positions = pas d'exit
      if (!t.exit && !t.exit_time) openPositions += 1;

      // Hold duration
      const hold = durationSec(t.entry_time || t.entryTime || t.date, t.exit_time || t.exitTime);

      if (p > 0) {
        wins += 1; grossWin += p;
        if (hold !== null) { holdWinSum += hold; holdWinCount += 1; }
        if (!bestTrade || p > bestTrade.pnl) bestTrade = { ...t, pnl: p };
        if (curStreakSign === 1) curStreak += 1; else { curStreakSign = 1; curStreak = 1; }
        if (curStreak > maxWinStreak) maxWinStreak = curStreak;
      } else if (p < 0) {
        losses += 1; grossLoss += Math.abs(p);
        if (hold !== null) { holdLossSum += hold; holdLossCount += 1; }
        if (!worstTrade || p < worstTrade.pnl) worstTrade = { ...t, pnl: p };
        if (curStreakSign === -1) curStreak += 1; else { curStreakSign = -1; curStreak = 1; }
        if (curStreak > maxLossStreak) maxLossStreak = curStreak;
      } else {
        scratch += 1;
        curStreakSign = 0; curStreak = 0;
      }

      const dKey = String(t.date || "").slice(0, 10);
      dayMap.set(dKey, (dayMap.get(dKey) || 0) + p);
    }
    const winRate = sorted.length ? (wins / sorted.length) * 100 : 0;
    const avgWin = wins ? grossWin / wins : 0;
    const avgLoss = losses ? grossLoss / losses : 0;
    const profitFactor = grossLoss ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
    const expectancy = sorted.length ? pnl / sorted.length : 0;
    const avgTradePnL = expectancy;

    // Std dev des P&L
    let pnlStdDev = 0;
    if (pnlValues.length > 1) {
      const mean = pnl / pnlValues.length;
      const variance = pnlValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (pnlValues.length - 1);
      pnlStdDev = Math.sqrt(variance);
    }

    // Days stats
    let winDays = 0, loseDays = 0, winDaySum = 0, loseDaySum = 0;
    let bestDay = null, worstDay = null;
    for (const [k, v] of dayMap) {
      if (bestDay === null || v > bestDay.pnl) bestDay = { date: k, pnl: v };
      if (worstDay === null || v < worstDay.pnl) worstDay = { date: k, pnl: v };
      if (v > 0) { winDays += 1; winDaySum += v; }
      else if (v < 0) { loseDays += 1; loseDaySum += v; }
    }
    const tradingDays = dayMap.size;
    const avgDailyPnL = tradingDays ? pnl / tradingDays : 0;
    const avgWinDayPnL = winDays ? winDaySum / winDays : 0;
    const avgLoseDayPnL = loseDays ? loseDaySum / loseDays : 0;
    const avgDailyVolume = tradingDays ? sorted.length / tradingDays : 0;
    const avgTradeVolume = sorted.length ? totalVolume / sorted.length : 0;

    // Hold avg (en minutes)
    const avgHoldWinMin = holdWinCount ? holdWinSum / holdWinCount / 60 : 0;
    const avgHoldLossMin = holdLossCount ? holdLossSum / holdLossCount / 60 : 0;

    // SQN = sqrt(N) * mean(P&L) / std(P&L)
    const sqn = pnlStdDev > 0 ? Math.sqrt(pnlValues.length) * (expectancy / pnlStdDev) : 0;

    // Expectancy ratio = avg win / avg loss * win rate / loss rate
    const lossRate = sorted.length ? losses / sorted.length : 0;
    const winR = sorted.length ? wins / sorted.length : 0;
    const expectancyRatio = (avgLoss > 0 && lossRate > 0) ? (winR * avgWin) / (lossRate * avgLoss) : 0;

    // Kelly % = winRate - (lossRate / (avgWin/avgLoss))
    const kellyPct = avgLoss > 0 ? (winR - lossRate * (avgLoss / avgWin || 0)) * 100 : 0;

    // K-Ratio (approximation simple : pente / écart-type des résidus de l'equity)
    let kRatio = 0;
    if (curve.length > 2) {
      const n = curve.length;
      const xs = curve.map((_, i) => i);
      const ys = curve.map(c => c.cum);
      const sumX = xs.reduce((a, b) => a + b, 0);
      const sumY = ys.reduce((a, b) => a + b, 0);
      const meanX = sumX / n, meanY = sumY / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) { num += (xs[i] - meanX) * (ys[i] - meanY); den += (xs[i] - meanX) ** 2; }
      const slope = den > 0 ? num / den : 0;
      const intercept = meanY - slope * meanX;
      let resVar = 0;
      for (let i = 0; i < n; i++) { resVar += (ys[i] - (slope * xs[i] + intercept)) ** 2; }
      const stdRes = n > 2 ? Math.sqrt(resVar / (n - 2)) : 0;
      kRatio = stdRes > 0 ? slope / stdRes : 0;
    }

    return {
      total: sorted.length, pnl, wins, losses, scratch, winRate,
      avgWin, avgLoss, profitFactor, expectancy, maxDD,
      bestTrade, worstTrade, bestDay, worstDay,
      curve, sorted,
      longCount, shortCount, totalFees, totalVolume, openPositions, totalExecutions,
      avgHoldWinMin, avgHoldLossMin,
      maxWinStreak, maxLossStreak,
      tradingDays, winDays, loseDays,
      avgDailyPnL, avgWinDayPnL, avgLoseDayPnL,
      avgDailyVolume, avgTradeVolume, avgTradePnL,
      pnlStdDev, sqn, expectancyRatio, kellyPct, kRatio,
    };
  }, [accountTrades]);

  // Courbe du compte (cumul par jour) puis fenêtre 1S/1M/3M/6M/1A.
  const fullCurve = React.useMemo(() => cumulativeByDay(accountTrades), [accountTrades]);
  const curve = React.useMemo(() => windowSeries(fullCurve, period, p => p.date), [fullCurve, period]);

  // Séries des autres comptes : la maquette montre plusieurs courbes. On ne les
  // invente pas, ce sont les vrais autres comptes de l'utilisateur (c'est ce que
  // faisait l'onglet « Comparer » de l'ancienne version).
  const otherSeries = React.useMemo(() => {
    const srcTrades = isArchivedView ? archivedTrades : (trades || []);
    const srcAccounts = isArchivedView ? archivedAccts : (accounts || []);
    const currentId = isArchivedView ? (filterId !== "all" ? filterId : null) : accountId;
    const kept = srcAccounts.filter(a => a.id !== currentId);
    /* Couleur de la MAISON du compte (prop firm d'abord, broker ensuite), la
       même que dans la liste des comptes. Attribuées en un passage : deux
       comptes de la même firme prennent ses teintes secondaires plutôt que la
       même couleur. */
    const colorById = assignSeriesColors(
      kept.map(a => ({ id: a.id, account: a, firm: firmById.get(a.firm_id) }))
    );
    return kept
      .map(a => ({
        id: a.id,
        name: a.name || "Compte",
        color: colorById.get(a.id),
        points: cumulativeByDay(srcTrades.filter(tr => tr.account_id === a.id)),
      }))
      .filter(s => s.points.length > 1);
  }, [isArchivedView, archivedTrades, archivedAccts, trades, accounts, accountId, filterId, firmById]);

  // Vue normale sans compte, ou vue archivée sans aucun compte archivé.
  if ((!isArchivedView && !account) || (isArchivedView && archivedAccts.length === 0)) {
    /* Même squelette que la page pleine — retour dans sa barre, message dans une
       carte : l'écran vide reste une page de l'app, pas un cul-de-sac. */
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: "var(--font-sans)" }} className="anim-1">
        <div style={{ display: "flex", alignItems: "center", minWidth: 0, margin: "-7px -8px" }}>
          <BackLink label={t("nav.accounts")} onClick={() => setPage?.("accounts")} />
        </div>
        <div style={{ ...CARD, padding: 40, textAlign: "center", color: T.textMut, fontSize: 13 }}>
          {isArchivedView ? "Aucun compte eval passé." : "Compte introuvable."}
        </div>
      </div>
    );
  }

  const aggregatedAll = isArchivedView && filterId === "all";
  const displayName = aggregatedAll
    ? "Comptes eval passés"
    : (account?.name || "Compte");

  const type = account?.account_type || "live";
  const typeLabel = aggregatedAll
    ? `${archivedAccts.length} compte${archivedAccts.length > 1 ? "s" : ""} archivé${archivedAccts.length > 1 ? "s" : ""}`
    : isArchivedView
      ? `Eval passé${account?.eval_account_size ? ` ${account.eval_account_size}` : ""}`
      : type === "eval"
        ? `Eval${account?.eval_account_size ? ` ${account.eval_account_size}` : ""}`
        : type === "funded"
          ? `Funded${account?.eval_account_size ? ` ${account.eval_account_size}` : ""}`
          : "Live";

  // Capital : agrégat (somme des tailles) en vue « tous », sinon celui du compte.
  const capitalAgg = archivedAccts.reduce((s, a) => s + (parseAccountSize(a.eval_account_size) || 0), 0);
  const capital = aggregatedAll ? (capitalAgg > 0 ? capitalAgg : null) : parseAccountSize(account?.eval_account_size);
  const balance = capital !== null ? capital + stats.pnl : null;

  // Delta affiché sous le chiffre héros : variation sur la fenêtre choisie.
  const firstCum = curve.length ? curve[0].cum : 0;
  const lastCum = curve.length ? curve[curve.length - 1].cum : 0;
  const deltaAbs = lastCum - firstCum;
  /* Base du pourcentage : le SOLDE au début de la fenêtre, c'est-à-dire le
     capital du compte plus le cumulé déjà acquis à ce moment-là — même règle que
     le dashboard. Le capital seul ignorait le chemin déjà parcouru ; le cumulé
     seul figeait le rapport quand la fenêtre part de zéro et l'affolait quand
     elle en partait de tout près. Magnitude seule : c'est la flèche qui porte le
     sens de la variation. Sans base connue, pas de pourcentage du tout. */
  const deltaBase = capital ? Math.abs(capital + firstCum) : Math.abs(firstCum);
  const deltaPct = deltaBase ? Math.abs((deltaAbs / deltaBase) * 100) : null;
  const deltaColor = deltaAbs > 0 ? T.pnlPos : deltaAbs < 0 ? T.pnlNeg : T.textSub;
  const DeltaIcon = deltaAbs >= 0 ? ArrowUpRight : ArrowDownRight;

  /* Identité affichée : celle de la prop firm du compte (logo + nom). La
     plateforme d'exécution ne sert qu'à l'import, elle n'apparaît pas ici.
     Sans firme (live ou démo personnel), on retombe sur le broker. */
  const brand = accountBrand(account, firms);
  const brokerLine = [brand.label || null, typeLabel].filter(Boolean).join(" · ");
  const brokerLogo = brand.logo || (account ? getBrokerLogo(account.broker) : null);

  /* Trades du plus récent au plus ancien. La liste se déplie SUR PLACE, comme
     celle de la page d'une firme : l'ancien « Voir plus » quittait la page pour
     un journal non filtré, où le compte qu'on regardait était perdu de vue. */
  const sortedTrades = [...accountTrades]
    .sort((a, b) => msOf(b.date || b.entry_time || 0) - msOf(a.date || a.entry_time || 0));
  const shownTrades = allTradesShown ? sortedTrades : sortedTrades.slice(0, 12);

  // Chiffre héros de la maquette : « Valeur du compte » = capital + P&L. Sans
  // capital connu (compte live sans taille saisie), on retombe sur le P&L seul
  // plutôt que d'afficher un montant faux.
  const heroValue = balance !== null ? balance : stats.pnl;

  // 4 mini-KPI en ligne (node 369:4349) — ils remplacent la grille de 6 tuiles.
  // Mêmes mesures, dans le même ordre, que la page d'une prop firm.
  const miniKpis = [
    {
      label: "P&L",
      value: `${stats.pnl > 0 ? "+" : ""}${fmt(stats.pnl, false)}`,
      tone: stats.pnl > 0 ? "pos" : stats.pnl < 0 ? "neg" : undefined,
    },
    {
      // Coloré au seuil de 50 %, comme la page d'une prop firm : la maquette
      // montre « 33.3% » en rouge, mais ne dit pas où bascule la couleur.
      label: t("accountsPage.winRateL"),
      value: stats.total > 0 ? `${stats.winRate.toFixed(1)}%` : "—",
      tone: stats.total === 0 ? undefined : stats.winRate >= 50 ? "pos" : "neg",
    },
    {
      label: t("accountsPage.profitFactor"),
      value: stats.profitFactor === Infinity ? "∞" : (stats.total > 0 ? stats.profitFactor.toFixed(2) : "—"),
    },
    { label: "Trades", value: String(stats.total) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: "var(--font-sans)" }} className="anim-1">

      {/* ═══ 1. BARRE D'ACTIONS ═══
          Une ligne à elle seule, comme sur la page d'une prop firm : le retour à
          gauche, les actions à droite. Elles étaient jusqu'ici posées dans la
          ligne d'identité, où elles se disputaient la place avec le nom du
          compte — un nom long les repoussait hors de l'écran.

          Le retour mène au parent DIRECT du compte, et à lui seul : sa prop firm
          quand il en a une, la liste des comptes sinon. La liste reste joignable
          en un clic depuis la page de la firme, qui porte déjà son propre
          retour — inutile de la doubler ici. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", minWidth: 0, margin: "-7px -8px" }}>
          {brand.firm ? (
            <BackLink
              icon={<RoundLogo src={brand.logo} size={16} name={brand.firm.name} />}
              label={brand.firm.name}
              onClick={() => { setSelectedFirmId?.(brand.firm.id); setPage?.("firm-detail"); }}
            />
          ) : (
            <BackLink label={t("nav.accounts")} onClick={() => setPage?.("accounts")} />
          )}
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {/* Rattachement à une prop firm. Le réglage existait déjà dans la
              modale « Modifier », noyé sous quatre autres champs : ici c'est une
              action à part entière, à un clic du compte qu'elle concerne. */}
          {!isArchivedView && account && (
            <LinkFirmMenu
              account={account}
              firms={firms}
              onLinked={(next) =>
                setAccounts?.((prev) => (prev || []).map((a) => (a.id === next.id ? { ...a, ...next } : a)))
              }
              onCreateFirm={() => setPage?.("accounts")}
            />
          )}

          {/* Modification du compte — même modale que la page Comptes et la page
              d'une firme. Absente en vue archivée : un eval passé n'existe plus
              en base, il n'y a rien à modifier. */}
          {!isArchivedView && account && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={pillActionStyle()}
            >
              <Pencil size={13} strokeWidth={1.75} /> {t("accountModal.editTitle")}
            </button>
          )}

          {/* Vue archivée : filtre par compte passé. Le même contrôle que les
              filtres des tableaux de la DA, plutôt qu'un menu natif — il porte
              son état dans son libellé (« Compte · Topstep 50k »). */}
          {isArchivedView && (
            <TableFilter
              label="Compte"
              value={filterId === "all" ? "" : filterId}
              options={archivedAccts.map(a => ({ id: a.id, label: a.name || "Compte" }))}
              onChange={(v) => setFilterId(v || "all")}
            />
          )}
        </div>
      </div>

      {/* ═══ 2. IDENTITÉ ═══ logo 44 px, nom 16 px Medium, maison · type à 40 % */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {/* Vignette du broker — 44 px. Passe par la brique partagée : cette page
              en avait sa propre copie, qui reposait le logo carré en `contain` au
              milieu du rond (d'où le cercle qui paraissait incomplet). */}
          <RoundLogo src={brokerLogo} size={44} name={displayName} />

          <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center", minWidth: 0 }}>
            <h1 style={{
              margin: 0, fontSize: 16, fontWeight: 500, lineHeight: 1.25, color: T.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {displayName}
            </h1>
            {brokerLine && (
              <span style={{ fontSize: 14, lineHeight: 1.25, color: T.text, opacity: 0.4, whiteSpace: "nowrap" }}>
                {brokerLine}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ============ VALEUR DU COMPTE + 4 MINI-KPI + GRAPHIQUE ============ */}
      {/* node 369:3998 — bloc 369:3999 (h 112) puis graphique 369:4020 à 24 px */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          {/* node 369:4000 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {/* node 369:4002 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Chiffre héros + variation. La maquette posait 40 px : à
                  l'usage le bloc écrasait tout le haut de page, il descend à
                  28 px et les mini-KPI suivent. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <HeroAmount value={heroValue} size={28} />
                {/* Montant de la variation PUIS son pourcentage entre
                    parenthèses, comme le chiffre héros du dashboard : la somme
                    gagnée ou perdue est ce qu'on lit d'abord, le ratio la
                    replace dans l'échelle du compte. */}
                {curve.length > 1 && (
                  <span
                    title="Variation sur la période affichée"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      fontSize: 13, fontWeight: 500, lineHeight: 1, color: deltaColor,
                      whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span>{deltaAbs > 0 ? "+" : ""}{fmt(deltaAbs, false)}</span>
                    {/* Sans base de calcul, la flèche seule : des parenthèses
                        vides se liraient comme une valeur manquante. */}
                    {deltaPct != null ? (
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        <span>(</span>
                        <DeltaIcon size={15} strokeWidth={1.75} style={{ margin: "0 1px" }} />
                        <span>{deltaPct.toFixed(2)}%</span>
                        <span>&nbsp;)</span>
                      </span>
                    ) : (
                      <DeltaIcon size={15} strokeWidth={1.75} />
                    )}
                  </span>
                )}
              </div>

              {/* 4 mini-KPI en ligne — brique partagée avec la page d'une firme */}
              <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
                {miniKpis.map(k => (
                  <MiniKpi key={k.label} label={k.label} value={k.value} tone={k.tone} />
                ))}
              </div>
            </div>
          </div>

          {/* node 369:4014 */}
          <PeriodPills value={period} onChange={setPeriod} />
        </div>

        {/* node 369:4020 — inchangé */}
        <PnlChart
          points={curve}
          others={otherSeries}
          /* Vue « eval passés » agrégée : plusieurs comptes, donc pas de type
             unique — on prend l'accent des agrégats. */
          color={aggregatedAll ? AGGREGATE_CURVE_COLOR : accountBrandColor(account, firmById.get(account?.firm_id))}
        />
      </div>

      {/* Calendrier du mois, juste après la courbe : il prolonge la lecture du
          graphique (« quand ») avant que les statistiques ne donnent le
          « combien ». Il porte les trades du compte affiché (ou du filtre, en
          vue archivée) et s'ouvre sur le dernier mois tradé. */}
      <MonthCalendar
        trades={accountTrades}
        title="Calendrier du mois"
        onDayClick={!isArchivedView ? () => setPage?.("trades") : undefined}
      />

      {/* ================= STATISTIQUES (node 369:4167) ================= */}
      <StatsSection
        stats={stats}
        capital={capital}
        balance={balance}
        expanded={statsExpanded}
        onToggle={() => setStatsExpanded(v => !v)}
      />

      {/* ============ LISTE DES TRADES (node 370:4630, épurée) ============ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Le titre porte le compte de trades, et « Voir plus » déplie la liste
            sur place — même comportement que la page d'une firme. */}
        <SectionTitle
          action={
            sortedTrades.length > 12 ? (
              <SectionAction onClick={() => setAllTradesShown(v => !v)}>
                {allTradesShown ? "Voir moins" : "Voir plus"}
              </SectionAction>
            ) : null
          }
        >
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
            <span>Trades</span>
            <span style={{ fontSize: 20, fontWeight: 400, color: T.text, opacity: 0.4 }}>{stats.total}</span>
          </span>
        </SectionTitle>

        <TradesList
          trades={shownTrades}
          strategies={strategies}
          tradeStrategies={tradeStrategies}
          empty="Aucun trade sur ce compte."
        />
      </div>

      {editing && account && (
        <AccountModal
          account={account}
          firms={firms}
          userId={user?.id}
          onClose={() => setEditing(false)}
          onSaved={(next) =>
            setAccounts?.((prev) => (prev || []).map((a) => (a.id === next.id ? { ...a, ...next } : a)))
          }
        />
      )}
    </div>
  );
}

/* Pastille d'action de la barre du haut — partagée par « Modifier » et par le
   rattachement à une firme, pour que les deux ne divergent pas. */
function pillActionStyle() {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 16px", minHeight: 34, borderRadius: 999,
    border: `1px solid ${T.border}`, background: T.white,
    color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
  };
}

/* ---------------------------------------------------------------------------
   Rattachement du compte à une prop firm.

   Le lien est une simple colonne `firm_id` sur le compte. Deux règles métier
   l'accompagnent, reprises de la modale de compte :
     - tous les comptes d'une même firme passent par la MÊME plateforme, donc
       rattacher réaligne le broker du compte sur celui de la firme ;
     - un compte peut redevenir isolé (`firm_id = null`), d'où l'entrée
       « Compte isolé » quand une firme est déjà liée.
   ------------------------------------------------------------------------- */
function LinkFirmMenu({ account, firms = [], onLinked, onCreateFirm }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const ref = React.useRef(null);

  // Clic extérieur et Échap : gérés par le Popover, qui rend la liste hors de `ref`.
  const close = React.useCallback(() => setOpen(false), []);

  const linked = firms.find((f) => f.id === account?.firm_id) || null;

  const link = async (firmId) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const firm = firms.find((f) => f.id === firmId) || null;
      const patch = { firm_id: firmId || null };
      // Rattaché : le broker suit la plateforme de la firme. Détaché : le compte
      // garde le sien, il n'y a plus de firme pour l'imposer.
      if (firm) patch.broker = PLATFORMS.find((p) => p.id === firm.platform)?.name || null;
      await updateTradingAccount(account.id, patch);
      onLinked?.({ ...account, ...patch });
      setOpen(false);
    } catch (e) {
      setError(firmErrorLabel(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={pillActionStyle()}
      >
        <Link2 size={13} strokeWidth={1.75} />
        {linked ? "Changer de prop firm" : "Relier à une prop firm"}
      </button>

      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        align="end"
        minWidth={240}
        maxHeight={300}
        role="listbox"
        className="anim-pop"
        style={{
          background: T.white, border: "none", borderRadius: 12,
          boxShadow: "var(--elev-overlay)", padding: 6,
        }}
      >
        <>
          {error && (
            <div style={{ padding: "6px 8px", fontSize: 11, color: T.red, lineHeight: 1.4 }}>{error}</div>
          )}

          {firms.length === 0 ? (
            <>
              <div style={{ padding: "8px 10px", fontSize: 12, color: T.textSub, lineHeight: 1.45 }}>
                Aucune prop firm enregistrée pour l'instant.
              </div>
              <button type="button" onClick={() => { setOpen(false); onCreateFirm?.(); }} style={firmOptionStyle(false)}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: T.accentBg, color: T.textSub,
                }}>
                  <Plus size={12} strokeWidth={2} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>Créer une prop firm</span>
              </button>
            </>
          ) : (
            firms.map((f) => {
              const active = f.id === account?.firm_id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={busy}
                  onClick={() => link(f.id)}
                  style={firmOptionStyle(active)}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.accentBg; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <RoundLogo src={firmLogo(f)} size={20} name={f.name} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </span>
                  {active && <Check size={14} strokeWidth={2} style={{ flexShrink: 0, color: T.textSub }} />}
                </button>
              );
            })
          )}

          {linked && (
            <>
              <div style={{ height: 1, background: T.border, margin: "6px 4px" }} />
              <button type="button" disabled={busy} onClick={() => link("")} style={firmOptionStyle(false)}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: 20, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, color: T.textSub }}>Compte isolé (aucune firme)</span>
              </button>
            </>
          )}
        </>
      </Popover>
    </div>
  );
}

function firmOptionStyle(active) {
  return {
    width: "100%", display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderRadius: 8, border: "none",
    background: active ? T.accentBg : "transparent",
    color: T.text, fontSize: 13, fontWeight: 500,
    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
    transition: "background 120ms var(--ease-out, ease)",
  };
}

/* ---------------------------------------------------------------------------
   Statistiques : 4 cartes de listes « libellé → valeur » (volume d'activité,
   argent, avantage statistique, régularité quotidienne). La maquette n'en
   montre que 4 lignes par carte ; « Voir plus » déplie la totalité des mesures
   déjà calculées par la page (aucune statistique n'est perdue).
   ------------------------------------------------------------------------- */
function StatsSection({ stats, capital, balance, expanded, onToggle }) {
  const money = (v) => fmt(v);
  const num = (v, dec = 2) => Number(v).toFixed(dec);
  const mins = (m) => {
    if (!m) return "—";
    if (m < 1) return `${Math.round(m * 60)}s`;
    const mm = Math.round(m);
    if (mm < 60) return `${mm} min`;
    const h = Math.floor(mm / 60);
    const r = mm % 60;
    return r === 0 ? `${h} h` : `${h} h ${r} min`;
  };

  const groups = [
    {
      title: "Trades",
      rows: [
        { label: t("accountsPage.totalTradesL"), value: String(stats.total) },
        { label: t("accountsPage.winners"), value: String(stats.wins) },
        { label: t("accountsPage.losers"), value: String(stats.losses) },
        { label: t("accountsPage.scratch"), value: String(stats.scratch) },
        { label: t("accountsPage.longTrades"), value: String(stats.longCount) },
        { label: t("accountsPage.shortTrades"), value: String(stats.shortCount) },
        { label: t("accountsPage.maxWinStreakL"), value: String(stats.maxWinStreak) },
        { label: t("accountsPage.maxLossStreakL"), value: String(stats.maxLossStreak) },
        { label: t("accountsPage.totalExecsL"), value: String(stats.totalExecutions) },
        { label: t("accountsPage.avgTradeVolume"), value: stats.avgTradeVolume ? num(stats.avgTradeVolume, 1) : "—" },
        { label: t("accountsPage.avgHoldWin"), value: mins(stats.avgHoldWinMin) },
        { label: t("accountsPage.avgHoldLoss"), value: mins(stats.avgHoldLossMin) },
        { label: t("accountsPage.openPositions"), value: String(stats.openPositions) },
      ],
    },
    {
      title: "P&L",
      rows: [
        { label: t("accountsPage.totalPnL"), value: money(stats.pnl) },
        { label: t("accountsPage.accountBalance"), value: balance !== null ? fmtNoCents(balance) : "—" },
        { label: t("accountsPage.bestTrade"), value: stats.bestTrade ? money(stats.bestTrade.pnl) : "—" },
        { label: t("accountsPage.worstTrade"), value: stats.worstTrade ? money(stats.worstTrade.pnl) : "—" },
        { label: t("accountsPage.maxDrawdown"), value: stats.maxDD > 0 ? `-${fmtNoCents(stats.maxDD)}` : "—" },
        { label: t("accountsPage.totalFees"), value: money(stats.totalFees) },
        { label: t("accountsPage.pnlStdDevL"), value: stats.pnlStdDev > 0 ? money(stats.pnlStdDev) : "—" },
        { label: t("accountsPage.sqn"), value: stats.pnlStdDev > 0 ? num(stats.sqn) : "—" },
        { label: t("accountsPage.kRatio"), value: stats.curve.length > 2 ? num(stats.kRatio) : "—" },
      ],
    },
    {
      // Espérance et « P&L moy. / trade » sont la même mesure (pnl / nb trades) :
      // une seule ligne, sinon la carte affiche deux fois le même chiffre.
      title: t("accountsPage.catEdge"),
      rows: [
        { label: t("accountsPage.profitFactor"), value: stats.profitFactor === Infinity ? "∞" : (stats.total > 0 ? num(stats.profitFactor) : "—") },
        { label: t("accountsPage.winRateL"), value: stats.total > 0 ? `${stats.winRate.toFixed(1)}%` : "—" },
        { label: t("accountsPage.expectancyL"), value: stats.total > 0 ? money(stats.expectancy) : "—" },
        { label: t("accountsPage.avgWinner"), value: stats.wins ? money(stats.avgWin) : "—" },
        { label: t("accountsPage.avgLoser"), value: stats.losses ? `-${fmt(stats.avgLoss)}` : "—" },
        { label: t("accountsPage.expectancyRatioL"), value: stats.expectancyRatio > 0 ? num(stats.expectancyRatio) : "—" },
      ],
    },
    {
      title: t("accountsPage.catDaily"),
      rows: [
        { label: t("accountsPage.winLoseDays"), value: `${stats.winDays} / ${stats.loseDays}` },
        { label: t("accountsPage.avgWinDayPnL"), value: stats.winDays ? money(stats.avgWinDayPnL) : "—" },
        { label: t("accountsPage.avgLoseDayPnL"), value: stats.loseDays ? money(stats.avgLoseDayPnL) : "—" },
        { label: t("accountsPage.avgDailyPnL"), value: stats.tradingDays ? money(stats.avgDailyPnL) : "—" },
        { label: t("accountsPage.totalDaysL"), value: String(stats.tradingDays) },
        { label: t("accountsPage.avgDailyVolume"), value: stats.tradingDays ? num(stats.avgDailyVolume, 1) : "—" },
      ],
    },
  ];

  // Capital connu → on l'expose plutôt que de le perdre (absent de la maquette).
  if (capital !== null) {
    groups[1].rows.splice(1, 0, { label: "Capital", value: fmtNoCents(capital) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionTitle
        action={<SectionAction onClick={onToggle}>{expanded ? "Voir moins" : "Voir plus"}</SectionAction>}
      >
        Statistiques
      </SectionTitle>
      {/* Quatre colonnes en desktop ; globals.css les ramène à deux sous 767 px
          (règle générique sur `repeat(4`), puis à une seule sur mobile étroit. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, alignItems: "stretch" }}>
        {groups.map(g => (
          <StatsCard key={g.title} title={g.title} rows={g.rows} expanded={expanded} />
        ))}
      </div>
    </div>
  );
}
