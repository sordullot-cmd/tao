import { describe, it, expect } from "vitest";
import { payerOf } from "@/lib/bank/payer";
import { incomeBySource } from "@/lib/bank/cashflow";

/* Ce que ce module décide, et que rien d'autre ne tient :
     — ce qui, dans un libellé de virement, est un NOM et ce qui est du
       protocole (code d'opération, civilité, référence de mandat) ;
     — le refus de nommer quand il n'y a pas de nom : une source inventée se lit
       exactement comme une source vraie, c'est le seul vrai risque ici ;
     — et, chez `incomeBySource`, le fait que deux payeurs différents fassent
       deux sources même quand ils versent la même chose. */

const tx = (label: string, amount = 1000, detail: string | null = null) => ({
  label, detail, kind: "transfer", amount,
});

describe("Qui paie", () => {
  it("lit le nom qui suit le mot d'annonce", () => {
    expect(payerOf(tx("VIR SEPA RECU DE UNOWHY SAS"))).toBe("Unowhy");
    expect(payerOf(tx("VIREMENT DE M MARTIN JEAN"))).toBe("Martin Jean");
    expect(payerOf(tx("VIR INST DE MME DUPONT CLAIRE"))).toBe("Dupont Claire");
  });

  it("coupe avant la référence du mandat et le motif", () => {
    expect(payerOf(tx("VIR SEPA RECU DE UNOWHY MOTIF SALAIRE AOUT"))).toBe("Unowhy");
    expect(payerOf(tx("VIR RECU DE ACME REF 4409211 XZ"))).toBe("Acme");
  });

  it("garde les sigles en capitales et recapitalise le reste", () => {
    expect(payerOf(tx("VIR CAF DES YVELINES"))).toBe("CAF Yvelines");
    expect(payerOf(tx("VIREMENT CPAM DE PARIS"))).toBe("CPAM Paris");
  });

  it("jette les formules de banque et les adjectifs autour du nom", () => {
    // « EN VOTRE FAVEUR » et « FAMILIALES » nommeraient sinon la source à la
    // place de la caisse, puisqu'ils arrivent avant elle ou juste après.
    expect(payerOf(tx("VIREMENT EN VOTRE FAVEUR CPAM DES YVELINES"))).toBe("CPAM Yvelines");
    expect(payerOf(tx("VIR SEPA RECU CAF DE PARIS ALLOCATIONS FAMILIALES"))).toBe("CAF Paris");
    expect(payerOf(tx("VIREMENT POLE EMPLOI ALLOCATION MENSUELLE"))).toBe("Pole Emploi");
  });

  it("ne nomme rien quand il n'y a pas de nom", () => {
    // Que du protocole, un numéro, ou la seule NATURE de l'entrée — laquelle est
    // déjà le sous-poste, et la répéter comme nom de source n'apprend rien.
    expect(payerOf(tx("VIR SEPA 4409211"))).toBeNull();
    expect(payerOf(tx("VIR SEPA SALAIRE JUILLET"))).toBeNull();
    expect(payerOf(tx("VIREMENT RECU"))).toBeNull();
    expect(payerOf(tx("REMBOURSEMENT"))).toBeNull();
    expect(payerOf(tx(""))).toBeNull();
  });

  it("lit aussi le complément, quand le libellé se tait", () => {
    expect(payerOf(tx("VIR SEPA RECU", 1000, "DE LA PART DE ACME CORP"))).toBe("Acme Corp");
  });

  it("borne le nom : trois mots, et pas plus long qu'une pastille", () => {
    expect(payerOf(tx("VIR DE ASSOCIATION NATIONALE DES AMIS DU PATRIMOINE")))
      .toBe("Nationale Amis Patrimoine");

    const long = payerOf(tx("VIR DE ENTREPRISE GENERALE CONSTRUCTION BATIMENT"));
    expect(long!.length).toBeLessThanOrEqual(26);
    expect(long!.endsWith("…")).toBe(true);
  });
});

describe("Sources nommées dans le flux", () => {
  it("sépare deux payeurs d'une même nature, et somme le même payeur", () => {
    const { slices } = incomeBySource([
      tx("VIR SEPA RECU DE UNOWHY SALAIRE", 1800),
      tx("VIR SEPA RECU DE UNOWHY PRIME", 200),
      tx("VIR SEPA RECU DE ACME SALAIRE", 900),
    ]);

    expect(slices.map((s) => s.source)).toEqual(["Unowhy", "Acme"]);
    expect(slices.map((s) => s.sub)).toEqual(["income.salary", "income.salary"]);
    expect(slices[0]).toMatchObject({ amount: 2000, count: 2 });
    // Deux sources du même sous-poste ne peuvent pas porter la même teinte :
    // côte à côte dans le diagramme, elles se liraient comme une seule branche.
    expect(slices[0].color).not.toBe(slices[1].color);
  });

  it("retombe sur le sous-poste quand le relevé ne nomme personne", () => {
    const { slices } = incomeBySource([tx("VIR SEPA SALAIRE JUILLET", 1800)]);

    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ id: "income.salary", sub: "income.salary", source: null });
  });
});
