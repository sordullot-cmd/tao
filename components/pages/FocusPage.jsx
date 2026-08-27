"use client";

/**
 * Page « Focus » — sessions de concentration et blocage des distractions.
 *
 * L'équivalent de ce que fait Opal, porté dans l'app : on décide À FROID de ce
 * qui sera inaccessible À CHAUD. Trois onglets, un seul objet vivant :
 *
 *   Session   lancer maintenant, ou programmer pour plus tard
 *   Listes    ce qui est coupé
 *   Bilan     temps tenu, série, score, ce qui a été tenté
 *
 * Il y en avait cinq. « Programmes » a rejoint « Session » — lancer maintenant
 * et lancer à neuf heures sont la même intention, à deux moments — et
 * « Réglages » a disparu : ses quatre réglages sont partis vivre là où leur
 * effet se voit, l'objectif au Bilan qu'il gouverne, la remise à zéro sous les
 * listes qu'elle remet ; les deux automatismes ont été supprimés, un programme
 * qu'il faut penser à activer n'étant plus un programme mais un rappel. Un
 * onglet qu'on n'ouvre qu'une fois pour régler quelque chose qu'on ne voit pas
 * est un onglet de trop.
 *
 * Le magasin entier tient dans une clé de `useCloudState` : il part dans la
 * table générique `user_productivity`, sans migration SQL. Une session en cours
 * y est incluse — c'est ce qui lui permet de survivre à un rechargement de page,
 * première condition pour qu'un blocage veuille dire quelque chose.
 *
 * Cette page MONTRE et RÈGLE ; elle ne surveille pas. Le blocage, les programmes
 * et l'écran de blocage vivent dans `FocusSentinel`, monté une fois dans la
 * coquille de l'app : montés ici, ils s'arrêtaient dès qu'on allait voir ses
 * trades, c'est-à-dire au moment précis où ils servent.
 *
 * Sur ce que le blocage tient VRAIMENT (et ce qu'il ne peut pas tenir depuis un
 * navigateur), tout est dit dans lib/focus/guard.ts, et résumé à l'écran : une
 * page qui promet une coupure système qu'elle n'assure pas ferait plus de dégâts
 * qu'une page absente.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Info, RotateCcw } from "lucide-react";
import { notify, ensureNotifyPermission } from "@/lib/notify";
import { useFocusStore, FOCUS_STORAGE_KEY } from "@/lib/focus/useFocusStore";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { T } from "@/lib/ui/tokens";
import { CARD, PeriodPills, PillButton } from "@/components/ui/da";
import { closeSession, emptyStore, pause, resume } from "@/lib/focus/model";
import { useTicker, useNativeGuardStatus } from "@/lib/focus/guard";
import { MIN_MS, fmtDur } from "@/lib/focus/stats";
import SessionStart from "@/components/focus/SessionStart";
import SessionRunner from "@/components/focus/SessionRunner";
import BlocklistsTab from "@/components/focus/BlocklistsTab";
import SchedulesTab from "@/components/focus/SchedulesTab";
import InsightsTab from "@/components/focus/InsightsTab";

const TABS = [
  { id: "session", label: "Session" },
  { id: "lists", label: "Listes" },
  { id: "insights", label: "Bilan" },
];

export default function FocusPage() {
  const [store, setStore, storeReady] = useFocusStore();
  const [tab, setTab] = useState("session");
  /** Nœud d'accueil des boutons d'action, dans la barre d'onglets. */
  const [actionSlot, setActionSlot] = useState(null);
  const native = useNativeGuardStatus();

  const running = store.running;

  /* Une horloge qui ne tourne QUE pendant une session, et seulement hors pause :
     sans session, la page n'a aucune raison de se redessiner chaque seconde. */
  const tick = useTicker(Boolean(running) && !running?.pausedAt);
  const now = useMemo(() => new Date(), [tick, running?.pausedAt, running?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Cycle de vie d'une session ────────────────────────────────────────── */

  const start = useCallback((session) => {
    setStore(prev => ({ ...prev, running: session }));
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
  }, [setStore, running]);

  /* La fin AUTOMATIQUE, elle, appartient à la sentinelle : le minuteur ne doit
     pas dépendre de l'onglet ouvert. Ce qui reste ici ne se déclenche que sur
     un clic — arrêter, ou la sortie de secours d'un mode verrouillé. */

  const onPause = useCallback(() => setStore(prev => (prev.running ? { ...prev, running: pause(prev.running) } : prev)), [setStore]);
  const onResume = useCallback(() => setStore(prev => (prev.running ? { ...prev, running: resume(prev.running) } : prev)), [setStore]);
  const onExtend = useCallback((min) => setStore(prev => (
    prev.running ? { ...prev, running: { ...prev.running, plannedMs: prev.running.plannedMs + min * MIN_MS } } : prev
  )), [setStore]);

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  if (useFirstLoad(storeReady, FOCUS_STORAGE_KEY)) {
    return <PageSkeleton variant="list" gap={18} toolbarLeft={[78, 92, 86]} toolbarRight={[132]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Les onglets à gauche, l'action de l'onglet courant à droite, sur la
          MÊME ligne. Les trois chiffres qui vivaient là (temps du jour, série,
          score) sont partis au Bilan, où ils sont expliqués : en en-tête, ils
          demandaient une place permanente pour un coup d'œil qu'on ne donne
          qu'après coup. La place ainsi libérée revient au geste qu'on fait
          vraiment depuis cette barre — créer un preset, créer une liste.

          `ref={setActionSlot}` et non une `useRef` : le nœud n'existe pas au
          premier rendu, et un portail a besoin d'un rendu de plus pour le voir.
          Une référence muette ne le déclencherait pas. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <PeriodPills value={tab} onChange={setTab} options={TABS} track size={13} />
        <div ref={setActionSlot} style={{ display: "flex", alignItems: "center", gap: 8 }} />
      </div>

      {/* Une session en cours occupe SON onglet, pas toute la page : le blocage
          continue de tenir pendant qu'on retouche une liste ou qu'on relit le
          bilan, et rien n'oblige à l'arrêter pour aller voir ailleurs. */}
      {tab === "session" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {running ? (
            <SessionRunner
              session={running}
              store={store}
              now={now}
              onPause={onPause}
              onResume={onResume}
              onEnd={end}
              onExtend={onExtend}
            />
          ) : (
            <SessionStart store={store} setStore={setStore} onStart={start} actionSlot={actionSlot} />
          )}

          {/* Les programmes sous les presets : lancer maintenant et lancer à
              neuf heures sont la même intention à deux moments, et les séparer
              obligeait à changer d'onglet pour la reprendre. Ils restent
              visibles pendant une session — on planifie la semaine sans avoir à
              interrompre l'heure en cours. */}
          <SchedulesTab store={store} setStore={setStore} />
          {/* Ce que le blocage tient réellement. Dit une fois, en bas, sans
              alarme : c'est une limite, pas une panne. */}
          <div style={{ ...CARD, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Info size={15} color={T.textMut} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
              {native.available
                ? native.reading
                  ? <>Blocage système actif : une appli listée qui passe devant est fermée — on lui
                      demande de quitter, elle a le temps d&apos;enregistrer — et un onglet ouvert sur un
                      site coupé est renvoyé sur la page de blocage.</>
                  /* L'app de bureau est là, mais macOS n'a pas accordé l'accès
                     « Accessibilité ». Sans cette ligne, le blocage semble simplement ne pas
                     marcher, et on cherche la panne du mauvais côté. */
                  : <>App de bureau détectée, mais le poste n&apos;est pas lisible
                      ({native.error || "cause inconnue"}) : seuls les liens de l&apos;app sont
                      interceptés. Sur macOS, autorisez tao trade dans Réglages Système →
                      Confidentialité et sécurité → Accessibilité.</>
                /* Le cas qui trompe le plus : une app installée depuis le navigateur a son
                   icône et sa fenêtre, donc tout dit « application » — alors qu'à l'intérieur
                   c'est une page web, qui ne voit rien du reste du poste. Le dire ici, une
                   fois, vaut mieux que de laisser chercher pourquoi Discord passe encore. */
                : native.installedWeb
                  ? <>App installée depuis le web : sa fenêtre est à elle, mais son blocage reste
                      celui d&apos;une page — seuls les liens de l&apos;app vers un site coupé sont
                      interceptés. Couper une appli ou un onglet ouvert ailleurs demande l&apos;app
                      de bureau.</>
                  : <>Blocage au niveau du navigateur : seuls les liens de l&apos;app vers un site
                      coupé sont interceptés. Couper une appli ou un onglet ouvert ailleurs demande
                      l&apos;app de bureau.</>}
            </div>
          </div>
        </div>
      )}

      {tab === "lists" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <BlocklistsTab store={store} setStore={setStore} actionSlot={actionSlot} />

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

      {tab === "insights" && <InsightsTab store={store} setStore={setStore} now={now} />}
    </div>
  );
}
