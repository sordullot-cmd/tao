/**
 * Ce que porte une ligne de relevé, et ce qu'elle ne porte PAS.
 *
 * Deux règles opposées cohabitent sur cette page, et ce test garde la frontière
 * entre les deux :
 *   — sur un ACHAT, aucun logo. La vignette est l'icône de NATURE, la même sur
 *     toute la colonne ; seul le nom canonique du marchand reste, parce qu'il ne
 *     coûte rien visuellement et remplace un libellé illisible ;
 *   — sur un VIREMENT, le logo de la banque d'en face. Là, l'icône de nature ne
 *     dit rien que le libellé ne dise déjà, et la banque d'où l'argent vient
 *     n'est écrite nulle part ailleurs.
 *
 * Le troisième cas est le plus important : un virement d'une PERSONNE ne doit
 * porter aucune vignette de marque. C'est le risque propre à cette lecture — un
 * logo faux se lit comme une information vérifiée.
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
  { id: "t4", date: "2026-08-11", label: "VIR SEPA RECU DE REVOLUT LTD",
    detail: null, amount: 120, currency: "EUR", kind: "transfer", pending: false },
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

/** La ligne de relevé qui porte ce texte — c'est elle qu'on interroge, et non la
 *  page entière : une vignette n'est juste ou fausse que sur SA ligne. */
const ligne = (texte: string): HTMLElement => {
  const li = screen.getByText(texte).closest("li");
  if (!li) throw new Error(`ligne introuvable : ${texte}`);
  return li as HTMLElement;
};

const logoDe = (texte: string): string | null =>
  ligne(texte).querySelector("img")?.getAttribute("src") ?? null;

describe("ligne de relevé", () => {
  it("n'affiche AUCUN logo sur un achat", () => {
    render(<PatrimoineAssetPage assetId={COMPTE.id} setPage={() => {}} />);
    expect(logoDe("Carrefour")).toBeNull();
    expect(logoDe("Netflix")).toBeNull();
  });

  it("garde le nom canonique du marchand, et le libellé brut en sous-ligne", () => {
    render(<PatrimoineAssetPage assetId={COMPTE.id} setPage={() => {}} />);
    expect(screen.getByText("Carrefour")).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
    // Le libellé brut partage la sous-ligne avec le poste de dépense.
    expect(screen.getByText(/CARTE 12\/08 CARREFOUR CITY 4979/)).toBeTruthy();
  });

  it("porte le logo de la banque d'où vient un virement", () => {
    render(<PatrimoineAssetPage assetId={COMPTE.id} setPage={() => {}} />);
    // Le logo est celui déjà livré pour les COMPTES : une marque, une image.
    expect(logoDe("VIR SEPA RECU DE REVOLUT LTD")).toBe("/banque/revolut.webp");
  });

  it("laisse le virement d'une personne sans vignette de marque, et son libellé tel quel", () => {
    render(<PatrimoineAssetPage assetId={COMPTE.id} setPage={() => {}} />);
    expect(screen.getByText("VIR RECU DE CAMILLE MARTIN")).toBeTruthy();
    expect(logoDe("VIR RECU DE CAMILLE MARTIN")).toBeNull();
  });
});
