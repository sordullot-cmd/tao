"use client";

/* ============================================================================
   Liste de trades — brique unique partagée par toutes les pages qui affichent
   des trades (détail d'un compte, dashboard, détail d'une prop firm…).

   La page Trades garde SON tableau : c'est la vue exhaustive et éditable, avec
   filtres, sélection multiple et panneau de détail. Cette liste-ci est sa
   contrepartie « lecture » : quelques trades, aucun défilement horizontal.

   Principes :
     • toutes les colonnes, instrument compris, prennent une part strictement
       égale de la largeur (`1 1 0`) — même gouttière d'un bout à l'autre ;
     • chaque page choisit SES colonnes via `columns` (une carte de demi-largeur
       n'en tient pas dix) ;
     • rien n'est perdu : tout ce qui n'est pas dans la ligne — colonne non
       demandée, colonne masquée en petit écran, champ jamais affiché — se
       retrouve dans le détail dépliable de la ligne.

   Règle du projet : aucune couleur en dur, tout passe par les tokens `T`.
   ========================================================================== */

import React from "react";
import { ChevronDown } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { fmt } from "@/lib/ui/format";
import { rMultiple, fmtR } from "@/lib/userPrefs";
import { calculateFees } from "@/lib/tradeFees";
import { CARD, TH, DirectionTag, SymbolCell } from "@/components/ui/da";

/* --- Dérivations ------------------------------------------------------------
   Mêmes règles que la page Trades (source unique de vérité fonctionnelle) : le
   modèle de trade ne porte ni durée, ni session, ni jour — ils se déduisent des
   heures d'entrée/sortie et de la date. Tout champ absent affiche « — ».
   ------------------------------------------------------------------------- */

