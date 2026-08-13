/**
 * Mouvements bancaires — normalisation, classement, reconstruction du solde.
 *
 * Module PUR, sans dépendance serveur : il est importé des deux côtés — par le
 * connecteur (`enablebanking.ts`, qui tourne sous Node) et par les pages, dans
 * le navigateur. Y faire entrer un `node:crypto` casserait le bundle client,
 * c'est la raison de cette séparation.
 *
 * Enable Banking rend les opérations au format ISO 20022 : un montant toujours
 * POSITIF, dont le sens est porté par `credit_debit_indicator`, et une nature
 * codée sur trois niveaux (domaine / famille / sous-famille). Les banques ne
 * remplissent pas toutes ces codes ; le libellé, lui, est toujours là. D'où le
 * classement en deux temps : le code ISO quand il est présent, sinon les
 * préfixes que les banques françaises posent en tête de libellé (« CARTE … »,
 * « PRLV SEPA … », « VIR … »).
 *
 * Référence : https://enablebanking.com/docs/api/reference/#transaction
 */

/** Nature d'un mouvement. Le SENS n'est pas ici : il est dans le signe du montant. */
export type TransactionKind =
  | "card"
  | "transfer"
  | "direct_debit"
  | "withdrawal"
  | "check"
  | "fee"
  | "interest"
  | "other";

export interface BankTransaction {
  id: string;
  /** Jour de comptabilisation, AAAA-MM-JJ. */
  date: string;
  /** Contrepartie, à défaut le libellé de l'opération. */
  label: string;
  /** Complément (libellé brut de la banque) quand il ajoute quelque chose à `label`. */
  detail: string | null;
  /** Montant SIGNÉ : négatif au débit. */
  amount: number;
  currency: string;
  kind: TransactionKind;
  /** Opération pas encore comptabilisée (`PDNG`) — hors solde de la banque. */
  pending: boolean;
}

/** Forme brute rendue par l'agrégateur. Tout est optionnel : les banques
 *  remplissent ce qu'elles veulent, et deux d'entre elles ne remplissent
 *  jamais les mêmes champs. */
export interface RawTransaction {
  entry_reference?: string | null;
  transaction_amount?: { amount?: string | number; currency?: string } | null;
  credit_debit_indicator?: string | null;
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | string | null;
  bank_transaction_code?: {
    description?: string | null;
    code?: string | null;
    sub_code?: string | null;
  } | null;
  proprietary_bank_transaction_code?: { code?: string | null } | null;
}

/* ── Classement ────────────────────────────────────────────────────────────
   Codes ISO 20022 d'abord : ce sont les seuls non ambigus. La famille suffit
   presque toujours, la sous-famille tranche les retraits (une carte au DAB
   reste de la famille « carte »).
   ------------------------------------------------------------------------ */

/** Sous-familles ISO qui désignent un retrait d'espèces. Testées AVANT la
 *  famille : un « CCRD/CWDL » est un retrait, pas un paiement par carte. */
const ISO_WITHDRAWAL = ["CWDL", "ATSU", "ATSF", "CDPT"];

const ISO_FAMILIES: [kind: TransactionKind, codes: string[]][] = [
  ["card", ["CCRD", "POSD", "CPRD"]],
  ["direct_debit", ["IDDT", "RDDT", "DDBT"]],
  ["transfer", ["ICDT", "RCDT", "ICHQ", "IRCT"]],
  ["check", ["CCHQ", "RCHQ", "CHQB"]],
  ["fee", ["FEES", "CHRG", "CAJT"]],
  ["interest", ["INTR", "ACCB", "CINT", "DINT"]],
];

/* Préfixes de libellé — le repli, quand la banque ne code rien. L'ordre est
   significatif : « RETRAIT CARTE » est un retrait, et « FRAIS CARTE » des
   frais. Les deux natures les plus larges (carte, virement) passent donc en
   dernier, sinon elles absorberaient les cas précis. */
