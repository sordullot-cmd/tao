/**
 * Maille des courbes de P&L.
 *
 * Ce qui est sous test, c'est qu'il n'y a PLUS de seuil : la courbe se lit trade
 * par trade sur toutes les pastilles, et changer de fenêtre ne change plus la
 * nature du tracé. Le reste — cumul, ordre, points écartés — est vérifié sur la
 * journée à plusieurs trades, seul cas où les deux mailles divergent vraiment.
 *
 * `cumulativeByDay` reste testé : il ne porte plus la courbe, mais toujours le
 * drawdown des statistiques et le calendrier.
 */

import { describe, it, expect } from "vitest";
import { cumulativeByDay, cumulativeByTrade, pnlCurve } from "@/lib/ui/pnlCurve";

/* Une journée qui plonge puis se rattrape : son cumul quotidien (+50) ne dit
   rien du -150 traversé en cours de séance. C'est exactement ce que la maille
   « trade » doit rendre visible. */
const JOURNEE = [
  { date: "2026-09-01", entry_time: "09:15", exit_time: "09:40", pnl: -150 },
  { date: "2026-09-01", entry_time: "14:02", exit_time: "14:30", pnl: 200 },
  { date: "2026-09-02", entry_time: "10:00", exit_time: "10:20", pnl: -30 },
];

describe("cumulativeByDay", () => {
  it("garde le dernier cumul de la journée, pas ce qu'elle a traversé", () => {
    expect(cumulativeByDay(JOURNEE)).toEqual([
      { date: "2026-09-01", cum: 50 },
      { date: "2026-09-02", cum: 20 },
    ]);
  });

  it("écarte un trade dont la date est illisible plutôt que de le placer au hasard", () => {
    const avecRebut = [...JOURNEE, { date: "", pnl: 999 }, { date: "plus tard", pnl: 999 }];
    expect(cumulativeByDay(avecRebut)).toEqual(cumulativeByDay(JOURNEE));
  });
});

describe("cumulativeByTrade", () => {
  it("descend au trade et expose le creux que le cumul quotidien masquait", () => {
    expect(cumulativeByTrade(JOURNEE).map((p) => p.cum)).toEqual([-150, 50, 20]);
  });

  it("porte l'instant du trade, pas son seul jour — deux points d'une même séance se distinguent", () => {
    const [premier, second] = cumulativeByTrade(JOURNEE);
    expect(premier.date).toBe("2026-09-01T09:40:00");
    expect(second.date).toBe("2026-09-01T14:30:00");
    expect(premier.label).not.toBe(second.label);
  });

  it("remet dans l'ordre une journée arrivée à l'envers", () => {
    const inverse = [JOURNEE[1], JOURNEE[0]];
    expect(cumulativeByTrade(inverse).map((p) => p.cum)).toEqual([-150, 50]);
  });

  it("joint au point le P&L du trade lui-même, que le cumul seul ne dit pas", () => {
    expect(cumulativeByTrade(JOURNEE).map((p) => p.delta)).toEqual([-150, 200, -30]);
  });
});

describe("pnlCurve", () => {
  it("descend au trade, et ne dépend plus de la fenêtre pour le faire", () => {
    expect(pnlCurve(JOURNEE)).toEqual(cumulativeByTrade(JOURNEE));
    expect(pnlCurve(JOURNEE)).toHaveLength(3);
  });

  it("ancre à zéro la veille du premier point quand la page le demande", () => {
    const [depart] = pnlCurve(JOURNEE, { anchorZero: true });
    expect(depart).toEqual({ date: "2026-08-31", cum: 0 });
  });

  it("n'invente pas d'ancre pour une série vide", () => {
    expect(pnlCurve([], { anchorZero: true })).toEqual([]);
  });
});
