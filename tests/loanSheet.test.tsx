import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* La fiche d'un crédit était vide : `PatrimoineAssetPage` n'affiche des positions
   que pour un portefeuille et un relevé que pour un compte agrégé — un crédit
   n'est ni l'un ni l'autre, il ne restait donc qu'un nom et un montant. Elle
   porte maintenant `LoanBody`, le même bloc que la carte de la page « Crédits &
   passifs ».

   Ce qui est sous test : que la fiche porte bien ce bloc (échéances, simulateur,
   échéancier), qu'un crédit s'y lise en POSITIF, et que les deux gestes qui
   modifient le patrimoine marchent aussi depuis ici — ils existent désormais sur
   deux surfaces, et c'est le calcul de la part capital qui fausserait le
   patrimoine net s'il se trompait. */
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

import PatrimoineAssetPage from "@/components/pages/PatrimoineAssetPage";
import { PATRIMOINE_LOCAL_KEY, type Asset } from "@/lib/patrimoine";

/* Même prêt d'école que la page Crédits : 1 000 € à 12 % l'an (1 %/mois), 100 €
   par mois, première échéance le 5. La date système est au 5 février : deux
   échéances sont tombées, le contrat dit donc 819,10 € — c'est ce restant dû qui
   est saisi, pour qu'aucun écart ne vienne parasiter les assertions. */
const loan = (over: Partial<Asset> = {}): Asset => ({
  id: "l1",
  name: "Home loan",
  type: "loan",
  balance: -819.1,
  institution: null,
  updatedAt: null,
  loan: { principal: 1000, rate: 12, payment: 100, insurance: null, startDate: "2020-01-05", months: 10 },
  ...over,
});

const seed = (assets: Asset[]) => {
  cloudStore.clear();
  cloudStore.set(PATRIMOINE_LOCAL_KEY, { assets, history: [] });
};

const pageText = () => document.body.textContent || "";

describe("Fiche d'un crédit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2020-02-05T10:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reprend l'en-tête de la carte : restant dû en positif et charge mensuelle", () => {
    seed([loan()]);
    render(<PatrimoineAssetPage assetId="l1" />);

    // Le store le porte à −819,10 ; la fiche ne montre pas de signe négatif.
    expect(pageText()).toMatch(/819\.10/);
    expect(pageText()).not.toMatch(/-\D?819\.10/);
    // Sous le montant, ce que le crédit coûte chaque mois — comme en liste.
    expect(screen.getByText(/100\.00 \/ month/)).toBeTruthy();
    // Et le nom du crédit, avec taux et durée restante en sous-ligne.
    expect(screen.getByText("Home loan")).toBeTruthy();
    expect(pageText()).toMatch(/12 % · 9 months/);
  });

  it("porte les mêmes mesures que la carte de la liste", () => {
    seed([loan()]);
    render(<PatrimoineAssetPage assetId="l1" />);

    expect(screen.getByText("Next payment")).toBeTruthy();
    expect(screen.getByText("Time left")).toBeTruthy();
    expect(screen.getByText("Loan ends")).toBeTruthy();
    expect(screen.getByText("Total left to pay")).toBeTruthy();
    // Part capital / intérêts de la prochaine échéance : 1 % de 819,10 € = 8,19 €.
    expect(pageText()).toMatch(/Next payment of .?100\.00: .?91\.81 principal, .?8\.19 interest/);
  });

  it("porte le simulateur de remboursement anticipé et l'échéancier", () => {
    seed([loan()]);
    render(<PatrimoineAssetPage assetId="l1" />);

    expect(screen.getByText("Early repayment")).toBeTruthy();
    // Le symbole de devise suit les préférences : seul le libellé est figé.
    expect(screen.getByText(/^One-off payment/)).toBeTruthy();
    expect(screen.getByText(/^Extra per month/)).toBeTruthy();
    expect(screen.getByText("Amortisation schedule")).toBeTruthy();
    // L'échéancier descend bien jusqu'au solde : 819,10 − 91,81 = 727,29.
    expect(pageText()).toMatch(/727\.29/);
  });

  it("ne décrémente le restant dû que de la part capital, après confirmation", () => {
    seed([loan()]);
    render(<PatrimoineAssetPage assetId="l1" />);

    fireEvent.click(screen.getByRole("button", { name: "Payment made" }));
    expect(cloudStore.get(PATRIMOINE_LOCAL_KEY)).toMatchObject({ assets: [{ balance: -819.1 }] });

    fireEvent.click(screen.getByRole("button", { name: /^Confirm:/ }));
    // 100 € prélevés, 8,19 € d'intérêts : 91,81 € de capital amorti.
    expect(cloudStore.get(PATRIMOINE_LOCAL_KEY)).toMatchObject({ assets: [{ balance: -727.29 }] });
  });

  it("propose de recaler un restant dû qui a pris du retard sur le contrat", () => {
    seed([loan({ balance: -1000 })]);
    render(<PatrimoineAssetPage assetId="l1" />);

    fireEvent.click(screen.getByRole("button", { name: "Match the contract" }));
    expect(cloudStore.get(PATRIMOINE_LOCAL_KEY)).toMatchObject({ assets: [{ balance: -819.1 }] });
  });

  it("dit ce qui manque plutôt que d'afficher une fiche de tirets", () => {
    seed([loan({ loan: null })]);
    render(<PatrimoineAssetPage assetId="l1" />);

    expect(pageText()).toContain("to get the schedule and the cost of the loan");
    expect(screen.getByRole("button", { name: "Complete the loan" })).toBeTruthy();
    // Aucun échéancier, donc aucun tableau ni simulateur.
    expect(screen.queryByText("Amortisation schedule")).toBeNull();
    expect(screen.queryByText("Early repayment")).toBeNull();
  });

  it("laisse la fiche d'un actif ordinaire intacte", () => {
    seed([{ id: "a1", name: "Brokerage", type: "pea", balance: 4000, institution: null, updatedAt: null }]);
    render(<PatrimoineAssetPage assetId="a1" />);

    expect(screen.queryByText("Amortisation schedule")).toBeNull();
    expect(screen.getByText("Holdings")).toBeTruthy();
  });
});
