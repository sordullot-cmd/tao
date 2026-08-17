import { describe, it, expect } from "vitest";
import {
  VaultNotReadyError,
  describeReport,
  emptyIndex,
  syncVault,
  type SyncIndex,
} from "@/lib/notes/obsidianSync";
import { noteToMarkdown, type Note } from "@/lib/notes/markdown";
import type { VaultFs } from "@/lib/notes/vaultFs";

/** Dossier de vault en mémoire — même interface que les accès web et Tauri. */
function memoryVault(seed: Record<string, string> = {}) {
  const files = new Map<string, { text?: string; bytes?: Uint8Array; mtime: number }>();
  // Horloge du dossier calée après les `updatedAt` des notes de test : les dates
  // n'arbitrent que les conflits, mais elles doivent rester plausibles.
  let clock = Date.parse("2026-08-17T12:00:00.000Z");
  const tick = () => (clock += 1000);

  for (const [path, text] of Object.entries(seed)) files.set(path, { text, mtime: tick() });

  const fs: VaultFs = {
    kind: "memory",
    label: "vault-de-test",
    async list(dir = "") {
      const prefix = dir ? `${dir.replace(/\/$/, "")}/` : "";
      const out: string[] = [];
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        if (!rest || rest.includes("/")) continue;
        out.push(rest);
      }
      return out;
    },
    async readText(path) {
      const f = files.get(path);
      if (!f) throw new Error(`introuvable: ${path}`);
      return f.text ?? "";
    },
    async writeText(path, text) { files.set(path, { text, mtime: tick() }); },
    async writeBytes(path, bytes) { files.set(path, { bytes, mtime: tick() }); },
    async remove(path) { files.delete(path); },
    async mtime(path) { return files.get(path)?.mtime ?? null; },
    async ensureDir() {},
    async access() { return "granted"; },
    async request() { return true; },
  };

  return {
    fs,
    files,
    /** Notes du dossier racine — ce que voit la synchro (ni conflicts/, ni attachments/). */
    md: () => Array.from(files.keys()).filter((p) => p.endsWith(".md") && !p.includes("/")).sort(),
    text: (path: string) => files.get(path)?.text ?? null,
    /** Simule une édition dans Obsidian : contenu réécrit, fichier plus récent. */
    edit(path: string, text: string) { files.set(path, { text, mtime: tick() }); },
    rename(from: string, to: string) {
      const f = files.get(from)!;
      files.delete(from);
      files.set(to, f);
    },
  };
}

const note = (over: Partial<Note> = {}): Note => ({
  id: 101,
  content: "Plan de la semaine\n\nRelire les setups #trading",
  createdAt: "2026-08-17T10:00:00.000Z",
  updatedAt: "2026-08-17T11:00:00.000Z",
  ...over,
});

const options = { now: Date.parse("2026-08-18T09:00:00.000Z"), newId: () => 900 };

