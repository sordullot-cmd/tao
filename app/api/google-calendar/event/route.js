import { google } from "googleapis";
import { getOAuthClient } from "@/lib/google/calendar";
import { remindersToGoogle } from "@/lib/agendaReminders";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Crée / modifie / supprime un évènement de l'agenda principal.
 * Body : { action: "create" | "update" | "delete", accessToken, eventId?, event? }
 * `event` : { summary, description, location, allDay, start, end }
 *   - timed : start/end = ISO (UTC) ; all-day : start/end = "YYYY-MM-DD" (end exclusif).
 */
export async function POST(req) {
  try {
    const { action, accessToken, eventId, event } = await req.json();
    if (!accessToken) return json({ error: "no_access_token" }, 401);

    const client = getOAuthClient(req);
    if (!client) return json({ error: "not_configured" }, 503);
    client.setCredentials({ access_token: accessToken });
    const cal = google.calendar({ version: "v3", auth: client });

    if (action === "delete") {
      if (!eventId) return json({ error: "no_event_id" }, 400);
      try {
        await cal.events.delete({ calendarId: "primary", eventId });
      } catch (err) {
        // Déjà supprimé / introuvable côté Google : l'objectif est atteint.
        const code = err?.code || err?.response?.status;
        if (code === 404 || code === 410) return json({ ok: true });
        throw err;
      }
      return json({ ok: true });
    }

    // Lecture d'un évènement (utilisé pour récupérer la règle de récurrence de la
    // série, portée par l'évènement maître et non par les occurrences dépliées).
    if (action === "get") {
      if (!eventId) return json({ error: "no_event_id" }, 400);
      const res = await cal.events.get({ calendarId: "primary", eventId });
      const ev = res.data || {};
      return json({ ok: true, event: { id: ev.id, recurrence: ev.recurrence || null, start: ev.start || null, end: ev.end || null } });
    }

    // Bascule rapide "tâche terminée" sans réécrire le reste de l'évènement.
    if (action === "setDone") {
      if (!eventId) return json({ error: "no_event_id" }, 400);
      await cal.events.patch({
        calendarId: "primary",
        eventId,
        requestBody: { extendedProperties: { private: { tr4deDone: event?.done ? "1" : "0" } } },
      });
      return json({ ok: true });
    }

    if (action === "create" || action === "update") {
      if (!event) return json({ error: "no_event" }, 400);
      const tz = event.timeZone || "UTC";
      const resource = {
        summary: event.summary || "(Sans titre)",
        description: event.description || undefined,
        location: event.location || undefined,
        colorId: event.colorId || undefined,
        start: event.allDay
          ? { date: event.start }
          : { dateTime: event.start, timeZone: tz },
        end: event.allDay
          ? { date: event.end }
          : { dateTime: event.end, timeZone: tz },
        attendees: Array.isArray(event.guests) && event.guests.length
          ? event.guests.map((email) => ({ email }))
          : undefined,
        // Récurrence (RRULE). Tableau vide = pas de récurrence / on efface la série.
        recurrence: Array.isArray(event.recurrence)
          ? (event.recurrence.length ? event.recurrence : (action === "update" ? [] : undefined))
          : undefined,
        // 'opaque' = Occupé · 'transparent' = Disponible
        transparency: event.transparency || undefined,
        visibility: event.visibility && event.visibility !== "default" ? event.visibility : undefined,
        // Rappels : une liste (jusqu'à 5 `overrides`, limite Google). `event.reminder`
        // au singulier reste accepté — l'ancien format scalaire du formulaire.
        // Rien d'envoyé = champ absent du patch : on ne veut pas effacer les
        // rappels existants d'un évènement modifié par glisser-déposer.
        reminders:
          event.reminders !== undefined
            ? remindersToGoogle(event.reminders)
            : event.reminder !== undefined
              ? remindersToGoogle(event.reminder)
              : undefined,
        // Marqueur "tâche" tr4de (un évènement-tâche avec état terminé/non).
        extendedProperties: event.isTask
          ? { private: { tr4deKind: "task", tr4deDone: event.done ? "1" : "0" } }
          : undefined,
      };

      // Visioconférence Google Meet (uniquement si demandée et pas déjà présente).
      let conferenceDataVersion = 0;
      if (event.addMeet && !event.hadMeet) {
        conferenceDataVersion = 1;
        resource.conferenceData = {
          createRequest: {
            requestId: `tr4de-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      const res =
        action === "create"
          ? await cal.events.insert({ calendarId: "primary", requestBody: resource, conferenceDataVersion, sendUpdates: "all" })
          : await cal.events.patch({ calendarId: "primary", eventId, requestBody: resource, conferenceDataVersion, sendUpdates: "all" });

      return json({ ok: true, event: res.data });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    const msg = e?.message || "unknown_error";
    if (/insufficient.*scope|scope|permission|forbidden/i.test(msg)) {
      return json({ error: "insufficient_scope", detail: msg }, 403);
    }
    const status = /invalid|expired|unauthor/i.test(msg) ? 401 : 500;
    return json({ error: msg }, status);
  }
}
