/**
 * Reconnaissance du marchand d'une opération, et son logo.
 *
 * Enable Banking ne rend AUCUN logo de marchand : l'API transaction est de
 * l'ISO 20022 — contrepartie, montant, codes de nature. Les logos qu'il publie
 * sont ceux des établissements bancaires, et ils servent déjà aux comptes
 * (cf. `bankLogos.ts`). Un logo par ligne de relevé se construit donc ici, à
 * partir du seul élément dont on dispose : le libellé.
 *
 * Même parti pris que `bankLogos.ts` — une table LOCALE, servie depuis
 * `public/marchands/`. Rien n'est demandé à un tiers : envoyer la liste des
 * marchands d'un relevé bancaire à une API de logos, c'est faire sortir de
 * l'app une donnée qui dit où quelqu'un mange, se soigne et voyage. Le prix de
 * ce choix est une couverture manuelle, et il est assumé : les enseignes
 * inconnues gardent l'icône de nature, qui reste juste.
 *
 * Deux entrées, parce qu'une ligne de relevé n'a pas la même contrepartie selon
 * sa nature : `findMerchant` cherche l'ENSEIGNE d'un achat, `findTransferBank`
 * la BANQUE d'où vient un virement. La seconde ne consulte que les entrées
 * marquées `bank` — c'est ce qui lui permet de travailler sur des libellés où
 * `findMerchant` refuse de chercher, parce qu'ils portent des noms de personnes.
 *
 * Ajouter un marchand : déposer l'image dans `public/marchands/` (carrée, le
 * disque de `RoundLogo` la détoure en `cover`), ajouter une ligne dans
 * `MERCHANTS` avec son `logo`. Sans fichier, la pastille prend la couleur de la
 * marque et les initiales du nom : reconnaissable dans une liste, et déjà mieux
 * qu'une icône grise identique sur quinze lignes.
 *
 * 268 des 271 entrées portent leur image. Les trois exceptions sont les entrées
 * GÉNÉRIQUES, qui n'ont pas de logo par nature : « Station-service »,
 * « Autoroutes » et « Pharmacie » couvrent chacune des dizaines d'enseignes.
 *
 * Deux garde-fous vivent dans `tests/merchants.test.ts`, et ils ont chacun
 * attrapé un vrai défaut quand la table est passée de 71 à 268 entrées :
 *   — chaque entrée doit être ATTEIGNABLE par son propre nom. Un motif placé
 *     plus haut peut la masquer définitivement (« FREE NOW » tombait dans
 *     « Free »), et rien ne le signale à l'écran ;
 *   — chaque `logo` doit pointer sur un fichier existant. Une image manquante ne
 *     casse rien de visible : la vignette reste vide.
 *
 * Piège à connaître pour écrire un motif : `NOISE` retire les nombres isolés du
 * libellé (« CARTE 12/08 … 4979 »). Un motif qui contient un chiffre séparé ne
 * matchera donc jamais — « Century 21 » et « Optic 2000 » sont cherchés sur leur
 * seul mot.
 */

import type { BankTransaction } from "@/lib/bank/transactions";

export interface Merchant {
  slug: string;
  /** Nom canonique — c'est LUI qui s'affiche, pas « CARTE 12/08 AMAZON EU SARL ». */
  name: string;
  /** Couleur de la marque, pour la pastille tant qu'il n'y a pas d'image. */
  color: string;
  /** Fichier livré avec l'application, quand on l'a. */
  logo?: string;
  /**
   * Établissement bancaire ou service de paiement.
   *
   * Ces entrées-là, et elles seules, sont cherchées sur un VIREMENT
   * (cf. `findTransferBank`). La garde de `findMerchant` écarte les virements
   * parce qu'ils portent des noms de PERSONNES, et qu'un homonyme d'enseigne y
   * est fréquent (« Virement de Camille Orange »). Un nom de BANQUE sur un
   * virement, lui, ne désigne presque jamais quelqu'un : il dit d'où l'argent
   * arrive, ce que rien d'autre sur la ligne ne dit.
   */
  bank?: true;
}

/**
 * Clé de recherche : le libellé débarrassé de ce qui n'identifie personne.
 *
 * On ne cherche pas à extraire proprement le nom du marchand — inutile, puisque
 * les motifs de la table sont cherchés DANS la chaîne. Le nettoyage ne vise que
 * les faux positifs : accents, ponctuation collée (« AMAZON*MKTP »), et les
 * numéros que les banques intercalent.
 */
export const merchantSearchKey = (s: string): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Intermédiaires de paiement : ils s'écrivent DEVANT le vrai marchand
 * (« APPLE PAY CARREFOUR », « PAYPAL *SPOTIFY »). Les laisser dans la chaîne
 * ferait gagner Apple contre Carrefour à tous les coups — le logo serait celui
 * du moyen de paiement, pas celui du commerçant. On les retire donc avant la
 * recherche, et le premier retiré sert de repli si rien d'autre n'est reconnu :
 * un paiement PayPal dont le bénéficiaire est inconnu reste un paiement PayPal.
 */
const INTERMEDIARIES: Array<{ match: RegExp; slug: string }> = [
  { match: /\bapple pay\b/g, slug: "apple" },
  { match: /\bgoogle pay\b/g, slug: "google" },
  { match: /\bpaypal\b/g, slug: "paypal" },
  { match: /\b(sumup|zettle|stripe)\b/g, slug: "stripe" },
];

/* Bruit que les banques françaises posent en tête ou en queue de libellé. Retiré
   pour la même raison : « CARTE 12/08 » et « SARL » n'identifient personne, et
   un « CB » isolé pourrait matcher une enseigne à deux lettres. */
const NOISE: RegExp[] = [
  /\b(carte|cb|achat|paiement|paiment|facture|prlv|prelevement|prelvt|sepa|europeen|vir|virement|instantane|recu|emis|de|ref|mandat|rum|dab|retrait|echeance)\b/g,
  /\b(sarl|sasu|sas|snc|eurl|sa|bv|gmbh|ltd|limited|inc|llc|plc|ag|nv|spa|srl)\b/g,
  /\b\d[\d ]*\b/g,                                    // dates, numéros de carte, références
  /\b(fr|eu|es|it|de|nl|be|lu|uk|us|ie|pl)\b/g,       // pays collés en fin de libellé
];

/**
 * Marchands connus.
 *
 * L'ORDRE COMPTE : le premier motif qui matche gagne. Les enseignes dont le nom
 * contient celui d'une autre passent donc devant (« uber eats » avant « uber »,
 * « amazon prime » n'a pas besoin d'entrée séparée puisque « amazon » suffit).
 *
 * Les motifs sont volontairement étroits (`\b…\b`) : un virement reçu d'une
 * personne nommée « Orange » ne doit pas se voir décorer du logo de l'opérateur.
 * `findMerchant` ajoute une garde par nature d'opération, pour la même raison.
 */
