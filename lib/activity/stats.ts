/**
 * Lecture des journées mesurées : totaux, sessions de focus, score, rythme.
 *
 * Rien n'est stocké ici — tout est recalculé à partir des segments. C'est ce qui
 * permet de changer une règle de classement et de voir TOUT l'historique se
 * reclasser : les segments gardent l'app et le titre, la catégorie n'est qu'une
 * lecture. (Le segment porte bien une catégorie, écrite au moment de la mesure ;
 * `recategorize` la recalcule à la demande quand les règles ont bougé.)
 */

import {
  allCategories, categoryColor, categoryLabel, isBrowser, resolveProductivity, classifyDetailed,
  type ClassifySource, type Productivity,
} from "@/lib/activity/categories";
import type { ActivitySettings, DayLog, Segment } from "@/lib/activity/engine";

/* ─── Format ────────────────────────────────────────────────────────────── */

/** « 3 h 24 » / « 24 min » / « 48 s » — jamais « 0.4 h ». */
export function fmtDur(ms: number, opts: { short?: boolean } = {}): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return opts.short ? `${h}h${String(m).padStart(2, "0")}` : `${h} h ${String(m).padStart(2, "0")}`;
  if (m > 0) return `${m} min`;
  return `${total} s`;
}

/** « 14:32 » dans le fuseau local. */
export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export const HOUR = 3600_000;

/* ─── Types de sortie ───────────────────────────────────────────────────── */

export interface Bucket {
  id: string;
  label: string;
  color: string;
  ms: number;
  pct: number;
}

export interface AppBucket extends Bucket {
  cat: string;
  /** Titres les plus vus pour cette app, du plus long au plus court. */
  titles: { title: string; ms: number }[];
  /** Nom brut relevé par l'OS — c'est lui qu'une règle doit viser. */
  app: string;
  /** Vrai s'il s'agit d'un site vu dans un navigateur (règle sur le titre). */
  isSite: boolean;
  /**
   * Hôte relevé pour ce site, quand le navigateur a pu le dire — vide sinon.
   *
   * C'est LUI qu'une règle doit viser quand il existe : une règle de domaine
   * range toutes les pages du site d'un seul geste, là où une règle de titre
   * demande un mot commun à toutes ses pages — et la plupart n'en ont aucun.
   */
  site: string;
  /** Ce qui a décidé du classement, pour pouvoir l'expliquer et le corriger. */
  via: ClassifySource;
}

/**
 * Un pavé de la journée, tel qu'on le pose sur un calendrier.
 *
 * Ce n'est PAS un segment : un segment change à chaque bascule d'application, et
 * une journée en compte des centaines — posés tels quels sur une grille horaire,
 * ce sont des traits de deux pixels illisibles. Un pavé couvre un nombre entier
 * de créneaux d'une demi-heure, chacun attribué à la matière qui l'a le plus
 * occupé (cf. `dayBlocks`) : il fait donc au minimum trente minutes, et il
 * s'agrandit par demi-heures tant que la matière tient.
 */
export interface DayBlock {
  start: number;
  end: number;
  /** Temps réellement mesuré dedans — les micro-trous n'y sont pas comptés. */
  ms: number;
  cat: string;
  /** Application dominante, celle qui nomme le pavé. */
  label: string;
  /** Ce qu'il y a eu dedans, de la plus longue à la plus courte. */
  apps: BlockApp[];
  /** Bascules d'application à l'intérieur du pavé. */
  switches: number;
}

/**
 * Une application (ou un site) vue à l'intérieur d'un pavé.
 *
 * Elle porte de quoi être RANGÉE depuis là où on la lit : le nom brut relevé par
 * l'OS et la nature de la cible (un site se corrige par son titre, une app par
 * son nom) — les mêmes champs qu'un `AppBucket`, pour que le même geste marche
 * dans la liste des applications et dans le détail d'un pavé.
 */
export interface BlockApp {
  label: string;
  cat: string;
  ms: number;
  app: string;
  isSite: boolean;
  /** Titres de fenêtre les plus vus, du plus long au plus court. */
  titles: { title: string; ms: number }[];
}

export interface FocusSession {
  start: number;
  end: number;
  ms: number;
  /** Catégorie dominante de la session. */
  cat: string;
  /** App dominante de la session. */
  label: string;
  /** Nombre de bascules d'app à l'intérieur de la session. */
  switches: number;
}

