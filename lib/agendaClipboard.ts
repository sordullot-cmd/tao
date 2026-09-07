/**
 * Presse-papiers de l'agenda — copier un évènement, le coller ailleurs.
 *
 * Pourquoi un module à part plutôt que deux lignes dans la page : ce qui est
 * délicat ici n'est pas le stockage (un objet en mémoire), c'est le RECALAGE.
 * Coller, ce n'est pas recréer l'évènement tel quel — c'est garder sa durée et
 * son contenu, et changer sa place. Trois questions s'y cachent :
 *
 *   - une journée entière garde son NOMBRE DE JOURS, pas ses dates ;
 *   - un évènement horaire garde sa DURÉE, et son heure ne survit que si on ne
 *     lui en donne pas d'autre (Ctrl+V loin de la grille) ;
 *   - un bloc collé trop bas déborderait sur le lendemain, ce que le
 *     formulaire de la page ne sait même pas exprimer (il n'a qu'une date).
 *
 * Le presse-papiers ne retient PAS d'identité : ni `id`, ni `calendarId`, ni
 * série récurrente. Un collage crée un évènement neuf sur l'agenda principal.
 * Copier une occurrence d'une série copie donc CETTE occurrence, pas la règle —
 * c'est la seule lecture qui ne réserve pas de mauvaise surprise, et cela rend
 * du même geste copiable un cours de l'emploi du temps de la fac, qui est en
 * lecture seule et n'aurait jamais pu être dupliqué chez lui.
 *
 * Module PUR : aucune dépendance à React ni à l'API Google, pour que la page et
 * ses tests partagent exactement les mêmes règles de recalage.
 */

/** Pas de la grille : coller se cale dessus, comme le glisser-déposer. */
export const PASTE_SNAP_MIN = 15;
/** Durée de repli quand le formulaire copié n'en dit pas de valable. */
export const FALLBACK_DURATION_MIN = 60;
const DAY_MIN = 24 * 60;

/** Le formulaire de la page Agenda, dont ce module ne lit qu'une poignée de
 *  champs et recopie tout le reste sans le regarder. */
export type AgendaForm = Record<string, unknown>;

export interface AgendaClip {
  /** Titre, pour l'annoncer dans le menu et la pastille du presse-papiers. */
  summary: string;
  allDay: boolean;
  /** Début d'origine, en minutes depuis minuit. Sert de repli quand le collage
   *  ne désigne pas d'heure. `0` pour une journée entière. */
  startMin: number;
  /** Durée, en minutes. Toujours > 0 pour un évènement horaire. */
  durationMin: number;
  /** Jours couverts par une journée entière. Toujours ≥ 1. */
  days: number;
  /** Tout le reste du formulaire (lieu, description, couleur, invités…), tel
   *  quel : ce module n'a pas à connaître la liste des champs de la page. */
  form: AgendaForm;
}

