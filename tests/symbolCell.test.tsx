import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { SymbolCell, symbolLabel, baseSymbol } from "@/components/ui/da";

/* La cellule empilait « Nasdaq » sur « MNQ ». Le nom de l'indice n'est pas ce
   qu'on cherche dans une liste de trades, et il occupait la grande ligne. */
describe("symbolLabel — ce qui s'affiche en tête", () => {
  it("rend le symbole, jamais le nom de l'indice", () => {
    expect(symbolLabel("MNQ")).toEqual({ name: "MNQ", code: null });
  });

  it("coupe l'échéance d'un contrat, mais la retient à part", () => {
    // « MNQU6 » se lit « MNQ » ; l'échéance reste disponible pour le filtre,
    // seul endroit où deux contrats de même racine doivent se distinguer.
    expect(symbolLabel("MNQU6")).toEqual({ name: "MNQ", code: "MNQU6" });
    expect(baseSymbol("CM.MNQM6")).toBe("MNQ");
  });

  it("garde la lecture d'une paire de devises", () => {
    expect(symbolLabel("EURUSD")).toEqual({ name: "EUR/USD", code: null });
  });

  it("n'invente rien pour un symbole inconnu", () => {
    expect(symbolLabel("AAPL")).toEqual({ name: "AAPL", code: null });
  });
});

describe("SymbolCell", () => {
  it("n'affiche que le symbole, sur une seule ligne", () => {
    render(<SymbolCell symbol="MNQU6" />);
    expect(screen.getByText("MNQ")).toBeTruthy();
    expect(screen.queryByText("Nasdaq")).toBeNull();
    expect(screen.queryByText("MNQU6")).toBeNull();
  });
});
