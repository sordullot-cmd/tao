import { describe, it, expect } from "vitest";
import { deepen, luminance, mixHex, shade, tint } from "@/lib/ui/color";
import { SPENDING_CATEGORIES } from "@/lib/bank/categories";

/* Ce que ce module décide, et que rien d'autre ne tient :
     — le mélange lui-même, y compris son refus poli des entrées qu'il ne
       comprend pas ;
     — et surtout `deepen`, qui garantit qu'un glyphe BLANC se lit sur n'importe
       quelle teinte de la palette des postes. C'est une promesse de contraste :
       elle doit tenir pour les vingt-huit couleurs, pas pour celles qu'on a
       regardées. */

/** Contraste d'un blanc pur sur un fond, au sens WCAG. */
const contrastOnWhiteInk = (bg: string) => 1.05 / (luminance(bg) + 0.05);

describe("Mélange de couleurs", () => {
  it("mélange en sRGB, aux deux bouts comme au milieu", () => {
    expect(mixHex("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mixHex("#000000", "#FFFFFF", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(tint("#2C72C3", 0.5)).toBe("#96b9e1");
    expect(shade("#2C72C3", 0.5)).toBe("#163962");
  });

  it("rend l'entrée telle quelle quand ce n'est pas de l'hexadécimal", () => {
    // Un `var(--…)` vaut mieux qu'un noir de repli, qui passerait pour un choix.
    expect(mixHex("var(--color-text)", "#FFFFFF", 0.5)).toBe("var(--color-text)");
    expect(luminance("var(--color-text)")).toBe(0);
  });
});

describe("Fond qui porte un glyphe blanc", () => {
  it("laisse intactes les couleurs déjà sombres", () => {
    // Bordeaux, brun, vert profond : ils portent le blanc sans qu'on y touche.
    for (const c of ["#8C3A56", "#96590E", "#147D64", "#2C72C3"]) {
      expect(deepen(c)).toBe(c);
    }
  });

  it("assombrit les claires jusqu'au seuil, et pas plus", () => {
    const clair = "#63BCD1"; // cyan clair : 1,9:1 en blanc, illisible
    expect(contrastOnWhiteInk(clair)).toBeLessThan(3);
    const fonce = deepen(clair);
    expect(fonce).not.toBe(clair);
    expect(contrastOnWhiteInk(fonce)).toBeGreaterThanOrEqual(3);
    /* Assombrie, pas éteinte : une passe de plus la ferait virer au noir et la
       colonne d'icônes perdrait ses teintes. */
    expect(luminance(fonce)).toBeGreaterThan(0.12);
  });

  it("tient pour TOUTE la palette des postes", () => {
    for (const c of SPENDING_CATEGORIES) {
      expect(contrastOnWhiteInk(deepen(c.color))).toBeGreaterThanOrEqual(3);
    }
  });

  /* La vignette d'un poste (`components/ui/CategoryIcon`) est l'inverse : un
     disque quasi blanc et le glyphe à pleine couleur. C'est ce sens-là qui doit
     tenir 4,5:1, un trait de 2 px n'ayant pas l'épaisseur d'un aplat. Les deux
     constantes du composant sont reprises ici : elles ne valent que par cette
     mesure, et les changer sans la refaire casserait huit postes en silence. */
  it("laisse le glyphe lisible sur le disque presque blanc de la vignette", () => {
    const DISC_TINT = 0.88;
    const GLYPH_MAX_LUM = 0.13;

    for (const c of SPENDING_CATEGORIES) {
      const disc = tint(c.color, DISC_TINT);
      const glyphe = deepen(c.color, GLYPH_MAX_LUM);
      const ratio = (luminance(disc) + 0.05) / (luminance(glyphe) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
