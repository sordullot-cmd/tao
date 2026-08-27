"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { T } from "@/lib/ui/tokens";
import { FIELD } from "@/components/ui/form";
import { useApp } from "@/lib/contexts/AppContext";
import { SkeletonScreen, SkeletonChart, Skeleton, showSkeleton } from "@/components/ui/Skeleton";

/**
 * TradeChartPage — visualise un trade importé sur un graphique OHLC (Yahoo Finance).
 * MVP : sélectionne un trade → fetch bougies autour de entry/exit → markers entry/exit.
 */
export default function TradeChartPage({ trades = [] }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const markersRef = useRef(null);

  const sortedTrades = useMemo(() => {
    return [...(trades || [])].sort((a, b) => {
      const da = tradeTs(a, "entry") || 0;
      const db = tradeTs(b, "entry") || 0;
      return db - da;
    });
  }, [trades]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);

  const selected = sortedTrades[selectedIdx];

  // Init chart once
  useEffect(() => {
    let disposed = false;
    let ro;

    (async () => {
      if (!containerRef.current) return;
      const lw = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const chart = lw.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 480,
        layout: {
          background: { color: T.surface },
          textColor: T.textSub,
          fontFamily: "var(--font-sans)",
        },
        grid: {
          vertLines: { color: T.border },
          horzLines: { color: T.border },
        },
        rightPriceScale: { borderColor: T.border2 },
        timeScale: {
          borderColor: T.border2,
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: { mode: 1 },
      });

      const series = chart.addSeries(lw.CandlestickSeries, {
        upColor: T.green,
        downColor: T.red,
        borderUpColor: T.green,
        borderDownColor: T.red,
        wickUpColor: T.green,
        wickDownColor: T.red,
      });

      chartRef.current = chart;
      seriesRef.current = series;
      // Store lw so we can recreate markers
      chartRef.current.__lw = lw;

      ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
          });
        }
      });
      ro.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      if (ro) ro.disconnect();
      if (markersRef.current) {
        try { markersRef.current.detach(); } catch {}
        markersRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      seriesRef.current = null;
    };
  }, []);

  // Fetch + plot whenever selected trade changes
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    const entryTs = tradeTs(selected, "entry");
    const exitTs = tradeTs(selected, "exit") || entryTs + 60 * 60; // +1h fallback
    if (!entryTs) {
      setError("Trade sans horodatage exploitable");
      return;
    }

    const duration = Math.max(exitTs - entryTs, 60 * 15);
    const pad = Math.max(duration * 1.5, 60 * 60); // ≥1h padding
    const from = Math.floor(entryTs - pad);
    const to = Math.ceil(exitTs + pad);

    setLoading(true);
    setError("");
    setMeta(null);

    fetch(
      `/api/ohlc?symbol=${encodeURIComponent(selected.symbol)}&from=${from}&to=${to}`
    )
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        return j;
      })
      .then((data) => {
        if (cancelled) return;
        const candles = (data.candles || []).map((k) => ({
          time: k.time,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        }));
        if (!candles.length) {
          setError("Aucune bougie disponible pour cette période");
          seriesRef.current?.setData([]);
          if (markersRef.current) {
            try { markersRef.current.detach(); } catch {}
            markersRef.current = null;
          }
          return;
        }
        seriesRef.current?.setData(candles);

        const lw = chartRef.current?.__lw;
        if (lw && seriesRef.current) {
          const dir = String(selected.direction || "").toLowerCase();
          const isLong = dir.startsWith("l");
          const pnl = Number(selected.pnl) || 0;
          const exitColor = pnl >= 0 ? T.green : T.red;

          const markers = [
            {
              time: entryTs,
              position: isLong ? "belowBar" : "aboveBar",
              color: T.blue,
              shape: isLong ? "arrowUp" : "arrowDown",
              text: `Entry ${fmtPrice(selected.entry)}`,
            },
          ];
          if (selected.exit != null && exitTs) {
            markers.push({
              time: exitTs,
              position: isLong ? "aboveBar" : "belowBar",
              color: exitColor,
              shape: isLong ? "arrowDown" : "arrowUp",
              text: `Exit ${fmtPrice(selected.exit)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)})`,
            });
          }

          // v5: createSeriesMarkers primitive
          if (markersRef.current) {
            try { markersRef.current.setMarkers(markers); }
            catch {
              try { markersRef.current.detach(); } catch {}
              markersRef.current = lw.createSeriesMarkers(seriesRef.current, markers);
            }
          } else if (lw.createSeriesMarkers) {
            markersRef.current = lw.createSeriesMarkers(seriesRef.current, markers);
          } else if (seriesRef.current.setMarkers) {
            // fallback for older API
            seriesRef.current.setMarkers(markers);
          }
        }

        chartRef.current?.timeScale().fitContent();
        setMeta({
          interval: data.interval,
          symbol: data.symbol,
          count: candles.length,
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Erreur");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selected]);

  /* Le sélecteur de trade est vide tant que les trades n'ont pas atterri :
     on montrerait « aucun trade importé » à quelqu'un qui en a mille. */
  const { tradesLoading } = useApp();
  if (showSkeleton(tradesLoading && !sortedTrades.length)) {
    /* Chapô, sélecteur de trade, puis le cadre du graphique — bordure, rayon
       et 12 px de marge intérieure comme celui du dessous, pour que la surface
       ne se décale pas d'un pixel à l'arrivée des bougies. */
    return (
      <SkeletonScreen label="Loading" gap={16} style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Skeleton width={280} height={16} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Skeleton width={320} height={38} radius={8} />
          <Skeleton width={220} height={16} />
        </div>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", background: T.surface, padding: 12 }}>
          <SkeletonChart height={480} bars={28} />
        </div>
      </SkeletonScreen>
    );
  }

  if (!sortedTrades.length) {
    return (
      <div style={{ padding: 32, color: T.textSub }}>
        Aucun trade importé pour l’instant. Ajoute un trade pour le visualiser ici.
      </div>
    );
  }

  const pnl = Number(selected?.pnl) || 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: T.textMut, margin: "4px 0 0 0" }}>
          Bougies Yahoo Finance · markers d’entrée et de sortie
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <select
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          style={{ ...FIELD, cursor: "pointer", minWidth: 320, width: "auto" }}
        >
          {sortedTrades.map((tr, i) => (
            <option key={i} value={i}>
              {formatTradeLabel(tr)}
            </option>
          ))}
        </select>

        {selected && (
          <div
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              fontSize: 13,
              color: T.textSub,
            }}
          >
            <span>
              <strong style={{ color: T.text }}>{selected.symbol}</strong>{" "}
              {selected.direction}
            </span>
            <span>Entry {fmtPrice(selected.entry)}</span>
            {selected.exit != null && <span>Exit {fmtPrice(selected.exit)}</span>}
            <span style={{ color: pnl >= 0 ? T.green : T.red, fontWeight: 600 }}>
              {pnl >= 0 ? "+" : ""}
              {pnl.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          border: `1px solid ${T.border}`,
          borderRadius: "var(--radius-card)",
          background: T.surface,
          padding: 12,
          position: "relative",
        }}
      >
        <div ref={containerRef} style={{ width: "100%", height: 480 }} />
        {/* Le voile OPAQUE, et non translucide : sous lui il n'y a que le
            graphique du trade précédent, dont les prix n'ont plus rien à voir
            avec celui qu'on vient de choisir. Le laisser transparaître le
            ferait lire comme la réponse en cours d'arrivée. */}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 12,
              background: T.surface,
              borderRadius: "var(--radius-card)",
            }}
          >
            <SkeletonChart height={480} bars={24} />
          </div>
        )}
        {error && !loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: T.red,
              fontSize: 13,
              background: "color-mix(in srgb, var(--color-card-bg, #FFFFFF) 85%, transparent)",
              borderRadius: "var(--radius-card)",
              padding: 16,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {meta && (
        <div style={{ marginTop: 10, fontSize: 12, color: T.textMut }}>
          {meta.symbol} · intervalle {meta.interval} · {meta.count} bougies
        </div>
      )}
    </div>
  );
}

