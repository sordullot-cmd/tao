/**
 * Cashflow — ce qui entre, ce qui sort, ce qu'il reste.
 *
 * `lib/bank/categories` répond déjà à « où part l'argent » : elle répartit les
 * DÉBITS par poste. Le flux d'un mois demande deux choses de plus, et c'est tout
 * ce que ce module ajoute :
 *   — d'où vient l'argent, source par source — et « source » veut dire QUI paie
 *     (« Unowhy », « CAF ») quand le libellé le dit, pas seulement de quelle
 *     nature est l'entrée : « Revenus » en face d'un ruban ne fait que répéter
 *     le côté du diagramme où il se trouve ;
 *   — la mise en balance des deux côtés, pour qu'un diagramme de flux se
 *     dessine sans mentir.
 *
 * La règle du partage entre entrée et dépense est celle de `categories`, pas une
 * nouvelle : une opération dont le poste est « revenus » est une ENTRÉE ; un
 * crédit qu'une règle de dépense a reconnu (remboursement de pharmacie, avoir
 * d'un marchand) reste sur SON poste, en déduction. Sans quoi le même euro
 * gonflerait à la fois les entrées et les dépenses du mois.
 *
 * Conséquence assumée : un virement reçu d'un particulier (« VIR SEPA RECU DE
 * M. MARTIN ») tombe dans le poste « virements » et vient en déduction de ce
 * poste, plutôt que d'apparaître comme une entrée. C'est le comportement de
 * l'anneau des dépenses depuis toujours ; le changer ici ferait dire deux choses
 * différentes à deux graphiques de la même page.
 *
 * ── La mise en balance ─────────────────────────────────────────────────────
 * Un diagramme de flux CONSERVE : ce qui entre à gauche ressort à droite. Le
 * relevé, lui, ne s'équilibre jamais tout seul. On ferme donc le bilan par un
 * nœud, et un seul :
 *   — entrées > dépenses ⇒ un nœud de sortie « reste » ;
 *   — dépenses > entrées ⇒ un nœud d'entrée « puisé sur le solde ».
 * Le second n'est pas une faute de lecture : payer plus que ce qu'on encaisse
 * dans la fenêtre est courant (un mois à deux loyers, un achat sur l'épargne).
 * Le nommer vaut mieux que de laisser un diagramme déséquilibré.
 *
 * Module PUR : pas de React, pas de `t()`. Les nœuds portent un `kind` et un
 * `id` ; c'est l'appelant qui les nomme, parce que les libellés dépendent de la
 * langue et que ce module est testé sans dictionnaire.
 */

import { PALETTE_LIGHT, GREY } from "@/lib/ui/palette";

import {
  categoryColor, incomeColor, parentOfSub, subcategorizeTransaction,
  spendingByCategory,
  type CategorizableTransaction, type SpendingSubcategory,
} from "@/lib/bank/categories";
import { payerOf } from "@/lib/bank/payer";
import { tint } from "@/lib/ui/color";

/** Ce qu'un nœud du flux représente — l'appelant en tire son libellé. */
export type FlowKind =
  /** Une source de revenus : `id` est un sous-poste de « revenus ». */
  | "income"
  /** Un poste de dépense : `id` est un poste de `SPENDING_CATEGORIES`. */
  | "category"
  /** Un nœud de synthèse : `more`, `left` ou `draw`. Voir `FlowSynthetic`. */
  | "synthetic";

/** Les trois nœuds que ce module fabrique lui-même. */
export type FlowSynthetic =
  /** Les postes écrêtés, regroupés — `count` porte leur NOMBRE de postes. */
  | "more"
  /** Ce qui n'a pas été dépensé sur la fenêtre. */
  | "left"
  /** Ce qui a été dépensé en plus de ce qui est entré. */
  | "draw";

