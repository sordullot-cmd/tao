"use client";

import React from "react";
import { Download, BookOpen } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { fmt } from "@/lib/ui/format";
import { rMultiple, fmtR, getCurrencySymbol } from "@/lib/userPrefs";
import { computeTradeNote } from "@/lib/tradeNote";
import { useTradeNotes } from "@/lib/hooks/useTradeNotes";
import { useDailySessionNotes } from "@/lib/hooks/useDailySessionNotes";
import { exportJournalPdf } from "@/lib/export/journalPdf";
import DictatableTextarea from "@/components/MicDictateButton";
import TradesPage from "@/components/pages/TradesPage";

export default function JournalPage({ trades = [], strategies = [], onImportClick, onDeleteTrade, onClearTrades }) {
  useLang();
  const { notes: tradeNotes } = useTradeNotes();
  const { notes: dailyNotes, setNote: updateDailyNote } = useDailySessionNotes();

  const noteColor = (s) => (s >= 7 ? T.green : s >= 4 ? T.amber : T.red);
  const fmtTime = (v) => {
    if (!v) return "—";
    if (/^\d{1,2}:\d{2}/.test(String(v))) return String(v).slice(0, 5);
    const d = new Date(v);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  // Regrouper les trades par jour
  const tradesByDate = {};
  trades.forEach((tr) => {
    try {
      const d = new Date(tr.date);
      if (isNaN(d.getTime())) return;
      const dateStr = d.toISOString().split("T")[0];
      if (!tradesByDate[dateStr]) tradesByDate[dateStr] = [];
      tradesByDate[dateStr].push(tr);
    } catch (e) {}
  });
  const sortedDates = Object.keys(tradesByDate).sort().reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
          type="button"
          aria-label={t("journal.exportAria")}
          disabled={trades.length === 0}
          onClick={() => exportJournalPdf({ trades, dailyNotes, tradeNotes, currencySymbol: getCurrencySymbol(), title: t("journal.title") })}
          style={{
            marginLeft: "auto", padding: "7px 16px", height: 34, borderRadius: 999,
            background: trades.length === 0 ? T.bg : T.text,
            border: `1px solid ${trades.length === 0 ? T.border : T.text}`,
            color: trades.length === 0 ? T.textMut : "#fff",
            fontSize: 13, fontWeight: 600, cursor: trades.length === 0 ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit",
          }}
        >
          <Download size={14} strokeWidth={1.75} /> {t("journal.exportPdf")}
        </button>
        <div id="tr4de-page-header-slot" />
      </div>

      {sortedDates.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {sortedDates.map((dateStr) => {
            const dayTrades = tradesByDate[dateStr].slice().sort((a, b) => {
              const ta = fmtTime(a.entryTime || a.entry_time);
              const tb = fmtTime(b.entryTime || b.entry_time);
              return ta.localeCompare(tb);
            });
            const dateObj = new Date(dateStr + "T00:00:00");
            const dateLabel = dateObj.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

            const dayVolume = dayTrades.length;
            const dayWins = dayTrades.filter((tr) => tr.pnl > 0).length;
            const dayWinRate = dayVolume > 0 ? ((dayWins / dayVolume) * 100).toFixed(0) : 0;
            const dayPnL = dayTrades.reduce((sum, tr) => sum + (tr.pnl || 0), 0);

            const dayNoteScores = dayTrades.map(computeTradeNote).filter(Boolean).map((n) => n.score);
            const avgNote = dayNoteScores.length ? Math.round(dayNoteScores.reduce((a, b) => a + b, 0) / dayNoteScores.length) : null;
            const dayR = dayTrades.reduce((s, tr) => { const r = rMultiple(tr); return s + (Number.isFinite(r) ? r : 0); }, 0);


            // Sparkline P&L cumulé
            let cumulative = 0;
            const sparklineData = dayTrades.map((tr) => (cumulative += tr.pnl || 0));
            const w = 110, h = 36;
            const maxVal = Math.max(...sparklineData, 0);
            const minVal = Math.min(...sparklineData, 0);
            const range = Math.max(Math.abs(maxVal), Math.abs(minVal)) || 1;
            const lastVal = sparklineData[sparklineData.length - 1] || 0;
            const zeroY = lastVal >= 0 ? h / 2 : 0;
            const points = sparklineData.map((val, i) => {
              const x = (i / (sparklineData.length - 1 || 1)) * w;
              const y = zeroY - (val / range) * (h / 2);
              return `${x},${y}`;
            }).join(" ");
            const sparkColor = lastVal >= 0 ? T.green : T.red;
            const fillBaseY = lastVal >= 0 ? zeroY : h;

            return (
              <div key={dateStr} className="tr4de-journal-row" style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                {/* CARTE DU JOUR (gauche) */}
                <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, width: 220, flexShrink: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, textTransform: "capitalize" }}>{dateLabel}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: dayPnL >= 0 ? T.green : T.red, fontFamily: "var(--font-sans)", marginTop: 4 }}>
                    {dayPnL >= 0 ? "+" : ""}{fmt(dayPnL)}
                  </div>
                  <div style={{ flex: 1, minHeight: 84, margin: "12px -4px 14px" }}>
                    {sparklineData.length > 0 && (
                      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "100%" }}>
                        <defs>
                          <linearGradient id={`jgrad-${dateStr}`} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={sparkColor} stopOpacity="0.45" />
                            <stop offset="100%" stopColor={sparkColor} stopOpacity="0.04" />
                          </linearGradient>
                        </defs>
                        <path d={`M ${points.split(" ")[0]} L ${points} L ${w},${fillBaseY} L 0,${fillBaseY} Z`} fill={`url(#jgrad-${dateStr})`} />
                        <polyline points={points} fill="none" stroke={sparkColor} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
                      </svg>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 8px", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Trades</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{dayVolume}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Win</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{dayWinRate}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>R total</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: dayR >= 0 ? T.green : T.red, fontFamily: "var(--font-sans)" }}>{fmtR(dayR)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Note</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: avgNote != null ? noteColor(avgNote) : T.textMut }}>{avgNote != null ? `${avgNote}/10` : "—"}</div>
                    </div>
                  </div>
                </div>

                {/* COLONNE DROITE : notes + tableau */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                  <DictatableTextarea
                    placeholder={t("journal.dailyNotes")}
                    value={dailyNotes[dateStr] || ""}
                    onChange={(next) => updateDailyNote(dateStr, next)}
                    height={220}
                    micSize={32}
                    textareaStyle={{ border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: 14, fontSize: 13, color: T.text, background: T.white }}
                  />

                  {/* Tableau identique à la page Trades, borné à 2 lignes par
                      jour (clic = panneau "Trade info"), colonnes verrouillées. */}
                  <TradesPage
                    embedded
                    lockColumns
                    maxRows={3}
                    trades={dayTrades}
                    strategies={strategies}
                    onImportClick={onImportClick}
                    onDeleteTrade={onDeleteTrade}
                    onClearTrades={onClearTrades}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: "40px 40px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <div style={{ width: 48, height: 48, borderRadius: "var(--radius-card)", background: T.accentBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <BookOpen size={22} strokeWidth={1.75} color={T.text} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 6, letterSpacing: -0.1 }}>{t("journal.empty")}</div>
          <div style={{ fontSize: 13, color: T.textSub, maxWidth: 380, lineHeight: 1.5 }}>{t("journal.emptySub")}</div>
        </div>
      )}
    </div>
  );
}
