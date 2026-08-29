"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCloudState } from "@/lib/hooks/useCloudState";

const TOKENS_KEY = "tr4de_gcal_tokens";
// Agendas décochés par l'utilisateur. On mémorise les EXCLUSIONS et non les
// inclusions : un agenda auquel on s'abonne plus tard côté Google (l'emploi du
// temps universitaire, par exemple) apparaît alors tout seul, sans avoir à
// revenir cocher une case ici.
const HIDDEN_CALS_KEY = "tr4de_gcal_hidden_calendars";
const HIDDEN_CALS_CLOUD_KEY = "gcal_hidden_calendars";

interface Tokens {
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null;
}

export interface GCalCalendar {
  id: string;
  title: string;
  description: string;
  color: string | null;
  primary: boolean;
  /** Agenda abonné par URL iCal ou partagé en lecture : Google refuse l'écriture. */
  readOnly: boolean;
  timeZone: string | null;
}

export interface GCalEvent {
  id: string;
  /** Agenda d'origine — nécessaire pour modifier un évènement hors « primary ». */
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  htmlLink: string;
  colorId: string | null;
  allDay: boolean;
  start: string | null;
  end: string | null;
  status: string;
}

function readTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token) return null;
    return parsed as Tokens;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens | null) {
  try {
    if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    else localStorage.removeItem(TOKENS_KEY);
  } catch {}
}

/**
 * Gère la connexion à Google Agenda et la récupération des évènements.
 * Tokens persistés en localStorage (`tr4de_gcal_tokens`), rafraîchis
 * automatiquement quand l'access token expire (si un refresh_token existe).
 */
