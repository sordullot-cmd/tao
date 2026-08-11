import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* Depuis la fiche d'un compte, on doit pouvoir remonter à sa prop firm — l'app
   n'a pas de bouton « précédent » de navigateur. */
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }),
}));
vi.mock("@/lib/auth/supabaseAuthProvider", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (_k: string, _c: string, d: unknown) => React.useState(d),
}));

import AccountDetailPage from "@/components/pages/AccountDetailPage";

const FIRMS = [{ id: "f1", name: "Topstep", platform: "topstep" }];
const ACCOUNTS = [
  { id: "a1", name: "Topstep 50k", firm_id: "f1", account_type: "funded", eval_account_size: "50k" },
  { id: "a2", name: "Compte perso", firm_id: null, account_type: "live", broker: "Tradovate" },
];

const renderPage = (accountId: string) => {
  const setPage = vi.fn();
  const setSelectedFirmId = vi.fn();
  render(
    <AccountDetailPage
      accountId={accountId}
      accounts={ACCOUNTS}
      firms={FIRMS}
      trades={[]}
      strategies={[]}
      setPage={setPage}
      setSelectedFirmId={setSelectedFirmId}
      archivedMeta={{}}
    />
  );
  return { setPage, setSelectedFirmId };
};

describe("Fiche d'un compte — retour au parent", () => {
  it("ramène à la prop firm du compte", () => {
    const { setPage, setSelectedFirmId } = renderPage("a1");
    fireEvent.click(screen.getByRole("button", { name: "Topstep" }));
    expect(setSelectedFirmId).toHaveBeenCalledWith("f1");
    expect(setPage).toHaveBeenCalledWith("firm-detail");
  });

  /* Un compte de prop firm ne renvoie QU'À sa firme : la liste des comptes est
     joignable depuis celle-ci, la doubler ici brouillerait la hiérarchie. */
  it("ne propose pas la liste des comptes depuis un compte de prop firm", () => {
    renderPage("a1");
    expect(screen.queryByRole("button", { name: /^comptes$|^accounts$/i })).toBeNull();
  });

  it("ramène à la liste des comptes depuis un compte sans firme", () => {
    const { setPage, setSelectedFirmId } = renderPage("a2");
    fireEvent.click(screen.getByRole("button", { name: /^comptes$|^accounts$/i }));
    expect(setPage).toHaveBeenCalledWith("accounts");
    expect(setSelectedFirmId).not.toHaveBeenCalled();
  });

  it("n'affiche qu'un seul maillon quand le compte n'a pas de firme", () => {
    renderPage("a2");
    expect(screen.queryByRole("button", { name: "Topstep" })).toBeNull();
  });
});
