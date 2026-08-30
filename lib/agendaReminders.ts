/**
 * Rappels d'agenda — modèle partagé entre la page Agenda (saisie), la route
 * Google Calendar (envoi) et `useAgendaReminders` (notifications locales).
 *
 * Un item porte une LISTE de rappels, pas un seul : Google Calendar accepte
 * jusqu'à cinq `overrides` par évènement, et l'usage courant est d'en cumuler
 * (« 1 jour avant » + « 10 min avant »). La valeur `"default"` reprend les
 * rappels par défaut du calendrier ; elle est exclusive — la mélanger à des
 * minutes explicites donnerait un total imprévisible côté Google.
 */

export type ReminderValue = number | "default";

/** Limite dure de l'API Google Calendar (`reminders.overrides`). */
export const MAX_REMINDERS = 5;

/** Minutes retenues quand l'item suit « les rappels par défaut ». */
export const DEFAULT_REMINDER_MIN = 10;

/**
 * Ramène n'importe quelle entrée au modèle liste : minutes uniques, triées du
 * plus lointain au plus proche, plafonnées à `MAX_REMINDERS`.
 *
 * Accepte aussi l'ancien format scalaire (`10`, `"none"`, `"default"`) : les
 * évènements et les tâches enregistrés avant le passage au multiple le portent
 * encore, et rien ne les migre — ils sont normalisés à la lecture.
 */
export function normalizeReminders(input: unknown): ReminderValue[] {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];
  if (raw.some((v) => v === "default")) return ["default"];
  const seen = new Set<number>();
  for (const v of raw) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 0) continue; // "none", null, texte libre → ignorés
    seen.add(Math.round(n));
  }
  return [...seen].sort((a, b) => b - a).slice(0, MAX_REMINDERS);
}

/** Lit les rappels d'un évènement Google (`{ useDefault, overrides }`). */
export function remindersFromEvent(ev: {
  reminders?: { useDefault?: boolean; overrides?: Array<{ minutes?: number }> } | null;
} | null | undefined): ReminderValue[] {
  const r = ev?.reminders;
  if (!r) return [];
  if (Array.isArray(r.overrides) && r.overrides.length) {
    return normalizeReminders(r.overrides.map((o) => o?.minutes));
  }
  return r.useDefault ? ["default"] : [];
}

/** Traduit une liste de rappels vers le champ `reminders` de l'API Google. */
export function remindersToGoogle(list: ReminderValue[]): {
  useDefault: boolean;
  overrides?: Array<{ method: string; minutes: number }>;
} {
  const norm = normalizeReminders(list);
  if (norm[0] === "default") return { useDefault: true };
  return {
    useDefault: false,
    overrides: (norm as number[]).map((minutes) => ({ method: "popup", minutes })),
  };
}

/**
 * Réglage « rappels par défaut », partagé par `useCloudState` entre la page
 * Paramètres (saisie) et `useAgendaReminders` (programmation).
 *
 * Pourquoi il existe : la majorité des évènements n'a AUCUN rappel exploitable
 * localement. Google ne renvoie `reminders.overrides` que là où l'utilisateur en
 * a posé un lui-même ; sur un agenda en lecture seule (emploi du temps abonné,
 * agenda partagé) le champ vaut `{ useDefault: false }` — et un flux iCal lu
 * directement n'a pas de rappel du tout. Sans repli, ces évènements-là ne
 * notifiaient jamais rien.
 */
export const DEFAULT_REMINDERS_STORAGE_KEY = "tr4de_agenda_default_reminders";
export const DEFAULT_REMINDERS_CLOUD_KEY = "agenda_default_reminders";

/** Repli d'usine, appliqué tant que l'utilisateur n'a rien choisi. */
export const FACTORY_DEFAULT_REMINDERS: number[] = [DEFAULT_REMINDER_MIN];

/**
 * Normalise le réglage lui-même. `"default"` n'y a pas de sens — ce serait un
 * renvoi circulaire : le réglage EST la valeur par défaut. On retombe donc sur
 * le repli d'usine plutôt que de boucler.
 */
export function normalizeDefaultReminders(input: unknown): number[] {
  const norm = normalizeReminders(input);
  if (norm[0] === "default") return [...FACTORY_DEFAULT_REMINDERS];
  return norm as number[];
}

/**
 * Minutes à programmer pour un item, réglage utilisateur compris.
 *
 * Un item sans rappel propre hérite du réglage, au même titre qu'un item marqué
 * « rappels par défaut ». Conséquence assumée : un évènement Google dont
 * l'utilisateur a explicitement RETIRÉ tout rappel est indiscernable d'un
 * évènement en lecture seule, et notifiera quand même. L'inverse — se taire
 * dans le doute — est ce qui faisait manquer les cours.
 *
 * Un réglage vide (« aucun ») coupe ce repli sans toucher aux rappels propres.
 */
export function effectiveReminderMinutes(input: unknown, fallback: unknown): number[] {
  const own = normalizeReminders(input);
  if (own.length && own[0] !== "default") return own as number[];
  return normalizeDefaultReminders(fallback);
}

/** Minutes réellement utilisables pour programmer une notification locale. */
export function reminderMinutesList(input: unknown): number[] {
  const norm = normalizeReminders(input);
  if (norm[0] === "default") return [DEFAULT_REMINDER_MIN];
  return norm as number[];
}

/** « 10 minutes avant », « 1 jour avant »… */
export function reminderLabel(v: ReminderValue): string {
  if (v === "default") return "Notifications par défaut";
  if (v === 0) return "À l'heure de l'évènement";
  if (v < 60) return `${v} minute${v > 1 ? "s" : ""} avant`;
  if (v < 1440) {
    const h = v / 60;
    return Number.isInteger(h) ? `${h} heure${h > 1 ? "s" : ""} avant` : `${v} minutes avant`;
  }
  const d = v / 1440;
  return Number.isInteger(d) ? `${d} jour${d > 1 ? "s" : ""} avant` : `${Math.round(v / 60)} heures avant`;
}

/** Ajoute un rappel sans dépasser la limite ni créer de doublon. */
export function addReminder(list: ReminderValue[], v: ReminderValue): ReminderValue[] {
  if (v === "default") return ["default"];
  const base = normalizeReminders(list).filter((x) => x !== "default") as number[];
  if (base.length >= MAX_REMINDERS && !base.includes(v as number)) return base;
  return normalizeReminders([...base, v]);
}

/** Retire un rappel de la liste. */
export function removeReminder(list: ReminderValue[], v: ReminderValue): ReminderValue[] {
  return normalizeReminders(normalizeReminders(list).filter((x) => String(x) !== String(v)));
}
