import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* Reproduction du bug « le chevron d'une firme ne déplie rien » sur la vraie
   page, pas sur le composant isolé : c'est l'intégration qui est en cause.
   Seules les dépendances hors sujet (réseau, modales, simulateur) sont
   neutralisées. */
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));
/* useCloudState est remplacé par un state adossé à un store en mémoire, pour
   pouvoir démonter puis remonter la page comme le ferait un rechargement. */
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
vi.mock("@/components/pages/ScalingPage", () => ({ RoadmapSection: () => null }));
vi.mock("@/components/modals/AccountModals", () => ({
  PropFirmModal: () => null,
  AccountModal: () => null,
}));

import AccountsPage from "@/components/pages/AccountsPage";

const FIRMS = [{ id: "f1", name: "Topstep", platform: "tradovate" }];
const ACCOUNTS = [
  { id: "a1", name: "Topstep 50k", firm_id: "f1", account_type: "eval", eval_account_size: "50k" },
];

const renderPage = () =>
  render(
    <AccountsPage
      accounts={ACCOUNTS}
      trades={[]}
      firms={FIRMS}
      archivedMeta={{}}
      setAccounts={() => {}}
      setFirms={() => {}}
      setArchivedMeta={() => {}}
      setPage={() => {}}
      setSelectedAccountDetailId={() => {}}
      setSelectedFirmId={() => {}}
    />
  );

/* Le dépliage se juge dans la section « Tous les comptes » seule : la bande
   des plus actifs cite elle aussi le compte (une firme à compte unique y est
   représentée par son compte), et une recherche globale confondrait les deux. */
const inTable = () =>
  within(screen.getByText("All accounts").closest("section") as HTMLElement);

describe("Page Comptes — dépliage d'une firme", () => {
  it("affiche les sous-comptes au clic sur le chevron, et retient le dépliage", () => {
    const { unmount } = renderPage();

    // Le compte enfant n'est pas listé tant que la firme est repliée.
    expect(inTable().queryByText("Topstep 50k")).toBeNull();

    fireEvent.click(inTable().getAllByRole("button", { name: /déplier|expand/i })[0]);
    expect(inTable().getByText("Topstep 50k")).toBeTruthy();

    // Rechargement de la page : la firme doit rouvrir d'elle-même.
    unmount();
    renderPage();
    expect(inTable().getByText("Topstep 50k")).toBeTruthy();
  });
});
