import { describe, it, expect } from "vitest";

import {
  balanceSeries,
  classifyTransaction,
  groupByDay,
  normalizeTransaction,
  periodStats,
  sortTransactions,
  withinDays,
  type BankTransaction,
  type RawTransaction,
} from "@/lib/bank/transactions";

/**
 * Ce que la banque envoie n'est jamais deux fois la même chose : montant non
 * signé, nature codée ou pas, libellé tantôt dans la contrepartie tantôt dans
 * le motif. Ces tests fixent la normalisation et, surtout, la reconstruction du
 * solde — c'est elle qui trace la courbe, et une erreur de sens y décalerait
 * TOUTE la série sans rien casser visiblement.
 */

const tx = (raw: RawTransaction) => normalizeTransaction(raw);

const booked = (date: string, amount: number, extra: Partial<BankTransaction> = {}): BankTransaction => ({
  id: `${date}-${amount}`,
  date,
  label: "Op",
  detail: null,
  amount,
  currency: "EUR",
  kind: "other",
  pending: false,
  ...extra,
});

describe("normalisation d'une opération", () => {
  it("signe le montant selon credit_debit_indicator", () => {
    expect(tx({ transaction_amount: { amount: "12.34" }, credit_debit_indicator: "DBIT" }).amount).toBe(-12.34);
    expect(tx({ transaction_amount: { amount: "12.34" }, credit_debit_indicator: "CRDT" }).amount).toBe(12.34);
  });

  it("ignore un signe déjà posé par la banque plutôt que de l'inverser deux fois", () => {
    expect(tx({ transaction_amount: { amount: "-40" }, credit_debit_indicator: "DBIT" }).amount).toBe(-40);
  });

  it("prend la date de comptabilisation, et retombe sur la date de valeur", () => {
    expect(tx({ booking_date: "2026-08-13", value_date: "2026-08-11" }).date).toBe("2026-08-13");
    expect(tx({ value_date: "2026-08-11" }).date).toBe("2026-08-11");
    expect(tx({ transaction_date: "2026-08-10T00:00:00.000Z" }).date).toBe("2026-08-10");
  });

  it("libelle par la contrepartie, et garde le motif en complément", () => {
    const t = tx({
      credit_debit_indicator: "DBIT",
      creditor: { name: "Monoprix" },
      remittance_information: ["CARTE 12/08 MONOPRIX PARIS"],
    });
    expect(t.label).toBe("Monoprix");
    expect(t.detail).toBe("CARTE 12/08 MONOPRIX PARIS");
  });

  it("ne répète pas le motif sous lui-même quand il n'apprend rien", () => {
    const t = tx({ remittance_information: ["VIR SALAIRE"], credit_debit_indicator: "CRDT" });
    expect(t.label).toBe("VIR SALAIRE");
    expect(t.detail).toBeNull();
  });

  it("marque en attente la seule opération non comptabilisée", () => {
    expect(tx({ status: "PDNG" }).pending).toBe(true);
    expect(tx({ status: "BOOK" }).pending).toBe(false);
    expect(tx({}).pending).toBe(false);
  });

  it("fabrique une clé distincte pour deux opérations identiques sans référence", () => {
    const raw: RawTransaction = { booking_date: "2026-08-13", transaction_amount: { amount: "9" } };
    expect(normalizeTransaction(raw, 0).id).not.toBe(normalizeTransaction(raw, 1).id);
  });
});

describe("nature du mouvement", () => {
  it("lit d'abord le code ISO 20022", () => {
    expect(classifyTransaction({ bank_transaction_code: { code: "PMNT-ICDT-ESCT" } })).toBe("transfer");
    expect(classifyTransaction({ bank_transaction_code: { code: "PMNT-IDDT-PMDD" } })).toBe("direct_debit");
    expect(classifyTransaction({ bank_transaction_code: { code: "PMNT-CCRD-POSD" } })).toBe("card");
  });

  it("traite un retrait au distributeur comme un retrait, pas comme une carte", () => {
    expect(classifyTransaction({ bank_transaction_code: { code: "PMNT-CCRD-CWDL" } })).toBe("withdrawal");
    expect(classifyTransaction({ remittance_information: "RETRAIT CARTE 12/08 DAB" })).toBe("withdrawal");
  });

  it("retombe sur les préfixes de libellé quand la banque ne code rien", () => {
    expect(classifyTransaction({ remittance_information: "PRLV SEPA EDF" })).toBe("direct_debit");
    expect(classifyTransaction({ remittance_information: "VIR RECU M DUPONT" })).toBe("transfer");
    expect(classifyTransaction({ remittance_information: "CARTE 12/08 MONOPRIX" })).toBe("card");
    expect(classifyTransaction({ remittance_information: "FRAIS TENUE DE COMPTE" })).toBe("fee");
    expect(classifyTransaction({ remittance_information: "CHEQUE N 1234567" })).toBe("check");
    expect(classifyTransaction({ remittance_information: "INTERETS ANNUELS" })).toBe("interest");
  });

  it("des frais de carte restent des frais : le cas précis passe avant le large", () => {
    expect(classifyTransaction({ remittance_information: "COTISATION CARTE VISA" })).toBe("fee");
  });

  it("rend « autre » quand rien ne permet de trancher", () => {
    expect(classifyTransaction({})).toBe("other");
    expect(classifyTransaction({ remittance_information: "REF 998877" })).toBe("other");
  });
});

