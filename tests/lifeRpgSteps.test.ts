/**
 * Page « Quête de soi » — étapes d'un objectif de l'année.
 *
 * Ce que ces tests protègent tient en une phrase : un objectif d'un an sans
 * point de passage ne se pilote pas. Les règles qui en découlent — l'ordre
 * chronologique, le retard, l'avancement qui compte les jalons autant que les
 * chiffres — sont exactement ce qui fait qu'on sait « où on va », et se
 * tromperaient silencieusement si elles dérivaient.
 */

import { describe, it, expect } from "vitest";
import {
  addStep,
  cardProgress,
  goalPctsOf,
  groupGoalPctsByStep,
  isStepDone,
  readSteps,
  removeStep,
  sortSteps,
  stepCompletion,
  stepStatus,
  stepsProgress,
  toggleStep,
  updateStep,
  yearMarkers,
  yearPosition,
  type LifeStep,
} from "@/lib/lifeRpgSteps";

const TODAY = "2026-08-14";

const step = (over: Partial<LifeStep> = {}): LifeStep => ({
  id: over.id ?? "s1",
  label: over.label ?? "Étape",
  due: over.due ?? null,
  done: over.done ?? false,
  doneAt: over.doneAt ?? null,
});

describe("lecture des étapes", () => {
  it("rend une liste vide pour une carte créée avant les étapes", () => {
    expect(readSteps({})).toEqual([]);
    expect(readSteps(null)).toEqual([]);
    expect(readSteps({ steps: "n'importe quoi" as unknown })).toEqual([]);
  });

  it("normalise ce qui vient du store, quelle que soit sa forme", () => {
    const [s] = readSteps({
      steps: [{ id: "a", label: "Certification", due: "2026-06-30T00:00:00.000Z", done: 1 }],
    });
    expect(s).toEqual({ id: "a", label: "Certification", due: "2026-06-30", done: true, doneAt: null });
  });
});

describe("ordre de la frise", () => {
  it("classe par échéance croissante", () => {
    const list = [
      step({ id: "c", due: "2026-12-01" }),
      step({ id: "a", due: "2026-02-01" }),
      step({ id: "b", due: "2026-06-01" }),
    ];
    expect(sortSteps(list).map(s => s.id)).toEqual(["a", "b", "c"]);
  });

  it("renvoie les étapes non datées à la fin, sans les perdre", () => {
    const list = [step({ id: "libre" }), step({ id: "datee", due: "2026-03-01" })];
    expect(sortSteps(list).map(s => s.id)).toEqual(["datee", "libre"]);
  });

  it("laisse les étapes franchies à leur place dans le temps", () => {
    // Une étape faite ne descend PAS en bas de liste : c'est le chemin parcouru
    // qui doit rester lisible sur le même axe que celui qui reste.
    const list = [
      step({ id: "futur", due: "2026-11-01" }),
      step({ id: "faite", due: "2026-03-01", done: true }),
    ];
    expect(sortSteps(list).map(s => s.id)).toEqual(["faite", "futur"]);
  });

  it("reste stable entre deux étapes de même date", () => {
    const list = [step({ id: "x", due: "2026-05-01" }), step({ id: "y", due: "2026-05-01" })];
    expect(sortSteps(list).map(s => s.id)).toEqual(["x", "y"]);
  });
});

describe("état d'une étape", () => {
  it("distingue franchie, en retard, aujourd'hui, à venir et non datée", () => {
    expect(stepStatus(step({ done: true, due: "2020-01-01" }), TODAY)).toBe("done");
    expect(stepStatus(step({ due: "2026-08-13" }), TODAY)).toBe("late");
    expect(stepStatus(step({ due: TODAY }), TODAY)).toBe("today");
    expect(stepStatus(step({ due: "2026-08-15" }), TODAY)).toBe("upcoming");
    expect(stepStatus(step({}), TODAY)).toBe("undated");
  });

  it("ne déclare jamais en retard une étape déjà franchie", () => {
    expect(stepStatus(step({ due: "2020-01-01", done: true }), TODAY)).toBe("done");
  });

  it("compte les franchies et les retards", () => {
    const list = [
      step({ id: "1", due: "2026-01-01", done: true }),
      step({ id: "2", due: "2026-08-01" }),
      step({ id: "3", due: "2026-12-01" }),
      step({ id: "4" }),
    ];
    expect(stepsProgress(list, TODAY)).toEqual({ done: 1, total: 4, late: 1, pct: 25 });
  });

  it("ne divise pas par zéro sur une carte sans étape", () => {
    expect(stepsProgress([], TODAY)).toEqual({ done: 0, total: 0, late: 0, pct: 0 });
  });
});

