import { describe, it, expect } from "vitest";
import {
  ACCENT_PRESETS, DEFAULT_ACCENT, DEFAULT_ACCENT_2,
  isDefaultAccent, normalizeAccent,
} from "@/lib/ui/accent";

describe("teinte de marque enregistrée sur le compte", () => {
  it("garde un couple valide tel quel", () => {
    const violet = ACCENT_PRESETS.find((p) => p.id === "violet")!;
    expect(normalizeAccent({ primary: violet.primary, secondary: violet.secondary }))
      .toEqual({ primary: violet.primary, secondary: violet.secondary });
  });

  /* Le magasin cloud est un JSON libre : une ligne écrite par une version
     précédente, tronquée ou trafiquée, ne doit pas repeindre l'app en
     `undefined` — ni laisser une valeur arbitraire filer dans le DOM. */
  it("retombe sur la teinte livrée pour tout ce qui n'est pas un hex", () => {
    for (const bancal of [null, undefined, {}, "violet", { primary: "rgb(0,0,0)" }, { primary: 42, secondary: [] }]) {
      expect(normalizeAccent(bancal)).toEqual({ primary: DEFAULT_ACCENT, secondary: DEFAULT_ACCENT_2 });
    }
  });

  it("ne répare qu'une moitié quand l'autre tient", () => {
    expect(normalizeAccent({ primary: "#3B82F6", secondary: "pas une couleur" }))
      .toEqual({ primary: "#3B82F6", secondary: DEFAULT_ACCENT_2 });
  });

  /* Ce que le hook regarde avant de pousser la teinte d'un ancien appareil
     vers le compte : inutile d'écrire une ligne qui ne dit que le défaut. */
  it("reconnaît la teinte livrée quelle que soit la casse", () => {
    expect(isDefaultAccent({ primary: DEFAULT_ACCENT.toLowerCase(), secondary: DEFAULT_ACCENT_2.toUpperCase() })).toBe(true);
    expect(isDefaultAccent({ primary: "#3B82F6", secondary: DEFAULT_ACCENT_2 })).toBe(false);
  });
});
