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
 *
 * ── UN NOM NE QUITTE JAMAIS SA BRANCHE ──────────────────────────────────────
 *
 * Un ruban de 3 px porte un libellé de 34 px : trois petites branches voisines
 * suffisent à faire se recouvrir trois noms. Deux réponses existent, et une seule
 * est honnête.
 *
 * L'ancienne DÉPLAÇAIT les libellés — grappes recentrées, traits de rappel pour
 * dire lequel allait avec lequel, et repli sur une ligne quand la colonne était
 * trop serrée. Un nom lu 30 px au-dessus de son ruban désigne quand même le
 * voisin du dessus, trait ou pas : la colonne devenait un texte qu'on ne pouvait
 * plus rattacher au dessin.
 *
 * Celle-ci ÉCARTE LES NŒUDS. `labelSlot` est la place qu'un nom réclame, et
 * l'écart entre deux nœuds voisins s'élargit juste assez pour que leurs milieux
 * soient distants d'autant — un écart n'est donc pas constant dans une colonne :
 * il grandit là où les deux branches sont fines, et reste au minimum entre deux
 * grosses, qui ont déjà la place. `labelY` vaut TOUJOURS le milieu du nœud.
 *
 * Quand la hauteur donnée n'y suffit pas, c'est au DESSIN de grandir : le calcul
 * publie `heightNeeded`, la place que les noms réclament, et l'appelant redonne
 * cette hauteur (cf. `SankeyGraph`). Comprimer n'arrive qu'en dernier recours,
 * et se paie d'abord sur les écarts, jamais sur la position des noms.
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
   * Où poser le libellé :
   *   `before` — dans la gouttière de GAUCHE, aligné à droite contre le nœud.
   *              C'est la première colonne, celle d'où part le flux ;
   *   `after`  — dans la gouttière de DROITE, aligné à gauche. C'est la dernière
   *              colonne, celle où il aboutit ;
   *   `centre` — centré sur la barre. Les colonnes du milieu n'ont pas de
   *              gouttière : leur nom se pose sur le nœud lui-même.
   */
  labelSide: "before" | "after" | "centre";
  /** Ancre horizontale du libellé : le bord d'où il part, ou le milieu de la
   *  barre pour un libellé centré. */
  labelX: number;
  /**
   * Hauteur du libellé — TOUJOURS le milieu du nœud.
   *
   * C'est ce que garantit `labelSlot` : ce sont les nœuds qui s'écartent pour
   * faire de la place aux noms, jamais les noms qui s'écartent de leur nœud
   * (cf. l'en-tête). Le champ reste distinct de `y + h / 2` pour l'appelant,
   * qui pose ses libellés sans refaire le calcul.
   */
  labelY: number;
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
  /**
   * Hauteur que réclament les LIBELLÉS de la colonne la plus peuplée : de quoi
   * donner à chaque nœud la place d'un nom, plus le jour minimal entre voisins.
   *
   * Ne dépend que du graphe, pas de la hauteur reçue — l'appelant peut donc la
   * lire sur un premier calcul et redonner cette hauteur au suivant. C'est ce
   * qui fait GRANDIR le dessin quand une colonne se remplit, au lieu de tasser
   * les noms les uns sur les autres. Vaut 0 sans libellés (`labelSlot` à 0).
   */
  heightNeeded: number;
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
  /** Écart entre le bord du nœud et son libellé. */
  labelPad?: number;
  /** Place réservée aux libellés, à gauche et à droite. 0 = pas de gouttières,
   *  le dessin prend toute la largeur (régime compact). */
  gutter?: number;
  /**
   * Hauteur qu'un libellé réclame, donc l'écart minimal entre les MILIEUX de deux
   * nœuds voisins d'une même colonne (cf. l'en-tête).
   *
   * 0 = aucune contrainte : les nœuds ne se séparent que de `nodeGap`. C'est le
   * régime compact, qui n'affiche aucun nom.
   */
  labelSlot?: number;
}

