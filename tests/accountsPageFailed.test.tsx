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
  it("sort un compte échoué de sa firme et le range dans le groupe, même seul", () => {
    renderPage(
      [acc("ok", "Vivant"), acc("ko", "Tombé")],
      [trade("ok", 300), trade("ko", -2_100)],
    );
    // Le groupe existe dès le premier échec, replié comme une firme.
    expect(inTable().getByText("Comptes échoués")).toBeTruthy();
    expect(inTable().queryByText("Tombé")).toBeNull();
    const chevrons = inTable().getAllByRole("button", { name: /déplier|expand/i });
    // Le groupe vient après les firmes : c'est le dernier chevron du tableau.
    fireEvent.click(chevrons[chevrons.length - 1]);
    expect(inTable().getByText("Tombé")).toBeTruthy();
    // La firme, dépliée à son tour, ne liste plus que le compte vivant.
    fireEvent.click(chevrons[0]);
    expect(inTable().getAllByText("Vivant")).toHaveLength(1);
    expect(inTable().getAllByText("Tombé")).toHaveLength(1);
  });

  it("montre le compte échoué seul dans les plus actifs, sur sa propre carte", () => {
    renderPage(
      [acc("ok", "Vivant"), acc("ko", "Tombé")],
      [trade("ok", 300), trade("ko", -2_100)],
    );
    expect(inActive().getByText("Tombé")).toBeTruthy();
    expect(inActive().queryByText("Comptes échoués")).toBeNull();
  });

  it("résume plusieurs échecs en une seule carte de groupe dans les plus actifs", () => {
    renderPage(
      [acc("ok", "Vivant"), acc("ko1", "Tombé 1"), acc("ko2", "Tombé 2")],
      [trade("ok", 300), trade("ko1", -2_100), trade("ko2", -2_500)],
    );
    expect(inActive().getByText("Comptes échoués")).toBeTruthy();
    expect(inActive().queryByText("Tombé 1")).toBeNull();
    expect(inActive().queryByText("Tombé 2")).toBeNull();
    // Les échecs ferment la rangée, à droite des comptes vivants.
    const cards = (screen.getByText("Most active").closest("section") as HTMLElement)
      .querySelectorAll("[data-card]");
    expect(cards[cards.length - 1].textContent).toContain("Comptes échoués");
  });

  it("ouvre la page du groupe depuis sa carte", () => {
    const setPage = vi.fn();
    render(
      <AccountsPage
        accounts={[acc("ok", "Vivant"), acc("ko1", "Tombé 1"), acc("ko2", "Tombé 2")]}
        trades={[trade("ok", 300), trade("ko1", -2_100), trade("ko2", -2_500)]}
        firms={FIRMS}
        archivedMeta={{}}
        setAccounts={() => {}}
        setFirms={() => {}}
        setArchivedMeta={() => {}}
        setPage={setPage}
        setSelectedAccountDetailId={() => {}}
        setSelectedFirmId={() => {}}
      />
    );
    fireEvent.click(inActive().getByText("Comptes échoués"));
    expect(setPage).toHaveBeenCalledWith("failed-accounts");
  });
});
