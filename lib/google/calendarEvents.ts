/**
 * Mise à plat des évènements Google en la forme attendue par l'agenda tr4de.
 *
 * Isolé de la route pour être testable sans mock de `googleapis` : la fusion de
 * plusieurs agendas est la partie qui se casse en silence (un doublon affiché
 * deux fois, un agenda muet qui vide toute la grille), pas l'appel réseau.
 */

export interface FlatEvent {
  id: string;
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  htmlLink: string;
  colorId: string | null;
  allDay: boolean;
  start: string | null;
  end: string | null;
  status: string;
  recurringEventId: string | null;
  guests: string[];
  transparency: string;
  visibility: string;
  reminders: unknown;
  hangoutLink: string | null;
  isTask: boolean;
  done: boolean;
}

/** Un évènement de l'API Google → la forme plate consommée par l'agenda. */
export function flattenEvent(ev: any, calendarId: string): FlatEvent {
  return {
    id: ev.id,
    calendarId,
    summary: ev.summary || "(Sans titre)",
    description: ev.description || "",
    location: ev.location || "",
    htmlLink: ev.htmlLink || "",
    colorId: ev.colorId || null,
    allDay: !!ev.start?.date,
    start: ev.start?.dateTime || ev.start?.date || null,
    end: ev.end?.dateTime || ev.end?.date || null,
    status: ev.status || "confirmed",
    recurringEventId: ev.recurringEventId || null,
    guests: (ev.attendees || []).map((a: any) => a.email).filter(Boolean),
    transparency: ev.transparency || "opaque",
    visibility: ev.visibility || "default",
    reminders: ev.reminders || null,
    hangoutLink: ev.hangoutLink || null,
    isTask: ev.extendedProperties?.private?.tr4deKind === "task",
    done: ev.extendedProperties?.private?.tr4deDone === "1",
  };
}

/**
 * Fusionne les réponses de plusieurs agendas en une seule liste triée.
 *
 * Le dédoublonnage garde la PREMIÈRE occurrence : les agendas arrivent dans
 * l'ordre de la sélection, principal en tête, donc une invitation présente à la
 * fois dans l'agenda personnel et dans un agenda partagé reste rattachée à
 * l'agenda où l'utilisateur peut la modifier.
 */
export function mergeCalendarEvents(
  results: { calendarId: string; items: any[] }[],
): FlatEvent[] {
  const seen = new Set<string>();
  const events: FlatEvent[] = [];
  for (const { calendarId, items } of results) {
    for (const ev of items || []) {
      if (!ev?.id || seen.has(ev.id)) continue;
      seen.add(ev.id);
      events.push(flattenEvent(ev, calendarId));
    }
  }
  events.sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
  return events;
}

/**
 * Agendas à interroger. Une sélection vide vaut « agenda principal seul » — le
 * comportement d'avant le multi-agendas, donc jamais de grille vide par défaut.
 */
export function resolveCalendarIds(calendarIds: unknown): string[] {
  if (!Array.isArray(calendarIds) || !calendarIds.length) return ["primary"];
  const ids = [...new Set(calendarIds.filter((id): id is string => typeof id === "string" && !!id))];
  return ids.length ? ids : ["primary"];
}
