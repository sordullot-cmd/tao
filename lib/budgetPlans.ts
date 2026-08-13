/**
 * Plans de budget — modèle partagé.
 *
 * La page Budget en tient plusieurs (un plan = un revenu et ses catégories) ;
 * la synthèse Patrimoine n'en montre qu'un, le PRINCIPAL. Ces règles de lecture
 * vivaient dans la page Budget, seule à les connaître : elles sont ici pour que
 * les deux écrans lisent le même budget de la même façon.
 *
 * Le budget principal est le PREMIER plan de la liste — pas le plan actif, qui
 * n'est qu'un état de navigation dans la page Budget : la synthèse afficherait
 * sinon un plan différent selon le dernier onglet ouvert.
 */

export const BUDGET_STORAGE_KEY = "tr4de_budget_plans";
export const BUDGET_CLOUD_KEY = "budget_plans";

export interface BudgetItem {
  id: string;
  label: string;
  /** Part du revenu, en % — source de vérité quand `fixed` est faux. */
  pct?: number;
  /** Montant figé, en devise — source de vérité quand `fixed` est vrai. */
  amount?: number | null;
  fixed?: boolean;
  color?: string;
}

export interface BudgetPlan {
  id: string;
  name: string;
  income: number;
  items: BudgetItem[];
}

export interface BudgetStore {
  plans: BudgetPlan[];
  activeId?: string;
}

/** Plans du store, vides plutôt qu'`undefined` : le store peut venir d'une
 *  version antérieure ou d'un cloud tronqué. */
export function plansOf(store: BudgetStore | null | undefined): BudgetPlan[] {
  return Array.isArray(store?.plans) ? store!.plans : [];
}

/** Le budget principal : le premier de la liste. `null` s'il n'y en a aucun. */
export function primaryPlan(store: BudgetStore | null | undefined): BudgetPlan | null {
  return plansOf(store)[0] || null;
}

/** Vrai pour le plan principal — sert à poser la couronne. */
export function isPrimaryPlan(store: BudgetStore | null | undefined, planId: string): boolean {
  return primaryPlan(store)?.id === planId;
}

/* Les deux lectures d'une catégorie, selon son mode.
   `fixed` ⇒ `amount` fait foi : une somme figée ne suit pas les variations du
   revenu, c'est sa PART qui se recalcule. Sinon `pct` fait foi.
   Le pourcentage dérivé n'est pas borné à 100 : un montant figé plus grand que
   le revenu doit apparaître comme un dépassement. */
export const pctOf = (it: BudgetItem, income: number): number =>
  it.fixed ? (income > 0 ? ((it.amount || 0) / income) * 100 : 0) : (it.pct || 0);

export const amountOf = (it: BudgetItem, income: number): number =>
  it.fixed ? (it.amount || 0) : ((it.pct || 0) / 100) * income;

export interface PlanTotals {
  income: number;
  /** Somme des parts, en % — peut dépasser 100. */
  totalPct: number;
  /** Ce qui reste une fois toutes les catégories servies ; négatif en dépassement. */
  rest: number;
  over: boolean;
  /** Catégories décorées de leur part et de leur montant, ordre du plan conservé. */
  rows: Array<BudgetItem & { pct: number; amount: number }>;
}

export function planTotals(plan: BudgetPlan | null | undefined): PlanTotals {
  const income = plan?.income || 0;
  const items = Array.isArray(plan?.items) ? plan!.items : [];
  const rows = items.map((it) => ({ ...it, pct: pctOf(it, income), amount: amountOf(it, income) }));
  const totalPct = rows.reduce((s, r) => s + r.pct, 0);
  return { income, totalPct, rest: income * (1 - totalPct / 100), over: totalPct > 100, rows };
}
