"use client";

import React, { useMemo, useRef, useState } from "react";
import { Plus, Trash2, Pencil, ImagePlus, X } from "lucide-react";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useUndo } from "@/lib/contexts/UndoContext";
import { T, HAIRLINE, FIELD_BG } from "@/lib/ui/tokens";
import { CARD, SectionTitle, SectionAction } from "@/components/ui/da";
import { Field, FieldGrid, Input, Select, Textarea, Modal, PillButton, IconButton } from "@/components/ui/form";
import { emptyPlaybook, normalizePlaybook, emptySetup, newId, exampleStats } from "@/lib/playbook/model";
import { uploadPlaybookImage } from "@/lib/playbook/images";

/**
 * Le playbook d'une stratégie — ce qui reste de l'ancienne page Playbook.
 *
 * La page vivait à côté de « Stratégies » et chaque fiche s'y rattachait par
 * un sélecteur : deux écrans pour un même setup, et un lien qu'on oubliait de
 * poser. La fiche est désormais une SECTION du détail de la stratégie, une
 * seule par stratégie, et le lien est implicite.
 *
 * N'ont été repris que les quatre blocs qu'on relit vraiment avant de cliquer :
 * les captures, le plan (entrée, stop, objectif, invalidation), les exemples
 * gagnants et perdants, les erreurs qu'on y refait. Statut, complétude et
 * statistiques ont été laissés : le détail de la stratégie a déjà les siennes,
 * calculées sur les trades réels.
 *
 * Le magasin ne change pas (`tao_playbook`, modèle de `lib/playbook/model.ts`) :
 * les fiches déjà écrites réapparaissent sous leur stratégie, sans migration.
 */

const STORAGE_KEY = "tao_playbook";
const CLOUD_KEY = "playbook";

const PLAN = [
  { key: "entry", label: "Entrée", placeholder: "Limite au CE du FVG, après clôture M5 dedans…" },
  { key: "stopLoss", label: "Stop loss", placeholder: "Sous le swing low qui a créé le FVG…" },
  { key: "takeProfit", label: "Take profit", placeholder: "TP1 high précédent (50 %), TP2 liquidité opposée…" },
  { key: "invalidation", label: "Invalidation", placeholder: "Clôture M5 sous le FVG, news rouge dans 15 min…" },
];

const fireAlert = (title, body) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tao:alert", { detail: { title, body, severity: "danger" } }));
  }
};