/* helpers */

function tradeTs(trade, kind) {
  if (!trade) return 0;
  const timeField = kind === "entry"
    ? (trade.entryTime || trade.entry_time)
    : (trade.exitTime || trade.exit_time);
  const dateField = trade.date || trade.entry_date;

  // ISO timestamp present
  if (timeField && typeof timeField === "string" && timeField.includes("T")) {
    const t = Date.parse(timeField);
    return isFinite(t) ? Math.floor(t / 1000) : 0;
  }
  // HH:MM + date
  if (dateField && timeField && /^\d{1,2}:\d{2}/.test(timeField)) {
    const t = Date.parse(`${String(dateField).slice(0, 10)}T${timeField}:00`);
    return isFinite(t) ? Math.floor(t / 1000) : 0;
  }
  // Date only (noon UTC to avoid TZ edge)
  if (dateField) {
    const t = Date.parse(`${String(dateField).slice(0, 10)}T12:00:00Z`);
    return isFinite(t) ? Math.floor(t / 1000) : 0;
  }
  return 0;
}

function fmtPrice(p) {
  const n = Number(p);
  if (!isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatTradeLabel(tr) {
  const d = String(tr.date || "").slice(0, 10);
  const pnl = Number(tr.pnl) || 0;
  const sign = pnl >= 0 ? "+" : "";
  return `${d} · ${tr.symbol} ${tr.direction || ""} · ${fmtPrice(tr.entry)}→${fmtPrice(tr.exit)} · ${sign}${pnl.toFixed(2)}`;
}
