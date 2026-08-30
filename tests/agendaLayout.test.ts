import { describe, it, expect } from "vitest";
import { layoutDay } from "@/components/pages/AgendaPage";

const day = new Date(2026, 7, 30);
const at = (h: number, m = 0) => new Date(2026, 7, 30, h, m).toISOString();
const ev = (id: string, from: [number, number], to: [number, number]) => ({
  id, summary: id, start: at(...from), end: at(...to),
});
const segs = (out: any[], id: string) =>
  out.find((e) => e.id === id)._segs.map((s: any) => [s.startMin, s.endMin, s.col, s.span]);

describe("layoutDay — partage de largeur", () => {
  it("rend sa pleine largeur au bloc long dès que le court est fini", () => {
    const out = layoutDay([ev("long", [9, 0], [10, 0]), ev("court", [9, 0], [9, 15])], day);
    // Une heure partagée seulement sur le quart d'heure réellement commun.
    expect(segs(out, "long")).toEqual([[540, 555, 1, 1], [555, 600, 0, 2]]);
    expect(segs(out, "court")).toEqual([[540, 555, 0, 1]]);
  });

  it("s'étale aussi vers la gauche quand c'est le voisin de gauche qui s'arrête", () => {
    const out = layoutDay([ev("court", [9, 0], [9, 15]), ev("long", [9, 0], [10, 0])], day);
    expect(segs(out, "long")).toEqual([[540, 555, 1, 1], [555, 600, 0, 2]]);
  });

  it("ne se resserre que sur la tranche croisée, pas avant ni après", () => {
    const out = layoutDay([ev("long", [9, 0], [11, 0]), ev("court", [10, 0], [10, 15])], day);
    expect(segs(out, "long")).toEqual([[540, 600, 0, 2], [600, 615, 0, 1], [615, 660, 0, 2]]);
  });

  it("compte autant de parts que d'évènements réellement simultanés", () => {
    const out = layoutDay(
      [ev("a", [9, 0], [11, 0]), ev("b", [9, 0], [9, 30]), ev("c", [9, 5], [9, 20])],
      day,
    );
    expect(segs(out, "a")).toEqual([[540, 545, 1, 2], [545, 560, 1, 1], [560, 570, 1, 2], [570, 660, 0, 3]]);
  });

  it("ne dégage un bord que là où un voisin vient remplir la colonne", () => {
    const out = layoutDay([ev("long", [9, 0], [10, 0]), ev("court", [9, 0], [9, 15])], day);
    const at = (id: string) => {
      const e = out.find((x: any) => x.id === id);
      return [e._gapTop, e._gapBottom];
    };
    // Le court se fait remplir par-dessous : seul ce bord-là est dégagé.
    expect(at("court")).toEqual([false, true]);
    // Le long, lui, ne recule nulle part — il est le remplisseur.
    expect(at("long")).toEqual([false, false]);
  });

  it("laisse jointifs deux blocs simplement consécutifs", () => {
    // Une même colonne libérée puis reprise n'est pas un remplissage : c'est
    // l'heure qui sépare les deux, et la grille le dit déjà.
    const out = layoutDay(
      [ev("a", [9, 0], [9, 30]), ev("b", [9, 30], [10, 0]), ev("cote", [9, 0], [10, 0])],
      day,
    );
    const a = out.find((x: any) => x.id === "a");
    expect([a._gapTop, a._gapBottom]).toEqual([false, false]);
  });

  it("laisse d'un seul tenant un bloc que rien ne croise", () => {
    const out = layoutDay([ev("a", [9, 0], [10, 0]), ev("b", [10, 0], [11, 0])], day);
    expect(segs(out, "a")).toEqual([[540, 600, 0, 1]]);
    expect(segs(out, "b")).toEqual([[600, 660, 0, 1]]);
  });
});
