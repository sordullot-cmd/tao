/**
 * Sous le chiffre héros du patrimoine se lit ce que la FENÊTRE a fait gagner ou
 * perdre — et non plus les trois mini-KPI brut / passifs / net, qui répétaient
 * le patrimoine du jour déjà affiché juste au-dessus.
 *
 * Le test vérifie les deux choses qui peuvent casser : la variation est bien
 * rendue là (avec son horizon), et elle suit la bascule net / brut — un montant
 * net sous un héros brut ferait lire la même page de deux façons.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

const cloudStore = new Map<string, unknown>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(() => (cloudStore.has(k) ? cloudStore.get(k) : d));
    const set = (u: unknown) => setV((prev: unknown) => {
      const next = typeof u === "function" ? (u as (p: unknown) => unknown)(prev) : u;
      cloudStore.set(k, next);
      return next;
    });
    return [v, set, true];
  },
}));

vi.mock("@/lib/bank/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankAccounts")>()),
  useBankAccounts: () => ({
    configured: false, connections: [], accounts: [], loading: false, error: null, reload: () => {},
  }),
}));

import PatrimoinePage from "@/components/pages/PatrimoinePage";
import { PATRIMOINE_LOCAL_KEY, type Asset } from "@/lib/patrimoine";

/* 4 000 d'actifs, 1 000 de crédit : net 3 000, brut 4 000. Le passif est là pour
   que la bascule net / brut soit rendue. */
const assets: Asset[] = [
  { id: "a1", name: "Brokerage", type: "pea", balance: 4_000, institution: null, updatedAt: null },
  { id: "l1", name: "Home loan", type: "loan", balance: -1_000, institution: null, updatedAt: null },
];

const VIEW_KEY = "tr4de_patrimoine_view";

/* Un relevé ancien, avec son brut : net 2 000 → 3 000 (+1 000), brut 3 500 →
   4 000 (+500). Deux variations DIFFÉRENTES, sans quoi le test ne dirait pas
   laquelle des deux est affichée. */
const seed = (view?: string) => {
  cloudStore.clear();
  cloudStore.set(PATRIMOINE_LOCAL_KEY, {
    assets,
    history: [{ date: "2026-01-05", total: 2_000, gross: 3_500 }],
  });
  if (view !== undefined) cloudStore.set(VIEW_KEY, view);
};

describe("Variation de la fenêtre sous le chiffre héros", () => {
  it("affiche le montant gagné sur la fenêtre, et son horizon", () => {
    seed();
    render(<PatrimoinePage />);
    expect(screen.getByText("+$1,000.00")).toBeTruthy();
    // Fenêtre « Tout » par défaut : l'horizon se dit en toutes lettres.
    expect(screen.getByText("since the start")).toBeTruthy();
  });

  it("ne rend plus les mini-KPI qui répétaient le patrimoine du jour", () => {
    seed();
    render(<PatrimoinePage />);
    expect(screen.queryByText("Assets (gross)")).toBeNull();
  });

  it("suit la bascule brut : la variation est celle de la courbe affichée", () => {
    seed("brut");
    render(<PatrimoinePage />);
    expect(screen.getByText("+$500.00")).toBeTruthy();
    expect(screen.queryByText("+$1,000.00")).toBeNull();
    cleanup();
  });
});
