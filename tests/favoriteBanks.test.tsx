import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";

/* Les favoris de banques sont persistés par `useCloudState` (Supabase + cache
   localStorage). Le test remplace ce hook par un état en mémoire : ce qui doit
   être garanti ici, c'est la RÈGLE — un favori s'ajoute, se retire, garde son
   nom et son logo, et une valeur héritée d'une version antérieure ne casse pas
   la lecture. La persistance elle-même est testée là où elle vit. */
const cloudStore = new Map<string, unknown>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(() => (cloudStore.has(k) ? cloudStore.get(k) : d));
    const set = (u: unknown) => setV((prev: unknown) => {
      const next = typeof u === "function" ? (u as (p: unknown) => unknown)(prev) : u;
      cloudStore.set(k, next);
      return next;
    });
    /* 3ᵉ élément : le hook réel annonce l'hydratation TERMINÉE dès qu'il n'y a
       pas d'utilisateur, ce qui est le cas ici. Un mock qui l'omet laisse les
       pages sur leur squelette de chargement, indéfiniment. */
    return [v, set, true];
  },
}));

import { useFavoriteBanks } from "@/lib/bank/useFavoriteBanks";

const KEY = "tr4de_bank_favorites";

describe("useFavoriteBanks", () => {
  it("ajoute une banque en favori avec son nom et son logo", () => {
    cloudStore.clear();
    const { result } = renderHook(() => useFavoriteBanks());

    act(() => result.current.toggle({ id: "Revolut", name: "Revolut", logo: "https://x/revolut.png" }));

    expect(result.current.favorites).toEqual([
      { id: "Revolut", name: "Revolut", logo: "https://x/revolut.png" },
    ]);
    expect(result.current.isFavorite("Revolut")).toBe(true);
  });

  it("retire le favori au second appel — la même étoile fait les deux", () => {
    cloudStore.clear();
    const { result } = renderHook(() => useFavoriteBanks());

    act(() => result.current.toggle({ id: "Revolut", name: "Revolut" }));
    act(() => result.current.toggle({ id: "Revolut", name: "Revolut" }));

    expect(result.current.favorites).toEqual([]);
    expect(result.current.isFavorite("Revolut")).toBe(false);
  });

  it("garde l'ordre d'ajout et n'inscrit jamais deux fois la même banque", () => {
    cloudStore.clear();
    const { result } = renderHook(() => useFavoriteBanks());

    act(() => result.current.toggle({ id: "Boursorama", name: "Boursorama" }));
    act(() => result.current.toggle({ id: "Revolut", name: "Revolut" }));
    // Déjà favorite : ce n'est pas un doublon qui s'ajoute, c'est un retrait.
    act(() => result.current.toggle({ id: "Boursorama", name: "Boursorama" }));

    expect(result.current.favorites.map((f) => f.id)).toEqual(["Revolut"]);
  });

  it("sans nom, l'identifiant sert de libellé", () => {
    cloudStore.clear();
    const { result } = renderHook(() => useFavoriteBanks());

    act(() => result.current.toggle({ id: "Qonto" }));

    expect(result.current.favorites[0]).toEqual({ id: "Qonto", name: "Qonto", logo: null });
  });

  it("ignore les entrées inutilisables d'une valeur stockée abîmée", () => {
    cloudStore.clear();
    // Ce que pourrait rendre localStorage : une liste d'une version antérieure.
    cloudStore.set(KEY, [null, "Revolut", { name: "Sans id" }, { id: "N26", name: "N26" }]);
    const { result } = renderHook(() => useFavoriteBanks());

    expect(result.current.favorites.map((f) => f.id)).toEqual(["N26"]);
    expect(result.current.isFavorite("N26")).toBe(true);
  });
});