const MERCHANTS: Array<{ match: RegExp; merchant: Merchant }> = [
  /* ── Numérique & abonnements ──────────────────────────────────────────── */
  { match: /\bnetflix\b/, merchant: { slug: "netflix", name: "Netflix", color: "#E50914", logo: "/marchands/netflix.png" } },
  { match: /\bspotify\b/, merchant: { slug: "spotify", name: "Spotify", color: "#1DB954", logo: "/marchands/spotify.png" } },
  { match: /\buber ?eats/, merchant: { slug: "uber-eats", name: "Uber Eats", color: "#06C167", logo: "/marchands/uber-eats.png" } },
  { match: /\b(amazon|amzn)\b/, merchant: { slug: "amazon", name: "Amazon", color: "#FF9900", logo: "/marchands/amazon.ico" } },
  { match: /\b(itunes|app store|apple com|apple\b)/, merchant: { slug: "apple", name: "Apple", color: "#1D1D1F", logo: "/marchands/apple.png" } },
  { match: /\bgoogle\b/, merchant: { slug: "google", name: "Google", color: "#4285F4", logo: "/marchands/google.png" } },
  { match: /\bmicrosoft\b/, merchant: { slug: "microsoft", name: "Microsoft", color: "#0067B8", logo: "/marchands/microsoft.ico" } },
  { match: /\bdisney/, merchant: { slug: "disney", name: "Disney+", color: "#113CCF", logo: "/marchands/disney.svg" } },
  { match: /\byoutube\b/, merchant: { slug: "youtube", name: "YouTube", color: "#FF0000", logo: "/marchands/youtube.png" } },
  { match: /\bcanal\b/, merchant: { slug: "canal", name: "Canal+", color: "#1A1A1A", logo: "/marchands/canal.png" } },
  { match: /\bopenai\b/, merchant: { slug: "openai", name: "OpenAI", color: "#0F8B7E", logo: "/marchands/openai.svg" } },
  { match: /\banthropic\b/, merchant: { slug: "anthropic", name: "Anthropic", color: "#C15F3C", logo: "/marchands/anthropic.png" } },
  { match: /\badobe\b/, merchant: { slug: "adobe", name: "Adobe", color: "#DA1F26", logo: "/marchands/adobe.png" } },
  { match: /\bsteam(games)?\b/, merchant: { slug: "steam", name: "Steam", color: "#1B2838", logo: "/marchands/steam.png" } },

  /* ── Télécom ──────────────────────────────────────────────────────────── */
  { match: /\borange\b/, merchant: { slug: "orange", name: "Orange", color: "#F16E00", logo: "/marchands/orange.png" } },
  { match: /\bsfr\b/, merchant: { slug: "sfr", name: "SFR", color: "#C4161C", logo: "/marchands/sfr.png" } },
  // Avant Free : « FREE NOW » contient le mot « free », et l'opérateur gagnerait.
  { match: /\bfree ?now\b/, merchant: { slug: "freenow", name: "FREE NOW", color: "#C8102E", logo: "/marchands/freenow.png" } },
  { match: /\bfree\b/, merchant: { slug: "free", name: "Free", color: "#CD1E25", logo: "/marchands/free.png" } },
  { match: /\bbouygues\b/, merchant: { slug: "bouygues", name: "Bouygues Telecom", color: "#0087CD", logo: "/marchands/bouygues.png" } },

  /* ── Courses ──────────────────────────────────────────────────────────── */
  { match: /\bcarrefour\b/, merchant: { slug: "carrefour", name: "Carrefour", color: "#004E9F", logo: "/marchands/carrefour.png" } },
  { match: /\b(leclerc|e leclerc)\b/, merchant: { slug: "leclerc", name: "E.Leclerc", color: "#0066B3", logo: "/marchands/leclerc.ico" } },
  { match: /\bintermarche\b/, merchant: { slug: "intermarche", name: "Intermarché", color: "#D3141E", logo: "/marchands/intermarche.png" } },
  { match: /\blidl\b/, merchant: { slug: "lidl", name: "Lidl", color: "#0050AA", logo: "/marchands/lidl.svg" } },
  { match: /\baldi\b/, merchant: { slug: "aldi", name: "Aldi", color: "#00447C", logo: "/marchands/aldi.png" } },
  { match: /\bauchan\b/, merchant: { slug: "auchan", name: "Auchan", color: "#D3141E", logo: "/marchands/auchan.png" } },
  { match: /\bmonoprix\b/, merchant: { slug: "monoprix", name: "Monoprix", color: "#E2001A", logo: "/marchands/monoprix.png" } },
  { match: /\bfranprix\b/, merchant: { slug: "franprix", name: "Franprix", color: "#93C01F", logo: "/marchands/franprix.png" } },
  { match: /\bpicard\b/, merchant: { slug: "picard", name: "Picard", color: "#003DA5", logo: "/marchands/picard.png" } },
  { match: /\bsuper u|\bhyper u|\bmagasins u\b/, merchant: { slug: "super-u", name: "Super U", color: "#E2001A", logo: "/marchands/super-u.png" } },
  { match: /\bcasino (supermarche|shop)\b/, merchant: { slug: "casino", name: "Casino", color: "#00953B", logo: "/marchands/casino.png" } },
  { match: /\bbiocoop\b/, merchant: { slug: "biocoop", name: "Biocoop", color: "#5C8A2E", logo: "/marchands/biocoop.ico" } },

  /* ── Restauration ─────────────────────────────────────────────────────── */
  // Sans `\b` de fin : « MCDONALDS » porte un s collé, et « MC DONALDS » un
  // espace. Le motif doit attraper les deux — c'est le libellé le plus courant
  // d'un relevé, et le plus mal orthographié par les banques.
  { match: /\bmc ?do/, merchant: { slug: "mcdonalds", name: "McDonald's", color: "#C8102E", logo: "/marchands/mcdonalds.png" } },
  { match: /\bburger king\b/, merchant: { slug: "burger-king", name: "Burger King", color: "#B4321A", logo: "/marchands/burger-king.ico" } },
  { match: /\bkfc\b/, merchant: { slug: "kfc", name: "KFC", color: "#A02128", logo: "/marchands/kfc.ico" } },
  { match: /\bstarbucks\b/, merchant: { slug: "starbucks", name: "Starbucks", color: "#00704A", logo: "/marchands/starbucks.svg" } },
  { match: /\bsubway\b/, merchant: { slug: "subway", name: "Subway", color: "#00733C", logo: "/marchands/subway.ico" } },
  { match: /\bdeliveroo\b/, merchant: { slug: "deliveroo", name: "Deliveroo", color: "#00807C", logo: "/marchands/deliveroo.svg" } },
  { match: /\bjust eat\b/, merchant: { slug: "just-eat", name: "Just Eat", color: "#D4132A", logo: "/marchands/just-eat.png" } },

  /* ── Transport & carburant ────────────────────────────────────────────── */
  { match: /\bsncf\b|\bouigo\b|\binoui\b/, merchant: { slug: "sncf", name: "SNCF", color: "#0C1C8C", logo: "/marchands/sncf.png" } },
  { match: /\bratp\b|\bnavigo\b/, merchant: { slug: "ratp", name: "RATP", color: "#2E7D32", logo: "/marchands/ratp.png" } },
  { match: /\bblablacar\b/, merchant: { slug: "blablacar", name: "BlaBlaCar", color: "#0F6E8C", logo: "/marchands/blablacar.svg" } },
  { match: /\bair france\b/, merchant: { slug: "air-france", name: "Air France", color: "#002157", logo: "/marchands/air-france.png" } },
  { match: /\buber\b/, merchant: { slug: "uber", name: "Uber", color: "#1D1D1D", logo: "/marchands/uber.png" } },
  { match: /\btotal( ?energies)?\b/, merchant: { slug: "total", name: "TotalEnergies", color: "#D6001C", logo: "/marchands/total.png" } },
  { match: /\bshell\b/, merchant: { slug: "shell", name: "Shell", color: "#DD1D21", logo: "/marchands/shell.svg" } },
  { match: /\b(avia|esso|bp)\b/, merchant: { slug: "station", name: "Station-service", color: "#4B5157" } },
  { match: /\b(vinci|asf|cofiroute|sanef|aprr) ?(autoroute)?s?\b/, merchant: { slug: "autoroute", name: "Autoroutes", color: "#005AA0" } },

  /* ── Commerce ─────────────────────────────────────────────────────────── */
  { match: /\bfnac\b/, merchant: { slug: "fnac", name: "Fnac", color: "#C8A006", logo: "/marchands/fnac.png" } },
  { match: /\bdarty\b/, merchant: { slug: "darty", name: "Darty", color: "#C4161C", logo: "/marchands/darty.png" } },
  { match: /\bdecathlon\b/, merchant: { slug: "decathlon", name: "Decathlon", color: "#0082C3", logo: "/marchands/decathlon.ico" } },
  { match: /\bikea\b/, merchant: { slug: "ikea", name: "IKEA", color: "#00549A", logo: "/marchands/ikea.svg" } },
  { match: /\bleroy merlin\b/, merchant: { slug: "leroy-merlin", name: "Leroy Merlin", color: "#5C9E1E", logo: "/marchands/leroy-merlin.ico" } },
  { match: /\bzalando\b/, merchant: { slug: "zalando", name: "Zalando", color: "#D95A00", logo: "/marchands/zalando.png" } },
  { match: /\bcdiscount\b/, merchant: { slug: "cdiscount", name: "Cdiscount", color: "#C4161C", logo: "/marchands/cdiscount.ico" } },
  { match: /\bsephora\b/, merchant: { slug: "sephora", name: "Sephora", color: "#1A1A1A", logo: "/marchands/sephora.ico" } },
  { match: /\bzara\b/, merchant: { slug: "zara", name: "Zara", color: "#1A1A1A", logo: "/marchands/zara.png" } },
  { match: /\bnike\b/, merchant: { slug: "nike", name: "Nike", color: "#1A1A1A", logo: "/marchands/nike.png" } },

  /* ── Énergie, logement, santé ─────────────────────────────────────────── */
  { match: /\bedf\b/, merchant: { slug: "edf", name: "EDF", color: "#E05206", logo: "/marchands/edf.png" } },
  { match: /\bengie\b/, merchant: { slug: "engie", name: "Engie", color: "#0074B3", logo: "/marchands/engie.svg" } },
  { match: /\bveolia\b/, merchant: { slug: "veolia", name: "Veolia", color: "#00847F", logo: "/marchands/veolia.png" } },
  { match: /\bdoctolib\b/, merchant: { slug: "doctolib", name: "Doctolib", color: "#005AA0", logo: "/marchands/doctolib.png" } },
  { match: /\bpharmacie/, merchant: { slug: "pharmacie", name: "Pharmacie", color: "#0E8A5F" } },
  { match: /\bairbnb\b/, merchant: { slug: "airbnb", name: "Airbnb", color: "#D93B47", logo: "/marchands/airbnb.svg" } },
  { match: /\bbooking com\b/, merchant: { slug: "booking", name: "Booking.com", color: "#003580", logo: "/marchands/booking.png" } },
  { match: /\bla poste\b|\bcolissimo\b/, merchant: { slug: "la-poste", name: "La Poste", color: "#B8A100", logo: "/marchands/la-poste.png" } },

  /* ── Finance ──────────────────────────────────────────────────────────────
     Les trois premières réutilisent les images déjà livrées pour les COMPTES
     (`public/banque/`) : quand elles apparaissent en contrepartie d'un
     virement, c'est bien la même marque.

     `bank: true` sur ces entrées : ce sont elles, et elles seules, qu'on cherche
     sur un VIREMENT pour dire d'où il vient (cf. `findTransferBank`). */
  { match: /\brevolut\b/, merchant: { slug: "revolut", name: "Revolut", color: "#1A1A1A", logo: "/banque/revolut.webp", bank: true } },
  { match: /\bbourso/, merchant: { slug: "boursorama", name: "BoursoBank", color: "#E5007D", logo: "/banque/boursorama.jpg", bank: true } },
  { match: /\bcredit agricole\b/, merchant: { slug: "credit-agricole", name: "Crédit Agricole", color: "#00895E", logo: "/banque/credit-agricole.jpg", bank: true } },
  { match: /\bpaypal\b/, merchant: { slug: "paypal", name: "PayPal", color: "#003087", logo: "/marchands/paypal.png", bank: true } },
  { match: /\bstripe\b/, merchant: { slug: "stripe", name: "Stripe", color: "#5433FF", logo: "/marchands/stripe.svg", bank: true } },
  { match: /\blydia\b/, merchant: { slug: "lydia", name: "Lydia", color: "#0B79F7", logo: "/marchands/lydia.png", bank: true } },
  { match: /\bn26\b/, merchant: { slug: "n26", name: "N26", color: "#1A1A1A", logo: "/marchands/n26.png", bank: true } },
  { match: /\bbinance\b/, merchant: { slug: "binance", name: "Binance", color: "#B58200", logo: "/marchands/binance.png", bank: true } },
  { match: /\bcoinbase\b/, merchant: { slug: "coinbase", name: "Coinbase", color: "#0052FF", logo: "/marchands/coinbase.png", bank: true } },
  { match: /\btrade republic\b/, merchant: { slug: "trade-republic", name: "Trade Republic", color: "#1A1A1A", logo: "/marchands/trade-republic.svg", bank: true } },
  /* ── Extension : enseignes courantes d'un relevé français ─────────────
     Ajoutées après le premier lot, qui ne couvrait que les plus grosses
     marques. Placées EN FIN de table : les motifs ci-dessus sont plus
     spécifiques ou plus fréquents, et le premier qui matche gagne. */
  { match: /\bcora\b/, merchant: { slug: "cora", name: "Cora", color: "#E2001A", logo: "/marchands/cora.png" } },
  { match: /\bcolruyt\b/, merchant: { slug: "colruyt", name: "Colruyt", color: "#E30613", logo: "/marchands/colruyt.png" } },
  { match: /\bgrand frais\b/, merchant: { slug: "grand-frais", name: "Grand Frais", color: "#0F7B3E", logo: "/marchands/grand-frais.png" } },
  { match: /\bnaturalia\b/, merchant: { slug: "naturalia", name: "Naturalia", color: "#5A8F29", logo: "/marchands/naturalia.png" } },
  { match: /\bnetto\b/, merchant: { slug: "netto", name: "Netto", color: "#E2001A", logo: "/marchands/netto.ico" } },
  { match: /\bg20\b/, merchant: { slug: "g20", name: "G20", color: "#009B48", logo: "/marchands/g20.ico" } },
  { match: /\bnicolas (vins|sa)\b|\bcaves nicolas\b/, merchant: { slug: "nicolas", name: "Nicolas", color: "#8B1A2B", logo: "/marchands/nicolas.png" } },
  { match: /\bv and b\b|\bv & b\b/, merchant: { slug: "v-and-b", name: "V and B", color: "#C8102E", logo: "/marchands/v-and-b.png" } },
  { match: /\bdomino ?s? ?pizza\b|\bdominos\b/, merchant: { slug: "dominos", name: "Domino's Pizza", color: "#0B6AB0", logo: "/marchands/dominos.ico" } },
  { match: /\bpizza hut\b/, merchant: { slug: "pizza-hut", name: "Pizza Hut", color: "#C8102E", logo: "/marchands/pizza-hut.ico" } },
  { match: /\bfive guys\b/, merchant: { slug: "five-guys", name: "Five Guys", color: "#C8102E", logo: "/marchands/five-guys.svg" } },
  { match: /\bo ?tacos\b/, merchant: { slug: "o-tacos", name: "O'Tacos", color: "#1A1A1A", logo: "/marchands/o-tacos.png" } },
  { match: /\bsushi shop\b/, merchant: { slug: "sushi-shop", name: "Sushi Shop", color: "#1A1A1A", logo: "/marchands/sushi-shop.png" } },
  { match: /\bboulangerie paul\b|\bpaul boulangerie\b/, merchant: { slug: "paul", name: "Paul", color: "#4A2F16", logo: "/marchands/paul.ico" } },
  { match: /\bbrioche doree\b/, merchant: { slug: "brioche-doree", name: "Brioche Dorée", color: "#C8811A", logo: "/marchands/brioche-doree.ico" } },
  { match: /\bbuffalo grill\b/, merchant: { slug: "buffalo-grill", name: "Buffalo Grill", color: "#B4321A", logo: "/marchands/buffalo-grill.ico" } },
  { match: /\bhippopotamus\b|\bhippo restaurant\b/, merchant: { slug: "hippopotamus", name: "Hippopotamus", color: "#0F6B3C", logo: "/marchands/hippopotamus.ico" } },
  { match: /\bflunch\b/, merchant: { slug: "flunch", name: "Flunch", color: "#E2001A", logo: "/marchands/flunch.png" } },
  { match: /\bdel arte\b/, merchant: { slug: "del-arte", name: "Del Arte", color: "#0F6B3C", logo: "/marchands/del-arte.png" } },
  { match: /\bcourtepaille\b/, merchant: { slug: "courtepaille", name: "Courtepaille", color: "#8B5A16", logo: "/marchands/courtepaille.png" } },
  { match: /\bhellofresh\b/, merchant: { slug: "hellofresh", name: "HelloFresh", color: "#8CC63E", logo: "/marchands/hellofresh.ico" } },
  { match: /\btoo good to go\b|\btgtg\b/, merchant: { slug: "too-good-to-go", name: "Too Good To Go", color: "#0F7B3E", logo: "/marchands/too-good-to-go.png" } },
  { match: /\btrainline\b/, merchant: { slug: "trainline", name: "Trainline", color: "#0F7B6C", logo: "/marchands/trainline.png" } },
  { match: /\bflixbus\b|\bflix\b/, merchant: { slug: "flixbus", name: "FlixBus", color: "#4F8C0F", logo: "/marchands/flixbus.png" } },
  { match: /\beurostar\b/, merchant: { slug: "eurostar", name: "Eurostar", color: "#0F5A9B", logo: "/marchands/eurostar.png" } },
  { match: /\btrenitalia\b|\bfrecciarossa\b/, merchant: { slug: "trenitalia", name: "Trenitalia", color: "#C8102E", logo: "/marchands/trenitalia.ico" } },
  { match: /\bbolt\b/, merchant: { slug: "bolt", name: "Bolt", color: "#0F9B4F", logo: "/marchands/bolt.png" } },
  { match: /\blime\b/, merchant: { slug: "lime", name: "Lime", color: "#4A8C0F", logo: "/marchands/lime.png" } },
  { match: /\btier mobility\b|\btier\b/, merchant: { slug: "tier", name: "TIER", color: "#0F6B8C", logo: "/marchands/tier.png" } },
  { match: /\bdott\b/, merchant: { slug: "dott", name: "Dott", color: "#0F5A6B", logo: "/marchands/dott.png" } },
  { match: /\bvelib\b/, merchant: { slug: "velib", name: "Vélib'", color: "#0F7B3E", logo: "/marchands/velib.png" } },
  { match: /\bryanair\b/, merchant: { slug: "ryanair", name: "Ryanair", color: "#0F3A8C", logo: "/marchands/ryanair.png" } },
  { match: /\beasyjet\b/, merchant: { slug: "easyjet", name: "easyJet", color: "#D9601A", logo: "/marchands/easyjet.ico" } },
  { match: /\btransavia\b/, merchant: { slug: "transavia", name: "Transavia", color: "#0F7B9B", logo: "/marchands/transavia.png" } },
  { match: /\bavis (location|car|budget)\b/, merchant: { slug: "avis", name: "Avis", color: "#C8102E", logo: "/marchands/avis.ico" } },
  { match: /\bhertz\b/, merchant: { slug: "hertz", name: "Hertz", color: "#C8A006", logo: "/marchands/hertz.png" } },
  { match: /\beuropcar\b/, merchant: { slug: "europcar", name: "Europcar", color: "#0F7B3E", logo: "/marchands/europcar.png" } },
  { match: /\bsixt\b/, merchant: { slug: "sixt", name: "Sixt", color: "#D9601A", logo: "/marchands/sixt.svg" } },
  { match: /\bgetaround\b|\bdrivy\b/, merchant: { slug: "getaround", name: "Getaround", color: "#0F6B8C", logo: "/marchands/getaround.svg" } },
  { match: /\bindigo park\b|\bparking indigo\b/, merchant: { slug: "indigo", name: "Indigo", color: "#0F5A8C", logo: "/marchands/indigo.png" } },
  { match: /\bulys\b/, merchant: { slug: "ulys", name: "Ulys", color: "#0F5AA0", logo: "/marchands/ulys.png" } },
  { match: /\bbip ?and ?go\b|\bbip go\b/, merchant: { slug: "bipandgo", name: "Bip&Go", color: "#D9601A", logo: "/marchands/bipandgo.ico" } },
  { match: /\broady\b/, merchant: { slug: "intermarche-carburant", name: "Roady", color: "#0F5A8C", logo: "/marchands/intermarche-carburant.png" } },
  { match: /\bsosh\b/, merchant: { slug: "sosh", name: "Sosh", color: "#1A1A1A", logo: "/marchands/sosh.png" } },
  { match: /\bprixtel\b/, merchant: { slug: "prixtel", name: "Prixtel", color: "#0F6B8C", logo: "/marchands/prixtel.png" } },
  { match: /\bnrj mobile\b/, merchant: { slug: "nrj-mobile", name: "NRJ Mobile", color: "#C8102E", logo: "/marchands/nrj-mobile.png" } },
  { match: /\bdeezer\b/, merchant: { slug: "deezer", name: "Deezer", color: "#A238FF", logo: "/marchands/deezer.png" } },
  { match: /\bicloud\b/, merchant: { slug: "icloud", name: "iCloud", color: "#3B82C4", logo: "/marchands/icloud.ico" } },
  { match: /\bdropbox\b/, merchant: { slug: "dropbox", name: "Dropbox", color: "#0061FF", logo: "/marchands/dropbox.ico" } },
  { match: /\bnotion labs\b|\bnotion\b/, merchant: { slug: "notion", name: "Notion", color: "#1A1A1A", logo: "/marchands/notion.png" } },
  { match: /\bfigma\b/, merchant: { slug: "figma", name: "Figma", color: "#C8402E", logo: "/marchands/figma.png" } },
  { match: /\bgithub\b/, merchant: { slug: "github", name: "GitHub", color: "#1A1A1A", logo: "/marchands/github.png" } },
  { match: /\bslack\b/, merchant: { slug: "slack", name: "Slack", color: "#4A154B", logo: "/marchands/slack.png" } },
  { match: /\bzoom (video|com|us)\b|\bzoom\b/, merchant: { slug: "zoom", name: "Zoom", color: "#0B5CFF", logo: "/marchands/zoom.svg" } },
  { match: /\bduolingo\b/, merchant: { slug: "duolingo", name: "Duolingo", color: "#4A8C0F", logo: "/marchands/duolingo.png" } },
  { match: /\baudible\b/, merchant: { slug: "audible", name: "Audible", color: "#D9601A", logo: "/marchands/audible.png" } },
  { match: /\bcrunchyroll\b/, merchant: { slug: "crunchyroll", name: "Crunchyroll", color: "#D9601A", logo: "/marchands/crunchyroll.png" } },
  { match: /\btwitch\b/, merchant: { slug: "twitch", name: "Twitch", color: "#9146FF", logo: "/marchands/twitch.png" } },
  { match: /\bpatreon\b/, merchant: { slug: "patreon", name: "Patreon", color: "#C8402E", logo: "/marchands/patreon.png" } },
  { match: /\bplaystation\b|\bsony interactive\b|\bpsn\b/, merchant: { slug: "playstation", name: "PlayStation", color: "#0F3A8C", logo: "/marchands/playstation.jpg" } },
  { match: /\bxbox\b/, merchant: { slug: "xbox", name: "Xbox", color: "#0F7B1A", logo: "/marchands/xbox.png" } },
  { match: /\bnintendo\b/, merchant: { slug: "nintendo", name: "Nintendo", color: "#C8102E", logo: "/marchands/nintendo.png" } },
  { match: /\bepic games\b/, merchant: { slug: "epic-games", name: "Epic Games", color: "#1A1A1A", logo: "/marchands/epic-games.png" } },
  { match: /\bubisoft\b/, merchant: { slug: "ubisoft", name: "Ubisoft", color: "#0F6B9B", logo: "/marchands/ubisoft.ico" } },
  { match: /\broblox\b/, merchant: { slug: "roblox", name: "Roblox", color: "#1A1A1A", logo: "/marchands/roblox.png" } },
  { match: /\bcanva\b/, merchant: { slug: "canva", name: "Canva", color: "#0F7B8C", logo: "/marchands/canva.png" } },
  { match: /\bvercel\b/, merchant: { slug: "vercel", name: "Vercel", color: "#1A1A1A", logo: "/marchands/vercel.png" } },
  { match: /\baws\b|\bamazon web services\b/, merchant: { slug: "aws", name: "AWS", color: "#8C5A0F", logo: "/marchands/aws.png" } },
  { match: /\bovh/, merchant: { slug: "ovh", name: "OVHcloud", color: "#0F5AA0", logo: "/marchands/ovh.png" } },
  { match: /\bcloudflare\b/, merchant: { slug: "cloudflare", name: "Cloudflare", color: "#D9601A", logo: "/marchands/cloudflare.png" } },
  { match: /\bshopify\b/, merchant: { slug: "shopify", name: "Shopify", color: "#5A8C0F", logo: "/marchands/shopify.png" } },
  { match: /\bhbo\b|\bhbomax\b|\bwarnermedia\b/, merchant: { slug: "hbo-max", name: "Max", color: "#0F3AC4", logo: "/marchands/hbo-max.png" } },
  { match: /\bparamount\b/, merchant: { slug: "paramount", name: "Paramount+", color: "#0F5AC4", logo: "/marchands/paramount.ico" } },
  { match: /\bmolotov\b/, merchant: { slug: "molotov", name: "Molotov", color: "#C8402E", logo: "/marchands/molotov.ico" } },
  { match: /\ble monde\b|\blemonde\b/, merchant: { slug: "lemonde", name: "Le Monde", color: "#1A1A1A", logo: "/marchands/lemonde.png" } },
  { match: /\bmediapart\b/, merchant: { slug: "mediapart", name: "Mediapart", color: "#C8102E", logo: "/marchands/mediapart.svg" } },
  { match: /\bl equipe\b|\blequipe\b/, merchant: { slug: "lequipe", name: "L'Équipe", color: "#0F3A8C", logo: "/marchands/lequipe.png" } },
  { match: /\bbasic ?fit\b/, merchant: { slug: "basic-fit", name: "Basic-Fit", color: "#D9601A", logo: "/marchands/basic-fit.svg" } },
  { match: /\bfitness park\b/, merchant: { slug: "fitness-park", name: "Fitness Park", color: "#1A1A1A", logo: "/marchands/fitness-park.png" } },
  { match: /\bneoness\b/, merchant: { slug: "neoness", name: "Neoness", color: "#C8402E", logo: "/marchands/neoness.png" } },
  { match: /\bkeep ?cool\b/, merchant: { slug: "keepcool", name: "Keep Cool", color: "#0F7B8C", logo: "/marchands/keepcool.png" } },
  { match: /\bgo sport\b/, merchant: { slug: "go-sport", name: "Go Sport", color: "#0F5A8C", logo: "/marchands/go-sport.png" } },
  { match: /\bintersport\b/, merchant: { slug: "intersport", name: "Intersport", color: "#0F3A8C", logo: "/marchands/intersport.png" } },
  { match: /\bfoot ?locker\b/, merchant: { slug: "foot-locker", name: "Foot Locker", color: "#C8102E", logo: "/marchands/foot-locker.png" } },
  { match: /\bjd sports\b/, merchant: { slug: "jd-sports", name: "JD Sports", color: "#1A1A1A", logo: "/marchands/jd-sports.png" } },
  { match: /\bcourir\b/, merchant: { slug: "courir", name: "Courir", color: "#1A1A1A", logo: "/marchands/courir.png" } },
  { match: /\boptic\b/, merchant: { slug: "optic2000", name: "Optic 2000", color: "#0F5A8C", logo: "/marchands/optic2000.ico" } },
  { match: /\bkrys\b/, merchant: { slug: "krys", name: "Krys", color: "#0F6B8C", logo: "/marchands/krys.png" } },
  { match: /\bafflelou\b/, merchant: { slug: "afflelou", name: "Alain Afflelou", color: "#C8102E", logo: "/marchands/afflelou.png" } },
  { match: /\bameli\b|\bcpam\b|\bassurance maladie\b|\bcaisse primaire\b/, merchant: { slug: "ameli", name: "Assurance Maladie", color: "#0F5A8C", logo: "/marchands/ameli.png" } },
  { match: /\balan\b/, merchant: { slug: "alan", name: "Alan", color: "#C8402E", logo: "/marchands/alan.png" } },
  { match: /\bh ?et ?m\b|\bh m\b|\bhennes mauritz\b/, merchant: { slug: "hm", name: "H&M", color: "#C8102E", logo: "/marchands/hm.ico" } },
  { match: /\buniqlo\b/, merchant: { slug: "uniqlo", name: "Uniqlo", color: "#C8102E", logo: "/marchands/uniqlo.png" } },
  { match: /\bkiabi\b/, merchant: { slug: "kiabi", name: "Kiabi", color: "#C8402E", logo: "/marchands/kiabi.png" } },
  { match: /\bcelio\b/, merchant: { slug: "celio", name: "Celio", color: "#1A1A1A", logo: "/marchands/celio.ico" } },
  { match: /\bjules (sa|sas|magasin)\b|\bjules fashion\b/, merchant: { slug: "jules", name: "Jules", color: "#1A1A1A", logo: "/marchands/jules.png" } },
  { match: /\bbershka\b/, merchant: { slug: "bershka", name: "Bershka", color: "#1A1A1A", logo: "/marchands/bershka.png" } },
  { match: /\bpull ?and ?bear\b|\bpull bear\b/, merchant: { slug: "pull-and-bear", name: "Pull&Bear", color: "#1A1A1A", logo: "/marchands/pull-and-bear.png" } },
  { match: /\bstradivarius\b/, merchant: { slug: "stradivarius", name: "Stradivarius", color: "#1A1A1A", logo: "/marchands/stradivarius.png" } },
  { match: /\bmango\b/, merchant: { slug: "mango", name: "Mango", color: "#1A1A1A", logo: "/marchands/mango.png" } },
  { match: /\bprimark\b/, merchant: { slug: "primark", name: "Primark", color: "#0F5AA0", logo: "/marchands/primark.ico" } },
  { match: /\bshein\b/, merchant: { slug: "shein", name: "SHEIN", color: "#1A1A1A", logo: "/marchands/shein.png" } },
  { match: /\bvinted\b/, merchant: { slug: "vinted", name: "Vinted", color: "#0F7B8C", logo: "/marchands/vinted.png" } },
  { match: /\basos\b/, merchant: { slug: "asos", name: "ASOS", color: "#1A1A1A", logo: "/marchands/asos.png" } },
  { match: /\bnocibe\b/, merchant: { slug: "nocibe", name: "Nocibé", color: "#C8407B", logo: "/marchands/nocibe.png" } },
  { match: /\bmarionnaud\b/, merchant: { slug: "marionnaud", name: "Marionnaud", color: "#C8102E", logo: "/marchands/marionnaud.png" } },
  { match: /\byves rocher\b/, merchant: { slug: "yves-rocher", name: "Yves Rocher", color: "#0F6B3C", logo: "/marchands/yves-rocher.svg" } },
  { match: /\betam\b/, merchant: { slug: "etam", name: "Etam", color: "#C8407B", logo: "/marchands/etam.jpg" } },
  { match: /\bundiz\b/, merchant: { slug: "undiz", name: "Undiz", color: "#C8407B", logo: "/marchands/undiz.svg" } },
  { match: /\bpromod\b/, merchant: { slug: "promod", name: "Promod", color: "#1A1A1A", logo: "/marchands/promod.png" } },
  { match: /\bsarenza\b/, merchant: { slug: "sarenza", name: "Sarenza", color: "#C8402E", logo: "/marchands/sarenza.png" } },
  { match: /\bspartoo\b/, merchant: { slug: "spartoo", name: "Spartoo", color: "#0F6B8C", logo: "/marchands/spartoo.png" } },
  { match: /\bcastorama\b/, merchant: { slug: "castorama", name: "Castorama", color: "#0F5AA0", logo: "/marchands/castorama.png" } },
  { match: /\bbrico ?depot\b/, merchant: { slug: "brico-depot", name: "Brico Dépôt", color: "#C8102E", logo: "/marchands/brico-depot.png" } },
  { match: /\bbricomarche\b/, merchant: { slug: "bricomarche", name: "Bricomarché", color: "#C8402E", logo: "/marchands/bricomarche.png" } },
  { match: /\bmr ?bricolage\b/, merchant: { slug: "mr-bricolage", name: "Mr.Bricolage", color: "#0F5A8C", logo: "/marchands/mr-bricolage.png" } },
  { match: /\bbut (sa|sas|magasin|cuisine)\b|\bmagasin but\b/, merchant: { slug: "but", name: "BUT", color: "#C8102E", logo: "/marchands/but.ico" } },
  { match: /\bconforama\b/, merchant: { slug: "conforama", name: "Conforama", color: "#0F5AA0", logo: "/marchands/conforama.png" } },
  { match: /\bmaisons du monde\b/, merchant: { slug: "maisons-du-monde", name: "Maisons du Monde", color: "#5A5A5A", logo: "/marchands/maisons-du-monde.png" } },
  { match: /\bgifi\b/, merchant: { slug: "gifi", name: "GiFi", color: "#C8102E", logo: "/marchands/gifi.png" } },
  { match: /\baction (france|nl|sas)\b/, merchant: { slug: "action", name: "Action", color: "#C8402E", logo: "/marchands/action.png" } },
  { match: /\bcentrakor\b/, merchant: { slug: "centrakor", name: "Centrakor", color: "#C8402E", logo: "/marchands/centrakor.png" } },
  { match: /\bfoir ?fouille\b/, merchant: { slug: "foirfouille", name: "La Foir'Fouille", color: "#C8102E", logo: "/marchands/foirfouille.png" } },
  { match: /\btruffaut\b/, merchant: { slug: "truffaut", name: "Truffaut", color: "#0F6B3C", logo: "/marchands/truffaut.png" } },
  { match: /\bjardiland\b/, merchant: { slug: "jardiland", name: "Jardiland", color: "#0F7B3E", logo: "/marchands/jardiland.ico" } },
  { match: /\bgamm ?vert\b/, merchant: { slug: "gamm-vert", name: "Gamm vert", color: "#5A8C0F", logo: "/marchands/gamm-vert.ico" } },
  { match: /\bbotanic\b/, merchant: { slug: "botanic", name: "Botanic", color: "#0F6B3C", logo: "/marchands/botanic.png" } },
  { match: /\blapeyre\b/, merchant: { slug: "lapeyre", name: "Lapeyre", color: "#0F5A8C", logo: "/marchands/lapeyre.png" } },
  { match: /\bmanomano\b/, merchant: { slug: "manomano", name: "ManoMano", color: "#D9601A", logo: "/marchands/manomano.png" } },
  { match: /\bboulanger\b/, merchant: { slug: "boulanger", name: "Boulanger", color: "#C8402E", logo: "/marchands/boulanger.png" } },
  { match: /\belectro ?depot\b/, merchant: { slug: "electro-depot", name: "Electro Dépôt", color: "#C8102E", logo: "/marchands/electro-depot.png" } },
  { match: /\bcultura\b/, merchant: { slug: "cultura", name: "Cultura", color: "#0F6B8C", logo: "/marchands/cultura.png" } },
  { match: /\bmicromania\b/, merchant: { slug: "micromania", name: "Micromania", color: "#C8102E", logo: "/marchands/micromania.png" } },
  { match: /\bldlc\b/, merchant: { slug: "ldlc", name: "LDLC", color: "#0F5AA0", logo: "/marchands/ldlc.png" } },
  { match: /\bback ?market\b/, merchant: { slug: "back-market", name: "Back Market", color: "#0F7B6C", logo: "/marchands/back-market.png" } },
  { match: /\bsamsung\b/, merchant: { slug: "samsung", name: "Samsung", color: "#0F3A8C", logo: "/marchands/samsung.png" } },
  { match: /\bmondial relay\b/, merchant: { slug: "mondial-relay", name: "Mondial Relay", color: "#C8102E", logo: "/marchands/mondial-relay.png" } },
  { match: /\bchronopost\b/, merchant: { slug: "chronopost", name: "Chronopost", color: "#0F5A8C", logo: "/marchands/chronopost.ico" } },
  { match: /\bdhl\b/, merchant: { slug: "dhl", name: "DHL", color: "#C8A006", logo: "/marchands/dhl.ico" } },
  { match: /\bups\b/, merchant: { slug: "ups", name: "UPS", color: "#6B4A16", logo: "/marchands/ups.ico" } },
  { match: /\bfedex\b/, merchant: { slug: "fedex", name: "FedEx", color: "#4A2F8C", logo: "/marchands/fedex.ico" } },
  { match: /\bleboncoin\b|\ble bon coin\b/, merchant: { slug: "leboncoin", name: "leboncoin", color: "#D9601A", logo: "/marchands/leboncoin.ico" } },
  { match: /\bebay\b/, merchant: { slug: "ebay", name: "eBay", color: "#0F5AA0", logo: "/marchands/ebay.ico" } },
  { match: /\baliexpress\b/, merchant: { slug: "aliexpress", name: "AliExpress", color: "#C8102E", logo: "/marchands/aliexpress.ico" } },
  { match: /\btemu\b/, merchant: { slug: "temu", name: "Temu", color: "#D9601A", logo: "/marchands/temu.png" } },
  { match: /\betsy\b/, merchant: { slug: "etsy", name: "Etsy", color: "#D9601A", logo: "/marchands/etsy.png" } },
  { match: /\bveepee\b|\bvente privee\b/, merchant: { slug: "veepee", name: "Veepee", color: "#C8407B", logo: "/marchands/veepee.png" } },
  { match: /\bshowroomprive\b/, merchant: { slug: "showroomprive", name: "Showroomprivé", color: "#C8407B", logo: "/marchands/showroomprive.png" } },
  { match: /\brakuten\b|\bpriceminister\b/, merchant: { slug: "rakuten", name: "Rakuten", color: "#C8102E", logo: "/marchands/rakuten.png" } },
  { match: /\beni gas\b|\beni france\b|\beni\b/, merchant: { slug: "eni", name: "Eni", color: "#C8A006", logo: "/marchands/eni.png" } },
  { match: /\bvattenfall\b/, merchant: { slug: "vattenfall", name: "Vattenfall", color: "#0F7B9B", logo: "/marchands/vattenfall.png" } },
  { match: /\bekwateur\b/, merchant: { slug: "ekwateur", name: "ekWateur", color: "#0F7B6C", logo: "/marchands/ekwateur.png" } },
  { match: /\bmint energie\b/, merchant: { slug: "mint-energie", name: "Mint Énergie", color: "#0F7B6C", logo: "/marchands/mint-energie.png" } },
  /* Le libellé arrive sous la forme du site (« WWW.OHM-ENERGIE.COM ») : la clé
     de recherche le rend en « www ohm energie com ». Le nom canonique est
     « Ohm » — c'est ainsi que la ligne doit se lire, pas comme une URL. */
  { match: /\bohm ?energies?\b|\bohm\b/, merchant: { slug: "ohm-energie", name: "Ohm", color: "#0F7A4E", logo: "/marchands/ohm-energie.svg" } },
  { match: /\bsuez\b/, merchant: { slug: "suez", name: "Suez", color: "#0F6B9B", logo: "/marchands/suez.svg" } },
  { match: /\bsaur\b/, merchant: { slug: "saur", name: "Saur", color: "#0F5A8C", logo: "/marchands/saur.png" } },
  { match: /\baxa\b/, merchant: { slug: "axa", name: "AXA", color: "#0F3A8C", logo: "/marchands/axa.jpg" } },
  { match: /\ballianz\b/, merchant: { slug: "allianz", name: "Allianz", color: "#0F3A6B", logo: "/marchands/allianz.png" } },
  { match: /\bmaif\b/, merchant: { slug: "maif", name: "MAIF", color: "#C8402E", logo: "/marchands/maif.png" } },
  { match: /\bmacif\b/, merchant: { slug: "macif", name: "Macif", color: "#0F5AA0", logo: "/marchands/macif.png" } },
  { match: /\bmaaf\b/, merchant: { slug: "maaf", name: "MAAF", color: "#0F5A8C", logo: "/marchands/maaf.png" } },
  { match: /\bmatmut\b/, merchant: { slug: "matmut", name: "Matmut", color: "#C8102E", logo: "/marchands/matmut.png" } },
  { match: /\bgmf\b/, merchant: { slug: "gmf", name: "GMF", color: "#0F5A8C", logo: "/marchands/gmf.ico" } },
  { match: /\bgroupama\b/, merchant: { slug: "groupama", name: "Groupama", color: "#0F6B3C", logo: "/marchands/groupama.png" } },
  { match: /\bdirect assurance\b/, merchant: { slug: "direct-assurance", name: "Direct Assurance", color: "#C8402E", logo: "/marchands/direct-assurance.png" } },
  { match: /\bcredit mutuel\b|\bcic\b/, merchant: { slug: "credit-mutuel", name: "Crédit Mutuel", color: "#0F5AA0", logo: "/marchands/credit-mutuel.png", bank: true } },
  { match: /\bcaisse d epargne\b|\bcaisse epargne\b/, merchant: { slug: "caisse-epargne", name: "Caisse d'Épargne", color: "#8C1A6B", logo: "/marchands/caisse-epargne.png", bank: true } },
  { match: /\blcl\b/, merchant: { slug: "lcl", name: "LCL", color: "#0F3A8C", logo: "/marchands/lcl.png", bank: true } },
  { match: /\bsociete generale\b|\bsocgen\b/, merchant: { slug: "societe-generale", name: "Société Générale", color: "#C8102E", logo: "/marchands/societe-generale.png", bank: true } },
  { match: /\bbnp\b|\bparibas\b/, merchant: { slug: "bnp", name: "BNP Paribas", color: "#0F6B5A", logo: "/marchands/bnp.png", bank: true } },
  { match: /\bbanque postale\b/, merchant: { slug: "banque-postale", name: "La Banque Postale", color: "#0F3A6B", logo: "/marchands/banque-postale.png", bank: true } },
  { match: /\bfortuneo\b/, merchant: { slug: "fortuneo", name: "Fortuneo", color: "#0F6B8C", logo: "/marchands/fortuneo.png", bank: true } },
  { match: /\bcompte nickel\b|\bnickel sas\b/, merchant: { slug: "nickel", name: "Nickel", color: "#C8A006", logo: "/marchands/nickel.ico", bank: true } },
  { match: /\bqonto\b/, merchant: { slug: "qonto", name: "Qonto", color: "#4A2F8C", logo: "/marchands/qonto.png", bank: true } },
  { match: /\bwise\b|\btransferwise\b/, merchant: { slug: "wise", name: "Wise", color: "#4A8C0F", logo: "/marchands/wise.png", bank: true } },
  { match: /\bkraken\b/, merchant: { slug: "kraken", name: "Kraken", color: "#4A2F8C", logo: "/marchands/kraken.png", bank: true } },
  { match: /\bledger\b/, merchant: { slug: "ledger", name: "Ledger", color: "#1A1A1A", logo: "/marchands/ledger.png" } },
  { match: /\bswile\b/, merchant: { slug: "swile", name: "Swile", color: "#C8402E", logo: "/marchands/swile.png" } },
  { match: /\bedenred\b|\bticket restaurant\b/, merchant: { slug: "edenred", name: "Edenred", color: "#0F5AA0", logo: "/marchands/edenred.svg" } },
  { match: /\bdgfip\b|\bimpots\b|\btresor public\b|\bfinances publiques\b/, merchant: { slug: "impots", name: "Impôts", color: "#0F3A6B", logo: "/marchands/impots.png" } },
  { match: /\burssaf\b/, merchant: { slug: "urssaf", name: "Urssaf", color: "#0F5A8C", logo: "/marchands/urssaf.png" } },
  { match: /\bcaf\b|\ballocations familiales\b/, merchant: { slug: "caf", name: "Caf", color: "#0F6B8C", logo: "/marchands/caf.png" } },
  { match: /\bfrance travail\b|\bpole emploi\b/, merchant: { slug: "france-travail", name: "France Travail", color: "#0F3A8C", logo: "/marchands/france-travail.ico" } },
  { match: /\bants\b|\bagence nationale des titres\b/, merchant: { slug: "ants", name: "ANTS", color: "#0F3A6B", logo: "/marchands/ants.png" } },
  { match: /\bfoncia\b/, merchant: { slug: "foncia", name: "Foncia", color: "#C8402E", logo: "/marchands/foncia.png" } },
  { match: /\bnexity\b/, merchant: { slug: "nexity", name: "Nexity", color: "#C8102E", logo: "/marchands/nexity.png" } },
  { match: /\borpi\b/, merchant: { slug: "orpi", name: "Orpi", color: "#C8102E", logo: "/marchands/orpi.png" } },
  { match: /\bcentury\b/, merchant: { slug: "century21", name: "Century 21", color: "#C8A006", logo: "/marchands/century21.png" } },
  { match: /\babritel\b|\bvrbo\b/, merchant: { slug: "abritel", name: "Abritel", color: "#0F6B8C", logo: "/marchands/abritel.png" } },
  { match: /\bfdj\b|\bfrancaise des jeux\b|\bparions sport\b/, merchant: { slug: "fdj", name: "FDJ", color: "#0F3A8C", logo: "/marchands/fdj.ico" } },
  { match: /\bpmu\b/, merchant: { slug: "pmu", name: "PMU", color: "#0F6B3C", logo: "/marchands/pmu.png" } },
  { match: /\bwinamax\b/, merchant: { slug: "winamax", name: "Winamax", color: "#C8102E", logo: "/marchands/winamax.png" } },
  { match: /\bbetclic\b/, merchant: { slug: "betclic", name: "Betclic", color: "#0F5AA0", logo: "/marchands/betclic.png" } },
  { match: /\bunibet\b/, merchant: { slug: "unibet", name: "Unibet", color: "#0F7B3E", logo: "/marchands/unibet.ico" } },

  /* ── Prop firms ───────────────────────────────────────────────────────────
     Une évaluation payée par carte est une opération de relevé comme une autre,
     et c'est même la dépense la plus parlante pour qui utilise cette app. Les
     logos ne sont pas retéléchargés : ce sont ceux que porte déjà
     `lib/brokers/platforms.ts` pour les comptes de trading — la même marque doit
     s'afficher pareil des deux côtés. Le `color` ne sert que si l'image manque.

     À savoir : un PAYOUT reçu est un crédit, donc sans vignette. La garde de
     `findMerchant` ne cherche pas d'enseigne sur ce qui rentre, sinon un virement
     d'un homonyme se verrait décorer d'un logo. */
  { match: /\btradeify\b/, merchant: { slug: "tradeify", name: "Tradeify", color: "#16C98D", logo: "/brokers/Tradeify.png" } },
  { match: /\bapex\b|\bapextrader/, merchant: { slug: "apex", name: "Apex Trader Funding", color: "#0B2A4A", logo: "/brokers/apex.avif" } },
];

