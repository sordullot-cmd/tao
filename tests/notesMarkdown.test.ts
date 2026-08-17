import { describe, it, expect } from "vitest";
import {
  attachmentPlan,
  dataUrlToBytes,
  fileBase,
  hashText,
  normalizeNoteId,
  noteTitle,
  noteToMarkdown,
  parseMarkdownNote,
  slugifyTitle,
  uniqueFileName,
  type Note,
} from "@/lib/notes/markdown";
import { drawingToSvg } from "@/lib/notes/drawingSvg";

const note = (over: Partial<Note> = {}): Note => ({
  id: 1755424521234.5671,
  content: "Plan de la semaine\n\nRelire les setups #trading et souffler #psycho",
  createdAt: "2026-08-17T10:12:33.000Z",
  updatedAt: "2026-08-17T11:40:02.000Z",
  ...over,
});

describe("sérialisation markdown des notes", () => {
  it("écrit un front-matter avec l'id, les dates et les tags du texte", () => {
    const md = noteToMarkdown(note());
    expect(md).toContain('tr4de-id: "1755424521234.5671"');
    expect(md).toContain("created: 2026-08-17T10:12:33.000Z");
    expect(md).toContain("updated: 2026-08-17T11:40:02.000Z");
    expect(md).toContain("tags:\n  - trading\n  - psycho");
    // Une note non épinglée n'encombre pas le front-matter.
    expect(md).not.toContain("pinned");
    expect(md.endsWith("Relire les setups #trading et souffler #psycho\n")).toBe(true);
  });

  it("n'écrit `pinned` que pour une note épinglée", () => {
    expect(noteToMarkdown(note({ pinned: true }))).toContain("pinned: true");
  });

  it("relit le texte sans le front-matter", () => {
    const parsed = parseMarkdownNote(noteToMarkdown(note()));
    expect(parsed.content).toBe(note().content);
    expect(parsed.id).toBe("1755424521234.5671");
    expect(parsed.created).toBe("2026-08-17T10:12:33.000Z");
    expect(parsed.pinned).toBe(false);
  });

  it("est stable en aller-retour : réécrire ce qu'on vient de lire ne change rien", () => {
    const first = noteToMarkdown(note());
    const parsed = parseMarkdownNote(first);
    const second = noteToMarkdown({ ...note(), content: parsed.content });
    expect(second).toBe(first);
    expect(hashText(second)).toBe(hashText(first));
  });

  it("sort le bloc de pièces jointes du texte de la note", () => {
    const md = noteToMarkdown(note(), ["attachments/Plan de la semaine-1.jpg"]);
    expect(md).toContain("![](attachments/Plan%20de%20la%20semaine-1.jpg)");
    expect(parseMarkdownNote(md).content).toBe(note().content);
  });

  it("tolère un fichier écrit à la main, sans front-matter", () => {
    const parsed = parseMarkdownNote("Juste du texte\n\navec une ligne\n");
    expect(parsed.id).toBeNull();
    expect(parsed.content).toBe("Juste du texte\n\navec une ligne");
  });

  it("relit un contenu qui commence lui-même par une ligne de tirets", () => {
    const n = note({ content: "---\npas du front-matter\n---" });
    expect(parseMarkdownNote(noteToMarkdown(n)).content).toBe(n.content);
  });

  it("rend l'identifiant sous son type d'origine", () => {
    expect(normalizeNoteId("1755424521234.5671")).toBe(1755424521234.5671);
    expect(normalizeNoteId("note-a")).toBe("note-a");
    expect(normalizeNoteId(null)).toBeNull();
  });
});

describe("noms de fichiers", () => {
  it("prend le titre de la note, sans la syntaxe markdown", () => {
    expect(noteTitle("## Mon titre\nsuite")).toBe("Mon titre");
    expect(slugifyTitle("## Revue: R/R du mois ?")).toBe("Revue R R du mois");
    expect(slugifyTitle("\n\n")).toBe("Sans titre");
  });

  it("évite les collisions", () => {
    const taken = new Set(["Revue.md", "Revue 2.md"]);
    expect(uniqueFileName("Revue", taken)).toBe("Revue 3.md");
    // Une note garde son propre fichier sans se numéroter elle-même.
    expect(uniqueFileName("Revue", taken, "Revue 2.md")).toBe("Revue 2.md");
    expect(fileBase("Revue 2.md")).toBe("Revue 2");
  });
});

describe("pièces jointes", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";

  it("décode une data URL en octets", () => {
    const decoded = dataUrlToBytes(png);
    expect(decoded?.ext).toBe("png");
    expect(decoded?.bytes.length).toBeGreaterThan(4);
    expect(dataUrlToBytes("pas une data url")).toBeNull();
  });

  it("nomme les fichiers d'après la note et suit les sources", () => {
    const withImage = note({ images: [{ id: 1, src: png }] });
    const plan = attachmentPlan(withImage, "Plan de la semaine", drawingToSvg);
    expect(plan.entries.map(e => e.name)).toEqual(["Plan de la semaine-1.png"]);
    expect(plan.entries[0].link).toBe("attachments/Plan de la semaine-1.png");

    // Une image ajoutée change l'empreinte : les fichiers seront réécrits.
    const plus = attachmentPlan(
      note({ images: [{ id: 1, src: png }, { id: 2, src: png }] }),
      "Plan de la semaine",
      drawingToSvg
    );
    expect(plus.hash).not.toBe(plan.hash);
  });

  it("exporte le dessin en SVG et le recadre sur les traits", () => {
    const drawing = {
      strokes: [
        { id: 1, tool: "pen", color: "ink", size: 3.25, pts: [100, 200, 1, 140, 240, 1, 180, 200, 1] },
        { id: 2, tool: "arrow", color: "red", size: 3.25, pts: [200, 210, 1, 260, 210, 1] },
      ],
      h: 900,
    };
    const svg = drawingToSvg(drawing)!;
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect(svg).toContain("<polyline"); // pointe de la flèche
    expect(svg).toContain('class="red"');
    // Recadré : la zone commence près du premier trait, pas à l'origine.
    expect(svg).toMatch(/viewBox="\d/);
    expect(svg).not.toContain('viewBox="0 0');
    // L'encre par défaut reste lisible en thème sombre.
    expect(svg).toContain("prefers-color-scheme: dark");
    expect(drawingToSvg({ strokes: [] })).toBeNull();

    const plan = attachmentPlan(note({ drawing }), "Plan", drawingToSvg);
    expect(plan.entries.map(e => e.name)).toEqual(["Plan-schema.svg"]);
  });
});
