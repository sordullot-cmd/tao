"use client";

/**
 * Branchement React du moteur de suivi d'activité.
 *
 * `useActivityTracker()` est appelé UNE fois, par le shell de l'app : le suivi
 * doit tourner tant que l'app est ouverte, pas seulement quand on regarde la
 * page « Activité ». Les pages, elles, lisent avec `useDayLog` / `useActivityLive`.
 *
 * Les réglages passent par `useCloudState` (donc synchronisés entre postes) ;
 * les MESURES restent locales à la machine (cf. lib/activity/engine.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { getLocalDateString } from "@/lib/dateUtils";
import { notify } from "@/lib/notify";
import { applyCategorySettings, resolveProductivity } from "@/lib/activity/categories";
import {
  DEFAULT_SETTINGS, importPhoneDay, getDay, getLive, isRunning, setCloudSync, startTracker, stopTracker,
  subscribe, syncNow, type ActivitySettings, type DayLog, type LiveState,
} from "@/lib/activity/engine";
import { fmtDur } from "@/lib/activity/stats";
import { usageAccess } from "@/lib/activity/phone";

/** Réglages du suivi, complétés par les valeurs par défaut. */
export function useActivitySettings(): [ActivitySettings, (updater: ActivitySettings | ((prev: ActivitySettings) => ActivitySettings)) => void] {
  const [raw, setRaw] = useCloudState<Partial<ActivitySettings>>(
    "tr4de_activity_settings",
    "activity_settings",
    DEFAULT_SETTINGS
  );

  /* Fusion avec les valeurs par défaut : un réglage ajouté par une version
     ultérieure manque dans l'enregistrement d'un utilisateur déjà installé, et
     `undefined` désactiverait la fonction au lieu de lui donner sa valeur. */
  const settings = useMemo<ActivitySettings>(() => {
    const merged: ActivitySettings = {
      ...DEFAULT_SETTINGS,
      ...(raw || {}),
      rules: Array.isArray(raw?.rules) ? raw!.rules! : [],
      productivity: (raw?.productivity && typeof raw.productivity === "object") ? raw.productivity : {},
      customCategories: Array.isArray(raw?.customCategories) ? raw!.customCategories! : [],
      categoryEdits: (raw?.categoryEdits && typeof raw.categoryEdits === "object") ? raw.categoryEdits : {},
      categoryOrder: Array.isArray(raw?.categoryOrder) ? raw!.categoryOrder! : [],
    };
    /* Le vocabulaire des catégories est relu ICI, pendant le rendu et non dans
       un effet : `categoryLabel()` est appelé par des composants qui ne
       reçoivent pas les réglages, et un effet ne s'exécuterait qu'APRÈS leur
       premier rendu — le temps d'une image, une catégorie renommée aurait
       encore son ancien nom. L'écriture est idempotente (mêmes réglages, même
       registre), donc rejouable sans dommage. */
    applyCategorySettings(merged);
    return merged;
  }, [raw]);

  const set = useCallback((updater: ActivitySettings | ((prev: ActivitySettings) => ActivitySettings)) => {
    setRaw(prev => {
      const base: ActivitySettings = {
        ...DEFAULT_SETTINGS,
        ...(prev || {}),
        rules: Array.isArray(prev?.rules) ? prev!.rules! : [],
        productivity: (prev?.productivity && typeof prev.productivity === "object") ? prev.productivity : {},
        customCategories: Array.isArray(prev?.customCategories) ? prev!.customCategories! : [],
        categoryEdits: (prev?.categoryEdits && typeof prev.categoryEdits === "object") ? prev.categoryEdits : {},
        categoryOrder: Array.isArray(prev?.categoryOrder) ? prev!.categoryOrder! : [],
      };
      return typeof updater === "function" ? (updater as (p: ActivitySettings) => ActivitySettings)(base) : updater;
    });
  }, [setRaw]);

  return [settings, set];
}

/** Re-render à chaque échantillon, sans copier l'état du moteur dans React. */
function useEngineTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick(t => t + 1)), []);
  return tick;
}

/** L'état « en direct » : app courante, catégorie, absence, source. */
export function useActivityLive(): LiveState {
  useEngineTick();
  return getLive();
}

/** Le journal d'un jour (« YYYY-MM-DD »), rafraîchi à chaque échantillon. */
export function useDayLog(date: string): DayLog {
  const tick = useEngineTick();
  // `getDay` rend l'objet du moteur, muté sur place : c'est le tick qui déclenche
  // le rendu, et la copie qui garantit que les mémos en aval se recalculent.
  return useMemo(() => {
    /* `tick` n'est pas lu ici : il est la seule chose qui change quand le moteur
       a mesuré du temps de plus, et c'est lui qui doit rouvrir ce mémo — le
       journal, muté sur place, garde la même identité. */
    void tick;
    const day = getDay(date);
    return { ...day, segments: [...day.segments] };
  }, [date, tick]);
}

/**
 * Démarre le suivi et émet les rappels (pause, surtravail, distraction).
 * À n'appeler QU'UNE fois dans l'app.
 */
