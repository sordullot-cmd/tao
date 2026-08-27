"use client";

/**
 * Application du blocage — ce qui est réellement tenu, et par quoi.
 *
 * Le garde tourne dès qu'une liste est active, avec ou sans session : celles
 * d'une session en cours, et celles marquées permanentes (`Blocklist.always`),
 * qui s'appliquent sans qu'on ait rien à lancer. Le reste de ce fichier ne fait
 * pas la différence entre les deux — un blocage est un blocage, seule change la
 * raison pour laquelle il est là.
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
 *   2. LA SORTIE DE PAGE. Une session ferme avec un avertissement natif du
 *      navigateur, la seule friction qu'il concède avant de laisser partir.
 *
 * Ce que cette couche NE fait plus : compter les sorties de l'app. Quitter la
 * fenêtre pendant une session concentrée n'est pas un écart — c'est le travail
 * lui-même, qui se fait dans un terminal, un graphique, un carnet. Le seul
 * signal qu'une page web sait produire là-dessus mesurait donc l'attention à
 * l'endroit exact où elle n'a pas à l'être, et chaque retour ouvrait un écran
 * pour reprocher une absence légitime.
 *
 * DANS L'APP DE BUREAU — la couche qui manquait, et la raison d'être de la
 * coquille Tauri :
 *
 *   3. LES APPLIS. Le poste est relevé toutes les deux secondes ; si
 *      l'application au premier plan est coupée par une liste active, la fenêtre
 *      de tao trade reprend la main et l'écran de blocage s'affiche. Rien n'est
 *      tué ni fermé — la friction est le retour forcé, pas la perte de travail
 *      (cf. src-tauri/src/blocker.rs).
 *   4. LES SITES OUVERTS AILLEURS. Un navigateur n'est jamais coupé en bloc —
 *      c'est un contenant, pas une distraction. On lui demande l'URL de son
 *      onglet actif, et c'est `verdictFor` qui trace : les mêmes règles que pour
 *      un lien cliqué dans l'app, sous-domaines et mode « seuls autorisés »
 *      compris. Un onglet coupé est renvoyé vers la page de blocage de l'app
 *      (`/blocked`), et RIEN n'est fermé : un retour arrière ramène la page.
 *      La fenêtre de tao trade, elle, NE REPREND PAS le premier plan — la page
 *      de blocage dit déjà tout, là où le geste a eu lieu, et déplacer en plus
 *      la personne hors de son navigateur ajouterait une interruption sans
 *      ajouter une information. C'est ce qui rattrape le
 *      YouTube ouvert hors de l'app, là où la couche web, enfermée dans son
 *      propre onglet, ne voit rien.
 *   5. À DÉFAUT, LE TITRE. Firefox n'expose pas ses URLs, Windows n'a pas
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

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  alwaysBlocklistIds, appVerdictFor, dayKey, isBrowserApp, remainingMs, sessionFromSchedule,
  shouldFire, targetLabel, verdictFor,
  type FocusSchedule, type FocusStore, type RunningSession,
} from "./model";
import {
  frontSnapshot, frontTab, nativeAvailable, reclaimFocus, redirectTab, webAppInstalled,
} from "./native";

/** Un blocage constaté, tel qu'il remonte à l'interface. */
export interface GuardHit {
  /** Identifiant catalogue, domaine libre, ou `away`. */
  target: string;
  /**
   * Ce qui a été coupé. `url` pour une navigation depuis l'app, `site` pour un
   * onglet ouvert ailleurs et reconnu à son URL, `window` pour le même onglet
   * deviné à son seul titre, `app` pour une application passée au premier plan.
   *
   * L'écran de blocage ne dit pas la même chose dans tous les cas : un lien
   * refusé n'a mené nulle part, un onglet renvoyé était déjà ouvert.
   */
  kind?: "url" | "site" | "app" | "window";
  /** URL refusée, quand c'est une navigation. */
  url?: string;
  /** Nom de l'application relevée, tel que l'OS le rapporte. */
  appName?: string;
  /** Titre de la fenêtre relevée. */
  windowTitle?: string;
  /** Nom de la liste qui a tranché. */
  listName?: string;
  /**
   * Le blocage a déjà été montré LÀ OÙ il s'est produit — pour un site, la page
   * de blocage a bien pris la place de l'onglet.
   *
   * La page n'a plus alors à ouvrir son propre écran par-dessus : la tentative
   * part au journal, mais la personne n'est ni ramenée ni interrompue une
   * seconde fois. Faux quand le renvoi a échoué : il faut bien que quelque
   * chose se voie.
   */
  handled?: boolean;
}

