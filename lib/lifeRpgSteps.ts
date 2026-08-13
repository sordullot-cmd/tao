/**
 * Étapes d'un objectif de l'année — le chemin, pas seulement la destination.
 *
 * Une carte de « Quête de soi » disait jusqu'ici CE QU'ON VEUT (le résultat
 * visé) et OÙ ON EN EST (un pourcentage), mais rien de ce qu'il faut franchir
 * entre les deux. C'est ce qui manquait : un objectif d'un an sans point de
 * passage ne se pilote pas, il se subit.
 *
 * Une étape est volontairement BINAIRE et DATÉE — « passé la certification »,
 * « couru mon premier semi » — là où un objectif chiffré, lui, mesure une
 * quantité (page Objectifs) et où une tâche d'agenda vit à l'échelle de la
 * journée. Les trois cohabitent sur la carte sans se recouvrir :
 *
 *   étape    → un jalon du parcours, avec une date, franchi ou non ;
 *   objectif → une mesure continue (500 km, 10 000 €) ;
 *   tâche    → une action du quotidien.
 *
 * Module PUR : aucune dépendance à React ni aux pages, pour que la page
 * « Quête de soi » et ses tests partagent exactement les mêmes règles.
 */

export interface LifeStep {
  id: string;
  label: string;
  /** Échéance `AAAA-MM-JJ`, ou `null` pour une étape pas encore située. */
  due: string | null;
  done: boolean;
  /** ISO du moment où elle a été franchie — sert au journal d'activité. */
  doneAt: string | null;
}

/** XP d'une étape franchie.
 *
 *  Plus qu'une tâche d'agenda (`TASK_XP`, 25) et qu'une habitude difficile (50)
 *  au coup par coup : une étape d'objectif annuel se franchit une fois, après
 *  des semaines d'efforts, et doit peser en conséquence. Source INDÉPENDANTE
 *  des habitudes, tâches, objectifs et discipline → aucun double comptage. */
export const STEP_XP = 75;

