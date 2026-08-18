import { describe, it, expect } from "vitest";
import {
  DAY_MS, RATING, defaultConfig, formatInterval, forgettingCurve, newSchedulingState,
  previewRatings, retrievability, reviewCard,
  type Rating, type SchedulingState,
} from "@/lib/srs/fsrs";

/* Les deux premiers blocs rejouent les VECTEURS DE RÉFÉRENCE de la suite de
   tests officielle (open-spaced-repetition/py-fsrs, tests/test_basic.py). Si le
   portage dérive d'un cheveu — une borne, un arrondi, un ordre d'opérations —
   ces suites de nombres ne tombent plus. C'est la garantie qu'on planifie bien
   comme Anki, et pas approximativement comme Anki. */

/** Rejoue une suite de notes en se plaçant à chaque fois à l'échéance rendue,
   et renvoie les intervalles en jours pleins — le protocole du test de référence. */
function replay(ratings: Rating[], start: Date, cfg = { ...defaultConfig(), enableFuzz: false }) {
  let card: SchedulingState = newSchedulingState(start);
  let at = start;
  const intervals: number[] = [];
  for (const rating of ratings) {
    const out = reviewCard(card, rating, at, cfg);
    card = out.card;
    intervals.push(Math.floor(
      (new Date(card.due).getTime() - new Date(card.lastReview as string).getTime()) / DAY_MS,
    ));
    at = new Date(card.due);
  }
  return { card, intervals };
}

describe("FSRS-6 — conformité aux vecteurs de référence", () => {
  it("reproduit la suite d'intervalles du test officiel", () => {
    const { good, again } = { good: RATING.good as Rating, again: RATING.again as Rating };
    const ratings: Rating[] = [
      good, good, good, good, good, good, again, again, good, good, good, good, good,
    ];
    const { intervals } = replay(ratings, new Date(Date.UTC(2022, 10, 29, 12, 30, 0)));
    expect(intervals).toEqual([0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21]);
  });

  it("reproduit l'état mémoriel du test officiel", () => {
    const cfg = defaultConfig();
    const ratings: Rating[] = [1, 3, 3, 3, 3, 3];
    const gaps = [0, 0, 1, 3, 8, 21]; // les délais imposés par le test, en jours
    let card = newSchedulingState(new Date(Date.UTC(2022, 10, 29, 12, 30, 0)));
    let at = new Date(Date.UTC(2022, 10, 29, 12, 30, 0));
    ratings.forEach((rating, i) => {
      at = new Date(at.getTime() + gaps[i] * DAY_MS);
      card = reviewCard(card, rating, at, cfg).card;
    });
    expect(card.stability).toBeCloseTo(53.62691, 4);
    expect(card.difficulty).toBeCloseTo(6.3574867, 4);
  });

  it("plafonne la difficulté à 1 après une série de « Facile »", () => {
    const cfg = { ...defaultConfig(), enableFuzz: false };
    let card = newSchedulingState(new Date(Date.UTC(2022, 10, 29, 12, 30)));
    let at = new Date(Date.UTC(2022, 10, 29, 12, 30));
    for (let i = 0; i < 10; i++) {
      card = reviewCard(card, RATING.easy, at, cfg).card;
      at = new Date(at.getTime() + 1); // même milliseconde ou presque : régime « même jour »
    }
    expect(card.difficulty).toBe(1);
  });
});

