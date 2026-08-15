import { describe, it, expect } from "vitest";
import { sankeyFocus, inFocusRange, linkInFocusRange } from "@/lib/ui/sankeyFocus";

/* Ce que le survol d'une branche allume et éteint, sur la forme du cashflow :
   deux entrées → le budget → deux postes, dont l'un déplié en sous-postes.

     in:salary ┐                 ┌ cat:housing ┬ sub:rent
               ├─ hub ───────────┤             └ sub:charges
     in:aid   ┘                  └ cat:food
*/
const NODES = [
  { id: "in:salary", column: 0 },
  { id: "in:aid", column: 0 },
  { id: "hub", column: 1 },
  { id: "cat:housing", column: 2 },
  { id: "sub:rent", column: 3 },
  { id: "sub:charges", column: 3 },
  { id: "cat:food", column: 3 },
];
const LINKS = [
  { id: "in:salary→hub", source: "in:salary", target: "hub" },
  { id: "in:aid→hub", source: "in:aid", target: "hub" },
  { id: "hub→cat:housing", source: "hub", target: "cat:housing" },
  { id: "hub→cat:food", source: "hub", target: "cat:food" },
  { id: "cat:housing→sub:rent", source: "cat:housing", target: "sub:rent" },
  { id: "cat:housing→sub:charges", source: "cat:housing", target: "sub:charges" },
];

const colOf = (id: string) => NODES.find((n) => n.id === id)!.column;

/** Ce qui s'atténue vraiment à l'écran : nœuds et rubans confondus. */
function dimmed(hovered: string): string[] {
  const focus = sankeyFocus(NODES, LINKS, hovered);
  if (!focus) return [];
  const out = [
    ...NODES.filter((n) => !focus.nodes.has(n.id) && inFocusRange(focus, n.column)).map((n) => n.id),
    ...LINKS.filter(
      (l) => !focus.links.has(l.id) && linkInFocusRange(focus, colOf(l.source), colOf(l.target)),
    ).map((l) => l.id),
  ];
  return out.sort();
}

describe("Ce que le survol d'une branche allume", () => {
  it("éteint la branche entière d'un voisin, et pas seulement sa barre", () => {
    /* Survoler « Logement » doit éteindre « Alimentation » ET le ruban qui y
       mène : une barre grisée au bout d'un ruban resté plein ne trie rien. */
    expect(dimmed("cat:housing")).toEqual(["cat:food", "hub→cat:food"]);
  });

  it("emporte la chaîne du survolé — ses sous-postes restent allumés", () => {
    const focus = sankeyFocus(NODES, LINKS, "cat:housing")!;
    expect(focus.nodes).toContain("sub:rent");
    expect(focus.nodes).toContain("sub:charges");
    expect(focus.links).toContain("cat:housing→sub:rent");
    // Le ruban qui l'alimente aussi : c'est le même argent, un cran plus tôt.
    expect(focus.links).toContain("hub→cat:housing");
  });

  it("ne touche pas à l'autre côté du carrefour", () => {
    /* Les entrées ne se comparent pas aux sorties : rien de ce qui est à gauche
       du budget ne bouge quand on survole un poste. */
    const off = dimmed("cat:housing");
    expect(off).not.toContain("in:salary");
    expect(off).not.toContain("in:aid");
    expect(off).not.toContain("in:salary→hub");
    expect(off).not.toContain("hub");
  });

  it("fait le miroir depuis une entrée", () => {
    expect(dimmed("in:salary")).toEqual(["in:aid", "in:aid→hub"]);
  });

  it("éteint les sous-postes voisins quand on survole un sous-poste", () => {
    /* « Loyer » se compare à « Charges », mais aussi à « Alimentation » : tout
       ce qui sort du budget est son voisin. Son poste, lui, reste allumé — il
       est sa chaîne. */
    const off = dimmed("sub:rent");
    expect(off).toContain("sub:charges");
    expect(off).toContain("cat:housing→sub:charges");
    expect(off).toContain("cat:food");
    expect(off).toContain("hub→cat:food");
    expect(off).not.toContain("cat:housing");
    expect(off).not.toContain("hub→cat:housing");
  });

  it("n'éteint rien quand on survole le carrefour lui-même", () => {
    /* Le budget est traversé par tout : le montrer « à part » n'aurait pas de
       sens, et une figure entière atténuée ne dit rien. */
    expect(dimmed("hub")).toEqual([]);
  });

  it("ignore un survol qui ne désigne aucun nœud", () => {
    expect(sankeyFocus(NODES, LINKS, "cat:ghost")).toBeNull();
    expect(sankeyFocus(NODES, LINKS, null)).toBeNull();
  });
});
