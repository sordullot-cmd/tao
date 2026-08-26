"use client";

/**
 * Application du blocage — ce qui est réellement tenu, et par quoi.
 *
 * Il faut être honnête sur la portée, sinon la page promet ce qu'elle ne peut
 * pas faire. Deux couches, et elles ne bloquent pas la même chose.
 *
 * DANS LE NAVIGATEUR — toujours active, y compris en web :
 *
 *   1. LES DÉPARTS DEPUIS L'APP. Tout lien de l'app vers un domaine coupé est
 *      intercepté avant la navigation (capture, donc avant les gestionnaires de
 *      la page), `window.open` compris. C'est la fuite la plus fréquente : on ne
 *      décide pas d'aller sur YouTube, on clique un lien qui y mène.
 *   2. LES ÉCARTS. Quitter l'app pendant une session — changer d'onglet,
 *      basculer sur une autre fenêtre — est mesuré, et au-delà d'un délai de
 *      grâce, compté comme un écart.
 *   3. LA SORTIE DE PAGE. Une session ferme avec un avertissement natif du
 *      navigateur, la seule friction qu'il concède avant de laisser partir.
 *
 * DANS L'APP DE BUREAU — la couche qui manquait, et la raison d'être de la
 * coquille Tauri :
 *
 *   4. LES APPLIS. Le poste est relevé toutes les deux secondes ; si
 *      l'application au premier plan est coupée par une liste active, la fenêtre
 *      de tao trade reprend la main et l'écran de blocage s'affiche. Rien n'est
 *      tué ni fermé — la friction est le retour forcé, pas la perte de travail
 *      (cf. src-tauri/src/blocker.rs).
 *   5. LES SITES OUVERTS AILLEURS. Un navigateur n'est jamais coupé en bloc —
 *      c'est un contenant, pas une distraction. On lui demande l'URL de son
 *      onglet actif, et c'est `verdictFor` qui trace : les mêmes règles que pour
 *      un lien cliqué dans l'app, sous-domaines et mode « seuls autorisés »
 *      compris. Un onglet coupé est renvoyé vers une page vide, et RIEN n'est
 *      fermé : un retour arrière ramène la page. C'est ce qui rattrape le
 *      YouTube ouvert hors de l'app, là où la couche web, enfermée dans son
 *      propre onglet, ne voit rien.
 *   6. À DÉFAUT, LE TITRE. Firefox n'expose pas ses URLs, Windows n'a pas
 *      d'équivalent d'AppleScript, et l'autorisation d'automatisation peut être
 *      refusée. Le garde retombe alors sur le titre de la fenêtre : il repère
 *      encore le site et reprend la main, mais ne renvoie pas l'onglet et ne
 *      juge pas une liste inversée. Moins précis, jamais silencieux.
 *
 * Ce qui n'est toujours PAS tenu, et qu'il ne faut pas laisser croire : une
 * appli lancée pendant que la fenêtre est réduite au tray n'est vue qu'au relevé
 * suivant, et rien ne voit les onglets d'ARRIÈRE-PLAN — seul celui qu'on regarde
 * est jugé. Un blocage vraiment étanche passerait par le pare-feu ou le fichier
 * hosts — donc par une élévation de privilèges que cette app ne demande pas.
 */

import { useEffect, useRef, useState } from "react";
import {
  appVerdictFor, dayKey, isBrowserApp, sessionFromSchedule, shouldFire, verdictFor,
  type FocusSchedule, type FocusStore, type RunningSession,
} from "./model";
import { frontSnapshot, frontTab, nativeAvailable, reclaimFocus, redirectTab } from "./native";

/** Un blocage constaté, tel qu'il remonte à l'interface. */
export interface GuardHit {
  /** Identifiant catalogue, domaine libre, ou `away`. */
  target: string;
  /**
   * Ce qui a été coupé. `url` pour une navigation depuis l'app, `site` pour un
   * onglet ouvert ailleurs et reconnu à son URL, `window` pour le même onglet
   * deviné à son seul titre, `app` pour une application passée au premier plan,
   * `away` pour une sortie de l'app.
   *
   * L'écran de blocage ne dit pas la même chose dans tous les cas : un lien
   * refusé n'a mené nulle part, un onglet renvoyé était déjà ouvert.
   */
  kind?: "url" | "site" | "app" | "window" | "away";
  /** URL refusée, quand c'est une navigation. */
  url?: string;
  /** Nom de l'application relevée, tel que l'OS le rapporte. */
  appName?: string;
  /** Titre de la fenêtre relevée. */
  windowTitle?: string;
  /** Nom de la liste qui a tranché. */
  listName?: string;
  /** Durée de l'absence, pour un écart (ms). */
  awayMs?: number;
}

/** Cadence du relevé du poste. Deux secondes : assez court pour que la reprise
 *  de main suive le geste, assez long pour ne pas peser sur la machine — la
 *  page « Activité » échantillonne au même ordre de grandeur. */
const NATIVE_POLL_MS = 2_000;

