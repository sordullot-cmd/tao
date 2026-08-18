/**
 * Optimisation des poids FSRS sur l'historique réel.
 *
 * Les 21 poids par défaut décrivent une mémoire MOYENNE. La vôtre ne l'est pas :
 * selon le matériau (du vocabulaire, des règles de gestion du risque, des
 * formules) et selon vous, les intervalles justes sont plus courts ou plus longs.
 * L'optimiseur cherche les poids qui auraient le mieux PRÉDIT vos réponses
 * passées, en partant du principe que ce qui explique le passé programmera mieux
 * l'avenir.
 *
 * Méthode : on rejoue chaque carte dans l'ordre, on demande au modèle la
 * probabilité de rappel juste avant chaque réponse, et on mesure l'écart avec ce
 * qui s'est réellement produit (entropie croisée). Puis on descend ce coût.
 *
 * Différence avec Anki, assumée : la version officielle calcule un gradient
 * ANALYTIQUE via PyTorch. Ici, pas de dérivation automatique dans le navigateur,
 * donc gradient par DIFFÉRENCES FINIES — 42 évaluations par pas au lieu d'une.
 * C'est plus lent, jamais moins juste : la direction de descente est la même à
 * l'erreur de troncature près, et sur quelques milliers de révisions le calcul
 * tient en quelques secondes.
 */

import {
  DEFAULT_PARAMETERS, LOWER_BOUNDS, UPPER_BOUNDS, forgettingCurve,
  initialDifficulty, initialStability, nextDifficulty, nextForgetStability,
  nextRecallStability, shortTermStability,
  type Rating, type SrsConfig,
} from "./fsrs";
import type { ReviewLogEntry, SrsStore } from "./model";

/** En dessous, le résultat n'est pas fiable : trop peu de révisions pour séparer
 *  un vrai signal du bruit. C'est le seuil que retient Anki. */
export const RECOMMENDED_REVIEWS = 400;
/** En dessous, on refuse : on ajusterait 21 poids sur une poignée de points. */
export const MINIMUM_REVIEWS = 100;

/** Une révision réduite à ce dont l'optimiseur a besoin. */
interface Sample {
  rating: Rating;
  /** Jours écoulés depuis la révision précédente. `null` à la première. */
  elapsed: number | null;
}

/**
 * Regroupe le journal par carte, dans l'ordre chronologique.
 *
 * Les cartes sans aucune révision à plus d'un jour sont écartées : elles
 * n'apportent aucune information sur la courbe d'oubli, qui est précisément ce
 * qu'on ajuste. Les garder diluerait le signal sans rien ajouter.
 */
export function buildSamples(log: ReviewLogEntry[]): Sample[][] {
  const byCard = new Map<string, ReviewLogEntry[]>();
  for (const e of log) {
    const arr = byCard.get(e.cardId);
    if (arr) arr.push(e);
    else byCard.set(e.cardId, [e]);
  }
  const out: Sample[][] = [];
  for (const entries of byCard.values()) {
    entries.sort((a, b) => a.at.localeCompare(b.at));
    const seq = entries.map<Sample>(e => ({ rating: e.rating, elapsed: e.elapsed }));
    if (seq.some((s, i) => i > 0 && (s.elapsed ?? 0) >= 1)) out.push(seq);
  }
  return out;
}

/** Nombre de points réellement exploitables — celui à comparer aux seuils. */
export function usableReviewCount(log: ReviewLogEntry[]): number {
  return buildSamples(log).reduce(
    (n, seq) => n + seq.filter((s, i) => i > 0 && (s.elapsed ?? 0) >= 1).length,
    0,
  );
}

export interface Evaluation {
  /** Entropie croisée moyenne. Plus bas = meilleure prédiction. */
  logLoss: number;
  /** Écart quadratique moyen entre probabilité prédite et issue observée. */
  rmse: number;
  /** Taux de réussite observé, pour situer le modèle face au pari trivial. */
  observed: number;
  /** Probabilité moyenne prédite. Un écart avec `observed` signale un biais. */
  predicted: number;
  count: number;
}

/** Évite `log(0)` quand le modèle est catégorique et se trompe. */
const EPS = 1e-9;