export function useActivityTracker(): { live: LiveState; settings: ActivitySettings } {
  const [settings] = useActivitySettings();
  const { user } = useAuth();

  /* Le moteur vit hors de React et ne connaît pas la session : c'est ici qu'on
     lui dit s'il y a un compte où verser les journées. Sans utilisateur, il ne
     touche pas au réseau — ni pour lire, ni pour écrire. */
  useEffect(() => {
    setCloudSync(Boolean(user));
    return () => {
      // On verse ce qui attend avant de perdre le compte (déconnexion).
      if (user) syncNow();
      setCloudSync(false);
    };
  }, [user]);
  const settingsRef = useRef(settings);
  // Écrit dans un effet et non pendant le rendu : le moteur lit ce ref hors du
  // cycle React, mais y toucher pendant le rendu casse le mode concurrent.
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  /* Sur ANDROID, personne n'échantillonne : le système tient déjà le journal
     des passages au premier plan, et on le relit (cf. lib/activity/phone).
     C'est la seule voie tenable — le WebView est gelé dès que tao passe en
     arrière-plan, donc une boucle s'arrêterait exactement quand il y aurait
     quelque chose à mesurer.

     La reconstruction est faite à l'ouverture, puis à intervalle LENT tant que
     l'app est visible : la journée ne bouge que si on a utilisé le téléphone,
     et pendant ce temps-là on ne regarde pas tao. */
  const [phoneMode, setPhoneMode] = useState(false);
  useEffect(() => {
    let alive = true;
    void usageAccess().then(a => { if (alive) setPhoneMode(a.supported); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!phoneMode || !settings.enabled) return;
    let alive = true;
    const pull = () => { if (alive) void importPhoneDay(getLocalDateString()); };
    pull();
    const onVisible = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") pull();
    }, 60_000);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [phoneMode, settings.enabled]);

  // Le moteur relit les réglages à chaque échantillon : seuls l'activation et
  // la période d'échantillonnage exigent de relancer la boucle.
  useEffect(() => {
    if (phoneMode || !settings.enabled) {
      stopTracker();
      return;
    }
    startTracker(() => settingsRef.current);
    return () => stopTracker();
  }, [phoneMode, settings.enabled, settings.pollSeconds]);

  /* Rappels déjà émis — un par « épisode », sinon la notification repartirait à
     chaque échantillon (toutes les 5 secondes). */
  const notified = useRef<{ breakAt: number; overworkDay: string; distractAt: number }>({
    breakAt: 0, overworkDay: "", distractAt: 0,
  });

  const live = useActivityLive();

  useEffect(() => {
    const s = settingsRef.current;
    if (!s.enabled || !s.notifications || !live.running || live.away) return;

    const today = getLocalDateString();
    const day = getDay(today);
    const segments = day.segments;
    if (!segments.length) return;

    const now = Date.now();
    const activeMs = segments.reduce((n, g) => n + Math.max(0, g.e - g.s), 0);

    // Travail d'affilée : on remonte les segments jusqu'au premier trou de 5
    // minutes ou plus — c'est ce qu'on appelle une pause.
    let streakMs = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
      streakMs += Math.max(0, segments[i].e - segments[i].s);
      const gap = i > 0 ? segments[i].s - segments[i - 1].e : Infinity;
      if (gap >= 5 * 60_000) break;
    }

    if (s.breakEveryMinutes > 0 && streakMs >= s.breakEveryMinutes * 60_000) {
      // Un rappel par heure au plus, tant que la pause n'est pas prise : au
      // rythme des échantillons, ce serait un rappel toutes les 5 secondes.
      if (now - notified.current.breakAt > 60 * 60_000) {
        notified.current.breakAt = now;
        void notify("Pause conseillée", { body: `${fmtDur(streakMs)} de travail d'affilée. Lève-toi deux minutes.` });
      }
    } else if (streakMs < 5 * 60_000) {
      // Pause prise : le prochain épisode pourra prévenir à nouveau.
      notified.current.breakAt = 0;
    }

    if (s.overworkHours > 0 && activeMs >= s.overworkHours * 3600_000 && notified.current.overworkDay !== today) {
      notified.current.overworkDay = today;
      void notify("Journée longue", { body: `${fmtDur(activeMs)} d'activité aujourd'hui. Le reste attendra demain.` });
    }

    if (
      s.distractionAlertMinutes > 0 &&
      live.cat && resolveProductivity(live.cat, s.productivity) === "distracting" &&
      live.since && now - live.since >= s.distractionAlertMinutes * 60_000
    ) {
      if (notified.current.distractAt !== live.since) {
        notified.current.distractAt = live.since;
        void notify("Tu dérives", { body: `${fmtDur(now - live.since)} sur ${live.label}. Retour au travail ?` });
      }
    }
  }, [live]);

  return { live, settings };
}

/** Vrai si la boucle d'échantillonnage tourne (pour l'indicateur de la page). */
export function useTrackerRunning(): boolean {
  useEngineTick();
  return isRunning();
}
