import { describe, it, expect, beforeEach } from "vitest";
import {
  DARK_PAGES,
  THEME_KEY,
  applyThemeForPage,
  effectiveTheme,
  readThemeMode,
  setThemeMode,
  themeForPage,
} from "@/lib/ui/sectionTheme";
import { SECTION_OF_PAGE } from "@/lib/activity/sections";

/**
 * Le fond suit la partie de l'app. Ce qui se casse sans garde-fou n'est pas la
 * règle elle-même — elle tient en trois lignes — mais ses BORDS : une page
 * ajoutée à la navigation sans partie, un réglage fixe que la navigation
 * reprendrait, et la liste sérialisée dans le script de pré-hydratation qui
 * s'éloignerait de la table qu'elle est censée refléter.
 */

beforeEach(() => {
  localStorage.removeItem(THEME_KEY);
  delete document.documentElement.dataset.theme;
});

describe("thème par section", () => {
  it("met le trading en sombre, la vie perso et la finance en clair", () => {
    expect(themeForPage("dashboard")).toBe("dark");
    expect(themeForPage("trades")).toBe("dark");
    expect(themeForPage("journal")).toBe("dark");
    expect(themeForPage("agenda")).toBe("light");
    expect(themeForPage("sport")).toBe("light");
    expect(themeForPage("patrimoine")).toBe("light");
    expect(themeForPage("budget")).toBe("light");
  });

  it("ne dit rien d'une page qui n'appartient à aucune partie", () => {
    // Les réglages sont ceux de l'app entière : y entrer depuis le trading ne
    // doit pas blanchir l'écran pour le rendre sombre en sortant.
    expect(themeForPage("settings")).toBeNull();
    expect(themeForPage("")).toBeNull();
    expect(themeForPage("page-qui-n-existe-pas")).toBeNull();
  });

  it("garde le fond courant sur une page sans partie", () => {
    applyThemeForPage("trades");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyThemeForPage("settings");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("bascule le fond en changeant de partie", () => {
    applyThemeForPage("dashboard");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyThemeForPage("cashflow");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("laisse la main à un thème choisi, que la navigation ne reprend pas", () => {
    setThemeMode("light", "dashboard");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyThemeForPage("trades");
    expect(document.documentElement.dataset.theme).toBe("light");

    setThemeMode("section", "trades");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("rend l'attribut au système quand on choisit « Système »", () => {
    setThemeMode("dark", "dashboard");
    setThemeMode("system", "dashboard");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("retient la bascule par section faute de réglage enregistré", () => {
    expect(readThemeMode()).toBe("section");
    localStorage.setItem(THEME_KEY, "n'importe quoi");
    expect(readThemeMode()).toBe("section");
  });

  it("lit le fond réellement porté, et non le mode enregistré", () => {
    // L'inverseur de la barre latérale propose le CONTRAIRE de ce qu'on voit :
    // en mode « Par section », le mode enregistré ne le lui dirait pas.
    applyThemeForPage("dashboard");
    expect(effectiveTheme()).toBe("dark");
    applyThemeForPage("budget");
    expect(effectiveTheme()).toBe("light");
  });

  it("sérialise exactement les pages sombres pour la pré-hydratation", () => {
    // Le script de app/layout.tsx peint avant React : une liste qui s'écarte de
    // la table ferait clignoter la page au chargement.
    const attendu = Object.keys(SECTION_OF_PAGE)
      .filter(p => themeForPage(p) === "dark")
      .sort();
    expect(DARK_PAGES).toEqual(attendu);
    expect(DARK_PAGES).toContain("dashboard");
    expect(DARK_PAGES).not.toContain("agenda");
  });
});
