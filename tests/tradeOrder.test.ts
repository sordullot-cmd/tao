import { describe, it, expect } from "vitest";
import { byMostRecent, byOldest, tradeInstant } from "@/lib/tradeOrder";

const tr = (over: Record<string, unknown> = {}) => ({
  date: "2026-09-01",
  entry_time: "10:00:00",
  exit_time: "10:05:00",
  ...over,
});

describe("ordre chronologique des trades", () => {
  it("départage deux trades du même jour", () => {
    // Le cas qui retournait la liste : une journée entière importée d'un coup.
    const matin = tr({ exit_time: "09:12:00" });
    const soir = tr({ exit_time: "17:01:15" });
    expect([matin, soir].sort(byMostRecent)).toEqual([soir, matin]);
    expect([soir, matin].sort(byOldest)).toEqual([matin, soir]);
  });

  it("garde l'ordre des jours quand les heures manquent", () => {
    const hier = { date: "2026-08-31" };
    const aujourdhui = { date: "2026-09-01" };
    expect([hier, aujourdhui].sort(byMostRecent)).toEqual([aujourdhui, hier]);
  });

  it("compare l'heure de sortie, pas celle d'entrée", () => {
    // Deux entrées dans la même seconde, sorties à dix minutes d'écart.
    const court = tr({ exit_time: "10:01:00" });
    const long = tr({ exit_time: "10:11:00" });
    expect([court, long].sort(byMostRecent)[0]).toBe(long);
  });

  it("retombe sur l'heure d'entrée quand la sortie manque", () => {
    expect(tradeInstant({ date: "2026-09-01", entry_time: "08:30:00" }))
      .toBe("2026-09-01T08:30:00");
  });

  it("normalise une heure écrite sur un seul chiffre", () => {
    // "9:05" se comparerait après "17:00" en tri lexical sans ce cadrage.
    expect(tradeInstant({ date: "2026-09-01", exit_time: "9:05" }))
      .toBe("2026-09-01T09:05:00");
    const tot = { date: "2026-09-01", exit_time: "9:05" };
    const tard = { date: "2026-09-01", exit_time: "17:00" };
    expect([tot, tard].sort(byMostRecent)[0]).toBe(tard);
  });

  it("place un trade sans heure au début de sa journée", () => {
    const sansHeure = { date: "2026-09-01" };
    const avecHeure = tr();
    expect([sansHeure, avecHeure].sort(byOldest)).toEqual([sansHeure, avecHeure]);
  });

  it("tolère une date ISO complète comme une date courte", () => {
    expect(tradeInstant({ date: "2026-09-01T00:00:00.000Z", exit_time: "10:05:00" }))
      .toBe("2026-09-01T10:05:00");
  });

  it("n'égare pas un trade dont la date manque", () => {
    const orphelin = { exit_time: "10:00:00" };
    const liste = [tr(), orphelin, tr({ date: "2026-08-31" })];
    expect(liste.slice().sort(byMostRecent)).toHaveLength(3);
    // Sans date, il finit en queue plutôt qu'en tête de la liste des récents.
    expect(liste.slice().sort(byMostRecent).at(-1)).toBe(orphelin);
  });
});
