"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, FolderPlus, CornerDownLeft, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/lib/contexts/AppContext";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { useUndo } from "@/lib/contexts/UndoContext";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, AreaDotsDefs, areaDotsFill, PeriodPills } from "@/components/ui/da";
import { Field, FieldGrid, Input, Select, Textarea, Modal, PillButton, IconButton, CheckChip } from "@/components/ui/form";
import {
  emptyJournal, normalizeJournal, effectiveR, tagStats, strategyStats, summarize,
  sessionLabel, groupBySession, equityBySession,
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

const STORAGE_KEY = "tao_backtest_journal";
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

const today = () => new Date().toISOString().slice(0, 10);

/** Un backtest neuf hérite des défauts de sa session : on y teste en général
 *  une stratégie sur un instrument, les ressaisir à chaque setup est du bruit. */
const emptyForm = (session) => ({
  date: today(),
  symbol: session?.symbol || "",
  direction: "long",
  strategyId: session?.strategyId || "",
  sessionId: session?.id || "",
  outcome: "win",
  r: "",
  confluences: [],
  mistakes: [],
  better: "",
});

const emptySessionForm = () => ({ name: "", date: today(), strategyId: "", symbol: "", notes: "" });

/* Valeurs spéciales du sélecteur de session. */
const ALL = "all";
const NONE = "none";

export default function BacktestPage() {
  /* Les stratégies viennent de la coquille (table Supabase), pas du journal :
     une stratégie décrite dans « Stratégies » doit être backtestable sans être
     ressaisie, et son renommage doit suivre partout. */
  const { strategies } = useApp();
  const [raw, setRaw, hydrated] = useCloudState(STORAGE_KEY, CLOUD_KEY, emptyJournal());
  const journal = useMemo(() => normalizeJournal(raw), [raw]);
  const { pushUndo } = useUndo();

  const [filter, setFilter] = useState("all");
  const [sessionView, setSessionView] = useState(ALL);
  const [form, setForm] = useState(null);      // null = modale fermée
  const [editingId, setEditingId] = useState(null);
  const [sessionForm, setSessionForm] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);

  const { sessions } = journal;
  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions]);
  /* Une session supprimée ailleurs (autre appareil) ne doit pas laisser la page
     sur une vue vide sans issue : on retombe sur l'ensemble. */
  const view = sessionView === ALL || sessionView === NONE || sessionById.has(sessionView) ? sessionView : ALL;
  const currentSession = sessionById.get(view) || null;

  /* Tout ce qui se lit — bilan, courbe, classements — porte sur la session
     affichée : c'est le sens même d'une session, qu'on juge seule. */
  const entries = useMemo(() => {
    if (view === ALL) return journal.entries;
    if (view === NONE) return journal.entries.filter(e => e.sessionId === null);
    return journal.entries.filter(e => e.sessionId === view);
  }, [journal.entries, view]);
  const stats = useMemo(() => summarize(entries), [entries]);
  const confluenceStats = useMemo(() => tagStats(entries, "confluences"), [entries]);
  const mistakeStats = useMemo(() => tagStats(entries, "mistakes"), [entries]);
  const curve = useMemo(() => equityBySession(entries), [entries]);
  const hasOrphans = journal.entries.some(e => e.sessionId === null);

  /* Le classement par stratégie porte des IDS ; c'est ici qu'ils redeviennent
     un nom et une couleur — une stratégie supprimée entre-temps garde sa ligne
     sous un libellé neutre plutôt que de faire disparaître ses backtests. */
  const strategyById = useMemo(
    () => new Map((strategies || []).map(st => [String(st.id), st])),
    [strategies],
  );
  const byStrategy = useMemo(
    () => strategyStats(entries).map(stat => ({
      ...stat,
      tag: strategyById.get(stat.tag)?.name || "Stratégie supprimée",
      color: strategyById.get(stat.tag)?.color,
    })),
    [entries, strategyById],
  );
  const matches = (e) => filter === "all" || e.outcome === filter;
  const groups = useMemo(
    () => (view === ALL && sessions.length > 0 ? groupBySession(journal.entries, sessions) : null),
    [view, sessions, journal.entries],
  );

  /* Toute écriture repart du magasin NORMALISÉ : `prev` est le JSON brut du
     cache, qui peut venir d'une version antérieure du modèle. */
  const update = (fn) => setRaw(prev => fn(normalizeJournal(prev)));

  /* Un backtest ajouté depuis la vue d'ensemble va dans la session la plus
     récente : c'est presque toujours celle qu'on est en train de mener. */
  const openNew = (session = currentSession || (view === ALL ? sessions[0] : null)) => {
    setEditingId(null);
    setForm(emptyForm(session));
  };
  const openEdit = (entry) => {
    setEditingId(entry.id);
    setForm({
      ...entry,
      r: entry.r === null ? "" : String(entry.r),
      strategyId: entry.strategyId ?? "",
      sessionId: entry.sessionId ?? "",
    });
  };

  const save = () => {
    if (!form) return;
    const previous = editingId ? journal.entries.find(e => e.id === editingId) : null;
    const entry = {
      id: editingId ?? `bt_${Date.now()}`,
      date: form.date,
      symbol: form.symbol.trim(),
      direction: form.direction,
      strategyId: form.strategyId || null,
      sessionId: form.sessionId || null,
      outcome: form.outcome,
      r: form.r.trim() === "" ? null : Number(String(form.r).replace(",", ".")),
      confluences: form.confluences,
      mistakes: form.mistakes,
      better: form.better,
      /* L'horodatage de saisie ordonne les setups d'une même journée : le
         réécrire à chaque modification déplacerait le setup en fin de série. */
      createdAt: previous?.createdAt ?? new Date().toISOString(),
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
    const snapshot = journal.entries.find(e => e.id === id);
    update(store => ({ ...store, entries: store.entries.filter(e => e.id !== id) }));
    if (snapshot) pushUndo({
      label: "Suppression du backtest",
      undo: async () => update(store => ({ ...store, entries: [snapshot, ...store.entries] })),
      redo: async () => update(store => ({ ...store, entries: store.entries.filter(e => e.id !== snapshot.id) })),
    });
  };

  /* La saisie rapide ne connaît que le résultat, le R et le sens : le reste
     vient de la session visée, ou à défaut du dernier setup noté — pendant une
     séance, c'est le même instrument et la même stratégie d'un setup à l'autre.
     La date reprend celle du dernier setup de la session : on rejoue une même
     journée de graphique, pas le jour où l'on saisit. */
  const quickAdd = ({ outcome, r, direction }) => {
    const target = currentSession || (view === ALL ? sessions[0] : null) || null;
    const pool = target ? journal.entries.filter(e => e.sessionId === target.id) : journal.entries;
    const previous = pool[0] || journal.entries[0];
    const entry = {
      id: `bt_${Date.now()}`,
      date: previous?.date || target?.date || today(),
      symbol: target?.symbol || previous?.symbol || "",
      direction,
      strategyId: target?.strategyId || previous?.strategyId || null,
      sessionId: target?.id ?? null,
      outcome,
      r,
      confluences: [],
      mistakes: [],
      better: "",
      createdAt: new Date().toISOString(),
    };
    update(store => ({ ...store, entries: [entry, ...store.entries] }));
  };

  const openNewSession = () => { setEditingSessionId(null); setSessionForm(emptySessionForm()); };
  const openEditSession = (session) => {
    setEditingSessionId(session.id);
    setSessionForm({ ...session, strategyId: session.strategyId ?? "" });
  };
  const saveSession = () => {
    if (!sessionForm) return;
    const previous = editingSessionId ? sessionById.get(editingSessionId) : null;
    const session = {
      id: editingSessionId ?? `bts_${Date.now()}`,
      name: sessionForm.name.trim(),
      date: sessionForm.date || today(),
      strategyId: sessionForm.strategyId || null,
      symbol: sessionForm.symbol.trim(),
      notes: sessionForm.notes,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
    };
    update(store => ({
      ...store,
      sessions: editingSessionId
        ? store.sessions.map(s => (s.id === editingSessionId ? session : s))
        : [session, ...store.sessions],
    }));
    setSessionForm(null);
    setEditingSessionId(null);
    // Une session qu'on vient d'ouvrir est celle qu'on va remplir.
    setSessionView(session.id);
  };

  /* Supprimer une session emporte ses backtests : une session est une unité de
     travail, et ses setups n'ont de sens que lus ensemble. L'annulation rend
     les deux d'un coup. */
  const removeSession = (id) => {
    const snapshot = sessionById.get(id);
    const owned = journal.entries.filter(e => e.sessionId === id);
    const drop = (store) => ({
      ...store,
      sessions: store.sessions.filter(s => s.id !== id),
      entries: store.entries.filter(e => e.sessionId !== id),
    });
    update(drop);
    setSessionView(ALL);
    if (snapshot) pushUndo({
      label: "Suppression de la session",
      undo: async () => update(store => ({
        ...store,
        sessions: [snapshot, ...store.sessions],
        entries: [...owned, ...store.entries],
      })),
      redo: async () => update(drop),
    });
  };

  if (useFirstLoad(hydrated, STORAGE_KEY)) {
    return <PageSkeleton variant="stats" label="Backtest" gap={16} toolbarRight={[168]} />;
  }

  const isEmpty = journal.entries.length === 0 && sessions.length === 0;
  const visible = entries.filter(matches);
  /* Le numéro d'un setup est son rang dans la séquence affichée : c'est lui
     qu'on retrouve sur la courbe au survol (« #12 »), et c'est par lui qu'on
     se repère quand on relit une série de trente. */
  const rankOf = new Map(entries.map((e, i) => [e.id, entries.length - i]));
  const rowOf = (entry) => (
    <EntryRow key={entry.id} entry={entry} rank={rankOf.get(entry.id)}
              strategy={entry.strategyId ? strategyById.get(entry.strategyId) : undefined}
              onEdit={() => openEdit(entry)} onDelete={() => remove(entry.id)} />
  );
  const quickTarget = currentSession || (view === ALL ? sessions[0] : null) || null;

  return (
    <div className="anim-1 tao-bt-wrap">
      <div className="tao-bt-layout">
      {!isEmpty && (
        <SessionRail
          sessions={sessions}
          entries={journal.entries}
          hasOrphans={hasOrphans}
          value={view}
          onSelect={setSessionView}
          onNew={openNewSession}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0, gridColumn: isEmpty ? "1 / -1" : undefined }}>
        <PageHeader
          session={currentSession}
          view={view}
          strategy={currentSession?.strategyId ? strategyById.get(currentSession.strategyId) : undefined}
          sessionCount={sessions.length}
          onEditSession={currentSession ? () => openEditSession(currentSession) : undefined}
          onDeleteSession={currentSession ? () => removeSession(currentSession.id) : undefined}
          onNewSession={isEmpty ? undefined : openNewSession}
          onAdd={() => openNew()}
        />

        {isEmpty ? (
          <div style={{ ...CARD, padding: "56px 24px", textAlign: "center" }}>
            <div style={{ ...TYPE.headline, color: T.text, marginBottom: 8 }}>Aucun backtest pour l&apos;instant</div>
            <div style={{ ...TYPE.body, color: T.textSub, maxWidth: 420, margin: "0 auto 18px" }}>
              Ouvre une session — une stratégie, un instrument, une question à
              vérifier — puis note chaque setup rejoué : gagnant ou perdant, les
              confluences, les erreurs, et ce que tu aurais dû mieux faire.
            </div>
            <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <PillButton variant="primary" onClick={openNewSession}>
                <FolderPlus size={14} strokeWidth={2} /> Nouvelle session
              </PillButton>
              <PillButton onClick={() => openNew()}>
                <Plus size={14} strokeWidth={2} /> Ajouter un backtest
              </PillButton>
            </div>
          </div>
        ) : (
          <>
            {/* La saisie rapide d'abord : pendant une séance on enchaîne les
                setups sans quitter le graphique des yeux, et une modale par
                setup transformait trente relevés en trente formulaires. */}
            <QuickAdd target={quickTarget} onAdd={quickAdd} onDetails={() => openNew()} />

            {entries.length === 0 ? (
              <div style={{ ...CARD, padding: "32px 24px", textAlign: "center", ...TYPE.body, color: T.textSub }}>
                {currentSession ? "Session ouverte — note son premier setup ci-dessus." : "Aucun backtest ici."}
              </div>
            ) : (
              <>
                <Overview stats={stats} curve={curve.points} breaks={view === ALL ? curve.breaks : []} />

                {/* Ce qui rapporte à gauche, ce qui coûte à droite : la question
                    est « lequel des deux pèse le plus », elle se lit d'un regard
                    et non en comparant deux cartes l'une sous l'autre. */}
                <div className="tao-field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <TagRanking title="Confluences" subtitle="Ce qui rapporte" color={PALETTE.green} stats={confluenceStats}
                              empty="Coche des confluences dans tes backtests pour voir lesquelles tiennent." />
                  <TagRanking title="Erreurs" subtitle="Ce qui coûte" color={PALETTE.red} stats={mistakeStats}
                              empty="Aucune erreur relevée pour l'instant." />
                </div>

                {/* Masqué tant qu'aucun backtest ne porte de stratégie : une
                    carte vide occuperait la place sans rien dire. */}
                {byStrategy.length > 0 && (
                  <TagRanking title="Par stratégie" subtitle="Laquelle garder" color={T.textSub} stats={byStrategy}
                              empty="Aucun backtest rattaché à une stratégie." />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                  <div style={{ ...TYPE.headline, color: T.text }}>Setups</div>
                  <div style={{ marginLeft: "auto" }}>
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
                  </div>
                </div>

                <div role="list" aria-label="Setups" style={{ ...CARD, padding: 0 }}>
                  {groups ? (
                    /* Dans la vue d'ensemble, les setups restent rangés par
                       session : une liste continue recollerait les séances. */
                    groups.filter(g => g.entries.some(matches)).map((g, i) => (
                      <React.Fragment key={g.session?.id ?? NONE}>
                        <button type="button" onClick={() => setSessionView(g.session?.id ?? NONE)}
                          style={{
                            display: "flex", alignItems: "baseline", gap: 8, width: "100%",
                            padding: "12px 16px 8px", border: "none", cursor: "pointer", textAlign: "left",
                            borderTop: i > 0 ? `1px solid ${HAIRLINE}` : "none",
                            background: "transparent", fontFamily: "inherit",
                          }}>
                          <span style={{ ...TYPE.label, fontWeight: 600, color: T.text }}>
                            {g.session ? sessionLabel(g.session) : "Sans session"}
                          </span>
                          <span style={{ ...TYPE.caption, color: T.textMut }}>
                            {g.entries.length} setup{g.entries.length > 1 ? "s" : ""}
                          </span>
                        </button>
                        {g.entries.filter(matches).map(rowOf)}
                      </React.Fragment>
                    ))
                  ) : visible.map(rowOf)}
                  {visible.length === 0 && (
                    <div style={{ padding: 24, textAlign: "center", ...TYPE.body, color: T.textMut }}>
                      Aucun backtest dans ce filtre.
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
      </div>

      {form && (
        <EntryModal
          form={form} setForm={setForm}
          journal={journal}
          strategies={strategies || []}
          editing={editingId !== null}
          onClose={() => { setForm(null); setEditingId(null); }}
          onSave={save}
          onDelete={editingId ? () => { remove(editingId); setForm(null); setEditingId(null); } : undefined}
        />
      )}

      {sessionForm && (
        <SessionModal
          form={sessionForm} setForm={setSessionForm}
          strategies={strategies || []}
          editing={editingSessionId !== null}
          onClose={() => { setSessionForm(null); setEditingSessionId(null); }}
          onSave={saveSession}
          onDelete={editingSessionId ? () => { removeSession(editingSessionId); setSessionForm(null); setEditingSessionId(null); } : undefined}
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

/** Sans l'année : dans la colonne des sessions, elle se répète d'une ligne à
 *  l'autre et repousse le nom hors de la largeur. */
function fmtShortDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const rColor = (r) => (r > 0 ? T.pnlPos : r < 0 ? T.pnlNeg : T.textMut);

/* ── Colonne des sessions ───────────────────────────────────────────────── */

/** Les sessions en colonne plutôt que dans un menu déroulant : on passe de
 *  l'une à l'autre pour les comparer, et le menu cachait justement ce qu'on
 *  compare — le bilan de chacune. */
function SessionRail({ sessions, entries, hasOrphans, value, onSelect, onNew }) {
  const items = [
    { id: ALL, label: "Vue d'ensemble", sub: `${sessions.length} session${sessions.length > 1 ? "s" : ""}`, entries },
    ...sessions.map(s => ({
      id: s.id, label: sessionLabel(s), sub: fmtShortDate(s.date),
      entries: entries.filter(e => e.sessionId === s.id),
    })),
    ...(hasOrphans ? [{ id: NONE, label: "Sans session", sub: "Avant les sessions", entries: entries.filter(e => e.sessionId === null) }] : []),
  ];
  return (
    <nav aria-label="Sessions" className="tao-bt-rail">
      <div className="tao-bt-rail-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 4px 12px" }}>
        <span style={{ ...TYPE.label, fontWeight: 600, color: T.textSub }}>Sessions</span>
        <IconButton onClick={onNew} aria-label="Nouvelle session" title="Nouvelle session">
          <Plus size={15} strokeWidth={2} />
        </IconButton>
      </div>
      {items.map((item, i) => {
        const s = summarize(item.entries);
        const active = value === item.id;
        return (
          <React.Fragment key={item.id}>
            {/* La vue d'ensemble n'est pas une session : un filet la sépare
                des séances, qu'on lit comme une liste homogène. */}
            {i === 1 && <div className="tao-bt-rail-sep" style={{ height: 1, background: HAIRLINE, margin: "6px 12px" }} />}
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? "true" : undefined}
              className="tao-bt-rail-item"
              style={{
                display: "flex", flexDirection: "column", gap: 6, width: "100%",
                padding: "10px 12px", border: "none", borderRadius: 10, cursor: "pointer",
                textAlign: "left", fontFamily: "inherit",
                background: active ? T.white : "transparent",
                boxShadow: active ? T.elevCard : "none",
                transition: "var(--tr-ui)",
              }}
            >
              <span style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
                <span style={{
                  ...TYPE.body, fontWeight: 600, color: T.text, flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {item.label}
                </span>
                <span style={{ ...TYPE.label, ...TABULAR, fontWeight: 600, color: s.count ? rColor(s.totalR) : T.textMut }}>
                  {s.count ? fmtR(s.totalR) : "—"}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                <span style={{ ...TYPE.caption, color: T.textMut, whiteSpace: "nowrap" }}>
                  {item.sub} · {s.count} setup{s.count > 1 ? "s" : ""}
                </span>
                <OutcomeBar stats={s} />
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/** La répartition gagnants / perdants / BE en une barre : assez pour situer
 *  une séance d'un coup d'œil, sans relire trois chiffres par ligne. */
function OutcomeBar({ stats }) {
  if (!stats.count) return <span style={{ flex: 1 }} />;
  const parts = [
    { n: stats.wins, color: PALETTE.green },
    { n: stats.breakevens, color: PALETTE.blue },
    { n: stats.losses, color: PALETTE.red },
  ];
  return (
    <span aria-hidden style={{ flex: 1, display: "flex", gap: 2, height: 4, minWidth: 24 }}>
      {parts.filter(p => p.n > 0).map((p, i) => (
        <span key={i} style={{ flex: p.n, background: p.color, borderRadius: 999, opacity: 0.85 }} />
      ))}
    </span>
  );
}

/* ── En-tête ────────────────────────────────────────────────────────────── */

/** Le titre de ce qu'on regarde, et les actions qui s'y rapportent. Une
 *  session porte sa question (« ce que la session doit vérifier ») sous son
 *  nom : c'est ce qu'on doit pouvoir trancher en lisant la page. */
function PageHeader({ session, view, strategy, sessionCount, onEditSession, onDeleteSession, onNewSession, onAdd }) {
  const title = session ? sessionLabel(session) : view === NONE ? "Sans session" : "Backtest";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ ...TYPE.title2, fontWeight: 500, color: T.text, margin: 0, minWidth: 0 }}>{title}</h1>
        {session && (
          <span style={{ display: "inline-flex", gap: 2 }}>
            <IconButton onClick={onEditSession} aria-label="Modifier la session"><Pencil size={13} strokeWidth={1.75} /></IconButton>
            <IconButton tone="danger" onClick={onDeleteSession} aria-label="Supprimer la session"><Trash2 size={13} strokeWidth={1.75} /></IconButton>
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onNewSession && sessionCount === 0 && (
            <PillButton onClick={onNewSession}>
              <FolderPlus size={14} strokeWidth={2} /> Nouvelle session
            </PillButton>
          )}
          <PillButton variant="primary" onClick={onAdd}>
            <Plus size={14} strokeWidth={2} /> Ajouter un backtest
          </PillButton>
        </div>
        <div id="tao-page-header-slot" />
      </div>
      {session && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", ...TYPE.label, color: T.textSub }}>
          <span>{fmtDate(session.date)}</span>
          {session.strategyId && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: strategy?.color || T.textMut }} />
              {strategy?.name || "Stratégie supprimée"}
            </span>
          )}
          {session.symbol && <Chip label={session.symbol} />}
        </div>
      )}
      {session?.notes.trim() && (
        <div style={{ ...TYPE.body, color: T.text, whiteSpace: "pre-wrap", borderLeft: `2px solid ${HAIRLINE}`, paddingLeft: 10, marginTop: 4 }}>
          {session.notes}
        </div>
      )}
    </div>
  );
}

/* ── Saisie rapide ──────────────────────────────────────────────────────── */

/**
 * Un setup en une frappe : le R puis Entrée. Le signe dit le résultat
 * (positif gagnant, négatif perdant, zéro BE), les trois boutons servent quand
 * on n'a pas mesuré le R ou qu'un gagnant sort à +0,2. Tout le reste — tags,
 * leçon — se complète ensuite en cliquant la ligne, ou d'emblée par
 * « Détails ».
 */
function QuickAdd({ target, onAdd, onDetails }) {
  const [r, setR] = useState("");
  const [direction, setDirection] = useState("long");
  const inputRef = React.useRef(null);
  const parsed = r.trim() === "" ? null : Number(r.replace(",", ".").replace("−", "-"));
  const invalid = parsed !== null && Number.isNaN(parsed);

  const commit = (outcome) => {
    if (invalid) return;
    const resolved = outcome ?? (parsed === null ? null : parsed > 0 ? "win" : parsed < 0 ? "loss" : "be");
    if (!resolved) return;
    onAdd({ outcome: resolved, r: parsed, direction });
    setR("");
    // Le curseur reste dans le champ : le setup suivant se tape aussitôt.
    inputRef.current?.focus();
  };

  return (
    <div style={{ ...CARD, padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 120, paddingLeft: 4 }}>
        <span style={{ ...TYPE.label, fontWeight: 600, color: T.text }}>Saisie rapide</span>
        <span style={{ ...TYPE.caption, color: T.textMut, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {target ? `→ ${sessionLabel(target)}` : "→ sans session"}
        </span>
      </div>
      <div style={{ width: 132 }}>
        <Segmented value={direction} onChange={setDirection}
                   options={[{ id: "long", label: "Long" }, { id: "short", label: "Short" }]} />
      </div>
      <div style={{ position: "relative", flex: "1 1 140px", minWidth: 120 }}>
        <Input
          ref={inputRef}
          aria-label="Résultat en R (saisie rapide)"
          value={r}
          onChange={(e) => setR(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          inputMode="decimal"
          placeholder="R, puis Entrée — ex. 2.5 ou -1"
          style={{ paddingRight: 34, ...(invalid ? { boxShadow: `inset 0 0 0 1px ${T.red}` } : null) }}
        />
        <CornerDownLeft size={14} strokeWidth={1.75} color={T.textMut}
                        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {OUTCOMES.map(o => (
          <button key={o.id} type="button" onClick={() => commit(o.id)}
            aria-label={`Ajouter un setup ${o.label.toLowerCase()}`}
            style={{
              minHeight: 34, padding: "0 14px", borderRadius: 999, border: "none", cursor: "pointer",
              fontFamily: "inherit", ...TYPE.label, fontWeight: 600, whiteSpace: "nowrap",
              background: `${o.color}1F`, color: o.color, transition: "var(--tr-ui)",
            }}>
            + {o.id === "be" ? "BE" : o.id === "win" ? "Gain" : "Perte"}
          </button>
        ))}
      </div>
      <PillButton variant="ghost" onClick={onDetails} title="Saisie complète : confluences, erreurs, leçon">
        <SlidersHorizontal size={14} strokeWidth={1.75} /> Détails
      </PillButton>
    </div>
  );
}

/* ── Bilan ──────────────────────────────────────────────────────────────── */

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ ...TYPE.label, color: T.textSub, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ ...TYPE.title3, ...TABULAR, fontWeight: 500, color: color || T.text, whiteSpace: "nowrap" }}>{value}</span>
      {sub && <span style={{ ...TYPE.caption, color: T.textMut, whiteSpace: "nowrap" }}>{sub}</span>}
    </div>
  );
}

/** Le bilan et la courbe dans un même bloc : le R cumulé est le dernier point
 *  de la courbe, les séparer obligeait à faire le lien de tête. */
function Overview({ stats, curve, breaks }) {
  return (
    <div style={{ ...CARD, padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 32, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginRight: "auto" }}>
          <span style={{ ...TYPE.label, color: T.textSub }}>R cumulé</span>
          <span style={{ ...TYPE.display, ...TABULAR, fontWeight: 500, letterSpacing: -0.4, color: rColor(stats.totalR) }}>
            {fmtR(stats.totalR)}
          </span>
        </div>
        <Stat label="Backtests" value={String(stats.count)}
              sub={`${stats.wins}G · ${stats.losses}P · ${stats.breakevens}BE`} />
        <Stat label="Taux de réussite" value={`${stats.winRate}%`}
              sub={stats.breakevens > 0 ? "scratchs exclus" : "sur les trades tranchés"} />
        <Stat label="Espérance" value={fmtR(stats.avgR)} color={rColor(stats.avgR)} sub="par backtest" />
      </div>
      <EquityCurve curve={curve} breaks={breaks} />
    </div>
  );
}

/* ── Lignes ─────────────────────────────────────────────────────────────── */

/** Pastille de résultat : la couleur porte l'information, le mot la confirme. */
function OutcomeTag({ outcome }) {
  const o = OUTCOME_BY_ID[outcome] || OUTCOME_BY_ID.be;
  return (
    <span style={{
      ...TYPE.caption, fontWeight: 600, color: o.color, textAlign: "center",
      background: `${o.color}1F`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap", minWidth: 58,
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

/** Une ligne par setup, cliquable pour la compléter : la saisie rapide laisse
 *  volontairement les tags pour après, il faut donc qu'y revenir coûte un clic. */
function EntryRow({ entry, rank, strategy, onEdit, onDelete }) {
  const r = effectiveR(entry);
  const [hover, setHover] = useState(false);
  return (
    <div
      role="listitem"
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px",
        borderTop: `1px solid ${HAIRLINE}`, cursor: "pointer",
        background: hover ? T.rowHighlight : "transparent", transition: "var(--tr-ui)",
      }}
    >
      <div className="tao-bt-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ ...TYPE.caption, ...TABULAR, color: T.textMut, width: 24, textAlign: "right", flexShrink: 0 }}>
          {rank ? `#${rank}` : ""}
        </span>
        <OutcomeTag outcome={entry.outcome} />
        <span style={{ ...TYPE.body, fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>{entry.symbol || "—"}</span>
        <span style={{ ...TYPE.label, color: T.textSub }}>{entry.direction === "short" ? "Short" : "Long"}</span>
        {entry.strategyId && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...TYPE.label, color: T.textSub, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: strategy?.color || T.textMut }} />
            {strategy?.name || "Stratégie supprimée"}
          </span>
        )}
        {/* En ligne sur grand écran ; sous la ligne quand la place manque
            (cf. `.tao-bt-tags`), sans quoi les tags écrasaient le résultat. */}
        <div className="tao-bt-tags" style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0, flex: 1 }}>
          {entry.confluences.map(tag => <Chip key={`c-${tag}`} label={tag} color={PALETTE.green} />)}
          {entry.mistakes.map(tag => <Chip key={`m-${tag}`} label={tag} color={PALETTE.red} />)}
        </div>
        <span className="tao-bt-date" style={{ ...TYPE.caption, color: T.textMut, whiteSpace: "nowrap" }}>{fmtShortDate(entry.date)}</span>
        <span style={{ ...TYPE.body, ...TABULAR, fontWeight: 600, color: rColor(r), whiteSpace: "nowrap", textAlign: "right", minWidth: 56, marginLeft: "auto" }}>
          {fmtR(r)}
          {/* Le R non mesuré est signalé : sans ça, un ±1R de convention se lit
              comme un relevé, et le total paraît plus précis qu'il ne l'est. */}
          {entry.r === null && (
            <span title="R non mesuré : compté ±1R" style={{ display: "block", ...TYPE.caption2, color: T.textMut, fontWeight: 500 }}>par défaut</span>
          )}
        </span>
        <IconButton tone="danger" aria-label="Supprimer"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    style={{ opacity: hover ? 1 : 0.35 }}>
          <Trash2 size={13} strokeWidth={1.75} />
        </IconButton>
      </div>

      {entry.better.trim() && (
        /* La leçon en retrait, sous le résultat : c'est la seule ligne qu'on
           relit avant de retourner sur le graphique. */
        <div style={{ display: "flex", gap: 8, paddingLeft: 36, ...TYPE.body, color: T.textSub }}>
          <span style={{ ...TYPE.caption, color: T.textMut, whiteSpace: "nowrap", paddingTop: 1 }}>J&apos;aurais dû</span>
          <span style={{ color: T.text, whiteSpace: "pre-wrap" }}>{entry.better}</span>
        </div>
      )}
    </div>
  );
}

/* ── Classements ────────────────────────────────────────────────────────── */

const RANKING_ROWS = 6;

/** Un classement : chaque ligne porte une barre proportionnelle à son R total,
 *  qui fait voir l'écart entre le premier et le reste — dans une colonne de
 *  chiffres, +18R et +2R ont la même largeur. Replié sur les premiers rangs :
 *  la queue du classement se consulte, elle ne se lit pas. */
function TagRanking({ title, subtitle, color, stats, empty }) {
  const [all, setAll] = useState(false);
  const shown = all ? stats : stats.slice(0, RANKING_ROWS);
  const scale = Math.max(...stats.map(s => Math.abs(s.totalR)), 0) || 1;
  return (
    <div style={{ ...CARD, padding: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px 6px", display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, alignSelf: "center" }} />
        <span style={{ ...TYPE.callout, fontWeight: 600, color: T.text }}>{title}</span>
        <span style={{ ...TYPE.caption, color: T.textMut }}>{subtitle}</span>
      </div>
      {stats.length === 0 ? (
        <div style={{ padding: "4px 16px 16px", ...TYPE.body, color: T.textMut }}>{empty}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table aria-label={title} style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Tag</Th><Th align="right">N</Th><Th align="right">Réussite</Th><Th align="right">R moy.</Th><Th align="right">R total</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <tr key={s.tag} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  <Td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        {/* La pastille ne sert qu'aux stratégies, qui ont une
                            couleur à elles ; les tags n'en ont pas. */}
                        {s.color && <span style={{ width: 7, height: 7, borderRadius: 999, background: s.color }} />}
                        {s.tag}
                      </span>
                      <span aria-hidden style={{ height: 3, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
                        <span style={{
                          display: "block", height: "100%", borderRadius: 999,
                          width: `${(Math.abs(s.totalR) / scale) * 100}%`,
                          background: s.totalR >= 0 ? T.pnlPos : T.pnlNeg,
                        }} />
                      </span>
                    </div>
                  </Td>
                  <Td align="right" color={T.textSub}>{s.count}</Td>
                  <Td align="right">{s.wins + s.losses > 0 ? `${s.winRate}%` : "—"}</Td>
                  <Td align="right" color={rColor(s.avgR)}>{fmtR(s.avgR)}</Td>
                  <Td align="right" color={rColor(s.totalR)} strong>{fmtR(s.totalR)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {stats.length > RANKING_ROWS && (
        <button type="button" onClick={() => setAll(v => !v)}
          style={{
            marginTop: "auto", padding: "10px 16px", border: "none", borderTop: `1px solid ${HAIRLINE}`,
            background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            ...TYPE.label, color: T.textSub,
          }}>
          {all ? "Replier" : `Voir les ${stats.length} lignes`}
        </button>
      )}
    </div>
  );
}

function Th({ children, align = "left" }) {
  return <th style={{ padding: "8px 16px", textAlign: align, ...TYPE.caption, fontWeight: 500, color: T.textMut, whiteSpace: "nowrap" }}>{children}</th>;
}
function Td({ children, align = "left", color, strong }) {
  return <td style={{ padding: "10px 16px", textAlign: align, verticalAlign: "top", ...TYPE.label, ...TABULAR, fontWeight: strong ? 600 : 400, color: color || T.text }}>{children}</td>;
}

/* ── Courbe ─────────────────────────────────────────────────────────────── */

/** Courbe d'équité en R, backtest par backtest — et non jour par jour comme
 *  une courbe de trading : un après-midi de backtest produit trente setups à la
 *  même date, et c'est leur séquence qu'on vient lire. Reprend la trame de
 *  points commune aux graphiques du site (`AreaDotsDefs`). `breaks` marque en
 *  pointillé les changements de session dans la vue d'ensemble. */
function EquityCurve({ curve, breaks = [] }) {
  /* Le viewBox suit la largeur mesurée plutôt que d'étirer une largeur fixe
     avec `preserveAspectRatio="none"` : l'étirement ovalisait les points de la
     trame et écrasait les libellés d'axe. */
  const ref = React.useRef(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState(null);
  const uid = React.useId().replace(/:/g, "");
  // Le <svg> n'existe qu'à partir de deux points : l'observer se rebranche alors.
  const drawable = curve.length >= 2;
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawable]);

  if (!drawable) {
    return (
      <div style={{ padding: "28px 0 8px", textAlign: "center", ...TYPE.body, color: T.textMut }}>
        Deux backtests suffiront à tracer la courbe.
      </div>
    );
  }

  /* La série part de 0 (avant le premier setup) : sans ce point d'origine, un
     premier gagnant à +3R faisait démarrer la courbe en l'air. */
  const series = [{ date: curve[0].date, cum: 0 }, ...curve];
  const W = width, H = 200;
  const pad = { l: 44, r: 8, t: 12, b: 12 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  /* L'échelle suit l'étendue réelle, zéro compris — et non une échelle
     symétrique autour de zéro, qui laissait vide la moitié du cadre dès que la
     courbe restait d'un seul côté. */
  const max = Math.max(...series.map(p => p.cum), 0);
  const min = Math.min(...series.map(p => p.cum), 0);
  const span = (max - min) || 1;
  const lo = min - span * 0.06, hi = max + span * 0.06;

  const x = (i) => pad.l + (i / (series.length - 1)) * innerW;
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * innerH;
  const line = series.map((p, i) => `${x(i)},${y(p.cum)}`).join(" ");
  const last = series[series.length - 1];
  const color = last.cum >= 0 ? T.pnlPos : T.pnlNeg;
  const ticks = [...new Set([max, 0, min])];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / innerW) * (series.length - 1));
    setHover(Math.max(1, Math.min(series.length - 1, i)));
  };
  const hp = hover != null ? series[hover] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative" }}>
        <svg ref={ref} width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
          style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs>
            <AreaDotsDefs id={uid} color={color} top={pad.t} bottom={H - pad.b} width={W} height={H} />
          </defs>
          {ticks.map(v => (
            <g key={v}>
              <line x1={pad.l} y1={y(v)} x2={W - pad.r} y2={y(v)}
                    stroke={T.text} strokeOpacity={v === 0 ? 0.14 : 0.05} strokeWidth="1"
                    strokeDasharray={v === 0 ? "3 4" : undefined} />
              <text x={pad.l - 8} y={y(v)} textAnchor="end" fontSize="10" fill={T.textMut} dominantBaseline="middle">{fmtR(v)}</text>
            </g>
          ))}
          {breaks.map(i => {
            // `breaks` indexe la courbe sans origine : décalé d'un rang ici.
            const bx = (x(i) + x(i + 1)) / 2;
            return <line key={i} x1={bx} y1={pad.t} x2={bx} y2={H - pad.b} stroke={T.text} strokeOpacity="0.12" strokeWidth="1" strokeDasharray="2 4" />;
          })}
          <polygon points={`${x(0)},${y(0)} ${line} ${x(series.length - 1)},${y(0)}`} {...areaDotsFill(uid)} stroke="none" />
          <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hp ? (
            <g>
              <line x1={x(hover)} y1={pad.t} x2={x(hover)} y2={H - pad.b} stroke={T.text} strokeOpacity="0.2" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(hp.cum)} r="4.5" fill={T.white} stroke={color} strokeWidth="2" />
            </g>
          ) : (
            <circle cx={x(series.length - 1)} cy={y(last.cum)} r="3.5" fill={color} />
          )}
        </svg>
        {hp && (
          <div style={{
            position: "absolute", top: 0, pointerEvents: "none",
            left: Math.min(Math.max(x(hover) - 60, 0), W - 120), width: 120,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            ...CARD, padding: "6px 10px",
          }}>
            <span style={{ ...TYPE.caption, color: T.textMut, whiteSpace: "nowrap" }}>#{hover} · {fmtShortDate(hp.date)}</span>
            <span style={{ ...TYPE.label, ...TABULAR, fontWeight: 600, color: rColor(hp.cum) }}>{fmtR(hp.cum)}</span>
          </div>
        )}
      </div>
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

function EntryModal({ form, setForm, journal, strategies, editing, onClose, onSave, onDelete }) {
  const sessionOf = (id) => journal.sessions.find(s => s.id === id);
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
          <Field label="Session">
            <Select aria-label="Session du backtest" value={form.sessionId}
              onChange={(e) => {
                /* Changer de session sur un setup NEUF reprend ses défauts ;
                   sur un setup existant, on ne touche qu'au rattachement. */
                const next = sessionOf(e.target.value);
                set(editing || !next
                  ? { sessionId: e.target.value }
                  : { sessionId: next.id, strategyId: next.strategyId || form.strategyId, symbol: next.symbol || form.symbol });
              }}>
              <option value="">Sans session</option>
              {journal.sessions.map(s => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
            </Select>
          </Field>
          <Field label="Stratégie" hint={strategies.length === 0 ? "Aucune stratégie enregistrée — la page « Stratégies » les alimente." : undefined}>
            <Select aria-label="Stratégie" value={form.strategyId} onChange={(e) => set({ strategyId: e.target.value })}>
              {/* « Aucune » en premier et par défaut : on backteste aussi des
                  idées avant qu'elles ne portent un nom. */}
              <option value="">Aucune</option>
              {strategies.map(st => (
                <option key={st.id} value={String(st.id)}>{st.name || `Stratégie ${st.id}`}</option>
              ))}
            </Select>
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

function SessionModal({ form, setForm, strategies, editing, onClose, onSave, onDelete }) {
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));
  return (
    <Modal
      open
      title={editing ? "Modifier la session" : "Nouvelle session"}
      onClose={onClose}
      onDelete={onDelete}
      deleteLabel="Supprimer la session"
      width={520}
      footer={
        <>
          <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" onClick={onSave}>{editing ? "Enregistrer" : "Créer la session"}</PillButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldGrid columns={2}>
          <Field label="Nom" hint="Vide = la date.">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="iFVG hors killzone" />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Stratégie testée" hint="Reprise par chaque backtest de la session.">
            <Select aria-label="Stratégie de la session" value={form.strategyId} onChange={(e) => set({ strategyId: e.target.value })}>
              <option value="">Aucune</option>
              {strategies.map(st => (
                <option key={st.id} value={String(st.id)}>{st.name || `Stratégie ${st.id}`}</option>
              ))}
            </Select>
          </Field>
          <Field label="Instrument">
            <Input value={form.symbol} onChange={(e) => set({ symbol: e.target.value })} placeholder="NQ, EURUSD…" />
          </Field>
        </FieldGrid>
        <Field label="Ce que la session doit vérifier">
          <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })}
                    placeholder="Le iFVG tient-il hors des killzones ?" />
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