/** Cadence du relevé du poste. Deux secondes : assez court pour que la reprise
 *  de main suive le geste, assez long pour ne pas peser sur la machine — la
 *  page « Activité » échantillonne au même ordre de grandeur. */
const NATIVE_POLL_MS = 2_000;

/** Délai minimal entre deux INTERVENTIONS sur la même cible — renvoi d'onglet
 *  ou reprise de main. Sans lui, un utilisateur qui insiste en déclencherait une
 *  toutes les deux secondes : le poste devient inutilisable au lieu d'être
 *  protégé. */
const ACT_COOLDOWN_MS = 6_000;

/** Délai minimal entre deux tentatives notées au journal pour la même cible.
 *  Une insistance de trente secondes est UNE tentative, pas quinze.
 *
 *  Il est plus long que le précédent, et c'est ce qui garantit qu'une tentative
 *  notée vient toujours d'un tour où l'on a VRAIMENT agi : l'état de ce qui a
 *  été montré ne peut donc pas être périmé au moment où on le rapporte. */
const ATTEMPT_COOLDOWN_MS = 25_000;

/** État du garde natif, tel qu'il s'affiche dans la page. */
export interface NativeGuardStatus {
  /** L'app de bureau est là — la capacité existe. */
  available: boolean;
  /** Le poste a été lu pour de bon (autorisation accordée). */
  reading: boolean;
  /** App installée depuis le web : sa propre fenêtre, mais aucun accès au poste. */
  installedWeb: boolean;
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
  /* Dans quelle coquille tourne-t-on ? La question se pose au navigateur, qui
     n'existe pas au rendu serveur — d'où `useSyncExternalStore` et son instantané
     serveur distinct, plutôt qu'un état initial qui différerait entre les deux
     rendus. Rien à quoi s'abonner : une app ne change pas de coquille en cours
     de route. */
  const shell = useSyncExternalStore(NO_SUBSCRIBE, readShell, readShellOnServer);

  const [probe, setProbe] = useState<{ reading: boolean; error?: string | null }>({
    reading: false, error: null,
  });

  useEffect(() => {
    if (shell !== "native") return;
    let alive = true;
    void frontSnapshot().then(snap => {
      if (alive) setProbe({ reading: !!snap?.ok, error: snap?.error ?? null });
    });
    return () => { alive = false; };
  }, [shell]);

  return {
    available: shell === "native",
    installedWeb: shell === "installed",
    reading: probe.reading,
    error: probe.error,
  };
}

/** Coquille dans laquelle la page tourne. */
type Shell = "native" | "installed" | "web";

const NO_SUBSCRIBE = () => () => {};

function readShell(): Shell {
  if (nativeAvailable()) return "native";
  return webAppInstalled() ? "installed" : "web";
}

/* Au rendu serveur, on ne sait rien du poste : on annonce la coquille la plus
   pauvre, celle qui ne promet aucun blocage système. Une promesse tenue en
   dessous de ce qui est affiché passe ; l'inverse non. */
