/**
 * Le domaine de la page Communication.
 *
 * Ce qui est sous test, c'est ce qu'on ne verrait PAS à l'écran : une séance
 * mal composée ressemble à une séance, une série qui casse au réveil ressemble
 * à une série, un renfort déclenché par un mauvais jour ressemble à un renfort,
 * et une phase qui s'ouvre toute seule ressemble à un progrès.
 */

import { describe, it, expect } from "vitest";
import {
  CHAINE, DRILLS, MESURES, PHASE_MAX, PHASE_MIN, SIMULATIONS, SKILLS,
  bilan, debutDuMois, drillById, etatDeLaChaine, etatDeLaPhase, etatDesCompetences,
  fautesFrequentes, finDuMois, joursTravailles, jourPlus, lundiDe, matiereDuJour,
  missionEnAttente, moisPrecedent, normalizeStore, phaseAttendue, prioriteDuMoment,
  renfortDuJour, seanceDuJour, semaineDuParcours, serie, withCap, withDebrief, withDebut,
  withEvaluation, withFait, withHistoire, withMission, withMissionReglee, withMot,
  withMotUtilise, withPhase, withPreuve, withTravail, withoutFait,
} from "@/lib/communication";

const vide = normalizeStore({});
const JOUR = "2026-09-16"; // un mercredi

const avecFaits = (paires: Array<[string, string]>) =>
  paires.reduce((s, [date, drillId]) => withFait(s, date, drillId), vide);

/** Un débrief posé un jour donné, avec ses chiffres. */
const avecDebrief = (store = vide, date: string, mesures: Record<string, number>, fautes: string[] = []) =>
  withDebrief(store, { date, fautes, note: "", mesures: { ...mesures } as never });

describe("catalogue", () => {
  it("donne à chaque compétence au moins un exercice, et à chaque exercice une compétence connue", () => {
    /* Une compétence qu'on note sans jamais l'entraîner ne se rattrape pas ;
       un exercice qui ne vise rien ne se mesure pas. Les deux trous sont
       silencieux à l'écran, d'où ce garde-fou. */
    const visees = new Set(DRILLS.map(d => d.skill));
    for (const s of SKILLS) expect(visees, `compétence ${s.id}`).toContain(s.id);
    const connues = new Set(SKILLS.map(s => s.id));
    for (const d of DRILLS) expect(connues, `exercice ${d.id}`).toContain(d.skill);
    for (const m of CHAINE) expect(connues, `maillon ${m.label}`).toContain(m.skill);
    for (const m of MESURES) expect(connues, `mesure ${m.id}`).toContain(m.skill);
  });

  it("ouvre chaque phase avec au moins un exercice ou une simulation", () => {
    for (let n = PHASE_MIN; n < PHASE_MAX; n++) {
      const a = DRILLS.some(d => d.phase === n) || SIMULATIONS.some(s => s.phase === n);
      expect(a, `phase ${n}`).toBe(true);
    }
  });

  it("donne une consigne à chaque exercice, et un critère à ceux qui se chronomètrent", () => {
    for (const d of DRILLS) {
      expect(d.consigne.length, `exercice ${d.id}`).toBeGreaterThan(20);
      if (d.etapes) expect(d.critere, `exercice ${d.id}`).toBeTruthy();
    }
  });
});

