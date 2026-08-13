/**
 * Amortissement d'un crédit.
 *
 * La page « Crédits & passifs » ne savait afficher qu'un montant restant dû :
 * sans taux, sans mensualité et sans date de départ, il n'y a ni échéance, ni
 * date de fin, ni intérêts — donc rien à décider. Ce module apporte le calcul
 * qui manquait, et il le fait à part de tout rendu : ce sont des mathématiques,
 * elles se testent sans monter un composant.
 *
 * Convention retenue : prêt amortissable à mensualité constante et taux
 * proportionnel (`taux annuel / 12`), celui des crédits immobiliers et à la
 * consommation français. L'assurance emprunteur est suivie séparément — elle est
 * prélevée avec l'échéance mais n'amortit pas le capital, l'additionner à la
 * mensualité fausserait tout l'échéancier.
 *
 * Parti pris sur les données manquantes : toute fonction renvoie `null` plutôt
 * qu'un `NaN` ou un `Infinity`. Un crédit dont on ne connaît que le restant dû
 * reste affichable, l'appelant montre alors ce qui manque (`loanGaps`) au lieu
 * d'un tableau de tirets.
 */

import { dayKey, type LoanTerms } from "@/lib/patrimoine";

/* Garde-fou de toutes les boucles d'amortissement : 60 ans. Un prêt réel n'y
   arrive jamais ; une mensualité à peine supérieure aux intérêts, si — et sans
   borne la boucle tournerait des milliers de tours pour un résultat qui n'a de
   toute façon pas de sens. */
export const MAX_INSTALLMENTS = 720;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Nombre exploitable, ou `null`. Le store peut porter n'importe quoi : un
 *  champ vidé dans le formulaire, une valeur d'une version antérieure. */
const finite = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) ? n : null;

export const emptyLoanTerms = (): LoanTerms => ({
  principal: null,
  rate: null,
  payment: null,
  insurance: null,
  startDate: null,
  months: null,
});

/* ── Dates ─────────────────────────────────────────────────────────────────
   Les échéances tombent au même jour du mois, ce que `Date` ne sait pas faire
   seul : le 31 janvier + 1 mois donne le 2 ou 3 mars selon l'année. On construit
   donc le mois cible puis on ramène le jour au dernier jour disponible — la
   convention des banques pour un prélèvement au 31.
   ------------------------------------------------------------------------ */

/** Découpe un `AAAA-MM-JJ`. `null` si la chaîne n'en est pas un. */
function parseIso(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo - 1, d };
}

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

const pad = (n: number): string => String(n).padStart(2, "0");

/** `AAAA-MM-JJ` décalé de `n` mois, jour ramené au dernier du mois si besoin. */
export function addMonths(iso: string, n: number): string | null {
  const p = parseIso(iso);
  if (p === null || !Number.isFinite(n)) return null;
  const shifted = new Date(Date.UTC(p.y, p.m + Math.round(n), 1));
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return `${y}-${pad(m + 1)}-${pad(Math.min(p.d, daysInMonth(y, m)))}`;
}

/**
 * Nombre d'échéances déjà tombées, la première incluse.
 *
 * Une échéance datée du jour compte comme passée : elle est prélevée dans la
 * journée, et la faire apparaître comme « prochaine » ferait payer deux fois le
 * même mois dans l'échéancier.
 */
export function installmentsElapsed(startIso: string | null | undefined, atIso: string = dayKey()): number {
  const s = parseIso(startIso);
  const a = parseIso(atIso);
  if (s === null || a === null) return 0;
  let n = (a.y - s.y) * 12 + (a.m - s.m);
  if (a.d < s.d) n -= 1;
  return Math.max(0, n + 1);
}

/* ── Mensualité et durée ───────────────────────────────────────────────── */

/** Taux mensuel proportionnel. `0` est une valeur valable (prêt familial). */
export function monthlyRate(annualPct: number | null | undefined): number | null {
  const r = finite(annualPct);
  if (r === null || r < 0) return null;
  return r / 100 / 12;
}

/** Mensualité d'un prêt amortissable — la formule d'annuité constante. */
export function annuity(
  principal: number | null | undefined,
  annualPct: number | null | undefined,
  months: number | null | undefined,
): number | null {
  const p = finite(principal);
  const n = finite(months);
  const i = monthlyRate(annualPct);
  if (p === null || p <= 0 || n === null || n < 1 || i === null) return null;
  if (i === 0) return round2(p / n);
  return round2((p * i) / (1 - Math.pow(1 + i, -n)));
}

/**
 * Mensualité à utiliser : celle qui est saisie, sinon celle que les autres
 * conditions imposent. Un emprunteur connaît toujours l'un ou l'autre — son
 * relevé porte la mensualité, son offre de prêt porte capital, taux et durée.
 */
