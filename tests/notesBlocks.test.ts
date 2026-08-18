import { describe, it, expect } from "vitest";
// @ts-expect-error — module JS sans déclarations de types
import {
  applySlashBlock,
  applyWikiLink,
  continueList,
  detectSlashAtCursor,
  detectWikiLinkAtCursor,
  indentLines,
  matchSlashBlocks,
  renumber,
  SLASH_BLOCKS,
  toggleTaskAt,
  toggleTaskLine,
} from "@/lib/notes/blocks";

type Block = { id: string };
const block = (id: string) => SLASH_BLOCKS.find((b: Block) => b.id === id);

describe("continuation des listes", () => {
  it("ouvre l'item suivant sur Entrée", () => {
    expect(continueList("- alpha", 7, 7).text).toBe("- alpha\n- ");
  });

  it("reconduit la case à cocher, jamais cochée", () => {
    expect(continueList("- [x] fini", 10, 10).text).toBe("- [x] fini\n- [ ] ");
  });

  it("incrémente la numérotation", () => {
    expect(continueList("1. un", 5, 5).text).toBe("1. un\n2. ");
  });

  it("sort de la liste quand l'item est vide", () => {
    expect(continueList("1. un\n2. ", 9, 9).text).toBe("1. un\n");
  });

  it("dépile un niveau avant de sortir", () => {
    expect(continueList("- a\n  - ", 8, 8).text).toBe("- a\n- ");
  });

  it("laisse Entrée tranquille hors d'une liste", () => {
    expect(continueList("juste du texte", 14, 14)).toBeNull();
  });

  it("ne s'active pas quand du texte est sélectionné", () => {
    expect(continueList("- alpha", 2, 7)).toBeNull();
  });
});

describe("renumérotation", () => {
  it("recale une liste dont les numéros ont dérivé", () => {
    expect(renumber("1. a\n1. b\n5. c")).toBe("1. a\n2. b\n3. c");
  });

  it("compte chaque niveau séparément", () => {
    expect(renumber("1. a\n  1. x\n  9. y\n2. b")).toBe("1. a\n  1. x\n  2. y\n2. b");
  });

  it("repart de 1 après une ligne vide", () => {
    expect(renumber("1. a\n2. b\n\n7. c")).toBe("1. a\n2. b\n\n1. c");
  });

  it("préserve les cases à cocher", () => {
    expect(renumber("3. [x] a\n3. [ ] b")).toBe("1. [x] a\n2. [ ] b");
  });
});

describe("cases à cocher", () => {
  it("transforme une puce ordinaire en tâche", () => {
    expect(toggleTaskAt("- alpha", 3).text).toBe("- [ ] alpha");
  });

  it("coche puis décoche", () => {
    const on = toggleTaskAt("- [ ] alpha", 8).text;
    expect(on).toBe("- [x] alpha");
    expect(toggleTaskAt(on, 8).text).toBe("- [ ] alpha");
  });

  it("ne fait rien hors d'une liste", () => {
    expect(toggleTaskAt("du texte", 4)).toBeNull();
  });

  it("bascule la case d'une ligne donnée", () => {
    expect(toggleTaskLine("- [ ] a\n- [ ] b", 1)).toBe("- [ ] a\n- [x] b");
  });

  it("ignore une ligne sans case", () => {
    expect(toggleTaskLine("- a\n- [ ] b", 0)).toBe("- a\n- [ ] b");
  });
});

describe("indentation des listes", () => {
  it("indente d'un niveau de deux espaces", () => {
    expect(indentLines("- a\n- b", 5, 5, false).text).toBe("- a\n  - b");
  });

  it("désindente", () => {
    expect(indentLines("- a\n  - b", 7, 7, true).text).toBe("- a\n- b");
  });

  it("renumérote après indentation", () => {
    expect(indentLines("1. a\n2. b", 6, 6, false).text).toBe("1. a\n  1. b");
  });

  it("laisse Tab tranquille hors d'une liste", () => {
    expect(indentLines("texte", 2, 2, false)).toBeNull();
  });
});

describe("menu « / »", () => {
  it("suit l'écriture mot à mot, accents compris", () => {
    expect(matchSlashBlocks("liste tache").map((b: Block) => b.id)).toEqual(["todo"]);
    expect(matchSlashBlocks("tâche")[0].id).toBe("todo");
    expect(matchSlashBlocks("chiffre")[0].id).toBe("ordered");
    expect(matchSlashBlocks("repliable")[0].id).toBe("toggle");
    expect(matchSlashBlocks("encadré")[0].id.startsWith("callout")).toBe(true);
  });

  it("propose tout le catalogue sur un « / » nu", () => {
    expect(matchSlashBlocks("").length).toBeGreaterThan(3);
  });

  it("ne s'ouvre pas au milieu d'une URL", () => {
    expect(detectSlashAtCursor("http://a/b", 10)).toBeNull();
  });

  it("se referme quand la phrase s'allonge", () => {
    expect(detectSlashAtCursor("/un deux trois quatre", 21)).toBeNull();
  });

  it("remplace le « / » par le bloc choisi", () => {
    const det = detectSlashAtCursor("/tache", 6);
    const r = applySlashBlock("/tache", matchSlashBlocks("tache")[0], det, 6);
    expect(r.text).toBe("- [ ] ");
    expect(r.caret).toBe(6);
  });

  it("remplace le préfixe d'une ligne déjà en liste", () => {
    const det = detectSlashAtCursor("- deja /titre 2", 13);
    expect(applySlashBlock("- deja /titre 2", block("h2"), det, 13).text).toBe("## deja  2");
  });

  it("détache un bloc autonome du paragraphe qui précède", () => {
    const det = detectSlashAtCursor("Texte /tableau", 14);
    const r = applySlashBlock("Texte /tableau", block("table"), det, 14);
    expect(r.text.startsWith("Texte \n\n|")).toBe(true);
  });

  it("écrit un encadré en syntaxe Obsidian", () => {
    const det = detectSlashAtCursor("/info", 5);
    const r = applySlashBlock("/info", block("callout-info"), det, 5);
    expect(r.text).toBe("> [!info] Titre\n> Contenu");
    expect(r.text.slice(0, r.caret)).toBe("> [!info] Titre");
  });

  it("annonce l'action image plutôt que d'écrire du texte", () => {
    const det = detectSlashAtCursor("/image", 6);
    const r = applySlashBlock("/image", block("image"), det, 6);
    expect(r.action).toBe("image");
    expect(r.text).toBe("");
  });
});

describe("liens entre notes", () => {
  it("repère un [[ en cours de frappe", () => {
    expect(detectWikiLinkAtCursor("voir [[pla", 10)).toEqual({ query: "pla", start: 5 });
  });

  it("se tait une fois le lien fermé", () => {
    expect(detectWikiLinkAtCursor("voir [[plan]]", 13)).toBeNull();
  });

  it("complète le lien avec le titre choisi", () => {
    const det = detectWikiLinkAtCursor("voir [[pla", 10);
    expect(applyWikiLink("voir [[pla", "Plan 2026", det, 10).text).toBe("voir [[Plan 2026]]");
  });
});
