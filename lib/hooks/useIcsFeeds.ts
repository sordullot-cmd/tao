"use client";

/**
 * Flux iCal ajoutés par l'utilisateur (emploi du temps universitaire en premier
 * lieu), lus par tr4de sans passer par Google.
 *
 * Pourquoi ce chemin existe alors que Google Agenda sait s'abonner à une URL :
 * l'API Calendar, elle, ne le sait pas. `calendarList.insert` n'accepte que
 * l'identifiant d'un agenda Google existant — l'abonnement « à partir de
 * l'URL » n'est offert que par l'interface web de Google. Un ajout DEPUIS
 * l'app suppose donc que l'app lise le flux elle-même. Elle y gagne au passage
 * la fraîcheur : Google ne rafraîchit un agenda abonné que toutes les 8 à 24 h.
 *
 * Les flux vivent dans `user_productivity` via `useCloudState` : chaque compte
 * a les siens, sur tous ses appareils, sans migration SQL.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { normalizeFeedUrl } from "@/lib/icsFetch";
import {
  courseColor, courseColorId, normalizeKindColors, type KindColors,
} from "@/lib/icsCategories";
import { GCAL_COLORS } from "@/lib/gcalColors";

export const ICS_FEEDS_KEY = "tr4de_ics_feeds";
export const ICS_FEEDS_CLOUD_KEY = "ics_feeds";

export const ICS_KIND_COLORS_KEY = "tr4de_ics_kind_colors";
export const ICS_KIND_COLORS_CLOUD_KEY = "ics_kind_colors";

export const ICS_EVENT_COLORS_KEY = "tr4de_ics_event_colors";
export const ICS_EVENT_COLORS_CLOUD_KEY = "ics_event_colors";

export const ICS_HIDDEN_KEY = "tr4de_ics_hidden";
export const ICS_HIDDEN_CLOUD_KEY = "ics_hidden";

/** Palette d'attribution : couleurs distinctes de la teinte par défaut des évènements Google. */
const FEED_COLORS = ["#B45309", "#7C3AED", "#0E7490", "#BE123C", "#15803D", "#A16207"];

export interface IcsFeed {
  id: string;
  url: string;
  name: string;
  color: string;
  enabled: boolean;
}

export interface IcsFeedEvent {
  id: string;
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  allDay: boolean;
  start: string;
  end: string;
  status: string;
  calendarColor: string;
  /** Type de séance, pour la légende et le regroupement. */
  category: string;
  /** La matière seule, sans son type — la clé d'une couleur « toute la matière ». */
  course: string;
  /** Toujours vrai : un flux distant se consulte, il ne se modifie pas. */
  readOnly: true;
  htmlLink: string;
  colorId: string;
  recurringEventId: null;
  guests: never[];
  transparency: string;
  visibility: string;
  reminders: null;
  hangoutLink: null;
  isTask: false;
  done: false;
}

/** Identifiant d'agenda synthétique — préfixé pour ne jamais heurter un id Google. */
export const feedCalendarId = (feedId: string) => `ics:${feedId}`;
export const isFeedCalendarId = (id: string) => String(id || "").startsWith("ics:");

function normalizeFeeds(value: unknown): IcsFeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f, i) => ({
      id: String(f.id || `feed-${i}`),
      url: String(f.url || ""),
      name: String(f.name || "Emploi du temps"),
      color: String(f.color || FEED_COLORS[i % FEED_COLORS.length]),
      // Champ ajouté après coup : absent chez les premiers utilisateurs, un flux
      // enregistré est visible par défaut.
      enabled: f.enabled !== false,
    }))
    .filter((f) => !!f.url);
}

export function useIcsFeeds() {
  const [stored, setStored] = useCloudState<IcsFeed[]>(ICS_FEEDS_KEY, ICS_FEEDS_CLOUD_KEY, []);
  const feeds = useMemo(() => normalizeFeeds(stored), [stored]);

  const addFeed = useCallback(
    (url: string, name?: string) => {
      const clean = normalizeFeedUrl(url);
      if (!clean) return null;
      const feed: IcsFeed = {
        id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        url: clean,
        name: (name || "").trim() || "Emploi du temps",
        color: FEED_COLORS[feeds.length % FEED_COLORS.length],
        enabled: true,
      };
      setStored((prev) => [...normalizeFeeds(prev), feed]);
      return feed;
    },
    [feeds.length, setStored],
  );

  const removeFeed = useCallback(
    (id: string) => setStored((prev) => normalizeFeeds(prev).filter((f) => f.id !== id)),
    [setStored],
  );

  const patchFeed = useCallback(
    (id: string, patch: Partial<IcsFeed>) =>
      setStored((prev) => normalizeFeeds(prev).map((f) => (f.id === id ? { ...f, ...patch } : f))),
    [setStored],
  );

  return { feeds, addFeed, removeFeed, patchFeed };
}

