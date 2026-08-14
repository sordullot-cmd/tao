import { describe, it, expect } from "vitest";
import { sankeyLayout } from "@/lib/ui/sankey";

/* La géométrie du diagramme de flux. Ce qui est vérifié ici est ce qui rend le
   dessin HONNÊTE : la même échelle des deux côtés, des piles qui tiennent dans
   la hauteur donnée, et un ruban qui garde son épaisseur d'un bout à l'autre. */

const flow = (id: string, amount: number) => ({ id, color: "#000", amount });

const OPTS = { width: 900, height: 300, gutter: 140, gap: 6, minBand: 3 };

describe("Géométrie du diagramme de flux", () => {
  it("donne la même épaisseur au même montant des deux côtés", () => {
    const { bands } = sankeyLayout(
      [flow("salary", 800), flow("refund", 200)],
      [flow("housing", 800), flow("food", 200)],
      OPTS,
    );

    const at = (id: string) => bands.find((b) => b.id === id)!.thickness;
    expect(at("salary")).toBeCloseTo(at("housing"), 6);
    expect(at("refund")).toBeCloseTo(at("food"), 6);
    // Et l'épaisseur suit le montant : quatre fois plus, quatre fois plus épais.
    expect(at("salary") / at("refund")).toBeCloseTo(4, 1);
  });

  it("tient dans la hauteur demandée, espaces compris", () => {
    const { bands } = sankeyLayout(
      [flow("a", 500), flow("b", 300), flow("c", 200)],
      [flow("d", 400), flow("e", 300), flow("f", 200), flow("g", 100)],
      OPTS,
    );

    for (const side of ["in", "out"] as const) {
      const rows = bands.filter((b) => b.side === side);
      const top = Math.min(...rows.map((b) => b.node.y));
      const bottom = Math.max(...rows.map((b) => b.node.y + b.node.h));
      expect(bottom - top).toBeLessThanOrEqual(OPTS.height + 0.01);
    }
  });

  it("relève les rubans invisibles au minimum, sans faire déborder la pile", () => {
    /* Un poste à 0,3 % d'un gros total ferait un trait d'un demi-pixel : on le
       relève. La dette que ça crée est reprise sur les gros, pas ignorée. */
    const tiny = Array.from({ length: 8 }, (_, i) => flow(`t${i}`, 1));
    const { bands } = sankeyLayout([flow("big", 992), ...tiny], [flow("out", 1000)], OPTS);

    const ins = bands.filter((b) => b.side === "in");
    expect(Math.min(...ins.map((b) => b.thickness))).toBeGreaterThanOrEqual(3 - 0.01);
    const span = ins.reduce((s, b) => s + b.thickness, 0) + OPTS.gap * (ins.length - 1);
    expect(span).toBeLessThanOrEqual(OPTS.height + 0.01);
  });

  it("laisse les gouttières libres pour les libellés", () => {
    const { bands } = sankeyLayout([flow("a", 100)], [flow("b", 100)], OPTS);

    const left = bands.find((b) => b.side === "in")!;
    const right = bands.find((b) => b.side === "out")!;
    expect(left.node.x).toBe(OPTS.gutter);
    expect(right.node.x + right.node.w).toBe(OPTS.width - OPTS.gutter);
    // Le libellé se pose vers l'extérieur, du côté du bord.
    expect(left.label.anchor).toBe("end");
    expect(left.label.x).toBeLessThan(left.node.x);
    expect(right.label.anchor).toBe("start");
    expect(right.label.x).toBeGreaterThan(right.node.x);
  });

  it("colle les rubans au centre et les espace au bord", () => {
    const { bands, hub } = sankeyLayout(
      [flow("a", 500), flow("b", 500)],
      [flow("c", 1000)],
      OPTS,
    );

    // Au centre, la barre porte les deux flux d'un seul bloc : la convergence se
    // lit d'autant mieux qu'il n'y a pas de trou dedans.
    expect(hub.h).toBeCloseTo(bands.filter((b) => b.side === "out")[0].thickness, 1);
    // Au bord, les deux nœuds sont séparés de l'espace demandé.
    const [a, b] = bands.filter((band) => band.side === "in");
    expect(b.node.y - (a.node.y + a.node.h)).toBeCloseTo(OPTS.gap, 1);
  });

  it("ne dessine rien plutôt que n'importe quoi", () => {
    expect(sankeyLayout([], [], OPTS).bands).toEqual([]);
    expect(sankeyLayout([flow("a", 0)], [flow("b", 0)], OPTS).bands).toEqual([]);
    // Trop étroit pour les deux gouttières : mieux vaut ne rien tracer que de
    // superposer les deux colonnes de nœuds.
    expect(sankeyLayout([flow("a", 10)], [flow("b", 10)], { ...OPTS, width: 200 }).bands).toEqual([]);
  });

  it("trace des rubans fermés, à peindre en remplissage", () => {
    const { bands } = sankeyLayout([flow("a", 100)], [flow("b", 100)], OPTS);
    for (const band of bands) {
      expect(band.path.startsWith("M")).toBe(true);
      expect(band.path.endsWith("Z")).toBe(true);
      expect(band.path).toContain("C");
      expect(band.path).not.toContain("NaN");
    }
  });
});
