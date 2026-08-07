"use client";

import React from "react";
import { T } from "@/lib/ui/tokens";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { ARCHIVED_VIEW_ID } from "@/lib/utils/archivedAccounts";
import {
  CARD, TH, SectionTitle, SectionAction, KpiCard, HeroAmount, StackedAmount,
  DirectionTag, SymbolBadge, symbolLabel, PeriodPills, windowSeries, accountColor,
} from "@/components/ui/da";

/* ---------------------------------------------------------------------------
   Page « détail d'un compte » — portée depuis la maquette Figma
   (fichier mqFgieIhnaljGeybhJRY0V, node 323:1410).

   Règle du projet : aucune couleur en dur, tout passe par les tokens `T`
   (ce sont des var(--color-*), c'est ce qui fait suivre le thème sombre).
   ------------------------------------------------------------------------- */

// Palette des courbes secondaires (comparaison entre comptes). Uniquement des
// tokens existants : pas de nouvelle couleur introduite.
const SERIES_COLORS = [T.blue, T.pnlPos, T.amber, T.purple, T.cyan, T.pnlNeg, T.kraken];
// Opacité des courbes des autres comptes, en arrière-plan de la courbe du
// compte affiché (la maquette montre plusieurs séries pâles derrière la série
// principale). // TODO token DA — pas d'équivalent dans tokens.ts
// Opacité des séries secondaires — token DA (dark-aware).
const SERIES_BG_OPACITY = "var(--opacity-series-bg, 0.35)";

const fmtNoCents = (n) => {
  const sym = getCurrencySymbol();
  const v = Math.round(Number(n) || 0);
  const prefix = v < 0 ? "-" : "";
  return `${prefix}${sym}${Math.abs(v).toLocaleString("en-US")}`;
};

