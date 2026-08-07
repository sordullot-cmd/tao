"use client";

import React, { useState } from "react";
import { T } from "@/lib/ui/tokens";
import { NavArrow, NavLabel } from "@/components/ui/DateNav";
import { t, useLang } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/userPrefs";

export default function CalendarPage({ trades = [], accountType = "live", evalAccountSize = "25k", accounts = [], selectedAccountIds = [], setPage }) {
  useLang();
  // Le site n'a plus de filtre de dates : le clic sur un jour ouvre simplement
  // la page Trades, qui liste tout l'historique.
  const goToTradesForDate = () => {
    if (typeof setPage === "function") setPage("trades");
  };
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState(new Date().getMonth());

  // Objetifs par taille de compte (paliers prop firms)
  const evalObjectives = {
    "25k": 1500,
    "50k": 3000,
    "100k": 6000,
    "150k": 9000,
    "250k": 15000,
  };

  // Convertit n'importe quelle taille (ex. "50k", "10000") en montant USD,
  // puis dérive l'objectif (paliers connus, sinon 6% du capital comme défaut).
  const parseSizeToUsd = (size) => {
    if (size == null) return null;
    const m = String(size).match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
    if (!m) return null;
    const num = parseFloat(m[1]);
    const unit = (m[2] || "").toLowerCase();
    if (unit === "k") return num * 1000;
    if (unit === "m") return num * 1000000;
    return num;
  };
  const objectiveForSize = (size) => {
    if (!size) return 0;
    if (evalObjectives[String(size).toLowerCase()] != null) return evalObjectives[String(size).toLowerCase()];
    const usd = parseSizeToUsd(size);
    return usd ? Math.round(usd * 0.06) : 0;
  };

  // Cumul des objectifs : uniquement sur les comptes Eval sélectionnés.
  // Les comptes funded/live/demo ne contribuent ni à la cible ni au PnL
  // affiché dans la barre de progression — ils ont leurs propres règles.
  const evalAccountsSelected = (accounts || []).filter(
    a => selectedAccountIds.includes(a.id) && a.account_type === "eval"
  );
  const evalAccountIds = new Set(evalAccountsSelected.map(a => a.id));
  const cumulativeObjective = (() => {
    if (evalAccountsSelected.length > 0) {
      return evalAccountsSelected.reduce((s, a) => s + objectiveForSize(a.eval_account_size), 0);
    }
    // Fallback : ancien comportement (compte unique avec taille passée en prop)
    return objectiveForSize(evalAccountSize);
  })();
  const cumulativeLabel = (() => {
    if (evalAccountsSelected.length > 1) return t("accounts.multiple").replace("{n}", String(evalAccountsSelected.length));
    if (evalAccountsSelected.length === 1) return `EVAL ${getCurrencySymbol()}${String(evalAccountsSelected[0].eval_account_size || "").toUpperCase()}`;
    return `EVAL ${getCurrencySymbol()}${String(evalAccountSize).toUpperCase()}`;
  })();
  // PnL cumulé restreint aux comptes eval — sert UNIQUEMENT à la barre
  // d'avancement de la cible. Le reste de la page (calendrier mois,
  // monthPnL des cellules) continue d'utiliser totalPnL/all trades.
  const evalCumulativePnL = (trades || [])
    .filter(tr => evalAccountIds.size === 0 || evalAccountIds.has(tr.account_id))
    .reduce((s, tr) => s + (tr.pnl || 0), 0);

  const pnlByDate = {};
  const tradesByDate = {};

  trades.forEach(tr => {
    if (!tr.date) return;
    try {
      const dateStr = String(tr.date).trim();
      const parts = dateStr.split('T')[0].split('-');

      if (parts.length === 3) {
        const tradeYear = parseInt(parts[0]);
        const tradeMonth = parseInt(parts[1]);
        const tradeDay = parseInt(parts[2]);

        const key = `${tradeYear}-${String(tradeMonth).padStart(2, '0')}-${String(tradeDay).padStart(2, '0')}`;

        if (!pnlByDate[key]) pnlByDate[key] = 0;
        pnlByDate[key] += (tr.pnl || 0);
        if (!tradesByDate[key]) tradesByDate[key] = [];
        tradesByDate[key].push(tr);
      }
    } catch (e) {
      console.error('Date parse error:', tr.date, e);
    }
  });

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const renderMonth = (monthIdx) => {
    const firstDay = new Date(year, monthIdx, 1).getDay();
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const cells = [];

    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < adjustedFirstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length < 42) cells.push(null);

    return (
      <div key={monthIdx} style={{ background: expandedMonth === monthIdx ? "var(--color-hover-bg, #FAFAFA)" : T.white, padding: "16px 18px", cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background .12s ease", height: "100%", boxSizing: "border-box" }} onClick={() => {
        if (expandedMonth === monthIdx) {
          setExpandedMonth(null);
        } else {
          setExpandedMonth(monthIdx);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: T.text, letterSpacing: -0.1, textAlign: "center" }}>{months[monthIdx]}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {dayLabels.map(d => (
            <div key={d} style={{ fontSize: 10, fontWeight: 500, textAlign: "center", color: T.textMut, paddingBottom: 4 }}>
              {d}
            </div>
          ))}

          {cells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} style={{ aspectRatio: "1 / 1" }} />;

            const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const pnl = pnlByDate[dateStr] || 0;

            let bg = "transparent";
            let textColor = T.textMut;

            if (pnl > 0) {
              bg = "rgba(16, 163, 127, 0.18)";
              textColor = T.green;
            } else if (pnl < 0) {
              bg = "rgba(239, 68, 68, 0.18)";
              textColor = T.red;
            }

            return (
              <div key={day} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                aspectRatio: "1 / 1",
                background: bg,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: pnl !== 0 ? 600 : 400,
                color: pnl !== 0 ? textColor : T.textMut,
                transition: "background .12s ease",
              }}>
                {String(day).padStart(2, '0')}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMonthDetail = () => {
    if (expandedMonth === null) return null;

    const monthIdx = expandedMonth;
    const monthName = months[monthIdx];
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const monthStart = new Date(year, monthIdx, 1);

    const monthTrades = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (tradesByDate[dateStr]) {
        monthTrades.push(...tradesByDate[dateStr].map(tr => ({ ...tr, date: dateStr })));
      }
    }

    const monthPnL = monthTrades.reduce((s, tr) => s + (tr.pnl || 0), 0);
    const totalPnL = trades.reduce((s, tr) => s + (tr.pnl || 0), 0);

    const dayStats = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayTrades = tradesByDate[dateStr] || [];
      const dayPnL = dayTrades.reduce((s, tr) => s + (tr.pnl || 0), 0);
      dayStats[d] = {
        day: d,
        pnl: dayPnL,
        trades: dayTrades.length,
      };
    }

    const dayLabelsLong = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const firstDay = monthStart.getDay();
    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

    const prevMonthDaysInMonth = new Date(year, monthIdx, 0).getDate();
    const prevMonthDays = [];
    for (let i = 1; i <= adjustedFirstDay; i++) {
      prevMonthDays.push(-(prevMonthDaysInMonth - adjustedFirstDay + i));
    }

    const weeks = [];
    let currentWeek = [...prevMonthDays];

    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push(d);
      if (currentWeek.length === 7 || d === daysInMonth) {
        while (currentWeek.length < 7) {
          currentWeek.push(null);
        }
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    return (
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{monthName}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontSize: 26, fontWeight: 600, color: T.text, letterSpacing: -0.4, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {monthPnL >= 0 ? "+" : ""}{getCurrencySymbol()}{monthPnL.toFixed(2)}
              </div>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 11, fontWeight: 600,
                padding: "2px 8px", borderRadius: 999,
                color: monthPnL >= 0 ? T.green : T.red,
                background: monthPnL >= 0 ? (T.greenBg || "#ECFDF5") : (T.redBg || "#FEF2F2"),
                border: `1px solid ${monthPnL >= 0 ? (T.greenBd || "#A7F3D0") : (T.redBd || "#FECACA")}`,
              }}>
                {monthPnL >= 0 ? "▲" : "▼"} P&L
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {cumulativeObjective > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160, alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: T.textMut, marginBottom: 4 }}>{cumulativeLabel}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: evalCumulativePnL >= cumulativeObjective ? T.green : T.text, fontVariantNumeric: "tabular-nums" }}>
                    {getCurrencySymbol()}{evalCumulativePnL.toFixed(2)} / {getCurrencySymbol()}{cumulativeObjective.toLocaleString("en-US")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                  <div style={{ flex: 1, height: 6, background: T.border, borderRadius: "var(--radius-field)", overflow: "hidden", minWidth: 100 }}>
                    <div style={{ height: "100%", background: evalCumulativePnL >= cumulativeObjective ? T.green : "#8E8E8E", width: `${Math.min(100, (evalCumulativePnL / cumulativeObjective) * 100)}%`, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: T.textMut, minWidth: 35, textAlign: "right" }}>{((evalCumulativePnL / cumulativeObjective) * 100).toFixed(0)}%</div>
                </div>
              </div>
            )}
            <button onClick={() => setExpandedMonth(null)} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: T.textMut, flexShrink: 0 }}>✕</button>
          </div>
        </div>

        <div className="tr4de-table-wrap" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", fontFamily: "var(--font-sans)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {dayLabelsLong.map((day) => (
                  <th key={day} style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: T.textMut, width: "12.5%", fontSize: 11 }}>
                    {day}
                  </th>
                ))}
                <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: T.textMut, width: "12.5%", fontSize: 11 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, weekIdx) => {
                const weekPnL = week.reduce((sum, d) => sum + (d && d > 0 && dayStats[d] ? dayStats[d].pnl : 0), 0);
                const weekTrades = week.reduce((sum, d) => sum + (d && d > 0 && dayStats[d] ? dayStats[d].trades : 0), 0);

                return (
                  <tr key={weekIdx} style={{ borderBottom: `1px solid ${T.border}`, height: 88 }}>
                    {week.map((day, dayIdx) => {
                      const cellBorder = `1px solid ${T.border}`;
                      if (day === null) {
                        return <td key={`empty-${dayIdx}`} style={{ padding: "10px 12px", background: "transparent", verticalAlign: "top", borderRight: cellBorder }} />;
                      }

                      if (day < 0) {
                        const prevDay = Math.abs(day);
                        return (
                          <td key={`prev-${dayIdx}`} style={{ padding: "10px 12px", background: T.white, verticalAlign: "top", opacity: 0.35, borderRight: cellBorder }}>
                            <div style={{ fontWeight: 500, color: T.textMut, fontSize: 13 }}>{String(prevDay).padStart(2, '0')}</div>
                          </td>
                        );
                      }

                      const stats = dayStats[day];
                      const pnl = stats.pnl;
                      const tradesCount = stats.trades;
                      let bg = T.white;
                      const textColor = T.text;
                      let valueColor = T.textMut;

                      if (pnl > 0) {
                        bg = "rgba(16, 163, 127, 0.03)";
                        valueColor = T.green;
                      } else if (pnl < 0) {
                        bg = "rgba(239, 68, 68, 0.03)";
                        valueColor = T.red;
                      }

                      const dayIso = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const clickable = tradesCount > 0;
                      return (
                        <td key={day}
                          onClick={(e) => {
                            if (!clickable) return;
                            e.stopPropagation();
                            goToTradesForDate(dayIso);
                          }}
                          role={clickable ? "button" : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          aria-label={clickable ? `Trades du ${dayIso}, P&L ${pnl >= 0 ? "+" : ""}${getCurrencySymbol()}${pnl.toFixed(0)}` : undefined}
                          onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToTradesForDate(dayIso); } } : undefined}
                          title={clickable ? t("cal.viewDayTrades") : undefined}
                          style={{
                            padding: "10px 12px", background: bg,
                            verticalAlign: "top", textAlign: "left",
                            borderRight: cellBorder,
                            cursor: clickable ? "pointer" : "default",
                            transition: "background .12s ease",
                          }}
                          onMouseEnter={clickable ? (e) => { e.currentTarget.style.background = "var(--color-hover-bg, #F0F0F0)"; } : undefined}
                          onMouseLeave={clickable ? (e) => { e.currentTarget.style.background = bg; } : undefined}
                        >
                          <div style={{ fontWeight: 500, color: textColor, fontSize: 13, marginBottom: 6 }}>{String(day).padStart(2, '0')}</div>
                          <div style={{ color: tradesCount > 0 ? valueColor : T.textMut, fontWeight: 400, fontSize: 12, marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>
                            {tradesCount > 0 ? `${pnl >= 0 ? "+" : ""}${getCurrencySymbol()}${pnl.toFixed(0)}` : `${getCurrencySymbol()}0`}
                          </div>
                          <div style={{ color: T.textMut, fontSize: 10, fontWeight: 500 }}>{tradesCount} trade{tradesCount !== 1 ? "s" : ""}</div>
                        </td>
                      );
                    })}
                    <td style={{ padding: "10px 12px", background: T.white, verticalAlign: "top", textAlign: "left", borderLeft: `1px solid ${T.border}` }}>
                      <div style={{ fontWeight: 400, color: T.text, fontSize: 13, marginBottom: 6 }}>{t("cal.weekN").replace("{n}", String(weekIdx + 1))}</div>
                      <div style={{ color: weekPnL >= 0 ? T.green : weekPnL < 0 ? T.red : T.textMut, fontWeight: 400, fontSize: 12, marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>
                        {weekPnL >= 0 ? "+" : ""}{getCurrencySymbol()}{weekPnL.toFixed(0)}
                      </div>
                      <div style={{ color: T.textMut, fontSize: 10, fontWeight: 500 }}>{weekTrades} trade{weekTrades !== 1 ? "s" : ""}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "none" }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div id="tr4de-page-header-slot" style={{ marginLeft: "auto" }} />
      </div>
      {renderMonthDetail()}

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, fontFamily: "var(--font-sans)" }}>
        <NavArrow direction="left" onClick={() => setYear(year - 1)} title={t("cal.prevYear")} />
        <NavLabel>{year}</NavLabel>
        <NavArrow direction="right" onClick={() => setYear(year + 1)} title={t("cal.nextYear")} />
      </div>

      {trades.length === 0 && (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 8 }}>{t("cal.noTradesImported")}</div>
          <p style={{ color: T.textSub }}>{t("cal.noTradesImportedSub")}</p>
        </div>
      )}

      <div className="tr4de-cal-year-grid" style={{
        background: T.white,
        border: `1px solid ${T.border}`,
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "repeat(3,1fr)",
        gap: 0,
      }}>
        {[...Array(12)].map((_, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          return (
            <div key={i} style={{
              borderRight: col < 2 ? `1px solid ${T.border}` : "none",
              borderBottom: row < 3 ? `1px solid ${T.border}` : "none",
            }}>
              {renderMonth(i)}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 24, fontSize: 12, padding: 16, background: T.white, borderRadius: "var(--radius-card)", border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: "var(--radius-field)", background: T.greenBg, border: `2px solid ${T.green}` }} />
          <span style={{ color: T.textSub }}>{t("cal.legendPositive")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: "var(--radius-field)", background: T.redBg, border: `2px solid ${T.red}` }} />
          <span style={{ color: T.textSub }}>{t("cal.legendNegative")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: "var(--radius-field)", background: T.border }} />
          <span style={{ color: T.textSub }}>{t("cal.legendEmpty").replace("{n}", String(trades.length))}</span>
        </div>
      </div>
    </div>
  );
}