describe("la séance du jour", () => {
  it("sert cinq temps, dans l'ordre du travail", () => {
    const s = seanceDuJour(vide, JOUR);
    expect(s.temps.map(t => t.id)).toEqual(["echauffement", "competence", "simulation", "debrief", "mission"]);
    expect(s.temps[0].drill?.phase).toBe(0);
    expect(s.temps[0].drill?.forme).toBe("voix");
    expect(s.temps[4].mission).toBeTruthy();
  });

  it("ne bouge pas dans la journée, et change quand on en redemande une autre", () => {
    /* Tirée au hasard à chaque rendu, la séance se relirait toute la journée
       sans jamais se faire. */
    const cle = (r?: number) => seanceDuJour(vide, JOUR, r).temps.map(t => t.drill?.id || t.simulation?.id || t.mission).join();
    expect(cle()).toBe(cle(0));
    expect([cle(3), seanceDuJour(vide, "2026-09-17").temps.map(t => t.drill?.id).join()]
      .some(x => x !== cle())).toBe(true);
  });

  it("prend la compétence du jour dans la PHASE, pas dans ce qui va le plus mal", () => {
    /* C'est la décision structurante du parcours : les huit compétences se
       perturbent entre elles, on n'en monte qu'une à la fois. Courir après la
       note la plus basse reviendrait à les travailler toutes par la bande. */
    const scores: Record<string, number> = {};
    for (const s of SKILLS) scores[s.id] = 9;
    scores.storytelling = 1;
    const store = withEvaluation(withPhase(vide, 2), "2026-09-14", scores);
    const competence = seanceDuJour(store, JOUR).temps[1].drill;
    expect(competence?.phase).toBe(2);
    expect(competence?.skill).not.toBe("storytelling");
  });

  it("ne laisse jamais l'échauffement et l'atelier tomber sur le même exercice", () => {
    for (let r = 0; r < 12; r++) {
      const t = seanceDuJour(vide, JOUR, r).temps;
      expect(t[0].drill?.id, `tirage ${r}`).not.toBe(t[1].drill?.id);
    }
  });

  it("reprend les exercices déjà cochés du jour", () => {
    expect(seanceDuJour(avecFaits([[JOUR, "frein"]]), JOUR).faits).toContain("frein");
  });
});

describe("la matière tirée", () => {
  it("reste la même toute la journée et change au tirage suivant", () => {
    const relances = drillById("relances")!;
    const a = matiereDuJour(relances, JOUR, 0);
    expect(matiereDuJour(relances, JOUR, 0)).toBe(a);
    expect([1, 2, 3, 4].map(r => matiereDuJour(relances, JOUR, r)).some(m => m !== a)).toBe(true);
  });

  it("ne rend rien pour un exercice qui travaille un contenu entier", () => {
    // La lecture ne se tire pas au sort : c'est le même texte du premier jour
    // au dernier, et c'est ce qui permet d'entendre qu'on a changé.
    expect(matiereDuJour(drillById("lecture")!, JOUR)).toBeNull();
    expect(drillById("lecture")!.contenu).toBeTruthy();
  });
});

describe("la série", () => {
  it("tient tant qu'hier est fait, même si la journée en cours est vide", () => {
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
      replique: "Je ne savais pas comment la prendre.",
    });
    expect(s.mots[0].utiliseLe).toBeNull();
    const place = withMotUtilise(s, s.mots[0].id, JOUR);
    expect(place.mots[0].utiliseLe).toBe(JOUR);
    expect(withMotUtilise(place, s.mots[0].id, JOUR).mots[0].utiliseLe).toBeNull();
  });

  it("remplace l'auto-note d'une semaine déjà notée, et range les semaines dans l'ordre", () => {
    const une = withEvaluation(vide, "2026-09-14", { debit: 3 });
    const deux = withEvaluation(une, "2026-09-14", { debit: 6 });
    expect(deux.evaluations).toHaveLength(1);
    expect(deux.evaluations[0].scores.debit).toBe(6);
    const trois = withEvaluation(deux, "2026-09-07", { debit: 2 });
    expect(trois.evaluations.map(e => e.semaine)).toEqual(["2026-09-07", "2026-09-14"]);
  });

  it("ne garde pas un atelier entièrement vide", () => {
    expect(withTravail(vide, { date: JOUR, drillId: "relances", matiere: "x", reponses: ["", " "] }).travaux).toHaveLength(0);
    expect(withTravail(vide, { date: JOUR, drillId: "relances", matiere: "x", reponses: ["Pourquoi ?"] }).travaux).toHaveLength(1);
  });

  it("ne laisse pas la phase sortir du parcours", () => {
    expect(withPhase(vide, -4).phase).toBe(PHASE_MIN);
    expect(withPhase(vide, 99).phase).toBe(PHASE_MAX);
  });

  it("garde un cap, même quand on l'efface", () => {
    expect(withCap(vide, "  ").cap).toBe(vide.cap);
    expect(withCap(vide, "Tenir une conversation de vingt minutes").cap).toBe("Tenir une conversation de vingt minutes");
  });
});

