import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act, renderHook, waitFor } from "@testing-library/react";

/* Le magasin nuage est remplacé par un relais entre instances, comme le vrai
   hook : la carte de réglage et la grille de l'agenda appellent chacune le
   leur, et une couleur choisie d'un côté doit être vue de l'autre. */
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

import { useIcsEventColors, useIcsEvents, useIcsKindColors, courseKey } from "@/lib/hooks/useIcsFeeds";
import { courseKind } from "@/lib/icsCategories";
import { KIND_DEFAULT_COLOR_ID } from "@/lib/icsCategories";

beforeEach(() => { store.clear(); listeners.clear(); });
afterEach(cleanup);

describe("réglage des couleurs de séances", () => {
  it("retient le choix d'un type et laisse les autres tranquilles", () => {
    const { result } = renderHook(() => useIcsKindColors());

    act(() => result.current.setKindColor("examen", "3"));
    expect(result.current.kindColors).toEqual({ examen: "3" });

    act(() => result.current.setKindColor("td", "7"));
    expect(result.current.kindColors).toEqual({ examen: "3", td: "7" });
  });

  it("rend un type à sa couleur d'origine en RETIRANT la surcharge", () => {
    /* Écrire le défaut au lieu de retirer figerait la valeur du jour : une
       correction de la charte n'atteindrait plus jamais cet utilisateur. */
    const { result } = renderHook(() => useIcsKindColors());
    act(() => result.current.setKindColor("examen", "3"));
    act(() => result.current.setKindColor("examen", null));
    expect(result.current.kindColors).toEqual({});

    act(() => result.current.setKindColor("examen", KIND_DEFAULT_COLOR_ID.examen));
    expect(result.current.kindColors).toEqual({});
  });

  it("rétablit tout d'un geste", () => {
    const { result } = renderHook(() => useIcsKindColors());
    act(() => result.current.setKindColor("examen", "3"));
    act(() => result.current.setKindColor("cm", "9"));
    act(() => result.current.resetColors());
    expect(result.current.kindColors).toEqual({});
  });

  it("se voit depuis une autre instance : c'est le même réglage", () => {
    /* La carte de réglage et la grille sont deux composants distincts ; sans
       relais, on choisirait une couleur que l'agenda ne verrait jamais. */
    function Deux() {
      const a = useIcsKindColors();
      const b = useIcsKindColors();
      return (
        <>
          <button type="button" onClick={() => a.setKindColor("examen", "3")}>changer</button>
          <span>lu:{b.kindColors.examen ?? "—"}</span>
        </>
      );
    }
    render(<Deux />);
    expect(screen.getByText("lu:—")).toBeTruthy();
    fireEvent.click(screen.getByText("changer"));
    expect(screen.getByText("lu:3")).toBeTruthy();
  });
});

/* ── Retouche d'une séance depuis l'agenda ────────────────────────────────── */

describe("couleur retouchée sur une séance importée", () => {
  it("retient la retouche d'une seule occurrence", () => {
    const { result } = renderHook(() => useIcsEventColors());
    act(() => result.current.setEventColor("events", "f1:uid-42", "11"));
    expect(result.current.eventColors.events).toEqual({ "f1:uid-42": "11" });
  });

  it("rend la séance à la couleur de son type quand la retouche est retirée", () => {
    const { result } = renderHook(() => useIcsEventColors());
    act(() => result.current.setEventColor("events", "f1:uid-42", "11"));
    act(() => result.current.setEventColor("events", "f1:uid-42", null));
    expect(result.current.eventColors.events).toEqual({});
  });

  it("refuse un emplacement qui n'existe pas côté Google", () => {
    const { result } = renderHook(() => useIcsEventColors());
    act(() => result.current.setEventColor("events", "f1:uid-42", "#ff0000"));
    act(() => result.current.setEventColor("events", "f1:uid-43", "42"));
    expect(result.current.eventColors.events).toEqual({});
  });
});

/* ── Ce que la couleur d'un TYPE emporte ──────────────────────────────────── */

const FEED = [{ id: "f1", url: "https://exemple.fr/edt.ics", name: "EDT", color: "#000", enabled: true }];

function serve(items: Record<string, unknown>[]) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ events: items }),
  })) as unknown as typeof fetch;
}

/** Deux matières différentes, même type de séance — le cas qui départage. */
const seance = (uid: string, matiere: string, categorie: string) => ({
  uid,
  // L'intitulé affiché compose la matière et le type (cf. `prettifyIcsEvent`).
  summary: `${matiere} · ${categorie}`,
  course: matiere,
  description: "", location: "", allDay: false,
  start: "2026-03-02T08:00:00Z", end: "2026-03-02T10:00:00Z",
  status: "confirmed", category: categorie,
});

