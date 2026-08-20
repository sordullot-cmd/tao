"use client";

/* ============================================================================
   Page Calendrier — nouvelle direction artistique (maquette Figma 283:1680).

   Structure de la maquette :
     titre de page ─ 48 ─ [ période + P&L héros | stepper + Jour/Mois/Année ]
                          ─ 24 ─ carte blanche : la grille de la vue courante.

   Trois granularités, du plus détaillé au plus synthétique :
     • Jour   — le mois courant en grande grille 7 colonnes : P&L et nombre de
                trades lisibles dans chaque tuile de 83 px (la maquette Figma).
     • Mois   — les douze mois de l'année côte à côte, chacun en mini-calendrier
                complet : un jour tradé prend l'aplat de son signe, sans montant
                ni compteur ; seul le P&L du mois s'affiche, près de son nom.
     • Année  — une tuile par mois : P&L et nombre de trades du mois.

   Les états gain / perte / neutre viennent des tokens `cal*` : les grandes
   tuiles prennent les variantes `*Surface` (très diluées, sinon l'aplat serait
   écrasant à cette taille), les cases des mini-calendriers les variantes `*Bg`,
   plus soutenues, avec le chiffre du jour à l'encre P&L.
   ========================================================================== */

import React, { useState, useMemo } from "react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { fmtInt } from "@/lib/ui/format";
import { CARD, HeroAmount, PeriodPills, StepperPill, TILE_HOVER } from "@/components/ui/da";

const WEEKDAY_KEYS = ["wd.monday", "wd.tuesday", "wd.wednesday", "wd.thursday", "wd.friday", "wd.saturday", "wd.sunday"];

/* Les props de comptes (evalAccountSize / accounts / selectedAccountIds) ne sont
   plus lues depuis le retrait de l'indicateur d'objectif : la page ne dépend
   plus que des trades. L'appelant peut continuer à les passer sans effet. */