const parseEvalSize = (size) => {
  if (size == null) return null;
  const m = String(size).match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k") return num * 1000;
  if (unit === "m") return num * 1000000;
  return num;
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
const msOf = (d) => new Date(d).getTime();

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

export default function AccountDetailPage({ accountId, accounts = [], trades = [], strategies = [], setPage, setSelectedAccountIds, archivedMeta = {} }) {
  useLang();
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

  const [filterId, setFilterId] = React.useState("all"); // "all" | id d'un compte passé
  const [period, setPeriod] = React.useState("1A");
  const [statsExpanded, setStatsExpanded] = React.useState(false);
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
    return srcAccounts
      .filter(a => a.id !== currentId)
      .map((a, i) => ({
        id: a.id,
        name: a.name || "Compte",
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        points: cumulativeByDay(srcTrades.filter(tr => tr.account_id === a.id)),
      }))
      .filter(s => s.points.length > 1);
  }, [isArchivedView, archivedTrades, archivedAccts, trades, accounts, accountId, filterId]);

  // Vue normale sans compte, ou vue archivée sans aucun compte archivé.
  if ((!isArchivedView && !account) || (isArchivedView && archivedAccts.length === 0)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 14, fontFamily: "var(--font-sans)" }}>
        <button
          type="button"
          onClick={() => setPage?.("accounts")}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: T.text }}
        >
          <ArrowLeft size={18} strokeWidth={1.75} /> Retour
        </button>
        <p style={{ margin: 0, fontSize: 16, color: T.textSub }}>
          {isArchivedView ? "Aucun compte eval passé." : "Compte introuvable."}
        </p>
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
  const capitalAgg = archivedAccts.reduce((s, a) => s + (parseEvalSize(a.eval_account_size) || 0), 0);
  const capital = aggregatedAll ? (capitalAgg > 0 ? capitalAgg : null) : parseEvalSize(account?.eval_account_size);
  const balance = capital !== null ? capital + stats.pnl : null;

  // Delta affiché sous le chiffre héros : variation sur la fenêtre choisie.
  const firstCum = curve.length ? curve[0].cum : 0;
  const lastCum = curve.length ? curve[curve.length - 1].cum : 0;
  const deltaAbs = lastCum - firstCum;
  const deltaPct = capital
    ? Math.abs((deltaAbs / capital) * 100)
    : (firstCum !== 0 ? Math.abs((deltaAbs / firstCum) * 100) : 0);
  const deltaColor = deltaAbs > 0 ? T.pnlPos : deltaAbs < 0 ? T.pnlNeg : T.textSub;
  const DeltaIcon = deltaAbs >= 0 ? ArrowUpRight : ArrowDownRight;

  const brokerLine = [account?.broker || null, typeLabel].filter(Boolean).join(" · ");
  const brokerLogo = account ? getBrokerLogo(account.broker) : null;

  const recentTrades = [...accountTrades]
    .sort((a, b) => msOf(b.date || b.entry_time || 0) - msOf(a.date || a.entry_time || 0))
    .slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">

      {/* ================= EN-TÊTE : retour + logo + nom / broker ================= */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={() => setPage?.("accounts")}
          aria-label="Retour"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, padding: 0, border: "none", background: "none",
            color: T.text, cursor: "pointer", flexShrink: 0,
          }}
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {/* Vignette du broker — 44×44, logo 36×36 à l'intérieur (maquette) */}
          <div style={{
            width: 44, height: 44, borderRadius: 36, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: T.accentBg, overflow: "hidden",
          }}>
            {brokerLogo ? (
              <img
                src={brokerLogo}
                alt={account?.broker || ""}
                width={36}
                height={36}
                style={{ width: 36, height: 36, objectFit: "contain", display: "block" }}
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 500, color: T.textSub }}>
                {String(displayName).replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "—"}
              </span>
            )}
          </div>

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

        {/* Vue archivée : filtre par compte passé (fonctionnalité conservée) */}
        {isArchivedView && (
          <select
            value={filterId}
            onChange={(e) => setFilterId(e.target.value)}
            aria-label="Trier par compte"
            style={{
              marginLeft: "auto", padding: "6px 14px", borderRadius: 999,
              border: "none", background: T.white, boxShadow: T.elevPill,
              color: T.text, fontSize: 12, lineHeight: "18.6px", cursor: "pointer",
              fontFamily: "inherit", outline: "none",
            }}
          >
            <option value="all">Tous les comptes passés</option>
            {archivedAccts.map(a => (
              <option key={a.id} value={a.id}>{a.name || "Compte"}</option>
            ))}
          </select>
        )}
      </div>

      {/* ================= P&L + GRAPHIQUE ================= */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub }}>P&amp;L</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <HeroAmount value={stats.pnl} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 500, lineHeight: "18.6px", color: deltaColor }}>
                <span>{deltaAbs > 0 ? "+" : ""}{fmt(deltaAbs, false)}</span>
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <span>(</span>
                  <DeltaIcon size={20} strokeWidth={1.75} style={{ margin: "0 1px" }} />
                  <span>{deltaPct.toFixed(2)}%</span>
                  <span>&nbsp;)</span>
                </span>
              </div>
            </div>
          </div>
          <PeriodPills value={period} onChange={setPeriod} />
        </div>

        <PnlChart points={curve} others={otherSeries} color={accountColor(account?.id)} />
      </div>

      {/* ================= 6 TUILES DE KPI (3 × 2) ================= */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <KpiCard label="Trade" value={String(stats.total)} />
        <KpiCard
          label={t("accountsPage.winRateL")}
          value={stats.total > 0 ? `${stats.winRate.toFixed(1)}%` : "—"}
        />
        <KpiCard
          label={t("accountsPage.profitFactor")}
          value={stats.profitFactor === Infinity ? "∞" : (stats.total > 0 ? stats.profitFactor.toFixed(2) : "—")}
        />
        <KpiCard
          label={t("accountsPage.expectancyTrade")}
          value={stats.total > 0 ? fmt(stats.expectancy, true) : "—"}
          tone={stats.expectancy > 0 ? "pos" : stats.expectancy < 0 ? "neg" : undefined}
        />
        <KpiCard
          label={t("accountsPage.maxDrawdown")}
          value={stats.maxDD > 0 ? `-${fmtNoCents(stats.maxDD)}` : "—"}
          tone={stats.maxDD > 0 ? "neg" : undefined}
        />
        <KpiCard
          label={t("accountsPage.avgWinLoss")}
          value={stats.total > 0 ? `${fmtNoCents(stats.avgWin)} / -${fmtNoCents(stats.avgLoss)}` : "—"}
        />
      </div>

      {/* ================= TRADES ================= */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionTitle
          action={
            !isArchivedView && account ? (
              <SectionAction
                onClick={() => {
                  setSelectedAccountIds?.([account.id]);
                  try { localStorage.setItem("selectedAccountIds", JSON.stringify([account.id])); } catch {}
                  setPage?.("trades");
                }}
              >
                Voir plus
              </SectionAction>
            ) : null
          }
        >
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
            <span>Trades</span>
            <span style={{ fontSize: 20, fontWeight: 400, color: T.text, opacity: 0.4 }}>{stats.total}</span>
          </span>
        </SectionTitle>

        <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* En-tête de colonnes */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", opacity: 0.4 }}>
            <div style={{ flex: "1 0 0", minWidth: 0 }}><span style={TH}>Actif</span></div>
            <div style={{ width: 133, flexShrink: 0 }}><span style={TH}>type</span></div>
            <div style={{ width: 100, flexShrink: 0 }}><span style={TH}>Date</span></div>
            <div style={{ width: 117, flexShrink: 0, textAlign: "right" }}><span style={TH}>P&amp;L</span></div>
          </div>

          {/* Lignes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentTrades.length === 0 ? (
              <div style={{ fontSize: 14, color: T.textMut, padding: "12px 8px" }}>Aucun trade sur ce compte.</div>
            ) : recentTrades.map((tr, i) => {
              const d = new Date(tr.date);
              const dateLabel = isNaN(d.getTime())
                ? String(tr.date || "")
                : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
              // % = part de ce trade dans le P&L total du compte.
              const pct = stats.pnl !== 0 ? Math.abs(((tr.pnl || 0) / stats.pnl) * 100) : 0;
              const { name, code } = symbolLabel(tr.symbol);
              return (
                <div
                  key={tr.id || i}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: 12, borderRadius: 12, background: "transparent",
                    transition: "background 140ms ease",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.rowHighlight; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ flex: "1 0 0", minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <SymbolBadge symbol={tr.symbol} />
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 500, lineHeight: "17.05px", color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </span>
                      {code && (
                        <span style={{ fontSize: 12, lineHeight: "13.95px", color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {code}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ width: 133, flexShrink: 0, display: "flex", alignItems: "center" }}>
                    <DirectionTag direction={tr.direction} />
                  </div>
                  <div style={{ width: 100, flexShrink: 0, fontSize: 16, fontWeight: 500, lineHeight: "17.05px", color: T.text }}>
                    {dateLabel}
                  </div>
                  <div style={{ width: 117, flexShrink: 0 }}>
                    <StackedAmount value={tr.pnl || 0} percent={pct} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= STATISTIQUES ================= */}
      <StatsSection
        stats={stats}
        capital={capital}
        balance={balance}
        expanded={statsExpanded}
        onToggle={() => setStatsExpanded(v => !v)}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Graphique multi-séries (maquette : courbe du compte en avant-plan avec une
   trame de points sous la courbe, autres comptes en lignes fines derrière).
   On dessine à l'échelle 1:1 : le viewBox reprend la largeur réellement
   mesurée, sinon la trame de points serait écrasée en ellipses.
   ------------------------------------------------------------------------- */
function PnlChart({ points, others, color }) {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(1160);
  const [hover, setHover] = React.useState(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Géométrie relevée sur la maquette.
  const H = 358, W = width;
  const topY = 30, plotBottom = 340;
  const plotH = plotBottom - topY;

  if (!points || points.length < 2) {
    return (
      <div ref={ref} style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: T.text, opacity: 0.4 }}>
        Pas assez de données pour tracer la courbe.
      </div>
    );
  }

  const t0 = msOf(points[0].date);
  const t1 = msOf(points[points.length - 1].date);
  const tSpan = (t1 - t0) || 1;
  const xFor = (date) => ((msOf(date) - t0) / tSpan) * W;

  // Les autres comptes sont recadrés sur la même fenêtre temporelle.
  const otherClipped = (others || [])
    .map(s => ({ ...s, points: s.points.filter(p => msOf(p.date) >= t0 && msOf(p.date) <= t1) }))
    .filter(s => s.points.length > 1);

  const values = points.map(p => p.cum);
  otherClipped.forEach(s => s.points.forEach(p => values.push(p.cum)));
  const yMax = Math.max(...values);
  const yMin = Math.min(...values);
  const ySpan = (yMax - yMin) || 1;
  const yFor = (v) => plotBottom - ((v - yMin) / ySpan) * plotH;

  // Couleur d'identité du compte : la maquette montre le compte XTB en rouge
  // ici ET sur sa carte de la liste. La couleur suit le compte, pas le P&L.
  const lineColor = color || T.kraken;
  const coords = points.map(p => [xFor(p.date), yFor(p.cum)]);
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c[0].toFixed(2)} ${c[1].toFixed(2)}`).join(" ");
  // Aire fermée sous la courbe : c'est elle qui porte la trame de points.
  const areaD = `${pathD} L ${coords[coords.length - 1][0].toFixed(2)} ${H} L ${coords[0][0].toFixed(2)} ${H} Z`;

  const fmtTick = (v) => {
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${sign}${Math.round(abs)}`;
  };
  const ticks = [0, 1, 2, 3].map(i => {
    const ratio = i / 3;
    return { value: yMax - ratio * ySpan, top: 16 + ratio * (348 - 16) };
  });

  // 5 repères de date répartis sur la fenêtre affichée.
  const xLabels = [0, 1, 2, 3, 4].map(i => {
    const idx = Math.round((i / 4) * (points.length - 1));
    const d = new Date(points[idx]?.date || "");
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).toUpperCase();
  });

  const cellW = W / Math.max(points.length - 1, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      <div
        ref={ref}
        style={{ position: "relative", width: "100%", height: H }}
        onMouseLeave={() => setHover(null)}
      >
        {/* 4 séparateurs verticaux à 10 % */}
        <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "space-between", opacity: 0.10, pointerEvents: "none" }}>
          {[0, 1, 2, 3].map(i => (
            <span key={i} style={{ width: 1, height: "100%", background: T.text, display: "block" }} />
          ))}
        </div>

        {/* Repères de valeur — libellés seuls, alignés à droite, sans trait */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {ticks.map((tk, i) => (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: tk.top }}>
              <span style={{ display: "block", fontSize: 14, color: T.text, opacity: 0.4, textAlign: "right", lineHeight: 1 }}>
                {fmtTick(tk.value)}
              </span>
            </div>
          ))}
        </div>

        <svg
          width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ display: "block", position: "absolute", inset: 0, overflow: "visible" }}
        >
          <defs>
            {/* Trame de la maquette : pas 11 px, cercle r=1 à 15 % */}
            <pattern id="acct-area-dots" width="11" height="11" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill={lineColor} fillOpacity="0.15" />
            </pattern>
          </defs>

          {/* Autres comptes — lignes fines en arrière-plan */}
          {otherClipped.map(s => {
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.date).toFixed(2)} ${yFor(p.cum).toFixed(2)}`)
              .join(" ");
            return (
              <path
                key={s.id}
                d={d}
                fill="none"
                stroke={s.color}
                strokeOpacity={SERIES_BG_OPACITY}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Compte affiché — aire tramée + trait épais */}
          <path d={areaD} fill="url(#acct-area-dots)" stroke="none" />
          <path
            d={pathD}
            stroke={lineColor}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {hover !== null && coords[hover] && (
            <line
              x1={coords[hover][0]} y1={topY}
              x2={coords[hover][0]} y2={plotBottom}
              stroke={lineColor} strokeWidth="1" strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke" pointerEvents="none"
            />
          )}

          {coords.map((c, i) => (
            <rect
              key={`hover-${i}`}
              x={c[0] - cellW / 2}
              y="0"
              width={cellW}
              height={H}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {hover !== null && points[hover] && (() => {
          const p = points[hover];
          const leftPct = (coords[hover][0] / W) * 100;
          const topPct = (coords[hover][1] / H) * 100;
          const flip = leftPct > 60;
          const d = new Date(p.date);
          const label = isNaN(d.getTime())
            ? p.date
            : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
          return (
            <div style={{
              position: "absolute",
              left: `${leftPct}%`,
              top: `${topPct}%`,
              transform: `translateY(-100%) translateY(-12px) ${flip ? "translateX(-100%) translateX(-8px)" : "translateX(8px)"}`,
              background: T.white,
              borderRadius: 8,
              boxShadow: T.elevCard,
              padding: "8px 10px",
              pointerEvents: "none",
              zIndex: 20,
              whiteSpace: "nowrap",
              fontFamily: "var(--font-sans)",
            }}>
              <div style={{ fontSize: 12, color: T.textSub, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: p.cum > 0 ? T.pnlPos : p.cum < 0 ? T.pnlNeg : T.text }}>
                {p.cum > 0 ? "+" : ""}{fmt(p.cum, false)}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Axe des dates */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", fontSize: 14, color: T.text }}>
        {xLabels.map((l, i) => (
          <span key={i} style={{ opacity: 0.4, whiteSpace: "nowrap" }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Statistiques : 3 cartes de listes « libellé → valeur ». La maquette n'en
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
        { label: t("accountsPage.winRateL"), value: stats.total > 0 ? `${stats.winRate.toFixed(1)}%` : "—" },
        { label: t("accountsPage.maxWinStreakL"), value: String(stats.maxWinStreak) },
        { label: t("accountsPage.maxLossStreakL"), value: String(stats.maxLossStreak) },
        { label: t("accountsPage.totalExecsL"), value: String(stats.totalExecutions) },
        { label: t("accountsPage.avgTradeVolume"), value: stats.avgTradeVolume ? num(stats.avgTradeVolume, 1) : "—" },
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
        { label: t("accountsPage.avgTradePnl"), value: stats.total > 0 ? money(stats.avgTradePnL) : "—" },
        { label: t("accountsPage.avgWinner"), value: stats.wins ? money(stats.avgWin) : "—" },
        { label: t("accountsPage.avgLoser"), value: stats.losses ? `-${fmt(stats.avgLoss)}` : "—" },
        { label: t("accountsPage.profitFactor"), value: stats.profitFactor === Infinity ? "∞" : (stats.total > 0 ? num(stats.profitFactor) : "—") },
        { label: t("accountsPage.expectancyL"), value: stats.total > 0 ? money(stats.expectancy) : "—" },
        { label: t("accountsPage.expectancyRatioL"), value: stats.expectancyRatio > 0 ? num(stats.expectancyRatio) : "—" },
        { label: t("accountsPage.totalFees"), value: money(stats.totalFees) },
        { label: t("accountsPage.pnlStdDevL"), value: stats.pnlStdDev > 0 ? money(stats.pnlStdDev) : "—" },
      ],
    },
    {
      title: "Sessions",
      rows: [
        { label: t("accountsPage.totalDaysL"), value: String(stats.tradingDays) },
        { label: t("accountsPage.winDays"), value: String(stats.winDays) },
        { label: t("accountsPage.loseDays"), value: String(stats.loseDays) },
        { label: t("accountsPage.maxDrawdown"), value: stats.maxDD > 0 ? `-${fmtNoCents(stats.maxDD)}` : "—" },
        { label: t("accountsPage.avgDailyPnL"), value: stats.tradingDays ? money(stats.avgDailyPnL) : "—" },
        { label: t("accountsPage.avgWinDayPnL"), value: stats.winDays ? money(stats.avgWinDayPnL) : "—" },
        { label: t("accountsPage.avgLoseDayPnL"), value: stats.loseDays ? money(stats.avgLoseDayPnL) : "—" },
        { label: t("accountsPage.avgDailyVolume"), value: stats.tradingDays ? num(stats.avgDailyVolume, 1) : "—" },
        { label: t("accountsPage.avgHoldWin"), value: mins(stats.avgHoldWinMin) },
        { label: t("accountsPage.avgHoldLoss"), value: mins(stats.avgHoldLossMin) },
        { label: t("accountsPage.sqn"), value: stats.pnlStdDev > 0 ? num(stats.sqn) : "—" },
        { label: t("accountsPage.kRatio"), value: stats.curve.length > 2 ? num(stats.kRatio) : "—" },
      ],
    },
  ];

  // Capital connu → on l'expose plutôt que de le perdre (absent de la maquette).
  if (capital !== null) {
    groups[1].rows.splice(1, 0, { label: "Capital", value: fmtNoCents(capital) });
  }

  const VISIBLE = 4;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionTitle
        action={<SectionAction onClick={onToggle}>{expanded ? "Voir moins" : "Voir plus"}</SectionAction>}
      >
        Statistiques
      </SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "stretch" }}>
        {groups.map(g => (
          <div key={g.title} style={{ ...CARD, display: "flex", flexDirection: "column", gap: 24 }}>
            <span style={{ fontSize: 20, fontWeight: 500, lineHeight: "26.35px", color: T.text }}>{g.title}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(expanded ? g.rows : g.rows.slice(0, VISIBLE)).map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 14, color: T.text, opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.label}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.15, color: T.text, whiteSpace: "nowrap" }}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