export interface FlowNode {
  id: string;
  kind: FlowKind;
  color: string;
  /** Toujours POSITIF : un flux se dessine dans un sens, pas en négatif. */
  amount: number;
  /** Nombre d'opérations — de postes pour le nœud « more », 0 pour les autres. */
  count: number;
  /** Sous-poste de « revenus » — nœuds `income` seulement (cf. `IncomeSlice`). */
  sub?: SpendingSubcategory;
  /** Nom du payeur lu sur le libellé — nœuds `income` seulement, `null` sinon. */
  source?: string | null;
}

export interface IncomeSlice {
  /**
   * Unique DANS LA LISTE : le sous-poste seul quand le payeur n'a pas de nom,
   * `sous-poste#payeur` sinon. Ce n'est donc plus un identifiant de sous-poste —
   * c'est `sub` qui le porte, et lui seul qui sert de clé de libellé.
   */
  id: string;
  /** Sous-poste de « revenus » : `income.salary`, ou `income` pour le divers. */
  sub: SpendingSubcategory;
  /**
   * Qui paie, lu sur le libellé (« Unowhy », « Martin »), `null` quand le relevé
   * ne le dit pas. C'est le nom à AFFICHER quand il existe : « Unowhy » répond à
   * « d'où vient cet argent » là où « Revenus » ne fait que répéter la question.
   */
  source: string | null;
  color: string;
  amount: number;
  count: number;
  /** Part du total encaissé, en %. */
  pct: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/* Un flux sous ce seuil ne se dessine plus et n'apprend rien : deux centimes de
   régularisation feraient un nœud de plus dans le diagramme et une ligne de plus
   dans la liste. Ils restent comptés dans les totaux. */
const CRUMB = 0.5;

/* Écart de teinte entre deux payeurs d'un même sous-poste. Le premier garde la
   couleur pleine du sous-poste : c'est la source principale, et l'éclaircir la
   ferait passer pour une variante de quelque chose d'autre. Les suivants
   s'éclaircissent d'un cran chacun — assez pour les distinguer côte à côte, pas
   assez pour quitter la famille de couleur du sous-poste. */
const PAYER_TINT_STEP = 0.16;
const PAYER_TINT_MAX = 0.56;

/**
 * Entrées d'argent réparties par source, de la plus grosse à la plus petite.
 *
 * Une « source » n'est pas seulement une NATURE d'entrée (salaire, aide,
 * remboursement) : c'est d'abord QUI paie. Deux salaires versés par deux
 * employeurs sont deux sources, et les fondre sous un unique « Salaire » perd
 * précisément ce qu'on regarde un flux pour savoir. Le regroupement se fait donc
 * sur le couple (sous-poste, payeur) — le payeur étant lu sur le libellé par
 * `lib/bank/payer`, qui rend `null` dès qu'il n'y a pas de nom lisible. Un
 * relevé avare en libellés retombe alors exactement sur l'ancien comportement :
 * une ligne par sous-poste.
 *
 * Seules comptent les opérations dont le POSTE est « revenus » (cf. en-tête).
 * Un débit classé là — cas théorique, aucune règle ne le produit — est ignoré
 * plutôt que compté en négatif : une source de revenus qui retire de l'argent
 * n'a pas de sens dans un flux.
 */
export function incomeBySource(txs: CategorizableTransaction[]): {
  slices: IncomeSlice[];
  total: number;
  count: number;
} {
  const sums = new Map<string, {
    sub: SpendingSubcategory; source: string | null; amount: number; count: number;
  }>();
  let count = 0;

  for (const tx of txs) {
    if (tx.amount <= 0) continue;
    const sub = subcategorizeTransaction(tx);
    if (parentOfSub(sub) !== "income") continue;
    const source = payerOf(tx);
    const id = source ? `${sub}#${source}` : sub;
    const bucket = sums.get(id) ?? { sub, source, amount: 0, count: 0 };
    bucket.amount += tx.amount;
    bucket.count += 1;
    sums.set(id, bucket);
    count += 1;
  }

  const rows = [...sums.entries()]
    .map(([id, b]) => ({ id, sub: b.sub, source: b.source, amount: round2(b.amount), count: b.count }))
    .filter((r) => r.amount >= CRUMB)
    .sort((a, b) => b.amount - a.amount);

  /* La teinte se décide APRÈS le tri, par rang dans son sous-poste : le plus
     gros payeur d'un sous-poste garde sa couleur pleine, les suivants
     s'éclaircissent. Fait avant le tri, l'ordre des teintes serait celui des
     opérations du relevé, donc arbitraire. */
  const rank = new Map<SpendingSubcategory, number>();
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));

  return {
    slices: rows.map((r) => {
      const i = rank.get(r.sub) ?? 0;
      rank.set(r.sub, i + 1);
      const base = incomeColor(r.sub);
      return {
        ...r,
        color: i === 0 ? base : tint(base, Math.min(i * PAYER_TINT_STEP, PAYER_TINT_MAX)),
        pct: total > 0 ? (r.amount / total) * 100 : 0,
      };
    }),
    total,
    count,
  };
}

