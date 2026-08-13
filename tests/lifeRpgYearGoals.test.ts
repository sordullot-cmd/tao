/**
 * Page « Quête de soi » — trois objectifs de l'année.
 *
 * Couvre les briques pures du nouveau système : la sélection des trois
 * objectifs conservés lors de la migration depuis l'ancien jeu de catégories,
 * et les repères de temps (avancement dans l'année, jours avant échéance).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MAX_YEAR_GOALS, pickTopYearGoals,
  currentYear, yearDeadline, yearProgress, daysUntil,
} from "@/lib/lifeRpgCategories";

const cats = [
  { id: "force", label: "Force" },
  { id: "trading", label: "Trading" },
  { id: "social", label: "Social" },
  { id: "finance", label: "Finances" },
  { id: "mind", label: "Sérénité" },
];

afterEach(() => vi.useRealTimers());

describe("pickTopYearGoals", () => {
  it("ne garde que trois objectifs, les plus avancés en XP", () => {
    const kept = pickTopYearGoals(cats, { force: 10, trading: 900, social: 50, finance: 300, mind: 0 });
    expect(kept).toHaveLength(MAX_YEAR_GOALS);
    expect(kept.map(c => c.id)).toEqual(["trading", "finance", "social"]);
  });

  it("départage à XP égale par le nombre d'objectifs chiffrés rattachés", () => {
    const kept = pickTopYearGoals(
      cats,
      { force: 100, trading: 100, social: 100, finance: 100, mind: 100 },
      { social: 3, force: 1 },
    );
    expect(kept.map(c => c.id)).toEqual(["social", "force", "trading"]);
  });

  it("retombe sur l'ordre d'origine quand tout est à égalité (déterministe)", () => {
    expect(pickTopYearGoals(cats).map(c => c.id)).toEqual(["force", "trading", "social"]);
  });

  it("laisse passer une liste déjà courte, et tolère l'absence de données", () => {
    expect(pickTopYearGoals(cats.slice(0, 2)).map(c => c.id)).toEqual(["force", "trading"]);
    expect(pickTopYearGoals(null as never)).toEqual([]);
  });
});

describe("repères de l'année", () => {
  it("mesure le temps écoulé et les jours restants", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2, 12, 0, 0)); // 2 juillet 2026, mi-année
    const yp = yearProgress(2026);
    expect(yp.pct).toBeGreaterThan(49);
    expect(yp.pct).toBeLessThan(51);
    expect(yp.daysLeft).toBe(183);
    expect(yp.totalDays).toBe(365);
  });

  it("borne l'avancement d'une année passée ou à venir", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 2));
    expect(yearProgress(2025).pct).toBe(100);
    expect(yearProgress(2027).pct).toBe(0);
  });

  it("compte les jours jusqu'à une échéance, négatifs une fois dépassée", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 25, 10, 0, 0)); // 25 décembre 2026
    // Le jour en cours compte (même convention que la page Objectifs).
    expect(daysUntil("2026-12-31")).toBe(7);
    expect(daysUntil("2026-12-20")).toBe(-4);
    expect(daysUntil("")).toBeNull();
    expect(daysUntil("pas-une-date")).toBeNull();
  });

  it("propose le 31 décembre de l'année en cours comme échéance par défaut", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9));
    expect(currentYear()).toBe(2026);
    expect(yearDeadline()).toBe("2026-12-31");
    expect(yearDeadline(2030)).toBe("2030-12-31");
  });
});
