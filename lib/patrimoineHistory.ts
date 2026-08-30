/**
 * Historique RECONSTRUIT du patrimoine.
 *
 * La courbe de la page Patrimoine ne s'appuyait que sur `patrimoine.history` :
 * un point par jour d'OUVERTURE de la page. Une installation récente n'avait
 * donc que deux points, et aucune évolution à montrer — le graphique était vrai,
 * mais inutile.
 *
 * Ce module reconstruit la valeur du patrimoine dans le PASSÉ à partir de ce
 * qu'on sait vraiment, actif par actif :
 *
 *   — compte bancaire agrégé : on remonte le solde courant en défaisant ses
 *     mouvements, exactement comme la courbe d'un compte (`balanceSeries`) ;
 *   — crédit dont les conditions sont saisies : le capital restant dû à une date
 *     donnée se recalcule depuis l'échéancier (`theoreticalOutstanding`) ;
 *   — tout le reste (immobilier, PEA, livret saisi à la main) : aucune trace du
 *     passé, la valeur est reportée à plat. C'est une hypothèse, et elle est
 *     explicite : ces actifs ne font pas bouger la courbe, ils la décalent.
 *
 * Les points MESURÉS restent utilisés pour la partie du passé que la
 * reconstruction ne couvre pas — ce sont des faits, ils priment là où ils sont
 * seuls. Sur la fenêtre reconstruite, une seule méthode s'applique, sinon la
 * courbe alternerait entre deux façons de compter et prendrait des marches à
 * chaque jour d'ouverture de la page.
 */

import type { BankTransaction } from "@/lib/bank/transactions";
import { theoreticalOutstanding } from "@/lib/loans";
import { assetValue, dayKey, type Asset, type HistoryPoint } from "@/lib/patrimoine";

/** Jusqu'où un crédit seul peut faire remonter la courbe : cinq ans. Au-delà,
 *  on tracerait vingt ans de patrimoine plat rythmé par un seul amortissement. */
export const LOAN_LOOKBACK_DAYS = 1825;

/**
 * Pas d'échantillonnage selon l'étendue de la fenêtre. Un point par jour sur
 * cinq ans, c'est 1 825 points pour une courbe large de 1 200 pixels : on ne
 * lirait rien de plus, et chaque rendu paierait le détail.
 */
export function samplingStep(spanDays: number): number {
  if (spanDays <= 400) return 1;      // jusqu'à ~13 mois : le jour
  if (spanDays <= 1100) return 7;     // jusqu'à ~3 ans : la semaine
  return 30;                          // au-delà : le mois
}

export interface ReconstructOptions {
  /** Mouvements normalisés, indexés par id d'actif (`enablebanking-…`). */
  txByAssetId?: Record<string, BankTransaction[]>;
  /** Points relevés à l'ouverture de la page — le passé déjà constaté. */
  measured?: HistoryPoint[];
  /** Jour courant (clé `AAAA-MM-JJ`), injectable pour les tests. */
  today?: string;
  /** Profondeur maximale demandée, en jours. `null` = tout ce qu'on peut. */
  days?: number | null;
  /** Courbe du patrimoine BRUT : les passifs sont écartés, comme dans
   *  `netWorth().gross`. La courbe finit alors sur le chiffre héros brut. */
  gross?: boolean;
}

/**
 * Série quotidienne du patrimoine, du plus ancien au plus récent — nette par
 * défaut, brute (crédits masqués) avec `options.gross`.
 *
 * Le dernier point vaut TOUJOURS le patrimoine d'aujourd'hui : la courbe doit
 * finir sur le chiffre héros, sans quoi la page se contredirait elle-même.
 */
