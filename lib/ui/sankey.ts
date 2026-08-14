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
 *   — les deux empilements, larges au bord et resserrés au centre, avec un jour
 *     entre deux rubans voisins de part et d'autre : jointifs, dix branches
 *     faisaient une masse dont on ne suivait plus une seule ;
 *   — le seuil d'épaisseur minimale, et la reprise de l'excédent qu'il crée ;
 *   — la position des libellés, écartés pour ne pas se chevaucher — c'est ce qui
 *     décide si le dessin se lit ou s'il faut le survoler pour le comprendre.
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
  /**
   * Le libellé : son ancre hors du nœud (du côté du bord), le centre du ruban
   * dont il parle, et — quand l'écartement l'a éloigné de ce centre — le trait
   * de rappel qui les relie. Sans ce trait, le nom d'une petite branche poussée
   * vers le bas semble désigner sa voisine.
   */
  label: {
    x: number;
    y: number;
    anchor: "start" | "end";
    centre: number;
    connector: string | null;
  };
  /** Bornes horizontales du ruban, pour un dégradé qui suit son sens. */
  from: number;
  to: number;
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
  /** Jour entre deux rubans voisins contre le nœud central. */
  hubGap?: number;
  /** Épaisseur en dessous de laquelle un ruban ne se verrait plus. */
  minBand?: number;
  /** Place réservée aux libellés, à gauche et à droite. 0 = pas de libellés. */
  gutter?: number;
  /** Marge au-dessus du dessin — le nom du nœud central s'y écrit. */
  padTop?: number;
  /** Hauteur d'un libellé : deux voisins ne s'approchent pas plus que ça. */
  labelGap?: number;
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

/**
 * Libellés écartés d'au moins `minGap`, sans quitter la fenêtre du dessin.
 *
 * Un ruban fin a un libellé de la même hauteur qu'un ruban épais : trois petites
 * branches voisines suffisent à empiler trois lignes de texte au même endroit.
 * On les pousse donc vers le bas, puis on rattrape le débordement vers le haut —
 * le nom finit à quelques pixels du centre de son ruban, ce qui se lit encore
 * (les deux sont côte à côte), là où deux textes superposés ne se lisent plus.
 */
function spreadLabels(centres: number[], minGap: number, top: number, bottom: number): number[] {
  const ys = centres.slice();
  for (let i = 1; i < ys.length; i++) {
    ys[i] = Math.max(ys[i], ys[i - 1] + minGap);
  }
  const overflow = ys.length > 0 ? ys[ys.length - 1] - bottom : 0;
  if (overflow > 0) {
    ys[ys.length - 1] = bottom;
    for (let i = ys.length - 2; i >= 0; i--) {
      ys[i] = Math.min(ys[i], ys[i + 1] - minGap);
    }
    // Plus de place du tout (beaucoup de branches, peu de hauteur) : on repart du
    // haut. Les libellés se serrent alors à `minGap`, régulièrement.
    if (ys[0] < top) {
      for (let i = 0; i < ys.length; i++) ys[i] = top + i * minGap;
    }
  }
  return ys;
}

/**
 * Ruban entre deux verticales, d'épaisseur constante.
 *
 * Deux courbes cubiques symétriques, tangentes horizontales aux deux bouts : le
 * flux part et arrive à plat contre son nœud, comme un tuyau. Les points de
 * contrôle sont posés au tiers et aux deux tiers de la course — à la moitié, la
 * courbe part trop vite et deux rubans voisins se touchent au milieu ; au tiers,
 * chacun garde son couloir.
 */
function ribbon(x0: number, y0: number, x1: number, y1: number, h: number): string {
  const c0 = x0 + (x1 - x0) * 0.36;
  const c1 = x0 + (x1 - x0) * 0.64;
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    `M${r(x0)},${r(y0)}`,
    `C${r(c0)},${r(y0)} ${r(c1)},${r(y1)} ${r(x1)},${r(y1)}`,
    `L${r(x1)},${r(y1 + h)}`,
    `C${r(c1)},${r(y1 + h)} ${r(c0)},${r(y0 + h)} ${r(x0)},${r(y0 + h)}`,
    "Z",
  ].join(" ");
}

/**
 * Le libellé a-t-il quitté l'épaisseur de son ruban ?
 *
 * C'est la bonne question, et pas « de combien a-t-il bougé » : tant que le nom
 * tombe EN FACE de sa branche, il la désigne sans ambiguïté, même écarté de
 * vingt pixels de son centre. C'est quand il sort de sa bande qu'il faut relier
 * les deux — et une branche épaisse n'a donc presque jamais de trait de rappel,
 * une branche fine presque toujours.
 */