export function resolvedPayment(terms: LoanTerms | null | undefined): number | null {
  const saisie = finite(terms?.payment);
  if (saisie !== null && saisie > 0) return round2(saisie);
  return annuity(terms?.principal, terms?.rate, terms?.months);
}

/**
 * Nombre d'échéances pour éteindre `outstanding` à cette mensualité.
 *
 * `null` quand la mensualité ne couvre pas les intérêts du premier mois : le
 * capital ne baisse alors jamais, et une durée « infinie » n'est pas une durée.
 */
export function termFor(
  outstanding: number | null | undefined,
  annualPct: number | null | undefined,
  payment: number | null | undefined,
): number | null {
  const p = finite(outstanding);
  const m = finite(payment);
  const i = monthlyRate(annualPct);
  if (p === null || p <= 0 || m === null || m <= 0 || i === null) return null;
  if (i === 0) return Math.min(MAX_INSTALLMENTS, Math.ceil(p / m));
  if (m <= p * i) return null;
  const n = -Math.log(1 - (i * p) / m) / Math.log(1 + i);
  // Le epsilon absorbe l'erreur de flottant sur un prêt qui tombe juste : sans
  // lui, 240,0000000001 mois deviendrait une 241ᵉ échéance de quelques centimes.
  return Math.min(MAX_INSTALLMENTS, Math.max(1, Math.ceil(n - 1e-9)));
}

/* ── Échéancier ────────────────────────────────────────────────────────── */

export interface Installment {
  /** Rang à partir de maintenant : 1 = prochaine échéance. */
  index: number;
  /** `AAAA-MM-JJ`, `null` si aucune date de départ n'est connue. */
  date: string | null;
  /** Montant prélevé, hors assurance. La dernière échéance solde le reste. */
  payment: number;
  interest: number;
  /** Part de capital amortie par cette échéance. */
  principal: number;
  /** Capital restant dû après elle. */
  balance: number;
}

export interface ScheduleOptions {
  /** Date de la première ligne. Les suivantes sont espacées d'un mois. */
  from?: string | null;
  /** Borne du nombre de lignes — sert au calcul d'un restant dû passé. */
  max?: number;
}

/**
 * Tableau d'amortissement à partir du capital restant dû.
 *
 * On part du restant dû et non du capital emprunté : c'est ce que l'utilisateur
 * connaît à coup sûr, et l'échéancier doit décrire les mois à venir, pas ceux
 * déjà payés. La dernière ligne est ajustée pour solder exactement — sinon un
 * prêt se terminait sur quelques centimes de capital résiduel.
 */
export function schedule(
  outstanding: number | null | undefined,
  annualPct: number | null | undefined,
  payment: number | null | undefined,
  opts: ScheduleOptions = {},
): Installment[] {
  const i = monthlyRate(annualPct);
  const m = finite(payment);
  let balance = finite(outstanding) ?? 0;
  if (i === null || m === null || m <= 0 || balance <= 0) return [];

  const limit = Math.min(Math.max(0, Math.floor(opts.max ?? MAX_INSTALLMENTS)), MAX_INSTALLMENTS);
  const rows: Installment[] = [];

  // Le demi-centime : en dessous, le capital est soldé — continuer produirait
  // des lignes à 0,00 € qui ne correspondent à aucun prélèvement.
  for (let k = 0; k < limit && balance > 0.005; k++) {
    const interest = round2(balance * i);
    let due = round2(m);
    let principalPart = round2(due - interest);
    if (principalPart <= 0) break; // mensualité absorbée par les intérêts
    if (principalPart > balance) {
      principalPart = balance;
      due = round2(balance + interest);
    }
    balance = round2(balance - principalPart);
    rows.push({
      index: k + 1,
      date: opts.from ? addMonths(opts.from, k) : null,
      payment: due,
      interest,
      principal: principalPart,
      balance,
    });
  }
  return rows;
}

/**
 * Capital restant dû théorique à une date, reconstitué depuis le capital
 * emprunté et la date de première échéance.
 *
 * Sert à confronter le montant saisi à la réalité du contrat : un restant dû
 * qu'on n'a pas retouché depuis huit mois est faux, et c'est lui qui porte le
 * patrimoine net. L'écart est proposé à la mise à jour, jamais appliqué d'office
 * — un remboursement anticipé ou un report d'échéance rend le théorique faux, et
 * c'est l'emprunteur qui sait lequel des deux chiffres dit vrai.
 */
