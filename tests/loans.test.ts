import { describe, it, expect } from "vitest";
import {
  MAX_INSTALLMENTS,
  addMonths,
  annuity,
  debtTotals,
  installmentsElapsed,
  loanStats,
  monthlyRate,
  resolvedPayment,
  schedule,
  simulatePrepayment,
  termFor,
  theoreticalOutstanding,
} from "@/lib/loans";
import type { LoanTerms } from "@/lib/patrimoine";

/* Prêt d'école : 1 000 € à 12 % l'an, donc 1 % par mois, remboursés 100 € par
   mois. Le premier mois porte exactement 10 € d'intérêts et 90 € de capital —
   des chiffres vérifiables de tête, ce qu'un vrai barème immobilier ne permet
   pas. Les cas réalistes sont testés par propriété, pas par valeur attendue. */
const terms = (over: Partial<LoanTerms> = {}): LoanTerms => ({
  principal: 1000,
  rate: 12,
  payment: 100,
  insurance: null,
  startDate: "2020-01-05",
  months: null,
  ...over,
});

describe("taux mensuel", () => {
  it("divise le taux annuel par douze", () => {
    expect(monthlyRate(12)).toBeCloseTo(0.01, 10);
  });

  it("accepte zéro — un prêt familial n'a pas de taux", () => {
    expect(monthlyRate(0)).toBe(0);
  });

  it("refuse l'absence de taux et les taux négatifs, plutôt que de rendre NaN", () => {
    expect(monthlyRate(null)).toBeNull();
    expect(monthlyRate(undefined)).toBeNull();
    expect(monthlyRate(-1)).toBeNull();
    // @ts-expect-error — valeur hors contrat, telle qu'un store ancien peut en porter
    expect(monthlyRate("3,4")).toBeNull();
  });
});

describe("mensualité", () => {
  it("répartit le capital sans intérêts quand le taux est nul", () => {
    expect(annuity(1200, 0, 12)).toBe(100);
  });

  it("dépasse le simple capital divisé par la durée dès qu'il y a des intérêts", () => {
    const m = annuity(200_000, 3.4, 240);
    expect(m).not.toBeNull();
    expect(m as number).toBeGreaterThan(200_000 / 240);
    // Le total versé reste dans un ordre de grandeur crédible (moins du double).
    expect((m as number) * 240).toBeLessThan(400_000);
  });

  it("ne calcule rien sans capital, sans durée ou sans taux", () => {
    expect(annuity(null, 3, 240)).toBeNull();
    expect(annuity(200_000, 3, null)).toBeNull();
    expect(annuity(200_000, null, 240)).toBeNull();
    expect(annuity(0, 3, 240)).toBeNull();
    expect(annuity(200_000, 3, 0)).toBeNull();
  });

  it("prend la mensualité saisie avant celle qu'imposent les autres conditions", () => {
    expect(resolvedPayment(terms({ payment: 555 }))).toBe(555);
  });

  it("déduit la mensualité quand elle n'est pas saisie", () => {
    expect(resolvedPayment(terms({ payment: null, principal: 1200, rate: 0, months: 12 }))).toBe(100);
  });

  it("ne déduit rien quand il manque une condition", () => {
    expect(resolvedPayment(terms({ payment: null, months: null }))).toBeNull();
    expect(resolvedPayment(null)).toBeNull();
  });
});

describe("durée restante", () => {
  it("compte les échéances d'un prêt sans intérêts", () => {
    expect(termFor(1200, 0, 100)).toBe(12);
  });

  it("arrondit au mois supérieur : la dernière échéance est plus petite, elle existe quand même", () => {
    expect(termFor(1250, 0, 100)).toBe(13);
  });

  it("ne renvoie pas de durée quand la mensualité ne couvre pas les intérêts", () => {
    // 1 % de 1 000 € = 10 € d'intérêts : à 10 € versés, le capital ne bouge pas.
    expect(termFor(1000, 12, 10)).toBeNull();
    expect(termFor(1000, 12, 9)).toBeNull();
  });

  it("reste borné même pour une mensualité à peine suffisante", () => {
    const n = termFor(1000, 12, 10.01);
    expect(n).not.toBeNull();
    expect(n as number).toBeLessThanOrEqual(MAX_INSTALLMENTS);
  });
});

