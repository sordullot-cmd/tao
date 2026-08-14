import { describe, it, expect } from "vitest";
import { counterpartyKey, recurringKeys, recurringOf } from "@/lib/bank/recurring";
import type { BankTransaction } from "@/lib/bank/transactions";

/* Ce que ce module décide, et que rien d'autre ne tient :
     — ce qui compte comme la MÊME contrepartie d'un mois sur l'autre, alors que
       le libellé d'une carte change à chaque passage ;
     — la frontière entre « ça revient » et « j'y suis retourné » : c'est la
       stabilité du montant qui la trace, pas la répétition seule ;
     — et le fait que la détection se fasse sur l'historique, la somme sur la
       fenêtre — une opération vue une fois ne reviendra peut-être jamais. */

const tx = (date: string, label: string, amount: number, kind = "card"): BankTransaction => ({
  id: `${date}-${label}-${amount}`,
  date,
  label,
  detail: null,
  amount,
  currency: "EUR",
  kind: kind as BankTransaction["kind"],
  pending: false,
});

describe("Contrepartie d'un débit", () => {
  it("reconnaît la même enseigne sous deux libellés de carte", () => {
    const a = counterpartyKey(tx("2026-08-05", "CARTE 05/08 NETFLIX.COM 4979", -13.49));
    const b = counterpartyKey(tx("2026-07-05", "CARTE 05/07 NETFLIX COM AMSTERDAM", -13.49));
    expect(a).toBe(b);
    expect(a).toBe("m:netflix");
  });

  it("retombe sur les premiers mots du libellé, chiffres retirés", () => {
    const a = counterpartyKey(tx("2026-08-05", "PRLV SEPA FONCIA SYNDIC 04421", -900, "direct_debit"));
    const b = counterpartyKey(tx("2026-07-05", "PRLV SEPA FONCIA SYNDIC 04422", -900, "direct_debit"));
    expect(a).toBe(b);
  });

  it("ne dit rien d'un libellé qui ne porte que des chiffres", () => {
    expect(counterpartyKey(tx("2026-08-05", "0000 12 34", -10))).toBeNull();
  });
});

describe("Dépenses récurrentes", () => {
  const historique = [
    // Un abonnement : deux mois, même montant.
    tx("2026-08-05", "NETFLIX.COM", -13.49),
    tx("2026-07-05", "NETFLIX.COM", -13.49),
    // Un loyer : deux mois, montant identique.
    tx("2026-08-03", "PRLV SEPA FONCIA SYNDIC 04421", -900, "direct_debit"),
    tx("2026-07-03", "PRLV SEPA FONCIA SYNDIC 04422", -900, "direct_debit"),
    // Le supermarché : deux mois AUSSI, mais des montants sans rapport.
    tx("2026-08-10", "CARTE 10/08 CARREFOUR", -142.3),
    tx("2026-07-12", "CARTE 12/07 CARREFOUR", -38.9),
    // Vu une seule fois : rien ne dit qu'il reviendra.
    tx("2026-08-14", "CARTE 14/08 DECATHLON", -79.9),
    // Une entrée n'est pas une dépense récurrente, même mensuelle.
    tx("2026-08-03", "VIR SEPA SALAIRE", 2000, "transfer"),
    tx("2026-07-03", "VIR SEPA SALAIRE", 2000, "transfer"),
  ];

  it("retient ce qui revient à montant stable, et rien d'autre", () => {
    const keys = recurringKeys(historique);
    expect(keys.has("m:netflix")).toBe(true);
    expect([...keys].some((k) => k.includes("foncia"))).toBe(true);
    // Le supermarché revient tous les mois lui aussi — mais pas au même prix.
    expect(keys.has("m:carrefour")).toBe(false);
    expect(keys.has("m:decathlon")).toBe(false);
    // Le salaire est un crédit : il n'entre jamais dans une dépense.
    expect([...keys].some((k) => k.includes("salaire"))).toBe(false);
  });

  it("somme sur la fenêtre ce que l'historique a reconnu", () => {
    const août = historique.filter((r) => r.date >= "2026-08-01");
    const found = recurringOf(août, historique);

    expect(found.map((r) => r.amount).sort((a, b) => a - b)).toEqual([-900, -13.49]);
  });

  it("ne reconnaît rien sur une fenêtre isolée, et c'est voulu", () => {
    /* Sans historique, une opération n'a été vue qu'une fois : dire d'elle
       qu'elle reviendra serait une invention, pas une déduction. */
    const août = historique.filter((r) => r.date >= "2026-08-01");
    expect(recurringOf(août)).toEqual([]);
  });
});