export interface DayStats {
  date: string;
  activeMs: number;
  awayMs: number;
  productiveMs: number;
  neutralMs: number;
  distractingMs: number;
  byCategory: Bucket[];
  byApp: AppBucket[];
  focusSessions: FocusSession[];
  focusMs: number;
  longestFocusMs: number;
  /** Bascules d'application sur la journée. */
  switches: number;
  /** Bascules par heure active — la mesure de l'éparpillement. */
  switchesPerHour: number;
  firstAt: number | null;
  lastAt: number | null;
  /** Amplitude de la journée (premier → dernier signe d'activité). */
  spanMs: number;
  /** Temps d'amplitude non mesuré : pauses, déjeuner, poste quitté. */
  breakMs: number;
  /** Pauses distinctes (trous d'au moins 5 minutes dans l'amplitude). */
  breaks: { start: number; end: number; ms: number }[];
  /** 24 créneaux horaires, pour le rythme de la journée. */
  hourly: { hour: number; ms: number; productiveMs: number; distractingMs: number }[];
  /** 0 à 100 : part du temps actif passée en session de focus, moins l'éparpillement. */
  focusScore: number;
  segments: Segment[];
  /** La journée en pavés, pour la grille horaire. */
  blocks: DayBlock[];
}

/* ─── Journée ───────────────────────────────────────────────────────────── */

/**
 * Recalcule la catégorie ET le nom de chaque segment avec les règles COURANTES.
 *
 * Sans ça, corriger une règle ne changerait que l'avenir, et la page afficherait
 * deux vérités selon le jour regardé. Le NOM est relu pour la même raison :
 * l'ancien classement enregistrait « Google Chrome » là où le catalogue sait
 * maintenant lire « YouTube », et l'historique doit en profiter aussi.
 */
export function recategorize(day: DayLog, settings: ActivitySettings): Segment[] {
  return day.segments.map(seg => {
    /* L'hôte relevé à la mesure est réutilisé tel quel : sans lui, un
       reclassement rendrait au segment le nom deviné dans son titre — et
       « Spotify » redeviendrait le nom d'un morceau. */
    const { category, label } = classifyDetailed(seg.app, seg.title, settings.rules, seg.site);
    if (category === seg.cat && label === seg.label) return seg;
    return { ...seg, cat: category, label };
  });
}

function msOf(seg: Segment): number {
  return Math.max(0, seg.e - seg.s);
}

/** Regroupe les segments productifs contigus en sessions de focus. */
function buildFocusSessions(segments: Segment[], settings: ActivitySettings): FocusSession[] {
  const gapMs = Math.max(0, settings.focusGapMinutes) * 60_000;
  const minMs = Math.max(1, settings.focusMinMinutes) * 60_000;

  const runs: Segment[][] = [];
  let current: Segment[] = [];
  /* Fin de la dernière matière retenue, interruptions tolérées comprises : on
     mesure la continuité par rapport à ELLE et non au dernier segment productif,
     sinon une interruption de la longueur de la tolérance coupait la session
     qu'elle était censée ne pas casser. */
  let edge = 0;

  for (const seg of segments) {
    const productive = resolveProductivity(seg.cat, settings.productivity) === "productive";
    if (productive) {
      if (current.length && seg.s - edge <= gapMs) current.push(seg);
      else {
        if (current.length) runs.push(current);
        current = [seg];
      }
      edge = seg.e;
      continue;
    }
    // Segment non productif : une interruption courte (chercher une info,
    // répondre à un message) ne casse pas la session — c'est le principe de la
    // session de focus, sinon aucune journée réelle n'en contiendrait.
    if (!current.length) continue;
    if (msOf(seg) <= gapMs) { edge = seg.e; continue; }
    runs.push(current);
    current = [];
    edge = 0;
  }
  if (current.length) runs.push(current);

  return runs
    .map(run => {
      const start = run[0].s;
      const end = run[run.length - 1].e;
      const ms = run.reduce((n, s) => n + msOf(s), 0);
      const byCat = new Map<string, number>();
      const byApp = new Map<string, number>();
      for (const s of run) {
        byCat.set(s.cat, (byCat.get(s.cat) || 0) + msOf(s));
        byApp.set(s.label, (byApp.get(s.label) || 0) + msOf(s));
      }
      const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      return { start, end, ms, cat: top(byCat), label: top(byApp), switches: Math.max(0, run.length - 1) };
    })
    .filter(s => s.ms >= minMs);
}