describe("les missions", () => {
  it("ne demande pas le matin si l'on a fait ce qu'on se propose de faire dans la journée", () => {
    /* Tout l'intérêt du report : une mission cochée une minute après s'être
       donnée ne prouve rien. */
    const dujour = withMission(vide, JOUR, "Entrer une fois", 6);
    expect(missionEnAttente(dujour, JOUR)).toBeNull();
    const hier = withMission(vide, "2026-09-15", "Entrer une fois", 6);
    expect(missionEnAttente(hier, JOUR)?.texte).toBe("Entrer une fois");
  });

  it("range la réponse « pas fait » comme une information, pas comme un oubli", () => {
    const s = withMission(vide, "2026-09-15", "Entrer une fois", 6);
    const reglee = withMissionReglee(s, s.missions[0].id, false, JOUR);
    expect(reglee.missions[0].statut).toBe("ratee");
    expect(reglee.missions[0].regleLe).toBe(JOUR);
    expect(missionEnAttente(reglee, JOUR)).toBeNull();
  });
});

describe("le débrief et l'adaptation", () => {
  it("borne les notes à dix mais laisse les comptages libres", () => {
    /* On peut dire « du coup » vingt-deux fois en trois minutes. Plafonner ce
       nombre masquerait précisément le cas qui mérite un renfort. */
    const s = avecDebrief(vide, JOUR, { debit: 42, bequilles: 22 });
    expect(s.debriefs[0].mesures.debit).toBe(10);
    expect(s.debriefs[0].mesures.bequilles).toBe(22);
    expect(s.debriefs[0].mesures.clarte).toBeNull();
  });

  it("remplace le débrief du jour au lieu de l'empiler", () => {
    const s = avecDebrief(avecDebrief(vide, JOUR, { debit: 2 }), JOUR, { debit: 8 });
    expect(s.debriefs).toHaveLength(1);
    expect(s.debriefs[0].mesures.debit).toBe(8);
  });

  it("ne déclenche aucun renfort sous trois séances — un mauvais jour n'est pas une habitude", () => {
    let s = vide;
    s = avecDebrief(s, "2026-09-14", { abandons: 9 });
    s = avecDebrief(s, "2026-09-15", { abandons: 9 });
    expect(prioriteDuMoment(s)).toBeNull();
  });

  it("sort la priorité quand un comptage revient sur la moitié des séances", () => {
    let s = vide;
    s = avecDebrief(s, "2026-09-13", { abandons: 5 });
    s = avecDebrief(s, "2026-09-14", { abandons: 4 });
    s = avecDebrief(s, "2026-09-15", { abandons: 0 });
    const p = prioriteDuMoment(s);
    expect(p?.skill.id).toBe("clarte");
    expect(p?.raison).toContain("recommences");
  });

  it("propose un renfort déjà ouvert, jamais un exercice d'une phase à venir", () => {
    let s = withPhase(vide, 2);
    for (const d of ["2026-09-13", "2026-09-14", "2026-09-15"]) s = avecDebrief(s, d, { bequilles: 9 });
    const r = renfortDuJour(s, JOUR);
    expect(r?.priorite.skill.id).toBe("formulation");
    expect(r?.drill.phase).toBeLessThanOrEqual(2);
    expect(r?.drill.forme).not.toBe("terrain");
  });

  it("compte les fautes qui reviennent, la plus fréquente d'abord", () => {
    let s = vide;
    s = avecDebrief(s, "2026-09-13", {}, ["accelere", "deux-idees"]);
    s = avecDebrief(s, "2026-09-14", {}, ["accelere"]);
    s = avecDebrief(s, "2026-09-15", {}, ["accelere", "spectateur"]);
    const f = fautesFrequentes(s);
    expect(f[0].faute.id).toBe("accelere");
    expect(f[0].n).toBe(3);
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
    const s = withEvaluation(vide, "2026-09-14", { conversation: 2, formulation: 5, clarte: 9 });
    const par = new Map(etatDeLaChaine(s).map(m => [m.maillon.label, m.etat]));
    expect(par.get("Pensée")).toBe("fragile");
    expect(par.get("Mots")).toBe("en travail");
    expect(par.get("Phrase")).toBe("solide");
  });
});

