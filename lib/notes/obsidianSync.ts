/**
 * Synchronisation bidirectionnelle des notes avec un dossier de vault Obsidian.
 *
 * Modèle : l'app garde son tableau JSON (localStorage + Supabase) comme état
 * vivant, le vault reçoit un fichier `.md` par note. Chaque passe rapproche les
 * deux côtés et met à jour un INDEX local qui mémorise, pour chaque note, le
 * fichier associé et l'empreinte du contenu tel qu'il était à la dernière
 * synchro. C'est cette empreinte — et non les dates de modification — qui dit
 * de quel côté il y a eu du changement :
 *
 *   empreinte fichier ≠ index → modifié dans Obsidian   → on tire (pull)
 *   markdown de la note ≠ index → modifié dans l'app     → on pousse (push)
 *   les deux                    → conflit                → le plus récent gagne,
 *                                 l'autre version est copiée dans `conflicts/`
 *
 * Les dates ne servent donc qu'à arbitrer les conflits, là où leur imprécision
 * est sans conséquence (l'API navigateur, le plugin Tauri et la synchro
 * d'Obsidian ne rapportent pas les mêmes valeurs).
 *
 * Convergence : après un pull, la note est resérialisée et le fichier réécrit
 * sous sa forme canonique. Sans cette étape, la passe suivante verrait à nouveau
 * une différence (front-matter `updated`, tags recalculés…) et les deux côtés se
 * réécriraient indéfiniment.
 *
 * Renommages : le nom de fichier vient du titre de la note à sa création. Si le
 * titre change dans l'app, le fichier suit — SAUF s'il a été renommé dans
 * Obsidian, auquel cas c'est le nom de l'utilisateur qui gagne définitivement
 * (renommer sous ses pieds casserait ses liens `[[wikilink]]`).
 */

import {
  ATTACH_DIR,
  CONFLICT_DIR,
  type Note,
  attachmentPlan,
  fileBase,
  hashText,
  noteToMarkdown,
  normalizeNoteId,
  parseMarkdownNote,
  slugifyTitle,
  uniqueFileName,
  type ParsedNoteFile,
} from "./markdown";
import { drawingToSvg } from "./drawingSvg";
import type { VaultFs } from "./vaultFs";

export interface SyncEntry {
  /** Nom du fichier `.md` associé à la note. */
  file: string;
  /** Empreinte du fichier à la dernière synchro. */
  hash: string;
  /** Slug du titre à la dernière synchro — détecte un retitrage côté app. */
  titleSlug: string;
  /** Pièces jointes écrites pour cette note. */
  attachments: string[];
  /** Empreinte des sources des pièces jointes (images + traits). */
  attachHash: string;
}

export interface SyncIndex {
  version: number;
  entries: Record<string, SyncEntry>;
}

export interface SyncReport {
  /** Notes écrites dans le vault. */
  pushed: number;
  /** Notes reprises depuis le vault. */
  pulled: number;
  /** Fichiers créés dans le vault. */
  created: number;
  /** Notes créées dans l'app depuis des fichiers du vault. */
  imported: number;
  /** Fichiers supprimés (note supprimée dans l'app). */
  deletedFiles: number;
  /** Notes supprimées (fichier supprimé dans Obsidian). */
  deletedNotes: number;
  renamed: number;
  /** Chemins des copies de sauvegarde écrites en cas de conflit. */
  conflicts: string[];
}

export interface SyncResult {
  index: SyncIndex;
  notes: Note[];
  /** Vrai si le tableau de notes de l'app a changé (donc à enregistrer). */
  changed: boolean;
  report: SyncReport;
}

/**
 * Le dossier n'est pas dans un état exploitable : vide alors qu'il devrait
 * contenir des notes, ou app sans aucune note alors que le vault en a. Dans ces
 * deux cas, poursuivre supprimerait massivement des données du côté qui, lui,
 * a bien répondu — on préfère refuser la passe.
 */
export class VaultNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultNotReadyError";
  }
}

export function emptyIndex(): SyncIndex {
  return { version: 1, entries: {} };
}

interface VaultFile {
  text: string;
  hash: string;
  parsed: ParsedNoteFile;
}

