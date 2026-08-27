import { describe, it, expect } from "vitest";
import { PLATFORMS, PROP_FIRM_PRESETS, resolvePlatformIcon, platformName } from "@/lib/brokers/platforms";
import { BROKERS, getBroker } from "@/lib/brokers/registry";
import { brandColor } from "@/lib/ui/brandColors";
import { firmBrandId, firmLogo } from "@/lib/accountBrand";
import { subcategorizeTransaction, type CategorizableTransaction } from "@/lib/bank/categories";

/* Ajouter une maison de prop trading demande de la poser à QUATRE endroits :
   le catalogue des plateformes (elle devient un preset de création de firme),
   l'adaptateur d'import, sa couleur d'identité, et la règle bancaire qui range
   son abonnement. En oublier un ne casse rien visiblement — la firme se crée,
   mais sort grise, sans parseur, ou son prélèvement tombe dans « Autres ». */

const NEW_FIRMS = ["traday", "myfundedfutures"] as const;

/** Un prélèvement par carte, la forme sous laquelle arrive un abonnement. */
const debit = (label: string): CategorizableTransaction =>
  ({ label, detail: null, kind: "card", amount: -165 });

describe("Catalogue des prop firms", () => {
  it("propose Traday et MyFundedFutures à la création d'une firme", () => {
    const ids = PROP_FIRM_PRESETS.map(p => p.id);
    for (const id of NEW_FIRMS) expect(ids).toContain(id);
    expect(platformName("traday")).toBe("Traday");
    expect(platformName("myfundedfutures")).toBe("MyFundedFutures");
  });

  it("leur donne un adaptateur d'import CSV", () => {
    for (const id of NEW_FIRMS) {
      const broker = getBroker(id);
      expect(broker).not.toBeNull();
      expect(broker!.meta.features.fileImport).toBe(true);
      expect(typeof broker!.parseFile).toBe("function");
    }
  });

  it("leur donne une teinte propre, reconnue aussi par le nom affiché", () => {
    expect(brandColor("traday")).toBeTruthy();
    expect(brandColor("Traday")).toBe(brandColor("traday"));
    expect(brandColor("MyFundedFutures")).toBe(brandColor("myfundedfutures"));
    expect(brandColor("traday")).not.toBe(brandColor("myfundedfutures"));
  });

  it("reconnaît MyFundedFutures sous son sigle", () => {
    /* « MFFU » est le nom que tout le monde emploie : un compte saisi ainsi
       doit sortir aux couleurs de la maison, pas à celles de son type. */
    expect(brandColor("MFFU")).toBe(brandColor("myfundedfutures"));
    expect(brandColor("mon compte MFFU #2")).toBe(brandColor("myfundedfutures"));
  });

  it("rattache une firme à sa maison, renommée ou pas", () => {
    expect(firmBrandId({ name: "Traday" })).toBe("traday");
    expect(firmBrandId({ name: "MyFundedFutures 50k" })).toBe("myfundedfutures");
    // La marque choisie à la création survit à n'importe quel libellé.
    expect(firmBrandId({ name: "Mes comptes", brand: "traday" })).toBe("traday");
  });

  it("ne leur prête pas le logo d'une autre marque, faute du leur", () => {
    /* Aucun fichier n'est embarqué pour ces deux maisons. Le contrat est de
       rendre `null` — `RoundLogo` pose alors les initiales — et surtout pas le
       logo d'une marque au nom voisin, ce que faisait la recherche approchante
       avant que la correspondance exacte lui coupe la route. */
    for (const id of NEW_FIRMS) {
      expect(resolvePlatformIcon(id)).toBeNull();
      expect(firmLogo({ brand: id })).toBeNull();
    }
    // La garde ne doit pas non plus avoir cassé les maisons qui ont un logo.
    expect(resolvePlatformIcon("topstep")).toBe("/brokers/Topstep_Logo.jpg");
    expect(resolvePlatformIcon("Apex Trader Funding")).toBe("/brokers/apex.avif");
  });

  it("range leurs prélèvements dans les frais de prop firm", () => {
    expect(subcategorizeTransaction(debit("TRADAY LLC"))).toBe("trading.propfirm");
    expect(subcategorizeTransaction(debit("MYFUNDEDFUTURES"))).toBe("trading.propfirm");
    expect(subcategorizeTransaction(debit("MY FUNDED FUTURES"))).toBe("trading.propfirm");
  });

  it("garde TradeDay et Traday distincts", () => {
    /* Deux maisons réelles, à une lettre près. Le motif « trade ?day » ne
       capte pas « traday » — d'où son motif à lui — et l'inverse doit rester
       vrai : chacune se range pour ce qu'elle est. */
    expect(PROP_FIRM_PRESETS.some(p => p.id === "tradeday")).toBe(false);
    expect(firmBrandId({ name: "TradeDay" })).not.toBe("traday");
  });

  it("n'a pas de plateforme sans entrée d'import ni de doublon d'identifiant", () => {
    const ids = PLATFORMS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PROP_FIRM_PRESETS) {
      expect(BROKERS[preset.id as keyof typeof BROKERS], preset.name).toBeTruthy();
    }
  });
});
