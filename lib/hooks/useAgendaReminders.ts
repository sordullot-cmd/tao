"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGoogleCalendar } from "@/lib/hooks/useGoogleCalendar";
import { useIcsFeeds } from "@/lib/hooks/useIcsFeeds";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { notify, ensureNotifyPermission } from "@/lib/notify";
import { TASK_TIMES_STORAGE_KEY, TASK_TIMES_CLOUD_KEY } from "@/lib/lifeRpgCategories";
import {
  DEFAULT_REMINDERS_STORAGE_KEY,
  DEFAULT_REMINDERS_CLOUD_KEY,
  FACTORY_DEFAULT_REMINDERS,
  START_GRACE_MS,
  dueReminders,
  normalizeDefaultReminders,
  reminderWhen,
  type ReminderItem,
} from "@/lib/agendaReminders";

/**
 * useAgendaReminders — planifie de vraies notifications système (natives sur
 * desktop via Tauri) pour les évènements à venir, quelle que soit leur source.
 *
 * Pourquoi ce hook : les rappels configurés sur un évènement ne sont, côté
 * Google, envoyés que par Google (mail / notif mobile). Sur le poste (macOS
 * notamment) l'utilisateur ne recevait donc rien. Ici on déclenche localement,
 * à l'heure du rappel, une notification OS.
 *
 * TROIS sources, pas une : les évènements Google, les tâches Google, et les
 * flux iCal lus directement par l'app (`useIcsFeeds` — l'emploi du temps
 * universitaire). Les oublier revenait à ne jamais notifier un cours : un
 * `IcsFeedEvent` naît avec `reminders: null`, et le hook n'interrogeait que
 * Google. Le repli `effectiveReminderMinutes` leur donne leur délai.
 *
 * ── POURQUOI UNE HORLOGE ET NON DES MINUTEURS ─────────────────────────────
 *
 * La première version posait un `setTimeout` par rappel, parfois à douze heures
 * d'échéance. Trois choses le rendaient muet, et les trois arrivent tous les
 * jours :
 *
 *   1. Un `setTimeout` long ne survit pas à ce que fait un poste de travail.
 *      Veille de la machine, fenêtre masquée dans la barre d'état (la WebView
 *      occluse voit ses minuteurs bridés) : l'échéance passe sans réveil.
 *   2. Un rappel dont l'heure était passée était ABANDONNÉ (`delay <= 0`). Une
 *      app lancée à 9 h 53 ne disait plus rien du rappel de 9 h 50, alors que
 *      le cours, lui, était toujours à 10 h.
 *   3. L'effet dépendait de `fetchEvents`, dont l'identité change dès que la
 *      liste des agendas est relue (elle l'est à chaque retour sur la fenêtre).
 *      Chaque relance vidait TOUS les minuteurs déjà posés et repartait d'un
 *      appel réseau : les rappels se faisaient désarmer plus vite qu'ils
 *      n'arrivaient à échéance.
 *
 * D'où le modèle retenu, celui de `useScheduleRunner` (page Focus) — le seul du
 * dépôt dont on sait qu'il déclenche vraiment : une horloge courte compare
 * l'heure MURALE à une table d'échéances, avec fenêtre de rattrapage. Le poll
 * réseau ne fait que tenir cette table à jour ; il ne déclenche rien. Et tout ce
 * que la boucle lit passe par des refs, donc l'effet n'est jamais relancé.
 *
 * Ce qui est déjà sonné est retenu dans localStorage : sans ça, le rattrapage
 * ferait re-sonner le même rappel au premier rechargement de la page.
 *
 * Les tâches Google passent par le même chemin, mais leurs rappels ne viennent
 * pas de Google — l'API Tasks n'en a pas. Ils sont rangés avec l'heure de
 * planification, dans le magasin `task_times` écrit par la page Agenda.
 *
 * À monter une seule fois, au niveau du shell applicatif, pour que les rappels
 * fonctionnent quelle que soit la page ouverte (et même fenêtre masquée dans le
 * tray tant que l'app tourne).
 */

