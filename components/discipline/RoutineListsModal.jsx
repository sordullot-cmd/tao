"use client";

/**
 * Listes de routine — en créer, les nommer, les lier à une stratégie.
 *
 * Cet écran existe pour que le popover de la page Discipline n'ait pas à le
 * faire. Le popover sert au geste QUOTIDIEN — choisir sa liste, cocher ses
 * règles — et y loger la gestion l'aurait rendu illisible pour un réglage qu'on
 * touche trois fois par an.
 *
 * LE LIEN AVEC UNE STRATÉGIE est facultatif, et c'est délibéré : on se fabrique
 * souvent une routine avant d'avoir formalisé la stratégie qui va avec. Une
 * liste non liée fonctionne exactement pareil ; le lien ne sert qu'à retrouver
 * la routine depuis la stratégie.
 *
 * ⚠️ À MONTER SEULEMENT QUAND ELLE S'OUVRE. `useStrategies` lance une requête
 * Supabase à son montage : la laisser montée en permanence ferait interroger la
 * table `strategies` à chaque visite de la page Discipline, pour une fenêtre
 * qu'on ouvre trois fois par an. Rien n'est perdu à l'écran — `Modal` joue son
 * animation de sortie AVANT d'appeler `onClose`, donc avant le démontage.
 *
 * ⚠️ Supprimer une liste NE TOUCHE PAS l'historique des coches : les journées
 * déjà colorées dans la heatmap le restent (cf. `dayProgress`, qui ignore
 * simplement les règles qu'aucune liste ne revendique plus). C'est voulu —
 * effacer le passé parce qu'on change de méthode aujourd'hui serait perdre la
 * trace de ce qu'on a réellement fait.
 */

import React, { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { T, HAIRLINE } from "@/lib/ui/tokens";
import { Modal, Input, Select, PillButton, ScrollArea } from "@/components/ui/form";
import { useStrategies } from "@/lib/hooks/useUserData";
import {
  addList,
  bindListToStrategy,
  duplicateList,
  listProgress,
  removeList,
  renameList,
  setActiveList,
} from "@/lib/routineChecklist";

export default function RoutineListsModal({ open, store, checks = {}, onChange, onClose }) {
  const { strategies } = useStrategies();
  const [draft, setDraft] = useState("");
  /* Confirmation EN LIGNE plutôt que `window.confirm` : dans la WebView de
     l'app de bureau, le dialogue natif arrive sans le style du site et bloque
     tout le rendu. Deux clics sur le même bouton suffisent à protéger. */
  const [confirmId, setConfirmId] = useState(null);

  const create = () => {
    const name = draft.trim();
    if (!name) return;
    onChange(st => addList(st, name));
    setDraft("");
  };

  return (
    <Modal open={open} title="Listes de routine" onClose={onClose} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.55, margin: 0 }}>
          Une liste par façon de trader. Celle qui est active se coche depuis la
          page et depuis le menu de la barre d&apos;état.
        </p>

        <ScrollArea style={{ maxHeight: 360, display: "flex", flexDirection: "column" }}>
          {store.lists.map((l, idx) => {
            const p = listProgress(l, checks);
            const active = l.id === store.activeId;
            const confirming = confirmId === l.id;
            return (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 4px",
                  borderTop: idx === 0 ? "none" : HAIRLINE,
                }}
              >
                {/* Pastille d'activation : un clic suffit, pas de bouton « Utiliser ». */}
                <button
                  type="button"
                  onClick={() => onChange(st => setActiveList(st, l.id))}
                  title={active ? "Liste active" : "Rendre active"}
                  aria-label={active ? "Liste active" : "Rendre active"}
                  style={{
                    width: 14, height: 14, flexShrink: 0, padding: 0,
                    borderRadius: 999, cursor: "pointer",
                    border: active ? "none" : `1px solid ${T.border}`,
                    background: active ? T.text : "transparent",
                  }}
                />

                <Input
                  compact
                  value={l.name}
                  onChange={e => onChange(st => renameList(st, l.id, e.target.value))}
                  placeholder="Nom de la liste"
                  style={{ flex: "1 1 160px", minWidth: 0 }}
                />

                <Select
                  value={l.strategyId || ""}
                  onChange={e => onChange(st => bindListToStrategy(st, l.id, e.target.value || null))}
                  style={{ flex: "1 1 150px", minWidth: 0, fontSize: 12 }}
                >
                  <option value="">Aucune stratégie</option>
                  {(strategies || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>

                <span style={{
                  fontSize: 11, color: T.textMut, fontVariantNumeric: "tabular-nums",
                  flexShrink: 0, minWidth: 44, textAlign: "right",
                }}>
                  {p.done}/{p.total}
                </span>

                <PillButton
                  compact
                  variant="ghost"
                  title="Dupliquer"
                  aria-label="Dupliquer la liste"
                  onClick={() => onChange(st => duplicateList(st, l.id))}
                >
                  <Copy size={13} strokeWidth={1.75} />
                </PillButton>

                <PillButton
                  compact
                  variant={confirming ? "danger" : "ghost"}
                  title={confirming ? "Confirmer la suppression" : "Supprimer"}
                  aria-label={confirming ? "Confirmer la suppression" : "Supprimer la liste"}
                  onClick={() => {
                    if (!confirming) { setConfirmId(l.id); return; }
                    onChange(st => removeList(st, l.id));
                    setConfirmId(null);
                  }}
                  onBlur={() => setConfirmId(null)}
                >
                  {confirming
                    ? <span style={{ fontSize: 11, fontWeight: 600 }}>Confirmer</span>
                    : <Trash2 size={13} strokeWidth={1.75} />}
                </PillButton>
              </div>
            );
          })}
        </ScrollArea>

        <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: HAIRLINE, paddingTop: 12 }}>
          <Input
            compact
            value={draft}
            placeholder="Nouvelle liste — « Scalp ouverture », « Swing FVG »…"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <PillButton compact variant="primary" onClick={create} disabled={!draft.trim()}>
            <Plus size={13} strokeWidth={2} />
            <span>Créer</span>
          </PillButton>
        </div>
      </div>
    </Modal>
  );
}
