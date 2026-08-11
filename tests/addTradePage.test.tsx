import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* La page d'import a été repassée à la nouvelle DA (cartes d'étapes sur fond
   gris au lieu du double panneau bordé). Ce test garde le PARCOURS, pas
   l'apparence : les trois étapes sont là, l'action principale reste verrouillée
   tant qu'il manque une destination ou un fichier, et choisir une firme fait
   bien apparaître ses comptes dans la même carte. */
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}));

import AddTradePage from "@/components/pages/AddTradePage";

const FIRMS = [{ id: "f1", name: "Topstep", platform: "tradovate" }];
const ACCOUNTS = [
  { id: "a1", name: "Topstep 50k", firm_id: "f1", account_type: "eval", eval_account_size: "50k" },
];

const renderPage = () =>
  render(
    <AddTradePage
      accounts={ACCOUNTS}
      firms={FIRMS}
      trades={[]}
      setPage={() => {}}
      setAccounts={() => {}}
      addTrade={() => {}}
      addStrategy={() => {}}
    />
  );

/* Hors navigateur, i18n retombe sur l'anglais : les libellés attendus sont donc
   ceux du dictionnaire EN, pas ceux de l'interface française. */
describe("Page Ajouter des trades — parcours d'import", () => {
  it("affiche les trois étapes et garde l'import verrouillé sans fichier", () => {
    renderPage();

    expect(screen.getByText("Add trades")).toBeTruthy();
    // Une carte par étape : destination, format du fichier, fichier.
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Broker")).toBeTruthy();
    expect(screen.getByText("File")).toBeTruthy();

    const cta = screen.getByRole("button", { name: "Import trades" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("liste les comptes de la firme choisie dans la carte Destination", () => {
    renderPage();

    fireEvent.click(screen.getByText("Pick a prop firm or an account"));
    fireEvent.click(screen.getByText("Topstep"));

    expect(screen.getByText("Target accounts")).toBeTruthy();
    expect(screen.getByText("Topstep 50k")).toBeTruthy();

    // La destination est renseignée, mais il manque toujours le fichier.
    const cta = screen.getByRole("button", { name: "Import trades" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });
});
