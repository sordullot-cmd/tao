"use client";

/**
 * Page « Focus » — sessions de concentration et blocage des distractions.
 *
 * L'équivalent de ce que fait Opal, porté dans l'app : on décide À FROID de ce
 * qui sera inaccessible À CHAUD. Cinq onglets, un seul objet vivant :
 *
 *   Session      lancer, et pendant qu'elle tourne, l'écran de session
 *   Listes       le vocabulaire du blocage (applis et sites, par paquets)
 *   Programmes   les sessions récurrentes, que l'horloge déclenche
 *   Bilan        temps tenu, série, ce qui a été tenté
 *   Réglages     objectif, notifications, délai de grâce
 *
 * Le magasin entier tient dans une clé de `useCloudState` : il part dans la
 * table générique `user_productivity`, sans migration SQL. Une session en cours
 * y est incluse — c'est ce qui lui permet de survivre à un rechargement de page,
 * première condition pour qu'un blocage veuille dire quelque chose.
 *
 * Sur ce que le blocage tient VRAIMENT (et ce qu'il ne peut pas tenir depuis un
 * navigateur), tout est dit dans lib/focus/guard.ts, et résumé à l'écran : une
 * page qui promet une coupure système qu'elle n'assure pas ferait plus de dégâts
 * qu'une page absente.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Info, Flame, Clock, ShieldCheck, RotateCcw } from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { notify, ensureNotifyPermission } from "@/lib/notify";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, CheckBox, Field, Input, PeriodPills, PillButton, SectionTitle } from "@/components/ui/da";
import {
  closeSession, emptyStore, isDone, normalizeStore, pause, resume,
} from "@/lib/focus/model";
import { useFocusGuard, useScheduleRunner, useTicker, useNativeGuardStatus } from "@/lib/focus/guard";
import { MIN_MS, dayTotals, fmtDur, focusScore, streak } from "@/lib/focus/stats";
import SessionStart from "@/components/focus/SessionStart";
import SessionRunner from "@/components/focus/SessionRunner";
import BlockShield from "@/components/focus/BlockShield";
import BlocklistsTab from "@/components/focus/BlocklistsTab";
import SchedulesTab from "@/components/focus/SchedulesTab";
import InsightsTab from "@/components/focus/InsightsTab";

const STORAGE_KEY = "tr4de_focus_block";
const CLOUD_KEY = "focus_blocker";

const TABS = [
  { id: "session", label: "Session" },
  { id: "lists", label: "Listes" },
  { id: "schedules", label: "Programmes" },
  { id: "insights", label: "Bilan" },
  { id: "settings", label: "Réglages" },
];

/** Repère compact de l'en-tête : trois chiffres, pas un tableau de bord. */
function HeadStat({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: FIELD_BG, display: "grid", placeItems: "center", color: T.textSub }}>
        {icon}
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 11, color: T.textMut }}>{label}</div>
      </div>
    </div>
  );
}