/**
 * Les segments d'une journée regroupés en pavés posables sur un calendrier.
 *
 * La journée est découpée en CRÉNEAUX d'une demi-heure, calés sur l'horloge
 * (00, 30). Chaque créneau revient à la matière qui l'a le plus occupé, et deux
 * créneaux voisins qui reviennent à la même matière ne font qu'un pavé — qui
 * s'agrandit donc par demi-heures, indéfiniment tant que la matière tient.
 *
 * Pourquoi un pas fixe plutôt qu'un regroupement au fil des segments : une
 * journée réelle n'est pas une suite de blocs propres. On code, on répond à un
 * message, on revient, on regarde un graphique, on revient — posé tel quel, ça
 * donne une colonne de traits de quelques pixels qu'aucun œil ne lit, et le
 * calendrier ne sait plus dire à quoi la matinée est passée. Le créneau tranche
 * : sur une demi-heure, il n'y a qu'un gagnant, et c'est lui qu'on affiche.
 *
 * Ce que ça coûte, et qui est assumé : un vrai quart d'heure de messagerie au
 * milieu d'une demi-heure de code n'apparaît plus en propre. Il n'est pas perdu
 * pour autant — il reste dans `apps`, donc dans l'infobulle du pavé et dans le
 * détail qu'ouvre un clic, et les totaux de la journée le comptent exactement.
 * Le calendrier dit la FORME de la journée ; les chiffres, eux, sont ailleurs.
 *
 * `ms` reste le temps RÉELLEMENT mesuré : un pavé de 9 h à 10 h qui n'a vu que
 * cinquante minutes d'activité affiche cinquante minutes. Ce sont `start` et
 * `end` qui s'alignent sur les créneaux, pas la mesure.
 *
 * Deux réglages :
 *   • `slotMs` — la longueur du créneau, donc la hauteur minimale d'un pavé ;
 *   • `minSlotMs` — en dessous de cette mesure, un créneau reste VIDE. Sans ce
 *     plancher, trente secondes d'activité à 3 h du matin réserveraient une
 *     demi-heure entière sur la grille et se liraient comme une nuit de travail.
 */
export function dayBlocks(
  segments: Segment[],
  opts: { slotMs?: number; minSlotMs?: number } = {}
): DayBlock[] {
  const slotMs = Math.max(60_000, opts.slotMs ?? 30 * 60_000);
  /* Trois minutes sur trente : assez pour qu'un vrai passage compte, assez pour
     qu'un relevé isolé ne peuple pas la grille. */
  const minSlotMs = opts.minSlotMs ?? Math.round(slotMs / 10);
  if (!segments.length) return [];

  /* Les créneaux se calent sur minuit LOCAL, et non sur un multiple de l'époque
     Unix : c'est l'horloge de l'utilisateur qui doit tomber juste (9 h 00,
     9 h 30), et certains fuseaux sont décalés d'une demi-heure ou d'un quart. */
  const midnight = new Date(segments[0].s);
  midnight.setHours(0, 0, 0, 0);
  const base = midnight.getTime();
  const indexOf = (ms: number) => Math.floor((ms - base) / slotMs);
  const startOf = (i: number) => base + i * slotMs;

  interface Slot {
    i: number;
    ms: number;
    byCat: Map<string, number>;
    apps: Map<string, BlockApp>;
    /** Applications dans l'ordre où elles sont venues, doublons consécutifs ôtés. */
    seq: string[];
  }
  const slots = new Map<number, Slot>();

  const slotAt = (i: number): Slot => {
    let s = slots.get(i);
    if (!s) { s = { i, ms: 0, byCat: new Map(), apps: new Map(), seq: [] }; slots.set(i, s); }
    return s;
  };

  const addTitle = (a: BlockApp, title: string, ms: number) => {
    if (!title) return;
    const found = a.titles.find(t => t.title === title);
    if (found) found.ms += ms;
    else a.titles.push({ title, ms });
  };

  const addToSlot = (slot: Slot, seg: Segment, ms: number) => {
    slot.ms += ms;
    slot.byCat.set(seg.cat, (slot.byCat.get(seg.cat) || 0) + ms);
    const found = slot.apps.get(seg.label);
    if (found) {
      found.ms += ms;
      addTitle(found, seg.title, ms);
    } else {
      slot.apps.set(seg.label, {
        label: seg.label, cat: seg.cat, ms, app: seg.app, isSite: isBrowser(seg.app),
        titles: seg.title ? [{ title: seg.title, ms }] : [],
      });
    }
    if (slot.seq[slot.seq.length - 1] !== seg.label) slot.seq.push(seg.label);
  };

  // 1. Le temps mesuré tombe dans les créneaux qu'il traverse, découpé s'il faut.
  for (const seg of segments) {
    if (msOf(seg) <= 0) continue;
    const first = indexOf(seg.s);
    const last = indexOf(seg.e - 1);
    for (let i = first; i <= last; i++) {
      const from = Math.max(seg.s, startOf(i));
      const to = Math.min(seg.e, startOf(i + 1));
      if (to > from) addToSlot(slotAt(i), seg, to - from);
    }
  }

  // 2. Un créneau, une matière : celle qui l'a le plus occupé.
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const kept = [...slots.values()]
    .filter(s => s.ms >= minSlotMs)
    .sort((a, b) => a.i - b.i);

  // 3. Les créneaux voisins de même matière s'assemblent en un seul pavé.
  const blocks: DayBlock[] = [];
  let seq: string[] = [];
  let prevIndex = Number.NaN;
  let prevCat = "";

  const mergeApp = (b: DayBlock, a: BlockApp) => {
    const found = b.apps.find(x => x.label === a.label);
    if (!found) { b.apps.push({ ...a, titles: a.titles.map(t => ({ ...t })) }); return; }
    found.ms += a.ms;
    for (const t of a.titles) addTitle(found, t.title, t.ms);
  };

  for (const slot of kept) {
    const cat = top(slot.byCat);
    const open = blocks[blocks.length - 1];
    const continues = open && slot.i === prevIndex + 1 && cat === prevCat;

    if (!continues) {
      blocks.push({
        start: startOf(slot.i), end: startOf(slot.i + 1), ms: 0,
        cat, label: "", apps: [], switches: 0,
      });
      seq = [];
    }
    const b = blocks[blocks.length - 1];
    b.end = startOf(slot.i + 1);
    b.ms += slot.ms;
    for (const a of slot.apps.values()) mergeApp(b, a);
    for (const label of slot.seq) if (seq[seq.length - 1] !== label) seq.push(label);
    b.switches = Math.max(0, seq.length - 1);

    prevIndex = slot.i;
    prevCat = cat;
  }

  for (const b of blocks) {
    b.apps.sort((a, c) => c.ms - a.ms);
    for (const a of b.apps) a.titles.sort((x, y) => y.ms - x.ms);
    b.label = b.apps[0]?.label ?? "";
  }
  return blocks;
}

