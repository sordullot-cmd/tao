import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* La page Budget & cashflow ne fait aucun calcul métier : elle met en page ce que
   `lib/bank/categories` et `lib/bank/cashflow` classent et somment, testés de
   leur côté. Ce qui est sous test ici est donc ce que la PAGE décide et que rien
   d'autre ne tient :
     — la fenêtre affichée, et les trois chiffres de tête qu'elle donne ;
     — le contenu d'un poste, qu'on n'obtient qu'en le dépliant ;
     — les deux colonnes du détail : les postes, et les entrées d'argent ;
     — les cinq dernières opérations, entrées comprises ;
     — le classement des enseignes ;
     — le prévisionnel, qui doit rester là même sans banque connectée ;
     — l'état sans banque, qui ne doit pas ressembler à « zéro dépense ».
   Les libellés viennent du dictionnaire anglais : c'est la langue par défaut. */

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

/* Comptes et relevés sont mockés : le hook réel irait chercher
   `/api/bank/...`, qui n'existe pas sous jsdom. */
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

import CashflowPage from "@/components/pages/CashflowPage";
import { categoryLabelKey, subLabelKey } from "@/lib/bank/categories";
import { t } from "@/lib/i18n";

/** Libellé d'un poste tel que la page l'écrit : les libellés du dictionnaire
 *  bougent, la correspondance poste → libellé non. */
const cat = (id: Parameters<typeof categoryLabelKey>[0]) => t(categoryLabelKey(id));
const sub = (id: string) => t(subLabelKey(id));

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

/* Au 14 août, la fenêtre d'un mois couvre le 16 juillet → 14 août.
     dépenses de la fenêtre : 100 + 50 (Carrefour) + 20 (Netflix) + 80 (EDF) = 250
     entrées de la fenêtre   : 1 800 (salaire) + 40 (remboursement)           = 1 840
     donc 1 590 de reste, et le 1er juillet comme le 16 juin restent dehors.

     Le remboursement est VOLONTAIREMENT générique : dès qu'un libellé porte un
     poste de dépense (« CPAM », « pharmacie »), le crédit reste déduit de ce
     poste et ne compte plus comme une entrée. */
const relevé = () => [
  tx("2026-08-10", "CARTE 10/08 CARREFOUR", -100),
  tx("2026-08-05", "NETFLIX.COM", -20),
  tx("2026-08-03", "VIR SEPA SALAIRE JUILLET", 1800, "transfer"),
  tx("2026-08-02", "VIR SEPA REMBOURSEMENT", 40, "transfer"),
  tx("2026-08-01", "CARTE 01/08 CARREFOURCITY4979", -50),
  tx("2026-07-20", "PRLV SEPA EDF", -80, "direct_debit"),
  tx("2026-07-01", "CARTE 01/07 CARREFOUR", -100),
  tx("2026-06-16", "CARTE 16/06 SNCF INTERNET", -30),
];

const pageText = () => document.body.textContent || "";

