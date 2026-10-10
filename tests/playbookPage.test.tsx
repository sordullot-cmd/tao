import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* La fiche et le journal de backtest vivent chacun dans une clé de
   `useCloudState`. Le remplaçant RELAIE entre instances comme le vrai hook :
   sans ça, deux composants sur la même clé divergent et le test échoue pour
   une raison qui n'a rien à voir avec ce qu'il vérifie. */
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
vi.mock("@/lib/auth/supabaseAuthProvider", () => ({ useAuth: () => ({ user: null }) }));
/* Les affectations trade → stratégie viennent de Supabase : on les pose ici. */
vi.mock("@/lib/hooks/useTradeStrategyLinks", () => ({
  useTradeStrategyLinks: () => ({ t1: ["s1"], t2: ["s1"], t3: ["s2"] }),
}));
vi.mock("@/lib/contexts/AppContext", () => ({
  useApp: () => ({
    strategies: [{ id: "s1", name: "iFVG NY", color: "#58CC02" }],
    trades: [
      { id: "t1", pnl: 300 },
      { id: "t2", pnl: -100 },
      { id: "t3", pnl: 999 },
    ],
  }),
}));

import PlaybookPage from "@/components/pages/PlaybookPage";

describe("Page Playbook", () => {
  beforeEach(() => cloudStore.clear());

  it("invite à créer un premier setup tant que le playbook est vide", () => {
    render(<PlaybookPage />);
    expect(screen.getByText("Ton playbook est vide")).toBeTruthy();
  });

  it("crée une fiche avec toutes les sections demandées", () => {
    render(<PlaybookPage />);
    fireEvent.click(screen.getByText("Créer mon premier setup"));

    for (const title of ["Captures", "Contexte", "Setup", "Entrée", "Stop loss", "Take profit",
      "Invalidation", "Erreurs fréquentes", "Statistiques"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText("Exemples gagnants (0)")).toBeTruthy();
    expect(screen.getByText("Exemples perdants (0)")).toBeTruthy();
    expect(screen.getByText("0/11")).toBeTruthy();
  });

  it("enregistre la saisie sur place et la retrouve depuis la liste", () => {
    render(<PlaybookPage />);
    fireEvent.click(screen.getByText("Créer mon premier setup"));

    fireEvent.change(screen.getByLabelText("Nom du setup"), { target: { value: "iFVG 5 min" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Invalidation" }), { target: { value: "Clôture sous le FVG" } });
    fireEvent.click(screen.getByText("Playbook"));

    expect(screen.getByText("iFVG 5 min")).toBeTruthy();
    expect(screen.getByText("1/11")).toBeTruthy();
  });

  it("ajoute un exemple gagnant et en tire les statistiques", () => {
    render(<PlaybookPage />);
    fireEvent.click(screen.getByText("Créer mon premier setup"));

    fireEvent.click(screen.getByRole("button", { name: "Ajouter — Exemples gagnants" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("NQ, EURUSD…"), { target: { value: "NQ" } });
    fireEvent.change(within(dialog).getByPlaceholderText("2.5"), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ajouter" }));

    expect(screen.getByText("Exemples gagnants (1)")).toBeTruthy();
    // Le R apparaît sur l'exemple et dans les KPI (moyen et total).
    expect(screen.getAllByText("+3R").length).toBeGreaterThanOrEqual(2);
  });

  it("reprend les trades réels de la stratégie liée, et eux seuls", () => {
    render(<PlaybookPage />);
    fireEvent.click(screen.getByText("Créer mon premier setup"));
    expect(screen.getAllByText(/Lie une stratégie/).length).toBe(2);

    fireEvent.change(screen.getByRole("combobox", { name: "Stratégie liée" }), { target: { value: "s1" } });

    // t1 (+300) et t2 (−100) — t3 appartient à une autre stratégie.
    expect(screen.getByText("Trades")).toBeTruthy();
    expect(screen.getByText("1 G · 1 P")).toBeTruthy();
    expect(screen.getByText(/\+.?200/)).toBeTruthy();
  });

  it("filtre la liste par statut", () => {
    cloudStore.set("tao_playbook", { setups: [
      { id: "a", name: "Actif A", status: "active" },
      { id: "b", name: "Archivé B", status: "retired" },
    ] });
    render(<PlaybookPage />);
    fireEvent.click(screen.getByText("Archivé (1)"));
    expect(screen.queryByText("Actif A")).toBeNull();
    expect(screen.getByText("Archivé B")).toBeTruthy();
  });
});
