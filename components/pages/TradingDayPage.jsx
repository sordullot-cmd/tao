"use client";

import React from "react";
import {
  ArrowRight, Check, ChevronDown, ChevronRight,
  Flag, ListChecks, Moon, Pencil, Plus, ShieldCheck, Trash2, TrendingUp, X,
} from "lucide-react";
import { T, HAIRLINE, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";
import { t, useLang } from "@/lib/i18n";
import { fmt } from "@/lib/ui/format";
import { getLocalDateString } from "@/lib/dateUtils";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useUndo } from "@/lib/contexts/UndoContext";
import { useTradeNotes } from "@/lib/hooks/useTradeNotes";
import { useDailySessionNotes } from "@/lib/hooks/useDailySessionNotes";
import { noteTitle } from "@/lib/notes/markdown";
import {
  ROUTINE_RULES_CLOUD_KEY,
  ROUTINE_RULES_KEY,
  activeList,
  listProgress,
  newRoutineListId,
  newRoutineRuleId,
  normalizeRoutineStore,
  onRoutineChecksChange,
  readRoutineChecks,
  removeList,
  toggleRoutineCheck,
  upsertList,
} from "@/lib/routineChecklist";
import {
  GRADES,
  TRADING_DAY_CLOUD_KEY,
  TRADING_DAY_KEY,
  appliedGoalSets,
  applyGoalSet,
  applyTaskList,
  dayEntry,
  daySummary,
  isTradeRecapped,
  mergeExecutions,
  normalizeTradingDayStore,
  perAccount,
  removeGoalSet,
  reopenDay,
  saveGoalSet,
  setGrade,
  signOffDay,
  taskListIds,
  tradesOfDay,
  unapplyGoalSet,
  unapplyTaskList,
} from "@/lib/tradingDay";
import { GOAL_GROUPS, GOAL_OPS, GOAL_PERIODS, GOAL_TYPES, OP_SYMBOL, evaluateGoal, goalProgress, metricOf, opOf, periodOf, validValue } from "@/lib/sessionGoals";
import { CARD } from "@/components/ui/da";
import { CheckBox, Field, Input, Modal, PillButton, Select } from "@/components/ui/form";
import TradesList from "@/components/ui/tradesList";
import Popover from "@/components/ui/Popover";
import TradesPage from "@/components/pages/TradesPage";
import DictatableTextarea from "@/components/MicDictateButton";

/* ---------------------------------------------------------------------------
   Page « Journée » — premier onglet de « Trades ».

   Trois étapes qui se font DANS L'ORDRE de la journée : on suit ses règles,
   on relit chaque trade, on clôture. Les trois cartes se
   lisent sur une rangée — l'avancement de la journée tient d'un coup d'œil, et
   chaque carte dit déjà l'essentiel (combien, et ce qui reste) — et seule
   l'étape choisie se déplie en dessous : à 9 h on n'a rien à faire du bilan, à
   18 h plus rien à cocher.

   Rien n'est stocké en double : les listes de tâches sont les listes de
   routine de la page Discipline, le recap est le panneau de la page Trades,
   le journal écrit dans les notes (cf. lib/tradingDay).
   ------------------------------------------------------------------------- */

const pnlColor = (v) => (v > 0 ? T.pnlPos : v < 0 ? T.pnlNeg : T.textSub);
const signed = (v) => `${v > 0 ? "+" : ""}${fmt(v, false)}`;
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
const clock = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};
const bodyOf = (content) => {
  const lines = String(content || "").split("\n");
  const first = lines.findIndex(l => l.trim());
  return lines.slice(first + 1).join(" ").trim();
};

/* Colonnes du recap : l'heure seule (la carte EST une journée), le compte
   (une ligne fusionnée annonce « 2 comptes »), puis durée, R et P&L. */
const RECAP_COLUMNS = ["symbol", "direction", "time", "account", "duration", "r", "pnl"];

const readEmotionCache = () => {
  try { return JSON.parse(localStorage.getItem("tao_emotion_tags") || "{}") || {}; } catch { return {}; }
};

/* L'état de la journée et ses quatre étapes, sortis de la page : le bloc
   « Daily flow » du tableau de bord lit les MÊMES étapes. Deux calculs
   auraient fini par ne plus dire la même chose de la même journée. */
export function useTradingDay(trades = []) {
  /* La date est lue une fois au montage : la page sert UNE journée. Passé
     minuit, elle continue d'afficher celle qu'on clôture — c'est souvent à ce
     moment-là qu'on écrit son bilan. */
  const [today] = React.useState(() => getLocalDateString());

  const [rawStore, setRawStore] = useCloudState(TRADING_DAY_KEY, TRADING_DAY_CLOUD_KEY, null);
  const store = React.useMemo(() => normalizeTradingDayStore(rawStore), [rawStore]);
  const update = React.useCallback(
    (fn) => setRawStore(prev => fn(normalizeTradingDayStore(prev))),
    [setRawStore],
  );
  const entry = dayEntry(store, today);
  const signedOff = entry.signedOff;

  /* Listes de tâches = listes de routine. Même clé et même défaut que la page
     Discipline : `useCloudState` relaie les écritures entre les deux. */
  const [savedRoutine, setSavedRoutine] = useCloudState(ROUTINE_RULES_KEY, ROUTINE_RULES_CLOUD_KEY, null);
  const routineStore = React.useMemo(() => normalizeRoutineStore(savedRoutine), [savedRoutine]);
  const updateRoutine = React.useCallback(
    (fn) => setSavedRoutine(prev => fn(normalizeRoutineStore(prev))),
    [setSavedRoutine],
  );
  const [routineChecks, setRoutineChecks] = React.useState(() => readRoutineChecks());
  React.useEffect(
    () => onRoutineChecksChange((checks, date) => { if (date === today) setRoutineChecks(checks); }),
    [today],
  );
  const taskIds = taskListIds(store, routineStore.lists.map(l => l.id), activeList(routineStore).id);
  const taskLists = taskIds.map(id => routineStore.lists.find(l => l.id === id)).filter(Boolean);
  const tasksDone = taskLists.reduce((acc, l) => {
    const p = listProgress(l, routineChecks);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });

  /* ── Recap : le panneau est celui de la page Trades (mode `panelOnly`). Il
     tient ses propres copies des notes et des émotions ; il nous REMONTE
     chaque écriture (`onRecapChange`) pour que le compteur « recappés » bouge
     à la première frappe. La checklist et la note passent par `useCloudState`,
     qui relaie déjà entre les deux. */
  const { notes: serverNotes } = useTradeNotes();
  const [noteEdits, setNoteEdits] = React.useState({});
  const tradeNotes = React.useMemo(() => ({ ...serverNotes, ...noteEdits }), [serverNotes, noteEdits]);
  const [checklist] = useCloudState("tao_trade_checklist", "trades_checklist", {});
  const [ratings] = useCloudState("tao_trade_rating", "trades_rating", {});
  const [emotions, setEmotions] = React.useState(readEmotionCache);
  const onRecapChange = React.useCallback((e) => {
    if (e.type === "note") setNoteEdits(prev => ({ ...prev, [e.tradeId]: e.text }));
    else if (e.type === "emotions") setEmotions(e.emotions);
  }, []);
  const recapState = { notes: tradeNotes, checklist, emotions, ratings };

  const rawDayTrades = React.useMemo(() => tradesOfDay(trades, today), [trades, today]);
  const dayTrades = React.useMemo(() => mergeExecutions(rawDayTrades), [rawDayTrades]);
  const summary = React.useMemo(() => daySummary(dayTrades), [dayTrades]);
  // Les objectifs se lisent depuis un compte (cf. `perAccount`) ; le reste de la page garde les totaux.
  const goalTrades = React.useMemo(() => perAccount(dayTrades), [dayTrades]);
  const recapped = dayTrades.filter(tr => isTradeRecapped(tr, recapState)).length;
  const toRecap = dayTrades.length - recapped;

  // Journal : des NOTES rangées sous la date, celles de la page Notes.
  const [notes, setNotes] = useCloudState("tao_notes", "notes", []);
  const { notes: sessionNotes } = useDailySessionNotes();
  const filedNotes = React.useMemo(() => {
    const own = (Array.isArray(notes) ? notes : [])
      .filter(n => n && (n.journalDate === today || (n.createdAt && getLocalDateString(new Date(n.createdAt)) === today)))
      .map(n => ({ id: n.id, at: n.createdAt, title: noteTitle(n.content) || t("day.untitled"), body: bodyOf(n.content) }));
    /* La note de séance de la page Journal reste visible ici : elle est
       rangée sous la même journée, la taire la ferait passer pour perdue. */
    const session = String(sessionNotes?.[today] || "").trim();
    const all = session ? [{ id: "session", at: null, title: t("day.sessionNote"), body: session }, ...own] : own;
    return all.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  }, [notes, sessionNotes, today]);

  const applied = appliedGoalSets(store);
  const goals = goalProgress(applied.flatMap(gs => gs.goals), goalTrades);
  const goalsBroken = goals.results.some(r => r.status === "missed");

  /* Une étape est faite quand son contenu l'est — pas quand on l'a refermée :
     un état « validé » posé à la main finirait par mentir sur la routine. Une
     journée sans trade n'a rien à relire, son recap n'attend donc rien. */
  /* La discipline se valide sur les TÂCHES seules. Les objectifs se lisent
     dans le marché du jour : une cible de gain manquée ou une journée qui
     tourne mal ne disent pas qu'on a mal suivi ses règles. Ils restent
     affichés sur la carte, ils ne bloquent pas l'étape. */
  const disciplineOk = tasksDone.done === tasksDone.total;
  const recapOk = toRecap === 0;
  const wrapOk = !!signedOff;

  const ratio = (d, n) => (n ? d / n : 0);
  const wrapProgress = [entry.grade != null, filedNotes.length > 0, wrapOk].filter(Boolean).length / 3;

  const steps = [
    {
      icon: ShieldCheck,
      title: t("day.step.discipline"),
      subtitle: t("day.step.disciplineSub"),
      done: disciplineOk,
      big: String(tasksDone.done), unit: `/ ${tasksDone.total} ${t("day.doneLower")}`,
      line: t("day.goalsMet").replace("{d}", String(goals.done)).replace("{n}", String(goals.total)),
      progress: ratio(tasksDone.done, tasksDone.total),
      /* Une étape faite n'a que sa coche : une pastille « Fait » la doublait.
         La coche l'emporte — un objectif franchi ne défait pas une étape tenue. */
      badge: !disciplineOk && goalsBroken ? { tone: "red", text: t("day.goalBroken") } : null,
    },
    {
      icon: TrendingUp,
      title: t("day.step.recap"),
      subtitle: t("day.step.recapSub"),
      done: recapOk,
      big: String(recapped), unit: `/ ${dayTrades.length} ${t("day.recappedLower")}`,
      line: (
        <>
          <span style={{ color: pnlColor(summary.net) }}>{signed(summary.net)}</span>
          {` ${t("day.net")} · ${t("day.winnersOf").replace("{w}", String(summary.wins)).replace("{n}", String(summary.count))}`}
        </>
      ),
      progress: ratio(recapped, dayTrades.length),
      badge: toRecap > 0
        ? { tone: "amber", text: t("day.notRecapped").replace("{n}", String(toRecap)) }
        : null,
    },
    {
      icon: Moon,
      title: t("day.step.wrap"),
      subtitle: t("day.step.wrapSub"),
      done: wrapOk,
      big: wrapOk ? t("day.closed") : t("day.open"), unit: null,
      line: wrapOk ? t("day.signedOffAt").replace("{t}", clock(signedOff.at)) : t("day.notSignedOff"),
      progress: wrapProgress,
      badge: entry.grade ? { text: t("day.gradedAs").replace("{g}", entry.grade) } : null,
    },
  ];

  return {
    today, rawStore, setRawStore, store, update, entry,
    routineStore, updateRoutine, routineChecks, setRoutineChecks, taskIds, taskLists, tasksDone,
    recapState, onRecapChange, rawDayTrades, dayTrades, summary, recapped, toRecap,
    notes, filedNotes, setNotes, applied, goals, goalTrades,
    disciplineOk, recapOk, wrapOk, steps,
  };
}

