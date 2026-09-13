"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Activity, Target, AlertTriangle } from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { useUndo } from "@/lib/contexts/UndoContext";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, AreaDotsDefs, areaDotsFill, PeriodPills } from "@/components/ui/da";
import { Field, FieldGrid, Input, Textarea, Modal, PillButton, IconButton, CheckChip } from "@/components/ui/form";
import {
  emptyJournal, normalizeJournal, effectiveR, tagStats, summarize,
} from "@/lib/backtest/journal";

/**
 * Page Backtest — le journal des setups rejoués à la main.
 *
 * On y note un backtest comme on le vit : gagnant ou perdant, ce qui le
 * justifiait (les confluences), ce qu'on a mal fait (les erreurs), et ce qu'on
 * aurait dû faire autrement. Le reste de la page n'est que la lecture de ces
 * quatre champs — et sa seule vraie question : QUELLE confluence rapporte, et
 * quelle erreur coûte. Un journal qu'on remplit sans jamais en retirer ce
 * classement n'est qu'un carnet.
 *
 * Le modèle et les calculs vivent dans `lib/backtest/journal.ts` (à ne pas
 * confondre avec `lib/backtest/engine.ts`, qui rejoue les trades réels).
 */

const STORAGE_KEY = "tr4de_backtest_journal";
const CLOUD_KEY = "backtest_journal";

/* Les trois résultats, avec leur couleur. Des hex pris dans la palette et non
   des tokens `T` : `CheckChip` et les pastilles les concatènent avec un canal
   alpha, ce qu'une `var(--color-*)` ne permet pas. */
const OUTCOMES = [
  { id: "win",  label: "Gagnant", color: PALETTE.green },
  { id: "loss", label: "Perdant", color: PALETTE.red },
  { id: "be",   label: "BE",      color: PALETTE.blue },
];
const OUTCOME_BY_ID = Object.fromEntries(OUTCOMES.map(o => [o.id, o]));

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  symbol: "",
  direction: "long",
  outcome: "win",
  r: "",
  confluences: [],
  mistakes: [],
  better: "",
});