/* ── Outils ─────────────────────────────────────────────────────────────── */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Allers-retours de relaxation, et amortissement entre deux (cf. plus bas). */
const RELAX_PASSES = 3;
const RELAX_DAMPING = 0.7;

/** Pas de la recherche d'échelle par dichotomie. Vingt-quatre passes ramènent
 *  l'incertitude sous le millième de pixel sur une colonne de 1000 px. */
const SCALE_PASSES = 24;

/**
 * Jour à laisser entre deux nœuds voisins pour que leurs NOMS ne se touchent pas.
 *
 * La contrainte porte sur les milieux : `(ha + hb) / 2 + gap >= labelSlot`. Deux
 * grosses branches la satisfont déjà par leur seule épaisseur et gardent le jour
 * minimal ; deux branches fines paient la différence. C'est la seule règle
 * d'écartement du module — les libellés, eux, ne bougent pas.
 */
const gapBetween = (ha: number, hb: number, nodeGap: number, labelSlot: number): number =>
  Math.max(nodeGap, labelSlot - (ha + hb) / 2);

/**
 * Écart entre centres réellement obtenu dans une colonne, borné par `labelSlot`.
 *
 * Vaut `labelSlot` quand la hauteur a suffi. Sur une colonne saturée, dont les
 * jours ont été rognés, il vaut le plus petit écart obtenu : c'est la contrainte
 * que la relaxation peut encore garantir sans pousser un nœud hors du dessin.
 */
function effectiveSlot(hs: number[], gaps: number[], labelSlot: number): number {
  if (labelSlot <= 0 || gaps.length === 0) return labelSlot;
  let min = labelSlot;
  for (let i = 0; i < gaps.length; i++) min = Math.min(min, (hs[i] + hs[i + 1]) / 2 + gaps[i]);
  return min;
}

/** Hauteur occupée par une colonne : ses bandes, plus les jours entre elles. */
function columnSpan(hs: number[], nodeGap: number, labelSlot: number): number {
  let span = hs.reduce((s, h) => s + h, 0);
  for (let i = 1; i < hs.length; i++) span += gapBetween(hs[i - 1], hs[i], nodeGap, labelSlot);
  return span;
}

/**
 * La plus grande échelle à laquelle une colonne tient dans `height`.
 *
 * `columnSpan` croît avec l'échelle — les bandes grossissent plus vite que les
 * jours ne se resserrent —, ce qui autorise une simple dichotomie. Une formule
 * fermée n'existe pas : chaque jour dépend de l'épaisseur de ses deux voisines,
 * qui dépend elle-même du plancher `minBand`.
 *
 * Renvoie 0 quand la colonne ne tient pas même à bandes minimales : l'appelant
 * comprime alors les jours (cf. `stack`).
 */