/* Teintes des nœuds de synthèse. Ils ne SONT pas des postes, et une couleur de
   poste leur donnerait l'air d'en être un : les deux agrégats restent donc gris.
   « Pris sur le solde » fait exception — c'est une ENTRÉE, il se range donc du
   côté gauche avec les revenus. Mais ce n'en est PAS un : c'est de l'argent
   qu'on avait déjà. Toute la branche des revenus étant bleue, il prend le rose
   vif, seul de sa teinte dans cette colonne. On le repère sans le lire, et on ne
   le compte pas mentalement comme une rentrée. */
const SYNTHETIC_COLORS: Record<FlowSynthetic, string> = {
  more: GREY.grey500,
  left: GREY.grey300,
  draw: PALETTE_LIGHT.purple,
};

export interface CashflowOptions {
  /** Postes de dépense montrés à part. Au-delà, ils sont regroupés en « more ». */
  topOutflows?: number;
  /** Sources de revenus montrées à part. Au-delà, elles sont regroupées aussi. */
  topInflows?: number;
  /**
   * Ce qui fait une source : QUI paie (défaut), ou seulement la NATURE de
   * l'entrée.
   *
   * `payer` est ce que veut une liste, qui a la place de nommer chaque employeur
   * et de les chiffrer un par un. `nature` est ce que veut un diagramme : deux
   * salaires y font deux rubans dont l'un est souvent un trait, et la colonne
   * des entrées finit plus détaillée que celle des dépenses — alors qu'un flux
   * se regarde pour l'inverse. Les payeurs restent lisibles dans la liste sous
   * le dessin, qui appelle `incomeBySource` directement.
   */
  groupIncome?: "payer" | "nature";
}

export interface Cashflow {
  /** Sources, du plus gros au plus petit, « puisé sur le solde » en dernier. */
  inflows: FlowNode[];
  /** Postes, du plus gros au plus petit, « reste » en dernier. */
  outflows: FlowNode[];
  /** Total encaissé sur la fenêtre. */
  income: number;
  /** Total dépensé, net des remboursements. */
  spent: number;
  /** `income - spent` — négatif quand on a dépensé plus qu'encaissé. */
  net: number;
  /** Somme de chaque côté du diagramme, les deux étant égales par construction. */
  total: number;
}

/**
 * Le flux d'une fenêtre, prêt à dessiner : deux listes équilibrées.
 *
 * L'écrêtage n'est pas cosmétique : il y a vingt-huit postes et le diagramme
 * n'en distingue pas vingt-huit. Les plus petits sont donc regroupés sous un
 * nœud unique, qui dit COMBIEN de postes il rassemble — un « autres » muet
 * laisserait croire à un poste réel. La liste complète, elle, reste sous le
 * diagramme : rien n'est caché, seulement rassemblé.
 */