/** Heure lisible « HH:MM(:SS) ». Accepte une heure déjà formatée ou une date. */
export const fmtTime = (v) => {
  if (!v) return "—";
  if (/^\d{1,2}:\d{2}/.test(String(v))) return String(v);
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

/** Secondes depuis minuit d'une heure « HH:MM(:SS) ». null si illisible. */
const secOfTime = (v) => {
  const m = String(v ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
};

/** Durée du trade = heure de sortie − heure d'entrée (dérivée, pas stockée). */
export const durationLabel = (tr) => {
  const s1 = secOfTime(tr?.entryTime || tr?.entry_time);
  const s2 = secOfTime(tr?.exitTime || tr?.exit_time);
  if (s1 === null || s2 === null) return "—";
  let sec = s2 - s1;
  if (sec < 0) sec += 24 * 3600;
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return mm === 0 ? `${h}h` : `${h}h${String(mm).padStart(2, "0")}`;
};

/** Session de marché déduite de l'heure d'entrée (Asia / London / NY). */
export const sessionLabel = (tr) => {
  const s = secOfTime(tr?.entryTime || tr?.entry_time);
  if (s === null) return "—";
  const h = Math.floor(s / 3600);
  if (h < 8) return "Asia";
  if (h < 13) return "London";
  if (h < 22) return "NY";
  return "Asia";
};

/** Jour de la semaine déduit de la date du trade. */
export const weekdayLabel = (tr) => {
  const d = new Date(tr?.date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { weekday: "short" });
};

/** Quantité de contrats / lots. null si le champ n'est pas renseigné. */
export const qtyOf = (tr) => {
  const q = Number(tr?.quantity ?? tr?.qty ?? tr?.lots ?? tr?.lot_size);
  return Number.isFinite(q) && q > 0 ? q : null;
};

/**
 * Frais réellement déduits. Le P&L exposé par useTrades() est déjà NET : si le
 * brut est connu, les frais valent brut − net, sinon on applique le barème
 * central de lib/tradeFees.
 */
export const feesOf = (tr) => {
  if (tr == null) return 0;
  if (tr.pnlGross != null && Number.isFinite(Number(tr.pnlGross))) {
    return Number(tr.pnlGross) - (Number(tr.pnl) || 0);
  }
  return calculateFees(tr);
};

/** Clé stable d'un trade (identique à la page Trades). */
export const tradeKeyOf = (tr) =>
  tr?.id != null
    ? `id:${tr.id}`
    : `${tr?.date}_${tr?.symbol}_${tr?.entry}_${tr?.exit ?? ""}_${tr?.direction ?? ""}_${tr?.entryTime || ""}_${tr?.exitTime || ""}_${tr?.pnl ?? ""}`;

/**
 * Toutes les clés sous lesquelles un trade peut être indexé dans la table
 * `trade_strategies`. Reprend EXACTEMENT les clés écrites par la page Trades,
 * sinon les stratégies assignées n'apparaîtraient pas ici.
 */
export const strategyIndexKeys = (tr) => {
  const keys = [
    tr?.id,
    tradeKeyOf(tr),
    `${tr?.date || ""}${tr?.symbol || ""}${tr?.entry ?? ""}`,
    (tr?.date && tr?.symbol && tr?.entry != null)
      ? `${tr.date}${tr.symbol}${parseFloat(tr.entry).toFixed(2)}`
      : null,
  ];
  return Array.from(new Set(keys.filter(k => k != null).map(String)));
};

/* --- Styles ---------------------------------------------------------------- */

/** Part de largeur commune à TOUTES les colonnes, instrument compris. */
const COL = { flex: "1 1 0", minWidth: 0 };

/** Cellule de données : 13px, encre atténuée, chiffres alignés. */
const CELL = {
  ...COL,
  fontSize: 13, fontWeight: 500, lineHeight: 1,
  color: T.textSub, textAlign: "left",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  fontVariantNumeric: "tabular-nums",
};

/**
 * En-tête de colonne, calé sur la même colonne que les cellules.
 *
 * Taille laissée à `TH` (12 px) : c'est ce qu'affichent les en-têtes des
 * tableaux de la page Cashflow (`ListHeader`) et du tableau des comptes. Les
 * 11 px d'ici étaient un cran plus petits que partout ailleurs, pour un texte
 * déjà posé à 40 % d'opacité.
 */
const TH_CELL = { ...TH, ...COL, textAlign: "left", whiteSpace: "nowrap" };

const pnlColor = (v) => (v > 0 ? T.pnlPos : v < 0 ? T.pnlNeg : T.textSub);

/* --- Colonnes ---------------------------------------------------------------
   `hide` désigne la fenêtre à partir de laquelle la colonne quitte la ligne
   (classes utilitaires de globals.css). Une colonne qui peut disparaître est
   toujours reprise dans le détail dépliable.
   ------------------------------------------------------------------------- */

const COLUMN_DEFS = {
  symbol: {
    label: "Instrument",
    // Le code repasse sous le nom : dans une colonne de largeur égale aux
    // autres, les deux ne tiennent pas côte à côte.
    cell: (c) => <SymbolCell symbol={c.tr.symbol} size={24} nameSize={13} />,
    wrap: { display: "flex", alignItems: "center" },
  },
  direction: {
    label: "Sens",
    cell: (c) => <DirectionTag direction={c.tr.direction || c.tr.side} />,
    wrap: { display: "flex", alignItems: "center" },
    text: (c) => (String(c.tr.direction || c.tr.side || "").toLowerCase().startsWith("s") ? "Short" : "Long"),
  },
  account: {
    label: "Compte",
    hide: "mobile",
    text: (c) => c.account?.name || "—",
  },
  strategy: {
    label: "Stratégie",
    hide: "mobile",
    // Pastille de couleur + nom, comme le panneau de détail de la page Trades.
    cell: (c) => (c.strats.length === 0 ? (
      <span style={{ color: T.textMut }}>—</span>
    ) : (
      <>
        <span aria-hidden style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: c.strats[0].color || T.textMut,
        }} />
        <span style={{ color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.strats[0].name}
        </span>
        {c.strats.length > 1 && (
          <span style={{ color: T.textMut, flexShrink: 0 }}>{`+${c.strats.length - 1}`}</span>
        )}
      </>
    )),
    wrap: { display: "flex", alignItems: "center", gap: 6 },
    text: (c) => (c.strats.length ? c.strats.map(s => s.name).join(", ") : "—"),
  },
  date: {
    label: "Date",
    cell: (c) => (
      <>
        {c.dateLabel}
        {c.entryT !== "—" && <span style={{ color: T.textMut }}>{` · ${c.entryT}`}</span>}
      </>
    ),
    text: (c) => c.dateLabel,
  },
  session: { label: "Session", hide: "narrow", text: (c) => sessionLabel(c.tr) },
  duration: { label: "Durée", hide: "mobile", text: (c) => durationLabel(c.tr) },
  lots: {
    label: "Lots", hide: "narrow",
    style: { color: T.text },
    text: (c) => (c.lots != null ? String(c.lots) : "—"),
  },
  // Frais en négatif : le P&L de la ligne est déjà net, sans eux on ne sait pas
  // ce que le brut a perdu en route.
  fees: { label: "Frais", hide: "mobile", text: (c) => (c.fees > 0 ? `-${fmt(c.fees, false)}` : "—") },
  r: {
    label: "R",
    style: (c) => ({ color: pnlColor(c.net) }),
    text: (c) => fmtR(rMultiple({ ...c.tr, pnl: c.net })),
  },
  pnl: {
    label: "P&L net",
    style: (c) => ({ fontSize: 14, fontWeight: 600, color: pnlColor(c.net) }),
    text: (c) => `${c.net > 0 ? "+" : ""}${fmt(c.net, false)}`,
  },
};

/** Colonnes par défaut : la liste complète du détail d'un compte. */
export const DEFAULT_TRADE_COLUMNS = [
  "symbol", "direction", "strategy", "date", "session", "duration", "lots", "fees", "r", "pnl",
];

/** Jeu court, pour les cartes étroites (dashboard). */
export const COMPACT_TRADE_COLUMNS = ["symbol", "direction", "date", "r", "pnl"];

/** Champs qui ne sont JAMAIS des colonnes : ils servent à relire un trade. */
const DETAIL_ONLY = [
  { label: "Prix d'entrée", value: (c) => (Number.isFinite(c.entryPx) ? fmt(c.entryPx, false) : "—") },
  { label: "Prix de sortie", value: (c) => (Number.isFinite(c.exitPx) ? fmt(c.exitPx, false) : "—") },
  { label: "Heure d'entrée", value: (c) => c.entryT },
  { label: "Heure de sortie", value: (c) => c.exitT },
  { label: "P&L %", value: (c) => c.pctLabel },
  { label: "Jour", value: (c) => weekdayLabel(c.tr), capitalize: true },
];

const hideClass = (def) => (def.hide === "narrow" ? "hide-narrow" : def.hide === "mobile" ? "hide-mobile" : undefined);

export default function TradesList({
  trades = [],
  strategies = [],
  tradeStrategies = {},
  accounts = [],
  columns = DEFAULT_TRADE_COLUMNS,
  empty = "Aucun trade.",
  style,
}) {
  const [hover, setHover] = React.useState(null);
  const [open, setOpen] = React.useState(null);

  const cols = columns.filter(id => COLUMN_DEFS[id]);

  /** Définitions des stratégies assignées à ce trade (vide si aucune). */
  const strategiesOf = (tr) => {
    const ids = Array.from(new Set(strategyIndexKeys(tr).flatMap(k => tradeStrategies[k] || [])));
    return ids.map(id => (strategies || []).find(s => s.id === id)).filter(Boolean);
  };

  return (
    <div style={{ ...CARD, overflow: "hidden", ...style }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>

        {/* En-tête, dans la carte, aligné sur les cellules (12 px de retrait
            comme les lignes). Les libellés servent à interpréter « 1.4 » ou
            « 3 » : ils gardent la mise en retrait des autres tableaux du site —
            12 px à 40 % d'opacité (cf. `ListHeader` de Cashflow). */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 12px", opacity: 0.4 }}>
          {cols.map(id => (
            <span key={id} className={hideClass(COLUMN_DEFS[id])} style={TH_CELL}>
              {COLUMN_DEFS[id].label}
            </span>
          ))}
          <span style={{ width: 16, flexShrink: 0 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {trades.length === 0 ? (
            <div style={{ fontSize: 14, color: T.textMut, padding: "12px 8px" }}>{empty}</div>
          ) : trades.map((tr, i) => {
            const key = tr.id ?? i;
            const isOpen = open === key;
            const d = new Date(tr.date);
            const net = Number(tr.pnl) || 0;
            const entryPx = Number(tr.entry);
            const c = {
              tr,
              net, entryPx, exitPx: Number(tr.exit),
              fees: feesOf(tr),
              lots: qtyOf(tr),
              strats: strategiesOf(tr),
              account: (accounts || []).find(a => a.id === tr.account_id) || null,
              entryT: fmtTime(tr.entryTime || tr.entry_time),
              exitT: fmtTime(tr.exitTime || tr.exit_time),
              dateLabel: isNaN(d.getTime())
                ? "—"
                : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
              // % : rendement approché sur le notionnel d'entrée (même formule
              // que la page Trades). « — » si le prix d'entrée est inconnu.
              pctLabel: Number.isFinite(entryPx) && entryPx !== 0
                ? `${net > 0 ? "+" : ""}${((net / (entryPx * 100)) * 100).toFixed(2)}%`
                : "—",
            };

            /* Détail : les champs de relecture, plus toute colonne absente de la
               ligne — non demandée par la page, ou masquée en petit écran. */
            const details = [
              ...DETAIL_ONLY.map(f => ({ label: f.label, value: f.value(c), capitalize: f.capitalize })),
              ...Object.keys(COLUMN_DEFS)
                .filter(id => id !== "symbol" && COLUMN_DEFS[id].text)
                .filter(id => !cols.includes(id) || COLUMN_DEFS[id].hide)
                .map(id => ({ label: COLUMN_DEFS[id].label, value: COLUMN_DEFS[id].text(c) })),
            ];

            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => setOpen(v => (v === key ? null : key))}
                  aria-expanded={isOpen}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    width: "100%", textAlign: "left", font: "inherit", border: "none",
                    display: "flex", alignItems: "center", gap: 12, padding: "0 12px",
                    height: 48, boxSizing: "border-box", borderRadius: 10, cursor: "pointer",
                    background: (hover === key || isOpen) ? T.rowHighlight : "transparent",
                    transition: "background var(--dur-fast) var(--ease-out)",
                  }}
                >
                  {cols.map(id => {
                    const def = COLUMN_DEFS[id];
                    const extra = typeof def.style === "function" ? def.style(c) : def.style;
                    return (
                      <span
                        key={id}
                        className={hideClass(def)}
                        style={{ ...(def.wrap ? { ...COL, ...def.wrap } : CELL), ...extra }}
                      >
                        {def.cell ? def.cell(c) : def.text(c)}
                      </span>
                    );
                  })}

                  <ChevronDown
                    size={16}
                    aria-hidden
                    style={{
                      flexShrink: 0, color: T.textMut, opacity: hover === key || isOpen ? 0.8 : 0.35,
                      transform: isOpen ? "rotate(180deg)" : "none",
                      transition: "transform var(--dur-base) var(--ease-out), opacity var(--dur-fast) var(--ease-out)",
                    }}
                  />
                </button>

                {/* Détail replié : 0fr → 1fr anime la hauteur sans la mesurer. */}
                <div style={{
                  display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr",
                  transition: "grid-template-rows var(--dur-base) var(--ease-out)",
                }}>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      /* 44 = padding 12 + vignette 24 + gap 8 : le détail
                         s'aligne exactement sous le nom de l'instrument. */
                      gap: "10px 24px", padding: "12px 12px 14px 44px",
                    }}>
                      {details.map(f => (
                        <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 11, color: T.text, opacity: 0.45, whiteSpace: "nowrap" }}>{f.label}</span>
                          <span style={{
                            fontSize: 13, fontWeight: 500, color: T.text, fontVariantNumeric: "tabular-nums",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            textTransform: f.capitalize ? "capitalize" : "none",
                          }}>
                            {f.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
