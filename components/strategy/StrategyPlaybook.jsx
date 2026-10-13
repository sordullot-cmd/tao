"use client";

import React, { useMemo, useRef, useState } from "react";
import { Plus, Pencil, ImagePlus, X } from "lucide-react";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { useTradeScreenshots } from "@/lib/hooks/useTradeScreenshots";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useUndo } from "@/lib/contexts/UndoContext";
import { T, HAIRLINE, FIELD_BG } from "@/lib/ui/tokens";
import { CARD, SectionTitle, SectionAction, PeriodPills } from "@/components/ui/da";
import { Field, FieldGrid, Input, Select, Textarea, Modal, PillButton, IconButton } from "@/components/ui/form";
import { emptyPlaybook, normalizePlaybook, emptySetup, newId } from "@/lib/playbook/model";
import { uploadPlaybookImage } from "@/lib/playbook/images";

/**
 * Le playbook d'une stratégie — ce qui reste de l'ancienne page Playbook.
 *
 * La page vivait à côté de « Stratégies » et chaque fiche s'y rattachait par
 * un sélecteur : deux écrans pour un même setup, et un lien qu'on oubliait de
 * poser. La fiche est désormais une SECTION du détail de la stratégie, une
 * seule par stratégie, et le lien est implicite.
 *
 * N'ont été repris que les blocs qu'on relit vraiment avant de cliquer :
 * le plan (entrée, stop, objectif, invalidation), les exemples gagnants et
 * perdants, les erreurs qu'on y refait. Le bloc « Captures » a suivi : une
 * capture n'a de sens qu'attachée à un trade, et elle vit désormais sur les
 * exemples gagnants et perdants. Le champ `screenshots` reste dans le modèle
 * — vider les fiches existantes n'aurait rien apporté. Statut, complétude et
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

function fmtMoney(value) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${getCurrencySymbol()}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const toneOf = (v) => (v > 0 ? T.green : v < 0 ? T.red : T.textMut);
const pnlOf = (tr) => (typeof tr?.pnl === "number" ? tr.pnl : Number(tr?.pnl) || 0);
const dayOf = (tr) => String(tr?.date || "").slice(0, 10);
const sideOf = (tr) => (String(tr?.direction || "").toLowerCase().startsWith("s") ? "Short" : "Long");

/**
 * `trades` : les trades AFFECTÉS à la stratégie (filtrés par le détail). Les
 * exemples se tirent d'abord de là — un setup qu'on a réellement pris enseigne
 * plus qu'une capture choisie après coup pour sa clarté.
 */
