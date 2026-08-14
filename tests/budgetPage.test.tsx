import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

/* Comptes et relevés sont mockés : le hook réel irait chercher `/api/bank/...`,
   qui n'existe pas sous jsdom. Vides par défaut — les tests du plan n'ont rien à
   voir avec la banque, et le bloc du mois affiche alors son état « pas de compte
   connecté », qui ne rend ni diagramme ni anneau. */
const accounts: { uid: string }[] = [];
let transactions: unknown[] = [];

vi.mock("@/lib/bank/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankAccounts")>()),
  useBankAccounts: () => ({
    configured: true, connections: [], accounts, loading: false, error: null, reload: () => {},
  }),
}));

vi.mock("@/lib/bank/useBankTransactions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankTransactions")>()),
  useBankTransactionsAll: () => ({ byUid: { c1: transactions }, loading: false }),
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

/* ── Le bloc « Ce mois-ci » ─────────────────────────────────────────────────
   Ce que la page décide ici, et que ni `cashflow` ni `categories` ne tiennent :
     — la fenêtre est un MOIS CALENDAIRE, et les flèches en changent ;
     — le mois suivant n'existe pas quand on est sur le mois en cours ;
     — les trois chiffres commandent l'anneau, qui doit donc changer de propos
       quand on change d'onglet. */

const tx = (date: string, label: string, amount: number, kind = "card") => ({
  id: `${date}-${label}`,
  date,
  label,
  detail: null,
  amount,
  currency: "EUR",
  kind,
  pending: false,
});

/** Le mois tel que le système l'écrit — la page le formate par `Intl`, et la
 *  langue de l'appareil décide de l'ordre des mots comme de la casse. */
const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
    .format(new Date(`${iso}T00:00:00`));

describe("Page Budget — le mois qui vient de passer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-15T10:00:00"));
    cloudStore.clear();
    accounts.length = 0;
    accounts.push({ uid: "c1" });
    transactions = [
      tx("2026-08-03", "VIR SEPA SALAIRE", 2000, "transfer"),
      tx("2026-08-10", "CARTE 10/08 CARREFOUR", -300),
      tx("2026-07-05", "VIR SEPA SALAIRE", 1000, "transfer"),
      tx("2026-07-20", "PRLV SEPA EDF", -100, "direct_debit"),
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
    accounts.length = 0;
    transactions = [];
  });

  it("s'ouvre sur le mois en cours, sans les opérations du mois d'avant", () => {
    render(<BudgetPage />);

    expect(screen.getByText(monthLabel("2026-08-01"))).toBeTruthy();
    const text = document.body.textContent || "";
    expect(text).toMatch(/2,000\.00/); // encaissé en août
    expect(text).toMatch(/300\.00/);   // dépensé en août
    expect(text).toMatch(/1,700\.00/); // reste
    // Le salaire de juillet est hors du mois montré.
    expect(text).not.toMatch(/1,000\.00/);
  });

  it("recule d'un mois, et le mois suivant s'éteint sur le mois en cours", () => {
    render(<BudgetPage />);

    const next = screen.getByLabelText("Next month") as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Previous month"));

    expect(screen.getByText(monthLabel("2026-07-01"))).toBeTruthy();
    const text = document.body.textContent || "";
    expect(text).toMatch(/1,000\.00/); // encaissé en juillet
    expect(text).toMatch(/900\.00/);   // reste
    expect(text).not.toMatch(/2,000\.00/);
    // Et la flèche du mois suivant s'est rallumée.
    expect((screen.getByLabelText("Next month") as HTMLButtonElement).disabled).toBe(false);
  });

  it("l'anneau détaille ce que l'onglet choisi désigne", () => {
    render(<BudgetPage />);

    // Par défaut, les dépenses : c'est la question qu'on se pose devant un budget.
    expect(screen.getByRole("img", { name: /^Money out/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Money in/ }));
    expect(screen.getByRole("img", { name: /^Money in/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Left over/ }));
    expect(screen.getByRole("img", { name: /^Left over/ })).toBeTruthy();
  });

  it("dit qu'il n'y a pas de matière plutôt que d'afficher des zéros", () => {
    accounts.length = 0;
    render(<BudgetPage />);

    expect(screen.getByText("Connect a bank to see where your money goes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeTruthy();
    // Le plan, lui, ne dépend d'aucune banque et reste utilisable.
    expect(screen.getByText("Target budget")).toBeTruthy();
  });
});
