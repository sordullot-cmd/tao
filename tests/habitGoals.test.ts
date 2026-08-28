/**
 * Pont « Habitudes ↔ Objectifs ».
 *
 * Couvre les deux règles qui décident seules du pourcentage affiché :
 *  - la fenêtre comptée va de la CRÉATION de l'objectif à sa DEADLINE, et c'est
 *    elle qui fixe la cible (une échéance à un an = 365 jours à tenir) ;
 *  - l'avancement est la MOYENNE des jours de chaque habitude rattachée, pour
 *    qu'ajouter une habitude ne fasse pas bondir l'objectif tout seul.
 */

import { describe, it, expect } from "vitest";
import {
  HABIT_AUTO_TYPE, HABIT_ONTRACK_RATE, HABIT_TARGET_DAYS, HABIT_WEEKDAYS,
  countHabitDays, goalsForHabit, habitAssiduityOf, habitDayCounts, habitGoalAssiduity,
  habitGoalDayKeys, habitGoalElapsedDays, habitGoalHabitIds, habitGoalRangeLabel,
  habitGoalRemainingDays, habitGoalTargetDays, habitGoalWindow, isHabitGoal,
} from "@/lib/habitGoals";

// 2026 commence un jeudi. Le 5 janvier et le 2 février sont des lundis, le 10
// janvier un samedi — de quoi éprouver le filtre de jours de semaine.
const history = {
  "1": { "2026-01-05": true, "2026-01-06": true, "2026-01-10": true, "2026-02-02": true },
  "2": { "2026-01-06": true, "2026-01-07": true },
  "3": { "2026-01-08": false },
};

// Objectif né le 1er janvier 2026, à tenir jusqu'au 31 décembre : 365 jours.
const goal = (extra: Record<string, unknown> = {}) => ({
  autoType: HABIT_AUTO_TYPE, habitIds: ["1"],
  createdAt: "2026-01-01T08:00:00.000Z", deadline: "2026-12-31",
  ...extra,
});