function columnScale(
  values: number[], height: number, minBand: number, nodeGap: number, labelSlot: number,
): number {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return Infinity;
  const spanAt = (scale: number): number =>
    columnSpan(values.map((v) => Math.max(v * scale, minBand)), nodeGap, labelSlot);

  // Borne haute : à cette échelle les bandes seules remplissent la hauteur.
  let hi = height / total;
  if (spanAt(hi) <= height) return hi;
  let lo = 0;
  if (spanAt(0) > height) return 0;
  for (let i = 0; i < SCALE_PASSES; i++) {
    const mid = (lo + hi) / 2;
    if (spanAt(mid) <= height) lo = mid;
    else hi = mid;
  }
  return lo;
}

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
function resolveColumn(
  col: Work[], gapOf: (a: Work, b: Work) => number, top: number, bottom: number,
): void {
  if (col.length === 0) return;
  col.sort((a, b) => a.y - b.y);

  let y = top;
  for (let i = 0; i < col.length; i++) {
    const n = col[i];
    if (n.y < y) n.y = y;
    y = n.y + n.h + (i + 1 < col.length ? gapOf(n, col[i + 1]) : 0);
  }

  let z = bottom;
  for (let i = col.length - 1; i >= 0; i--) {
    const n = col[i];
    if (n.y + n.h > z) n.y = z - n.h;
    z = n.y - (i > 0 ? gapOf(col[i - 1], n) : 0);
  }
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
    padTop = 0, labelPad = 10, labelSlot = 0, gutter = 0,
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

  const empty: SankeyGraphLayout = { width, height, columns: 0, nodes: [], links: [], heightNeeded: 0 };
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

  /* La place que réclament les NOMS de la colonne la plus peuplée. Publiée telle
     quelle : c'est à cette hauteur que le dessin donne à chaque nom la place de
     tenir en face de sa branche (cf. `heightNeeded`). */
  const heightNeeded = labelSlot > 0
    ? Math.max(...live.map((col) => col.length * labelSlot + nodeGap * (col.length - 1)))
    : 0;

  /* L'ÉCHELLE, commune à toutes les colonnes : la plus serrée gagne. Une échelle
     par colonne rendrait chaque colonne « pleine » et ferait mentir le dessin —
     c'est précisément ce qu'un Sankey ne doit pas faire.
     Les jours entre nœuds entrent dans le calcul, et ils dépendent eux-mêmes des
     épaisseurs quand une colonne porte des noms : d'où la dichotomie. */
  const scale = Math.min(
    ...live.map((col) => {
      const fitted = columnScale(col.map((n) => n.value), height, minBand, nodeGap, labelSlot);
      if (fitted > 0) return fitted;
      /* Saturation : même à bandes minimales, les noms ne tiennent pas dans la
         hauteur reçue. On revient à l'échelle des bandes seules et l'empilement
         rendra la dette sur les jours — un nom qui frôle son voisin reste
         lisible, un dessin absent ne l'est pas. */
      const total = col.reduce((s, n) => s + n.value, 0);
      const usable = Math.max(height - nodeGap * (col.length - 1), 1);
      return total > 0 ? usable / total : Infinity;
    }),
  );
  if (!Number.isFinite(scale) || scale <= 0) return empty;

  /* Les colonnes se répartissent sur ce qui reste une fois les gouttières
     retirées : le dessin rétrécit, les noms ne débordent plus. */
  const span = Math.max(width - 2 * gutter - nodeW, 1);
  const colX = (k: number): number => (maxCol === 0 ? gutter : gutter + (k * span) / maxCol);

  /* Place réellement accordée aux noms, colonne par colonne : `labelSlot` tant
     que la hauteur suffit, moins que ça sur une colonne saturée. La relaxation
     ci-dessous s'en sert pour ne jamais exiger plus d'écart que l'empilement
     n'en a donné — sans quoi elle ferait déborder la colonne du dessin. */
  const slotOf: number[] = Array.from({ length: maxCol + 1 }, () => labelSlot);
  const gapOf: number[] = Array.from({ length: maxCol + 1 }, () => nodeGap);

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

    /* Les bandes d'abord, à l'échelle commune ; les jours ensuite, puisqu'ils
       dépendent de l'épaisseur de leurs deux voisines. `fitColumn` reprend la
       dette du plancher `minBand` sur les bandes qui peuvent la payer. */
    const gapsOf = (hs: number[]): number[] =>
      hs.slice(1).map((h, i) => gapBetween(hs[i], h, nodeGap, labelSlot));

    let hs = col.map((n) => Math.max(n.value * scale, minBand));
    const usable = Math.max(height - gapsOf(hs).reduce((s, g) => s + g, 0), 1);
    hs = fitColumn(col.map((n) => n.value), scale, minBand, usable);
    let gaps = gapsOf(hs);
    let span = hs.reduce((s, h) => s + h, 0) + gaps.reduce((s, g) => s + g, 0);

    /* Il reste de la dette : les bandes sont au plancher, on la prend sur les
       jours — au prorata de ce que chacun a AU-DESSUS du minimum, et jamais en
       dessous. Les noms se rapprochent, ils restent en face de leur branche. */
    if (span > height + 0.01 && gaps.length > 0) {
      const slack = gaps.reduce((s, g) => s + Math.max(g - nodeGap, 0), 0);
      if (slack > 0) {
        const ratio = Math.min((span - height) / slack, 1);
        gaps = gaps.map((g) => g - Math.max(g - nodeGap, 0) * ratio);
        span = hs.reduce((s, h) => s + h, 0) + gaps.reduce((s, g) => s + g, 0);
      }
    }

    /* Dette résiduelle : même à jour minimal et bandes au plancher, la colonne ne
       tient pas dans la hauteur reçue (vingt branches dans 300 px). On rétrécit
       tout au prorata plutôt que de laisser le dessin sortir de sa carte — et
       c'est à l'appelant de lui donner la hauteur que réclame `heightNeeded`. */
    if (span > height + 0.01) {
      const shrink = height / span;
      hs = hs.map((h) => h * shrink);
      gaps = gaps.map((g) => g * shrink);
      span = height;
    }

    slotOf[k] = effectiveSlot(hs, gaps, labelSlot);
    // Jour effectif : la relaxation ne doit pas réclamer plus que ce que
    // l'empilement a pu donner, sinon elle repousse un nœud hors du cadre.
    gapOf[k] = gaps.length > 0 ? Math.min(nodeGap, ...gaps) : nodeGap;

    let y = padTop + (height - span) / 2;
    col.forEach((n, i) => {
      n.h = hs[i];
      n.y = y;
      n.x = colX(k);
      y += hs[i] + (gaps[i] ?? 0);
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

  const drift = (col: Work[], k: number, dir: "in" | "out", alpha: number): void => {
    for (const n of col) {
      const target = barycentre(n, dir === "in" ? n.in : n.out, dir);
      if (target != null) n.y += (target - (n.y + n.h / 2)) * alpha;
    }
    const slot = slotOf[k] ?? labelSlot;
    const gap = gapOf[k] ?? nodeGap;
    resolveColumn(
      col,
      (a, b) => gapBetween(a.h, b.h, gap, slot),
      padTop,
      padTop + height,
    );
  };

  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    const alpha = RELAX_DAMPING ** pass;
    // Droite→gauche d'abord : ce sont les colonnes de gauche, moins peuplées,
    // qui ont de la place pour bouger. L'inverse les figerait tout de suite.
    for (let k = maxCol - 1; k >= 0; k--) drift(columns[k], k, "out", alpha);
    for (let k = 1; k <= maxCol; k++) drift(columns[k], k, "in", alpha);
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

  /* Les libellés, chacun au MILIEU de son nœud. Il n'y a plus rien à arbitrer
     ici : la place dont ils ont besoin a été prise en compte par l'empilement,
     qui a écarté les branches fines en conséquence (cf. l'en-tête). */
  const boxes: SankeyGraphNodeBox[] = [];
  for (const col of columns) {
    for (const n of col) {
      if (n.value <= 0) continue;
      const side = n.column === 0 ? "before" : n.column === maxCol ? "after" : "centre";
      const labelX = side === "before"
        ? n.x - labelPad
        : side === "after"
          ? n.x + nodeW + labelPad
          : n.x + nodeW / 2;
      boxes.push({
        id: n.id,
        color: n.color,
        value: n.value,
        column: n.column,
        x: round2(n.x),
        y: round2(n.y),
        w: nodeW,
        h: round2(n.h),
        labelSide: side,
        labelX: round2(labelX),
        labelY: round2(n.y + n.h / 2),
      });
    }
  }

  return { width, height, columns: maxCol + 1, nodes: boxes, links: bands, heightNeeded };
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
