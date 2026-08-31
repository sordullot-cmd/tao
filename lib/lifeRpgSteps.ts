/**
 * Étapes d'un objectif de l'année — le chemin, pas seulement la destination.
 *
 * Une carte de « Quête de soi » disait jusqu'ici CE QU'ON VEUT (le résultat
 * visé) et OÙ ON EN EST (un pourcentage), mais rien de ce qu'il faut franchir
 * entre les deux. C'est ce qui manquait : un objectif d'un an sans point de
 * passage ne se pilote pas, il se subit.
 *
 * Une étape est DATÉE et se solde en franchie / à franchir — « passé la
 * certification », « couru mon premier semi » — là où un objectif chiffré, lui,
 * mesure une quantité (page Objectifs) et où une tâche d'agenda vit à l'échelle
 * de la journée. Les trois cohabitent sur la carte sans se recouvrir :
 *
 *   étape    → un jalon du parcours, avec une date, franchi ou non ;
 *   objectif → une mesure continue (500 km, 10 000 €) ;
 *   tâche    → une action du quotidien.
 *
 * Un objectif chiffré peut être RATTACHÉ à une étape (`goal.rpgStep`). L'étape
 * cesse alors d'être binaire : elle vaut l'avancement moyen de ses objectifs, et
 * se franchit d'elle-même quand ils sont tous atteints — c'est là tout l'intérêt
 * du rattachement, sinon on cocherait à la main un jalon que les chiffres ont
 * déjà déclaré acquis. Ces avancements arrivent ici sous la forme d'un simple
 * dictionnaire `{ idÉtape: [pct, …] }` (`StepGoalPcts`) : le module reste pur et
 * ignore tout de la forme d'un objectif.
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
  /** Rang voulu à la main, `null` tant que la liste n'a jamais été rangée.
   *  Absent des cartes d'avant le glisser-déposer — d'où l'optionnel. */
  pos?: number | null;
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

/**
 * Les étapes sont-elles actives sur cette carte ?
 *
 * Drapeau NÉGATIF (`stepsEnabled === false`) exprès : les cartes existantes ne
 * portent rien et gardent donc leurs jalons, sans migration. Éteindre ne
 * supprime rien — les étapes dorment et reviennent telles quelles au rallumage.
 */
export function stepsEnabledOf(cat: { stepsEnabled?: boolean } | null | undefined): boolean {
  return cat?.stepsEnabled !== false;
}

/**
 * Le bloc « Étapes » de cette carte est-il déplié ?
 *
 * Rangé SUR la carte, comme les étapes elles-mêmes et comme leur interrupteur :
 * on ouvre le chemin d'un objectif parce qu'on le suit en ce moment, et cette
 * intention ne dure pas le temps d'un écran. Elle se reperdait à chaque
 * navigation et à chaque rechargement — trois cartes à rouvrir une par une pour
 * retrouver ce qu'on regardait il y a dix secondes.
 *
 * Drapeau POSITIF (`stepsOpen === true`), à l'inverse de `stepsEnabled` : le
 * défaut reste fermé, et pour la raison qui l'a fait replier — trois cartes
 * dépliées repoussent hors de l'écran les objectifs chiffrés, ce que la carte
 * mesure. Les cartes existantes ne portent rien et restent donc fermées.
 */
export function stepsOpenOf(cat: { stepsOpen?: boolean } | null | undefined): boolean {
  return cat?.stepsOpen === true;
}

/** Les étapes telles qu'elles sont STOCKÉES, drapeau ignoré. Réservé aux
 *  écritures : patcher la liste à partir de la version filtrée l'effacerait
 *  d'un coup sur une carte dont les étapes sont éteintes. */
export function readStepsRaw(cat: { steps?: unknown } | null | undefined): LifeStep[] {
  const raw = cat && Array.isArray(cat.steps) ? cat.steps : [];
  return raw
    .filter((s): s is Partial<LifeStep> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      id: String(s.id ?? newStepId()),
      label: String(s.label ?? ""),
      due: s.due ? String(s.due).slice(0, 10) : null,
      done: Boolean(s.done),
      doneAt: s.doneAt ? String(s.doneAt) : null,
      /* Un rang n'est PAS un nombre reconstruit à la lecture : l'index du
         tableau ferait l'affaire une fois, puis figerait l'ordre d'insertion
         comme s'il avait été voulu. `null` dit « jamais rangée », et c'est ce
         que `sortSteps` a besoin de distinguer. */
      pos: typeof s.pos === "number" && Number.isFinite(s.pos) ? s.pos : null,
    }));
}

/**
 * Les étapes d'une carte, quelle que soit son ancienneté : une carte créée
 * avant cette fonctionnalité n'a pas de champ `steps`.
 *
 * Le filtre du drapeau est ICI, et non chez les appelants : XP, jalons de la
 * frise, avancement de la carte et affichage lisent tous cette fonction. Une
 * carte dont les étapes sont éteintes doit disparaître de TOUS ces calculs à la
 * fois — un gel à moitié appliqué donnerait un pourcentage qu'aucun écran
 * n'explique.
 */