/**
 * Couleur des séances importées, par type — ce que règlent les paramètres de
 * l'agenda.
 *
 * Le code couleur livré (les examens en rouge, les TP en bleu…) tient sur un
 * vocabulaire d'établissement français ; il ne peut pas convenir à tout le
 * monde, et il n'a de toute façon aucune raison d'imposer SES repères. Ce qu'on
 * cherche des yeux dans une semaine n'est pas le même pour chacun.
 *
 * Rangé dans `user_productivity` comme les flux : même compte, tous les
 * appareils, aucune migration.
 */
export function useIcsKindColors() {
  const [stored, setStored] = useCloudState<KindColors>(
    ICS_KIND_COLORS_KEY, ICS_KIND_COLORS_CLOUD_KEY, {},
  );
  const colors = useMemo(() => normalizeKindColors(stored), [stored]);

  /* `null` rend le type à sa couleur livrée. C'est un RETRAIT et non
     l'écriture du défaut : sans ça, la valeur du jour serait recopiée dans le
     magasin et gelée pour toujours, y compris si la charte la corrige. */
  const setKindColor = useCallback(
    (kind: string, colorId: string | null) =>
      setStored((prev) => {
        const next = { ...normalizeKindColors(prev) };
        if (colorId === null) delete next[kind as keyof KindColors];
        else next[kind as keyof KindColors] = colorId;
        return normalizeKindColors(next);
      }),
    [setStored],
  );

  const resetColors = useCallback(() => setStored({}), [setStored]);

  return { kindColors: colors, setKindColor, resetColors };
}

/**
 * Couleurs posées à la main sur des séances importées, depuis l'agenda lui-même.
 *
 * Un flux distant ne se modifie pas : la séance revient du serveur identique à
 * chaque lecture, et rien de ce qu'on écrirait dessus ne survivrait. La retouche
 * vit donc ICI, à côté, et se pose au rendu par-dessus la couleur du type.
 *
 * Deux portées, en plus du TYPE qui reste le socle (`useIcsKindColors`) :
 *
 *   • UNE séance (`events`) — « ce partiel-là, en rouge ». La clé est
 *     l'identifiant de l'occurrence, stable d'une lecture à l'autre : un export
 *     d'emploi du temps déplie chaque séance en un évènement à elle, avec son
 *     propre UID.
 *   • UNE matière (`courses`) — « l'anglais en vert », ses CM et ses TD
 *     compris. La clé est la MATIÈRE (`IcsEvent.course`), jamais l'intitulé
 *     affiché : celui-ci compose le nom et le type (« Anglais · TD »), si bien
 *     qu'une couleur posée dessus ne toucherait que les séances du même type.
 *
 * Ordre : la séance l'emporte sur la matière, qui l'emporte sur le type — du
 * plus précis au plus général, comme partout ailleurs.
 */
export interface IcsEventColors {
  events: Record<string, string>;
  courses: Record<string, string>;
}

const NO_EVENT_COLORS: IcsEventColors = { events: {}, courses: {} };

/** Clé d'une matière : son nom, ramené à une forme comparable. Deux séances du
 *  même cours ne s'écrivent pas toujours avec la même casse ni les mêmes
 *  espaces, et ce sont bien les mêmes. */
export function courseKey(course: string): string {
  return String(course || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEventColors(raw: unknown): IcsEventColors {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NO_EVENT_COLORS;
  const pick = (value: unknown): Record<string, string> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const id = String(v ?? "").trim();
      // Les onze emplacements Google, et rien d'autre : ces séances voisinent
      // avec des évènements Google dans la même grille.
      if (key && id in GCAL_COLORS) out[key] = id;
    }
    return out;
  };
  const o = raw as Record<string, unknown>;
  return { events: pick(o.events), courses: pick(o.courses) };
}