export default function CalendarPage({ trades = [], setPage }) {
  const lang = useLang();
  const locale = lang === "fr" ? "fr-FR" : "en-US";

  const today = new Date();
  // "day" = un mois jour par jour · "month" = l'année jour par jour, groupée par
  // mois · "year" = l'année mois par mois.
  const [view, setView] = useState("day");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Le site n'a plus de filtre de dates : le clic sur un jour ouvre simplement
  // la page Trades, qui liste tout l'historique.
  const goToTrades = () => {
    if (typeof setPage === "function") setPage("trades");
  };

  /* ── Agrégation par jour ────────────────────────────────────────────────── */
  const { pnlByDate, countByDate } = useMemo(() => {
    const pnl = {};
    const count = {};
    for (const tr of trades) {
      if (!tr.date) continue;
      const key = String(tr.date).trim().split("T")[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      pnl[key] = (pnl[key] || 0) + (tr.pnl || 0);
      count[key] = (count[key] || 0) + 1;
    }
    return { pnlByDate: pnl, countByDate: count };
  }, [trades]);

  const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  /* ── Totaux de la période affichée ──────────────────────────────────────── */
  const sumOver = (predicate) => Object.entries(pnlByDate)
    .filter(([key]) => predicate(key))
    .reduce((s, [, v]) => s + v, 0);

  /* Seule la vue « Jour » porte sur un mois : les deux autres embrassent
     l'année, donc le P&L héros, le libellé et le stepper la suivent. */
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const periodPnL = view === "day"
    ? sumOver(key => key.startsWith(monthPrefix))
    : sumOver(key => key.startsWith(`${year}-`));

  const periodLabel = view === "day"
    ? new Date(year, month).toLocaleString(locale, { month: "long" })
    : String(year);

  const stepPeriod = (delta) => {
    if (view !== "day") { setYear(y => y + delta); return; }
    const next = month + delta;
    if (next < 0) { setMonth(11); setYear(y => y - 1); }
    else if (next > 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(next);
  };

  /* ── Cellule d'un jour (maquette 283:4148) ──────────────────────────────── */
  const DayCell = ({ day }) => {
    const iso = isoOf(year, month, day);
    const pnl = pnlByDate[iso] || 0;
    const count = countByDate[iso] || 0;
    const positive = pnl > 0;
    const negative = pnl < 0;

    const bg = positive ? T.calPosSurface : negative ? T.calNegSurface : T.calEmptyBg;
    const dayInk = positive ? T.calPosDay : negative ? T.calNegDay : T.calEmptyText;
    const amountInk = positive ? T.calPosText : negative ? T.calNegText : T.text;
    const subInk = positive ? T.calPosSub : negative ? T.calNegText : T.calEmptyText;
    const clickable = count > 0;

    return (
      <div
        onClick={clickable ? goToTrades : undefined}
        onKeyDown={clickable ? (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToTrades(); }
        } : undefined}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        title={clickable ? t("cal.viewDayTrades") : undefined}
        aria-label={clickable
          ? `${day} — ${fmtInt(pnl, true)}, ${count} ${count > 1 ? t("cal.tradesPlural") : t("cal.tradeSingular")}`
          : undefined}
        style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 8, height: 83, padding: 12, borderRadius: 8, background: bg,
          cursor: clickable ? "pointer" : "default", minWidth: 0,
          transition: "box-shadow 140ms var(--ease-out, ease)",
        }}
        onMouseEnter={clickable ? (e) => { e.currentTarget.style.boxShadow = TILE_HOVER; } : undefined}
        onMouseLeave={clickable ? (e) => { e.currentTarget.style.boxShadow = "none"; } : undefined}
      >
        <span style={{ fontSize: 14, lineHeight: "17.05px", color: dayInk }}>{day}</span>
        {/* Un jour sans trade ne porte QUE son numéro : « €0 / 0 trade » répété
            sur toutes les cases vides remplissait la grille de bruit et masquait
            les jours qui comptent. Même règle que le calendrier des fiches de
            compte et de firme (components/ui/monthCalendar.jsx). */}
        {count > 0 && (
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", minWidth: 0 }}>
            <span style={{
              fontSize: 14, lineHeight: "17.05px", color: amountInk, whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}>
              {fmtInt(pnl, true)}
            </span>
            <span style={{
              fontSize: 12, lineHeight: "17.05px", color: subInk, opacity: pnl === 0 ? 1 : 0.6,
              whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
            }}>
              {count} {count > 1 ? t("cal.tradesPlural") : t("cal.tradeSingular")}
            </span>
          </span>
        )}
      </div>
    );
  };

  /* ── Vue jour : le mois courant en grille 7 colonnes, lundi en tête ─────── */
  const renderDayGrid = () => {
    const firstDay = new Date(year, month, 1).getDay();
    const leading = firstDay === 0 ? 6 : firstDay - 1;   // semaine démarrée lundi
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return (
      <div style={{ ...CARD, padding: 0 }}>
        {/* Sous 900 px, sept colonnes de 158 px ne tiennent plus : la grille
            défile horizontalement d'un bloc — en-têtes et jours ensemble, pour
            qu'une colonne reste alignée avec son libellé. */}
        <div className="tr4de-cal-scroll scroll-thin" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", padding: 16 }}>
          <div className="tr4de-cal-inner" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* En-têtes de jours */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8 }}>
              {WEEKDAY_KEYS.map(key => (
                <div key={key} style={{ padding: 12, minWidth: 0 }}>
                  <span style={{
                    fontSize: 14, lineHeight: "17.05px", color: T.textMut,
                    letterSpacing: 0.0645, textTransform: "capitalize",
                    display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {t(key)}
                  </span>
                </div>
              ))}
            </div>

            {/* Grille des jours */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8 }}>
              {Array.from({ length: leading }, (_, i) => <div key={`lead-${i}`} aria-hidden />)}
              {Array.from({ length: daysInMonth }, (_, i) => <DayCell key={i + 1} day={i + 1} />)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── Vue mois : les douze mois de l'année côte à côte ────────────────────
     Chaque mois est un mini-calendrier complet (semaine démarrée lundi). Un
     jour tradé prend l'aplat de son signe et son chiffre passe à l'encre P&L :
     aucun montant, aucun compteur — la couleur suffit à lire l'année d'un
     coup. Seul chiffre affiché en plus : le P&L du mois, à droite de son nom.
     Les mois sont séparés par des filets d'un pixel obtenus par le fond de la
     grille (gap de 1 px sur fond bordure), comme un vrai quadrillage. */
  const renderYearTable = () => {
    /* Initiales des jours dans la langue courante : le 1er janvier 2024 était
       un lundi, la série démarre donc au bon jour. */
    const weekdayInitials = Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 1 + i)
        .toLocaleDateString(locale, { weekday: "short" })
        .replace(".", "")
        .slice(0, 2)
    );

    /* Une case = un jour du mois. Cliquable seulement s'il porte des trades. */
    const MiniDay = ({ m, day }) => {
      const iso = isoOf(year, m, day);
      const pnl = pnlByDate[iso] || 0;
      const count = countByDate[iso] || 0;
      const traded = count > 0;
      const positive = pnl > 0;
      const negative = pnl < 0;
      const isToday = year === today.getFullYear() && m === today.getMonth() && day === today.getDate();
      const dateLabel = new Date(year, m, day).toLocaleDateString(locale, { day: "numeric", month: "long" });
      // Le liseré « aujourd'hui » et le voile de survol partagent `boxShadow` :
      // il faut donc les composer, sinon le survol effacerait le repère du jour.
      const todayRing = isToday ? `inset 0 0 0 1px ${T.border2}` : null;

      return (
        <span
          role={traded ? "button" : undefined}
          tabIndex={traded ? 0 : undefined}
          onClick={traded ? goToTrades : undefined}
          onKeyDown={traded ? (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToTrades(); }
          } : undefined}
          title={traded
            ? `${dateLabel} · ${fmtInt(pnl, true)} · ${count} ${count > 1 ? t("cal.tradesPlural") : t("cal.tradeSingular")}`
            : undefined}
          aria-label={traded ? `${dateLabel} — ${fmtInt(pnl, true)}` : undefined}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            aspectRatio: "1 / 1", minHeight: 28, borderRadius: 8,
            // Jour sans trade : le gris des autres calendriers de l'app
            // (`calEmptyBg`, comme les grandes tuiles de la vue Jour). Un jour
            // tradé mais nul (BE) prend un gris franc pour s'en détacher.
            background: positive ? T.calPosBg : negative ? T.calNegBg : traded ? T.border2 : T.calEmptyBg,
            color: positive ? T.pnlPos : negative ? T.pnlNeg : traded ? T.text : T.calEmptyText,
            boxShadow: todayRing || "none",
            fontSize: 11, lineHeight: 1, fontWeight: traded ? 500 : 400,
            fontVariantNumeric: "tabular-nums",
            cursor: traded ? "pointer" : "default",
            transition: "box-shadow 140ms var(--ease-out, ease)",
          }}
          onMouseEnter={traded ? (e) => {
            e.currentTarget.style.boxShadow = [todayRing, TILE_HOVER].filter(Boolean).join(", ");
          } : undefined}
          onMouseLeave={traded ? (e) => { e.currentTarget.style.boxShadow = todayRing || "none"; } : undefined}
        >
          {String(day).padStart(2, "0")}
        </span>
      );
    };

    const MiniMonth = ({ m }) => {
      const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
      const monthPnL = sumOver(key => key.startsWith(prefix));
      const daysInM = new Date(year, m + 1, 0).getDate();
      const firstDay = new Date(year, m, 1).getDay();
      const leading = firstDay === 0 ? 6 : firstDay - 1;   // semaine démarrée lundi

      return (
        <div style={{ padding: "6px 8px 10px" }}>
          {/* Nom du mois centré comme sur la maquette ; le P&L se pose à droite
              sans décaler le titre (donc en absolu). */}
          <div style={{ position: "relative", textAlign: "center", marginBottom: 10, minHeight: 18 }}>
            <button
              type="button"
              onClick={() => { setMonth(m); setView("day"); }}
              title={t("cal.openMonth")}
              style={{
                padding: 0, border: "none", background: "transparent", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, lineHeight: "18px", fontWeight: 500,
                color: T.text, textTransform: "capitalize",
              }}
            >
              {new Date(year, m).toLocaleString(locale, { month: "long" })}
            </button>
            {monthPnL !== 0 && (
              <span
                title={t("cal.monthTotal")}
                style={{
                  position: "absolute", right: 0, top: 2, fontSize: 11, lineHeight: "14px",
                  whiteSpace: "nowrap", fontWeight: 500, fontVariantNumeric: "tabular-nums",
                  color: monthPnL > 0 ? T.pnlPos : T.pnlNeg,
                }}
              >
                {fmtInt(monthPnL, true)}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 4 }}>
            {weekdayInitials.map((wd, i) => (
              <span key={i} aria-hidden style={{
                fontSize: 10, lineHeight: 1, color: T.textMut, textAlign: "center",
                textTransform: "capitalize", paddingBottom: 4,
              }}>
                {wd}
              </span>
            ))}
            {Array.from({ length: leading }, (_, i) => <span key={`lead-${i}`} aria-hidden />)}
            {Array.from({ length: daysInM }, (_, i) => <MiniDay key={i + 1} m={m} day={i + 1} />)}
          </div>
        </div>
      );
    };

    return (
      /* Une seule grande carte blanche contient les douze blocs gris. */
      <div style={{ ...CARD, padding: 16 }}>
        {/* Trois mois par rangée, sans filet de séparation. La classe porte les
            reprises responsive (deux colonnes en tablette, une en mobile) —
            cf. globals.css. */}
        <div className="tr4de-cal-year" style={{
          display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10,
        }}>
          {Array.from({ length: 12 }, (_, m) => <MiniMonth key={m} m={m} />)}
        </div>
      </div>
    );
  };

  /* ── Vue année : 12 mois miniatures, cliquer un mois y entre ────────────── */
  const renderMonthTiles = () => (
    <div style={{ ...CARD, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8 }}>
      {Array.from({ length: 12 }, (_, m) => {
        const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
        const monthPnL = sumOver(key => key.startsWith(prefix));
        const monthTrades = Object.entries(countByDate)
          .filter(([key]) => key.startsWith(prefix))
          .reduce((s, [, v]) => s + v, 0);
        const positive = monthPnL > 0;
        const negative = monthPnL < 0;

        return (
          <button
            key={m}
            type="button"
            onClick={() => { setMonth(m); setView("day"); }}
            style={{
              display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start",
              padding: 16, borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "inherit", textAlign: "left",
              background: positive ? T.calPosSurface : negative ? T.calNegSurface : T.calEmptyBg,
              transition: "box-shadow 140ms var(--ease-out, ease)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = TILE_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
          >
            <span style={{
              fontSize: 14, lineHeight: "17.05px", textTransform: "capitalize",
              color: positive ? T.calPosDay : negative ? T.calNegDay : T.calEmptyText,
            }}>
              {new Date(year, m).toLocaleString(locale, { month: "long" })}
            </span>
            {/* Mois sans trade : le nom seul, et un tiret à la place du montant.
                La tuile reste cliquable — c'est le chemin pour aller ouvrir ce
                mois —, mais elle n'annonce pas « €0 » comme un résultat. */}
            <span style={{
              fontSize: 20, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
              color: positive ? T.calPosText : negative ? T.calNegText : T.calEmptyText,
            }}>
              {monthTrades > 0 ? fmtInt(monthPnL, true) : "—"}
            </span>
            {/* La ligne est toujours rendue, vide s'il n'y a rien à compter :
                elle réserve sa hauteur, donc les douze tuiles gardent la même
                taille d'une rangée à l'autre. */}
            <span style={{
              fontSize: 12, lineHeight: "17.05px", minHeight: "17.05px",
              fontVariantNumeric: "tabular-nums",
              color: positive ? T.calPosSub : negative ? T.calNegText : T.calEmptyText,
              opacity: monthPnL === 0 ? 1 : 0.6,
            }}>
              {monthTrades > 0
                ? `${monthTrades} ${monthTrades > 1 ? t("cal.tradesPlural") : t("cal.tradeSingular")}`
                : ""}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    /* 14 px de retrait haut : la barre du haut apporte déjà 20 px, ce qui place
       le titre aux 34 px de la maquette (même calcul que le dashboard). */
    <div style={{ display: "flex", flexDirection: "column", gap: 48, fontFamily: "var(--font-sans)" }} className="anim-1">
      {/* Barre d'en-tête — slot d'en-tête aligné à droite. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div id="tr4de-page-header-slot" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
        {/* En-tête : période + P&L héros à gauche, navigation à droite */}
        <div className="tr4de-cal-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: 364 }}>
            <span style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub, textTransform: "capitalize" }}>
              {periodLabel}
            </span>
            <HeroAmount value={periodPnL} />

            {/* L'indicateur d'objectif des comptes d'évaluation (libellé du
                nombre de comptes, montants et barre) a été retiré : l'en-tête
                ne porte plus que la période et le P&L héros. */}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <StepperPill
              label={periodLabel}
              onPrev={() => stepPeriod(-1)}
              onNext={() => stepPeriod(1)}
              prevLabel={view === "day" ? t("cal.prevMonth") : t("cal.prevYear")}
              nextLabel={view === "day" ? t("cal.nextMonth") : t("cal.nextYear")}
            />
            <PeriodPills
              value={view}
              onChange={setView}
              options={[
                { id: "day", label: t("cal.viewDay") },
                { id: "month", label: t("cal.viewMonth") },
                { id: "year", label: t("cal.viewYear") },
              ]}
              track
              size={14}
            />
          </div>
        </div>

        {trades.length === 0 ? (
          <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: T.text, marginBottom: 8 }}>{t("cal.noTradesImported")}</div>
            <p style={{ color: T.textSub, margin: 0 }}>{t("cal.noTradesImportedSub")}</p>
          </div>
        ) : view === "day" ? renderDayGrid()
          : view === "month" ? renderYearTable()
          : renderMonthTiles()}
      </div>
    </div>
  );
}
