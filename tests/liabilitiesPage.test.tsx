import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* La page Crédits ne se contente plus d'afficher un montant : elle projette un
   échéancier et propose deux gestes qui MODIFIENT le patrimoine (passer une
   échéance, recaler sur le contrat). Ce sont ces deux-là qu'on garde sous test,
   avec la part capital / intérêts de la prochaine échéance — le calcul que
   personne ne refait à la main, et celui qui fausserait le patrimoine net s'il
   se trompait. La mise en forme n'a pas à être figée ici. */
const cloudStore = new Map<string, unknown>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(() => (cloudStore.has(k) ? cloudStore.get(k) : d));
    const set = (u: unknown) => setV((prev: unknown) => {
      const next = typeof u === "function" ? (u as (p: unknown) => unknown)(prev) : u;
      cloudStore.set(k, next);
      return next;
    });
    return [v, set];
  },
}));

/* Aucune banque connectée : sans ce mock, le hook irait chercher
   `/api/bank/accounts`, qui n'existe pas sous jsdom. */
vi.mock("@/lib/bank/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankAccounts")>()),
  useBankAccounts: () => ({
    configured: false, connections: [], accounts: [], loading: false, error: null, reload: () => {},
  }),
}));

import PatrimoineLiabilitiesPage from "@/components/pages/PatrimoineLiabilitiesPage";
import { PATRIMOINE_LOCAL_KEY, type Asset } from "@/lib/patrimoine";

/* Prêt aux chiffres ronds : 1 000 € à 12 % l'an (1 %/mois), 100 € par mois. La
   première échéance tombe le 5, la date système est au 4 — rien n'est encore
   prélevé, donc le restant dû saisi est aussi celui du contrat. */
const loan = (over: Partial<Asset> = {}): Asset => ({
  id: "l1",
  name: "Home loan",
  type: "loan",
  balance: -1000,
  institution: null,
  updatedAt: null,
  loan: { principal: 1000, rate: 12, payment: 100, insurance: null, startDate: "2020-01-05", months: null },
  ...over,
});

const pea = (): Asset => ({
  id: "a1", name: "Brokerage", type: "pea", balance: 4000, institution: null, updatedAt: null,
});

const seed = (assets: Asset[]) => {
  cloudStore.clear();
  cloudStore.set(PATRIMOINE_LOCAL_KEY, { assets, history: [] });
};

/** Texte de toute la page, pour les assertions sur des montants qui apparaissent
 *  dans plusieurs cellules (le symbole de devise dépend des préférences). */
const pageText = () => document.body.textContent || "";

describe("Page Crédits", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2020-01-04T10:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("projette la charge mensuelle, la fin du crédit et le poids de la dette", () => {
    seed([pea(), loan()]);
    render(<PatrimoineLiabilitiesPage />);

    // 1 000 € de dette sur 4 000 € d'actifs.
    expect(screen.getByText("25 %")).toBeTruthy();
    expect(screen.getByText("Monthly cost")).toBeTruthy();
    /* Onze échéances de 100 €, la dernière le 5 novembre 2020. Le mois est rendu
       par `Intl` dans la locale de l'ENVIRONNEMENT, pas dans la langue de l'app
       (parti pris de `lib/ui/format`) : le test accepte donc les deux. */
    expect(pageText()).toMatch(/(November|novembre) 2020/);
    // Deux fois : le total de la dette, puis le crédit lui-même.
    expect(screen.getAllByText("Interest left")).toHaveLength(2);
  });

  it("annonce la part capital et la part intérêts de la prochaine échéance", () => {
    seed([loan()]);
    render(<PatrimoineLiabilitiesPage />);

    // 1 % de 1 000 € = 10 € d'intérêts, donc 90 € de capital.
    expect(pageText()).toMatch(/Next payment of .?100\.00: .?90\.00 principal, .?10\.00 interest/);
  });

  it("ne décrémente le restant dû que de la part capital, et seulement après confirmation", () => {
    seed([loan()]);
    render(<PatrimoineLiabilitiesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Payment made" }));
    // Premier clic : rien n'a bougé, la confirmation est demandée.
    expect(cloudStore.get(PATRIMOINE_LOCAL_KEY)).toMatchObject({ assets: [{ balance: -1000 }] });

    fireEvent.click(screen.getByRole("button", { name: /^Confirm:/ }));
    expect(cloudStore.get(PATRIMOINE_LOCAL_KEY)).toMatchObject({ assets: [{ balance: -910 }] });
  });

  it("renonce à la confirmation sans toucher au patrimoine", () => {
    seed([loan()]);
    render(<PatrimoineLiabilitiesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Payment made" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Payment made" })).toBeTruthy();
    expect(cloudStore.get(PATRIMOINE_LOCAL_KEY)).toMatchObject({ assets: [{ balance: -1000 }] });
  });

  it("propose de recaler un restant dû qui a pris du retard sur le contrat", () => {
    // Première échéance au 5 décembre : au 4 janvier, une seule est tombée, le
    // contrat dit donc 910 € — le montant saisi en annonce 1 000.
    seed([loan({ loan: { principal: 1000, rate: 12, payment: 100, insurance: null, startDate: "2019-12-05", months: null } })]);
    render(<PatrimoineLiabilitiesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Match the contract" }));
    expect(cloudStore.get(PATRIMOINE_LOCAL_KEY)).toMatchObject({ assets: [{ balance: -910 }] });
  });

  it("dit ce qui manque plutôt que d'afficher un échéancier vide", () => {
    seed([loan({ loan: null })]);
    render(<PatrimoineLiabilitiesPage />);

    expect(pageText()).toContain("to get the schedule and the cost of the loan");
    expect(screen.getByRole("button", { name: "Complete the loan" })).toBeTruthy();
    // Aucun échéancier, donc aucun tableau.
    expect(screen.queryByText("Amortisation schedule")).toBeNull();
  });

  it("compte le total d'intérêts comme partiel quand un crédit n'est pas projetable", () => {
    seed([loan(), loan({ id: "l2", name: "Car loan", balance: -5000, loan: null })]);
    render(<PatrimoineLiabilitiesPage />);

    expect(pageText()).toContain("Partial total: 1 loan(s)");
  });
});
