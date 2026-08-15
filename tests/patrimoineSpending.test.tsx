/**
 * Répartition des dépenses de la synthèse du patrimoine.
 *
 * L'anneau lit les relevés des comptes agrégés, les classe par poste
 * (`lib/bank/categories`) et n'en garde que les DÉBITS. Trois choses peuvent
 * casser sans qu'aucun test unitaire ne le voie : la section n'est pas rendue du
 * tout, elle compte le salaire dans les dépenses, ou elle sort du mois en cours
 * — sa fenêtre est FIXE, celle du budget affiché juste à côté.
 *
 * L'anneau n'a plus de légende : les postes ne se nomment que dans l'infobulle
 * de leur part — « Poste · montant · part » —, d'où le helper, qui la lit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

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

/* Le relevé est daté à partir d'un « aujourd'hui » FIGÉ au 14 août. La fenêtre
   est le mois en cours : sans horloge fixe, le même test passerait le 14 et
   échouerait le 2, où « il y a quatre jours » tombe le mois d'avant. */
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

/** L'infobulle d'une part : « Transport · $40.00 · 40% ». */
const part = (name: string, amount: string) =>
  screen.getByText((_, el) =>
    el?.tagName.toLowerCase() === "title"
    && (el.textContent || "").startsWith(`${name} · ${amount} · `));

const seed = () => {
  cloudStore.clear();
  cloudStore.set(PATRIMOINE_LOCAL_KEY, { assets: [], history: [] });
};

describe("Dépenses par catégorie (synthèse du patrimoine)", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-14T10:00:00"));
  });

  afterEach(() => vi.useRealTimers());

  it("classe les débits par poste et écarte les revenus", () => {
    seed();
    render(<PatrimoinePage />);

    expect(screen.getByText("Monthly spending")).toBeTruthy();
    expect(part("Food & dining", "$60.00")).toBeTruthy();
    expect(part("Transport", "$40.00")).toBeTruthy();
    /* 60 + 40 = 100 dépensés : le chiffre de tête de la carte, et le centre de
       son anneau. Le salaire n'en fait pas partie — et il ne s'affiche plus
       nulle part ici : la carte ne parle que de dépenses, le revenu se lit sur
       l'aperçu du budget d'en face. */
    expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$2,400.00")).toBeNull();
    expect(screen.queryByText(/^Income ·/)).toBeNull();
  });

  it("s'en tient au mois en cours, sans pastilles pour en sortir", () => {
    seed();
    render(<PatrimoinePage />);

    /* L'achat d'il y a 45 jours est d'un mois précédent : il n'entre pas, et
       plus rien sur la carte ne permet d'aller le chercher — le bloc porte le
       mois du budget qu'il jouxte, pas une fenêtre au choix. */
    expect(screen.queryByText(/^Shopping ·/)).toBeNull();
    expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);

    /* Un seul jeu de pastilles sur la page, celui de la courbe du patrimoine :
       le bloc des dépenses n'a plus le sien. */
    expect(screen.getAllByText("1S")).toHaveLength(1);
  });
});