describe("compétences et phases", () => {
  it("compte l'écart depuis la PREMIÈRE note, pas depuis la précédente", () => {
    const s = [["2026-09-01", 2], ["2026-09-08", 5], ["2026-09-15", 4]].reduce(
      (acc, [sem, n]) => withEvaluation(acc, sem as string, { debit: n as number }), vide);
    const debit = etatDesCompetences(s).find(e => e.skill.id === "debit")!;
    expect(debit.note).toBe(4);
    expect(debit.ecart).toBe(2);
    expect(debit.suite).toEqual([2, 5, 4]);
    expect(debit.feu).toBe("orange");
  });

  it("compte le volume d'exercices et les fautes par compétence", () => {
    let s = avecFaits([["2026-09-14", "frein"], ["2026-09-15", "frein"], [JOUR, "relances"]]);
    s = avecDebrief(s, JOUR, {}, ["accelere"]);
    const etats = etatDesCompetences(s);
    expect(etats.find(e => e.skill.id === "debit")!.volume).toBe(2);
    expect(etats.find(e => e.skill.id === "debit")!.fautes).toBe(1);
    expect(etats.find(e => e.skill.id === "conversation")!.volume).toBe(1);
  });

  it("n'ouvre la phase suivante qu'avec du volume, une auto-note ET des missions faites dehors", () => {
    /* La troisième condition est la seule qui parle du monde réel, et c'est
       précisément celle qu'un logiciel ne peut pas fabriquer tout seul. */
    expect(etatDeLaPhase(vide).pret).toBe(false);
    const jours = Array.from({ length: 10 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, "cinq-reponses"] as [string, string]);
    let s = avecFaits(jours);
    expect(etatDeLaPhase(s).volume).toBeGreaterThanOrEqual(10);
    expect(etatDeLaPhase(s).pret).toBe(false);
    s = withEvaluation(s, "2026-09-14", { clarte: 7 });
    expect(etatDeLaPhase(s).pret).toBe(false);
    for (const d of ["2026-09-02", "2026-09-04", "2026-09-06"]) {
      s = withMission(s, d, "Une vraie conversation", 1);
      s = withMissionReglee(s, s.missions[0].id, true, JOUR);
    }
    expect(etatDeLaPhase(s).missions).toBe(3);
    expect(etatDeLaPhase(s).pret).toBe(true);
  });

  it("ne propose jamais de dépasser la dernière phase", () => {
    const s = withEvaluation(withPhase(vide, PHASE_MAX), "2026-09-14", { confiance: 10 });
    expect(etatDeLaPhase(s).pret).toBe(false);
  });
});

