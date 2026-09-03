/**
 * Barèmes des prop firms — ce qu'il faut atteindre, et ce qu'il ne faut pas
 * dépasser.
 *
 * ── Pourquoi une table plutôt qu'un pourcentage ──────────────────────────
 * `resolveRules` appliquait 6 % de cible et 5 % de drawdown à tout le monde.
 * La cible tombe juste chez la plupart des firmes futures ; le drawdown, non —
 * Topstep tolère 4 % sur un 50k et 3 % sur un 100k, Apex 5 % sur un 50k et 3 %
 * sur un 100k. Un chiffre faux affiché avec autorité est pire que pas de
 * chiffre du tout : on trade en croyant avoir une marge qu'on n'a pas.
 *
 * ── Ce que cette table N'EST PAS ─────────────────────────────────────────
 * Une source de vérité contractuelle. Les firmes changent leurs grilles, et ce
 * fichier ne les suit pas tout seul. Ce sont des VALEURS DE DÉPART : la carte
 * du compte les affiche comme telles et chacune reste modifiable compte par
 * compte (cf. lib/accountContracts). Une firme absente de la table retombe sur
 * le repli en pourcentage plutôt que d'hériter du barème d'une voisine.
 *
 * Les identifiants de marque sont ceux de lib/brokers/platforms (`brand` d'une
 * firme, résolu par `firmBrandId`).
 */

import { DEFAULT_TARGET_PCT, DEFAULT_MAX_DD_PCT } from "@/lib/propFirms";

export interface AccountRules {
  /** Cible de profit de l'évaluation. */
  target: number;
  /** Perte maximale tolérée. */
  maxDD: number;
  /**
   * Le drawdown SUIT le pic de la courbe au lieu d'être mesuré depuis le
   * départ. C'est la différence qui fait échouer : à +2 000 sur un compte à
   * 2 500 de DD trailing, il ne reste pas 4 500 de marge, il en reste 2 500.
   */
  trailing: boolean;
  /** Jours de trading minimum avant de pouvoir valider l'évaluation. */
  minDays: number;
  /** Perte maximale sur une seule journée. 0 = la firme n'en impose pas. */
  dailyLoss: number;
  /** Montant minimum d'un retrait sur le compte financé. */
  payoutMin: number;
  /** Jours TRADÉS sur le compte financé avant le premier retrait. */
  payoutDays: number;
  /**
   * Jours GAGNANTS requis avant le premier retrait — Topstep compte ceux-là et
   * pas les autres, et confondre les deux annonce un retrait trop tôt.
   */
  payoutWinDays: number;
  /** Gain minimum pour qu'une journée compte comme gagnante. */
  winDayMin: number;
  /** D'où vient le barème : la firme, ou le repli en pourcentage. */
  source: "firm" | "default";
}

/** Ce qu'une entrée de table dit ; le reste prend les valeurs neutres. */
type FirmSpec = Partial<Omit<AccountRules, "source">>;

interface FirmBook {
  /** Barème par taille de compte, en dollars de capital. */
  sizes?: Record<number, FirmSpec>;
  /** Barème en POURCENTAGE du capital, pour les firmes qui publient ainsi. */
  pct?: { target?: number; maxDD?: number; dailyLoss?: number };
  /** Ce qui ne dépend pas de la taille : trailing, jours, retraits. */
  common?: FirmSpec;
}

/* Les grilles ci-dessous ne couvrent QUE les firmes dont le barème est
   largement documenté et déjà affirmé ailleurs dans l'app (les gabarits de
   plans de la page Comptes). Les autres tombent volontairement dans le repli :
   mieux vaut un défaut annoncé comme tel qu'un chiffre inventé. */