describe("objectifs chiffrés rattachés à une étape", () => {
  it("range les avancements par étape et ignore les objectifs libres", () => {
    const byStep = groupGoalPctsByStep([
      { rpgStep: "s1", pct: 40 },
      { rpgStep: "s1", pct: 80 },
      { rpgStep: null, pct: 10 },
      { pct: 90 },
    ]);
    expect(byStep).toEqual({ s1: [40, 80] });
    expect(goalPctsOf(byStep, "inconnue")).toEqual([]);
  });

  it("rend libre un objectif dont l'étape a été supprimée", () => {
    // Sans ce filtre, son avancement pèserait sur un jalon qui n'existe plus :
    // il disparaîtrait de la carte tout en continuant à la faire progresser.
    expect(groupGoalPctsByStep([{ rpgStep: "effacee", pct: 100 }], ["s1"])).toEqual({});
  });

  it("mesure l'étape par ses objectifs au lieu de la case à cocher", () => {
    const s = step({ id: "s1" });
    expect(stepCompletion(s)).toBe(0);
    expect(stepCompletion(s, [40, 80])).toBe(60);
    // Cochée à la main, elle vaut 100 quoi qu'en disent ses chiffres.
    expect(stepCompletion(step({ done: true }), [40])).toBe(100);
  });

  it("franchit l'étape quand TOUS ses objectifs sont atteints", () => {
    const s = step({ id: "s1" });
    expect(isStepDone(s, [100, 100])).toBe(true);
    expect(isStepDone(s, [100, 99])).toBe(false);
    // Le franchissement est dérivé : un objectif qui redescend rouvre l'étape.
    expect(isStepDone(s, [])).toBe(false);
  });

  it("ne déclare pas en retard une étape que ses chiffres ont déjà acquise", () => {
    const late = step({ due: "2026-08-01" });
    expect(stepStatus(late, TODAY)).toBe("late");
    expect(stepStatus(late, TODAY, [100])).toBe("done");
    expect(stepStatus(late, TODAY, [60])).toBe("late");
  });

  it("compte une étape à mi-chemin pour une demie", () => {
    const list = [step({ id: "s1" }), step({ id: "s2", done: true })];
    // s1 à 50 % via ses objectifs, s2 franchie → (50 + 100) / 2.
    expect(stepsProgress(list, TODAY, { s1: [30, 70] })).toEqual({ done: 1, total: 2, late: 0, pct: 75 });
  });

  it("compte franchie, dans l'avancement de la carte, une étape aux objectifs atteints", () => {
    const list = [step({ id: "s1" }), step({ id: "s2" })];
    expect(stepsProgress(list, TODAY, { s1: [100] })).toMatchObject({ done: 1, pct: 50 });
    expect(cardProgress({ steps: list, byStep: { s1: [100] }, today: TODAY }))
      .toMatchObject({ pct: 50, source: "measured", hasSteps: true, hasGoals: false });
  });

  it("ne compte pas deux fois un objectif rangé sous une étape", () => {
    // `goalPcts` ne porte que les objectifs LIBRES : ajouter celui de l'étape
    // ferait peser 100 % deux fois et afficherait une carte en avance.
    const list = [step({ id: "s1" }), step({ id: "s2" })];
    const both = cardProgress({ goalPcts: [], steps: list, byStep: { s1: [100] }, today: TODAY });
    expect(both.pct).toBe(50);
  });

  it("montre franchi, sur la frise de l'année, un jalon acquis par ses chiffres", () => {
    const cats = [{ id: "a", label: "Forme", steps: [step({ id: "s1", due: "2026-04-01" })] }];
    expect(yearMarkers(cats, 2026)[0].done).toBe(false);
    expect(yearMarkers(cats, 2026, { s1: [100] })[0].done).toBe(true);
  });
});

