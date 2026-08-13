import { describe, expect, it } from "vitest";

import { bankLogo, bankMatchKey, localBankLogo } from "@/lib/bank/bankLogos";

describe("bankLogos", () => {
  it("reconnaît les variantes de nom d'un même établissement", () => {
    expect(localBankLogo("Boursorama")).toBe("/banque/boursorama.jpg");
    expect(localBankLogo("BoursoBank")).toBe("/banque/boursorama.jpg");
    // Enable Banking nomme les caisses régionales une par une.
    expect(localBankLogo("Crédit Agricole Alpes Provence")).toBe("/banque/credit-agricole.jpg");
    expect(localBankLogo("credit  agricole")).toBe("/banque/credit-agricole.jpg");
    expect(localBankLogo("Revolut Bank UAB")).toBe("/banque/revolut.webp");
  });

  it("ne devine rien pour une banque absente de la table", () => {
    expect(localBankLogo("Banque Populaire")).toBeNull();
    expect(localBankLogo("")).toBeNull();
    expect(localBankLogo(null)).toBeNull();
  });

  it("fait passer le logo livré devant celui de l'agrégateur", () => {
    expect(bankLogo("Boursorama", "https://exemple.test/bourso.png")).toBe("/banque/boursorama.jpg");
  });

  it("retombe sur l'agrégateur, puis sur null", () => {
    expect(bankLogo("Banque Populaire", "https://exemple.test/bp.png")).toBe("https://exemple.test/bp.png");
    expect(bankLogo("Banque Populaire")).toBeNull();
    expect(bankLogo(null, null)).toBeNull();
  });

  it("normalise casse, accents et espaces", () => {
    expect(bankMatchKey("  Crédit   AGRICOLE ")).toBe("credit agricole");
  });
});
