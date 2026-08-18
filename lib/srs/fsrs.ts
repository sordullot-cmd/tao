/**
 * FSRS-6 — Free Spaced Repetition Scheduler.
 *
 * Portage fidèle de l'implémentation de référence (open-spaced-repetition/py-fsrs,
 * `fsrs/scheduler.py`). Les formules, les bornes et les valeurs par défaut sont
 * celles du dépôt officiel : c'est l'algorithme d'Anki, pas une approximation.
 *
 * Le modèle DSR décrit une carte par trois grandeurs :
 *   • S — stabilité, en JOURS : le délai au bout duquel il reste 90 % de chances
 *         de se souvenir. C'est elle que la révision fait croître.
 *   • D — difficulté, de 1 à 10 : la résistance propre de la carte, indépendante
 *         du temps. Elle monte quand on rate, descend quand c'est facile.
 *   • R — récupérabilité : la probabilité de rappel MAINTENANT, qui décroît avec
 *         le temps écoulé depuis la dernière révision.
 *
 * L'intervalle n'est pas choisi : il est DÉDUIT. On inverse la courbe d'oubli
 * pour trouver la date où R tombera exactement sur la rétention visée.
 *
 * Ce module est PUR — aucune dépendance à React, au stockage ou à l'horloge
 * système (l'instant est toujours passé en argument). C'est ce qui le rend
 * testable et ce qui permet à l'optimiseur de rejouer un historique entier.
 */

/** Les quatre boutons de réponse. Les valeurs numériques comptent : elles
 *  entrent directement dans les formules (`rating - 3`, `parameters[rating-1]`). */
export const RATING = { again: 1, hard: 2, good: 3, easy: 4 } as const;
export type Rating = 1 | 2 | 3 | 4;

/** États d'une carte, au sens d'Anki.
 *  `learning`   : jamais sortie des paliers d'apprentissage.
 *  `review`     : programmée en jours, régime de croisière.
 *  `relearning` : ratée alors qu'elle était en révision, repasse par des paliers. */
export type SrsState = "learning" | "review" | "relearning";

/** L'état de planification d'une carte. Volontairement séparé de son CONTENU
 *  (cf. lib/srs/model.ts) : le moteur n'a jamais besoin de savoir ce qu'il y a
 *  écrit dessus, et le contenu peut être réécrit sans toucher la planification. */
export interface SchedulingState {
  state: SrsState;
  /** Rang dans les paliers d'apprentissage. `null` dès qu'on est en révision. */
  step: number | null;
  /** En jours. `null` tant que la carte n'a jamais été notée. */
  stability: number | null;
  /** 1 à 10. `null` tant que la carte n'a jamais été notée. */
  difficulty: number | null;
  /** Échéance, en ISO. */
  due: string;
  /** Dernière révision, en ISO. `null` si jamais révisée. */
  lastReview: string | null;
  /** Nombre total de réponses données. */
  reps: number;
  /** Nombre de fois où la carte est retombée depuis l'état `review`. */
  lapses: number;
}

export interface SrsConfig {
  /** Les 21 poids du modèle. */
  parameters: number[];
  /** Rétention visée, 0,70 à 0,98. Plus haut = intervalles plus courts. */
  desiredRetention: number;
  /** Paliers d'apprentissage, en MINUTES. */
  learningSteps: number[];
  /** Paliers de réapprentissage après un oubli, en MINUTES. */
  relearningSteps: number[];
  /** Plafond d'intervalle, en jours. */
  maximumInterval: number;
  /** Bruit aléatoire sur l'intervalle : évite que des cartes apprises le même
   *  jour reviennent éternellement en peloton. */
  enableFuzz: boolean;
}

/* ── Constantes du modèle (identiques au dépôt de référence) ──────────────── */

const FSRS_DEFAULT_DECAY = 0.1542;

/** Poids par défaut de FSRS-6, ajustés sur un très grand corpus de révisions
 *  publiques. Ils servent de point de départ ; l'optimiseur
 *  (lib/srs/optimizer.ts) les remplace par ceux qui collent à l'historique réel
 *  de l'utilisateur. */
export const DEFAULT_PARAMETERS: number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  FSRS_DEFAULT_DECAY,
];

const STABILITY_MIN = 0.001;
const INITIAL_STABILITY_MAX = 100;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

/** Bornes admissibles de chaque poids. L'optimiseur y ramène ses candidats, et
 *  un jeu de paramètres importé qui en sort est refusé. */
