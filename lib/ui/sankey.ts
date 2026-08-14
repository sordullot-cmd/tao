/**
 * Géométrie d'un diagramme de flux (Sankey) à un seul nœud central.
 *
 * Le cas traité est celui du cashflow, et lui seul : N sources convergent vers
 * un nœud, qui repart vers M destinations. Pas de niveaux intermédiaires, pas de
 * graphe à démêler — donc pas d'algorithme de placement itératif : l'ordre est
 * celui que l'appelant donne (le plus gros d'abord), et il n'y a rien à
 * optimiser puisque deux rubans ne peuvent pas se croiser.
 *
 * Ce qui EST calculé ici, et qui mérite d'être testé sans navigateur :
 *   — l'échelle, commune aux deux côtés : un même montant doit donner la même
 *     épaisseur à gauche et à droite, sans quoi le diagramme ne conserve plus
 *     rien et ne veut plus rien dire ;
 *   — les deux empilements, espacés au bord (on lit les nœuds un par un) et
 *     jointifs au centre (on lit la convergence) ;
 *   — le seuil d'épaisseur minimale, et la reprise de l'excédent qu'il crée.
 *
 * Le dessin, lui, est dans `components/ui/SankeyFlow`.
 */

export interface SankeyFlowInput {
  id: string;
  color: string;
  /** Toujours positif. Un flux nul est ignoré : il n'a pas d'épaisseur. */
  amount: number;
}

export interface SankeyBand {
  id: string;
  color: string;
  amount: number;
  side: "in" | "out";
  /** Épaisseur du ruban, en px — constante d'un bout à l'autre. */
  thickness: number;
  /** Ruban rempli, contour fermé : à peindre en `fill`, jamais en `stroke`. */
  path: string;
  /** Le nœud en bout de ruban, contre le bord du dessin. */
  node: { x: number; y: number; w: number; h: number };
  /** Ancre du libellé : hors du nœud, du côté du bord. `anchor` suit `side`. */
  label: { x: number; y: number; anchor: "start" | "end" };
}

export interface SankeyLayout {
  width: number;
  height: number;
  /** Le nœud central, celui que tout traverse. */
  hub: { x: number; y: number; w: number; h: number };
  bands: SankeyBand[];
}

export interface SankeyOptions {
  width: number;
  height: number;
  /** Largeur des nœuds (les barres verticales). */
  nodeW?: number;
  /** Espace entre deux nœuds voisins, au bord. */
  gap?: number;
  /** Épaisseur en dessous de laquelle un ruban ne se verrait plus. */
  minBand?: number;
  /** Place réservée aux libellés, à gauche et à droite. 0 = pas de libellés. */
  gutter?: number;
  /** Marge au-dessus du dessin — le nom du nœud central s'y écrit. */
  padTop?: number;
}

/**
 * Épaisseurs d'une pile, à l'échelle donnée puis relevées au minimum.
 *
 * Le minimum crée une dette : trois rubans relevés de 1 à 3 px, c'est 6 px que
 * la pile n'avait pas. On la reprend sur les rubans qui peuvent la payer — ceux
 * au-dessus du minimum —, au prorata de leur épaisseur. Un seul passage : la
 * reprise ne peut pas ramener un ruban sous le minimum puisqu'elle est bornée à
 * la part de chacun, et l'écart résiduel (quelques px sur une pile de 300) ne se
 * voit pas.
 */
function thicknesses(amounts: number[], scale: number, minBand: number, usable: number): number[] {
  const raw = amounts.map((a) => Math.max(a * scale, minBand));
  const debt = raw.reduce((s, h) => s + h, 0) - usable;
  if (debt <= 0.01) return raw;

  const payable = raw.reduce((s, h) => s + Math.max(h - minBand, 0), 0);
  if (payable <= 0) return raw;
  const ratio = Math.min(debt / payable, 1);
  return raw.map((h) => h - Math.max(h - minBand, 0) * ratio);
}

/** Une pile de rubans : leur `y` de départ, la pile étant centrée sur `height`. */
function stack(heights: number[], gap: number, height: number, padTop: number): number[] {
  const span = heights.reduce((s, h) => s + h, 0) + gap * Math.max(heights.length - 1, 0);
  let y = padTop + (height - span) / 2;
  return heights.map((h) => {
    const at = y;
    y += h + gap;
    return at;
  });
}

/** Ruban entre deux verticales, d'épaisseur constante. Deux courbes cubiques
 *  symétriques, tangentes horizontales aux deux bouts : le flux part et arrive
 *  à plat contre son nœud, comme un tuyau, sans coude visible. */