/**
 * Rejoue tout l'historique avec un jeu de poids et mesure la qualité de sa
 * prédiction.
 *
 * Seules les révisions à plus d'un jour comptent dans le coût : à l'intérieur
 * d'une journée, la courbe d'oubli n'a pas joué et le modèle n'a rien à prédire.
 * L'état de la carte, lui, continue d'être mis à jour — sinon la révision
 * suivante partirait d'une stabilité fausse.
 */
export function evaluate(samples: Sample[][], cfg: SrsConfig): Evaluation {
  let loss = 0;
  let sqErr = 0;
  let passed = 0;
  let predictedSum = 0;
  let count = 0;

  for (const seq of samples) {
    let s: number | null = null;
    let d: number | null = null;
    for (let i = 0; i < seq.length; i++) {
      const { rating, elapsed } = seq[i];
      if (s == null || d == null) {
        s = initialStability(rating, cfg);
        d = initialDifficulty(rating, cfg, true);
        continue;
      }
      if ((elapsed ?? 0) < 1) {
        s = shortTermStability(s, rating, cfg);
        d = nextDifficulty(d, rating, cfg);
        continue;
      }
      const r = forgettingCurve(elapsed as number, s, cfg);
      const y = rating > 1 ? 1 : 0;
      const p = Math.min(Math.max(r, EPS), 1 - EPS);
      loss -= y * Math.log(p) + (1 - y) * Math.log(1 - p);
      sqErr += (p - y) ** 2;
      predictedSum += p;
      passed += y;
      count++;
      s = rating === 1
        ? nextForgetStability(d, s, r, cfg)
        : nextRecallStability(d, s, r, rating, cfg);
      s = Math.max(s, 0.001);
      d = nextDifficulty(d, rating, cfg);
    }
  }

  return {
    logLoss: count ? loss / count : NaN,
    rmse: count ? Math.sqrt(sqErr / count) : NaN,
    observed: count ? passed / count : NaN,
    predicted: count ? predictedSum / count : NaN,
    count,
  };
}

/* ── Descente ─────────────────────────────────────────────────────────────── */

/** Chaque poids est ramené à [0, 1] entre ses bornes. Sans ça, un seul taux
 *  d'apprentissage ne peut pas convenir à la fois à un poids qui vit autour de
 *  0,001 et à un autre qui vit autour de 8. */
function toUnit(params: number[]): number[] {
  return params.map((p, i) => (p - LOWER_BOUNDS[i]) / (UPPER_BOUNDS[i] - LOWER_BOUNDS[i]));
}

function fromUnit(x: number[]): number[] {
  return x.map((v, i) => {
    const clamped = Math.min(Math.max(v, 0), 1);
    return LOWER_BOUNDS[i] + clamped * (UPPER_BOUNDS[i] - LOWER_BOUNDS[i]);
  });
}

export interface OptimizeOptions {
  /** Nombre de pas de descente. */
  steps?: number;
  /** Progression, de 0 à 1, plus le coût courant. Appelé à chaque pas. */
  onProgress?: (fraction: number, loss: number) => void;
  /** Interrompt proprement (l'utilisateur a quitté la page). */
  shouldStop?: () => boolean;
}

export interface OptimizeResult {
  status: "ok" | "insufficient" | "stopped";
  parameters: number[];
  before: Evaluation;
  after: Evaluation;
  /** Vrai si l'échantillon dépasse le seuil recommandé. */
  reliable: boolean;
  reviewCount: number;
  steps: number;
}

/**
 * Cherche les poids qui minimisent le coût, par Adam sur gradient numérique.
 *
 * Asynchrone et rendue en fin de chaque pas : sur un gros historique le calcul
 * dure plusieurs secondes, et une boucle synchrone figerait l'interface — y
 * compris le bouton qui sert à l'annuler.
 *
 * Le résultat n'est retenu que s'il fait MIEUX que le point de départ. Une
 * descente numérique peut diverger sur un historique pathologique (quelques
 * cartes, des intervalles absurdes) ; dans ce cas on rend les poids d'origine
 * plutôt qu'un jeu dégradé, et l'écart affiché sera nul.
 */
