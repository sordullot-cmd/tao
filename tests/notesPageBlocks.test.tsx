import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* Page Notes — le confort d'écriture façon Notion greffé sur l'éditeur markdown :
   menu « / » qui filtre pendant la frappe, complétion des liens `[[…]]`, listes
   qui se poursuivent toutes seules. Ce test fige ces comportements, pas la mise
   en forme. */

// jsdom ne sait pas dessiner (pas de contexte 2d) et le calque de dessin n'a
// rien à voir avec l'écriture : on le remplace par un composant inerte.
vi.mock("@/components/notes/DrawingCanvas", () => ({
  default: () => null,
  strokeMaxY: () => 0,
}));

const cloudStore = new Map<string, unknown>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(() => (cloudStore.has(k) ? cloudStore.get(k) : d));
    const set = (u: unknown) => setV((prev: unknown) => {
      const next = typeof u === "function" ? (u as (p: unknown) => unknown)(prev) : u;
      cloudStore.set(k, next);
      return next;
    });
    return [v, set, true];
  },
}));

// Le miroir Obsidian a ses propres tests : ici il ne doit surtout pas tourner.
vi.mock("@/lib/hooks/useObsidianVault", () => ({
  useObsidianVault: () => ({
    status: "unsupported", mode: "none", label: null, syncing: false,
    lastSync: null, summary: null, error: null, conflicts: [],
    autoSync: false, setAutoSync: () => {},
    link: async () => {}, unlink: async () => {}, reconnect: async () => {}, syncNow: async () => {},
  }),
}));

vi.mock("@/lib/contexts/UndoContext", () => ({ useUndo: () => ({ pushUndo: () => {} }) }));

import NotesPage from "@/components/pages/NotesPage";

/** Ouvre une note vierge et rend sa zone d'écriture. */
function openEditor() {
  const { container } = render(<NotesPage />);
  fireEvent.click(screen.getByRole("button", { name: /nouvelle note|Nouvelle/i }));
  const ta = container.querySelector("textarea");
  if (!ta) throw new Error("éditeur introuvable");
  return ta as HTMLTextAreaElement;
}

/** Saisit `value` et place le caret à la fin, comme le ferait la frappe. */
function type(ta: HTMLTextAreaElement, value: string, caret = value.length) {
  fireEvent.change(ta, { target: { value } });
  ta.selectionStart = ta.selectionEnd = caret;
  fireEvent.select(ta);
}

const menu = () => screen.queryByRole("listbox");

describe("Page Notes — menu « / »", () => {
  beforeEach(() => cloudStore.clear());

  it("s'ouvre sur « / » et se resserre au fil de la frappe", () => {
    const ta = openEditor();
    type(ta, "/");
    expect(menu()).not.toBeNull();
    expect(within(menu()!).getAllByRole("option").length).toBeGreaterThan(3);

    type(ta, "/liste tache");
    const options = within(menu()!).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Liste de tâches");
  });

  it("trouve le bloc malgré l'accent manquant", () => {
    const ta = openEditor();
    type(ta, "/numerotee");
    expect(within(menu()!).getAllByRole("option")[0]).toHaveTextContent("Liste numérotée");
  });

  it("se ferme quand plus rien ne correspond", () => {
    const ta = openEditor();
    type(ta, "/zzz");
    expect(menu()).toBeNull();
  });

  it("écrit le bloc choisi à la place du « / »", () => {
    const ta = openEditor();
    type(ta, "/tache");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(ta.value).toBe("- [ ] ");
  });

  it("laisse choisir à la souris", () => {
    const ta = openEditor();
    type(ta, "/citation");
    fireEvent.click(within(menu()!).getAllByRole("option")[0]);
    expect(ta.value).toBe("> ");
  });

  it("se referme sur Échap sans rien écrire", () => {
    const ta = openEditor();
    type(ta, "/tache");
    fireEvent.keyDown(ta, { key: "Escape" });
    expect(menu()).toBeNull();
    expect(ta.value).toBe("/tache");
  });

  it("descend dans la liste aux flèches", () => {
    const ta = openEditor();
    type(ta, "/titre");
    fireEvent.keyDown(ta, { key: "ArrowDown" });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(ta.value).toBe("## ");
  });
});

describe("Page Notes — listes", () => {
  beforeEach(() => cloudStore.clear());

  it("poursuit une liste de tâches à la ligne suivante", () => {
    const ta = openEditor();
    type(ta, "- [ ] premier");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(ta.value).toBe("- [ ] premier\n- [ ] ");
  });

  it("sort de la liste quand l'item reste vide", () => {
    const ta = openEditor();
    type(ta, "- [ ] premier\n- [ ] ");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(ta.value).toBe("- [ ] premier\n");
  });

  it("indente d'un niveau avec Tab, pas de huit espaces", () => {
    const ta = openEditor();
    type(ta, "- a\n- b");
    fireEvent.keyDown(ta, { key: "Tab" });
    expect(ta.value).toBe("- a\n  - b");
  });

  it("garde les huit espaces de Tab hors d'une liste", () => {
    const ta = openEditor();
    type(ta, "texte");
    fireEvent.keyDown(ta, { key: "Tab" });
    expect(ta.value).toBe("texte        ");
  });

  it("coche la ligne courante avec Ctrl+Entrée", () => {
    const ta = openEditor();
    type(ta, "- une tâche");
    fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
    expect(ta.value).toBe("- [ ] une tâche");
  });
});