describe("l'année", () => {
  it("ne compte aucune semaine tant que le parcours n'a pas de premier jour", () => {
    expect(semaineDuParcours(vide, JOUR)).toBeNull();
    const s = withDebut(vide, "2026-09-02");
    expect(semaineDuParcours(s, "2026-09-02")).toBe(1);
    expect(semaineDuParcours(s, "2026-09-08")).toBe(1);
    expect(semaineDuParcours(s, "2026-09-09")).toBe(2);
  });

  it("situe la phase que le calendrier suggère, sans lui donner autorité", () => {
    expect(phaseAttendue(1)?.n).toBe(1);
    expect(phaseAttendue(9)?.n).toBe(4);
    expect(phaseAttendue(40)?.n).toBe(PHASE_MAX);
    expect(phaseAttendue(null)).toBeNull();
  });

  it("recompose un bilan de période, bornes comprises", () => {
    /* Un bilan « du 1er au 30 » qui laisserait le 30 dehors ferait disparaître
       une séance par mois. */
    let s = avecFaits([["2026-09-01", "frein"], ["2026-09-30", "frein"], ["2026-10-01", "frein"]]);
    s = withPreuve(s, { date: "2026-09-30", texte: "J'ai relancé" });
    s = withMission(s, "2026-09-10", "Entrer une fois", 6);
    s = withMissionReglee(s, s.missions[0].id, true, "2026-09-11");
    s = avecDebrief(s, "2026-09-15", { abandons: 2 }, ["accelere"]);
    const b = bilan(s, debutDuMois("2026-09-16"), finDuMois("2026-09-16"));
    expect(b.jours).toBe(2);
    expect(b.exercices).toBe(2);
    expect(b.preuves).toBe(1);
    expect(b.missionsFaites).toBe(1);
    expect(b.debriefs).toBe(1);
    expect(b.fautes[0].faute.id).toBe("accelere");
  });

  it("borne les mois comme on les lit", () => {
    expect(debutDuMois("2026-09-16")).toBe("2026-09-01");
    expect(finDuMois("2026-09-16")).toBe("2026-09-30");
    expect(finDuMois("2026-02-10")).toBe("2026-02-28");
    expect(moisPrecedent("2026-01-05")).toEqual({ du: "2025-12-01", au: "2025-12-31" });
  });

  it("compte les exercices de chaque jour pour la trame", () => {
    const s = avecFaits([[JOUR, "frein"], [JOUR, "lecture"], ["2026-09-15", "frein"]]);
    const jours = joursTravailles(s);
    expect(jours.get(JOUR)).toBe(2);
    expect(jours.get("2026-09-15")).toBe(1);
    expect(jourPlus(JOUR, -2)).toBe("2026-09-14");
  });

  it("ramène n'importe quel jour au lundi qui l'ouvre", () => {
    expect(lundiDe("2026-09-16")).toBe("2026-09-14");
    expect(lundiDe("2026-09-14")).toBe("2026-09-14");
    expect(lundiDe("2026-09-20")).toBe("2026-09-14");
  });
});

describe("normalisation", () => {
  it("jette ce qui n'a pas de quoi être affiché et complète le reste", () => {
    const s = normalizeStore({
      phase: "3",
      faits: [{ date: "2026-09-16T10:00:00", drillId: "frein" }, { drillId: "frein" }, { date: "2026-09-16" }],
      preuves: [{ texte: "" }, { texte: "OK", date: "2026-09-16" }],
      mots: [{ mot: "" }, { mot: "ambigu" }],
      evaluations: [{ semaine: "2026-09-14", scores: { debit: 42, inconnu: 5 } }],
    });
    expect(s.phase).toBe(3);
    expect(s.faits).toHaveLength(1);
    expect(s.faits[0].date).toBe("2026-09-16");
    expect(s.preuves).toHaveLength(1);
    expect(s.mots).toHaveLength(1);
    expect(s.evaluations[0].scores.debit).toBe(10);
    expect(s.evaluations[0].scores.inconnu).toBeUndefined();
  });

  it("relit les histoires rangées avec l'ancien vocabulaire", () => {
    /* « moment fort » est devenu « escalade » : une histoire ne monte pas d'un
       cran, elle empire. Les histoires déjà écrites ne doivent rien y perdre. */
    const s = normalizeStore({ histoires: [{ titre: "La soirée", momentFort: "tout le monde est parti", fin: "on a fini à trois" }] });
    expect(s.histoires[0].escalade).toBe("tout le monde est parti");
    expect(s.histoires[0].resultat).toBe("on a fini à trois");
  });

  it("rend un magasin utilisable à partir de rien", () => {
    const s = normalizeStore(null);
    expect(s.phase).toBe(PHASE_MIN);
    expect(s.faits).toEqual([]);
    expect(s.cap.length).toBeGreaterThan(10);
    expect(withHistoire(s, { date: JOUR, titre: "", contexte: "", objectif: "", probleme: "", escalade: "", resultat: "" }).histoires).toHaveLength(0);
  });
});
