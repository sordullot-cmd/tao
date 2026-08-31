/**
 * Écran d'import — ce qu'il doit garantir, quel que soit son dessin.
 *
 * Trois promesses : le bouton dit toujours ce qui l'empêche, le compte de
 * trades annoncé est celui qui sera vraiment importé — donc relu quand on
 * change de plateforme, puisque c'est elle qui décide du parseur —, et cocher
 * un compte d'une prop firm n'en coche pas les autres.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AddTradePage from "@/components/pages/AddTradePage";

/* Le parseur est piloté par le test : c'est la plateforme passée en second
   argument qui doit changer le résultat, et c'est exactement ce qu'on vérifie. */
vi.mock("@/lib/csvParsers", () => ({
  parseCSV: (_text: string, broker: string) =>
    broker === "mt5"
      ? [{ date: "2026-01-02", symbol: "EURUSD", direction: "Short", entry: 1, exit: 2, pnl: -40 }]
      : [
          { date: "2026-01-01", symbol: "MNQ", direction: "Long", entry: 1, exit: 2, pnl: 120 },
          { date: "2026-01-01", symbol: "MNQ", direction: "Long", entry: 3, exit: 4, pnl: 60 },
        ],
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}));

const FIRM = { id: "f1", name: "Apex" };
const ALPHA = { id: "f2", name: "Alpha Futures" };
const ALPHA_ACCOUNTS = [
  { id: "b1", firm_id: "f2", name: "Alpha Eval 50k", account_type: "eval" },
];
const FIRM_ACCOUNTS = [
  { id: "a1", firm_id: "f1", name: "Eval 50k", account_type: "eval" },
  { id: "a2", firm_id: "f1", name: "Eval 100k", account_type: "eval" },
  { id: "a3", firm_id: "f1", name: "Funded 50k", account_type: "funded" },
];

const props = {
  setPage: () => {},
  setAccounts: () => {},
  accounts: [],
  firms: [],
  user: { id: "u1" },
};

/* Les favoris de courtiers survivent d'un test à l'autre via localStorage : on
   retire LA clé, pas tout le magasin — `tests/setup.ts` y pose la langue. */
beforeEach(() => {
  localStorage.removeItem("tr4de_favorite_brokers");
});