describe("écritures", () => {
  it("ajoute une étape, et refuse un libellé vide", () => {
    const one = addStep([], { label: "Passer le palier 1", due: "2026-09-01" });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ label: "Passer le palier 1", due: "2026-09-01", done: false });
    // La ligne de saisie abandonnée ne doit pas laisser de jalon fantôme.
    expect(addStep(one, { label: "   " })).toBe(one);
  });

  it("date le franchissement, et efface la date en décochant", () => {
    const list = addStep([], { label: "Semi-marathon" });
    const done = toggleStep(list, list[0].id, new Date("2026-08-14T10:00:00Z"));
    expect(done[0].done).toBe(true);
    expect(done[0].doneAt).toBe("2026-08-14T10:00:00.000Z");
    expect(toggleStep(done, list[0].id)[0]).toMatchObject({ done: false, doneAt: null });
  });

  it("redate une étape rouverte puis refranchie", () => {
    const first = [step({ id: "s", done: true, doneAt: "2026-03-01T09:00:00.000Z" })];
    const off = toggleStep(first, "s");
    expect(off[0]).toMatchObject({ done: false, doneAt: null });
    const back = toggleStep(off, "s", new Date("2026-08-14T10:00:00Z"));
    expect(back[0].doneAt).toBe("2026-08-14T10:00:00.000Z");
  });

  it("préserve une date de franchissement incohérente au lieu d'inventer aujourd'hui", () => {
    // Cas d'une donnée abîmée (non franchie mais datée) : sa date d'origine vaut
    // mieux que celle du jour, qui ferait apparaître un faux gain d'XP récent.
    const odd = [step({ id: "s", done: false, doneAt: "2026-01-05T08:00:00.000Z" })];
    expect(toggleStep(odd, "s", new Date("2026-08-14T10:00:00Z"))[0].doneAt)
      .toBe("2026-01-05T08:00:00.000Z");
  });

  it("renomme et date sans toucher au reste", () => {
    const list = [step({ id: "s", label: "Ancien" })];
    expect(updateStep(list, "s", { label: "Nouveau" })[0]).toMatchObject({ label: "Nouveau", due: null });
    expect(updateStep(list, "s", { due: "2026-10-10" })[0]).toMatchObject({ label: "Ancien", due: "2026-10-10" });
  });

  it("supprime l'étape visée, et elle seule", () => {
    const list = [step({ id: "a" }), step({ id: "b" })];
    expect(removeStep(list, "a").map(s => s.id)).toEqual(["b"]);
  });
});

describe("avancement d'une carte", () => {
  it("moyenne les objectifs chiffrés quand il n'y a pas d'étape", () => {
    expect(cardProgress({ goalPcts: [40, 60], today: TODAY })).toMatchObject({ pct: 50, source: "measured" });
  });

  it("compte les étapes franchies quand il n'y a pas d'objectif chiffré", () => {
    const steps = [step({ id: "1", done: true }), step({ id: "2" })];
    // Sans cette règle, quelqu'un qui pilote son année par jalons voyait 0 %.
    expect(cardProgress({ steps, today: TODAY })).toMatchObject({ pct: 50, source: "measured" });
  });

  it("fait la moyenne des deux mesures quand les deux existent", () => {
    const steps = [step({ id: "1", done: true }), step({ id: "2", done: true }), step({ id: "3", done: true }), step({ id: "4" })];
    // Objectifs à 50 %, étapes à 75 % → 62,5 arrondi à 63.
    expect(cardProgress({ goalPcts: [50], steps, today: TODAY })).toMatchObject({ pct: 63, hasGoals: true, hasSteps: true });
  });

  it("retombe sur la progression de niveau quand rien n'est mesuré", () => {
    expect(cardProgress({ levelPct: 30, today: TODAY })).toEqual({
      pct: 30, source: "level", hasGoals: false, hasSteps: false,
    });
  });
});

describe("frise de l'année", () => {
  it("place une date à sa position dans l'année", () => {
    expect(yearPosition("2026-01-01", 2026)).toBeCloseTo(0, 1);
    expect(Math.round(yearPosition("2026-07-02", 2026) as number)).toBe(50);
    expect(yearPosition("2026-12-31", 2026)).toBeGreaterThan(99);
  });

  it("écarte ce qui n'est pas de l'année affichée", () => {
    // Coller une étape de l'an prochain au bord la ferait passer pour imminente.
    expect(yearPosition("2027-02-01", 2026)).toBeNull();
    expect(yearPosition(null, 2026)).toBeNull();
  });

  it("rassemble les jalons de toutes les cartes, dans l'ordre du calendrier", () => {
    const cats = [
      { id: "a", label: "Forme", color: "#F97316", steps: [step({ id: "a2", due: "2026-09-01" })] },
      { id: "b", label: "Trading", color: "#F59E0B", steps: [step({ id: "b1", due: "2026-03-01" })] },
    ];
    const markers = yearMarkers(cats, 2026);
    expect(markers.map(m => m.step.id)).toEqual(["b1", "a2"]);
    expect(markers[0].cat.label).toBe("Trading");
  });

  it("ignore les étapes sans date : elles n'ont pas de place sur l'axe", () => {
    const cats = [{ id: "a", label: "Forme", steps: [step({ id: "libre" })] }];
    expect(yearMarkers(cats, 2026)).toEqual([]);
  });
});