export default function FocusPage() {
  const [raw, setRaw] = useCloudState(STORAGE_KEY, CLOUD_KEY, emptyStore());
  const [tab, setTab] = useState("session");
  const [shield, setShield] = useState(null);
  const native = useNativeGuardStatus();
  /** Dernière session fermée, gardée le temps de l'annoncer. */
  const [finished, setFinished] = useState(null);

  /* Le magasin lu du stockage peut venir d'une version antérieure : on le
     complète à la lecture plutôt qu'en écrivant une migration. */
  const store = useMemo(() => normalizeStore(raw), [raw]);
  const setStore = useCallback((updater) => {
    setRaw(prev => {
      const base = normalizeStore(prev);
      return typeof updater === "function" ? updater(base) : updater;
    });
  }, [setRaw]);

  const running = store.running;

  /* Une horloge qui ne tourne QUE pendant une session, et seulement hors pause :
     sans session, la page n'a aucune raison de se redessiner chaque seconde. */
  const tick = useTicker(Boolean(running) && !running?.pausedAt);
  const now = useMemo(() => new Date(), [tick, running?.pausedAt, running?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const goalMs = Math.max(1, store.settings.dailyGoalMin) * MIN_MS;
  const today = useMemo(() => dayTotals(store.log, now), [store.log, now]);
  const sk = useMemo(() => streak(store.log, goalMs, now), [store.log, goalMs, now]);
  const score = useMemo(() => focusScore(store.log, store.settings, now), [store.log, store.settings, now]);

  /* ── Cycle de vie d'une session ────────────────────────────────────────── */

  const start = useCallback((session) => {
    setStore(prev => ({ ...prev, running: session }));
    setFinished(null);
    if (store.settings.notify) {
      ensureNotifyPermission().then(() => notify("Session lancée", {
        body: session.plannedMs
          ? `${session.name} — ${fmtDur(session.plannedMs)} sans distraction.`
          : `${session.name} — chronomètre lancé.`,
      }));
    }
  }, [setStore, store.settings.notify]);

  const end = useCallback((reason = "abandoned") => {
    const current = running;
    if (!current) return;
    /* L'entrée de journal est calculée UNE fois, hors de l'updater : elle sert
       aussi à l'annonce de fin, et deux calculs à deux instants différents
       donneraient deux durées. `endedBy` garde la façon dont la session s'est
       arrêtée — c'est ce qui rend une sortie de secours lisible au bilan. */
    const entry = { ...closeSession(current, new Date()), endedBy: reason };
    setStore(prev => (prev.running ? { ...prev, running: null, log: [...prev.log, entry] } : prev));
    setShield(null);
    setFinished(entry);
    if (store.settings.notify && reason === "completed") {
      notify("Session terminée", { body: `${entry.name} — ${fmtDur(entry.focusedMs)} de concentration.` });
    }
  }, [setStore, running, store.settings.notify]);

  /* Fin automatique quand la durée visée est atteinte : c'est le minuteur qui
     décide, pas un clic. Sans ça, une session finie continuerait de compter du
     temps de concentration qui n'en est plus. */
  const done = running ? isDone(running, now) : false;
  React.useEffect(() => {
    if (done) end("completed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const onPause = useCallback(() => setStore(prev => (prev.running ? { ...prev, running: pause(prev.running) } : prev)), [setStore]);
  const onResume = useCallback(() => setStore(prev => (prev.running ? { ...prev, running: resume(prev.running) } : prev)), [setStore]);
  const onExtend = useCallback((min) => setStore(prev => (
    prev.running ? { ...prev, running: { ...prev.running, plannedMs: prev.running.plannedMs + min * MIN_MS } } : prev
  )), [setStore]);

  /* ── Blocage et écarts ─────────────────────────────────────────────────── */

  const onHit = useCallback((hit) => {
    setStore(prev => (prev.running ? {
      ...prev,
      running: {
        ...prev.running,
        attempts: [...prev.running.attempts, {
          target: hit.target, at: new Date().toISOString(), kind: hit.kind, awayMs: hit.awayMs,
        }],
      },
    } : prev));
    setShield(hit);
  }, [setStore]);

  useFocusGuard(running, store, onHit);

  useScheduleRunner(store, useCallback((session, schedule) => {
    setStore(prev => ({
      ...prev,
      running: session,
      schedules: prev.schedules.map(s => (s.id === schedule.id ? { ...s, lastFired: schedule.lastFired } : s)),
    }));
    if (store.settings.notify) {
      notify("Programme déclenché", { body: `${session.name} — ${fmtDur(session.plannedMs)}.` });
    }
  }, [setStore, store.settings.notify]));

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <PeriodPills value={tab} onChange={setTab} options={TABS} track size={13} />
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <HeadStat icon={<Clock size={14} />} label="aujourd'hui" value={fmtDur(today.focusedMs)} />
          <HeadStat icon={<Flame size={14} />} label="série" value={`${sk.current} j`} />
          <HeadStat icon={<ShieldCheck size={14} />} label="score" value={score} />
        </div>
      </div>

      {/* Une session en cours prend TOUTE la page, quel que soit l'onglet : c'est
          le seul moment où l'écran n'a qu'une chose à dire. */}
      {running ? (
        <>
          <SessionRunner
            session={running}
            store={store}
            now={now}
            onPause={onPause}
            onResume={onResume}
            onEnd={end}
            onExtend={onExtend}
          />
          <BlockShield
            hit={shield}
            session={running}
            store={store}
            now={now}
            onBack={() => setShield(null)}
            onEnd={() => end("abandoned")}
          />
        </>
      ) : (
        <>
          {finished && (
            <div style={{ ...CARD, padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{
                width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", flexShrink: 0,
                background: `color-mix(in srgb, ${finished.completed ? PALETTE.green : PALETTE.orange} 14%, transparent)`,
                color: finished.completed ? PALETTE.green : PALETTE.orange,
              }}>
                <ShieldCheck size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                  {finished.completed ? "Session terminée" : "Session interrompue"}
                </div>
                <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>
                  {finished.name} — {fmtDur(finished.focusedMs)} de concentration
                  {finished.attempts?.length ? `, ${finished.attempts.length} interruption${finished.attempts.length > 1 ? "s" : ""}` : ", sans interruption"}.
                </div>
              </div>
              <PillButton compact variant="ghost" onClick={() => setFinished(null)}>Fermer</PillButton>
            </div>
          )}

          {tab === "session" && (
            <>
              <SessionStart store={store} setStore={setStore} onStart={start} />
              {/* Ce que le blocage tient réellement. Dit une fois, en bas, sans
                  alarme : c'est une limite, pas une panne. */}
              <div style={{ ...CARD, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Info size={15} color={T.textMut} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
                  {!native.available
                    ? <>Blocage au niveau du navigateur : les liens de l&apos;app vers un site coupé sont
                        interceptés, et toute sortie de l&apos;app pendant une session est comptée comme un
                        écart. Couper une appli demande l&apos;app de bureau.</>
                    : native.reading
                      ? <>Blocage système actif : une appli listée qui passe devant repasse derrière, et
                          un onglet ouvert sur un site coupé est renvoyé vers une page vide. Rien
                          n&apos;est fermé.</>
                      /* Le cas qui compte vraiment : l'app de bureau est là, mais macOS n'a pas
                         accordé l'accès « Accessibilité ». Sans cette ligne, le blocage semble
                         simplement ne pas marcher, et on cherche la panne du mauvais côté. */
                      : <>App de bureau détectée, mais le poste n&apos;est pas lisible
                          ({native.error || "cause inconnue"}) : seuls les liens de l&apos;app sont
                          interceptés. Sur macOS, autorisez tao trade dans Réglages Système →
                          Confidentialité et sécurité → Accessibilité.</>}
                </div>
              </div>
            </>
          )}

          {tab === "lists" && <BlocklistsTab store={store} setStore={setStore} />}
          {tab === "schedules" && <SchedulesTab store={store} setStore={setStore} />}
          {tab === "insights" && <InsightsTab store={store} now={now} />}

          {tab === "settings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SectionTitle size="sm">Réglages</SectionTitle>

              <div style={{ ...CARD, padding: 18, display: "flex", flexDirection: "column", gap: 16, maxWidth: 520 }}>
                <Field label="Objectif quotidien (min)" hint="C'est lui qui décide de la série et du score.">
                  <Input
                    type="number" min={15} step={15} value={store.settings.dailyGoalMin}
                    onChange={e => setStore(prev => ({
                      ...prev, settings: { ...prev.settings, dailyGoalMin: Math.max(5, Number(e.target.value) || 0) },
                    }))}
                  />
                </Field>

                <Field label="Écart compté après (secondes)" hint="Le temps qu'on peut passer hors de l'app sans que ce soit noté.">
                  <Input
                    type="number" min={0} step={5} value={store.settings.awayGraceSec}
                    onChange={e => setStore(prev => ({
                      ...prev, settings: { ...prev.settings, awayGraceSec: Math.max(0, Number(e.target.value) || 0) },
                    }))}
                  />
                </Field>

                {[
                  { key: "notify", label: "Notifier au début et à la fin d'une session" },
                  { key: "autoSchedule", label: "Lancer les programmes automatiquement" },
                ].map(opt => (
                  <div
                    key={opt.key}
                    onClick={() => setStore(prev => ({
                      ...prev, settings: { ...prev.settings, [opt.key]: !prev.settings[opt.key] },
                    }))}
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  >
                    <CheckBox on={store.settings[opt.key]} color={T.text} />
                    <span style={{ fontSize: 13, color: T.text }}>{opt.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ ...CARD, padding: 18, display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Repartir de zéro</div>
                  <div style={{ fontSize: 12, color: T.textSub, marginTop: 4, lineHeight: 1.6 }}>
                    Remet les listes et les presets d&apos;origine. Le journal des sessions est conservé :
                    c&apos;est le seul contenu de cette page qu&apos;on ne peut pas refaire.
                  </div>
                </div>
                <PillButton
                  compact
                  onClick={() => setStore(prev => ({ ...emptyStore(), log: prev.log, settings: prev.settings }))}
                >
                  <RotateCcw size={13} /> Réinitialiser listes et presets
                </PillButton>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