export function theoreticalOutstanding(
  terms: LoanTerms | null | undefined,
  atIso: string = dayKey(),
): number | null {
  const principal = finite(terms?.principal);
  const payment = resolvedPayment(terms);
  if (principal === null || principal <= 0 || payment === null || !terms?.startDate) return null;
  if (monthlyRate(terms?.rate) === null) return null;

  const elapsed = installmentsElapsed(terms.startDate, atIso);
  if (elapsed <= 0) return round2(principal);
  const rows = schedule(principal, terms.rate, payment, { max: elapsed });
  if (rows.length === 0) return null;
  return rows[rows.length - 1].balance;
}

/* ── Synthèse d'un crédit ──────────────────────────────────────────────── */

/** Condition manquante pour projeter — l'UI en fait une phrase, pas un tiret. */
export type LoanGap = "rate" | "payment" | "startDate" | "principal";

export interface LoanStats {
  /** Capital restant dû, en positif. */
  outstanding: number;
  /** Capital emprunté à l'origine. */
  borrowed: number | null;
  /** Capital déjà remboursé, et sa part de l'emprunt. */
  repaid: number | null;
  progress: number | null;
  rate: number | null;
  /** Mensualité hors assurance, saisie ou déduite. */
  payment: number | null;
  /** Assurance mensuelle — `0` quand elle n'est pas renseignée. */
  insurance: number;
  /** Ce que le crédit coûte chaque mois, assurance comprise. */
  monthlyCharge: number | null;
  monthsLeft: number | null;
  /** `AAAA-MM-JJ` de la prochaine échéance et de la dernière. */
  nextDueDate: string | null;
  endDate: string | null;
  /** Intérêts restant à payer jusqu'au terme. */
  interestLeft: number | null;
  /** Tout ce qui reste à sortir : capital + intérêts + assurance. */
  totalLeft: number | null;
  /** Échéancier complet des mois à venir. */
  schedule: Installment[];
  /** Vrai quand les conditions suffisent à projeter. */
  complete: boolean;
  /** Conditions absentes, dans l'ordre où les demander. */
  gaps: LoanGap[];
  /** Restant dû théorique à `atIso`, et l'écart avec le montant saisi. */
  theoretical: number | null;
  drift: number | null;
}

/**
 * Tout ce qu'on peut dire d'un crédit, en un seul passage.
 *
 * Prend le restant dû à part des conditions : il vit sur `Asset.balance` (en
 * négatif, cf. `lib/patrimoine`) et c'est l'appelant qui le redresse. Le module
 * n'a ainsi rien à savoir de la forme d'un actif.
 */
export function loanStats(
  outstanding: number | null | undefined,
  terms: LoanTerms | null | undefined,
  atIso: string = dayKey(),
): LoanStats {
  const due = Math.max(0, round2(finite(outstanding) ?? 0));
  const rate = monthlyRate(terms?.rate) === null ? null : finite(terms?.rate);
  const payment = resolvedPayment(terms);
  const insurance = Math.max(0, finite(terms?.insurance) ?? 0);
  const borrowed = finite(terms?.principal);

  const nextDueDate = terms?.startDate
    ? addMonths(terms.startDate, installmentsElapsed(terms.startDate, atIso))
    : null;

  const rows = schedule(due, terms?.rate, payment, { from: nextDueDate });
  const complete = rows.length > 0;
  const monthsLeft = complete ? rows.length : null;
  const interestLeft = complete ? round2(rows.reduce((s, r) => s + r.interest, 0)) : null;

  /* Le capital remboursé se lit sur l'emprunt, pas sur l'échéancier : c'est du
     passé, l'échéancier ne porte que l'avenir. Bridé à zéro — un restant dû
     supérieur au capital emprunté (saisie approximative, frais rechargés)
     donnerait sinon une progression négative. */
  const repaid = borrowed !== null && borrowed > 0 ? Math.max(0, round2(borrowed - due)) : null;
  const progress = borrowed !== null && borrowed > 0 ? Math.min(100, (Math.max(0, borrowed - due) / borrowed) * 100) : null;

  const theoretical = theoreticalOutstanding(terms, atIso);

  const gaps: LoanGap[] = [];
  if (rate === null) gaps.push("rate");
  if (payment === null) gaps.push("payment");
  if (!nextDueDate) gaps.push("startDate");
  if (borrowed === null || borrowed <= 0) gaps.push("principal");

  return {
    outstanding: due,
    borrowed,
    repaid,
    progress,
    rate,
    payment,
    insurance,
    monthlyCharge: payment === null ? null : round2(payment + insurance),
    monthsLeft,
    nextDueDate,
    endDate: complete ? rows[rows.length - 1].date : null,
    interestLeft,
    totalLeft:
      interestLeft === null || monthsLeft === null
        ? null
        : round2(due + interestLeft + insurance * monthsLeft),
    schedule: rows,
    complete,
    gaps,
    theoretical,
    drift: theoretical === null ? null : round2(due - theoretical),
  };
}

