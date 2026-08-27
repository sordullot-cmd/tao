"use client";

/**
 * Lancement d'une session — l'écran d'accueil du Focus.
 *
 * Un preset se lance d'un clic, sans réglage : c'est le geste de 95 % des jours,
 * et chaque case à cocher entre l'envie de se concentrer et le début de la
 * session est une occasion d'y renoncer. Le réglage fin existe (« Session
 * libre »), mais il est en dessous, replié, pour les 5 % restants.
 */

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  Play, Plus, Pencil, Brain, Timer, Target, Moon, Sparkles, Coffee, BookOpen, Dumbbell, Lock,
} from "lucide-react";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { BTN } from "@/lib/ui/buttons";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, CheckBox, Field, Input, Modal, PillButton, SectionTitle } from "@/components/ui/da";
import { MODES, listSize, newId, sessionFromPreset, startSession } from "@/lib/focus/model";
import { fmtDur } from "@/lib/focus/stats";

/** Icônes proposées pour un preset. Un jeu court : la vignette sert à
 *  reconnaître la carte du coin de l'œil, pas à décrire l'activité. */
export const PRESET_ICONS = {
  brain: Brain, timer: Timer, target: Target, moon: Moon,
  spark: Sparkles, coffee: Coffee, book: BookOpen, sport: Dumbbell,
};

const DURATION_CHIPS = [15, 25, 45, 60, 90, 120];
const MODE_IDS = ["normal", "deep", "locked"];