describe("écran d'ajout de trades", () => {
  it("dit ce qui manque plutôt que d'éteindre le bouton sans raison", () => {
    render(<AddTradePage {...props} />);
    const btn = screen.getByRole("button", { name: /^import$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/pick where these trades go first/i)).toBeTruthy();
  });

  it("relit le fichier quand on change de plateforme", async () => {
    render(<AddTradePage {...props} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(["peu importe"], "releve.csv", { type: "text/csv" })] },
    });

    /* Aucune plateforme nommée : le parseur reconnaît le format tout seul, et
       trouve deux trades. */
    expect(await screen.findByText("releve.csv")).toBeTruthy();
    expect(await screen.findByText(/^2 trades$/)).toBeTruthy();

    /* La plateforme change → le MÊME fichier doit être relu avec l'autre
       parseur. Sans ça le pied annoncerait un import que le bouton ne ferait
       pas : l'insertion, elle, repart toujours du parseur courant. */
    fireEvent.click(screen.getByRole("button", { name: /pick a platform/i }));
    fireEvent.click(await screen.findByRole("button", { name: /MetaTrader 5/i }));
    expect(await screen.findByText(/^1 trades$/)).toBeTruthy();
  });

  it("liste les comptes d'une firme, et n'en présélectionne qu'un type", async () => {
    render(<AddTradePage {...props} accounts={FIRM_ACCOUNTS} firms={[FIRM]} />);

    fireEvent.click(screen.getByRole("button", { name: /pick a prop firm or an account/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Apex/ }));

    /* Mélanger éval et funded dans un même import est rarement voulu : seul le
       premier groupe part coché, les autres restent visibles. Les comptes sont
       de vraies cases à cocher, d'où le rôle interrogé ici. */
    const eval50 = await screen.findByRole("checkbox", { name: "Eval 50k" });
    expect(eval50).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Funded 50k" })).not.toBeChecked();

    // Une ligne se décoche sans toucher aux autres.
    fireEvent.click(eval50);
    expect(eval50).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Eval 100k" })).toBeChecked();
  });

  /* Le compte visé commande la plateforme : viser une prop firm, c'est se
     limiter aux plateformes qu'elle sert. Proposer les autres, c'est proposer un
     parseur qui ne lira jamais le fichier de ce compte. */
  it("ne propose que les plateformes de la prop firm visée", async () => {
    render(<AddTradePage {...props} accounts={FIRM_ACCOUNTS} firms={[FIRM]} />);

    fireEvent.click(screen.getByRole("button", { name: /pick a prop firm or an account/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Apex/ }));

    /* Le champ se désigne ici par son rôle et non par son nom : Apex déduit sa
       plateforme, donc le nom du déclencheur n'est plus l'invite. */
    fireEvent.click(document.querySelector('[aria-haspopup="listbox"]') as HTMLElement);
    expect(await screen.findByRole("button", { name: /WealthCharts/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /MetaTrader 5/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /AlphaTrader/i })).toBeNull();
  });

  it("bascule sur la plateforme de la firme quand la courante n'y est pas", async () => {
    render(<AddTradePage {...props} accounts={ALPHA_ACCOUNTS} firms={[ALPHA]} />);
    // À l'arrivée, aucune plateforme : le champ montre son invite.
    expect(screen.getByRole("button", { name: /pick a platform/i })).toBeTruthy();

    /* Choisir la firme, en revanche, DÉDUIT la plateforme : Alpha Futures n'en
       fournit qu'une, et Tradovate ne doit pas être proposé — le champ
       annoncerait un import que le parseur ne saurait pas faire. */
    fireEvent.click(screen.getByRole("button", { name: /pick a prop firm or an account/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Alpha Futures/ }));
    expect(await screen.findByRole("button", { name: /alphatrader\s*csv/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /tradovate\s*csv/i })).toBeNull();
  });

  /* Le convertisseur : AlphaTrader n'exporte aucun fichier, sa zone de dépôt
     est remplacée par une zone de texte, et ce qu'on y colle vaut fichier. */
  it("remplace la zone de dépôt par la zone de texte, et seulement pour AlphaTrader", async () => {
    render(<AddTradePage {...props} />);
    // Aucune plateforme nommée : on dépose un fichier, il n'y a rien à coller.
    expect(screen.getByText(/drop your file here/i)).toBeTruthy();
    expect(screen.queryByLabelText(/statement rows/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /pick a platform/i }));
    fireEvent.click(await screen.findByRole("button", { name: /MetaTrader 5/i }));
    expect(screen.queryByLabelText(/statement rows/i)).toBeNull();

    /* Le champ se rouvre par son rôle : une fois MetaTrader retenu, le
       déclencheur porte ce nom et ne se distingue plus de l'option. */
    fireEvent.click(document.querySelector('[aria-haspopup="listbox"]') as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: /AlphaTrader/i }));
    expect(screen.getByLabelText(/statement rows/i)).toBeTruthy();
    expect(screen.queryByText(/drop your file here/i)).toBeNull();
  });

  it("compte les trades d'un collage sans rien demander de plus", async () => {
    render(<AddTradePage {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /pick a platform/i }));
    fireEvent.click(await screen.findByRole("button", { name: /AlphaTrader/i }));

    fireEvent.change(screen.getByLabelText(/statement rows/i), {
      target: {
        value:
          "XCME_Eq MNQ (U26)\tLONG\t1.00\tf8124dd918905c0b\tBUY\tSELL\t$29,523.25\t$29,508.00\t-$30.50\t$1.32\t01/09/2026 12:00:11.00 AM\t01/09/2026 12:01:01.66 AM",
      },
    });

    /* Le pied compte comme pour un fichier déposé — le mock du parseur rend
       deux trades quel que soit le contenu, c'est la CHAÎNE qu'on vérifie :
       le collage est bien parti au parseur. */
    expect(await screen.findByText(/^2 trades$/)).toBeTruthy();
    // L'aperçu, lui, vient du convertisseur et non du mock.
    expect(screen.getByText("MNQ")).toBeTruthy();
    expect(screen.getByText("00:00:11 → 00:01:01")).toBeTruthy();
  });

  it("ne compte rien quand le collage n'est pas lisible", async () => {
    render(<AddTradePage {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /pick a platform/i }));
    fireEvent.click(await screen.findByRole("button", { name: /AlphaTrader/i }));

    fireEvent.change(screen.getByLabelText(/statement rows/i), {
      target: { value: "trois lignes de rien" },
    });
    expect(await screen.findByText(/no trade recognized/i)).toBeTruthy();
    expect(screen.queryByText(/^\d+ trades$/)).toBeNull();
  });
});