describe("reconstruction du solde", () => {
  it("remonte à rebours depuis le solde courant", () => {
    // Solde actuel 1000, après +200 le 12 et −50 le 13.
    const points = balanceSeries(
      [booked("2026-08-12", 200), booked("2026-08-13", -50)],
      1000,
    );
    expect(points).toEqual([
      { date: "2026-08-11", cum: 850 },  // ouverture, avant le premier mouvement
      { date: "2026-08-12", cum: 1050 },
      { date: "2026-08-13", cum: 1000 },
    ]);
  });

  it("agrège les mouvements d'une même journée en un seul point", () => {
    const points = balanceSeries(
      [booked("2026-08-13", -20), booked("2026-08-13", -30), booked("2026-08-12", 100)],
      500,
    );
    expect(points.map((p) => p.date)).toEqual(["2026-08-11", "2026-08-12", "2026-08-13"]);
    expect(points[1].cum).toBe(550);
    expect(points[2].cum).toBe(500);
  });

  it("écarte les opérations en attente, absentes du solde de la banque", () => {
    const points = balanceSeries(
      [booked("2026-08-12", 200), booked("2026-08-13", -50, { pending: true })],
      1000,
    );
    expect(points[points.length - 1]).toEqual({ date: "2026-08-12", cum: 1000 });
  });

  it("prolonge la courbe jusqu'à aujourd'hui après un jour sans mouvement", () => {
    const points = balanceSeries([booked("2026-08-10", -25)], 300, "2026-08-13");
    expect(points[points.length - 1]).toEqual({ date: "2026-08-13", cum: 300 });
  });

  it("donne quand même deux points sur un seul mouvement — sinon rien ne se trace", () => {
    expect(balanceSeries([booked("2026-08-13", -25)], 300)).toHaveLength(2);
  });

  it("ne rend rien du tout sans mouvement comptabilisé", () => {
    expect(balanceSeries([], 300)).toEqual([]);
    expect(balanceSeries([booked("2026-08-13", -25, { pending: true })], 300)).toEqual([]);
  });

  it("franchit le changement de mois pour le point d'ouverture", () => {
    expect(balanceSeries([booked("2026-08-01", 10)], 110)[0].date).toBe("2026-07-31");
  });
});

describe("agrégats et découpage", () => {
  it("sépare entrées, sorties et solde net", () => {
    const stats = periodStats([booked("2026-08-13", 200), booked("2026-08-13", -50), booked("2026-08-12", -25)]);
    expect(stats).toEqual({ in: 200, out: -75, net: 125 });
  });

  it("classe les mouvements du plus récent au plus ancien", () => {
    const sorted = sortTransactions([booked("2026-08-10", 1), booked("2026-08-13", 2), booked("2026-08-11", 3)]);
    expect(sorted.map((t) => t.date)).toEqual(["2026-08-13", "2026-08-11", "2026-08-10"]);
  });

  it("ne garde que la fenêtre demandée, bornes incluses", () => {
    const today = new Date(2026, 7, 13); // 13 août 2026, heure locale
    const list = [booked("2026-08-13", 1), booked("2026-08-07", 1), booked("2026-08-06", 1)];
    expect(withinDays(list, 7, today).map((t) => t.date)).toEqual(["2026-08-13", "2026-08-07"]);
  });

  it("regroupe par jour en conservant l'ordre reçu", () => {
    const groups = groupByDay([booked("2026-08-13", 1), booked("2026-08-13", 2), booked("2026-08-12", 3)]);
    expect(groups.map((g) => g.date)).toEqual(["2026-08-13", "2026-08-12"]);
    expect(groups[0].items).toHaveLength(2);
  });
});