export function dayStats(day: DayLog, settings: ActivitySettings): DayStats {
  const segments = recategorize(day, settings)
    .filter(s => msOf(s) > 0)
    .sort((a, b) => a.s - b.s);

  const activeMs = segments.reduce((n, s) => n + msOf(s), 0);

  const catMs = new Map<string, number>();
  const appMs = new Map<string, {
    ms: number; cat: string; app: string; isSite: boolean; site: string; via: ClassifySource;
    titles: Map<string, number>;
  }>();
  const perProd: Record<Productivity, number> = { productive: 0, neutral: 0, distracting: 0 };
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, ms: 0, productiveMs: 0, distractingMs: 0 }));

  for (const seg of segments) {
    const ms = msOf(seg);
    catMs.set(seg.cat, (catMs.get(seg.cat) || 0) + ms);
    perProd[resolveProductivity(seg.cat, settings.productivity)] += ms;

    const app = appMs.get(seg.label) || (() => {
      // Le « pourquoi » du classement se relit sur le segment : c'est ce qui
      // permet à la liste des applications de proposer la bonne correction
      // (une règle sur le titre pour un site, sur l'app sinon).
      const d = classifyDetailed(seg.app, seg.title, settings.rules, seg.site);
      return {
        ms: 0, cat: seg.cat, app: seg.app, isSite: d.isSite, via: d.via,
        site: seg.site || "",
        titles: new Map<string, number>(),
      };
    })();
    app.ms += ms;
    app.cat = seg.cat;
    if (!app.site && seg.site) app.site = seg.site;
    if (seg.title) app.titles.set(seg.title, (app.titles.get(seg.title) || 0) + ms);
    appMs.set(seg.label, app);

    // Un segment peut chevaucher plusieurs heures : on répartit au prorata,
    // sinon une session de 11 h 50 à 12 h 40 se lirait entièrement à 11 h.
    let cursor = seg.s;
    while (cursor < seg.e) {
      const d = new Date(cursor);
      const nextHour = new Date(d);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(d.getHours() + 1);
      const slice = Math.min(seg.e, nextHour.getTime()) - cursor;
      const bucket = hourly[d.getHours()];
      bucket.ms += slice;
      const nature = resolveProductivity(seg.cat, settings.productivity);
      if (nature === "productive") bucket.productiveMs += slice;
      if (nature === "distracting") bucket.distractingMs += slice;
      cursor += slice;
    }
  }

  const pct = (ms: number) => (activeMs > 0 ? (ms / activeMs) * 100 : 0);

  const byCategory: Bucket[] = allCategories()
    .map(c => ({ id: c.id, label: categoryLabel(c.id), color: c.color, ms: catMs.get(c.id) || 0, pct: pct(catMs.get(c.id) || 0) }))
    .filter(b => b.ms > 0)
    .sort((a, b) => b.ms - a.ms);

  const byApp: AppBucket[] = [...appMs.entries()]
    .map(([label, v]) => ({
      id: label,
      label,
      color: categoryColor(v.cat),
      cat: v.cat,
      app: v.app,
      isSite: v.isSite,
      site: v.site,
      via: v.via,
      ms: v.ms,
      pct: pct(v.ms),
      titles: [...v.titles.entries()].map(([title, ms]) => ({ title, ms })).sort((a, b) => b.ms - a.ms).slice(0, 6),
    }))
    .sort((a, b) => b.ms - a.ms);

  const switches = segments.reduce((n, s, i) => (i > 0 && segments[i - 1].label !== s.label ? n + 1 : n), 0);

  const firstAt = segments.length ? segments[0].s : null;
  const lastAt = segments.length ? segments[segments.length - 1].e : null;
  const spanMs = firstAt != null && lastAt != null ? lastAt - firstAt : 0;

  const breaks: { start: number; end: number; ms: number }[] = [];
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].s - segments[i - 1].e;
    if (gap >= 5 * 60_000) breaks.push({ start: segments[i - 1].e, end: segments[i].s, ms: gap });
  }

  const focusSessions = buildFocusSessions(segments, settings);
  const focusMs = focusSessions.reduce((n, s) => n + s.ms, 0);
  const longestFocusMs = focusSessions.reduce((n, s) => Math.max(n, s.ms), 0);

  const activeHours = activeMs / HOUR;
  const switchesPerHour = activeHours > 0 ? switches / activeHours : 0;

  /* Score de focus — deux parts :
       • 70 points pour la part du temps actif passée en session de focus ;
       • 30 points pour la stabilité, perdus progressivement jusqu'à 30
         bascules d'app par heure (au-delà, la journée est hachée).
     Aucune journée vide ne mérite un score : sans temps actif, il vaut 0 et non
     100, qu'un ratio 0/0 aurait pu donner. */
  const focusRatio = activeMs > 0 ? focusMs / activeMs : 0;
  const stability = 1 - Math.min(switchesPerHour / 30, 1);
  const focusScore = activeMs > 0 ? Math.round(70 * focusRatio + 30 * stability) : 0;

  return {
    date: day.date,
    activeMs,
    awayMs: day.awayMs || 0,
    productiveMs: perProd.productive,
    neutralMs: perProd.neutral,
    distractingMs: perProd.distracting,
    byCategory,
    byApp,
    focusSessions,
    focusMs,
    longestFocusMs,
    switches,
    switchesPerHour,
    firstAt,
    lastAt,
    spanMs,
    breakMs: Math.max(0, spanMs - activeMs),
    breaks,
    hourly,
    focusScore,
    segments,
    blocks: dayBlocks(segments),
  };
}

