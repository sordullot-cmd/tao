"use client";

import React from "react";
import { Download, BookOpen } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { fmt } from "@/lib/ui/format";
import { CARD, PeriodPills } from "@/components/ui/da";
import { periodStart } from "@/lib/ui/period";
import TradesList from "@/components/ui/tradesList";
import { rMultiple, fmtR, getCurrencySymbol } from "@/lib/userPrefs";
import { computeTradeNote } from "@/lib/tradeNote";
import { useTradeNotes } from "@/lib/hooks/useTradeNotes";
import { useDailySessionNotes } from "@/lib/hooks/useDailySessionNotes";
import { exportJournalPdf } from "@/lib/export/journalPdf";
import DictatableTextarea from "@/components/MicDictateButton";

/* ---------------------------------------------------------------------------
   Page « Journal » — portée dans la direction artistique des pages récentes
   (détail d'un compte, détail d'une firme).

   Ordre des sections, identique à ces pages :
     barre d'actions → bilan de la période (chiffre héros + mini-KPI +
     pastilles) → calendrier du mois → une carte par journée tradée.

   Ce qui change par rapport à la version précédente :
     • plus de mise en page en deux colonnes (carte de 220 px figée à gauche,
       notes et tableau à droite) : chaque journée est UNE carte, comme partout
       ailleurs dans le produit ;
     • les trades du jour passent par la brique partagée `TradesList` au lieu
       d'embarquer la page Trades entière une fois par journée — même liste que
       le détail d'un compte, et un rendu qui ne dépend plus d'une page de
       2 000 lignes ;
     • les journées sont paginées : le journal d'une année n'a plus à monter
       tout son historique dans le DOM d'un coup.

   Règle du projet : aucune couleur en dur, tout passe par les tokens `T`.
   ------------------------------------------------------------------------- */

/** Clé « YYYY-MM-DD » d'un trade, ou null si la date est inexploitable. */
const dayKeyOf = (tr) => {
  const key = String(tr?.date || "").trim().split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
};

/** Journées affichées avant de devoir cliquer « Voir plus ». */
const DAYS_PER_PAGE = 10;

/** Trades montrés par journée avant de devoir déplier. Une journée chargée ne
 *  doit pas dérouler quinze lignes et repousser la journée suivante hors écran ;
 *  le reste se déplie à la demande, rien n'est perdu. */
const TRADES_PER_DAY = 4;

/** Colonnes de la liste : une carte de journée est moins large qu'une page. */
/* Pas de colonne « date » : la carte EST une journée, la répéter à chaque ligne
   ne dit rien et prend la place dont la colonne de droite manque désormais. */
const JOURNAL_COLUMNS = ["symbol", "direction", "strategy", "duration", "r", "pnl"];

