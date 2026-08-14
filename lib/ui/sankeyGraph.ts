/**
 * Géométrie d'un diagramme de flux (Sankey) à PLUSIEURS niveaux.
 *
 * `lib/ui/sankey` traite le cas à un seul nœud central — N sources, un total, M
 * postes — et il le fait bien. Il ne sait pas déplier un poste : « Logement »
 * y est une branche terminale, alors que la question suivante (« le loyer ou
 * les charges ? ») est justement celle qu'on se pose en le voyant. Ce module
 * répond à celle-là : un graphe quelconque de nœuds et de liens, réparti en
 * colonnes, chaque colonne précisant la précédente.
 *
 * Les deux coexistent volontairement. Celui-ci est plus général, donc plus
 * lourd — il ordonne, il équilibre, il démêle. Là où un seul niveau suffit, le
 * précédent reste le bon outil.
 *
 * ── Ce qui est calculé ici ──────────────────────────────────────────────────
 *
 * • LES COLONNES. Chaque nœud est placé à la profondeur du plus long chemin qui
 *   y mène, et les FEUILLES sont ramenées à la dernière colonne. Sans ce
 *   recalage, un poste sans détail (« Santé », qui n'a qu'un sous-poste)
 *   s'arrêterait à mi-parcours et le bord droit du dessin deviendrait un
 *   escalier. On préfère un ruban long et un bord net.
 *
 * • L'ÉCHELLE, commune à TOUTES les colonnes. C'est la propriété qui fait qu'un
 *   Sankey veut dire quelque chose : 400 € doit avoir la même épaisseur en
 *   colonne 1 et en colonne 3, sinon le dessin ne conserve plus rien. On prend
 *   donc l'échelle de la colonne la plus contrainte, et les autres respirent.
 *
 * • L'ORDRE DANS CHAQUE COLONNE, balayé de gauche à droite : un nœud se range
 *   d'après la hauteur de son parent. C'est ce qui évite les croisements — sur
 *   un arbre (notre cas : chaque sous-poste n'a qu'un poste), ça les supprime
 *   tous, sans relaxation itérative.
 *
 * • L'EMPILEMENT DES LIENS contre chaque nœud, trié par la hauteur du nœud d'en
 *   face. Deux rubans qui partent du même nœud ne doivent pas se croiser entre
 *   eux non plus.
 *
 * • L'ANCRE DES PASTILLES de libellé. Le dessin, lui, est dans
 *   `components/ui/SankeyGraph`.
 */

export interface SankeyGraphNode {
  id: string;
  /** Teinte du nœud. Les rubans en héritent, de la source vers la cible. */
  color: string;
}

export interface SankeyGraphLink {
  source: string;
  target: string;
  /** Toujours positif. Un lien de valeur nulle est ignoré : pas d'épaisseur. */
  value: number;
}

export interface SankeyGraphNodeBox {
  id: string;
  color: string;
  /** Ce qui traverse le nœud : le plus gros de ce qui entre et de ce qui sort. */
  value: number;
  column: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Où poser la pastille du libellé : `after` à droite du nœud, `before` à sa
   * gauche. La première colonne n'a rien à sa gauche et prend `after` ; partout
   * ailleurs la pastille se pose AU BOUT des rubans qui arrivent, contre le
   * nœud — c'est là que l'œil cherche le nom de ce qu'il vient de suivre.
   */
  labelSide: "before" | "after";
  /** Bord de la pastille du côté du nœud : le texte part de là, vers l'extérieur. */
  labelX: number;
  /** Hauteur de la pastille, une fois les voisines écartées (cf. `labelGap`). */
  labelY: number;
  /** Milieu du nœud. Diffère de `labelY` quand l'écartement a déplacé la pastille. */
  centreY: number;
}

export interface SankeyGraphLinkBand {
  /** `source→target`, unique puisqu'un couple ne porte qu'un lien. */
  id: string;
  source: string;
  target: string;
  value: number;
  /** Épaisseur du ruban, en px — constante d'un bout à l'autre. */
  thickness: number;
  /** Ruban rempli, contour fermé : à peindre en `fill`, jamais en `stroke`. */
  path: string;
  /** Bornes horizontales du ruban. */
  x0: number;
  x1: number;
  sourceColor: string;
  targetColor: string;
  /**
   * La teinte à PEINDRE, en aplat.
   *
   * C'est celle du bout DISTINCTIF du ruban, et les deux bouts ne se valent pas :
   * un nœud où beaucoup de choses se rejoignent (le budget, que tout traverse)
   * n'a pas de couleur qui apprenne quoi que ce soit — peindre les entrées de sa
   * teinte les rendrait toutes identiques. On prend donc la couleur de la source
   * quand la cible est un tel confluent, et celle de la cible partout ailleurs.
   * Chaque ruban porte ainsi la couleur de ce qu'il DÉSIGNE, et se rattache à la
   * pastille qui le nomme.
   */
  color: string;
}