export async function optimizeParameters(
  store: SrsStore,
  opts: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const samples = buildSamples(store.log);
  const baseline = evaluate(samples, store.config);

  if (baseline.count < MINIMUM_REVIEWS) {
    return {
      status: "insufficient",
      parameters: [...store.config.parameters],
      before: baseline,
      after: baseline,
      reliable: false,
      reviewCount: baseline.count,
      steps: 0,
    };
  }

  const steps = opts.steps ?? 90;
  const cfgWith = (params: number[]): SrsConfig => ({ ...store.config, parameters: params });
  const cost = (x: number[]): number => {
    const e = evaluate(samples, cfgWith(fromUnit(x)));
    return Number.isFinite(e.logLoss) ? e.logLoss : Number.MAX_VALUE;
  };

  const x = toUnit(store.config.parameters);
  let best = [...x];
  let bestLoss = cost(x);

  // Adam : le gradient numérique est bruité, et l'inertie plus la mise à
  // l'échelle par la variance rendent la descente nettement moins sensible à ce
  // bruit qu'une descente de gradient nue.
  const m = new Array(x.length).fill(0);
  const v = new Array(x.length).fill(0);
  const lr = 0.03;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  const h = 1e-4; // pas des différences finies, dans l'espace normalisé

  let done = 0;
  for (let step = 1; step <= steps; step++) {
    if (opts.shouldStop?.()) {
      return {
        status: "stopped",
        parameters: fromUnit(best),
        before: baseline,
        after: evaluate(samples, cfgWith(fromUnit(best))),
        reliable: baseline.count >= RECOMMENDED_REVIEWS,
        reviewCount: baseline.count,
        steps: done,
      };
    }

    // Gradient central : deux évaluations par coordonnée. Plus cher qu'une
    // différence avant, mais l'erreur est en h² au lieu de h — sur une surface
    // aussi plate que celle-ci, la différence avant pointe souvent à côté.
    const grad = new Array(x.length).fill(0);
    for (let i = 0; i < x.length; i++) {
      const up = [...x];
      const down = [...x];
      up[i] = Math.min(1, x[i] + h);
      down[i] = Math.max(0, x[i] - h);
      const span = up[i] - down[i];
      if (span <= 0) continue;
      grad[i] = (cost(up) - cost(down)) / span;
    }

    for (let i = 0; i < x.length; i++) {
      m[i] = beta1 * m[i] + (1 - beta1) * grad[i];
      v[i] = beta2 * v[i] + (1 - beta2) * grad[i] * grad[i];
      const mHat = m[i] / (1 - Math.pow(beta1, step));
      const vHat = v[i] / (1 - Math.pow(beta2, step));
      x[i] = Math.min(Math.max(x[i] - lr * mHat / (Math.sqrt(vHat) + eps), 0), 1);
    }

    const loss = cost(x);
    if (loss < bestLoss) { bestLoss = loss; best = [...x]; }
    done = step;
    opts.onProgress?.(step / steps, loss);

    // Rendre la main au navigateur : sans ça, ni le rendu ni le bouton
    // « Annuler » ne s'exécutent avant la fin des 90 pas.
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const tuned = fromUnit(best);
  const after = evaluate(samples, cfgWith(tuned));
  const improved = after.logLoss < baseline.logLoss;

  return {
    status: "ok",
    parameters: improved ? tuned : [...store.config.parameters],
    before: baseline,
    after: improved ? after : baseline,
    reliable: baseline.count >= RECOMMENDED_REVIEWS,
    reviewCount: baseline.count,
    steps: done,
  };
}

/** Les poids sont-ils encore ceux d'origine ? Sert à afficher « par défaut »
 *  plutôt qu'une suite de 21 nombres que personne ne lira. */
export function isDefaultParameters(params: number[]): boolean {
  return params.length === DEFAULT_PARAMETERS.length
    && params.every((p, i) => Math.abs(p - DEFAULT_PARAMETERS[i]) < 1e-9);
}

/** Lecture d'un jeu de poids collé depuis Anki (une liste séparée par des
 *  virgules, éventuellement entre crochets). `null` si la forme ne convient pas. */
export function parseParameters(raw: string): number[] | null {
  const nums = raw
    .replace(/[[\]]/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  if (nums.length !== 21 || nums.some(n => !Number.isFinite(n))) return null;
  return nums.map((n, i) => Math.min(Math.max(n, LOWER_BOUNDS[i]), UPPER_BOUNDS[i]));
}
