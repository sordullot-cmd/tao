import { describe, it, expect } from "vitest";
import { buildCashflow, incomeBySource } from "@/lib/bank/cashflow";
import { subcategorizeTransaction } from "@/lib/bank/categories";

/* Ce que ce module décide, et que rien d'autre ne tient :
     — quelles opérations sont des ENTRÉES, et lesquelles restent en déduction
       d'un poste de dépense (c'est là que le double comptage se produirait) ;
     — la mise en balance du flux, dans les deux sens ;
     — l'écrêtage des petits postes, qui doit dire combien il en rassemble. */

const tx = (label: string, amount: number, kind = "card") => ({
  label, detail: null, kind, amount,
});

describe("Sources de revenus", () => {
  it("nomme la source quand le libellé la donne", () => {
    expect(subcategorizeTransaction(tx("VIR SEPA SALAIRE JUILLET 2026", 1800, "transfer")))
      .toBe("income.salary");
    expect(subcategorizeTransaction(tx("VIR POLE EMPLOI ALLOCATION", 900, "transfer")))
      .toBe("income.benefits");
    expect(subcategorizeTransaction(tx("VIR CARSAT RETRAITE", 1200, "transfer")))
      .toBe("income.pension");
    expect(subcategorizeTransaction(tx("VIR SEPA VENTE VEHICULE", 4200, "transfer")))
      .toBe("income.sale");
  });

  it("range la prime d'activité dans les aides, pas dans le salaire", () => {
    /* « Prime » est un salaire partout ailleurs : c'est l'ordre des listes qui
       tranche, et une inversion le casserait sans que rien d'autre ne le voie. */
    expect(subcategorizeTransaction(tx("VIR SEPA PRIME ACTIVITE", 180, "transfer")))
      .toBe("income.benefits");
    expect(subcategorizeTransaction(tx("VIR SEPA PRIME EXCEPTIONNELLE", 500, "transfer")))
      .toBe("income.salary");
  });

  it("laisse un crédit muet dans le divers des revenus", () => {
    expect(subcategorizeTransaction(tx("VIR M DUPONT 8821", 300, "transfer"))).toBe("income");
  });

  it("n'applique JAMAIS ces règles à un débit", () => {
    /* Le piège : les mêmes mots servent des deux côtés. « Remboursement » est un
       revenu quand il arrive, une mensualité quand il part ; le tester sur un
       débit ferait passer un crédit immobilier pour une rentrée d'argent. */
    expect(subcategorizeTransaction(tx("PRLV REMBOURSEMENT PRET IMMOBILIER", -820, "direct_debit")))
      .toBe("credit.loan");
    expect(subcategorizeTransaction(tx("VIR SEPA VERSEMENT LIVRET A", -200, "transfer")))
      .toBe("savings.bank");
  });

  it("laisse un crédit reconnu par une règle de dépense sur SON poste", () => {
    /* Un remboursement de pharmacie ou de la Sécu vient en déduction de la
       santé. S'il devenait une entrée, le même euro gonflerait les deux côtés du
       flux — c'est ce que l'ordre des deux listes de règles empêche. */
    expect(subcategorizeTransaction(tx("REMBOURSEMENT PHARMACIE DE LA GARE", 12)))
      .toBe("health.pharmacy");
    expect(subcategorizeTransaction(tx("VIR CPAM REMBOURSEMENT SOINS", 40, "transfer")))
      .toBe("health.cover");

    const { total } = incomeBySource([tx("REMBOURSEMENT PHARMACIE DE LA GARE", 12)]);
    expect(total).toBe(0);
  });

  it("somme et classe les sources, la plus grosse d'abord", () => {
    const { slices, total } = incomeBySource([
      tx("VIR SEPA SALAIRE", 1800, "transfer"),
      tx("VIR SEPA SALAIRE PRIME", 200, "transfer"),
      tx("VIR SEPA REMBOURSEMENT", 40, "transfer"),
      tx("CARTE 10/08 CARREFOUR", -100),
    ]);

    expect(total).toBe(2040);
    expect(slices.map((s) => s.id)).toEqual(["income.salary", "income.refund"]);
    expect(slices[0]).toMatchObject({ amount: 2000, count: 2 });
    expect(Math.round(slices[0].pct)).toBe(98);
  });
});

