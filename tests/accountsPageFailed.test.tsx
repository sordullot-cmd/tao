import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* Un compte qui a touché son plancher quitte sa firme et les « plus actifs »
   pour son propre groupe. Mêmes neutralisations que accountsPageExpand. */
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));
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
vi.mock("@/components/pages/ScalingPage", () => ({ RoadmapSection: () => null }));
vi.mock("@/components/modals/AccountModals", () => ({
  PropFirmModal: () => null,
  AccountModal: () => null,
}));

import AccountsPage from "@/components/pages/AccountsPage";

const FIRMS = [{ id: "f1", name: "Topstep", platform: "tradovate" }];
const acc = (id: string, name: string) =>
  ({ id, name, firm_id: "f1", account_type: "eval", eval_account_size: "50k" });
/* Topstep 50k : 2 000 de drawdown. −2 100 le touche, +300 non. */
const today = new Date().toISOString().slice(0, 10);
const trade = (account_id: string, pnl: number) =>
  ({ id: `${account_id}-t`, account_id, date: today, exit_time: "10:00", pnl });

const renderPage = (accounts: unknown[], trades: unknown[]) =>
  render(
    <AccountsPage
      accounts={accounts}
      trades={trades}
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

const inTable = () =>
  within(screen.getByText("All accounts").closest("section") as HTMLElement);
const inActive = () =>
  within(screen.getByText("Most active").closest("section") as HTMLElement);

beforeEach(() => cloudStore.clear());

describe("Page Comptes — comptes en échec", () => {
  it("sort un compte échoué de sa firme et le laisse seul sur sa ligne", () => {
    renderPage(
      [acc("ok", "Vivant"), acc("ko", "Tombé")],
      [trade("ok", 300), trade("ko", -2_100)],
    );
    // La firme ne compte plus que le compte vivant.
    fireEvent.click(inTable().getAllByRole("button", { name: /déplier|expand/i })[0]);
    expect(inTable().getByText("Vivant")).toBeTruthy();
    // Un seul échoué : pas de groupe, sa ligne à lui.
    expect(inTable().queryByText("Comptes échoués")).toBeNull();
    expect(inTable().getByText("Tombé")).toBeTruthy();
    expect(inActive().queryByText("Tombé")).toBeNull();
  });

  it("regroupe les comptes échoués dès qu'il y en a deux", () => {
    renderPage(
      [acc("ok", "Vivant"), acc("ko1", "Tombé 1"), acc("ko2", "Tombé 2")],
      [trade("ok", 300), trade("ko1", -2_100), trade("ko2", -2_500)],
    );
    const groupe = inTable().getByText("Comptes échoués");
    expect(groupe).toBeTruthy();
    // Replié par défaut, comme une firme.
    expect(inTable().queryByText("Tombé 1")).toBeNull();
    // Le groupe vient après les firmes : c'est le dernier chevron du tableau.
    const chevrons = inTable().getAllByRole("button", { name: /déplier|expand/i });
    fireEvent.click(chevrons[chevrons.length - 1]);
    expect(inTable().getByText("Tombé 1")).toBeTruthy();
    expect(inTable().getByText("Tombé 2")).toBeTruthy();
    expect(inActive().queryByText("Tombé 1")).toBeNull();
  });
});