function ribbon(x0: number, y0: number, x1: number, y1: number, h: number): string {
  const cx = (x0 + x1) / 2;
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    `M${r(x0)},${r(y0)}`,
    `C${r(cx)},${r(y0)} ${r(cx)},${r(y1)} ${r(x1)},${r(y1)}`,
    `L${r(x1)},${r(y1 + h)}`,
    `C${r(cx)},${r(y1 + h)} ${r(cx)},${r(y0 + h)} ${r(x0)},${r(y0 + h)}`,
    "Z",
  ].join(" ");
}

/**
 * Le dessin complet, en pixels.
 *
 * `inflows` et `outflows` sont supposés ÉQUILIBRÉS (cf. `lib/bank/cashflow`) ;
 * s'ils ne le sont pas, chaque côté est centré sur sa propre hauteur et le
 * déséquilibre se voit — ce qui vaut mieux que de le corriger en silence.
 */
export function sankeyLayout(
  inflows: SankeyFlowInput[],
  outflows: SankeyFlowInput[],
  {
    width, height, nodeW = 10, gap = 6, minBand = 3, gutter = 0, padTop = 0,
  }: SankeyOptions,
): SankeyLayout {
  const ins = inflows.filter((f) => f.amount > 0);
  const outs = outflows.filter((f) => f.amount > 0);

  const sum = (list: SankeyFlowInput[]) => list.reduce((s, f) => s + f.amount, 0);
  const totalIn = sum(ins);
  const totalOut = sum(outs);
  const total = Math.max(totalIn, totalOut);

  const hubW = nodeW + 4; // le nœud central est le seul qu'on ne compte pas deux fois
  const hubX = (width - hubW) / 2;
  const inNodeX = gutter;
  const outNodeX = width - gutter - nodeW;

  if (total <= 0 || ins.length + outs.length === 0 || outNodeX <= inNodeX + nodeW) {
    return { width, height, hub: { x: hubX, y: padTop, w: hubW, h: 0 }, bands: [] };
  }

  /* L'ÉCHELLE est commune aux deux côtés : c'est elle qui fait qu'un même
     montant a la même épaisseur à gauche et à droite. On prend la plus serrée
     des deux, sinon le côté le plus peuplé (ses espaces compris) déborderait. */
  const usableIn = Math.max(height - gap * Math.max(ins.length - 1, 0), 1);
  const usableOut = Math.max(height - gap * Math.max(outs.length - 1, 0), 1);
  const scale = Math.min(
    totalIn > 0 ? usableIn / totalIn : Infinity,
    totalOut > 0 ? usableOut / totalOut : Infinity,
  );

  const hIn = thicknesses(ins.map((f) => f.amount), scale, minBand, usableIn);
  const hOut = thicknesses(outs.map((f) => f.amount), scale, minBand, usableOut);

  // Au bord : les nœuds sont espacés, on les lit un par un. Au centre : les
  // rubans sont jointifs, c'est la convergence qu'on lit.
  const yIn = stack(hIn, gap, height, padTop);
  const yOut = stack(hOut, gap, height, padTop);
  const yHubIn = stack(hIn, 0, height, padTop);
  const yHubOut = stack(hOut, 0, height, padTop);

  const bands: SankeyBand[] = [
    ...ins.map((f, i) => ({
      id: f.id,
      color: f.color,
      amount: f.amount,
      side: "in" as const,
      thickness: hIn[i],
      path: ribbon(inNodeX + nodeW, yIn[i], hubX, yHubIn[i], hIn[i]),
      node: { x: inNodeX, y: yIn[i], w: nodeW, h: hIn[i] },
      label: { x: inNodeX - 8, y: yIn[i] + hIn[i] / 2, anchor: "end" as const },
    })),
    ...outs.map((f, i) => ({
      id: f.id,
      color: f.color,
      amount: f.amount,
      side: "out" as const,
      thickness: hOut[i],
      path: ribbon(hubX + hubW, yHubOut[i], outNodeX, yOut[i], hOut[i]),
      node: { x: outNodeX, y: yOut[i], w: nodeW, h: hOut[i] },
      label: { x: outNodeX + nodeW + 8, y: yOut[i] + hOut[i] / 2, anchor: "start" as const },
    })),
  ];

  /* Le nœud central couvre les deux piles : quand les deux côtés ne pèsent pas
     pareil, la barre montre l'union — le côté le plus lourd donne sa hauteur. */
  const tops = [...yHubIn, ...yHubOut];
  const bottoms = [...yHubIn.map((y, i) => y + hIn[i]), ...yHubOut.map((y, i) => y + hOut[i])];
  const top = Math.min(...tops);
  const bottom = Math.max(...bottoms);

  return { width, height, hub: { x: hubX, y: top, w: hubW, h: bottom - top }, bands };
}
