import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* La page Budget vient d'une autre app (Tailwind + react-query + API bancaire) ;
   elle a été réécrite dans l'idiome de tr4de. Ce test garde les règles de
   calcul qui font la valeur de la page — le reste (couleurs, marges) n'a pas à
   être figé par un test. */
const cloudStore = new Map<string, unknown>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(() => (cloudStore.has(k) ? cloudStore.get(k) : d));
    const set = (u: unknown) => setV((prev: unknown) => {
      const next = typeof u === "function" ? (u as (p: unknown) => unknown)(prev) : u;
      cloudStore.set(k, next);
      return next;
    });
    return [v, set];
  },
}));

import BudgetPage from "@/components/pages/BudgetPage";

/** Champ « part en % » d'une catégorie, repéré par son libellé accessible. */
const pctField = (name: string) =>
  screen.getByLabelText(`${name} share, in percent`) as HTMLInputElement;

/* Le champ revenu est le seul dont le placeholder n'est pas « 0 » — son <label>
   englobe aussi la devise et le « / mois », ce qui rend getByLabelText fragile. */
const incomeField = () => screen.getByPlaceholderText("2000") as HTMLInputElement;

describe("Page Budget", () => {
  it("déduit le montant du pourcentage, et le reste non alloué", () => {
    cloudStore.clear();
    render(<BudgetPage />);

    // Revenu par défaut 2000, épargne à 20 % → 400.
    const amount = screen.getByLabelText("Savings & investing amount") as HTMLInputElement;
    expect(amount.value).toBe("400");

    // 30 + 15 + 8 + 5 + 10 + 20 = 88 % → il reste 12 %.
    expect(screen.getByText("12 %")).toBeTruthy();
    expect(screen.getByText("Left (unallocated)")).toBeTruthy();
  });

  it("annonce le dépassement au-delà de 100 %", () => {
    cloudStore.clear();
    render(<BudgetPage />);

    fireEvent.change(pctField("Housing & bills"), { target: { value: "60" } });

    // 60 + 15 + 8 + 5 + 10 + 20 = 118 %.
    expect(screen.getByText("Over budget")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("118");
  });

  it("recalcule le pourcentage quand on saisit un montant", () => {
    cloudStore.clear();
    render(<BudgetPage />);

    // 500 € sur 2000 € de revenu → 25 %.
    fireEvent.change(screen.getByLabelText("Transport amount"), { target: { value: "500" } });
    expect(pctField("Transport").value).toBe("25");
  });

  /* Le cœur de la page : un montant saisi à la main correspond à une dépense
     réelle (un loyer, un abonnement). Changer le revenu ne doit pas le déplacer
     — c'est la part en % qui s'ajuste. */
  it("garde les montants saisis quand le revenu change", () => {
    cloudStore.clear();
    render(<BudgetPage />);

    /* La valeur saisie doit DIFFÉRER de celle déjà affichée (30 % de 2000 = 600) :
       sur un champ contrôlé, fireEvent.change à valeur identique n'émet aucun
       onChange — la catégorie ne serait jamais figée et le test ne prouverait rien. */
    const housing = () => screen.getByLabelText("Housing & bills amount") as HTMLInputElement;
    fireEvent.change(housing(), { target: { value: "700" } });
    fireEvent.blur(housing());
    expect(pctField("Housing & bills").value).toBe("35");

    // Revenu 2000 → 3000 : le loyer reste 700, sa part passe de 35 % à 23,3 %.
    fireEvent.change(incomeField(), { target: { value: "3000" } });
    expect(housing().value).toBe("700");
    expect(pctField("Housing & bills").value).toBe("23.3");

    // Une catégorie restée en pourcentage suit bien le revenu, elle.
    expect((screen.getByLabelText("Savings & investing amount") as HTMLInputElement).value).toBe("600");
  });

  it("libère un montant figé quand on saisit une part en pourcentage", () => {
    cloudStore.clear();
    render(<BudgetPage />);

    const transport = () => screen.getByLabelText("Transport amount") as HTMLInputElement;
    fireEvent.change(transport(), { target: { value: "500" } });
    fireEvent.blur(transport());

    fireEvent.change(pctField("Transport"), { target: { value: "10" } });
    fireEvent.blur(pctField("Transport"));
    fireEvent.change(incomeField(), { target: { value: "4000" } });

    // Redevenue proportionnelle : 10 % de 4000.
    expect(transport().value).toBe("400");
  });

  /* Le cadenas est manuel : sans lui, rien ne protège une catégorie. Il doit
     donc figer la somme d'un clic, sans avoir à retaper la valeur affichée. */
  it("fige une catégorie d'un clic sur le cadenas", () => {
    cloudStore.clear();
    render(<BudgetPage />);

    fireEvent.click(
      screen.getByLabelText("Lock Leisure & going out's amount (it will stop following income)")
    );
    fireEvent.change(incomeField(), { target: { value: "4000" } });

    // 10 % de 2000 = 200, figé : la somme reste, la part tombe à 5 %.
    expect((screen.getByLabelText("Leisure & going out amount") as HTMLInputElement).value).toBe("200");
    expect(pctField("Leisure & going out").value).toBe("5");
  });

  /* L'effet du cadenas est différé — il ne se voit qu'au changement de revenu.
     La page doit donc l'annoncer avant, sinon la commande reste invisible. */
  it("nomme la colonne du cadenas et explique son effet dès l'arrivée", () => {
    cloudStore.clear();
    render(<BudgetPage />);

    expect(screen.getByText("Lock")).toBeTruthy();
    expect(screen.getByText(/Close its padlock/)).toBeTruthy();
  });

  it("crée un budget supplémentaire et bascule dessus", () => {
    cloudStore.clear();
    render(<BudgetPage />);

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    const nameField = screen.getByLabelText("Budget name (editable)") as HTMLInputElement;
    expect(nameField.value).toBe("New budget");
    // L'ancien budget reste accessible d'un clic.
    expect(screen.getByRole("button", { name: "My budget" })).toBeTruthy();
  });
});
