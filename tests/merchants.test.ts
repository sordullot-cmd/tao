/**
 * Reconnaissance du marchand d'une opération.
 *
 * Les libellés ci-dessous sont de vraies formes de banques françaises. Le point
 * sensible n'est pas de trouver « AMAZON » dans une chaîne, c'est de NE PAS
 * décorer une ligne d'un logo faux : intermédiaires de paiement qui masquent le
 * vrai commerçant, homonymes sur les virements entre particuliers.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BankTransaction } from "@/lib/bank/transactions";
import {
  allMerchants, findMerchant, findTransferBank, inkOn, merchantInitials,
  merchantSearchKey,
} from "@/lib/bank/merchants";

const tx = (over: Partial<BankTransaction> = {}): BankTransaction => ({
  id: "t1",
  date: "2026-08-14",
  label: "",
  detail: null,
  amount: -12.9,
  currency: "EUR",
  kind: "card",
  pending: false,
  ...over,
});

describe("marchand d'une opération par carte", () => {
  it("reconnaît l'enseigne sous le bruit du libellé", () => {
    expect(findMerchant(tx({ label: "CARTE 12/08 CARREFOUR CITY 4979" }))?.name).toBe("Carrefour");
    expect(findMerchant(tx({ label: "ACHAT CB AMAZON EU SARL" }))?.name).toBe("Amazon");
    expect(findMerchant(tx({ label: "PAIEMENT CB 1208 MCDONALDS PARIS" }))?.name).toBe("McDonald's");
  });

  it("lit aussi le complément, quand le libellé principal ne dit rien", () => {
    expect(findMerchant(tx({ label: "PRLV SEPA", detail: "NETFLIX INTERNATIONAL B.V." }))?.name)
      .toBe("Netflix");
  });

  it("préfère l'enseigne la plus précise", () => {
    // « uber eats » contient « uber » : l'ordre de la table doit trancher.
    expect(findMerchant(tx({ label: "UBER EATS AMSTERDAM" }))?.name).toBe("Uber Eats");
    expect(findMerchant(tx({ label: "UBER BV HELP.UBER.COM" }))?.name).toBe("Uber");
  });

  it("normalise accents et ponctuation collée", () => {
    expect(merchantSearchKey("AMAZON*MKTP FR")).toBe("amazon mktp fr");
    expect(findMerchant(tx({ label: "INTERMARCHÉ SUPER" }))?.name).toBe("Intermarché");
  });
});

/* La table couvre au-delà des grandes marques : prélèvements d'administrations,
   salles de sport, assurances, colis — ce qui remplit vraiment un relevé. */
describe("couverture élargie", () => {
  const cas: [string, BankTransaction["kind"], string][] = [
    ["PRLV SEPA URSSAF IDF", "direct_debit", "Urssaf"],
    ["DGFIP IMPOT REVENU MENSUEL", "direct_debit", "Impôts"],
    ["PRLV CAF ALLOCATIONS", "direct_debit", "Caf"],
    ["PRELEVEMENT MAIF ASSURANCE AUTO", "direct_debit", "MAIF"],
    ["CARTE 03/09 BASIC FIT LILLE", "card", "Basic-Fit"],
    ["CARTE 12/08 BOULANGER LEZENNES", "card", "Boulanger"],
    ["CARTE LEROY MERLIN RONCQ", "card", "Leroy Merlin"],
    ["ACHAT CB VINTED FR", "card", "Vinted"],
    ["CARTE MONDIAL RELAY", "card", "Mondial Relay"],
    ["PRLV SEPA BASIC FIT FRANCE", "direct_debit", "Basic-Fit"],
    ["CARTE 01/09 H&M FRANCE", "card", "H&M"],
    ["CARTE DOMINO'S PIZZA", "card", "Domino's Pizza"],
    ["PRLV SEPA SWILE", "direct_debit", "Swile"],
    ["CARTE BACK MARKET", "card", "Back Market"],
    // Prop firms : l'évaluation payée par carte, la dépense la plus parlante ici.
    ["CARTE 05/09 APEX TRADER FUNDING", "card", "Apex Trader Funding"],
    ["ACHAT CB APEXTRADERFUNDING.COM", "card", "Apex Trader Funding"],
    ["CARTE TRADEIFY LLC", "card", "Tradeify"],
  ];
  it.each(cas)("%s → %s", (label, kind, attendu) => {
    expect(findMerchant(tx({ label, kind }))?.name).toBe(attendu);
  });

  /* « FREE NOW » contient « free » : sans l'ordre de la table, le VTC porterait
     le logo de l'opérateur télécom. C'était le seul masquage de la table. */
  it("distingue FREE NOW de Free", () => {
    expect(findMerchant(tx({ label: "CARTE FREE NOW PARIS" }))?.name).toBe("FREE NOW");
    expect(findMerchant(tx({ label: "PRLV SEPA FREE HAUT DEBIT", kind: "direct_debit" }))?.name)
      .toBe("Free");
  });
});