/** Marchand par `slug` — sert au repli sur l'intermédiaire de paiement. */
const bySlug = (slug: string): Merchant | null =>
  MERCHANTS.find((m) => m.merchant.slug === slug)?.merchant ?? null;

/**
 * Natures d'opération où la contrepartie est une ENSEIGNE.
 *
 * Un virement porte le nom d'une personne, et un homonyme d'enseigne y est
 * fréquent (« Virement de Camille Orange »). Chercher un marchand sur ces
 * lignes produirait des logos faux, ce qui est pire que pas de logo : le
 * lecteur croit l'information vérifiée. On s'en tient donc à la carte et au
 * prélèvement, où la contrepartie EST un commerçant par construction.
 */
const MERCHANT_KINDS: BankTransaction["kind"][] = ["card", "direct_debit"];

/**
 * Une opération peut-elle porter un marchand ?
 *
 * Aux deux natures ci-dessus s'ajoute le cas `other` AU DÉBIT, et c'est loin
 * d'être marginal : `classifyTransaction` retombe sur `other` dès que la banque
 * ne donne ni code ISO ni préfixe reconnaissable — or elle classe sur
 * `remittance_information`, qui est souvent VIDE chez les banques qui, elles,
 * remplissent proprement `creditor.name`. Autrement dit, les relevés les plus
 * exploitables pour reconnaître une enseigne étaient précisément ceux que cette
 * garde écartait, et aucune vignette n'apparaissait.
 *
 * Le crédit reste exclu, ainsi que les virements, retraits et frais : c'est là
 * que se trouvent les noms de PERSONNES, donc le risque d'homonyme d'enseigne.
 * Un débit non qualifié, lui, est un achat dans l'immense majorité des cas.
 *
 * Ces lignes-là ne restent pas nues pour autant : `findTransferBank` y cherche
 * les seuls noms d'ÉTABLISSEMENTS, où l'homonymie ne joue quasiment pas.
 */
