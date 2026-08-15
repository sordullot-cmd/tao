/**
 * Qui a payé — le nom lu sur le libellé d'un CRÉDIT.
 *
 * `lib/bank/categories` sait déjà dire de quelle NATURE est une entrée (un
 * salaire, une aide, un remboursement). C'est déjà mieux qu'« un revenu », mais
 * la moitié des relevés s'arrête là : un virement reçu n'a pas de mot-clé, il a
 * un NOM — celui de l'employeur, de la caisse, de la personne. Ce module ne
 * cherche que ça, et ne classe rien.
 *
 * Il ne devine pas non plus : ou bien le libellé porte un nom lisible, ou bien
 * la fonction rend `null` et l'appelant retombe sur le nom du sous-poste. Un
 * « VIR SEPA 4409211 » ne doit PAS produire une source nommée « 4409211 » — une
 * source inventée se lit exactement comme une source vraie.
 *
 * ── Comment on lit ─────────────────────────────────────────────────────────
 * Un libellé de virement français s'écrit presque toujours pareil : le CODE de
 * l'opération, le mot qui annonce l'émetteur, le NOM, puis la référence du
 * mandat ou le motif. On coupe donc aux deux bouts :
 *   1. après le mot d'annonce (« DE », « DE LA PART DE », « EMETTEUR ») s'il
 *      apparaît tôt dans la chaîne — tout ce qui précède est du protocole ;
 *   2. avant le premier mot de référence (« MOTIF », « REF », « RUM »…) — tout
 *      ce qui suit est un numéro de dossier, jamais un nom.
 * Le reste est filtré mot à mot : codes d'opération, civilités, formes
 * juridiques, mois, nombres, et les mots qui disent la NATURE de l'entrée
 * (« SALAIRE », « REMBOURSEMENT ») — ceux-là sont déjà le sous-poste, les
 * répéter comme nom de source ne dirait rien de plus.
 *
 * Module PUR et sans dictionnaire : il rend le nom tel qu'il est écrit sur le
 * relevé, seulement recapitalisé. Un nom propre ne se traduit pas.
 */

import type { CategorizableTransaction } from "@/lib/bank/categories";

/** Au-delà, ce n'est plus un nom mais une phrase : le libellé serait tronqué à
 *  l'affichage de toute façon, et trois mots suffisent à reconnaître qui paie. */
const MAX_WORDS = 3;
const MAX_CHARS = 26;

/** Mots qui ANNONCENT l'émetteur. Ils ne comptent que TANT QU'ON EST DANS LE
 *  PROTOCOLE, c'est-à-dire avant le premier mot qui pourrait être un nom : le
 *  « de » de « CPAM DE PARIS » vient après « CPAM », il n'annonce donc rien et
 *  couper là ferait payer Paris à la place de la caisse. */
const FROM_WORDS = new Set(["de", "part", "emetteur", "expediteur", "from", "par"]);

/** Mots à partir desquels le libellé ne parle plus de personne mais de dossier. */
const REF_WORDS = new Set([
  "motif", "ref", "reference", "references", "rum", "mandat", "libelle", "lib",
  "id", "no", "num", "numero", "dossier", "contrat", "echeance", "periode",
]);

/* Les mots qu'on jette. Rassemblés en un seul ensemble : la provenance d'un mot
   (code d'opération, civilité, forme juridique) ne change rien à ce qu'on en
   fait, et une seule table se relit. */