function PresetEditor({ preset, store, onSave, onDelete, onClose }) {
  const [name, setName] = useState(preset?.name || "");
  const [durationMin, setDurationMin] = useState(preset?.durationMin ?? 45);
  const [mode, setMode] = useState(preset?.mode || "deep");
  const [color, setColor] = useState(preset?.color || "purple");
  const [icon, setIcon] = useState(preset?.icon || "timer");
  const [blocklistIds, setBlocklistIds] = useState(preset?.blocklistIds || []);

  const toggleList = (id) => setBlocklistIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const submit = () => {
    onSave({
      id: preset?.id || newId("p"),
      name: name.trim() || "Session",
      durationMin: Math.max(1, Number(durationMin) || 25),
      blocklistIds,
      mode,
      color,
      icon,
    });
    onClose();
  };

  return (
    <Modal
      open
      title={preset ? "Modifier le preset" : "Nouveau preset"}
      onClose={onClose}
      onDelete={preset && onDelete ? () => { onDelete(preset.id); onClose(); } : undefined}
      width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
          <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" onClick={submit}>{preset ? "Enregistrer" : "Créer"}</PillButton>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Nom">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Deep work" autoFocus />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Durée (min)" hint="0 pour un chronomètre sans fin.">
            <Input type="number" min={0} step={5} value={durationMin} onChange={e => setDurationMin(e.target.value)} />
          </Field>
          <Field label="Vignette">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(PRESET_ICONS).map(([key, Icon]) => (
                <button
                  key={key} type="button" onClick={() => setIcon(key)}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer",
                    background: icon === key ? T.text : FIELD_BG,
                    color: icon === key ? T.textInverted : T.textSub,
                    display: "grid", placeItems: "center",
                  }}
                  aria-label={key}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Couleur">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.keys(PALETTE).map(c => (
              <button
                key={c} type="button" onClick={() => setColor(c)} aria-label={c}
                style={{
                  width: 26, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
                  background: PALETTE[c],
                  boxShadow: color === c ? `0 0 0 2px ${T.white}, 0 0 0 4px ${PALETTE[c]}` : "none",
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="Listes coupées">
          {store.blocklists.length === 0 ? (
            <div style={{ fontSize: 12, color: PALETTE.orange }}>
              Aucune liste : composez-en une dans l&apos;onglet Listes.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {store.blocklists.map(b => (
                <div
                  key={b.id} onClick={() => toggleList(b.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, cursor: "pointer" }}
                >
                  <CheckBox on={blocklistIds.includes(b.id)} color={PALETTE[b.color]} />
                  <span style={{ flex: 1, fontSize: 13, color: T.text }}>{b.name}</span>
                  <span style={{ fontSize: 12, color: T.textMut }}>{listSize(b)}</span>
                </div>
              ))}
            </div>
          )}
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
      </div>
    </Modal>
  );
}

export default function SessionStart({ store, setStore, onStart, actionSlot }) {
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  // Réglages de la session libre.
  const [duration, setDuration] = useState(45);
  const [mode, setMode] = useState("normal");
  const [lists, setLists] = useState(() => store.blocklists.slice(0, 2).map(b => b.id));

  const savePreset = (p) => setStore(prev => {
    const exists = prev.presets.some(x => x.id === p.id);
    return { ...prev, presets: exists ? prev.presets.map(x => (x.id === p.id ? p : x)) : [...prev.presets, p] };
  });
  const removePreset = (id) => setStore(prev => ({
    ...prev,
    presets: prev.presets.filter(p => p.id !== id),
    schedules: prev.schedules.map(s => (s.presetId === id ? { ...s, presetId: null } : s)),
  }));

  const toggleList = (id) => setLists(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  /* Session verrouillée en attente de confirmation.

     Le cran verrouillé ne donne plus AUCUNE sortie : la session va jusqu'au
     bout. Ce qui se paie une fois lancé doit donc se décider avant — un clic de
     travers sur « Verrouillé · 2 h » ne peut pas être irréversible. C'est le
     seul cran qui demande à confirmer, et c'est exactement la raison pour
     laquelle il tient. */
  const [pending, setPending] = useState(null);
  const launch = (session) => {
    if (session.mode === "locked") { setPending(session); return; }
    onStart(session);
  };

  /* Le bouton de création vit dans la barre d'onglets, aligné sur elle, et non
     au-dessus de la grille : c'est une action de la PAGE, pas de la section.
     Le portail laisse son état où il est — l'éditeur qu'il ouvre appartient à
     ce composant — tout en le rendant ailleurs dans l'arbre du DOM. */
  const newPreset = (
    <PillButton variant="primary" compact onClick={() => setEditing({ create: true })}>
      <Plus size={13} /> Preset
    </PillButton>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {actionSlot ? createPortal(newPreset, actionSlot) : newPreset}
      <SectionTitle size="sm">Lancer une session</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {store.presets.map(p => {
          const hue = PALETTE[p.color] || PALETTE.purple;
          const Icon = PRESET_ICONS[p.icon] || Timer;
          const picked = store.blocklists.filter(b => p.blocklistIds.includes(b.id));
          const targets = picked.reduce((s, b) => s + listSize(b), 0);
          return (
            <div key={p.id} style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0,
                  background: `color-mix(in srgb, ${hue} 14%, transparent)`, color: hue,
                }}>
                  <Icon size={17} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, color: T.textSub }}>
                    {p.durationMin ? fmtDur(p.durationMin * 60_000) : "chrono libre"} · {MODES[p.mode].label}
                  </div>
                </div>
                <button
                  type="button" onClick={() => setEditing({ preset: p })} aria-label={`Modifier ${p.name}`}
                  style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: T.textMut, display: "inline-flex" }}
                >
                  <Pencil size={13} />
                </button>
              </div>

              <div style={{ fontSize: 12, color: T.textSub, minHeight: 32, lineHeight: 1.5 }}>
                {picked.length
                  ? <>Coupe {picked.map(b => b.name).join(", ")} — {targets} cible{targets > 1 ? "s" : ""}.</>
                  : "Aucune liste : minuteur seul."}
              </div>

              <PillButton variant="primary" onClick={() => launch(sessionFromPreset(p))} style={{ width: "100%" }}>
                <Play size={14} /> Démarrer
              </PillButton>
            </div>
          );
        })}
      </div>

      {/* Session libre : replié par défaut, parce que le geste attendu est le
          clic sur un preset, pas la composition d'un réglage. */}
      <div style={{ ...CARD, padding: 16 }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
            fontSize: 13, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 8,
          }}
        >
          Session libre
          <span style={{ fontSize: 12, fontWeight: 400, color: T.textSub }}>
            {open ? "" : "durée, listes et fermeté à la demande"}
          </span>
        </button>

        {open && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            <Field label="Durée">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DURATION_CHIPS.map(min => (
                  <button
                    key={min} type="button" onClick={() => setDuration(min)}
                    style={{
                      ...BTN.md, border: "none", cursor: "pointer", fontFamily: "inherit",
                      fontVariantNumeric: "tabular-nums",
                      background: duration === min ? T.text : FIELD_BG,
                      color: duration === min ? T.textInverted : T.textSub,
                    }}
                  >
                    {min} min
                  </button>
                ))}
                <button
                  type="button" onClick={() => setDuration(0)}
                  style={{
                    ...BTN.md, border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: duration === 0 ? T.text : FIELD_BG,
                    color: duration === 0 ? T.textInverted : T.textSub,
                  }}
                >
                  Chrono
                </button>
              </div>
            </Field>

            <Field label="Listes coupées">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {store.blocklists.map(b => {
                  const on = lists.includes(b.id);
                  const hue = PALETTE[b.color] || T.textSub;
                  return (
                    <button
                      key={b.id} type="button" onClick={() => toggleList(b.id)}
                      style={{
                        ...BTN.md, display: "inline-flex", alignItems: "center",
                        border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: on ? `color-mix(in srgb, ${hue} 16%, transparent)` : FIELD_BG,
                        color: on ? hue : T.textSub,
                        boxShadow: on ? `inset 0 0 0 1px ${hue}` : "none",
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: on ? hue : T.textMut }} />
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Fermeté">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {MODE_IDS.map(id => {
                  const m = MODES[id];
                  const on = mode === id;
                  return (
                    <button
                      key={id} type="button" onClick={() => setMode(id)} title={m.hint}
                      style={{
                        ...BTN.md, border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: on ? PALETTE[m.color] : FIELD_BG,
                        color: on ? T.onSolid : T.textSub,
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: T.textSub, marginTop: 8, lineHeight: 1.5 }}>{MODES[mode].hint}</div>
            </Field>

            <div>
              <PillButton
                variant="primary"
                onClick={() => launch(startSession({
                  name: duration ? `Session ${duration} min` : "Chronomètre",
                  durationMin: duration,
                  blocklistIds: lists,
                  mode,
                }))}
              >
                <Play size={14} /> Démarrer
              </PillButton>
            </div>
          </div>
        )}
      </div>

      {/* La confirmation du verrou : ce qu'on s'engage à tenir, en toutes
          lettres, avec le mot exact de ce qui devient impossible. */}
      {pending && (
        <Modal
          open
          onClose={() => setPending(null)}
          title="Verrouiller cette session ?"
          footer={
            <>
              <PillButton variant="ghost" onClick={() => setPending(null)}>Revenir</PillButton>
              <PillButton
                variant="primary"
                onClick={() => { const s = pending; setPending(null); onStart(s); }}
              >
                <Lock size={14} /> Je verrouille
              </PillButton>
            </>
          }
        >
          <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.7 }}>
            <strong style={{ color: T.text }}>
              {pending.plannedMs ? fmtDur(pending.plannedMs) : "Durée libre"}
            </strong>{" "}
            sans arrêt possible : ni pause, ni annulation depuis l’app. Le bouton « Arrêter »
            n’existera pas tant que le minuteur n’est pas au bout.
            <br />
            Ce que ça ne fait pas : t’empêcher de fermer l’app ou d’éteindre la machine — aucun
            logiciel ne le peut. Ça empêche de l’annuler là où l’envie se présente.
          </div>
        </Modal>
      )}

      {editing && (
        <PresetEditor
          key={editing.preset?.id || "new"}
          preset={editing.preset}
          store={store}
          onSave={savePreset}
          onDelete={removePreset}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
