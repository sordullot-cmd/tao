import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act, renderHook } from "@testing-library/react";

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

import { useIcsKindColors } from "@/lib/hooks/useIcsFeeds";
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