describe("échéancier", () => {
  it("sépare intérêts et capital sur la première échéance", () => {
    const rows = schedule(1000, 12, 100);
    expect(rows[0]).toMatchObject({ index: 1, interest: 10, principal: 90, balance: 910 });
  });

  it("solde exactement le capital, sans centime résiduel", () => {
    const rows = schedule(1000, 12, 100);
    expect(rows[rows.length - 1].balance).toBe(0);
    const capital = rows.reduce((s, r) => s + r.principal, 0);
    expect(capital).toBeCloseTo(1000, 2);
  });

  it("ajuste la dernière échéance au lieu de prélever une mensualité pleine", () => {
    const rows = schedule(1000, 0, 300);
    expect(rows).toHaveLength(4);
    expect(rows[3].payment).toBe(100);
  });

  it("date les échéances de mois en mois à partir de la première", () => {
    const rows = schedule(1000, 0, 500, { from: "2020-01-31" });
    expect(rows.map((r) => r.date)).toEqual(["2020-01-31", "2020-02-29"]);
  });

  it("ne date rien quand aucune première échéance n'est connue", () => {
    expect(schedule(1000, 0, 500)[0].date).toBeNull();
  });

  it("rend un échéancier vide plutôt qu'une boucle infinie", () => {
    expect(schedule(1000, 12, 10)).toEqual([]);
    expect(schedule(1000, null, 100)).toEqual([]);
    expect(schedule(0, 12, 100)).toEqual([]);
    expect(schedule(-500, 12, 100)).toEqual([]);
  });

  it("se borne à MAX_INSTALLMENTS", () => {
    expect(schedule(1_000_000, 12, 10_001).length).toBeLessThanOrEqual(MAX_INSTALLMENTS);
  });
});

describe("dates d'échéance", () => {
  it("garde le jour du mois", () => {
    expect(addMonths("2020-01-05", 3)).toBe("2020-04-05");
  });

  it("ramène le 31 au dernier jour des mois plus courts", () => {
    expect(addMonths("2020-01-31", 1)).toBe("2020-02-29");
    expect(addMonths("2021-01-31", 1)).toBe("2021-02-28");
    expect(addMonths("2020-01-31", 3)).toBe("2020-04-30");
  });

  it("refuse une date qui n'en est pas une", () => {
    expect(addMonths("bientôt", 1)).toBeNull();
  });

  it("compte l'échéance du jour comme passée", () => {
    expect(installmentsElapsed("2020-01-05", "2020-01-05")).toBe(1);
    expect(installmentsElapsed("2020-01-05", "2020-01-04")).toBe(0);
    expect(installmentsElapsed("2020-01-05", "2020-03-04")).toBe(2);
    expect(installmentsElapsed("2020-01-05", "2020-03-06")).toBe(3);
  });

  it("ne compte rien avant la première échéance", () => {
    expect(installmentsElapsed("2020-01-05", "2019-12-31")).toBe(0);
    expect(installmentsElapsed(null, "2020-01-05")).toBe(0);
  });
});

describe("restant dû théorique", () => {
  it("amortit les échéances déjà tombées", () => {
    expect(theoreticalOutstanding(terms(), "2020-01-05")).toBe(910);
    expect(theoreticalOutstanding(terms(), "2020-02-05")).toBe(819.1);
  });

  it("rend le capital emprunté avant la première échéance", () => {
    expect(theoreticalOutstanding(terms(), "2019-12-01")).toBe(1000);
  });

  it("tombe à zéro une fois le prêt éteint", () => {
    expect(theoreticalOutstanding(terms(), "2030-01-05")).toBe(0);
  });

  it("ne devine rien sans capital emprunté ni date de départ", () => {
    expect(theoreticalOutstanding(terms({ principal: null }), "2020-06-05")).toBeNull();
    expect(theoreticalOutstanding(terms({ startDate: null }), "2020-06-05")).toBeNull();
    expect(theoreticalOutstanding(null, "2020-06-05")).toBeNull();
  });
});

describe("synthèse d'un crédit", () => {
  it("projette échéances, fin, intérêts et total à verser", () => {
    /* 1 000 € à 1 %/mois remboursés 100 € tiennent 11 échéances : la première
       étant tombée le 5 janvier, il en reste 10, jusqu'au 5 novembre. */
    const s = loanStats(910, terms(), "2020-01-05");
    expect(s.monthsLeft).toBe(10);
    expect(s.nextDueDate).toBe("2020-02-05");
    expect(s.endDate).toBe("2020-11-05");
    expect(s.interestLeft).toBeGreaterThan(0);
    expect(s.totalLeft).toBeCloseTo(910 + (s.interestLeft as number), 2);
    expect(s.complete).toBe(true);
    expect(s.gaps).toEqual([]);
  });

  it("compte l'assurance dans la charge mensuelle, pas dans l'amortissement", () => {
    const s = loanStats(1000, terms({ insurance: 15 }), "2020-01-05");
    expect(s.monthlyCharge).toBe(115);
    // La première échéance amortit toujours 90 € : l'assurance ne rembourse rien.
    expect(s.schedule[0].principal).toBe(90);
    expect(s.totalLeft).toBeCloseTo(1000 + (s.interestLeft as number) + 15 * (s.monthsLeft as number), 2);
  });

  it("mesure la progression sur le capital emprunté", () => {
    const s = loanStats(250, terms({ principal: 1000 }), "2020-01-05");
    expect(s.repaid).toBe(750);
    expect(s.progress).toBeCloseTo(75, 6);
  });

  it("ne rend pas de progression négative quand le restant dû dépasse l'emprunt", () => {
    const s = loanStats(1200, terms({ principal: 1000 }), "2020-01-05");
    expect(s.repaid).toBe(0);
    expect(s.progress).toBe(0);
  });

  it("liste ce qui manque au lieu de se taire", () => {
    const s = loanStats(1000, terms({ rate: null, payment: null, principal: null, startDate: null }));
    expect(s.complete).toBe(false);
    expect(s.gaps).toEqual(["rate", "payment", "startDate", "principal"]);
    expect(s.monthsLeft).toBeNull();
    expect(s.interestLeft).toBeNull();
    expect(s.endDate).toBeNull();
  });

  it("reste lisible sur un crédit sans aucune condition", () => {
    const s = loanStats(5000, null);
    expect(s.outstanding).toBe(5000);
    expect(s.payment).toBeNull();
    expect(s.monthlyCharge).toBeNull();
    expect(s.insurance).toBe(0);
    expect(s.complete).toBe(false);
  });

  it("chiffre l'écart avec le contrat", () => {
    // Deux échéances tombées : le contrat dit 819,10 €, la saisie 900 €.
    const s = loanStats(900, terms(), "2020-02-05");
    expect(s.theoretical).toBe(819.1);
    expect(s.drift).toBeCloseTo(80.9, 2);
  });
});