export const LOWER_BOUNDS: number[] = [
  STABILITY_MIN, STABILITY_MIN, STABILITY_MIN, STABILITY_MIN, 1.0, 0.001, 0.001,
  0.001, 0.0, 0.0, 0.001, 0.001, 0.001, 0.001, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.1,
];
export const UPPER_BOUNDS: number[] = [
  INITIAL_STABILITY_MAX, INITIAL_STABILITY_MAX, INITIAL_STABILITY_MAX,
  INITIAL_STABILITY_MAX, 10.0, 4.0, 4.0, 0.75, 4.5, 0.8, 3.5, 5.0, 0.25, 0.9,
  4.0, 1.0, 6.0, 2.0, 2.0, 0.8, 0.8,
];

/** Paliers de bruit : ±15 % entre 2,5 et 7 jours, ±10 % jusqu'à 20, ±5 % au-delà. */
const FUZZ_RANGES = [
  { start: 2.5, end: 7.0, factor: 0.15 },
  { start: 7.0, end: 20.0, factor: 0.1 },
  { start: 20.0, end: Infinity, factor: 0.05 },
];

export const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

export function defaultConfig(): SrsConfig {
  return {
    parameters: [...DEFAULT_PARAMETERS],
    desiredRetention: 0.9,
    learningSteps: [1, 10],
    relearningSteps: [10],
    maximumInterval: 36500,
    enableFuzz: true,
  };
}

/** Complète une configuration partielle : celle lue du stockage peut dater d'une
 *  version antérieure et manquer un champ. */
export function normalizeConfig(raw: Partial<SrsConfig> | null | undefined): SrsConfig {
  const base = defaultConfig();
  if (!raw) return base;
  const params = Array.isArray(raw.parameters) && raw.parameters.length === 21
    ? raw.parameters.map((v, i) => clamp(Number(v), LOWER_BOUNDS[i], UPPER_BOUNDS[i]))
    : base.parameters;
  return {
    parameters: params,
    desiredRetention: clamp(Number(raw.desiredRetention) || base.desiredRetention, 0.7, 0.98),
    learningSteps: sanitizeSteps(raw.learningSteps, base.learningSteps),
    relearningSteps: sanitizeSteps(raw.relearningSteps, base.relearningSteps),
    maximumInterval: clamp(Math.round(Number(raw.maximumInterval) || base.maximumInterval), 1, 36500),
    enableFuzz: raw.enableFuzz !== false,
  };
}

/** Une liste VIDE est légitime : elle fait passer la carte en révision d'emblée,
 *  sans palier. C'est pour ça qu'on ne retombe sur `fallback` que si la valeur
 *  n'est pas un tableau du tout. */
