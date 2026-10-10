"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, Pencil, ImagePlus, X, AlertTriangle, Trophy, TrendingDown,
  BarChart3, ListChecks, BookMarked, Copy,
} from "lucide-react";
import { useApp } from "@/lib/contexts/AppContext";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { useTradeStrategyLinks } from "@/lib/hooks/useTradeStrategyLinks";
import { useUndo } from "@/lib/contexts/UndoContext";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, BackLink, PeriodPills } from "@/components/ui/da";
import { Field, FieldGrid, Input, Select, Textarea, Modal, PillButton, IconButton } from "@/components/ui/form";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { emptyJournal, normalizeJournal, summarize } from "@/lib/backtest/journal";
import {
  emptyPlaybook, normalizePlaybook, emptySetup, newId, STATUSES,
  completeness, exampleStats, tradeStats, tradesOfStrategy,
} from "@/lib/playbook/model";
import { uploadPlaybookImage } from "@/lib/playbook/images";

/**
 * Page Playbook — une fiche par setup, celle qu'on relit avant de cliquer.
 *
 * La liste montre toutes les fiches avec leur degré de complétude : une fiche
 * à moitié remplie est un setup qu'on trade encore à l'instinct, et ça doit se
 * voir depuis la liste, pas seulement en l'ouvrant. La fiche ouverte se lit
 * comme un document et s'édite sur place — pas de modale pour du texte long :
 * on écrit une invalidation en regardant la capture juste au-dessus.
 *
 * Le modèle vit dans `lib/playbook/model.ts`, les captures dans le stockage
 * Supabase (`lib/playbook/images.ts`).
 */

const STORAGE_KEY = "tao_playbook";
const CLOUD_KEY = "playbook";
/* Les mêmes clés que la page Backtest : le relais de `useCloudState` partage
   le journal entre les deux pages, la fiche lit les backtests sans copie. */
const BACKTEST_STORAGE_KEY = "tao_backtest_journal";
const BACKTEST_CLOUD_KEY = "backtest_journal";

/* Hex de la palette, pas des tokens : les pastilles leur concatènent un canal
   alpha, ce qu'une `var(--color-*)` ne permet pas. */
const OUTCOMES = [
  { id: "win", label: "Gagnant", color: PALETTE.green },
  { id: "loss", label: "Perdant", color: PALETTE.red },
];
const STATUS_COLOR = { active: PALETTE.green, testing: PALETTE.blue, retired: null };

const fireAlert = (title, body) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tao:alert", { detail: { title, body, severity: "danger" } }));
  }
};

