/**
 * Reconstruction de l'historique du patrimoine.
 *
 * Le point sensible n'est pas la somme mais le SENS de la remontée : le solde
 * d'hier, c'est celui d'aujourd'hui débarrassé des mouvements d'aujourd'hui.
 * Une erreur de signe donne une courbe plausible et fausse, d'où ces tests sur
 * des valeurs choisies à la main.
 */

import { describe, it, expect } from "vitest";
import type { BankTransaction } from "@/lib/bank/transactions";
import type { Asset } from "@/lib/patrimoine";
import {
  LOAN_LOOKBACK_DAYS,
  addDays,
  reconstructHistory,
  samplingStep,
} from "@/lib/patrimoineHistory";

const TODAY = "2026-08-14";

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: "a1",
  name: "Compte",
  type: "checking",
  balance: 1_000,
  institution: null,
  updatedAt: null,
  ...over,
});

const tx = (date: string, amount: number, over: Partial<BankTransaction> = {}): BankTransaction => ({
  id: `${date}-${amount}`,
  date,
  label: "Op",
  detail: null,
  amount,
  currency: "EUR",
  kind: "card",
  pending: false,
  ...over,
});

const at = (points: { date: string; total: number }[], date: string) =>
  points.find((p) => p.date === date)?.total;

describe("remontée du solde d'un compte bancaire", () => {
  const bank = asset({ id: "enablebanking-x", balance: 1_000 });

  it("défait les mouvements pour retrouver les soldes passés", () => {
    const points = reconstructHistory([bank], {
      today: TODAY,
      txByAssetId: {
        "enablebanking-x": [tx("2026-08-13", -200), tx("2026-08-12", 500)],
      },
    });
    // 1 000 aujourd'hui ; avant l'achat du 13 : 1 200 ; avant le virement du 12 : 700.
    expect(at(points, TODAY)).toBe(1_000);
    expect(at(points, "2026-08-13")).toBe(1_000);
    expect(at(points, "2026-08-12")).toBe(1_200);
    expect(at(points, "2026-08-11")).toBe(700);
  });

  it("s'arrête à la veille du plus ancien mouvement — au-delà, on ne sait rien", () => {
    const points = reconstructHistory([bank], {
      today: TODAY,
      txByAssetId: { "enablebanking-x": [tx("2026-08-13", -200)] },
      measured: [{ date: "2026-07-01", total: 999 }],
    });
    // Le relevé de juillet est un fait : il est gardé tel quel, sans que la
    // valeur d'aujourd'hui vienne se reporter par-dessus tout l'été.
    expect(points[0]).toEqual({ date: "2026-07-01", total: 999 });
    expect(points[1]).toEqual({ date: "2026-08-12", total: 1_200 });
    expect(at(points, "2026-08-01")).toBeUndefined();
  });

  it("défait aussi les opérations en attente, comptées dans le solde reçu", () => {
    /* L'actif porte ici le solde ATTENDU (cf. `withPendingBalances`) : les 1 000
       contiennent déjà l'attente, la remontée doit donc la défaire comme le
       reste, sinon le passé s'en trouverait décalé d'autant. */
    const points = reconstructHistory([bank], {
      today: TODAY,
      txByAssetId: {
        "enablebanking-x": [tx("2026-08-13", -200), tx("2026-08-13", -5_000, { pending: true })],
      },
    });
    expect(at(points, "2026-08-12")).toBe(6_200);
  });

  it("finit toujours sur le patrimoine d'aujourd'hui", () => {
    const points = reconstructHistory([bank, asset({ id: "m1", type: "real_estate", balance: 250_000 })], {
      today: TODAY,
      txByAssetId: { "enablebanking-x": [tx("2026-08-10", -300)] },
    });
    expect(points[points.length - 1]).toEqual({ date: TODAY, total: 251_000 });
  });
});

