"use client";

import React, { useState, useEffect, useRef } from "react";
import { T } from "@/lib/ui/tokens";
import Popover from "@/components/ui/Popover";

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const sameYMD = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const navBtn = {
  width: 24, height: 24, borderRadius: "var(--radius-field)", border: "none", background: "transparent",
  cursor: "pointer", color: T.textSub, fontSize: 16, fontWeight: 500, lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  transition: "background .12s ease",
};

/**
 * Mini-calendrier en popover pour choisir une date.
 * Contrôlé par le parent : monté quand ouvert, fermé via `onClose`
 * (clic à l'extérieur ou Échap). `value` est la date sélectionnée (Date),
 * `onSelect(Date)` est appelé au clic sur un jour. `align` ancre le popover
 * à gauche ou à droite de l'ancre.
 *
 * `anchorRef` désigne le déclencheur ; le calendrier est alors portalisé et
 * échappe à tout ancêtre qui découpe (barre d'outils, carte, corps de modale).
 * Sans lui, on retombe sur l'ancien placement absolu dans le conteneur relatif
 * parent — conservé pour les appels qui n'ont pas de référence à donner.
 */
export default function MiniCalendar({ value, onSelect, onClose, align = "left", anchorRef = null }) {
  const initial = value instanceof Date && !isNaN(value) ? value : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const ref = useRef(null);

  useEffect(() => {
    if (anchorRef) return; // le Popover s'en charge
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  const today = new Date();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Décalage du 1er du mois en semaine commençant le lundi.
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const pick = (d) => { onSelect?.(new Date(viewYear, viewMonth, d)); onClose?.(); };

  const panelStyle = {
    background: T.white, border: "none", borderRadius: "var(--radius-card)",
    padding: 12, width: 244, boxShadow: "var(--elev-overlay)",
    fontFamily: "var(--font-sans)",
  };

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={prevMonth} aria-label="Mois précédent" style={navBtn}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} aria-label="Mois suivant" style={navBtn}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>›</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: T.textMut }}>{w}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const cur = new Date(viewYear, viewMonth, d);
          const isToday = sameYMD(cur, today);
          const isSel = value instanceof Date && !isNaN(value) && sameYMD(cur, value);
          return (
            <button
              key={i}
              onClick={() => pick(d)}
              style={{
                height: 28, borderRadius: "var(--radius-field)", border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: isSel || isToday ? 600 : 500,
                fontVariantNumeric: "tabular-nums",
                background: isSel ? T.text : "transparent",
                color: isSel ? "#fff" : T.text,
                boxShadow: !isSel && isToday ? `inset 0 0 0 1px ${T.border2}` : "none",
                transition: "background .12s ease",
              }}
              onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = T.accentBg; }}
              onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </>
  );

  if (anchorRef) {
    return (
      <Popover
        anchorRef={anchorRef}
        open
        onClose={onClose}
        align={align === "right" ? "end" : "start"}
        maxHeight={340}
        style={panelStyle}
      >
        {body}
      </Popover>
    );
  }

  return (
    <div
      ref={ref}
      style={{ position: "absolute", top: "calc(100% + 6px)", [align]: 0, zIndex: 11000, ...panelStyle }}
    >
      {body}
    </div>
  );
}
