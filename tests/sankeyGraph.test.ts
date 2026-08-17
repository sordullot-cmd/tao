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

  it("ne déplace JAMAIS un libellé : il reste au milieu de sa branche", () => {
    /* Le contrat de la nouvelle géométrie. Dix branches dont neuf minces
       tiendraient sans écartement à condition de décaler leurs noms — c'est
       exactement ce qu'on refuse : un nom décalé désigne la branche du dessus. */
    const tiny = Array.from({ length: 10 }, (_, i) => node(`t${i}`));
    const { nodes } = sankeyGraphLayout(
      [node("hub"), ...tiny],
      tiny.map((n, i) => link("hub", n.id, i === 0 ? 991 : 1)),
      { ...OPTS, height: 480, labelSlot: 34 },
    );
    for (const n of nodes) expect(n.labelY).toBeCloseTo(n.y + n.h / 2, 6);
  });

  it("écarte les branches fines pour que leurs noms tiennent", () => {
    /* Ce sont les NŒUDS qui s'écartent, et l'écart se mesure entre leurs
       milieux : c'est là que se posent les libellés. */
    const slot = 34;
    const tiny = Array.from({ length: 8 }, (_, i) => node(`t${i}`));
    const { nodes } = sankeyGraphLayout(
      [node("hub"), ...tiny],
      tiny.map((n, i) => link("hub", n.id, i === 0 ? 993 : 1)),
      { ...OPTS, height: 480, labelSlot: slot },
    );
    const leaves = nodes.filter((n) => n.id !== "hub").sort((a, b) => a.y - b.y);
    for (let i = 1; i < leaves.length; i++) {
      expect(leaves[i].labelY - leaves[i - 1].labelY).toBeGreaterThanOrEqual(slot - 0.01);
    }
    // Et personne ne sort du dessin pour autant.
    expect(leaves[0].y).toBeGreaterThanOrEqual(OPTS.padTop - 0.01);
    const last = leaves[leaves.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(OPTS.padTop + 480 + 0.01);
  });

  it("garde le jour minimal entre deux grosses branches, qui ont déjà la place", () => {
    /* L'écartement n'est pas un pas fixe : deux bandes épaisses satisfont déjà la
       contrainte par leur seule épaisseur, les écarter davantage ne ferait que
       manger la hauteur du dessin. */
    const { nodes } = sankeyGraphLayout(
      [node("hub"), node("A"), node("B")],
      [link("hub", "A", 500), link("hub", "B", 500)],
      { ...OPTS, labelSlot: 34 },
    );
    const [a, b] = nodes.filter((n) => n.id !== "hub").sort((p, q) => p.y - q.y);
    expect(b.y - (a.y + a.h)).toBeCloseTo(OPTS.nodeGap, 1);
  });

  it("dit la hauteur qu'il faudrait pour que tous les noms tiennent", () => {
    /* `heightNeeded` ne dépend que du graphe : l'appelant la lit sur un premier
       calcul et redonne cette hauteur au suivant — c'est ce qui fait GRANDIR le
       bloc plutôt que tasser les noms. */
    const many = Array.from({ length: 12 }, (_, i) => node(`t${i}`));
    const slot = 34;
    const first = sankeyGraphLayout(
      [node("hub"), ...many],
      many.map((n, i) => link("hub", n.id, i < 2 ? 400 : 6)),
      { ...OPTS, labelSlot: slot },
    );
    expect(first.heightNeeded).toBe(12 * slot + OPTS.nodeGap * 11);

    // La même hauteur redonnée : les noms tiennent, et le calcul ne la révise pas.
    const second = sankeyGraphLayout(
      [node("hub"), ...many],
      many.map((n, i) => link("hub", n.id, i < 2 ? 400 : 6)),
      { ...OPTS, height: first.heightNeeded, labelSlot: slot },
    );
    expect(second.heightNeeded).toBe(first.heightNeeded);
    const leaves = second.nodes.filter((n) => n.id !== "hub").sort((a, b) => a.y - b.y);
    for (let i = 1; i < leaves.length; i++) {
      expect(leaves[i].labelY - leaves[i - 1].labelY).toBeGreaterThanOrEqual(slot - 0.01);
    }
  });

  it("comprime les écarts plutôt que le dessin quand la hauteur ne suffit pas", () => {
    /* Vingt branches dans 300 px : aucun arrangement ne donne 34 px à chacune.
       Les noms se rapprochent — ils restent en face de leur branche —, et rien
       ne déborde du cadre. */
    const many = Array.from({ length: 20 }, (_, i) => node(`t${i}`));
    const { nodes } = sankeyGraphLayout(
      [node("hub"), ...many],
      many.map((n, i) => link("hub", n.id, i < 2 ? 400 : 6)),
      { ...OPTS, height: 300, labelSlot: 34 },
    );
    const leaves = nodes.filter((n) => n.id !== "hub");
    expect(leaves).toHaveLength(20);
    for (const n of leaves) {
      // À 1 décimale : les trois valeurs sont arrondies au centième chacune.
      expect(n.labelY).toBeCloseTo(n.y + n.h / 2, 1);
      expect(n.y).toBeGreaterThanOrEqual(OPTS.padTop - 0.01);
      expect(n.y + n.h).toBeLessThanOrEqual(OPTS.padTop + 300 + 0.01);
      // Les bandes passent alors sous leur plancher : c'est le prix du cadre.
      expect(n.h).toBeGreaterThan(0);
    }
  });

  it("range les libellés dans les gouttières, et centre ceux du milieu", () => {
    /* Les noms sortent du dessin : à gauche pour la colonne d'où part le flux, à
       droite pour celle où il aboutit. Les colonnes du milieu n'ont pas de
       gouttière où se ranger — leur libellé se centre sur la barre. */
    const source = boxOf("in:salary");
    const hub = boxOf("hub");
    const leaf = boxOf("sub:rent");

    expect(source.labelSide).toBe("before");
    expect(source.labelX).toBeLessThan(source.x);
    expect(leaf.labelSide).toBe("after");
    expect(leaf.labelX).toBeGreaterThan(leaf.x + leaf.w);
    expect(hub.labelSide).toBe("centre");
    expect(hub.labelX).toBeCloseTo(hub.x + hub.w / 2, 1);
  });

  it("réserve la place des libellés sur la largeur du dessin", () => {
    /* Sans gouttières, la première colonne colle au bord gauche et son nom sort
       de la carte. Avec, le dessin rétrécit d'autant des deux côtés. */
    const gutter = 120;
    const { nodes } = sankeyGraphLayout(NODES, LINKS, { ...OPTS, gutter });
    const xs = nodes.map((n) => n.x);
    expect(Math.min(...xs)).toBeCloseTo(gutter, 1);
    expect(Math.max(...xs) + OPTS.nodeW).toBeCloseTo(OPTS.width - gutter, 1);
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
