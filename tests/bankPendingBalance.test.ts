import { describe, it, expect } from "vitest";

/**
 * Le solde ATTENDU — solde comptabilisé de la banque plus ses opérations en
 * attente — est le chiffre que toutes les pages du patrimoine affichent. Ce qui
 * est protégé ici, c'est qu'il se calcule à UN seul endroit : le héros, les
 * totaux de classe et la fin de la courbe partaient sinon de deux définitions,
 * et se répondaient à quelques euros près sans qu'on sache lequel croire.
 */

import { withPendingBalances } from "@/lib/bank/useBankAccounts";
import type { BankTransaction } from "@/lib/bank/transactions";
import type { Asset } from "@/lib/patrimoine";

const asset = (id: string, balance: number): Asset =>
  ({ id, name: id, type: "checking", balance }) as Asset;

const tx = (amount: number, pending = false): BankTransaction => ({
  id: `${amount}-${pending}`,
  date: "2026-08-13",
  label: "Carte",
  detail: null,
  amount,
  currency: "EUR",
  kind: "card",
  pending,
});

describe("solde attendu d'un compte agrégé", () => {
  it("ajoute l'attente au solde rendu par la banque", () => {
    const [a] = withPendingBalances([asset("enablebanking-x", 1_000)], {
      "enablebanking-x": [tx(-50, true), tx(-200)],
    });
    expect(a.balance).toBe(950);
  });

  it("laisse intact un actif sans relevé — et le rend par identité", () => {
    const assets = [asset("m1", 250_000)];
    expect(withPendingBalances(assets, {})).toBe(assets);
  });

  it("rend le tableau d'origine quand rien n'est en attente : les mémos en dépendent", () => {
    const assets = [asset("enablebanking-x", 1_000)];
    expect(withPendingBalances(assets, { "enablebanking-x": [tx(-200)] })).toBe(assets);
  });

  it("arrondit au centime plutôt que de traîner les flottants", () => {
    const [a] = withPendingBalances([asset("enablebanking-x", 0.1)], {
      "enablebanking-x": [tx(0.2, true)],
    });
    expect(a.balance).toBe(0.3);
  });
});