const iso = (ms: number) => new Date(ms).toISOString();

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function stampFor(ms: number): string {
  return iso(ms).replace(/[:.]/g, "-").replace(/Z$/, "");
}

export interface SyncOptions {
  now?: number;
  /** Générateur d'identifiant pour les notes importées (injecté pour les tests). */
  newId?: () => number | string;
}

/**
 * Rapproche les notes de l'app et les fichiers du dossier lié. Ne touche pas au
 * state React : renvoie le tableau de notes à enregistrer et l'index à
 * mémoriser.
 */
export async function syncVault(
  fs: VaultFs,
  notes: Note[],
  index: SyncIndex,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const now = options.now ?? Date.now();
  const newId = options.newId ?? (() => Date.now() + Math.random());
  const entries: Record<string, SyncEntry> = { ...index.entries };
  const report: SyncReport = {
    pushed: 0, pulled: 0, created: 0, imported: 0,
    deletedFiles: 0, deletedNotes: 0, renamed: 0, conflicts: [],
  };

  // ------------------------------------------------- lecture du dossier
  const names = (await fs.list("")).filter((n) => /\.md$/i.test(n));
  const files = new Map<string, VaultFile>();
  for (const name of names) {
    try {
      const text = await fs.readText(name);
      files.set(name, { text, hash: hashText(text), parsed: parseMarkdownNote(text) });
    } catch {
      // Fichier illisible (verrouillé, synchro Obsidian en cours) : ignoré cette
      // passe plutôt que traité comme supprimé.
    }
  }

  const indexed = Object.values(entries);
  if (indexed.length >= 2 && !indexed.some((e) => files.has(e.file))) {
    throw new VaultNotReadyError(
      "Aucun des fichiers déjà synchronisés n'a été retrouvé. Le dossier est peut-être en cours de synchronisation ou n'est plus le bon."
    );
  }
  if (notes.length === 0 && indexed.length > 0) {
    throw new VaultNotReadyError(
      "Aucune note du côté de l'app alors que le vault en contient : synchro annulée par sécurité."
    );
  }

  // Liste des pièces jointes déjà présentes, chargée à la demande.
  let attachNames: Set<string> | null = null;
  const knownAttachments = async (): Promise<Set<string>> => {
    if (!attachNames) attachNames = new Set(await fs.list(ATTACH_DIR));
    return attachNames;
  };
  /** Retire un nom du cache après suppression du fichier. */
  const forgetAttachment = (name: string): void => {
    if (attachNames) attachNames.delete(name);
  };

  const byId = new Map<string, Note>(notes.map((n) => [String(n.id), n]));

  // -------------------------- 1) notes supprimées dans l'app → fichiers retirés
  for (const [key, entry] of Object.entries(entries)) {
    if (byId.has(key)) continue;
    if (files.has(entry.file)) {
      await fs.remove(entry.file);
      files.delete(entry.file);
      report.deletedFiles++;
    }
    for (const name of entry.attachments) {
      await fs.remove(`${ATTACH_DIR}/${name}`);
      forgetAttachment(name);
    }
    delete entries[key];
  }

  const claimed = new Set<string>();
  const taken = new Set(files.keys());
  const nextNotes: Note[] = [];

  const fileByNoteId = (key: string): string | null => {
    for (const [name, file] of files) {
      if (claimed.has(name)) continue;
      const id = normalizeNoteId(file.parsed.id);
      if (id != null && String(id) === key) return name;
    }
    return null;
  };

  const writeConflictCopy = async (base: string, text: string, side: "app" | "obsidian") => {
    const path = `${CONFLICT_DIR}/${base} (${side === "app" ? "app" : "obsidian"} ${stampFor(now)}).md`;
    await fs.ensureDir(CONFLICT_DIR);
    await fs.writeText(path, text);
    report.conflicts.push(path);
  };

  /** Écrit (ou réécrit) les pièces jointes de la note et retire les orphelines. */
  const syncAttachments = async (
    plan: ReturnType<typeof attachmentPlan>,
    previous: SyncEntry | undefined
  ): Promise<string[]> => {
    const wanted = plan.entries.map((e) => e.name);
    if (plan.entries.length > 0) {
      const known = await knownAttachments();
      const sourcesChanged = previous?.attachHash !== plan.hash;
      await fs.ensureDir(ATTACH_DIR);
      for (const entry of plan.entries) {
        // Un dessin retouché garde le même nom de fichier : c'est l'empreinte des
        // sources qui impose la réécriture.
        if (known.has(entry.name) && !sourcesChanged) continue;
        if (entry.bytes) await fs.writeBytes(`${ATTACH_DIR}/${entry.name}`, entry.bytes);
        else if (entry.text != null) await fs.writeText(`${ATTACH_DIR}/${entry.name}`, entry.text);
        known.add(entry.name);
      }
    }
    for (const name of previous?.attachments || []) {
      if (wanted.includes(name)) continue;
      await fs.remove(`${ATTACH_DIR}/${name}`);
      forgetAttachment(name);
    }
    return wanted;
  };

  // ------------------------------------------- 2) une passe par note de l'app
  for (const note of notes) {
    const key = String(note.id);
    const entry = entries[key];
    const found = entry && files.has(entry.file) ? entry.file : fileByNoteId(key);

    // Fichier supprimé dans Obsidian : la note l'est aussi dans l'app.
    if (entry && !found) {
      for (const name of entry.attachments) {
        await fs.remove(`${ATTACH_DIR}/${name}`);
        forgetAttachment(name);
      }
      delete entries[key];
      report.deletedNotes++;
      continue;
    }

    const slug = slugifyTitle(note.content);
    const adopted = !!(entry && found && entry.file !== found); // renommé dans Obsidian
    let target: string;
    if (!found) target = uniqueFileName(slug, taken, null);
    else if (entry && !adopted && entry.titleSlug !== slug) target = uniqueFileName(slug, taken, found);
    else target = found;

    const base = fileBase(target);
    const plan = attachmentPlan(note, base, drawingToSvg);
    const links = plan.entries.map((e) => e.link);
    const desired = noteToMarkdown(note, links);
    const desiredHash = hashText(desired);
    const current = found ? files.get(found)! : null;

    const push = async (source: Note) => {
      if (found && found !== target) {
        await fs.remove(found);
        files.delete(found);
        taken.delete(found);
        report.renamed++;
      }
      await fs.writeText(target, desired);
      files.set(target, { text: desired, hash: desiredHash, parsed: parseMarkdownNote(desired) });
      taken.add(target);
      claimed.add(target);
      const attachments = await syncAttachments(plan, entry);
      entries[key] = { file: target, hash: desiredHash, titleSlug: slug, attachments, attachHash: plan.hash };
      nextNotes.push(source);
      if (current) report.pushed++;
      else report.created++;
    };

    // Nouvelle note : rien dans le vault, on crée le fichier.
    if (!current) {
      await push(note);
      continue;
    }

    claimed.add(found!);
    const noteChanged = !entry || entry.hash !== desiredHash;
    const fileChanged = !entry || entry.hash !== current.hash;

    const pull = async () => {
      const fileTime = (await fs.mtime(found!)) ?? parseTime(current.parsed.updated) ?? now;
      const updated: Note = {
        ...note,
        content: current.parsed.content,
        pinned: current.parsed.pinned,
        createdAt: current.parsed.created
          ? iso(parseTime(current.parsed.created) ?? Date.parse(note.createdAt))
          : note.createdAt,
        updatedAt: iso(fileTime),
      };
      // Forme canonique : sans cette réécriture, la passe suivante reverrait une
      // différence et repartirait pour un tour.
      const canonSlug = slugifyTitle(updated.content);
      const canon = noteToMarkdown(updated, links);
      let hash = current.hash;
      if (canon !== current.text) {
        await fs.writeText(found!, canon);
        files.set(found!, { text: canon, hash: hashText(canon), parsed: parseMarkdownNote(canon) });
        hash = hashText(canon);
      }
      const attachments = await syncAttachments(plan, entry);
      entries[key] = { file: found!, hash, titleSlug: canonSlug, attachments, attachHash: plan.hash };
      nextNotes.push(updated);
      report.pulled++;
    };

    if (noteChanged && fileChanged) {
      const fileTime = (await fs.mtime(found!)) ?? parseTime(current.parsed.updated) ?? 0;
      const noteTime = parseTime(note.updatedAt) ?? 0;
      const bodiesDiffer = current.parsed.content !== (note.content || "").replace(/\s+$/, "");
      if (fileTime > noteTime) {
        if (bodiesDiffer) await writeConflictCopy(base, desired, "app");
        await pull();
      } else {
        if (bodiesDiffer) await writeConflictCopy(base, current.text, "obsidian");
        await push(note);
      }
      continue;
    }
    if (noteChanged) {
      await push(note);
      continue;
    }
    if (fileChanged) {
      await pull();
      continue;
    }

    // Rien n'a bougé de part et d'autre : seul un renommage peut rester à faire.
    if (target !== found) {
      await push(note);
      continue;
    }
    entries[key] = {
      ...entry!,
      // Fichier renommé dans Obsidian : on adopte son nom, et le slug enregistré
      // devient celui du titre courant pour ne plus jamais tenter le renommage.
      file: found!,
      titleSlug: adopted ? slug : entry!.titleSlug,
      attachments: await syncAttachments(plan, entry),
      attachHash: plan.hash,
    };
    nextNotes.push(note);
  }

  // ------------------------ 3) fichiers inconnus → nouvelles notes dans l'app
  const imported: Note[] = [];
  for (const [name, file] of files) {
    if (claimed.has(name)) continue;
    const rawId = normalizeNoteId(file.parsed.id);
    const id = rawId != null && !byId.has(String(rawId)) && !entries[String(rawId)] ? rawId : newId();
    const mtime = await fs.mtime(name);
    const note: Note = {
      id,
      content: file.parsed.content,
      createdAt: iso(parseTime(file.parsed.created) ?? mtime ?? now),
      updatedAt: iso(mtime ?? parseTime(file.parsed.updated) ?? now),
      pinned: file.parsed.pinned,
    };
    // On réécrit le fichier avec son `tr4de-id` : sans lui, la note serait
    // réimportée en double le jour où l'index local est perdu.
    const canon = noteToMarkdown(note, []);
    let hash = file.hash;
    if (canon !== file.text) {
      await fs.writeText(name, canon);
      hash = hashText(canon);
    }
    entries[String(id)] = {
      file: name,
      hash,
      titleSlug: slugifyTitle(note.content),
      attachments: [],
      attachHash: attachmentPlan(note, fileBase(name)).hash,
    };
    imported.push(note);
    report.imported++;
  }

  imported.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const finalNotes = [...imported, ...nextNotes];
  const changed =
    report.pulled > 0 ||
    report.imported > 0 ||
    report.deletedNotes > 0 ||
    finalNotes.length !== notes.length;

  return { index: { version: 1, entries }, notes: finalNotes, changed, report };
}