export function useGoogleCalendar() {
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [calendars, setCalendars] = useState<GCalCalendar[] | null>(null);
  const [hidden, setHidden] = useCloudState<string[]>(
    HIDDEN_CALS_KEY,
    HIDDEN_CALS_CLOUD_KEY,
    [],
  );

  useEffect(() => {
    setTokens(readTokens());
    setReady(true);
    fetch("/api/google-calendar/config")
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.configured))
      .catch(() => setConfigured(false));
  }, []);

  const connected = !!tokens?.access_token;

  const connect = useCallback(() => {
    // Le callback OAuth réécrit les tokens puis revient sur #agenda.
    window.location.href = "/api/google-calendar/auth";
  }, []);

  const disconnect = useCallback(() => {
    writeTokens(null);
    setTokens(null);
    setCalendars(null);
  }, []);

  /**
   * Rafraîchit l'access token à partir du refresh_token.
   * - `ok`      : nouveaux tokens obtenus.
   * - `revoked` : le refresh_token est rejeté par Google (révoqué/expiré) →
   *               vraie déconnexion nécessaire.
   * - sinon (panne réseau/serveur passagère) : on NE déconnecte pas, on garde
   *   les tokens existants pour pouvoir réessayer plus tard.
   */
  const refreshAccessToken = useCallback(
    async (
      cur: Tokens,
    ): Promise<{ ok: true; tokens: Tokens } | { ok: false; revoked: boolean }> => {
      if (!cur.refresh_token) return { ok: false, revoked: true };
      try {
        const res = await fetch("/api/google-calendar/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: cur.refresh_token }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            const next: Tokens = {
              ...cur,
              access_token: data.access_token,
              // Ne jamais perdre l'expiry : si Google n'en renvoie pas, on garde
              // l'ancienne (sinon le token serait considéré « toujours valide »
              // et ne serait plus jamais rafraîchi).
              expiry_date: data.expiry_date || cur.expiry_date || null,
            };
            writeTokens(next);
            setTokens(next);
            return { ok: true, tokens: next };
          }
          return { ok: false, revoked: false }; // réponse vide → transitoire
        }
        // 400/401 du refresh = refresh_token rejeté par Google → révoqué.
        return { ok: false, revoked: res.status === 400 || res.status === 401 };
      } catch {
        return { ok: false, revoked: false }; // réseau → on garde tout
      }
    },
    [],
  );

  /**
   * Exécute un appel API authentifié avec refresh + retry automatique sur 401.
   * Ne déconnecte (token_expired) que si le refresh_token est réellement invalide.
   */
  const authedCall = useCallback(
    async (makeCall: (accessToken: string) => Promise<Response>): Promise<Response> => {
      let cur = readTokens();
      if (!cur?.access_token) throw new Error("not_connected");

      // Rafraîchissement préventif si l'access token est (bientôt) expiré.
      const nearExpiry = !!cur.expiry_date && cur.expiry_date - Date.now() <= 60_000;
      if (nearExpiry) {
        const r = await refreshAccessToken(cur);
        if (r.ok) cur = r.tokens;
        else if (r.revoked) {
          writeTokens(null);
          setTokens(null);
          throw new Error("token_expired");
        }
        // transitoire : on tente quand même avec le token courant.
      }

      let res = await makeCall(cur.access_token!);
      if (res.status !== 401) return res;

      // 401 : on force un refresh puis on réessaie une seule fois.
      const r = await refreshAccessToken(cur);
      if (r.ok) {
        res = await makeCall(r.tokens.access_token!);
        if (res.status !== 401) return res;
        // Encore 401 avec un token tout frais → token réellement invalide.
        writeTokens(null);
        setTokens(null);
        throw new Error("token_expired");
      }
      if (r.revoked) {
        writeTokens(null);
        setTokens(null);
        throw new Error("token_expired");
      }
      // Refresh indisponible (réseau/serveur) : on ne déconnecte pas.
      throw new Error("refresh_unavailable");
    },
    [refreshAccessToken],
  );

  /** Liste les agendas de l'utilisateur (le sien, les partagés, les abonnements iCal). */
  const fetchCalendars = useCallback(async (): Promise<GCalCalendar[]> => {
    const res = await authedCall((accessToken) =>
      fetch("/api/google-calendar/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      }),
    );
    if (res.status === 403) throw new Error("insufficient_scope");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `http_${res.status}`);
    }
    const data = await res.json();
    return (data.calendars || []) as GCalCalendar[];
  }, [authedCall]);

  // Chargé une fois par connexion : la liste bouge rarement, et un rechargement
  // à chaque navigation ferait un appel de plus pour rien.
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    // La règle voit un setState « dans l'effet » alors qu'il est dans le
    // callback asynchrone : c'est précisément l'usage recommandé (souscrire à
    // un système externe et poser l'état à la réponse).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCalendars()
      .then((list) => { if (alive) setCalendars(list); })
      // Échec (scope pas encore accordé, réseau) : on ne bloque pas l'agenda,
      // `activeCalendarIds` retombe sur « primary » seul.
      .catch(() => { if (alive) setCalendars(null); });
    return () => { alive = false; };
  }, [connected, fetchCalendars]);

  /**
   * Agendas effectivement lus. Tant que la liste n'est pas connue, on s'en tient
   * à l'agenda principal — c'est le comportement d'origine, donc jamais une
   * régression pendant le chargement.
   */
  const activeCalendarIds = useMemo(() => {
    if (!calendars || !calendars.length) return ["primary"];
    const hide = new Set(hidden || []);
    const ids = calendars.filter((c) => !hide.has(c.id)).map((c) => c.id);
    return ids.length ? ids : ["primary"];
  }, [calendars, hidden]);

  /** Affiche / masque un agenda dans la grille (persisté, synchronisé). */
  const toggleCalendar = useCallback(
    (calendarId: string, visible: boolean) => {
      setHidden((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (visible) return list.filter((id) => id !== calendarId);
        return list.includes(calendarId) ? list : [...list, calendarId];
      });
    },
    [setHidden],
  );

  /** Récupère les évènements entre deux dates ISO. Lève sur erreur réseau/API. */
  const fetchEvents = useCallback(
    async (timeMin: string, timeMax: string, calendarIds?: string[]): Promise<GCalEvent[]> => {
      const ids = calendarIds && calendarIds.length ? calendarIds : activeCalendarIds;
      const res = await authedCall((accessToken) =>
        fetch("/api/google-calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, timeMin, timeMax, calendarIds: ids }),
        }),
      );

      // Token sans permission Calendar → message dédié, on garde la connexion
      // pour proposer une reconnexion explicite.
      if (res.status === 403) throw new Error("insufficient_scope");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[gcal] events error", res.status, body);
        throw new Error(body.error || `http_${res.status}`);
      }
      const data = await res.json();
      console.log(`[gcal] ${data.events?.length ?? 0} évènement(s) reçus`, { timeMin, timeMax });
      return data.events || [];
    },
    [authedCall, activeCalendarIds],
  );

  /** Crée / modifie / supprime un évènement, puis renvoie la réponse. */
  const mutateEvent = useCallback(
    async (
      action: "create" | "update" | "delete" | "get" | "setDone",
      // `calendarId` : l'agenda propriétaire. Omis = agenda principal, ce qui
      // reste juste pour tout ce que tr4de crée lui-même.
      payload: { eventId?: string; event?: any; calendarId?: string },
    ) => {
      const res = await authedCall((accessToken) =>
        fetch("/api/google-calendar/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, accessToken, ...payload }),
        }),
      );
      if (res.status === 403) throw new Error("insufficient_scope");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `http_${res.status}`);
      }
      return res.json();
    },
    [authedCall],
  );

  const createEvent = useCallback((event: any, calendarId?: string) => mutateEvent("create", { event, calendarId }), [mutateEvent]);
  const updateEvent = useCallback((eventId: string, event: any, calendarId?: string) => mutateEvent("update", { eventId, event, calendarId }), [mutateEvent]);
  const deleteEvent = useCallback((eventId: string, calendarId?: string) => mutateEvent("delete", { eventId, calendarId }), [mutateEvent]);
  const getEvent = useCallback((eventId: string, calendarId?: string) => mutateEvent("get", { eventId, calendarId }), [mutateEvent]);
  const setEventDone = useCallback((eventId: string, done: boolean, calendarId?: string) => mutateEvent("setDone", { eventId, event: { done }, calendarId }), [mutateEvent]);

  /** Appels génériques pour les tâches Google. */
  const callTasks = useCallback(
    async (action: string, payload: { task?: any; taskId?: string } = {}) => {
      const res = await authedCall((accessToken) =>
        fetch("/api/google-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, accessToken, ...payload }),
        }),
      );
      if (res.status === 403) throw new Error("insufficient_scope");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `http_${res.status}`);
      }
      return res.json();
    },
    [authedCall],
  );

  const fetchTasks = useCallback(async () => {
    const d = await callTasks("list");
    return d.tasks || [];
  }, [callTasks]);
  const createTask = useCallback((task: any) => callTasks("create", { task }), [callTasks]);
  const updateTask = useCallback((taskId: string, task: any) => callTasks("update", { taskId, task }), [callTasks]);
  const toggleTask = useCallback((taskId: string, completed: boolean) => callTasks("toggle", { taskId, task: { completed } }), [callTasks]);
  const deleteTask = useCallback((taskId: string) => callTasks("delete", { taskId }), [callTasks]);

  return {
    ready,
    configured,
    connected,
    connect,
    disconnect,
    calendars,
    activeCalendarIds,
    hiddenCalendars: hidden,
    toggleCalendar,
    fetchCalendars,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    getEvent,
    setEventDone,
    fetchTasks,
    createTask,
    updateTask,
    toggleTask,
    deleteTask,
  };
}
