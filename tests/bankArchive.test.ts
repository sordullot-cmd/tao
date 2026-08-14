import { describe, expect, it } from "vitest";

import { archivable, hashText, keyTransactions, mergeTransactions } from "@/lib/bank/archive";
import { normalizeTransaction, type BankTransaction } from "@/lib/bank/transactions";

/**
 * L'archive ne vaut que par la STABILITÉ de sa clé : une clé qui bouge d'une
 * lecture à l'autre ne se voit pas — elle ne casse rien, elle empile
 * silencieusement des doublons du même relevé. Ces tests fixent donc d'abord ce
 * qui ne doit PAS entrer dans la clé, puis la fusion des deux sources.
 */

const tx = (over: Partial<BankTransaction> = {}): BankTransaction => ({
  id: "x",
  date: "2026-05-16",
  label: "CARREFOUR",
  detail: null,
  amount: -42.5,
  currency: "EUR",
  kind: "card",
  pending: false,
  ...over,
});

describe("clé d'archive", () => {
  it("ignore l'identifiant de l'agrégateur", () => {
    // L'identifiant de repli est construit sur le rang dans la PAGINATION : il
    // change avec la fenêtre demandée, la clé ne doit pas en dépendre.
    const [a] = keyTransactions([tx({ id: "tx-2026-05-16-0--42.5" })]);
    const [b] = keyTransactions([tx({ id: "tx-2026-05-16-7--42.5" })]);
    expect(a.key).toBe(b.key);
  });

  it("ignore la nature, qui dépend de nos règles de classement", () => {
    const [a] = keyTransactions([tx({ kind: "card" })]);
    const [b] = keyTransactions([tx({ kind: "other" })]);
    expect(a.key).toBe(b.key);
  });

  it("sépare deux opérations distinctes du même jour", () => {
    const keys = keyTransactions([tx(), tx({ amount: -12 })]).map((t) => t.key);
    expect(new Set(keys).size).toBe(2);
    // Chacune est seule de son espèce : toutes deux au rang 0.
    expect(keys.every((k) => k.endsWith("|0"))).toBe(true);
  });

  it("départage deux opérations rigoureusement identiques", () => {
    const keys = keyTransactions([tx(), tx()]).map((t) => t.key);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("survit à un relevé relu dans un autre ordre", () => {
    const first = keyTransactions([tx(), tx({ amount: -12 }), tx({ label: "SNCF" })]);
    const second = keyTransactions([tx({ label: "SNCF" }), tx({ amount: -12 }), tx()]);
    expect(new Set(first.map((t) => t.key))).toEqual(new Set(second.map((t) => t.key)));
  });

  it("tient d'une normalisation à l'autre pour une même opération brute", () => {
    const raw = {
      booking_date: "2026-05-16",
      transaction_amount: { amount: "42.50", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      creditor: { name: "CARREFOUR" },
    };
    // Même opération, rendue à deux positions différentes de la pagination.
    const [a] = keyTransactions([normalizeTransaction(raw, 0)]);
    const [b] = keyTransactions([normalizeTransaction(raw, 31)]);
    expect(a.key).toBe(b.key);
  });

  it("hache sans collision les libellés voisins", () => {
    expect(hashText("CARREFOUR")).not.toBe(hashText("CARREFOUR "));
    expect(hashText("")).toHaveLength(8);
  });
});

describe("ce qui entre dans l'archive", () => {
  it("écarte les opérations en attente et les non datées", () => {
    expect(archivable(tx())).toBe(true);
    expect(archivable(tx({ pending: true }))).toBe(false);
    expect(archivable(tx({ date: "" }))).toBe(false);
  });
});

describe("fusion banque + archive", () => {
  it("n'ajoute que ce que la banque ne rend plus", () => {
    const fresh = [tx({ date: "2026-08-01" })];
    const archived = [tx({ date: "2026-08-01" }), tx({ date: "2024-02-03", label: "EDF" })];

    const merged = mergeTransactions(fresh, archived);

    expect(merged).toHaveLength(2);
    expect(merged.map((t) => t.date)).toEqual(["2026-08-01", "2024-02-03"]);
  });

  it("laisse la banque prévaloir sur l'archive", () => {
    // Même opération des deux côtés : c'est l'exemplaire frais qui reste, avec
    // sa nature à jour — l'archive ne doit jamais écraser la source.
    const fresh = [tx({ id: "ref-1", kind: "transfer" })];
    const archived = [tx({ id: "archive-1", kind: "card" })];

    const merged = mergeTransactions(fresh, archived);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("ref-1");
    expect(merged[0].kind).toBe("transfer");
  });

  it("rend le tout dans l'ordre d'un relevé", () => {
    const merged = mergeTransactions(
      [tx({ date: "2026-06-01" })],
      [tx({ date: "2025-01-05" }), tx({ date: "2026-07-20" })],
    );
    expect(merged.map((t) => t.date)).toEqual(["2026-07-20", "2026-06-01", "2025-01-05"]);
  });

  it("rend l'archive seule quand la banque n'a rien", () => {
    const archived = [tx({ date: "2024-03-02" })];
    expect(mergeTransactions([], archived)).toHaveLength(1);
  });
});