export default function BacktestPage() {
  const [raw, setRaw, hydrated] = useCloudState(STORAGE_KEY, CLOUD_KEY, emptyJournal());
  const journal = useMemo(() => normalizeJournal(raw), [raw]);
  const { pushUndo } = useUndo();

  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState(null);      // null = modale fermée
  const [editingId, setEditingId] = useState(null);

  const { entries } = journal;
  const stats = useMemo(() => summarize(entries), [entries]);
  const confluenceStats = useMemo(() => tagStats(entries, "confluences"), [entries]);
  const mistakeStats = useMemo(() => tagStats(entries, "mistakes"), [entries]);
  const curve = useMemo(() => equityCurve(entries), [entries]);
  const shown = filter === "all" ? entries : entries.filter(e => e.outcome === filter);

  /* Toute écriture repart du magasin NORMALISÉ : `prev` est le JSON brut du
     cache, qui peut venir d'une version antérieure du modèle. */
  const update = (fn) => setRaw(prev => fn(normalizeJournal(prev)));

  const openNew = () => { setEditingId(null); setForm(emptyForm()); };
  const openEdit = (entry) => {
    setEditingId(entry.id);
    setForm({ ...entry, r: entry.r === null ? "" : String(entry.r) });
  };

  const save = () => {
    if (!form) return;
    const entry = {
      id: editingId ?? `bt_${Date.now()}`,
      date: form.date,
      symbol: form.symbol.trim(),
      direction: form.direction,
      outcome: form.outcome,
      r: form.r.trim() === "" ? null : Number(String(form.r).replace(",", ".")),
      confluences: form.confluences,
      mistakes: form.mistakes,
      better: form.better,
      createdAt: new Date().toISOString(),
    };
    update(store => ({
      ...store,
      /* Les tags saisis rejoignent les catalogues : une confluence inventée
         pendant la saisie doit être cochable au backtest suivant, sinon on la
         retape à chaque fois — et deux graphies du même mot font deux lignes
         dans le classement. */
      confluences: mergeTags(store.confluences, entry.confluences),
      mistakes: mergeTags(store.mistakes, entry.mistakes),
      entries: editingId
        ? store.entries.map(e => (e.id === editingId ? entry : e))
        : [entry, ...store.entries],
    }));
    setForm(null);
    setEditingId(null);
  };

  const remove = (id) => {
    const snapshot = entries.find(e => e.id === id);
    update(store => ({ ...store, entries: store.entries.filter(e => e.id !== id) }));
    if (snapshot) pushUndo({
      label: "Suppression du backtest",
      undo: async () => update(store => ({ ...store, entries: [snapshot, ...store.entries] })),
      redo: async () => update(store => ({ ...store, entries: store.entries.filter(e => e.id !== snapshot.id) })),
    });
  };

  if (useFirstLoad(hydrated, STORAGE_KEY)) {
    return <PageSkeleton variant="stats" label="Backtest" gap={16} toolbarRight={[168]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {entries.length > 0 && (
          <PeriodPills
            value={filter}
            onChange={setFilter}
            track
            size={13}
            options={[
              { id: "all",  label: `Tous (${stats.count})` },
              { id: "win",  label: `Gagnants (${stats.wins})` },
              { id: "loss", label: `Perdants (${stats.losses})` },
            ]}
          />
        )}
        <PillButton variant="primary" onClick={openNew} style={{ marginLeft: "auto" }}>
          <Plus size={14} strokeWidth={2} /> Ajouter un backtest
        </PillButton>
        <div id="tr4de-page-header-slot" />
      </div>

      {entries.length === 0 ? (
        <div style={{ ...CARD, padding: "60px 24px", textAlign: "center" }}>
          <div style={{ ...TYPE.headline, color: T.text, marginBottom: 8 }}>Aucun backtest pour l&apos;instant</div>
          <div style={{ ...TYPE.body, color: T.textSub, maxWidth: 420, margin: "0 auto 18px" }}>
            Note chaque setup rejoué : gagnant ou perdant, les confluences qui
            l&apos;ont justifié, les erreurs commises, et ce que tu aurais dû mieux
            faire. Le classement des confluences se construit tout seul ensuite.
          </div>
          <PillButton variant="primary" onClick={openNew}>
            <Plus size={14} strokeWidth={2} /> Ajouter un backtest
          </PillButton>
        </div>
      ) : (
        <>
          <div className="tr4de-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            <Kpi label="Backtests" value={String(stats.count)}
                 sub={`${stats.wins}G · ${stats.losses}P · ${stats.breakevens}BE`} />
            <Kpi label="Taux de réussite" value={`${stats.winRate}%`}
                 sub={stats.breakevens > 0 ? "scratchs exclus" : "sur les trades tranchés"} />
            <Kpi label="R cumulé" value={fmtR(stats.totalR)}
                 color={stats.totalR >= 0 ? T.green : T.red} sub="multiples de risque" />
            <Kpi label="Espérance" value={fmtR(stats.avgR)}
                 color={stats.avgR >= 0 ? T.green : T.red} sub="par backtest" />
          </div>

          <EquityCurve curve={curve} />

          {/* Les deux classements côte à côte : ce qui rapporte à gauche, ce qui
              coûte à droite. Les lire séparément reviendrait à comparer deux
              pages — or la question est bien « lequel des deux pèse le plus ». */}
          <div className="tr4de-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <TagRanking title="Confluences" icon={Target} color={PALETTE.green} stats={confluenceStats}
                        empty="Coche des confluences dans tes backtests pour voir lesquelles tiennent." />
            <TagRanking title="Erreurs" icon={AlertTriangle} color={PALETTE.red} stats={mistakeStats}
                        empty="Aucune erreur relevée pour l'instant." />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {shown.map(entry => (
              <EntryRow key={entry.id} entry={entry}
                        onEdit={() => openEdit(entry)} onDelete={() => remove(entry.id)} />
            ))}
            {shown.length === 0 && (
              <div style={{ ...CARD, padding: 24, textAlign: "center", ...TYPE.body, color: T.textMut }}>
                Aucun backtest dans ce filtre.
              </div>
            )}
          </div>
        </>
      )}

      {form && (
        <EntryModal
          form={form} setForm={setForm}
          journal={journal}
          editing={editingId !== null}
          onClose={() => { setForm(null); setEditingId(null); }}
          onSave={save}
          onDelete={editingId ? () => { remove(editingId); setForm(null); setEditingId(null); } : undefined}
        />
      )}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function mergeTags(catalog, added) {
  const out = [...catalog];
  for (const tag of added) if (!out.includes(tag)) out.push(tag);
  return out;
}

/** « +2,5R » — un signe toujours présent : sur une colonne de résultats, c'est
 *  lui qu'on suit du regard, pas le chiffre. */
function fmtR(value) {
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toLocaleString(undefined, { maximumFractionDigits: 2 })}R`;
}

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * L'équité en R, backtest par backtest — et non jour par jour comme une courbe
 * de trading. Un après-midi de backtest produit trente setups à la même date :
 * les agréger par jour écraserait la séquence, alors que c'est exactement ce
 * qu'on vient lire (les séries perdantes, l'ordre dans lequel ça s'est passé).
 */
function equityCurve(entries) {
  let cum = 0;
  return [...entries].reverse().map(entry => {
    cum += effectiveR(entry);
    return { date: entry.date, cum };
  });
}

/* ── Sous-composants ────────────────────────────────────────────────────── */

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <div style={{ ...TYPE.label, color: T.textMut, marginBottom: 6 }}>{label}</div>
      <div style={{ ...TYPE.title2, ...TABULAR, fontWeight: 600, color: color || T.text }}>{value}</div>
      {sub && <div style={{ ...TYPE.caption, color: T.textMut, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** Pastille de résultat : la couleur porte l'information, le mot la confirme. */
function OutcomeTag({ outcome }) {
  const o = OUTCOME_BY_ID[outcome] || OUTCOME_BY_ID.be;
  return (
    <span style={{
      ...TYPE.caption, fontWeight: 600, color: o.color,
      background: `${o.color}1F`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap",
    }}>
      {o.label}
    </span>
  );
}

function Chip({ label, color }) {
  return (
    <span style={{
      ...TYPE.caption, color: color || T.textSub,
      background: color ? `${color}14` : FIELD_BG,
      borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function EntryRow({ entry, onEdit, onDelete }) {
  const r = effectiveR(entry);
  return (
    <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <OutcomeTag outcome={entry.outcome} />
        <span style={{ ...TYPE.callout, fontWeight: 600, color: T.text }}>
          {entry.symbol || "—"}
        </span>
        <span style={{ ...TYPE.caption, color: T.textSub }}>
          {entry.direction === "short" ? "Short" : "Long"}
        </span>
        <span style={{ ...TYPE.caption, color: T.textMut }}>{fmtDate(entry.date)}</span>
        <span style={{
          marginLeft: "auto", ...TYPE.callout, ...TABULAR, fontWeight: 600,
          color: r > 0 ? T.green : r < 0 ? T.red : T.textMut,
        }}>
          {fmtR(r)}
          {/* Le R non mesuré est signalé : sans ça, un ±1R de convention se lit
              comme un relevé, et le total paraît plus précis qu'il ne l'est. */}
          {entry.r === null && <span style={{ ...TYPE.caption, color: T.textMut, fontWeight: 500 }}> (par défaut)</span>}
        </span>
        <IconButton onClick={onEdit} aria-label="Modifier"><Pencil size={13} strokeWidth={1.75} /></IconButton>
        <IconButton tone="danger" onClick={onDelete} aria-label="Supprimer"><Trash2 size={13} strokeWidth={1.75} /></IconButton>
      </div>

      {(entry.confluences.length > 0 || entry.mistakes.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {entry.confluences.map(tag => <Chip key={`c-${tag}`} label={tag} color={PALETTE.green} />)}
          {entry.mistakes.map(tag => <Chip key={`m-${tag}`} label={tag} color={PALETTE.red} />)}
        </div>
      )}

      {entry.better.trim() && (
        /* La leçon en retrait, sur un filet : c'est la seule ligne qu'on relit
           avant de retourner sur le graphique. Elle ne doit pas se confondre
           avec les métadonnées du dessus. */
        <div style={{ borderLeft: `2px solid ${HAIRLINE}`, paddingLeft: 10 }}>
          <div style={{ ...TYPE.caption, color: T.textMut, marginBottom: 2 }}>J&apos;aurais dû</div>
          <div style={{ ...TYPE.body, color: T.text, whiteSpace: "pre-wrap" }}>{entry.better}</div>
        </div>
      )}
    </div>
  );
}

function TagRanking({ title, icon: Icon, color, stats, empty }) {
  return (
    <div style={{ ...CARD, padding: 0 }}>
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={14} strokeWidth={1.75} color={color} />
        <div style={{ ...TYPE.callout, fontWeight: 600, color: T.text }}>{title}</div>
      </div>
      {stats.length === 0 ? (
        <div style={{ padding: "0 16px 16px", ...TYPE.body, color: T.textMut }}>{empty}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table aria-label={title} style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Tag</Th><Th align="right">N</Th><Th align="right">Réussite</Th><Th align="right">R moy.</Th><Th align="right">R total</Th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.tag} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  <Td>{s.tag}</Td>
                  <Td align="right" color={T.textSub}>{s.count}</Td>
                  <Td align="right">{s.wins + s.losses > 0 ? `${s.winRate}%` : "—"}</Td>
                  <Td align="right" color={s.avgR >= 0 ? T.green : T.red}>{fmtR(s.avgR)}</Td>
                  <Td align="right" color={s.totalR >= 0 ? T.green : T.red}>{fmtR(s.totalR)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left" }) {
  return <th style={{ padding: "8px 16px", textAlign: align, ...TYPE.caption, fontWeight: 500, color: T.textMut }}>{children}</th>;
}
function Td({ children, align = "left", color }) {
  return <td style={{ padding: "9px 16px", textAlign: align, ...TYPE.label, ...TABULAR, color: color || T.text }}>{children}</td>;
}

/** Courbe d'équité en R. Reprend la trame de points commune aux graphiques du
 *  site (`AreaDotsDefs`), pour que la page n'invente pas un second dessin. */
function EquityCurve({ curve }) {
  if (curve.length < 2) {
    return (
      <div style={{ ...CARD, padding: 24, textAlign: "center", ...TYPE.body, color: T.textMut }}>
        Deux backtests suffiront à tracer la courbe.
      </div>
    );
  }

  const W = 800, H = 220;
  const pad = { l: 40, r: 16, t: 16, b: 20 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = Math.max(...curve.map(p => p.cum), 0);
  const min = Math.min(...curve.map(p => p.cum), 0);
  const range = Math.max(Math.abs(max), Math.abs(min)) || 1;

  const x = (i) => pad.l + (i / (curve.length - 1)) * innerW;
  const y = (v) => pad.t + innerH / 2 - (v / range) * (innerH / 2);
  const points = curve.map((p, i) => `${x(i)},${y(p.cum)}`).join(" ");
  const last = curve[curve.length - 1];
  const positive = last.cum >= 0;

  return (
    <div style={{ ...CARD }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Activity size={14} strokeWidth={1.75} color={T.textMut} />
        <div style={{ ...TYPE.callout, fontWeight: 600, color: T.text }}>Équité cumulée</div>
        <div style={{ marginLeft: "auto", ...TYPE.callout, ...TABULAR, fontWeight: 600, color: positive ? T.green : T.red }}>
          {fmtR(last.cum)}
        </div>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: "block" }}>
        <defs>
          <AreaDotsDefs id="btj" color={positive ? T.green : T.red} top={pad.t} bottom={H - pad.b} width={W} height={H} />
        </defs>
        <line x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} stroke={T.border} strokeWidth="1" />
        <polyline points={`${pad.l},${y(0)} ${points} ${x(curve.length - 1)},${y(0)}`} {...areaDotsFill("btj")} stroke="none" />
        <polyline points={points} fill="none" stroke={positive ? T.green : T.red} strokeWidth="2" />
        <text x={pad.l - 6} y={y(max)} textAnchor="end" fontSize="10" fill={T.textMut} alignmentBaseline="middle">{fmtR(max)}</text>
        <text x={pad.l - 6} y={y(min)} textAnchor="end" fontSize="10" fill={T.textMut} alignmentBaseline="middle">{fmtR(min)}</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", ...TYPE.caption2, color: T.textMut, paddingLeft: pad.l, paddingRight: pad.r }}>
        <span>{fmtDate(curve[0].date)}</span>
        <span>{fmtDate(last.date)}</span>
      </div>
    </div>
  );
}

/* ── Saisie ─────────────────────────────────────────────────────────────── */

/** Un groupe de cases à cocher avec ajout libre : le vocabulaire d'un trader
 *  n'est pas celui d'un autre, et une liste figée se contourne en écrivant tout
 *  dans le champ de texte — là où rien ne se compte. */
function TagPicker({ label, hint, catalog, selected, color, onToggle, onAdd }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft("");
  };
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {catalog.map(tag => (
          <CheckChip key={tag} label={tag} color={color}
                     checked={selected.includes(tag)} onClick={() => onToggle(tag)} />
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        /* Entrée valide le tag et NON le formulaire : dans une modale, la
           touche partirait sinon enregistrer le backtest au milieu de la
           saisie du vocabulaire. */
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        onBlur={commit}
        placeholder="Ajouter…"
        compact
      />
    </Field>
  );
}

function EntryModal({ form, setForm, journal, editing, onClose, onSave, onDelete }) {
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));
  const toggle = (key, tag) => set({
    [key]: form[key].includes(tag) ? form[key].filter(t => t !== tag) : [...form[key], tag],
  });
  const add = (key, tag) => { if (!form[key].includes(tag)) set({ [key]: [...form[key], tag] }); };

  return (
    <Modal
      open
      title={editing ? "Modifier le backtest" : "Nouveau backtest"}
      onClose={onClose}
      onDelete={onDelete}
      width={620}
      footer={
        <>
          <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" onClick={onSave}>{editing ? "Enregistrer" : "Ajouter"}</PillButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldGrid columns={3}>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Instrument">
            <Input value={form.symbol} onChange={(e) => set({ symbol: e.target.value })} placeholder="NQ, EURUSD…" />
          </Field>
          <Field label="Sens">
            <Segmented
              value={form.direction}
              onChange={(direction) => set({ direction })}
              options={[{ id: "long", label: "Long" }, { id: "short", label: "Short" }]}
            />
          </Field>
        </FieldGrid>

        <FieldGrid columns={2}>
          <Field label="Résultat">
            <Segmented
              value={form.outcome}
              onChange={(outcome) => set({ outcome })}
              options={OUTCOMES}
            />
          </Field>
          <Field label="Résultat en R" hint="Vide = ±1R selon le résultat.">
            <Input
              value={form.r}
              onChange={(e) => set({ r: e.target.value })}
              inputMode="decimal"
              placeholder="2.5"
            />
          </Field>
        </FieldGrid>

        <TagPicker
          label="Confluences" hint="Ce qui justifiait l'entrée."
          catalog={journal.confluences} selected={form.confluences} color={PALETTE.green}
          onToggle={(tag) => toggle("confluences", tag)} onAdd={(tag) => add("confluences", tag)}
        />

        <TagPicker
          label="Erreurs" hint="Ce qui a été mal exécuté, même sur un gagnant."
          catalog={journal.mistakes} selected={form.mistakes} color={PALETTE.red}
          onToggle={(tag) => toggle("mistakes", tag)} onAdd={(tag) => add("mistakes", tag)}
        />

        <Field label="Ce que j'aurais dû mieux faire">
          <Textarea
            value={form.better}
            onChange={(e) => set({ better: e.target.value })}
            placeholder="Attendre la clôture de la bougie de rejet avant d'entrer…"
          />
        </Field>
      </div>
    </Modal>
  );
}

/** Sélecteur segmenté : deux ou trois choix exclusifs, tous visibles. Un menu
 *  déroulant cacherait la moitié d'une décision qui se prend d'un coup d'œil. */
function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 4, background: FIELD_BG, borderRadius: 999, padding: 3 }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            style={{
              flex: 1, minHeight: 30, borderRadius: 999, border: "none", cursor: "pointer",
              fontFamily: "inherit", ...TYPE.label, fontWeight: 600,
              background: active ? (o.color ? `${o.color}24` : T.white) : "transparent",
              boxShadow: active && !o.color ? T.elevPill : "none",
              color: active ? (o.color || T.text) : T.textSub,
              transition: "var(--tr-ui)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
