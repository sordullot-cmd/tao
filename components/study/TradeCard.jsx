"use client";

import React from "react";
import { LineChart, Replace, X, PanelBottom, PanelRight } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { IconButton } from "@/components/ui/form";
import { SymbolBadge } from "@/components/ui/da";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { useTradeScreenshots } from "@/lib/hooks/useTradeScreenshots";
import { useTradeNotes } from "@/lib/hooks/useTradeNotes";
import { useTradeStrategyLinks } from "@/lib/hooks/useTradeStrategyLinks";
import { fmtMoney, fmtDay, pnlOf, sideOf, dayOf } from "@/components/study/tradeFormat";

const timeOf = (v) => (v ? String(v).slice(0, 5) : "");

/**
 * Le trade étudié, en tête de note : ce qui s'est passé à gauche, le chart à
 * droite.
 *
 * Tout est LU sur le trade, rien n'est recopié dans la note : un trade corrigé
 * dans le journal (frais, sortie, capture ajoutée) se corrige ici aussi. « Ce
 * que tu as écrit » est la note du trade dans le journal — la confronter à ce
 * qu'on en comprend aujourd'hui est la moitié de l'exercice.
 *
 * `place` / `onPlace` : le choix « sous la vidéo » ou « à côté », offert
 * seulement quand la note le permet (vidéo en haut, écran large). À côté, la
 * carte n'a qu'une demi-largeur : le chart passe SOUS le texte, côte à côte
 * chacun n'aurait eu qu'un quart de la page.
 */
export default function TradeCard({ trade, tradeId, strategies = [], onChange, onRemove, onView, place = null, onPlace = null }) {
  const { urls: shots } = useTradeScreenshots();
  const { notes } = useTradeNotes();
  const links = useTradeStrategyLinks();

  if (!trade) {
    return (
      <div style={{ borderRadius: 14, background: FIELD_BG, padding: 16, display: "flex", alignItems: "center", gap: 12, ...TYPE.body, color: T.textMut }}>
        <span style={{ flex: 1 }}>Ce trade n&apos;est plus dans le journal.</span>
        <Act onClick={onChange}>Changer de trade</Act>
        <Act onClick={onRemove} danger>Retirer</Act>
      </div>
    );
  }

  const pnl = pnlOf(trade);
  const shot = shots[tradeId];
  const written = notes?.[tradeId];
  const setups = (links[tradeId] || [])
    .map(id => strategies.find(s => String(s.id) === String(id))?.name)
    .filter(Boolean);
  const entryT = timeOf(trade.entry_time || trade.entryTime);
  const exitT = timeOf(trade.exit_time || trade.exitTime);
  const rows = [
    setups.length ? ["Setup", setups.join(", ")] : null,
    trade.quantity != null ? ["Taille", String(trade.quantity)] : null,
  ].filter(Boolean);

  const stacked = place === "side";
  return (
    <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: stacked ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", borderRadius: 14, background: FIELD_BG, overflow: "hidden" }}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {/* Changer / retirer en icônes dans l'en-tête : en bas de la carte, ils
            ajoutaient une rangée et un vide variable selon la hauteur du chart. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SymbolBadge symbol={trade.symbol} size={22} />
          <span style={{ ...TYPE.headline, fontWeight: 600, color: T.text }}>{trade.symbol || "—"}</span>
          <span style={{ ...TYPE.caption2, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, background: HAIRLINE, color: T.textSub }}>
            {sideOf(trade)}
          </span>
          <div style={{ display: "flex", gap: 2, marginLeft: "auto", marginRight: -6 }}>
            {onPlace && (
              <IconButton aria-label={stacked ? "Mettre le trade sous la vidéo" : "Mettre le trade à côté de la vidéo"}
                          title={stacked ? "Sous la vidéo" : "À côté de la vidéo"}
                          onClick={() => onPlace(stacked ? "below" : "side")}>
                {stacked ? <PanelBottom size={14} strokeWidth={1.75} /> : <PanelRight size={14} strokeWidth={1.75} />}
              </IconButton>
            )}
            <IconButton aria-label="Changer de trade" title="Changer de trade" onClick={onChange}>
              <Replace size={14} strokeWidth={1.75} />
            </IconButton>
            <IconButton tone="danger" aria-label="Retirer le trade" title="Retirer" onClick={onRemove}>
              <X size={14} strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
        <div style={{ ...TYPE.label, color: T.textMut, marginTop: -4 }}>
          {fmtDay(dayOf(trade))}{entryT ? ` · ${entryT}${exitT ? ` à ${exitT}` : ""}` : ""}
        </div>
        <div style={{ ...TYPE.title1, ...TABULAR, color: pnl > 0 ? T.green : pnl < 0 ? T.red : T.text }}>{fmtMoney(pnl)}</div>
        {rows.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 16, rowGap: 6, ...TYPE.label }}>
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color: T.textMut }}>{k}</span>
                <span style={{ ...TABULAR, color: T.text }}>{v}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        {written && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ ...TYPE.caption2, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMut }}>Ce que tu as écrit</span>
            <span style={{ ...TYPE.body, color: T.text, whiteSpace: "pre-wrap" }}>{written}</span>
          </div>
        )}
      </div>
      <div style={{ minHeight: stacked ? 160 : 200, display: "flex", alignItems: "center", justifyContent: "center", ...(stacked ? { borderTop: `1px solid ${HAIRLINE}` } : { borderLeft: `1px solid ${HAIRLINE}` }) }}>
        {shot ? (
          <button type="button" onClick={() => onView(shot)} aria-label="Agrandir le chart"
                  style={{ all: "unset", cursor: "zoom-in", width: "100%", height: "100%" }}>
            <img src={shot} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, ...TYPE.label, color: T.textMut }}>
            <LineChart size={22} strokeWidth={1.5} />
            Pas de chart sur ce trade.
          </div>
        )}
      </div>
    </div>
  );
}

function Act({ onClick, danger = false, children }) {
  return (
    <button type="button" onClick={onClick}
            style={{ all: "unset", cursor: "pointer", ...TYPE.label, color: T.textSub }}
            onMouseEnter={(e) => { e.currentTarget.style.color = danger ? T.red : T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.textSub; }}>
      {children}
    </button>
  );
}