const peutPorterUnMarchand = (tx: BankTransaction): boolean =>
  MERCHANT_KINDS.includes(tx.kind) || (tx.kind === "other" && tx.amount < 0);

/**
 * Le libellé réduit à ce qui peut porter un nom de marque, et l'intermédiaire de
 * paiement qu'on en a retiré.
 *
 * Partagé par les deux recherches — enseigne d'un achat et banque d'un virement.
 * Ce n'est pas une commodité : les deux doivent nettoyer EXACTEMENT pareil,
 * sinon un motif écrit pour l'une (« caisse d epargne », qui suppose l'apostrophe
 * déjà éclatée) cesse silencieusement de matcher pour l'autre.
 */
function brandKey(tx: BankTransaction): { key: string; intermediary: string | null } {
  // Le complément porte souvent le vrai nom de la contrepartie quand le libellé
  // principal se réduit au code de l'opération.
  let key = merchantSearchKey(`${tx.label || ""} ${tx.detail || ""}`);
  if (!key) return { key: "", intermediary: null };

  /* `replace` et non `test` : les motifs ci-dessous sont globaux et partagés
     entre tous les appels, et `test()` sur une regex `/g/` avance son
     `lastIndex` — la même opération classée deux fois de suite ne donnerait pas
     le même marchand. Le remplacement, lui, repart toujours du début. */
  let intermediary: string | null = null;
  for (const i of INTERMEDIARIES) {
    const cleaned = key.replace(i.match, " ");
    if (cleaned !== key) {
      intermediary = intermediary ?? i.slug;
      key = cleaned;
    }
  }
  for (const n of NOISE) key = key.replace(n, " ");
  return { key: key.replace(/\s+/g, " ").trim(), intermediary };
}