export interface SankeyGraphLayout {
  width: number;
  height: number;
  /** Nombre de colonnes — 1 de plus que la profondeur maximale. */
  columns: number;
  nodes: SankeyGraphNodeBox[];
  links: SankeyGraphLinkBand[];
}

export interface SankeyGraphOptions {
  width: number;
  height: number;
  /** Largeur des barres verticales. */
  nodeW?: number;
  /** Jour entre deux nœuds voisins d'une même colonne. */
  nodeGap?: number;
  /** Épaisseur en dessous de laquelle un ruban ne se verrait plus. */
  minBand?: number;
  /** Marge au-dessus du dessin. */
  padTop?: number;
  /** Écart entre le bord du nœud et sa pastille. */
  labelPad?: number;
  /**
   * Hauteur d'une pastille : deux voisines d'une même colonne ne s'approchent
   * pas plus que ça. 0 = pas d'écartement, chaque pastille reste sur son nœud.
   */
  labelGap?: number;
}

/* ── Outils ─────────────────────────────────────────────────────────────── */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Allers-retours de relaxation, et amortissement entre deux (cf. plus bas). */
const RELAX_PASSES = 3;
const RELAX_DAMPING = 0.7;

/**
 * Épaisseurs d'une colonne, à l'échelle donnée puis relevées au minimum.
 *
 * Le minimum crée une dette : trois rubans relevés de 1 à 3 px, c'est 6 px que
 * la colonne n'avait pas. On la reprend sur ceux qui peuvent la payer — les
 * nœuds au-dessus du minimum —, au prorata. Un seul passage suffit : la reprise
 * est bornée à la part de chacun, elle ne peut donc pas repasser un nœud sous le
 * minimum, et l'écart résiduel ne se voit pas sur une colonne de 400 px.
 */
function fitColumn(values: number[], scale: number, minBand: number, usable: number): number[] {
  const raw = values.map((v) => Math.max(v * scale, minBand));
  const debt = raw.reduce((s, h) => s + h, 0) - usable;
  if (debt <= 0.01) return raw;

  const payable = raw.reduce((s, h) => s + Math.max(h - minBand, 0), 0);
  if (payable <= 0) return raw;
  const ratio = Math.min(debt / payable, 1);
  return raw.map((h) => h - Math.max(h - minBand, 0) * ratio);
}

/**
 * Une colonne redémêlée : triée par hauteur, puis décollée à `gap` près.
 *
 * Deux passes, et il en faut deux : la première pousse vers le bas depuis le
 * haut, ce qui peut faire sortir le dernier nœud par le bas ; la seconde le
 * rattrape en remontant. Sans elle, un nœud déborderait du dessin à chaque
 * itération de la relaxation, et l'erreur s'accumulerait.
 */
function resolveColumn(col: Work[], gap: number, top: number, bottom: number): void {
  if (col.length === 0) return;
  col.sort((a, b) => a.y - b.y);

  let y = top;
  for (const n of col) {
    if (n.y < y) n.y = y;
    y = n.y + n.h + gap;
  }

  let z = bottom;
  for (let i = col.length - 1; i >= 0; i--) {
    const n = col[i];
    if (n.y + n.h > z) n.y = z - n.h;
    z = n.y - gap;
  }
}

/**
 * Pastilles d'une colonne écartées d'au moins `minGap`, sans quitter le dessin.
 *
 * Un ruban fin porte une pastille de la même hauteur qu'un ruban épais : trois
 * petits sous-postes voisins suffisent à empiler trois libellés au même endroit.
 * On les pousse donc vers le bas, puis on rattrape le débordement vers le haut.
 * Le nom finit à quelques pixels du milieu de son nœud, ce qui se lit encore
 * (les deux sont côte à côte) là où deux textes superposés ne se lisent plus —
 * et le dessin trace un trait de rappel quand l'écart devient trop grand.
 *
 * `centres` est supposé CROISSANT : c'est l'ordre d'empilement de la colonne.
 */
