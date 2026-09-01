"use client";

import React from "react";
import {
  Calendar as CalendarIcon,
  LogOut, AlertTriangle, Plug, Trash2, X as IconX, ExternalLink,
  Clock, MapPin, AlignLeft, Bell, ChevronDown, ChevronLeft, ChevronRight, Target, HelpCircle, Repeat,
  Plus, CheckSquare, Square, Check, Sparkles, Sunrise, EyeOff, ListChecks,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { useGoogleCalendar } from "@/lib/hooks/useGoogleCalendar";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { DateField, TimeField } from "./AgendaDateFields";
import MiniCalendar from "@/components/ui/MiniCalendar";
import { FIELD_BG, PeriodPills } from "@/components/ui/da";
import Popover from "@/components/ui/Popover";
import {
  RPG_STORAGE_KEY, RPG_CLOUD_KEY, DEFAULT_CATEGORIES, CatIcon,
  TASK_RPG_STORAGE_KEY, TASK_RPG_CLOUD_KEY,
  EVENT_RPG_STORAGE_KEY, EVENT_RPG_CLOUD_KEY,
  TASK_TIMES_STORAGE_KEY, TASK_TIMES_CLOUD_KEY,
} from "@/lib/lifeRpgCategories";
import { GCAL_COLORS, DEFAULT_EVENT_COLOR, eventPaint, nearestGcalColorId, TASK_DEFAULT_PAINT } from "@/lib/gcalColors";
import {
  useIcsFeeds, useIcsEvents, useIcsEventColors, useIcsKindColors, useIcsHiddenEvents,
  isFeedCalendarId, courseKey,
} from "@/lib/hooks/useIcsFeeds";
import { courseKind, kindColorId, KIND_LABELS } from "@/lib/icsCategories";
import { useEscapeDismiss } from "@/lib/hooks/useEscapeDismiss";
import { useUndo } from "@/lib/contexts/UndoContext";
import {
  MAX_REMINDERS, normalizeReminders, remindersFromEvent,
  reminderLabel, addReminder, removeReminder,
} from "@/lib/agendaReminders";
import {
  EVENT_CHECKLISTS_KEY, EVENT_CHECKLISTS_CLOUD_KEY,
  addChecklistItem, adoptChecklist, checklistFor, checklistProgress, dropChecklist,
  normalizeChecklistItems, normalizeChecklists, newChecklistItem,
  removeChecklistItem, toggleChecklistItem,
} from "@/lib/agendaChecklists";
import {
  ALL_DAYS, ANCHORED_STORAGE_KEY, ANCHORED_CLOUD_KEY,
  DEFAULT_ANCHOR_MINUTES, DEFAULT_ANCHOR_TITLE, DEFAULT_SLEEP_MINUTES, DEFAULT_SLEEP_TITLE,
  anchorDurationLabel, anchoredOccurrencesForRange, defaultBefore, minutesBetween, newAnchorId,
  normalizeAnchoredBlocks, removeAnchoredBlock, upsertAnchoredBlock,
} from "@/lib/agendaAnchoredBlocks";
import { FIELD as DA_FIELD, CheckBox, DurationField } from "@/components/ui/form";
import { HAIRLINE as DA_HAIRLINE } from "@/lib/ui/tokens";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";

/* ─────────────── Helpers date ─────────────── */
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const WEEKDAYS_FULL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const WEEKDAYS_MIN = ["L", "M", "M", "J", "V", "S", "D"];
// Style des libellés de jour repris de la page Calendrier : léger, discret,
// sans majuscules ni interlettrage marqué (uniquement le visuel, pas le format).
const dayLabelStyle = { fontSize: 10, fontWeight: 500, textAlign: "center", color: T.textMut };
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MONTHS_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a, b) => dateKey(a) === dateKey(b);
const weekdayIdx = (d) => (d.getDay() + 6) % 7; // 0 = lundi

function startOfWeekMonday(d) {
  const x = startOfDay(d);
  return addDays(x, -weekdayIdx(x));
}

function eventDayKey(ev) {
  if (!ev.start) return null;
  if (ev.allDay) return ev.start.slice(0, 10);
  const d = new Date(ev.start);
  return isNaN(d.getTime()) ? null : dateKey(d);
}

