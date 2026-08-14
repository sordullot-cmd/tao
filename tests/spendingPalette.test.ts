/**
 * Accord des teintes entre le budget PRÉVU et les dépenses RÉALISÉES.
 *
 * Les deux anneaux sont voisins sur la synthèse. Le budget porte les couleurs
 * choisies par l'utilisateur ; les dépenses doivent en descendre, sinon recolorer
 * une catégorie dans la page Budget fait diverger les deux graphiques.
 */

import { describe, it, expect } from "vitest";
import { BUDGET_FAMILY, categoryColor, spendingPalette } from "@/lib/bank/categories";

/* Les couleurs par défaut de la page Budget (`defaultItems`), telles qu'elles
   arrivent ici : indexées par l'id de la catégorie, pas par son libellé — le
   libellé est renommable, l'id non. */
const BUDGET_DEFAUT = {
  logement: "#2C72C3",
  alimentation: "#DF6C10",
  transport: "#0F8FAD",
  abonnements: "#9D7AEF",
  loisirs: "#B92E74",
  epargne: "#3EA817",
};

describe("palette des dépenses dérivée du budget", () => {
  it("donne au poste principal la couleur exacte de sa catégorie de budget", () => {
    const p = spendingPalette(BUDGET_DEFAUT);
    expect(p.housing).toBe("#2C72C3");
    expect(p.food).toBe("#DF6C10");
    expect(p.transport).toBe("#0F8FAD");
    expect(p.subscriptions).toBe("#9D7AEF");
    expect(p.leisure).toBe("#B92E74");
    expect(p.savings).toBe("#3EA817");
  });

  it("suit une couleur changée dans la page Budget", () => {
    const p = spendingPalette({ ...BUDGET_DEFAUT, logement: "#0B7B3E" });
    expect(p.housing).toBe("#0B7B3E");   // rendue telle quelle, sans recomposition
    // Les postes de la même famille suivent aussi : ce sont des variantes.
    expect(p.utilities).not.toBe(categoryColor("utilities"));
    expect(p.telecom).not.toBe(categoryColor("telecom"));
  });

  it("distingue les postes d'une même famille — trois parts identiques ne se lisent pas", () => {
    const p = spendingPalette(BUDGET_DEFAUT);
    const toit = [p.housing, p.utilities, p.telecom, p.insurance];
    expect(new Set(toit).size).toBe(4);
    const route = [p.transport, p.fuel, p.car, p.travel];
    expect(new Set(route).size).toBe(4);
  });

  it("garde la teinte d'origine pour un poste sans catégorie de budget", () => {
    const p = spendingPalette(BUDGET_DEFAUT);
    // « shopping », « santé », « impôts » n'ont pas de famille dans le budget
    // par défaut : rien à en dériver, la palette du module reste la référence.
    expect(BUDGET_FAMILY.shopping).toBeUndefined();
    expect(p.shopping).toBe(categoryColor("shopping"));
    expect(p.health).toBe(categoryColor("health"));
    expect(p.other).toBe(categoryColor("other"));
  });

  it("sans budget saisi, rend la palette du module telle quelle", () => {
    const p = spendingPalette();
    expect(p.housing).toBe(categoryColor("housing"));
    expect(p.food).toBe(categoryColor("food"));
  });

  it("rend toujours une couleur exploitable", () => {
    // Une catégorie de budget sans couleur enregistrée ne doit pas produire
    // « #undefined » — le repli est la teinte du module.
    const p = spendingPalette({ logement: undefined, alimentation: "" });
    expect(p.housing).toBe(categoryColor("housing"));
    expect(p.food).toBe(categoryColor("food"));
    for (const [, hex] of Object.entries(p)) {
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