function spreadLabels(centres: number[], minGap: number, top: number, bottom: number): number[] {
  if (minGap <= 0 || centres.length === 0) return centres.slice();
  const ys = centres.slice();
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + minGap);

  if (ys[ys.length - 1] > bottom) {
    ys[ys.length - 1] = bottom;
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - minGap);
    // Plus de place du tout (beaucoup de nœuds, peu de hauteur) : on repart du
    // haut, les pastilles se serrent alors à `minGap`, régulièrement.
    if (ys[0] < top) for (let i = 0; i < ys.length; i++) ys[i] = top + i * minGap;
  }
  return ys;
}

/**
 * Ruban entre deux verticales, d'épaisseur constante.
 *
 * Deux cubiques symétriques, tangentes horizontales aux deux bouts : le flux
 * part et arrive à plat contre son nœud, comme un tuyau. Les points de contrôle
 * sont au tiers et aux deux tiers de la course — à la moitié la courbe part trop
 * vite et deux rubans voisins se touchent au milieu.
 */
function ribbon(x0: number, y0: number, x1: number, y1: number, h: number): string {
  const c0 = x0 + (x1 - x0) * 0.38;
  const c1 = x0 + (x1 - x0) * 0.62;
  const r = round2;
  return [
    `M${r(x0)},${r(y0)}`,
    `C${r(c0)},${r(y0)} ${r(c1)},${r(y1)} ${r(x1)},${r(y1)}`,
    `L${r(x1)},${r(y1 + h)}`,
    `C${r(c1)},${r(y1 + h)} ${r(c0)},${r(y0 + h)} ${r(x0)},${r(y0 + h)}`,
    "Z",
  ].join(" ");
}

/* ── Le dessin ──────────────────────────────────────────────────────────── */

interface Work {
  id: string;
  color: string;
  column: number;
  value: number;
  h: number;
  y: number;
  x: number;
  out: string[];
  in: string[];
}

/**
 * Le dessin complet, en pixels.
 *
 * Les liens dont la source ou la cible est inconnue sont IGNORÉS plutôt que de
 * faire échouer le calcul : la donnée vient d'un classement deviné, un
 * identifiant orphelin est un bug de règle, pas une raison de ne rien afficher.
 *
 * Le graphe est supposé sans cycle. S'il en contient un, les nœuds qu'il
 * enferme retombent en colonne 0 — le dessin est alors faux, mais il se dessine,
 * ce qui rend le problème visible au lieu de le taire.
 */
