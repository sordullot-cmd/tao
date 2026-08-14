import { describe, it, expect } from "vitest";
import {
  SPENDING_CATEGORIES,
  SUBCATEGORIES,
  categoryColor,
  categoryLabelKey,
  categorizeTransaction,
  isCatchAllSub,
  parentOfSub,
  spendingByCategory,
  subLabelKey,
  subcategorizeTransaction,
  type CategorizableTransaction,
} from "@/lib/bank/categories";
import { t } from "@/lib/i18n";

const tx = (over: Partial<CategorizableTransaction> = {}): CategorizableTransaction => ({
  label: "",
  detail: null,
  kind: "card",
  amount: -10,
  ...over,
});

describe("categorizeTransaction", () => {
  it("reconnaît une enseigne alimentaire quelle que soit sa graphie", () => {
    expect(categorizeTransaction(tx({ label: "CARREFOUR CITY 4979" }))).toBe("food");
    expect(categorizeTransaction(tx({ label: "e.leclerc drive" }))).toBe("food");
    expect(categorizeTransaction(tx({ label: "Boulangerie Pétrin" }))).toBe("food");
  });

  /* Le vrai visage d'un relevé français : un code d'opération, une date, un
     numéro de carte, et le nom du commerçant collé aux chiffres. C'est le cas
     qui faisait tout tomber dans « Autres » — la frontière de mot n'existait
     pas entre « carrefour » et « 4979 ». */
  it("retrouve l'enseigne sous le bruit que les banques ajoutent", () => {
    expect(categorizeTransaction(tx({ label: "CARTE 12/08 CARREFOURCITY4979 FR" }))).toBe("food");
    expect(categorizeTransaction(tx({ label: "PAIEMENT CB 4979 AMAZON*MKTP FR" }))).toBe("shopping");
    expect(categorizeTransaction(tx({ label: "PRLV SEPA FREE MOBILE REF 88213" }))).toBe("telecom");
    expect(categorizeTransaction(tx({ label: "ACHAT CB SNCF-CONNECT 12.08" }))).toBe("transport");
  });

  it("classe les postes du toit séparément", () => {
    expect(categorizeTransaction(tx({ label: "VIR LOYER AOUT" }))).toBe("housing");
    expect(categorizeTransaction(tx({ label: "PRLV EDF FACTURE" }))).toBe("utilities");
    expect(categorizeTransaction(tx({ label: "ORANGE SA" }))).toBe("telecom");
    expect(categorizeTransaction(tx({ label: "PRLV MACIF ASSURANCE" }))).toBe("insurance");
  });

  it("sépare la route en trajet, carburant et voiture", () => {
    expect(categorizeTransaction(tx({ label: "SNCF CONNECT" }))).toBe("transport");
    expect(categorizeTransaction(tx({ label: "STATION SERVICE ESSO" }))).toBe("fuel");
    expect(categorizeTransaction(tx({ label: "NORAUTO CONTROLE TECHNIQUE" }))).toBe("car");
    expect(categorizeTransaction(tx({ label: "BOOKING COM HOTEL" }))).toBe("travel");
  });

  it("classe le corps, les achats et le temps libre", () => {
    expect(categorizeTransaction(tx({ label: "PHARMACIE DU CENTRE" }))).toBe("health");
    expect(categorizeTransaction(tx({ label: "COIFFEUR STUDIO 9" }))).toBe("beauty");
    expect(categorizeTransaction(tx({ label: "VETERINAIRE DES LILAS" }))).toBe("pets");
    expect(categorizeTransaction(tx({ label: "BASIC FIT FRANCE" }))).toBe("sport");
    expect(categorizeTransaction(tx({ label: "FNAC PARIS" }))).toBe("tech");
    expect(categorizeTransaction(tx({ label: "AMAZON EU SARL" }))).toBe("shopping");
    expect(categorizeTransaction(tx({ label: "UGC CINE CITE" }))).toBe("leisure");
    expect(categorizeTransaction(tx({ label: "CRECHE LES POUSSINS" }))).toBe("kids");
  });

  it("reconnaît les prop firms et les outils de trading", () => {
    expect(categorizeTransaction(tx({ label: "FTMO SRO PRAHA" }))).toBe("trading");
    expect(categorizeTransaction(tx({ label: "CB APEX TRADER FUNDING" }))).toBe("trading");
    expect(categorizeTransaction(tx({ label: "TOPSTEP LLC" }))).toBe("trading");
    expect(categorizeTransaction(tx({ label: "PRLV TRADINGVIEW INC" }))).toBe("trading");
  });

  it("tranche les pièges avant la règle large qui les avalerait", () => {
    // La livraison de repas est de l'ALIMENTATION, pas une sortie — et « Uber
    // Eats » doit se lire avant « Uber », qui est un trajet.
    expect(categorizeTransaction(tx({ label: "DELIVEROO PARIS" }))).toBe("food");
    expect(categorizeTransaction(tx({ label: "UBER EATS PARIS" }))).toBe("food");
    expect(categorizeTransaction(tx({ label: "UBER TRIP" }))).toBe("transport");
    // « TotalEnergies » est une facture, « TOTAL » seul une station.
    expect(categorizeTransaction(tx({ label: "TOTALENERGIES ELEC" }))).toBe("utilities");
    expect(categorizeTransaction(tx({ label: "TOTAL RELAIS A6" }))).toBe("fuel");
    // « Amazon Prime » est un abonnement, pas un achat.
    expect(categorizeTransaction(tx({ label: "AMAZON PRIME" }))).toBe("subscriptions");
    // Un restaurant est de l'alimentation, mais pas une épicerie : même poste,
    // sous-poste différent.
    expect(categorizeTransaction(tx({ label: "RESTAURANT LE SUD" }))).toBe("food");
    expect(subcategorizeTransaction(tx({ label: "RESTAURANT LE SUD" }))).toBe("food.restaurant");
    expect(subcategorizeTransaction(tx({ label: "CARREFOUR CITY" }))).toBe("food.groceries");
  });

  it("lit aussi le complément de libellé", () => {
    expect(categorizeTransaction(tx({ label: "PAIEMENT CB", detail: "NETFLIX.COM" }))).toBe("subscriptions");
  });

  it("retombe sur la nature quand le libellé ne dit rien", () => {
    expect(categorizeTransaction(tx({ label: "RETRAIT DAB 1234", kind: "withdrawal" }))).toBe("cash");
    expect(categorizeTransaction(tx({ label: "COTISATION TRIMESTRIELLE", kind: "fee" }))).toBe("fees");
    expect(categorizeTransaction(tx({ label: "VIR M. DUPONT", kind: "transfer" }))).toBe("transfer");
    expect(categorizeTransaction(tx({ label: "OPERATION 8842", kind: "card" }))).toBe("other");
  });

  it("range une entrée d'argent dans les revenus, sauf poste reconnu", () => {
    expect(categorizeTransaction(tx({ label: "VIR SALAIRE", kind: "transfer", amount: 2400 }))).toBe("income");
    // Un remboursement de santé reste de la santé : le voir en déduction de son
    // poste vaut mieux que de le noyer dans les revenus.
    expect(categorizeTransaction(tx({ label: "CPAM REMBOURSEMENT", amount: 24 }))).toBe("health");
  });
});

