/**
 * Le domaine de la page Communication.
 *
 * Ce qui est sous test, c'est ce qu'on ne verrait PAS à l'écran : une séance
 * mal composée ressemble à une séance, une série qui se casse au réveil
 * ressemble à une série, et un niveau qui s'ouvre tout seul ressemble à un
 * progrès. Les trois se vérifient ici, pas à l'œil.
 */

import { describe, it, expect } from "vitest";
import {
  CHAINE, DRILLS, NIVEAU_MAX, SKILLS,
  etatDeLaChaine, etatDesCompetences, etatDuNiveau, lundiDe, matiereDuJour, normalizeStore,
  seanceDuJour, serie, withEvaluation, withFait, withHistoire, withMot, withMotUtilise,
  withNiveau, withPreuve, withTravail, withoutFait,
} from "@/lib/communication";

const vide = normalizeStore({});
const JOUR = "2026-09-16"; // un mercredi

/** Le magasin, quelques exercices faits aux jours dits. */
const avecFaits = (paires: Array<[string, string]>) =>
  paires.reduce((s, [date, drillId]) => withFait(s, date, drillId), vide);

describe("catalogue", () => {
  it("donne à chaque compétence au moins un exercice, et à chaque exercice une compétence connue", () => {
    /* Une compétence qu'on note sans jamais l'entraîner ne se rattrape pas ;
       un exercice qui ne vise rien ne se mesure pas. Les deux trous sont
       silencieux à l'écran, d'où ce garde-fou. */
    const visees = new Set(DRILLS.map(d => d.skill));
    for (const s of SKILLS) expect(visees, `compétence ${s.id}`).toContain(s.id);
    const connues = new Set(SKILLS.map(s => s.id));
    for (const d of DRILLS) expect(connues, `exercice ${d.id}`).toContain(d.skill);
  });

  it("accroche chaque maillon de la chaîne à une compétence notable", () => {
    const connues = new Set(SKILLS.map(s => s.id));
    for (const m of CHAINE) expect(connues, `maillon ${m.label}`).toContain(m.skill);
  });
});

describe("la séance du jour", () => {
  it("sert trois exercices : l'instrument, l'atelier, puis le terrain", () => {
    const s = seanceDuJour(vide, JOUR);
    expect(s.drills).toHaveLength(3);
    expect(s.drills[0].forme).toBe("voix");
    expect(s.drills[0].niveau).toBe(0);
    expect(s.drills[2].forme).toBe("terrain");
  });

  it("ne bouge pas dans la journée, et change quand on en redemande une autre", () => {
    /* Tirée au hasard à chaque rendu, la séance se relirait toute la journée
       sans jamais se faire. */
    const a = seanceDuJour(vide, JOUR).drills.map(d => d.id);
    const b = seanceDuJour(vide, JOUR).drills.map(d => d.id);
    expect(b).toEqual(a);
    const demain = seanceDuJour(vide, "2026-09-17").drills.map(d => d.id);
    const autre = seanceDuJour(vide, JOUR, 3).drills.map(d => d.id);
    expect([demain.join(), autre.join()].some(x => x !== a.join())).toBe(true);
  });

  it("ne propose pas un atelier verrouillé par le niveau", () => {
    const s = seanceDuJour(vide, JOUR);
    for (const d of s.drills) expect(d.niveau).toBeLessThanOrEqual(0);
  });

  it("va chercher la compétence la plus mal notée plutôt que de faire le tour", () => {
    /* Un programme qui ferait tourner les neuf compétences à égalité passerait
       l'essentiel de son temps sur ce qui va déjà. */
    const base = withNiveau(vide, NIVEAU_MAX);
    const scores: Record<string, number> = {};
    for (const s of SKILLS) scores[s.id] = 9;
    scores.storytelling = 1;
    const note = withEvaluation(base, "2026-09-14", scores);
    expect(seanceDuJour(note, JOUR).drills[1].skill).toBe("storytelling");
  });

  it("reprend les exercices déjà cochés du jour", () => {
    const s = seanceDuJour(avecFaits([[JOUR, "frein"]]), JOUR);
    expect(s.faits).toContain("frein");
  });
});

