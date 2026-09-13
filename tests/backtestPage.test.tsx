import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* La page tient tout son état dans une clé de `useCloudState`. Le remplaçant
   RELAIE entre ses instances, comme le vrai hook : sans ce relais, deux
   composants montés sur la même clé divergent et le test échoue pour une raison
   qui n'a rien à voir avec ce qu'il vérifie. */
const cloudStore = new Map<string, unknown>();
const cloudListeners = new Map<string, Set<() => void>>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
      const set = cloudListeners.get(k) ?? new Set<() => void>();
      set.add(force);
      cloudListeners.set(k, set);
      return () => { set.delete(force); };
    }, [k, force]);

    const read = () => (cloudStore.has(k) ? cloudStore.get(k) : d);
    const set = (u: unknown) => {
      cloudStore.set(k, typeof u === "function" ? (u as (p: unknown) => unknown)(read()) : u);
      cloudListeners.get(k)?.forEach(fn => fn());
    };
    return [read(), set, true];
  },
}));

vi.mock("@/lib/contexts/UndoContext", () => ({ useUndo: () => ({ pushUndo: vi.fn() }) }));

/* Les stratégies viennent de la coquille, pas du journal : la page ne les
   invente pas, elle les lit. */
vi.mock("@/lib/contexts/AppContext", () => ({
  useApp: () => ({
    strategies: [
      { id: "s1", name: "Breakout NY", color: "#58CC02" },
      { id: "s2", name: "Reversal Londres", color: "#1CB0F6" },
    ],
  }),
}));

import BacktestPage from "@/components/pages/BacktestPage";

/** Remplit la modale de saisie et valide. Les champs sont repérés par leur
 *  libellé, comme l'utilisateur les voit. */
function addBacktest({ symbol, outcome, r, strategy, confluence, mistake, better }: {
  symbol: string; outcome: string; r?: string; strategy?: string;
  confluence?: string; mistake?: string; better?: string;
}) {
  fireEvent.click(screen.getAllByText("Ajouter un backtest")[0]);
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByPlaceholderText("NQ, EURUSD…"), { target: { value: symbol } });
  fireEvent.click(within(dialog).getByRole("button", { name: outcome }));
  if (r !== undefined) fireEvent.change(within(dialog).getByPlaceholderText("2.5"), { target: { value: r } });
  if (strategy) fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: strategy } });
  if (confluence) fireEvent.click(within(dialog).getByRole("checkbox", { name: confluence }));
  if (mistake) fireEvent.click(within(dialog).getByRole("checkbox", { name: mistake }));
  if (better) {
    const area = within(dialog).getByPlaceholderText(/Attendre la clôture/);
    fireEvent.change(area, { target: { value: better } });
  }
  fireEvent.click(within(dialog).getByRole("button", { name: "Ajouter" }));
}

describe("Page Backtest", () => {
  beforeEach(() => cloudStore.clear());

  it("invite à saisir tant que le journal est vide", () => {
    render(<BacktestPage />);
    expect(screen.getByText(/Aucun backtest pour l'instant/)).toBeTruthy();
  });

  it("enregistre les quatre champs d'un backtest et les redonne à lire", () => {
    render(<BacktestPage />);
    addBacktest({
      symbol: "NQ", outcome: "Perdant", r: "-1",
      confluence: "Order block", mistake: "FOMO",
      better: "Attendre le retest",
    });

    expect(screen.getByText("NQ")).toBeTruthy();
    expect(screen.getByText("Perdant")).toBeTruthy();
    expect(screen.getAllByText("Order block").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FOMO").length).toBeGreaterThan(0);
    expect(screen.getByText("Attendre le retest")).toBeTruthy();
  });

  it("classe les confluences par ce qu'elles rapportent", () => {
    render(<BacktestPage />);
    addBacktest({ symbol: "NQ", outcome: "Gagnant", r: "3", confluence: "Order block" });
    addBacktest({ symbol: "ES", outcome: "Perdant", r: "-1", confluence: "Killzone" });

    const ranking = screen.getByRole("table", { name: "Confluences" });
    const rows = within(ranking).getAllByRole("row").slice(1); // l'en-tête d'abord
    expect(within(rows[0]).getByText("Order block")).toBeTruthy();
    expect(within(rows[1]).getByText("Killzone")).toBeTruthy();
  });

  it("compte la réussite sur le résultat déclaré, scratch exclu", () => {
    render(<BacktestPage />);
    addBacktest({ symbol: "NQ", outcome: "Gagnant", r: "0.2" });
    addBacktest({ symbol: "ES", outcome: "BE" });

    // Un gagnant, aucun perdant : 100 %, malgré le scratch et le R minuscule.
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("1G · 0P · 1BE")).toBeTruthy();
  });

  it("signale un R que personne n'a mesuré", () => {
    render(<BacktestPage />);
    addBacktest({ symbol: "NQ", outcome: "Gagnant" });
    expect(screen.getByText(/par défaut/)).toBeTruthy();
    expect(screen.getAllByText("+1R").length).toBeGreaterThan(0);
  });

  it("garde une confluence inventée pour le backtest suivant", () => {
    render(<BacktestPage />);
    fireEvent.click(screen.getAllByText("Ajouter un backtest")[0]);
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getAllByPlaceholderText("Ajouter…")[0], { target: { value: "Wyckoff spring" } });
    fireEvent.keyDown(within(dialog).getAllByPlaceholderText("Ajouter…")[0], { key: "Enter" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ajouter" }));

    fireEvent.click(screen.getAllByText("Ajouter un backtest")[0]);
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: "Wyckoff spring" })).toBeTruthy();
  });

  it("rattache un backtest à une stratégie de la coquille et la montre sur la ligne", () => {
    render(<BacktestPage />);
    addBacktest({ symbol: "NQ", outcome: "Gagnant", r: "2", strategy: "s1" });

    expect(screen.getAllByText("Breakout NY").length).toBeGreaterThan(0);
  });

  it("classe les stratégies entre elles", () => {
    render(<BacktestPage />);
    addBacktest({ symbol: "NQ", outcome: "Perdant", r: "-2", strategy: "s2" });
    addBacktest({ symbol: "ES", outcome: "Gagnant", r: "3", strategy: "s1" });

    const ranking = screen.getByRole("table", { name: "Par stratégie" });
    const rows = within(ranking).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Breakout NY")).toBeTruthy();
    expect(within(rows[1]).getByText("Reversal Londres")).toBeTruthy();
  });

  it("n'affiche pas de classement par stratégie quand aucun backtest n'en porte", () => {
    render(<BacktestPage />);
    addBacktest({ symbol: "NQ", outcome: "Gagnant" });
    expect(screen.queryByRole("table", { name: "Par stratégie" })).toBeNull();
  });

  it("filtre la liste sur les perdants sans toucher au bilan", () => {
    render(<BacktestPage />);
    addBacktest({ symbol: "NQ", outcome: "Gagnant", r: "2" });
    addBacktest({ symbol: "ES", outcome: "Perdant", r: "-1" });

    fireEvent.click(screen.getByRole("button", { name: /Perdants \(1\)/ }));
    expect(screen.queryByText("NQ")).toBeNull();
    expect(screen.getByText("ES")).toBeTruthy();
    // Le bilan porte sur tout le journal, pas sur le filtre : +2R et -1R.
    const cumul = screen.getByText("R cumulé").parentElement as HTMLElement;
    expect(within(cumul).getByText("+1R")).toBeTruthy();
  });
});
