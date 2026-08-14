/**
 * Le flux réel de la synthèse du patrimoine.
 *
 * Le diagramme lit les relevés des comptes agrégés et les classe par poste
 * (`lib/bank/categories`). Trois choses peuvent casser sans qu'aucun test
 * unitaire ne le voie : la section n'est pas rendue du tout, le salaire tombe du
 * côté des dépenses, ou la fenêtre choisie ne recadre rien.
 *
 * Les branches se lisent par leur PASTILLE — « Poste : montant », posée sur le
 * ruban (cf. `SankeyGraph`). Le nom est le texte propre de la pastille et le
 * montant celui de son <span> : d'où le helper, qui repère l'une et vérifie
 * l'autre d'un seul geste.
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

/** La pastille d'une branche, montant compris : « Transport : $40.00 ». */
const branch = (name: string, amount: string) => {
  const pastille = screen.getByText(name);
  expect(pastille.textContent?.replace(/\s+/g, " ")).toBe(`${name} : ${amount}`);
};

const seed = (period?: string) => {
  cloudStore.clear();
  cloudStore.set(PATRIMOINE_LOCAL_KEY, { assets: [], history: [] });
  if (period !== undefined) cloudStore.set(SPEND_PERIOD_KEY, period);
};

describe("Flux réel (synthèse du patrimoine)", () => {
  beforeEach(() => cleanup());

  it("classe les débits par poste et écarte les revenus", () => {
    seed("1M");
    render(<PatrimoinePage />);

    expect(screen.getByText("Money flow")).toBeTruthy();
    branch("Food & dining", "$60.00");
    branch("Transport", "$40.00");
    /* Le salaire entre PAR LA GAUCHE : il nourrit le nœud central et ne devient
       jamais un poste de dépense. Le poste « Autres revenus » n'existe donc pas
       dans le dessin — une branche à 2 400 du mauvais côté se verrait ici. */
    branch("Money in", "$2,400.00");
    expect(screen.queryByText("Income")).toBeNull();
  });

  it("recadre sur la fenêtre choisie", () => {
    // « 3 mois » attrape en plus l'achat d'il y a 45 jours.
    seed("3M");
    render(<PatrimoinePage />);
    branch("Shopping", "$200.00");
  });

  it("suit le changement de fenêtre", () => {
    seed("3M");
    render(<PatrimoinePage />);
    /* Deux jeux de pastilles sur la page : celui de la courbe du patrimoine
       d'abord, celui du flux ensuite. C'est le SECOND qu'on règle ici. */
    const weekPills = screen.getAllByText("1S");
    fireEvent.click(weekPills[weekPills.length - 1]);
    expect(screen.queryByText("Shopping")).toBeNull();
    branch("Food & dining", "$60.00");
  });
});
