/**
 * Fenêtres des pastilles, ancrées sur le calendrier.
 *
 * Ce qui est sous test, c'est l'ancrage : une fenêtre de mois commence un 1er,
 * une fenêtre d'année un 1er janvier, et reculer d'un cran donne le mois (ou
 * l'année) d'avant EN ENTIER — sans chevauchement ni trou avec la fenêtre
 * courante. Les longueurs de mois inégales et les bissextiles sont la seule
 * façon de casser ça, d'où les dates choisies.
 */

import { describe, it, expect } from "vitest";
import { periodDays, periodRange, periodStart } from "@/lib/ui/period";

/** AAAA-MM-JJ d'une date locale — plus lisible qu'un `Date` dans un diff. */
const key = (d: Date): string =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

const range = (id: string, offset: number, today: Date) => {
  const r = periodRange(id, offset, today);
  return r ? { start: key(r.start), end: key(r.end) } : null;
};

const AOUT_14 = new Date(2026, 7, 14); // vendredi 14 août 2026

describe("periodRange", () => {
  it("fait commencer « 1 mois » au 1er du mois courant", () => {
    expect(range("1M", 0, AOUT_14)).toEqual({ start: "2026-08-01", end: "2026-08-14" });
  });

  it("fait commencer « 3 mois » au 1er, deux mois en arrière", () => {
    // Trois mois CIVILS, celui-ci compris : juin, juillet, août.
    expect(range("3M", 0, AOUT_14)).toEqual({ start: "2026-06-01", end: "2026-08-14" });
  });

  it("fait commencer « 1 an » au 1er janvier", () => {
    expect(range("1A", 0, AOUT_14)).toEqual({ start: "2026-01-01", end: "2026-08-14" });
  });

  it("arrête la fenêtre courante aujourd'hui, jamais à la fin du mois", () => {
    // Un mois en cours n'a pas de futur à montrer.
    expect(range("1M", 0, new Date(2026, 7, 1))).toEqual({ start: "2026-08-01", end: "2026-08-01" });
    expect(periodDays("1M", new Date(2026, 7, 1))).toBe(1);
  });

  it("recule d'un mois entier, sans chevauchement ni trou", () => {
    expect(range("1M", 1, AOUT_14)).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(range("1M", 2, AOUT_14)).toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });

  it("recule d'un trimestre entier", () => {
    expect(range("3M", 1, AOUT_14)).toEqual({ start: "2026-03-01", end: "2026-05-31" });
  });

  it("recule d'une année entière", () => {
    expect(range("1A", 1, AOUT_14)).toEqual({ start: "2025-01-01", end: "2025-12-31" });
  });

  it("passe l'an sans se tromper de mois", () => {
    // Janvier moins deux mois, c'est novembre de l'année d'avant.
    expect(range("3M", 0, new Date(2026, 0, 20))).toEqual({ start: "2025-11-01", end: "2026-01-20" });
    expect(range("1M", 1, new Date(2026, 0, 20))).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("donne à février sa vraie longueur", () => {
    // 2028 est bissextile : le mois précédent s'arrête le 29, pas le 28.
    expect(range("1M", 1, new Date(2028, 2, 10))).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(range("1M", 1, new Date(2026, 2, 10))).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("laisse « 1 semaine » glissante", () => {
    // Sept jours pleins, bornes incluses — une semaine civile aurait donné un
    // seul jour tous les lundis.
    expect(range("1S", 0, AOUT_14)).toEqual({ start: "2026-08-08", end: "2026-08-14" });
    expect(range("1S", 1, AOUT_14)).toEqual({ start: "2026-08-01", end: "2026-08-07" });
    expect(periodDays("1S", AOUT_14)).toBe(7);
  });

  it("ne borne rien pour un identifiant qui ne désigne pas de fenêtre", () => {
    // « Tout », « Personnalisé », ou une valeur venue d'une version antérieure.
    expect(periodRange("ALL", 0, AOUT_14)).toBeNull();
    expect(periodDays("CUSTOM", AOUT_14)).toBeNull();
    expect(periodStart("n'importe quoi", AOUT_14)).toBeNull();
  });
});

describe("periodDays", () => {
  it("compte les deux bornes", () => {
    expect(periodDays("1M", AOUT_14)).toBe(14);        // du 1er au 14
    expect(periodDays("3M", AOUT_14)).toBe(30 + 31 + 14); // juin, juillet, 14 jours d'août
    expect(periodDays("1A", AOUT_14)).toBe(226);       // 31+28+31+30+31+30+31+14
  });
});
