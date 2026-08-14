import { describe, it, expect } from "vitest";
import { sankeyGraphLayout } from "@/lib/ui/sankeyGraph";

/* La géométrie du diagramme de flux multi-niveaux. Ce qui est vérifié ici est ce
   qui rend le dessin HONNÊTE : une échelle commune à toutes les colonnes (sans
   quoi 400 € n'aurait pas la même épaisseur au 2e et au 4e niveau), des colonnes
   qui tiennent dans la hauteur donnée, un nœud dont les rubans ne débordent pas
   de la barre, et un bord droit net. */

const node = (id: string, color = "#2C72C3") => ({ id, color });
const link = (source: string, target: string, value: number) => ({ source, target, value });

const OPTS = { width: 960, height: 400, nodeW: 9, nodeGap: 16, minBand: 3, padTop: 12 };

/* Le cas de la page Budget, en réduction : deux sources, un budget, deux postes,
   et un seul des deux postes déplié sur ses sous-postes. */
const NODES = [
  node("in:salary"), node("in:refund"),
  node("hub"),
  node("cat:housing"), node("cat:food"),
  node("sub:rent"), node("sub:charges"),
];
const LINKS = [
  link("in:salary", "hub", 800), link("in:refund", "hub", 200),
  link("hub", "cat:housing", 600), link("hub", "cat:food", 400),
  link("cat:housing", "sub:rent", 450), link("cat:housing", "sub:charges", 150),
];

const layout = () => sankeyGraphLayout(NODES, LINKS, OPTS);
const boxOf = (id: string) => layout().nodes.find((n) => n.id === id)!;