describe("Page Budget & cashflow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-14T10:00:00"));
    cloudStore.clear();
    accounts.length = 0;
    accounts.push({ uid: "c1" });
    transactions = relevé();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("donne les trois chiffres du flux sur la fenêtre", () => {
    render(<CashflowPage setPage={() => {}} />);

    /* La fenêtre d'un mois s'arrête au 16 juillet : les 100 € du 1er juillet et
       les 30 € du 16 juin n'en font pas partie. */
    expect(screen.getByText("Money out")).toBeTruthy();
    /* « Reste » paraît deux fois, et c'est voulu : comme chiffre de tête, et
       comme dernière branche du flux — c'est là qu'on voit qu'il en fait partie. */
    expect(screen.getAllByText(/Left over/).length).toBeGreaterThan(0);
    expect(pageText()).toMatch(/250\.00/);   // dépensé
    expect(pageText()).toMatch(/1,840\.00/); // encaissé
    expect(pageText()).toMatch(/1,590\.00/); // reste
    expect(pageText()).not.toMatch(/380\.00/);
  });

  it("répartit les dépenses par poste, du plus lourd au plus léger", () => {
    render(<CashflowPage setPage={() => {}} />);

    // 150 sur 250 = 60 % pour l'alimentation, 80 → 32 %, 20 → 8 %.
    expect(pageText()).toMatch(/60 %/);
    expect(screen.getByText(cat("utilities"))).toBeTruthy();
    expect(screen.getByText(cat("subscriptions"))).toBeTruthy();
  });

  it("répartit les entrées par source", () => {
    render(<CashflowPage setPage={() => {}} />);

    /* Le salaire et le remboursement de la Sécu ne sont pas la même chose, et le
       flux part de cette distinction. Le remboursement ne porte PAS de règle de
       dépense (« soins » n'en est pas une) : il compte donc comme une entrée. */
    expect(screen.getByText("Money in", { selector: "h2" })).toBeTruthy();
    expect(screen.getAllByText(sub("income.salary")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(sub("income.refund")).length).toBeGreaterThan(0);
  });

  it("ne montre les opérations d'un poste qu'une fois déplié", () => {
    render(<CashflowPage setPage={() => {}} />);

    /* Replié, les opérations du poste ne sont pas dans le document : un lecteur
       d'écran ne doit pas parcourir quinze postes fermés. Le marqueur est le
       libellé brut d'une opération dont l'enseigne n'est PAS reconnue — il
       n'apparaît qu'une fois avant le dépliage (dans les dernières opérations),
       deux fois après. */
    const marqueur = () => screen.queryAllByText(/CARREFOURCITY4979/).length;
    expect(marqueur()).toBe(1);

    const poste = screen.getByRole("button", { expanded: false, name: new RegExp(cat("food")) });
    fireEvent.click(poste);

    expect(marqueur()).toBe(2);
    expect(screen.getByRole("button", { expanded: true, name: new RegExp(cat("food")) })).toBeTruthy();
  });

  it("montre les cinq dernières opérations, entrées comprises", () => {
    render(<CashflowPage setPage={() => {}} />);

    expect(screen.getByText("Latest transactions")).toBeTruthy();
    /* Les cinq plus récentes vont du 10 au 1er août : le crédit du salaire en
       fait partie (une entrée est une opération comme une autre), le débit du
       20 juillet non. */
    expect(pageText()).toMatch(/\+\$1,800\.00/);
    expect(pageText()).not.toContain("PRLV SEPA EDF");
  });

  it("classe les enseignes reconnues par montant", () => {
    render(<CashflowPage setPage={() => {}} />);

    const titre = screen.getByText("Merchants");
    /* Le bloc entier, titre compris : les noms d'enseignes paraissent aussi dans
       les dernières opérations juste au-dessus, et l'ordre qu'on teste ici est
       celui du classement, pas celui du relevé. */
    const bloc = titre.closest("div")?.parentElement as HTMLElement;

    /* Carrefour (100 €) devant EDF (80 €) devant Netflix (20 €). Le second passage
       Carrefour n'y est pas : « CARREFOURCITY4979 » n'est pas reconnu comme
       enseigne, alors que le POSTE l'attrape — les deux tables ne nettoient pas le
       libellé pareil. Il compte donc dans l'alimentation, pas dans l'enseigne. */
    const names = within(bloc).getAllByText(/^(Carrefour|EDF|Netflix)$/).map((n) => n.textContent);
    expect(names).toEqual(["Carrefour", "EDF", "Netflix"]);
  });

  it("garde le prévisionnel en bas de page", () => {
    render(<CashflowPage setPage={() => {}} />);

    // Le bloc venu de l'ancienne page Budget : son titre, et son revenu saisi.
    expect(screen.getByText("Target budget")).toBeTruthy();
    expect(screen.getByLabelText("Budget name (editable)")).toBeTruthy();
  });

  it("dit qu'il n'y a pas de matière plutôt que d'afficher zéro", () => {
    accounts.length = 0;
    render(<CashflowPage setPage={() => {}} />);

    expect(pageText()).toContain("Connect a bank");
    // Ni chiffres de tête, ni postes : il n'y a rien à répartir.
    expect(screen.queryByText("Money out")).toBeNull();
    expect(screen.queryByText(cat("food"))).toBeNull();
    /* Le prévisionnel, lui, ne dépend d'aucune banque : le retirer là où il n'y a
       pas de relevé priverait la page de la seule chose qu'elle peut encore
       faire. */
    expect(screen.getByText("Target budget")).toBeTruthy();
  });
});