/** @param {{ trades?: any[], strategies?: any[], accounts?: any[], setPage?: (page: string) => void }} props */
export default function TradingDayPage({ trades = [], strategies = [], accounts = [] }) {
  useLang();
  const {
    today, rawStore, setRawStore, store, update, entry,
    routineStore, updateRoutine, routineChecks, setRoutineChecks, taskIds, taskLists, tasksDone,
    recapState, onRecapChange, rawDayTrades, dayTrades, summary, recapped, toRecap,
    notes, setNotes, applied, goals, goalTrades,
    disciplineOk, recapOk, wrapOk, steps,
  } = useTradingDay(trades);

  /* Le journal du jour est UNE note, marquée `dayJournal`, réécrite à chaque
     frappe : plus de bouton à penser à cliquer. `useCloudState` écrit en local
     tout de suite et débounce l'envoi au cloud. Vidée, la note disparaît —
     sinon une journée sans écrit garderait une note vide dans la page Notes. */
  const journalNote = (Array.isArray(notes) ? notes : []).find(n => n && n.dayJournal && n.journalDate === today);
  const writeJournal = (text) => setNotes(prev => {
    const list = Array.isArray(prev) ? prev : [];
    const now = new Date().toISOString();
    const i = list.findIndex(n => n && n.dayJournal && n.journalDate === today);
    if (!text.trim()) return i < 0 ? list : list.filter((_, j) => j !== i);
    if (i < 0) return [{ id: Date.now(), content: text, createdAt: now, updatedAt: now, journalDate: today, dayJournal: true }, ...list];
    return list.map((n, j) => (j === i ? { ...n, content: text, updatedAt: now } : n));
  });

  /* Supprimer un set est immédiat — pas de confirmation à cliquer —, mais
     annulable : le magasin d'avant est rendu tel quel par Ctrl+Z ou le toast. */
  const { pushUndo } = useUndo();
  const deleteGoalSet = (id) => {
    const before = rawStore;
    const name = store.goalSets.find(gs => gs.id === id)?.name ?? "";
    update(st => removeGoalSet(st, id));
    pushUndo({ label: t("day.goalSetDeleted").replace("{name}", name), undo: () => setRawStore(before) });
  };

  /* À l'ouverture, l'étape en cours — la première qui reste à faire. Calculé
     une fois : rouvrir une autre étape sous les doigts de l'utilisateur parce
     qu'il vient de cocher la dernière case lui ferait perdre sa place. */
  const [openStep, setOpenStep] = React.useState(() => [disciplineOk, recapOk, wrapOk].indexOf(false));
  const toggle = (i) => setOpenStep(cur => (cur === i ? -1 : i));

  const panels = [
    {
      title: t("day.step.discipline"),
      badge: t("day.xOfY").replace("{d}", String(tasksDone.done)).replace("{n}", String(tasksDone.total)),
      /* Deux blocs et non une carte coupée en deux colonnes : objectifs et
         tâches ne se lisent pas pareil — les uns se calculent, les autres se
         cochent — et chacun a son ajout, ses sets, sa progression. */
      split: true,
      body: (
        <TwoColumns gap={16}>
          {/* `data-row` et non `data-card` : la règle d'effacement des actions
              sans le soulèvement au survol, qui ferait bouger tout le bloc. */}
          <div data-row style={{ ...CARD, padding: 20, minWidth: 0 }}>
            <GoalsColumn
              sets={store.goalSets}
              applied={applied}
              trades={goalTrades}
              progress={goals}
              onApply={(id) => update(st => applyGoalSet(st, id))}
              onUnapply={(id) => update(st => unapplyGoalSet(st, id))}
              onSave={(draft) => update(st => saveGoalSet(st, draft))}
              onDelete={deleteGoalSet}
            />
          </div>
          <div data-row style={{ ...CARD, padding: 20, minWidth: 0 }}>
            <TasksColumn
              lists={routineStore.lists}
              applied={taskLists}
              checks={routineChecks}
              progress={tasksDone}
              onToggle={(id) => setRoutineChecks(toggleRoutineCheck(id))}
              onApply={(id) => update(st => applyTaskList(st, taskIds, id))}
              onUnapply={(id) => update(st => unapplyTaskList(st, taskIds, id))}
              onSave={(list, isNew) => {
                updateRoutine(rs => upsertList(rs, list));
                if (isNew) update(st => applyTaskList(st, taskIds, list.id));
              }}
              onDelete={(id) => {
                updateRoutine(rs => removeList(rs, id));
                update(st => unapplyTaskList(st, taskIds, id));
              }}
            />
          </div>
        </TwoColumns>
      ),
    },
    {
      title: t("day.step.recap"),
      badge: t("day.xOfY").replace("{d}", String(recapped)).replace("{n}", String(dayTrades.length)),
      /* La liste et le formulaire du trade ouvert en deux blocs : dans une
         seule carte, le formulaire se confondait avec la liste. */
      split: true,
      body: (
        <RecapPanel
          dayTrades={dayTrades}
          rawDayTrades={rawDayTrades}
          summary={summary}
          recapped={recapped}
          recapState={recapState}
          accounts={accounts}
          strategies={strategies}
          onRecapChange={onRecapChange}
        />
      ),
    },
    {
      title: t("day.step.wrap"),
      badge: null,
      /* Bilan, journal, checklist, note et clôture en cartes séparées par le
         fond, comme Discipline et Recap : sous une seule carte, cinq blocs
         ne se distinguaient plus que par des aplats. */
      split: true,
      body: (
        <WrapPanel
          today={today}
          entry={entry}
          checks={[
            { ok: disciplineOk, title: t("day.step.discipline"), sub: t("day.tasksDone").replace("{d}", String(tasksDone.done)).replace("{n}", String(tasksDone.total)), link: t("day.openLink"), step: 0 },
            {
              ok: recapOk, warn: !recapOk, title: t("day.step.recap"),
              sub: recapOk ? t("day.allRecapped") : t("day.toRecapCount").replace("{n}", String(toRecap)),
              link: t("day.recapLink"), step: 1,
            },
          ]}
          onOpenStep={setOpenStep}
          journal={journalNote?.content ?? ""}
          onJournal={writeJournal}
          onGrade={(g) => update(st => setGrade(st, today, g))}
          onSignOff={(line) => update(st => signOffDay(st, today, line))}
          onReopen={() => update(st => reopenDay(st, today))}
        />
      ),
    },
  ];
  const panel = panels[openStep];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-sans)" }} className="anim-1">
      {/* Les trois étapes en carrés de taille fixe, le résumé de la journée
          prend le reste de la rangée : rectangle de la même hauteur, toujours
          à droite. Une grille et non un flex qui passe à la ligne : le résumé
          y tombait sous les carrés dès que la zone de contenu se resserrait.
          Il ne descend qu'en mobile (globals.css). */}
      <div className="tao-day-head" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 24, alignItems: "stretch" }}>
        <div role="tablist" aria-label={t("nav.day")} style={{ display: "flex", gap: 24 }}>
          {steps.map((s, i) => (
            <StepCard key={i} {...s} open={openStep === i} onToggle={() => toggle(i)} />
          ))}
        </div>
        <DaySummaryCard summary={summary} />
      </div>

      {panel && (
        <section
          role="tabpanel"
          aria-label={panel.title}
          /* Un panneau en plusieurs blocs n'a pas de carte autour : ce sont
             ses blocs qui en portent chacun une. */
          style={panel.split
            ? { display: "flex", flexDirection: "column", gap: 8 }
            : { ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Ni titre ni phrase d'introduction : la carte ouverte juste
              au-dessus les porte déjà. Restent le compteur et la fermeture. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, margin: panel.split ? 0 : "-8px -8px -12px 0" }}>
            {panel.badge && <Badge>{panel.badge}</Badge>}
            <IconBtn label={t("day.closePanel")} onClick={() => setOpenStep(-1)}><X size={16} /></IconBtn>
          </div>
          {panel.body}
        </section>
      )}
    </div>
  );
}

