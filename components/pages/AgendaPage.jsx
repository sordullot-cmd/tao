"use client";

import React from "react";
import {
  Calendar as CalendarIcon,
  LogOut, AlertTriangle, Plug, Trash2, X as IconX, ExternalLink,
  Clock, MapPin, AlignLeft, Bell, ChevronDown, Target, HelpCircle, Repeat,
  Plus, CheckSquare, Square, Check, Sparkles,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { useGoogleCalendar } from "@/lib/hooks/useGoogleCalendar";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { DateField, TimeField } from "./AgendaDateFields";
import MiniCalendar from "@/components/ui/MiniCalendar";
import { FIELD_BG, PeriodPills, StepperPill } from "@/components/ui/da";
import Popover from "@/components/ui/Popover";
import {
  RPG_STORAGE_KEY, RPG_CLOUD_KEY, DEFAULT_CATEGORIES, CatIcon,
  TASK_RPG_STORAGE_KEY, TASK_RPG_CLOUD_KEY,
  TASK_TIMES_STORAGE_KEY, TASK_TIMES_CLOUD_KEY,
} from "@/lib/lifeRpgCategories";
import { GCAL_COLORS, DEFAULT_EVENT_COLOR, nearestGcalColorId } from "@/lib/gcalColors";
import { FIELD as DA_FIELD } from "@/components/ui/form";
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

// Palette officielle Google Agenda (colorId 1–11) : voir l'import GCAL_COLORS /
// DEFAULT_EVENT_COLOR en tête de fichier (source partagée avec la page Vie RPG).

/** Éclaircit une couleur hex (mélange vers le blanc). */
function lighten(hex, f = 0.2) {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return hex;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * f); g = Math.round(g + (255 - g) * f); b = Math.round(b + (255 - b) * f);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
// Toutes les couleurs sont légèrement éclaircies à l'affichage.
const eventColor = (ev) => lighten(GCAL_COLORS[ev.colorId] || DEFAULT_EVENT_COLOR, 0.38);

/** Assombrit une couleur hex (pour le texte lié à la couleur de l'évènement). */
function darken(hex, f = 0.5) {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return "#0D0D0D";
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * (1 - f)); g = Math.round(g * (1 - f)); b = Math.round(b * (1 - f));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
// Texte d'un évènement : version foncée de sa couleur (ex. vert → vert foncé).
const eventTextColor = (ev) => darken(eventColor(ev), 0.5);

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

/** Déduit le champ `reminder` (minutes | "default" | "none") depuis l'évènement. */
function reminderFromEvent(ev) {
  const r = ev.reminders;
  if (!r) return 10;
  if (r.useDefault) return "default";
  if (Array.isArray(r.overrides) && r.overrides.length) return r.overrides[0].minutes;
  return "none";
}

/** Form vierge pour la création. */
function blankForm(day, startTime = "09:00", endTime = "10:00") {
  const dk = typeof day === "string" ? day : dateKey(day);
  return {
    kind: "event", done: false,
    id: null, htmlLink: null, summary: "", allDay: false, date: dk, endDate: dk, startTime, endTime,
    dueDate: "", // date limite (tâche) : facultative, aucune par défaut
    recur: { preset: "once" }, // récurrence : une seule fois par défaut
    masterId: null, masterStart: null, // série (event récurrent) : renseignés à l'édition
    location: "", description: "", guests: "", addMeet: false, hadMeet: false,
    colorId: null, transparency: "opaque", visibility: "default", reminder: 10,
    rpgCategories: [], // cartes Vie RPG liées (tâche) : XP à la complétion
    pendingTasks: [], // tâches Google à créer à l'enregistrement (nouvel évènement)
  };
}

/** Form pré-rempli depuis un évènement existant (ou une tâche-évènement). */
function formFromEvent(ev) {
  const summary = ev.summary === "(Sans titre)" ? "" : ev.summary;
  const common = {
    kind: ev.isTask ? "task" : "event", done: !!ev.done,
    id: ev.id, htmlLink: ev.htmlLink,
    location: ev.location || "", description: ev.description || "", colorId: ev.colorId || null,
    guests: (ev.guests || []).join(", "),
    addMeet: !!ev.hangoutLink, hadMeet: !!ev.hangoutLink,
    transparency: ev.transparency || "opaque", visibility: ev.visibility || "default",
    reminder: reminderFromEvent(ev),
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
    reminder: form.reminder,
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
    transparency: "opaque", visibility: "default", reminder: 10,
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

const REMINDER_OPTS = [
  { v: "none", label: "Aucune notification" },
  { v: 0, label: "À l'heure de l'évènement" },
  { v: 5, label: "5 minutes avant" },
  { v: 10, label: "10 minutes avant" },
  { v: 30, label: "30 minutes avant" },
  { v: 60, label: "1 heure avant" },
  { v: 1440, label: "1 jour avant" },
  { v: "default", label: "Notifications par défaut" },
];

const HOUR_H = 68; // hauteur d'une heure (px) dans le time-grid

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

/** Libellé mois + année courant ; "Mois1 – Mois2" si la période chevauche deux mois. */
function monthYearLabel(view, cursor) {
  if (view === "year") return String(cursor.getFullYear());
  if (view === "week") {
    const s = startOfWeekMonday(cursor);
    const e = addDays(s, 6);
    const m1 = s.getMonth(), y1 = s.getFullYear();
    const m2 = e.getMonth(), y2 = e.getFullYear();
    if (m1 === m2 && y1 === y2) return `${MONTHS[m1]} ${y1}`;
    if (y1 === y2) return `${MONTHS[m1]} – ${MONTHS[m2]} ${y1}`;
    return `${MONTHS[m1]} ${y1} – ${MONTHS[m2]} ${y2}`;
  }
  return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
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

/** Positionne les évènements horodatés d'un jour (clusters + colonnes). */
function layoutDay(evts, day) {
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
      for (const ev of cl) { ev._cols = colEnds.length; out.push(ev); }
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
    fetchEvents, createEvent, updateEvent, deleteEvent, getEvent, setEventDone,
    fetchTasks, createTask, updateTask, toggleTask, deleteTask,
  } = useGoogleCalendar();

  const [view, setView] = React.useState("week");
  const [cursor, setCursor] = React.useState(() => startOfDay(new Date()));
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  // Ancres des menus flottants : tous portalisés, il leur faut donc une
  // référence explicite vers leur déclencheur pour se placer.
  const datePickerAnchor = React.useRef(null);
  const recurAnchor = React.useRef(null);
  const colorAnchor = React.useRef(null);
  const remindAnchor = React.useRef(null);
  // Horloge courante : sert à tracer la ligne « maintenant » et à griser le passé.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const [events, setEvents] = React.useState([]);
  const [tasks, setTasks] = React.useState([]);
  const [taskTimes, setTaskTimes] = useCloudState(TASK_TIMES_KEY, TASK_TIMES_CLOUD_KEY, {});
  // Cartes Vie RPG (lecture seule ici — éditées sur la page « Vie RPG ») et
  // liaison « tâche → cartes » (+ complétion) que cette page écrit et que la
  // page Vie RPG lit pour créditer l'XP.
  const [rpgState] = useCloudState(RPG_STORAGE_KEY, RPG_CLOUD_KEY, { categories: DEFAULT_CATEGORIES });
  const rpgCategories = Array.isArray(rpgState.categories) ? rpgState.categories : DEFAULT_CATEGORIES;
  const [taskRpg, setTaskRpg] = useCloudState(TASK_RPG_STORAGE_KEY, TASK_RPG_CLOUD_KEY, {});
  const [eventTaskLinks, setEventTaskLinks] = useCloudState(EVENT_TASK_LINKS_KEY, "event_task_links", {}); // évènement → ids de tâches Google
  const [modalTab, setModalTab] = React.useState("event"); // vue interne du modal évènement : "event" | "tasks"
  const [taskDraft, setTaskDraft] = React.useState(""); // saisie d'ajout de tâche
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [modal, setModal] = React.useState(null); // form objet | null
  const [modalError, setModalError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [overdueOpen, setOverdueOpen] = React.useState(false);
  const [overduePos, setOverduePos] = React.useState(null); // { top, left } du popover
  const [colorOpen, setColorOpen] = React.useState(false);
  const [remindOpen, setRemindOpen] = React.useState(false);
  const [recurOpen, setRecurOpen] = React.useState(false);
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

  const range = React.useMemo(() => computeRange(view, cursor), [view, cursor]);

  const loadEvents = React.useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const evs = await fetchEvents(range.start.toISOString(), range.end.toISOString());
      setEvents(evs);
    } catch (e) {
      setEvents([]);
      if (e?.message !== "token_expired") setError(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [connected, range, fetchEvents]);

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
  const eventsByDay = React.useMemo(() => {
    const map = new Map();
    for (const ev of [...events, ...taskItems]) {
      const k = eventDayKey(ev);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : a.allDay ? -1 : 1));
    }
    return map;
  }, [events, taskItems]);

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
    for (const ev of events) {
      if (!ev.allDay || ev.isTask) continue;
      const k = eventDayKey(ev);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }
    for (const arr of map.values()) arr.sort((a, b) => String(a.summary).localeCompare(String(b.summary)));
    return map;
  }, [events]);

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
      try { await setEventDone(item.id, !item.done); } catch { loadEvents(); }
    }
  };

  const goToday = () => setCursor(startOfDay(new Date()));
  const openDay = (d) => { setCursor(startOfDay(d)); setView("day"); };
  const openCreate = (day, startTime, endTime) => { setModalError(null); setColorOpen(false); setRemindOpen(false); setRecurOpen(false); setTimeEdit(false); setModalTab("event"); setTaskDraft(""); setModal(blankForm(day || cursor, startTime, endTime)); };
  const openEdit = (item) => {
    setModalError(null); setColorOpen(false); setRemindOpen(false); setRecurOpen(false); setTimeEdit(false); setModalTab("event"); setTaskDraft("");
    const base = item.isGTask ? formFromTaskItem(item, taskTimes) : formFromEvent(item);
    if (item.isGTask) base.rpgCategories = taskRpg[item.id]?.categories || [];
    setModal(base);
    // Évènement récurrent : la règle est portée par l'évènement maître (les
    // occurrences sont dépliées). On la récupère en arrière-plan pour pré-remplir.
    if (!item.isTask && item.recurringEventId) {
      getEvent(item.recurringEventId)
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

  // Redimensionnement d'un évènement par ses bords (façon Google Agenda) :
  // on glisse le bord haut (modifie l'heure de début) ou bas (heure de fin),
  // par pas de 15 min, puis on enregistre la nouvelle plage.
  const startResize = (e, ev, d, edge) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
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
    const form = {
      ...formFromEvent(ev),
      allDay: false, date: dk, endDate: dk,
      startTime: toTime(startMin), endTime: toTime(endM),
    };
    const newStart = toISO(dk, form.startTime);
    const newEnd = toISO(dk, form.endTime);
    setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, start: newStart, end: newEnd } : x)));
    try {
      await updateEvent(ev.id, payloadFromForm(form));
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
      await updateEvent(ev.id, payloadFromForm(form));
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
      if (modal.kind === "task" || modalTab === "tasks") {
        const payload = taskPayloadFromForm(modal);
        // On édite une tâche existante seulement si le modal porte déjà une tâche ;
        // sur l'onglet « Tâche » d'un évènement, on crée toujours une nouvelle tâche.
        let taskId = modal.kind === "task" ? modal.id : null;
        if (taskId) await updateTask(taskId, payload);
        else { const r = await createTask(payload); taskId = r?.task?.id; }
        // Jour de planification + heure conservés côté tr4de : Google Tasks ne
        // stocke que la date limite (`due`), pas le jour où l'on pose la tâche.
        if (taskId) {
          const finalTimeId = taskId;
          setTaskTimes((prevTimes) => ({
            ...prevTimes,
            [finalTimeId]: modal.allDay
              ? { day: modal.date, colorId: modal.colorId || null }
              : { day: modal.date, startTime: modal.startTime, endTime: modal.endTime, colorId: modal.colorId || null },
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
        if (targetId) res = await updateEvent(targetId, payload);
        else res = await createEvent(payload);
        // Tâches en attente (ajoutées sur un nouvel évènement) : on crée les
        // vraies Google Tasks une fois l'id de l'évènement connu, puis on les lie.
        const savedId = modal.id || res?.event?.id;
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
        await deleteEvent(modal.id);
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
  const scrollRef = React.useRef(null);
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
    const el = scrollRef.current;
    // Tant que la grille n'a pas sa hauteur (rendu asynchrone), on n'a rien à
    // faire défiler : on retente au rendu suivant plutôt que de se figer en haut.
    if (!el || el.scrollHeight <= el.clientHeight) return;
    didScrollRef.current = true;
    // Cible : ligne « maintenant » placée avec ~2h de contexte au-dessus
    // (le navigateur clampe scrollTop si on dépasse le bas de la grille).
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    el.scrollTop = Math.max(0, (nowMinutes / 60) * HOUR_H - 2 * HOUR_H);
  });

  /* ─────────────── Header ─────────────── */
  /* Sélecteur de vues : la brique de la page Calendrier. Cette page en portait
     une copie — même intention, mais un gris, une ombre et une graisse à elle,
     donc deux sélecteurs qui ne se ressemblaient pas. */
  const segmented = (
    <PeriodPills value={view} onChange={setView} options={VIEWS} track size={14} />
  );

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {connected && !isMobile && (
        <>
          <button onClick={goToday} style={ghostBtn()}>Aujourd'hui</button>
          {/* Flèches + période dans la pastille de la page Calendrier, au lieu
              de deux chevrons nus suivis d'un libellé isolé. Le libellé garde son
              rôle de déclencheur du sélecteur de date (`onLabel`). */}
          <div ref={datePickerAnchor} style={{ position: "relative", display: "inline-flex" }}>
            <StepperPill
              label={monthYearLabel(view, cursor)}
              onPrev={() => setCursor(shiftCursor(view, cursor, -1))}
              onNext={() => setCursor(shiftCursor(view, cursor, 1))}
              onLabel={() => setDatePickerOpen((o) => !o)}
              labelTitle="Choisir une date"
            />
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
        </>
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
      <div style={{ ...card(), border: "none", overflow: "hidden" }}>
        <div ref={scrollRef} style={{ overflowY: "auto", maxHeight: "calc(100vh - 210px)" }}>
        {/* En-tête jours : nom + numéro + tâches du jour, le tout épinglé en haut */}
        <div style={{ position: "sticky", top: 0, zIndex: 8, background: T.white, display: "flex", borderBottom: `1px solid ${T.border}`, alignItems: "stretch" }}>
          <div style={{ width: gutter, flexShrink: 0 }} />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            const isPast = startOfDay(d) < today;
            const list = tasksByDay.get(dateKey(d)) || [];
            const allDay = allDayByDay.get(dateKey(d)) || [];
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 3px 6px", minWidth: 0, borderLeft: daysCount > 1 && i > 0 ? `1px solid ${T.border}` : "none", opacity: isPast ? 0.45 : 1 }}>
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
        <div style={{ display: "flex", position: "relative" }}>
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
                    const top = (sMin / 60) * HOUR_H;
                    const height = Math.max(((eMin - sMin) / 60) * HOUR_H, 16);
                    const w = 100 / ev._cols;
                    const left = ev._col * w;
                    // Les tâches reçoivent une teinte plus claire que les évènements
                    // pour les distinguer d'un coup d'œil.
                    const col = ev.isTask ? lighten(eventColor(ev), 0.32) : eventColor(ev);
                    // Évènement déjà passé → estompé (jour révolu, ou fini avant maintenant).
                    const isPastEvent = isPastDay || (isToday && eMin <= nowMin);
                    // Estompage du passé via une teinte éclaircie (et NON via l'opacité du
                    // bloc, qui rendrait le fond blanc translucide et laisserait voir les
                    // lignes d'heures de la grille au travers).
                    const dispCol = isPastEvent ? lighten(col, 0.55) : col;
                    // Teinte semi-transparente posée sur un fond blanc opaque :
                    // évite que les lignes d'heures du fond transparaissent à travers le bloc.
                    const tint = ev.isTask ? `${dispCol}1A` : `${dispCol}33`;
                    const txtCol = (ev.done || isPastEvent) ? T.textMut : eventTextColor(ev);
                    // Évènements courts (≤ 30 min) : titre et heure sur une seule
                    // ligne, l'heure poussée à droite.
                    const compact = (eMin - sMin) <= 30;
                    const minLbl = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
                    const timeLbl = active ? `${minLbl(sMin)} – ${minLbl(eMin >= 1440 ? 1439 : eMin)}` : eventTimeLabel(ev);
                    // Poignées de redimensionnement (évènements horaires uniquement).
                    const resizable = !ev.isTask;
                    const handleStyle = (pos) => ({
                      position: "absolute", left: 0, right: 0, [pos]: 0, height: isMobile ? 14 : 8,
                      cursor: "ns-resize", zIndex: 2, touchAction: "none",
                    });
                    return (
                      <div key={ev.id}
                        onPointerDown={(e) => { e.stopPropagation(); startMove(e, ev, d); }}
                        onClick={(e) => e.stopPropagation()}
                        title={`${timeLbl} ${ev.summary}`}
                        style={{
                          position: "absolute", top, height, cursor: moving ? "grabbing" : "grab", touchAction: "none",
                          left: `calc(${left}% + 2px)`, width: `calc(${w}% - 4px)`,
                          backgroundColor: T.white, backgroundImage: `linear-gradient(${tint}, ${tint})`, borderLeft: `2px solid ${dispCol}`, borderRadius: "var(--radius-field)",
                          padding: "2px 5px", overflow: "hidden", zIndex: active ? 6 : ev.isTask ? 3 : 1,
                          boxShadow: active ? "0 4px 14px rgba(0,0,0,0.16)" : "0 1px 3px rgba(0,0,0,0.12)",
                          opacity: moving ? 0.92 : 1,
                          display: "flex", flexDirection: compact ? "row" : "column",
                          alignItems: compact ? "baseline" : "stretch", gap: compact ? 5 : 0,
                        }}>
                        {resizable && (
                          <div onPointerDown={(e) => startResize(e, ev, d, "top")} onClick={(e) => e.stopPropagation()} style={handleStyle("top")} />
                        )}
                        <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: compact ? 1 : "none" }}>
                          {ev.isTask && <TaskCircle done={ev.done} onToggle={(e) => { e.stopPropagation(); onToggleDone(ev); }} />}
                          <span style={{ fontSize: 10, fontWeight: 600, color: txtCol, textDecoration: ev.isTask && ev.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.summary}</span>
                        </span>
                        {compact
                          ? <span style={{ fontSize: 10, color: txtCol, flexShrink: 0, whiteSpace: "nowrap", opacity: 0.8 }}>{timeLbl}</span>
                          : (height > 28 && <span style={{ fontSize: 10, color: txtCol, opacity: 0.8 }}>{timeLbl}</span>)}
                        {resizable && (
                          <div onPointerDown={(e) => startResize(e, ev, d, "bottom")} onClick={(e) => e.stopPropagation()} style={handleStyle("bottom")} />
                        )}
                      </div>
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
    const gridStart = startOfWeekMonday(monthStart);
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return (
      <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${T.border}` }}>
          {WEEKDAYS.map((w) => (
            <div key={w} style={{ ...dayLabelStyle, padding: "10px 8px" }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(110px, 1fr)" }}>
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
                  borderBottom: i < 35 ? `1px solid ${T.border}` : "none",
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
                      fontSize: 10, color: ev.done ? T.textMut : eventTextColor(ev), background: ev.isTask ? `${lighten(eventColor(ev), 0.32)}26` : `${eventColor(ev)}33`, borderRadius: "var(--radius-field)", padding: "1px 5px",
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-sans)" }} className="anim-1">
      {header}
      {body}
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
              {modal.id && (
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
              {modal.kind === "event" ? (
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
              <FormRow icon={Clock} top={timeEdit}>
                {!timeEdit ? (
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

              {/* Récurrence (évènements uniquement — masquée en mode tâche) */}
              {!(modal.kind === "task" || modalTab === "tasks") && (
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

              {/* Lieu (évènement) / Date limite (tâche) */}
              {(modal.kind === "task" || modalTab === "tasks") ? (
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
              )}

              {/* Description */}
              <FormRow icon={AlignLeft} top>
                <textarea value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} placeholder="Ajouter une description" rows={2} style={{ ...rowInp, resize: "vertical", display: "block", lineHeight: 1.4, verticalAlign: "top" }} />
              </FormRow>

              {/* Couleur */}
              <FormRow icon={CalendarIcon}>
                <div ref={colorAnchor} data-menu-root style={{ position: "relative" }}>
                  <button type="button" onClick={() => { setColorOpen((o) => !o); setRemindOpen(false); }} style={pillBtn}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: modal.colorId ? GCAL_COLORS[modal.colorId] : DEFAULT_EVENT_COLOR, display: "inline-block" }} />
                    Couleur
                    <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
                  </button>
                  <Popover
                    anchorRef={colorAnchor}
                    open={colorOpen}
                    closeOnOutside={false}
                    gap={4}
                    style={{ background: T.white, border: "none", borderRadius: 12, padding: 10, boxShadow: "var(--elev-overlay)", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}
                  >
                    <>
                      <button type="button" onClick={() => { setModal({ ...modal, colorId: null }); setColorOpen(false); }} title="Par défaut" style={{ width: 24, height: 24, borderRadius: "50%", background: DEFAULT_EVENT_COLOR, border: modal.colorId == null ? `2px solid ${T.text}` : "1px solid rgba(0,0,0,0.12)", cursor: "pointer", padding: 0 }} />
                      {Object.entries(GCAL_COLORS).map(([id, hex]) => (
                        <button key={id} type="button" onClick={() => { setModal({ ...modal, colorId: id }); setColorOpen(false); }} title={`Couleur ${id}`}
                          style={{ width: 24, height: 24, borderRadius: "50%", background: hex, border: String(modal.colorId) === id ? `2px solid ${T.text}` : "1px solid rgba(0,0,0,0.12)", cursor: "pointer", padding: 0 }} />
                      ))}
                    </>
                  </Popover>
                </div>
              </FormRow>

              {/* Notification — bouton moderne + menu */}
              <FormRow icon={Bell}>
                <div ref={remindAnchor} data-menu-root style={{ position: "relative" }}>
                  <button type="button" onClick={() => { setRemindOpen((o) => !o); setColorOpen(false); }} style={pillBtn}>
                    {REMINDER_OPTS.find((r) => String(r.v) === String(modal.reminder))?.label || "Notification"}
                    <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
                  </button>
                  <Popover
                    anchorRef={remindAnchor}
                    open={remindOpen}
                    closeOnOutside={false}
                    gap={4}
                    minWidth={200}
                    maxHeight={300}
                    style={{ background: T.white, border: "none", borderRadius: 12, padding: 6, boxShadow: "var(--elev-overlay)" }}
                  >
                    <>
                      {REMINDER_OPTS.map((r) => {
                        const selected = String(r.v) === String(modal.reminder);
                        return (
                          <button key={String(r.v)} type="button"
                            onClick={() => { setModal({ ...modal, reminder: r.v }); setRemindOpen(false); }}
                            onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = T.bg; }}
                            onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                            style={{ width: "100%", textAlign: "left", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", fontSize:13, color: T.text, background: selected ? T.accentBg : "transparent", fontWeight: 500}}>
                            {r.label}
                          </button>
                        );
                      })}
                    </>
                  </Popover>
                </div>
              </FormRow>

              {/* Objectifs de l'année (cartes de la Quête de soi). Pour une tâche :
                  la terminer fait progresser chaque objectif lié. Pour un évènement :
                  aucun XP, la sélection sert seulement à reprendre sa couleur. */}
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
              <button onClick={() => setModal(null)} disabled={saving} style={ghostBtn()}>Annuler</button>
              <button onClick={saveModal} disabled={saving || !modal.summary.trim()} style={{ ...primaryBtn(true), opacity: saving || !modal.summary.trim() ? 0.5 : 1 }}>
                {saving ? "…" : "Enregistrer"}
              </button>
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
  // Évènement « toute la journée » : couleur pleine de l'évènement, sans pastille.
  // Tâche : palette tâche (éclaircie) avec rond de complétion.
  const base = !isTask
    ? eventColor(item)
    : item.colorId ? lighten(GCAL_COLORS[item.colorId] || DEFAULT_EVENT_COLOR, 0.38) : (overdue ? T.textMut : T.blue);
  const txt = item.done ? T.textMut : darken(base, 0.5);
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
        background: `${base}1A`, borderLeft: `2px solid ${base}`,
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