describe("synchronisation avec un vault Obsidian", () => {
  it("crée un fichier par note à la première passe", async () => {
    const vault = memoryVault();
    const notes = [note(), note({ id: 102, content: "Revue mensuelle" })];
    const res = await syncVault(vault.fs, notes, emptyIndex(), options);

    expect(vault.md()).toEqual(["Plan de la semaine.md", "Revue mensuelle.md"]);
    expect(res.report.created).toBe(2);
    expect(res.changed).toBe(false); // rien à réécrire côté app
    expect(vault.text("Plan de la semaine.md")).toContain('tr4de-id: "101"');
    expect(Object.keys(res.index.entries)).toEqual(["101", "102"]);
  });

  it("converge : une seconde passe ne touche plus à rien", async () => {
    const vault = memoryVault();
    const notes = [note()];
    const first = await syncVault(vault.fs, notes, emptyIndex(), options);
    const before = vault.text("Plan de la semaine.md");

    const second = await syncVault(vault.fs, first.notes, first.index, options);
    expect(describeReport(second.report)).toBe("Déjà à jour");
    expect(second.changed).toBe(false);
    expect(vault.text("Plan de la semaine.md")).toBe(before);
  });

  it("pousse une note modifiée dans l'app", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note()], emptyIndex(), options);
    const edited = note({ content: "Plan de la semaine\n\nAjout du soir #psycho", updatedAt: "2026-08-18T08:00:00.000Z" });

    const res = await syncVault(vault.fs, [edited], first.index, options);
    expect(res.report.pushed).toBe(1);
    expect(vault.text("Plan de la semaine.md")).toContain("Ajout du soir #psycho");
    expect(vault.text("Plan de la semaine.md")).toContain("- psycho");
  });

  it("reprend une note modifiée dans Obsidian", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note()], emptyIndex(), options);
    vault.edit(
      "Plan de la semaine.md",
      `${vault.text("Plan de la semaine.md")}\n\nAjouté depuis Obsidian #focus\n`
    );

    const res = await syncVault(vault.fs, first.notes, first.index, options);
    expect(res.report.pulled).toBe(1);
    expect(res.changed).toBe(true);
    expect(res.notes[0].content).toContain("Ajouté depuis Obsidian #focus");
    // Le fichier est remis sous forme canonique (tags et `updated` recalculés),
    // ce qui garantit qu'une passe de plus ne trouve plus de différence.
    expect(vault.text("Plan de la semaine.md")).toContain("- focus");
    const again = await syncVault(vault.fs, res.notes, res.index, options);
    expect(describeReport(again.report)).toBe("Déjà à jour");
  });

  it("arbitre un conflit en faveur du plus récent et sauvegarde l'autre version", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note()], emptyIndex(), options);

    // Modifié des deux côtés ; le fichier a la date la plus récente.
    vault.edit("Plan de la semaine.md", noteToMarkdown(note({ content: "Version Obsidian" })));
    const appSide = note({ content: "Version app", updatedAt: "2026-08-17T11:30:00.000Z" });

    const res = await syncVault(vault.fs, [appSide], first.index, options);
    expect(res.report.pulled).toBe(1);
    expect(res.notes[0].content).toBe("Version Obsidian");
    expect(res.report.conflicts).toHaveLength(1);
    expect(res.report.conflicts[0]).toContain("conflicts/");
    expect(vault.text(res.report.conflicts[0])).toContain("Version app");
  });

  it("garde la version de l'app quand c'est elle qui est la plus récente", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note()], emptyIndex(), options);
    vault.edit("Plan de la semaine.md", noteToMarkdown(note({ content: "Version Obsidian" })));

    // `updatedAt` postérieur à l'horloge du dossier de test.
    const appSide = note({ content: "Version app", updatedAt: "2030-01-01T00:00:00.000Z" });
    const res = await syncVault(vault.fs, [appSide], first.index, options);
    expect(res.report.pushed).toBe(1);
    // Le titre ayant changé côté app, le fichier suit.
    expect(vault.md()).toEqual(["Version app.md"]);
    expect(vault.text("Version app.md")).toContain("Version app");
    expect(vault.text(res.report.conflicts[0])).toContain("Version Obsidian");
  });

  it("supprime la note quand son fichier a disparu du vault", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note(), note({ id: 102, content: "Revue" })], emptyIndex(), options);
    vault.files.delete("Revue.md");

    const res = await syncVault(vault.fs, first.notes, first.index, options);
    expect(res.report.deletedNotes).toBe(1);
    expect(res.notes.map((n) => n.id)).toEqual([101]);
    expect(res.index.entries["102"]).toBeUndefined();
  });

  it("supprime le fichier et ses pièces jointes quand la note est supprimée dans l'app", async () => {
    const vault = memoryVault();
    const withImage = note({ id: 102, content: "Revue", images: [{ id: 7, src: "data:image/png;base64,iVBORw0KGgo=" }] });
    const first = await syncVault(vault.fs, [note(), withImage], emptyIndex(), options);
    expect(vault.files.has("attachments/Revue-1.png")).toBe(true);

    const res = await syncVault(vault.fs, [note()], first.index, options);
    expect(res.report.deletedFiles).toBe(1);
    expect(vault.md()).toEqual(["Plan de la semaine.md"]);
    expect(vault.files.has("attachments/Revue-1.png")).toBe(false);
  });

  it("importe un fichier créé dans Obsidian et y inscrit son identifiant", async () => {
    const vault = memoryVault({ "Idée de setup.md": "Idée de setup\n\nRSI en divergence #trading\n" });
    const res = await syncVault(vault.fs, [note()], emptyIndex(), options);

    expect(res.report.imported).toBe(1);
    const imported = res.notes.find((n) => n.id === 900)!;
    expect(imported.content).toBe("Idée de setup\n\nRSI en divergence #trading");
    // Sans `tr4de-id` dans le fichier, la note serait réimportée en double le
    // jour où l'index local est perdu.
    expect(vault.text("Idée de setup.md")).toContain('tr4de-id: "900"');

    const again = await syncVault(vault.fs, res.notes, res.index, options);
    expect(again.report.imported).toBe(0);
  });

  it("retrouve un fichier par son identifiant quand l'index local est perdu", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note()], emptyIndex(), options);
    expect(first.report.created).toBe(1);

    // Nouvel appareil : les notes viennent du cloud, l'index est vide.
    const res = await syncVault(vault.fs, first.notes, emptyIndex(), options);
    expect(res.report.imported).toBe(0);
    expect(res.notes).toHaveLength(1);
    expect(vault.md()).toEqual(["Plan de la semaine.md"]);
  });

  it("renomme le fichier quand le titre change dans l'app", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note()], emptyIndex(), options);
    const retitled = note({ content: "Plan revu\n\nRelire les setups #trading", updatedAt: "2026-08-18T08:00:00.000Z" });

    const res = await syncVault(vault.fs, [retitled], first.index, options);
    expect(res.report.renamed).toBe(1);
    expect(vault.md()).toEqual(["Plan revu.md"]);
    expect(res.index.entries["101"].file).toBe("Plan revu.md");
  });

  it("respecte un fichier renommé dans Obsidian", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note()], emptyIndex(), options);
    vault.rename("Plan de la semaine.md", "Semaine 34.md");

    const res = await syncVault(vault.fs, first.notes, first.index, options);
    expect(vault.md()).toEqual(["Semaine 34.md"]);
    expect(res.index.entries["101"].file).toBe("Semaine 34.md");

    // Et il ne repart pas vers l'ancien nom à la passe suivante.
    const again = await syncVault(vault.fs, res.notes, res.index, options);
    expect(vault.md()).toEqual(["Semaine 34.md"]);
    expect(again.report.renamed).toBe(0);
  });

  it("écrit images et dessins dans attachments/ et les lie dans le markdown", async () => {
    const vault = memoryVault();
    const rich = note({
      images: [{ id: 7, src: "data:image/png;base64,iVBORw0KGgo=" }],
      drawing: { strokes: [{ id: 1, tool: "pen", color: "ink", size: 3, pts: [10, 20, 1, 40, 50, 1] }], h: 200 },
    });

    const res = await syncVault(vault.fs, [rich], emptyIndex(), options);
    expect(vault.files.has("attachments/Plan de la semaine-1.png")).toBe(true);
    expect(vault.files.get("attachments/Plan de la semaine-schema.svg")?.text).toContain("<svg");
    const md = vault.text("Plan de la semaine.md")!;
    expect(md).toContain("![](attachments/Plan%20de%20la%20semaine-1.png)");
    expect(md).toContain("-schema.svg)");
    expect(res.index.entries["101"].attachments).toHaveLength(2);
  });

  it("réécrit le schéma quand le dessin change, sans toucher aux images", async () => {
    const vault = memoryVault();
    const draw = (x: number) => ({ strokes: [{ id: 1, tool: "pen", color: "ink", size: 3, pts: [x, 20, 1, 40, 50, 1] }], h: 200 });
    const first = await syncVault(vault.fs, [note({ drawing: draw(10) })], emptyIndex(), options);
    const before = vault.files.get("attachments/Plan de la semaine-schema.svg")!.text;

    await syncVault(vault.fs, [note({ drawing: draw(90) })], first.index, options);
    expect(vault.files.get("attachments/Plan de la semaine-schema.svg")!.text).not.toBe(before);
  });

  it("refuse de synchroniser un dossier qui ne répond plus", async () => {
    const vault = memoryVault();
    const first = await syncVault(
      vault.fs,
      [note(), note({ id: 102, content: "Revue" })],
      emptyIndex(),
      options
    );
    // Dossier vidé (mauvais dossier, synchro Obsidian pas encore descendue) :
    // continuer supprimerait les deux notes.
    vault.files.clear();
    await expect(syncVault(vault.fs, first.notes, first.index, options)).rejects.toThrow(VaultNotReadyError);
  });

  it("refuse de synchroniser quand l'app n'a aucune note", async () => {
    const vault = memoryVault();
    const first = await syncVault(vault.fs, [note()], emptyIndex(), options);
    await expect(syncVault(vault.fs, [], first.index, options)).rejects.toThrow(VaultNotReadyError);
  });

  it("numérote les fichiers de deux notes de même titre", async () => {
    const vault = memoryVault();
    const notes = [note(), note({ id: 102 })];
    const res: { index: SyncIndex } = await syncVault(vault.fs, notes, emptyIndex(), options);
    expect(vault.md()).toEqual(["Plan de la semaine 2.md", "Plan de la semaine.md"]);
    expect(res.index.entries["102"].file).toBe("Plan de la semaine 2.md");
  });
});
