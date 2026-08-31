/**
 * Modale firme — le champ « plateforme d'exécution » ne mélange plus les deux
 * familles.
 *
 * Une prop firm n'exécute rien : elle donne accès à une plateforme. Le champ
 * proposait « Apex » comme plateforme, c'est-à-dire un choix dont aucun parseur
 * ne pouvait sortir. Ce que ce fichier verrouille : la liste ne contient que
 * des plateformes, et choisir une maison la réduit à celles qu'elle propose.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* La modale écrit en base : seul `createFirm` est simulé, le reste du module
   reste réel (ACCOUNT_SIZES, readFirmHeroMode…) — il est partagé avec les
   autres modales du même fichier. */
const createFirm = vi.fn().mockResolvedValue({ id: "f1", name: "Apex Trader Funding" });
vi.mock("@/lib/propFirms", async () => {
  const actual = await vi.importActual<typeof import("@/lib/propFirms")>("@/lib/propFirms");
  return { ...actual, createFirm };
});

const { PropFirmModal } = await import("@/components/modals/AccountModals");

const renderModal = () =>
  render(<PropFirmModal userId="u1" onClose={() => {}} onSaved={() => {}} />);

/** Ouvre le seul menu déroulant de la modale : celui de la plateforme. */
const openPlatformMenu = () => {
  const trigger = document.querySelector('[aria-haspopup="listbox"]') as HTMLElement;
  fireEvent.click(trigger);
  return screen.getAllByRole("option").map((o) => o.textContent?.trim() || "");
};

const closeMenu = () => fireEvent.keyDown(document.body, { key: "Escape" });

describe("champ plateforme de la modale firme", () => {
  beforeEach(() => createFirm.mockClear());

  it("ne propose aucune prop firm comme plateforme", () => {
    renderModal();
    const options = openPlatformMenu();
    expect(options).toContain("Tradovate");
    expect(options).toContain("WealthCharts");
    for (const firm of ["Apex Trader Funding", "Topstep", "FTMO", "TradeDay"]) {
      expect(options, firm).not.toContain(firm);
    }
  });

  it("classe les plateformes par ordre alphabétique", () => {
    renderModal();
    /* La première entrée est « aucune plateforme » : c'est le choix vide, il
       reste en tête quoi qu'il arrive. */
    const [empty, ...platforms] = openPlatformMenu();
    expect(empty).toBeTruthy();
    expect(platforms).toEqual([...platforms].sort((a, b) => a.localeCompare(b, "fr")));
  });

  it("réduit la liste aux plateformes de la maison choisie", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Apex Trader Funding/ }));

    const options = openPlatformMenu();
    // Apex donne accès à Tradovate et WealthCharts, pas à MetaTrader.
    expect(options).toContain("Tradovate");
    expect(options).toContain("WealthCharts");
    expect(options).not.toContain("MetaTrader 5");
    expect(options).not.toContain("DeepChart");
  });

  it("restreint aussi une maison seulement TAPÉE, sans clic sur son preset", () => {
    /* Le cas de la vraie vie : on écrit « Alpha Futures 50k » dans le nom sans
       passer par les pastilles. Le reste de l'app rattache déjà cette firme
       (logo, couleur) — la liste des plateformes doit suivre le même
       rattachement, sinon elle propose Tradovate à une firme qui ne le sert
       pas. */
    renderModal();
    const nameField = document.querySelector("input[type=\"text\"]") as HTMLInputElement;
    fireEvent.change(nameField, { target: { value: "Alpha Futures 50k" } });

    const options = openPlatformMenu();
    expect(options).toContain("AlphaTrader");
    expect(options).toContain("DeepChart");
    expect(options).toContain("Quantower");
    expect(options).not.toContain("Tradovate");
    expect(options).not.toContain("MetaTrader 5");
  });

  it("préremplit la plateforme principale de la maison, pas Tradovate en dur", () => {
    renderModal();
    /* FTMO passe par MetaTrader : c'est le cas que le « tradovate » en dur de
       l'ancienne version se trompait à peupler. */
    fireEvent.click(screen.getByRole("button", { name: /FTMO/ }));
    const trigger = document.querySelector('[aria-haspopup="listbox"]') as HTMLElement;
    expect(trigger.textContent).toContain("MetaTrader 5");

    const options = openPlatformMenu();
    expect(options).toContain("MetaTrader 4");
    expect(options).not.toContain("Tradovate");
  });

  it("efface une plateforme que la nouvelle maison ne propose pas", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /FTMO/ }));
    closeMenu();
    // Changer de maison : MetaTrader n'a plus cours chez Alpha Futures.
    fireEvent.click(screen.getByRole("button", { name: /Alpha Futures/ }));
    const trigger = document.querySelector('[aria-haspopup="listbox"]') as HTMLElement;
    expect(trigger.textContent).toContain("AlphaTrader");
  });
});