export function reconstructHistory(
  assets: Asset[],
  options: ReconstructOptions = {},
): HistoryPoint[] {
  const {
    txByAssetId = {},
    measured = [],
    today = dayKey(),
    days = null,
    gross = false,
  } = options;

  const list = Array.isArray(assets) ? assets : [];
  /* En vue brute, un point mesuré ne sert que s'il porte son propre brut :
     retirer les crédits d'un total net déjà figé est impossible, et réutiliser
     ce net tel quel ferait plonger la courbe brute sur tout le vieux passé. */
  const usable = Array.isArray(measured)
    ? (gross
      ? measured.filter((p) => typeof p.gross === "number").map((p) => ({ ...p, total: p.gross as number }))
      : measured)
    : [];
  const past = [...usable].sort((a, b) => (a.date < b.date ? -1 : 1));

  // Rien à valoriser : on rend l'historique mesuré tel quel, il n'y a pas mieux.
  if (list.length === 0) return past;

  const start = earliestKnownDay(list, txByAssetId, today, days, gross);
  const valueAt = valuator(list, txByAssetId, gross);

  // Aucune profondeur exploitable (ni mouvement, ni crédit, ni relevé) : la
  // courbe se limite aux points mesurés, plus celui d'aujourd'hui.
  if (start === null || start >= today) {
    return appendToday(past, valueAt(today), today);
  }

  const step = samplingStep(daysBetween(start, today));
  const points: HistoryPoint[] = [];
  for (let d = start; d < today; d = addDays(d, step)) {
    points.push({ date: d, total: valueAt(d) });
  }
  points.push({ date: today, total: valueAt(today) });

  /* Les relevés antérieurs à la reconstruction sont conservés : c'est le seul
     passé connu au-delà de ce que les mouvements permettent de refaire. */
  const older = past.filter((p) => p.date < start);
  return [...older, ...points];
}

/* ── Valorisation à une date ─────────────────────────────────────────────── */

/**
 * Prépare une fonction « valeur du patrimoine au jour J ».
 *
 * Les mouvements sont pré-agrégés par jour et cumulés une seule fois par compte,
 * plutôt que reparcourus pour chacune des dates de la grille : sur cinq ans de
 * relevés, la différence se voit à l'œil nu.
 */
function valuator(
  assets: Asset[],
  txByAssetId: Record<string, BankTransaction[]>,
  grossOnly = false,
): (day: string) => number {
  interface BankSeries {
    /** Soldes de clôture par jour de mouvement, du plus ancien au plus récent. */
    days: string[];
    closing: number[];
    /** Solde avant le tout premier mouvement connu. */
    opening: number;
  }

  const banks: BankSeries[] = [];
  const loans: { terms: NonNullable<Asset["loan"]>; current: number }[] = [];
  let flat = 0; // actifs sans passé : reportés à plat

  for (const a of assets) {
    const current = assetValue(a);

    /* Vue brute : on écarte ce que `netWorth()` compte comme passif, c'est-à-dire
       tout actif dont la valeur du JOUR est négative — crédit, mais aussi compte
       à découvert. Trier sur la valeur du jour et non sur le type garantit que le
       dernier point de la courbe vaut exactement `nw.gross` : la courbe finit sur
       le chiffre héros, sans quoi la page se contredirait. */
    if (grossOnly && current < 0) continue;

    const txs = (txByAssetId[a.id] || []).filter((tx) => !tx.pending && tx.date);

    if (txs.length > 0) {
      const perDay = new Map<string, number>();
      for (const tx of txs) perDay.set(tx.date, (perDay.get(tx.date) ?? 0) + tx.amount);
      const days = [...perDay.keys()].sort();
      const closing = new Array<number>(days.length);
      // Remontée : le solde courant est celui d'APRÈS le dernier mouvement connu.
      let running = current;
      for (let i = days.length - 1; i >= 0; i -= 1) {
        closing[i] = round2(running);
        running -= perDay.get(days[i]) ?? 0;
      }
      banks.push({ days, closing, opening: round2(running) });
      continue;
    }

    /* Crédit : on tente l'échéancier à chaque date. Conditions incomplètes →
       `theoreticalOutstanding` rend `null` et on retombe sur le restant dû
       saisi, reporté à plat — mieux qu'un crédit qui disparaîtrait du passé. */
    if (a.type === "loan" && a.loan) {
      loans.push({ terms: a.loan, current });
      continue;
    }

    flat += current;
  }

  return (day: string): number => {
    let total = flat;

    for (const b of banks) {
      total += closingAt(b.days, b.closing, b.opening, day);
    }

    for (const l of loans) {
      const outstanding = theoreticalOutstanding(l.terms, day);
      // Un crédit est stocké NÉGATIF : le restant dû théorique est positif.
      total += outstanding === null ? l.current : -outstanding;
    }

    return round2(total);
  };
}