const LABEL_RULES: [kind: TransactionKind, re: RegExp][] = [
  ["withdrawal", /\b(retrait|retr|dab|gab|atm|withdraw\w*|cash\s?point)\b/],
  ["check", /\b(ch[eè]que|chq|check)\b/],
  ["direct_debit", /\b(pr[eé]l[eè]vement|prlv|prel|direct\s?debit|sepa\s?dd)\b/],
  ["fee", /\b(frais|commission|cotisation|agios|fee|charge)\b/],
  ["interest", /\b(int[eé]r[eê]ts?|interest|remun[eé]ration)\b/],
  ["card", /\b(carte|cb|card|paiement\s?cb)\b/],
  ["transfer", /\b(vir(ement|\.)?|transfer|transfert|remise)\b/],
];

/** Nature d'un mouvement brut : code ISO, puis libellé, puis « autre ». */
export function classifyTransaction(raw: RawTransaction): TransactionKind {
  const iso = [raw.bank_transaction_code?.code, raw.bank_transaction_code?.sub_code]
    .filter(Boolean)
    .join("-")
    .toUpperCase();

  if (iso) {
    const parts = iso.split(/[^A-Z]+/).filter(Boolean);
    if (parts.some((p) => ISO_WITHDRAWAL.includes(p))) return "withdrawal";
    for (const [kind, codes] of ISO_FAMILIES) {
      if (parts.some((p) => codes.includes(p))) return kind;
    }
  }

  const text = [
    raw.bank_transaction_code?.description,
    raw.proprietary_bank_transaction_code?.code,
    remittanceText(raw.remittance_information),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text) {
    for (const [kind, re] of LABEL_RULES) {
      if (re.test(text)) return kind;
    }
  }

  return "other";
}

/** Clé i18n du libellé d'une nature. */
export const kindLabelKey = (kind: TransactionKind): string => `patrimoine.tx.${kind}`;

/* ── Normalisation ─────────────────────────────────────────────────────── */