/**
 * Marchand d'une opération, `null` s'il n'est pas reconnu — l'appelant garde
 * alors l'icône de nature.
 */
export function findMerchant(tx: BankTransaction | null | undefined): Merchant | null {
  if (!tx || !peutPorterUnMarchand(tx)) return null;

  /* `key` peut être VIDE alors que la ligne dit quelque chose : « PAYPAL » à lui
     seul part entièrement dans les intermédiaires. Le repli sur l'intermédiaire
     doit donc rester atteignable — sortir sur une clé vide ferait disparaître le
     logo de PayPal et de Stripe. */
  const { key, intermediary } = brandKey(tx);
  const hit = key ? MERCHANTS.find((m) => m.match.test(key)) : null;
  if (hit) return hit.merchant;
  return intermediary ? bySlug(intermediary) : null;
}

/**
 * Natures d'opération où la contrepartie est un ÉTABLISSEMENT, pas un
 * commerçant : le virement, et le crédit que la banque n'a pas qualifié.
 *
 * Le second n'est pas un raffinement : beaucoup de banques ne codent rien, et
 * `classifyTransaction` retombe alors sur `other`. Un virement reçu de Revolut y
 * arrive avec pour seul libellé « REVOLUT LTD » — sans le préfixe « VIR » qui
 * l'aurait fait classer. L'exclure reviendrait à n'afficher aucun logo chez ces
 * banques, exactement le défaut que `peutPorterUnMarchand` avait déjà corrigé au
 * débit.
 *
 * Le débit non qualifié, lui, reste du ressort de `findMerchant` : c'est un
 * achat dans l'immense majorité des cas, et les entrées bancaires de la table
 * sont de toute façon atteignables par cette voie.
 */
