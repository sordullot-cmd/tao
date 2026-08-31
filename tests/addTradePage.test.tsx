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

    // Parseur par défaut (Tradovate) : deux trades.
    expect(await screen.findByText("releve.csv")).toBeTruthy();
    expect(await screen.findByText(/^2 trades$/)).toBeTruthy();

    /* La plateforme change → le MÊME fichier doit être relu avec l'autre
       parseur. Sans ça le pied annoncerait un import que le bouton ne ferait
       pas : l'insertion, elle, repart toujours du parseur courant. */
    fireEvent.click(screen.getByRole("button", { name: /tradovate\s*csv/i }));
    fireEvent.click(await screen.findByRole("button", { name: /MetaTrader 5/i }));
    expect(await screen.findByText(/^1 trades$/)).toBeTruthy();
  });

  it("présente les comptes d'une firme en pastilles, et n'en présélectionne qu'un type", async () => {
    render(<AddTradePage {...props} accounts={FIRM_ACCOUNTS} firms={[FIRM]} />);

    fireEvent.click(screen.getByRole("button", { name: /pick a prop firm or an account/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Apex/ }));

    /* Mélanger éval et funded dans un même import est rarement voulu : seule la
       premier groupe part coché, les autres restent visibles. Les comptes sont
       de vraies cases à cocher, d'où le rôle interrogé ici. */
    const eval50 = await screen.findByRole("checkbox", { name: "Eval 50k" });
    expect(eval50).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Funded 50k" })).not.toBeChecked();

    // Une pastille se décoche sans toucher aux autres.
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

    fireEvent.click(screen.getByRole("button", { name: /tradovate\s*csv/i }));
    expect(await screen.findByRole("button", { name: /WealthCharts/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /MetaTrader 5/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /AlphaTrader/i })).toBeNull();
  });

  it("bascule sur la plateforme de la firme quand la courante n'y est pas", async () => {
    render(<AddTradePage {...props} accounts={ALPHA_ACCOUNTS} firms={[ALPHA]} />);
    // Au départ, Tradovate — le choix par défaut hors firme.
    expect(screen.getByRole("button", { name: /tradovate\s*csv/i })).toBeTruthy();

    /* Alpha Futures ne sert pas Tradovate : laisser le champ dessus annoncerait
       un import que le parseur ne saurait pas faire. */
    fireEvent.click(screen.getByRole("button", { name: /pick a prop firm or an account/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Alpha Futures/ }));
    expect(await screen.findByRole("button", { name: /alphatrader\s*csv/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /tradovate\s*csv/i })).toBeNull();
  });
});