/* Le piège le plus coûteux : l'intermédiaire de paiement s'écrit DEVANT le
   commerçant, et gagnerait tous les matchs si on ne le retirait pas. */
describe("intermédiaires de paiement", () => {
  it("rend le commerçant, pas le moyen de paiement", () => {
    expect(findMerchant(tx({ label: "APPLE PAY CARREFOUR MARKET" }))?.name).toBe("Carrefour");
    expect(findMerchant(tx({ label: "PAYPAL *SPOTIFY" }))?.name).toBe("Spotify");
    expect(findMerchant(tx({ label: "GOOGLE PAY DECATHLON" }))?.name).toBe("Decathlon");
  });

  it("retombe sur l'intermédiaire quand le bénéficiaire est inconnu", () => {
    expect(findMerchant(tx({ label: "PAYPAL *2749KJH" }))?.name).toBe("PayPal");
  });

  it("laisse Apple gagner quand c'est vraiment Apple", () => {
    expect(findMerchant(tx({ label: "APPLE.COM/BILL ITUNES" }))?.name).toBe("Apple");
  });
});

/* Un logo faux se lit comme une information vérifiée : mieux vaut aucun logo. */
describe("prudence", () => {
  it("ne cherche pas de marchand sur un virement entre particuliers", () => {
    expect(findMerchant(tx({ kind: "transfer", label: "VIR RECU DE CAMILLE ORANGE" }))).toBeNull();
    expect(findMerchant(tx({ kind: "transfer", label: "VIREMENT M TOTAL" }))).toBeNull();
  });

  /* Beaucoup de banques ne qualifient pas leurs opérations : `kind` vaut alors
     `other`, alors que le libellé porte le nom du commerçant. Exclure ces lignes
     revenait à n'afficher aucun logo chez ces banques — et ce sont souvent
     celles qui renseignent le mieux la contrepartie. */
  it("reconnaît un DÉBIT non qualifié, mais jamais un crédit", () => {
    expect(findMerchant(tx({ kind: "other", amount: -42, label: "CARREFOUR CITY 4979" }))?.name)
      .toBe("Carrefour");
    // Un crédit peut venir d'une personne : on n'y cherche pas d'enseigne.
    expect(findMerchant(tx({ kind: "other", amount: 800, label: "CARREFOUR BANQUE REMB" })))
      .toBeNull();
  });

  it("ne cherche pas sur un retrait ni sur des frais", () => {
    expect(findMerchant(tx({ kind: "withdrawal", label: "RETRAIT DAB CARREFOUR" }))).toBeNull();
    expect(findMerchant(tx({ kind: "fee", label: "COTISATION CARTE" }))).toBeNull();
  });

  it("rend null sur une enseigne inconnue — la ligne garde son icône de nature", () => {
    expect(findMerchant(tx({ label: "CARTE 12/08 BOULANGERIE DU COIN" }))).toBeNull();
  });

  it("reste stable quand la même opération est classée deux fois", () => {
    // Les motifs des intermédiaires sont globaux et partagés : un `test()` sur
    // une regex `/g/` avancerait son `lastIndex` et la 2ᵉ passe changerait de
    // réponse. Ce test échouerait alors, et c'est bien son rôle.
    const t = tx({ label: "PAYPAL *SPOTIFY" });
    expect(findMerchant(t)?.slug).toBe("spotify");
    expect(findMerchant(t)?.slug).toBe("spotify");
    expect(findMerchant(t)?.slug).toBe("spotify");
  });
});