/* ─── Période ───────────────────────────────────────────────────────────── */

export interface RangeStats {
  days: DayStats[];
  /** Jours où quelque chose a été mesuré. */
  activeDays: number;
  activeMs: number;
  focusMs: number;
  productiveMs: number;
  distractingMs: number;
  byCategory: Bucket[];
  byApp: AppBucket[];
  /** Moyenne par jour mesuré (et non par jour du calendrier). */
  avgActiveMs: number;
  avgFocusMs: number;
  avgScore: number;
  /** Meilleur jour de la période, au temps de focus. */
  bestDay: DayStats | null;
  /** Rythme moyen : 24 créneaux, temps cumulé sur la période. */
  hourly: { hour: number; ms: number; productiveMs: number; distractingMs: number }[];
}

export function rangeStats(logs: DayLog[], settings: ActivitySettings): RangeStats {
  const days = logs.map(l => dayStats(l, settings));
  const measured = days.filter(d => d.activeMs > 0);

  const activeMs = days.reduce((n, d) => n + d.activeMs, 0);
  const focusMs = days.reduce((n, d) => n + d.focusMs, 0);
  const productiveMs = days.reduce((n, d) => n + d.productiveMs, 0);
  const distractingMs = days.reduce((n, d) => n + d.distractingMs, 0);

  const catMs = new Map<string, number>();
  const appMs = new Map<string, { ms: number; cat: string; app: string; isSite: boolean; site: string; via: ClassifySource }>();
  for (const d of days) {
    for (const b of d.byCategory) catMs.set(b.id, (catMs.get(b.id) || 0) + b.ms);
    for (const a of d.byApp) {
      const prev = appMs.get(a.label)
        || { ms: 0, cat: a.cat, app: a.app, isSite: a.isSite, site: a.site || "", via: a.via };
      appMs.set(a.label, { ...prev, ms: prev.ms + a.ms, site: prev.site || a.site || "" });
    }
  }
  const pct = (ms: number) => (activeMs > 0 ? (ms / activeMs) * 100 : 0);

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, ms: 0, productiveMs: 0, distractingMs: 0 }));
  for (const d of days) {
    for (const h of d.hourly) {
      hourly[h.hour].ms += h.ms;
      hourly[h.hour].productiveMs += h.productiveMs;
      hourly[h.hour].distractingMs += h.distractingMs;
    }
  }

  return {
    days,
    activeDays: measured.length,
    activeMs,
    focusMs,
    productiveMs,
    distractingMs,
    byCategory: [...catMs.entries()]
      .map(([id, ms]) => ({ id, label: categoryLabel(id), color: categoryColor(id), ms, pct: pct(ms) }))
      .filter(b => b.ms > 0)
      .sort((a, b) => b.ms - a.ms),
    byApp: [...appMs.entries()]
      .map(([label, v]) => ({
        id: label, label, color: categoryColor(v.cat), cat: v.cat, app: v.app,
        isSite: v.isSite, site: v.site, via: v.via, ms: v.ms, pct: pct(v.ms), titles: [],
      }))
      .sort((a, b) => b.ms - a.ms),
    avgActiveMs: measured.length ? activeMs / measured.length : 0,
    avgFocusMs: measured.length ? focusMs / measured.length : 0,
    avgScore: measured.length ? Math.round(measured.reduce((n, d) => n + d.focusScore, 0) / measured.length) : 0,
    bestDay: measured.length ? measured.reduce((best, d) => (d.focusMs > best.focusMs ? d : best), measured[0]) : null,
    hourly,
  };
}

