"use client";

/**
 * Onglet « Programmes » — les sessions qu'on n'a pas à décider.
 *
 * C'est la partie du dispositif qui travaille quand la motivation ne travaille
 * plus. Une session qu'on lance demande une décision chaque jour, et cette
 * décision finit par se perdre ; un programme la prend une fois pour toutes les
 * semaines à venir.
 *
 * Le déclenchement demande que l'app soit ouverte (cf. `useScheduleRunner` dans
 * lib/focus/guard.ts) : c'est dit à l'écran, parce qu'un programme dont on croit
 * qu'il tourne en permanence est pire que pas de programme du tout.
 */

import React, { useState } from "react";
import { Plus, Pencil, CalendarClock, Info } from "lucide-react";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { BTN } from "@/lib/ui/buttons";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, CheckBox, Field, Input, Modal, PillButton, SectionTitle } from "@/components/ui/da";
import {
  DAY_LABELS, MODES, fmtHhMm, listSize, newId, nextRun,
} from "@/lib/focus/model";
import { fmtDur } from "@/lib/focus/stats";

const MODE_IDS = ["normal", "deep", "locked"];

/** « 09:30 » ↔ minutes depuis minuit : ce que sait lire `<input type="time">`. */
const toTime = (min) => fmtHhMm(min);
const fromTime = (v) => {
  const [h, m] = (v || "09:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function ScheduleEditor({ schedule, store, onSave, onDelete, onClose }) {
  const [name, setName] = useState(schedule?.name || "");
  const [days, setDays] = useState(schedule?.days || [0, 1, 2, 3, 4]);
  const [startMin, setStartMin] = useState(schedule?.startMin ?? 9 * 60);
  const [durationMin, setDurationMin] = useState(schedule?.durationMin ?? 90);
  const [mode, setMode] = useState(schedule?.mode || "deep");
  const [blocklistIds, setBlocklistIds] = useState(schedule?.blocklistIds || []);
  const [presetId, setPresetId] = useState(schedule?.presetId ?? null);

  const preset = presetId ? store.presets.find(p => p.id === presetId) : null;

  const toggleDay = (d) => setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));
  const toggleList = (id) => setBlocklistIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const submit = () => {
    onSave({
      id: schedule?.id || newId("s"),
      name: name.trim() || preset?.name || "Programme",
      presetId,
      days,
      startMin,
      durationMin: Math.max(5, Number(durationMin) || 60),
      enabled: schedule?.enabled !== false,
      blocklistIds: preset ? [] : blocklistIds,
      mode,
      lastFired: schedule?.lastFired ?? null,
    });
    onClose();
  };

  return (
    <Modal
      open
      title={schedule ? "Modifier le programme" : "Nouveau programme"}
      onClose={onClose}
      onDelete={schedule && onDelete ? () => { onDelete(schedule.id); onClose(); } : undefined}
      width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
          <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" disabled={!days.length} onClick={submit}>
            {schedule ? "Enregistrer" : "Créer"}
          </PillButton>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Nom">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Matinée sans écran" autoFocus />
        </Field>

        <Field label="Jours">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DAY_LABELS.map((label, i) => {
              const on = days.includes(i);
              return (
                <button
                  key={label} type="button" onClick={() => toggleDay(i)}
                  /* Métrique commune (BTN) et non une pilule plus courte : ces
                     sept boutons voisinent une rangée d'actions ordinaires, et
                     une hauteur à eux se verrait aussitôt. */
                  style={{
                    ...BTN.md, minWidth: 56, border: "none", cursor: "pointer", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: on ? T.text : FIELD_BG, color: on ? T.textInverted : T.textSub,
                    transition: "var(--tr-ui)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Début">
            <Input type="time" value={toTime(startMin)} onChange={e => setStartMin(fromTime(e.target.value))} />
          </Field>
          <Field label="Durée (min)">
            <Input type="number" min={5} step={5} value={durationMin} onChange={e => setDurationMin(e.target.value)} />
          </Field>
        </div>

        <Field label="Réglages" hint="Suivre un preset, ou composer le programme à part.">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button" onClick={() => setPresetId(null)}
              style={{
                ...BTN.md, border: "none", cursor: "pointer", fontFamily: "inherit",
                background: presetId ? FIELD_BG : T.text, color: presetId ? T.textSub : T.textInverted,
              }}
            >
              Réglages propres
            </button>
            {store.presets.map(p => (
              <button
                key={p.id} type="button" onClick={() => { setPresetId(p.id); setDurationMin(p.durationMin); }}
                style={{
                  ...BTN.md, border: "none", cursor: "pointer", fontFamily: "inherit",
                  background: presetId === p.id ? T.text : FIELD_BG,
                  color: presetId === p.id ? T.textInverted : T.textSub,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </Field>

        {!preset && (
          <>
            <Field label="Listes coupées">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {store.blocklists.map(b => (
                  <div
                    key={b.id} onClick={() => toggleList(b.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, cursor: "pointer" }}
                  >
                    <CheckBox on={blocklistIds.includes(b.id)} color={PALETTE[b.color]} />
                    <span style={{ fontSize: 13, color: T.text }}>{b.name}</span>
                    <span style={{ fontSize: 12, color: T.textMut }}>{listSize(b)}</span>
                  </div>
                ))}
              </div>
            </Field>

            <Field label="Fermeté">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {MODE_IDS.map(id => {
                  const m = MODES[id];
                  const hue = PALETTE[m.color];
                  const on = mode === id;
                  return (
                    <div
                      key={id} onClick={() => setMode(id)}
                      style={{
                        display: "flex", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                        background: on ? `color-mix(in srgb, ${hue} 10%, transparent)` : FIELD_BG,
                        boxShadow: on ? `inset 0 0 0 1px ${hue}` : "none",
                      }}
                    >
                      <CheckBox on={on} color={hue} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{m.label}</div>
                        <div style={{ fontSize: 12, color: T.textSub, marginTop: 2, lineHeight: 1.5 }}>{m.hint}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function SchedulesTab({ store, setStore }) {
  const [editing, setEditing] = useState(null);

  const save = (s) => setStore(prev => {
    const exists = prev.schedules.some(x => x.id === s.id);
    return {
      ...prev,
      schedules: exists ? prev.schedules.map(x => (x.id === s.id ? s : x)) : [...prev.schedules, s],
    };
  });
  const remove = (id) => setStore(prev => ({ ...prev, schedules: prev.schedules.filter(s => s.id !== id) }));
  const toggle = (id) => setStore(prev => ({
    ...prev,
    schedules: prev.schedules.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
  }));

  const now = new Date();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionTitle size="sm">Programmes</SectionTitle>

      {/* La limite, dite une fois, en haut : le blocage n'existe que quand l'app
          tourne. Mieux vaut le lire ici qu'à la première session manquée.
          Aucun interrupteur ici : un programme qu'il faut penser à activer
          n'est plus un programme, c'est un rappel. Il part tout seul, et son
          seul réglage est sa propre case « actif », sur sa ligne. */}
      <div style={{ ...CARD, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={15} color={T.textMut} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
          Un programme part tout seul à l&apos;heure prévue, où que vous soyez dans l&apos;app, avec cinq
          minutes de rattrapage si elle était fermée. Il faut qu&apos;elle TOURNE : dans un navigateur,
          un onglet fermé n&apos;exécute rien. L&apos;app de bureau, elle, démarre à la session et reste
          dans la barre d&apos;état — les programmes y partent même fenêtre fermée.
        </div>
      </div>

      {store.schedules.length === 0 ? (
        <div style={{ ...CARD, padding: 26, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 999, background: FIELD_BG, display: "grid", placeItems: "center" }}>
            <CalendarClock size={22} color={T.brand} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>Aucun programme</div>
          <div style={{ fontSize: 13, color: T.textSub, maxWidth: 420, lineHeight: 1.6 }}>
            Le meilleur blocage est celui qu&apos;on n&apos;a pas à lancer. Une plage récurrente
            — « lun–ven, 9 h, deux heures » — vaut mieux qu&apos;une bonne résolution.
          </div>
          <PillButton variant="primary" onClick={() => setEditing({ create: true })}>
            <Plus size={14} /> Créer un programme
          </PillButton>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {store.schedules.map(s => {
            const preset = s.presetId ? store.presets.find(p => p.id === s.presetId) : null;
            const lists = preset
              ? store.blocklists.filter(b => preset.blocklistIds.includes(b.id))
              : store.blocklists.filter(b => s.blocklistIds.includes(b.id));
            const mode = MODES[preset?.mode || s.mode];
            const next = nextRun(s, now);
            return (
              <div key={s.id} style={{ ...CARD, padding: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", opacity: s.enabled ? 1 : 0.55 }}>
                <div style={{ minWidth: 84 }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                    {fmtHhMm(s.startMin)}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMut }}>{fmtDur(s.durationMin * 60_000)}</div>
                </div>

                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: T.textSub, marginTop: 3 }}>
                    {DAY_LABELS.filter((_, i) => s.days.includes(i)).join(" · ") || "aucun jour"}
                    {" — "}
                    {lists.length ? lists.map(b => b.name).join(", ") : "minuteur seul"}
                  </div>
                  {next && s.enabled && (
                    <div style={{ fontSize: 11, color: T.textMut, marginTop: 3 }}>Prochaine fois {next}</div>
                  )}
                </div>

                <span style={{
                  padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: `color-mix(in srgb, ${PALETTE[mode.color]} 14%, transparent)`, color: PALETTE[mode.color],
                }}>
                  {mode.label}
                </span>

                <div style={{ display: "flex", gap: 6 }}>
                  <PillButton compact variant="ghost" onClick={() => toggle(s.id)}>
                    {s.enabled ? "Suspendre" : "Activer"}
                  </PillButton>
                  <PillButton compact onClick={() => setEditing({ schedule: s })}><Pencil size={12} /></PillButton>
                </div>
              </div>
            );
          })}

          {/* L'ajout en bas de liste, et non en bouton d'en-tête : on crée un
              programme après avoir regardé ceux qui existent, pas avant. C'est
              aussi ce qui garde l'en-tête à un seul objet — son titre. */}
          <button
            type="button"
            onClick={() => setEditing({ create: true })}
            style={{
              ...CARD, padding: 14, display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500,
              color: T.textSub, borderStyle: "dashed", width: "100%",
            }}
          >
            <Plus size={14} /> Nouveau programme
          </button>
        </div>
      )}

      {editing && (
        <ScheduleEditor
          key={editing.schedule?.id || "new"}
          schedule={editing.schedule}
          store={store}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
