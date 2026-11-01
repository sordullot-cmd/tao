"use client";

import React from "react";
import { Plus } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t } from "@/lib/i18n";
import { fmt } from "@/lib/ui/format";
import { PERIODS, OUTCOMES, NO_STRATEGY } from "@/lib/tradeFilters";
import { TableFilter } from "@/components/ui/da";

/* ---------------------------------------------------------------------------
   Haut de la page Trades : les chiffres des trades filtrés, puis les filtres.

   La tête reprend celle de la page Stratégie (chiffres en colonnes, sans
   carte, l'action en haut à droite) et les filtres sont les `TableFilter` de
   la maquette. Des versions maison — pastilles, tuiles, chiffres en 28 px —
   détonnaient avec le reste de l'app.
   ------------------------------------------------------------------------- */

/* Les deux rangées sont en retrait de 28 px — 16 px de carte + 12 px de
   cellule —, à l'aplomb du contenu des lignes du tableau. L'import garde le
   bord droit, d'où son retrait négatif. */
const INSET = 28;

export const SORTS = ["date:desc", "date:asc", "pnl:desc", "pnl:asc"];

export default function TradesFilterBar({
  filters, onChange, accountOptions = [], strategyOptions = [],
  sort, onSort, stats, onImport,
}) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const opts = (ids, prefix) => ids.map(id => ({ id, label: t(`${prefix}.${id}`) }));
  const stratOptions = strategyOptions.length
    ? [...strategyOptions, { id: NO_STRATEGY, label: t("trades.noStrategy") }]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Même tête que la page Stratégie : les chiffres en colonnes, l'action
          calée en haut à droite de la même rangée. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 40, flexWrap: "wrap", minWidth: 0, padding: `0 ${INSET}px` }}>
        <Stats stats={stats} />
        {onImport && (
          <button
            type="button"
            onClick={onImport}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              marginLeft: "auto", marginRight: -INSET, alignSelf: "flex-start", flexShrink: 0,
              padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none",
              background: T.text, color: T.textInverted, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={14} strokeWidth={1.75} /> {t("trades.importBtn")}
          </button>
        )}
      </div>


      <div style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap", padding: `0 ${INSET}px` }}>
        <TableFilter label={t("trades.filterPeriod")} options={opts(PERIODS, "trades.period")} value={filters.period} onChange={(period) => set({ period })} />
        <TableFilter label={t("trades.filterOutcome")} options={opts(OUTCOMES, "trades.outcome")} value={filters.outcome} onChange={(outcome) => set({ outcome })} />
        <TableFilter label={t("trades.filterSide")} options={[{ id: "long", label: "Long" }, { id: "short", label: "Short" }]} value={filters.side} onChange={(side) => set({ side })} />
        {accountOptions.length > 1 && (
          <TableFilter label={t("addTrade.account")} options={accountOptions} value={filters.account} onChange={(account) => set({ account })} />
        )}
        {stratOptions.length > 0 && (
          <TableFilter multi label={t("trades.filterStrategy")} options={stratOptions} value={filters.strategies} onChange={(strategies) => set({ strategies })} />
        )}
        <TableFilter
          neutral
          label={t("trades.sortLabel")}
          options={SORTS.map(id => ({ id, label: t(`trades.sort.${id.replace(":", "_")}`) }))}
          value={sort}
          onChange={(id) => onSort(id || "date:desc")}
        />
      </div>
    </div>
  );
}

const money = (v) => `${v > 0 ? "+" : ""}${fmt(v, false)}`;

/* Une colonne de la tête, au gabarit des records de la page Stratégie :
   intitulé 13 px gris, valeur 24 px semi-grasse. Hauteurs fixes pour que les
   colonnes restent alignées quoi qu'elles contiennent. */
function Stat({ label, children }) {
  return (
    /* Les colonnes se partagent la largeur, comme les records de la page
       Stratégie : serrées à gauche, elles laissaient un grand vide jusqu'au
       bouton. */
    <div style={{ flex: "1 1 0", minWidth: 140, display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 13, lineHeight: "16px", height: 16, color: T.textSub, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{
        fontSize: 24, fontWeight: 600, lineHeight: "28px", letterSpacing: -0.5, height: 28,
        color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}>
        {children}
      </span>
    </div>
  );
}

function Stats({ stats }) {
  const s = stats || {};
  const none = !s.count;
  const pf = s.profitFactor == null ? "—" : Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞";
  return (
    <>
      <Stat label={t("trades.stat.trades")}>{String(s.count ?? 0)}</Stat>
      <Stat label={t("trades.stat.net")}>{none ? "—" : money(s.net)}</Stat>
      <Stat label={t("trades.stat.winRate")}>{none ? "—" : `${s.winRate}%`}</Stat>
      <Stat label={t("trades.stat.profitFactor")}>{pf}</Stat>
      {/* Meilleur et pire côte à côte dans UNE colonne : les deux bornes d'une
          même question (« jusqu'où ça a tiré ? »), chacune avec son libellé —
          fondues en « +400 / −210 », on ne savait plus lequel était lequel. */}
      <div style={{ flex: "1.6 1 0", minWidth: 240, display: "flex", gap: 24 }}>
        <Stat label={t("trades.stat.best")}>{s.best == null ? "—" : money(s.best)}</Stat>
        <Stat label={t("trades.stat.worst")}>{s.worst == null ? "—" : money(s.worst)}</Stat>
      </div>
    </>
  );
}
