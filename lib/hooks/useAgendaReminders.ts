"use client";

import { useEffect, useRef } from "react";
import { useGoogleCalendar } from "@/lib/hooks/useGoogleCalendar";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { notify, ensureNotifyPermission } from "@/lib/notify";
import { TASK_TIMES_STORAGE_KEY, TASK_TIMES_CLOUD_KEY } from "@/lib/lifeRpgCategories";
import { reminderMinutesList, remindersFromEvent } from "@/lib/agendaReminders";

/**
 * useAgendaReminders — planifie de vraies notifications système (natives sur
 * desktop via Tauri) pour les évènements Google Agenda à venir.
 *
 * Pourquoi ce hook : les rappels configurés sur un évènement ne sont, côté
 * Google, envoyés que par Google (mail / notif mobile). Sur le poste (macOS
 * notamment) l'utilisateur ne recevait donc rien. Ici on déclenche localement,
 * à l'heure du rappel, une notification OS.
 *
 * Un item peut porter PLUSIEURS rappels : on programme un timer par délai, la
 * clé de dédoublonnage incluant les minutes.
 *
 * Les tâches Google passent par le même chemin, mais leurs rappels ne viennent
 * pas de Google — l'API Tasks n'en a pas. Ils sont rangés avec l'heure de
 * planification, dans le magasin `task_times` écrit par la page Calendrier.
 *
 * À monter une seule fois, au niveau du shell applicatif, pour que les rappels
 * fonctionnent quelle que soit la page ouverte (et même fenêtre masquée dans le
 * tray tant que l'app tourne).
 */

// Fenêtre d'anticipation : on ne regarde que les évènements des prochaines 13 h.
const LOOKAHEAD_MS = 13 * 60 * 60 * 1000;
// Fréquence de rafraîchissement de la liste des évènements.
const POLL_MS = 5 * 60 * 1000;
// Heure d'ancrage d'un item sans horaire (tâche « toute la journée ») : sans
// point de départ, « 30 min avant » n'a pas de sens. 9 h = début de journée.
const ALL_DAY_ANCHOR_H = 9;

interface CalEventLike {
  id?: string;
  summary?: string;
  allDay?: boolean;
  start?: string | null;
  status?: string;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ minutes?: number }>;
  } | null;
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
  // Heures et rappels des tâches : même clé que la page Calendrier, donc le
  // relais de useCloudState propage un enregistrement sans attendre un poll.
  const [taskTimes] = useCloudState<Record<string, TaskTime>>(
    TASK_TIMES_STORAGE_KEY,
    TASK_TIMES_CLOUD_KEY,
    {},
  );
  // Lu dans le poll (asynchrone) : une ref évite de relancer tout l'effet — et
  // donc de reprogrammer tous les timers — à chaque écriture du magasin.
  const taskTimesRef = useRef(taskTimes);
  useEffect(() => { taskTimesRef.current = taskTimes; }, [taskTimes]);

  // Timers en attente, indexés par clé de rappel (id|start|minutes).
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Rappels déjà déclenchés (évite un doublon après un re-poll / reload).
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!ready || !connected) return;

    let cancelled = false;
    const timers = timersRef.current;

    void ensureNotifyPermission();

    /** Programme un rappel unique. `startMs` = début de l'item. */
    const scheduleOne = (id: string, startKey: string, startMs: number, min: number, title: string) => {
      const triggerMs = startMs - min * 60 * 1000;
      const delay = triggerMs - Date.now();
      // Rappel déjà passé ou trop lointain → on ignore (les lointains seront
      // repris à un prochain poll, quand ils entreront dans la fenêtre).
      if (delay <= 0 || delay > LOOKAHEAD_MS) return;

      const key = `${id}|${startKey}|${min}`;
      if (firedRef.current.has(key) || timers.has(key)) return;

      const timer = setTimeout(() => {
        timers.delete(key);
        firedRef.current.add(key);
        const at = fmtHour(new Date(startMs));
        const body =
          min === 0 ? `C'est maintenant (${at})` : `Commence à ${at} (dans ${min} min)`;
        void notify(title, { body });
      }, delay);

      timers.set(key, timer);
    };

    const scheduleEvent = (ev: CalEventLike) => {
      if (cancelled) return;
      if (ev.status === "cancelled" || ev.allDay === undefined) return;
      if (!ev.id || !ev.start) return;
      const mins = reminderMinutesList(remindersFromEvent(ev));
      if (!mins.length) return;

      const startMs = new Date(ev.start).getTime();
      if (Number.isNaN(startMs)) return;

      const title = `📅 ${ev.summary || "Évènement"}`;
      for (const min of mins) scheduleOne(ev.id, ev.start, startMs, min, title);
    };

    const scheduleTask = (tk: GTaskLike) => {
      if (cancelled) return;
      if (!tk.id || tk.completed) return;
      const t = taskTimesRef.current?.[tk.id];
      if (!t?.day) return;
      const mins = reminderMinutesList(t.reminders);
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
      try {
        const evs = await fetchEvents(
          now.toISOString(),
          new Date(now.getTime() + LOOKAHEAD_MS).toISOString(),
        );
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
    };

    void poll();
    const interval = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [ready, connected, fetchEvents, fetchTasks]);
}