/* ── Résumé pour le tableau de bord ──────────────────────────────────────── */

/* Les étapes en CHAÎNE, sans leurs panneaux : sur le tableau de bord on
   vient voir où en est la journée, pas la faire. Chaque rond mène à la page,
   où l'étape se déplie ; sous la chaîne, les deux comptes de la journée —
   tâches et trades à relire —, fixes, sans étape à choisir : on vient
   chercher ces nombres-là, pas naviguer d'une étape à l'autre.

   La chaîne se lit dans l'ordre : une étape n'est validée que si celles d'avant
   le sont. Un recap fini sur une journée dont le pré-market est resté ouvert
   reste donc verrouillé — sinon les ronds verts se suivraient en pointillés et
   la chaîne ne dirait plus rien de la routine.

   Même grammaire que les carrés de la page : tuile grise et icône à l'accent,
   pastilles à liseré, barre toujours à l'accent. Aucun vert pour une étape
   réussie : la coche et le maillon à l'accent suffisent à le dire. */
const RING = 40;
const RING_R = 18;
const RING_LEN = 2 * Math.PI * RING_R;
const LINK_GAP = RING / 2 + 6;
const LINK = {
  position: "absolute", top: RING / 2 - 1, height: 2, borderRadius: 999,
  transition: "background var(--dur-base) var(--ease-out)",
};

