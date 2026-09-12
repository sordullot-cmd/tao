import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_LIST_ID,
  DEFAULT_ROUTINE_ITEMS,
  activeList,
  addList,
  addRule,
  bindListToStrategy,
  dayProgress,
  duplicateList,
  editRule,
  forgetRoutineCheck,
  listProgress,
  normalizeRoutineStore,
  onRoutineChecksChange,
  readRoutineChecks,
  removeList,
  renameList,
  routineChecksKey,
  setActiveList,
  toggleRoutineCheck,
  writeRoutineChecks,
} from "@/lib/routineChecklist";

describe("routine du jour", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("range les coches sous la date du jour, pas sous une clé unique", () => {
    toggleRoutineCheck("zones_cle");
    const today = routineChecksKey();
    expect(JSON.parse(localStorage.getItem(today) || "{}")).toEqual({ zones_cle: true });
    expect(readRoutineChecks("2026-01-01")).toEqual({});
  });

  it("bascule une coche dans les deux sens", () => {
    expect(toggleRoutineCheck("fvg_respecte").fvg_respecte).toBe(true);
    expect(toggleRoutineCheck("fvg_respecte").fvg_respecte).toBe(false);
  });

  it("oublie la coche d'une règle supprimée — sinon elle compterait encore", () => {
    toggleRoutineCheck("biais_journalier");
    toggleRoutineCheck("zones_cle");
    expect(forgetRoutineCheck("zones_cle")).toEqual({ biais_journalier: true });
  });

  it("relaie l'écriture aux autres lecteurs de la même journée", () => {
    const vus: Array<Record<string, boolean>> = [];
    const off = onRoutineChecksChange((checks) => vus.push(checks));
    toggleRoutineCheck("zones_cle");
    off();
    toggleRoutineCheck("biais_journalier"); // plus personne n'écoute
    expect(vus).toEqual([{ zones_cle: true }]);
  });

  it("relit ce qu'une autre instance vient d'écrire, sans passer par le relais", () => {
    writeRoutineChecks({ zones_cle: true });
    expect(readRoutineChecks()).toEqual({ zones_cle: true });
  });

  it("survit à un localStorage illisible plutôt que de faire tomber la page", () => {
    localStorage.setItem(routineChecksKey(), "{pas du json");
    expect(readRoutineChecks()).toEqual({});
  });
});

describe("listes de routine", () => {
  const store = () => normalizeRoutineStore(null);

  it("enveloppe l'ancienne routine plate dans une première liste, sans rien perdre", () => {
    const ancien = [
      { id: "r_1", label: "Attendre le London open" },
      { id: "r_2", label: "Vérifier les news" },
    ];
    const s = normalizeRoutineStore(ancien);
    expect(s.lists).toHaveLength(1);
    expect(s.lists[0].id).toBe(DEFAULT_LIST_ID);
    expect(s.lists[0].items.map(i => i.label)).toEqual([
      "Attendre le London open",
      "Vérifier les news",
    ]);
    expect(activeList(s).id).toBe(DEFAULT_LIST_ID);
  });

  it("ne fabrique pas deux listes en normalisant deux fois", () => {
    const une = normalizeRoutineStore([{ id: "r_1", label: "Une règle" }]);
    expect(normalizeRoutineStore(une)).toEqual(une);
  });

  it("sert les règles par défaut à qui n'a rien", () => {
    expect(store().lists[0].items).toEqual(DEFAULT_ROUTINE_ITEMS);
  });

  it("rattrape un activeId qui ne désigne plus rien", () => {
    const s = normalizeRoutineStore({
      lists: [{ id: "l_a", name: "Scalp", items: [] }],
      activeId: "l_disparue",
    });
    expect(s.activeId).toBe("l_a");
  });

  it("garde au moins une liste quand on supprime la dernière", () => {
    const s = removeList(store(), DEFAULT_LIST_ID);
    expect(s.lists).toHaveLength(1);
    expect(activeList(s)).toBeDefined();
  });

  it("rend active la liste qu'on vient de créer — on la crée pour s'en servir", () => {
    const s = addList(store(), "Swing FVG");
    expect(activeList(s).name).toBe("Swing FVG");
    expect(s.lists).toHaveLength(2);
  });

  it("donne des identifiants NEUFS à la copie, sinon une case cocherait les deux", () => {
    const s = duplicateList(store(), DEFAULT_LIST_ID);
    const [src, copie] = s.lists;
    expect(copie.items.map(i => i.label)).toEqual(src.items.map(i => i.label));
    for (const it of copie.items) {
      expect(src.items.some(o => o.id === it.id)).toBe(false);
    }
  });

  it("supprime une règle dont on vide le libellé", () => {
    const s = editRule(store(), DEFAULT_LIST_ID, "zones_cle", "   ");
    expect(activeList(s).items.map(i => i.id)).toEqual(["biais_journalier", "fvg_respecte"]);
  });

  it("lie une liste à une stratégie, et sait la délier", () => {
    let s = bindListToStrategy(store(), DEFAULT_LIST_ID, "strat-42");
    expect(activeList(s).strategyId).toBe("strat-42");
    s = bindListToStrategy(s, DEFAULT_LIST_ID, null);
    expect(activeList(s).strategyId).toBeNull();
  });

  it("ignore un renommage vide plutôt que d'effacer le nom", () => {
    const s = renameList(store(), DEFAULT_LIST_ID, "  ");
    expect(activeList(s).name).toBe("Routine");
  });

  it("ignore une activation qui vise une liste absente", () => {
    const s = store();
    expect(setActiveList(s, "l_fantome")).toBe(s);
  });

  it("ne compte dans la journée que les listes réellement touchées", () => {
    let s = addList(store(), "Swing FVG");
    s = addRule(s, activeList(s).id, "Attendre le retest");
    const swing = activeList(s);
    // Seule la liste par défaut a servi ce jour-là.
    expect(dayProgress(s, { biais_journalier: true })).toEqual({ done: 1, total: 3 });
    // Les deux listes ont servi : les totaux s'additionnent.
    expect(dayProgress(s, { biais_journalier: true, [swing.items[0].id]: true }))
      .toEqual({ done: 2, total: 4 });
  });

  it("garde « 0 sur 3 » pour une journée tout décochée, au lieu de la blanchir", () => {
    // La clé présente est la trace qu'on s'est servi de la liste ce jour-là.
    expect(dayProgress(store(), { biais_journalier: false })).toEqual({ done: 0, total: 3 });
    expect(dayProgress(store(), {})).toEqual({ done: 0, total: 0 });
  });

  it("compte la progression d'une liste seule", () => {
    expect(listProgress(activeList(store()), { biais_journalier: true, zones_cle: true }))
      .toEqual({ done: 2, total: 3 });
  });
});