/** Solde d'un compte à la fin du jour `day` : sa dernière clôture connue à cette
 *  date, ou le solde d'ouverture si `day` précède tous ses mouvements. */
function closingAt(days: string[], closing: number[], opening: number, day: string): number {
  // Recherche dichotomique du dernier jour de mouvement ≤ `day`.
  let lo = 0;
  let hi = days.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] <= day) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found === -1 ? opening : closing[found];
}

/* ── Bornes ──────────────────────────────────────────────────────────────── */

/**
 * Premier jour reconstructible.
 *
 * Seules les VRAIES sources de variation ouvrent la fenêtre : les mouvements
 * bancaires (on démarre la veille du plus ancien, sinon son effet serait déjà
 * inclus dans le premier point) et le début d'un crédit, borné à
 * `LOAN_LOOKBACK_DAYS`. Les relevés mesurés, eux, n'en sont pas une : remonter
 * jusqu'à eux ne ferait que reporter à plat la valeur d'aujourd'hui PAR-DESSUS
 * des chiffres réellement constatés. On s'arrête donc à ce qu'on sait
 * reconstruire, et les relevés plus anciens sont conservés tels quels.
 *
 * Cette borne est aussi celle de l'honnêteté : au-delà du plus ancien mouvement
 * chargé, rien ne dit que le solde n'a pas bougé — la banque n'a simplement pas
 * été interrogée plus loin.
 */
function earliestKnownDay(
  assets: Asset[],
  txByAssetId: Record<string, BankTransaction[]>,
  today: string,
  days: number | null,
  grossOnly = false,
): string | null {
  /* Les candidats sont collectés puis réduits, plutôt qu'un minimum tenu à jour
     dans une variable capturée : TypeScript ne suit pas les affectations faites
     dans une closure, et ramenait le type de ce minimum à `never` après le test
     de nullité — le fichier ne compilait plus. */
  const candidates: string[] = [];
  const keep = (d: string | null | undefined) => {
    if (!d) return;
    const key = String(d).slice(0, 10);
    if (key >= today) return;
    candidates.push(key);
  };

  for (const id in txByAssetId) {
    for (const tx of txByAssetId[id] || []) {
      if (!tx.pending && tx.date) keep(addDays(tx.date, -1));
    }
  }

  /* Vue brute : un crédit n'ouvre plus la fenêtre — il ne compte plus dans la
     valeur, et remonter cinq ans pour lui ne tracerait qu'une ligne plate. */
  const loanFloor = addDays(today, -LOAN_LOOKBACK_DAYS);
  for (const a of assets) {
    if (grossOnly) break;
    if (a.type !== "loan" || !a.loan?.startDate) continue;
    const startedAt = String(a.loan.startDate).slice(0, 10);
    keep(startedAt < loanFloor ? loanFloor : startedAt);
  }

  if (candidates.length === 0) return null;
  const oldest = candidates.reduce((a, b) => (a < b ? a : b));
  if (days == null) return oldest;
  const floor = addDays(today, -days);
  return oldest < floor ? floor : oldest;
}

/* ── Utilitaires de dates (clés `AAAA-MM-JJ`, fuseau local) ──────────────── */

export function addDays(day: string, n: number): string {
  const [y, m, d] = String(day).slice(0, 10).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00`).getTime();
  const t2 = new Date(`${b}T00:00:00`).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.round((t2 - t1) / 86400000);
}

/** Historique mesuré + point du jour, sans doublonner celui d'aujourd'hui. */
function appendToday(measured: HistoryPoint[], total: number, today: string): HistoryPoint[] {
  const base = measured.filter((p) => p.date < today);
  return [...base, { date: today, total }];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