describe("actifs sans passé connu", () => {
  it("reporte leur valeur à plat : ils décalent la courbe, ils ne la font pas bouger", () => {
    const points = reconstructHistory(
      [
        asset({ id: "enablebanking-x", balance: 1_000 }),
        asset({ id: "m1", type: "pea", balance: 20_000 }),
      ],
      { today: TODAY, txByAssetId: { "enablebanking-x": [tx("2026-08-13", -200)] } },
    );
    expect(at(points, "2026-08-12")).toBe(21_200);
    expect(at(points, TODAY)).toBe(21_000);
  });

  it("sans aucune source de passé, rend les relevés puis le jour même", () => {
    const points = reconstructHistory([asset({ id: "m1", type: "pea", balance: 20_000 })], {
      today: TODAY,
      measured: [{ date: "2026-08-12", total: 19_000 }],
    });
    expect(points).toEqual([
      { date: "2026-08-12", total: 19_000 },
      { date: TODAY, total: 20_000 },
    ]);
  });

  it("sans actif du tout, ne fabrique rien", () => {
    expect(reconstructHistory([], { today: TODAY, measured: [{ date: "2026-01-01", total: 5 }] }))
      .toEqual([{ date: "2026-01-01", total: 5 }]);
  });
});

describe("crédits", () => {
  // 200 000 € sur 20 ans à 3 %, première échéance en janvier 2026 : le capital
  // restant dû décroît d'un mois à l'autre, la courbe doit le suivre.
  const loan = asset({
    id: "l1",
    type: "loan",
    name: "Prêt immo",
    balance: -195_000,
    loan: {
      principal: 200_000,
      rate: 3,
      payment: null,
      insurance: null,
      startDate: "2026-01-05",
      months: 240,
    },
  });

  it("recalcule le capital restant dû à chaque date", () => {
    const points = reconstructHistory([loan], { today: TODAY, days: 200 });
    const janvier = at(points, "2026-02-01");
    const aout = at(points, "2026-08-01");
    expect(janvier).toBeLessThan(0);
    // Le passif se résorbe : sa valeur (négative) remonte vers zéro.
    expect(aout as number).toBeGreaterThan(janvier as number);
  });

  it("fait remonter la courbe jusqu'au début du prêt, même sans banque connectée", () => {
    const points = reconstructHistory([loan], { today: TODAY });
    expect(points[0].date).toBe("2026-01-05");
  });

  it("ne remonte pas au-delà de la limite de rétrospective", () => {
    const vieux = asset({ ...loan, loan: { ...loan.loan!, startDate: "2004-01-05" } });
    const points = reconstructHistory([vieux], { today: TODAY });
    expect(points[0].date).toBe(addDays(TODAY, -LOAN_LOOKBACK_DAYS));
  });

  it("conditions incomplètes : le restant dû saisi est reporté à plat", () => {
    const incomplet = asset({
      id: "l2",
      type: "loan",
      balance: -50_000,
      loan: { principal: null, rate: null, payment: null, insurance: null, startDate: null, months: null },
    });
    const points = reconstructHistory([incomplet, asset({ id: "enablebanking-x", balance: 1_000 })], {
      today: TODAY,
      txByAssetId: { "enablebanking-x": [tx("2026-08-13", -200)] },
    });
    expect(at(points, "2026-08-12")).toBe(-48_800);
  });
});

/* Courbe brute : les crédits sortent du calcul, pas seulement du chiffre héros.
   Le piège est le passé — un total net déjà relevé ne se « débrute » pas, et le
   réutiliser tel quel ferait plonger la courbe sur toute la partie ancienne. */