/** Résumé lisible d'une passe, pour le panneau de synchro. */
export function describeReport(report: SyncReport): string {
  const bits: string[] = [];
  if (report.created) bits.push(`${report.created} créée${report.created > 1 ? "s" : ""} dans le vault`);
  if (report.pushed) bits.push(`${report.pushed} envoyée${report.pushed > 1 ? "s" : ""}`);
  if (report.pulled) bits.push(`${report.pulled} reprise${report.pulled > 1 ? "s" : ""} d'Obsidian`);
  if (report.imported) bits.push(`${report.imported} importée${report.imported > 1 ? "s" : ""}`);
  if (report.renamed) bits.push(`${report.renamed} renommée${report.renamed > 1 ? "s" : ""}`);
  if (report.deletedFiles) bits.push(`${report.deletedFiles} fichier${report.deletedFiles > 1 ? "s" : ""} supprimé${report.deletedFiles > 1 ? "s" : ""}`);
  if (report.deletedNotes) bits.push(`${report.deletedNotes} note${report.deletedNotes > 1 ? "s" : ""} supprimée${report.deletedNotes > 1 ? "s" : ""}`);
  if (report.conflicts.length) bits.push(`${report.conflicts.length} conflit${report.conflicts.length > 1 ? "s" : ""}`);
  return bits.length === 0 ? "Déjà à jour" : bits.join(", ");
}