export function readSteps(cat: { steps?: unknown; stepsEnabled?: boolean } | null | undefined): LifeStep[] {
  return stepsEnabledOf(cat) ? readStepsRaw(cat) : [];
}

/* ── Objectifs chiffrés rattachés aux étapes ───────────────────────────── */

/** Avancements (0–100) des objectifs chiffrés, groupés par id d'étape. */
export type StepGoalPcts = Record<string, number[]>;

/**
 * Range les avancements par étape. Un objectif sans `rpgStep` — le cas normal,
 * rattaché à la carte mais à aucun jalon — n'entre pas dans le dictionnaire.
 *
 * `known` restreint aux étapes qui existent encore : un objectif qui pointe vers
 * une étape supprimée redevient un objectif libre de la carte, sans quoi son
 * avancement disparaîtrait de tous les calculs sans que rien ne l'affiche.
 */
export function groupGoalPctsByStep(
  goals: { rpgStep?: string | null; pct?: number }[],
  known?: Iterable<string>,
): StepGoalPcts {
  const allowed = known ? new Set(known) : null;
  const out: StepGoalPcts = {};
  for (const g of goals || []) {
    const sid = g?.rpgStep ? String(g.rpgStep) : null;
    if (!sid || (allowed && !allowed.has(sid))) continue;
    (out[sid] = out[sid] || []).push(Math.max(0, Math.min(100, Number(g.pct) || 0)));
  }
  return out;
}

/** Les objectifs de `step` dans un dictionnaire d'avancements. */
export function goalPctsOf(byStep: StepGoalPcts | undefined, stepId: string): number[] {
  return (byStep && byStep[stepId]) || [];
}

/**
 * Avancement d'une étape, en pourcentage.
 *
 * Sans objectif rattaché, une étape ne connaît que 0 ou 100 : c'est un jalon, il
 * est franchi ou il ne l'est pas. Avec des objectifs, elle vaut leur moyenne —
 * « à mi-chemin de la certification » est une information que la case à cocher
 * ne pouvait pas porter.
 */
export function stepCompletion(step: LifeStep, goalPcts: number[] = []): number {
  if (step.done) return 100;
  if (goalPcts.length === 0) return 0;
  return goalPcts.reduce((s, p) => s + p, 0) / goalPcts.length;
}

/**
 * Étape franchie — à la main, ou parce que ses objectifs sont tous atteints.
 *
 * Le second cas est DÉRIVÉ, jamais écrit dans le store : si un objectif
 * redescend sous sa cible (une moyenne, un capital), l'étape se rouvre d'
 * elle-même. Un `done` figé aurait menti dès le lendemain.
 */
export function isStepDone(step: LifeStep, goalPcts: number[] = []): boolean {
  return step.done || (goalPcts.length > 0 && goalPcts.every((p) => p >= 100));
}

/* ── Ordre et état ─────────────────────────────────────────────────────── */

/**
 * La liste a-t-elle été rangée à la main ?
 *
 * TOUT OU RIEN, et c'est la seule règle qui évite un ordre à moitié voulu : dès
 * qu'un rang manque, on ne saurait pas où glisser l'étape orpheline sans
 * l'inventer — au milieu d'une liste rangée, elle se poserait là où personne ne
 * l'a mise. `moveStep` renumérote donc toujours la liste ENTIÈRE, et `addStep`
 * prolonge la numérotation quand elle existe déjà : les deux états, « jamais
 * rangée » et « rangée », sont les seuls atteignables.
 */
export function hasManualOrder(steps: LifeStep[]): boolean {
  return steps.length > 0 && steps.every((s) => typeof s.pos === "number");
}

/**
 * Ordre VOULU s'il y en a un, CHRONOLOGIQUE sinon — les non datées à la fin.
 *
 * Une main qui range gagne toujours contre le calendrier : c'est tout le sens du
 * geste, et un tri qui remettrait l'étape à sa date annulerait le déplacement
 * sous les yeux de celui qui vient de le faire. Le chronologique reste le défaut
 * des cartes qu'on n'a jamais rangées — dont toutes celles d'avant le
 * glisser-déposer.
 *
 * Les étapes franchies ne descendent pas en bas de liste : elles restent à leur
 * place dans le temps. C'est ce qui fait la lecture d'une frise — le chemin
 * parcouru et celui qui reste, sur le même axe.
 */
