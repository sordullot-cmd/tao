"use client";

import React, { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import Popover from "@/components/ui/Popover";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  width?: number | string; // optionnel : sinon le bouton s'adapte au contenu
}

const MONTHS_EN = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromISO = (s: string) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtRange = (start: string, end: string) => {
  const s = fromISO(start);
  const e = fromISO(end);
  if (!s || !e) return "Sélectionner";
  const sameYear = s.getFullYear() === e.getFullYear();
  const sStr = `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}`;
  const eStr = `${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  return sameYear ? `${sStr} - ${eStr}` : `${sStr}, ${s.getFullYear()} - ${eStr}`;
};

interface PresetDef {
  key: string;
  label: string;
  compute: () => DateRange;
}

// Lundi de la semaine contenant `d` (semaine calendaire, lundi → dimanche).
const mondayOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0 = dimanche
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
};

const PRESETS: PresetDef[] = [
  { key: "today", label: "Today", compute: () => { const t = new Date(); return { start: toISO(t), end: toISO(t) }; } },
  { key: "week", label: "This week", compute: () => { const e = new Date(); const s = mondayOf(e); return { start: toISO(s), end: toISO(e) }; } },
  { key: "lastweek", label: "Last week", compute: () => { const thisMon = mondayOf(new Date()); const s = new Date(thisMon); s.setDate(thisMon.getDate() - 7); const e = new Date(thisMon); e.setDate(thisMon.getDate() - 1); return { start: toISO(s), end: toISO(e) }; } },
  { key: "4w", label: "Last 4 weeks", compute: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 27); return { start: toISO(s), end: toISO(e) }; } },
  { key: "12m", label: "Last 12 months", compute: () => { const e = new Date(); const s = new Date(); s.setMonth(e.getMonth() - 12); return { start: toISO(s), end: toISO(e) }; } },
  { key: "all", label: "All time", compute: () => ({ start: "1970-01-01", end: toISO(new Date()) }) },
];

function MonthGrid({
  year, month, rangeStart, rangeEnd, hover, onPick, onHover,
}: {
  year: number; month: number;
  rangeStart: Date | null; rangeEnd: Date | null;
  hover: Date | null;
  onPick: (d: Date) => void;
  onHover: (d: Date | null) => void;
}) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  // For previewing range while picking
  const previewEnd = rangeStart && !rangeEnd && hover ? hover : rangeEnd;

  const inRange = (d: Date) => {
    if (!rangeStart) return false;
    const end = previewEnd || rangeStart;
    const a = rangeStart < end ? rangeStart : end;
    const b = rangeStart < end ? end : rangeStart;
    return d >= a && d <= b;
  };
  const isEdge = (d: Date) => {
    if (!rangeStart) return false;
    const end = previewEnd || rangeStart;
    const a = rangeStart < end ? rangeStart : end;
    const b = rangeStart < end ? end : rangeStart;
    return d.getTime() === a.getTime() || d.getTime() === b.getTime();
  };

  return (
    <div style={{ flex: 1 }}>
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
        {MONTHS_EN[month]} {year}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", padding: "6px 0", fontWeight: 500 }}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const inMonth = d.getMonth() === month;
          const within = inRange(d);
          const edge = isEdge(d);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              onMouseLeave={() => onHover(null)}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: edge ? 600 : 500,
                color: edge ? "var(--color-bg)" : (inMonth ? "var(--color-text)" : "var(--color-text-muted)"),
                background: edge ? "var(--color-text)" : (within ? "var(--color-active-bg)" : "transparent"),
                border: "none",
                borderRadius: "var(--radius-field)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 80ms ease",
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker({ value, onChange, width }: Props) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = fromISO(value.start) || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset draft when opening
  useEffect(() => {
    if (open) {
      setDraftStart(fromISO(value.start));
      setDraftEnd(fromISO(value.end));
      const ds = fromISO(value.start) || new Date();
      setViewMonth(new Date(ds.getFullYear(), ds.getMonth(), 1));
    }
  }, [open, value.start, value.end]);

  // Clic extérieur et Échap : gérés par le Popover, qui rend le panneau hors
  // de `containerRef`.
  const close = React.useCallback(() => setOpen(false), []);

  const pickDate = (d: Date) => {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(d);
      setDraftEnd(null);
    } else {
      // Second click sets end (swap if before start)
      if (d < draftStart) {
        setDraftEnd(draftStart);
        setDraftStart(d);
      } else {
        setDraftEnd(d);
      }
    }
  };

  const applyPreset = (p: PresetDef) => {
    const r = p.compute();
    setDraftStart(fromISO(r.start));
    setDraftEnd(fromISO(r.end));
  };

  const apply = () => {
    if (draftStart && draftEnd) {
      onChange({ start: toISO(draftStart), end: toISO(draftEnd) });
      setOpen(false);
    } else if (draftStart && !draftEnd) {
      onChange({ start: toISO(draftStart), end: toISO(draftStart) });
      setOpen(false);
    }
  };

  const clear = () => {
    setDraftStart(null);
    setDraftEnd(null);
  };

  const nextMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  const footerLabel = draftStart && draftEnd
    ? `${MONTHS_SHORT[draftStart.getMonth()]} ${draftStart.getDate()}, ${draftStart.getFullYear()} → ${MONTHS_SHORT[draftEnd.getMonth()]} ${draftEnd.getDate()}, ${draftEnd.getFullYear()}`
    : draftStart
      ? `${MONTHS_SHORT[draftStart.getMonth()]} ${draftStart.getDate()}, ${draftStart.getFullYear()} → …`
      : "Sélectionner une plage";

  return (
    <div ref={containerRef} style={{ position: "relative", fontFamily: "var(--font-sans)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: 34, padding: "8px 16px",
          width: width ?? "auto",
          height: 34,
          border: "1px solid var(--color-border)",
          borderRadius: 999,
          background: "var(--color-card-bg, #FFFFFF)",
          color: "var(--color-text)",
          fontSize: 13,
          // Même graisse que `StepperPill` : les deux tiennent la même place,
          // et la commande ne doit pas changer de poids en « Personnalisé ».
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <Calendar size={14} strokeWidth={1.75} color="var(--color-text-sub)" />
        <span style={{ whiteSpace: "nowrap" }}>{fmtRange(value.start, value.end)}</span>
      </button>

      <Popover
        anchorRef={containerRef}
        open={open}
        onClose={close}
        align="end"
        scroll={false}
        maxHeight={520}
        style={{
          background: "var(--color-card-bg, #FFFFFF)",
          border: "none",
          borderRadius: "var(--radius-modal)",
          boxShadow: "var(--elev-overlay)",
          flexDirection: "row",
          minWidth: "min(680px, calc(100vw - 24px))",
        }}
      >
        <>
          {/* Presets */}
          <div style={{ width: 130, borderRight: "1px solid var(--color-border)", padding: 8, display: "flex", flexDirection: "column", gap: 2, background: "var(--color-hover-bg, #FAFAFA)" }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p)}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  fontSize:12,
                  fontWeight: 500,
                  color: "var(--color-text)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--radius-field)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover-bg, #F0F0F0)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendars */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                aria-label="Mois précédent"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "var(--color-text-sub)", borderRadius: "var(--radius-field)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover-bg, #F0F0F0)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <ChevronLeft size={16} />
              </button>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                aria-label="Mois suivant"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "var(--color-text-sub)", borderRadius: "var(--radius-field)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover-bg, #F0F0F0)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 16, flex: 1 }}>
              <MonthGrid
                year={viewMonth.getFullYear()}
                month={viewMonth.getMonth()}
                rangeStart={draftStart}
                rangeEnd={draftEnd}
                hover={hover}
                onPick={pickDate}
                onHover={setHover}
              />
              <MonthGrid
                year={nextMonth.getFullYear()}
                month={nextMonth.getMonth()}
                rangeStart={draftStart}
                rangeEnd={draftEnd}
                hover={hover}
                onPick={pickDate}
                onHover={setHover}
              />
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-sub)" }}>{footerLabel}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={clear}
                  style={{ padding: "8px 16px", border: "1px solid var(--color-border)", background: "var(--color-card-bg, #FFFFFF)", color: "var(--color-text)", fontSize: 13, fontWeight: 500, minHeight: 34, borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={!draftStart}
                  style={{ padding: "8px 16px", border: "1px solid var(--color-text)", background: "var(--color-card-bg, #FFFFFF)", color: "var(--color-text)", fontSize: 13, fontWeight: 500, minHeight: 34, borderRadius: 999, cursor: draftStart ? "pointer" : "not-allowed", opacity: draftStart ? 1 : 0.5, fontFamily: "inherit" }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </>
      </Popover>
    </div>
  );
}
