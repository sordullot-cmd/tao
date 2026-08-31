import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import {
  EXECUTION_PLATFORMS,
  PLATFORMS,
  PROP_FIRM_PRESETS,
  platformName,
  platformsForFirm,
  resolveExecutionPlatform,
  resolvePlatformIcon,
} from "@/lib/brokers/platforms";
import { BROKERS, getBroker } from "@/lib/brokers/registry";
import { brandColor } from "@/lib/ui/brandColors";
import { firmBrandId, firmLogo } from "@/lib/accountBrand";
import { findMerchant } from "@/lib/bank/merchants";
import { subcategorizeTransaction, type CategorizableTransaction } from "@/lib/bank/categories";

/* Ajouter une maison de prop trading demande de la poser à CINQ endroits : le
   catalogue des plateformes (elle devient un preset de création de firme),
   l'adaptateur d'import, sa couleur d'identité, la règle bancaire qui range son
   abonnement, et la vignette de relevé. En oublier un ne casse rien de
   visible — la firme se crée, mais sort grise, sans parseur, ou son
   prélèvement tombe dans « Autres ». */

const NEW_FIRMS = ["tradeday", "myfundedfutures"] as const;

/** Un prélèvement par carte, la forme sous laquelle arrive un abonnement. */
const debit = (label: string): CategorizableTransaction =>
  ({ label, detail: null, kind: "card", amount: -165 });

describe("Catalogue des prop firms", () => {
  it("propose TradeDay et MyFundedFutures à la création d'une firme", () => {
    const ids = PROP_FIRM_PRESETS.map(p => p.id);
    for (const id of NEW_FIRMS) expect(ids).toContain(id);
    expect(platformName("tradeday")).toBe("TradeDay");
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
    expect(brandColor("tradeday")).toBe("#48C3C8");
    expect(brandColor("TradeDay")).toBe("#48C3C8");
    expect(brandColor("myfundedfutures")).toBe("#D8AE5E");
    expect(brandColor("MyFundedFutures")).toBe("#D8AE5E");
  });

  it("reconnaît les graphies courantes des deux maisons", () => {
    /* « Trade Day » en deux mots et « MFFU » : c'est sous ces formes-là qu'un
       compte se saisit à la main, et il doit sortir aux couleurs de sa maison
       plutôt qu'à celles de son type. */
    expect(brandColor("Trade Day")).toBe("#48C3C8");
    expect(brandColor("MFFU")).toBe("#D8AE5E");
    expect(brandColor("mon compte MFFU #2")).toBe("#D8AE5E");
  });

  it("rattache une firme à sa maison, renommée ou pas", () => {
    expect(firmBrandId({ name: "TradeDay" })).toBe("tradeday");
    expect(firmBrandId({ name: "MyFundedFutures 50k" })).toBe("myfundedfutures");
    // La marque choisie à la création survit à n'importe quel libellé.
    expect(firmBrandId({ name: "Mes comptes", brand: "tradeday" })).toBe("tradeday");
  });

  it("rattache aussi une firme saisie sous sa graphie courante", () => {
    /* Une firme créée à la main, sans passer par le preset : c'est son NOM qui
       doit la rattacher, et il s'écrit comme les gens l'écrivent. */
    expect(firmBrandId({ name: "Trade Day" })).toBe("tradeday");
    expect(firmBrandId({ name: "Trade Day 50k #2" })).toBe("tradeday");
    expect(firmBrandId({ name: "MFFU" })).toBe("myfundedfutures");
    expect(firmLogo({ name: "Trade Day" })).toBe("/brokers/tradeday_logo.jpeg");
    expect(resolvePlatformIcon("MFFU")).toBe("/brokers/myfundedfuture.svg");
  });

  it("porte leur logo, et le fichier est bien livré", () => {
    expect(resolvePlatformIcon("tradeday")).toBe("/brokers/tradeday_logo.jpeg");
    expect(firmLogo({ brand: "myfundedfutures" })).toBe("/brokers/myfundedfuture.svg");
    /* Un chemin qui ne mène à rien affiche une image cassée — pire que les
       initiales. On vérifie donc les fichiers eux-mêmes, pour TOUT le
       catalogue : c'est l'erreur qu'un renommage de fichier laisse passer. */
    for (const p of PLATFORMS) {
      if (!p.iconPath) continue;
      const file = "public" + decodeURIComponent(p.iconPath);
      expect(existsSync(file), `${p.name} → ${file}`).toBe(true);
    }
  });

  it("range leurs prélèvements dans les frais de prop firm", () => {
    expect(subcategorizeTransaction(debit("TRADEDAY"))).toBe("trading.propfirm");
    expect(subcategorizeTransaction(debit("TRADE DAY LLC"))).toBe("trading.propfirm");
    expect(subcategorizeTransaction(debit("MYFUNDEDFUTURES"))).toBe("trading.propfirm");
    expect(subcategorizeTransaction(debit("MY FUNDED FUTURES"))).toBe("trading.propfirm");
  });

  it("décore la ligne de relevé de la vignette de la marque", () => {
    expect(findMerchant(debit("CARTE 12/08 TRADEDAY"))?.name).toBe("TradeDay");
    expect(findMerchant(debit("CARTE 12/08 MYFUNDEDFUTURES"))?.name).toBe("MyFundedFutures");
  });

  it("n'a pas de plateforme sans entrée d'import ni de doublon d'identifiant", () => {
    const ids = PLATFORMS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PROP_FIRM_PRESETS) {
      expect(BROKERS[preset.id as keyof typeof BROKERS], preset.name).toBeTruthy();
    }
  });
});