export function useIcsEventColors() {
  const [stored, setStored] = useCloudState<IcsEventColors>(
    ICS_EVENT_COLORS_KEY, ICS_EVENT_COLORS_CLOUD_KEY, NO_EVENT_COLORS,
  );
  const colors = useMemo(() => normalizeEventColors(stored), [stored]);

  /* `null` retire la retouche et rend la séance à la portée du dessus. */
  const setEventColor = useCallback(
    (scope: "events" | "courses", key: string, colorId: string | null) =>
      setStored((prev) => {
        const next = normalizeEventColors(prev);
        const bucket = { ...next[scope] };
        if (colorId === null) delete bucket[key];
        else bucket[key] = colorId;
        return normalizeEventColors({ ...next, [scope]: bucket });
      }),
    [setStored],
  );

  const resetEventColors = useCallback(() => setStored(NO_EVENT_COLORS), [setStored]);

  return { eventColors: colors, setEventColor, resetEventColors };
}

/* ── Séances masquées ────────────────────────────────────────────────────────
   Un flux distant ne se modifie pas : le cours qu'on ne suit pas, le TP annulé,
   la permanence qui ne concerne pas son groupe restent dans le `.ics` de
   l'établissement et reviendraient au premier rafraîchissement. Le masquage est
   donc le nôtre — une liste posée par-dessus le flux, qui vit dans
   `user_productivity` comme les couleurs.

   La portée est la SÉANCE, pas la matière : c'est le grain que les exports
   d'emploi du temps rendent fiable, puisqu'ils dépliaient déjà chaque séance en
   un `VEVENT` d'UID propre (lib/ics.ts n'interprète aucune `RRULE`). Masquer
   une matière entière demanderait la clé `courseKey`, comme les couleurs le
   font — rien n'empêche de l'ajouter le jour où le besoin vient.

   On garde le libellé et la date au moment du masquage, et pas seulement
   l'identifiant : une séance masquée est justement celle qui n'apparaît plus
   nulle part, et sans eux les réglages n'auraient qu'une suite d'UID à offrir
   pour la rendre.

   Rien n'expire tout seul : une séance oubliée à la fin du semestre ne gêne
   personne (sa date est passée), et une purge automatique risquerait surtout de
   ressusciter un cours qu'on avait écarté. Les réglages offrent de tout
   réafficher d'un coup. */

/** Ce qu'on retient d'une séance masquée : de quoi la nommer pour la rendre. */
export interface IcsHiddenEvent {
  summary: string;
  /** Début ISO, tel que le flux l'a donné. */
  start: string;
}

/** Séances masquées, indexées par identifiant de séance (`feedId:uid`). */
export type IcsHidden = Record<string, IcsHiddenEvent>;

const NO_HIDDEN: IcsHidden = {};

function normalizeHidden(raw: unknown): IcsHidden {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NO_HIDDEN;
  const out: IcsHidden = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue;
    /* Tolérance à une forme plus ancienne : une valeur qui n'est pas un objet
       (un `true`, un libellé nu) vaut masquage, sans nom à afficher. */
    const v = (value && typeof value === "object" && !Array.isArray(value))
      ? (value as Record<string, unknown>)
      : {};
    out[key] = {
      summary: String(v.summary ?? (typeof value === "string" ? value : "")),
      start: String(v.start ?? ""),
    };
  }
  return out;
}

export function useIcsHiddenEvents() {
  const [stored, setStored] = useCloudState<IcsHidden>(
    ICS_HIDDEN_KEY, ICS_HIDDEN_CLOUD_KEY, NO_HIDDEN,
  );
  const hidden = useMemo(() => normalizeHidden(stored), [stored]);

  /** Masque UNE séance. On lui prend son nom et sa date au passage. */
  const hideEvent = useCallback(
    (event: { id?: string; summary?: string; start?: string } | null | undefined) => {
      const id = String(event?.id || "");
      if (!id) return;
      setStored((prev) => normalizeHidden({
        ...normalizeHidden(prev),
        [id]: { summary: String(event?.summary || ""), start: String(event?.start || "") },
      }));
    },
    [setStored],
  );

  const showEvent = useCallback(
    (id: string) => setStored((prev) => {
      const next = normalizeHidden(prev);
      delete next[id];
      return next;
    }),
    [setStored],
  );

  const showAllEvents = useCallback(() => setStored(NO_HIDDEN), [setStored]);

  return { hidden, hideEvent, showEvent, showAllEvents };
}

