/**
 * Répartition des dépenses de la synthèse du patrimoine.
 *
 * L'anneau lit les relevés des comptes agrégés, les classe par poste
 * (`lib/bank/categories`) et n'en garde que les DÉBITS. Trois choses peuvent
 * casser sans qu'aucun test unitaire ne le voie : la section n'est pas rendue du
 * tout, elle compte le salaire dans les dépenses, ou la fenêtre choisie ne
 * recadre rien.
 *
 * L'anneau n'a plus de légende : les postes ne se nomment que dans l'infobulle
 * de leur part — « Poste · montant · part » —, d'où le helper, qui la lit.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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

const account = {
  id: "enablebanking-c1",
  uid: "u1",
  name: "Compte courant",
  type: "checking",
  balance: 1_000,
  institution: "Boursorama",
  logo: null,
};

vi.mock("@/lib/bank/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankAccounts")>()),
  useBankAccounts: () => ({
    configured: true, connections: [], accounts: [account],
    loading: false, error: null, reload: () => {}, revalidating: false, updatedAt: null,
  }),
}));

/* Le relevé est daté À PARTIR D'AUJOURD'HUI : la fenêtre est glissante, des
   dates en dur sortiraient du cadre au bout de quelques jours. */
const dayAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const transactions = [
  { id: "t1", date: dayAgo(2), label: "CARREFOUR CITY", detail: null, amount: -60, currency: "EUR", kind: "card", pending: false },
  { id: "t2", date: dayAgo(3), label: "SNCF CONNECT", detail: null, amount: -40, currency: "EUR", kind: "card", pending: false },
  { id: "t3", date: dayAgo(4), label: "VIR SALAIRE", detail: null, amount: 2_400, currency: "EUR", kind: "transfer", pending: false },
  // Hors fenêtre « 1 semaine », dans la fenêtre « 3 mois ».
  { id: "t4", date: dayAgo(45), label: "LEROY MERLIN", detail: null, amount: -200, currency: "EUR", kind: "card", pending: false },
];

vi.mock("@/lib/bank/useBankTransactions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankTransactions")>()),
  useBankTransactionsAll: () => ({ byUid: { u1: transactions }, loading: false }),
}));

import PatrimoinePage from "@/components/pages/PatrimoinePage";
import { PATRIMOINE_LOCAL_KEY } from "@/lib/patrimoine";

const SPEND_PERIOD_KEY = "tr4de_patrimoine_spend_period";

/** L'infobulle d'une part : « Transport · $40.00 · 40% ». */
const part = (name: string, amount: string) =>
  screen.getByText((_, el) =>
    el?.tagName.toLowerCase() === "title"
    && (el.textContent || "").startsWith(`${name} · ${amount} · `));

const seed = (period?: string) => {
  cloudStore.clear();
  cloudStore.set(PATRIMOINE_LOCAL_KEY, { assets: [], history: [] });
  if (period !== undefined) cloudStore.set(SPEND_PERIOD_KEY, period);
};

describe("Dépenses par catégorie (synthèse du patrimoine)", () => {
  beforeEach(() => cleanup());

  it("classe les débits par poste et écarte les revenus", () => {
    seed("1M");
    render(<PatrimoinePage />);

    expect(screen.getByText("Spending by category")).toBeTruthy();
    expect(part("Food & dining", "$60.00")).toBeTruthy();
    expect(part("Transport", "$40.00")).toBeTruthy();
    // 60 + 40 = 100 dépensés : le salaire de 2 400 n'en fait pas partie.
    expect(screen.getByText("$100.00")).toBeTruthy();
    expect(screen.queryByText(/^Income ·/)).toBeNull();
  });

  it("recadre sur la fenêtre choisie", () => {
    // « 3 mois » attrape en plus l'achat d'il y a 45 jours.
    seed("3M");
    render(<PatrimoinePage />);
    expect(part("Shopping", "$200.00")).toBeTruthy();
    // 100 + 200 = 300 sur la fenêtre.
    expect(screen.getByText("$300.00")).toBeTruthy();
  });

  it("suit le changement de fenêtre", () => {
    seed("3M");
    render(<PatrimoinePage />);
    /* Deux jeux de pastilles sur la page : celui de la courbe du patrimoine
       d'abord, celui des dépenses ensuite. C'est le SECOND qu'on règle ici. */
    const weekPills = screen.getAllByText("1S");
    fireEvent.click(weekPills[weekPills.length - 1]);
    expect(screen.queryByText(/^Shopping ·/)).toBeNull();
    expect(screen.getByText("$100.00")).toBeTruthy();
  });
});
