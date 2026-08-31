import { describe, it, expect } from "vitest";
import { brandColor, accountBrandColor, firmBrandColor, assignSeriesColors, BRAND_COLORS } from "@/lib/ui/brandColors";
import { PLATFORMS } from "@/lib/brokers/platforms";

describe("brandColors", () => {
  it("reconnaît une marque par son id, son nom et une saisie libre", () => {
    expect(brandColor("topstep")).toBe("#44E0F5");
    expect(brandColor("Alpha Futures")).toBe("#1B5DFC");
    expect(brandColor("mon compte FTMO n°2")).toBe("#0781FE");
    expect(brandColor("courtier inconnu")).toBeNull();
  });

  /* « metatrader 5 » contient « mt5 »… mais pas littéralement : le piège est
     l'inverse, que « metatrader 4 » soit capté par la clé « mt4 ». On vérifie
     que les deux restent distincts, puisqu'ils partagent le même logo. */
  it("distingue MetaTrader 4 et MetaTrader 5", () => {
    expect(brandColor("MetaTrader 5")).toBe("#2C91C6");
    expect(brandColor("MetaTrader 4")).toBe("#DED139");
    expect(brandColor("mt4")).not.toBe(brandColor("mt5"));
  });

  /* La prop firm gagne toujours : rattachée, nommée dans le compte, ou même
     saisie comme broker. La plateforme d'exécution ne doit jamais l'évincer. */
  it("fait toujours passer la prop firm avant la plateforme", () => {
    const firm = { name: "Topstep", platform: "tradovate" };
    expect(accountBrandColor({ broker: "Tradovate", account_type: "funded" }, firm)).toBe("#44E0F5");
    expect(accountBrandColor({ name: "Lucid 50k", broker: "Tradovate" }, null)).toBe("#00D98B");
    expect(accountBrandColor({ name: "Compte 3", broker: "Apex Trader Funding" }, null)).toBe("#0026FF");
  });

  it("n'utilise la plateforme que pour les comptes sans firme", () => {
    expect(accountBrandColor({ name: "Compte perso", broker: "Tradovate" }, null)).toBe("#267FFF");
  });

  /* Le cas qui posait problème : une firme nommée librement (« ATF », un
     surnom) n'était rattachable à aucune marque et héritait de la couleur de
     sa plateforme — toutes les firmes sur Tradovate sortaient donc en azur. */
  it("donne sa propre teinte à une firme hors catalogue", () => {
    const firm = { id: "f-42", name: "ATF", platform: "tradovate" };
    const color = accountBrandColor({ name: "Compte 1", broker: "Tradovate" }, firm);
    expect(color).not.toBe("#267FFF");                  // pas la plateforme
    expect(color).toBe(firmBrandColor(firm));           // la teinte de la firme
    // Stable : c'est l'id qui la détermine, renommer n'y change rien.
    expect(firmBrandColor({ id: "f-42", name: "Autre nom" })).toBe(color);
    // Deux firmes distinctes ne partagent pas forcément la même.
    expect(firmBrandColor({ id: "f-43", name: "XYZ" })).not.toBe(color);
  });

  it("garde la marque du catalogue même quand la firme porte un autre nom", () => {
    // Le preset choisi à la création (platform) suffit à identifier la maison.
    expect(firmBrandColor({ id: "f-1", name: "Ma Topstep", platform: "topstep" })).toBe("#44E0F5");
  });

  it("retombe sur la couleur de type quand la maison est inconnue", () => {
    const color = accountBrandColor({ broker: "Broker maison", name: "Compte" }, null);
    expect(color).toBeTruthy();
    expect(Object.values(BRAND_COLORS).some((p) => p.primary === color)).toBe(false);
  });

  it("décline la palette entre comptes d'une même maison", () => {
    const firm = { name: "Topstep" };
    const colors = assignSeriesColors([
      { id: "a", account: {}, firm },
      { id: "b", account: {}, firm },
      { id: "c", account: {}, firm },
      { id: "d", account: {}, firm },
    ]);
    const list = [...colors.values()];
    expect(list[0]).toBe("#44E0F5");
    expect(new Set(list).size).toBe(4); // aucune couleur en double
  });

  /* Sur la page d'une prop firm, la courbe agrégée porte déjà la couleur
     principale : les comptes doivent démarrer aux secondaires. */
  it("réserve la principale quand skipPrimary est demandé", () => {
    const firm = { name: "Topstep" };
    const colors = assignSeriesColors(
      [{ id: "a", firm }, { id: "b", firm }, { id: "c", firm }],
      { skipPrimary: true }
    );
    expect([...colors.values()]).not.toContain("#44E0F5");
    expect(colors.get("a")).toBe("#CF8432");
    expect(colors.get("b")).toBe("#0FB5CE");
    expect(new Set(colors.values()).size).toBe(3);
  });

  it("ne réutilise aucune teinte principale entre deux marques", () => {
    const primaries = Object.values(BRAND_COLORS).map((p) => p.primary);
    expect(new Set(primaries).size).toBe(primaries.length);
  });

  /* Le catalogue couvre toutes les plateformes proposées à la création d'un
     compte : une marque oubliée renverrait le compte à sa couleur de type. */
  it("couvre toutes les plateformes du catalogue de l'app", () => {
    const orphans = PLATFORMS.filter((p) => !brandColor(p.id) && !brandColor(p.name));
    expect(orphans.map((p) => p.name)).toEqual([]);
  });

  it("reconnaît chaque plateforme par son nom affiché", () => {
    expect(brandColor("Rithmic R|Trader")).toBe("#63A703");
    expect(brandColor("NinjaTrader")).toBe("#FF4200");
    expect(brandColor("MetaTrader 5")).toBe("#2C91C6");
    expect(brandColor("WealthCharts")).toBe("#5DC6E0");
    /* Les quatre plateformes des prop firms futures, teintes relevées sur leurs
       logos — c'est ce qui colore leur pastille quand l'image ne charge pas. */
    expect(brandColor("AlphaTrader")).toBe("#07513A");
    expect(brandColor("DeepChart")).toBe("#3800A4");
    expect(brandColor("Quantower")).toBe("#00566C");
    expect(brandColor("TradeSea")).toBe("#0057B0");
  });
});
