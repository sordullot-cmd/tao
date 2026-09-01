import { describe, it, expect } from "vitest";
import {
  addChecklistItem, adoptChecklist, checkedStepsFor, checklistFor, checklistProgress,
  dropChecklist, newChecklistItem, normalizeChecklists, removeChecklistItem,
  setChecklist, toggleChecklistItem,
} from "@/lib/agendaChecklists";

/** Le cas d'usage qui a motivé la fonctionnalité. */
const LECTURE = ["Lire", "Noter ce que j'ai appris", "Préparer une petite présentation"];

const withSteps = (eventId = "ev1", steps = LECTURE) =>
  steps.reduce((store, text) => addChecklistItem(store, eventId, text), {});

describe("étapes d'un évènement", () => {
  it("garde les étapes dans l'ordre où on les pose", () => {
    const store = withSteps();
    expect(checklistFor(store, "ev1").map((i) => i.text)).toEqual(LECTURE);
  });

  it("refuse une étape vide plutôt que d'en poser une sans texte", () => {
    const store = addChecklistItem(addChecklistItem({}, "ev1", "   "), "ev1", "");
    expect(store).toEqual({});
    expect(newChecklistItem("  ")).toBeNull();
  });

  it("coche et décoche sans toucher aux voisines", () => {
    const store = withSteps();
    const cible = checklistFor(store, "ev1")[1];
    const coche = toggleChecklistItem(store, "ev1", cible.id);
    expect(checklistFor(coche, "ev1").map((i) => i.done)).toEqual([false, true, false]);
    const decoche = toggleChecklistItem(coche, "ev1", cible.id);
    expect(checklistFor(decoche, "ev1").every((i) => !i.done)).toBe(true);
  });

  it("retire une étape sans déranger les autres", () => {
    const store = withSteps();
    const cible = checklistFor(store, "ev1")[0];
    const apres = removeChecklistItem(store, "ev1", cible.id);
    expect(checklistFor(apres, "ev1").map((i) => i.text)).toEqual(LECTURE.slice(1));
  });

  it("oublie l'évènement dont on a retiré la dernière étape", () => {
    // Une liste vide ne dit rien de plus que son absence, et le magasin
    // garderait sinon une entrée par évènement jamais rempli.
    let store = addChecklistItem({}, "ev1", "Lire");
    store = removeChecklistItem(store, "ev1", checklistFor(store, "ev1")[0].id);
    expect(store).toEqual({});
  });

  it("ne mélange pas les listes de deux évènements", () => {
    let store = withSteps("ev1");
    store = addChecklistItem(store, "ev2", "Réviser");
    expect(checklistFor(store, "ev1")).toHaveLength(3);
    expect(checklistFor(store, "ev2").map((i) => i.text)).toEqual(["Réviser"]);
  });

  it("pose sous son identifiant définitif une liste écrite avant la création", () => {
    /* Les étapes saisies dans le formulaire d'un évènement qui n'existe pas
       encore : Google ne donne son id qu'à l'enregistrement. */
    const brouillon = checklistFor(withSteps("brouillon"), "brouillon");
    const store = adoptChecklist({}, brouillon, "ev-google-42");
    expect(checklistFor(store, "ev-google-42").map((i) => i.text)).toEqual(LECTURE);
  });

  it("n'invente rien quand le brouillon est vide", () => {
    expect(adoptChecklist({}, [], "ev1")).toEqual({});
  });

  it("emporte les étapes avec l'évènement supprimé", () => {
    // Gardées, elles reviendraient sur un futur évènement du même id.
    const store = dropChecklist(withSteps(), "ev1");
    expect(store).toEqual({});
  });

  it("compte l'avancement pour le bloc de la grille", () => {
    const store = withSteps();
    const premier = checklistFor(store, "ev1")[0];
    expect(checklistProgress(checklistFor(store, "ev1"))).toEqual({ done: 0, total: 3 });
    const apres = toggleChecklistItem(store, "ev1", premier.id);
    expect(checklistProgress(checklistFor(apres, "ev1"))).toEqual({ done: 1, total: 3 });
    expect(checklistProgress(undefined as never)).toEqual({ done: 0, total: 0 });
  });

  it("relit un magasin abîmé sans rien perdre de lisible", () => {
    const store = normalizeChecklists({
      ev1: ["Lire", { text: "Noter", done: true }, { text: "   " }, null, 42],
      "": [{ text: "Orpheline" }],
      ev2: "pas une liste",
    });
    expect(Object.keys(store)).toEqual(["ev1"]);
    expect(store.ev1.map((i) => i.text)).toEqual(["Lire", "Noter"]);
    expect(store.ev1[1].done).toBe(true);
    // Une chaîne nue vaut une étape à faire.
    expect(store.ev1[0].done).toBe(false);
  });

  it("donne un identifiant propre à chaque étape", () => {
    const store = withSteps();
    const ids = checklistFor(store, "ev1").map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("ignore une écriture sans évènement visé", () => {
    expect(setChecklist({}, "", [{ id: "a", text: "Lire", done: false }])).toEqual({});
    expect(addChecklistItem({}, "", "Lire")).toEqual({});
  });
});

describe("ce que le bloc de la grille peut montrer", () => {
  /* Le bloc affiche les étapes qui tiennent et compte le reste. La règle est
     recopiée de la grille : 15 px par ligne, sous le titre et l'heure. */
  const room = (height: number, headH: number) => Math.floor((height - (headH > 28 ? 30 : 16)) / 15);

  it("montre tout quand la hauteur suffit", () => {
    const items = checklistFor(withSteps(), "ev1");
    const place = room(120, 40); // créneau de deux heures
    expect(place).toBeGreaterThanOrEqual(items.length);
    expect(items.slice(0, place)).toHaveLength(3);
  });

  it("n'écrit rien hors des bornes d'un créneau court", () => {
    // 30 minutes : une ligne de titre, pas de place sous elle.
    expect(room(30, 16)).toBeLessThan(1);
  });

  it("laisse au compteur ce qui ne tient pas", () => {
    // Une heure sous un titre haut : deux lignes de place pour trois étapes.
    const items = checklistFor(withSteps(), "ev1");
    const montrees = items.slice(0, room(60, 30));
    expect(montrees).toHaveLength(2);
    expect(items.length - montrees.length).toBe(1);
    // Le compteur, lui, parle bien des TROIS étapes, pas des deux affichées.
    expect(checklistProgress(items)).toEqual({ done: 0, total: 3 });
  });
});

describe("XP des étapes d'un créneau", () => {
  const RPG = { ev1: { categories: ["etudes"], title: "Lecture" } };

  const coche = (store: ReturnType<typeof withSteps>, eventId: string, index: number) => {
    const item = checklistFor(store, eventId)[index];
    return toggleChecklistItem(store, eventId, item.id);
  };

  it("ne compte que les cases cochées", () => {
    let store = withSteps();
    expect(checkedStepsFor(store, RPG)).toHaveLength(0);
    store = coche(store, "ev1", 0);
    store = coche(store, "ev1", 2);
    expect(checkedStepsFor(store, RPG).map((s) => s.itemId))
      .toEqual([checklistFor(store, "ev1")[0].id, checklistFor(store, "ev1")[2].id]);
  });

  it("ne rapporte rien pour un créneau rattaché à aucun objectif", () => {
    // Sans carte liée, cocher ne dit pas vers QUOI on a avancé.
    const store = coche(withSteps(), "ev1", 0);
    expect(checkedStepsFor(store, {})).toEqual([]);
    expect(checkedStepsFor(store, { ev1: { categories: [] } })).toEqual([]);
  });

  it("crédite chacune des cartes liées au créneau", () => {
    const store = coche(withSteps(), "ev1", 0);
    const deux = checkedStepsFor(store, { ev1: { categories: ["etudes", "discipline"], title: "Lecture" } });
    expect(deux[0].categories).toEqual(["etudes", "discipline"]);
  });

  it("date la coche, et oublie la date au décochage", () => {
    /* Une date gardée après décochage laisserait au journal une ligne qui ne
       correspond plus à rien. */
    let store = coche(withSteps(), "ev1", 0);
    const item = checklistFor(store, "ev1")[0];
    expect(item.doneAt).toBeTruthy();
    expect(checkedStepsFor(store, RPG)[0].ts).toBe(item.doneAt);

    store = toggleChecklistItem(store, "ev1", item.id);
    expect(checklistFor(store, "ev1")[0].doneAt).toBeNull();
    expect(checkedStepsFor(store, RPG)).toEqual([]);
  });

  it("nomme l'étape par son créneau, pour un journal lisible", () => {
    const store = coche(withSteps(), "ev1", 0);
    expect(checkedStepsFor(store, RPG)[0].label).toBe("Lecture · Lire");
    // Sans titre de créneau, l'étape se nomme seule plutôt que « · Lire ».
    expect(checkedStepsFor(store, { ev1: { categories: ["etudes"] } })[0].label).toBe("Lire");
  });

  it("compte une étape cochée avant qu'on date les coches, sans l'inscrire au journal", () => {
    const store = normalizeChecklists({ ev1: [{ id: "i1", text: "Lire", done: true }] });
    const steps = checkedStepsFor(store, RPG);
    expect(steps).toHaveLength(1);
    expect(steps[0].ts).toBeNull();
  });

  it("ne mélange pas les créneaux : chacun ses cartes", () => {
    let store = coche(withSteps("ev1"), "ev1", 0);
    store = addChecklistItem(store, "ev2", "Réviser");
    store = coche(store, "ev2", 0);
    const steps = checkedStepsFor(store, {
      ev1: { categories: ["etudes"], title: "Lecture" },
      ev2: { categories: ["sport"], title: "Révisions" },
    });
    expect(steps.map((s) => s.categories[0]).sort()).toEqual(["etudes", "sport"]);
  });
});