/* ── Remboursement anticipé ────────────────────────────────────────────── */

export interface Prepayment {
  /** Versement ponctuel, imputé sur le capital avant la prochaine échéance. */
  lump?: number | null;
  /** Mensualité supplémentaire, à partir de la prochaine échéance. */
  extraMonthly?: number | null;
}

export interface PrepaymentResult {
  /** Échéances et intérêts du scénario actuel, pour la comparaison. */
  baseMonths: number;
  baseInterest: number;
  newMonths: number;
  newInterest: number;
  monthsSaved: number;
  interestSaved: number;
  newEndDate: string | null;
  /** Restant dû juste après le versement ponctuel. */
  newOutstanding: number;
  /** Vrai quand le versement solde le crédit à lui seul. */
  clears: boolean;
}

/**
 * Effet d'un versement ponctuel et/ou d'une mensualité renforcée.
 *
 * La mensualité est CONSERVÉE après un versement ponctuel : c'est la durée qui
 * raccourcit, pas l'échéance qui baisse. C'est l'option par défaut des contrats
 * et la seule qui fasse économiser des intérêts — recalculer une mensualité plus
 * basse sur la durée d'origine n'en économise presque aucun.
 *
 * `null` quand le crédit n'est pas projetable, ou quand le scénario est vide :
 * il n'y a alors rien à comparer.
 */
export function simulatePrepayment(
  outstanding: number | null | undefined,
  terms: LoanTerms | null | undefined,
  sim: Prepayment,
  atIso: string = dayKey(),
): PrepaymentResult | null {
  const base = loanStats(outstanding, terms, atIso);
  if (!base.complete || base.payment === null || base.monthsLeft === null || base.interestLeft === null) {
    return null;
  }

  const lump = Math.max(0, finite(sim.lump) ?? 0);
  const extra = Math.max(0, finite(sim.extraMonthly) ?? 0);
  if (lump === 0 && extra === 0) return null;

  const newOutstanding = Math.max(0, round2(base.outstanding - lump));
  if (newOutstanding === 0) {
    return {
      baseMonths: base.monthsLeft,
      baseInterest: base.interestLeft,
      newMonths: 0,
      newInterest: 0,
      monthsSaved: base.monthsLeft,
      interestSaved: base.interestLeft,
      newEndDate: null,
      newOutstanding: 0,
      clears: true,
    };
  }

  const rows = schedule(newOutstanding, terms?.rate, base.payment + extra, { from: base.nextDueDate });
  if (rows.length === 0) return null;
  const newInterest = round2(rows.reduce((s, r) => s + r.interest, 0));

  return {
    baseMonths: base.monthsLeft,
    baseInterest: base.interestLeft,
    newMonths: rows.length,
    newInterest,
    monthsSaved: base.monthsLeft - rows.length,
    interestSaved: round2(base.interestLeft - newInterest),
    newEndDate: rows[rows.length - 1].date,
    newOutstanding,
    clears: false,
  };
}

/* ── Agrégats de plusieurs crédits ─────────────────────────────────────── */

export interface DebtTotals {
  /** Capital restant dû, tous crédits confondus. */
  outstanding: number;
  /** Charge mensuelle totale, assurances comprises. */
  monthlyCharge: number;
  /** Intérêts restants — `null` si aucun crédit n'est projetable. */
  interestLeft: number | null;
  /** Dernière échéance du dernier crédit à s'éteindre. */
  lastEndDate: string | null;
  /** Nombre de crédits dont les conditions ne suffisent pas à projeter. */
  incomplete: number;
}

/** Somme des synthèses. Les crédits incomplets sont comptés, pas ignorés :
 *  la page doit pouvoir dire que le total des intérêts est partiel. */
export function debtTotals(list: LoanStats[]): DebtTotals {
  let outstanding = 0;
  let monthlyCharge = 0;
  let interest = 0;
  let anyInterest = false;
  let lastEndDate: string | null = null;
  let incomplete = 0;

  for (const s of list) {
    outstanding += s.outstanding;
    monthlyCharge += s.monthlyCharge ?? 0;
    if (s.interestLeft !== null) {
      interest += s.interestLeft;
      anyInterest = true;
    }
    if (s.endDate && (lastEndDate === null || s.endDate > lastEndDate)) lastEndDate = s.endDate;
    if (!s.complete) incomplete += 1;
  }

  return {
    outstanding: round2(outstanding),
    monthlyCharge: round2(monthlyCharge),
    interestLeft: anyInterest ? round2(interest) : null,
    lastEndDate,
    incomplete,
  };
}