const peutPorterUneBanque = (tx: BankTransaction): boolean =>
  tx.kind === "transfer" || (tx.kind === "other" && tx.amount > 0);

/* Marques dont le nom est aussi un PRÉNOM. C'est le piège propre au virement :
   « VIR RECU DE LYDIA MARTIN » ne vient pas de l'application de paiement, et le
   logo se lirait comme une information vérifiée. Un prénom porte presque
   toujours son nom de famille derrière lui, une marque presque jamais : on
   écarte donc le logo dès qu'un autre mot suit le nom. Le prix est un faux
   négatif (« LYDIA SOLUTIONS » perd son logo), et c'est le bon sens de l'erreur.

   Clé = `slug`, qui vaut ici le nom en minuscules ; une marque dont le slug
   s'écarterait du nom demanderait d'écrire le mot à chercher à côté. */
const FIRST_NAME_BRANDS = new Set(["lydia"]);

const suivieDunAutreMot = (word: string, key: string): boolean =>
  new RegExp(`\\b${word}\\b\\s+\\p{L}`, "u").test(key);

/**
 * D'où vient un VIREMENT : la banque ou le service de paiement lu sur son
 * libellé, `null` quand il n'en porte pas — l'appelant garde alors son icône de
 * nature.
 *
 * Cette recherche est le pendant de `findMerchant`, sur les natures que celle-ci
 * refuse (cf. `peutPorterUneBanque`), et elle ne consulte que les entrées
 * `bank` de la table. La restriction EST la garde : sur un virement, le libellé
 * porte souvent un nom de personne, et y chercher les 268 enseignes produirait
 * des logos faux — un « VIR DE CAMILLE ORANGE » décoré du logo de l'opérateur.
 * Un nom de banque, lui, ne désigne presque jamais quelqu'un ; les rares
 * exceptions sont des prénoms, traités ci-dessus.
 *
 * Le nom lu n'est PAS proposé en remplacement du libellé : celui d'un virement
 * dit qui a envoyé l'argent, ce qui vaut mieux que le nom de sa banque. Le logo
 * ajoute, il ne remplace pas.
 */
