"use client";

import React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import Popover from "@/components/ui/Popover";

/* ─────────────── Helpers date (autonomes, alignés sur AgendaPage) ─────────────── */
const WEEKDAYS_MIN = ["L", "M", "M", "J", "V", "S", "D"];
const WEEKDAYS_FULL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a, b) => dateKey(a) === dateKey(b);
const weekdayIdx = (d) => (d.getDay() + 6) % 7; // 0 = lundi
const startOfWeekMonday = (d) => { const x = startOfDay(d); return addDays(x, -weekdayIdx(x)); };

function formatDateLong(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return `${WEEKDAYS_FULL[weekdayIdx(d)]}, ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`;
}

/* Déclencheur discret (façon champ d'origine, transparent) commun aux deux champs. */
const triggerBtn = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "5px 4px", fontSize: 14, fontFamily: "inherit", color: T.text,
  background: "transparent", border: "none", borderRadius: 6, outline: "none", cursor: "pointer",
};
const calNavBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: "var(--radius-card)", border: "none", background: "transparent",
  color: T.text, cursor: "pointer",
};

/* ─────────────── Champ date : déclencheur + mini-calendrier maison ─────────────── */
export function DateField({ value, min, onChange }) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : startOfDay(new Date());
  const [month, setMonth] = React.useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const ref = React.useRef(null);

  // Recale le mois affiché sur la valeur à chaque (ré)ouverture.
  React.useEffect(() => {
    if (open) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clic extérieur : confié au Popover (le panneau est portalisé).
  const close = React.useCallback(() => setOpen(false), []);

  const today = startOfDay(new Date());
  const minDate = min ? new Date(`${min}T00:00:00`) : null;
  const gridStart = startOfWeekMonday(new Date(month.getFullYear(), month.getMonth(), 1));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const label = `${MONTHS[month.getMonth()]} ${month.getFullYear()}`;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={triggerBtn}>
        {value ? formatDateLong(value) : "Choisir une date"}
        <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        maxHeight={360}
        style={{ background: T.white, border: "none", borderRadius: "var(--radius-card)", padding: 12, boxShadow: "var(--elev-overlay)", width: 252 }}
      >
        <>
          {/* En-tête mois + navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mois précédent" style={calNavBtn}>
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{label}</span>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mois suivant" style={calNavBtn}>
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          {/* Jours de la semaine */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
            {WEEKDAYS_MIN.map((w, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10, color: T.textMut, fontWeight: 500 }}>{w}</div>
            ))}
          </div>
          {/* Grille des jours */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((c, i) => {
              const inMonth = c.getMonth() === month.getMonth();
              const isSel = sameDay(c, selected) && !!value;
              const isToday = sameDay(c, today);
              const disabled = minDate && startOfDay(c) < startOfDay(minDate);
              return (
                <button key={i} type="button" disabled={disabled}
                  onClick={() => { onChange(dateKey(c)); setOpen(false); }}
                  style={{
                    aspectRatio: "1 / 1", borderRadius: "var(--radius-card)", border: "none", fontFamily: "inherit",
                    fontSize: 12, cursor: disabled ? "default" : "pointer",
                    background: isSel ? T.text : "transparent",
                    color: isSel ? "#fff" : disabled ? T.border : inMonth ? T.text : T.textMut,
                    fontWeight: isSel || isToday ? 700 : 400,
                    opacity: !inMonth && !isSel ? 0.5 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
                  }}>
                  {c.getDate()}
                  {isToday && !isSel && <span style={{ position: "absolute", bottom: 3, width: 3, height: 3, borderRadius: "50%", background: T.blue }} />}
                </button>
              );
            })}
          </div>
        </>
      </Popover>
    </div>
  );
}

/* ─────────────── Champ heure : déclencheur + liste maison ───────────────
 * La liste est toujours portalisée (Popover) : elle ne peut plus être rognée
 * par un conteneur à `overflow`, modale défilante comprise. La prop `portal`
 * subsiste pour ne pas casser les appels existants, mais n'a plus d'effet. */
export function TimeField({ value, onChange, placeholder = "", triggerStyle }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const listRef = React.useRef(null);

  const close = React.useCallback(() => setOpen(false), []);

  // À l'ouverture, fait défiler la liste jusqu'à l'heure sélectionnée.
  React.useEffect(() => {
    if (!open || !listRef.current) return;
    const sel = listRef.current.querySelector("[data-sel='1']");
    // `nearest` et non `center` : depuis un portail, `center` recadrerait aussi
    // la page derrière le popover.
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }, [open]);

  // Créneaux par pas de 15 min sur 24 h.
  const slots = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

  const toggle = () => setOpen((o) => !o);

  const list = (
    <>
      {slots.map((s) => {
        const isSel = s === value;
        return (
          <button key={s} type="button" data-sel={isSel ? "1" : "0"}
            onClick={() => { onChange(s); setOpen(false); }}
            style={{
              display: "block", width: "100%", textAlign: "left", border: "none", fontFamily: "inherit",
              padding: "6px 10px", borderRadius: "var(--radius-card)", cursor: "pointer", fontSize:13,
              background: isSel ? `color-mix(in srgb, ${T.blue} 10%, transparent)` : "transparent",
              color: isSel ? T.blue : T.text, fontWeight: 500,
            }}>
            {s}
          </button>
        );
      })}
    </>
  );

  return (
    <div ref={ref} style={{ position: "relative", display: triggerStyle ? "block" : "inline-block" }}>
      <button type="button" onClick={toggle} style={{ ...triggerBtn, ...triggerStyle }}>
        <span style={{ color: value ? T.text : T.textMut }}>{value || placeholder}</span>
        <ChevronDown size={14} color={T.textMut} style={{ marginLeft: triggerStyle ? "auto" : 2 }} />
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        maxHeight={240}
        style={{
          background: T.white, border: "none", borderRadius: "var(--radius-card)", padding: 6,
          boxShadow: "var(--elev-overlay)", width: 110,
        }}
      >
        <div ref={listRef}>{list}</div>
      </Popover>
    </div>
  );
}