export function sortSteps(steps: LifeStep[]): LifeStep[] {
  if (hasManualOrder(steps)) {
    return [...steps]
      .map((s, i) => ({ s, i }))
      // À rangs égaux (données recopiées d'une carte à l'autre), l'ordre du
      // tableau tranche : deux étapes ne doivent jamais permuter d'un rendu à
      // l'autre.
      .sort((a, b) => ((a.s.pos as number) - (b.s.pos as number)) || (a.i - b.i))
      .map((x) => x.s);
  }
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
export function stepStatus(step: LifeStep, today: string, goalPcts: number[] = []): StepStatus {
  if (isStepDone(step, goalPcts)) return "done";
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

/**
 * `pct` est la moyenne des avancements d'étape, et non la part de cases cochées :
 * une étape à mi-chemin de ses objectifs compte pour une demie. Sans objectif
 * rattaché, les deux formules donnent le même chiffre.
 */
export function stepsProgress(steps: LifeStep[], today: string, byStep: StepGoalPcts = {}): StepsProgress {
  const total = steps.length;
  let done = 0, late = 0, sum = 0;
  for (const s of steps) {
    const pcts = goalPctsOf(byStep, s.id);
    if (isStepDone(s, pcts)) done += 1;
    if (stepStatus(s, today, pcts) === "late") late += 1;
    sum += stepCompletion(s, pcts);
  }
  return { done, total, late, pct: total === 0 ? 0 : Math.round(sum / total) };
}

/* ── Avancement d'une carte ────────────────────────────────────────────────
   Deux mesures honnêtes peuvent coexister : les objectifs chiffrés rattachés
   et les étapes franchies. On en fait la moyenne plutôt que d'en élire une —
   un objectif mené par ses jalons est aussi légitime qu'un objectif mené par
   ses chiffres, et ne compter que les seconds affichait 0 % à quelqu'un qui
   avance vraiment. Sans ni l'un ni l'autre, repli sur la progression de niveau
   (habitudes, tâches, discipline), comme avant.

   `goalPcts` ne porte que les objectifs LIBRES de la carte : ceux rattachés à
   une étape comptent déjà dans la mesure des étapes, et les additionner des deux
   côtés donnerait un double poids aux objectifs les mieux rangés.
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
  byStep?: StepGoalPcts;
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
    measures.push(stepsProgress(steps, input.today, input.byStep).pct);
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
  /* Sur une liste rangée à la main, le nouveau jalon se pose AU BOUT — un rang
     de plus que le dernier. Sans lui il n'aurait pas de rang du tout, la liste
     cesserait d'être « rangée » et retomberait d'un coup en ordre
     chronologique : un ajout effacerait le rangement. */
  const pos = hasManualOrder(steps)
    ? Math.max(...steps.map((s) => s.pos as number)) + 1
    : null;
  return [...steps, { id: newStepId(), label, due: input.due || null, done: false, doneAt: null, pos }];
}

/**
 * Déplace une étape avant ou après une autre — le glisser-déposer de la carte.
 *
 * Part de l'ordre AFFICHÉ (`sortSteps`) et non du tableau stocké : c'est la
 * liste qu'on voit qu'on réarrange, et sur une carte encore triée par date les
 * deux ne coïncident pas. Renumérote ensuite tout le monde — voir
 * `hasManualOrder` pour le pourquoi du tout ou rien.
 *
 * Le tableau rendu est lui-même dans l'ordre voulu : les rangs disent l'ordre,
 * mais une liste stockée en désordre ferait mentir toute lecture brute.
 */
export function moveStep(
  steps: LifeStep[],
  sourceId: string,
  targetId: string,
  mode: "before" | "after" = "before",
): LifeStep[] {
  if (!sourceId || !targetId || sourceId === targetId) return steps;
  const ordered = sortSteps(steps);
  const from = ordered.findIndex((s) => s.id === sourceId);
  if (from < 0 || !ordered.some((s) => s.id === targetId)) return steps;

  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  // La cible est cherchée APRÈS le retrait : son index a pu reculer d'un cran.
  const at = next.findIndex((s) => s.id === targetId) + (mode === "after" ? 1 : 0);
  next.splice(at, 0, moved);
  return next.map((s, i) => ({ ...s, pos: i }));
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
  byStep: StepGoalPcts = {},
): UpcomingStep<C>[] {
  const all: UpcomingStep<C>[] = [];
  for (const cat of cats) {
    for (const step of readSteps(cat)) {
      if (isStepDone(step, goalPctsOf(byStep, step.id)) || !step.due) continue;
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

/** Jalons de toutes les cartes, placés sur le rail de l'année.
 *
 *  `done` est calculé ici — les objectifs atteints d'une étape la franchissent
 *  sans que `step.done` bouge, et la frise doit montrer la même chose que la
 *  carte. */
export function yearMarkers<C extends { id?: string; color?: string; label?: string; steps?: unknown }>(
  cats: C[],
  year: number,
  byStep: StepGoalPcts = {},
): { step: LifeStep; cat: C; left: number; done: boolean }[] {
  const out: { step: LifeStep; cat: C; left: number; done: boolean }[] = [];
  for (const cat of cats) {
    for (const step of readSteps(cat)) {
      const left = yearPosition(step.due, year);
      if (left === null) continue;
      out.push({ step, cat, left, done: isStepDone(step, goalPctsOf(byStep, step.id)) });
    }
  }
  return out.sort((a, b) => a.left - b.left);
}
