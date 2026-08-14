/**
 * Couverture du classement sur un relevé RÉALISTE.
 *
 * Les tests unitaires vérifient qu'une règle donnée attrape ce qu'elle vise ;
 * ils ne disent rien de la question qui compte à l'usage — « combien de lignes
 * restent sans poste ? ». C'est pourtant elle qui décide si le graphique
 * apprend quelque chose : un anneau où « Autres » pèse la moitié ne se lit pas.
 *
 * Ce fichier tient donc un échantillon de libellés tels que les banques
 * françaises les écrivent — avec leurs préfixes, leurs dates collées et leurs
 * numéros de carte — et attend le SOUS-POSTE exact de chacun. Le poste s'en
 * déduit, donc une régression sur l'un ou l'autre niveau est vue ici.
 */

import { describe, it, expect } from "vitest";
import {
  parentOfSub,
  subcategorizeTransaction,
  type SpendingSubcategory,
} from "@/lib/bank/categories";

/** [libellé, nature, sous-poste attendu] — « other » quand c'est la bonne
 *  réponse : un libellé qui n'identifie rien ne doit pas être deviné. */
const SAMPLE: [label: string, kind: string, expected: SpendingSubcategory][] = [
  ["CARTE 12/08 CARREFOUR MARKET 4979", "card", "food.groceries"],
  ["CARTE 03/08 LIDL 8821 FR", "card", "food.groceries"],
  ["ACHAT CB INTERMARCHE2201", "card", "food.groceries"],
  ["CARTE 09/08 BOULANGERIE MARTIN", "card", "food.market"],
  ["CARTE 04/08 BOUCHERIE DU MARCHE", "card", "food.market"],
  ["CARTE 06/08 BIOCOOP RENNES", "card", "food.organic"],
  ["CARTE 11/08 DELIVEROO FRANCE", "card", "food.delivery"],
  ["CARTE 07/08 UBER EATS", "card", "food.delivery"],
  ["CARTE 05/08 MC DONALDS 0921", "card", "food.fastfood"],
  ["CARTE 02/08 LE BISTROT DU COIN", "card", "food.cafe"],
  ["CARTE 14/08 STARBUCKS OPERA", "card", "food.cafe"],
  ["CARTE 01/08 RESTAURANT LE SUD", "card", "food.restaurant"],
  ["VIR SEPA LOYER AOUT 2026", "transfer", "housing.rent"],
  ["PRLV SEPA FONCIA SYNDIC", "direct_debit", "housing.charges"],
  ["PRLV SEPA EDF CLIENTS PARTICULIERS", "direct_debit", "utilities.power"],
  ["PRLV SEPA VEOLIA EAU", "direct_debit", "utilities.water"],
  ["PRLV SEPA FREE MOBILE 88213", "direct_debit", "telecom.mobile"],
  ["PRLV SEPA ORANGE SA", "direct_debit", "telecom.mobile"],
  ["PRLV SEPA MACIF ASSURANCES", "direct_debit", "insurance"],
  ["CARTE 08/08 SNCF CONNECT", "card", "transport.train"],
  ["CARTE 06/08 RATP NAVIGO", "card", "transport.transit"],
  ["CARTE 10/08 UBER TRIP HELP.UBER.COM", "card", "transport.ride"],
  ["CARTE 09/08 VELIB METROPOLE", "card", "transport.micro"],
  ["CARTE 04/08 TOTAL RELAIS A6", "card", "fuel.station"],
  ["CARTE 04/08 STATION ESSO EXPRESS", "card", "fuel.station"],
  ["CARTE 05/08 VINCI AUTOROUTES", "card", "fuel.toll"],
  ["CARTE 13/08 NORAUTO 2210", "card", "car.maintenance"],
  ["CARTE 01/08 PARKING INDIGO GARE", "card", "car.parking"],
  ["CARTE 15/07 BOOKING.COM AMSTERDAM", "card", "travel.stay"],
  ["CARTE 20/07 AIR FRANCE INTERNET", "card", "travel.flight"],
  ["CARTE 12/08 AMAZON*MKTP FR", "card", "shopping.marketplace"],
  ["CARTE 09/08 IKEA FRANCE 3391", "card", "shopping.home"],
  ["CARTE 08/08 ZARA FRANCE 2201", "card", "shopping.fashion"],
  ["CARTE 06/08 FNAC PARIS BERCY", "card", "tech.electronics"],
  ["CARTE 03/08 PHARMACIE DE LA GARE", "card", "health.pharmacy"],
  ["CARTE 02/08 DOCTOLIB SAS", "card", "health.doctor"],
  ["CARTE 05/08 CABINET DENTAIRE ROUX", "card", "health.dental"],
  ["CARTE 08/08 COIFFEUR L ATELIER", "card", "beauty.hair"],
  ["CARTE 07/08 CLINIQUE VETERINAIRE DES LILAS", "card", "pets.vet"],
  ["PRLV SEPA BASIC FIT FRANCE", "direct_debit", "sport.gym"],
  ["CARTE 05/08 DECATHLON 1102", "card", "sport.gear"],
  ["CARTE 10/08 UGC CINE CITE LES HALLES", "card", "leisure.cinema"],
  ["PRLV SEPA NETFLIX.COM", "direct_debit", "subscriptions.streaming"],
  ["PRLV SEPA SPOTIFY AB", "direct_debit", "subscriptions.streaming"],
  ["CARTE 01/08 APPLE.COM/BILL ITUNES", "card", "subscriptions.software"],
  ["PRLV SEPA CRECHE LES POUSSINS", "direct_debit", "kids.childcare"],
  ["CARTE 09/08 FTMO S.R.O. PRAHA", "card", "trading.propfirm"],
  ["PRLV SEPA TOPSTEP LLC", "direct_debit", "trading.propfirm"],
  ["CARTE 02/08 TRADINGVIEW INC", "card", "trading.tools"],
  ["PRLV SEPA DGFIP IMPOT REVENU", "direct_debit", "taxes.income"],
  ["PRLV SEPA ECHEANCE PRET IMMOBILIER", "direct_debit", "credit.loan"],
  ["VIR SEPA VERSEMENT LIVRET A", "transfer", "savings.bank"],
  ["RETRAIT DAB 12/08 PARIS 4979", "withdrawal", "cash"],
  ["COTISATION MENSUELLE CARTE BANCAIRE", "fee", "fees"],
  ["VIR SEPA RECU DE M. MARTIN PIERRE", "transfer", "transfer"],
  // Ce qui ne s'identifie pas doit RESTER « Autres » : deviner serait pire.
  ["CARTE 11/08 SARL 3492 8821", "card", "other"],
  ["CARTE 12/08 PAIEMENT 449021", "card", "other"],
];

const classify = (label: string, kind: string) =>
  subcategorizeTransaction({ label, detail: null, kind, amount: -20 });

describe("Couverture du classement sur un relevé réaliste", () => {
  it("classe chaque libellé dans le sous-poste attendu", () => {
    const wrong = SAMPLE.filter(([label, kind, expected]) => classify(label, kind) !== expected).map(
      ([label, kind, expected]) => ({ label, attendu: expected, obtenu: classify(label, kind) }),
    );

    expect(wrong).toEqual([]);
  });

  it("laisse moins d'une ligne sur dix sans poste", () => {
    const unknown = SAMPLE.filter(([label, kind]) => parentOfSub(classify(label, kind)) === "other");
    expect(unknown.length / SAMPLE.length).toBeLessThan(0.1);
  });
});