// Fenêtre de découverte. 26 h couvrent le rappel « 1 jour avant », le plus
// lointain qui se règle en pratique — au-delà, l'évènement n'était même pas
// chargé quand son rappel tombait, donc ne notifiait jamais.
const MIN_DISCOVERY_MS = 26 * 60 * 60 * 1000;
// Marge au-delà du rappel le plus anticipé : il faut que l'évènement soit déjà
// dans la fenêtre AVANT l'heure de son rappel, pas pile à cette heure-là.
const DISCOVERY_MARGIN_MS = 60 * 60 * 1000;
// Rafraîchissement de la table. Le flux iCal est mis en cache 10 min par
// `/api/ics` : un poll plus rapide ne servirait qu'à marteler notre route.
const POLL_MS = 5 * 60 * 1000;
// Battement de l'horloge. C'est lui, et non le poll, qui décide de notifier :
// une demi-minute de retard sur un rappel ne se remarque pas.
const TICK_MS = 30 * 1000;
// Heure d'ancrage d'un item sans horaire (« toute la journée ») : sans point de
// départ, « 30 min avant » n'a pas de sens. 9 h = début de journée.
const ALL_DAY_ANCHOR_H = 9;

// Rappels déjà sonnés, gardés d'une session à l'autre.
const FIRED_STORAGE_KEY = "tr4de_agenda_fired";
// Passé ce délai après l'évènement, plus rien ne peut le faire re-sonner : la
// mémoire n'a plus de raison de le retenir.
const FIRED_TTL_MS = 24 * 60 * 60 * 1000;

// Sources, pour remplacer d'un bloc ce qu'une réponse renvoie sans toucher aux
// autres : un ENT en panne ne doit pas effacer les évènements Google.
const SRC_EVENTS = "gcal:events";
const SRC_TASKS = "gcal:tasks";
const srcFeed = (feedId: string) => `ics:${feedId}`;

interface CalEventLike {
  id?: string;
  summary?: string;
  location?: string;
  allDay?: boolean;
  start?: string | null;
  status?: string;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ minutes?: number }>;
  } | null;
}

interface IcsEventLike {
  uid?: string;
  summary?: string;
  location?: string;
  allDay?: boolean;
  start?: string | null;
  status?: string;
}

interface GTaskLike {
  id?: string;
  title?: string;
  completed?: unknown;
}

interface TaskTime {
  day?: string;
  startTime?: string;
  reminders?: unknown;
}

/**
 * Instant de départ d'un item.
 *
 * Une date nue (`"2026-09-03"`, ce que Google renvoie pour un évènement « toute
 * la journée ») est lue en UTC par `new Date` : minuit UTC, soit 2 h du matin à
 * Paris en été. Le rappel « 10 min avant » tombait donc en pleine nuit. On
 * ancre la journée à 9 h LOCALE, comme les tâches sans heure.
 */
