import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

/* Les courbes de fond d'un graphique de P&L (les autres comptes, les autres
   stratégies) sortaient DROITES dès que la série de premier plan avait peu de
   points : elles n'étaient lues qu'aux rangs de celle-ci, et tout ce qu'elles
   faisaient entre deux de ces rangs était perdu. Sur la page d'une stratégie à
   trois trades, une stratégie voisine qui en avait cinquante se réduisait à
   trois paliers — et à un trait plat quand les trades de la principale, sans
   heure d'entrée, tombaient au même instant.

   Ces tests lisent le `d` des <path> de fond : ce sont eux qui disent si le
   relief est là. */

import { PnlChart } from "@/components/ui/da";

/** Ordonnées du path d'une série, dans l'ordre du tracé. */
const ysOf = (d: string): number[] =>
  [...d.matchAll(/[ML]\s+[-\d.]+\s+([-\d.]+)/g)].map((m) => Number(m[1]));

/** Les <path> de fond : trait fin, sans remplissage — ni l'aire ni la courbe
 *  principale (trait de 4). */
const backgroundPaths = (root: HTMLElement): SVGPathElement[] =>
  [...root.querySelectorAll("path")].filter(
    (p) => p.getAttribute("stroke-width") === "2",
  ) as unknown as SVGPathElement[];

const day = (n: number, hour = 0) =>
  `2026-03-${String(n).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00`;

describe("PnlChart — les courbes d'arrière-plan", () => {
  it("garde le relief d'une série dense derrière une principale à trois points", () => {
    const main = [
      { date: day(1), cum: 100 },
      { date: day(10), cum: 50 },
      { date: day(20), cum: 300 },
    ];
    // Un point tous les deux jours, en dents de scie.
    const dense = Array.from({ length: 10 }, (_, i) => ({
      date: day(1 + i * 2),
      cum: i % 2 === 0 ? 40 * i : -40 * i,
    }));

    const { container } = render(
      <PnlChart
        points={main}
        others={[{ id: "b", name: "B", color: "#f00", points: dense }]}
        color="#00f"
      />,
    );

    const bg = backgroundPaths(container);
    expect(bg).toHaveLength(1);
    const ys = ysOf(bg[0].getAttribute("d") || "");
    // Un point d'ancrage au bord gauche + les dix points de la série.
    expect(ys.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ys.map((y) => y.toFixed(1))).size).toBeGreaterThan(3);
  });

  it("trace la série de fond même quand la principale n'a pas d'heure d'entrée", () => {
    // Trois trades le MÊME jour, sans heure : même instant pour les trois.
    const main = [
      { date: day(5), cum: 10 },
      { date: day(5), cum: 20 },
      { date: day(5), cum: 30 },
      { date: day(6), cum: 40 },
    ];
    const other = [
      { date: day(5, 9), cum: 100 },
      { date: day(5, 12), cum: -80 },
      { date: day(5, 16), cum: 260 },
      { date: day(6, 10), cum: 20 },
    ];

    const { container } = render(
      <PnlChart
        points={main}
        others={[{ id: "b", name: "B", color: "#f00", points: other }]}
        color="#00f"
      />,
    );

    const ys = ysOf(backgroundPaths(container)[0].getAttribute("d") || "");
    expect(new Set(ys.map((y) => y.toFixed(1))).size).toBeGreaterThan(2);
  });

  it("part à plat du bord gauche tant que la série n'a rien produit", () => {
    const main = [
      { date: day(1), cum: 0 },
      { date: day(2), cum: 100 },
      { date: day(3), cum: 200 },
      { date: day(4), cum: 300 },
    ];
    const late = [
      { date: day(3), cum: 150 },
      { date: day(4), cum: 90 },
    ];

    const { container } = render(
      <PnlChart
        points={main}
        others={[{ id: "b", name: "B", color: "#f00", points: late }]}
        color="#00f"
      />,
    );

    const ys = ysOf(backgroundPaths(container)[0].getAttribute("d") || "");
    // Les deux premiers rangs valent 0 : la ligne entre à plat.
    expect(ys[0]).toBeCloseTo(ys[1], 1);
    expect(ys[2]).not.toBeCloseTo(ys[1], 1);
  });

  it("ne trace rien pour une série sans point", () => {
    const main = [
      { date: day(1), cum: 10 },
      { date: day(2), cum: 20 },
    ];
    const { container } = render(
      <PnlChart
        points={main}
        others={[{ id: "b", name: "B", color: "#f00", points: [] }]}
        color="#00f"
      />,
    );
    expect(backgroundPaths(container)).toHaveLength(0);
  });
});