/** Délai minimal entre deux reprises de main sur la MÊME cible. Sans lui, un
 *  utilisateur qui insiste déclencherait une reprise toutes les deux secondes :
 *  le poste devient inutilisable au lieu d'être protégé. */
const RECLAIM_COOLDOWN_MS = 6_000;

/** Délai minimal entre deux tentatives notées au journal pour la même cible.
 *  Une insistance de trente secondes est UNE tentative, pas quinze. */
const ATTEMPT_COOLDOWN_MS = 25_000;

/** État du garde natif, tel qu'il s'affiche dans la page. */
export interface NativeGuardStatus {
  /** L'app de bureau est là — la capacité existe. */
  available: boolean;
  /** Le poste a été lu pour de bon (autorisation accordée). */
  reading: boolean;
  /** Cause de l'échec de lecture, telle que la remonte la commande Rust. */
  error?: string | null;
}

/**
 * Le blocage natif est-il disponible, et lit-il vraiment le poste ?
 *
 * Deux questions et non une, parce qu'elles se répondent différemment et que
 * l'interface doit dire laquelle a échoué : la CAPACITÉ (l'app de bureau est-elle
 * là ?) se lit tout de suite, l'AUTORISATION (macOS a-t-il accordé
 * l'« Accessibilité » ?) demande un vrai relevé. Sans cette distinction, un
 * refus d'autorisation ressemble à une panne du blocage, et on cherche du
 * mauvais côté.
 *
 * Un seul relevé au montage suffit : l'autorisation ne change pas d'une seconde
 * à l'autre. En navigateur, aucun appel n'est fait.
 */
export function useNativeGuardStatus(): NativeGuardStatus {
  const [status, setStatus] = useState<NativeGuardStatus>({
    available: nativeAvailable(), reading: false, error: null,
  });

  useEffect(() => {
    if (!nativeAvailable()) return;
    let alive = true;
    void frontSnapshot().then(snap => {
      if (!alive) return;
      setStatus({ available: true, reading: !!snap?.ok, error: snap?.error ?? null });
    });
    return () => { alive = false; };
  }, []);

  return status;
}

/**
 * Intercepte ce qui peut l'être, tant qu'une session tourne.
 *
 * `onHit` est appelé pour chaque tentative. Le rappel est tenu dans une
 * référence : les écouteurs sont posés une fois par session, et doivent voir la
 * dernière version du rappel sans être redéployés à chaque rendu de la page.
 */