describe("spendingByCategory", () => {
  it("somme les débits par poste, en positif et du plus gros au plus petit", () => {
    const { slices, total, count } = spendingByCategory([
      tx({ label: "CARREFOUR", amount: -80 }),
      tx({ label: "LIDL", amount: -20 }),
      tx({ label: "SNCF", amount: -150 }),
    ]);

    expect(total).toBe(250);
    expect(count).toBe(3);
    expect(slices.map((s) => s.id)).toEqual(["transport", "food"]);
    expect(slices[0].amount).toBe(150);
    expect(slices[1].amount).toBe(100);
    expect(slices[1].count).toBe(2);
    expect(Math.round(slices[0].pct)).toBe(60);
  });

  it("détaille chaque poste par sous-poste, du plus gros au plus petit", () => {
    const { slices } = spendingByCategory([
      tx({ label: "CARREFOUR", amount: -80 }),
      tx({ label: "MC DONALDS", amount: -15 }),
      tx({ label: "DELIVEROO", amount: -30 }),
    ]);

    const food = slices.find((s) => s.id === "food");
    expect(food?.amount).toBe(125);
    expect(food?.subs.map((s) => [s.id, s.amount])).toEqual([
      ["food.groceries", 80],
      ["food.delivery", 30],
      ["food.fastfood", 15],
    ]);
  });

  it("ne détaille pas un poste qui n'a qu'un seul sous-poste", () => {
    const { slices } = spendingByCategory([
      tx({ label: "CARREFOUR", amount: -80 }),
      tx({ label: "LIDL", amount: -20 }),
    ]);
    // Un seul sous-poste : le redire sous le poste afficherait deux fois le
    // même chiffre à la suite.
    expect(slices[0].subs).toEqual([]);
  });

  it("écarte les revenus du total dépensé", () => {
    const { slices, total } = spendingByCategory([
      tx({ label: "VIR SALAIRE", kind: "transfer", amount: 2400 }),
      tx({ label: "CARREFOUR", amount: -100 }),
    ]);
    expect(total).toBe(100);
    expect(slices).toHaveLength(1);
    expect(slices[0].id).toBe("food");
  });

  it("déduit un remboursement de son poste, et retire le poste s'il s'annule", () => {
    const { slices, total } = spendingByCategory([
      tx({ label: "PHARMACIE", amount: -30 }),
      tx({ label: "CPAM REMBOURSEMENT", amount: 30 }),
      tx({ label: "CARREFOUR", amount: -40 }),
    ]);
    expect(slices.map((s) => s.id)).toEqual(["food"]);
    expect(total).toBe(40);
  });

  it("ne rend que des parts qui font 100 %", () => {
    const { slices } = spendingByCategory([
      tx({ label: "CARREFOUR", amount: -60 }),
      tx({ label: "SNCF", amount: -40 }),
    ]);
    expect(slices.reduce((s, p) => s + p.pct, 0)).toBeCloseTo(100, 6);
  });

  it("rend une répartition vide sans opération", () => {
    expect(spendingByCategory([])).toEqual({ slices: [], total: 0, count: 0 });
  });
});

