/**
 * Le cashflow en GRAPHE à quatre colonnes, pour un Sankey multi-niveaux.
 *
 * `buildCashflow` répond déjà à « d'où vient l'argent, où va-t-il », et il fait
 * le travail délicat : l'écrêtage des petits postes, et la mise en balance des
 * deux côtés par un nœud « reste » ou « puisé sur le solde ». Ce module ne
 * refait rien de tout ça — il l'appelle, puis ajoute la colonne qui manquait :
 *
 *   sources ──▶ budget ──▶ postes ──▶ sous-postes
 *
 * Le quatrième niveau vient de `spendingByCategory`, qui détaille déjà chaque
 * poste. La règle de dépliage est la sienne : un poste à sous-poste unique rend
 * une liste VIDE, parce que le redire sous son propre nom avec le même chiffre
 * n'apprend rien. Ce poste reste donc une branche terminale, et le dessin le
 * pousse au bord droit (cf. `lib/ui/sankeyGraph`).
 *
 * ── Ce que ce module N'ajoute PAS ───────────────────────────────────────────
 * Aucun libellé. Comme `cashflow`, il porte un `kind` et une référence métier,
 * et c'est l'appelant qui nomme : les noms dépendent de la langue, et ce module
 * se teste sans dictionnaire.
 *
 * Aucune couleur nouvelle non plus, ou presque : les postes gardent la teinte
 * qu'ils ont sur la page Budget, et un sous-poste prend celle de SON poste,
 * éclaircie d'un cran par rang. C'est ce qui permet de lire « ces deux rubans
 * sortent du même poste » sans suivre le trait jusqu'à sa source.
 */

import {
  spendingByCategory,
  type CategorizableTransaction, type SubSlice,
} from "@/lib/bank/categories";
import { buildCashflow, type CashflowOptions } from "@/lib/bank/cashflow";
import { tint } from "@/lib/ui/color";

/** Ce qu'un nœud représente — l'appelant en tire son libellé. */
export type GraphNodeKind =
  /**
   * Une source de revenus : `ref` est un sous-poste de « revenus », et `source`
   * le nom de celui qui paie quand le relevé l'a dit — c'est LUI qu'on affiche
   * alors, `ref` ne servant plus que de repli.
   */
  | "income"
  /** Le nœud central, celui que tout traverse. `ref` vaut `hub`. */
  | "hub"
  /** Un poste de dépense : `ref` est un poste de `SPENDING_CATEGORIES`. */
  | "category"
  /** Un sous-poste : `ref` est le sous-poste, `parent` son poste. */
  | "sub"
  /** Un nœud fabriqué : `more`, `left`, `draw` ou `subMore`. */
  | "synthetic";

export interface CashflowGraphNode {
  /** Unique DANS LE GRAPHE — un même sous-poste peut exister sous deux postes. */
  id: string;
  kind: GraphNodeKind;
  /** L'identifiant métier : sous-poste, poste, ou nom du nœud de synthèse. */
  ref: string;
  /** Poste d'appartenance, pour les seuls nœuds `sub` et `subMore`. */
  parent?: string;
  /**
   * Qui paie, pour les seuls nœuds `income` (cf. `lib/bank/payer`) — `null`
   * quand le libellé ne le disait pas. C'est le nom à afficher quand il existe :
   * `ref` ne porte alors que la NATURE de l'entrée, qui sert de repli.
   */
  source?: string | null;
  color: string;
  /** Toujours POSITIF : un flux se dessine dans un sens, pas en négatif. */
  amount: number;
  /** Nombre d'opérations — ou de postes regroupés, pour `more` et `subMore`. */
  count: number;
}

export interface CashflowGraphLink {
  source: string;
  target: string;
  value: number;
}

export interface CashflowGraph {
  nodes: CashflowGraphNode[];
  links: CashflowGraphLink[];
  income: number;
  spent: number;
  net: number;
  total: number;
}

export interface CashflowGraphOptions extends CashflowOptions {
  /** Sous-postes montrés par poste. Au-delà, ils sont regroupés en `subMore`. */
  topSubs?: number;
}

export const HUB_ID = "hub";

/* Éclaircissement par rang de sous-poste. Le premier n'est PAS à zéro : sans
   écart, le plus gros sous-poste se confond avec la barre de son poste, juste à
   côté de lui, et on croit voir un seul ruban qui traverse. */
const SUB_TINT_BASE = 0.12;
const SUB_TINT_STEP = 0.17;
const SUB_TINT_MAX = 0.66;

const subTint = (i: number): number => Math.min(SUB_TINT_BASE + i * SUB_TINT_STEP, SUB_TINT_MAX);

