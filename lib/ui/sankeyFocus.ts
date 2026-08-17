/**
 * Ce qu'un survol allume dans un diagramme de flux, et ce qu'il éteint.
 *
 * Le dessin est dans `components/ui/SankeyGraph`, la géométrie dans
 * `lib/ui/sankeyGraph` ; ici, la seule question de LECTURE que pose le survol :
 * quand la souris se pose sur une branche, qu'est-ce qui la concerne ?
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 *
 * • LA BRANCHE SURVOLÉE, ET SA CHAÎNE. « Logement » allume aussi « Loyer » et
 *   « Charges » : ce sont les mêmes euros, un cran plus loin. On remonte et on
 *   descend donc le graphe depuis le nœud survolé, en emportant les liens.
 *
 * • ON S'ARRÊTE AU CARREFOUR. Le nœud central — celui où tout se rejoint ET d'où
 *   tout repart (`in > 1` et `out > 1`) — est un mur : le franchir ferait
 *   s'allumer, depuis « Logement », les cinq autres postes et toutes les
 *   entrées, c'est-à-dire la figure entière. Un survol qui allume tout n'apprend
 *   rien.
 *
 * • ET ON N'ÉTEINT QUE SON CÔTÉ. Les entrées ne se comparent pas aux sorties :
 *   d'où vient l'argent ne dit rien sur le poste qu'on regarde, et l'atténuer
 *   ferait clignoter la moitié du dessin sans raison. La zone qui s'atténue est
 *   donc celle qui est bornée par les murs rencontrés — à droite du carrefour
 *   quand on survole un poste, à gauche quand on survole une entrée.
 *
 * Le résultat est un intervalle de COLONNES (`from`, `to`) et deux ensembles :
 * ce qui reste à pleine encre. Tout ce qui tombe dans l'intervalle sans être
 * dans les ensembles s'atténue ; tout ce qui est hors de l'intervalle ne bouge
 * pas.
 */

export interface FocusNode {
  id: string;
  column: number;
}

export interface FocusLink {
  id: string;
  source: string;
  target: string;
}

export interface SankeyFocus {
  /** Nœuds à garder à pleine encre — le survolé et sa chaîne. */
  nodes: Set<string>;
  /** Liens à garder à pleine encre. */
  links: Set<string>;
  /**
   * Colonnes que le survol concerne, bornes EXCLUES : une colonne `c` s'atténue
   * si `from < c < to`. `-Infinity` / `+Infinity` quand aucun mur n'a été
   * rencontré de ce côté-là.
   */
  from: number;
  to: number;
}

/**
 * Ce que le survol de `hovered` allume.
 *
 * Rend `null` si le nœud n'existe pas — un id venu d'un rendu précédent ne doit
 * pas éteindre la figure.
 */
export function sankeyFocus(
  nodes: FocusNode[],
  links: FocusLink[],
  hovered: string | null | undefined,
): SankeyFocus | null {
  if (!hovered) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = byId.get(hovered);
  if (!start) return null;

  const out = new Map<string, FocusLink[]>();
  const into = new Map<string, FocusLink[]>();
  const push = (m: Map<string, FocusLink[]>, key: string, l: FocusLink): void => {
    const list = m.get(key);
    if (list) list.push(l);
    else m.set(key, [l]);
  };
  for (const l of links) {
    if (!byId.has(l.source) || !byId.has(l.target)) continue;
    push(out, l.source, l);
    push(into, l.target, l);
  }

  /* Le mur : un nœud que tout traverse. Le nœud survolé n'en est jamais un pour
     lui-même — survoler le carrefour allume alors les deux côtés, ce qui est la
     réponse juste à « montre-moi ce qui passe par là ». */
  const isWall = (id: string): boolean =>
    id !== hovered && (into.get(id)?.length ?? 0) > 1 && (out.get(id)?.length ?? 0) > 1;

  const keptNodes = new Set<string>([hovered]);
  const keptLinks = new Set<string>();
  let from = -Infinity;
  let to = Infinity;

  const walk = (id: string, dir: "up" | "down"): void => {
    const edges = (dir === "down" ? out.get(id) : into.get(id)) ?? [];
    for (const l of edges) {
      const nextId = dir === "down" ? l.target : l.source;
      if (isWall(nextId)) {
        // Le mur borne la zone ; le lien qui y mène reste allumé, il est la fin
        // visible de la chaîne.
        const c = byId.get(nextId)!.column;
        if (dir === "down") to = Math.min(to, c);
        else from = Math.max(from, c);
        keptLinks.add(l.id);
        continue;
      }
      if (keptNodes.has(nextId)) continue;
      keptLinks.add(l.id);
      keptNodes.add(nextId);
      walk(nextId, dir);
    }
  };

  walk(hovered, "down");
  walk(hovered, "up");

  return { nodes: keptNodes, links: keptLinks, from, to };
}

/** Le nœud d'une colonne est-il dans la zone que le survol concerne ? */
export const inFocusRange = (focus: SankeyFocus, column: number): boolean =>
  column > focus.from && column < focus.to;

/**
 * Le lien est-il dans la zone ?
 *
 * Un lien touche deux colonnes, dont l'une peut être celle du mur : il compte
 * comme intérieur dès que la colonne d'où il part est en deçà du mur de droite
 * et celle où il arrive au-delà du mur de gauche. Sans quoi les liens qui
 * ABOUTISSENT au carrefour (les entrées vers le budget) s'atténueraient en même
 * temps que ceux qui en PARTENT.
 */
export const linkInFocusRange = (focus: SankeyFocus, sourceCol: number, targetCol: number): boolean =>
  sourceCol < focus.to && targetCol > focus.from;
