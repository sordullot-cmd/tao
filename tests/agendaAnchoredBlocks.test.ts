import { describe, it, expect } from "vitest";
import {
  ALL_DAYS, DEFAULT_ANCHOR_MINUTES, DEFAULT_ANCHOR_TITLE, MAX_ANCHOR_MINUTES,
  anchorDurationLabel, anchoredOccurrences, anchoredOccurrencesForRange,
  eveningOccurrences, firstItemMinutes, minutesBetween, nextDayKey,
  normalizeAnchoredBlocks, removeAnchoredBlock, upsertAnchoredBlock, wakeMinutes,
} from "@/lib/agendaAnchoredBlocks";

const DAY = "2026-03-10";
/** ISO local du jour de test, à l'heure demandée. */
const at = (h: number, m = 0) => new Date(`${DAY}T00:00:00`).getTime() + (h * 60 + m) * 60000;
const iso = (h: number, m = 0) => new Date(at(h, m)).toISOString();
/** Bloc complet : on passe par la normalisation pour hériter des défauts
 *  (tous les jours, aucune limite d'heure, pas de marge). */
const bloc = (minutes = 45, id = "b1", summary = "Réveil", over: Record<string, unknown> = {}) =>
  normalizeAnchoredBlocks([{ id, summary, minutes, colorId: null, ...over }])[0];
/** Minutes depuis minuit d'un ISO, pour lire une occurrence sans dépendre du fuseau. */
const minOf = (isoStr: string) => Math.round((new Date(isoStr).getTime() - new Date(`${DAY}T00:00:00`).getTime()) / 60000);

