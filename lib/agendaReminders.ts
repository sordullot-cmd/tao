/**
 * Rappels d'agenda — modèle partagé entre la page Calendrier (saisie), la route
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
