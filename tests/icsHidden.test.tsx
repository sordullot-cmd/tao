import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { cleanup, act, renderHook, waitFor } from "@testing-library/react";

/* Même relais entre instances que le vrai `useCloudState` : la page Agenda
   masque, les réglages listent — deux composants, un seul magasin. */
const store = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
      const set = listeners.get(k) ?? new Set<() => void>();
      set.add(force);
      listeners.set(k, set);
      return () => { set.delete(force); };
    }, [k, force]);
    const read = () => (store.has(k) ? store.get(k) : d);
    const set = (u: unknown) => {
      store.set(k, typeof u === "function" ? (u as (p: unknown) => unknown)(read()) : u);
      listeners.get(k)?.forEach(fn => fn());
    };
    return [read(), set, true];
  },
}));

import { useIcsEvents, useIcsHiddenEvents, ICS_HIDDEN_KEY } from "@/lib/hooks/useIcsFeeds";

beforeEach(() => { store.clear(); listeners.clear(); });
afterEach(cleanup);

const FEED = [{ id: "f1", url: "https://exemple.fr/edt.ics", name: "EDT", color: "#000", enabled: true }];

function serve(items: Record<string, unknown>[]) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ events: items }),
  })) as unknown as typeof fetch;
}

const seance = (uid: string, matiere: string, jour = "02") => ({
  uid,
  summary: `${matiere} · TD`,
  course: matiere,
  description: "", location: "", allDay: false,
  start: `2026-03-${jour}T08:00:00Z`, end: `2026-03-${jour}T10:00:00Z`,
  status: "confirmed", category: "TD",
});

const RANGE = ["2026-03-01T00:00:00Z", "2026-03-08T00:00:00Z"] as const;

describe("masquer une séance importée", () => {
  it("retire de la grille la séance masquée, et elle seule", async () => {
    serve([seance("u1", "Anglais"), seance("u2", "Analyse"), seance("u3", "Physique")]);
    const { result } = renderHook(() => ({
      ev: useIcsEvents(FEED, ...RANGE),
      masque: useIcsHiddenEvents(),
    }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(3));

    act(() => result.current.masque.hideEvent({ id: "f1:u2", summary: "Analyse · TD", start: "2026-03-02T08:00" }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(2));
    expect(result.current.ev.icsEvents.map((e) => e.id)).toEqual(["f1:u1", "f1:u3"]);
  });

  it("ne masque que CETTE séance, pas les autres de la même matière", async () => {
    // C'est tout l'objet de la portée : le TP du jeudi annulé, pas l'UE.
    serve([seance("u1", "Anglais", "02"), seance("u2", "Anglais", "09")]);
    const { result } = renderHook(() => ({
      ev: useIcsEvents(FEED, ...RANGE),
      masque: useIcsHiddenEvents(),
    }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(2));

    act(() => result.current.masque.hideEvent({ id: "f1:u1", summary: "Anglais · TD", start: "2026-03-02T08:00" }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(1));
    expect(result.current.ev.icsEvents[0].id).toBe("f1:u2");
  });

  it("rend la séance quand on lève le masque", async () => {
    serve([seance("u1", "Anglais")]);
    const { result } = renderHook(() => ({
      ev: useIcsEvents(FEED, ...RANGE),
      masque: useIcsHiddenEvents(),
    }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(1));

    act(() => result.current.masque.hideEvent({ id: "f1:u1", summary: "Anglais · TD", start: "2026-03-02T08:00" }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(0));
    act(() => result.current.masque.showEvent("f1:u1"));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(1));
  });

  it("garde le nom et la date : sans eux, les réglages n'auraient qu'un UID à montrer", () => {
    const { result } = renderHook(() => useIcsHiddenEvents());
    act(() => result.current.hideEvent({ id: "f1:u1", summary: "Anglais · TD", start: "2026-03-02T08:00" }));
    expect(result.current.hidden["f1:u1"]).toEqual({ summary: "Anglais · TD", start: "2026-03-02T08:00" });
  });

  it("lève tous les masques d'un geste", () => {
    const { result } = renderHook(() => useIcsHiddenEvents());
    act(() => result.current.hideEvent({ id: "f1:u1", summary: "A", start: "" }));
    act(() => result.current.hideEvent({ id: "f1:u2", summary: "B", start: "" }));
    act(() => result.current.showAllEvents());
    expect(result.current.hidden).toEqual({});
  });

  it("ignore un masquage sans identifiant plutôt que d'en inventer un", () => {
    const { result } = renderHook(() => useIcsHiddenEvents());
    act(() => result.current.hideEvent({ summary: "Séance sans id", start: "" }));
    expect(result.current.hidden).toEqual({});
  });

  it("se voit d'une instance à l'autre : c'est le même réglage", () => {
    // La page Agenda masque, la carte des réglages doit le lire.
    const { result } = renderHook(() => ({ a: useIcsHiddenEvents(), b: useIcsHiddenEvents() }));
    act(() => result.current.a.hideEvent({ id: "f1:u1", summary: "Anglais", start: "" }));
    expect(Object.keys(result.current.b.hidden)).toEqual(["f1:u1"]);
  });

  it("relit un magasin écrit par une version plus ancienne", () => {
    // Une valeur nue plutôt qu'un objet : masquage conservé, nom au mieux.
    store.set(ICS_HIDDEN_KEY, { "f1:u1": true, "f1:u2": "Analyse · TD" });
    const { result } = renderHook(() => useIcsHiddenEvents());
    expect(result.current.hidden["f1:u1"]).toEqual({ summary: "", start: "" });
    expect(result.current.hidden["f1:u2"].summary).toBe("Analyse · TD");
  });
});