describe("Flux mis en balance", () => {
  it("ferme le bilan par un « reste » quand il entre plus qu'il ne sort", () => {
    const flow = buildCashflow([
      tx("VIR SEPA SALAIRE", 2000, "transfer"),
      tx("CARTE 10/08 CARREFOUR", -300),
    ]);

    expect(flow.income).toBe(2000);
    expect(flow.spent).toBe(300);
    expect(flow.net).toBe(1700);
    expect(flow.outflows.at(-1)).toMatchObject({ id: "left", kind: "synthetic", amount: 1700 });
    // Les deux côtés pèsent le même poids : c'est ce qui rend le dessin lisible.
    const sum = (l: { amount: number }[]) => l.reduce((s, n) => s + n.amount, 0);
    expect(sum(flow.inflows)).toBeCloseTo(sum(flow.outflows), 2);
  });

  it("ferme le bilan par un « pris sur le solde » dans l'autre sens", () => {
    const flow = buildCashflow([
      tx("VIR SEPA SALAIRE", 500, "transfer"),
      tx("CARTE 10/08 IKEA FRANCE", -1200),
    ]);

    expect(flow.net).toBe(-700);
    expect(flow.inflows.at(-1)).toMatchObject({ id: "draw", kind: "synthetic", amount: 700 });
    expect(flow.outflows.some((n) => n.id === "left")).toBe(false);
  });

  it("n'ajoute pas de nœud pour une poussière", () => {
    const flow = buildCashflow([
      tx("VIR SEPA SALAIRE", 100.1, "transfer"),
      tx("CARTE 10/08 CARREFOUR", -100),
    ]);

    expect(flow.inflows.every((n) => n.kind !== "synthetic")).toBe(true);
    expect(flow.outflows.every((n) => n.kind !== "synthetic")).toBe(true);
  });

  it("regroupe la queue des postes en disant combien elle en rassemble", () => {
    const flow = buildCashflow(
      [
        tx("VIR SEPA SALAIRE", 5000, "transfer"),
        tx("PRLV SEPA FONCIA SYNDIC", -900, "direct_debit"),
        tx("CARTE 10/08 CARREFOUR", -400),
        tx("CARTE 10/08 TOTAL RELAIS", -120),
        tx("PRLV SEPA NETFLIX.COM", -20, "direct_debit"),
        tx("CARTE 10/08 UGC CINE CITE", -15),
        tx("CARTE 10/08 DECATHLON", -60),
      ],
      { topOutflows: 2 },
    );

    const more = flow.outflows.find((n) => n.id === "more");
    /* Top 2 : le logement (900) et l'alimentation (400) restent nommés ; le
       carburant (120), le sport (60), l'abonnement (20) et le cinéma (15) sont
       rassemblés — et le nœud dit qu'ils sont quatre. */
    expect(more).toMatchObject({ kind: "synthetic", count: 4 });
    expect(more?.amount).toBeCloseTo(215, 2);
    // Le regroupement ne perd rien : le total dépensé reste le même.
    expect(flow.spent).toBeCloseTo(1515, 2);
  });

  it("ne regroupe pas un poste seul sous un « + 1 autre »", () => {
    const flow = buildCashflow(
      [
        tx("VIR SEPA SALAIRE", 500, "transfer"),
        tx("PRLV SEPA FONCIA SYNDIC", -300, "direct_debit"),
        tx("CARTE 10/08 CARREFOUR", -100),
      ],
      { topOutflows: 1 },
    );

    // Deux postes, top 1 : nommer le second vaut mieux que l'anonymiser.
    expect(flow.outflows.filter((n) => n.kind === "category").map((n) => n.id))
      .toEqual(["housing", "food"]);
  });

  it("rend un flux vide quand le relevé ne porte rien", () => {
    const flow = buildCashflow([]);
    expect(flow).toMatchObject({ income: 0, spent: 0, net: 0, total: 0 });
    expect(flow.inflows).toEqual([]);
    expect(flow.outflows).toEqual([]);
  });
});