export const newStepId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? `step_${crypto.randomUUID()}`
    : `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Les étapes d'une carte, quelle que soit son ancienneté : une carte créée
 *  avant cette fonctionnalité n'a pas de champ `steps`. */
export function readSteps(cat: { steps?: unknown } | null | undefined): LifeStep[] {
  const raw = cat && Array.isArray(cat.steps) ? cat.steps : [];
  return raw
    .filter((s): s is Partial<LifeStep> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      id: String(s.id ?? newStepId()),
      label: String(s.label ?? ""),
      due: s.due ? String(s.due).slice(0, 10) : null,
      done: Boolean(s.done),
      doneAt: s.doneAt ? String(s.doneAt) : null,
    }));
}

/* ── Ordre et état ─────────────────────────────────────────────────────── */

/**
 * Ordre CHRONOLOGIQUE, les non datées à la fin.
 *
 * Les étapes franchies ne descendent pas en bas de liste : elles restent à leur
 * place dans le temps. C'est ce qui fait la lecture d'une frise — le chemin
 * parcouru et celui qui reste, sur le même axe.
 */
export function sortSteps(steps: LifeStep[]): LifeStep[] {
  return [...steps]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      if (a.s.due && b.s.due) return a.s.due === b.s.due ? a.i - b.i : a.s.due < b.s.due ? -1 : 1;
      if (a.s.due) return -1;
      if (b.s.due) return 1;
      return a.i - b.i;
    })
    .map((x) => x.s);
}

export type StepStatus = "done" | "late" | "today" | "upcoming" | "undated";

/** État d'une étape vis-à-vis du calendrier. `today` au format `AAAA-MM-JJ`. */
export function stepStatus(step: LifeStep, today: string): StepStatus {
  if (step.done) return "done";
  if (!step.due) return "undated";
  if (step.due < today) return "late";
  if (step.due === today) return "today";
  return "upcoming";
}

export interface StepsProgress {
  done: number;
  total: number;
  /** Part franchie, en pourcentage entier. */
  pct: number;
  /** Étapes dépassées et toujours ouvertes — ce qui doit alerter. */
  late: number;
}

export function stepsProgress(steps: LifeStep[], today: string): StepsProgress {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const late = steps.filter((s) => stepStatus(s, today) === "late").length;
  return { done, total, late, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/* ── Avancement d'une carte ────────────────────────────────────────────────
   Deux mesures honnêtes peuvent coexister : les objectifs chiffrés rattachés
   et les étapes franchies. On en fait la moyenne plutôt que d'en élire une —
   un objectif mené par ses jalons est aussi légitime qu'un objectif mené par
   ses chiffres, et ne compter que les seconds affichait 0 % à quelqu'un qui
   avance vraiment. Sans ni l'un ni l'autre, repli sur la progression de niveau
   (habitudes, tâches, discipline), comme avant.
   ------------------------------------------------------------------------ */

export interface CardProgress {
  pct: number;
  /** `measured` = objectifs et/ou étapes ; `level` = repli sur le niveau. */
  source: "measured" | "level";
  hasGoals: boolean;
  hasSteps: boolean;
}

export function cardProgress(input: {
  goalPcts?: number[];
  steps?: LifeStep[];
  levelPct?: number;
  today: string;
}): CardProgress {
  const goalPcts = input.goalPcts ?? [];
  const steps = input.steps ?? [];
  const measures: number[] = [];

  if (goalPcts.length > 0) {
    measures.push(goalPcts.reduce((s, p) => s + p, 0) / goalPcts.length);
  }
  if (steps.length > 0) {
    measures.push(stepsProgress(steps, input.today).pct);
  }

  const pct = measures.length > 0
    ? measures.reduce((s, m) => s + m, 0) / measures.length
    : (input.levelPct ?? 0);

  return {
    pct: Math.round(pct),
    source: measures.length > 0 ? "measured" : "level",
    hasGoals: goalPcts.length > 0,
    hasSteps: steps.length > 0,
  };
}

/* ── Écritures ─────────────────────────────────────────────────────────────
   Immuables et sans effet de bord : la page les applique dans son `setState`.
   ------------------------------------------------------------------------ */

/** Ajoute une étape. Un libellé vide ne crée rien — la ligne de saisie
 *  abandonnée ne doit pas laisser de jalon fantôme sur la frise. */
export function addStep(steps: LifeStep[], input: { label: string; due?: string | null }): LifeStep[] {
  const label = (input.label || "").trim();
  if (!label) return steps;
  return [...steps, { id: newStepId(), label, due: input.due || null, done: false, doneAt: null }];
}

export function updateStep(steps: LifeStep[], id: string, patch: Partial<LifeStep>): LifeStep[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/**
 * Coche / décoche.
 *
 * `doneAt` date le franchissement — c'est lui qui situe le gain d'XP dans le
 * journal d'activité. Décocher l'efface : une étape rouverte n'a plus de date
 * de franchissement, et la garder daterait un événement qui n'a plus eu lieu.
 * Le `??` ne sert qu'aux données incohérentes (non franchie mais datée), dont
 * il préserve la date d'origine plutôt que d'inventer la date du jour.
 */
export function toggleStep(steps: LifeStep[], id: string, now = new Date()): LifeStep[] {
  return steps.map((s) => {
    if (s.id !== id) return s;
    const done = !s.done;
    return { ...s, done, doneAt: done ? (s.doneAt ?? now.toISOString()) : null };
  });
}

export function removeStep(steps: LifeStep[], id: string): LifeStep[] {
  return steps.filter((s) => s.id !== id);
}

/* ── Vue d'ensemble ────────────────────────────────────────────────────── */

export interface UpcomingStep<C> {
  step: LifeStep;
  cat: C;
}

/**
 * Prochaines étapes, tous objectifs confondus : les retards d'abord (ils sont
 * la seule chose à traiter aujourd'hui), puis les échéances à venir.
 *
 * C'est la réponse à « où on va » à l'échelle de la page, là où chaque carte ne
 * répond que pour elle.
 */
export function upcomingSteps<C extends { steps?: unknown }>(
  cats: C[],
  today: string,
  limit = 5,
): UpcomingStep<C>[] {
  const all: UpcomingStep<C>[] = [];
  for (const cat of cats) {
    for (const step of readSteps(cat)) {
      if (step.done || !step.due) continue;
      all.push({ step, cat });
    }
  }
  return all
    .sort((a, b) => (a.step.due as string).localeCompare(b.step.due as string))
    .slice(0, limit);
}

/**
 * Position d'une date sur le rail de l'année, en pourcentage.
 *
 * `null` hors de l'année affichée : une étape datée de l'an prochain n'a pas de
 * place sur cette frise, et la coller au bord la ferait passer pour imminente.
 */
export function yearPosition(due: string | null, year: number): number | null {
  if (!due) return null;
  const [y, m, d] = due.split("-").map(Number);
  if (!y || !m || !d || y !== year) return null;
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const at = new Date(year, m - 1, d).getTime();
  return ((at - start) / (end - start)) * 100;
}

/** Jalons de toutes les cartes, placés sur le rail de l'année. */
export function yearMarkers<C extends { id?: string; color?: string; label?: string; steps?: unknown }>(
  cats: C[],
  year: number,
): { step: LifeStep; cat: C; left: number }[] {
  const out: { step: LifeStep; cat: C; left: number }[] = [];
  for (const cat of cats) {
    for (const step of readSteps(cat)) {
      const left = yearPosition(step.due, year);
      if (left === null) continue;
      out.push({ step, cat, left });
    }
  }
  return out.sort((a, b) => a.left - b.left);
}