export default function StrategyPlaybook({ strategy, trades = [] }) {
  const { user } = useAuth();
  const { pushUndo } = useUndo();
  const [raw, setRaw] = useCloudState(STORAGE_KEY, CLOUD_KEY, emptyPlaybook());
  const playbook = useMemo(() => normalizePlaybook(raw), [raw]);
  const [exampleForm, setExampleForm] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [picking, setPicking] = useState(false);
  const { urls: tradeShots } = useTradeScreenshots();
  const tradeById = useMemo(() => new Map(trades.map(tr => [String(tr.id), tr])), [trades]);

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

  /* Le résultat se déduit du P&L au moment de l'ajout ; le montant, lui, reste
     sur le trade et se relit à l'affichage. Un trade à 0 compte en perdant :
     un exemple n'a que deux colonnes, et un scratch n'a rien gagné. */
  const addTrades = (picked) => {
    const fresh = picked.map(tr => ({
      id: newId("ex"),
      tradeId: String(tr.id),
      outcome: pnlOf(tr) > 0 ? "win" : "loss",
      date: dayOf(tr),
      symbol: String(tr.symbol || ""),
      r: null, note: "", image: "",
    }));
    patch(s => ({ examples: [...fresh, ...s.examples] }));
    setPicking(false);
  };

  const saveExample = (form) => {
    const r = String(form.r).trim() === "" ? null : Number(String(form.r).replace(",", "."));
    const example = {
      id: form.id || newId("ex"),
      tradeId: form.tradeId ?? null,
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
            Le plan d&apos;exécution, des exemples gagnants et perdants — ce qu&apos;on relit juste avant de cliquer.
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
            tradeById={tradeById}
            tradeShots={tradeShots}
            hasTrades={trades.length > 0}
            onPick={() => setPicking(true)}
            onAddManual={() => setExampleForm(blankExample("win"))}
            onEdit={(e) => setExampleForm({ ...e, r: e.r === null ? "" : String(e.r) })}
            onView={setViewer}
          />
        </>
      )}

      {picking && setup && (
        <TradePicker
          trades={trades}
          taken={new Set(setup.examples.map(e => e.tradeId).filter(Boolean))}
          onClose={() => setPicking(false)}
          onAdd={addTrades}
        />
      )}

      {exampleForm && setup && (
        <ExampleModal
          form={exampleForm} setForm={setExampleForm} userId={user?.id}
          trade={exampleForm.tradeId ? tradeById.get(exampleForm.tradeId) : undefined}
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
  id: "", tradeId: null, outcome, date: new Date().toISOString().slice(0, 10), symbol: "", r: "", note: "", image: "",
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

/** Gagnants et perdants côte à côte, séparés d'un filet — la disposition
 *  meilleur / pire de la carte « Probabilité ». */
function Examples({ examples, tradeById, tradeShots, hasTrades, onPick, onAddManual, onEdit, onView }) {
  const linked = examples.filter(e => e.tradeId && tradeById.has(e.tradeId));
  const pnl = linked.reduce((sum, e) => sum + pnlOf(tradeById.get(e.tradeId)), 0);
  const wins = examples.filter(e => e.outcome === "win");
  const losses = examples.filter(e => e.outcome === "loss");
  const columns = [
    { outcome: "win", title: "Gagnants", color: T.green, items: wins },
    { outcome: "loss", title: "Perdants", color: T.red, items: losses },
  ];
  const sub = examples.length > 0
    ? [`${wins.length} G · ${losses.length} P`, linked.length > 0 ? `${fmtMoney(pnl)} sur ${linked.length} trade${linked.length > 1 ? "s" : ""}` : null]
        .filter(Boolean).join(" · ")
    : hasTrades
      ? "Choisis parmi tes trades de cette stratégie ceux qui montrent le setup — réussi ou raté."
      : "Aucun trade dans cette stratégie : affecte-en depuis la page Trades pour les choisir ici.";
  return (
    <CardShell
      title="Exemples"
      sub={sub}
      action={
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {/* Le choix d'un trade réel passe devant : l'exemple saisi à la main
              reste possible (un setup vu sans l'avoir pris), mais en retrait. */}
          <button type="button" onClick={onAddManual}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: T.textSub }}>
            Exemple sans trade
          </button>
          <PillButton compact variant="primary" onClick={onPick} disabled={!hasTrades}>
            <Plus size={13} strokeWidth={2} /> Choisir des trades
          </PillButton>
        </div>
      }
    >
      <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {columns.map((col, i) => (
          <div key={col.outcome} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, borderRight: i === 0 ? `1px solid ${HAIRLINE}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{col.title} <span style={{ color: T.textMut, fontWeight: 500 }}>{col.items.length}</span></span>
            </div>
            {col.items.length === 0 && <div style={{ fontSize: 13, color: T.textMut }}>Aucun exemple.</div>}
            {col.items.map(e => {
              const trade = e.tradeId ? tradeById.get(e.tradeId) : undefined;
              /* La capture propre à l'exemple d'abord, sinon celle déjà jointe
                 au trade dans la page Trades : pas besoin de la recoller. */
              const image = e.image || (e.tradeId ? tradeShots[e.tradeId] : "") || "";
              return (
                <div key={e.id} style={{ display: "flex", gap: 10, padding: 10, borderRadius: 10, background: FIELD_BG }}>
                  {image && (
                    <button type="button" onClick={() => onView(image)} aria-label="Agrandir"
                            style={{ all: "unset", cursor: "zoom-in", width: 96, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                      <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{(trade?.symbol ?? e.symbol) || "—"}</span>
                      {trade && <span style={{ fontSize: 11, color: T.textSub }}>{sideOf(trade)}</span>}
                      <span style={{ fontSize: 11, color: T.textMut, whiteSpace: "nowrap" }}>{fmtDate(trade ? dayOf(trade) : e.date)}</span>
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                        {trade && (
                          <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: toneOf(pnlOf(trade)) }}>{fmtMoney(pnlOf(trade))}</span>
                        )}
                        {e.r !== null && (
                          <span style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: toneOf(e.r) }}>{fmtR(e.r)}</span>
                        )}
                        <IconButton aria-label="Modifier l'exemple" onClick={() => onEdit(e)}>
                          <Pencil size={12} strokeWidth={1.75} />
                        </IconButton>
                      </span>
                    </div>
                    {/* Trade supprimé ou désaffecté depuis : l'exemple garde ce
                        qu'il en savait, mais le dit plutôt que d'afficher 0. */}
                    {e.tradeId && !trade && (
                      <div style={{ fontSize: 11, color: T.textMut }}>Trade introuvable dans cette stratégie</div>
                    )}
                    {!e.tradeId && <div style={{ fontSize: 11, color: T.textMut }}>Sans trade</div>}
                    {e.note.trim() && <div style={{ fontSize: 13, color: T.textSub, whiteSpace: "pre-wrap" }}>{e.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/** Choix parmi les trades de la stratégie. Plusieurs d'un coup : on remplit
 *  souvent la fiche en relisant une semaine entière, pas trade par trade. */
function TradePicker({ trades, taken, onClose, onAdd }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  const available = trades
    .filter(tr => tr.id != null && !taken.has(String(tr.id)))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const visible = available.filter(tr => filter === "all" || (filter === "win" ? pnlOf(tr) > 0 : pnlOf(tr) <= 0));
  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const picked = available.filter(tr => selected.has(String(tr.id)));

  return (
    <Modal
      open
      title="Choisir des trades"
      onClose={onClose}
      width={620}
      footer={
        <>
          <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" onClick={() => onAdd(picked)} disabled={picked.length === 0}>
            {picked.length > 0 ? `Ajouter ${picked.length} trade${picked.length > 1 ? "s" : ""}` : "Ajouter"}
          </PillButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <PeriodPills
          value={filter}
          onChange={setFilter}
          rail
          size={12}
          options={[
            { id: "all", label: `Tous (${available.length})` },
            { id: "win", label: "Gagnants" },
            { id: "loss", label: "Perdants" },
          ]}
        />
        {available.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textMut, padding: "16px 0" }}>Tous les trades de cette stratégie sont déjà dans les exemples.</div>
        ) : visible.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textMut, padding: "16px 0" }}>Aucun trade dans ce filtre.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {visible.map((tr, i) => {
              const id = String(tr.id);
              const pnl = pnlOf(tr);
              const time = tr.entryTime || tr.entry_time;
              return (
                <label key={id}
                       style={{
                         display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer",
                         borderTop: i > 0 ? `1px solid ${HAIRLINE}` : "none",
                       }}>
                  <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)}
                         aria-label={`${tr.symbol || "Trade"} du ${fmtDate(dayOf(tr))}`}
                         style={{ width: 16, height: 16, accentColor: "var(--color-text)", flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: T.text, minWidth: 64 }}>{tr.symbol || "—"}</span>
                  <span style={{ fontSize: 12, color: T.textSub, minWidth: 40 }}>{sideOf(tr)}</span>
                  <span style={{ fontSize: 12, color: T.textMut, flex: 1, whiteSpace: "nowrap" }}>
                    {fmtDate(dayOf(tr))}{time ? ` · ${String(time).slice(0, 5)}` : ""}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: toneOf(pnl) }}>{fmtMoney(pnl)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ExampleModal({ form, setForm, userId, trade, editing, onClose, onSave, onDelete }) {
  const set = (p) => setForm(f => ({ ...f, ...p }));
  const input = useRef(null);
  const { busy, upload } = useImageUpload(userId);
  const take = async (files) => { const [url] = await upload(files.slice(0, 1)); if (url) set({ image: url }); };
  const outcomes = [
    { id: "win", label: "Gagnant", color: T.green, bg: T.greenBg },
    { id: "loss", label: "Perdant", color: T.red, bg: T.redBg },
  ];
  /* Exemple tiré d'un trade : date, instrument et P&L viennent du trade et ne
     se ressaisissent pas. Seuls restent le R, la capture et la leçon. */
  const fromTrade = Boolean(form.tradeId);

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
        {fromTrade ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, background: FIELD_BG }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{(trade?.symbol ?? form.symbol) || "—"}</span>
            {trade && <span style={{ fontSize: 12, color: T.textSub }}>{sideOf(trade)}</span>}
            <span style={{ fontSize: 12, color: T.textMut, flex: 1 }}>{fmtDate(trade ? dayOf(trade) : form.date)}</span>
            {trade
              ? <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: toneOf(pnlOf(trade)) }}>{fmtMoney(pnlOf(trade))}</span>
              : <span style={{ fontSize: 12, color: T.textMut }}>Trade introuvable</span>}
          </div>
        ) : (
          <>
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
            <FieldGrid columns={2}>
              <Field label="Date">
                <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label="Instrument">
                <Input value={form.symbol} onChange={(e) => set({ symbol: e.target.value })} placeholder="NQ, EURUSD…" />
              </Field>
            </FieldGrid>
          </>
        )}
        <Field label="Résultat en R" hint={fromTrade ? "Facultatif — le P&L vient du trade." : undefined}>
          <Input value={form.r} onChange={(e) => set({ r: e.target.value })} inputMode="decimal" placeholder="2.5" />
        </Field>
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