export function findTransferBank(tx: BankTransaction | null | undefined): Merchant | null {
  if (!tx || !peutPorterUneBanque(tx)) return null;

  const { key, intermediary } = brandKey(tx);
  const hit = key ? MERCHANTS.find((m) => m.merchant.bank && m.match.test(key)) : null;
  if (hit) {
    return FIRST_NAME_BRANDS.has(hit.merchant.slug) && suivieDunAutreMot(hit.merchant.slug, key)
      ? null
      : hit.merchant;
  }

  /* L'intermédiaire retiré du libellé compte ici comme ORIGINE : un virement
     reçu de PayPal ou de Stripe vient bien de PayPal ou de Stripe, alors que sur
     un achat le même mot ne faisait que masquer le commerçant. Les
     intermédiaires qui ne sont pas des établissements (Apple Pay, Google Pay)
     sont écartés par le drapeau. */
  const via = intermediary ? bySlug(intermediary) : null;
  return via?.bank ? via : null;
}

/**
 * Encre lisible sur une couleur de marque. Calculée plutôt que saisie : la
 * table porte une soixantaine de couleurs, et un couple à maintenir par entrée
 * finirait par comporter un blanc sur jaune.
 *
 * Le seuil est le point d'équilibre des contrastes WCAG, √(1,05 × 0,05) − 0,05
 * ≈ 0,179 : en dessous, le blanc contraste mieux ; au-dessus, l'encre sombre.
 * Se fier à l'intuition le place bien trop haut — un vert vif comme celui d'Uber
 * Eats (luminance 0,40) « paraît » sombre et ne rend que 2,3:1 en blanc, contre
 * 7,3:1 en encre foncée.
 *
 * L'encre sombre est le noir PUR et non le presque-noir de la DA : sur une
 * couleur pile au point d'équilibre, le #1A1A1A plafonne à 4,1:1 — sous le
 * 4,5:1 exigé — alors que le noir tient 4,6:1. C'est le seul endroit de l'app
 * où l'écart se paie, parce que le fond est une couleur de marque imposée.
 */
export function inkOn(color: string): string {
  const c = String(color).replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.179 ? "#000000" : "#FFFFFF";
}

/** Toute la table, pour les tests de lisibilité — et un futur écran de réglages
 *  si l'ajout de marchands devait sortir du code. */
export function allMerchants(): Merchant[] {
  return MERCHANTS.map((m) => m.merchant);
}

/** Initiales d'un marchand : deux lettres, comme les vignettes d'actifs. */
export function merchantInitials(name: string): string {
  const words = String(name || "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
