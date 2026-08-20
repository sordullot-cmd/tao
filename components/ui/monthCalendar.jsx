"use client";

/* ============================================================================
   Calendrier d'UN mois — P&L jour par jour.

   Version compacte de la vue « Jour » de la page Calendrier, pensée pour vivre
   à l'intérieur d'une section de statistiques : mêmes aplats, mêmes tokens,
   mais des cases plus basses et un en-tête qui porte sa propre navigation de
   mois et le total du mois affiché.

   Le mois ouvert est celui du trade le plus récent, pas le mois courant : une
   section de stats sur un compte inactif depuis trois semaines afficherait
   sinon une grille vide.

   Règle du projet : aucune couleur en dur, tout passe par les tokens `T`.
   ========================================================================== */

import React from "react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { fmtInt } from "@/lib/ui/format";
import { CARD, StepperPill, TILE_HOVER } from "@/components/ui/da";

const WEEKDAY_KEYS = ["wd.monday", "wd.tuesday", "wd.wednesday", "wd.thursday", "wd.friday", "wd.saturday", "wd.sunday"];

/** Clé « YYYY-MM-DD » d'un trade, ou null si la date est inexploitable. */
const dayKeyOf = (tr) => {
  const key = String(tr?.date || "").trim().split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
};

const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function MonthCalendar({ trades = [], onDayClick, title = "Calendrier" }) {
  const lang = useLang();
  const locale = lang === "fr" ? "fr-FR" : "en-US";

  /* ── Agrégation par jour ────────────────────────────────────────────────── */
  const { pnlByDate, countByDate, lastDate } = React.useMemo(() => {
    const pnl = {};
    const count = {};
    let last = null;
    for (const tr of trades || []) {
      const key = dayKeyOf(tr);
      if (!key) continue;
      pnl[key] = (pnl[key] || 0) + (Number(tr.pnl) || 0);
      count[key] = (count[key] || 0) + 1;
      if (last === null || key > last) last = key;
    }
    return { pnlByDate: pnl, countByDate: count, lastDate: last };
  }, [trades]);

  /* Mois affiché : celui du dernier trade au premier rendu, puis ce que
     l'utilisateur choisit avec les flèches. */
  const initial = React.useMemo(() => {
    const d = lastDate ? new Date(`${lastDate}T00:00:00`) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [lastDate]);
  const [cursor, setCursor] = React.useState(initial);
  const [touched, setTouched] = React.useState(false);
  // Tant que l'utilisateur n'a pas navigué, on suit les données (le compte peut
  // charger ses trades après le premier rendu).
  const { year, month } = touched ? cursor : initial;

  const step = (delta) => {
    setTouched(true);
    const next = month + delta;
    if (next < 0) setCursor({ year: year - 1, month: 11 });
    else if (next > 11) setCursor({ year: year + 1, month: 0 });
    else setCursor({ year, month: next });
  };

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthPnL = Object.entries(pnlByDate)
    .filter(([key]) => key.startsWith(monthPrefix))
    .reduce((s, [, v]) => s + v, 0);
  const monthCount = Object.entries(countByDate)
    .filter(([key]) => key.startsWith(monthPrefix))
    .reduce((s, [, v]) => s + v, 0);

  const firstDay = new Date(year, month, 1).getDay();
  const leading = firstDay === 0 ? 6 : firstDay - 1;   // semaine démarrée lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const DayCell = ({ day }) => {
    const iso = isoOf(year, month, day);
    const pnl = pnlByDate[iso] || 0;
    const count = countByDate[iso] || 0;
    const positive = pnl > 0;
    const negative = pnl < 0;

    const bg = positive ? T.calPosSurface : negative ? T.calNegSurface : T.calEmptyBg;
    const dayInk = positive ? T.calPosDay : negative ? T.calNegDay : T.calEmptyText;
    const amountInk = positive ? T.calPosText : negative ? T.calNegText : T.text;
    const clickable = count > 0 && typeof onDayClick === "function";
    const activate = clickable ? () => onDayClick(iso) : undefined;

    return (
      <div
        onClick={activate}
        onKeyDown={clickable ? (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
        } : undefined}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={count > 0
          ? `${day} — ${fmtInt(pnl, true)}, ${count} ${count > 1 ? t("cal.tradesPlural") : t("cal.tradeSingular")}`
          : undefined}
        style={{
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          gap: 4, height: 58, padding: 8, borderRadius: 8, background: bg,
          cursor: clickable ? "pointer" : "default", minWidth: 0,
          transition: "box-shadow var(--dur-fast) var(--ease-out)",
        }}
        onMouseEnter={clickable ? (e) => { e.currentTarget.style.boxShadow = TILE_HOVER; } : undefined}
        onMouseLeave={clickable ? (e) => { e.currentTarget.style.boxShadow = "none"; } : undefined}
      >
        <span style={{ fontSize: 12, lineHeight: 1, color: dayInk }}>{day}</span>
        {count > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 500, lineHeight: 1, color: amountInk,
            fontVariantNumeric: "tabular-nums",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {fmtInt(pnl, true)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* En-tête : mois + total, navigation à droite */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2, color: T.text }}>{title}</span>
          <span style={{
            fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
            color: monthPnL > 0 ? T.pnlPos : monthPnL < 0 ? T.pnlNeg : T.textSub,
          }}>
            {monthCount > 0 ? fmtInt(monthPnL, true) : "—"}
          </span>
          <span style={{ fontSize: 12, color: T.textMut, whiteSpace: "nowrap" }}>
            {monthCount} {monthCount > 1 ? t("cal.tradesPlural") : t("cal.tradeSingular")}
          </span>
        </span>
        <StepperPill
          label={`${new Date(year, month).toLocaleString(locale, { month: "long" })} ${year}`}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          prevLabel={t("cal.prevMonth")}
          nextLabel={t("cal.nextMonth")}
        />
      </div>

      {/* En-têtes de jours — initiale seule, la case ne fait que 58 px */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6 }}>
        {WEEKDAY_KEYS.map(key => (
          <span key={key} style={{
            fontSize: 11, lineHeight: 1, color: T.textMut, textAlign: "center",
            textTransform: "capitalize", overflow: "hidden", whiteSpace: "nowrap",
          }}>
            {t(key).slice(0, 3)}
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6 }}>
        {Array.from({ length: leading }, (_, i) => <div key={`lead-${i}`} aria-hidden />)}
        {Array.from({ length: daysInMonth }, (_, i) => <DayCell key={i + 1} day={i + 1} />)}
      </div>
    </div>
  );
}