describe("la matière tirée", () => {
  it("reste la même toute la journée et change au tirage suivant", () => {
    const relances = DRILLS.find(d => d.id === "relances")!;
    const a = matiereDuJour(relances, JOUR, 0);
    expect(matiereDuJour(relances, JOUR, 0)).toBe(a);
    const differents = [1, 2, 3, 4].map(r => matiereDuJour(relances, JOUR, r));
    expect(differents.some(m => m !== a)).toBe(true);
  });

  it("ne rend rien pour un exercice qui n'a pas de matière", () => {
    const frein = DRILLS.find(d => d.id === "frein")!;
    expect(matiereDuJour(frein, JOUR)).toBeNull();
  });
});

describe("la série", () => {
  it("tient tant qu'hier est fait, même si la journée en cours est vide", () => {
    /* Une série qui tombe à zéro tous les matins au réveil ne mesure rien et
       décourage tout. */
    const s = avecFaits([["2026-09-14", "frein"], ["2026-09-15", "frein"]]);
    expect(serie(s, JOUR)).toBe(2);
  });

  it("casse dès qu'un jour manque au milieu", () => {
    const s = avecFaits([["2026-09-13", "frein"], ["2026-09-15", "frein"], [JOUR, "frein"]]);
    expect(serie(s, JOUR)).toBe(2);
  });

  it("vaut zéro quand rien n'a jamais été fait", () => {
    expect(serie(vide, JOUR)).toBe(0);
  });
});

describe("écritures", () => {
  it("ne compte pas deux fois le même exercice le même jour", () => {
    const s = withFait(withFait(vide, JOUR, "frein"), JOUR, "frein");
    expect(s.faits).toHaveLength(1);
    expect(withoutFait(s, JOUR, "frein").faits).toHaveLength(0);
  });

  it("refuse une preuve vide — un carnet de preuves ne se remplit pas de blancs", () => {
    expect(withPreuve(vide, { date: JOUR, texte: "   " }).preuves).toHaveLength(0);
    expect(withPreuve(vide, { date: JOUR, texte: "J'ai relancé une fois" }).preuves).toHaveLength(1);
  });

  it("garde un mot « pas à toi » tant qu'il n'a pas servi pour de vrai", () => {
    const s = withMot(vide, {
      date: JOUR, mot: "ambigu", definition: "qui se comprend de plusieurs manières",
      synonymes: "équivoque", contraire: "limpide", phrase: "Sa réponse était ambiguë.",
      replique: "Je ne savais pas comment la prendre, c'était assez ambigu.",
    });
    expect(s.mots[0].utiliseLe).toBeNull();
    const place = withMotUtilise(s, s.mots[0].id, JOUR);
    expect(place.mots[0].utiliseLe).toBe(JOUR);
    // Recocher annule : on s'est trompé de ligne, ça arrive.
    expect(withMotUtilise(place, s.mots[0].id, JOUR).mots[0].utiliseLe).toBeNull();
  });

  it("remplace l'auto-note d'une semaine déjà notée au lieu de l'empiler", () => {
    const une = withEvaluation(vide, "2026-09-14", { debit: 3 });
    const deux = withEvaluation(une, "2026-09-14", { debit: 6 });
    expect(deux.evaluations).toHaveLength(1);
    expect(deux.evaluations[0].scores.debit).toBe(6);
  });

  it("range les semaines de la plus ancienne à la plus récente", () => {
    const s = withEvaluation(withEvaluation(vide, "2026-09-14", { debit: 4 }), "2026-09-07", { debit: 2 });
    expect(s.evaluations.map(e => e.semaine)).toEqual(["2026-09-07", "2026-09-14"]);
  });

  it("ne garde pas un atelier entièrement vide", () => {
    expect(withTravail(vide, { date: JOUR, drillId: "relances", matiere: "x", reponses: ["", " "] }).travaux).toHaveLength(0);
    expect(withTravail(vide, { date: JOUR, drillId: "relances", matiere: "x", reponses: ["Pourquoi ?"] }).travaux).toHaveLength(1);
  });

  it("ne laisse pas le niveau sortir de l'échelle", () => {
    expect(withNiveau(vide, -4).niveau).toBe(0);
    expect(withNiveau(vide, 99).niveau).toBe(NIVEAU_MAX);
  });
});

describe("la chaîne", () => {
  it("reste grise tant que rien n'a été noté — pas de diagnostic inventé", () => {
    for (const m of etatDeLaChaine(vide)) {
      expect(m.etat).toBe("inconnu");
      expect(m.note).toBeNull();
    }
  });

  it("distingue le maillon fragile de celui qui tient", () => {
    const s = withEvaluation(vide, "2026-09-14", { conversation: 2, clarte: 5, vocabulaire: 9 });
    const par = new Map(etatDeLaChaine(s).map(m => [m.maillon.label, m.etat]));
    expect(par.get("Pensée")).toBe("fragile");
    expect(par.get("Formulation")).toBe("en travail");
    expect(par.get("Mots")).toBe("solide");
  });
});

