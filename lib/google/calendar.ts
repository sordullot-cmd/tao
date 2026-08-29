/**
 * Helpers serveur pour l'intégration Google Calendar.
 *
 * - Les identifiants OAuth viennent des variables d'env `GOOGLE_CLIENT_ID`
 *   (ou `NEXT_PUBLIC_GOOGLE_CLIENT_ID` en repli) et `GOOGLE_CLIENT_SECRET`.
 * - L'URI de redirection est dérivée dynamiquement de l'origine de la requête
 *   pour fonctionner aussi bien en local que sur Vercel (sinon `GOOGLE_REDIRECT_URI`).
 */
import { google } from "googleapis";

const PLACEHOLDERS = new Set([
  "",
  "your-google-client-id",
  "your-google-client-secret",
]);

export function getClientId(): string {
  return (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    ""
  );
}

export function getClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || "";
}

/** Vrai si des identifiants OAuth réels (non-placeholder) sont configurés. */
export function isConfigured(): boolean {
  const id = getClientId();
  const secret = getClientSecret();
  return !PLACEHOLDERS.has(id) && !PLACEHOLDERS.has(secret);
}

/** URI de redirection OAuth, dérivée de l'origine de la requête. */
export function getRedirectUri(req: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const origin = new URL(req.url).origin;
  return `${origin}/api/google-calendar/callback`;
}

/** Client OAuth2 prêt à l'emploi, ou `null` si non configuré. */
export function getOAuthClient(req: Request) {
  if (!isConfigured()) return null;
  return new google.auth.OAuth2(
    getClientId(),
    getClientSecret(),
    getRedirectUri(req),
  );
}

export const CALENDAR_SCOPES = [
  // Lecture + écriture des évènements (créer / modifier / supprimer).
  "https://www.googleapis.com/auth/calendar.events",
  // Énumérer les agendas de l'utilisateur (`calendarList.list`) : `calendar.events`
  // ne l'autorise pas. Sans ce scope, les agendas abonnés — dont l'emploi du temps
  // universitaire importé par URL iCal — restent invisibles, seul « primary » répond.
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  // Vraies tâches Google (l'heure précise est conservée côté tr4de).
  "https://www.googleapis.com/auth/tasks",
  "openid",
  "email",
  "profile",
];
