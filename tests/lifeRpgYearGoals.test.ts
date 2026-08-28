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
  currentYear, yearDeadline, yearProgress, categoryTimeProgress, daysUntil,
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

describe("categoryTimeProgress", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`);
  const born = (iso: string) => `cat_${new Date(`${iso}T09:00:00`).getTime()}`;

  it("part de la naissance de la carte, pas du 1er janvier", () => {
    // Objectif défini le 1er septembre, échéance au 31 décembre : au 1er octobre
    // il n'a consommé qu'un mois de ses quatre — et non les trois quarts de
    // l'année, qui l'auraient déclaré en retard avant son premier jour.
    const cat = { id: born("2026-09-01"), deadline: "2026-12-31" };
    expect(Math.round(categoryTimeProgress(cat, 2026, at("2026-10-01")).pct)).toBe(25);
    expect(Math.round(yearProgress(2026, at("2026-10-01")).pct)).toBe(75);
  });

  it("repart du 1er janvier pour une carte née avant l'année", () => {
    const cat = { id: born("2025-11-02"), deadline: "2026-12-31" };
    expect(Math.round(categoryTimeProgress(cat, 2026, at("2026-07-02")).pct)).toBe(50);
  });

  it("repart du 1er janvier pour une carte héritée, dont l'id ne date de rien", () => {
    const cat = { id: "trading", deadline: "2026-12-31" };
    expect(Math.round(categoryTimeProgress(cat, 2026, at("2026-07-02")).pct)).toBe(50);
  });

  it("borne le repère à sa fenêtre et compte les jours restants", () => {
    const cat = { id: born("2026-03-01"), deadline: "2026-06-30" };
    expect(categoryTimeProgress(cat, 2026, at("2026-01-15")).pct).toBe(0);
    expect(categoryTimeProgress(cat, 2026, at("2026-09-01")).pct).toBe(100);
    expect(categoryTimeProgress(cat, 2026, at("2026-06-20")).daysLeft).toBe(11);
  });

  it("ne divise pas par zéro quand l'échéance tombe le jour de la création", () => {
    const cat = { id: born("2026-06-30"), deadline: "2026-05-01" };
    expect(categoryTimeProgress(cat, 2026, at("2026-07-01"))).toEqual({ pct: 0, daysLeft: 0 });
  });
});
