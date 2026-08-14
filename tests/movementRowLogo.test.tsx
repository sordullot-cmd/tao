/**
 * Ce que porte une ligne de relevé, et ce qu'elle ne porte PAS.
 *
 * Les logos de marchand ont été retirés de cette page : la vignette est l'icône
 * de NATURE, la même sur toute la colonne. Le nom canonique, lui, reste — il ne
 * coûte rien visuellement et remplace un libellé illisible.
 *
 * Le test garde les deux moitiés : aucune image de marchand ne doit revenir ici
 * par inadvertance, et le nom canonique ne doit pas disparaître avec elle.
 * `MerchantAvatar` et la table de logos restent testés de leur côté
 * (`merchants.test.ts`, `merchantAvatar.test.tsx`) : ils sont prêts à servir
 * ailleurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import type { BankTransaction } from "@/lib/bank/transactions";

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

/* Un compte AGRÉGÉ : c'est la seule sorte qui porte un relevé. L'id doit porter
   le préfixe `enablebanking-`, sinon `isBankAsset` le prend pour un actif saisi
   à la main et la section des mouvements n'est pas rendue du tout. */
const COMPTE = {
  id: "enablebanking-abc123",
  uid: "abc123",
  name: "Compte courant",
  type: "checking",
  balance: 1_240.5,
  institution: "Boursorama",
  logo: null,
};

vi.mock("@/lib/bank/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankAccounts")>()),
  useBankAccounts: () => ({
    configured: true, connections: [], accounts: [COMPTE], loading: false,
    error: null, updatedAt: "2026-08-14T08:00:00Z", reload: () => {},
  }),
}));

const TXS: BankTransaction[] = [
  { id: "t1", date: "2026-08-13", label: "CARTE 12/08 CARREFOUR CITY 4979",
    detail: null, amount: -42.3, currency: "EUR", kind: "card", pending: false },
  { id: "t2", date: "2026-08-12", label: "PRLV SEPA NETFLIX INTERNATIONAL",
    detail: null, amount: -13.49, currency: "EUR", kind: "direct_debit", pending: false },
  { id: "t3", date: "2026-08-11", label: "VIR RECU DE CAMILLE MARTIN",
    detail: null, amount: 800, currency: "EUR", kind: "transfer", pending: false },
];

vi.mock("@/lib/bank/useBankTransactions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankTransactions")>()),
  useBankTransactions: () => ({
    transactions: TXS, windowDays: 90, loading: false, revalidating: false,
    error: null, reload: () => {},
  }),
}));

import PatrimoineAssetPage from "@/components/pages/PatrimoineAssetPage";

beforeEach(() => {
  cleanup();
  cloudStore.clear();
  cloudStore.set("tr4de_patrimoine", { assets: [], history: [] });
});

describe("ligne de relevé", () => {
  it("n'affiche AUCUN logo de marchand", () => {
    render(<PatrimoineAssetPage assetId={COMPTE.id} setPage={() => {}} />);
    const srcs = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src") ?? "");
    expect(srcs.filter((s) => s.startsWith("/marchands/") || s.startsWith("/brokers/"))).toEqual([]);
  });

  it("garde le nom canonique du marchand, et le libellé brut en sous-ligne", () => {
    render(<PatrimoineAssetPage assetId={COMPTE.id} setPage={() => {}} />);
    expect(screen.getByText("Carrefour")).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
    // Le libellé brut partage la sous-ligne avec le poste de dépense.
    expect(screen.getByText(/CARTE 12\/08 CARREFOUR CITY 4979/)).toBeTruthy();
  });

  it("laisse le virement tel quel — aucun marchand n'y est cherché", () => {
    render(<PatrimoineAssetPage assetId={COMPTE.id} setPage={() => {}} />);
    expect(screen.getByText("VIR RECU DE CAMILLE MARTIN")).toBeTruthy();
  });
});