function remittanceText(info: RawTransaction["remittance_information"]): string {
  if (!info) return "";
  const list = Array.isArray(info) ? info : [info];
  return list
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Ne garde que la partie calendaire : les banques datent tantôt « 2026-08-13 »,
 *  tantôt « 2026-08-13T00:00:00.000Z ». */
const dayOf = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/**
 * Une opération brute en mouvement affichable.
 *
 * `index` ne sert qu'à fabriquer une clé de liste stable quand la banque ne
 * fournit pas de `entry_reference` — deux achats du même montant le même jour
 * sont indiscernables autrement, et React les confondrait.
 */
export function normalizeTransaction(raw: RawTransaction, index = 0): BankTransaction {
  const date = dayOf(raw.booking_date) ?? dayOf(raw.value_date) ?? dayOf(raw.transaction_date);
  const debit = String(raw.credit_debit_indicator ?? "").toUpperCase() === "DBIT";
  const amount = Math.abs(num(raw.transaction_amount?.amount)) * (debit ? -1 : 1);

  const counterparty = (debit ? raw.creditor?.name : raw.debtor?.name)?.trim() || "";
  const remittance = remittanceText(raw.remittance_information);
  const description = raw.bank_transaction_code?.description?.trim() || "";
  const label = counterparty || remittance || description || "";
  // Le complément n'est affiché que s'il APPREND quelque chose : recopier le
  // libellé sous lui-même ferait deux lignes pour une seule information.
  const detail = counterparty && remittance && remittance !== counterparty ? remittance : null;

  return {
    id: raw.entry_reference?.trim() || `tx-${date ?? "na"}-${index}-${amount}`,
    date: date ?? "",
    label,
    detail,
    amount: Math.round(amount * 100) / 100,
    currency: raw.transaction_amount?.currency || "EUR",
    kind: classifyTransaction(raw),
    // Sans statut, l'opération est réputée comptabilisée : c'est le cas de la
    // grande majorité des banques, qui ne renvoient que du `BOOK`.
    pending: String(raw.status ?? "BOOK").toUpperCase() === "PDNG",
  };
}

/** Les mouvements, du plus récent au plus ancien — l'ordre d'un relevé. */
export function sortTransactions(txs: BankTransaction[]): BankTransaction[] {
  return [...txs].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

/* ── Solde reconstruit ─────────────────────────────────────────────────────
   La banque ne rend pas l'historique de solde, seulement le solde COURANT et
   les opérations. La courbe se déduit donc à rebours : solde de la veille =
   solde du jour − mouvements du jour. C'est exact aux opérations près qu'on a
   récupérées, ce qui suffit sur une fenêtre de 90 jours.
   ------------------------------------------------------------------------ */

/** Jour précédent, en calcul calendaire — `Date` gère les mois et les bissextiles. */
function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Date d'un jour AAAA-MM-JJ, en heure LOCALE : `new Date("2026-08-13")` est lu
 *  en UTC et recule d'un jour dans les fuseaux négatifs. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Courbe du solde, un point par jour de mouvement, du plus ancien au plus récent.
 *
 * `PnlChart` lit `{ date, cum }` : on rend directement cette forme. Les
 * opérations en attente sont ÉCARTÉES — elles ne sont pas dans le solde rendu
 * par la banque, les compter ferait dériver toute la série d'autant.
 *
 * Un point d'ouverture est ajouté la veille du premier mouvement : sans lui, une
 * fenêtre à un seul jour de mouvement ne donnerait qu'un point, et la courbe ne
 * pourrait pas se tracer.
 */
export function balanceSeries(
  txs: BankTransaction[],
  currentBalance: number,
  today?: string,
): { date: string; cum: number }[] {
  const booked = txs.filter((tx) => !tx.pending && tx.date);
  if (booked.length === 0) return [];

  const perDay = new Map<string, number>();
  for (const tx of booked) {
    perDay.set(tx.date, (perDay.get(tx.date) ?? 0) + tx.amount);
  }
  const days = [...perDay.keys()].sort();

  // Remontée : le solde courant est celui d'après le dernier mouvement connu.
  const closing = new Map<string, number>();
  let running = currentBalance;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    closing.set(days[i], round2(running));
    running -= perDay.get(days[i]) ?? 0;
  }

  const points = [
    { date: previousDay(days[0]), cum: round2(running) },
    ...days.map((d) => ({ date: d, cum: closing.get(d) as number })),
  ];

  /* Prolongement jusqu'à aujourd'hui : sans mouvement depuis une semaine, la
     courbe s'arrêtait au dernier achat et laissait croire à un solde plus
     ancien qu'il n'est. */
  const last = points[points.length - 1];
  if (today && today > last.date) points.push({ date: today, cum: round2(currentBalance) });

  return points;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Entrées, sorties et solde net d'une liste de mouvements. */
export function periodStats(txs: BankTransaction[]): { in: number; out: number; net: number } {
  let credit = 0;
  let debit = 0;
  for (const tx of txs) {
    if (tx.amount >= 0) credit += tx.amount;
    else debit += tx.amount;
  }
  return { in: round2(credit), out: round2(debit), net: round2(credit + debit) };
}

/** Mouvements des `days` derniers jours (fenêtre glissante, bornes incluses). */
export function withinDays(txs: BankTransaction[], days: number, today = new Date()): BankTransaction[] {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
  const key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
  return txs.filter((tx) => tx.date >= key);
}

/** Mouvements regroupés par jour, dans l'ordre où la liste les donne. */
export function groupByDay(txs: BankTransaction[]): { date: string; items: BankTransaction[] }[] {
  const out: { date: string; items: BankTransaction[] }[] = [];
  for (const tx of txs) {
    const last = out[out.length - 1];
    if (last && last.date === tx.date) last.items.push(tx);
    else out.push({ date: tx.date, items: [tx] });
  }
  return out;
}