export default function JournalPage({ trades = [], strategies = [], onImportClick, onDeleteTrade, onClearTrades }) {
  useLang();
  const { notes: tradeNotes } = useTradeNotes();
  const { notes: dailyNotes, setNote: updateDailyNote } = useDailySessionNotes();

  const [period, setPeriod] = React.useState("1M");
  const [shownDays, setShownDays] = React.useState(DAYS_PER_PAGE);

  /* Assignations trade ↔ stratégie : même source que la page Trades, sinon la
     colonne « stratégie » de la liste serait vide alors que la donnée existe. */
  const [tradeStrategies, setTradeStrategies] = React.useState({});
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("tr4de_trade_strategies");
      if (raw) setTradeStrategies(JSON.parse(raw) || {});
    } catch {}
  }, []);

  const noteColor = (s) => (s >= 7 ? T.pnlPos : s >= 4 ? T.amber : T.pnlNeg);

  /* ── Regroupement par journée ─────────────────────────────────────────── */
  const allDays = React.useMemo(() => {
    const byDate = {};
    for (const tr of trades || []) {
      const key = dayKeyOf(tr);
      if (!key) continue;
      (byDate[key] ||= []).push(tr);
    }
    return Object.keys(byDate)
      .sort()
      .reverse()
      .map((date) => {
        const list = [...byDate[date]].sort((a, b) =>
          String(a.entryTime || a.entry_time || "").localeCompare(String(b.entryTime || b.entry_time || ""))
        );
        const pnl = list.reduce((s, tr) => s + (Number(tr.pnl) || 0), 0);
        const wins = list.filter((tr) => (Number(tr.pnl) || 0) > 0).length;
        const scores = list.map(computeTradeNote).filter(Boolean).map((n) => n.score);
        return {
          date,
          trades: list,
          pnl,
          wins,
          winRate: list.length > 0 ? (wins / list.length) * 100 : null,
          r: list.reduce((s, tr) => { const v = rMultiple(tr); return s + (Number.isFinite(v) ? v : 0); }, 0),
          note: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        };
      });
  }, [trades]);

  /* ── Fenêtre de lecture ───────────────────────────────────────────────────
     Les pastilles bornent le journal à une période : un journal se relit par
     tranches, pas d'un bloc depuis le premier trade. */
  const days = React.useMemo(() => {
    if (allDays.length === 0) return allDays;
    /* Fenêtre calée sur le calendrier (cf. `lib/ui/period`) : « 1 mois » part du
       1er du mois, pas de trente jours avant le dernier trade. L'ancre reste le
       jour le plus récent du journal et non aujourd'hui — un journal qu'on
       n'alimente plus depuis six semaines doit montrer sa dernière tranche. */
    const from = periodStart(period, new Date(`${allDays[0].date}T00:00:00`));
    if (!from) return allDays;
    return allDays.filter((d) => new Date(`${d.date}T00:00:00`) >= from);
  }, [allDays, period]);

  // Revenir en tête de pagination dès que la fenêtre change.
  React.useEffect(() => { setShownDays(DAYS_PER_PAGE); }, [period]);

  const periodTrades = React.useMemo(() => days.flatMap((d) => d.trades), [days]);

  const visibleDays = days.slice(0, shownDays);

  /* ── État vide ────────────────────────────────────────────────────────── */
  if (allDays.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 8, fontFamily: "var(--font-sans)" }} className="anim-1">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div id="tr4de-page-header-slot" style={{ marginLeft: "auto" }} />
        </div>
        <div style={{ ...CARD, padding: "64px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: T.accentBg,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
          }}>
            <BookOpen size={22} strokeWidth={1.75} color={T.text} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, color: T.text, marginBottom: 6 }}>{t("journal.empty")}</div>
          <div style={{ fontSize: 14, color: T.textSub, maxWidth: 380, lineHeight: 1.5 }}>{t("journal.emptySub")}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 8, fontFamily: "var(--font-sans)" }} className="anim-1">

      {/* ═══ UNE SEULE LIGNE DE TÊTE ═══
          Le bilan de période (chiffre héros + cinq mini-KPI) et le calendrier du
          mois ont disparu : ils répétaient ce que le tableau de bord et la page
          Calendrier montrent déjà, et repoussaient le journal — le contenu de la
          page — sous deux écrans de synthèse. Ne restent que les deux commandes
          qui n'existent nulle part ailleurs : la fenêtre de lecture et l'export. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div id="tr4de-page-header-slot" />
          <PeriodPills value={period} onChange={setPeriod} />
          <button
            type="button"
            aria-label={t("journal.exportAria")}
            onClick={() => exportJournalPdf({
              trades: periodTrades,
              dailyNotes,
              tradeNotes,
              currencySymbol: getCurrencySymbol(),
              title: t("journal.title"),
            })}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px",
              minHeight: 32, borderRadius: 999, border: "none", background: T.text,
              color: T.textInverted, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Download size={13} strokeWidth={1.75} /> {t("journal.exportPdf")}
          </button>
        </div>
      </div>

      {/* ═══ 4. LE JOURNAL, UNE CARTE PAR JOURNÉE ═══ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {visibleDays.length === 0 ? (
          <div style={{ ...CARD, fontSize: 14, color: T.textMut, padding: "24px 16px", textAlign: "center" }}>
            Aucun trade sur cette période.
          </div>
        ) : visibleDays.map((day) => (
          <DayCard
            key={day.date}
            day={day}
            note={dailyNotes[day.date] || ""}
            onNoteChange={(next) => updateDailyNote(day.date, next)}
            noteColor={noteColor}
            strategies={strategies}
            tradeStrategies={tradeStrategies}
          />
        ))}

        {/* « Voir plus » sous la liste : c'est là qu'on arrive en la parcourant,
            et non en haut de page comme quand il accompagnait le titre. */}
        {days.length > shownDays && (
          <button
            type="button"
            onClick={() => setShownDays((n) => n + DAYS_PER_PAGE)}
            style={{
              alignSelf: "center", padding: "9px 18px", borderRadius: 999,
              border: `1px solid ${T.border}`, background: T.white, color: T.text,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {t("journal.showMore").replace("{n}", String(days.length - shownDays))}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Une journée = une carte : son en-tête porte la date et les chiffres du jour,
   puis les notes de session, puis les trades. L'ancienne mise en page posait
   ces trois blocs côte à côte dans une grille figée de 220 px, qui se cassait
   dès que la fenêtre rétrécissait.
   ------------------------------------------------------------------------- */
function DayCard({ day, note, onNoteChange, noteColor, strategies, tradeStrategies }) {
  const [open, setOpen] = React.useState(true);
  const [allTrades, setAllTrades] = React.useState(false);
  const shownTrades = allTrades ? day.trades : day.trades.slice(0, TRADES_PER_DAY);
  const hiddenCount = day.trades.length - shownTrades.length;
  const d = new Date(`${day.date}T00:00:00`);
  const label = isNaN(d.getTime())
    ? day.date
    : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const stats = [
    { label: t("common.trades"), value: String(day.trades.length) },
    { label: t("common.winRate"), value: day.winRate != null ? `${day.winRate.toFixed(0)}%` : "—" },
    { label: "R", value: fmtR(day.r), color: day.r > 0 ? T.pnlPos : day.r < 0 ? T.pnlNeg : T.textSub },
    {
      label: "Note",
      value: day.note != null ? `${day.note}/10` : "—",
      color: day.note != null ? noteColor(day.note) : T.textSub,
    },
  ];

  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* En-tête : date à gauche, chiffres du jour à droite. Le P&L y est le
          seul élément coloré — c'est ce qu'on cherche en parcourant. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            display: "inline-flex", alignItems: "baseline", gap: 10, minWidth: 0,
            background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{label}</span>
          <span style={{
            fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
            color: day.pnl > 0 ? T.pnlPos : day.pnl < 0 ? T.pnlNeg : T.textSub,
          }}>
            {day.pnl > 0 ? "+" : ""}{fmt(day.pnl, false)}
          </span>
        </button>

      </div>

      {/* Corps repliable : 0fr → 1fr anime la hauteur sans la mesurer. */}
      <div style={{
        display: "grid", gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows var(--dur-base) var(--ease-out)",
      }}>
        <div style={{ overflow: "hidden" }}>
          {/* Notes à GAUCHE, trades à DROITE : ce qu'on a écrit et ce qu'on a
              fait se lisent en vis-à-vis, au lieu de s'empiler — il fallait
              faire défiler toute la liste pour retrouver la note du jour.
              La colonne de notes est bornée : au-delà, une zone de saisie large
              devient pénible à relire. */}
          {/* Répartition : les notes prennent la moitié large, la liste se
              resserre. Le plafond de 340 px qui bornait la colonne de gauche a
              sauté — c'est la zone d'écriture qui mérite la place, la liste n'a
              que six colonnes courtes à tenir. */}
          <div className="tr4de-journal-day" style={{
            display: "grid", gridTemplateColumns: "minmax(320px, 1.15fr) minmax(0, 1fr)",
            gap: 20, alignItems: "start",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <DictatableTextarea
              placeholder={t("journal.dailyNotes")}
              value={note}
              onChange={onNoteChange}
              height={180}
              micSize={30}
              /* Aplat à peine perceptible : une encre noire posée à 1,2 % sur la
                 carte. Un gris opaque, même très clair, restait trop marqué —
                 et il aurait fallu lui trouver un équivalent en thème sombre.
                 Exprimé en transparence, il s'assombrit ou s'éclaircit tout seul
                 avec la surface qui le porte.
                 L'aplat suit les bords de la colonne et le texte se pose à
                 16 px à l'intérieur. Il débordait auparavant en marges
                 négatives pour aligner le texte sur les chiffres du dessous :
                 le texte se retrouvait alors collé au bord de la carte. */
              textareaStyle={{
                border: "none", borderRadius: 10,
                padding: "14px 16px", fontSize: 13, color: T.text,
                lineHeight: 1.55, resize: "none",
                background: "color-mix(in srgb, var(--color-text) 1.2%, transparent)",
              }}
              />

              {/* Les chiffres du jour ferment la colonne, sous les notes : on
                  écrit d'abord, on vérifie ensuite. Ni cadre ni aplat — la carte
                  est déjà une surface, tout contour y ajoutait un bloc dans le
                  bloc. Les colonnes s'alignent sur le cadre des notes. */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 8, padding: "4px 1px 0",
              }}>
                {stats.map((st) => (
                  <div key={st.label} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 10, lineHeight: 1, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {st.label}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums", color: st.color || T.text,
                    }}>
                      {st.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* La carte est déjà une surface : la liste s'y pose à plat, sans
                sa propre ombre ni son propre padding horizontal. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <TradesList
                trades={shownTrades}
                strategies={strategies}
                tradeStrategies={tradeStrategies}
                columns={JOURNAL_COLUMNS}
                style={{ background: "transparent", boxShadow: "none", padding: 0 }}
              />
              {(hiddenCount > 0 || allTrades) && (
                <button
                  type="button"
                  onClick={() => setAllTrades((v) => !v)}
                  style={{
                    alignSelf: "flex-start", padding: 0, border: "none", background: "transparent",
                    color: T.text, opacity: 0.5, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit", textDecoration: "underline",
                  }}
                >
                  {allTrades
                    ? t("journal.showFewerTrades")
                    : t("journal.showMoreTrades").replace("{n}", String(hiddenCount))}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
