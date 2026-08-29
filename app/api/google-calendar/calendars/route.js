import { google } from "googleapis";
import { getOAuthClient } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Liste les agendas visibles par l'utilisateur : le sien, ceux qu'on lui a
 * partagés, et surtout ceux auxquels il s'est abonné par URL iCal (l'emploi du
 * temps universitaire arrive par là). Sert à alimenter le sélecteur d'agendas ;
 * la lecture des évènements se fait ensuite agenda par agenda.
 */
export async function POST(req) {
  try {
    const { accessToken } = await req.json();
    if (!accessToken) return json({ error: "no_access_token" }, 401);

    const client = getOAuthClient(req);
    if (!client) return json({ error: "not_configured" }, 503);
    client.setCredentials({ access_token: accessToken });

    const cal = google.calendar({ version: "v3", auth: client });
    const res = await cal.calendarList.list({ maxResults: 250, showHidden: false });

    const calendars = (res.data.items || []).map((c) => ({
      id: c.id,
      title: c.summaryOverride || c.summary || c.id,
      description: c.description || "",
      color: c.backgroundColor || null,
      primary: !!c.primary,
      // Un agenda abonné par URL est en `reader` : Google refuse toute écriture
      // dessus, l'interface doit donc y interdire l'édition plutôt que de laisser
      // l'utilisateur découvrir l'échec au moment d'enregistrer.
      readOnly: !["owner", "writer"].includes(c.accessRole || ""),
      timeZone: c.timeZone || null,
    }));

    // L'agenda principal d'abord, puis les modifiables, puis les abonnements.
    calendars.sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      if (a.readOnly !== b.readOnly) return a.readOnly ? 1 : -1;
      return a.title.localeCompare(b.title, "fr");
    });

    return json({ calendars });
  } catch (e) {
    const msg = e?.message || "unknown_error";
    // Token émis avant l'ajout du scope `calendarlist.readonly` → reconnexion.
    if (/insufficient.*scope|scope|permission|forbidden/i.test(msg)) {
      return json({ error: "insufficient_scope", detail: msg }, 403);
    }
    const status = /invalid|expired|unauthor/i.test(msg) ? 401 : 500;
    return json({ error: msg }, status);
  }
}