export default function PlaybookPage() {
  const { strategies, trades } = useApp();
  const { user } = useAuth();
  const [raw, setRaw, hydrated] = useCloudState(STORAGE_KEY, CLOUD_KEY, emptyPlaybook());
  const [btRaw] = useCloudState(BACKTEST_STORAGE_KEY, BACKTEST_CLOUD_KEY, emptyJournal());
  const links = useTradeStrategyLinks();
  const playbook = useMemo(() => normalizePlaybook(raw), [raw]);
  const backtests = useMemo(() => normalizeJournal(btRaw).entries, [btRaw]);
  const { pushUndo } = useUndo();

  const [openId, setOpenId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const strategyById = useMemo(
    () => new Map((strategies || []).map(st => [String(st.id), st])),
    [strategies],
  );

  /* Toute écriture repart du magasin NORMALISÉ : `prev` est le JSON brut du
     cache, qui peut venir d'une version antérieure du modèle. */
  const update = (fn) => setRaw(prev => fn(normalizePlaybook(prev)));
  const patchSetup = (id, patch) => update(store => ({
    ...store,
    setups: store.setups.map(s => (s.id === id
      ? { ...s, ...(typeof patch === "function" ? patch(s) : patch), updatedAt: new Date().toISOString() }
      : s)),
  }));

  const create = () => {
    const setup = emptySetup("Nouveau setup");
    update(store => ({ ...store, setups: [setup, ...store.setups] }));
    setOpenId(setup.id);
  };

  /* Dupliquer plutôt que repartir de zéro : une variante (même setup, autre
     marché ou autre session) partage presque tout. Les exemples ne suivent
     pas — ils appartiennent au setup sur lequel ils ont été pris. */
  const duplicate = (setup) => {
    const now = new Date().toISOString();
    const copy = {
      ...setup,
      id: newId("pb"),
      name: `${setup.name || "Setup"} (copie)`,
      examples: [],
      status: "testing",
      createdAt: now, updatedAt: now,
    };
    update(store => {
      const at = store.setups.findIndex(s => s.id === setup.id);
      const setups = [...store.setups];
      setups.splice(at + 1, 0, copy);
      return { ...store, setups };
    });
    setOpenId(copy.id);
  };

  const remove = (id) => {
    const snapshot = playbook.setups.find(s => s.id === id);
    const index = playbook.setups.findIndex(s => s.id === id);
    update(store => ({ ...store, setups: store.setups.filter(s => s.id !== id) }));
    setOpenId(null);
    /* Les captures restent dans le stockage : les effacer ici rendrait
       l'annulation inutile — la fiche reviendrait avec des images mortes. */
    if (snapshot) pushUndo({
      label: "Suppression du setup",
      undo: async () => update(store => {
        const setups = [...store.setups];
        setups.splice(Math.min(index, setups.length), 0, snapshot);
        return { ...store, setups };
      }),
      redo: async () => update(store => ({ ...store, setups: store.setups.filter(s => s.id !== snapshot.id) })),
    });
  };

  const statsOf = (setup) => ({
    examples: exampleStats(setup.examples),
    backtests: setup.strategyId ? summarize(backtests.filter(b => b.strategyId === setup.strategyId)) : null,
    trades: setup.strategyId ? tradeStats(tradesOfStrategy(trades || [], links, setup.strategyId)) : null,
  });

  if (useFirstLoad(hydrated, STORAGE_KEY)) {
    return <PageSkeleton variant="grid" label="Playbook" gap={16} toolbarRight={[140]} />;
  }

  const open = openId ? playbook.setups.find(s => s.id === openId) : null;
  if (open) {
    return (
      <SetupDetail
        setup={open}
        strategies={strategies || []}
        strategy={open.strategyId ? strategyById.get(open.strategyId) : undefined}
        stats={statsOf(open)}
        userId={user?.id}
        onBack={() => setOpenId(null)}
        onPatch={(patch) => patchSetup(open.id, patch)}
        onDuplicate={() => duplicate(open)}
        onDelete={() => remove(open.id)}
      />
    );
  }

  const counts = Object.fromEntries(STATUSES.map(s => [s.id, playbook.setups.filter(x => x.status === s.id).length]));
  const visible = playbook.setups.filter(s => statusFilter === "all" || s.status === statusFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {playbook.setups.length > 0 && (
          <PeriodPills
            value={statusFilter}
            onChange={setStatusFilter}
            track
            size={13}
            options={[
              { id: "all", label: `Tous (${playbook.setups.length})` },
              ...STATUSES.map(s => ({ id: s.id, label: `${s.label} (${counts[s.id]})` })),
            ]}
          />
        )}
        <div style={{ marginLeft: "auto" }}>
          <PillButton variant="primary" onClick={create}>
            <Plus size={14} strokeWidth={2} /> Nouveau setup
          </PillButton>
        </div>
        <div id="tao-page-header-slot" />
      </div>

      {playbook.setups.length === 0 ? (
        <div style={{ ...CARD, padding: "60px 24px", textAlign: "center" }}>
          <BookMarked size={28} strokeWidth={1.5} color={T.textMut} style={{ marginBottom: 12 }} />
          <div style={{ ...TYPE.headline, color: T.text, marginBottom: 8 }}>Ton playbook est vide</div>
          <div style={{ ...TYPE.body, color: T.textSub, maxWidth: 460, margin: "0 auto 18px" }}>
            Une fiche par setup : des captures, le contexte où il vaut quelque
            chose, l&apos;entrée, le stop, l&apos;objectif, ce qui l&apos;invalide — puis
            des exemples gagnants et perdants, et les erreurs que tu y refais.
          </div>
          <PillButton variant="primary" onClick={create}>
            <Plus size={14} strokeWidth={2} /> Créer mon premier setup
          </PillButton>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ ...CARD, padding: 24, textAlign: "center", ...TYPE.body, color: T.textMut }}>
          Aucun setup dans ce filtre.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
          {visible.map(setup => (
            <SetupCard key={setup.id} setup={setup}
                       strategy={setup.strategyId ? strategyById.get(setup.strategyId) : undefined}
                       stats={statsOf(setup)}
                       onOpen={() => setOpenId(setup.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function fmtR(value) {
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toLocaleString(undefined, { maximumFractionDigits: 2 })}R`;
}

function fmtMoney(value) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${getCurrencySymbol()}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const toneOf = (v) => (v > 0 ? T.green : v < 0 ? T.red : T.textMut);

/* ── Liste ──────────────────────────────────────────────────────────────── */

function StatusTag({ status }) {
  const s = STATUSES.find(x => x.id === status) || STATUSES[1];
  const color = STATUS_COLOR[s.id];
  return (
    <span style={{
      ...TYPE.caption, fontWeight: 600, color: color || T.textSub,
      background: color ? `${color}1F` : FIELD_BG, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function CompletenessBar({ setup }) {
  const { done, total } = completeness(setup);
  const full = done === total;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
        <div style={{ width: `${(done / total) * 100}%`, height: "100%", background: full ? T.green : T.text, borderRadius: 999 }} />
      </div>
      <span style={{ ...TYPE.caption, ...TABULAR, color: full ? T.green : T.textMut }}>{done}/{total}</span>
    </div>
  );
}

function SetupCard({ setup, strategy, stats, onOpen }) {
  const cover = setup.screenshots[0]?.url || setup.examples.find(e => e.image)?.image;
  const ex = stats.examples;
  return (
    <button type="button" onClick={onOpen} className="card-hover"
      style={{
        ...CARD, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column",
        textAlign: "left", cursor: "pointer", fontFamily: "inherit", border: "none", color: "inherit",
      }}>
      <div style={{ aspectRatio: "16 / 9", background: FIELD_BG, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
        {cover
          ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <ImagePlus size={22} strokeWidth={1.5} color={T.textMut} />}
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...TYPE.headline, fontWeight: 600, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {setup.name || "Sans nom"}
          </span>
          <StatusTag status={setup.status} />
        </div>
        {(strategy || setup.markets || setup.timeframes) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", ...TYPE.caption, color: T.textSub }}>
            {strategy && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: strategy.color || T.textMut }} />
                {strategy.name}
              </span>
            )}
            {setup.markets && <span>{setup.markets}</span>}
            {setup.timeframes && <span>{setup.timeframes}</span>}
          </div>
        )}
        <div style={{ display: "flex", gap: 14, ...TYPE.caption, color: T.textMut }}>
          <span>{ex.wins} G · {ex.losses} P</span>
          {ex.count > 0 && <span style={{ ...TABULAR, color: toneOf(ex.avgR) }}>{fmtR(ex.avgR)} / ex.</span>}
          {stats.trades && stats.trades.count > 0 && <span>{stats.trades.count} trade{stats.trades.count > 1 ? "s" : ""} réel{stats.trades.count > 1 ? "s" : ""}</span>}
        </div>
        <CompletenessBar setup={setup} />
      </div>
    </button>
  );
}

/* ── Fiche ──────────────────────────────────────────────────────────────── */

function SetupDetail({ setup, strategies, strategy, stats, userId, onBack, onPatch, onDuplicate, onDelete }) {
  const [exampleForm, setExampleForm] = useState(null); // { outcome, … } ; null = fermée
  const [viewer, setViewer] = useState(null);           // URL affichée en grand
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { missing } = completeness(setup);

  const text = (key) => ({
    value: setup[key],
    onChange: (e) => onPatch({ [key]: e.target.value }),
  });

  const saveExample = (form) => {
    const example = {
      id: form.id || newId("ex"),
      outcome: form.outcome,
      date: form.date,
      symbol: form.symbol.trim(),
      r: String(form.r).trim() === "" ? null : Number(String(form.r).replace(",", ".")),
      note: form.note,
      image: form.image,
    };
    if (example.r !== null && !Number.isFinite(example.r)) example.r = null;
    onPatch(s => ({
      examples: s.examples.some(e => e.id === example.id)
        ? s.examples.map(e => (e.id === example.id ? example : e))
        : [example, ...s.examples],
    }));
    setExampleForm(null);
  };

  const wins = setup.examples.filter(e => e.outcome === "win");
  const losses = setup.examples.filter(e => e.outcome === "loss");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <BackLink label="Playbook" onClick={onBack} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <PillButton onClick={onDuplicate}><Copy size={14} strokeWidth={2} /> Dupliquer</PillButton>
          <PillButton onClick={() => setConfirmDelete(true)}><Trash2 size={14} strokeWidth={2} /> Supprimer</PillButton>
        </div>
        <div id="tao-page-header-slot" />
      </div>

      {/* En-tête : le nom s'édite sur place, comme un titre de document. */}
      <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          aria-label="Nom du setup"
          value={setup.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="Nom du setup"
          style={{
            ...TYPE.title2, fontWeight: 600, color: T.text, background: "transparent",
            border: "none", outline: "none", padding: 0, width: "100%", fontFamily: "inherit",
          }}
        />
        <FieldGrid columns={3}>
          <Field label="Statut">
            <Select aria-label="Statut" value={setup.status} onChange={(e) => onPatch({ status: e.target.value })}>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Stratégie liée" hint={strategies.length === 0 ? "La page « Stratégies » les alimente." : "Source des stats backtest et trades réels."}>
            <Select aria-label="Stratégie liée" value={setup.strategyId ?? ""} onChange={(e) => onPatch({ strategyId: e.target.value || null })}>
              <option value="">Aucune</option>
              {strategies.map(st => <option key={st.id} value={String(st.id)}>{st.name || `Stratégie ${st.id}`}</option>)}
            </Select>
          </Field>
          <Field label="Marchés">
            <Input {...text("markets")} placeholder="NQ, ES, EURUSD…" />
          </Field>
          <Field label="Unités de temps">
            <Input {...text("timeframes")} placeholder="H1 biais · M5 entrée" />
          </Field>
          <Field label="Horaires">
            <Input {...text("sessions")} placeholder="Killzone NY 9h30–11h" />
          </Field>
        </FieldGrid>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <CompletenessBar setup={setup} />
          {missing.length > 0 && (
            <div style={{ ...TYPE.caption, color: T.textMut }}>À compléter : {missing.join(" · ")}</div>
          )}
        </div>
      </div>

      <Screenshots
        images={setup.screenshots}
        userId={userId}
        onAdd={(urls) => onPatch(s => ({ screenshots: [...s.screenshots, ...urls.map(url => ({ id: newId("img"), url, caption: "" }))] }))}
        onCaption={(id, caption) => onPatch(s => ({ screenshots: s.screenshots.map(i => (i.id === id ? { ...i, caption } : i)) }))}
        onRemove={(id) => onPatch(s => ({ screenshots: s.screenshots.filter(i => i.id !== id) }))}
        onView={setViewer}
      />

      <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <TextSection title="Contexte" hint="Biais HTF, structure, news, conditions de marché où le setup vaut quelque chose."
                     placeholder="Tendance H1 haussière, prise de liquidité sous le low asiatique…" {...text("context")} />
        <TextSection title="Setup" hint="Ce qui doit apparaître sur le graphique pour que le setup existe."
                     placeholder="Displacement qui laisse un FVG M5, retour dans le FVG…" {...text("setup")} />
      </div>

      <ItemList
        title="Checklist avant entrée" icon={ListChecks} color={T.textSub}
        items={setup.checklist}
        placeholder="Ajouter une condition…"
        emptyHint="Les conditions à cocher mentalement avant de cliquer."
        onChange={(checklist) => onPatch({ checklist })}
      />

      <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <TextSection title="Entrée" hint="Le déclencheur exact et le type d'ordre."
                     placeholder="Limite au CE du FVG, après clôture M5 dedans…" {...text("entry")} />
        <TextSection title="Stop loss" hint="Où, et pourquoi là."
                     placeholder="Sous le swing low qui a créé le FVG…" {...text("stopLoss")} />
        <TextSection title="Take profit" hint="Objectifs et partiels."
                     placeholder="TP1 high précédent (50 %), TP2 liquidité opposée…" {...text("takeProfit")} accent={T.green} />
        <TextSection title="Invalidation" hint="Ce qui annule le setup AVANT ou PENDANT le trade."
                     placeholder="Clôture M5 sous le FVG, news rouge dans 15 min…" {...text("invalidation")} accent={T.red} />
        <TextSection title="Gestion du trade" hint="Break-even, trailing, sortie anticipée."
                     placeholder="BE à +1R, trailing sous chaque FVG M1…" {...text("management")} />
        <TextSection title="Risque" hint="Taille du risque et quand la réduire."
                     placeholder="0,5 % du compte, moitié après deux pertes…" {...text("risk")} />
      </div>

      <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <ExampleColumn title="Exemples gagnants" icon={Trophy} color={PALETTE.green} examples={wins}
                       onAdd={() => setExampleForm(blankExample("win"))}
                       onEdit={(e) => setExampleForm({ ...e, r: e.r === null ? "" : String(e.r) })}
                       onView={setViewer} />
        <ExampleColumn title="Exemples perdants" icon={TrendingDown} color={PALETTE.red} examples={losses}
                       onAdd={() => setExampleForm(blankExample("loss"))}
                       onEdit={(e) => setExampleForm({ ...e, r: e.r === null ? "" : String(e.r) })}
                       onView={setViewer} />
      </div>

      <ItemList
        title="Erreurs fréquentes" icon={AlertTriangle} color={PALETTE.red}
        items={setup.mistakes}
        placeholder="Ajouter une erreur…"
        emptyHint="Ce que tu refais sur ce setup : entrer avant la clôture, déplacer le stop…"
        onChange={(mistakes) => onPatch({ mistakes })}
      />

      <StatsSection stats={stats} strategy={strategy} hasStrategy={setup.strategyId !== null} />

      <TextSection title="Notes & leçons" hint="Tout le reste : variantes, observations, idées à tester."
                   placeholder="Fonctionne moins bien le vendredi après-midi…" {...text("notes")} />

      {exampleForm && (
        <ExampleModal
          form={exampleForm} setForm={setExampleForm} userId={userId}
          editing={setup.examples.some(e => e.id === exampleForm.id)}
          onClose={() => setExampleForm(null)}
          onSave={() => saveExample(exampleForm)}
          onDelete={() => {
            onPatch(s => ({ examples: s.examples.filter(e => e.id !== exampleForm.id) }));
            setExampleForm(null);
          }}
        />
      )}

      {viewer && (
        <Modal open title="Capture" onClose={() => setViewer(null)} width={1200} bodyStyle={{ padding: 0 }}>
          <img src={viewer} alt="Capture" style={{ width: "100%", height: "auto", display: "block" }} />
        </Modal>
      )}

      {confirmDelete && (
        <Modal open scrim title="Supprimer le setup" onClose={() => setConfirmDelete(false)} width={420}
          footer={
            <>
              <PillButton variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</PillButton>
              <PillButton variant="danger" onClick={() => { setConfirmDelete(false); onDelete(); }}>Supprimer</PillButton>
            </>
          }>
          <div style={{ ...TYPE.body, color: T.text }}>
            Supprimer « {setup.name || "Sans nom"} » et ses {setup.examples.length} exemple{setup.examples.length > 1 ? "s" : ""} ?
            L&apos;action reste annulable un instant.
          </div>
        </Modal>
      )}
    </div>
  );
}

const blankExample = (outcome) => ({
  id: "", outcome, date: new Date().toISOString().slice(0, 10), symbol: "", r: "", note: "", image: "",
});

function SectionHead({ title, icon: Icon, color, hint, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      {Icon && <Icon size={14} strokeWidth={1.75} color={color || T.textSub} style={{ marginTop: 3, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.callout, fontWeight: 600, color: T.text }}>{title}</div>
        {hint && <div style={{ ...TYPE.caption, color: T.textMut, marginTop: 2 }}>{hint}</div>}
      </div>
      {action}
    </div>
  );
}

function TextSection({ title, hint, placeholder, value, onChange, accent }) {
  return (
    <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: accent ? `inset 3px 0 0 ${accent}, ${CARD.boxShadow}` : CARD.boxShadow }}>
      <SectionHead title={title} hint={hint} />
      <Textarea aria-label={title} value={value} onChange={onChange} placeholder={placeholder}
                style={{ minHeight: 96, resize: "vertical" }} />
    </div>
  );
}

/** Liste éditable sur place : chaque ligne est un champ, Entrée dans le champ
 *  du bas ajoute. Pas de bouton « Enregistrer » — rien ne doit se perdre parce
 *  qu'on a navigué ailleurs en pleine saisie. */
function ItemList({ title, icon, color, items, placeholder, emptyHint, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newId("it"), text }]);
    setDraft("");
  };
  return (
    <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionHead title={title} icon={icon} color={color} hint={items.length === 0 ? emptyHint : undefined} />
      {items.map((item, i) => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...TYPE.label, ...TABULAR, color: T.textMut, width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}.</span>
          <Input aria-label={`${title} ${i + 1}`} value={item.text}
                 onChange={(e) => onChange(items.map(x => (x.id === item.id ? { ...x, text: e.target.value } : x)))} />
          <IconButton tone="danger" aria-label="Retirer" onClick={() => onChange(items.filter(x => x.id !== item.id))}>
            <X size={13} strokeWidth={1.75} />
          </IconButton>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 18, flexShrink: 0 }} />
        <Input aria-label={placeholder} value={draft} placeholder={placeholder}
               onChange={(e) => setDraft(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <IconButton aria-label="Ajouter" onClick={add}><Plus size={13} strokeWidth={1.75} /></IconButton>
      </div>
    </div>
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
      style={{
        ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 12, outline: "none",
        boxShadow: over ? `inset 0 0 0 2px ${T.text}, ${CARD.boxShadow}` : CARD.boxShadow,
      }}
    >
      <SectionHead
        title="Captures"
        icon={ImagePlus}
        hint="Le setup type, annoté. Colle une capture (⌘V) ou glisse une image ici."
        action={
          <PillButton compact onClick={() => input.current?.click()} disabled={busy}>
            <Plus size={13} strokeWidth={2} /> {busy ? "Envoi…" : "Ajouter"}
          </PillButton>
        }
      />
      <input ref={input} type="file" accept="image/*" multiple hidden
             onChange={(e) => { take(imagesOf(e.target.files)); e.target.value = ""; }} />
      {images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 12 }}>
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
              <Input compact aria-label="Légende" value={img.caption} placeholder="Légende…"
                     onChange={(e) => onCaption(img.id, e.target.value)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExampleColumn({ title, icon, color, examples, onAdd, onEdit, onView }) {
  return (
    <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionHead
        title={`${title} (${examples.length})`} icon={icon} color={color}
        action={<PillButton compact onClick={onAdd} aria-label={`Ajouter — ${title}`}><Plus size={13} strokeWidth={2} /> Ajouter</PillButton>}
      />
      {examples.length === 0 && (
        <div style={{ ...TYPE.body, color: T.textMut }}>Aucun exemple pour l&apos;instant.</div>
      )}
      {examples.map(ex => (
        <div key={ex.id} style={{ display: "flex", gap: 10, padding: 10, borderRadius: 10, background: FIELD_BG }}>
          {ex.image && (
            <button type="button" onClick={() => onView(ex.image)} aria-label="Agrandir"
                    style={{ all: "unset", cursor: "zoom-in", width: 96, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
              <img src={ex.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...TYPE.label, fontWeight: 600, color: T.text }}>{ex.symbol || "—"}</span>
              <span style={{ ...TYPE.caption, color: T.textMut }}>{fmtDate(ex.date)}</span>
              {ex.r !== null && (
                <span style={{ marginLeft: "auto", ...TYPE.label, ...TABULAR, fontWeight: 600, color: toneOf(ex.r) }}>{fmtR(ex.r)}</span>
              )}
              <IconButton aria-label="Modifier l'exemple" onClick={() => onEdit(ex)} style={ex.r === null ? { marginLeft: "auto" } : undefined}>
                <Pencil size={12} strokeWidth={1.75} />
              </IconButton>
            </div>
            {ex.note.trim() && (
              <div style={{ ...TYPE.label, color: T.textSub, whiteSpace: "pre-wrap" }}>{ex.note}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExampleModal({ form, setForm, userId, editing, onClose, onSave, onDelete }) {
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const input = useRef(null);
  const { busy, upload } = useImageUpload(userId);
  const take = async (files) => { const [url] = await upload(files.slice(0, 1)); if (url) set({ image: url }); };

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
            {OUTCOMES.map(o => {
              const active = form.outcome === o.id;
              return (
                <button key={o.id} type="button" aria-pressed={active} onClick={() => set({ outcome: o.id })}
                  style={{
                    flex: 1, minHeight: 30, borderRadius: 999, border: "none", cursor: "pointer",
                    fontFamily: "inherit", ...TYPE.label, fontWeight: 600,
                    background: active ? `${o.color}24` : "transparent",
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

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: FIELD_BG }}>
      <div style={{ ...TYPE.caption, color: T.textMut, marginBottom: 4 }}>{label}</div>
      <div style={{ ...TYPE.headline, ...TABULAR, fontWeight: 600, color: color || T.text }}>{value}</div>
      {sub && <div style={{ ...TYPE.caption, color: T.textMut, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Trois sources, jamais additionnées : un exemple choisi pour la fiche, un
 *  backtest rejoué et un trade réel ne pèsent pas pareil. Les mêler donnerait
 *  un taux de réussite flatteur, gonflé par les exemples gagnants qu'on a
 *  justement sélectionnés pour leur clarté. */
function StatsSection({ stats, strategy, hasStrategy }) {
  const { examples: ex, backtests: bt, trades: tr } = stats;
  const rows = [
    {
      title: "Exemples de la fiche",
      empty: ex.count === 0 ? "Ajoute des exemples gagnants et perdants." : null,
      kpis: [
        { label: "Exemples", value: String(ex.count), sub: `${ex.wins} G · ${ex.losses} P` },
        { label: "Réussite", value: `${ex.winRate}%` },
        { label: "R moyen", value: fmtR(ex.avgR), color: toneOf(ex.avgR) },
        { label: "R total", value: fmtR(ex.totalR), color: toneOf(ex.totalR) },
      ],
    },
    {
      title: "Backtests",
      empty: !hasStrategy ? "Lie une stratégie pour reprendre ses backtests."
        : bt.count === 0 ? "Aucun backtest sur cette stratégie." : null,
      kpis: bt ? [
        { label: "Backtests", value: String(bt.count), sub: `${bt.wins} G · ${bt.losses} P · ${bt.breakevens} BE` },
        { label: "Réussite", value: `${bt.winRate}%` },
        { label: "Espérance", value: fmtR(bt.avgR), color: toneOf(bt.avgR) },
        { label: "R total", value: fmtR(bt.totalR), color: toneOf(bt.totalR) },
      ] : [],
    },
    {
      title: "Trades réels",
      empty: !hasStrategy ? "Lie une stratégie pour voir les trades qui lui sont affectés."
        : tr.count === 0 ? "Aucun trade affecté à cette stratégie (page Trades)." : null,
      kpis: tr ? [
        { label: "Trades", value: String(tr.count), sub: `${tr.wins} G · ${tr.losses} P` },
        { label: "Réussite", value: `${tr.winRate}%` },
        { label: "P&L moyen", value: fmtMoney(tr.avgPnl), color: toneOf(tr.avgPnl),
          sub: tr.payoff !== null ? `payoff ${tr.payoff.toFixed(2)}` : undefined },
        { label: "P&L total", value: fmtMoney(tr.totalPnl), color: toneOf(tr.totalPnl) },
      ] : [],
    },
  ];
  return (
    <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionHead title="Statistiques" icon={BarChart3}
                   hint={strategy ? `Backtests et trades réels de la stratégie « ${strategy.name} ».` : undefined} />
      {rows.map(row => (
        <div key={row.title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...TYPE.label, fontWeight: 600, color: T.textSub }}>{row.title}</div>
          {row.empty ? (
            <div style={{ ...TYPE.body, color: T.textMut }}>{row.empty}</div>
          ) : (
            <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {row.kpis.map(k => <Kpi key={k.label} {...k} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