describe("blocs ancrés de l'agenda", () => {
  it("emprunte sa fin au premier élément du jour", () => {
    const [occ] = anchoredOccurrences([bloc(45)], DAY, [
      { start: iso(14, 0) },
      { start: iso(9, 0) },
    ]);
    expect(minOf(occ.start)).toBe(8 * 60 + 15);
    expect(minOf(occ.end)).toBe(9 * 60);
    expect(occ.isAnchored).toBe(true);
  });

  /* La règle qui fait toute la fonctionnalité : rien à quoi s'accrocher, donc
     rien du tout — poser le réveil à une heure inventée serait pire que vide. */
  it("ne pose rien sur une journée sans élément horodaté", () => {
    expect(anchoredOccurrences([bloc()], DAY, [])).toEqual([]);
    expect(anchoredOccurrences([bloc()], DAY, [{ start: iso(9, 0), allDay: true }])).toEqual([]);
  });

  it("ignore les blocs déjà ancrés pour choisir son ancre", () => {
    const [occ] = anchoredOccurrences([bloc(30)], DAY, [
      { start: iso(7, 0), isAnchored: true },
      { start: iso(10, 0) },
    ]);
    expect(minOf(occ.start)).toBe(9 * 60 + 30);
  });

  /* Un cours qui déborde de la veille occupe la journée dès minuit : il n'y a
     pas de place au-dessus, et un bloc collé à 00:00 mentirait sur l'heure du
     réveil. */
  it("s'efface quand la journée commence déjà occupée", () => {
    const veille = new Date(`${DAY}T00:00:00`).getTime() - 60 * 60000;
    expect(anchoredOccurrences([bloc()], DAY, [{ start: new Date(veille).toISOString() }])).toEqual([]);
    expect(anchoredOccurrences([bloc()], DAY, [{ start: iso(0, 0) }])).toEqual([]);
  });

  it("rabote le bloc plutôt que de sortir de la journée", () => {
    const [occ] = anchoredOccurrences([bloc(90)], DAY, [{ start: iso(1, 0) }]);
    expect(minOf(occ.start)).toBe(0);
    expect(minOf(occ.end)).toBe(60);
  });

  /* L'empilement n'est plus implicite : un bloc dit à quoi il se colle. */
  it("chaîne les blocs qui se désignent", () => {
    const occ = anchoredOccurrences(
      [bloc(30, "b1", "Trajet"), bloc(45, "b2", "Réveil", { before: "b1" })],
      DAY, [{ start: iso(9, 0) }],
    );
    expect(occ.map((o) => [minOf(o.start), minOf(o.end)])).toEqual([
      [8 * 60 + 30, 9 * 60],
      [7 * 60 + 45, 8 * 60 + 30],
    ]);
  });

  it("place la chaîne quel que soit l'ordre de la liste", () => {
    const occ = anchoredOccurrences(
      [bloc(45, "b2", "Réveil", { before: "b1" }), bloc(30, "b1", "Trajet")],
      DAY, [{ start: iso(9, 0) }],
    );
    const parId = Object.fromEntries(occ.map((o) => [o.anchorId, [minOf(o.start), minOf(o.end)]]));
    expect(parId.b1).toEqual([8 * 60 + 30, 9 * 60]);
    expect(parId.b2).toEqual([7 * 60 + 45, 8 * 60 + 30]);
  });

  it("laisse tomber ce qui pend après un chaînon absent", () => {
    // Le bloc désigné est éteint : celui qui le suit n'a plus d'ancre.
    expect(anchoredOccurrences(
      [bloc(30, "b1", "Trajet", { enabled: false }), bloc(45, "b2", "Réveil", { before: "b1" })],
      DAY, [{ start: iso(9, 0) }],
    )).toEqual([]);
    // Deux blocs qui se désignent l'un l'autre ne font pas tourner la page en rond.
    expect(anchoredOccurrences(
      [bloc(30, "b1", "A", { before: "b2" }), bloc(30, "b2", "B", { before: "b1" })],
      DAY, [{ start: iso(9, 0) }],
    )).toEqual([]);
  });

  it("donne une occurrence par jour, jamais un id partagé", () => {
    const a = anchoredOccurrences([bloc()], DAY, [{ start: iso(9) }])[0];
    const b = anchoredOccurrences([bloc()], "2026-03-11", [{ start: new Date(`2026-03-11T09:00:00`).toISOString() }])[0];
    expect(a.id).not.toBe(b.id);
    expect(a.anchorId).toBe(b.anchorId);
  });

  it("premier élément : null quand il n'y en a pas", () => {
    expect(firstItemMinutes(DAY, [])).toBeNull();
    expect(firstItemMinutes(DAY, [{ start: "pas une date" }])).toBeNull();
  });

  /* Le magasin cloud est un JSON libre : ce qui en sort ne doit jamais injecter
     un bloc sans durée — donc sans hauteur — dans la grille. */
  it("répare ce qui sort du magasin", () => {
    const list = normalizeAnchoredBlocks([
      { id: "ok", summary: "  Réveil  ", minutes: 30, colorId: "5" },
      { id: "vide" },
      { id: "ok" },                          // doublon d'id
      { summary: "sans id", minutes: 20 },
      "n'importe quoi",
      { id: "trop", minutes: 99999 },
    ]);
    const defauts = { enabled: true, days: ALL_DAYS, maxStart: "", gap: 0, countTasks: true, anchor: "morning", before: "" };
    expect(list).toEqual([
      { id: "ok", summary: "Réveil", minutes: 30, colorId: "5", ...defauts },
      { id: "vide", summary: DEFAULT_ANCHOR_TITLE, minutes: DEFAULT_ANCHOR_MINUTES, colorId: null, ...defauts },
      { id: "trop", summary: DEFAULT_ANCHOR_TITLE, minutes: MAX_ANCHOR_MINUTES, colorId: null, ...defauts },
    ]);
    expect(normalizeAnchoredBlocks(null)).toEqual([]);
  });

  it("remplace un bloc à sa place, en ajoute un à la fin", () => {
    const base = normalizeAnchoredBlocks([bloc(30, "a"), bloc(30, "b")]);
    const modifie = upsertAnchoredBlock(base, { ...bloc(60, "a"), summary: "Lever" });
    expect(modifie.map((b) => [b.id, b.minutes])).toEqual([["a", 60], ["b", 30]]);
    expect(upsertAnchoredBlock(base, bloc(15, "c")).map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(removeAnchoredBlock(base, "a").map((b) => b.id)).toEqual(["b"]);
  });

  /* La durée se lit dans les deux champs d'heure du modal plutôt que dans un
     champ « durée » de plus. */
  it("lit une durée dans deux heures, et se rabat sur le défaut si elles n'en disent pas", () => {
    expect(minutesBetween("08:15", "09:00")).toBe(45);
    expect(minutesBetween("09:00", "08:00")).toBe(DEFAULT_ANCHOR_MINUTES);
    expect(minutesBetween("", "09:00")).toBe(DEFAULT_ANCHOR_MINUTES);
  });

  /* Les réglages fins (Réglages → Agendas). Chacun a un défaut qui reproduit
     le comportement d'avant son existence. */
  it("ne se pose pas les jours qu'on lui a retirés", () => {
    // 2026-03-10 est un mardi → index 1.
    expect(anchoredOccurrences([bloc(45, "b1", "Réveil", { days: [0, 2] })], DAY, [{ start: iso(9) }])).toEqual([]);
    expect(anchoredOccurrences([bloc(45, "b1", "Réveil", { days: [1] })], DAY, [{ start: iso(9) }])).toHaveLength(1);
  });

  /* L'heure de réveil au plus tard fait les deux métiers : elle empêche
     l'absurde (un rendez-vous à 14 h ne justifie pas un réveil à 13 h 15) et
     elle pose le bloc les jours où il n'y a rien à suivre. */
  it("se pose à l'heure de réveil au plus tard quand le jour commence trop tard", () => {
    const [occ] = anchoredOccurrences([bloc(45, "b1", "Réveil", { maxStart: "09:00" })], DAY, [{ start: iso(14) }]);
    expect(minOf(occ.start)).toBe(9 * 60);
    expect(minOf(occ.end)).toBe(9 * 60 + 45);
  });

  it("garde l'ancre naturelle quand elle est plus tôt que l'heure de réveil", () => {
    const [occ] = anchoredOccurrences([bloc(45, "b1", "Réveil", { maxStart: "09:00" })], DAY, [{ start: iso(8) }]);
    expect(minOf(occ.start)).toBe(7 * 60 + 15);
    expect(minOf(occ.end)).toBe(8 * 60);
  });

  it("pose quand même le bloc une journée vide, mais seulement s'il a une heure de réveil", () => {
    const [occ] = anchoredOccurrences([bloc(45, "b1", "Réveil", { maxStart: "09:00" })], DAY, []);
    expect([minOf(occ.start), minOf(occ.end)]).toEqual([9 * 60, 9 * 60 + 45]);
    expect(anchoredOccurrences([bloc(45)], DAY, [])).toEqual([]);
  });

  /* L'écart : un bloc n'est pas forcément collé à son ancre. Une heure de sport
     qui finit 5 min avant le premier cours ne se dit pas autrement, l'ancre
     bougeant tous les jours. */
  it("laisse l'écart demandé avant le premier élément", () => {
    const [occ] = anchoredOccurrences([bloc(30, "b1", "Réveil", { gap: 15 })], DAY, [{ start: iso(9) }]);
    expect(minOf(occ.end)).toBe(8 * 60 + 45);
    expect(minOf(occ.start)).toBe(8 * 60 + 15);
    const [sport] = anchoredOccurrences([bloc(60, "b1", "Sport", { gap: 5 })], DAY, [{ start: iso(8) }]);
    expect([minOf(sport.start), minOf(sport.end)]).toEqual([6 * 60 + 55, 7 * 60 + 55]);
  });

  it("garde l'écart dans une chaîne", () => {
    const occ = anchoredOccurrences(
      [bloc(30, "b1", "Trajet"), bloc(45, "b2", "Réveil", { before: "b1", gap: 10 })],
      DAY, [{ start: iso(9) }],
    );
    const parId = Object.fromEntries(occ.map((o) => [o.anchorId, [minOf(o.start), minOf(o.end)]]));
    expect(parId.b1).toEqual([8 * 60 + 30, 9 * 60]);
    // 10 min de battement entre le réveil et le trajet.
    expect(parId.b2).toEqual([7 * 60 + 35, 8 * 60 + 20]);
  });

  it("peut ignorer les tâches pour choisir son ancre", () => {
    const jour = [{ start: iso(8), isTask: true }, { start: iso(10) }];
    const [sansTaches] = anchoredOccurrences([bloc(30, "b1", "Réveil", { countTasks: false })], DAY, jour);
    expect(minOf(sansTaches.end)).toBe(10 * 60);
    const [avecTaches] = anchoredOccurrences([bloc(30)], DAY, jour);
    expect(minOf(avecTaches.end)).toBe(8 * 60);
  });

  it("ne pose rien tant qu'il est éteint", () => {
    expect(anchoredOccurrences([bloc(45, "b1", "Réveil", { enabled: false })], DAY, [{ start: iso(9) }])).toEqual([]);
  });

  it("écrit une durée lisible", () => {
    expect(anchorDurationLabel(45)).toBe("45 min");
    expect(anchorDurationLabel(60)).toBe("1 h");
    expect(anchorDurationLabel(90)).toBe("1 h 30");
  });
});

/* ─────────────── Le soir ─────────────── */

const NEXT = "2026-03-11"; // lendemain de DAY
const atNext = (h: number, m = 0) => new Date(`${NEXT}T00:00:00`).getTime() + (h * 60 + m) * 60000;
const isoNext = (h: number, m = 0) => new Date(atNext(h, m)).toISOString();
const minOfIn = (day: string, isoStr: string) =>
  Math.round((new Date(isoStr).getTime() - new Date(`${day}T00:00:00`).getTime()) / 60000);
const nuit = (minutes = 480, id = "n1", over: Record<string, unknown> = {}) =>
  normalizeAnchoredBlocks([{ id, summary: "Sommeil", minutes, colorId: null, anchor: "evening", ...over }])[0];

describe("blocs du soir", () => {
  it("prend le réveil du lendemain comme fin, pas une heure fixe", () => {
    // Réveil = haut de la pile du matin (07:15) et non le cours de 08:00.
    const matin = anchoredOccurrences([bloc(45)], NEXT, [{ start: isoNext(8) }]);
    expect(wakeMinutes(NEXT, [{ start: isoNext(8) }], matin)).toBe(7 * 60 + 15);
    expect(wakeMinutes(NEXT, [{ start: isoNext(8) }], [])).toBe(8 * 60);
  });

  /* Le cas qui justifie tout le découpage : huit heures qui finissent à 7 h 15
     commencent la veille — un seul objet à cheval n'afficherait que la soirée. */
  it("coupe la nuit à minuit, un morceau par journée", () => {
    const parts = eveningOccurrences([nuit(480)], DAY, 7 * 60 + 15);
    expect(parts).toHaveLength(2);
    expect(parts[0].dayKey).toBe(DAY);
    expect(minOfIn(DAY, parts[0].occurrence.start)).toBe(23 * 60 + 15);
    expect(minOfIn(DAY, parts[0].occurrence.end)).toBe(24 * 60);
    expect(parts[1].dayKey).toBe(NEXT);
    expect(minOfIn(NEXT, parts[1].occurrence.start)).toBe(0);
    expect(minOfIn(NEXT, parts[1].occurrence.end)).toBe(7 * 60 + 15);
    expect(parts[0].occurrence.id).not.toBe(parts[1].occurrence.id);
    expect(parts[1].occurrence.anchorId).toBe("n1");
  });

  it("reste d'un seul morceau quand la nuit ne traverse pas minuit", () => {
    const tard = eveningOccurrences([nuit(300)], DAY, 4 * 60); // 23:00 → 04:00
    expect(tard).toHaveLength(2);
    const tot = eveningOccurrences([nuit(120)], DAY, 6 * 60); // 04:00 → 06:00, le lendemain
    expect(tot).toHaveLength(1);
    expect(tot[0].dayKey).toBe(NEXT);
    expect(minOfIn(NEXT, tot[0].occurrence.start)).toBe(4 * 60);
  });

  it("pose la lecture juste avant la nuit qu'elle désigne", () => {
    const parts = eveningOccurrences([nuit(480), nuit(30, "r1", { summary: "Lecture", before: "n1" })], DAY, 7 * 60);
    // La nuit finit au réveil (07:00) et commence à 23:00 ; la lecture finit là.
    const routine = parts.find((x) => x.occurrence.anchorId === "r1");
    expect(routine?.dayKey).toBe(DAY);
    expect(minOfIn(DAY, routine!.occurrence.end)).toBe(23 * 60);
    expect(minOfIn(DAY, routine!.occurrence.start)).toBe(22 * 60 + 30);
  });

  /* Le cas qui ne marchait pas : une lecture d'une heure, chaînée avant la
     nuit, à qui on donne une heure limite. Elle commençait bien à l'heure dite
     mais restait collée au coucher — deux heures de lecture réglées sur une.
     Elle doit garder sa durée et laisser le vide devant elle. */
  it("garde sa durée quand un bloc chaîné est repoussé par sa limite", () => {
    // Réveil à 08:00, nuit de 8 h : le coucher tombe à minuit, et la lecture
    // d'une heure irait de 23:00 à minuit. Limitée à 21:00, elle doit finir à
    // 22:00 et laisser deux heures vides avant la nuit.
    const parts = eveningOccurrences(
      [nuit(480), nuit(60, "r1", { summary: "Lecture", before: "n1", maxStart: "21:00" })],
      DAY, 8 * 60,
    );
    const lecture = parts.find((x) => x.occurrence.anchorId === "r1")!;
    expect(minOfIn(DAY, lecture.occurrence.start)).toBe(21 * 60);
    expect(minOfIn(DAY, lecture.occurrence.end)).toBe(22 * 60);
    // …et la nuit, elle, n'a pas bougé : c'est bien un trou qui s'est ouvert.
    const sommeil = parts.find((x) => x.occurrence.anchorId === "n1")!;
    expect(minOfIn(DAY, sommeil.occurrence.start)).toBe(24 * 60);
  });

  /* Le pendant : la nuit, elle, DOIT s'étirer. Sa fin est le réveil, et se
     coucher plus tôt allonge le sommeil au lieu d'ouvrir un trou devant le
     lever. C'est ce qui distingue le bloc accroché au réveil des autres. */
  it("étire la nuit, et elle seule, quand le coucher est avancé", () => {
    const parts = eveningOccurrences([nuit(480, "n1", { maxStart: "22:00" })], DAY, 8 * 60);
    expect(minOfIn(DAY, parts[0].occurrence.start)).toBe(22 * 60);
    expect(minOfIn(NEXT, parts[1].occurrence.end)).toBe(8 * 60); // 10 h, pas 8
  });

  it("respecte coucher au plus tard, marge et jours comme le matin", () => {
    // Le lendemain démarre tard : la nuit s'allonge plutôt que de commencer au
    // milieu de la nuit — sa fin reste le réveil.
    const tardif = eveningOccurrences([nuit(480, "n1", { maxStart: "23:30" })], DAY, 10 * 60);
    expect(minOfIn(DAY, tardif[0].occurrence.start)).toBe(23 * 60 + 30);
    expect(minOfIn(NEXT, tardif[1].occurrence.end)).toBe(10 * 60);
    const marge = eveningOccurrences([nuit(60, "n1", { gap: 30 })], DAY, 8 * 60);
    expect(minOfIn(NEXT, marge[0].occurrence.end)).toBe(7 * 60 + 30);
    // 2026-03-10 est un mardi (index 1) : c'est le SOIR qui porte le jour.
    expect(eveningOccurrences([nuit(480, "n1", { days: [0] })], DAY, 7 * 60)).toEqual([]);
  });

  it("ne pose pas de nuit devant un lendemain vide", () => {
    const map = new Map([[DAY, [{ start: iso(9) }]]]);
    const placed = anchoredOccurrencesForRange([nuit(480)], [DAY], map);
    expect(placed.get(DAY) ?? []).toEqual([]);
  });

  /* La chaîne complète, telle qu'on la règle vraiment : lecture → sommeil →
     réveil → premier cours. */
  it("enchaîne lecture, sommeil et réveil", () => {
    const map = new Map([[NEXT, [{ start: isoNext(8) }]]]);
    const placed = anchoredOccurrencesForRange(
      [bloc(45, "m1", "Réveil"), nuit(480, "n1"), nuit(30, "r1", { summary: "Lecture", before: "n1" })],
      [DAY, NEXT], map,
    );
    const veille = (placed.get(DAY) || []).map((o) => [o.anchorId, minOf(o.start), minOf(o.end)]);
    // Réveil 07:15 → nuit 23:15 → lecture 22:45.
    expect(veille).toContainEqual(["n1", 23 * 60 + 15, 24 * 60]);
    expect(veille).toContainEqual(["r1", 22 * 60 + 45, 23 * 60 + 15]);
    const lendemain = (placed.get(NEXT) || []).map((o) => [o.anchorId, minOfIn(NEXT, o.start), minOfIn(NEXT, o.end)]);
    expect(lendemain).toContainEqual(["m1", 7 * 60 + 15, 8 * 60]);
    expect(lendemain).toContainEqual(["n1", 0, 7 * 60 + 15]);
  });

  /* Une journée vide n'a plus à être vide : l'heure de réveil au plus tard du
     bloc du matin devient l'ancre, et la nuit de la veille la suit. */
  it("fait suivre la nuit quand le réveil du lendemain vient du repli", () => {
    const placed = anchoredOccurrencesForRange(
      [bloc(45, "m1", "Réveil", { maxStart: "09:00" }), nuit(480, "n1", { maxStart: "23:30" })],
      [DAY, NEXT], new Map(),
    );
    const lendemain = (placed.get(NEXT) || []).map((o) => [o.anchorId, minOfIn(NEXT, o.start), minOfIn(NEXT, o.end)]);
    expect(lendemain).toContainEqual(["m1", 9 * 60, 9 * 60 + 45]);
    /* Huit heures avant 9 h, ce serait un coucher à 1 h du matin : le « coucher
       au plus tard » ramène le début à 23 h 30 et la nuit s'allonge. */
    const veille = (placed.get(DAY) || []).map((o) => [o.anchorId, minOf(o.start), minOf(o.end)]);
    expect(veille).toContainEqual(["n1", 23 * 60 + 30, 24 * 60]);
    expect(lendemain).toContainEqual(["n1", 0, 9 * 60]);
  });

  /* Le bout à bout : le matin du lendemain doit être calculé AVANT le soir de
     la veille, sinon la nuit se cale sur le cours et mange le réveil. */
  it("enchaîne matin puis soir sur une plage", () => {
    const map = new Map([[NEXT, [{ start: isoNext(8) }]]]);
    const placed = anchoredOccurrencesForRange([bloc(45), nuit(480)], [DAY, NEXT], map);
    const veille = placed.get(DAY) || [];
    expect(veille).toHaveLength(1);
    expect(minOfIn(DAY, veille[0].start)).toBe(23 * 60 + 15); // 8 h avant 07:15
    const lendemain = placed.get(NEXT) || [];
    // Le réveil du matin + le morceau de nuit d'après minuit.
    expect(lendemain).toHaveLength(2);
    expect(nextDayKey(DAY)).toBe(NEXT);
  });
});