describe("Page Notes — liens entre notes", () => {
  beforeEach(() => cloudStore.clear());

  it("propose les autres notes après « [[ » et insère le titre choisi", () => {
    cloudStore.set("tr4de_notes", [
      { id: 1, content: "# Plan 2026\nsuite", createdAt: "", updatedAt: "" },
    ]);
    const ta = openEditor();
    type(ta, "voir [[pla");
    expect(within(menu()!).getAllByRole("option")[0]).toHaveTextContent("Plan 2026");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(ta.value).toBe("voir [[Plan 2026]]");
  });

  it("propose de créer la note quand aucune ne correspond", () => {
    const ta = openEditor();
    type(ta, "voir [[Inédite");
    const option = within(menu()!).getAllByRole("option")[0];
    expect(option).toHaveTextContent("Inédite");
    expect(option).toHaveTextContent("nouvelle");
  });
});

describe("Page Notes — clic dans l'éditeur", () => {
  beforeEach(() => cloudStore.clear());

  it("coche la case en cliquant dessus, sans passer par l'aperçu", () => {
    const ta = openEditor();
    type(ta, "- [ ] une tâche");
    ta.selectionStart = ta.selectionEnd = 3; // au milieu de « [ ] »
    fireEvent.click(ta);
    expect(ta.value).toBe("- [x] une tâche");
  });

  it("ouvre la note visée en cliquant sur un [[lien]] écrit en édition", async () => {
    cloudStore.set("tr4de_notes", [
      { id: 1, content: "# Plan 2026\ncorps", createdAt: "", updatedAt: "" },
    ]);
    const ta = openEditor();
    type(ta, "voir [[Plan 2026]]");
    ta.selectionStart = ta.selectionEnd = 10; // dans « Plan 2026 »
    fireEvent.click(ta);
    // La note visée s'ouvre sur son rendu, comme toute note déjà écrite.
    expect(await screen.findByRole("heading", { level: 1, name: "Plan 2026" }, { timeout: 8000 })).not.toBeNull();
  });

  it("laisse poser le caret sur les crochets pour corriger le lien", () => {
    const ta = openEditor();
    type(ta, "voir [[Ailleurs]]");
    ta.selectionStart = ta.selectionEnd = 6; // entre les deux crochets ouvrants
    fireEvent.click(ta);
    expect(ta.value).toBe("voir [[Ailleurs]]");
  });
});

describe("Page Notes — aperçu", () => {
  beforeEach(() => cloudStore.clear());

  it("rend les blocs sans casser, et coche une case au clic", async () => {
    const { container } = render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /nouvelle note|Nouvelle/i }));
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    type(ta, "# Titre\n\n- [ ] tâche\n\n> [!info] Info\n> corps\n\nvoir [[Ailleurs]]");

    fireEvent.click(screen.getByRole("button", { name: "Afficher le rendu formaté" }));
    const box = await screen.findByRole("checkbox", {}, { timeout: 8000 });
    expect(container.querySelector(".rt-callout-info")).not.toBeNull();
    expect(container.querySelector(".rt-wiki")).not.toBeNull();

    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Modifier la note" }));
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toContain("- [x] tâche");
  });
});

describe("Page Notes — la note s'ouvre sur son rendu", () => {
  beforeEach(() => cloudStore.clear());

  it("montre le rendu, pas la syntaxe, quand la note a déjà du contenu", async () => {
    cloudStore.set("tr4de_notes", [
      { id: 1, content: "# Mon titre\n\n- [ ] tâche\n\nvoir [[Ailleurs]]", createdAt: "", updatedAt: "" },
    ]);
    const { container } = render(<NotesPage />);
    fireEvent.click(await screen.findByText("# Mon titre"));

    // Pas de zone de saisie tant qu'on n'a pas cliqué dans le texte.
    expect(container.querySelector("textarea")).toBeNull();
    const h1 = await screen.findByRole("heading", { level: 1, name: "Mon titre" }, { timeout: 8000 });
    expect(h1).not.toBeNull();
    // Le lien s'affiche par son libellé seul, sans ses crochets.
    const link = container.querySelector(".rt-wiki") as HTMLElement;
    expect(link.textContent).toBe("Ailleurs");
    expect(container.textContent).not.toContain("[[");
  });

  it("rouvre l'édition sur la ligne cliquée", async () => {
    cloudStore.set("tr4de_notes", [
      { id: 1, content: "# Titre\n\nPremier paragraphe\n\nSecond paragraphe", createdAt: "", updatedAt: "" },
    ]);
    const { container } = render(<NotesPage />);
    fireEvent.click(await screen.findByText("# Titre"));
    fireEvent.click(screen.getByText("Second paragraphe"));

    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    await new Promise((r) => requestAnimationFrame(r));
    // Le caret atterrit en fin de la ligne cliquée, pas au début de la note.
    expect(ta.value.slice(0, ta.selectionStart)).toBe("# Titre\n\nPremier paragraphe\n\nSecond paragraphe");
  });

  it("ouvre une note vierge directement en écriture", () => {
    const ta = openEditor();
    expect(ta).not.toBeNull();
  });
});