export function DayFlowSummary({ trades = [], onOpen, header = null }) {
  useLang();
  const {
    steps, tasksDone, taskLists, routineChecks, setRoutineChecks,
    dayTrades, recapState, recapped, toRecap,
  } = useTradingDay(trades);
  // Une seule liste dépliée à la fois : les deux ouvertes allongeaient le bloc
  // au point de pousser le Tao Score hors de l'écran.
  const [openList, setOpenList] = React.useState(null);
  const pendingTasks = taskLists.flatMap(l => l.items.filter(it => !routineChecks[it.id]));
  const pendingTrades = dayTrades.filter(tr => !isTradeRecapped(tr, recapState));
  const current = steps.findIndex(s => !s.done);
  const reached = current === -1 ? steps.length : current;
  const link = (i) => (i < reached ? T.brand : HAIRLINE);
  const stateOf = (i) => (i < reached ? "done" : i === reached ? "current" : "locked");

  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column", padding: 0 }}>
      {header && <div style={{ padding: "16px 16px 0" }}>{header}</div>}
      <div role="group" aria-label={t("nav.dailyFlow")} style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, padding: "16px 8px 12px" }}>
        {steps.map((s, i) => {
          const Icon = s.icon;
          const state = stateOf(i);
          const progress = Math.max(0, Math.min(1, s.progress));
          const status = state === "done"
            ? t("day.done")
            : state === "locked"
              ? t("day.locked")
              // « 1 / 3 » sans le mot qui suit : un quart de carte n'a pas la place.
              : [s.big, s.unit && s.unit.split(" ").slice(0, 2).join(" ")].filter(Boolean).join(" ");
          return (
            <button
              key={i}
              type="button"
              onClick={onOpen}
              aria-label={`${s.title} — ${state === "locked" ? `${t("day.locked")}, ${t("day.lockedHint")}` : status}`}
              aria-current={state === "current" ? "step" : undefined}
              style={{
                position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                minWidth: 0, padding: "4px 4px 6px", border: "none", background: "transparent",
                cursor: onOpen ? "pointer" : "default", fontFamily: "inherit", color: T.text,
              }}
            >
              {/* Le maillon est coupé en deux moitiés, une par colonne, et
                  s'arrête avant le rond : les fonds des ronds sont des voiles
                  translucides, un trait passé dessous se verrait à travers. */}
              {i > 0 && <span aria-hidden style={{ ...LINK, left: 0, right: `calc(50% + ${LINK_GAP}px)`, background: link(i - 1) }} />}
              {i < steps.length - 1 && <span aria-hidden style={{ ...LINK, left: `calc(50% + ${LINK_GAP}px)`, right: 0, background: link(i) }} />}

              <span aria-hidden style={{
                position: "relative", width: RING, height: RING, borderRadius: "50%", flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: FIELD_BG,
                // Faite, l'étape garde sa tuile : seule l'icône cède la place à la coche.
                color: state === "locked" ? T.textMut : T.brand,
                transition: "color var(--dur-base) var(--ease-out)",
              }}>
                {/* L'étape en cours porte son avancement en anneau : le rond dit
                    déjà « c'est ici », l'anneau dit « il en reste tant ». */}
                {state === "current" && (
                  <svg width={RING} height={RING} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
                    <circle cx={RING / 2} cy={RING / 2} r={RING_R} fill="none" stroke={HAIRLINE} strokeWidth={2.5} />
                    <circle
                      cx={RING / 2} cy={RING / 2} r={RING_R} fill="none" stroke={T.brand} strokeWidth={2.5} strokeLinecap="round"
                      strokeDasharray={RING_LEN} strokeDashoffset={RING_LEN * (1 - progress)}
                      style={{ transition: "stroke-dashoffset var(--dur-base) var(--ease-out)" }}
                    />
                  </svg>
                )}
                {state === "done" ? <Check size={17} strokeWidth={2.5} /> : <Icon size={17} strokeWidth={1.75} />}
              </span>

              <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0, width: "100%", textAlign: "center" }}>
                <span style={{
                  ...TYPE.label, fontWeight: state === "current" ? 600 : 500,
                  color: state === "locked" ? T.textMut : T.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                }}>{s.title}</span>
                <span style={{
                  ...TYPE.caption, fontVariantNumeric: "tabular-nums",
                  color: state === "locked" ? T.textMut : T.textSub,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                }}>{status}</span>
              </span>
            </button>
          );
        })}
      </div>
      {/* Ce qui reste à faire, en deux lignes qui se déplient : le compte se
          lit fermé, la liste s'ouvre sur place. Les tâches se cochent d'ici
          — c'est la même coche que la page Discipline —, les trades mènent à
          la page, où le recap a son panneau. */}
      {/* Fond blanc comme la carte : un liseré suffit à grouper les deux
          lignes, un aplat gris les faisait lire comme un champ désactivé. */}
      <div style={{ margin: "0 12px 12px", borderRadius: 12, background: T.white, border: `1px solid ${HAIRLINE}`, overflow: "hidden" }}>
        <TodoRow
          icon={ListChecks}
          label={t("day.stat.tasks")}
          sub={t("day.stat.doneOf").replace("{d}", String(tasksDone.done)).replace("{n}", String(tasksDone.total))}
          count={pendingTasks.length}
          open={openList === "tasks"}
          onToggle={() => setOpenList(v => (v === "tasks" ? null : "tasks"))}
        >
          {pendingTasks.length === 0
            ? <TodoEmpty>{t("day.stat.allDone")}</TodoEmpty>
            : pendingTasks.map(it => (
              <button
                key={it.id}
                type="button"
                role="checkbox"
                aria-checked={false}
                onClick={() => setRoutineChecks(toggleRoutineCheck(it.id))}
                style={TODO_ITEM}
                onMouseEnter={e => { e.currentTarget.style.background = T.rowHighlight; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <CheckBox on={false} color={T.brand} />
                <span style={{ ...TYPE.body, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              </button>
            ))}
        </TodoRow>
        <div aria-hidden style={{ height: 1, margin: "0 14px", background: HAIRLINE }} />
        <TodoRow
          icon={TrendingUp}
          label={t("day.stat.toRecap")}
          sub={t("day.stat.recappedOf").replace("{d}", String(recapped)).replace("{n}", String(dayTrades.length))}
          count={toRecap}
          open={openList === "trades"}
          onToggle={() => setOpenList(v => (v === "trades" ? null : "trades"))}
        >
          {pendingTrades.length === 0
            ? <TodoEmpty>{t("day.allRecapped")}</TodoEmpty>
            : pendingTrades.map((tr, i) => {
              const pnl = Number(tr.pnl) || 0;
              const at = String(tr.entryTime || tr.entry_time || "").slice(0, 5);
              return (
                <button
                  key={tr.id ?? i}
                  type="button"
                  onClick={onOpen}
                  style={TODO_ITEM}
                  onMouseEnter={e => { e.currentTarget.style.background = T.rowHighlight; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ ...TYPE.body, fontWeight: 600, color: T.text }}>{tr.symbol}</span>
                  <span style={{ ...TYPE.label, color: T.textSub, textTransform: "capitalize" }}>{tr.direction}</span>
                  {at && <span style={{ ...TYPE.label, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>{at}</span>}
                  <span style={{ ...TYPE.body, marginLeft: "auto", color: pnlColor(pnl), fontVariantNumeric: "tabular-nums" }}>{signed(pnl)}</span>
                  <ChevronRight size={13} aria-hidden style={{ color: T.textMut, flexShrink: 0 }} />
                </button>
              );
            })}
        </TodoRow>
      </div>
    </div>
  );
}

const TODO_ITEM = {
  width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: 36, padding: "0 14px",
  border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
  transition: "background var(--dur-fast) var(--ease-out)",
};

/* Une ligne « à faire » : l'icône, ce qu'on compte et où on en est, puis le
   nombre qui attend. Le nombre est la seule chose en couleur — ambre tant
   qu'il reste quelque chose, une coche grise sinon : à zéro, rien à signaler.
   Toute la ligne est le bouton qui déplie la liste. */
function TodoRow({ icon: Icon, label, sub, count, open, onToggle, children }) {
  const id = React.useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
          border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span aria-hidden style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: FIELD_BG,
          display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.brand,
        }}>
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
          <span style={{ ...TYPE.callout, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ ...TYPE.caption, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
        </span>
        {count > 0 ? (
          <span style={{
            minWidth: 24, height: 24, padding: "0 7px", borderRadius: 999, flexShrink: 0, boxSizing: "border-box",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${T.amber}`, color: T.amber, ...TYPE.label, fontWeight: 600, fontVariantNumeric: "tabular-nums",
          }}>{count}</span>
        ) : (
          <Check size={15} strokeWidth={2.25} aria-hidden style={{ color: T.textMut, flexShrink: 0 }} />
        )}
        <ChevronDown size={15} aria-hidden style={{
          color: T.textMut, flexShrink: 0, transform: open ? "rotate(180deg)" : "none",
          transition: "transform var(--dur-base) var(--ease-out)",
        }} />
      </button>
      {open && (
        <div id={id} className="anim-pop" style={{ display: "flex", flexDirection: "column", padding: "0 0 8px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function TodoEmpty({ children }) {
  return <div style={{ ...TYPE.label, color: T.textMut, padding: "6px 14px 4px" }}>{children}</div>;
}

/* ── Cartes d'étape ──────────────────────────────────────────────────────── */

function StepCard({ icon: Icon, title, subtitle, done, big, unit, line, progress, badge, open, onToggle }) {
  return (
    /* Toute la carte est l'onglet : un bouton « Ouvrir » en bas doublait un
       geste que le carré entier invite déjà à faire. Un `div` et non un
       `button`, qui n'accepte pas les blocs qu'elle contient ; le clavier
       (Entrée, Espace) est donc repris à la main. */
    <div
      role="tab"
      tabIndex={0}
      aria-selected={open}
      aria-label={`${title} — ${open ? t("day.hide") : t("day.openBtn")}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
      }}
      style={{
      ...CARD, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, padding: 16,
      cursor: "pointer", outlineOffset: 2,
      /* Carrée : la hauteur suit la largeur de la colonne. L'en-tête reste en
         haut, le chiffre et la barre descendent en bas (`marginTop: auto`). */
      aspectRatio: "1 / 1", width: 240, flexShrink: 0, boxSizing: "border-box",
      /* Pas de liseré sur l'étape ouverte : son bouton, passé en plein, et le
         panneau déplié juste dessous suffisent à la désigner. */
    }}>
      {/* La pastille et la coche sur la ligne du titre, à droite : posées sur
          une rangée à elles au-dessus, elles flottaient sans rien à quoi
          s'aligner. Une coche une fois l'étape faite, aucun rang numéroté. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span aria-hidden style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: FIELD_BG,
          display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.brand,
        }}>
          <Icon size={17} strokeWidth={1.75} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ ...TYPE.headline, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          <span style={{ ...TYPE.label, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</span>
        </span>
        {(badge || done) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
            {done && (
              /* La même pastille ovale que « 2 à relire » : une étape finie se
                 lit au même endroit et dans la même forme qu'une étape en cours,
                 seule la coche change. Ni aplat ni vert : une étape réussie
                 n'a pas à crier plus fort que celle qui reste à faire. */
              <Badge>
                <Check size={11} strokeWidth={2.5} aria-hidden style={{ marginRight: 3 }} />
                {t("day.done")}
              </Badge>
            )}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, marginTop: "auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ ...TYPE.display, color: T.text, fontVariantNumeric: "tabular-nums" }}>{big}</span>
          {unit && <span style={{ ...TYPE.body, color: T.textSub }}>{unit}</span>}
        </div>
        <span style={{ ...TYPE.label, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
      </div>

      <ProgressBar value={progress} />

    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div aria-hidden style={{ height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
      <div style={{
        width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, height: "100%", borderRadius: 999,
        /* Toujours l'accent, même pleine : la pastille « Fait » dit déjà la
           réussite, une barre qui vire au vert doublait le signal. */
        background: T.brand, transition: "width var(--dur-base) var(--ease-out)",
      }} />
    </div>
  );
}

/* ── Résumé de la journée ────────────────────────────────────────────────── */

/* Ce qu'a donné la journée, à côté de ce qu'il reste à faire : le net en
   grand, les trois repères qui le qualifient, et la courbe qui dit comment on
   y est arrivé. */
function DaySummaryCard({ summary }) {
  return (
    <section aria-label={t("day.summaryTitle")} style={{
      ...CARD, minWidth: 0, padding: 20,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <span style={{ ...TYPE.headline, color: T.text }}>{t("day.summaryTitle")}</span>
      <span style={{ ...TYPE.display, color: pnlColor(summary.net), fontVariantNumeric: "tabular-nums" }}>{signed(summary.net)}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px" }}>
        <InlineStat label={t("common.trades")} value={String(summary.count)} />
        <InlineStat label={t("day.wonLost")} value={`${summary.wins} / ${summary.count - summary.wins}`} />
        <InlineStat label={t("common.winRate")} value={summary.winRate != null ? `${Math.round(summary.winRate)}%` : "—"} />
      </div>
      <div style={{ marginTop: "auto" }}>
        <DayCurve points={summary.curve} />
      </div>
    </section>
  );
}

/* ── Briques ──────────────────────────────────────────────────────────────── */

/* La pastille de la page Comptes — liseré fin, pas d'aplat, pas d'icône —
   et trois teintes seulement, une par sens : vert tenu, ambre à faire, rouge
   franchi. Le reste en gris. Sans aucune couleur la page virait au noir et
   blanc ; avec un aplat et une icône par pastille, elle criait. */
const TONES = {
  green:   { border: T.green, ink: T.green },
  amber:   { border: T.amber, ink: T.amber },
  red:     { border: T.red, ink: T.red },
  neutral: { border: T.border, ink: T.textSub },
};

function Badge({ tone = "neutral", children }) {
  const c = TONES[tone] || TONES.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999,
      border: `1px solid ${c.border}`, background: T.bg, color: c.ink, ...TYPE.caption,
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

function IconBtn({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: 8,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "none", border: "none", color: T.textMut, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Lien d'action discret, à l'encre d'accent — « Créer un set », « Modifier ». */
function TextLink({ icon: Icon, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, padding: "0 4px",
        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
        color: T.text, ...TYPE.label, fontWeight: 500,
      }}
    >
      {Icon && <Icon size={13} aria-hidden />}
      {children}
    </button>
  );
}

/** Commande secondaire réduite à un mot gris : « + Ajouter », « Créer ». */
function QuietLink({ icon: Icon, children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3, minHeight: 28, padding: "0 4px",
        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
        ...TYPE.label, color: T.textSub,
      }}
    >
      {Icon && <Icon size={12} aria-hidden />}
      {children}
    </button>
  );
}

/* Deux colonnes qui s'empilent d'elles-mêmes sous 320 px chacune : pas de
   point de rupture à tenir à jour, la largeur de la carte décide. */
function TwoColumns({ children, gap = 32 }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
      gap, alignItems: "start",
    }}>
      {children}
    </div>
  );
}

/** En-tête de colonne : titre + compte (et une action à droite), la jauge, puis ses commandes. */
function ColumnHead({ title, count, progress, action, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minHeight: 28 }}>
        <span style={{ ...TYPE.title3, fontWeight: 600, color: T.text }}>{title}</span>
        {count && <span style={{ ...TYPE.label, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>{count}</span>}
        {/* « Ajouter » et « Créer » ne paraissent qu'au survol du bloc (ou au
            focus clavier) — cf. `[data-card-actions]` dans globals.css, qui
            les laisse affichés sur écran tactile, faute de survol. */}
        {action && <span data-card-actions style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>{action}</span>}
      </div>
      {/* La jauge seulement quand il y a de quoi la remplir : vide, elle
          annonçait un retard là où il n'y a encore rien à faire. */}
      {progress != null && <ProgressBar value={progress} />}
      {children &&<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}

/** Bandeau de section en capitales, à l'intérieur d'une carte de set. */
function Caps({ children }) {
  return (
    <div style={{
      ...TYPE.caption2, color: T.textSub, textTransform: "uppercase", letterSpacing: "0.06em",
      padding: "8px 14px 4px",
    }}>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ ...TYPE.body, color: T.textMut, padding: "8px 0" }}>{children}</div>;
}

/**
 * Carte d'un set (objectifs ou tâches) : un bandeau teinté (nom, compte,
 * actions) posé sur ses lignes, qui vivent sur une surface blanche. Dépliée
 * par défaut — on l'a ajoutée à la séance pour la lire.
 */
function SetCard({ title, meta, badge, onUnapply, onEdit, children }) {
  const [open, setOpen] = React.useState(true);
  return (
    /* Blanc sur blanc, le set se fondait dans le bloc et ses lignes dans son
       en-tête. Le fond teinté le détache sans ajouter de cadre, et la surface
       blanche intérieure dit d'un coup d'œil où commencent les lignes. */
    <div data-set style={{ background: FIELD_BG, borderRadius: 12, padding: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 4 }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "8px 6px 8px 8px",
            background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left",
          }}
        >
          <ChevronRight size={14} aria-hidden style={{
            color: T.textMut, flexShrink: 0, transform: open ? "rotate(90deg)" : "none",
            transition: "transform var(--dur-base) var(--ease-out)",
          }} />
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flex: 1 }}>
            <span style={{ ...TYPE.callout, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
            <span style={{ ...TYPE.caption, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</span>
          </span>
        </button>
        {/* Modifier et retirer ne sont pas l'action du set — on l'a ajouté pour
            s'en servir : deux icônes qui ne paraissent qu'au survol du set,
            plutôt qu'un pied de carte qui prenait une ligne entière à chaque
            set (cf. `[data-set-actions]` dans globals.css). */}
        <span data-set-actions style={{ display: "inline-flex", alignItems: "center" }}>
          <IconBtn label={t("day.editSet")} onClick={onEdit}><Pencil size={13} /></IconBtn>
          <IconBtn label={t("day.removeFromToday")} onClick={onUnapply}><X size={14} /></IconBtn>
        </span>
        {badge}
      </div>
      {open && (
        <div style={{ background: T.white, borderRadius: 9, overflow: "hidden" }}>
          {React.Children.toArray(children).map((child, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div aria-hidden style={{ borderTop: `1px solid ${HAIRLINE}`, margin: "0 14px" }} />}
              {child}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** « + Ajouter un set ▾ » : un menu sous le bouton, pas une modale. */
function AddMenu({ label, items, emptyText, onPick, onDelete, deleteLabel, simple = false }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  return (
    <>
      <span ref={ref} style={{ display: "inline-flex" }}>
        {simple ? (
          <QuietLink icon={Plus} aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}>
            {t("day.add")}
          </QuietLink>
        ) : (
          <PillButton variant="secondary" compact aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}>
            <Plus size={13} /> {label} <ChevronDown size={13} />
          </PillButton>
        )}
      </span>
      {/* Le Popover partagé n'est qu'une couche positionnée : la surface est à
          l'appelant. Même habillage que les menus de la page Activité. */}
      <Popover
        anchorRef={ref}
        open={open}
        onClose={() => setOpen(false)}
        align="start"
        gap={6}
        minWidth={240}
        maxHeight={320}
        className="anim-pop"
        style={{ background: T.white, borderRadius: 12, boxShadow: "var(--elev-overlay)", border: `1px solid ${T.border}`, padding: 4 }}
      >
        <div role="listbox" aria-label={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.length === 0 && <div style={{ ...TYPE.label, color: T.textMut, padding: "8px 10px" }}>{emptyText}</div>}
          {items.map(it => (
            <button
              key={it.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => { onPick(it.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, minHeight: 36, padding: "0 10px",
                borderRadius: 8, border: "none", background: "transparent", cursor: "pointer",
                font: "inherit", textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ ...TYPE.body, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              <span style={{ ...TYPE.label, color: T.textMut, whiteSpace: "nowrap" }}>{it.meta}</span>
              {onDelete && (
                /* Un `span` cliquable et non un bouton : on est déjà DANS le
                   bouton de l'option. Le clic s'arrête ici pour ne pas ajouter
                   à la séance le set qu'on est en train de supprimer. */
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${deleteLabel} — ${it.label}`}
                  onClick={(e) => { e.stopPropagation(); onDelete(it.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onDelete(it.id); } }}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, color: T.textMut, flexShrink: 0 }}
                >
                  <Trash2 size={13} />
                </span>
              )}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

function CheckRow({ label, on, onClick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={onClick}
        style={{
          flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12,
          minHeight: 44, padding: "0 14px", background: "none", border: "none",
          font: "inherit", textAlign: "left", cursor: "pointer",
        }}
      >
        <CheckBox on={on} color={T.brand} size={18} />
        {/* Cochée, la tâche s'efface d'un cran : l'œil va droit à ce qui reste. */}
        <span style={{
          ...TYPE.body, color: on ? T.textMut : T.text,
          textDecorationLine: on ? "line-through" : "none", textDecorationColor: HAIRLINE,
          transition: "color var(--dur-fast) var(--ease-out)",
        }}>{label}</span>
      </button>
    </div>
  );
}

/* ── 1. Discipline : objectifs ───────────────────────────────────────────── */

/* Objectifs : des métriques lues dans les trades du jour, comme les règles de
   la page Discipline. Rien à cocher — l'état se calcule, il ne se déclare pas.
   Rangés en SETS qu'on crée dans une modale puis qu'on AJOUTE à la séance. */
const UNIT_FORMAT = {
  count:   v => String(Math.round(v)),
  money:   v => fmt(v, false),
  percent: v => `${Math.round(v)} %`,
  ratio:   v => (Number.isFinite(v) ? v.toFixed(2) : "∞"),
  r:       v => `${v.toFixed(2)}R`,
  time:    v => hhmm(v),
  minutes: v => `${Math.round(v)} min`,
};
const formatValue = (type, v) => UNIT_FORMAT[metricOf(type).unit](v);
/* « 4 / 5 » ou « 300 $ / 500 $ » se lisent comme une jauge qu'on remplit.
   Une heure (« 09:45 / 09:30 »), un taux ou un ratio ne se remplissent pas :
   la règle en dessous suffit à les situer. */
const SHOWS_TARGET = new Set(["count", "money"]);
/* La ligne d'un objectif porte la métrique en titre (« Nombre de trades ») et
   la règle dessous (« ≤ 3 · aujourd'hui ») : répéter le nom de la métrique
   dans la règle le faisait lire deux fois, sur deux lignes du même poids. */
const goalRule = (goal) => `${OP_SYMBOL[opOf(goal)]} ${formatValue(goal.type, goal.value)}`;

/* Les pertes se mesurent en valeur positive (« 250 $ perdus ») pour se
   comparer à leur plafond, mais restent du P&L négatif à l'œil. */
const LOSS_METRICS = new Set(["max_loss", "max_loss_per_trade"]);
const goalValueColor = (type, actual) => {
  if (actual == null) return T.text;
  if (type === "profit_target") return pnlColor(actual);
  if (LOSS_METRICS.has(type) && actual > 0) return T.pnlNeg;
  return T.text;
};

/** Un objectif tenu mais encore exposé est « respecté », en neutre : il peut encore tomber. Tenu pour de bon, « atteint », en vert. */
const statusBadge = ({ status, settled }) => {
  if (status === "missed") return { tone: "red", text: t("day.goalStatus.missed") };
  if (status === "pending") return { tone: "neutral", text: t("day.goalStatus.pending") };
  return settled
    ? { tone: "green", text: t("day.goalStatus.met") }
    : { tone: "neutral", text: t("day.goalStatus.onTrack") };
};

function GoalsColumn({ sets, applied, trades, progress, onApply, onUnapply, onSave, onDelete }) {
  // null | { set?: GoalSet } — set absent : création.
  const [modal, setModal] = React.useState(null);
  const appliedIds = new Set(applied.map(gs => gs.id));
  // Le même menu sert en bouton (bloc vide) et en lien gris (bloc rempli).
  const addMenu = {
    label: t("day.addGoalSet"),
    emptyText: t("day.goalSetNoneLeft"),
    items: sets.filter(gs => !appliedIds.has(gs.id)).map(gs => ({
      id: gs.id, label: gs.name, meta: t("day.goalSetCount").replace("{n}", String(gs.goals.length)),
    })),
    onPick: onApply,
    onDelete,
    deleteLabel: t("day.deleteSet"),
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <ColumnHead
        title={t("day.goals")}
        count={t("day.xOfYMet").replace("{d}", String(progress.done)).replace("{n}", String(progress.total))}
        progress={progress.total ? progress.done / progress.total : null}
        /* Tant que le bloc est vide, ajouter EST l'action : deux vrais boutons.
           Dès qu'il a du contenu, ce n'est plus qu'un complément — deux mots
           gris à côté du titre, qui ne passent plus devant le contenu. */
        action={applied.length > 0 && (
          <>
            <AddMenu simple {...addMenu} />
            <QuietLink icon={Pencil} onClick={() => setModal({})} aria-label={t("day.createGoalSet")}>{t("day.create")}</QuietLink>
          </>
        )}
      >
        {applied.length === 0 && (
          <>
            <AddMenu {...addMenu} />
            <TextLink icon={Pencil} onClick={() => setModal({})}>{t("day.createGoalSet")}</TextLink>
          </>
        )}
      </ColumnHead>

      {applied.length === 0 && <Empty>{t("day.goalSetsEmpty")}</Empty>}
      {applied.map(gs => {
        const daily = gs.goals.filter(g => periodOf(g) === "day");
        const longer = gs.goals.filter(g => periodOf(g) !== "day");
        const results = daily.map(g => evaluateGoal(g, trades));
        const met = results.filter(r => r.status === "met").length;
        const meta = [
          t("day.dailyGoals").replace("{n}", String(daily.length)),
          longer.length ? t("day.longerGoals").replace("{n}", String(longer.length)) : null,
        ].filter(Boolean).join(" · ");
        const badge = daily.length
          ? <Badge>{t("day.xOfYGoal").replace("{d}", String(met)).replace("{n}", String(daily.length))}</Badge>
          : longer.length ? <Badge>{t("day.notEvaluatedCount").replace("{n}", String(longer.length))}</Badge> : null;
        return (
          <SetCard
            key={gs.id}
            title={gs.name}
            meta={meta}
            badge={badge}
            onUnapply={() => onUnapply(gs.id)}
            onEdit={() => setModal({ set: gs })}
          >
            {gs.goals.length === 0 && <div style={{ padding: "4px 14px" }}><Empty>{t("day.goalsEmpty")}</Empty></div>}
            {results.map((res) => {
              const { goal, actual, status } = res;
              const b = statusBadge(res);
              return (
                <GoalLine
                  key={goal.id}
                  title={t(`day.goalType.${goal.type}`)}
                  desc={`${goalRule(goal)} · ${t(`day.period.${periodOf(goal)}`)}`}
                  /* La mesure face à son seuil (« 4 / 5 », « 300 $ / 500 $ ») quand
                     c'est un compte ou un montant : le
                     chiffre seul obligeait à relire la règle en dessous pour
                     savoir s'il était loin ou près de la limite. Seule la mesure
                     prend la couleur — et le rouge et le vert restent réservés au
                     P&L : « 4 trades » n'est pas une perte, même manqué. */
                  value={
                    <>
                      <span style={{ color: goalValueColor(goal.type, actual) }}>{actual == null ? "—" : formatValue(goal.type, actual)}</span>
                      {SHOWS_TARGET.has(metricOf(goal.type).unit) && (
                        <span style={{ color: T.textSub, fontWeight: 400 }}>{` / ${formatValue(goal.type, goal.value)}`}</span>
                      )}
                    </>
                  }
                  valueColor={T.text}
                  glyph={glyphOf(res)}
                  status={b}
                />
              );
            })}
            {longer.length > 0 && <Caps>{t("day.caps.longer")}</Caps>}
            {longer.map(goal => (
              <GoalLine
                key={goal.id}
                title={t(`day.goalType.${goal.type}`)}
                desc={`${goalRule(goal)} · ${t(`day.period.${periodOf(goal)}`)} · ${t("day.longerHint")}`}
                glyph="idle"
                status={{ text: t("day.notEvaluated") }}
              />
            ))}
          </SetCard>
        );
      })}

      {modal && (
        <GoalSetModal
          set={modal.set}
          onClose={() => setModal(null)}
          onSave={(draft) => { onSave(draft); setModal(null); }}
          onDelete={modal.set ? () => { onDelete(modal.set.id); setModal(null); } : undefined}
        />
      )}
    </div>
  );
}

/* Le statut d'un objectif en pastille à gauche : une pilule de texte en bout
   de ligne se lisait APRÈS la mesure, et quatre pilules empilées faisaient
   une colonne de bruit. Le mot reste, petit, sous la mesure. */
const GLYPH = {
  met:     { bg: T.greenBg, ink: T.green, Icon: Check },
  missed:  { bg: T.redBg,   ink: T.red,   Icon: X },
  onTrack: { bg: FIELD_BG,  ink: T.textSub, Icon: Check },
  idle:    { bg: "transparent", ink: T.textMut, Icon: null },
};
const glyphOf = ({ status, settled }) =>
  status === "missed" ? "missed" : status === "pending" ? "idle" : settled ? "met" : "onTrack";

function StatusGlyph({ kind }) {
  const g = GLYPH[kind] || GLYPH.idle;
  return (
    <span aria-hidden style={{
      width: 22, height: 22, borderRadius: 999, flexShrink: 0, background: g.bg, color: g.ink,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: kind === "idle" ? `1.5px dashed ${T.border2}` : "none", boxSizing: "border-box",
    }}>
      {g.Icon && <g.Icon size={12} strokeWidth={3} />}
    </span>
  );
}

function GoalLine({ title, desc, value, valueColor, glyph, status }) {
  const tone = TONES[status?.tone] || TONES.neutral;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
      <StatusGlyph kind={glyph} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ ...TYPE.body, fontWeight: 500, color: T.text }}>{title}</span>
        <span style={{ ...TYPE.label, color: T.textSub }}>{desc}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        {value != null && (
          <span style={{ ...TYPE.callout, fontWeight: 600, color: valueColor, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
        )}
        {status && <span style={{ ...TYPE.caption, color: tone.ink, whiteSpace: "nowrap" }}>{status.text}</span>}
      </span>
    </div>
  );
}

/** Saisie du seuil dans l'unité de la métrique : une heure se tape en heure. */
function parseThreshold(type, raw) {
  if (raw === "") return null;
  if (metricOf(type).unit === "time") {
    const m = String(raw).match(/^(\d{1,2}):(\d{2})$/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  const n = Number(String(raw).replace(",", "."));
  return validValue(type, n) ? n : null;
}

/* Création ou édition d'un set : un nom, puis ses métriques. Le brouillon vit
   dans la modale — rien n'est écrit tant qu'on n'a pas enregistré, et
   « Annuler » rend le set tel qu'il était. */
function GoalSetModal({ set, onClose, onSave, onDelete }) {
  const editing = !!set;
  const [name, setName] = React.useState(set?.name ?? "");
  /* Une période pour TOUT le set, choisie à côté de son nom : un set se lit
     sur une fenêtre (« Semaine régulière »), pas objectif par objectif. Un set
     d'avant, aux périodes mêlées, reprend celle de son premier objectif. */
  const [period, setPeriod] = React.useState(() => (set?.goals?.[0] ? periodOf(set.goals[0]) : "day"));
  const toRow = (g) => ({
    key: g.id, type: g.type, op: opOf(g),
    raw: metricOf(g.type).unit === "time" ? hhmm(g.value) : String(g.value),
  });
  const [rows, setRows] = React.useState(() => (set?.goals ?? []).map(toRow));
  /* Une métrique une seule fois par set : « ≥ 100 » et « ≤ 500 » d'un même P&L
     s'écrivent en deux sets si on y tient, pas en deux lignes qui se
     contrediraient l'une l'autre. */
  const taken = (type, key) => rows.some(r => r.key !== key && r.type === type);

  const addRow = () => {
    const type = GOAL_TYPES.find(g => !taken(g, null));
    if (!type) return;
    setRows(prev => [...prev, toRow({ id: `new_${Date.now().toString(36)}_${prev.length}`, type, value: metricOf(type).suggested })]);
  };
  const patchRow = (key, patch) => setRows(prev => prev.map(r => {
    if (r.key !== key) return r;
    // Changer de métrique repart de SON seuil proposé : un « 3 » laissé d'un
    // comptage n'a aucun sens en heure ou en montant.
    if (patch.type && patch.type !== r.type) return toRow({ id: r.key, type: patch.type, value: metricOf(patch.type).suggested });
    return { ...r, ...patch };
  }));
  const parsed = rows.map(r => ({ r, value: parseThreshold(r.type, r.raw) }));
  const valid = name.trim() && parsed.every(p => p.value != null);

  const save = () => {
    if (!valid) return;
    onSave({
      id: set?.id,
      name,
      goals: parsed.map(({ r, value }) => ({
        id: r.key.startsWith("new_") ? `g_${r.key.slice(4)}` : r.key,
        type: r.type, value,
        // Stockée seulement si elle diffère de celle de la métrique : un
        // défaut corrigé plus tard profitera aux objectifs qui ne l'ont pas changé.
        ...(r.op !== metricOf(r.type).op ? { op: r.op } : null),
        ...(period !== "day" ? { period } : null),
      })),
    });
  };

  return (
    <Modal
      title={editing ? t("day.editGoalSet") : t("day.createGoalSet")}
      width={640}
      onClose={onClose}
      onDelete={onDelete}
      deleteLabel={t("day.deleteSet")}
      footer={(
        <>
          <PillButton variant="ghost" onClick={onClose}>{t("day.cancel")}</PillButton>
          <PillButton variant="primary" disabled={!valid} onClick={save}>{editing ? t("day.save") : t("day.create")}</PillButton>
        </>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <Field label={t("day.setName")} style={{ flex: 1, minWidth: 0 }}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("day.goalSetNamePh")} />
          </Field>
          <Field label={t("day.goalPeriod")} style={{ width: 160, flexShrink: 0 }}>
            <Select aria-label={t("day.goalPeriod")} value={period} onChange={(e) => setPeriod(e.target.value)}>
              {GOAL_PERIODS.map(p => <option key={p} value={p}>{t(`day.periodName.${p}`)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t("day.goals")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.length === 0 && <Empty>{t("day.noMetrics")}</Empty>}
            {rows.map(r => {
              const unit = metricOf(r.type).unit;
              return (
                <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Select aria-label={t("day.goalType")} value={r.type} onChange={(e) => patchRow(r.key, { type: e.target.value })} style={{ flex: 1, minWidth: 0 }}>
                    {GOAL_GROUPS.map(group => (
                      <optgroup key={group} label={t(`day.goalGroup.${group}`)}>
                        {GOAL_TYPES.filter(g => metricOf(g).group === group && (g === r.type || !taken(g, r.key))).map(g => (
                          <option key={g} value={g}>{t(`day.goalType.${g}`)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                  <Select aria-label={t("day.goalOp")} value={r.op} onChange={(e) => patchRow(r.key, { op: e.target.value })} style={{ width: 132, flexShrink: 0 }}>
                    {GOAL_OPS.map(o => <option key={o} value={o}>{t(`day.op.${o}`)}</option>)}
                  </Select>
                  <Input
                    type={unit === "time" ? "time" : "number"}
                    inputMode={unit === "time" ? undefined : "decimal"}
                    min={unit === "time" || metricOf(r.type).signed ? undefined : 0}
                    step={unit === "ratio" || unit === "r" ? "0.1" : undefined}
                    aria-label={t("day.goalValue")}
                    value={r.raw}
                    onChange={(e) => patchRow(r.key, { raw: e.target.value })}
                    style={{ width: 104, flexShrink: 0 }}
                  />
                  <IconBtn label={t("day.removeGoal")} onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))}><X size={14} /></IconBtn>
                </div>
              );
            })}
            <div>
              <PillButton variant="secondary" compact onClick={addRow}><Plus size={13} /> {t("day.addMetric")}</PillButton>
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/* ── 1. Discipline : tâches ──────────────────────────────────────────────── */

function TasksColumn({ lists, applied, checks, progress, onToggle, onApply, onUnapply, onSave, onDelete }) {
  const [modal, setModal] = React.useState(null);
  const appliedIds = new Set(applied.map(l => l.id));
  const addMenu = {
    label: t("day.addTaskList"),
    emptyText: t("day.taskListNoneLeft"),
    items: lists.filter(l => !appliedIds.has(l.id)).map(l => ({
      id: l.id, label: l.name, meta: t("day.checksCount").replace("{n}", String(l.items.length)),
    })),
    onPick: onApply,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <ColumnHead
        title={t("day.tasks")}
        count={t("day.xOfYDone").replace("{d}", String(progress.done)).replace("{n}", String(progress.total))}
        progress={progress.total ? progress.done / progress.total : null}
        /* Tant que le bloc est vide, ajouter EST l'action : deux vrais boutons.
           Dès qu'il a du contenu, ce n'est plus qu'un complément — deux mots
           gris à côté du titre, qui ne passent plus devant le contenu. */
        action={applied.length > 0 && (
          <>
            <AddMenu simple {...addMenu} />
            <QuietLink icon={Pencil} onClick={() => setModal({})} aria-label={t("day.createTaskList")}>{t("day.create")}</QuietLink>
          </>
        )}
      >
        {applied.length === 0 && (
          <>
            <AddMenu {...addMenu} />
            <TextLink icon={Pencil} onClick={() => setModal({})}>{t("day.createTaskList")}</TextLink>
          </>
        )}
      </ColumnHead>

      {applied.length === 0 && <Empty>{t("day.taskListsEmpty")}</Empty>}
      {applied.map(list => {
        const p = listProgress(list, checks);
        return (
          <SetCard
            key={list.id}
            title={list.name}
            meta={t("day.checksCount").replace("{n}", String(list.items.length))}
            badge={<Badge>{t("day.xOfYChecks").replace("{d}", String(p.done)).replace("{n}", String(p.total))}</Badge>}
            onUnapply={() => onUnapply(list.id)}
            onEdit={() => setModal({ list })}
          >
            {list.items.length === 0 && <div style={{ padding: "4px 14px" }}><Empty>{t("day.taskListEmpty")}</Empty></div>}
            {list.items.map(it => (
              <CheckRow key={it.id} label={it.label} on={!!checks[it.id]} onClick={() => onToggle(it.id)} />
            ))}
          </SetCard>
        );
      })}

      {modal && (
        <TaskListModal
          list={modal.list}
          onClose={() => setModal(null)}
          onSave={(list) => { onSave(list, !modal.list); setModal(null); }}
          onDelete={modal.list ? () => { onDelete(modal.list.id); setModal(null); } : undefined}
        />
      )}
    </div>
  );
}

/* Les listes de tâches SONT les listes de routine de la page Discipline : la
   modale écrit dans ce magasin-là, une liste créée ici y apparaît aussi. */
function TaskListModal({ list, onClose, onSave, onDelete }) {
  const editing = !!list;
  const [name, setName] = React.useState(list?.name ?? "");
  const [items, setItems] = React.useState(() => (list?.items ?? []).map(it => ({ ...it })));
  const valid = name.trim().length > 0;
  return (
    <Modal
      title={editing ? t("day.editTaskList") : t("day.createTaskList")}
      width={520}
      onClose={onClose}
      onDelete={onDelete}
      deleteLabel={t("day.deleteList")}
      footer={(
        <>
          <PillButton variant="ghost" onClick={onClose}>{t("day.cancel")}</PillButton>
          <PillButton
            variant="primary"
            disabled={!valid}
            onClick={() => onSave({ id: list?.id ?? newRoutineListId(), name, strategyId: list?.strategyId ?? null, items })}
          >
            {editing ? t("day.save") : t("day.create")}
          </PillButton>
        </>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label={t("day.setName")}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("day.taskListNamePh")} />
        </Field>
        <Field label={t("day.tasks")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.length === 0 && <Empty>{t("day.noTasks")}</Empty>}
            {items.map(it => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Input
                  value={it.label}
                  aria-label={t("day.taskLabel")}
                  onChange={(e) => setItems(prev => prev.map(x => (x.id === it.id ? { ...x, label: e.target.value } : x)))}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <IconBtn label={t("day.removeTask")} onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))}><X size={14} /></IconBtn>
              </div>
            ))}
            <div>
              <PillButton variant="secondary" compact onClick={() => setItems(prev => [...prev, { id: newRoutineRuleId(), label: "" }])}>
                <Plus size={13} /> {t("day.addTask")}
              </PillButton>
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/* ── 2. Trade recap ──────────────────────────────────────────────────────── */

function RecapPanel({ dayTrades, rawDayTrades, summary, recapped, recapState, accounts, strategies, onRecapChange }) {
  const [recapId, setRecapId] = React.useState(null);
  const recapTrade = dayTrades.find(tr => tr.id === recapId) || null;

  return (
    /* Deux blocs blancs côte à côte : la liste, et le formulaire du trade
       ouvert. On relit un trade en gardant les autres sous les yeux ; sous
       ~760 px le formulaire passe dessous. Le panneau de la page Trades porte
       déjà sa propre carte. */
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ ...CARD, padding: 20, flex: "1 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Un titre de colonne comme Objectifs et Tâches : sans lui, la ligne
            de chiffres en petit flottait au-dessus de la liste. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ColumnHead title={t("day.recapTitle")} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
            <InlineStat label={t("common.trades")} value={String(summary.count)} />
            <InlineStat label={t("dash.kpi.netPnL")} value={signed(summary.net)} color={pnlColor(summary.net)} />
            <InlineStat label={t("day.winners")} value={t("day.xOfY").replace("{d}", String(summary.wins)).replace("{n}", String(summary.count))} />
            <InlineStat label={t("day.recapped")} value={t("day.xOfY").replace("{d}", String(recapped)).replace("{n}", String(summary.count))} />
          </div>
        </div>

        {/* La base commune à toutes les listes de trades du site — mêmes
            colonnes, même détail qui se déplie — avec, au bout de chaque
            ligne, l'état de la revue et la commande qui ouvre le formulaire. */}
        <TradesList
          trades={dayTrades}
          strategies={strategies}
          accounts={accounts}
          columns={RECAP_COLUMNS}
          activeId={recapId}
          empty={t("day.noTrades")}
          rowActionWidth={176}
          style={{ minWidth: 0, boxShadow: "none" }}
          rowAction={(tr) => {
            const done = isTradeRecapped(tr, recapState);
            const open = tr.id === recapId;
            return (
              <>
                {done
                  ? <Badge>{t("day.recapDone")}</Badge>
                  : <Badge tone="amber">{t("day.needsRecap")}</Badge>}
                <button
                  type="button"
                  aria-pressed={open}
                  onClick={() => setRecapId(open ? null : tr.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4, minHeight: 32, padding: "0 6px",
                    background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                    ...TYPE.label, fontWeight: 500, color: done ? T.textSub : T.text, whiteSpace: "nowrap",
                  }}
                >
                  {done ? t("day.editRecap") : t("day.recapTrade")}
                  {!done && <ArrowRight size={13} aria-hidden />}
                </button>
              </>
            );
          }}
        />
      </div>

      {/* Le panneau de détail de la page Trades, tel quel : même checklist,
          mêmes émotions, mêmes captures et notes. Il reçoit les exécutions
          brutes du jour (sa garde « trade supprimé » les cherche par id) et
          la ligne fusionnée à ouvrir. */}
      {recapTrade && (
        <TradesPage
          panelOnly
          embedded
          trades={rawDayTrades}
          strategies={strategies}
          panelTrade={recapTrade}
          onPanelClose={() => setRecapId(null)}
          onRecapChange={onRecapChange}
        />
      )}
    </div>
  );
}

/* ── 3. Day wrap ─────────────────────────────────────────────────────────── */

function WrapPanel({ today, entry, checks, journal, onJournal, onOpenStep, onGrade, onSignOff, onReopen }) {
  const signedOff = entry.signedOff;
  const dayLabel = new Date(`${today}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    /* À gauche ce qu'on dit de la journée (journal), à droite ce qui reste à
       faire puis la fermeture (checklist, clôture). */
    <TwoColumns gap={16}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div style={{ ...CARD, padding: 20, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <SubTitle title={t("day.journal")} aside={dayLabel} />
          <div style={{ borderRadius: 12, overflow: "hidden" }}>
            <DictatableTextarea
              placeholder={t("day.journalPlaceholder")}
              value={journal}
              onChange={onJournal}
              height={220}
              micSize={30}
              textareaStyle={{ border: "none", borderRadius: 0, padding: "4px 0 8px", ...TYPE.body, color: T.text, resize: "vertical", background: "transparent" }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div style={{ ...CARD, padding: 20, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <SubTitle title={t("day.checklist")} />
          {/* Le contrôle de fin de journée relit les étapes précédentes :
              chaque ligne y renvoie, pour finir ce qui manque sans chercher. */}
          <div>
            {checks.map((c, i) => (
              <div key={c.step} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${HAIRLINE}` : "none" }}>
                <StatusDot ok={c.ok} warn={c.warn} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ ...TYPE.body, fontWeight: 500, color: T.text }}>{c.title}</span>
                  <span style={{ ...TYPE.label, color: c.warn ? T.amber : T.textSub }}>{c.sub}</span>
                </span>
                <TextLink onClick={() => onOpenStep(c.step)}>{c.link} <ChevronRight size={13} aria-hidden /></TextLink>
              </div>
            ))}
          </div>
        </div>

        {/* Note et clôture dans une seule carte : on note la journée au moment
            de la fermer, ce sont les deux gestes d'un même instant. */}
        <div style={{ ...CARD, padding: 20, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <SubTitle title={t("day.signOff")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ ...TYPE.body, fontWeight: 500, color: T.text }}>{t("day.gradeQuestion")}</span>
              <span style={{ ...TYPE.label, color: T.textSub }}>{t("day.gradeHint")}</span>
            </span>
            <div role="radiogroup" aria-label={t("day.grade")} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {[null, ...GRADES].map(g => {
                const on = entry.grade === g;
                return (
                  <button
                    key={g ?? "none"}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={g ?? t("day.notGraded")}
                    disabled={!!signedOff}
                    onClick={() => onGrade(g)}
                    style={{
                      minWidth: 36, height: 32, padding: g ? 0 : "0 10px", borderRadius: 8, border: "none",
                      background: on ? T.text : "transparent", color: on ? T.textInverted : T.text,
                      ...TYPE.label, fontWeight: 600, cursor: signedOff ? "default" : "pointer", fontFamily: "inherit",
                      opacity: signedOff && !on ? 0.5 : 1, transition: "var(--tr-ui)",
                    }}
                  >
                    {g ?? t("day.notGraded")}
                  </button>
                );
              })}
            </div>
          </div>
          {signedOff ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, ...TYPE.body, fontWeight: 500, color: T.text }}>
                <StatusDot ok /> {t("day.signedOffAt").replace("{t}", clock(signedOff.at))}
              </span>
              <div><PillButton variant="ghost" compact onClick={onReopen}>{t("day.reopen")}</PillButton></div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
              <PillButton variant="primary" onClick={() => onSignOff("")} style={{ width: "100%" }}>
                {t("day.signOffBtn")}
              </PillButton>
              <span style={{ ...TYPE.label, color: T.textSub }}>{t("day.stillOpen")}</span>
            </div>
          )}
        </div>
      </div>
    </TwoColumns>
  );
}

function SubTitle({ title, aside }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ ...TYPE.headline, color: T.text }}>{title}</span>
      {aside && <span style={{ ...TYPE.label, color: T.textSub }}>{aside}</span>}
    </div>
  );
}

function InlineStat({ label, value, color = T.text }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ ...TYPE.label, color: T.textSub }}>{label}</span>
      <span style={{ ...TYPE.label, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}

function StatusDot({ ok, warn }) {
  if (ok) {
    return (
      <span aria-hidden style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: T.greenBg, color: T.green, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={13} strokeWidth={2.6} />
      </span>
    );
  }
  if (warn) {
    return (
      <span aria-hidden style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: T.amberBg, color: T.amber, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Flag size={12} strokeWidth={2.4} />
      </span>
    );
  }
  return <span aria-hidden style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, boxShadow: `inset 0 0 0 1.5px ${T.textMut}` }} />;
}

/** P&L cumulé trade après trade — la forme de la journée, pas son détail. */
function DayCurve({ points }) {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(800);
  const drawable = points.length >= 2;
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

  if (!drawable) return <Empty>{t("day.curveEmpty")}</Empty>;

  // Départ à 0 : sans ce point d'origine, un premier gagnant ferait démarrer la
  // courbe en l'air (même choix que la courbe du backtest).
  const series = [0, ...points];
  const W = width, H = 64, pad = 4;
  const max = Math.max(...series, 0), min = Math.min(...series, 0);
  const span = (max - min) || 1;
  const x = (i) => (i / (series.length - 1)) * W;
  const y = (v) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const line = series.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <svg ref={ref} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }} aria-hidden>
      <line x1={0} y1={y(0)} x2={W} y2={y(0)} stroke={T.text} strokeOpacity="0.14" />
      <polyline points={line} fill="none" stroke={T.brand} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
