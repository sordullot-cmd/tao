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

/* ── Échéances ─────────────────────────────────────────────────────────────
 *
 * Décider « ce rappel doit sonner maintenant » est séparé du hook pour être
 * testable sans agenda ni minuteur : c'est la partie qui se trompe en silence,
 * et son échec ne se voit qu'à la notification qui n'arrive pas.
 */

/**
 * Combien de temps un rappel manqué reste bon à dire.
 *
 * Un rappel n'est PAS un instant, c'est une fenêtre. L'app n'est pas forcément
 * en train de tourner à la seconde prévue — poste en veille, fenêtre masquée
 * dans la barre d'état, page rechargée — et se taire dans ce cas, c'est ce qui
 * faisait manquer les cours : le rappel de 9 h 50 était simplement abandonné
 * parce que la boucle ne le découvrait qu'à 9 h 53. Même fenêtre de rattrapage
 * que les programmes de la page Focus, pour la même raison.
 */
export const CATCH_UP_MS = 10 * 60 * 1000;

/**
 * Au-delà du début de l'évènement, un rappel n'a plus rien à annoncer — il
 * réveillerait pour un cours déjà commencé depuis une demi-heure.
 */
export const START_GRACE_MS = 5 * 60 * 1000;

export interface ReminderItem {
  /** Origine, pour remplacer d'un bloc ce qu'une source renvoie. */
  source: string;
  /** Identifiant stable de l'item (évènement, cours, tâche). */
  id: string;
  /** Empreinte de l'horaire : un évènement déplacé redevient à notifier. */
  startKey: string;
  startMs: number;
  title: string;
  place?: string;
  /** Rappels propres à l'item ; absents → réglage par défaut. */
  reminders?: unknown;
}

export interface DueReminder {
  /**
   * Rappels échus, à marquer consommés — y compris quand `announce` est faux.
   * Sans ça, un rappel trop vieux serait réexaminé à chaque tour et finirait
   * par sonner le jour où l'horloge repasse dans sa fenêtre.
   */
  keys: string[];
  /** Faux = échu mais périmé : on le consomme sans rien dire. */
  announce: boolean;
}

/** Clé de dédoublonnage d'un rappel : l'item, son horaire, et le délai. */
export function reminderKey(item: ReminderItem, min: number): string {
  return `${item.id}|${item.startKey}|${min}`;
}

/**
 * Les rappels d'un item arrivés à échéance à l'instant `nowMs`.
 *
 * Un item peut en avoir plusieurs en retard d'un coup (au réveil du poste,
 * « 1 jour avant » et « 10 min avant » sont échus tous les deux) : ils sont
 * tous consommés, mais une seule notification part — deux annonces pour le même
 * cours à une seconde d'intervalle sont du bruit, pas de l'information.
 */
export function dueReminders(
  item: ReminderItem,
  nowMs: number,
  defaultMins: unknown,
  isFired: (key: string) => boolean,
): DueReminder | null {
  const mins = effectiveReminderMinutes(item.reminders, defaultMins);
  if (!mins.length) return null;

  const keys: string[] = [];
  let announce = false;

  for (const min of mins) {
    const key = reminderKey(item, min);
    if (isFired(key)) continue;
    const dueMs = item.startMs - min * 60 * 1000;
    if (dueMs > nowMs) continue; // pas encore l'heure : il reste à venir
    keys.push(key);
    if (nowMs - dueMs <= CATCH_UP_MS && nowMs <= item.startMs + START_GRACE_MS) {
      announce = true;
    }
  }

  return keys.length ? { keys, announce } : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Corps de la notification. Le délai annoncé est celui qui RESTE, pas celui qui
 * était réglé : un rappel rattrapé à trois minutes du début ne doit pas
 * prétendre qu'il en reste dix.
 */
export function reminderWhen(startMs: number, nowMs: number): string {
  const d = new Date(startMs);
  const at = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const left = Math.round((startMs - nowMs) / 60000);
  if (left <= 0) return `C'est maintenant (${at})`;
  if (left < 60) return `Commence à ${at} (dans ${left} min)`;
  if (left < 1440) return `Commence à ${at} (dans ${Math.round(left / 60)} h)`;
  return `Commence le ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} à ${at}`;
}