describe("remboursement anticipé", () => {
  it("raccourcit la durée sans toucher à la mensualité", () => {
    const base = loanStats(1000, terms(), "2020-01-05");
    const res = simulatePrepayment(1000, terms(), { lump: 300 }, "2020-01-05");
    expect(res).not.toBeNull();
    expect(res!.newOutstanding).toBe(700);
    expect(res!.newMonths).toBeLessThan(base.monthsLeft as number);
    expect(res!.monthsSaved).toBeGreaterThan(0);
    expect(res!.interestSaved).toBeGreaterThan(0);
  });

  it("économise aussi des intérêts par une mensualité renforcée", () => {
    const res = simulatePrepayment(1000, terms(), { extraMonthly: 50 }, "2020-01-05");
    expect(res!.newOutstanding).toBe(1000);
    expect(res!.monthsSaved).toBeGreaterThan(0);
    expect(res!.newInterest).toBeLessThan(res!.baseInterest);
  });

  it("signale le versement qui solde le crédit", () => {
    const res = simulatePrepayment(1000, terms(), { lump: 1000 }, "2020-01-05");
    expect(res!.clears).toBe(true);
    expect(res!.newMonths).toBe(0);
    expect(res!.newEndDate).toBeNull();
    expect(res!.interestSaved).toBe(res!.baseInterest);
  });

  it("ne compare rien sans scénario, ni sur un crédit non projetable", () => {
    expect(simulatePrepayment(1000, terms(), {}, "2020-01-05")).toBeNull();
    expect(simulatePrepayment(1000, terms(), { lump: 0, extraMonthly: 0 }, "2020-01-05")).toBeNull();
    expect(simulatePrepayment(1000, terms({ rate: null, payment: null, months: null }), { lump: 100 })).toBeNull();
  });

  it("ignore un versement négatif plutôt que d'augmenter la dette", () => {
    expect(simulatePrepayment(1000, terms(), { lump: -500 }, "2020-01-05")).toBeNull();
  });
});

describe("agrégat de plusieurs crédits", () => {
  it("somme les restants dus, les charges et les intérêts", () => {
    const a = loanStats(1000, terms(), "2020-01-05");
    const b = loanStats(500, terms({ principal: 500, insurance: 10 }), "2020-01-05");
    const totals = debtTotals([a, b]);
    expect(totals.outstanding).toBe(1500);
    expect(totals.monthlyCharge).toBe(210);
    expect(totals.interestLeft).toBeCloseTo((a.interestLeft as number) + (b.interestLeft as number), 2);
    expect(totals.incomplete).toBe(0);
  });

  it("retient la dernière échéance du crédit qui s'éteint le plus tard", () => {
    const court = loanStats(200, terms(), "2020-01-05");
    const long = loanStats(1000, terms(), "2020-01-05");
    expect(debtTotals([court, long]).lastEndDate).toBe(long.endDate);
  });

  it("compte les crédits non projetables sans perdre leur restant dû", () => {
    const totals = debtTotals([loanStats(1000, terms(), "2020-01-05"), loanStats(2000, null)]);
    expect(totals.outstanding).toBe(3000);
    expect(totals.incomplete).toBe(1);
    // Le total d'intérêts reste celui du seul crédit chiffrable : c'est partiel,
    // et la page le dit (`patrimoine.liabilities.partialTotals`).
    expect(totals.interestLeft).toBeGreaterThan(0);
  });

  it("ne rend pas de total d'intérêts quand aucun crédit n'est projetable", () => {
    expect(debtTotals([loanStats(2000, null)]).interestLeft).toBeNull();
    expect(debtTotals([]).interestLeft).toBeNull();
  });
});