const BOOK: Record<string, FirmBook> = {
  topstep: {
    common: { trailing: true, minDays: 2, payoutWinDays: 5, winDayMin: 200 },
    sizes: {
      50_000:  { target: 3_000, maxDD: 2_000 },
      100_000: { target: 6_000, maxDD: 3_000 },
      150_000: { target: 9_000, maxDD: 4_500 },
    },
  },
  apex: {
    /* Apex n'impose aucun jour minimum sur l'évaluation — c'est ce qui la rend
       passable en une séance, et l'afficher à 5 découragerait pour rien. */
    common: { trailing: true, minDays: 0, payoutDays: 8, payoutMin: 500 },
    sizes: {
      25_000:  { target: 1_500, maxDD: 1_500 },
      50_000:  { target: 3_000, maxDD: 2_500 },
      100_000: { target: 6_000, maxDD: 3_000 },
      150_000: { target: 9_000, maxDD: 5_000 },
      250_000: { target: 15_000, maxDD: 6_500 },
      300_000: { target: 20_000, maxDD: 7_500 },
    },
  },
  ftmo: {
    /* Forex : la grille est en pourcentage, la même quelle que soit la taille.
       Le drawdown est STATIQUE (mesuré depuis le capital initial), pas
       trailing — d'où le `false` explicite. */
    common: { trailing: false, minDays: 0 },
    pct: { target: 10, maxDD: 10, dailyLoss: 5 },
  },
};

const NEUTRAL: Omit<AccountRules, "source"> = {
  target: 0, maxDD: 0, trailing: false, minDays: 0, dailyLoss: 0,
  payoutMin: 0, payoutDays: 0, payoutWinDays: 0, winDayMin: 0,
};

/**
 * Le barème d'un compte : celui de sa firme si elle est au catalogue, sinon le
 * repli historique (6 % de cible, 5 % de drawdown).
 *
 * `capital` nul rend un barème à zéro plutôt que null : l'appelant affiche
 * alors « à renseigner » sans avoir à distinguer deux formes de réponse.
 */
export function resolveAccountRules(brand: string | null | undefined, capital: number | null): AccountRules {
  const c = Math.max(0, Number(capital) || 0);
  const book = brand ? BOOK[brand] : undefined;

  if (!book || !c) {
    return {
      ...NEUTRAL,
      target: Math.round(c * (DEFAULT_TARGET_PCT / 100)),
      maxDD: Math.round(c * (DEFAULT_MAX_DD_PCT / 100)),
      source: "default",
    };
  }

  /* La taille exacte d'abord ; à défaut, la grille de la firme rapportée au
     capital. Un compte Apex 75k n'est pas au catalogue, mais le rapport
     cible/capital de ses voisins vaut mieux que le repli générique. */
  const exact = book.sizes?.[c];
  const scaled = exact ? null : scaleFromNearest(book, c);
  const pct = book.pct
    ? {
        target: book.pct.target != null ? Math.round(c * (book.pct.target / 100)) : undefined,
        maxDD: book.pct.maxDD != null ? Math.round(c * (book.pct.maxDD / 100)) : undefined,
        dailyLoss: book.pct.dailyLoss != null ? Math.round(c * (book.pct.dailyLoss / 100)) : undefined,
      }
    : null;

  const spec: FirmSpec = { ...book.common, ...pct, ...scaled, ...exact };
  const merged = { ...NEUTRAL, ...strip(spec) };
  // Sans cible NI drawdown, la firme n'a rien dit d'utile : on le reconnaît.
  const known = merged.target > 0 || merged.maxDD > 0;
  return {
    ...merged,
    target: merged.target || Math.round(c * (DEFAULT_TARGET_PCT / 100)),
    maxDD: merged.maxDD || Math.round(c * (DEFAULT_MAX_DD_PCT / 100)),
    source: known ? "firm" : "default",
  };
}

/** Retire les clés à `undefined`, qui écraseraient une valeur déjà posée. */
function strip(spec: FirmSpec): FirmSpec {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec)) if (v !== undefined) out[k] = v;
  return out as FirmSpec;
}

/**
 * Taille absente de la grille : on prend la plus proche et on met sa cible et
 * son drawdown à l'échelle du capital demandé. C'est une approximation, et
 * c'est assumé — la carte laisse corriger les deux chiffres.
 */
function scaleFromNearest(book: FirmBook, capital: number): FirmSpec | null {
  const sizes = Object.keys(book.sizes || {}).map(Number).filter(n => n > 0);
  if (sizes.length === 0) return null;
  const nearest = sizes.reduce((best, s) =>
    Math.abs(s - capital) < Math.abs(best - capital) ? s : best);
  const ref = book.sizes?.[nearest];
  if (!ref) return null;
  const k = capital / nearest;
  return {
    ...ref,
    target: ref.target != null ? Math.round(ref.target * k) : undefined,
    maxDD: ref.maxDD != null ? Math.round(ref.maxDD * k) : undefined,
    dailyLoss: ref.dailyLoss != null ? Math.round(ref.dailyLoss * k) : undefined,
  };
}