/** Échéance relative en français : "aujourd'hui", "il y a 3 jours", "il y a 1 semaine"… */
function relativeDue(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  const now = startOfDay(new Date());
  const days = Math.round((now - startOfDay(d)) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  if (days < 14) return "il y a 1 semaine";
  if (days < 30) return `il y a ${Math.floor(days / 7)} semaines`;
  if (days < 60) return "il y a 1 mois";
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  const y = Math.floor(days / 365);
  return `il y a ${y} an${y > 1 ? "s" : ""}`;
}

function eventTimeLabel(ev) {
  if (ev.allDay) return "Journée";
  const d = new Date(ev.start);
  if (isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Palette des évènements : voir lib/gcalColors. Les trois couleurs d'un bloc
// (fond, trait, texte) y sont PUBLIÉES, une par colorId — elles étaient dérivées
// ici même par éclaircissement/assombrissement, ce que la charte interdit.

// `calendarColor` sert de repli : les évènements d'un agenda abonné (emploi du
// temps universitaire) n'ont pas de `colorId` propre et seraient sinon tous de
// la couleur par défaut, indiscernables des évènements personnels. On rapproche
// donc sa teinte de l'emplacement le plus proche, plutôt que de la poser telle
// quelle : hors charte, et sans encre lisible qui l'accompagne.
/* Une tâche à laquelle on n'a pas choisi de couleur reste neutre : la teinter
   par défaut lui donnerait un classement qu'on n'a pas demandé. Dès qu'une
   couleur est posée, elle prime — y compris sur une tâche. */
const isUncoloredTask = (ev) => (!!ev.isTask || !!ev.isGTask) && !ev.colorId && !ev.calendarColor;
const eventPaintOf = (ev) =>
  isUncoloredTask(ev)
    ? TASK_DEFAULT_PAINT
    : eventPaint(ev.colorId ?? (ev.calendarColor ? nearestGcalColorId(ev.calendarColor) : null));

// Teinte de fond d'un bloc, selon ce qu'il est : une tâche se tient en retrait
// derrière les évènements, qui sont des engagements pris à une heure.
const eventColor = (ev) => (ev.isTask ? eventPaintOf(ev).soft : eventPaintOf(ev).bg);
const eventTextColor = (ev) => eventPaintOf(ev).ink;

/* ─────────────── Helpers formulaire évènement ─────────────── */
const localTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toISO = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`).toISOString();
function addDayStr(dateStr, n) { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() + n); return dateKey(d); }

/** "Dimanche, 14 juin" à partir d'une date "YYYY-MM-DD". */
function formatDateLong(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return `${WEEKDAYS_FULL[weekdayIdx(d)]}, ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`;
}

/** Résumé lisible de la plage (façon Google Agenda). */
function summarizeWhen(form) {
  if (form.allDay) {
    const base = formatDateLong(form.date);
    return form.endDate && form.endDate !== form.date
      ? `${base} – ${formatDateLong(form.endDate)}`
      : `${base} · Toute la journée`;
  }
  return `${formatDateLong(form.date)}  ${form.startTime} – ${form.endTime}`;
}

/** Form vierge pour la création. */
function blankForm(day, startTime = "09:00", endTime = "10:00") {
  const dk = typeof day === "string" ? day : dateKey(day);
  return {
    kind: "event", done: false,
    id: null, calendarId: null, htmlLink: null, summary: "", allDay: false, date: dk, endDate: dk, startTime, endTime,
    dueDate: "", // date limite (tâche) : facultative, aucune par défaut
    recur: { preset: "once" }, // récurrence : une seule fois par défaut
    masterId: null, masterStart: null, // série (event récurrent) : renseignés à l'édition
    location: "", description: "", guests: "", addMeet: false, hadMeet: false,
    colorId: null, transparency: "opaque", visibility: "default", reminders: [10],
    rpgCategories: [], // cartes Vie RPG liées (tâche) : XP à la complétion
    pendingTasks: [], // tâches Google à créer à l'enregistrement (nouvel évènement)
    // Bloc ancré (cf. lib/agendaAnchoredBlocks) : cochée, la case fait de la
    // saisie un bloc local répété chaque jour au lieu d'un évènement Google.
    // La durée est reprise de la plage dessinée au moment où on coche.
    anchored: false, anchorId: null, anchorMinutes: DEFAULT_ANCHOR_MINUTES, anchorMode: "morning", anchorBefore: "", anchorGap: 0,
    anchorDays: ALL_DAYS, anchorMaxStart: "", anchorCountTasks: true, anchorEnabled: true,
  };
}

/** Form pré-rempli depuis un évènement existant (ou une tâche-évènement). */
function formFromEvent(ev) {
  const summary = ev.summary === "(Sans titre)" ? "" : ev.summary;
  const common = {
    kind: ev.isTask ? "task" : "event", done: !!ev.done,
    id: ev.id, calendarId: ev.calendarId || null, htmlLink: ev.htmlLink,
    location: ev.location || "", description: ev.description || "", colorId: ev.colorId || null,
    /* Le type de séance et la matière, tels que l'export les nomme : ce sont les
       deux portées d'une couleur, et ni l'un ni l'autre ne se relit dans le
       formulaire une fois la fenêtre ouverte — l'intitulé affiché les mélange. */
    category: ev.category || "",
    course: ev.course || "",
    guests: (ev.guests || []).join(", "),
    addMeet: !!ev.hangoutLink, hadMeet: !!ev.hangoutLink,
    transparency: ev.transparency || "opaque", visibility: ev.visibility || "default",
    reminders: remindersFromEvent(ev),
    recur: { preset: "once" }, masterId: null, masterStart: null,
  };
  if (ev.allDay) {
    const startD = ev.start.slice(0, 10);
    let endIncl = ev.end ? addDayStr(ev.end.slice(0, 10), -1) : startD; // end exclusif → inclusif
    if (endIncl < startD) endIncl = startD;
    return { ...common, summary, allDay: true, date: startD, endDate: endIncl, startTime: "09:00", endTime: "10:00" };
  }
  const s = new Date(ev.start);
  const e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 3600000);
  const dk = dateKey(s);
  return { ...common, summary, allDay: false, date: dk, endDate: dk, startTime: hhmm(s), endTime: hhmm(e) };
}

/** Construit le payload API à partir du form. */
function payloadFromForm(form) {
  const tz = localTZ();
  const guests = String(form.guests || "").split(/[,;\s]+/).map((g) => g.trim()).filter((g) => /.+@.+\..+/.test(g));
  const extra = {
    colorId: form.colorId || null,
    guests,
    addMeet: !!form.addMeet,
    hadMeet: !!form.hadMeet,
    transparency: form.transparency || "opaque",
    visibility: form.visibility || "default",
    reminders: normalizeReminders(form.reminders),
    isTask: form.kind === "task",
    done: !!form.done,
  };
  if (form.allDay) {
    return {
      summary: form.summary, location: form.location, description: form.description,
      allDay: true, start: form.date, end: addDayStr(form.endDate || form.date, 1), timeZone: tz,
      ...extra,
    };
  }
  let start = toISO(form.date, form.startTime);
  let end = toISO(form.date, form.endTime);
  if (new Date(end) <= new Date(start)) end = new Date(new Date(start).getTime() + 3600000).toISOString();
  return { summary: form.summary, location: form.location, description: form.description, allDay: false, start, end, timeZone: tz, ...extra };
}

/* ─────────────── Tâches Google : heure conservée côté tr4de ───────────────
   Persistées via useCloudState (table user_productivity, clé "task_times")
   pour une synchro en ligne ; le storageKey localStorage sert de cache.
   Clés partagées avec la page Vie RPG (cf. lib/lifeRpgCategories). */
const TASK_TIMES_KEY = TASK_TIMES_STORAGE_KEY;

/* ─────────────── Tâches Google liées à un évènement ───────────────
   Les tâches sont de VRAIES Google Tasks. On mémorise seulement l'association
   évènement → ids de tâches, indexée par id d'évènement. Persistée en ligne
   via useCloudState (clé "event_task_links"). */
const EVENT_TASK_LINKS_KEY = "tr4de_event_task_links";

/** Convertit une Google Task (+ heure locale) en item affiché comme un évènement. */
function taskToItem(tk, times) {
  const t = times[tk.id];
  // Date limite (échéance) : champ `due` de Google Tasks, facultatif.
  const dueDate = tk.due ? tk.due.slice(0, 10) : null;
  // Jour de planification dans l'agenda : conservé côté tr4de. Repli sur la date
  // limite pour les tâches créées hors tr4de (sans jour planifié enregistré).
  const day = (t && t.day) || dueDate;
  if (!day) return null; // ni jour planifié ni échéance → pas placée sur le calendrier
  const hasTime = !!(t && t.startTime);
  const allDay = !hasTime;
  let start, end;
  if (hasTime) {
    start = new Date(`${day}T${t.startTime}:00`).toISOString();
    end = new Date(`${day}T${t.endTime}:00`).toISOString();
  } else { start = day; end = day; }
  return {
    id: tk.id, summary: tk.title || "(Sans titre)", description: tk.notes || "",
    isTask: true, isGTask: true, done: !!tk.completed,
    allDay, start, end, dueDate,
    colorId: t?.colorId || null, location: "", htmlLink: null, guests: [], hangoutLink: null,
    transparency: "opaque", visibility: "default", reminders: null,
  };
}

/** Form pré-rempli depuis un item de tâche Google. */
function formFromTaskItem(item, times) {
  const day = item.allDay ? String(item.start || "").slice(0, 10) : dateKey(new Date(item.start));
  const t = times[item.id];
  return {
    kind: "task", done: !!item.done, id: item.id, htmlLink: null,
    summary: item.summary === "(Sans titre)" ? "" : item.summary,
    allDay: !!item.allDay, date: day, endDate: day,
    dueDate: item.dueDate || "", // date limite (facultative)
    startTime: t?.startTime || "09:00", endTime: t?.endTime || "10:00",
    location: "", description: item.description || "",
    guests: "", addMeet: false, hadMeet: false, colorId: item.colorId || null,
    transparency: "opaque", visibility: "default",
    // Google Tasks n'a pas de rappels : ils vivent avec l'heure, côté tr4de.
    reminders: normalizeReminders(t?.reminders),
    rpgCategories: [], // renseigné par openEdit depuis le store `taskRpg`
  };
}

/** Payload Tasks API depuis le form. */
function taskPayloadFromForm(form) {
  return {
    title: form.summary || "(Sans titre)",
    notes: form.description || "",
    // Date limite (facultative) → champ `due` de Google Tasks. Vide = aucune échéance
    // (envoyé à null pour effacer une échéance existante).
    due: form.dueDate ? `${form.dueDate}T00:00:00.000Z` : null,
  };
}

const VIEWS = [
  { id: "day", label: "Jour" },
  { id: "week", label: "Semaine" },
  { id: "month", label: "Mois" },
  { id: "year", label: "Année" },
];

/* Choix rapides de rappel, en minutes. « Aucune » et « par défaut » n'en font
   pas partie : ce sont deux réglages exclusifs qui remplacent toute la liste,
   pas des cases à cocher qui s'ajouteraient aux minutes déjà retenues. */
const REMINDER_PRESETS = [0, 5, 10, 30, 60, 1440];

/* Unités de l'ajout personnalisé → minutes. */
const REMINDER_UNITS = [
  { id: "min", label: "minutes", mul: 1 },
  { id: "h", label: "heures", mul: 60 },
  { id: "d", label: "jours", mul: 1440 },
];

const HOUR_H = 68; // hauteur d'une heure (px) dans le time-grid
/* Écart vertical entre un bloc et celui qui vient REMPLIR sa colonne juste
   au-dessus ou juste en dessous. Il vaut les 4 px qui séparent déjà deux blocs
   côte à côte (2 px de chaque côté) : là où l'un s'élargit sur la place de
   l'autre, les deux se touchent par un bord neuf, qui doit se lire comme les
   bords latéraux. Deux blocs simplement consécutifs, eux, restent jointifs —
   l'heure qui les sépare se lit sur la grille. */
const FILL_GAP = 4;
// La grille s'arrête à la même ligne que la barre latérale, qui se termine à
// 12 px du bas (`margin: 12px 0 12px 12px` dans `components/ui/Sidebar.tsx`).
// S'aligner sur elle plutôt que sur une respiration inventée : deux bords à des
// hauteurs différentes se voient immédiatement.
const SIDEBAR_BOTTOM_GAP = 12;
/* Deux mesures de la coquille (`components/DashboardNew.jsx`) qu'il faut
   connaître pour retomber sur la ligne de la barre latérale :
   `--page-pad-bottom` du conteneur qui défile, et le padding bas du cadre qui
   le contient. */
const SHELL_PAD_BOTTOM = 24;
const SHELL_OUTER_GAP = 8;
/* De combien le corps remonte la fin du flux. Le contenu s'arrêterait sinon à
   `24 + 8 = 32 px` du bas ; on veut les 12 px de la barre, il faut donc rendre
   20 px. Ce tirage vaut pour les DEUX cas, et c'est là qu'était l'erreur d'avant :
   reprendre les 24 px entiers alignait bien la grille, mais supprimait toute
   respiration sous une vue plus haute que l'écran — en bas de défilement, le
   contenu venait buter contre le bord. */
const BODY_PULL = SHELL_PAD_BOTTOM - (SIDEBAR_BOTTOM_GAP - SHELL_OUTER_GAP);

/* ─────────────── Plage de dates par mode ─────────────── */
function computeRange(view, cursor) {
  if (view === "day") {
    const s = startOfDay(cursor);
    return { start: s, end: addDays(s, 1) };
  }
  if (view === "week") {
    const s = startOfWeekMonday(cursor);
    return { start: s, end: addDays(s, 7) };
  }
  if (view === "year") {
    return { start: new Date(cursor.getFullYear(), 0, 1), end: new Date(cursor.getFullYear() + 1, 0, 1) };
  }
  // month
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeekMonday(monthStart);
  return { start: gridStart, end: addDays(gridStart, 42) };
}

function shiftCursor(view, cursor, dir) {
  if (view === "day") return addDays(cursor, dir);
  if (view === "week") return addDays(cursor, dir * 7);
  if (view === "year") return new Date(cursor.getFullYear() + dir, cursor.getMonth(), cursor.getDate());
  return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
}

function titleFor(view, cursor) {
  if (view === "day") {
    return `${WEEKDAYS_FULL[weekdayIdx(cursor)]} ${cursor.getDate()} ${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }
  if (view === "week") {
    const s = startOfWeekMonday(cursor);
    const e = addDays(s, 6);
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
      return `${s.getDate()} – ${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]} ${e.getFullYear()}`;
  }
  if (view === "year") return String(cursor.getFullYear());
  return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
}

/** Libellé mois + année de la période affichée — TOUJOURS un seul mois. */
function monthYearLabel(view, cursor) {
  if (view === "year") return String(cursor.getFullYear());
  /* Une semaine à cheval sur deux mois portait les deux noms (« Août –
     Septembre 2026 »). C'était exact, mais ça doublait la largeur du titre pour
     une information que la grille donne déjà : les numéros de jour y repartent
     à 1 sous les yeux. C'est donc le lundi affiché qui nomme la semaine, et lui
     seul. */
  const start = view === "week" ? startOfWeekMonday(cursor) : cursor;
  return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
}

/* ─────────────── Récurrence (RRULE Google Agenda) ─────────────── */
// Code RRULE du jour de la semaine, indexé sur weekdayIdx (0 = lundi).
const RRULE_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const WEEKDAY_OPTS = [
  { code: "MO", label: "L" }, { code: "TU", label: "M" }, { code: "WE", label: "M" },
  { code: "TH", label: "J" }, { code: "FR", label: "V" }, { code: "SA", label: "S" }, { code: "SU", label: "D" },
];
const RECUR_PRESETS = [
  { id: "once", label: "Une seule fois" },
  { id: "daily", label: "Tous les jours" },
  { id: "everyOther", label: "Un jour sur deux" },
  { id: "weekdays", label: "Tous les jours de la semaine" },
  { id: "weekly", label: "Toutes les semaines" },
  { id: "monthly", label: "Tous les mois" },
  { id: "yearly", label: "Tous les ans" },
  { id: "custom", label: "Personnaliser…" },
];
const FREQ_UNIT = { DAILY: "jour", WEEKLY: "semaine", MONTHLY: "mois", YEARLY: "an" };

/** Construit la liste `recurrence` (RRULE) à envoyer à Google, depuis le form. */
function buildRecurrence(form) {
  const r = form.recur || { preset: "once" };
  const dCode = (() => {
    const d = new Date(`${form.date}T00:00:00`);
    return isNaN(d.getTime()) ? "MO" : RRULE_WEEKDAYS[weekdayIdx(d)];
  })();
  switch (r.preset) {
    case "once": return [];
    case "daily": return ["RRULE:FREQ=DAILY"];
    case "everyOther": return ["RRULE:FREQ=DAILY;INTERVAL=2"];
    case "weekdays": return ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"];
    case "weekly": return [`RRULE:FREQ=WEEKLY;BYDAY=${dCode}`];
    case "monthly": return ["RRULE:FREQ=MONTHLY"];
    case "yearly": return ["RRULE:FREQ=YEARLY"];
    case "custom": {
      const freq = r.freq || "WEEKLY";
      const interval = Math.max(1, parseInt(r.interval, 10) || 1);
      const parts = [`FREQ=${freq}`];
      if (interval > 1) parts.push(`INTERVAL=${interval}`);
      if (freq === "WEEKLY") {
        const days = (r.byday && r.byday.length) ? r.byday : [dCode];
        parts.push(`BYDAY=${days.join(",")}`);
      }
      if (r.end === "count" && r.count) parts.push(`COUNT=${Math.max(1, parseInt(r.count, 10) || 1)}`);
      else if (r.end === "until" && r.until) parts.push(`UNTIL=${r.until.replace(/-/g, "")}T235959Z`);
      return [`RRULE:${parts.join(";")}`];
    }
    default: return [];
  }
}

/** Reconstruit la config du form (preset/custom) depuis une liste `recurrence`. */
function parseRecurrence(recurrence) {
  const rule = (recurrence || []).find((x) => typeof x === "string" && x.startsWith("RRULE:"));
  if (!rule) return { preset: "once" };
  const map = {};
  rule.slice(6).split(";").forEach((kv) => { const [k, v] = kv.split("="); if (k) map[k] = v; });
  const freq = map.FREQ;
  const interval = parseInt(map.INTERVAL, 10) || 1;
  const byday = map.BYDAY ? map.BYDAY.split(",") : [];
  const finite = !!(map.COUNT || map.UNTIL);
  if (!finite) {
    if (freq === "DAILY" && interval === 1) return { preset: "daily" };
    if (freq === "DAILY" && interval === 2) return { preset: "everyOther" };
    if (freq === "WEEKLY" && interval === 1 && map.BYDAY === "MO,TU,WE,TH,FR") return { preset: "weekdays" };
    if (freq === "WEEKLY" && interval === 1 && byday.length <= 1) return { preset: "weekly" };
    if (freq === "MONTHLY" && interval === 1) return { preset: "monthly" };
    if (freq === "YEARLY" && interval === 1) return { preset: "yearly" };
  }
  let end = "never", count = 10, until = "";
  if (map.COUNT) { end = "count"; count = parseInt(map.COUNT, 10) || 1; }
  else if (map.UNTIL) {
    end = "until";
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(map.UNTIL);
    if (m) until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  return { preset: "custom", freq: freq || "WEEKLY", interval, byday, end, count, until };
}

/** Libellé court de la récurrence (pour le sous-titre et le bouton). */
function recurrenceLabel(recur) {
  const r = recur || { preset: "once" };
  if (r.preset !== "custom") return (RECUR_PRESETS.find((p) => p.id === r.preset) || RECUR_PRESETS[0]).label;
  const unit = FREQ_UNIT[r.freq] || "semaine";
  const n = Math.max(1, parseInt(r.interval, 10) || 1);
  const plural = n > 1 && unit !== "mois" ? "s" : "";
  return n === 1 ? `Chaque ${unit}` : `Tous les ${n} ${unit}${plural}`;
}

/* ─── Libellés des blocs ancrés (mêmes règles d'écriture que `recurrenceLabel` :
   une pastille dit son réglage en toutes lettres, jamais en codes) ─── */

/** « Tous les jours », « En semaine », « Lun · Jeu ». */
function anchorDaysLabel(days) {
  const d = Array.isArray(days) && days.length ? [...days].sort((a, b) => a - b) : ALL_DAYS;
  if (d.length === 7) return "Tous les jours";
  if (d.length === 5 && d.every((x, i) => x === i)) return "En semaine";
  if (d.length === 2 && d[0] === 5 && d[1] === 6) return "Le week-end";
  return d.map((i) => WEEKDAYS[i]).join(" · ");
}

/** Ce à quoi le bloc s'accroche, tel qu'on l'écrit sur sa pastille. */
function anchorTargetLabel(form, blocks) {
  const cible = form.anchorBefore ? (blocks || []).find((b) => b.id === form.anchorBefore) : null;
  if (cible) return `Juste avant « ${cible.summary} »`;
  return (form.anchorMode || "morning") === "evening"
    ? "Avant le réveil du lendemain"
    : "Avant le 1ᵉʳ évènement du jour";
}

/** Positionne les évènements horodatés d'un jour (clusters + colonnes).
 *  Exportée pour les tests : la découpe en tranches se vérifie sur des horaires,
 *  pas sur des pixels. */
export function layoutDay(evts, day) {
  const dayStart = startOfDay(day);
  const timed = (evts || [])
    .filter((e) => !e.allDay && e.start)
    .map((e) => {
      const s = new Date(e.start);
      const en = e.end ? new Date(e.end) : new Date(s.getTime() + 30 * 60000);
      let startMin = Math.max(0, (s - dayStart) / 60000);
      let endMin = Math.min(24 * 60, (en - dayStart) / 60000);
      // Dates invalides → startMin/endMin = NaN. La comparaison `endMin <= startMin`
      // est false avec des NaN, donc on les écarte explicitement pour ne pas
      // injecter des positions/hauteurs NaN dans le rendu (source de freeze).
      if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
      if (endMin <= startMin) endMin = startMin + 30;
      return { ...e, startMin, endMin };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  /* Découpe d'un évènement en tranches de largeur.
     Un bloc ne partage sa colonne que pendant le temps RÉELLEMENT commun : une
     réunion d'une heure croisée par un quart d'heure ne doit pas rester à
     demi-largeur pendant les 45 minutes où elle est seule. Une largeur unique
     par évènement ne sait pas dire ça — on rend donc une tranche par intervalle
     entre deux bornes du groupe, et on fusionne les tranches voisines de même
     largeur. Les bornes ne viennent que du groupe qui se chevauche : ailleurs,
     l'évènement reste d'un seul tenant.
     L'étalement va des deux côtés : la colonne d'un évènement est figée par le
     placement, mais rien ne justifie de laisser un vide à sa gauche quand c'est
     le voisin de gauche qui s'est terminé. */
  const segmentsFor = (ev, cluster, cols) => {
    const bounds = new Set([ev.startMin, ev.endMin]);
    for (const o of cluster) {
      if (o === ev) continue;
      if (o.startMin > ev.startMin && o.startMin < ev.endMin) bounds.add(o.startMin);
      if (o.endMin > ev.startMin && o.endMin < ev.endMin) bounds.add(o.endMin);
    }
    const marks = [...bounds].sort((a, b) => a - b);
    const busy = (c, a, b) => cluster.some((o) => o !== ev && o._col === c && o.startMin < b && o.endMin > a);
    const segs = [];
    for (let i = 0; i < marks.length - 1; i++) {
      const a = marks[i];
      const b = marks[i + 1];
      let from = ev._col;
      let to = ev._col;
      while (from - 1 >= 0 && !busy(from - 1, a, b)) from--;
      while (to + 1 < cols && !busy(to + 1, a, b)) to++;
      const span = to - from + 1;
      const last = segs[segs.length - 1];
      if (last && last.col === from && last.span === span) last.endMin = b;
      else segs.push({ startMin: a, endMin: b, col: from, span });
    }
    return segs;
  };

  // Partage en colonnes (côte à côte) des éléments qui se chevauchent.
  const place = (items) => {
    const clusters = [];
    let cluster = [];
    let clusterEnd = -1;
    for (const ev of items) {
      if (cluster.length && ev.startMin >= clusterEnd) {
        clusters.push(cluster);
        cluster = [];
        clusterEnd = -1;
      }
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    }
    if (cluster.length) clusters.push(cluster);

    const out = [];
    for (const cl of clusters) {
      const colEnds = [];
      for (const ev of cl) {
        let placed = false;
        for (let c = 0; c < colEnds.length; c++) {
          if (ev.startMin >= colEnds[c]) { ev._col = c; colEnds[c] = ev.endMin; placed = true; break; }
        }
        if (!placed) { ev._col = colEnds.length; colEnds.push(ev.endMin); }
      }
      for (const ev of cl) { ev._cols = colEnds.length; ev._segs = segmentsFor(ev, cl, colEnds.length); }
      /* Bords à dégager : ceux où un AUTRE évènement s'élargit sur la colonne
         de celui-ci, juste avant ou juste après lui. C'est le seul endroit où
         deux blocs se touchent sans qu'une colonne ou une heure ne les sépare —
         ailleurs, coller reste juste. L'écart est pris sur le bloc qui ne
         s'élargit pas : le raboter chez l'autre creuserait une encoche au milieu
         d'un évènement continu. */
      for (const ev of cl) {
        const fills = (t, edge) => cl.some((o) => o !== ev && o._col !== ev._col
          && (o._segs || []).some((sg) => sg[edge] === t && sg.col <= ev._col && ev._col < sg.col + sg.span));
        ev._gapTop = fills(ev.startMin, "endMin");
        ev._gapBottom = fills(ev.endMin, "startMin");
        out.push(ev);
      }
    }
    return out;
  };

  // Évènements et tâches sont disposés séparément : une tâche qui chevauche un
  // évènement ne le pousse pas sur le côté — elle se superpose par-dessus (z-index
  // plus élevé au rendu). Le partage en colonnes ne joue qu'entre éléments de même
  // nature (évènement/évènement ou tâche/tâche).
  const events = place(timed.filter((e) => !e.isTask));
  const tasks = place(timed.filter((e) => e.isTask));
  return [...events, ...tasks];
}

/* ─────────────── Composant ─────────────── */
export default function AgendaPage() {
  useLang();
  // Mobile : interface basée sur 3 jours, header épuré (sans boutons).
  const isMobile = useIsMobile();
  const {
    ready, configured, connected, connect, disconnect,
    calendars,
    fetchEvents, createEvent, updateEvent, deleteEvent, getEvent, setEventDone,
    fetchTasks, createTask, updateTask, toggleTask, deleteTask,
  } = useGoogleCalendar();

  const [view, setView] = React.useState("week");
  const [cursor, setCursor] = React.useState(() => startOfDay(new Date()));
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  const [viewMenuOpen, setViewMenuOpen] = React.useState(false);
  // Ancres des menus flottants : tous portalisés, il leur faut donc une
  // référence explicite vers leur déclencheur pour se placer.
  const datePickerAnchor = React.useRef(null);
  const viewAnchor = React.useRef(null);
  const recurAnchor = React.useRef(null);
  const colorAnchor = React.useRef(null);
  const remindAnchor = React.useRef(null);
  const anchorMenuRef = React.useRef(null);
  const anchorDaysRef = React.useRef(null);
  // Horloge courante : sert à tracer la ligne « maintenant » et à griser le passé.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const [events, setEvents] = React.useState([]);
  const [tasks, setTasks] = React.useState([]);
  // Flux iCal ajoutés dans l'app (emploi du temps universitaire) : lus
  // directement, sans passer par Google — l'API Calendar ne sait pas s'abonner
  // à une URL, seule son interface web le sait.
  // La page ne fait que LIRE les flux : leur gestion (ajout, renommage,
  // suppression) vit dans les paramètres du compte, avec les autres réglages.
  const { feeds } = useIcsFeeds();
  const { hideEvent, showEvent } = useIcsHiddenEvents();
  const { pushUndo } = useUndo();
  const { eventColors, setEventColor } = useIcsEventColors();
  const { kindColors, setKindColor } = useIcsKindColors();
  const [taskTimes, setTaskTimes] = useCloudState(TASK_TIMES_KEY, TASK_TIMES_CLOUD_KEY, {});
  // Cartes Vie RPG (lecture seule ici — éditées sur la page « Vie RPG ») et
  // liaison « tâche → cartes » (+ complétion) que cette page écrit et que la
  // page Vie RPG lit pour créditer l'XP.
  const [rpgState] = useCloudState(RPG_STORAGE_KEY, RPG_CLOUD_KEY, { categories: DEFAULT_CATEGORIES });
  const rpgCategories = Array.isArray(rpgState.categories) ? rpgState.categories : DEFAULT_CATEGORIES;
  const [taskRpg, setTaskRpg] = useCloudState(TASK_RPG_STORAGE_KEY, TASK_RPG_CLOUD_KEY, {});
  /* Objectifs rattachés à un ÉVÈNEMENT. Jusqu'ici la sélection ne servait qu'à
     reprendre la couleur de la carte et repartait à la fermeture ; les étapes
     cochées rapportent maintenant de l'XP, il faut donc savoir vers QUOI le
     créneau fait avancer, et s'en souvenir. */
  const [eventRpg, setEventRpg] = useCloudState(EVENT_RPG_STORAGE_KEY, EVENT_RPG_CLOUD_KEY, {});
  const [eventTaskLinks, setEventTaskLinks] = useCloudState(EVENT_TASK_LINKS_KEY, "event_task_links", {}); // évènement → ids de tâches Google
  /* Étapes internes d'un évènement (lib/agendaChecklists.ts). Rien à voir avec
     les tâches Google ci-dessus : celles-ci vivent dans la grille et dans la
     liste des tâches, celles-là n'existent que dans le créneau qui les porte. */
  const [checklistStore, setChecklistStore] = useCloudState(
    EVENT_CHECKLISTS_KEY, EVENT_CHECKLISTS_CLOUD_KEY, {},
  );
  const checklists = React.useMemo(() => normalizeChecklists(checklistStore), [checklistStore]);
  // Blocs ancrés : « réveil + préparation » et consorts, qui se posent chaque
  // jour juste avant le premier élément. Locaux — Google ne saurait pas quoi
  // faire d'un évènement dont l'heure est un calcul (cf. lib/agendaAnchoredBlocks).
  const [anchoredStore, setAnchoredStore] = useCloudState(ANCHORED_STORAGE_KEY, ANCHORED_CLOUD_KEY, []);
  const [modalTab, setModalTab] = React.useState("event"); // vue interne du modal évènement : "event" | "tasks"
  const [taskDraft, setTaskDraft] = React.useState(""); // saisie d'ajout de tâche
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [modal, setModal] = React.useState(null); // form objet | null
  const [modalError, setModalError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  /* Échap referme la fiche, comme le clic au fond — mais pas pendant
     l'enregistrement : la requête est partie, fermer laisserait croire qu'on
     l'a annulée. Les menus de la fiche (couleur, rappels, récurrence) sont des
     Popover : ouverts par-dessus, ils sont plus haut dans la pile et se
     referment seuls au premier appui, sans emporter la fiche. */
  useEscapeDismiss(() => setModal(null), !!modal && !saving);
  const [overdueOpen, setOverdueOpen] = React.useState(false);
  const [overduePos, setOverduePos] = React.useState(null); // { top, left } du popover
  const [colorOpen, setColorOpen] = React.useState(false);
  /* Portée visée pour la retouche d'une séance importée : cette occurrence, ou
     toute la matière. Un cours revient vingt fois dans un semestre — sans la
     seconde, le recolorer demanderait vingt allers-retours, et personne ne le
     ferait. */
  const [feedScopeChoice, setFeedScopeChoice] = React.useState("events");
  const [remindOpen, setRemindOpen] = React.useState(false);
  const [recurOpen, setRecurOpen] = React.useState(false);
  // Menus du bloc ancré : l'ancre (mode + « juste avant ») et les jours.
  const [anchorMenuOpen, setAnchorMenuOpen] = React.useState(false);
  const [anchorDaysOpen, setAnchorDaysOpen] = React.useState(false);
  // Délai libre du menu de notifications (valeur + unité), avant ajout.
  const [customRemind, setCustomRemind] = React.useState("2");
  const [customRemindUnit, setCustomRemindUnit] = React.useState("h");
  const [timeEdit, setTimeEdit] = React.useState(false);
  const dragRef = React.useRef(null);
  const [dragBox, setDragBox] = React.useState(null); // { dayKey, a, b } en minutes
  const resizeRef = React.useRef(null);
  const [resizeBox, setResizeBox] = React.useState(null); // { id, dayKey, startMin, endMin }
  const moveRef = React.useRef(null);
  const [moveBox, setMoveBox] = React.useState(null); // { id, ev, dayKey, startMin, endMin }
  const titleRef = React.useRef(null);
  // Position du formulaire (décalage depuis le centre), ajustable en glissant la poignée.
  const [modalPos, setModalPos] = React.useState({ x: 0, y: 0 });
  const [modalDragging, setModalDragging] = React.useState(false);
  const [dragHover, setDragHover] = React.useState(false);
  const modalDragRef = React.useRef(null);

  // Ferme les menus déroulants (couleur / notification / récurrence) au clic en dehors.
  React.useEffect(() => {
    if (!colorOpen && !remindOpen && !recurOpen) return;
    const onDown = (e) => {
      // Les trois panneaux sont portalisés dans `document.body` : ils ne sont
      // plus des descendants de leur `[data-menu-root]`, il faut donc les
      // reconnaître à part sous peine de les fermer au premier clic dedans.
      if (e.target.closest?.("[data-menu-root]") || e.target.closest?.("[data-popover-panel]")) return;
      setColorOpen(false);
      setRemindOpen(false);
      setRecurOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [colorOpen, remindOpen, recurOpen]);

  /* Rappels du formulaire. Toujours lus normalisés : un item enregistré avant
     le passage au multiple porte encore un scalaire (`reminder: 10`). */
  const reminderList = React.useMemo(() => normalizeReminders(modal?.reminders), [modal]);
  /* Pastille « par défaut » du sélecteur : ce que l'item sera VRAIMENT sans
     couleur choisie — gris pour une tâche, lavande pour un évènement. Montrer
     la lavande dans les deux cas laissait croire qu'on posait du violet. */
  const defaultSwatch = modal?.kind === "task" ? TASK_DEFAULT_PAINT.accent : DEFAULT_EVENT_COLOR;

  // Seuls les délais explicites comptent dans la limite Google — « par défaut »
  // n'est pas un override, et le cocher ne doit pas griser les choix rapides.
  const reminderCount = reminderList.filter((v) => typeof v === "number").length;
  const setReminders = (next) => setModal((m) => (m ? { ...m, reminders: normalizeReminders(next) } : m));
  const addCustomReminder = () => {
    const n = Number(customRemind);
    if (!Number.isFinite(n) || n < 0) return;
    const unit = REMINDER_UNITS.find((u) => u.id === customRemindUnit) || REMINDER_UNITS[0];
    setReminders(addReminder(reminderList, Math.round(n * unit.mul)));
  };

  // Focalise le titre à l'ouverture du formulaire SANS faire défiler la page.
  // `autoFocus` natif force un scrollIntoView qui remontait le conteneur en haut ;
  // `preventScroll: true` conserve la position de défilement courante.
  const modalOpen = !!modal;
  React.useEffect(() => {
    if (modalOpen) {
      setModalPos({ x: 0, y: 0 }); // recentre le formulaire à chaque ouverture
      setDragHover(false);         // évite la barre grisée si on avait survolé avant fermeture
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [modalOpen]);

  // Glisser-déposer du formulaire via la poignée du haut.
  const startModalDrag = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { mx: e.clientX, my: e.clientY, x: modalPos.x, y: modalPos.y };
    modalDragRef.current = start;
    setModalDragging(true);
    const onMove = (ev) => {
      const st = modalDragRef.current;
      if (!st) return;
      setModalPos({ x: st.x + (ev.clientX - st.mx), y: st.y + (ev.clientY - st.my) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      modalDragRef.current = null;
      setModalDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Agendas en lecture seule : l'emploi du temps universitaire abonné par URL
  // iCal en fait partie. Google rejette toute écriture dessus — l'interface doit
  // donc verrouiller déplacement, redimensionnement et enregistrement plutôt que
  // de laisser l'utilisateur découvrir l'échec après coup.
  const readOnlyCalIds = React.useMemo(
    () => new Set((calendars || []).filter((c) => c.readOnly).map((c) => c.id)),
    [calendars],
  );
  const isLocked = React.useCallback(
    (item) =>
      !!item && !item.isGTask && !!item.calendarId &&
      (isFeedCalendarId(item.calendarId) || readOnlyCalIds.has(item.calendarId)),
    [readOnlyCalIds],
  );
  // Couleur d'agenda, pour distinguer les cours du reste sans les repeindre un par un.
  const calColorById = React.useMemo(() => {
    const map = new Map();
    for (const c of calendars || []) if (c.color) map.set(c.id, c.color);
    return map;
  }, [calendars]);

  /* Une séance importée ne s'enregistre pas — le flux la rendra identique à la
     prochaine lecture — mais sa COULEUR, elle, peut être retouchée : elle vit à
     côté, dans les réglages, et se pose au rendu. C'est le seul champ d'un
     évènement en lecture seule qui réponde, d'où le traitement à part : la
     retouche s'applique tout de suite, sans bouton « Enregistrer » qui n'existe
     pas ici.

     Deux portées, et la seconde est le TYPE de séance — pas la matière. C'est
     lui qui structure un emploi du temps : ce qu'on cherche des yeux dans une
     semaine, c'est « où sont mes TP » et « quand est le partiel », pas « où est
     l'anglais ». La même valeur que règlent les paramètres, atteinte depuis la
     séance qu'on a sous les yeux. */
  const feedItem = modal && !modal.isGTask && isFeedCalendarId(modal.calendarId || "");
  const feedKind = feedItem ? courseKind(modal.category, modal.summary) : null;
  const feedCourse = feedItem ? courseKey(modal.course || modal.summary) : "";
  const feedHasOwn = feedItem && !!eventColors.events[modal.id];
  const feedHasCourse = feedItem && !!eventColors.courses[feedCourse];

  /* Masquer la séance qu'on regarde. Le seul geste « destructif » qu'une séance
     importée accepte : le flux appartient à l'établissement, et supprimer
     là-bas n'est ni possible ni souhaitable — le masque est le nôtre, et se
     lève depuis Paramètres → Agendas. */
  const hideFeedEvent = () => {
    if (!feedItem) return;
    const snapshot = {
      id: modal.id,
      summary: modal.summary,
      // Le formulaire tient la date et l'heure à part : on les recompose pour
      // que les réglages sachent dater ce qu'ils proposent de rendre.
      start: modal.allDay ? modal.date : `${modal.date}T${modal.startTime}`,
    };
    hideEvent(snapshot);
    /* Ctrl+Z rend la séance. La pile globale (lib/contexts/UndoContext.jsx)
       tenait déjà le raccourci et le bandeau ; masquer par erreur était le seul
       geste de cette page qu'on ne pouvait pas reprendre — la liste des
       réglages suppose de savoir qu'elle existe. */
    pushUndo({
      label: `Séance « ${snapshot.summary || "sans titre"} »`,
      undo: () => showEvent(snapshot.id),
      redo: () => hideEvent(snapshot),
    });
    setModal(null);
  };

  const paintFeed = (scope, colorId) => {
    if (!feedItem) return;
    if (scope === "kind") {
      /* Les portées plus précises sont levées en même temps : sans ça, la
         couleur qu'on vient de donner au type ne s'appliquerait pas à la séance
         qu'on regarde, et le choix semblerait ignoré. */
      setEventColor("events", modal.id, null);
      setEventColor("courses", feedCourse, null);
      setKindColor(feedKind, colorId);
    } else if (scope === "courses") {
      setEventColor("events", modal.id, null);
      setEventColor("courses", feedCourse, colorId);
    } else {
      setEventColor("events", modal.id, colorId);
    }
    setModal((m) => (m ? { ...m, colorId: colorId ?? kindColorId(feedKind, kindColors) } : m));
    setColorOpen(false);
  };

  const range = React.useMemo(() => computeRange(view, cursor), [view, cursor]);

  const { icsEvents } = useIcsEvents(
    feeds,
    range.start.toISOString(),
    range.end.toISOString(),
  );

  const loadEvents = React.useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const evs = await fetchEvents(range.start.toISOString(), range.end.toISOString());
      setEvents(evs.map((ev) => ({ ...ev, calendarColor: calColorById.get(ev.calendarId) || null })));
    } catch (e) {
      setEvents([]);
      if (e?.message !== "token_expired") setError(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [connected, range, fetchEvents, calColorById]);

  React.useEffect(() => { loadEvents(); }, [loadEvents]);

  // taskTimes et eventTaskLinks sont gérés par useCloudState (synchro en ligne) :
  // pas de chargement manuel nécessaire ici.

  // Vraies tâches Google (échec silencieux si scope/API pas encore prêts).
  const loadTasks = React.useCallback(async () => {
    if (!connected) return;
    try { setTasks(await fetchTasks()); } catch { setTasks([]); }
  }, [connected, fetchTasks]);

  React.useEffect(() => { loadTasks(); }, [loadTasks]);

  // Tâches converties en items affichables (mêmes champs qu'un évènement).
  const taskItems = React.useMemo(
    () => tasks.map((tk) => taskToItem(tk, taskTimes)).filter(Boolean),
    [tasks, taskTimes],
  );

  // Évènements + tâches → placés dans la grille horaire / la vue mois.
  // Les tâches avec une heure enregistrée se positionnent ainsi dans le
  // calendrier à leur horaire (layoutDay ne garde que les items horodatés) ;
  // elles restent aussi affichées dans la rangée du haut via `tasksByDay`.
  const allEvents = React.useMemo(() => [...events, ...icsEvents], [events, icsEvents]);

  // Évènements + tâches → placés dans la grille horaire / la vue mois.
  // Les tâches avec une heure enregistrée se positionnent ainsi dans le
  // calendrier à leur horaire (layoutDay ne garde que les items horodatés) ;
  // elles restent aussi affichées dans la rangée du haut via `tasksByDay`.
  const anchoredBlocks = React.useMemo(() => normalizeAnchoredBlocks(anchoredStore), [anchoredStore]);

  const eventsByDay = React.useMemo(() => {
    const map = new Map();
    for (const ev of [...allEvents, ...taskItems]) {
      const k = eventDayKey(ev);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }
    /* Les blocs ancrés se calculent APRÈS le regroupement : leur fin est
       l'heure du premier élément de la journée — celle du jour même le matin,
       celle du lendemain le soir. On balaie donc toute la plage chargée et pas
       seulement les jours qui ont quelque chose : un dimanche vide porte quand
       même la nuit qui mène au lundi matin. */
    if (anchoredBlocks.length) {
      const dayKeys = [];
      for (let d = startOfDay(range.start); d < range.end; d = addDays(d, 1)) dayKeys.push(dateKey(d));
      const placed = anchoredOccurrencesForRange(anchoredBlocks, dayKeys, map);
      for (const [k, occ] of placed) {
        if (!occ.length) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(...occ);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : a.allDay ? -1 : 1));
    }
    return map;
  }, [allEvents, taskItems, anchoredBlocks, range]);

  const today = startOfDay(new Date());
  const todayKey = dateKey(today);

  // Tâches indexées par jour d'échéance (rangée sous l'en-tête des jours).
  const tasksByDay = React.useMemo(() => {
    const map = new Map();
    for (const it of taskItems) {
      const k = eventDayKey(it);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    }
    return map;
  }, [taskItems]);

  // Évènements « toute la journée » (hors tâches), indexés par jour : ils
  // s'affichent dans la rangée du haut, au-dessus des tâches du jour.
  const allDayByDay = React.useMemo(() => {
    const map = new Map();
    for (const ev of allEvents) {
      if (!ev.allDay || ev.isTask) continue;
      const k = eventDayKey(ev);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }
    for (const arr of map.values()) arr.sort((a, b) => String(a.summary).localeCompare(String(b.summary)));
    return map;
  }, [allEvents]);

  // Tâches "en attente" : date limite dépassée et non terminées.
  const overdueTasks = React.useMemo(
    () => taskItems
      .filter((it) => !it.done && it.dueDate && it.dueDate < todayKey)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))),
    [taskItems, todayKey],
  );

  // Bascule l'état "terminé" (tâche Google ou évènement-tâche legacy).
  const onToggleDone = async (item) => {
    if (item.isGTask) {
      const nowDone = !item.done;
      setTasks((prev) => prev.map((x) => (x.id === item.id ? { ...x, completed: nowDone } : x)));
      // Tâche liée à des cartes Vie RPG : on horodate la complétion (ou on la
      // retire) pour que la page Vie RPG crédite/décrédite l'XP correspondante.
      setTaskRpg((prev) => {
        const entry = prev[item.id];
        if (!entry) return prev; // pas de lien RPG → rien à faire
        return { ...prev, [item.id]: { ...entry, title: item.summary || entry.title || "", completedAt: nowDone ? new Date().toISOString() : null } };
      });
      try { await toggleTask(item.id, nowDone); } catch { loadTasks(); }
    } else {
      setEvents((prev) => prev.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)));
      try { await setEventDone(item.id, !item.done, item.calendarId); } catch { loadEvents(); }
    }
  };

  const goToday = () => setCursor(startOfDay(new Date()));
  const openDay = (d) => { setCursor(startOfDay(d)); setView("day"); };
  const openCreate = (day, startTime, endTime) => { setModalError(null); setColorOpen(false); setRemindOpen(false); setRecurOpen(false); setAnchorMenuOpen(false); setAnchorDaysOpen(false); setTimeEdit(false); setModalTab("event"); setTaskDraft(""); setModal(blankForm(day || cursor, startTime, endTime)); };
  const openEdit = (item) => {
    setModalError(null); setColorOpen(false); setRemindOpen(false); setRecurOpen(false); setAnchorMenuOpen(false); setAnchorDaysOpen(false); setTimeEdit(false); setModalTab("event"); setTaskDraft("");
    /* Bloc ancré : l'occurrence cliquée sert de brouillon (titre, couleur, et
       les heures de CE jour). Seule la durée en sortira — la date affichée n'est
       qu'un exemple, celui du jour qu'on regarde. */
    if (item.isAnchored) {
      /* Les heures de l'occurrence ne diraient pas la vérité : une nuit est
         coupée à minuit, et le morceau qu'on a cliqué ne dure pas la nuit. On
         relit donc le bloc lui-même. */
      const block = anchoredBlocks.find((b) => b.id === item.anchorId);
      setModal({
        ...formFromEvent(item),
        id: item.anchorId, anchored: true, anchorId: item.anchorId,
        summary: block?.summary ?? item.summary,
        colorId: block?.colorId ?? item.colorId ?? null,
        anchorMinutes: block?.minutes ?? DEFAULT_ANCHOR_MINUTES,
        anchorMode: block?.anchor === "evening" ? "evening" : "morning",
        anchorBefore: block?.before || "",
        anchorGap: block?.gap ?? 0,
        anchorDays: block?.days ?? ALL_DAYS,
        anchorMaxStart: block?.maxStart ?? "",
        anchorCountTasks: block?.countTasks !== false,
        anchorEnabled: block?.enabled !== false,
      });
      return;
    }
    const base = item.isGTask ? formFromTaskItem(item, taskTimes) : formFromEvent(item);
    if (item.isGTask) base.rpgCategories = taskRpg[item.id]?.categories || [];
    // Un évènement rouvre sur les objectifs qu'on lui avait donnés, sinon la
    // sélection paraîtrait ne jamais avoir été enregistrée.
    else if (item.id) base.rpgCategories = eventRpg[item.id]?.categories || [];
    setModal(base);
    // Évènement récurrent : la règle est portée par l'évènement maître (les
    // occurrences sont dépliées). On la récupère en arrière-plan pour pré-remplir.
    if (!item.isTask && item.recurringEventId) {
      getEvent(item.recurringEventId, item.calendarId)
        .then((res) => {
          const recur = parseRecurrence(res?.event?.recurrence);
          setModal((m) => (m && m.id === item.id
            ? { ...m, recur, masterId: item.recurringEventId, masterStart: res?.event?.start || null }
            : m));
        })
        .catch(() => {});
    }
  };

  // Met à jour partiellement la config de récurrence du form.
  const setRecur = (patch) => setModal((m) => ({ ...m, recur: { ...(m.recur || { preset: "once" }), ...patch } }));

  // ─── Tâches Google liées à l'évènement en cours d'édition ───
  // Échéance des tâches créées depuis un évènement = date de l'évènement.
  const eventDueISO = (m) => (m?.date ? `${m.date}T00:00:00.000Z` : null);

  // Tâches Google déjà liées à cet évènement (existant), résolues depuis l'état `tasks`.
  const linkedTasksFor = React.useCallback(
    (eventId) => {
      if (!eventId) return [];
      const ids = eventTaskLinks[eventId] || [];
      return ids.map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
    },
    [eventTaskLinks, tasks],
  );

  const linkTaskToEvent = (eventId, taskId) => {
    setEventTaskLinks((prev) => {
      const map = { ...prev };
      const ids = new Set(map[eventId] || []);
      ids.add(taskId);
      map[eventId] = [...ids];
      return map;
    });
  };
  const unlinkTaskFromEvent = (eventId, taskId) => {
    setEventTaskLinks((prev) => {
      const map = { ...prev };
      map[eventId] = (map[eventId] || []).filter((id) => id !== taskId);
      if (map[eventId].length === 0) delete map[eventId];
      return map;
    });
  };

  // Ajoute une tâche depuis le panneau « Tâche » d'un évènement.
  // Évènement existant → crée la vraie Google Task tout de suite et la lie.
  // Nouvel évènement (pas encore d'id) → met en attente, créée à l'enregistrement.
  const addEventTask = async (title) => {
    const text = String(title || "").trim();
    if (!text || !modal) return;
    setTaskDraft("");
    if (modal.id) {
      try {
        const r = await createTask({ title: text, due: eventDueISO(modal) });
        const newId = r?.task?.id;
        if (newId) linkTaskToEvent(modal.id, newId);
        await loadTasks();
      } catch (e) {
        if (e?.message === "insufficient_scope") setError("insufficient_scope");
        else setModalError(e?.message || "Erreur lors de l'ajout de la tâche");
      }
    } else {
      setModal((m) => ({ ...m, pendingTasks: [...(m.pendingTasks || []), text] }));
    }
  };
  const removePendingTask = (idx) => setModal((m) => ({ ...m, pendingTasks: (m.pendingTasks || []).filter((_, i) => i !== idx) }));

  /* ── Étapes de l'évènement ouvert ──────────────────────────────────────────
     Un évènement déjà enregistré a un id : ses étapes vont droit au magasin, et
     s'appliquent sans « Enregistrer » — comme la couleur d'une séance importée,
     qui n'a d'ailleurs pas de bouton d'enregistrement du tout.

     Un évènement en cours de CRÉATION n'a pas encore d'id (c'est Google qui le
     donne). Ses étapes attendent donc dans le formulaire, et `save()` les pose
     sous l'id définitif. Une seule branche ici, pour que le reste de l'écran
     n'ait jamais à savoir dans lequel des deux cas il se trouve. */
  const modalChecklist = React.useMemo(
    () => (modal?.id ? checklistFor(checklists, modal.id) : normalizeChecklistItems(modal?.checklist)),
    [modal?.id, modal?.checklist, checklists],
  );
  const [checklistDraft, setChecklistDraft] = React.useState("");

  const addChecklistStep = () => {
    const text = checklistDraft.trim();
    if (!text || !modal) return;
    setChecklistDraft("");
    if (modal.id) setChecklistStore((prev) => addChecklistItem(normalizeChecklists(prev), modal.id, text));
    else {
      const item = newChecklistItem(text);
      if (item) setModal((m) => ({ ...m, checklist: [...normalizeChecklistItems(m.checklist), item] }));
    }
  };

  /* Cocher depuis la grille : le modal n'est pas ouvert, on vise donc
     l'évènement par son id plutôt que par `modal`. */
  const toggleEventStep = (eventId, itemId) =>
    setChecklistStore((prev) => toggleChecklistItem(normalizeChecklists(prev), eventId, itemId));

  const toggleChecklistStep = (itemId) => {
    if (!modal) return;
    if (modal.id) setChecklistStore((prev) => toggleChecklistItem(normalizeChecklists(prev), modal.id, itemId));
    else setModal((m) => ({
      ...m,
      checklist: normalizeChecklistItems(m.checklist).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
    }));
  };

  const removeChecklistStep = (itemId) => {
    if (!modal) return;
    if (modal.id) setChecklistStore((prev) => removeChecklistItem(normalizeChecklists(prev), modal.id, itemId));
    else setModal((m) => ({
      ...m,
      checklist: normalizeChecklistItems(m.checklist).filter((i) => i.id !== itemId),
    }));
  };
  const toggleLinkedTask = async (task) => {
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, completed: !task.completed } : x)));
    try { await toggleTask(task.id, !task.completed); } catch { loadTasks(); }
  };
  const deleteLinkedTask = async (task) => {
    if (modal?.id) unlinkTaskFromEvent(modal.id, task.id);
    setTasks((prev) => prev.filter((x) => x.id !== task.id));
    try { await deleteTask(task.id); } catch { loadTasks(); }
  };

  // Création dans le time-grid. Souris : clic-glissé pour tracer une plage (un
  // simple clic crée 1 h). Tactile/stylet : un tap crée un évènement d'1 h à
  // l'horaire touché — on ne trace pas, pour ne pas bloquer le défilement vertical.
  const startDrag = (e, d) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const columnTop = e.currentTarget.getBoundingClientRect().top;
    const snap = (clientY) => {
      const raw = ((clientY - columnTop) / HOUR_H) * 60;
      return Math.max(0, Math.min(24 * 60, Math.round(raw / 15) * 15));
    };
    const dk = dateKey(d);
    const openAt = (lo, hi) => {
      if (hi - lo < 15) hi = Math.min(24 * 60, lo + 60); // tap / simple clic → 1 h
      const st = `${pad(Math.floor(lo / 60))}:${pad(lo % 60)}`;
      const et = `${pad(Math.floor(hi / 60) % 24)}:${pad(hi % 60)}`;
      openCreate(d, st, et);
    };

    // Tactile/stylet : tap = création ; un défilement annule (pointercancel) ou
    // se reconnaît à un déplacement notable du doigt.
    if (e.pointerType !== "mouse") {
      const downX = e.clientX, downY = e.clientY;
      let aborted = false;
      const cleanup = () => {
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };
      const onCancel = () => { aborted = true; cleanup(); };
      const onUp = (ev) => {
        cleanup();
        if (aborted) return;
        if (Math.abs(ev.clientY - downY) > 10 || Math.abs(ev.clientX - downX) > 10) return; // défilement
        const lo = snap(ev.clientY);
        openAt(lo, lo);
      };
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      return;
    }

    // Souris : tracé d'une plage horaire.
    e.preventDefault();
    const startMin = snap(e.clientY);
    dragRef.current = { startMin, endMin: startMin + 15 };
    setDragBox({ dayKey: dk, a: startMin, b: startMin + 15 });

    const onMove = (ev) => {
      const cur = snap(ev.clientY);
      dragRef.current.endMin = cur;
      setDragBox({ dayKey: dk, a: dragRef.current.startMin, b: cur });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const cur = dragRef.current;
      dragRef.current = null;
      setDragBox(null);
      if (!cur) return;
      openAt(Math.min(cur.startMin, cur.endMin), Math.max(cur.startMin, cur.endMin));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Redimensionnement d'un bloc par ses bords (façon Google Agenda), évènement
  // ou tâche : on glisse le bord haut (modifie l'heure de début) ou bas (heure
  // de fin), par pas de 15 min, puis on enregistre la nouvelle plage.
  const startResize = (e, ev, d, edge) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isLocked(ev)) return;
    // Un bloc ancré n'a pas d'heure à soi : l'allonger par le bord déplacerait
    // une position qui sera recalculée à la seconde suivante. Sa durée s'édite
    // dans le modal.
    if (ev.isAnchored) return;
    e.preventDefault();
    e.stopPropagation();
    const colEl = e.currentTarget.closest("[data-daycol]");
    if (!colEl) return;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
    const columnTop = colEl.getBoundingClientRect().top;
    const dk = dateKey(d);
    const snap = (clientY) => {
      const raw = ((clientY - columnTop) / HOUR_H) * 60;
      return Math.max(0, Math.min(24 * 60, Math.round(raw / 15) * 15));
    };
    const init = { startMin: ev.startMin, endMin: ev.endMin };
    resizeRef.current = { id: ev.id, edge, ev, ...init };
    setResizeBox({ id: ev.id, dayKey: dk, ...init });

    const onMove = (m) => {
      const cur = snap(m.clientY);
      const st = resizeRef.current;
      if (!st) return;
      if (edge === "top") st.startMin = Math.min(cur, st.endMin - 15);
      else st.endMin = Math.max(cur, st.startMin + 15);
      setResizeBox({ id: ev.id, dayKey: dk, startMin: st.startMin, endMin: st.endMin });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const st = resizeRef.current;
      resizeRef.current = null;
      setResizeBox(null);
      if (!st) return;
      if (st.startMin === init.startMin && st.endMin === init.endMin) return; // aucun changement
      applyResize(st.ev, d, st.startMin, st.endMin);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Applique la nouvelle plage horaire (MAJ optimiste puis appel API).
  const applyResize = async (ev, d, startMin, endMin) => {
    // Minutes non finies (donnée corrompue) → on resynchronise sans rien écrire.
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) { loadEvents(); return; }
    const toTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const endM = endMin >= 24 * 60 ? 24 * 60 - 1 : endMin; // 24:00 impossible → 23:59
    const dk = dateKey(d);
    if (ev.isTask) {
      /* Tâche : son créneau vit côté tr4de (`taskTimes`), Google Tasks ne
         connaissant qu'une date limite. Même chemin que le déplacement — et le
         jour ne change pas, un redimensionnement reste dans sa colonne. */
      setTaskTimes((prevTimes) => {
        const prev = prevTimes[ev.id] || {};
        return { ...prevTimes, [ev.id]: { ...prev, day: prev.day || dk, startTime: toTime(startMin), endTime: toTime(endM) } };
      });
      return;
    }
    const form = {
      ...formFromEvent(ev),
      allDay: false, date: dk, endDate: dk,
      startTime: toTime(startMin), endTime: toTime(endM),
    };
    const newStart = toISO(dk, form.startTime);
    const newEnd = toISO(dk, form.endTime);
    setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, start: newStart, end: newEnd } : x)));
    try {
      await updateEvent(ev.id, payloadFromForm(form), ev.calendarId);
      await loadEvents();
    } catch (err) {
      if (err?.message === "insufficient_scope") setError("insufficient_scope");
      loadEvents();
    }
  };

  // Déplacement d'un bloc par glisser-déposer (évènement OU tâche horodatée) : on
  // saisit le bloc et on le glisse vers une autre heure (pas de 15 min) et/ou un
  // autre jour. Un simple clic (sans déplacement) ouvre l'édition.
  const startMove = (e, ev, d) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isLocked(ev)) { openEdit(ev); return; }
    if (ev.isAnchored) { openEdit(ev); return; }
    e.preventDefault();
    const colEl = e.currentTarget.closest("[data-daycol]");
    if (!colEl) return;
    const columnTop = colEl.getBoundingClientRect().top;
    const duration = ev.endMin - ev.startMin;
    // Décalage entre le point saisi et le haut du bloc (pour qu'il ne « saute » pas).
    const grabOffset = ((e.clientY - columnTop) / HOUR_H) * 60 - ev.startMin;
    const startDk = dateKey(d);
    const startX = e.clientX, startY = e.clientY;
    // Seuil de déclenchement plus élevé au doigt (tremblement du tap).
    const threshold = e.pointerType === "mouse" ? 4 : 8;
    let moved = false;
    let last = { dayKey: startDk, startMin: ev.startMin, endMin: ev.endMin };
    moveRef.current = { id: ev.id, ev };

    const onMove = (m) => {
      if (!moved && Math.abs(m.clientY - startY) < threshold && Math.abs(m.clientX - startX) < threshold) return;
      moved = true;
      const rawStart = ((m.clientY - columnTop) / HOUR_H) * 60 - grabOffset;
      let startMin = Math.round(rawStart / 15) * 15;
      startMin = Math.max(0, Math.min(24 * 60 - duration, startMin));
      const endMin = startMin + duration;
      // Jour cible : colonne survolée (vue semaine), sinon jour d'origine.
      let dayKey = startDk;
      const target = typeof document !== "undefined" ? document.elementFromPoint(m.clientX, m.clientY) : null;
      const tcol = target && target.closest ? target.closest("[data-daykey]") : null;
      if (tcol && tcol.getAttribute("data-daykey")) dayKey = tcol.getAttribute("data-daykey");
      last = { dayKey, startMin, endMin };
      setMoveBox({ id: ev.id, ev, dayKey, startMin, endMin });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      moveRef.current = null;
      setMoveBox(null);
      if (!moved) { openEdit(ev); return; }                 // simple tap / clic → édition
      if (last.dayKey === startDk && last.startMin === ev.startMin && last.endMin === ev.endMin) return;
      applyMove(ev, last.dayKey, last.startMin, last.endMin);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Applique la nouvelle position (jour + plage horaire) : MAJ optimiste puis API.
  const applyMove = async (ev, targetDayKey, startMin, endMin) => {
    // Minutes non finies (donnée corrompue) → on resynchronise sans rien écrire.
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) { loadEvents(); return; }
    const toTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const endM = endMin >= 24 * 60 ? 24 * 60 - 1 : endMin; // 24:00 impossible → 23:59
    if (ev.isTask) {
      // Tâche : le jour de planification et l'heure sont conservés côté tr4de
      // (la date limite Google `due` n'est pas affectée par un déplacement).
      setTaskTimes((prevTimes) => {
        const times = { ...prevTimes };
        const prev = times[ev.id] || {};
        times[ev.id] = { ...prev, day: targetDayKey, startTime: toTime(startMin), endTime: toTime(endM) };
        return times;
      });
      return;
    }
    const form = {
      ...formFromEvent(ev),
      allDay: false, date: targetDayKey, endDate: targetDayKey,
      startTime: toTime(startMin), endTime: toTime(endM),
    };
    const newStart = toISO(targetDayKey, form.startTime);
    const newEnd = toISO(targetDayKey, form.endTime);
    setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, start: newStart, end: newEnd } : x)));
    try {
      await updateEvent(ev.id, payloadFromForm(form), ev.calendarId);
      await loadEvents();
    } catch (err) {
      if (err?.message === "insufficient_scope") setError("insufficient_scope");
      loadEvents();
    }
  };

  const saveModal = async () => {
    if (!modal) return;
    setSaving(true);
    setModalError(null);
    try {
      /* Bloc ancré : rien ne part chez Google. On ne retient que le titre, la
         couleur et la DURÉE lue dans les deux champs d'heure — l'heure de début
         sera recalculée chaque jour. */
      if (modal.anchored) {
        setAnchoredStore((prev) => {
          const list = normalizeAnchoredBlocks(prev);
          const existing = modal.anchorId ? list.find((b) => b.id === modal.anchorId) : null;
          const evening = modal.anchorMode === "evening";
          return upsertAnchoredBlock(list, {
            // Les réglages fins (jours, heure limite, marge…) vivent dans
            // Réglages → Agendas : on repart de ceux du bloc pour ne pas les
            // écraser en changeant un titre ici.
            ...(existing || {}),
            id: modal.anchorId || newAnchorId(),
            summary: String(modal.summary || "").trim() || (evening ? DEFAULT_SLEEP_TITLE : DEFAULT_ANCHOR_TITLE),
            minutes: modal.anchorMinutes,
            colorId: modal.colorId || null,
            anchor: evening ? "evening" : "morning",
            before: modal.anchorBefore || "",
            gap: modal.anchorGap || 0,
            days: Array.isArray(modal.anchorDays) && modal.anchorDays.length ? modal.anchorDays : ALL_DAYS,
            maxStart: modal.anchorMaxStart || "",
            countTasks: modal.anchorCountTasks !== false,
            enabled: modal.anchorEnabled !== false,
          });
        });
        setModal(null);
        return;
      }
      if (modal.kind === "task" || modalTab === "tasks") {
        const payload = taskPayloadFromForm(modal);
        // On édite une tâche existante seulement si le modal porte déjà une tâche ;
        // sur l'onglet « Tâche » d'un évènement, on crée toujours une nouvelle tâche.
        let taskId = modal.kind === "task" ? modal.id : null;
        if (taskId) await updateTask(taskId, payload);
        else { const r = await createTask(payload); taskId = r?.task?.id; }
        // Jour de planification + heure conservés côté tr4de : Google Tasks ne
        // stocke que la date limite (`due`), pas le jour où l'on pose la tâche.
        // Les rappels suivent le même chemin : l'API Tasks n'en a pas, ils sont
        // programmés localement par `useAgendaReminders`.
        if (taskId) {
          const finalTimeId = taskId;
          const rem = normalizeReminders(modal.reminders);
          setTaskTimes((prevTimes) => ({
            ...prevTimes,
            [finalTimeId]: modal.allDay
              ? { day: modal.date, colorId: modal.colorId || null, reminders: rem }
              : { day: modal.date, startTime: modal.startTime, endTime: modal.endTime, colorId: modal.colorId || null, reminders: rem },
          }));
          // Liaison aux cartes Vie RPG : on (dé)pose le lien et on préserve un
          // éventuel horodatage de complétion déjà connu (sinon on l'amorce
          // selon l'état « terminé » courant de la tâche).
          const cats = Array.isArray(modal.rpgCategories) ? modal.rpgCategories.filter(Boolean) : [];
          const finalTaskId = taskId;
          setTaskRpg((prev) => {
            const next = { ...prev };
            if (cats.length) {
              const existing = next[finalTaskId] || {};
              next[finalTaskId] = {
                categories: cats,
                title: modal.summary || existing.title || "",
                completedAt: existing.completedAt ?? (modal.done ? new Date().toISOString() : null),
              };
            } else if (next[finalTaskId]) {
              delete next[finalTaskId];
            }
            return next;
          });
        }
        setModal(null);
        await loadTasks();
      } else {
        // Édition d'une série récurrente : on vise l'évènement maître et on recale
        // le jour sur sa date d'origine (en conservant la nouvelle heure) afin de
        // ne pas déplacer toute la série en éditant une occurrence.
        let toSave = modal;
        let targetId = modal.id;
        if (modal.id && modal.masterId && modal.masterStart) {
          targetId = modal.masterId;
          const masterDate = String(modal.masterStart.dateTime || modal.masterStart.date || modal.date).slice(0, 10);
          toSave = { ...modal, date: masterDate, endDate: masterDate };
        }
        const payload = { ...payloadFromForm(toSave), recurrence: buildRecurrence(toSave) };
        let res;
        if (targetId) res = await updateEvent(targetId, payload, modal.calendarId);
        else res = await createEvent(payload);
        // Tâches en attente (ajoutées sur un nouvel évènement) : on crée les
        // vraies Google Tasks une fois l'id de l'évènement connu, puis on les lie.
        const savedId = modal.id || res?.event?.id;
        /* Les étapes saisies avant que l'évènement existe : c'est ici, et
           seulement ici, qu'on connaît enfin son identifiant. */
        if (savedId && !modal.id) {
          setChecklistStore((prev) => adoptChecklist(normalizeChecklists(prev), modal.checklist, savedId));
        }
        /* Objectifs du créneau : ce sont eux qui disent où va l'XP des étapes.
           Le titre est gardé à côté pour le journal de la Vie RPG, qui ne lit
           pas l'agenda. */
        if (savedId) {
          const eventCats = Array.isArray(modal.rpgCategories) ? modal.rpgCategories.filter(Boolean) : [];
          setEventRpg((prev) => {
            const next = { ...(prev || {}) };
            if (eventCats.length) next[savedId] = { categories: eventCats, title: modal.summary || "" };
            else delete next[savedId];
            return next;
          });
        }
        const pending = (modal.pendingTasks || []).map((s) => String(s).trim()).filter(Boolean);
        if (savedId && pending.length) {
          const newIds = [];
          for (const title of pending) {
            try {
              const r = await createTask({ title, due: eventDueISO(modal) });
              if (r?.task?.id) newIds.push(r.task.id);
            } catch (e) { /* tâche échouée : on continue les autres */ }
          }
          if (newIds.length) {
            setEventTaskLinks((prev) => {
              const map = { ...prev };
              const ids = new Set(map[savedId] || []);
              newIds.forEach((id) => ids.add(id));
              map[savedId] = [...ids];
              return map;
            });
          }
          await loadTasks();
        }
        setModal(null);
        await loadEvents();
      }
    } catch (e) {
      if (e?.message === "insufficient_scope") { setModal(null); setError("insufficient_scope"); }
      else setModalError(e?.message || "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const removeModal = async () => {
    if (modal?.anchored) {
      // Purement local : pas d'appel réseau, donc pas d'état « en cours ».
      setAnchoredStore((prev) => removeAnchoredBlock(normalizeAnchoredBlocks(prev), modal.anchorId));
      setModal(null);
      return;
    }
    if (!modal?.id) return;
    setSaving(true);
    setModalError(null);
    try {
      if (modal.kind === "task") {
        await deleteTask(modal.id);
        setTaskTimes((prev) => { if (!prev[modal.id]) return prev; const n = { ...prev }; delete n[modal.id]; return n; });
        setTaskRpg((prev) => { if (!prev[modal.id]) return prev; const n = { ...prev }; delete n[modal.id]; return n; });
        setModal(null);
        await loadTasks();
      } else {
        await deleteEvent(modal.id, modal.calendarId);
        // Les étapes s'en vont avec leur évènement : gardées, elles
        // reviendraient sur un futur évènement qui hériterait de cet id.
        setChecklistStore((prev) => dropChecklist(normalizeChecklists(prev), modal.id));
        setEventRpg((prev) => { const next = { ...(prev || {}) }; delete next[modal.id]; return next; });
        // Retire l'association évènement → tâches (les tâches Google restent).
        setEventTaskLinks((prev) => { if (!prev[modal.id]) return prev; const map = { ...prev }; delete map[modal.id]; return map; });
        setModal(null);
        await loadEvents();
      }
    } catch (e) {
      if (e?.message === "insufficient_scope") { setModal(null); setError("insufficient_scope"); }
      else if (e?.message === "refresh_unavailable") setModalError("Connexion à Google indisponible, réessaie dans un instant.");
      else setModalError(e?.message || "Erreur de suppression");
    } finally {
      setSaving(false);
    }
  };

  // Scroll auto vers l'heure actuelle à l'ouverture du time-grid (jour / semaine).
  // On réarme l'intention à chaque changement de vue/date…
  const gridRef = React.useRef(null);
  const nowAnchorRef = React.useRef(null);
  const didScrollRef = React.useRef(false);
  React.useEffect(() => { didScrollRef.current = false; }, [view, cursor, isMobile]);
  // …puis on positionne la grille dès qu'elle est montée, AVANT la première
  // peinture : on arrive directement sur l'heure actuelle. (Il y avait ici une
  // animation de défilement depuis 00h ; elle faisait attendre ~1,1 s la vue
  // qu'on venait chercher, et repartait de zéro à chaque changement de jour.)
  React.useLayoutEffect(() => {
    // Sur mobile la grille (3 jours) est toujours affichée ; sinon seulement
    // en vue jour/semaine.
    if (!isMobile && view !== "day" && view !== "week") return;
    if (didScrollRef.current) return;
    const grid = gridRef.current;
    // Pas de repère = la période affichée ne contient pas aujourd'hui : on ne
    // touche pas au défilement (cf. le repère dans la grille).
    const anchor = nowAnchorRef.current;
    // Tant que la grille n'a pas sa hauteur (rendu asynchrone), il n'y a rien à
    // faire défiler : on retente au rendu suivant plutôt que de se figer en haut.
    if (!grid || !anchor || grid.getBoundingClientRect().height <= 0) return;
    didScrollRef.current = true;
    // On laisse le navigateur amener le repère en haut de la zone visible :
    // depuis que la page est en colonne flex, ce n'est plus forcément la carte
    // qui défile, mais parfois le corps de la coquille. Calculer un `scrollTop`
    // demandait de désigner le bon élément — et se tromper, c'était rester à
    // minuit sans le savoir. `scrollIntoView` remonte toute la chaîne.
    // `instant` : `html` porte `scroll-behavior: smooth`, on ne veut pas voir
    // la journée défiler à l'ouverture.
    anchor.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
  });

  /* ─────────────── Header ─────────────── */
  /* Sélecteur de vues : un menu déroulant plutôt qu'un segmenté. Quatre
     pastilles côte à côte occupaient un tiers de l'en-tête pour n'afficher, au
     fond, qu'une seule information — la vue courante. Le menu n'en montre
     qu'une et rend la place aux commandes de navigation. */
  const segmented = (
    <div ref={viewAnchor} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setViewMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={viewMenuOpen}
        title="Changer de vue"
        style={viewBtn()}
      >
        {(VIEWS.find((v) => v.id === view) || VIEWS[1]).label}
        <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 4 }} />
      </button>
      <Popover
        anchorRef={viewAnchor}
        open={viewMenuOpen}
        onClose={() => setViewMenuOpen(false)}
        align="end"
        gap={4}
        style={{ background: T.white, border: "none", borderRadius: 12, padding: 6, boxShadow: "var(--elev-overlay)", minWidth: 160 }}
      >
        <>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => { setView(v.id); setViewMenuOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "transparent", textAlign: "left", fontFamily: "var(--font-sans)",
                fontSize: 13, fontWeight: v.id === view ? 600 : 500,
                color: v.id === view ? T.text : T.textMut,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flex: 1 }}>{v.label}</span>
              {v.id === view && <Check size={14} strokeWidth={2.2} color={T.textMut} />}
            </button>
          ))}
        </>
      </Popover>
    </div>
  );

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {/* Le bouton « Aujourd'hui » a pris la place du libellé de mois DANS la
          pastille de période : une seule commande de navigation au lieu de deux
          voisines qui se disputaient le même rôle. Trois boutons séparés par un
          écart plutôt qu'une carte unique — ce sont trois cibles, pas trois
          zones d'un même contrôle. Le mois, lui, est écrit à gauche : les
          flèches disent où l'on va, elles ne disent pas où l'on est. */}
      {connected && !isMobile && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {/* Même cran que le résultat d'une tuile du calendrier de trading
              (20/500) : c'est le chiffre qui titre sa carte là-bas, la période
              titre l'agenda ici. Libellé et non bouton — le sélecteur de date
              est parti avec la pastille, et une troisième affordance collée aux
              flèches serait ambiguë. */}
          <span style={{
            fontSize: 20, fontWeight: 500, lineHeight: 1, color: T.text,
            textTransform: "capitalize", whiteSpace: "nowrap",
          }}>
            {monthYearLabel(view, cursor)}
          </span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setCursor(shiftCursor(view, cursor, -1))}
              aria-label="Précédent" title="Précédent" style={stepBtn()}
            >
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <button onClick={goToday} style={todayBtn()}>Aujourd'hui</button>
            <button
              onClick={() => setCursor(shiftCursor(view, cursor, 1))}
              aria-label="Suivant" title="Suivant" style={stepBtn()}
            >
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}
      {/* Mobile : pas de flèches ; le libellé ouvre le sélecteur de date. */}
      {connected && isMobile && (
        <div ref={datePickerAnchor} style={{ position: "relative", display: "inline-flex" }}>
          <button
            onClick={() => setDatePickerOpen((o) => !o)}
            title="Choisir une date"
            style={{
              fontSize: 13, fontWeight: 500, color: T.text,
              background: T.white, border: "none", cursor: "pointer",
              padding: "8px 16px", minHeight: 34, borderRadius: 999,
              boxShadow: T.elevPill, fontFamily: "var(--font-sans)", textTransform: "capitalize",
            }}
          >
            {monthYearLabel(view, cursor)}
          </button>
          {datePickerOpen && (
            <MiniCalendar
              anchorRef={datePickerAnchor}
              value={cursor}
              onSelect={(d) => setCursor(startOfDay(d))}
              onClose={() => setDatePickerOpen(false)}
              align="left"
            />
          )}
        </div>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
        {connected && !isMobile && (
          <>
            {segmented}
            <button onClick={disconnect} aria-label="Déconnecter" title="Déconnecter" style={iconBtn()}>
              <LogOut size={15} strokeWidth={2} />
            </button>
          </>
        )}
      </div>
      <div id="tr4de-page-header-slot" />
    </div>
  );

  /* ─────────────── Time-grid (jour / semaine) ─────────────── */
  const renderTimeGrid = (daysCount) => {
    // Vue jour (1) et vue 3 jours (mobile) : ancrées sur le jour courant.
    // Vue semaine (7+) : ancrée sur le lundi de la semaine.
    const weekStart = daysCount >= 7 ? startOfWeekMonday(cursor) : startOfDay(cursor);
    const days = Array.from({ length: daysCount }, (_, i) => addDays(weekStart, i));
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const gutter = 54;
    // Minutes écoulées depuis minuit → position verticale de la ligne « maintenant ».
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowTop = (nowMin / 60) * HOUR_H;
    // Cellule qui héberge le résumé « tâches en attente » : aujourd'hui si visible, sinon la première.
    const overdueAnchor = Math.max(0, days.findIndex((d) => sameDay(d, today)));

    return (
      <div style={{ ...card(), border: "none", overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Les gouttières sont portées par le CONTENEUR QUI DÉFILE, pas par la
            carte : posées sur la carte, elles laisseraient la barre de
            défilement collée au bord blanc, en dehors de la marge qu'on vient
            de créer. La colonne des heures faisait respirer la gauche pendant
            que les colonnes de jours butaient sur le bord droit — les deux
            côtés sont maintenant à la même distance. */}
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: `0 ${CARD_PAD}px` }}>
        {/* En-tête jours : nom + numéro + tâches du jour, le tout épinglé en haut.
            Son `paddingTop` tient lieu de marge haute : mise sur le conteneur qui
            défile, elle disparaîtrait au premier tour de molette — un élément
            `sticky` se cale sur le bord du scroller, pas sur son rembourrage. */}
        <div style={{ position: "sticky", top: 0, zIndex: 8, background: T.white, paddingTop: CARD_PAD_TOP, display: "flex", borderBottom: `1px solid ${T.border}`, alignItems: "stretch" }}>
          <div style={{ width: gutter, flexShrink: 0 }} />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            const isPast = startOfDay(d) < today;
            const list = tasksByDay.get(dateKey(d)) || [];
            const allDay = allDayByDay.get(dateKey(d)) || [];
            // Aucun séparateur vertical dans l'en-tête : les colonnes de la grille
            // horaire portent déjà le leur, et le prolonger jusqu'au nom du jour
            // enferme l'en-tête dans des rails. Les traits s'arrêtent donc sous
            // les pastilles d'agenda.
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 3px 6px", minWidth: 0, opacity: isPast ? 0.45 : 1 }}>
                <div style={dayLabelStyle}>{WEEKDAYS[weekdayIdx(d)]}</div>
                <div style={{
                  marginTop: 3, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 26, height: 26, borderRadius: 999, padding: "0 7px",
                  fontSize: 14, fontWeight: isToday ? 700 : 600,
                  background: isToday ? T.text : "transparent", color: isToday ? T.textInverted : T.text,
                }}>{d.getDate()}</div>
                {/* Évènements « toute la journée » : au-dessus des tâches du jour */}
                {allDay.length > 0 && (
                  <div style={{ marginTop: 5, width: "100%", display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                    {allDay.map((ev) => <TaskRowChip key={ev.id} item={ev} onToggle={onToggleDone} onOpen={openEdit} />)}
                  </div>
                )}
                {/* Tâches du jour : pleine largeur de la colonne, empilées sous le numéro */}
                {list.length > 0 && (
                  <div style={{ marginTop: allDay.length > 0 ? 2 : 5, width: "100%", display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                    {list.map((it) => <TaskRowChip key={it.id} item={it} onToggle={onToggleDone} onOpen={openEdit} />)}
                  </div>
                )}
                {/* Résumé des tâches en attente : ouvre un popover façon Google Tasks */}
                {i === overdueAnchor && overdueTasks.length > 0 && (
                  <div style={{ marginTop: list.length > 0 ? 4 : 6, width: "100%", textAlign: "left" }}>
                    <button type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
                        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
                        const W = 320;
                        let left = r.left - W - 8;                          // à gauche du jour
                        if (left < 8) left = Math.min(r.right + 8, vw - W - 8); // sinon à droite
                        const top = Math.max(8, Math.min(r.top - 4, vh - 360));
                        setOverduePos({ top, left });
                        setOverdueOpen((o) => !o);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 5, width: "100%",
                        padding: "8px 16px", minHeight: 34, borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                        border: `1px solid ${T.border}`, background: T.white, color: T.text, fontSize: 13, fontWeight: 500,
                      }}>
                      <Target size={12} strokeWidth={2.2} color={T.blue} style={{ flexShrink: 0 }} />
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{overdueTasks.length} tâche{overdueTasks.length > 1 ? "s" : ""} en attente</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Grille horaire */}
        <div ref={gridRef} style={{ display: "flex", position: "relative" }}>
            {/* Cible du défilement d'ouverture : la ligne « maintenant » moins
                deux heures de contexte. Un repère plutôt qu'une coordonnée —
                c'est la mise en page réelle qui le place, pas nous.
                Il n'existe QUE si aujourd'hui est à l'écran : sur une autre
                journée, l'heure qu'il est ne désigne rien, et se caler dessus
                jetterait le matin hors de vue sans raison. Son absence est ce
                qui désarme le défilement. */}
            {days.some((d) => sameDay(d, today)) && (
              <div ref={nowAnchorRef} aria-hidden style={{ position: "absolute", top: Math.max(0, nowTop - 2 * HOUR_H), left: 0, width: 1, height: 1, pointerEvents: "none" }} />
            )}
            {/* Gouttière heures */}
            <div style={{ width: gutter, flexShrink: 0 }}>
              {hours.map((h) => (
                <div key={h} style={{ height: HOUR_H, position: "relative" }}>
                  {h !== 0 && <span style={{ position: "absolute", top: -7, right: 8, fontSize: 10, color: T.textMut }}>{pad(h)}:00</span>}
                </div>
              ))}
            </div>
            {/* Colonnes jours */}
            {days.map((d, di) => {
              const dk = dateKey(d);
              let layout = layoutDay(eventsByDay.get(dk) || [], d);
              // Aperçu live d'un évènement en cours de déplacement : on le retire de
              // sa colonne d'origine et on l'injecte dans la colonne cible.
              if (moveBox) {
                if (moveBox.dayKey !== dk) {
                  layout = layout.filter((e) => e.id !== moveBox.id);
                } else if (!layout.some((e) => e.id === moveBox.id)) {
                  layout = [...layout, { ...moveBox.ev, startMin: moveBox.startMin, endMin: moveBox.endMin, _col: 0, _cols: 1 }];
                }
              }
              const dragHere = dragBox && dragBox.dayKey === dk;
              const isToday = sameDay(d, today);
              const isPastDay = startOfDay(d) < today;
              return (
                <div key={di} data-daycol="" data-daykey={dk} onPointerDown={(e) => startDrag(e, d)} title="Glisser (ou toucher) pour créer un évènement" style={{
                  flex: 1, position: "relative", minWidth: 0, cursor: "pointer", userSelect: "none",
                  borderLeft: daysCount > 1 && di > 0 ? `1px solid ${T.border}` : "none",
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${HOUR_H - 1}px, ${T.border} ${HOUR_H - 1}px, ${T.border} ${HOUR_H}px)`,
                  height: 24 * HOUR_H,
                }}>
                  {/* Ligne « maintenant » (jour courant uniquement) */}
                  {isToday && (
                    <div style={{ position: "absolute", top: nowTop, left: 0, right: 0, height: 0, zIndex: 7, pointerEvents: "none" }}>
                      <div style={{ position: "absolute", left: -3, top: -3, width: 6, height: 6, borderRadius: "50%", background: T.red }} />
                      <div style={{ position: "absolute", left: 1, right: 0, top: -1, height: 2, background: T.red }} />
                    </div>
                  )}
                  {dragHere && (() => {
                    const lo = Math.min(dragBox.a, dragBox.b);
                    const hi = Math.max(dragBox.a, dragBox.b);
                    return (
                      <div style={{
                        position: "absolute", top: (lo / 60) * HOUR_H, height: Math.max(((hi - lo) / 60) * HOUR_H, 3),
                        left: 2, right: 2, background: "rgba(200, 222, 255, 0.45)", border: "none",
                        borderRadius: "var(--radius-field)", pointerEvents: "none", zIndex: 5,
                      }} />
                    );
                  })()}
                  {layout.map((ev) => {
                    // Pendant un redimensionnement, on affiche la plage en cours
                    // d'édition (prévisualisation live) au lieu des bornes d'origine.
                    const resizing = resizeBox && resizeBox.id === ev.id && resizeBox.dayKey === dk;
                    const moving = moveBox && moveBox.id === ev.id && moveBox.dayKey === dk;
                    const active = resizing || moving;
                    const sMin = resizing ? resizeBox.startMin : moving ? moveBox.startMin : ev.startMin;
                    const eMin = resizing ? resizeBox.endMin : moving ? moveBox.endMin : ev.endMin;
                    /* Les tranches de largeur (cf. `segmentsFor`) : l'évènement
                       n'est à demi-largeur que sur le temps partagé, et reprend
                       toute la place là où il est seul. Un bloc en cours de
                       déplacement, lui, suit le doigt d'un seul tenant — sa
                       plage change à chaque pixel, la redécouper en direct
                       ferait clignoter la grille. */
                    const segs = (!active && ev._segs && ev._segs.length)
                      ? ev._segs
                      : [{ startMin: sMin, endMin: eMin, col: ev._col || 0, span: 1 }];
                    const colW = 100 / (ev._cols || 1);
                    const paint = eventPaintOf(ev);
                    // Évènement déjà passé → estompé (jour révolu, ou fini avant maintenant).
                    const isPastEvent = isPastDay || (isToday && eMin <= nowMin);
                    /* Trois états, trois valeurs déjà publiées — aucune teinte
                       n'est dérivée ici. Le passé recule d'un cran de fond et
                       passe au texte atténué, mais GARDE son trait : c'est lui
                       qui dit de quelle couleur est l'évènement, et une journée
                       entamée doit rester lisible d'un coup d'œil jusqu'au soir.
                       Surtout pas d'`opacity` sur le bloc en revanche : elle
                       rendrait le fond translucide et laisserait voir les lignes
                       d'heures de la grille au travers. */
                    const bgCol = (isPastEvent || ev.isTask) ? paint.soft : paint.bg;
                    const txtCol = (ev.done || isPastEvent) ? T.textMut : paint.ink;
                    // Hauteur de la tranche qui porte le texte : c'est elle qui
                    // décide de la mise en page, pas la durée totale.
                    const headH = Math.max(((segs[0].endMin - segs[0].startMin) / 60) * HOUR_H, 16);
                    // Évènements courts (≤ 30 min) : titre et heure sur une seule
                    // ligne, l'heure poussée à droite.
                    const compact = (segs[0].endMin - segs[0].startMin) <= 30;
                    const minLbl = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
                    /* Plage complète, et pas seulement l'heure de début : la
                       hauteur du bloc donne bien la durée, mais à l'œil et à la
                       demi-heure près — savoir QUAND on est libre demande de
                       lire la fin. Le libellé est le même qu'en cours de
                       déplacement, où il l'a toujours été. Une fin à minuit est
                       ramenée à 23:59 : elle appartient au jour affiché. */
                    const timeLbl = `${minLbl(sMin)} – ${minLbl(eMin >= 1440 ? 1439 : eMin)}`;
                    /* Poignées de redimensionnement, sur TOUT bloc de la grille
                       — tâches comprises : une tâche posée à une heure est un
                       bloc de temps comme un autre, et rien ne justifiait qu'on
                       puisse la déplacer sans pouvoir l'allonger. La grille ne
                       reçoit que de l'horaire (le « toute la journée » vit dans
                       sa propre bande, au-dessus). Elles vivent sur la première
                       et la dernière tranche : les bords du bloc, quoi qu'il
                       arrive entre les deux. */
                    const handleStyle = (pos) => ({
                      position: "absolute", left: 0, right: 0, [pos]: 0, height: isMobile ? 14 : 8,
                      cursor: "ns-resize", zIndex: 2, touchAction: "none",
                    });
                    const R = "var(--radius-field)";
                    return (
                      <React.Fragment key={ev.id}>
                        {segs.map((seg, i) => {
                          const first = i === 0;
                          const last = i === segs.length - 1;
                          /* Écart réservé aux bords que touche un voisin venu
                             remplir la colonne (cf. `FILL_GAP`), et pris sur les
                             bords du BLOC seulement : entre deux tranches, il
                             découperait en morceaux un évènement continu. */
                          const gapTop = (first && ev._gapTop) ? FILL_GAP : 0;
                          const gapBottom = (last && ev._gapBottom) ? FILL_GAP : 0;
                          const top = (seg.startMin / 60) * HOUR_H + gapTop;
                          const full = ((seg.endMin - seg.startMin) / 60) * HOUR_H;
                          // Le minimum de 16 px ne vaut que pour un bloc d'un
                          // seul tenant : l'imposer à chaque tranche décollerait
                          // les morceaux les uns des autres.
                          const height = Math.max((segs.length === 1 ? Math.max(full, 16) : full) - gapTop - gapBottom, 6);
                          const left = seg.col * colW;
                          const w = seg.span * colW;
                          /* Étapes du créneau, et ce qui tient dedans. Calculé
                             ici et pas dans le JSX : le titre affiche le reste
                             en chiffres, et deux calculs séparés auraient fini
                             par se contredire. 15 px par ligne, sous le titre
                             et l'heure. */
                          const steps = first ? checklistFor(checklists, ev.id) : [];
                          const stepsRoom = (first && !compact && steps.length)
                            ? Math.floor((height - (headH > 28 ? 30 : 16)) / 15)
                            : 0;
                          const stepsShown = stepsRoom > 0 ? steps.slice(0, stepsRoom) : [];
                          const stepsLeft = steps.length - stepsShown.length;
                          return (
                            <div key={i}
                              onPointerDown={(e) => { e.stopPropagation(); startMove(e, ev, d); }}
                              onClick={(e) => e.stopPropagation()}
                              title={`${timeLbl} ${ev.summary}`}
                              style={{
                                position: "absolute", top, height, cursor: moving ? "grabbing" : "grab", touchAction: "none",
                                left: `calc(${left}% + 2px)`, width: `calc(${w}% - 4px)`,
                                backgroundColor: bgCol, borderLeft: `2px solid ${paint.accent}`,
                                // Seuls les coins du BLOC sont arrondis : entre
                                // deux tranches, l'arrondi ferait une encoche au
                                // milieu d'un évènement continu.
                                borderRadius: segs.length === 1 ? R : first ? `${R} ${R} 0 0` : last ? `0 0 ${R} ${R}` : 0,
                                padding: "2px 5px", overflow: "hidden", zIndex: active ? 6 : ev.isTask ? 3 : 1,
                                opacity: moving ? 0.92 : 1,
                                display: "flex", flexDirection: compact ? "row" : "column",
                                alignItems: compact ? "baseline" : "stretch", gap: compact ? 5 : 0,
                              }}>
                              {first && <div onPointerDown={(e) => startResize(e, ev, d, "top")} onClick={(e) => e.stopPropagation()} style={handleStyle("top")} />}
                              {first && (
                                <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: compact ? 1 : "none" }}>
                                  {/* La pastille passe AU-DESSUS de la poignée haute :
                                      sur un bloc de 30 min, la bande de redimensionnement
                                      recouvre la ligne de titre, et cocher la tâche
                                      redimensionnait au lieu de la terminer. */}
                                  {ev.isTask && (
                                    <span style={{ position: "relative", zIndex: 3, display: "inline-flex", flexShrink: 0 }}>
                                      <TaskCircle done={ev.done} onToggle={(e) => { e.stopPropagation(); onToggleDone(ev); }} />
                                    </span>
                                  )}
                                  {/* Le bloc ancré se signale : il n'a pas d'heure à lui,
                                      et rien d'autre dans la grille ne bouge tout seul. */}
                                  {ev.isAnchored && <Sunrise size={11} strokeWidth={2.2} color={txtCol} style={{ flexShrink: 0 }} />}
                                  <span style={{ fontSize: 10, fontWeight: 600, color: txtCol, textDecoration: ev.isTask && ev.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.summary}</span>
                                  {/* L'avancement en chiffres, mais seulement
                                      quand les étapes ne tiennent pas toutes
                                      dans le bloc : sous elles il ferait
                                      doublon, à leur place il est le seul
                                      indice qu'un créneau en porte. */}
                                  {stepsLeft > 0 && (() => {
                                    const p = checklistProgress(steps);
                                    return (
                                      <span style={{
                                        // 10 px : le plus petit cran de
                                        // l'échelle (lib/ui/type.ts), déjà
                                        // celui du titre et de l'heure du bloc.
                                        fontSize: 10, fontWeight: 600, color: txtCol, opacity: 0.7,
                                        flexShrink: 0, fontVariantNumeric: "tabular-nums",
                                      }}>
                                        {p.done}/{p.total}
                                      </span>
                                    );
                                  })()}
                                </span>
                              )}
                              {first && (compact
                                ? <span style={{ fontSize: 10, color: txtCol, flexShrink: 0, whiteSpace: "nowrap", opacity: 0.8 }}>{timeLbl}</span>
                                : (headH > 28 && <span style={{ fontSize: 10, color: txtCol, opacity: 0.8 }}>{timeLbl}</span>))}

                              {/* Les étapes, à même le bloc. Le compteur seul
                                  disait qu'il y en avait ; il fallait ouvrir
                                  pour savoir lesquelles — or c'est justement
                                  pendant le créneau qu'on veut les lire.

                                  Seulement là où il y a la place : sous 30 min
                                  le bloc n'a qu'une ligne, et en écrire trois
                                  hors de ses bornes les ferait flotter sur le
                                  créneau suivant. On n'affiche que ce qui tient,
                                  et le compteur dit le reste. */}
                              {stepsShown.length > 0 && (
                                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0, marginTop: 1 }}>
                                    {stepsShown.map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        /* Le bloc entier est une poignée de
                                           déplacement : sans ces deux arrêts,
                                           cocher une étape traînait le créneau. */
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); toggleEventStep(ev.id, item.id); }}
                                        title={item.text}
                                        style={{
                                          display: "flex", alignItems: "center", gap: 4, minWidth: 0,
                                          border: "none", background: "transparent", padding: 0,
                                          height: 15, cursor: "pointer", fontFamily: "inherit",
                                          textAlign: "left", color: txtCol,
                                        }}
                                      >
                                        <span style={{ flexShrink: 0, display: "inline-flex", opacity: item.done ? 0.9 : 0.55 }}>
                                          {item.done
                                            ? <Check size={10} strokeWidth={3} />
                                            : <Square size={9} strokeWidth={2.4} />}
                                        </span>
                                        <span style={{
                                          fontSize: 10, minWidth: 0,
                                          opacity: item.done ? 0.55 : 0.9,
                                          textDecoration: item.done ? "line-through" : "none",
                                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                        }}>
                                          {item.text}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                              )}
                              {last && <div onPointerDown={(e) => startResize(e, ev, d, "bottom")} onClick={(e) => e.stopPropagation()} style={handleStyle("bottom")} />}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  /* ─────────────── Vue Mois ─────────────── */
  const renderMonth = () => {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const gridStart = startOfWeekMonday(monthStart);
    /* Autant de semaines qu'il en faut pour couvrir le mois, pas six par
       principe : à six, un mois qui tient en cinq se voyait offrir une rangée
       entièrement hors mois, et la grille donnait à lire deux mois au lieu
       d'un. Les quelques jours voisins qui complètent la première et la
       dernière semaine restent, eux — une semaine coupée en son milieu se
       lirait plus mal que ces trois cases grisées. */
    const days = [];
    for (let w = gridStart; w <= monthEnd; w = addDays(w, 7)) {
      for (let i = 0; i < 7; i++) days.push(addDays(w, i));
    }
    return (
      <div style={{ ...card(), padding: `${CARD_PAD_TOP}px ${CARD_PAD}px 0`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          {WEEKDAYS.map((w) => (
            <div key={w} style={{ ...dayLabelStyle, padding: "10px 8px" }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(84px, 1fr)", flex: 1, minHeight: 0, overflowY: "auto" }}>
          {days.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = sameDay(d, today);
            const dayEvents = eventsByDay.get(dateKey(d)) || [];
            const shown = dayEvents.slice(0, 4);
            const overflow = dayEvents.length - shown.length;
            return (
              <div key={i} onClick={() => openDay(d)}
                style={{
                  cursor: "pointer",
                  borderRight: i % 7 !== 6 ? `1px solid ${T.border}` : "none",
                  borderBottom: i < days.length - 7 ? `1px solid ${T.border}` : "none",
                  padding: "6px 6px 8px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
                  opacity: inMonth ? 1 : 0.4,
                }}>
                <div style={{
                  alignSelf: "flex-start", fontSize: 12, fontWeight: isToday ? 700 : 500,
                  color: isToday ? T.textInverted : T.text, background: isToday ? T.text : "transparent",
                  borderRadius: 999, minWidth: 22, height: 22,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px",
                }}>{d.getDate()}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  {shown.map((ev) => (
                    <div key={ev.id} title={ev.summary} onClick={(e) => { e.stopPropagation(); openEdit(ev); }} style={{
                      display: "flex", alignItems: "center", gap: 4, minWidth: 0, cursor: "pointer",
                      fontSize: 10, color: ev.done ? T.textMut : eventTextColor(ev), background: eventColor(ev), borderRadius: "var(--radius-field)", padding: "1px 5px",
                    }}>
                      {ev.isTask && <TaskCircle done={ev.done} onToggle={(e) => { e.stopPropagation(); onToggleDone(ev); }} size={12} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: ev.isTask && ev.done ? "line-through" : "none" }}>
                        {!ev.allDay && !ev.isTask && <span style={{ color: T.textMut, marginRight: 3 }}>{eventTimeLabel(ev)}</span>}
                        {ev.summary}
                      </span>
                    </div>
                  ))}
                  {overflow > 0 && <div style={{ fontSize: 10, color: T.textMut, paddingLeft: 5 }}>+{overflow} autre{overflow > 1 ? "s" : ""}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ─────────────── Vue Année ─────────────── */
  const renderYear = () => {
    const year = cursor.getFullYear();
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(230px, 100%), 1fr))", gap: 12 }}>
        {Array.from({ length: 12 }, (_, m) => {
          const first = new Date(year, m, 1);
          const startPad = weekdayIdx(first);
          const daysInMonth = new Date(year, m + 1, 0).getDate();
          const cells = [];
          for (let i = 0; i < startPad; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
          return (
            <div key={m} style={{ ...card(), padding: 12 }}>
              <button onClick={() => { setCursor(new Date(year, m, 1)); setView("month"); }}
                style={{ display: "block", width: "100%", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 8, fontSize: 13, fontWeight: 500, color: T.text, letterSpacing: -0.1, textAlign: "center" }}>
                {MONTHS[m]}
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {WEEKDAYS_MIN.map((w, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: 10, color: T.textMut, fontWeight: 500 }}>{w}</div>
                ))}
                {cells.map((c, i) => {
                  if (!c) return <div key={i} />;
                  const isToday = sameDay(c, today);
                  const has = eventsByDay.has(dateKey(c));
                  return (
                    <button key={i} onClick={() => openDay(c)}
                      style={{
                        position: "relative", border: "none", cursor: "pointer", fontFamily: "inherit",
                        aspectRatio: "1 / 1", borderRadius: 6, fontSize: 10,
                        background: isToday ? T.text : has ? `color-mix(in srgb, ${T.blue} 10%, transparent)` : "transparent",
                        color: isToday ? T.textInverted : T.text, fontWeight: isToday || has ? 700 : 400,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                      {c.getDate()}
                      {has && !isToday && <span style={{ position: "absolute", bottom: 2, width: 3, height: 3, borderRadius: "50%", background: T.blue }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ─────────────── Corps ─────────────── */
  let body = null;
  if (!ready || configured === null) {
    /* Le mot « Chargement… » posé au centre d'une carte vide ne dit rien de ce
       qui arrive ; la silhouette de la liste d'évènements, si. */
    body = (
      <div style={{ ...card(), padding: 16 }} aria-busy="true">
        <SkeletonList rows={5} />
      </div>
    );
  } else if (configured === false) {
    body = (
      <div style={{ ...card(), padding: 32, textAlign: "center" }}>
        <AlertTriangle size={28} strokeWidth={1.5} color={T.amber} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>Google Agenda non configuré</div>
        <p style={{ fontSize: 13, color: T.textSub, maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
          L'administrateur doit renseigner <code style={codeStyle}>GOOGLE_CLIENT_ID</code> et{" "}
          <code style={codeStyle}>GOOGLE_CLIENT_SECRET</code> (variables d'environnement), puis déclarer l'URI de
          redirection <code style={codeStyle}>/api/google-calendar/callback</code> dans la Google Cloud Console.
        </p>
      </div>
    );
  } else if (connected && error === "insufficient_scope") {
    body = (
      <div style={{ ...card(), padding: 32, textAlign: "center" }}>
        <AlertTriangle size={28} strokeWidth={1.5} color={T.amber} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>Permission Google Calendar manquante</div>
        <p style={{ fontSize: 13, color: T.textSub, maxWidth: 480, margin: "0 auto 16px", lineHeight: 1.6 }}>
          La connexion a réussi, mais l'autorisation d'accès à ton agenda n'a pas été accordée. Reconnecte-toi
          en cochant bien la permission « Voir les évènements de ton agenda ». Si elle n'apparaît pas, le scope
          <code style={codeStyle}> calendar.readonly </code> doit d'abord être ajouté à l'écran de consentement OAuth
          dans la Google Cloud Console (et l'accès existant révoqué sur{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: T.blue }}>myaccount.google.com/permissions</a>).
        </p>
        <button onClick={() => { disconnect(); connect(); }} style={primaryBtn()}>
          <Plug size={15} strokeWidth={2} style={{ marginRight: 8 }} /> Reconnecter avec la permission
        </button>
      </div>
    );
  } else if (!connected) {
    body = (
      <div style={{ ...card(), padding: "48px 32px", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "var(--radius-modal)", background: T.accentBg, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <CalendarIcon size={26} strokeWidth={1.5} color={T.text} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>Connecte ton Google Agenda</div>
        <p style={{ fontSize: 13, color: T.textSub, maxWidth: 380, margin: "0 auto 20px", lineHeight: 1.6 }}>
          Visualise tes évènements directement dans tr4de. L'accès est en lecture seule — rien n'est modifié dans ton agenda.
        </p>
        <button onClick={connect} style={primaryBtn()}>
          <Plug size={15} strokeWidth={2} style={{ marginRight: 8 }} /> Connecter Google Agenda
        </button>
      </div>
    );
  } else {
    body = (
      <>
        {error && error !== "insufficient_scope" && (
          <div style={{ fontSize: 12, color: T.red, background: T.redBg, border: `1px solid ${T.redBd}`, borderRadius: 8, padding: "8px 12px" }}>
            {error}
          </div>
        )}
        {isMobile ? (
          // Mobile : interface unique basée sur 3 jours.
          renderTimeGrid(3)
        ) : (
          <>
            {view === "day" && renderTimeGrid(1)}
            {view === "week" && renderTimeGrid(7)}
            {view === "month" && renderMonth()}
            {view === "year" && renderYear()}
          </>
        )}
      </>
    );
  }

  return (
    /* Hauteur FIXE sur desktop : l'agenda est une vue d'application, pas un
       document. Sa barre de navigation et l'en-tête des jours doivent rester à
       l'écran pendant qu'on parcourt les heures — donc c'est la grille qui
       défile, pas la page.
       On se cale en `position: absolute` sur le conteneur scrollable de la
       coquille (il est en `position: relative`, cf. DashboardNew) plutôt que de
       faire descendre une hauteur de parent en parent : chaque étage de la
       chaîne — pourcentage, `min-height`, item flex — est une occasion pour la
       hauteur de redevenir « auto » sans prévenir, et c'est exactement ce qui
       laissait toute la page défiler. Les décalages reprennent les variables de
       gouttière de la coquille : rien ne bouge à l'écran.
       Sur mobile, la coquille rend son conteneur non scrollable (cf. globals) et
       c'est la page entière qui défile : on y reste dans le flux. */
    <div
      className="anim-1"
      style={{
        display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-sans)",
        ...(isMobile ? { minHeight: "100%" } : {
          position: "absolute",
          top: "var(--page-pad-top, 14px)",
          bottom: "var(--page-pad-bottom, 24px)",
          left: "var(--content-left, 40px)",
          right: "var(--page-gutter, 40px)",
        }),
      }}
    >
      {header}
      {/* `minHeight: 0` borne le corps à la place restante : c'est la grille qui
          défile, sous l'en-tête des jours épinglé, et la barre de navigation
          reste à l'écran — on change de semaine sans avoir à remonter.
          La vue année fait exception : plus haute qu'un écran, elle doit garder
          le droit de POUSSER, sinon son contenu déborderait sans pouvoir
          défiler. */}
      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0,
          minHeight: (isMobile || view !== "year") ? 0 : undefined,
          // La vue année est plus haute qu'un écran : puisque la page ne défile
          // plus, elle défile pour son compte.
          overflowY: (!isMobile && view === "year") ? "auto" : undefined,
          // Cf. `BODY_PULL` : ce qu'il faut rendre pour finir sur la ligne de la
          // barre latérale, que la vue tienne dans l'écran ou qu'elle défile.
          marginBottom: -BODY_PULL,
        }}
      >
        {body}
      </div>
      {modal && (
        <div onClick={() => !saving && setModal(null)} style={{ position: "fixed", inset: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24, overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card(), width: "100%", maxWidth: 540, padding: 0, boxShadow: "var(--elev-overlay)", transform: `translate(${modalPos.x}px, ${modalPos.y}px)` }}>
            {/* Barre du haut = poignée de déplacement (grise au survol, invisible sinon).
                Les icônes sont à l'intérieur de cette zone pour ne pas ajouter de marge. */}
            <div onMouseDown={startModalDrag} title="Glisser pour déplacer la fenêtre"
              onMouseEnter={() => setDragHover(true)} onMouseLeave={() => setDragHover(false)}
              style={{
                position: "relative",
                display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, padding: "4px 10px",
                cursor: modalDragging ? "grabbing" : "grab", userSelect: "none",
                borderTopLeftRadius: 12, borderTopRightRadius: 12,
                // Aplat d'encre dark-aware : le noir translucide en dur ne se
                // voyait pas sur la surface sombre d'une modale en thème sombre.
                background: (dragHover || modalDragging) ? FIELD_BG : "transparent",
                transition: "background-color 120ms ease",
              }}>
              {/* Poignée de déplacement (barre grise centrée) */}
              <div style={{
                position: "absolute", left: "50%", top: 6, transform: "translateX(-50%)",
                width: 40, height: 4, borderRadius: 999,
                background: (dragHover || modalDragging) ? T.textMut : T.border,
                transition: "background-color 120ms ease",
              }} />
              {/* Une séance importée ne se supprime pas, elle se masque : même
                  place, même geste, mais l'icône dit bien que le cours reste
                  dans le flux de l'établissement. */}
              {feedItem && (
                <button onMouseDown={(e) => e.stopPropagation()} onClick={hideFeedEvent}
                  aria-label="Masquer cette séance" title="Masquer cette séance" style={topIconBtn}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
                  <EyeOff size={15} strokeWidth={1.9} />
                </button>
              )}
              {modal.id && !isLocked(modal) && (
                <button onMouseDown={(e) => e.stopPropagation()} onClick={removeModal} disabled={saving} aria-label="Supprimer" title="Supprimer" style={topIconBtn}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.red; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
                  <Trash2 size={15} strokeWidth={1.9} />
                </button>
              )}
              <button onMouseDown={(e) => e.stopPropagation()} onClick={() => !saving && setModal(null)} aria-label="Fermer" title="Fermer" style={topIconBtn}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
                <IconX size={16} strokeWidth={1.9} />
              </button>
            </div>

            {/* Titre */}
            <div style={{ padding: "0 24px 0 58px" }}>
              <input ref={titleRef} value={modal.summary} onChange={(e) => setModal({ ...modal, summary: e.target.value })} placeholder="Ajouter un titre"
                style={{ width: "100%", border: "none", borderBottom: `2px solid ${T.border}`, outline: "none", fontFamily: "inherit", fontSize: 24, fontWeight: 400, color: T.text, padding: "6px 0", background: "transparent" }} />
            </div>

            {/* Onglets Événement / Tâche.
                - Modal d'évènement : bascule le formulaire entre mode Événement et mode Tâche
                  (le mode Tâche affiche date limite + masque la récurrence).
                - Tâche autonome (édition d'une Google Task) : simple libellé. */}
            <div style={{ display: "flex", gap: 6, padding: "12px 24px 4px 58px", alignItems: "center", flexWrap: "wrap" }}>
              {/* Bloc ancré : ni évènement Google ni tâche, la bascule n'aurait
                  rien à basculer — on annonce simplement ce qu'on édite. */}
              {modal.anchored ? (
                <>
                  <span style={{ minHeight: 28, padding: "5px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: `color-mix(in srgb, ${T.blue} 10%, transparent)`, color: T.blue }}>{(modal.anchorMode || "morning") === "evening" ? "Bloc du soir" : "Bloc du matin"}</span>
                  {/* Suspendre plutôt que supprimer : une semaine de vacances ne
                      doit pas coûter le réglage. À côté du badge, là où le modal
                      dit CE QU'ON ÉDITE, et non dans le formulaire, qui dit
                      comment le bloc se pose. */}
                  <button type="button"
                    onClick={() => setModal({ ...modal, anchorEnabled: modal.anchorEnabled === false })}
                    title={modal.anchorEnabled === false ? "Réactiver ce bloc" : "Suspendre sans supprimer"}
                    style={{
                      // Métrique des onglets voisins (cf. lib/ui/buttons.ts) :
                      // un bouton du site fait 34 px, badge ou pas à côté.
                      minHeight: 34, padding: "8px 16px", borderRadius: 999, border: "none", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 13, fontWeight: 500,
                      background: modal.anchorEnabled === false ? FIELD_BG : "transparent",
                      color: modal.anchorEnabled === false ? T.textMut : T.textSub,
                    }}>
                    {modal.anchorEnabled === false ? "Éteint" : "Actif"}
                  </button>
                </>
              ) : modal.kind === "event" ? (
                [{ k: "event", label: "Événement" }, { k: "tasks", label: "Tâche" }].map(({ k, label }) => {
                  const active = modalTab === k;
                  return (
                    <button key={k} type="button" onClick={() => setModalTab(k)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", fontFamily: "inherit",
                        fontSize: 13, fontWeight: 500,
                        background: active ? `color-mix(in srgb, ${T.blue} 10%, transparent)` : "transparent",
                        color: active ? T.blue : T.textMut, cursor: "pointer",
                      }}>
                      {label}
                    </button>
                  );
                })
              ) : (
                <span style={{ minHeight: 28, padding: "5px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: `color-mix(in srgb, ${T.blue} 10%, transparent)`, color: T.blue }}>Tâche</span>
              )}
            </div>

            {/* Corps — formulaire complet (l'onglet « Tâche » affiche le même
                formulaire en mode tâche : date limite + pas de récurrence). */}
            <div style={{ padding: "8px 24px 6px" }}>
              <>
              {/* Date / heures — résumé lisible, éditable au clic */}
              <FormRow icon={Clock} top={timeEdit || modal.anchored}>
                {/* Un bloc ancré n'a ni date ni heure de début : les deux se
                    déduisent du jour affiché. Il ne reste qu'une durée — et un
                    champ « durée » vaut mieux que deux heures dont on jetterait
                    la position (une nuit de sommeil finit d'ailleurs le
                    lendemain, ce que deux heures ne savent pas dire). */}
                {modal.anchored ? (
                  /* Même geste que la date d'un évènement : une phrase lisible,
                     qui s'ouvre au clic sur ses deux champs. Un bloc ancré n'a
                     ni date ni heure de début — il n'a qu'une durée et un écart
                     avec ce qui le suit. */
                  !timeEdit ? (
                    <button type="button" onClick={() => setTimeEdit(true)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: "2px 0", width: "100%" }}>
                      <div style={{ fontSize: 14, color: T.text, display: "flex", alignItems: "baseline", gap: 24, flexWrap: "wrap" }}>
                        <span>{anchorDurationLabel(modal.anchorMinutes)}</span>
                        <span>{modal.anchorGap ? `${anchorDurationLabel(modal.anchorGap)} avant l'ancre` : "collé à l'ancre"}</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.textMut, marginTop: 2 }}>Durée du bloc · écart avec ce qui le suit</div>
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, color: T.textMut, width: 46 }}>Durée</span>
                        <DurationField minutes={modal.anchorMinutes} onChange={(v) => setModal({ ...modal, anchorMinutes: v })} />
                      </div>
                      {/* L'écart : rien n'oblige un bloc à être collé à son
                          ancre. « Une heure de sport qui finit 5 min avant le
                          premier cours » ne se dit pas autrement, l'ancre
                          bougeant tous les jours. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, color: T.textMut, width: 46 }}>Écart</span>
                        <DurationField minutes={modal.anchorGap || 0} max={12 * 60} onChange={(v) => setModal({ ...modal, anchorGap: v })} />
                      </div>
                    </div>
                  )
                ) : !timeEdit ? (
                  <button type="button" onClick={() => setTimeEdit(true)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: "2px 0", width: "100%" }}>
                    <div style={{ fontSize: 14, color: T.text, display: "flex", alignItems: "baseline", gap: 24, flexWrap: "wrap" }}>
                      <span>{formatDateLong(modal.date)}</span>
                      <span>
                        {modal.allDay
                          ? (modal.endDate && modal.endDate !== modal.date ? `→ ${formatDateLong(modal.endDate)}` : "Toute la journée")
                          : `${modal.startTime} – ${modal.endTime}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: T.textMut, marginTop: 2 }}>Fuseau horaire · {(modal.kind === "task" || modalTab === "tasks") ? "Une seule fois" : recurrenceLabel(modal.recur)}</div>
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <DateField value={modal.date} onChange={(v) => setModal({ ...modal, date: v, endDate: modal.endDate < v ? v : modal.endDate })} />
                      {modal.allDay ? (
                        <>
                          <span style={{ color: T.textMut, fontSize: 13 }}>au</span>
                          <DateField value={modal.endDate} min={modal.date} onChange={(v) => setModal({ ...modal, endDate: v })} />
                        </>
                      ) : (
                        <>
                          <TimeField value={modal.startTime} onChange={(v) => setModal({ ...modal, startTime: v })} />
                          <span style={{ color: T.textMut }}>–</span>
                          <TimeField value={modal.endTime} onChange={(v) => setModal({ ...modal, endTime: v })} />
                        </>
                      )}
                    </div>
                    <button type="button" onClick={() => setModal({ ...modal, allDay: !modal.allDay })}
                      style={{
                        ...pillBtn, alignSelf: "flex-start",
                        background: modal.allDay ? `color-mix(in srgb, ${T.blue} 10%, transparent)` : T.white,
                        borderColor: modal.allDay ? `color-mix(in srgb, ${T.blue} 33%, transparent)` : T.border,
                        color: modal.allDay ? T.blue : T.text,
                        fontWeight: 500,
                      }}>
                      <span style={{
                        width: 15, height: 15, borderRadius: "var(--radius-field)", flexShrink: 0,
                        border: `1.5px solid ${modal.allDay ? T.blue : T.textMut}`,
                        background: modal.allDay ? T.blue : "transparent",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        // ✓ sur l'aplat bleu saturé : blanc dans les deux thèmes.
                        color: T.onSolid, fontSize: 10, lineHeight: 1,
                      }}>{modal.allDay ? "✓" : ""}</span>
                      Toute la journée
                    </button>
                  </div>
                )}
              </FormRow>

              {/* Bloc ancré — « réveil + préparation », « sommeil »… La case ne
                  s'offre qu'à la création, ou sur un bloc déjà ancré :
                  convertir un évènement Google déjà enregistré voudrait dire le
                  supprimer là-bas, et ce n'est pas une chose à faire dans le dos
                  de quelqu'un. */}
              {!(modal.kind === "task" || modalTab === "tasks") && (!modal.id || modal.anchored) && (
                <FormRow icon={Sunrise} top={modal.anchored}>
                  {!modal.anchored ? (
                    <button type="button"
                      onClick={() => {
                        setModalTab("event"); setTimeEdit(false);
                        setModal({
                          ...modal, anchored: true, allDay: false,
                          // À la coche, la durée est celle de la plage qu'on
                          // venait de dessiner dans la grille.
                          anchorMinutes: minutesBetween(modal.startTime, modal.endTime),
                          anchorBefore: defaultBefore(anchoredBlocks, modal.anchorMode || "morning"),
                        });
                      }}
                      style={{ ...pillBtn, alignSelf: "flex-start", background: T.white, borderColor: T.border, color: T.text, fontWeight: 500 }}>
                      <span style={{
                        width: 15, height: 15, borderRadius: "var(--radius-field)", flexShrink: 0,
                        border: `1.5px solid ${T.textMut}`, background: "transparent",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        color: T.onSolid, fontSize: 10, lineHeight: 1,
                      }} />
                      Bloc qui se cale tout seul
                    </button>
                  ) : (
                    /* Une seule pastille dit l'ancre en toutes lettres et ouvre
                       le menu qui la règle — même geste que la récurrence, au
                       lieu d'un panneau de réglages déplié en permanence. */
                    <div ref={anchorMenuRef} data-menu-root style={{ position: "relative" }}>
                      <button type="button"
                        onClick={() => { setAnchorMenuOpen((o) => !o); setAnchorDaysOpen(false); setColorOpen(false); setRemindOpen(false); }}
                        style={pillBtn}>
                        {anchorTargetLabel(modal, anchoredBlocks)}
                        <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
                      </button>
                      <Popover
                        anchorRef={anchorMenuRef}
                        open={anchorMenuOpen}
                        onClose={() => setAnchorMenuOpen(false)}
                        gap={4}
                        minWidth={260}
                        maxHeight={380}
                        style={{ background: T.white, border: "none", borderRadius: 12, padding: 6, boxShadow: "var(--elev-overlay)" }}
                      >
                        <>
                          <div style={menuLabel}>Se cale sur</div>
                          {[
                            { id: "morning", label: "Le 1ᵉʳ évènement du jour" },
                            { id: "evening", label: "Le réveil du lendemain" },
                          ].map((m) => {
                            const on = (modal.anchorMode || "morning") === m.id && !modal.anchorBefore;
                            return (
                              <button key={m.id} type="button"
                                onClick={() => setModal({
                                  ...modal, anchorMode: m.id, anchorBefore: "",
                                  /* Un bloc du soir tout neuf est presque
                                     toujours une nuit : on propose 8 h plutôt
                                     que la durée d'un réveil. Sur un bloc déjà
                                     enregistré, on ne touche à rien. */
                                  anchorMinutes: modal.anchorId
                                    ? modal.anchorMinutes
                                    : m.id === "evening" ? DEFAULT_SLEEP_MINUTES : DEFAULT_ANCHOR_MINUTES,
                                })}
                                style={{ ...menuItem, background: on ? T.accentBg : "transparent" }}>
                                {m.label}
                              </button>
                            );
                          })}
                          {/* Les blocs du même mode : « lecture juste avant
                              sommeil » se choisit ici, et pas en calculant
                              soi-même l'heure. */}
                          {(() => {
                            const mode = modal.anchorMode || "morning";
                            const famille = anchoredBlocks.filter((b) => b.anchor === mode && b.id !== modal.anchorId);
                            if (!famille.length) return null;
                            return (
                              <>
                                <div style={menuLabel}>Juste avant un autre bloc</div>
                                {famille.map((b) => (
                                  <button key={b.id} type="button"
                                    onClick={() => setModal({ ...modal, anchorBefore: b.id })}
                                    style={{ ...menuItem, background: modal.anchorBefore === b.id ? T.accentBg : "transparent" }}>
                                    {b.summary}
                                  </button>
                                ))}
                              </>
                            );
                          })()}
                          <div style={menuLabel}>Ce qui compte comme premier élément</div>
                          <button type="button"
                            onClick={() => setModal({ ...modal, anchorCountTasks: modal.anchorCountTasks === false })}
                            style={{ ...menuItem, display: "flex", alignItems: "center", gap: 8 }}>
                            <CheckBox on={modal.anchorCountTasks !== false} />
                            Les tâches posées à une heure
                          </button>
                        </>
                      </Popover>
                    </div>
                  )}
                </FormRow>
              )}

              {/* Jours du bloc ancré — la place qu'occupe la récurrence sur un
                  évènement, puisque c'est la même question : quand ça revient.
                  Le réveil au plus tard vit dans le même menu ; c'est lui qui
                  décide si le bloc se pose un jour vide, donc il appartient au
                  « quand ». */}
              {modal.anchored && (
                <FormRow icon={Repeat}>
                  <div ref={anchorDaysRef} data-menu-root style={{ position: "relative" }}>
                    <button type="button"
                      onClick={() => { setAnchorDaysOpen((o) => !o); setAnchorMenuOpen(false); setColorOpen(false); setRemindOpen(false); }}
                      style={pillBtn}>
                      {anchorDaysLabel(modal.anchorDays)}
                      {modal.anchorMaxStart ? ` · ${(modal.anchorMode || "morning") === "evening" ? "coucher" : "réveil"} ≤ ${modal.anchorMaxStart}` : ""}
                      <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
                    </button>
                    <Popover
                      anchorRef={anchorDaysRef}
                      open={anchorDaysOpen}
                      onClose={() => setAnchorDaysOpen(false)}
                      gap={4}
                      minWidth={260}
                      maxHeight={380}
                      style={{ background: T.white, border: "none", borderRadius: 12, padding: 10, boxShadow: "var(--elev-overlay)" }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <span style={menuLabel}>Jours</span>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {WEEKDAYS_MIN.map((lbl, i) => {
                              const jours = Array.isArray(modal.anchorDays) ? modal.anchorDays : ALL_DAYS;
                              const on = jours.includes(i);
                              return (
                                <button key={i} type="button" title={WEEKDAYS_FULL[i]}
                                  onClick={() => {
                                    const next = on ? jours.filter((d) => d !== i) : [...jours, i].sort((a, c) => a - c);
                                    // Tout décocher voudrait dire « jamais »,
                                    // ce que dit déjà l'interrupteur du bloc.
                                    setModal({ ...modal, anchorDays: next.length ? next : ALL_DAYS });
                                  }}
                                  style={{
                                    width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontFamily: "inherit",
                                    fontSize: 12, fontWeight: 500,
                                    border: `1px solid ${on ? T.blue : T.border}`,
                                    background: on ? T.blue : T.white, color: on ? T.onSolid : T.text,
                                  }}>{lbl}</button>
                              );
                            })}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <span style={menuLabel}>
                            {(modal.anchorMode || "morning") === "evening" ? "Coucher au plus tard" : "Réveil au plus tard"}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <input type="time" value={modal.anchorMaxStart || ""}
                              onChange={(e) => setModal({ ...modal, anchorMaxStart: e.target.value })}
                              style={{ ...DA_FIELD, width: 118, fontSize: 13, padding: "7px 12px" }} />
                            {modal.anchorMaxStart && (
                              <button type="button" onClick={() => setModal({ ...modal, anchorMaxStart: "" })}
                                aria-label="Retirer la limite" title="Retirer la limite"
                                style={{ border: "none", background: "transparent", cursor: "pointer", color: T.textMut, display: "inline-flex", alignItems: "center", padding: 2, borderRadius: 6 }}>
                                <IconX size={14} strokeWidth={2} />
                              </button>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: T.textMut, lineHeight: 1.45 }}>
                            {(modal.anchorMode || "morning") === "evening"
                              ? "La nuit s'allonge plutôt que de commencer plus tard quand le lendemain démarre tard."
                              : "Le bloc ne commence jamais après cette heure, et s'y pose même les jours sans rien. Vide : rien ces jours-là."}
                          </span>
                        </div>
                      </div>
                    </Popover>
                  </div>
                </FormRow>
              )}

              {/* Récurrence (évènements uniquement — masquée en mode tâche, et
                  sur un bloc ancré : « chaque jour » est déjà sa règle) */}
              {!(modal.kind === "task" || modalTab === "tasks" || modal.anchored) && (
                <FormRow icon={Repeat}>
                  <div ref={recurAnchor} data-menu-root style={{ position: "relative" }}>
                    <button type="button" onClick={() => { setRecurOpen((o) => !o); setColorOpen(false); setRemindOpen(false); }} style={pillBtn}>
                      {recurrenceLabel(modal.recur)}
                      <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
                    </button>
                    <Popover
                      anchorRef={recurAnchor}
                      open={recurOpen}
                      closeOnOutside={false}
                      gap={4}
                      minWidth={240}
                      maxHeight={380}
                      style={{ background: T.white, border: "none", borderRadius: 12, padding: 6, boxShadow: "var(--elev-overlay)" }}
                    >
                      <>
                        {RECUR_PRESETS.map((p) => {
                          const selected = (modal.recur?.preset || "once") === p.id;
                          return (
                            <button key={p.id} type="button"
                              onClick={() => {
                                if (p.id === "custom") {
                                  // Initialise une config personnalisée sensée si on n'en a pas déjà une.
                                  setRecur(modal.recur?.preset === "custom" ? {} : { preset: "custom", freq: "WEEKLY", interval: 1, byday: [], end: "never", count: 10, until: "" });
                                } else {
                                  setRecur({ preset: p.id });
                                  setRecurOpen(false);
                                }
                              }}
                              onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = T.bg; }}
                              onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                              style={{ width: "100%", textAlign: "left", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", fontSize:13, color: T.text, background: selected ? T.accentBg : "transparent", fontWeight: 500}}>
                              {p.label}
                            </button>
                          );
                        })}

                        {/* Panneau personnalisé */}
                        {modal.recur?.preset === "custom" && (
                          <div style={{ marginTop: 10, paddingTop: 4, display: "flex", flexDirection: "column", gap: 12 }}>
                            {/* Intervalle + fréquence */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, color: T.text }}>Tous les</span>
                              <input type="number" min={1} value={modal.recur.interval ?? 1}
                                onChange={(e) => setRecur({ interval: e.target.value })}
                                style={{ width: 52, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", color: T.text, background: DA_FIELD_BG, border: "none", borderRadius: "var(--radius-field)", outline: "none" }} />
                              <select value={modal.recur.freq || "WEEKLY"} onChange={(e) => setRecur({ freq: e.target.value })}
                                style={{ padding: "6px 8px", fontSize: 13, fontFamily: "inherit", color: T.text, background: DA_FIELD_BG, border: "none", borderRadius: "var(--radius-field)", outline: "none", cursor: "pointer" }}>
                                <option value="DAILY">jour(s)</option>
                                <option value="WEEKLY">semaine(s)</option>
                                <option value="MONTHLY">mois</option>
                                <option value="YEARLY">an(s)</option>
                              </select>
                            </div>

                            {/* Jours de la semaine (fréquence hebdomadaire) */}
                            {(modal.recur.freq || "WEEKLY") === "WEEKLY" && (
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                {WEEKDAY_OPTS.map((w) => {
                                  const on = (modal.recur.byday || []).includes(w.code);
                                  return (
                                    <button key={w.code} type="button"
                                      onClick={() => {
                                        const set = new Set(modal.recur.byday || []);
                                        if (set.has(w.code)) set.delete(w.code); else set.add(w.code);
                                        setRecur({ byday: WEEKDAY_OPTS.filter((x) => set.has(x.code)).map((x) => x.code) });
                                      }}
                                      style={{
                                        width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500,
                                        border: `1px solid ${on ? T.blue : T.border}`, background: on ? T.blue : T.white, color: on ? T.onSolid : T.text,
                                      }}>{w.label}</button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Condition de fin */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4 }}>Fin</span>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, cursor: "pointer" }}>
                                <input type="radio" name="recurEnd" checked={(modal.recur.end || "never") === "never"} onChange={() => setRecur({ end: "never" })} />
                                Jamais
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, cursor: "pointer" }}>
                                <input type="radio" name="recurEnd" checked={modal.recur.end === "count"} onChange={() => setRecur({ end: "count" })} />
                                Après
                                <input type="number" min={1} value={modal.recur.count ?? 10} disabled={modal.recur.end !== "count"}
                                  onChange={(e) => setRecur({ count: e.target.value })}
                                  style={{ width: 52, padding: "4px 8px", fontSize: 13, fontFamily: "inherit", color: T.text, background: DA_FIELD_BG, border: "none", borderRadius: "var(--radius-field)", outline: "none", opacity: modal.recur.end === "count" ? 1 : 0.5 }} />
                                occurrences
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, cursor: "pointer" }}>
                                <input type="radio" name="recurEnd" checked={modal.recur.end === "until"} onChange={() => setRecur({ end: "until", until: modal.recur.until || modal.date })} />
                                Le
                                {modal.recur.end === "until"
                                  ? <DateField value={modal.recur.until || modal.date} min={modal.date} onChange={(v) => setRecur({ until: v })} />
                                  : <span style={{ color: T.textMut }}>…</span>}
                              </label>
                            </div>
                          </div>
                        )}
                      </>
                    </Popover>
                  </div>
                </FormRow>
              )}

              {/* Lieu (évènement) / Date limite (tâche). Masqué sur un bloc
                  ancré, comme la description, les notifications et les objectifs :
                  le bloc ne retient que son titre, sa durée et sa couleur, et
                  proposer des champs qu'on jetterait à l'enregistrement serait
                  un mensonge poli. */}
              {!modal.anchored && ((modal.kind === "task" || modalTab === "tasks") ? (
                <FormRow icon={Target}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, color: T.textMut }}>Date limite</span>
                    <DateField value={modal.dueDate} onChange={(v) => setModal({ ...modal, dueDate: v })} />
                    {modal.dueDate && (
                      <button type="button" onClick={() => setModal({ ...modal, dueDate: "" })}
                        aria-label="Retirer la date limite" title="Retirer la date limite"
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: T.textMut, display: "inline-flex", alignItems: "center", padding: 2, borderRadius: 6 }}>
                        <IconX size={14} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </FormRow>
              ) : (
                <FormRow icon={MapPin}>
                  <input value={modal.location} onChange={(e) => setModal({ ...modal, location: e.target.value })} placeholder="Ajouter un lieu" style={rowInp} />
                </FormRow>
              ))}

              {/* Description */}
              {!modal.anchored && (
                <FormRow icon={AlignLeft} top>
                  <textarea value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} placeholder="Ajouter une description" rows={2} style={{ ...rowInp, resize: "vertical", display: "block", lineHeight: 1.4, verticalAlign: "top" }} />
                </FormRow>
              )}

              {/* Étapes de l'évènement — ce qu'on fait PENDANT le créneau.
                  Offertes aussi sur une séance importée : elles ne touchent
                  pas au flux, elles vivent à côté. Le mode tâche en est privé
                  (une tâche n'a pas de créneau à découper) et les blocs ancrés
                  aussi. */}
              {!modal.anchored && !(modal.kind === "task" || modalTab === "tasks") && (
                <FormRow icon={ListChecks} top>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {modalChecklist.map((item) => (
                      <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30 }}>
                        <button
                          type="button"
                          onClick={() => toggleChecklistStep(item.id)}
                          aria-label={item.done ? `Rouvrir : ${item.text}` : `Terminer : ${item.text}`}
                          style={{
                            border: "none", background: "transparent", padding: 0, cursor: "pointer",
                            display: "inline-flex", alignItems: "center", color: item.done ? T.blue : T.textMut,
                            flexShrink: 0,
                          }}
                        >
                          {item.done
                            ? <CheckSquare size={16} strokeWidth={1.9} />
                            : <Square size={16} strokeWidth={1.9} />}
                        </button>
                        <span style={{
                          flex: 1, minWidth: 0, fontSize: 14,
                          color: item.done ? T.textMut : T.text,
                          textDecoration: item.done ? "line-through" : "none",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {item.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeChecklistStep(item.id)}
                          aria-label={`Retirer : ${item.text}`}
                          style={{
                            border: "none", background: "transparent", padding: 2, cursor: "pointer",
                            color: T.textMut, display: "inline-flex", alignItems: "center",
                            borderRadius: 6, flexShrink: 0,
                          }}
                        >
                          <IconX size={13} strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                    {/* Entrée ajoute et laisse le curseur en place : on écrit
                        trois étapes à la suite sans reprendre la souris. */}
                    <input
                      value={checklistDraft}
                      onChange={(e) => setChecklistDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        addChecklistStep();
                      }}
                      onBlur={addChecklistStep}
                      placeholder={modalChecklist.length ? "Ajouter une étape" : "Découper en étapes (lire, noter, présenter…)"}
                      aria-label="Ajouter une étape"
                      style={rowInp}
                    />
                  </div>
                </FormRow>
              )}

              {/* Couleur */}
              <FormRow icon={CalendarIcon}>
                <div ref={colorAnchor} data-menu-root style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => {
                      /* On rouvre sur la portée DÉJÀ retenue : une séance mise
                         à part se rouvre sur elle-même, sinon on repartirait
                         sur le type sans voir qu'on écrase une exception. */
                      if (feedItem) setFeedScopeChoice(feedHasOwn ? "events" : feedHasCourse ? "courses" : "kind");
                      setColorOpen((o) => !o);
                      setRemindOpen(false);
                    }}
                    style={pillBtn}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: modal.colorId ? GCAL_COLORS[modal.colorId] : defaultSwatch, display: "inline-block" }} />
                    Couleur
                    <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
                  </button>
                  <Popover
                    anchorRef={colorAnchor}
                    open={colorOpen}
                    closeOnOutside={false}
                    gap={4}
                    style={{ background: T.white, border: "none", borderRadius: 12, padding: 10, boxShadow: "var(--elev-overlay)", display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <>
                      {/* Séance importée : la portée se choisit AVANT la teinte.
                          L'inverse (choisir puis étendre) fait passer la grille
                          par un état qu'on n'a pas demandé. */}
                      {feedItem && (
                        <PeriodPills
                          value={feedScopeChoice}
                          onChange={setFeedScopeChoice}
                          options={[
                            { id: "kind", label: "Le type" },
                            { id: "courses", label: "La matière" },
                            { id: "events", label: "La séance" },
                          ]}
                          rail
                          size={12}
                        />
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (feedItem) { paintFeed(feedScopeChoice, null); return; }
                            setModal({ ...modal, colorId: null }); setColorOpen(false);
                          }}
                          title={feedItem ? "Couleur du type de séance" : "Par défaut"}
                          style={{ width: 24, height: 24, borderRadius: "50%", background: defaultSwatch, border: (feedItem ? !feedHasOwn && feedScopeChoice === "events" : modal.colorId == null) ? `2px solid ${T.text}` : "1px solid rgba(0,0,0,0.12)", cursor: "pointer", padding: 0 }}
                        />
                        {Object.entries(GCAL_COLORS).map(([id, hex]) => (
                          <button key={id} type="button"
                            onClick={() => {
                              if (feedItem) { paintFeed(feedScopeChoice, id); return; }
                              setModal({ ...modal, colorId: id }); setColorOpen(false);
                            }}
                            title={`Couleur ${id}`}
                            style={{ width: 24, height: 24, borderRadius: "50%", background: hex, border: String(modal.colorId) === id ? `2px solid ${T.text}` : "1px solid rgba(0,0,0,0.12)", cursor: "pointer", padding: 0 }} />
                        ))}
                      </div>
                      {feedItem && (
                        <span style={{ fontSize: 11, color: T.textMut, maxWidth: 230, lineHeight: 1.45 }}>
                          {/* Ce que la portée choisie va emporter : sans le
                              dire, on ne sait pas si l'on repeint une séance ou
                              tout un semestre. Et une séance importée ne se
                              modifie pas — le flux la rendra identique. */}
                          {feedScopeChoice === "kind"
                            ? `Toutes les séances de type « ${feedKind ? KIND_LABELS[feedKind] : "—"} », ici comme dans les paramètres.`
                            : feedScopeChoice === "courses"
                              ? `Toutes les séances de « ${modal.course || modal.summary} », CM et TD compris.`
                              : "Cette séance seule, par exception."}
                          {" "}Seule la couleur se retouche : le reste vient de l’agenda importé.
                        </span>
                      )}
                    </>
                  </Popover>
                </div>
              </FormRow>

              {/* Notifications — plusieurs rappels possibles sur le même item.
                  Les rappels retenus sont affichés en pastilles retirables : sans
                  ça, un menu à cases cochées oblige à l'ouvrir pour savoir ce qui
                  est programmé. Un bloc ancré n'en a pas : on notifierait une
                  heure qui aura bougé avant la notification. */}
              {!modal.anchored && (
              <FormRow icon={Bell} top>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  {reminderList.length === 0 && (
                    <span style={{ fontSize: 13, color: T.textMut }}>Aucune notification</span>
                  )}
                  {reminderList.map((v) => (
                    <span key={String(v)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px 6px 12px", minHeight: 34, borderRadius: 999, border: `1px solid ${T.border}`, background: T.white, color: T.text, fontSize: 13, fontWeight: 500 }}>
                      {reminderLabel(v)}
                      <button type="button" onClick={() => setReminders(removeReminder(reminderList, v))}
                        aria-label={`Retirer « ${reminderLabel(v)} »`} title="Retirer cette notification"
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: T.textMut, display: "inline-flex", alignItems: "center", padding: 2, borderRadius: 6 }}>
                        <IconX size={13} strokeWidth={2} />
                      </button>
                    </span>
                  ))}

                  <div ref={remindAnchor} data-menu-root style={{ position: "relative" }}>
                    <button type="button" onClick={() => { setRemindOpen((o) => !o); setColorOpen(false); setRecurOpen(false); }} style={pillBtn}>
                      <Plus size={13} strokeWidth={2} color={T.textMut} />
                      Notification
                      <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
                    </button>
                    <Popover
                      anchorRef={remindAnchor}
                      open={remindOpen}
                      closeOnOutside={false}
                      gap={4}
                      minWidth={240}
                      maxHeight={340}
                      style={{ background: T.white, border: "none", borderRadius: 12, padding: 6, boxShadow: "var(--elev-overlay)" }}
                    >
                      <>
                        {/* Réglages exclusifs : ils remplacent toute la liste. */}
                        {[{ k: "none", label: "Aucune notification", on: reminderList.length === 0, apply: [] },
                          { k: "default", label: "Notifications par défaut", on: reminderList[0] === "default", apply: ["default"] }].map((o) => (
                          <button key={o.k} type="button"
                            onClick={() => setReminders(o.apply)}
                            onMouseEnter={(e) => { if (!o.on) e.currentTarget.style.background = T.bg; }}
                            onMouseLeave={(e) => { if (!o.on) e.currentTarget.style.background = "transparent"; }}
                            style={{ ...remindOptBtn, background: o.on ? T.accentBg : "transparent" }}>
                            {o.label}
                          </button>
                        ))}

                        <div style={{ height: 1, background: T.border, margin: "6px 4px" }} />

                        {REMINDER_PRESETS.map((m) => {
                          const on = reminderList.includes(m);
                          const full = !on && reminderCount >= MAX_REMINDERS;
                          return (
                            <button key={m} type="button" disabled={full}
                              onClick={() => setReminders(on ? removeReminder(reminderList, m) : addReminder(reminderList, m))}
                              onMouseEnter={(e) => { if (!on && !full) e.currentTarget.style.background = T.bg; }}
                              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
                              style={{ ...remindOptBtn, display: "flex", alignItems: "center", gap: 8, background: on ? T.accentBg : "transparent", cursor: full ? "not-allowed" : "pointer", opacity: full ? 0.45 : 1 }}>
                              {on ? <CheckSquare size={14} strokeWidth={2} color={T.text} /> : <Square size={14} strokeWidth={1.8} color={T.textMut} />}
                              {reminderLabel(m)}
                            </button>
                          );
                        })}

                        <div style={{ height: 1, background: T.border, margin: "6px 4px" }} />

                        {/* Délai libre : les six choix rapides ne couvrent pas « 2 h avant ». */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px 2px" }}>
                          <input type="number" min={0} value={customRemind}
                            onChange={(e) => setCustomRemind(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomReminder(); } }}
                            aria-label="Délai personnalisé"
                            style={{ width: 60, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", color: T.text, background: DA_FIELD_BG, border: "none", borderRadius: "var(--radius-field)", outline: "none" }} />
                          <select value={customRemindUnit} onChange={(e) => setCustomRemindUnit(e.target.value)}
                            aria-label="Unité du délai personnalisé"
                            style={{ padding: "6px 8px", fontSize: 13, fontFamily: "inherit", color: T.text, background: DA_FIELD_BG, border: "none", borderRadius: "var(--radius-field)", outline: "none", cursor: "pointer" }}>
                            {REMINDER_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                          </select>
                          <button type="button" onClick={addCustomReminder}
                            disabled={reminderCount >= MAX_REMINDERS}
                            style={{ ...ghostBtn(), opacity: reminderCount >= MAX_REMINDERS ? 0.45 : 1, cursor: reminderCount >= MAX_REMINDERS ? "not-allowed" : "pointer" }}>
                            Ajouter
                          </button>
                        </div>
                        {reminderCount >= MAX_REMINDERS && (
                          <div style={{ fontSize: 11, color: T.textMut, padding: "6px 10px 2px" }}>
                            {`Google Agenda accepte ${MAX_REMINDERS} notifications au maximum par évènement.`}
                          </div>
                        )}
                      </>
                    </Popover>
                  </div>
                </div>
              </FormRow>
              )}

              {/* Objectifs de l'année (cartes de la Quête de soi). Pour une tâche :
                  la terminer fait progresser chaque objectif lié. Pour un
                  évènement : chaque ÉTAPE cochée crédite `EVENT_STEP_XP` à
                  chacune des cartes liées — un créneau n'est pas terminé d'un
                  coup, il avance par ce qu'on y fait. La sélection reprend
                  toujours la couleur de la carte au passage. */}
              {!modal.anchored && (
              <FormRow icon={Sparkles} top>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.textSub, marginBottom: 8 }}>
                      {"Objectifs de l'année"}
                    </div>
                    {rpgCategories.length === 0 ? (
                      <div style={{ fontSize: 12, color: T.textMut }}>{"Définis tes objectifs de l'année sur la page « Objectifs » pour les lier ici."}</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {rpgCategories.map((c) => {
                          const sel = Array.isArray(modal.rpgCategories) ? modal.rpgCategories : [];
                          const active = sel.includes(c.id);
                          const toggle = () => setModal((m) => {
                            const cur = Array.isArray(m.rpgCategories) ? m.rpgCategories : [];
                            const willActive = !cur.includes(c.id);
                            const next = { ...m, rpgCategories: willActive ? [...cur, c.id] : cur.filter((x) => x !== c.id) };
                            // Sélectionner une catégorie adopte sa couleur par défaut
                            // (modifiable ensuite manuellement via le sélecteur de couleur).
                            if (willActive) next.colorId = nearestGcalColorId(c.color);
                            return next;
                          });
                          return (
                            <button key={c.id} type="button" onClick={toggle}
                              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 16px", minHeight: 34, borderRadius: 999, border: `1px solid ${active ? c.color : T.border}`, background: active ? `${c.color}14` : T.white, color: active ? c.color : T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                              {active
                                ? <Check size={13} strokeWidth={2.5} color={c.color} />
                                : <CatIcon name={c.icon} size={13} strokeWidth={1.9} color={T.textMut} />}
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </FormRow>
              )}
              </>

              {modalError && (
                <div style={{ fontSize: 12, color: T.red, background: T.redBg, border: "none", borderRadius: 10, padding: "8px 12px", marginTop: 8 }}>{modalError}</div>
              )}
            </div>

            {/* Pied */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "14px 24px", borderTop: `1px solid ${DA_HAIRLINE}` }}>
              {modal.htmlLink && !(modal.kind === "task" || modalTab === "tasks") && (
                <a href={modal.htmlLink} target="_blank" rel="noopener noreferrer" style={{ marginRight: "auto", fontSize: 12, color: T.blue, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <ExternalLink size={12} strokeWidth={2} /> Ouvrir dans Google
                </a>
              )}
              <button onClick={() => setModal(null)} disabled={saving} style={ghostBtn()}>
                {isLocked(modal) ? "Fermer" : "Annuler"}
              </button>
              {!isLocked(modal) && (
                <button onClick={saveModal} disabled={saving || !modal.summary.trim()} style={{ ...primaryBtn(true), opacity: saving || !modal.summary.trim() ? 0.5 : 1 }}>
                  {saving ? "…" : "Enregistrer"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Popover « Tâches en attente » façon Google Tasks */}
      {overdueOpen && overduePos && (
        <div onClick={() => setOverdueOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "absolute", top: overduePos.top, left: overduePos.left, width: 320,
            ...card(), boxShadow: "var(--elev-overlay)", padding: "12px 18px 16px",
            maxHeight: "70vh", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 2 }}>
              <a href="https://support.google.com/tasks" target="_blank" rel="noopener noreferrer" title="Aide" style={{ color: T.textMut, display: "inline-flex" }}>
                <HelpCircle size={16} strokeWidth={2} />
              </a>
              <button type="button" onClick={() => setOverdueOpen(false)} aria-label="Fermer" style={{ border: "none", background: "transparent", cursor: "pointer", color: T.textMut, display: "inline-flex", padding: 0 }}>
                <IconX size={16} strokeWidth={2} />
              </button>
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: T.text, letterSpacing: -0.2 }}>Tâches en attente</div>
            <div style={{ fontSize: 12, color: T.textMut, marginTop: 2 }}>Au cours des 365 derniers jours</div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              {overdueTasks.map((it) => {
                const rel = relativeDue(it.dueDate);
                const relCap = rel.charAt(0).toUpperCase() + rel.slice(1);
                return (
                  <div key={it.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ paddingTop: 2 }}>
                      <TaskCircle done={it.done} onToggle={(e) => { e.stopPropagation(); onToggleDone(it); }} size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button type="button" onClick={() => { setOverdueOpen(false); openEdit(it); }}
                        style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "block", width: "100%" }}>
                        <div style={{ fontSize: 14, color: T.text, textDecoration: it.done ? "line-through" : "none" }}>{it.summary}</div>
                        {it.description && (
                          <div style={{ fontSize: 12, color: T.textMut, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.description}</div>
                        )}
                      </button>
                      {/* Date limite dépassée. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, fontSize: 12, color: T.red }}>
                        <Target size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                        <span>Arrivée à échéance {rel}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: T.textMut }}>
                        <Clock size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                        <span>{relCap}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <a href="https://tasks.google.com" target="_blank" rel="noopener noreferrer" style={{ color: T.blue, fontSize: 13, fontWeight: 500 }}>Ouvrir Tasks</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Puce de tâche (rangée sous l'en-tête des jours) ─────────────── */
function TaskRowChip({ item, onToggle, onOpen, overdue = false }) {
  const isTask = !!item.isTask;
  /* Le neutre d'une tâche sans couleur est servi par `eventPaintOf` : il n'y a
     plus de cas particulier ici. Reste « en retard », qui doit se distinguer
     même quand la tâche est grise — sinon le retard passerait inaperçu. */
  const paint = eventPaintOf(item);
  const bgCol = isTask ? paint.soft : paint.bg;
  const barCol = overdue ? T.red : paint.accent;
  const txt = item.done ? T.textMut : (overdue ? T.red : paint.ink);
  const timeLbl = item.allDay ? "" : eventTimeLabel(item);
  // En attente : on rappelle la date limite (jj/mm) plutôt que l'heure.
  const overdueLbl = (() => {
    if (!overdue || !item.dueDate) return "";
    const [, mm, dd] = item.dueDate.split("-");
    return `${dd}/${mm}`;
  })();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onOpen(item); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item); } }}
      title={item.summary}
      style={{
        display: "flex", alignItems: "center", gap: 5, width: "100%",
        minWidth: 0, textAlign: "left", boxSizing: "border-box",
        padding: "2px 6px", borderRadius: "var(--radius-field)", cursor: "pointer", fontFamily: "inherit",
        background: bgCol, borderLeft: `2px solid ${barCol}`,
      }}
    >
      {isTask && <TaskCircle done={item.done} onToggle={(e) => { e.stopPropagation(); onToggle(item); }} size={12} />}
      <span style={{
        fontSize: 10, fontWeight: 600, color: txt, minWidth: 0, flex: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        textDecoration: item.done ? "line-through" : "none",
      }}>{item.summary}</span>
      {(overdueLbl || timeLbl) && (
        <span style={{ fontSize: 10, color: txt, opacity: 0.8, flexShrink: 0, whiteSpace: "nowrap" }}>
          {overdueLbl || timeLbl}
        </span>
      )}
    </div>
  );
}

/* ─────────────── Rond de complétion d'une tâche-évènement ─────────────── */
function TaskCircle({ done, onToggle, size = 13 }) {
  return (
    <button type="button" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={onToggle}
      aria-label={done ? "Marquer non terminée" : "Marquer terminée"} title="Terminer la tâche"
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0, cursor: "pointer", padding: 0,
        border: `1.5px solid ${done ? T.green : T.textMut}`,
        background: done ? T.green : "transparent",
        // Le ✓ est posé sur un aplat vert saturé : `onSolid` reste blanc dans
        // les deux thèmes, contrairement à `textInverted` qui s'inverse.
        display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.onSolid, fontSize: 10, lineHeight: 1,
      }}>
      {done ? "✓" : ""}
    </button>
  );
}

/* ─────────────── Ligne de formulaire (icône + contenu), façon Google Agenda ─────────────── */
function FormRow({ icon: Icon, children, top = false, iconColor }) {
  return (
    <div style={{ display: "flex", gap: 18, alignItems: top ? "flex-start" : "center", padding: "6px 0", minHeight: 42 }}>
      <div style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: top ? 8 : 0 }}>
        <Icon size={20} strokeWidth={1.9} color={iconColor || T.textMut} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/* ─────────────── Styles ───────────────
   Fabriques partagées par toute la page. C'est ici que passe le portage à la
   nouvelle DA : les cartes perdent leur bordure au profit de l'ombre très douce
   `elevCard`, les boutons prennent la métrique 12 px / Medium des autres pages,
   et plus aucun blanc n'est écrit en dur — `#fff` sur un aplat `T.text` devenait
   invisible en thème sombre, où cet aplat s'éclaircit. */
/* Mêmes valeurs que la carte de da.jsx, écrites à plat plutôt qu'en `{...CARD}` :
   les appelants posent leur propre padding, et `CARD` clipperait au passage tout
   ce qui dépasse (un menu ouvert depuis une carte). */
const card = () => ({ background: T.white, borderRadius: 12, boxShadow: T.elevCard });

/* Gouttières intérieures des vues d'agenda. `card()` ne les porte pas lui-même —
   il sert aussi à des blocs qui doivent rester pleins — et les grilles se
   collaient donc aux quatre bords. Le haut est plus court que les côtés :
   l'en-tête des jours a déjà son propre rembourrage, et la même valeur en aurait
   fait une bande. */
const CARD_PAD = 16;
const CARD_PAD_TOP = 10;
const subInp = { padding: "5px 4px", fontSize: 14, fontFamily: "inherit", color: T.text, background: "transparent", border: "none", borderRadius: 6, outline: "none", cursor: "pointer" };
const rowInp = { width: "100%", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14, color: T.text, padding: "5px 0", boxSizing: "border-box" };
// Bouton "pilule" moderne (couleur, notification)
// Bouton icône discret de la barre du haut du modal (fermer / supprimer).
const topIconBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 999, border: "none", background: "transparent",
  color: T.textMut, cursor: "pointer", fontFamily: "inherit",
  transition: "background-color 120ms ease, color 120ms ease",
};
// Ligne d'un menu déroulant de notification (choix exclusif ou case à cocher).
/* Deux briques des menus flottants du modal, reprises telles quelles du menu de
   récurrence : un intertitre en capitales et une ligne de choix pleine largeur.
   Elles étaient écrites à plat à chaque menu — les blocs ancrés en ouvrent deux
   de plus, c'était le moment de les nommer. */
const menuLabel = {
  fontSize: 11, fontWeight: 600, color: T.textMut,
  textTransform: "uppercase", letterSpacing: 0.4,
  padding: "8px 10px 4px",
};
const menuItem = {
  width: "100%", textAlign: "left", border: "none", borderRadius: 8,
  padding: "8px 10px", cursor: "pointer", fontFamily: "inherit",
  fontSize: 13, color: T.text, fontWeight: 500,
};

const remindOptBtn = {
  width: "100%", textAlign: "left", border: "none", borderRadius: 8,
  padding: "8px 10px", cursor: "pointer", fontFamily: "inherit",
  fontSize: 13, color: T.text, fontWeight: 500,
};
const pillBtn = {
  display: "inline-flex", alignItems: "center", gap: 8,
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: `1px solid ${T.border}`, background: T.white, color: T.text,
  fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
};
const codeStyle = { background: T.accentBg, padding: "1px 5px", borderRadius: "var(--radius-field)", fontSize: 12 };
/* Libellé de champ : la DA écrit ses libellés en minuscules, à 12 px, et les
   met en retrait par l'opacité (cf. `FieldLabel` de da.jsx) — les capitales
   espacées de 11 px appartenaient à l'ancienne. */
const fieldLbl = { display: "block", fontSize: 12, fontWeight: 500, color: T.text, opacity: 0.5, marginBottom: 6 };
// Aplat de la DA (components/ui/form.jsx) au lieu du cadre blanc souligne.
const inp = () => ({ ...DA_FIELD, fontSize: 14 });
const iconBtn = () => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 999, border: `1px solid ${T.border}`,
  background: T.white, color: T.text, cursor: "pointer", fontFamily: "inherit",
});
/* Trio de navigation de l'en-tête : trois pastilles blanches identiques,
   séparées par leur seul écart. Le blanc de la carte est celui du fond de page
   en thème clair — d'où l'ombre `elevPill`, la même que les autres pastilles de
   l'app : sans elle les boutons se dissoudraient dans la page. */
const stepBtn = () => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, borderRadius: 999,
  border: "none", background: T.white, boxShadow: T.elevPill, color: T.text,
  cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
});
const todayBtn = () => ({
  display: "inline-flex", alignItems: "center",
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: "none", background: T.white, boxShadow: T.elevPill, color: T.text,
  fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  whiteSpace: "nowrap",
});
/* Déclencheur du menu de vues : mêmes gabarit et graisse que « Aujourd'hui »,
   posé sur l'aplat des champs pour se lire comme un contrôle, pas un lien. */
const viewBtn = () => ({
  display: "inline-flex", alignItems: "center",
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: "none", background: T.white, boxShadow: T.elevPill, color: T.text,
  fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  whiteSpace: "nowrap",
});
const ghostBtn = () => ({
  display: "inline-flex", alignItems: "center",
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: "none", background: FIELD_BG, color: T.text,
  fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
});
const primaryBtn = (small = false) => ({
  display: "inline-flex", alignItems: "center",
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: "none", background: T.text, color: T.textInverted,
  fontSize: small ? 12 : 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
});