export function sankeyGraphLayout(
  nodes: SankeyGraphNode[],
  links: SankeyGraphLink[],
  {
    width, height, nodeW = 10, nodeGap = 14, minBand = 3,
    padTop = 0, labelPad = 10, labelGap = 0,
  }: SankeyGraphOptions,
): SankeyGraphLayout {
  const byId = new Map<string, Work>();
  for (const n of nodes) {
    if (byId.has(n.id)) continue; // un id doublé écraserait le premier en silence
    byId.set(n.id, {
      id: n.id, color: n.color, column: 0, value: 0,
      h: 0, y: 0, x: 0, out: [], in: [],
    });
  }

  const edges = links.filter(
    (l) => l.value > 0 && byId.has(l.source) && byId.has(l.target) && l.source !== l.target,
  );

  const empty: SankeyGraphLayout = { width, height, columns: 0, nodes: [], links: [] };
  if (byId.size === 0 || edges.length === 0 || width <= nodeW || height <= 0) return empty;

  const valueOf = new Map<string, number>();
  for (const l of edges) {
    const s = byId.get(l.source)!;
    const t = byId.get(l.target)!;
    s.out.push(l.target);
    t.in.push(l.source);
    valueOf.set(`${l.source}→${l.target}`, (valueOf.get(`${l.source}→${l.target}`) ?? 0) + l.value);
  }

  /* Un nœud PÈSE le plus gros de ce qui entre et de ce qui sort. Les deux sont
     égaux quand le graphe conserve ; quand il ne conserve pas (un poste dont on
     n'a détaillé qu'une partie), c'est le côté le plus lourd qui donne la
     hauteur, et le manque se voit comme un vide sous le nœud. */
  const sumOf = (ids: string[], self: string, dir: "in" | "out"): number =>
    ids.reduce((s, other) => s + (valueOf.get(dir === "in" ? `${other}→${self}` : `${self}→${other}`) ?? 0), 0);

  for (const n of byId.values()) {
    n.value = Math.max(sumOf(n.in, n.id, "in"), sumOf(n.out, n.id, "out"));
  }

  /* LES COLONNES. Profondeur = plus long chemin depuis une racine, calculée dans
     l'ordre topologique de Kahn. Les nœuds pris dans un cycle ne sont jamais
     défilés et gardent la colonne 0 (cf. en-tête). */
  const indeg = new Map<string, number>();
  for (const n of byId.values()) indeg.set(n.id, n.in.length);
  const queue = [...byId.values()].filter((n) => n.in.length === 0).map((n) => n.id);
  for (let head = 0; head < queue.length; head++) {
    const n = byId.get(queue[head])!;
    for (const next of n.out) {
      const t = byId.get(next)!;
      t.column = Math.max(t.column, n.column + 1);
      const left = (indeg.get(next) ?? 1) - 1;
      indeg.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  const maxCol = Math.max(...[...byId.values()].map((n) => n.column));
  // Les feuilles au bord droit : sinon le bord du dessin devient un escalier.
  for (const n of byId.values()) if (n.out.length === 0) n.column = maxCol;

  const columns: Work[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const n of nodes) {
    const w = byId.get(n.id);
    if (w && w.value > 0) columns[w.column].push(w); // l'ordre d'entrée sert de départ
  }

  const live = columns.filter((c) => c.length > 0);
  if (live.length === 0) return empty;

  /* L'ÉCHELLE, commune à toutes les colonnes : la plus serrée gagne. Une échelle
     par colonne rendrait chaque colonne « pleine » et ferait mentir le dessin —
     c'est précisément ce qu'un Sankey ne doit pas faire. */
  const scale = Math.min(
    ...live.map((col) => {
      const total = col.reduce((s, n) => s + n.value, 0);
      const usable = Math.max(height - nodeGap * (col.length - 1), 1);
      return total > 0 ? usable / total : Infinity;
    }),
  );
  if (!Number.isFinite(scale) || scale <= 0) return empty;

  const colX = (k: number): number => (maxCol === 0 ? 0 : (k * (width - nodeW)) / maxCol);

  /* Balayage GAUCHE→DROITE : on ordonne chaque colonne d'après la hauteur déjà
     fixée de la précédente, puis on l'empile. Sur un arbre, ça suffit à ne
     produire aucun croisement (cf. en-tête). */
  for (let k = 0; k <= maxCol; k++) {
    const col = columns[k];
    if (col.length === 0) continue;

    if (k > 0) {
      const rank = new Map(col.map((n, i) => [n.id, i]));
      col.sort((a, b) => {
        const pa = parentCentre(a, byId);
        const pb = parentCentre(b, byId);
        if (pa !== pb) return pa - pb;
        // Même parent : l'ordre d'entrée tranche (l'appelant trie par montant).
        return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
      });
    }

    const usable = Math.max(height - nodeGap * (col.length - 1), 1);
    const hs = fitColumn(col.map((n) => n.value), scale, minBand, usable);
    const span = hs.reduce((s, h) => s + h, 0) + nodeGap * (col.length - 1);
    let y = padTop + (height - span) / 2;
    col.forEach((n, i) => {
      n.h = hs[i];
      n.y = y;
      n.x = colX(k);
      y += hs[i] + nodeGap;
    });
  }

  /* LA RELAXATION. L'empilement ci-dessus centre chaque colonne SUR ELLE-MÊME :
     une colonne peu peuplée se retrouve donc au milieu du dessin pendant que ses
     enfants s'étalent du haut en bas, et les rubans traversent la figure en
     diagonale sans qu'aucune donnée ne le justifie. On rapproche chaque nœud du
     barycentre de ses voisins — pondéré par les montants, pour qu'un gros ruban
     tire plus fort qu'un petit —, en alternant les deux sens, puis on redémêle
     la colonne. Trois allers-retours suffisent, amortis pour ne pas osciller :
     au-delà, le dessin ne bouge plus à l'œil. */
  const barycentre = (n: Work, ids: string[], dir: "in" | "out"): number | null => {
    let sum = 0;
    let weight = 0;
    for (const other of new Set(ids)) {
      const o = byId.get(other);
      const v = valueOf.get(dir === "in" ? `${other}→${n.id}` : `${n.id}→${other}`) ?? 0;
      if (!o || v <= 0) continue;
      sum += (o.y + o.h / 2) * v;
      weight += v;
    }
    return weight > 0 ? sum / weight : null;
  };

  const drift = (col: Work[], dir: "in" | "out", alpha: number): void => {
    for (const n of col) {
      const target = barycentre(n, dir === "in" ? n.in : n.out, dir);
      if (target != null) n.y += (target - (n.y + n.h / 2)) * alpha;
    }
    resolveColumn(col, nodeGap, padTop, padTop + height);
  };

  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    const alpha = RELAX_DAMPING ** pass;
    // Droite→gauche d'abord : ce sont les colonnes de gauche, moins peuplées,
    // qui ont de la place pour bouger. L'inverse les figerait tout de suite.
    for (let k = maxCol - 1; k >= 0; k--) drift(columns[k], "out", alpha);
    for (let k = 1; k <= maxCol; k++) drift(columns[k], "in", alpha);
  }

  /* L'EMPILEMENT DES LIENS contre chaque nœud. Trié par la hauteur du nœud d'en
     face : deux rubans issus du même nœud arrivent alors dans le même ordre
     qu'ils en partent, et ne se croisent pas entre eux. */
  const order = (ids: string[], key: (id: string) => number): string[] =>
    [...new Set(ids)].sort((a, b) => key(a) - key(b));

  const offOut = new Map<string, number>();
  const offIn = new Map<string, number>();
  const bands: SankeyGraphLinkBand[] = [];

  for (const n of [...byId.values()].sort((a, b) => a.column - b.column || a.y - b.y)) {
    for (const targetId of order(n.out, (id) => byId.get(id)!.y)) {
      const t = byId.get(targetId)!;
      const value = valueOf.get(`${n.id}→${targetId}`) ?? 0;
      if (value <= 0 || n.value <= 0 || t.value <= 0) continue;

      /* L'épaisseur d'un lien est sa PART du nœud, pas sa valeur mise à
         l'échelle : le nœud a pu être relevé au minimum ou rogné par la reprise
         de dette, et des rubans à l'échelle brute déborderaient alors de la
         barre à laquelle ils s'accrochent. On prend la plus fine des deux parts
         — celle qui tient des deux côtés. */
      const thickness = Math.min((value / n.value) * n.h, (value / t.value) * t.h);

      const y0 = n.y + (offOut.get(n.id) ?? 0);
      const y1 = t.y + (offIn.get(t.id) ?? 0);
      offOut.set(n.id, (offOut.get(n.id) ?? 0) + thickness);
      offIn.set(t.id, (offIn.get(t.id) ?? 0) + thickness);

      const x0 = n.x + nodeW;
      const x1 = t.x;
      bands.push({
        id: `${n.id}→${targetId}`,
        source: n.id,
        target: targetId,
        value,
        thickness: round2(thickness),
        path: ribbon(x0, y0, x1, y1, thickness),
        x0,
        x1,
        sourceColor: n.color,
        targetColor: t.color,
        // Cible « confluent » (plusieurs rubans y arrivent) : c'est la source qui
        // distingue. Sinon la cible, qui est ce que le ruban va nommer.
        color: t.in.length > 1 ? n.color : t.color,
      });
    }
  }

  /* Les pastilles sont écartées PAR COLONNE : deux libellés de colonnes
     différentes sont loin l'un de l'autre horizontalement, les faire s'éviter
     verticalement les déplacerait sans raison. */
  const boxes: SankeyGraphNodeBox[] = [];
  for (const col of columns) {
    const live = col.filter((n) => n.value > 0).sort((a, b) => a.y - b.y);
    if (live.length === 0) continue;
    const ys = spreadLabels(
      live.map((n) => n.y + n.h / 2),
      labelGap,
      padTop + labelGap / 2,
      padTop + height - labelGap / 2,
    );
    live.forEach((n, i) => {
      const before = n.column > 0;
      boxes.push({
        id: n.id,
        color: n.color,
        value: n.value,
        column: n.column,
        x: round2(n.x),
        y: round2(n.y),
        w: nodeW,
        h: round2(n.h),
        labelSide: before ? "before" : "after",
        labelX: round2(before ? n.x - labelPad : n.x + nodeW + labelPad),
        labelY: round2(ys[i]),
        centreY: round2(n.y + n.h / 2),
      });
    });
  }

  return { width, height, columns: maxCol + 1, nodes: boxes, links: bands };
}

/** Milieu du premier parent d'un nœud — sa place de rangement dans sa colonne. */
function parentCentre(n: Work, byId: Map<string, Work>): number {
  let best = Infinity;
  for (const id of n.in) {
    const p = byId.get(id);
    if (p) best = Math.min(best, p.y + p.h / 2);
  }
  return Number.isFinite(best) ? best : 0;
}