/* La séparation est le contrat de ce catalogue : une maison de prop trading
   n'exécute pas d'ordres, elle donne accès à une plateforme. Confondre les deux
   remettait « Apex » dans un champ « plateforme » — un choix sans sens, et un
   import sans parseur nommable. */
describe("Séparation prop firms / plateformes", () => {
  it("ne propose aucune prop firm comme plateforme d'exécution", () => {
    const firmIds = new Set(PROP_FIRM_PRESETS.map(p => p.id));
    for (const p of EXECUTION_PLATFORMS) {
      expect(p.kind, p.name).toBe("platform");
      expect(firmIds.has(p.id), p.name).toBe(false);
    }
    expect(EXECUTION_PLATFORMS.map(p => p.id)).not.toContain("apex");
  });

  it("ne garde aucun des courtiers ni des plateformes retirés du produit", () => {
    const ids = PLATFORMS.map(p => p.id);
    const gone = [
      "thinkorswim", "ibkr", "capitalcom", "ig", "webull",   // courtiers actions / CFD
      "projectx", "depthchart", "ctrader", "dxtrade",        // plateformes écartées
    ];
    for (const id of gone) expect(ids, id).not.toContain(id);
  });

  it("classe les deux listes par ordre alphabétique", () => {
    /* C'est l'ordre des deux sélecteurs des modales : on sait d'avance où
       regarder, quel que soit l'ordre de déclaration du catalogue. */
    const sorted = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b, "fr"));
    expect(EXECUTION_PLATFORMS.map(p => p.name)).toEqual(sorted(EXECUTION_PLATFORMS.map(p => p.name)));
    expect(PROP_FIRM_PRESETS.map(p => p.name)).toEqual(sorted(PROP_FIRM_PRESETS.map(p => p.name)));
  });

  it("n'ouvre à une firme que les plateformes qu'elle propose", () => {
    expect(platformsForFirm("apex").map(p => p.id).sort()).toEqual(
      ["ninjatrader", "rithmic", "tradingview", "tradovate", "wealthcharts"]
    );
    expect(platformsForFirm("lucid").map(p => p.id).sort()).toEqual(
      ["ninjatrader", "rithmic", "tradesea", "tradovate"]
    );
    /* Alpha Futures tourne sur AlphaTrader, Quantower, DeepChart et
       WealthCharts : ni Tradovate ni MetaTrader n'ont à y figurer. */
    expect(platformsForFirm("alphafutures").map(p => p.id).sort()).toEqual(
      ["alphatrader", "deepchart", "quantower", "wealthcharts"]
    );
    expect(platformsForFirm("alphafutures").map(p => p.id)).not.toContain("tradovate");
    // FTMO passe par MetaTrader, et par rien d'autre.
    expect(platformsForFirm("ftmo").map(p => p.id).sort()).toEqual(["mt4", "mt5"]);
    // Une maison hors catalogue (créée à la main) ne restreint rien.
    expect(platformsForFirm("").length).toBe(EXECUTION_PLATFORMS.length);
    expect(platformsForFirm("une firme à moi").length).toBe(EXECUTION_PLATFORMS.length);
  });

  it("déclare chaque plateforme de firme dans le catalogue d'exécution", () => {
    const known = new Set(EXECUTION_PLATFORMS.map(p => p.id));
    for (const firm of PROP_FIRM_PRESETS) {
      expect(firm.platformIds?.length, firm.name).toBeGreaterThan(0);
      for (const id of firm.platformIds || []) {
        expect(known.has(id), `${firm.name} → ${id}`).toBe(true);
      }
    }
  });

  it("rend la plateforme d'un compte enregistré au nom de sa firme", () => {
    /* Les comptes d'avant la séparation portent parfois « Apex Trader
       Funding » dans `broker` : l'import doit repartir de Tradovate, pas du
       parseur générique. */
    expect(resolveExecutionPlatform("Apex Trader Funding")?.id).toBe("tradovate");
    expect(resolveExecutionPlatform("Apex 50k #2")?.id).toBe("tradovate");
    expect(resolveExecutionPlatform("FTMO")?.id).toBe("mt5");
    expect(resolveExecutionPlatform("Alpha Futures")?.id).toBe("alphatrader");
    // Une plateforme se rend elle-même, sous son nom comme sous son id.
    expect(resolveExecutionPlatform("WealthCharts")?.id).toBe("wealthcharts");
    expect(resolveExecutionPlatform("mt5")?.id).toBe("mt5");
    expect(resolveExecutionPlatform("")).toBeNull();
  });

  it("donne un parseur de repli aux plateformes que rien ne détecte", () => {
    /* AlphaTrader, Quantower et DeepChart exportent les colonnes de Tradovate
       sans porter ce nom : sans `hint`, leur import retombait sur le parseur
       générique. */
    expect(platformName("deepchart")).toBe("DeepChart");
    for (const id of ["alphatrader", "quantower", "deepchart", "tradesea"]) {
      expect(PLATFORMS.find(p => p.id === id)?.hint, id).toBe("tradovate");
    }
  });
});