describe("Géométrie du diagramme de flux multi-niveaux", () => {
  it("range chaque nœud dans la colonne de son plus long chemin", () => {
    expect(boxOf("in:salary").column).toBe(0);
    expect(boxOf("hub").column).toBe(1);
    expect(boxOf("cat:housing").column).toBe(2);
    expect(boxOf("sub:rent").column).toBe(3);
  });

  it("pousse au bord droit un poste sans détail", () => {
    /* « Alimentation » n'a pas de sous-poste : sa profondeur naturelle est 2.
       Le laisser là ferait un escalier au bord droit du dessin — il doit finir
       dans la dernière colonne, avec les sous-postes de son voisin. */
    const food = boxOf("cat:food");
    expect(food.column).toBe(3);
    expect(food.x).toBeCloseTo(boxOf("sub:rent").x, 6);
    expect(food.x + food.w).toBeCloseTo(OPTS.width, 6);
  });

  it("donne la même épaisseur au même montant, quelle que soit la colonne", () => {
    /* C'est LA propriété d'un Sankey. Une échelle par colonne rendrait chaque
       colonne pleine et ferait mentir le dessin. */
    const { links } = sankeyGraphLayout(
      [node("a"), node("h"), node("b"), node("c"), node("d")],
      [
        link("a", "h", 1000),
        link("h", "b", 500), link("h", "c", 500),
        link("b", "d", 500),
      ],
      OPTS,
    );
    const at = (id: string) => links.find((l) => l.id === id)!.thickness;
    // 500 € au 2e niveau et 500 € au 3e : même épaisseur.
    expect(at("h→b")).toBeCloseTo(at("b→d"), 6);
    // Et le tout vaut le double d'une moitié.
    expect(at("a→h") / at("h→b")).toBeCloseTo(2, 6);
  });

  it("tient dans la hauteur demandée, espaces compris", () => {
    const { nodes } = layout();
    const byCol = new Map<number, typeof nodes>();
    for (const n of nodes) byCol.set(n.column, [...(byCol.get(n.column) ?? []), n]);

    for (const col of byCol.values()) {
      const top = Math.min(...col.map((n) => n.y));
      const bottom = Math.max(...col.map((n) => n.y + n.h));
      expect(bottom - top).toBeLessThanOrEqual(OPTS.height + 0.01);
      expect(top).toBeGreaterThanOrEqual(OPTS.padTop - 0.01);
    }
  });

  it("garde les rubans d'un nœud dans l'épaisseur de sa barre", () => {
    /* Un nœud relevé au minimum ou rogné par la reprise de dette n'a plus la
       hauteur de sa valeur brute : des rubans à l'échelle brute déborderaient
       alors de la barre à laquelle ils s'accrochent. */
    const { nodes, links } = layout();
    for (const n of nodes) {
      const out = links.filter((l) => l.source === n.id);
      const inc = links.filter((l) => l.target === n.id);
      for (const side of [out, inc]) {
        const span = side.reduce((s, l) => s + l.thickness, 0);
        expect(span).toBeLessThanOrEqual(n.h + 0.01);
      }
    }
  });

  it("relève les rubans invisibles au minimum sans faire déborder la colonne", () => {
    const tiny = Array.from({ length: 10 }, (_, i) => node(`t${i}`));
    const { nodes } = sankeyGraphLayout(
      [node("hub"), ...tiny],
      tiny.map((n, i) => link("hub", n.id, i === 0 ? 991 : 1)),
      OPTS,
    );
    const leaves = nodes.filter((n) => n.id !== "hub");
    expect(Math.min(...leaves.map((n) => n.h))).toBeGreaterThanOrEqual(OPTS.minBand - 0.01);
    const span = leaves.reduce((s, n) => s + n.h, 0) + OPTS.nodeGap * (leaves.length - 1);
    expect(span).toBeLessThanOrEqual(OPTS.height + 0.01);
  });

  it("range les enfants dans l'ordre de leurs parents", () => {
    /* C'est ce qui supprime les croisements sur un arbre : les sous-postes du
       premier poste passent tous avant ceux du second. */
    const { nodes } = sankeyGraphLayout(
      [node("h"), node("A"), node("B"), node("a1"), node("a2"), node("b1"), node("b2")],
      [
        link("h", "A", 600), link("h", "B", 400),
        link("A", "a1", 400), link("A", "a2", 200),
        link("B", "b1", 300), link("B", "b2", 100),
      ],
      OPTS,
    );
    const y = (id: string) => nodes.find((n) => n.id === id)!.y;
    const leaves = ["a1", "a2", "b1", "b2"].sort((p, q) => y(p) - y(q));
    expect(leaves).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("écarte les pastilles qui se recouvriraient, sans quitter le dessin", () => {
    /* Dix sous-postes fins ont dix libellés de la même hauteur : sans
       écartement, ils s'empilent tous au même endroit. */
    const tiny = Array.from({ length: 10 }, (_, i) => node(`t${i}`));
    const gap = 26;
    const { nodes } = sankeyGraphLayout(
      [node("hub"), ...tiny],
      tiny.map((n, i) => link("hub", n.id, i === 0 ? 991 : 1)),
      { ...OPTS, labelGap: gap },
    );
    const ys = nodes
      .filter((n) => n.id !== "hub")
      .map((n) => n.labelY)
      .sort((a, b) => a - b);

    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(gap - 0.01);
    }
    expect(ys[0]).toBeGreaterThanOrEqual(OPTS.padTop - 0.01);
    expect(ys[ys.length - 1]).toBeLessThanOrEqual(OPTS.padTop + OPTS.height + 0.01);
  });

  it("pose la pastille à droite en première colonne, à gauche ensuite", () => {
    /* La première colonne n'a rien à sa gauche ; partout ailleurs la pastille se
       pose au bout des rubans qui arrivent, contre le nœud. */
    const source = boxOf("in:salary");
    const leaf = boxOf("sub:rent");
    expect(source.labelSide).toBe("after");
    expect(source.labelX).toBeGreaterThan(source.x + source.w);
    expect(leaf.labelSide).toBe("before");
    expect(leaf.labelX).toBeLessThan(leaf.x);
  });

  it("ignore un lien dont un bout n'existe pas plutôt que d'échouer", () => {
    /* Le classement des opérations est deviné : un identifiant orphelin est un
       bug de règle, pas une raison de n'afficher aucun diagramme. */
    const { links } = sankeyGraphLayout(
      [node("a"), node("b")],
      [link("a", "b", 100), link("a", "fantome", 50)],
      OPTS,
    );
    expect(links.map((l) => l.id)).toEqual(["a→b"]);
  });

  it("rend un dessin vide quand il n'y a aucun lien", () => {
    const empty = sankeyGraphLayout([node("a")], [], OPTS);
    expect(empty.nodes).toEqual([]);
    expect(empty.links).toEqual([]);
  });
});
