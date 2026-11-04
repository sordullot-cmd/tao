"use client";

import React, { useMemo, useState } from "react";
import { T, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { PeriodPills } from "@/components/ui/da";
import { Input, Modal, PillButton } from "@/components/ui/form";
import { fmtMoney, fmtDay, pnlOf, sideOf, dayOf } from "@/components/study/tradeFormat";

/* Au-delà, la liste s'arrête et invite à affiner : des milliers de lignes
   montées d'un coup figent la modale, et personne ne fait défiler si loin
   pour retrouver un trade — on tape son instrument ou sa date. */
const LIMIT = 200;

/**
 * Choix de trades à relier à une note d'étude.
 *
 * Contrairement au playbook, qui ne propose que les trades de SA stratégie, on
 * puise ici dans tout le journal : un concept (un FVG, une prise de liquidité)
 * traverse les stratégies. D'où la recherche, que le playbook n'avait pas à
 * porter. Plusieurs d'un coup : on relie souvent en relisant une semaine.
 */
export default function TradePicker({ trades, taken, onClose, onAdd }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  const available = useMemo(() => trades
    .filter(tr => tr?.id != null && !taken.has(String(tr.id)))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), [trades, taken]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available.filter(tr => {
      if (filter === "win" && !(pnlOf(tr) > 0)) return false;
      if (filter === "loss" && !(pnlOf(tr) <= 0)) return false;
      if (!q) return true;
      /* Instrument ou date : ce sont les deux choses qu'on a en tête quand on
         cherche « ce trade sur NQ du 12 ». */
      return String(tr.symbol || "").toLowerCase().includes(q) || dayOf(tr).includes(q);
    });
  }, [available, filter, query]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const picked = [...selected];

  return (
    <Modal
      open
      title="Relier des trades"
      onClose={onClose}
      width={620}
      footer={
        <>
          <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" onClick={() => onAdd(picked)} disabled={picked.length === 0}>
            {picked.length > 0 ? `Relier ${picked.length} trade${picked.length > 1 ? "s" : ""}` : "Relier"}
          </PillButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Instrument ou date (2026-10)…"
                 aria-label="Rechercher un trade" style={{ flex: "1 1 200px" }} autoFocus />
          <PeriodPills value={filter} onChange={setFilter} rail size={12}
                       options={[{ id: "all", label: "Tous" }, { id: "win", label: "Gagnants" }, { id: "loss", label: "Perdants" }]} />
        </div>
        {available.length === 0 ? (
          <div style={{ ...TYPE.body, color: T.textMut, padding: "16px 0" }}>
            {trades.length === 0 ? "Aucun trade dans le journal pour l'instant." : "Tous les trades sont déjà reliés à cette note."}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ ...TYPE.body, color: T.textMut, padding: "16px 0" }}>Aucun trade ne correspond.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {visible.slice(0, LIMIT).map((tr, i) => {
              const id = String(tr.id);
              const pnl = pnlOf(tr);
              const time = tr.entryTime || tr.entry_time;
              return (
                <label key={id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer",
                  borderTop: i > 0 ? `1px solid ${HAIRLINE}` : "none",
                }}>
                  <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)}
                         aria-label={`${tr.symbol || "Trade"} du ${fmtDay(dayOf(tr))}`}
                         style={{ width: 16, height: 16, accentColor: "var(--color-text)", flexShrink: 0 }} />
                  <span style={{ ...TYPE.callout, color: T.text, minWidth: 64 }}>{tr.symbol || "—"}</span>
                  <span style={{ ...TYPE.label, color: T.textSub, minWidth: 40 }}>{sideOf(tr)}</span>
                  <span style={{ ...TYPE.label, color: T.textMut, flex: 1, whiteSpace: "nowrap" }}>
                    {fmtDay(dayOf(tr))}{time ? ` · ${String(time).slice(0, 5)}` : ""}
                  </span>
                  <span style={{ ...TYPE.callout, ...TABULAR, fontWeight: 600, color: pnl > 0 ? T.green : pnl < 0 ? T.red : T.textMut }}>
                    {fmtMoney(pnl)}
                  </span>
                </label>
              );
            })}
            {visible.length > LIMIT && (
              <div style={{ ...TYPE.label, color: T.textMut, padding: "12px 4px" }}>
                {visible.length - LIMIT} trades de plus — affine la recherche pour les voir.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