function readShellOnServer(): Shell {
  return "web";
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
  /* La session tenue en référence elle aussi : les écouteurs sont posés une fois
     par session, mais son contenu bouge en cours de route — les tentatives
     s'accumulent, la durée peut être rallongée — et l'adresse de la page de
     blocage doit porter l'état du moment, pas celui du départ. */
  const runningRef = useRef(running);
  useEffect(() => {
    onHitRef.current = onHit;
    storeRef.current = store;
    runningRef.current = running;
  });

  /* Ce qui est coupé À CET INSTANT : les listes de la session en cours, plus
     celles qui sont marquées permanentes. Les deux s'ajoutent — une décision
     prise une fois pour toutes n'a pas à être reprise dans chaque session, et
     une session n'a pas à desserrer ce qui a été coupé pour de bon.
     Le garde tourne donc dès qu'il y a quelque chose à tenir, session ou non :
     c'est ce qui rend un blocage permanent... permanent.

     La clé est une chaîne TRIÉE, et non le tableau : deux tableaux de mêmes
     identifiants sont deux objets différents à chaque rendu, et les écouteurs
     seraient reposés en boucle. */
  const idsKey = useMemo(() => {
    const session = running && !running.pausedAt ? running.blocklistIds : [];
    return [...new Set([...alwaysBlocklistIds(store), ...session])].sort().join(",");
  }, [store, running]);
  const blocklistIds = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);
  const active = blocklistIds.length > 0;

  /* ── Liens et fenêtres ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!active) return;

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
    if (!active || !nativeAvailable()) return;

    let alive = true;
    /* Dernière intervention et dernière tentative notée, PAR CIBLE. Deux
       horloges distinctes et non une seule : l'intervention doit rester serrée
       pour être une friction, le journal doit rester lisible. `lastShown` retient
       ce que cette intervention a réussi à montrer sur place. */
    const lastAct = new Map<string, number>();
    const lastAttempt = new Map<string, number>();
    const lastShown = new Map<string, boolean>();
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

        if (now - (lastAct.get(hit.target) || 0) >= ACT_COOLDOWN_MS) {
          lastAct.set(hit.target, now);
          /* Un onglet se remplace ; une appli, non. D'où deux gestes qui ne se
             cumulent pas : quand la page de blocage a pris la place du site, la
             personne a déjà tout sous les yeux et reste où elle est. La reprise
             de main n'intervient que faute de mieux — une appli, ou un renvoi
             qui n'a pas abouti. */
          const shown = hit.kind === "site"
            ? await redirectTab(snap.app, blockedUrl(hit, storeRef.current, runningRef.current))
            : false;
          if (!shown) await reclaimFocus();
          lastShown.set(hit.target, shown);
        }
        if (!alive) return;

        if (now - (lastAttempt.get(hit.target) || 0) < ATTEMPT_COOLDOWN_MS) return;
        lastAttempt.set(hit.target, now);
        onHitRef.current({ ...hit, handled: lastShown.get(hit.target) === true });
      } finally {
        busy = false;
      }
    };

    void tick();
    const id = setInterval(() => { void tick(); }, NATIVE_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [active, blocklistIds]);

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

/**
 * Adresse de la page qui remplace le site coupé.
 *
 * Tout ce que la page affiche tient ici : elle est atteinte dans un navigateur
 * qui n'est peut-être pas connecté, et rien ne doit dépendre d'une session ou
 * d'un appel réseau. D'où le choix de ce qui voyage — le nom du site, celui de
 * la liste, celui de la session, l'heure de fin, le rang de la tentative — et
 * de ce qui ne voyage PAS : cette adresse atterrit dans l'historique du
 * navigateur, et rien de plus intime n'a à s'y trouver.
 *
 * Elle est sur le domaine de l'app, que `verdictFor` laisse toujours passer :
 * l'onglet renvoyé ne peut donc pas se faire couper à son tour, et la boucle
 * ne se mord pas la queue au relevé suivant.
 */
function blockedUrl(
  hit: GuardHit, store: FocusStore, s: RunningSession | null
): string | undefined {
  if (typeof window === "undefined") return undefined;
  const p = new URLSearchParams({ t: targetLabel(hit.target, store) });
  if (hit.listName) p.set("l", hit.listName);

  if (s) {
    p.set("s", s.name);
    p.set("n", String(s.attempts.length + 1));
    const left = remainingMs(s);
    // Une heure de fin plutôt qu'une durée : la page peut alors décompter
    // toute seule, sans savoir depuis combien de temps elle est ouverte.
    if (left !== null) p.set("u", String(Date.now() + left));
  }
  return `${window.location.origin}/blocked?${p.toString()}`;
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
