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

export const ICS_FEEDS_KEY = "tr4de_ics_feeds";
export const ICS_FEEDS_CLOUD_KEY = "ics_feeds";

export const ICS_KIND_COLORS_KEY = "tr4de_ics_kind_colors";
export const ICS_KIND_COLORS_CLOUD_KEY = "ics_kind_colors";

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
    allDay: boolean; start: string; end: string; status: string; category?: string;
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
        out.push({
          id: `${feedId}:${ev.uid}`,
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
          calendarColor: courseColor(ev.category, ev.summary, kindColors),
          category: ev.category || "",
          readOnly: true,
          htmlLink: "",
          colorId: courseColorId(ev.category, ev.summary, kindColors),
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
  }, [raw, kindColors]);

  return { icsEvents: events, icsLoading: loading, icsFailed: failed };
}
