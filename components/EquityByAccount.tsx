"use client";

import React, { useMemo } from "react";
import { LineChart } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { fmt } from "@/lib/ui/format";
import { assignSeriesColors } from "@/lib/ui/brandColors";

/**
 * EquityByAccount — superpose les courbes d'équité de chaque compte
 * sur le même SVG. Permet de voir d'un coup d'œil quel compte est en
 * tête, quel compte est en drawdown, et leurs trajectoires comparées.
 *
 * Chaque courbe porte la couleur de la MAISON de son compte — sa prop firm ou
 * son broker (lib/ui/brandColors). Deux comptes de la même maison se
 * distinguent par les teintes secondaires de celle-ci ; la couleur de type
 * reste le repli quand la maison n'est pas au catalogue.
 */

interface MinimalTrade {
  date?: string;
  pnl?: number;
  account_id?: string;
}

interface AccountInfo {
  id: string;
  name: string;
  account_type?: string;
  /** Plateforme d'exécution — repli quand aucune maison n'est identifiable. */
  broker?: string;
  firm_id?: string | null;
}

interface FirmInfo {
  id: string;
  name?: string;
  platform?: string;
}

interface EquityByAccountProps {
  trades: MinimalTrade[];
  accounts: AccountInfo[];
  /** Prop firms, pour que chaque compte prenne la couleur de SA maison plutôt
   *  que celle de sa plateforme. Sans elles, tous les comptes d'un même broker
   *  sortent de la même couleur. */
  firms?: FirmInfo[];
}

interface Series {
  accountId: string;
  name: string;
  color: string;
  points: { date: string; cumPnL: number }[];
  totalPnL: number;
  trades: number;
}

export default function EquityByAccount({ trades, accounts, firms = [] }: EquityByAccountProps) {
  const series = useMemo<Series[]>(() => {
    const accountById = new Map(accounts.map(a => [a.id, a]));
    const firmById = new Map(firms.map(f => [f.id, f]));
    const byAccount = new Map<string, MinimalTrade[]>();

    for (const tr of trades) {
      const accId = tr.account_id || "(sans compte)";
      if (!byAccount.has(accId)) byAccount.set(accId, []);
      byAccount.get(accId)!.push(tr);
    }

    /* Couleurs attribuées en un seul passage : deux comptes de la même maison
       doivent recevoir des teintes différentes, ce qu'un appel indépendant par
       compte ne saurait pas faire. */
    const colorById = assignSeriesColors(
      [...byAccount.keys()].map((accId) => {
        const account = accountById.get(accId);
        return { id: accId, account, firm: account?.firm_id ? firmById.get(account.firm_id) : undefined };
      })
    );

    const result: Series[] = [];
    for (const [accId, accTrades] of byAccount) {
      // Group by day
      const byDay = new Map<string, number>();
      for (const t of accTrades) {
        if (!t.date) continue;
        const d = String(t.date).split("T")[0];
        byDay.set(d, (byDay.get(d) || 0) + (t.pnl || 0));
      }
      const days = Array.from(byDay.keys()).sort();
      const points: { date: string; cumPnL: number }[] = [];
      let cum = 0;
      for (const d of days) {
        cum += byDay.get(d) || 0;
        points.push({ date: d, cumPnL: Math.round(cum * 100) / 100 });
      }
      const total = accTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      result.push({
        accountId: accId,
        name: accountById.get(accId)?.name || "Compte inconnu",
        color: colorById.get(accId) || T.textSub,
        points,
        totalPnL: Math.round(total * 100) / 100,
        trades: accTrades.length,
      });
    }
    // Sort by total P&L desc
    result.sort((a, b) => b.totalPnL - a.totalPnL);
    return result;
  }, [trades, accounts, firms]);

  // Build a unified date range
  const allDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const p of s.points) set.add(p.date);
    return Array.from(set).sort();
  }, [series]);

  // For each series, build a value at each date (forward-fill last cum)
  const interpolated = useMemo(() => {
    return series.map(s => {
      const map = new Map(s.points.map(p => [p.date, p.cumPnL]));
      let last = 0;
      const values = allDates.map(d => {
        if (map.has(d)) {
          last = map.get(d)!;
        }
        return last;
      });
      return { ...s, values };
    });
  }, [series, allDates]);

  const W = 800;
  const H = 240;
  const pad = { l: 50, r: 16, t: 16, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const allValues = interpolated.flatMap(s => s.values);
  const max = Math.max(...allValues, 0);
  const min = Math.min(...allValues, 0);
  const range = Math.max(Math.abs(max), Math.abs(min)) || 1;

  const x = (i: number) => pad.l + (allDates.length > 1 ? (i / (allDates.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.t + innerH / 2 - (v / range) * (innerH / 2);

  const hasData = series.length > 0 && allDates.length >= 2;

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <LineChart size={16} strokeWidth={1.75} color={T.text} />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>
          Equity par compte
        </h3>
        <span style={{ fontSize: 11, color: T.textMut, marginLeft: "auto" }}>
          {series.length} compte{series.length > 1 ? "s" : ""}
        </span>
      </div>

      {!hasData ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: T.textMut, fontSize: 13 }}>
          Pas assez de trades pour comparer (au moins 2 jours requis).
        </div>
      ) : (
        <>
          {/* SVG */}
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {/* zero line */}
            <line x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} stroke={T.border} strokeWidth="1" />
            {/* y-axis labels */}
            <text x={pad.l - 6} y={y(max)} textAnchor="end" fontSize="10" fill={T.textMut} alignmentBaseline="middle">{fmt(max, true)}</text>
            <text x={pad.l - 6} y={y(min)} textAnchor="end" fontSize="10" fill={T.textMut} alignmentBaseline="middle">{fmt(min, true)}</text>
            <text x={pad.l - 6} y={y(0)} textAnchor="end" fontSize="10" fill={T.textMut} alignmentBaseline="middle">0</text>

            {/* Lines */}
            {interpolated.map(s => {
              const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
              return (
                <polyline
                  key={s.accountId}
                  points={points}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Legend */}
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 12 }}>
            {series.map(s => (
              <div key={s.accountId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ width: 12, height: 3, borderRadius: 2, background: s.color }} />
                <span style={{ fontWeight: 600, color: T.text }}>{s.name}</span>
                <span style={{ color: s.totalPnL >= 0 ? T.green : T.red, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(s.totalPnL, true)}
                </span>
                <span style={{ color: T.textMut }}>{s.trades}t</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