const DROP = new Set([
  /* Codes et mots de service des banques. */
  "vir", "virt", "virement", "virements", "sepa", "inst", "instantane", "instantanee",
  "recu", "recue", "recus", "emis", "emise", "permanent", "ponctuel", "europeen",
  "prlv", "prelevement", "prelvt", "remise", "cheque", "chq", "dab", "retrait",
  "carte", "cb", "paiement", "paiment", "achat", "depot", "versement", "credit",
  "debit", "operation", "banque", "compte", "cpte", "web", "internet", "appli",
  "application", "mobile", "en", "ligne", "tip", "interne", "externe",

  /* Articles, prépositions et civilités — ce qui reste d'une formule de
     politesse une fois le nom retiré. */
  "de", "du", "des", "d", "la", "le", "les", "l", "et", "a", "au", "aux", "par",
  "pour", "sur", "un", "une", "part", "mr", "m", "mme", "mlle", "mrs", "ms",
  "monsieur", "madame", "mademoiselle",

  /* Les formules des banques autour du nom : « VIREMENT EN VOTRE FAVEUR X »
     mettrait sinon « Votre Faveur » en nom de source. */
  "votre", "vos", "notre", "nos", "faveur", "ordre", "benefice", "profit",

  /* Ce qui dit la NATURE de l'entrée : c'est le sous-poste, pas la source. */
  "salaire", "salaires", "paie", "paye", "payes", "remuneration", "traitement",
  "solde", "mensuel", "prime", "primes", "interessement", "participation",
  "honoraires", "freelance", "facture", "client", "acompte", "bulletin",
  "retraite", "pension", "pensions", "allocation", "allocations", "aide", "aides",
  "indemnite", "indemnites", "indemnisation", "indemnisations", "journaliere",
  "remboursement", "remboursements", "rbt", "avoir", "dedommagement", "sinistre",
  "trop", "percu", "interets", "interet", "dividende", "dividendes", "coupon",
  "plus", "value", "vente", "ventes", "cession", "revente", "avance",
  "complement", "regularisation", "rappel", "arriere", "arrieres",

  /* Et les adjectifs qui les accompagnent : ils qualifient l'entrée, pas celui
     qui la verse — « ALLOCATIONS FAMILIALES » ne nomme personne. */
  "mensuel", "mensuelle", "mensuels", "mensuelles", "annuel", "annuelle",
  "annuels", "annuelles", "trimestriel", "trimestrielle", "hebdomadaire",
  "familial", "familiale", "familiaux", "familiales", "complementaire",
  "exceptionnel", "exceptionnelle", "net", "brut", "total", "montant",

  /* Mois et abréviations de mois : « SALAIRE AOUT » n'a pas de source. */
  "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout",
  "septembre", "octobre", "novembre", "decembre",
  "janv", "fev", "fevr", "avr", "juil", "sept", "oct", "nov", "dec",

  /* Formes juridiques et pays collés en fin de libellé — ils n'identifient
     personne : deux sociétés d'un même groupe portent le même « SAS ». */
  "sarl", "sarlu", "sasu", "sas", "snc", "eurl", "sci", "scop", "scp", "sa",
  "ei", "eirl", "gie", "association", "asso", "bv", "gmbh", "ltd", "limited",
  "inc", "llc", "plc", "ag", "nv", "spa", "srl",
  "fr", "eu", "es", "it", "nl", "be", "lu", "uk", "us", "ie", "pl", "pt", "ch",
]);

/** Forme comparable d'un mot : minuscules, sans accent. */
const fold = (word: string): string =>
  word.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Sigles à laisser en capitales. Une liste, et non une règle sur la longueur :
 * les banques écrivent TOUT en majuscules, donc « ACME » et « CAF » y ont
 * exactement la même tête, et aucune règle de forme ne peut les séparer. Le
 * premier veut « Acme », le second « CAF » — seule la connaissance du sigle
 * tranche. La liste tient aux quelques payeurs qu'un relevé français porte
 * souvent ; tout le reste se recapitalise, ce qui n'a jamais l'air d'une faute.
 */
const ACRONYMS = new Set([
  "caf", "cpam", "cnaf", "cnav", "cnracl", "carsat", "agirc", "arrco", "ircantec",
  "msa", "urssaf", "rsi", "mdph", "crous", "sncf", "ratp", "edf", "insee", "apl",
]);

/**
 * Recapitalisation d'un mot de relevé — « UNOWHY SAS » crie au milieu d'un
 * diagramme, et le relevé n'a de toute façon qu'une casse à offrir : la sienne.
 */
const capitalize = (word: string, key: string): string =>
  ACRONYMS.has(key)
    ? word.toUpperCase()
    : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/**
 * Le nom de celui qui paie, `null` quand le libellé n'en porte pas.
 *
 * À n'appeler que sur des CRÉDITS : sur un débit, le nom lu serait celui du
 * bénéficiaire, ce qui est une autre question (et `lib/bank/merchants` y répond
 * déjà, mieux, pour les enseignes).
 */
export function payerOf(tx: CategorizableTransaction): string | null {
  const raw = `${tx.label ?? ""} ${tx.detail ?? ""}`;
  const words = raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return null;

  /* 1. Couper après le dernier mot d'annonce du PRÉAMBULE — « VIR SEPA RECU DE »
        en aligne plusieurs, c'est celui d'après lequel le nom commence qui
        compte. Le balayage s'arrête au premier mot qui pourrait être un nom :
        au-delà, un « de » appartient au nom (« CPAM DE PARIS ») et non au
        protocole. */
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const key = fold(words[i]);
    if (FROM_WORDS.has(key)) { start = i + 1; continue; }
    if (DROP.has(key) || /\d/.test(key) || key.length < 3) continue;
    break;
  }

  /* 2. Couper avant la référence : tout ce qui suit est un numéro de dossier. */
  let end = words.length;
  for (let i = start; i < words.length; i++) {
    if (REF_WORDS.has(fold(words[i]))) { end = i; break; }
  }

  const kept: string[] = [];
  for (const word of words.slice(start, end)) {
    const key = fold(word);
    // Un mot qui porte un chiffre est une référence, une date ou un numéro de
    // terminal — jamais un nom. Un mot de deux lettres n'identifie personne.
    if (key.length < 3 || /\d/.test(key) || DROP.has(key)) continue;
    kept.push(capitalize(word, key));
    if (kept.length === MAX_WORDS) break;
  }

  if (kept.length === 0) return null;

  const name = kept.join(" ");
  return name.length > MAX_CHARS ? `${name.slice(0, MAX_CHARS - 1).trimEnd()}…` : name;
}
