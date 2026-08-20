"use client";

import React, { useMemo, useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { fmt } from "@/lib/ui/format";
import { useApp } from "@/lib/contexts/AppContext";
import { backtest, compareBacktests } from "@/lib/backtest/engine";
import { AreaDotsDefs, areaDotsFill } from "@/components/ui/da";
import { Skeleton } from "@/components/ui/Skeleton";
import HoursHeatmap from "@/components/HoursHeatmap";
import EquityByAccount from "@/components/EquityByAccount";

/**
 * BacktestPage — analyse "what-if" sur les trades historiques.
 *
 * - Sélection multi-stratégies + plage de dates → equity curve filtrée
 * - Tableau comparatif : "Tout" vs chaque stratégie individuellement
 * - Stats : winrate, PF, max DD, sharpe, streaks, expectancy
 *
 * Les trades viennent de useApp(), les stratégies aussi. Le mapping
 * trade→strategy lit `tr4de_trade_strategies` (localStorage déjà sync
 * avec Supabase trade_strategies via DashboardNew).
 */

/** `firms` ne sert qu'aux couleurs du graphique d'équité : un compte doit y
 *  porter la teinte de sa prop firm, pas celle de sa plateforme d'exécution. */
export default function BacktestPage({ firms = [] }) {
  // tradesByAccount = trades filtrés par les comptes sélectionnés.
  // Si rien de sélectionné, on retombe sur les trades bruts (l'utilisateur
  // veut peut-être analyser tout l'historique sans contrainte de compte).
  const { trades: rawTrades, tradesByAccount, strategies, tradesLoading, selectedAccountIds, accounts } = useApp();
  const trades = selectedAccountIds.length > 0 ? tradesByAccount : rawTrades;

  const [selected, setSelected] = useState/** @type {string[]} */([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Charger le mapping tradeKey → strategyId (déjà persisté)
  const [tradeStrategies, setTradeStrategies] = useState/** @type {Record<string,string>} */({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tr4de_trade_strategies");
      if (raw) setTradeStrategies(JSON.parse(raw));
    } catch {}
    const onStorage = (e) => {
      if (e.key === "tr4de_trade_strategies") {
        try { setTradeStrategies(JSON.parse(e.newValue || "{}")); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Enrichir les trades avec strategyId
  const enriched = useMemo(() => {
    return (trades || []).map(tr => ({
      ...tr,
      strategyId: tradeStrategies[tradeKey(tr)] || null,
    }));
  }, [trades, tradeStrategies]);

  const filter = useMemo(() => ({
    strategyIds: selected.length > 0 ? selected : undefined,
    fromDate: from || undefined,
    toDate: to || undefined,
  }), [selected, from, to]);

  const result = useMemo(() => backtest(enriched, filter), [enriched, filter]);

  // Tableau comparatif : "Tout" + chaque stratégie utilisée
  const comparison = useMemo(() => {
    const usedStrategyIds = new Set();
    enriched.forEach(t => { if (t.strategyId) usedStrategyIds.add(t.strategyId); });
    const items = [{ label: "Tout", filter: {} }];
    strategies.forEach(s => {
      if (usedStrategyIds.has(String(s.id))) {
        items.push({ label: s.name || `Stratégie ${s.id}`, filter: { strategyIds: [String(s.id)] }, color: s.color });
      }
    });
    return compareBacktests(enriched, items).map((r, i) => ({ ...r, color: items[i].color }));
  }, [enriched, strategies]);

  const toggleStrategy = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: T.textMut }}>
          Analyse what-if sur trades historiques
        </span>
        <div id="tr4de-page-header-slot" style={{ marginLeft: "auto" }} />
      </div>

      {tradesLoading && (!trades || trades.length === 0) ? (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 }} aria-busy="true">
          <Skeleton width={140} height={14} />
          <Skeleton width="100%" height={220} radius={8} />
        </div>
      ) : (!trades || trades.length === 0) ? (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 8 }}>Aucun trade à analyser</div>
          <div style={{ fontSize: 13, color: T.textSub }}>
            Importe des trades pour activer le backtest.
          </div>
        </div>
      ) : (
        <>
          {/* Filtres */}
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Filtres
            </div>

            {/* Stratégies */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>Stratégies</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  aria-pressed={selected.length === 0}
                  style={pillStyle(selected.length === 0)}
                >
                  Toutes
                </button>
                {strategies.map(s => {
                  const active = selected.includes(String(s.id));
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleStrategy(String(s.id))}
                      aria-pressed={active}
                      style={pillStyle(active, s.color)}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color || T.textMut, display: "inline-block" }} />
                      {s.name || `Stratégie ${s.id}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <DateInput label="Du" value={from} onChange={setFrom} />
              <DateInput label="Au" value={to} onChange={setTo} />
              {(from || to) && (
                <button onClick={() => { setFrom(""); setTo(""); }} style={resetBtnStyle()}>Reset dates</button>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <KPI label="Trades" value={String(result.totalTrades)} sub={`${result.wins}W / ${result.losses}L`} />
            <KPI label="P&L total" value={fmt(result.totalPnL, true)} color={result.totalPnL >= 0 ? T.green : T.red} />
            <KPI label="Win rate" value={`${result.winRate}%`} sub={`Avg win ${fmt(result.avgWin)} / Avg loss ${fmt(result.avgLoss)}`} />
            <KPI label="Profit factor"
                 value={result.profitFactor === Infinity ? "∞" : result.profitFactor.toFixed(2)}
                 color={result.profitFactor === Infinity ? T.green : result.profitFactor >= 1.5 ? T.green : result.profitFactor >= 1 ? T.amber : T.red}
                 sub={`Expectancy ${fmt(result.expectancy, true)}`} />

            <KPI label="Max drawdown" value={fmt(result.maxDrawdown)} color={T.red}
                 sub={result.maxDrawdownPeakDate ? `${result.maxDrawdownPeakDate} → ${result.maxDrawdownTroughDate}` : "—"} />
            <KPI label="Sharpe" value={result.sharpeRatio.toFixed(2)}
                 color={result.sharpeRatio >= 1 ? T.green : result.sharpeRatio >= 0 ? T.amber : T.red}
                 sub="Annualisé" />
            <KPI label="Plus longue série gagnante" value={`${result.longestWinStreak}`}
                 sub="trades consécutifs" />
            <KPI label="Plus longue série perdante" value={`${result.longestLossStreak}`}
                 color={T.red} sub="trades consécutifs" />
          </div>

          {/* Equity curve */}
          <EquityCurve result={result} />

          {/* Comparaison stratégies */}
          {comparison.length > 1 && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600, color: T.text }}>
                Comparaison par stratégie
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                    <tr>
                      <Th>Stratégie</Th>
                      <Th align="right">Trades</Th>
                      <Th align="right">Win rate</Th>
                      <Th align="right">P&L</Th>
                      <Th align="right">PF</Th>
                      <Th align="right">Max DD</Th>
                      <Th align="right">Expectancy</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((c, i) => {
                      const r = c.result;
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 999, background: c.color || T.text }} />
                            <span style={{ fontWeight: 600 }}>{c.label}</span>
                          </td>
                          <Td align="right">{r.totalTrades}</Td>
                          <Td align="right">{r.winRate}%</Td>
                          <Td align="right" color={r.totalPnL >= 0 ? T.green : T.red}>{fmt(r.totalPnL, true)}</Td>
                          <Td align="right">{r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2)}</Td>
                          <Td align="right" color={T.red}>{fmt(r.maxDrawdown)}</Td>
                          <Td align="right" color={r.expectancy >= 0 ? T.green : T.red}>{fmt(r.expectancy, true)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Heatmap par heure */}
          <HoursHeatmap trades={result.trades} />

          {/* Equity par compte (utilise les trades bruts, indépendant des filtres) */}
          {accounts.length > 1 && (
            <EquityByAccount trades={rawTrades} accounts={accounts} firms={firms} />
          )}
        </>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function tradeKey(tr) {
  return `${tr.date}_${tr.symbol}_${tr.entry}`;
}

function KPI({ label, value, sub, color }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || T.text, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.textMut, marginTop: 4, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

function DateInput({ label, value, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: T.textMut, fontWeight: 600 }}>{label}</span>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: T.text, background: T.white, outline: "none" }} />
    </label>
  );
}

function pillStyle(active, color) {
  return {
    padding: "8px 16px", minHeight: 34, borderRadius: 999,
    border: `1px solid ${active ? T.text : T.border}`,
    background: active ? T.text : T.white,
    color: active ? "#fff" : T.text,
    fontSize: 11, fontWeight: 500, cursor: "pointer",
    fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", gap: 6,
  };
}

function resetBtnStyle() {
  return {
    padding: "6px 12px", borderRadius: 6,
    border: `1px solid ${T.border}`, background: T.white,
    color: T.textSub, fontSize: 11, fontWeight: 500, cursor: "pointer",
    fontFamily: "inherit",
  };
}

function Th({ children, align = "left" }) {
  return <th style={{ padding: "10px 14px", textAlign: align, fontSize: 10, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4 }}>{children}</th>;
}
function Td({ children, align = "left", color }) {
  return <td style={{ padding: "10px 14px", textAlign: align, fontSize: 12, color: color || T.text, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{children}</td>;
}

/* ── Equity curve (SVG) ────────────────────────────────────────────── */

function EquityCurve({ result }) {
  const { curve } = result;

  if (curve.length < 2) {
    return (
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, color: T.textMut, fontSize: 13, textAlign: "center" }}>
        Pas assez de données pour tracer une courbe (au moins 2 jours requis).
      </div>
    );
  }

  const W = 800;
  const H = 240;
  const pad = { l: 40, r: 16, t: 16, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const max = Math.max(...curve.map(p => p.cumPnL), 0);
  const min = Math.min(...curve.map(p => p.cumPnL), 0);
  const range = Math.max(Math.abs(max), Math.abs(min)) || 1;

  const x = (i) => pad.l + (i / (curve.length - 1)) * innerW;
  const y = (v) => pad.t + innerH / 2 - (v / range) * (innerH / 2);

  const points = curve.map((p, i) => `${x(i)},${y(p.cumPnL)}`).join(" ");
  const last = curve[curve.length - 1];
  const positive = last.cumPnL >= 0;

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Activity size={14} strokeWidth={1.75} color={T.textMut} />
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Courbe d&apos;équité</div>
        <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: positive ? T.green : T.red }}>
          {fmt(last.cumPnL, true)}
        </div>
      </div>
      {/* La courbe reprend le padding gauche de la carte pour toucher son bord,
          comme les graphiques posés sur le fond de page. À droite, la marge
          reste : les libellés de valeur y respirent. */}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: "block", marginLeft: -16, width: "calc(100% + 16px)" }}>
        {/* zero line */}
        <line x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} stroke={T.border} strokeWidth="1" />
        {/* Aire tramée — trame commune à tous les graphiques du site, aux
            couleurs de la courbe. */}
        <defs>
          <AreaDotsDefs
            id="eq" color={positive ? T.green : T.red}
            top={pad.t} bottom={H - pad.b} width={W} height={H}
          />
        </defs>
        <polyline
          points={`${pad.l},${y(0)} ${points} ${x(curve.length - 1)},${y(0)}`}
          {...areaDotsFill("eq")} stroke="none"
        />
        <polyline points={points} fill="none" stroke={positive ? T.green : T.red} strokeWidth="2" />
        {/* y-axis labels */}
        <text x={pad.l - 6} y={y(max)} textAnchor="end" fontSize="10" fill={T.textMut} alignmentBaseline="middle">{fmt(max, true)}</text>
        <text x={pad.l - 6} y={y(min)} textAnchor="end" fontSize="10" fill={T.textMut} alignmentBaseline="middle">{fmt(min, true)}</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", color: T.textMut, fontSize: 10, paddingLeft: pad.l, paddingRight: pad.r, marginTop: 4 }}>
        <span>{curve[0].date}</span>
        <span>{last.date}</span>
      </div>
    </div>
  );
}
