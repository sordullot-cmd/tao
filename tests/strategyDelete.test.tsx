import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";

/* La carte d'une stratégie navigue vers son détail, et porte en même temps ses
   deux boutons d'action dans un coin de 28 px. Le clic « supprimer » partait
   ouvrir les statistiques au lieu de la confirmation dès qu'il manquait le
   bouton d'un pixel : ce qui est vérifié ici, c'est l'ORIGINE du clic, pas
   seulement le bouton lui-même. */

const STRATEGIES = [
  { id: "s1", name: "Breakout", description: "", color: "blue", groups: [] },
];

vi.mock("@/lib/hooks/useUserData", () => ({
  useStrategies: () => ({
    strategies: STRATEGIES,
    addStrategy: vi.fn(),
    updateStrategy: vi.fn(),
    deleteStrategy: vi.fn(async () => {}),
  }),
}));
vi.mock("@/lib/hooks/useTradeData", () => ({ useTrades: () => ({ trades: [] }) }));
vi.mock("@/lib/contexts/UndoContext", () => ({ useUndo: () => ({ pushUndo: vi.fn() }) }));

import StrategyPage from "@/components/StrategyPage";

function mount() {
  const setPage = vi.fn();
  const { container } = render(
    <StrategyPage setPage={setPage} setSelectedStrategyId={vi.fn()} />,
  );
  const actions = container.querySelector("[data-card-actions]") as HTMLElement;
  return { setPage, actions, container };
}

describe("suppression d'une stratégie", () => {
  it("ouvre la confirmation au lieu du détail", () => {
    const { setPage, actions } = mount();
    fireEvent.click(actions.querySelectorAll("button")[1]);
    expect(setPage).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("ne part pas dans le détail quand le clic manque le bouton", () => {
    const { setPage, actions } = mount();
    // Le vide entre les deux boutons : la cible ratée d'un pixel.
    fireEvent.click(actions);
    expect(setPage).not.toHaveBeenCalled();
  });

  /* jsdom ne calcule aucune mise en page : la superposition qui volait le clic
     ne s'y reproduit pas. Ce qui se vérifie, c'est la règle qui la neutralise —
     rien du contenu de la carte ne capte le pointeur. */
  it("laisse les boutons seuls capter le pointeur", () => {
    const { container } = mount();
    const card = container.querySelector("[data-card]") as HTMLElement;
    const blocs = [...card.children].filter(c => !(c as HTMLElement).dataset.cardActions);
    expect(blocs.length).toBe(3);
    for (const b of blocs) expect((b as HTMLElement).style.pointerEvents).toBe("none");
  });

  /* Le cas rapporté : une couche s'intercale au-dessus du coin des boutons,
     le clic remonte à la carte. Il doit quand même supprimer. */
  it("supprime même quand le clic est intercepté au-dessus du bouton", () => {
    const { setPage, actions, container } = mount();
    const corbeille = actions.querySelectorAll("button")[1];
    corbeille.getBoundingClientRect = () =>
      ({ left: 100, right: 128, top: 20, bottom: 48, width: 28, height: 28 }) as DOMRect;
    fireEvent.click(container.querySelector("[data-card]") as HTMLElement, { clientX: 104, clientY: 24 });
    expect(setPage).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("laisse la carte elle-même mener au détail", () => {
    const { setPage, container } = mount();
    fireEvent.click(container.querySelector("[data-card]") as HTMLElement);
    expect(setPage).toHaveBeenCalledWith("strategy-detail");
  });
});