const outsideBand = (y: number, top: number, h: number): boolean =>
  y < top - 2 || y > top + h + 2;

/** Trait de rappel : une courbe plate du nœud vers le libellé, tracée en `stroke`. */
function connector(x0: number, y0: number, x1: number, y1: number): string {
  const cx = (x0 + x1) / 2;
  const r = (n: number) => Math.round(n * 100) / 100;
  return `M${r(x0)},${r(y0)} C${r(cx)},${r(y0)} ${r(cx)},${r(y1)} ${r(x1)},${r(y1)}`;
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
    width, height, nodeW = 8, gap = 10, hubGap = 2, minBand = 6,
    gutter = 0, padTop = 0, labelGap = 30,
  }: SankeyOptions,
): SankeyLayout {
  const ins = inflows.filter((f) => f.amount > 0);
  const outs = outflows.filter((f) => f.amount > 0);

  const sum = (list: SankeyFlowInput[]) => list.reduce((s, f) => s + f.amount, 0);
  const totalIn = sum(ins);
  const totalOut = sum(outs);
  const total = Math.max(totalIn, totalOut);

  const hubW = nodeW + 2; // le nœud central est le seul qu'on ne compte pas deux fois
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

  /* Deux piles par côté : large au bord, où l'on lit les branches une par une ;
     resserrée au centre, où l'on lit la convergence. Le jour du centre est fin
     mais il existe — c'est lui qui garde dix branches distinctes là où elles se
     rejoignent. */
  const yIn = stack(hIn, gap, height, padTop);
  const yOut = stack(hOut, gap, height, padTop);
  const yHubIn = stack(hIn, hubGap, height, padTop);
  const yHubOut = stack(hOut, hubGap, height, padTop);

  const labelsIn = spreadLabels(
    hIn.map((h, i) => yIn[i] + h / 2), labelGap, padTop + 6, padTop + height - 6,
  );
  const labelsOut = spreadLabels(
    hOut.map((h, i) => yOut[i] + h / 2), labelGap, padTop + 6, padTop + height - 6,
  );

  const labelPad = 12;

  const bands: SankeyBand[] = [
    ...ins.map((f, i) => {
      const centre = yIn[i] + hIn[i] / 2;
      const y = labelsIn[i];
      const x = inNodeX - labelPad;
      return {
        id: f.id,
        color: f.color,
        amount: f.amount,
        side: "in" as const,
        thickness: hIn[i],
        path: ribbon(inNodeX + nodeW, yIn[i], hubX, yHubIn[i], hIn[i]),
        node: { x: inNodeX, y: yIn[i], w: nodeW, h: hIn[i] },
        label: {
          x, y, anchor: "end" as const, centre,
          connector: outsideBand(y, yIn[i], hIn[i])
            ? connector(inNodeX - 2, centre, x + 4, y)
            : null,
        },
        from: inNodeX + nodeW,
        to: hubX,
      };
    }),
    ...outs.map((f, i) => {
      const centre = yOut[i] + hOut[i] / 2;
      const y = labelsOut[i];
      const x = outNodeX + nodeW + labelPad;
      return {
        id: f.id,
        color: f.color,
        amount: f.amount,
        side: "out" as const,
        thickness: hOut[i],
        path: ribbon(hubX + hubW, yHubOut[i], outNodeX, yOut[i], hOut[i]),
        node: { x: outNodeX, y: yOut[i], w: nodeW, h: hOut[i] },
        label: {
          x, y, anchor: "start" as const, centre,
          connector: outsideBand(y, yOut[i], hOut[i])
            ? connector(outNodeX + nodeW + 2, centre, x - 4, y)
            : null,
        },
        from: hubX + hubW,
        to: outNodeX,
      };
    }),
  ];

  /* Le nœud central couvre les deux piles : quand les deux côtés ne pèsent pas
     pareil, la barre montre l'union — le côté le plus lourd donne sa hauteur. */
  const tops = [...yHubIn, ...yHubOut];
  const bottoms = [...yHubIn.map((y, i) => y + hIn[i]), ...yHubOut.map((y, i) => y + hOut[i])];
  const top = Math.min(...tops);
  const bottom = Math.max(...bottoms);

  return { width, height, hub: { x: hubX, y: top, w: hubW, h: bottom - top }, bands };
}