/** `HH:MM` → minutes depuis minuit, `null` si ce n'en est pas une. */
function toMin(value: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function toTime(minutes: number): string {
  const v = Math.max(0, Math.min(DAY_MIN - 1, Math.round(minutes)));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` décalé de `n` jours. Passe par un `Date` local, comme la page :
 *  une arithmétique sur la chaîne casserait au changement de mois. */
export function shiftDayKey(dayKey: string, n: number): string {
  const d = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Jours ENTIERS entre deux `YYYY-MM-DD` (négatif si la seconde précède). */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Champs qui désignent l'évènement d'origine, et qui ne doivent JAMAIS suivre
 * une copie : les garder ferait d'un collage une modification de l'original —
 * `saveModal` enregistre sur `id` quand il y en a un.
 *
 * La récurrence part avec eux : une règle appartient à sa série. « Tous les
 * lundis » collé sur un jeudi voudrait dire autre chose que ce qui était écrit.
 */
const IDENTITY_FIELDS = [
  "id", "calendarId", "htmlLink", "masterId", "masterStart", "recur",
  "recurringEventId", "done", "pendingTasks",
] as const;

/**
 * Fige un formulaire en presse-papiers, ou `null` si l'évènement n'est pas
 * copiable.
 *
 * Refusé : les blocs ancrés (leur heure est un calcul, pas une donnée — la
 * coller quelque part n'aurait pas de sens) et les tâches Google (ce ne sont
 * pas des évènements ; les recréer demanderait l'API Tasks, et un collage qui
 * change discrètement de nature serait un piège).
 */
export function clipFromForm(form: AgendaForm | null | undefined): AgendaClip | null {
  if (!form || typeof form !== "object") return null;
  if (form.anchored === true || form.kind === "task") return null;

  const rest: AgendaForm = { ...form };
  for (const key of IDENTITY_FIELDS) delete rest[key];
  /* Un collage est un évènement neuf : il ne peut pas « avoir eu » un Meet, il
     en demande un ou non. Sans cela `payloadFromForm` croit devoir conserver
     une visioconférence qui n'existe pas encore. */
  rest.hadMeet = false;
  rest.kind = "event";

  const summary = String(form.summary ?? "").trim();
  const allDay = form.allDay === true;

  if (allDay) {
    const from = String(form.date ?? "");
    const to = String(form.endDate ?? from);
    return { summary, allDay: true, startMin: 0, durationMin: 0, days: Math.max(1, daysBetween(from, to) + 1), form: rest };
  }

  const start = toMin(form.startTime);
  const end = toMin(form.endTime);
  /* Une durée nulle ou négative n'est pas réparée ici en silence : c'est déjà
     ce que fait `payloadFromForm` pour un formulaire mal rempli, et les deux
     doivent tomber sur la même heure de fin. */
  const duration = start !== null && end !== null && end > start ? end - start : FALLBACK_DURATION_MIN;
  return { summary, allDay: false, startMin: start ?? 0, durationMin: duration, days: 1, form: rest };
}

/**
 * Où le collage atterrit : le formulaire à enregistrer, daté sur `dayKey`.
 *
 * `atMinutes` est l'endroit visé dans la journée (clic droit dans la grille) ;
 * `null` garde l'heure d'origine — c'est le cas du raccourci frappé hors de la
 * grille, où aucun point ne désigne d'heure.
 *
 * Un bloc qui déborderait de la journée est REMONTÉ jusqu'à finir avec elle :
 * la durée est ce qu'on a copié, l'heure n'est qu'un endroit où poser, et le
 * formulaire de la page ne porte qu'une date — un évènement à cheval sur deux
 * jours n'y est pas exprimable. Il y perd la dernière minute (voir plus bas :
 * minuit ne s'écrit pas dans un champ d'heure), ce qui vaut mieux qu'un début
 * calé sur 21:59 pour sauver une minute que personne ne regarde.
 */
export function pasteFormInto(
  clip: AgendaClip | null | undefined,
  dayKey: string,
  atMinutes: number | null = null,
): AgendaForm | null {
  if (!clip || !dayKey) return null;
  if (clip.allDay) {
    return { ...clip.form, allDay: true, date: dayKey, endDate: shiftDayKey(dayKey, clip.days - 1) };
  }
  const duration = Math.min(DAY_MIN, Math.max(1, clip.durationMin));
  const wanted = atMinutes === null
    ? clip.startMin
    : Math.round(atMinutes / PASTE_SNAP_MIN) * PASTE_SNAP_MIN;
  const start = Math.max(0, Math.min(wanted, DAY_MIN - duration));
  return {
    ...clip.form,
    allDay: false,
    date: dayKey,
    endDate: dayKey,
    startTime: toTime(start),
    /* Une fin à 24:00 n'existe pas dans un champ d'heure : minuit appartient au
       lendemain, et `toISO` en ferait une fin AVANT le début. 23:59 est la
       dernière minute que la journée sache dire. */
    endTime: start + duration >= DAY_MIN ? "23:59" : toTime(start + duration),
  };
}

/** « Cours de maths » — ce que le menu et la pastille annoncent. Un évènement
 *  sans titre en a un quand même : sinon le menu proposerait de coller «  ». */
export function clipLabel(clip: AgendaClip | null | undefined, fallback = "Sans titre"): string {
  return clip?.summary?.trim() || fallback;
}
