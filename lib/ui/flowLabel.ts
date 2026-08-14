/**
 * Le nom d'un nœud du diagramme de flux.
 *
 * `lib/bank/cashflowGraph` construit le graphe sans un seul libellé : il porte un
 * `kind` et une référence métier, et laisse nommer l'appelant — les noms
 * dépendent de la langue. Deux pages appellent maintenant (Cashflow et Budget),
 * et la règle de nommage n'a rien de propre à l'une ou à l'autre : la voici une
 * fois, plutôt que deux copies qui divergeront au premier ajout.
 *
 * ── Les trois cas qui ne sont pas une simple traduction ─────────────────────
 *
 * • Les nœuds de SYNTHÈSE ont leurs propres clés — ce ne sont ni des postes ni
 *   des sources, et « + 4 autres postes » doit dire COMBIEN il en rassemble,
 *   sans quoi il passerait pour un poste réel.
 *
 * • Le sous-poste FOURRE-TOUT d'un poste (`housing` sous « Logement ») porte le
 *   nom de son poste : écrit juste à droite de lui dans le diagramme, ce serait
 *   le même mot deux fois de suite, et on croirait à un ruban qui ne mène nulle
 *   part. Il se dit donc « Divers », comme sous l'anneau des dépenses.
 *
 * • Une SOURCE se dit par sa nature (« Salaire & activité ») — le graphe
 *   regroupe les payeurs d'une même nature, le détail par payeur restant dans la
 *   liste des entrées, qui a la place de le chiffrer. Le nom de qui paie est
 *   repris dès qu'il existe, pour l'appelant qui redemanderait ce détail.
 */

import {
  categoryLabelKey, isCatchAllSub, subLabelKey, type SpendingCategory,
} from "@/lib/bank/categories";
import type { CashflowGraphNode } from "@/lib/bank/cashflowGraph";
import { t } from "@/lib/i18n";

export function flowLabel(node: CashflowGraphNode): string {
  switch (node.kind) {
    case "hub":
      return t("cashflow.hub");
    case "income":
      return node.source || t(subLabelKey(node.ref));
    case "category":
      // `ref` est bien un poste sur ce `kind` — c'est le graphe qui le garantit,
      // le type ne pouvant pas le dire d'un champ commun à tous les nœuds.
      return t(categoryLabelKey(node.ref as SpendingCategory));
    case "sub":
      return isCatchAllSub(node.ref) ? t("patrimoine.sub.divers") : t(subLabelKey(node.ref));
    default:
      return t(`cashflow.node.${node.ref}`).replace("{n}", String(node.count));
  }
}
