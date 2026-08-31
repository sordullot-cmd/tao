/**
 * Ordre manuel de la liste « Tous les comptes ».
 *
 * La liste mêle deux natures — une firme (dépliable sur ses comptes) et un
 * compte sans firme — que la page rendait en deux passes, firmes d'abord. Les
 * réordonner à la main demandait donc d'abord de les mettre sur UN seul rang :
 * c'est ce que fait `orderEntries`, et c'est ce qui permet de glisser un compte
 * autonome entre deux firmes.
 *
 * L'ordre est stocké en clair, comme une simple liste d'identifiants préfixés
 * (`firm:…` / `acc:…`), dans `user_productivity` via `useCloudState` — aucune
 * colonne à ajouter aux tables des comptes, et rien à migrer quand un compte
 * change de firme.
 *
 * Le stock n'est jamais purgé à l'écriture : un compte archivé puis restauré, ou
 * une firme rattachée à un autre appareil pendant qu'on triait, retrouve sa
 * place au lieu d'atterrir en bas de liste. Ce sont les LECTURES qui ignorent ce
 * qui n'existe plus (cf. `orderEntries`), la même règle que `normalizeStore`.
 */

/** Une ligne de premier niveau, quelle que soit sa nature. */
export interface OrderableEntry {
  /** Identifiant préfixé, stable entre deux sessions. */
  id: string;
}

/** Bord de la ligne visée par le dépôt. */
export type DropEdge = "before" | "after";

/**
 * Les lignes dans l'ordre choisi par l'utilisateur.
 *
 * Ce qui n'est pas dans `order` garde sa place NATURELLE plutôt que d'être
 * repoussé à la fin : une firme créée aujourd'hui apparaît là où elle serait
 * apparue sans tri manuel — en tête, puisque `firms` précède les comptes
 * autonomes — et non sous un compte qu'on avait pris soin de descendre. Un tri
 * partiel ne réorganise donc que ce qu'il nomme.
 */
export function orderEntries<T extends OrderableEntry>(entries: T[], order: unknown): T[] {
  const rank = new Map<string, number>();
  if (Array.isArray(order)) {
    order.forEach((id, i) => {
      if (typeof id === "string" && !rank.has(id)) rank.set(id, i);
    });
  }
  if (rank.size === 0) return entries;

  /* Tri STABLE sur le rang connu, les inconnus prenant celui de leur voisin de
     gauche : `Array.prototype.sort` est stable depuis ES2019, deux lignes de
     même rang restent donc dans leur ordre d'origine. */
  let last = -1;
  const keyed = entries.map((entry) => {
    const known = rank.get(entry.id);
    if (known !== undefined) last = known;
    // `+0.5` : un inconnu se pose APRÈS son voisin de gauche, jamais devant.
    return { entry, key: known !== undefined ? known : last + 0.5 };
  });

  return keyed
    .map((k, i) => ({ ...k, i }))
    .sort((a, b) => (a.key === b.key ? a.i - b.i : a.key - b.key))
    .map((k) => k.entry);
}

/**
 * L'ordre après un déplacement, à écrire tel quel.
 *
 * Il est reconstruit depuis la liste AFFICHÉE et non depuis l'ordre stocké : ce
 * dernier peut nommer des lignes disparues et taire des lignes récentes, si bien
 * qu'y insérer un identifiant ne dirait rien de l'endroit qu'on voit. Le
 * résultat est donc toujours complet — c'est aussi ce qui fixe, du même coup, la
 * place des lignes qui n'avaient pas encore été triées.
 */
export function moveEntry<T extends OrderableEntry>(
  entries: T[],
  sourceId: string,
  targetId: string,
  edge: DropEdge,
): string[] {
  const ids = entries.map((e) => e.id);
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || sourceId === targetId) return ids;

  const without = ids.filter((id) => id !== sourceId);
  // La cible est retrouvée APRÈS le retrait : son index a pu reculer d'un cran.
  const at = without.indexOf(targetId);
  without.splice(edge === "before" ? at : at + 1, 0, sourceId);
  return without;
}
