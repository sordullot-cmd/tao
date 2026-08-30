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
  effectiveReminderMinutes,
  normalizeDefaultReminders,
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
 * Un item peut porter PLUSIEURS rappels : on programme un timer par délai, la
 * clé de dédoublonnage incluant les minutes.
 *
 * Les tâches Google passent par le même chemin, mais leurs rappels ne viennent
 * pas de Google — l'API Tasks n'en a pas. Ils sont rangés avec l'heure de
 * planification, dans le magasin `task_times` écrit par la page Agenda.
 *
 * À monter une seule fois, au niveau du shell applicatif, pour que les rappels
 * fonctionnent quelle que soit la page ouverte (et même fenêtre masquée dans le
 * tray tant que l'app tourne).
 */

// Fenêtre d'anticipation minimale : on regarde au moins les prochaines 13 h.
const MIN_LOOKAHEAD_MS = 13 * 60 * 60 * 1000;
// Marge au-delà du rappel le plus anticipé : un rappel « 2 h avant » a besoin
// que l'évènement soit déjà dans la fenêtre deux heures plus tôt, sinon le poll
// ne le découvre qu'une fois l'heure de déclenchement passée.
const LOOKAHEAD_MARGIN_MS = 60 * 60 * 1000;
// Fréquence de rafraîchissement de la liste des évènements. Le flux iCal est
// mis en cache 10 min par `/api/ics` : un poll plus rapide ne servirait qu'à
// marteler notre propre route.
const POLL_MS = 5 * 60 * 1000;
// Heure d'ancrage d'un item sans horaire (tâche « toute la journée ») : sans
// point de départ, « 30 min avant » n'a pas de sens. 9 h = début de journée.
const ALL_DAY_ANCHOR_H = 9;

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

function fmtHour(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  // Lu dans le poll (asynchrone) : une ref évite de relancer tout l'effet — et
  // donc de reprogrammer tous les timers — à chaque écriture du magasin.
  const taskTimesRef = useRef(taskTimes);
  useEffect(() => { taskTimesRef.current = taskTimes; }, [taskTimes]);

  // Le réglage, lui, DOIT relancer l'effet : un délai raccourci ou allongé
  // change les timers déjà posés. On dépend de sa forme normalisée, pas de
  // l'identité du tableau — que `useCloudState` recrée à chaque lecture.
  const defaultMins = useMemo(
    () => normalizeDefaultReminders(defaultReminders),
    [defaultReminders],
  );
  const defaultSig = defaultMins.join(",");
  const defaultMinsRef = useRef(defaultMins);
  useEffect(() => { defaultMinsRef.current = defaultMins; }, [defaultMins]);

  // Idem pour les flux : seules l'URL et l'activation comptent ici, pas le nom
  // ni la couleur — les renommer ne doit pas reprogrammer tous les rappels.
  const activeFeeds = useMemo(
    () => feeds.filter((f) => f.enabled && f.url).map((f) => ({ id: f.id, url: f.url })),
    [feeds],
  );
  const feedsSig = activeFeeds.map((f) => `${f.id}:${f.url}`).join("|");
  const feedsRef = useRef(activeFeeds);
  useEffect(() => { feedsRef.current = activeFeeds; }, [activeFeeds]);

  // Timers en attente, indexés par clé de rappel (id|start|minutes).
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Rappels déjà déclenchés (évite un doublon après un re-poll / reload).
  const firedRef = useRef<Set<string>>(new Set());

  const googleOn = ready && connected;
  const hasFeeds = !!feedsSig;

  useEffect(() => {
    // Sans Google NI flux, il n'y a rien à surveiller — mais l'un des deux
    // suffit : un utilisateur qui n'a que son emploi du temps doit être notifié.
    if (!googleOn && !hasFeeds) return;

    let cancelled = false;
    const timers = timersRef.current;

    void ensureNotifyPermission();

    const lookaheadMs = Math.max(
      MIN_LOOKAHEAD_MS,
      (defaultMinsRef.current[0] || 0) * 60 * 1000 + LOOKAHEAD_MARGIN_MS,
    );

    /** Programme un rappel unique. `startMs` = début de l'item. */
    const scheduleOne = (
      id: string,
      startKey: string,
      startMs: number,
      min: number,
      title: string,
      place = "",
    ) => {
      const triggerMs = startMs - min * 60 * 1000;
      const delay = triggerMs - Date.now();
      // Rappel déjà passé ou trop lointain → on ignore (les lointains seront
      // repris à un prochain poll, quand ils entreront dans la fenêtre).
      if (delay <= 0 || delay > lookaheadMs) return;

      const key = `${id}|${startKey}|${min}`;
      if (firedRef.current.has(key) || timers.has(key)) return;

      const timer = setTimeout(() => {
        timers.delete(key);
        firedRef.current.add(key);
        const at = fmtHour(new Date(startMs));
        const when =
          min === 0 ? `C'est maintenant (${at})` : `Commence à ${at} (dans ${min} min)`;
        // La salle est ce qu'on cherche des yeux en lisant un rappel de cours ;
        // sans elle, la notification oblige à rouvrir l'agenda.
        void notify(title, { body: place ? `${when} · ${place}` : when });
      }, delay);

      timers.set(key, timer);
    };

    const scheduleEvent = (ev: CalEventLike) => {
      if (cancelled) return;
      if (ev.status === "cancelled" || ev.allDay === undefined) return;
      if (!ev.id || !ev.start) return;
      const mins = effectiveReminderMinutes(ev.reminders, defaultMinsRef.current);
      if (!mins.length) return;

      const startMs = new Date(ev.start).getTime();
      if (Number.isNaN(startMs)) return;

      const title = `📅 ${ev.summary || "Évènement"}`;
      for (const min of mins) scheduleOne(ev.id, ev.start, startMs, min, title, ev.location);
    };

    /**
     * Un cours d'un flux iCal. Aucun rappel n'y est attaché — le format n'en
     * transporte pas dans ce que `/api/ics` renvoie — donc tout repose sur le
     * réglage par défaut. La clé de dédoublonnage préfixe l'`uid` par le flux :
     * deux établissements peuvent servir le même identifiant.
     */
    const scheduleIcs = (feedId: string, ev: IcsEventLike) => {
      if (cancelled) return;
      if (!ev.uid || !ev.start || ev.allDay) return;
      if (ev.status === "cancelled") return;
      const mins = defaultMinsRef.current;
      if (!mins.length) return;

      const startMs = new Date(ev.start).getTime();
      if (Number.isNaN(startMs)) return;

      const title = `📅 ${ev.summary || "Cours"}`;
      for (const min of mins) {
        scheduleOne(`${feedId}:${ev.uid}`, ev.start, startMs, min, title, ev.location);
      }
    };

    const scheduleTask = (tk: GTaskLike) => {
      if (cancelled) return;
      if (!tk.id || tk.completed) return;
      const t = taskTimesRef.current?.[tk.id];
      if (!t?.day) return;
      const mins = effectiveReminderMinutes(t.reminders, defaultMinsRef.current);
      if (!mins.length) return;

      // Sans heure de planification, on ancre le rappel au matin du jour posé.
      const hhmm = t.startTime || `${String(ALL_DAY_ANCHOR_H).padStart(2, "0")}:00`;
      const startMs = new Date(`${t.day}T${hhmm}:00`).getTime();
      if (Number.isNaN(startMs)) return;

      const title = `✅ ${tk.title || "Tâche"}`;
      for (const min of mins) scheduleOne(tk.id, `${t.day}T${hhmm}`, startMs, min, title);
    };

    const poll = async () => {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + lookaheadMs).toISOString();

      if (googleOn) {
        try {
          const evs = await fetchEvents(timeMin, timeMax);
          if (cancelled) return;
          for (const ev of evs as CalEventLike[]) scheduleEvent(ev);
        } catch {
          /* réseau / token : on réessaiera au prochain tick */
        }
        try {
          const tks = await fetchTasks();
          if (cancelled) return;
          for (const tk of (tks || []) as GTaskLike[]) scheduleTask(tk);
        } catch {
          /* idem : l'échec des tâches ne doit pas emporter les évènements */
        }
      }

      // Chaque flux est isolé : un ENT en panne ne doit pas emporter les autres.
      await Promise.all(
        feedsRef.current.map(async (feed) => {
          try {
            const res = await fetch("/api/ics", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: feed.url, timeMin, timeMax }),
            });
            if (!res.ok || cancelled) return;
            const data = await res.json();
            if (cancelled) return;
            for (const ev of (data.events || []) as IcsEventLike[]) scheduleIcs(feed.id, ev);
          } catch {
            /* flux injoignable : repris au prochain tick */
          }
        }),
      );
    };

    void poll();
    const interval = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [googleOn, hasFeeds, feedsSig, defaultSig, fetchEvents, fetchTasks]);
}