function itemStartMs(start: string, allDay: boolean): number | null {
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const [y, m, d] = start.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, ALL_DAY_ANCHOR_H, 0, 0, 0).getTime();
  }
  const ms = new Date(start).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function loadFired(): Map<string, number> {
  const map = new Map<string, number>();
  if (typeof window === "undefined") return map;
  try {
    const raw = localStorage.getItem(FIRED_STORAGE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const floor = Date.now() - FIRED_TTL_MS;
    for (const [k, v] of Object.entries(parsed || {})) {
      if (typeof v === "number" && v > floor) map.set(k, v);
    }
  } catch {
    /* entrée illisible : on repart d'une mémoire vide, au pire un doublon */
  }
  return map;
}

function saveFired(map: Map<string, number>): void {
  try {
    localStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    /* quota / mode privé : la mémoire ne vivra que le temps de la session */
  }
}

export function useAgendaReminders(): void {
  const { ready, connected, fetchEvents, fetchTasks } = useGoogleCalendar();
  const { feeds } = useIcsFeeds();
  // Heures et rappels des tâches : même clé que la page Agenda, donc le
  // relais de useCloudState propage un enregistrement sans attendre un poll.
  const [taskTimes] = useCloudState<Record<string, TaskTime>>(
    TASK_TIMES_STORAGE_KEY,
    TASK_TIMES_CLOUD_KEY,
    {},
  );
  const [defaultReminders] = useCloudState<unknown>(
    DEFAULT_REMINDERS_STORAGE_KEY,
    DEFAULT_REMINDERS_CLOUD_KEY,
    FACTORY_DEFAULT_REMINDERS,
  );

  const defaultMins = useMemo(
    () => normalizeDefaultReminders(defaultReminders),
    [defaultReminders],
  );
  // Seules l'URL et l'activation comptent ici, pas le nom ni la couleur.
  const activeFeeds = useMemo(
    () => feeds.filter((f) => f.enabled && f.url).map((f) => ({ id: f.id, url: f.url })),
    [feeds],
  );

  /* Tout ce que la boucle lit passe par cette référence, remise à jour après
     chaque rendu. C'est ce qui permet à l'effet de n'avoir que deux
     interrupteurs en dépendances : un réglage modifié est pris en compte au
     battement suivant, sans désarmer quoi que ce soit. Déclaré AVANT l'effet
     principal pour que la première valeur y soit déjà. */
  const live = useRef({ fetchEvents, fetchTasks, taskTimes, defaultMins, activeFeeds });
  useEffect(() => {
    live.current = { fetchEvents, fetchTasks, taskTimes, defaultMins, activeFeeds };
  });

  // Échéances connues, indexées par item. Survit aux rendus, pas au montage.
  const itemsRef = useRef<Map<string, ReminderItem>>(new Map());
  // Rappels déjà sonnés → instant de l'évènement (sert à la purge).
  const firedRef = useRef<Map<string, number> | null>(null);

  const googleOn = ready && connected;
  const hasFeeds = activeFeeds.length > 0;

  useEffect(() => {
    // Sans Google NI flux, il n'y a rien à surveiller — mais l'un des deux
    // suffit : un utilisateur qui n'a que son emploi du temps doit être notifié.
    if (!googleOn && !hasFeeds) return;

    let cancelled = false;
    const items = itemsRef.current;
    if (firedRef.current === null) firedRef.current = loadFired();
    const fired = firedRef.current;

    void ensureNotifyPermission();

    /** Remplace ce qu'une source avait posé. Une source muette garde le sien. */
    const replaceSource = (source: string, list: ReminderItem[]) => {
      for (const [k, v] of items) if (v.source === source) items.delete(k);
      for (const it of list) items.set(`${it.source}|${it.id}`, it);
    };

    const fromEvent = (ev: CalEventLike): ReminderItem | null => {
      if (!ev.id || !ev.start || ev.status === "cancelled") return null;
      const startMs = itemStartMs(ev.start, !!ev.allDay);
      if (startMs === null) return null;
      return {
        source: SRC_EVENTS,
        id: ev.id,
        startKey: ev.start,
        startMs,
        title: `📅 ${ev.summary || "Évènement"}`,
        // La salle est ce qu'on cherche des yeux en lisant un rappel de cours ;
        // sans elle, la notification oblige à rouvrir l'agenda.
        place: ev.location || "",
        reminders: ev.reminders,
      };
    };

    /**
     * Un cours d'un flux iCal. Aucun rappel n'y est attaché — le format n'en
     * transporte pas dans ce que `/api/ics` renvoie — donc tout repose sur le
     * réglage par défaut. L'identifiant préfixe l'`uid` par le flux : deux
     * établissements peuvent servir le même.
     */
    const fromIcs = (feedId: string, ev: IcsEventLike): ReminderItem | null => {
      if (!ev.uid || !ev.start || ev.allDay || ev.status === "cancelled") return null;
      const startMs = itemStartMs(ev.start, false);
      if (startMs === null) return null;
      return {
        source: srcFeed(feedId),
        id: `${feedId}:${ev.uid}`,
        startKey: ev.start,
        startMs,
        title: `📅 ${ev.summary || "Cours"}`,
        place: ev.location || "",
        reminders: null,
      };
    };

    const fromTask = (tk: GTaskLike): ReminderItem | null => {
      if (!tk.id || tk.completed) return null;
      const t = live.current.taskTimes?.[tk.id];
      if (!t?.day) return null;
      // Sans heure de planification, on ancre le rappel au matin du jour posé.
      const hhmm = t.startTime || `${String(ALL_DAY_ANCHOR_H).padStart(2, "0")}:00`;
      const startMs = itemStartMs(`${t.day}T${hhmm}:00`, false);
      if (startMs === null) return null;
      return {
        source: SRC_TASKS,
        id: tk.id,
        startKey: `${t.day}T${hhmm}`,
        startMs,
        title: `✅ ${tk.title || "Tâche"}`,
        reminders: t.reminders,
      };
    };

    /* ── L'horloge ─────────────────────────────────────────────────────────
       C'est ici, et nulle part ailleurs, qu'une notification part. */
    const tick = () => {
      const now = Date.now();
      const mins = live.current.defaultMins;
      let dirty = false;

      for (const [k, item] of items) {
        // Évènement passé : plus rien à en tirer, et la table doit rester courte.
        if (item.startMs + START_GRACE_MS < now) { items.delete(k); continue; }

        const due = dueReminders(item, now, mins, (key) => fired.has(key));
        if (!due) continue;

        for (const key of due.keys) fired.set(key, item.startMs);
        dirty = true;
        if (!due.announce) continue;

        const when = reminderWhen(item.startMs, now);
        void notify(item.title, { body: item.place ? `${when} · ${item.place}` : when });
      }

      if (!dirty) return;
      const floor = now - FIRED_TTL_MS;
      for (const [key, at] of fired) if (at < floor) fired.delete(key);
      saveFired(fired);
    };

    const poll = async () => {
      const now = new Date();
      const timeMin = now.toISOString();
      const discovery = Math.max(
        MIN_DISCOVERY_MS,
        (live.current.defaultMins[0] || 0) * 60 * 1000 + DISCOVERY_MARGIN_MS,
      );
      const timeMax = new Date(now.getTime() + discovery).toISOString();

      if (googleOn) {
        try {
          const evs = (await live.current.fetchEvents(timeMin, timeMax)) as CalEventLike[];
          if (cancelled) return;
          replaceSource(SRC_EVENTS, evs.map(fromEvent).filter(Boolean) as ReminderItem[]);
        } catch {
          /* réseau / token : on réessaiera au prochain poll */
        }
        try {
          const tks = ((await live.current.fetchTasks()) || []) as GTaskLike[];
          if (cancelled) return;
          replaceSource(SRC_TASKS, tks.map(fromTask).filter(Boolean) as ReminderItem[]);
        } catch {
          /* idem : l'échec des tâches ne doit pas emporter les évènements */
        }
      }

      // Chaque flux est isolé : un ENT en panne ne doit pas emporter les autres.
      await Promise.all(
        live.current.activeFeeds.map(async (feed) => {
          try {
            const res = await fetch("/api/ics", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: feed.url, timeMin, timeMax }),
            });
            if (!res.ok || cancelled) return;
            const data = await res.json();
            if (cancelled) return;
            const list = ((data.events || []) as IcsEventLike[])
              .map((ev) => fromIcs(feed.id, ev))
              .filter(Boolean) as ReminderItem[];
            replaceSource(srcFeed(feed.id), list);
          } catch {
            /* flux injoignable : repris au prochain poll */
          }
        }),
      );

      // Un rappel peut déjà être dû dans ce que le poll vient d'apprendre —
      // typiquement au lancement de l'app, cinq minutes avant un cours.
      if (!cancelled) tick();
    };

    void poll();
    const pollId = setInterval(() => { void poll(); }, POLL_MS);
    const tickId = setInterval(tick, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [googleOn, hasFeeds]);
}