/**
 * La banque d'où vient un virement.
 *
 * C'est la MÊME table, réduite à ses établissements — et cette réduction est
 * toute la garde : elle autorise à chercher là où `findMerchant` refuse, parce
 * qu'un nom de banque dans un libellé de virement ne désigne presque jamais
 * quelqu'un, là où un nom d'enseigne y désigne souvent un homonyme.
 */
describe("banque d'un virement", () => {
  const vir = (label: string, amount = 800) =>
    findTransferBank(tx({ kind: "transfer", amount, label }));

  it("reconnaît l'établissement en face, dans les deux sens", () => {
    expect(vir("VIR SEPA RECU DE REVOLUT LTD")?.slug).toBe("revolut");
    expect(vir("VIR INST BOURSORAMA BANQUE")?.slug).toBe("boursorama");
    expect(vir("VIR SEPA RECU DE CREDIT AGRICOLE ALPES PROVENCE")?.slug).toBe("credit-agricole");
    // Un virement ÉMIS porte le nom de la banque d'arrivée : même lecture.
    expect(vir("VIREMENT VERS N26 BANK", -250)?.slug).toBe("n26");
  });

  it("réutilise les logos déjà livrés pour les comptes", () => {
    expect(vir("VIR RECU REVOLUT")?.logo).toBe("/banque/revolut.webp");
  });

  /* Beaucoup de banques ne codent pas leurs opérations : le libellé se réduit au
     nom de la contrepartie, sans le « VIR » qui l'aurait fait classer. Ce sont
     précisément les relevés où la contrepartie est la mieux renseignée. */
  it("cherche aussi sur un CRÉDIT que la banque n'a pas qualifié", () => {
    expect(findTransferBank(tx({ kind: "other", amount: 500, label: "QONTO" }))?.slug).toBe("qonto");
    // Au débit, c'est un achat : `findMerchant` s'en charge, pas celle-ci.
    expect(findTransferBank(tx({ kind: "other", amount: -30, label: "QONTO" }))).toBeNull();
  });

  it("ne cherche AUCUNE enseigne — seuls les établissements comptent", () => {
    expect(vir("VIR RECU DE CAMILLE ORANGE")).toBeNull();
    expect(vir("VIREMENT M TOTAL")).toBeNull();
    expect(vir("VIR SEPA RECU DE CARREFOUR CITY")).toBeNull();
  });

  it("écarte le prénom homonyme d'une marque", () => {
    expect(vir("VIR RECU DE LYDIA MARTIN")).toBeNull();
    expect(vir("VIR SEPA LYDIA")?.slug).toBe("lydia");
  });

  it("compte l'intermédiaire comme origine, mais pas le moyen de paiement", () => {
    expect(vir("VIR SEPA STRIPE PAYOUT")?.slug).toBe("stripe");
    expect(vir("VIR PAYPAL EUROPE")?.slug).toBe("paypal");
    // Apple Pay est un moyen de paiement : l'argent ne vient pas de chez Apple.
    expect(vir("APPLE PAY MARTIN", 20)).toBeNull();
  });

  it("ne cherche rien sur un retrait, des frais ou une carte", () => {
    expect(findTransferBank(tx({ kind: "withdrawal", label: "RETRAIT DAB LCL" }))).toBeNull();
    expect(findTransferBank(tx({ kind: "fee", label: "FRAIS VIR BNP" }))).toBeNull();
    expect(findTransferBank(tx({ kind: "card", label: "CARTE REVOLUT" }))).toBeNull();
  });

  it("rend null sur une banque inconnue — la ligne garde son icône de nature", () => {
    expect(vir("VIR SEPA RECU DE BANQUE DE MON VILLAGE")).toBeNull();
  });
});