export function useFocusGuard(
  running: RunningSession | null,
  store: FocusStore,
  onHit: (hit: GuardHit) => void
): void {
  /* Rappel et magasin tenus dans des références, ÉCRITES DANS UN EFFET et non
     pendant le rendu : les écouteurs sont posés une fois par session et doivent
     voir la dernière version sans être redéployés à chaque rendu de la page.
     L'effet sans tableau de dépendances tourne après chaque rendu — c'est
     exactement ce qu'on veut ici, et c'est ce que réclame la règle
     `react-hooks/refs`. */
  const onHitRef = useRef(onHit);
  const storeRef = useRef(store);
  useEffect(() => { onHitRef.current = onHit; storeRef.current = store; });

  const active = Boolean(running) && !running?.pausedAt;
  const blocklistIds = running?.blocklistIds;
  const graceMs = Math.max(0, (store.settings.awayGraceSec || 0) * 1000);

  /* ── Liens et fenêtres ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!active || !blocklistIds) return;

    const check = (url: string) => verdictFor(url, storeRef.current, blocklistIds);

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!el) return;
      const href = el.getAttribute("href") || "";
      const v = check(href);
      if (!v.blocked) return;
      // `preventDefault` seul suffirait pour la navigation, mais un composant
      // peut aussi réagir au clic : on coupe la propagation dans la foulée.
      e.preventDefault();
      e.stopPropagation();
      onHitRef.current({ kind: "url", target: v.target || href, url: href, listName: v.list?.name });
    };

    // `window.open` échappe au clic (appelé depuis du code, pas depuis un lien) :
    // on l'enveloppe le temps de la session et on rend l'original en sortant.
    const nativeOpen = window.open;
    window.open = function guarded(url?: string | URL, ...rest: unknown[]) {
      const target = typeof url === "string" ? url : url?.toString() || "";
      const v = check(target);
      if (v.blocked) {
        onHitRef.current({ kind: "url", target: v.target || target, url: target, listName: v.list?.name });
        return null;
      }
      // @ts-expect-error — signature variadique de window.open, rendue telle quelle.
      return nativeOpen.call(window, url, ...rest);
    } as typeof window.open;

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = nativeOpen;
    };
  }, [active, blocklistIds]);

  /* ── Applications et sites : ce que seule l'app de bureau voit ────────── */
  useEffect(() => {
    if (!active || !blocklistIds || !nativeAvailable()) return;

    let alive = true;
    /* Dernière reprise et dernière tentative notée, PAR CIBLE. Deux horloges
       distinctes et non une seule : la reprise de main doit rester serrée pour
       être une friction, le journal doit rester lisible. */
    const lastReclaim = new Map<string, number>();
    const lastAttempt = new Map<string, number>();
    /* Un relevé peut mettre plus de deux secondes à revenir (AppleScript passe
       par System Events). Sans ce verrou, les appels s'empileraient. */
    let busy = false;

    const tick = async () => {
      if (busy || !alive) return;
      busy = true;
      try {
        const snap = await frontSnapshot();
        if (!alive || !snap?.ok || !snap.full) return;

        const hit = isBrowserApp(snap.app)
          ? await siteHit(snap.app, snap.title, storeRef.current, blocklistIds)
          : appHit(snap.app, snap.title, storeRef.current, blocklistIds);
        if (!alive || !hit) return;

        const now = Date.now();

        /* La reprise de main d'abord, l'onglet ensuite : c'est l'ordre dans
           lequel l'utilisateur le vit — la fenêtre passe devant, et la page
           qu'il vient de quitter est déjà partie quand il y retourne. */
        if (now - (lastReclaim.get(hit.target) || 0) >= RECLAIM_COOLDOWN_MS) {
          lastReclaim.set(hit.target, now);
          await reclaimFocus();
          if (hit.kind === "site") await redirectTab(snap.app);
        }
        if (!alive) return;

        if (now - (lastAttempt.get(hit.target) || 0) < ATTEMPT_COOLDOWN_MS) return;
        lastAttempt.set(hit.target, now);
        onHitRef.current(hit);
      } finally {
        busy = false;
      }
    };

    void tick();
    const id = setInterval(() => { void tick(); }, NATIVE_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [active, blocklistIds]);

  /* ── Écarts : l'attention qui part ailleurs ────────────────────────────── */
  useEffect(() => {
    if (!active) return;
    let leftAt: number | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        leftAt = Date.now();
        return;
      }
      if (leftAt === null) return;
      const away = Date.now() - leftAt;
      leftAt = null;
      if (away >= graceMs) onHitRef.current({ kind: "away", target: "away", awayMs: away });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, graceMs]);

  /* ── Fermeture de la page ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Les navigateurs ignorent le texte depuis longtemps et affichent le leur ;
      // seule la présence de `returnValue` déclenche encore la confirmation.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);
}

/** Verdict sur une application qui n'est pas un navigateur. */
function appHit(
  app: string, title: string, store: FocusStore, blocklistIds: string[]
): GuardHit | null {
  const v = appVerdictFor(app, title, store, blocklistIds);
  if (!v.blocked) return null;
  return {
    kind: v.via === "window" ? "window" : "app",
    target: v.target || app,
    appName: app,
    windowTitle: title,
    listName: v.list?.name,
  };
}

/**
 * Verdict sur le site qu'un navigateur a sous les yeux.
 *
 * L'URL d'abord, le titre à défaut. Le repli n'est pas un détail de robustesse :
 * c'est le cas ORDINAIRE sous Firefox et sous Windows, et il ne doit donc rien
 * casser — simplement décider moins bien, ce que `kind` dit à l'écran.
 */
async function siteHit(
  app: string, title: string, store: FocusStore, blocklistIds: string[]
): Promise<GuardHit | null> {
  const tab = await frontTab(app);
  if (tab?.ok && tab.url) {
    const v = verdictFor(tab.url, store, blocklistIds);
    if (!v.blocked) return null;
    return {
      kind: "site",
      target: v.target || tab.url,
      url: tab.url,
      appName: app,
      windowTitle: title,
      listName: v.list?.name,
    };
  }
  return appHit(app, title, store, blocklistIds);
}

/**
 * Horloge de rendu : une valeur qui change à intervalle régulier.
 *
 * Le décompte d'une session n'est pas un état à faire avancer — l'état, c'est
 * l'heure de départ. Ce compteur ne sert qu'à provoquer un rendu, et il s'arrête
 * dès que plus rien ne défile, pour ne pas réveiller React une fois par seconde
 * sur une page au repos.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return tick;
}

/**
 * Déclenche les programmes arrivés à l'heure.
 *
 * Contrôle toutes les trente secondes, avec la fenêtre de rattrapage du modèle :
 * l'app n'est pas forcément ouverte à la seconde prévue. Ne fait rien si une
 * session tourne déjà — un programme ne remplace pas une session en cours, il
 * la laisse finir.
 */
export function useScheduleRunner(
  store: FocusStore,
  onStart: (session: RunningSession, schedule: FocusSchedule) => void
): void {
  const onStartRef = useRef(onStart);
  const storeRef = useRef(store);
  useEffect(() => { onStartRef.current = onStart; storeRef.current = store; });

  const enabled = store.settings.autoSchedule && !store.running;

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const s = storeRef.current;
      if (s.running) return;
      const now = new Date();
      const due = s.schedules.find(sc => shouldFire(sc, now));
      if (!due) return;
      onStartRef.current(sessionFromSchedule(due, s, now), { ...due, lastFired: dayKey(now) });
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [enabled]);
}
