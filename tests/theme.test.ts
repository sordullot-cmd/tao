import { describe, it, expect, beforeEach } from "vitest";
import { THEME_KEY, applyTheme, effectiveTheme, readThemeMode, setThemeMode } from "@/lib/ui/theme";

/**
 * Un seul fond pour toute l'app. Ce qui se casse sans garde-fou, ce sont les
 * réglages hérités de la bascule par section, qui ne doivent plus rien imposer.
 */

beforeEach(() => {
  localStorage.removeItem(THEME_KEY);
  delete document.documentElement.dataset.theme;
});

describe("thème", () => {
  it("lit l'ancien réglage « par section » comme le système", () => {
    localStorage.setItem(THEME_KEY, "section");
    expect(readThemeMode()).toBe("system");
    applyTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("retombe sur le système faute de réglage valable", () => {
    expect(readThemeMode()).toBe("system");
    localStorage.setItem(THEME_KEY, "n'importe quoi");
    expect(readThemeMode()).toBe("system");
  });

  it("fige le thème choisi", () => {
    setThemeMode("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(effectiveTheme()).toBe("dark");
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    setThemeMode("light");
    expect(effectiveTheme()).toBe("light");
  });

  it("rend l'attribut au système quand on choisit « Système »", () => {
    setThemeMode("dark");
    setThemeMode("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
