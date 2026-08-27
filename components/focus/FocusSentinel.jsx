"use client";

/**
 * Surveillance du focus — ce qui doit tourner même quand la page Focus est fermée.
 *
 * Tout ceci vivait dans `FocusPage`, et n'y avait rien à faire : le blocage et
 * les programmes ne sont pas des affichages, ce sont des engagements. Tant
 * qu'ils étaient montés avec la page, ils s'arrêtaient dès qu'on allait voir ses
 * trades — c'est-à-dire au moment précis où ils servent.
 *
 * Trois choses, aucune visible sauf la dernière :
 *
 *   • LES PROGRAMMES. L'heure prévue arrive, la session part, où que l'on soit
 *     dans l'app. Avant, il fallait être sur la page Focus à la bonne minute.
 *   • LE BLOCAGE. Les listes de la session en cours ET les listes permanentes,
 *     appliquées en continu (cf. lib/focus/guard.ts).
 *   • L'ÉCRAN DE BLOCAGE, qui s'ouvre par-dessus n'importe quelle page.
 *
 * Ce composant ne rend rien d'autre que cette modale : il est monté une fois
 * dans la coquille (`DashboardNew`), et la page Focus, elle, ne s'occupe plus
 * que de montrer et de régler.
 *
 * Ce qu'il ne peut PAS faire : tourner quand l'app est fermée. Dans un
 * navigateur, un onglet fermé n'exécute rien, et aucune API n'y change quoi que
 * ce soit. Dans l'app de bureau, en revanche, la fenêtre se réduit dans la barre
 * d'état au lieu de quitter (cf. src-tauri/src/lib.rs) et le démarrage
 * automatique est activé : la surveillance y tourne donc du login à l'extinction,
 * fenêtre visible ou non.
 */

import React, { useCallback, useState } from "react";
import { notify } from "@/lib/notify";
import { useFocusStore } from "@/lib/focus/useFocusStore";
import { closeSession, isDone } from "@/lib/focus/model";
import { useFocusGuard, useScheduleRunner, useTicker } from "@/lib/focus/guard";
import { fmtDur } from "@/lib/focus/stats";
import BlockShield from "@/components/focus/BlockShield";

export default function FocusSentinel() {
  const [store, setStore] = useFocusStore();
  const [shield, setShield] = useState(null);
  const running = store.running;

  /* Une horloge qui ne tourne QUE pendant une session, et seulement hors pause.
     Elle ne sert qu'à repérer la fin : sans session, rien n'a besoin d'être
     réveillé à la seconde. */
  const tick = useTicker(Boolean(running) && !running?.pausedAt);
  const now = React.useMemo(() => new Date(), [tick, running?.pausedAt, running?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fin d'une session arrivée à son terme ─────────────────────────────── */

  const finish = useCallback(() => {
    const current = store.running;
    if (!current) return;
    /* L'entrée est calculée UNE fois, hors de l'updater : elle sert aussi à
       l'annonce, et deux calculs à deux instants donneraient deux durées. */
    const entry = { ...closeSession(current, new Date()), endedBy: "completed" };
    setStore(prev => (prev.running ? { ...prev, running: null, log: [...prev.log, entry] } : prev));
    setShield(null);
    if (store.settings.notify) {
      notify("Session terminée", { body: `${entry.name} — ${fmtDur(entry.focusedMs)} de concentration.` });
    }
  }, [store.running, store.settings.notify, setStore]);

  /* C'est le minuteur qui décide de la fin, pas un clic. Sans ça, une session
     finie continuerait de compter du temps de concentration qui n'en est plus. */
  const done = running ? isDone(running, now) : false;
  React.useEffect(() => {
    if (done) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  /* ── Blocage ───────────────────────────────────────────────────────────── */

  const onHit = useCallback((hit) => {
    setStore(prev => (prev.running ? {
      ...prev,
      running: {
        ...prev.running,
        attempts: [...prev.running.attempts, {
          target: hit.target, at: new Date().toISOString(), kind: hit.kind,
        }],
      },
    } : prev));
    /* Un blocage déjà montré là où il s'est produit — la page de blocage qui a
       pris la place d'un onglet — ne rouvre pas son écran ici. */
    if (!hit.handled) setShield(hit);
  }, [setStore]);

  useFocusGuard(running, store, onHit);

  /* ── Programmes ────────────────────────────────────────────────────────── */

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

  if (!shield) return null;
  return (
    <BlockShield
      hit={shield}
      session={running}
      store={store}
      now={now}
      onBack={() => setShield(null)}
      onEnd={() => {
        const current = store.running;
        if (!current) { setShield(null); return; }
        const entry = { ...closeSession(current, new Date()), endedBy: "abandoned" };
        setStore(prev => (prev.running ? { ...prev, running: null, log: [...prev.log, entry] } : prev));
        setShield(null);
      }}
    />
  );
}