describe("vignette", () => {
  it("choisit une encre lisible sur la couleur de marque", () => {
    expect(inkOn("#1D1D1F")).toBe("#FFFFFF");   // Apple, presque noir
    expect(inkOn("#FF9900")).toBe("#000000");   // Amazon, orange clair
    expect(inkOn("#E50914")).toBe("#FFFFFF");   // Netflix, rouge saturé
    expect(inkOn("#06C167")).toBe("#000000");   // Uber Eats, vert vif
  });

  /* Le garde-fou de la table : elle grandira, et une marque jaune pâle ajoutée
     un jour ne doit pas passer avec un monogramme illisible. */
  it("toutes les couleurs de la table tiennent 4,5:1 avec leur encre", () => {
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
      return (hi + 0.05) / (lo + 0.05);
    };
    const faibles = allMerchants()
      .map((m) => ({ name: m.name, r: ratio(m.color, inkOn(m.color)) }))
      .filter((x) => x.r < 4.5);
    expect(faibles).toEqual([]);
  });

  it("prend deux initiales, une seule marque comprise", () => {
    expect(merchantInitials("Uber Eats")).toBe("UE");
    expect(merchantInitials("Netflix")).toBe("NE");
    expect(merchantInitials("Booking.com")).toBe("BC");
  });

  it("sert les logos déjà livrés pour les banques", () => {
    expect(findMerchant(tx({ kind: "direct_debit", label: "PRLV SEPA REVOLUT" }))?.logo)
      .toBe("/banque/revolut.webp");
  });

  /* Une entrée MASQUÉE ne se voit jamais : un motif placé plus haut attrape déjà
     son libellé, et elle reste morte dans la table. Le test le plus simple pour
     la débusquer est de chercher chaque marchand par son PROPRE nom — s'il ne se
     retrouve pas lui-même, quelqu'un d'autre l'a pris.

     Les entrées ci-dessous sont exclues à dessein : leur motif est plus ÉTROIT
     que leur nom, parce que le nom seul est un mot trop courant pour servir de
     critère (« Avis », « Paul », « Action », « BUT »…). Les chercher par leur nom
     échouerait sans que rien ne soit cassé. */
  const ÉTROITES = [
    "but", "action", "avis", "paul", "nicolas", "jules", "nickel", "casino",
    "indigo", "station", "autoroute", "hbo-max", "intermarche-carburant",
  ];

  it("chaque entrée de la table est atteignable par son propre nom", () => {
    const masquées = allMerchants()
      .filter((m) => !ÉTROITES.includes(m.slug))
      .map((m) => ({ attendu: m.slug, trouvé: findMerchant(tx({ label: m.name }))?.slug ?? null }))
      .filter((r) => r.trouvé !== r.attendu);
    expect(masquées).toEqual([]);
  });

  /* Un `logo` qui pointe à côté ne casse rien de visible — l'image manque, la
     vignette reste vide, et personne ne s'en aperçoit avant longtemps. Ce test
     est le seul endroit où un renommage de fichier se fait remarquer. */
  it("chaque logo déclaré existe bien dans public/", () => {
    const manquants = allMerchants()
      .filter((m) => m.logo)
      .map((m) => m.logo as string)
      .filter((src) => !existsSync(join(process.cwd(), "public", src)));
    expect(manquants).toEqual([]);
  });
});