function fmtR(value) {
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toLocaleString(undefined, { maximumFractionDigits: 2 })}R`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const toneOf = (v) => (v > 0 ? T.green : v < 0 ? T.red : T.textMut);

export default function StrategyPlaybook({ strategy }) {
  const { user } = useAuth();
  const { pushUndo } = useUndo();
  const [raw, setRaw] = useCloudState(STORAGE_KEY, CLOUD_KEY, emptyPlaybook());
  const playbook = useMemo(() => normalizePlaybook(raw), [raw]);
  const [exampleForm, setExampleForm] = useState(null);
  const [viewer, setViewer] = useState(null);

  const strategyId = String(strategy.id);
  /* Plusieurs fiches pouvaient viser la même stratégie dans l'ancienne page :
     la plus récemment modifiée l'emporte, les autres restent dans le magasin
     et redeviennent rattachables si on supprime celle-ci. */
  const setup = playbook.setups
    .filter(s => s.strategyId === strategyId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const orphans = playbook.setups.filter(s => s.strategyId === null);

  /* Toute écriture repart du magasin NORMALISÉ : `prev` est le JSON brut du
     cache, qui peut venir d'une version antérieure du modèle. */
  const update = (fn) => setRaw(prev => fn(normalizePlaybook(prev)));
  const patch = (p) => update(store => ({
    ...store,
    setups: store.setups.map(s => (s.id === setup.id
      ? { ...s, ...(typeof p === "function" ? p(s) : p), updatedAt: new Date().toISOString() }
      : s)),
  }));

  const create = () => {
    const fresh = { ...emptySetup(strategy.name || ""), strategyId, status: "active" };
    update(store => ({ ...store, setups: [fresh, ...store.setups] }));
  };

  const adopt = (id) => update(store => ({
    ...store,
    setups: store.setups.map(s => (s.id === id ? { ...s, strategyId, updatedAt: new Date().toISOString() } : s)),
  }));

  const remove = () => {
    const snapshot = setup;
    const index = playbook.setups.findIndex(s => s.id === snapshot.id);
    update(store => ({ ...store, setups: store.setups.filter(s => s.id !== snapshot.id) }));
    /* Les captures restent dans le stockage : les effacer ici rendrait
       l'annulation inutile — la fiche reviendrait avec des images mortes. */
    pushUndo({
      label: "Suppression du playbook",
      undo: async () => update(store => {
        const setups = [...store.setups];
        setups.splice(Math.min(index, setups.length), 0, snapshot);
        return { ...store, setups };
      }),
      redo: async () => update(store => ({ ...store, setups: store.setups.filter(s => s.id !== snapshot.id) })),
    });
  };

  const saveExample = (form) => {
    const r = String(form.r).trim() === "" ? null : Number(String(form.r).replace(",", "."));
    const example = {
      id: form.id || newId("ex"),
      outcome: form.outcome,
      date: form.date,
      symbol: form.symbol.trim(),
      r: r !== null && Number.isFinite(r) ? r : null,
      note: form.note,
      image: form.image,
    };
    patch(s => ({
      examples: s.examples.some(e => e.id === example.id)
        ? s.examples.map(e => (e.id === example.id ? example : e))
        : [example, ...s.examples],
    }));
    setExampleForm(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionTitle action={setup ? <SectionAction onClick={remove}>Supprimer</SectionAction> : null}>
        Playbook
      </SectionTitle>

      {!setup ? (
        <div style={{ ...CARD, padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Aucune fiche pour cette stratégie</div>
          <div style={{ fontSize: 13, color: T.textSub, maxWidth: 420, lineHeight: 1.5 }}>
            Des captures du setup type, le plan d&apos;exécution, des exemples gagnants et
            perdants — ce qu&apos;on relit juste avant de cliquer.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <PillButton variant="primary" onClick={create}>
              <Plus size={14} strokeWidth={2} /> Créer le playbook
            </PillButton>
            {orphans.length > 0 && (
              <Select aria-label="Reprendre une fiche existante" value=""
                      onChange={(e) => { if (e.target.value) adopt(e.target.value); }}
                      style={{ width: "auto" }}>
                <option value="">Reprendre une fiche existante…</option>
                {orphans.map(s => <option key={s.id} value={s.id}>{s.name || "Sans nom"}</option>)}
              </Select>
            )}
          </div>
        </div>
      ) : (
        <>
          <Screenshots
            images={setup.screenshots}
            userId={user?.id}
            onAdd={(urls) => patch(s => ({ screenshots: [...s.screenshots, ...urls.map(url => ({ id: newId("img"), url, caption: "" }))] }))}
            onCaption={(id, caption) => patch(s => ({ screenshots: s.screenshots.map(i => (i.id === id ? { ...i, caption } : i)) }))}
            onRemove={(id) => patch(s => ({ screenshots: s.screenshots.filter(i => i.id !== id) }))}
            onView={setViewer}
          />

          <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "stretch" }}>
            <CardShell title="Plan de trade" sub="Ce qui déclenche, où l'on sort, ce qui annule.">
              {PLAN.map((row, i) => (
                <div key={row.key} style={{ padding: "12px 20px", borderBottom: i < PLAN.length - 1 ? `1px solid ${HAIRLINE}` : "none" }}>
                  <div style={{ fontSize: 11, color: T.textMut, marginBottom: 4, fontWeight: 500 }}>{row.label}</div>
                  <InlineText aria-label={row.label} value={setup[row.key]} placeholder={row.placeholder}
                              onChange={(e) => patch({ [row.key]: e.target.value })} />
                </div>
              ))}
            </CardShell>

            <MistakeList items={setup.mistakes} onChange={(mistakes) => patch({ mistakes })} />
          </div>

          <Examples
            examples={setup.examples}
            onAdd={(outcome) => setExampleForm(blankExample(outcome))}
            onEdit={(e) => setExampleForm({ ...e, r: e.r === null ? "" : String(e.r) })}
            onView={setViewer}
          />
        </>
      )}

      {exampleForm && setup && (
        <ExampleModal
          form={exampleForm} setForm={setExampleForm} userId={user?.id}
          editing={setup.examples.some(e => e.id === exampleForm.id)}
          onClose={() => setExampleForm(null)}
          onSave={() => saveExample(exampleForm)}
          onDelete={() => {
            patch(s => ({ examples: s.examples.filter(e => e.id !== exampleForm.id) }));
            setExampleForm(null);
          }}
        />
      )}

      {viewer && (
        <Modal open title="Capture" onClose={() => setViewer(null)} width={1200} bodyStyle={{ padding: 0 }}>
          <img src={viewer} alt="Capture" style={{ width: "100%", height: "auto", display: "block" }} />
        </Modal>
      )}
    </div>
  );
}

const blankExample = (outcome) => ({
  id: "", outcome, date: new Date().toISOString().slice(0, 10), symbol: "", r: "", note: "", image: "",
});

/* ── Briques ─────────────────────────────────────────────────────────────
   L'en-tête de carte est celui des cartes « Probabilité » et « tao score » du
   détail : titre 14/600, sous-titre 11 atténué, filet dessous. Le playbook se
   lit ainsi comme la suite de la page, pas comme un écran collé dedans. */

function CardShell({ title, sub, action, children }) {
  return (
    <div style={{ ...CARD, padding: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${HAIRLINE}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Texte éditable sans cadre : la carte se lit comme celle des conditions de
 *  probabilité, la saisie ne doit pas la transformer en formulaire. */
function InlineText({ value, onChange, placeholder, ...rest }) {
  return (
    <textarea
      {...rest}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={2}
      style={{
        width: "100%", minHeight: 40, padding: 0, border: "none", outline: "none", resize: "vertical",
        background: "transparent", fontFamily: "inherit", fontSize: 14, fontWeight: 500, lineHeight: 1.45,
        color: T.text, fieldSizing: "content",
      }}
    />
  );
}

/** Liste éditable sur place : Entrée dans le champ du bas ajoute. Pas de
 *  bouton « Enregistrer » — rien ne doit se perdre parce qu'on a navigué
 *  ailleurs en pleine saisie. */
function MistakeList({ items, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newId("it"), text }]);
    setDraft("");
  };
  return (
    <CardShell title="Erreurs fréquentes" sub="Ce que tu refais sur ce setup.">
      <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: T.red, flexShrink: 0 }} />
            <input aria-label="Erreur" value={item.text}
                   onChange={(e) => onChange(items.map(x => (x.id === item.id ? { ...x, text: e.target.value } : x)))}
                   style={{ flex: 1, minWidth: 0, padding: "4px 0", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14, color: T.text }} />
            <IconButton tone="danger" aria-label="Retirer" onClick={() => onChange(items.filter(x => x.id !== item.id))}>
              <X size={13} strokeWidth={1.75} />
            </IconButton>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Plus size={12} strokeWidth={2} color={T.textMut} style={{ flexShrink: 0, marginLeft: -4 }} />
          <input aria-label="Ajouter une erreur" value={draft} placeholder="Entrer avant la clôture, déplacer le stop…"
                 onChange={(e) => setDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                 onBlur={add}
                 style={{ flex: 1, minWidth: 0, padding: "4px 0", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14, color: T.text }} />
        </div>
      </div>
    </CardShell>
  );
}

/** Les fichiers images d'un collage ou d'un dépôt — le reste est ignoré. */
const imagesOf = (list) => [...(list || [])]
  .map(item => (item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null))
  .filter(f => f && f.type.startsWith("image/"));

function useImageUpload(userId) {
  const [busy, setBusy] = useState(0);
  const upload = async (files) => {
    if (files.length === 0) return [];
    setBusy(n => n + files.length);
    try {
      const results = await Promise.all(files.map(f => uploadPlaybookImage(userId, f)));
      const failed = results.find(r => "error" in r);
      if (failed) fireAlert("Capture non ajoutée", failed.error);
      return results.filter(r => "url" in r).map(r => r.url);
    } finally {
      setBusy(n => n - files.length);
    }
  };
  return { busy: busy > 0, upload };
}

function Screenshots({ images, userId, onAdd, onCaption, onRemove, onView }) {
  const input = useRef(null);
  const { busy, upload } = useImageUpload(userId);
  const [over, setOver] = useState(false);
  const take = async (files) => { const urls = await upload(files); if (urls.length) onAdd(urls); };

  return (
    <div
      /* Coller (⌘V) et glisser-déposer : une capture se prend au clavier,
         l'enregistrer dans un fichier pour la rechoisir ensuite est le détour
         qui fait qu'on ne le fait jamais. */
      tabIndex={0}
      onPaste={(e) => { const files = imagesOf(e.clipboardData?.items); if (files.length) { e.preventDefault(); take(files); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(imagesOf(e.dataTransfer?.files)); }}
      style={{ outline: "none", borderRadius: 12, boxShadow: over ? `0 0 0 2px ${T.text}` : "none" }}
    >
      <CardShell
        title="Captures"
        sub="Le setup type, annoté. Colle une capture (⌘V) ou glisse une image ici."
        action={
          <PillButton compact onClick={() => input.current?.click()} disabled={busy}>
            <Plus size={13} strokeWidth={2} /> {busy ? "Envoi…" : "Ajouter"}
          </PillButton>
        }
      >
        <input ref={input} type="file" accept="image/*" multiple hidden
               onChange={(e) => { take(imagesOf(e.target.files)); e.target.value = ""; }} />
        {images.length === 0 ? (
          <div style={{ padding: "24px 20px", fontSize: 13, color: T.textMut, textAlign: "center" }}>Aucune capture pour l&apos;instant.</div>
        ) : (
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 12 }}>
            {images.map(img => (
              <div key={img.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: FIELD_BG, aspectRatio: "16 / 10" }}>
                  <button type="button" onClick={() => onView(img.url)} aria-label="Agrandir la capture"
                          style={{ all: "unset", cursor: "zoom-in", display: "block", width: "100%", height: "100%" }}>
                    <img src={img.url} alt={img.caption || "Capture du setup"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                  <div style={{ position: "absolute", top: 6, right: 6 }}>
                    <IconButton tone="danger" aria-label="Retirer la capture" onClick={() => onRemove(img.id)} style={{ background: T.white }}>
                      <Trash2 size={13} strokeWidth={1.75} />
                    </IconButton>
                  </div>
                </div>
                <input aria-label="Légende" value={img.caption} placeholder="Légende…"
                       onChange={(e) => onCaption(img.id, e.target.value)}
                       style={{ padding: 0, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 12, color: T.textSub }} />
              </div>
            ))}
          </div>
        )}
      </CardShell>
    </div>
  );
}

/** Gagnants et perdants côte à côte, séparés d'un filet — la disposition
 *  meilleur / pire de la carte « Probabilité ». */
function Examples({ examples, onAdd, onEdit, onView }) {
  const ex = exampleStats(examples);
  const columns = [
    { outcome: "win", title: "Gagnants", one: "gagnant", color: T.green, items: examples.filter(e => e.outcome === "win") },
    { outcome: "loss", title: "Perdants", one: "perdant", color: T.red, items: examples.filter(e => e.outcome === "loss") },
  ];
  return (
    <CardShell
      title="Exemples"
      sub={ex.count > 0
        ? `${ex.wins} G · ${ex.losses} P · réussite ${ex.winRate}% · ${fmtR(ex.avgR)} / exemple`
        : "Des trades choisis pour leur clarté — ceux qui ont marché, et ceux qui n'auraient pas dû être pris."}
    >
      <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {columns.map((col, i) => (
          <div key={col.outcome} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, borderRight: i === 0 ? `1px solid ${HAIRLINE}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{col.title} <span style={{ color: T.textMut, fontWeight: 500 }}>{col.items.length}</span></span>
              <PillButton compact onClick={() => onAdd(col.outcome)} aria-label={`Ajouter un exemple ${col.one}`}>
                <Plus size={13} strokeWidth={2} /> Ajouter
              </PillButton>
            </div>
            {col.items.length === 0 && <div style={{ fontSize: 13, color: T.textMut }}>Aucun exemple.</div>}
            {col.items.map(e => (
              <div key={e.id} style={{ display: "flex", gap: 10, padding: 10, borderRadius: 10, background: FIELD_BG }}>
                {e.image && (
                  <button type="button" onClick={() => onView(e.image)} aria-label="Agrandir"
                          style={{ all: "unset", cursor: "zoom-in", width: 96, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                    <img src={e.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                )}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{e.symbol || "—"}</span>
                    <span style={{ fontSize: 11, color: T.textMut }}>{fmtDate(e.date)}</span>
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                      {e.r !== null && (
                        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: toneOf(e.r) }}>{fmtR(e.r)}</span>
                      )}
                      <IconButton aria-label="Modifier l'exemple" onClick={() => onEdit(e)}>
                        <Pencil size={12} strokeWidth={1.75} />
                      </IconButton>
                    </span>
                  </div>
                  {e.note.trim() && <div style={{ fontSize: 13, color: T.textSub, whiteSpace: "pre-wrap" }}>{e.note}</div>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function ExampleModal({ form, setForm, userId, editing, onClose, onSave, onDelete }) {
  const set = (p) => setForm(f => ({ ...f, ...p }));
  const input = useRef(null);
  const { busy, upload } = useImageUpload(userId);
  const take = async (files) => { const [url] = await upload(files.slice(0, 1)); if (url) set({ image: url }); };
  const outcomes = [
    { id: "win", label: "Gagnant", color: T.green, bg: T.greenBg },
    { id: "loss", label: "Perdant", color: T.red, bg: T.redBg },
  ];

  return (
    <Modal
      open
      title={editing ? "Modifier l'exemple" : "Nouvel exemple"}
      onClose={onClose}
      onDelete={editing ? onDelete : undefined}
      width={580}
      footer={
        <>
          <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" onClick={onSave} disabled={busy}>{editing ? "Enregistrer" : "Ajouter"}</PillButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}
           onPaste={(e) => { const files = imagesOf(e.clipboardData?.items); if (files.length) { e.preventDefault(); take(files); } }}>
        <Field label="Résultat">
          <div style={{ display: "flex", gap: 4, background: FIELD_BG, borderRadius: 999, padding: 3 }}>
            {outcomes.map(o => {
              const active = form.outcome === o.id;
              return (
                <button key={o.id} type="button" aria-pressed={active} onClick={() => set({ outcome: o.id })}
                  style={{
                    flex: 1, minHeight: 30, borderRadius: 999, border: "none", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                    background: active ? o.bg : "transparent",
                    color: active ? o.color : T.textSub,
                  }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </Field>
        <FieldGrid columns={3}>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Instrument">
            <Input value={form.symbol} onChange={(e) => set({ symbol: e.target.value })} placeholder="NQ, EURUSD…" />
          </Field>
          <Field label="Résultat en R">
            <Input value={form.r} onChange={(e) => set({ r: e.target.value })} inputMode="decimal" placeholder="2.5" />
          </Field>
        </FieldGrid>
        <Field label="Capture" hint="Colle une image (⌘V) dans la fenêtre ou choisis un fichier.">
          {form.image ? (
            <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: FIELD_BG }}>
              <img src={form.image} alt="Capture de l'exemple" style={{ width: "100%", maxHeight: 260, objectFit: "contain", display: "block" }} />
              <div style={{ position: "absolute", top: 6, right: 6 }}>
                <IconButton tone="danger" aria-label="Retirer la capture" onClick={() => set({ image: "" })} style={{ background: T.white }}>
                  <X size={13} strokeWidth={1.75} />
                </IconButton>
              </div>
            </div>
          ) : (
            <PillButton onClick={() => input.current?.click()} disabled={busy}>
              <ImagePlus size={14} strokeWidth={2} /> {busy ? "Envoi…" : "Choisir une image"}
            </PillButton>
          )}
          <input ref={input} type="file" accept="image/*" hidden
                 onChange={(e) => { take(imagesOf(e.target.files)); e.target.value = ""; }} />
        </Field>
        <Field label="Ce que l'exemple enseigne">
          <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })}
                    placeholder={form.outcome === "win" ? "Contexte aligné, entrée patiente au CE…" : "Entrée avant la clôture, contre le biais H1…"} />
        </Field>
      </div>
    </Modal>
  );
}