/**
 * Applications jamais classées : la file d'attente de la page « Règles ».
 *
 * Le classement est REFAIT avec les règles courantes, il n'est pas relu dans
 * l'historique : une application rangée hier (ou reconnue depuis par le
 * catalogue) doit disparaître de la file, pas y rester jusqu'à la fin des
 * trente jours.
 */
export function unclassified(logs: DayLog[], settings: ActivitySettings): AppBucket[] {
  const map = new Map<string, {
    ms: number; app: string; isSite: boolean; site: string; titles: Map<string, number>;
  }>();
  for (const log of logs) {
    for (const seg of log.segments) {
      const d = classifyDetailed(seg.app, seg.title, settings.rules, seg.site);
      if (d.category !== "other") continue;
      const cur = map.get(d.label)
        || { ms: 0, app: seg.app, isSite: d.isSite, site: seg.site || "", titles: new Map<string, number>() };
      cur.ms += Math.max(0, seg.e - seg.s);
      if (!cur.site && seg.site) cur.site = seg.site;
      if (seg.title) cur.titles.set(seg.title, (cur.titles.get(seg.title) || 0) + Math.max(0, seg.e - seg.s));
      map.set(d.label, cur);
    }
  }
  const total = [...map.values()].reduce((n, v) => n + v.ms, 0);
  return [...map.entries()]
    .map(([label, v]) => ({
      id: label,
      label,
      color: categoryColor("other"),
      cat: "other",
      app: v.app,
      isSite: v.isSite,
      site: v.site,
      via: "none" as ClassifySource,
      ms: v.ms,
      pct: total ? (v.ms / total) * 100 : 0,
      titles: [...v.titles.entries()].map(([title, ms]) => ({ title, ms })).sort((a, b) => b.ms - a.ms).slice(0, 3),
    }))
    .sort((a, b) => b.ms - a.ms);
}