describe("sous-postes", () => {
  it("détaille l'alimentation comme on la vit", () => {
    const sub = (label: string) => subcategorizeTransaction(tx({ label }));
    expect(sub("CARREFOUR MARKET")).toBe("food.groceries");
    expect(sub("BIOCOOP LES HALLES")).toBe("food.organic");
    expect(sub("BOULANGERIE MARTIN")).toBe("food.market");
    expect(sub("RESTAURANT LE SUD")).toBe("food.restaurant");
    expect(sub("MC DONALDS 0921")).toBe("food.fastfood");
    expect(sub("DELIVEROO FRANCE")).toBe("food.delivery");
    expect(sub("STARBUCKS OPERA")).toBe("food.cafe");
    // Tous sous le MÊME poste : c'est ce qui fait une part d'anneau.
    for (const label of ["CARREFOUR MARKET", "MC DONALDS 0921", "DELIVEROO FRANCE"]) {
      expect(categorizeTransaction(tx({ label }))).toBe("food");
    }
  });

  it("sépare les prop firms des outils et des courtiers", () => {
    expect(subcategorizeTransaction(tx({ label: "FTMO SRO" }))).toBe("trading.propfirm");
    expect(subcategorizeTransaction(tx({ label: "TRADINGVIEW INC" }))).toBe("trading.tools");
    expect(subcategorizeTransaction(tx({ label: "IC MARKETS LTD" }))).toBe("trading.broker");
  });

  it("retombe sur le poste lui-même quand seule la règle large a parlé", () => {
    const sub = subcategorizeTransaction(tx({ label: "AGENCE IMMOBILIERE DUPONT" }));
    expect(sub).toBe("housing");
    expect(isCatchAllSub(sub)).toBe(true);
    expect(parentOfSub(sub)).toBe("housing");
    // Un vrai sous-poste, lui, n'est pas un catch-all.
    expect(isCatchAllSub("food.fastfood")).toBe(false);
  });

  it("rattache chaque sous-poste à un poste connu, avec ses deux libellés", () => {
    const known = new Set(SPENDING_CATEGORIES.map((c) => c.id));
    for (const { id, category } of SUBCATEGORIES) {
      expect(known.has(category)).toBe(true);
      expect(parentOfSub(id)).toBe(category);
      expect(t(subLabelKey(id), "fr")).not.toBe(subLabelKey(id));
      expect(t(subLabelKey(id), "en")).not.toBe(subLabelKey(id));
    }
  });

  it("n'attribue pas deux fois le même identifiant de sous-poste", () => {
    const ids = SUBCATEGORIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("catalogue des postes", () => {
  it("donne une teinte et un libellé traduit à chaque poste", () => {
    for (const { id, color } of SPENDING_CATEGORIES) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(categoryColor(id)).toBe(color);
      const key = categoryLabelKey(id);
      // `t` rend la CLÉ quand la traduction manque : c'est ce qu'on vérifie.
      expect(t(key, "fr")).not.toBe(key);
      expect(t(key, "en")).not.toBe(key);
    }
  });

  it("n'attribue pas deux fois la même teinte", () => {
    const colors = SPENDING_CATEGORIES.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