describe("compétences et niveaux", () => {
  it("compte l'écart depuis la PREMIÈRE note, pas depuis la précédente", () => {
    const s = [["2026-09-01", 2], ["2026-09-08", 5], ["2026-09-15", 4]].reduce(
      (acc, [sem, n]) => withEvaluation(acc, sem as string, { debit: n as number }), vide);
    const debit = etatDesCompetences(s).find(e => e.skill.id === "debit")!;
    expect(debit.note).toBe(4);
    expect(debit.ecart).toBe(2);
    expect(debit.suite).toEqual([2, 5, 4]);
  });

  it("compte le volume d'exercices par compétence", () => {
    const s = avecFaits([["2026-09-14", "frein"], ["2026-09-15", "frein"], [JOUR, "relances"]]);
    const etats = etatDesCompetences(s);
    expect(etats.find(e => e.skill.id === "debit")!.volume).toBe(2);
    expect(etats.find(e => e.skill.id === "conversation")!.volume).toBe(1);
  });

  it("n'ouvre le niveau suivant qu'avec du volume ET une auto-note", () => {
    /* Ni l'un ni l'autre ne suffit : douze clics ne sont pas un progrès, et se
       sentir mieux une semaine ne remplace pas la pratique. */
    expect(etatDuNiveau(vide).pret).toBe(false);
    // Dix JOURS distincts : deux fois le même exercice le même jour ne compte
    // qu'une, et une pratique gonflée par des doublons ne serait pas du volume.
    const pratique = Array.from({ length: 10 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, "frein"] as [string, string]);
    const volume = avecFaits(pratique);
    expect(etatDuNiveau(volume).volume).toBeGreaterThanOrEqual(10);
    expect(etatDuNiveau(volume).pret).toBe(false);
    const note = withEvaluation(volume, "2026-09-14", { debit: 7 });
    expect(etatDuNiveau(note).pret).toBe(true);
  });

  it("ne propose jamais de dépasser le dernier niveau", () => {
    const s = withEvaluation(withNiveau(vide, NIVEAU_MAX), "2026-09-14", { confiance: 10 });
    expect(etatDuNiveau(s).pret).toBe(false);
  });
});

describe("normalisation", () => {
  it("jette ce qui n'a pas de quoi être affiché et complète le reste", () => {
    const s = normalizeStore({
      niveau: "3",
      faits: [{ date: "2026-09-16T10:00:00", drillId: "frein" }, { drillId: "frein" }, { date: "2026-09-16" }],
      preuves: [{ texte: "" }, { texte: "OK", date: "2026-09-16" }],
      mots: [{ mot: "" }, { mot: "ambigu" }],
      histoires: [{ titre: "" }, { titre: "La soirée" }],
      evaluations: [{ semaine: "2026-09-14", scores: { debit: 42, inconnu: 5 } }],
    });
    expect(s.niveau).toBe(3);
    expect(s.faits).toHaveLength(1);
    expect(s.faits[0].date).toBe("2026-09-16");
    expect(s.preuves).toHaveLength(1);
    expect(s.mots).toHaveLength(1);
    expect(s.histoires).toHaveLength(1);
    // Une note hors échelle est ramenée dedans, une compétence inconnue tombe.
    expect(s.evaluations[0].scores.debit).toBe(10);
    expect(s.evaluations[0].scores.inconnu).toBeUndefined();
  });

  it("rend un magasin utilisable à partir de rien", () => {
    const s = normalizeStore(null);
    expect(s.niveau).toBe(0);
    expect(s.faits).toEqual([]);
    expect(withHistoire(s, { date: JOUR, titre: "", contexte: "", objectif: "", probleme: "", momentFort: "", fin: "" }).histoires).toHaveLength(0);
  });
});

describe("la semaine", () => {
  it("ramène n'importe quel jour au lundi qui l'ouvre", () => {
    expect(lundiDe("2026-09-16")).toBe("2026-09-14"); // mercredi → lundi
    expect(lundiDe("2026-09-14")).toBe("2026-09-14"); // lundi → lui-même
    expect(lundiDe("2026-09-20")).toBe("2026-09-14"); // dimanche → le lundi d'avant
  });
});