describe("couleur d'un type de séance, depuis l'agenda", () => {
  it("repeint toutes les séances du type, quelle que soit la matière", async () => {
    /* C'est le type qui structure un emploi du temps : ce qu'on cherche des
       yeux, c'est « où sont mes TP », pas « où est l'anglais ». */
    serve([seance("u1", "Anglais", "TD"), seance("u2", "Analyse", "TD"), seance("u3", "Anglais", "CM")]);
    const { result } = renderHook(() => ({
      ev: useIcsEvents(FEED, "2026-03-01T00:00:00Z", "2026-03-08T00:00:00Z"),
      kind: useIcsKindColors(),
    }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(3));

    act(() => result.current.kind.setKindColor(courseKind("TD"), "11"));
    await waitFor(() => expect(result.current.ev.icsEvents[0].colorId).toBe("11"));
    // Les deux TD suivent ; le CM garde la couleur de SON type.
    const ids = result.current.ev.icsEvents.map((e) => e.colorId);
    expect(ids[0]).toBe("11");
    expect(ids[1]).toBe("11");
    expect(ids[2]).not.toBe("11");
  });

  it("laisse une séance mise à part garder sa couleur", async () => {
    // Du plus précis au plus général : l'exception l'emporte sur le type.
    serve([seance("u1", "Anglais", "TD"), seance("u2", "Analyse", "TD")]);
    const { result } = renderHook(() => ({
      ev: useIcsEvents(FEED, "2026-03-01T00:00:00Z", "2026-03-08T00:00:00Z"),
      kind: useIcsKindColors(),
      one: useIcsEventColors(),
    }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(2));

    act(() => result.current.kind.setKindColor(courseKind("TD"), "11"));
    act(() => result.current.one.setEventColor("events", "f1:u2", "2"));
    await waitFor(() => expect(result.current.ev.icsEvents[1].colorId).toBe("2"));
    expect(result.current.ev.icsEvents.map((e) => e.colorId)).toEqual(["11", "2"]);
  });
});

describe("couleur d'une matière, sur toutes ses séances", () => {
  it("repeint le CM comme le TD, qui ne portent pas le même intitulé", async () => {
    /* L'intitulé affiché compose le nom et le type : « Anglais · TD » et
       « Anglais · CM » sont le même enseignement et deux chaînes différentes.
       La clé est donc la MATIÈRE — sans quoi une couleur posée sur le cours ne
       toucherait que les séances du type qu'on a cliqué. */
    serve([seance("u1", "Anglais", "TD"), seance("u2", "Anglais", "CM"), seance("u3", "Analyse", "TD")]);
    const { result } = renderHook(() => ({
      ev: useIcsEvents(FEED, "2026-03-01T00:00:00Z", "2026-03-08T00:00:00Z"),
      col: useIcsEventColors(),
    }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(3));

    act(() => result.current.col.setEventColor("courses", courseKey("Anglais"), "11"));
    await waitFor(() => expect(result.current.ev.icsEvents[0].colorId).toBe("11"));
    const ids = result.current.ev.icsEvents.map((e) => e.colorId);
    expect(ids[0]).toBe("11");
    expect(ids[1]).toBe("11");
    // L'analyse n'est pas concernée, même si c'est un TD comme le premier.
    expect(ids[2]).not.toBe("11");
  });

  it("laisse la séance mise à part l'emporter sur sa matière", async () => {
    serve([seance("u1", "Anglais", "TD"), seance("u2", "Anglais", "CM")]);
    const { result } = renderHook(() => ({
      ev: useIcsEvents(FEED, "2026-03-01T00:00:00Z", "2026-03-08T00:00:00Z"),
      col: useIcsEventColors(),
    }));
    await waitFor(() => expect(result.current.ev.icsEvents).toHaveLength(2));

    act(() => result.current.col.setEventColor("courses", courseKey("Anglais"), "11"));
    act(() => result.current.col.setEventColor("events", "f1:u2", "2"));
    await waitFor(() => expect(result.current.ev.icsEvents[1].colorId).toBe("2"));
    expect(result.current.ev.icsEvents.map((e) => e.colorId)).toEqual(["11", "2"]);
  });

  it("compare les noms de matière à la casse et aux espaces près", () => {
    expect(courseKey("  Anglais   Renforcé ")).toBe(courseKey("anglais renforcé"));
  });
});
