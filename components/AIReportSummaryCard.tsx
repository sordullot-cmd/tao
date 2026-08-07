"use client";

import React, { useEffect, useState } from "react";
import { Bot, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { T as BaseT } from "@/lib/ui/tokens";

// `textMuted` est le seul alias local absent de BaseT (mappé sur textMut).
const T = { ...BaseT, textMuted: BaseT.textMut };

interface AIReport {
  id: string;
  report_type: "daily" | "weekly";
  period_start: string;
  period_end: string;
  title: string | null;
  content: string;
  stats: any;
  is_read: boolean;
  created_at: string;
}

interface AIReportSummaryCardProps {
  onOpenReports?: () => void;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffSec = (Date.now() - d.getTime()) / 1000;
  if (diffSec < 60) return "À l’instant";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return diffD === 1 ? "Il y a 1 jour" : `Il y a ${diffD} jours`;
  const diffW = Math.floor(diffD / 7);
  if (diffW < 5) return diffW === 1 ? "Il y a 1 semaine" : `Il y a ${diffW} semaines`;
  const diffM = Math.floor(diffD / 30);
  return diffM === 1 ? "Il y a 1 mois" : `Il y a ${diffM} mois`;
}

function firstParagraph(content: string): string {
  if (!content) return "";
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  // Ignore les titres markdown, prend la premiere vraie phrase
  const meaningful = lines.find((l) => !l.startsWith("#") && !l.startsWith("=") && !l.startsWith("—") && l.length > 10);
  return (meaningful || lines[0] || "").slice(0, 180);
}

export default function AIReportSummaryCard({ onOpenReports }: AIReportSummaryCardProps) {
  const [reports, setReports] = useState<AIReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/reports?limit=4", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setReports(data.reports || []);
      } catch (e) {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ fontFamily: "var(--font-sans)", padding: "4px 4px" }}>
      {/* Header: Rapport IA + Voir tout */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text, margin: 0, letterSpacing: -0.1 }}>Rapport IA</h3>
        {onOpenReports && (
          <button
            onClick={onOpenReports}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 8px", borderRadius: 6, border: "none",
              background: "transparent", color: T.textSub, fontSize: 12, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Voir tout <ArrowRight size={12} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Liste sans contours */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }} aria-busy="true" aria-live="polite">
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton width="40%" height={12} />
              <Skeleton width="100%" height={14} />
              <Skeleton width="80%" height={14} />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textMuted, padding: "8px 0" }}>
          Aucun rapport pour l&apos;instant. L&apos;IA en génère automatiquement à la fin de chaque jour.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {reports.map((r) => {
            const pnl = Number(r.stats?.totalPnL || 0);
            const positive = pnl > 0;
            const negative = pnl < 0;
            const preview = firstParagraph(r.content);
            return (
              <button
                key={r.id}
                onClick={onOpenReports}
                style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  background: "transparent", border: "none", padding: 0,
                  textAlign: "left", cursor: onOpenReports ? "pointer" : "default",
                  fontFamily: "inherit", width: "100%",
                }}
              >
                {/* Icone circulaire */}
                <div
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: T.greenBg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Bot size={15} strokeWidth={1.75} color={T.green} />
                </div>

                {/* Contenu */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 3 }}>
                    {timeAgo(r.created_at)}
                    {!r.is_read && (
                      <span
                        style={{
                          display: "inline-block", marginLeft: 8,
                          width: 6, height: 6, borderRadius: "50%",
                          background: T.green, verticalAlign: "middle",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{r.title || (r.report_type === "daily" ? "Rapport du jour" : "Rapport de la semaine")}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: positive ? T.green : negative ? T.red : T.textMuted }}>
                      {pnl > 0 ? "+" : ""}{pnl.toFixed(2)}$
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12, color: T.textSub, lineHeight: 1.5,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {preview}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