function sanitizeSteps(raw: unknown, fallback: number[]): number[] {
  if (!Array.isArray(raw)) return [...fallback];
  return raw.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/* ── Grandeurs dérivées de la configuration ───────────────────────────────── */

/** `decay` est NÉGATIF (c'est une décroissance) ; `factor` est calibré pour que
 *  R(S, S) vaille exactement 0,90 — autrement dit : au bout de S jours, il reste
 *  90 % de chances de se souvenir. C'est la DÉFINITION de la stabilité, et elle
 *  ne bouge pas avec la rétention visée : celle-ci n'intervient qu'au moment de
 *  choisir la date, pas dans la courbe elle-même. */
function decayOf(cfg: SrsConfig): number { return -cfg.parameters[20]; }
function factorOf(cfg: SrsConfig): number { return Math.pow(0.9, 1 / decayOf(cfg)) - 1; }

/** Probabilité de rappel après `elapsed` jours, pour une stabilité donnée. */
export function forgettingCurve(elapsed: number, stability: number, cfg: SrsConfig): number {
  const s = Math.max(stability, STABILITY_MIN);
  return Math.pow(1 + factorOf(cfg) * Math.max(0, elapsed) / s, decayOf(cfg));
}

/** Récupérabilité d'une carte à un instant donné. 0 si elle n'a jamais été vue :
 *  une carte neuve n'a pas de mémoire à interroger. */
export function retrievability(card: SchedulingState, now: Date, cfg: SrsConfig): number {
  if (!card.lastReview || card.stability == null) return 0;
  return forgettingCurve(elapsedDays(new Date(card.lastReview), now), card.stability, cfg);
}

/** Jours pleins écoulés — le même arrondi que la référence (troncature), pas une
 *  fraction : deux révisions dans la même journée comptent pour 0 jour, ce qui
 *  bascule le calcul sur la formule « court terme ». */
export function elapsedDays(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

/* ── Les cinq formules du modèle ──────────────────────────────────────────── */

/* Les cinq fonctions qui suivent sont exportées pour l'OPTIMISEUR
   (lib/srs/optimizer.ts) : il rejoue tout l'historique avec des jeux de poids
   candidats et a donc besoin des mêmes briques, sans passer par la machine à
   états. Elles ne sont pas destinées à l'interface, qui n'appelle que
   `reviewCard` et `previewRatings`. */

/** Stabilité de départ : lue directement dans les quatre premiers poids, un par
 *  bouton. Répondre « Facile » du premier coup pose donc une carte déjà stable. */
export function initialStability(rating: Rating, cfg: SrsConfig): number {
  return Math.max(cfg.parameters[rating - 1], STABILITY_MIN);
}

/** Difficulté de départ : décroissance exponentielle avec la note. `doClamp=false`
 *  sert au calcul de la cible de retour à la moyenne, qui doit rester hors bornes. */
export function initialDifficulty(rating: Rating, cfg: SrsConfig, doClamp: boolean): number {
  const d = cfg.parameters[4] - Math.exp(cfg.parameters[5] * (rating - 1)) + 1;
  return doClamp ? clamp(d, MIN_DIFFICULTY, MAX_DIFFICULTY) : d;
}

/**
 * Mise à jour de la difficulté.
 *
 * Deux corrections se superposent à l'écart brut `-w6·(note-3)` :
 *   • l'AMORTISSEMENT LINÉAIRE `(10-D)/9` — plus une carte est déjà difficile,
 *     moins un échec supplémentaire la fait monter. Sans lui, quelques ratés
 *     collaient la carte à 10 et elle n'en redescendait plus ;
 *   • le RETOUR À LA MOYENNE vers la difficulté d'un « Facile » initial, dosé
 *     par w7. Il empêche la difficulté de dériver indéfiniment sur des séries.
 */
export function nextDifficulty(difficulty: number, rating: Rating, cfg: SrsConfig): number {
  const deltaD = -(cfg.parameters[6] * (rating - 3));
  const damped = difficulty + (10 - difficulty) * deltaD / 9;
  const target = initialDifficulty(RATING.easy, cfg, false);
  const next = cfg.parameters[7] * target + (1 - cfg.parameters[7]) * damped;
  return clamp(next, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/**
 * Stabilité après un rappel RÉUSSI.
 *
 * Le gain est d'autant plus fort que :
 *   • la carte est facile (`11 - D`) ;
 *   • la stabilité est encore basse (`S^-w9`) — une carte déjà solide gagne peu,
 *     c'est le rendement décroissant de la révision ;
 *   • le rappel était DIFFICILE au moment où on l'a fait (`e^(w10·(1-R)) - 1`).
 *     C'est le cœur de la méthode : réviser trop tôt, quand R vaut encore 0,99,
 *     ne renforce presque rien. L'effort de récupération est ce qui grave.
 */
export function nextRecallStability(d: number, s: number, r: number, rating: Rating, cfg: SrsConfig): number {
  const hardPenalty = rating === RATING.hard ? cfg.parameters[15] : 1;
  const easyBonus = rating === RATING.easy ? cfg.parameters[16] : 1;
  return s * (
    1 + Math.exp(cfg.parameters[8])
      * (11 - d)
      * Math.pow(s, -cfg.parameters[9])
      * (Math.exp((1 - r) * cfg.parameters[10]) - 1)
      * hardPenalty
      * easyBonus
  );
}

/**
 * Stabilité après un OUBLI. Elle ne repart pas de zéro : une carte oubliée après
 * six mois se réapprend plus vite qu'une carte jamais vue — c'est l'effet
 * d'épargne. Le minimum avec la branche « court terme » écarte l'anomalie où un
 * oubli laisserait la carte PLUS stable qu'avant.
 */
export function nextForgetStability(d: number, s: number, r: number, cfg: SrsConfig): number {
  const longTerm = cfg.parameters[11]
    * Math.pow(d, -cfg.parameters[12])
    * (Math.pow(s + 1, cfg.parameters[13]) - 1)
    * Math.exp((1 - r) * cfg.parameters[14]);
  const shortTerm = s / Math.exp(cfg.parameters[17] * cfg.parameters[18]);
  return Math.min(longTerm, shortTerm);
}

/** Deux révisions dans la MÊME journée : la courbe d'oubli n'a pas eu le temps
 *  de jouer, on ne peut donc pas s'appuyer sur R. Formule dédiée, et gain plancher
 *  à 1 dès qu'on ne rate pas — une bonne réponse ne doit jamais faire reculer S. */
export function shortTermStability(s: number, rating: Rating, cfg: SrsConfig): number {
  let inc = Math.exp(cfg.parameters[17] * (rating - 3 + cfg.parameters[18]))
    * Math.pow(s, -cfg.parameters[19]);
  if (rating !== RATING.again) inc = Math.max(inc, 1);
  return Math.max(s * inc, STABILITY_MIN);
}

/** Inversion de la courbe d'oubli : le nombre de jours au bout duquel R tombera
 *  sur la rétention visée. C'est ici, et seulement ici, que `desiredRetention`
 *  agit — baisser la cible allonge tous les intervalles d'un même facteur. */
function nextIntervalDays(stability: number, cfg: SrsConfig): number {
  const raw = (stability / factorOf(cfg)) * (Math.pow(cfg.desiredRetention, 1 / decayOf(cfg)) - 1);
  return clamp(Math.round(raw), 1, cfg.maximumInterval);
}

/* ── Bruit sur l'intervalle ───────────────────────────────────────────────── */

/**
 * Générateur pseudo-aléatoire déterministe, semé par la carte et son compteur de
 * révisions.
 *
 * Pourquoi pas un tirage libre comme la référence : l'interface AFFICHE
 * l'intervalle sur chacun des quatre boutons avant qu'on choisisse. Avec
 * `Math.random()`, le délai annoncé ne serait pas celui appliqué, et un simple
 * re-rendu changerait les chiffres sous les yeux de l'utilisateur. Semé, le
 * bruit garde sa fonction — étaler les cartes apprises ensemble — tout en
 * restant vrai et reproductible en test.
 */
function seededRandom(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h >>> 0) | 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function fuzzedInterval(days: number, cfg: SrsConfig, seed: string): number {
  if (days < 2.5) return days;
  let delta = 1;
  for (const r of FUZZ_RANGES) {
    delta += r.factor * Math.max(Math.min(days, r.end) - r.start, 0);
  }
  const max = Math.min(Math.round(days + delta), cfg.maximumInterval);
  const min = Math.min(Math.max(2, Math.round(days - delta)), max);
  return Math.min(Math.round(seededRandom(seed) * (max - min + 1) + min), cfg.maximumInterval);
}

/* ── Création et révision ─────────────────────────────────────────────────── */

/** Une carte neuve : en apprentissage, due tout de suite, sans mémoire. */
export function newSchedulingState(now: Date = new Date()): SchedulingState {
  return {
    state: "learning",
    step: 0,
    stability: null,
    difficulty: null,
    due: now.toISOString(),
    lastReview: null,
    reps: 0,
    lapses: 0,
  };
}

export interface ReviewOutcome {
  /** Le nouvel état de planification. */
  card: SchedulingState;
  /** Délai retenu, en millisecondes — c'est lui qu'on affiche sur le bouton. */
  intervalMs: number;
}

/**
 * Applique une réponse et renvoie le nouvel état.
 *
 * `cardId` ne sert qu'à semer le bruit : deux appels avec les mêmes arguments
 * donnent le même résultat, ce dont dépendent l'aperçu des boutons et les tests.
 */
export function reviewCard(
  card: SchedulingState,
  rating: Rating,
  now: Date,
  cfg: SrsConfig,
  cardId = "",
): ReviewOutcome {
  const next: SchedulingState = { ...card };
  const daysSince = card.lastReview ? elapsedDays(new Date(card.lastReview), now) : null;
  const sameDay = daysSince != null && daysSince < 1;
  let intervalMs: number;

  /** Met à jour S et D selon le régime applicable (première fois / même jour /
   *  long terme). Identique dans les trois états, d'où la fonction locale. */
  const updateMemory = () => {
    if (next.stability == null || next.difficulty == null) {
      next.stability = initialStability(rating, cfg);
      next.difficulty = initialDifficulty(rating, cfg, true);
      return;
    }
    if (sameDay) {
      next.stability = shortTermStability(next.stability, rating, cfg);
    } else {
      const r = retrievability(card, now, cfg);
      next.stability = rating === RATING.again
        ? nextForgetStability(next.difficulty, next.stability, r, cfg)
        : nextRecallStability(next.difficulty, next.stability, r, rating, cfg);
      next.stability = Math.max(next.stability, STABILITY_MIN);
    }
    next.difficulty = nextDifficulty(next.difficulty, rating, cfg);
  };

  /** Sortie des paliers : on passe en révision et l'intervalle vient de S. */
  const graduate = (): number => {
    next.state = "review";
    next.step = null;
    return nextIntervalDays(next.stability as number, cfg) * DAY_MS;
  };

  /** Progression dans une liste de paliers (apprentissage ou réapprentissage).
   *  « Difficile » au premier palier ne rejoue pas le même délai : il prend la
   *  moyenne des deux premiers (ou 1,5× s'il n'y en a qu'un), sinon on tournerait
   *  en rond sur une carte qu'on ne sait qu'à moitié. */
  const walkSteps = (steps: number[]): number => {
    const step = next.step ?? 0;
    if (steps.length === 0 || (step >= steps.length && rating !== RATING.again)) {
      return graduate();
    }
    switch (rating) {
      case RATING.again:
        next.step = 0;
        return steps[0] * MIN_MS;
      case RATING.hard:
        if (step === 0 && steps.length === 1) return steps[0] * 1.5 * MIN_MS;
        if (step === 0 && steps.length >= 2) return (steps[0] + steps[1]) / 2 * MIN_MS;
        return steps[Math.min(step, steps.length - 1)] * MIN_MS;
      case RATING.good:
        if (step + 1 >= steps.length) return graduate();
        next.step = step + 1;
        return steps[step + 1] * MIN_MS;
      default: // easy
        return graduate();
    }
  };

  if (card.state === "review") {
    updateMemory();
    if (rating === RATING.again) {
      next.lapses = card.lapses + 1;
      if (cfg.relearningSteps.length === 0) {
        intervalMs = nextIntervalDays(next.stability as number, cfg) * DAY_MS;
      } else {
        next.state = "relearning";
        next.step = 0;
        intervalMs = cfg.relearningSteps[0] * MIN_MS;
      }
    } else {
      intervalMs = nextIntervalDays(next.stability as number, cfg) * DAY_MS;
    }
  } else {
    updateMemory();
    intervalMs = walkSteps(card.state === "learning" ? cfg.learningSteps : cfg.relearningSteps);
  }

  // Le bruit ne s'applique QU'aux cartes en révision : sur des paliers de dix
  // minutes il n'aurait aucun sens, et il ne doit pas déplacer un palier.
  if (cfg.enableFuzz && next.state === "review") {
    intervalMs = fuzzedInterval(intervalMs / DAY_MS, cfg, `${cardId}:${card.reps}:${rating}`) * DAY_MS;
  }

  next.reps = card.reps + 1;
  next.lastReview = now.toISOString();
  next.due = new Date(now.getTime() + intervalMs).toISOString();
  return { card: next, intervalMs };
}

/** Aperçu des quatre issues, pour afficher le délai sur chaque bouton AVANT le
 *  choix. C'est exactement le calcul qui sera appliqué — même graine, même
 *  résultat : le chiffre annoncé est tenu. */
export function previewRatings(
  card: SchedulingState,
  now: Date,
  cfg: SrsConfig,
  cardId = "",
): Record<Rating, ReviewOutcome> {
  return {
    1: reviewCard(card, 1, now, cfg, cardId),
    2: reviewCard(card, 2, now, cfg, cardId),
    3: reviewCard(card, 3, now, cfg, cardId),
    4: reviewCard(card, 4, now, cfg, cardId),
  };
}

/** Un nombre à une décimale, virgule française, sans « ,0 » inutile. */
function oneDecimal(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "").replace(".", ",");
}

/** Délai lisible : « 10 min », « 3 j », « 5 mois », « 2,1 ans ». Les seuils sont
 *  ceux d'Anki (mois à partir de 30 jours, années à partir de 365). */
export function formatInterval(ms: number): string {
  const minutes = ms / MIN_MS;
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = ms / DAY_MS;
  if (days < 30) return `${Math.round(days)} j`;
  const months = days / 30.4375;
  if (months < 12) return `${months < 10 ? oneDecimal(months) : Math.round(months)} mois`;
  const years = days / 365.25;
  return `${years < 10 ? oneDecimal(years) : Math.round(years)} ans`;
}