/** Vérifie qu'une URL répond bien un calendrier, avant de l'enregistrer. */
export async function probeFeed(url: string): Promise<{ ok: boolean; error?: string; total?: number }> {
  try {
    const res = await fetch("/api/ics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `http_${res.status}` };
    return { ok: true, total: data.total ?? (data.events || []).length };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Charge les évènements des flux actifs sur une fenêtre de dates.
 * Un flux en échec n'empêche pas les autres de s'afficher : l'emploi du temps
 * d'un établissement tombe parfois en maintenance, la grille doit survivre.
 */
/** Ce que le serveur rend pour un flux, avant mise en couleur. */
interface RawFeedItems {
  feedId: string;
  items: {
    uid: string; summary: string; description: string; location: string;
    allDay: boolean; start: string; end: string; status: string; category?: string; course?: string;
  }[];
}

export function useIcsEvents(feeds: IcsFeed[], timeMin: string | null, timeMax: string | null) {
  /* Ce qui a été LU est gardé tel quel, et la couleur se pose au rendu.
     Cousu ensemble, changer une teinte dans les réglages aurait relancé une
     requête réseau par flux pour repeindre des séances déjà en mémoire — et la
     grille aurait clignoté sur un choix qui ne change rien à ce qui est lu. */
  const [raw, setRaw] = useState<RawFeedItems[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const { kindColors } = useIcsKindColors();
  const { eventColors } = useIcsEventColors();
  const { hidden } = useIcsHiddenEvents();
  // Le rendu recrée le tableau `feeds` à chaque passe : on compare son contenu,
  // sinon l'effet se relancerait en boucle.
  const active = useMemo(() => feeds.filter((f) => f.enabled && f.url), [feeds]);
  const signature = active.map((f) => `${f.id}:${f.url}:${f.name}`).join("|");
  const seq = useRef(0);

  useEffect(() => {
    if (!active.length || !timeMin || !timeMax) {
      setRaw([]);
      setFailed([]);
      return;
    }
    const run = ++seq.current;
    setLoading(true);

    Promise.all(
      active.map(async (feed) => {
        try {
          const res = await fetch("/api/ics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: feed.url, timeMin, timeMax }),
          });
          if (!res.ok) return { feedId: feed.id, items: [], ok: false };
          const data = await res.json();
          return { feedId: feed.id, items: data.events || [], ok: true };
        } catch {
          return { feedId: feed.id, items: [], ok: false };
        }
      }),
    ).then((results) => {
      // Une navigation plus récente a déjà pris la main : cette réponse est périmée.
      if (run !== seq.current) return;
      setRaw(results.filter((r) => r.ok).map(({ feedId, items }) => ({ feedId, items })));
      setFailed(results.filter((r) => !r.ok).map((r) => r.feedId));
      setLoading(false);
    });
    // `signature` résume `active` : le tableau change d'identité à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, timeMin, timeMax]);

  const events = useMemo<IcsFeedEvent[]>(() => {
    const out: IcsFeedEvent[] = [];
    for (const { feedId, items } of raw) {
      for (const ev of items) {
        const id = `${feedId}:${ev.uid}`;
        /* Écartée ici, en amont de la mise en couleur : une séance masquée ne
           doit exister ni dans la grille, ni dans les rappels, ni dans les
           compteurs qui lisent cette même liste. */
        if (hidden[id]) continue;
        /* Du plus précis au plus général : la retouche posée sur CETTE séance,
           sinon celle posée sur la matière, sinon la couleur de son type. */
        /* Du plus précis au plus général : cette séance, sinon sa matière,
           sinon la couleur de son type. */
        const override = eventColors.events[id]
          ?? eventColors.courses[courseKey(ev.course || ev.summary)]
          ?? null;
        out.push({
          id,
          calendarId: feedCalendarId(feedId),
          summary: ev.summary,
          description: ev.description,
          location: ev.location,
          allDay: ev.allDay,
          start: ev.start,
          end: ev.end,
          status: ev.status,
          // La couleur vient du TYPE de séance, pas du flux : une semaine
          // entière d'une seule teinte ne renseigne sur rien, alors qu'un
          // coup d'œil doit suffire à repérer les TP ou le partiel. Le choix
          // de la teinte, lui, appartient aux réglages de l'agenda.
          calendarColor: override ? GCAL_COLORS[override] : courseColor(ev.category, ev.summary, kindColors),
          category: ev.category || "",
          course: ev.course || ev.summary,
          readOnly: true,
          htmlLink: "",
          colorId: override ?? courseColorId(ev.category, ev.summary, kindColors),
          recurringEventId: null,
          guests: [],
          transparency: "opaque",
          visibility: "default",
          reminders: null,
          hangoutLink: null,
          isTask: false,
          done: false,
        });
      }
    }
    return out;
  }, [raw, kindColors, eventColors, hidden]);

  return { icsEvents: events, icsLoading: loading, icsFailed: failed };
}
