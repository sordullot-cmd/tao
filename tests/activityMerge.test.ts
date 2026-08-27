import { describe, it, expect } from "vitest";
import { mergeSlices } from "@/lib/activity/merge";

/* Une journée peut être mesurée par deux appareils à la fois. Ce qui se joue ici
   ne se voit pas à l'écran : un total gonflé « a l'air » plausible. */

const at = (h: number, m = 0) => new Date(2026, 2, 2, h, m, 0, 0).getTime();
const seg = (a: [number, number], b: [number, number], label: string, cat: string) =>
  ({ s: at(...a), e: at(...b), app: label, label, title: "", cat });

const span = (segments: { s: number; e: number }[]) =>
  segments.reduce((n, x) => n + (x.e - x.s), 0) / 60_000;

describe("fusion de plusieurs appareils", () => {
  it("laisse une source unique intacte", () => {
    const only = [seg([9, 0], [10, 0], "VS Code", "dev")];
    expect(mergeSlices([{ kind: "desktop", segments: only }])).toEqual(only);
    // Et un téléphone seul est une source comme une autre : poste éteint, c'est
    // lui qui raconte la soirée.
    expect(mergeSlices([{ kind: "mobile", segments: only }])).toEqual(only);
  });

  it("ne compte une minute qu'une fois", () => {
    const merged = mergeSlices([
      { kind: "desktop", segments: [seg([9, 0], [10, 0], "VS Code", "dev")] },
      { kind: "mobile", segments: [seg([9, 30], [10, 30], "tao trade", "trading")] },
    ]);
    // 1 h de poste + la demi-heure que le téléphone a en propre, pas 2 h.
    expect(span(merged)).toBe(90);
  });

  it("donne la minute contestée au poste, avec SA catégorie", () => {
    const merged = mergeSlices([
      { kind: "mobile", segments: [seg([9, 0], [10, 0], "tao trade", "trading")] },
      { kind: "desktop", segments: [seg([9, 0], [9, 30], "VS Code", "dev")] },
    ]);
    expect(merged.map(s => s.cat)).toEqual(["dev", "trading"]);
    expect(span(merged)).toBe(60);
    // Le téléphone ne garde que ce que le poste ne couvrait pas.
    expect(merged[1].s).toBe(at(9, 30));
  });

  it("découpe le morceau du milieu quand le poste tourne au milieu", () => {
    const merged = mergeSlices([
      { kind: "mobile", segments: [seg([9, 0], [12, 0], "tao trade", "trading")] },
      { kind: "desktop", segments: [seg([10, 0], [11, 0], "VS Code", "dev")] },
    ]);
    expect(merged.map(s => [s.s, s.e])).toEqual([
      [at(9, 0), at(10, 0)],
      [at(10, 0), at(11, 0)],
      [at(11, 0), at(12, 0)],
    ]);
    expect(span(merged)).toBe(180);
  });

  it("ne fait pas se disputer deux segments du même appareil", () => {
    // Deux relevés voisins du même poste se touchent : rien à arbitrer.
    const merged = mergeSlices([
      { kind: "desktop", segments: [seg([9, 0], [9, 30], "VS Code", "dev"), seg([9, 30], [10, 0], "GitHub", "dev")] },
    ]);
    expect(span(merged)).toBe(60);
  });
});
