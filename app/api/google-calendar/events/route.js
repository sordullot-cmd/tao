import { google } from "googleapis";
import { getOAuthClient } from "@/lib/google/calendar";
import { mergeCalendarEvents, resolveCalendarIds } from "@/lib/google/calendarEvents";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req) {
  try {
    const { accessToken, timeMin, timeMax, calendarIds } = await req.json();
    if (!accessToken) return json({ error: "no_access_token" }, 401);

    const client = getOAuthClient(req);
    if (!client) return json({ error: "not_configured" }, 503);
    client.setCredentials({ access_token: accessToken });

    const cal = google.calendar({ version: "v3", auth: client });

    const now = new Date();
    const min = timeMin || now.toISOString();
    const max =
      timeMax ||
      new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

    // Sans sélection explicite, l'agenda principal seul : le comportement
    // d'origine. La sélection élargie (emploi du temps universitaire abonné par
    // URL iCal, agendas partagés…) est décidée côté client.
    const ids = resolveCalendarIds(calendarIds);

    // En parallèle, et tolérant : un agenda désabonné entre deux chargements ne
    // doit pas vider la grille des autres.
    const settled = await Promise.allSettled(
      ids.map(async (calendarId) => {
        const res = await cal.events.list({
          calendarId,
          timeMin: min,
          timeMax: max,
          maxResults: 2500,
          singleEvents: true,
          orderBy: "startTime",
        });
        return { calendarId, items: res.data.items || [] };
      }),
    );

    const failures = settled.filter((s) => s.status === "rejected");
    // Tout a échoué : l'erreur est générale (scope, token), pas un agenda cassé.
    if (failures.length && failures.length === ids.length) throw failures[0].reason;

    const events = mergeCalendarEvents(
      settled.filter((s) => s.status === "fulfilled").map((s) => s.value),
    );

    return json({
      events,
      // Le client peut signaler les agendas muets plutôt que de laisser croire à
      // un emploi du temps vide.
      failedCalendars: settled
        .map((s, i) => (s.status === "rejected" ? ids[i] : null))
        .filter(Boolean),
    });
  } catch (e) {
    const msg = e?.message || "unknown_error";
    // Token sans le scope calendar.readonly → l'utilisateur doit reconnecter
    // en accordant la permission (et le scope doit être déclaré côté Google).
    if (/insufficient.*scope|scope|permission|forbidden/i.test(msg)) {
      return json({ error: "insufficient_scope", detail: msg }, 403);
    }
    // 401 si le token est invalide/expiré → le client tentera un refresh.
    const status = /invalid|expired|unauthor/i.test(msg) ? 401 : 500;
    return json({ error: msg }, status);
  }
}