export function buildCashflow(
  txs: CategorizableTransaction[],
  { topOutflows = 8, topInflows = 5, groupIncome = "payer" }: CashflowOptions = {},
): Cashflow {
  const { slices: spending, total: spent } = spendingByCategory(txs);
  const { slices: incomes, total: income } = incomeBySource(txs);

  /* Le regroupement par nature se fait AVANT l'écrêtage : deux salaires fondus
     en un seul pèsent leur somme, et ce qui n'aurait pas tenu dans les cinq
     premières sources y tient une fois rassemblé. Après l'écrêtage, ils se
     seraient d'abord fait couper, puis auraient été refondus à un — ce qui aurait
     produit un « + N autres » là où il n'y avait plus rien à regrouper. */
  const inflows = clip(
    (groupIncome === "nature" ? byNature(incomes) : incomes).map<FlowNode>((s) => ({
      id: s.id, kind: "income", color: s.color, amount: s.amount, count: s.count,
      sub: s.sub, source: s.source,
    })),
    topInflows,
  );

  const outflows = clip(
    spending
      .filter((s) => s.amount >= CRUMB)
      .map<FlowNode>((s) => ({
        id: s.id, kind: "category", color: categoryColor(s.id), amount: s.amount, count: s.count,
      })),
    topOutflows,
  );

  /* La fermeture du bilan. Sous le seuil des miettes on ne l'ajoute pas : un
     nœud « reste : 0,12 € » ne dit rien et prend une ligne dans la légende. */
  const net = round2(income - spent);
  if (net >= CRUMB) outflows.push(synthetic("left", net));
  else if (net <= -CRUMB) inflows.push(synthetic("draw", -net));

  const total = round2(Math.max(
    inflows.reduce((s, n) => s + n.amount, 0),
    outflows.reduce((s, n) => s + n.amount, 0),
  ));

  return { inflows, outflows, income, spent, net, total };
}

/**
 * Les sources refondues sur leur seule NATURE : un salaire est un salaire, quel
 * que soit l'employeur qui le verse.
 *
 * La teinte redevient celle du sous-poste, pleine : l'éclaircissement par rang
 * de payeur (cf. `PAYER_TINT_STEP`) n'a plus rien à distinguer, et garder la
 * couleur du plus gros payeur ferait dépendre la teinte d'un classement qui
 * n'existe plus. `source` retombe à `null`, ce qui est exact — la ligne ne
 * désigne plus personne en particulier — et suffit à ce que l'appelant reprenne
 * le libellé de la nature.
 */
function byNature(slices: IncomeSlice[]): IncomeSlice[] {
  const sums = new Map<SpendingSubcategory, IncomeSlice>();
  for (const s of slices) {
    const merged = sums.get(s.sub);
    if (merged) {
      merged.amount = round2(merged.amount + s.amount);
      merged.count += s.count;
      merged.pct += s.pct;
    } else {
      sums.set(s.sub, {
        ...s, id: s.sub, source: null, color: incomeColor(s.sub),
      });
    }
  }
  return [...sums.values()].sort((a, b) => b.amount - a.amount);
}

const synthetic = (id: FlowSynthetic, amount: number, count = 0): FlowNode => ({
  id, kind: "synthetic", color: SYNTHETIC_COLORS[id], amount: round2(amount), count,
});

/** Les `top` premiers nœuds, la queue regroupée sous « more » quand il y en a
 *  plus d'un à regrouper — sinon le nœud « more » remplacerait un poste nommé
 *  par un « + 1 autre poste », ce qui ne fait que perdre son nom. */
function clip(nodes: FlowNode[], top: number): FlowNode[] {
  if (nodes.length <= top + 1) return nodes;
  const head = nodes.slice(0, top);
  const tail = nodes.slice(top);
  const amount = tail.reduce((s, n) => s + n.amount, 0);
  head.push(synthetic("more", amount, tail.length));
  return head;
}