describe("courbe du patrimoine brut", () => {
  const bank = asset({ id: "enablebanking-x", balance: 1_000 });
  const loan = asset({
    id: "l1",
    type: "loan",
    name: "Prêt immo",
    balance: -195_000,
    loan: {
      principal: 200_000, rate: 3, payment: null, insurance: null,
      startDate: "2026-01-05", months: 240,
    },
  });

  it("écarte les crédits de toute la courbe, pas seulement du dernier point", () => {
    const options = { today: TODAY, txByAssetId: { "enablebanking-x": [tx("2026-08-13", -200)] } };
    const net = reconstructHistory([bank, loan], options);
    const brut = reconstructHistory([bank, loan], { ...options, gross: true });

    expect(at(brut, TODAY)).toBe(1_000);
    expect(at(brut, "2026-08-12")).toBe(1_200);
    // La même courbe en net porte le restant dû : elle est très en dessous.
    expect(at(net, TODAY) as number).toBeLessThan(-100_000);
  });

  it("ne remonte plus jusqu'au début du prêt : sans lui, il n'y a rien à y voir", () => {
    // En net, le prêt seul ouvre la fenêtre en janvier (cf. « crédits »).
    const brut = reconstructHistory([loan], { today: TODAY, gross: true });
    expect(brut).toEqual([{ date: TODAY, total: 0 }]);
  });

  it("écarte aussi un compte à découvert, comme le fait le chiffre brut", () => {
    const decouvert = asset({ id: "c2", balance: -400 });
    const brut = reconstructHistory([bank, decouvert], {
      today: TODAY,
      gross: true,
      txByAssetId: { "enablebanking-x": [tx("2026-08-13", -200)] },
    });
    expect(at(brut, TODAY)).toBe(1_000);
  });

  it("n'utilise que les relevés qui portent leur propre brut", () => {
    const brut = reconstructHistory([bank, loan], {
      today: TODAY,
      gross: true,
      // Le relevé de juin est d'avant la fonctionnalité : pas de brut, donc pas
      // exploitable. Celui de juillet en a un, et c'est LUI qui est tracé.
      measured: [
        { date: "2026-06-01", total: -190_000 },
        { date: "2026-07-01", total: -192_000, gross: 800 },
      ],
      txByAssetId: { "enablebanking-x": [tx("2026-08-13", -200)] },
    });
    expect(brut[0]).toEqual({ date: "2026-07-01", total: 800, gross: 800 });
    expect(brut.some((p) => p.date === "2026-06-01")).toBe(false);
  });
});

describe("fenêtre et échantillonnage", () => {
  it("borne la reconstruction à la profondeur demandée", () => {
    const points = reconstructHistory([asset({ id: "enablebanking-x", balance: 1_000 })], {
      today: TODAY,
      days: 7,
      txByAssetId: { "enablebanking-x": [tx("2026-01-02", -200)] },
    });
    expect(points[0].date).toBe(addDays(TODAY, -7));
  });

  it("espace les points sur les longues fenêtres plutôt que d'en poser 1 800", () => {
    expect(samplingStep(90)).toBe(1);
    expect(samplingStep(400)).toBe(1);
    expect(samplingStep(401)).toBe(7);
    expect(samplingStep(2_000)).toBe(30);

    const points = reconstructHistory([asset({ id: "enablebanking-x", balance: 1_000 })], {
      today: TODAY,
      txByAssetId: { "enablebanking-x": [tx("2021-01-02", -200)] },
    });
    // Cinq ans et demi au pas mensuel : bien moins de 200 points, et le dernier
    // reste le jour même.
    expect(points.length).toBeLessThan(200);
    expect(points[points.length - 1].date).toBe(TODAY);
  });

  it("garde les relevés plus anciens que la reconstruction", () => {
    const points = reconstructHistory([asset({ id: "enablebanking-x", balance: 1_000 })], {
      today: TODAY,
      days: 7,
      measured: [{ date: "2026-01-01", total: 500 }, { date: "2026-02-01", total: 600 }],
      txByAssetId: { "enablebanking-x": [tx("2026-08-13", -200)] },
    });
    expect(points[0]).toEqual({ date: "2026-01-01", total: 500 });
    expect(points[1]).toEqual({ date: "2026-02-01", total: 600 });
    // La reconstruction s'ouvre la veille du plus ancien mouvement connu, même
    // si la fenêtre demandée est plus large : au-delà, on ne sait rien.
    expect(points[2].date).toBe("2026-08-12");
  });

  it("rend les points dans l'ordre chronologique, sans doublon de date", () => {
    const points = reconstructHistory([asset({ id: "enablebanking-x", balance: 1_000 })], {
      today: TODAY,
      measured: [{ date: TODAY, total: 42 }, { date: "2026-08-01", total: 900 }],
      txByAssetId: { "enablebanking-x": [tx("2026-08-05", -200)] },
    });
    const dates = points.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });
});