describe("habitGoalTargetDays — la cible, c'est la deadline", () => {
  it("compte les jours de la création à l'échéance, bornes incluses", () => {
    expect(habitGoalTargetDays(goal())).toBe(365);
    expect(habitGoalTargetDays(goal({ deadline: "2026-01-31" }))).toBe(31);
  });

  it("retient une année pleine quand aucune échéance n'est fixée", () => {
    expect(habitGoalTargetDays(goal({ deadline: "" }))).toBe(HABIT_TARGET_DAYS);
    expect(habitGoalWindow(goal({ deadline: "" }))).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("rabote la cible d'autant que les jours de semaine écartés", () => {
    // 2026 compte 52 lundis, et 5 × 52 = 261 jours ouvrés.
    expect(habitGoalTargetDays(goal({ habitDays: [1] }))).toBe(52);
    expect(habitGoalTargetDays(goal({ habitDays: [1, 2, 3, 4, 5] }))).toBe(261);
  });

  it("prend l'id pour date de naissance quand `createdAt` manque", () => {
    const id = new Date(2026, 0, 1).getTime();
    expect(habitGoalTargetDays({ ...goal({ createdAt: undefined }), id })).toBe(365);
  });

  it("ne rend rien d'une échéance déjà passée à la création", () => {
    expect(habitGoalTargetDays(goal({ deadline: "2025-12-31" }))).toBe(0);
  });
});

describe("countHabitDays", () => {
  it("compte les jours cochés de l'habitude rattachée", () => {
    expect(countHabitDays(goal(), history)).toBe(4);
  });

  it("ne compte rien tant qu'aucune habitude n'est rattachée", () => {
    expect(countHabitDays(goal({ habitIds: [] }), history)).toBe(0);
    expect(countHabitDays(goal({ habitIds: undefined }), history)).toBe(0);
  });

  it("ignore les jours décochés (valeur fausse laissée dans l'historique)", () => {
    expect(countHabitDays(goal({ habitIds: ["3"] }), history)).toBe(0);
  });

  it("fait la moyenne des habitudes rattachées, sans les additionner", () => {
    // 4 jours d'un côté, 2 de l'autre : l'objectif est à 3, pas à 6 — il faut
    // tenir les deux habitudes pour le faire monter.
    expect(habitDayCounts(goal({ habitIds: ["1", "2"] }), history)).toEqual([4, 2]);
    expect(countHabitDays(goal({ habitIds: ["1", "2"] }), history)).toBe(3);
  });

  it("compare les ids en chaîne — le JSON rend parfois des nombres", () => {
    expect(countHabitDays(goal({ habitIds: [1] }), history)).toBe(4);
  });

  it("ignore les jours tenus avant la création de l'objectif", () => {
    expect(countHabitDays(goal({ createdAt: "2026-01-07T00:00:00.000Z" }), history)).toBe(2);
  });

  it("ignore les jours postérieurs à l'échéance", () => {
    expect(countHabitDays(goal({ deadline: "2026-01-06" }), history)).toBe(2);
  });

  it("ne garde que les jours de semaine demandés", () => {
    // Lundi seul : les 5 janvier et 2 février, pas le 6 (mardi) ni le 10 (samedi).
    expect(countHabitDays(goal({ habitDays: [1] }), history)).toBe(2);
    // Samedi + dimanche : le 10 janvier uniquement.
    expect(countHabitDays(goal({ habitDays: [6, 0] }), history)).toBe(1);
  });

  it("traite « tous les jours » et « aucun jour choisi » de la même façon", () => {
    const all = HABIT_WEEKDAYS.map(d => d.id);
    expect(countHabitDays(goal({ habitDays: [] }), history)).toBe(4);
    expect(countHabitDays(goal({ habitDays: all }), history)).toBe(4);
  });

  it("survit à un historique vide ou absent", () => {
    expect(countHabitDays(goal(), {})).toBe(0);
    expect(countHabitDays(goal(), undefined)).toBe(0);
  });

  it("boucle l'objectif à 100 % au bout d'une année de jours cochés", () => {
    const year: Record<string, boolean> = {};
    const d = new Date(2026, 0, 1);
    for (let i = 0; i < 365; i++) {
      year[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`] = true;
      d.setDate(d.getDate() + 1);
    }
    const g = goal();
    const pct = (countHabitDays(g, { "1": year }) / habitGoalTargetDays(g)) * 100;
    expect(pct).toBe(100);
  });
});

describe("habitGoalDayKeys", () => {
  it("rend l'union des jours tenus, triée et sans doublon", () => {
    expect(habitGoalDayKeys(goal({ habitIds: ["1", "2"] }), history)).toEqual([
      "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-10", "2026-02-02",
    ]);
  });
});

describe("rattachement", () => {
  it("reconnaît un objectif nourri par les habitudes", () => {
    expect(isHabitGoal(goal())).toBe(true);
    expect(isHabitGoal({ autoType: "manual" })).toBe(false);
    expect(isHabitGoal(null)).toBe(false);
  });

  it("normalise les ids rattachés en chaînes", () => {
    expect(habitGoalHabitIds({ habitIds: [1, "2", null] as never })).toEqual(["1", "2"]);
    expect(habitGoalHabitIds({})).toEqual([]);
  });

  it("retrouve les objectifs d'une habitude, en ignorant les autres sources", () => {
    const goals = [
      { id: 10, autoType: HABIT_AUTO_TYPE, habitIds: ["1"] },
      { id: 11, autoType: HABIT_AUTO_TYPE, habitIds: ["2"] },
      { id: 12, autoType: "manual", habitIds: ["1"] },
    ];
    expect(goalsForHabit(goals, 1).map(g => g.id)).toEqual([10]);
    expect(goalsForHabit(goals, "9")).toEqual([]);
  });
});

describe("habitGoalRangeLabel", () => {
  it("dit la fenêtre comptée en clair, création comprise", () => {
    const label = habitGoalRangeLabel(goal());
    expect(label.startsWith("du ")).toBe(true);
    expect(label).toContain(" au ");
    expect(label.match(/2026/g)).toHaveLength(2);
  });
});

describe("assiduité — le seul retard qui ait un sens ici", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`);

  it("compte les jours passés de la fenêtre, aujourd'hui inclus", () => {
    expect(habitGoalElapsedDays(goal(), at("2026-01-10"))).toBe(10);
    // Filtre du lundi : un seul lundi entre le 1er et le 10 janvier.
    expect(habitGoalElapsedDays(goal({ habitDays: [1] }), at("2026-01-10"))).toBe(1);
  });

  it("borne les jours passés à la fenêtre, avant comme après", () => {
    expect(habitGoalElapsedDays(goal(), at("2025-12-20"))).toBe(0);
    expect(habitGoalElapsedDays(goal(), at("2027-06-01"))).toBe(365);
  });

  it("déduit les jours restants de la cible", () => {
    expect(habitGoalRemainingDays(goal(), at("2026-01-10"))).toBe(355);
    expect(habitGoalRemainingDays(goal(), at("2027-06-01"))).toBe(0);
  });

  it("mesure la régularité, pas l'écart au temps écoulé", () => {
    // 3 jours tenus sur les 10 écoulés : 30 % de régularité, et l'objectif
    // décroche — alors qu'il est « en retard » sur le calendrier dès le 2e jour.
    expect(habitGoalAssiduity(goal(), history, at("2026-01-10"))).toBeCloseTo(0.3, 5);
    expect(habitAssiduityOf(8, goal(), at("2026-01-10"))).toBeCloseTo(0.8, 5);
    expect(habitAssiduityOf(8, goal(), at("2026-01-10"))).toBeGreaterThan(HABIT_ONTRACK_RATE);
  });

  it("ne condamne pas un objectif qui n'a pas encore commencé", () => {
    expect(habitAssiduityOf(0, goal(), at("2025-12-01"))).toBe(1);
  });

  it("plafonne à 1 — jamais « en avance » sur des jours", () => {
    expect(habitAssiduityOf(50, goal(), at("2026-01-10"))).toBe(1);
  });
});
