import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

/* La bascule patrimoine net / brut est une PRÉFÉRENCE, pas un état d'écran :
   elle doit suivre le compte (Supabase via `useCloudState`), sinon elle repart
   sur « net » à chaque visite et sur chaque appareil. Le mock ci-dessous rejoue
   ce que fait le hook — un magasin partagé entre les montages — et c'est
   exactement ce que le test vérifie : la valeur SURVIT au démontage. */
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

const VIEW_KEY = "tr4de_patrimoine_view";

/* Un actif ET un passif : sans passif, net et brut sont égaux et la bascule
   n'est pas rendue du tout. */
const assets: Asset[] = [
  { id: "a1", name: "Brokerage", type: "pea", balance: 4000, institution: null, updatedAt: null },
  { id: "l1", name: "Home loan", type: "loan", balance: -1000, institution: null, updatedAt: null },
];

const seed = (view?: string) => {
  cloudStore.clear();
  cloudStore.set(PATRIMOINE_LOCAL_KEY, { assets, history: [] });
  if (view !== undefined) cloudStore.set(VIEW_KEY, view);
};

describe("Préférence patrimoine net / brut", () => {
  it("ouvre sur le patrimoine net par défaut", () => {
    seed();
    render(<PatrimoinePage />);
    expect(screen.getByRole("button", { name: "Show gross worth" })).toBeTruthy();
  });

  it("enregistre le choix sur le compte, pas seulement à l'écran", () => {
    seed();
    render(<PatrimoinePage />);

    fireEvent.click(screen.getByRole("button", { name: "Show gross worth" }));
    expect(cloudStore.get(VIEW_KEY)).toBe("brut");
    // Le bouton propose maintenant le retour au net.
    expect(screen.getByRole("button", { name: "Show net worth" })).toBeTruthy();
  });

  it("retrouve le choix au retour sur la page", () => {
    seed("brut");
    render(<PatrimoinePage />);
    expect(screen.getByRole("button", { name: "Show net worth" })).toBeTruthy();
    expect(screen.getByText("Gross worth")).toBeTruthy();
  });

  it("survit à un démontage, comme au retour depuis un autre appareil", () => {
    seed();
    const first = render(<PatrimoinePage />);
    fireEvent.click(screen.getByRole("button", { name: "Show gross worth" }));
    first.unmount();
    cleanup();

    render(<PatrimoinePage />);
    expect(screen.getByRole("button", { name: "Show net worth" })).toBeTruthy();
  });

  it("retombe sur le net si la valeur enregistrée n'est pas exploitable", () => {
    seed("n'importe quoi");
    render(<PatrimoinePage />);
    expect(screen.getByRole("button", { name: "Show gross worth" })).toBeTruthy();
  });
});