/**
 * Le graphe d'une fenêtre, prêt à dessiner.
 *
 * Les montants ne sont ni recalculés ni arrondis ici : ils viennent tels quels
 * de `buildCashflow` et de `spendingByCategory`, qui les ont déjà arrondis au
 * centime. Les ré-arrondir ferait dériver la somme des sous-postes de celle de
 * leur poste, et un Sankey qui ne conserve pas se voit tout de suite.
 */
export function buildCashflowGraph(
  txs: CategorizableTransaction[],
  { topSubs = 3, ...options }: CashflowGraphOptions = {},
): CashflowGraph {
  const flow = buildCashflow(txs, options);
  const { slices } = spendingByCategory(txs);
  /* Clé en `string` et non en `SpendingCategory` : les nœuds de `buildCashflow`
     portent un id générique (un poste, mais aussi `more` ou `left`), et c'est
     avec celui-là qu'on interroge la table. Un id de synthèse n'y trouve rien,
     ce qui est exactement le comportement voulu. */
  const subsOf = new Map<string, SubSlice[]>(slices.map((s) => [s.id, s.subs]));

  const nodes: CashflowGraphNode[] = [];
  const links: CashflowGraphLink[] = [];

  /* Rien à dessiner : on rend un graphe vide plutôt qu'un nœud central seul,
     qui se lirait comme « le budget est à zéro » là où il n'y a pas de donnée. */
  if (flow.total <= 0) {
    return { nodes, links, income: flow.income, spent: flow.spent, net: flow.net, total: flow.total };
  }

  nodes.push({
    id: HUB_ID, kind: "hub", ref: HUB_ID,
    color: flow.net < 0 ? "#C05A46" : "#2C72C3",
    amount: flow.total, count: 0,
  });

  /* ── Colonne 0 : les sources ──────────────────────────────────────────────
     L'`id` d'une source porte le payeur quand il y en a un (« income.salary#
     Unowhy ») : c'est ce qui sépare deux employeurs dans le dessin. Ce n'est
     donc plus une référence métier, et `ref` reprend le seul sous-poste — sans
     quoi l'appelant chercherait une clé de traduction sous un nom propre. */
  for (const n of flow.inflows) {
    const id = `in:${n.id}`;
    nodes.push({
      id,
      kind: n.kind === "synthetic" ? "synthetic" : "income",
      ref: n.sub ?? n.id, source: n.source ?? null,
      color: n.color, amount: n.amount, count: n.count,
    });
    links.push({ source: id, target: HUB_ID, value: n.amount });
  }

  /* ── Colonne 2 : les postes, puis colonne 3 : leurs sous-postes ───────── */
  for (const n of flow.outflows) {
    const id = `cat:${n.id}`;
    nodes.push({
      id,
      kind: n.kind === "synthetic" ? "synthetic" : "category",
      ref: n.id, color: n.color, amount: n.amount, count: n.count,
    });
    links.push({ source: HUB_ID, target: id, value: n.amount });

    // Les nœuds de synthèse ne se déplient pas : « reste » n'a pas de détail, et
    // « autres postes » en a un, mais c'est la liste sous le dessin qui le porte.
    if (n.kind !== "category") continue;

    for (const sub of clipSubs(subsOf.get(n.id) ?? [], topSubs)) {
      const subId = `sub:${n.id}:${sub.id}`;
      nodes.push({
        id: subId,
        kind: sub.rest ? "synthetic" : "sub",
        ref: sub.rest ? "subMore" : sub.id,
        parent: n.id,
        color: tint(n.color, subTint(sub.rank)),
        amount: sub.amount,
        count: sub.count,
      });
      links.push({ source: id, target: subId, value: sub.amount });
    }
  }

  return { nodes, links, income: flow.income, spent: flow.spent, net: flow.net, total: flow.total };
}

interface ClippedSub {
  id: string;
  amount: number;
  count: number;
  rank: number;
  /** Vrai pour le nœud qui regroupe la queue ; `count` porte alors son NOMBRE. */
  rest: boolean;
}

/**
 * Les `top` premiers sous-postes, la queue regroupée — et seulement quand il y a
 * plus d'un sous-poste à regrouper.
 *
 * Sinon le nœud de regroupement remplacerait un sous-poste nommé par un
 * « + 1 autre », ce qui ne fait que perdre son nom sans rien gagner en place.
 * C'est la règle de `clip` dans `cashflow`, appliquée un niveau plus bas.
 */
function clipSubs(
  subs: { id: string; amount: number; count: number }[],
  top: number,
): ClippedSub[] {
  const rows = subs.map((s, i) => ({ ...s, rank: i, rest: false }));
  if (rows.length <= top + 1) return rows;

  const head = rows.slice(0, top);
  const tail = rows.slice(top);
  head.push({
    id: "__rest",
    amount: tail.reduce((s, r) => s + r.amount, 0),
    count: tail.length,
    rank: top,
    rest: true,
  });
  return head;
}
