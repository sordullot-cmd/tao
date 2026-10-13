import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* Le remplaçant RELAIE entre instances comme le vrai hook : sans ça, deux
   composants sur la même clé divergent et le test échoue pour une raison qui
   n'a rien à voir avec ce qu'il vérifie. */
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

const pushUndo = vi.fn();
vi.mock("@/lib/contexts/UndoContext", () => ({ useUndo: () => ({ pushUndo }) }));
vi.mock("@/lib/auth/supabaseAuthProvider", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/hooks/useTradeScreenshots", () => ({ useTradeScreenshots: () => ({ urls: {} }) }));

import StrategyPlaybook from "@/components/strategy/StrategyPlaybook";

const STRATEGY = { id: 7, name: "iFVG NY", color: "#58CC02" };
/* Les trades AFFECTÉS à la stratégie, tels que le détail les lui passe. */
const TRADES = [
  { id: 101, symbol: "NQ", date: "2026-10-01", direction: "long", pnl: 450 },
  { id: 102, symbol: "ES", date: "2026-10-02", direction: "short", pnl: -120 },
  { id: 103, symbol: "NQ", date: "2026-10-03", direction: "long", pnl: 80 },
];
const setups = () => (cloudStore.get("tao_playbook") as { setups: { strategyId: string | null; name: string }[] }).setups;

describe("Playbook de la stratégie", () => {
  beforeEach(() => { cloudStore.clear(); pushUndo.mockClear(); });

  it("crée une fiche rattachée à la stratégie, sans bloc de captures", () => {
    render(<StrategyPlaybook strategy={STRATEGY} />);
    fireEvent.click(screen.getByText("Créer le playbook"));

    for (const title of ["Plan de trade", "Erreurs fréquentes", "Exemples",
      "Entrée", "Stop loss", "Take profit", "Invalidation"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    // Les captures vivent sur les exemples gagnants et perdants, plus dans un bloc à part.
    expect(screen.queryByText("Captures")).toBeNull();
    // L'id numérique d'une stratégie est rangé en chaîne, comme le normalise le modèle.
    expect(setups()[0].strategyId).toBe("7");
  });

  it("enregistre le plan sur place", () => {
    render(<StrategyPlaybook strategy={STRATEGY} />);
    fireEvent.click(screen.getByText("Créer le playbook"));
    fireEvent.change(screen.getByRole("textbox", { name: "Invalidation" }), { target: { value: "Clôture sous le FVG" } });
    expect((setups()[0] as unknown as { invalidation: string }).invalidation).toBe("Clôture sous le FVG");
  });

  it("tire les exemples des trades de la stratégie, gagnants et perdants rangés par leur P&L", () => {
    render(<StrategyPlaybook strategy={STRATEGY} trades={TRADES} />);
    fireEvent.click(screen.getByText("Créer le playbook"));
    fireEvent.click(screen.getByText("Choisir des trades"));

    const dialog = screen.getByRole("dialog");
    // Du plus récent au plus ancien : 103, 102, 101.
    const boxes = within(dialog).getAllByRole("checkbox");
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Ajouter 2 trades" }));

    expect(screen.getByText(/1 G · 1 P/)).toBeTruthy();
    const examples = (cloudStore.get("tao_playbook") as { setups: { examples: { tradeId: string; outcome: string }[] }[] }).setups[0].examples;
    expect(examples.map(e => [e.tradeId, e.outcome]).sort()).toEqual([["101", "win"], ["102", "loss"]]);

    // Un trade déjà pris en exemple ne se propose plus.
    fireEvent.click(screen.getByText("Choisir des trades"));
    expect(within(screen.getByRole("dialog")).getAllByRole("checkbox")).toHaveLength(1);
  });

  it("garde l'exemple sans trade en second choix", () => {
    render(<StrategyPlaybook strategy={STRATEGY} />);
    fireEvent.click(screen.getByText("Créer le playbook"));
    // Sans trade affecté, il n'y a rien à choisir.
    expect(screen.getByRole("button", { name: /Choisir des trades/ }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByText("Exemple sans trade"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("NQ, EURUSD…"), { target: { value: "NQ" } });
    fireEvent.change(within(dialog).getByPlaceholderText("2.5"), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ajouter" }));

    expect(screen.getByText("+3R")).toBeTruthy();
    expect(screen.getByText(/1 G · 0 P/)).toBeTruthy();
  });

  it("ne montre que la fiche de SA stratégie, et propose de reprendre une fiche orpheline", () => {
    cloudStore.set("tao_playbook", { setups: [
      { id: "a", name: "Autre", strategyId: "99", entry: "Ailleurs" },
      { id: "b", name: "Ancienne fiche", strategyId: null },
    ] });
    render(<StrategyPlaybook strategy={STRATEGY} />);
    expect(screen.queryByDisplayValue("Ailleurs")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Reprendre une fiche existante" }), { target: { value: "b" } });
    expect(screen.getByText("Plan de trade")).toBeTruthy();
    expect(setups().find(s => s.name === "Ancienne fiche")?.strategyId).toBe("7");
  });

  it("supprime la fiche en laissant l'annulation possible", () => {
    render(<StrategyPlaybook strategy={STRATEGY} />);
    fireEvent.click(screen.getByText("Créer le playbook"));
    fireEvent.click(screen.getByText("Supprimer"));
    expect(screen.getByText("Créer le playbook")).toBeTruthy();
    expect(pushUndo).toHaveBeenCalledTimes(1);
  });
});