describe("FSRS-6 — propriétés du modèle", () => {
  const cfg = defaultConfig();

  it("laisse exactement 90 % de rappel au bout de S jours", () => {
    // C'est la DÉFINITION de la stabilité : si elle ne tient pas, tout le reste
    // du calendrier est décalé.
    for (const s of [1, 7, 30, 365]) {
      expect(forgettingCurve(s, s, cfg)).toBeCloseTo(0.9, 10);
    }
  });

  it("fait décroître la récupérabilité avec le temps", () => {
    const s = 10;
    const values = [0, 1, 5, 10, 40].map(t => forgettingCurve(t, s, cfg));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
    expect(values[0]).toBeCloseTo(1, 10);
  });

  it("donne 0 de récupérabilité à une carte jamais vue", () => {
    expect(retrievability(newSchedulingState(new Date()), new Date(), cfg)).toBe(0);
  });

  it("ordonne les intervalles selon la note", () => {
    const noFuzz = { ...cfg, enableFuzz: false };
    // Une carte déjà en croisière : c'est là que les quatre boutons se séparent
    // vraiment, les paliers d'apprentissage étant fixes.
    const base: SchedulingState = {
      state: "review", step: null, stability: 30, difficulty: 5,
      due: "2026-01-01T00:00:00.000Z", lastReview: "2025-12-02T00:00:00.000Z",
      reps: 5, lapses: 0,
    };
    const at = new Date("2026-01-01T00:00:00.000Z");
    const p = previewRatings(base, at, noFuzz);
    expect(p[1].intervalMs).toBeLessThan(p[2].intervalMs);
    expect(p[2].intervalMs).toBeLessThan(p[3].intervalMs);
    expect(p[3].intervalMs).toBeLessThan(p[4].intervalMs);
  });

  it("raccourcit tous les intervalles quand on vise une rétention plus haute", () => {
    const base: SchedulingState = {
      state: "review", step: null, stability: 30, difficulty: 5,
      due: "2026-01-01T00:00:00.000Z", lastReview: "2025-12-02T00:00:00.000Z",
      reps: 5, lapses: 0,
    };
    const at = new Date("2026-01-01T00:00:00.000Z");
    const relaxed = reviewCard(base, RATING.good, at, { ...cfg, desiredRetention: 0.8, enableFuzz: false });
    const strict = reviewCard(base, RATING.good, at, { ...cfg, desiredRetention: 0.95, enableFuzz: false });
    expect(strict.intervalMs).toBeLessThan(relaxed.intervalMs);
  });

  it("compte un oubli et repasse en réapprentissage", () => {
    const base: SchedulingState = {
      state: "review", step: null, stability: 30, difficulty: 5,
      due: "2026-01-01T00:00:00.000Z", lastReview: "2025-12-02T00:00:00.000Z",
      reps: 5, lapses: 1,
    };
    const out = reviewCard(base, RATING.again, new Date("2026-01-01T00:00:00.000Z"), cfg);
    expect(out.card.state).toBe("relearning");
    expect(out.card.lapses).toBe(2);
    expect(out.card.stability as number).toBeLessThan(30);
    expect(out.intervalMs).toBe(10 * 60_000);
  });

  it("ne laisse jamais un oubli rendre la carte plus stable", () => {
    // Le minimum avec la branche « court terme » existe pour ça ; sans lui, une
    // carte très instable pouvait ressortir grandie d'un échec.
    for (const s of [0.01, 0.5, 3, 40, 400]) {
      const base: SchedulingState = {
        state: "review", step: null, stability: s, difficulty: 5,
        due: "2026-01-01T00:00:00.000Z", lastReview: "2025-12-02T00:00:00.000Z",
        reps: 3, lapses: 0,
      };
      const out = reviewCard(base, RATING.again, new Date("2026-01-01T00:00:00.000Z"), cfg);
      expect(out.card.stability as number).toBeLessThanOrEqual(s);
    }
  });

  it("suit les paliers d'apprentissage puis passe en révision", () => {
    const noFuzz = { ...cfg, enableFuzz: false };
    const at = new Date("2026-01-01T09:00:00.000Z");
    const first = reviewCard(newSchedulingState(at), RATING.good, at, noFuzz);
    expect(first.card.state).toBe("learning");
    expect(first.card.step).toBe(1);
    expect(first.intervalMs).toBe(10 * 60_000);

    const second = reviewCard(first.card, RATING.good, new Date(at.getTime() + 10 * 60_000), noFuzz);
    expect(second.card.state).toBe("review");
    expect(second.card.step).toBeNull();
    expect(second.intervalMs).toBeGreaterThanOrEqual(DAY_MS);
  });

  it("fait sortir « Facile » des paliers dès la première réponse", () => {
    const at = new Date("2026-01-01T09:00:00.000Z");
    const out = reviewCard(newSchedulingState(at), RATING.easy, at, { ...cfg, enableFuzz: false });
    expect(out.card.state).toBe("review");
    expect(out.intervalMs / DAY_MS).toBeGreaterThan(5);
  });

  it("passe directement en révision quand il n'y a aucun palier", () => {
    const at = new Date("2026-01-01T09:00:00.000Z");
    const out = reviewCard(newSchedulingState(at), RATING.good, at, { ...cfg, learningSteps: [], enableFuzz: false });
    expect(out.card.state).toBe("review");
  });

  it("annonce sur les boutons exactement ce qu'il applique", () => {
    // Le bruit est semé par la carte : l'aperçu et l'application doivent tomber
    // sur la même valeur, sinon le délai affiché serait un mensonge.
    const base: SchedulingState = {
      state: "review", step: null, stability: 60, difficulty: 5,
      due: "2026-01-01T00:00:00.000Z", lastReview: "2025-11-01T00:00:00.000Z",
      reps: 7, lapses: 0,
    };
    const at = new Date("2026-01-01T00:00:00.000Z");
    const preview = previewRatings(base, at, cfg, "carte-42");
    for (const r of [1, 2, 3, 4] as Rating[]) {
      expect(reviewCard(base, r, at, cfg, "carte-42").intervalMs).toBe(preview[r].intervalMs);
    }
  });

  it("respecte le plafond d'intervalle", () => {
    const base: SchedulingState = {
      state: "review", step: null, stability: 5000, difficulty: 2,
      due: "2026-01-01T00:00:00.000Z", lastReview: "2020-01-01T00:00:00.000Z",
      reps: 20, lapses: 0,
    };
    const out = reviewCard(base, RATING.easy, new Date("2026-01-01T00:00:00.000Z"), { ...cfg, maximumInterval: 180 });
    expect(out.intervalMs / DAY_MS).toBeLessThanOrEqual(180);
  });
});

describe("formatInterval", () => {
  it("choisit l'unité qui se lit", () => {
    expect(formatInterval(60_000)).toBe("1 min");
    expect(formatInterval(45 * 60_000)).toBe("45 min");
    expect(formatInterval(3 * 3600_000)).toBe("3 h");
    expect(formatInterval(5 * DAY_MS)).toBe("5 j");
    expect(formatInterval(60 * DAY_MS)).toBe("2 mois");
    expect(formatInterval(400 * DAY_MS)).toBe("1,1 ans");
  });
});
