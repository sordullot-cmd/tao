/**
 * Sérialisation des notes en markdown Obsidian (et retour).
 *
 * Le stockage vivant de l'app reste le tableau JSON de `useCloudState`
 * (localStorage + Supabase) ; ce module donne à chaque note sa forme de
 * FICHIER, celle qu'Obsidian sait lire et éditer :
 *
 *   ---
 *   tr4de-id: "1755424521234.5671"
 *   created: 2026-08-17T10:12:33.000Z
 *   updated: 2026-08-17T11:40:02.000Z
 *   pinned: true
 *   tags:
 *     - trading
 *   ---
 *
 *   Le texte de la note, tel qu'écrit dans l'app.
 *
 *   <!-- tr4de:attachments -->
 *   ![](attachments/ma-note-1.jpg)
 *   <!-- /tr4de:attachments -->
 *
 * Deux règles gouvernent tout le fichier, parce que la synchro est
 * bidirectionnelle et doit CONVERGER (sinon chaque passe croit voir une
 * modification et l'app et Obsidian se réécrivent en boucle) :
 *
 * 1. `noteToMarkdown` est canonique : deux notes équivalentes donnent le même
 *    texte, à l'octet près (ordre des clés fixe, contenu détrimé, une seule
 *    ligne finale).
 * 2. `parseMarkdownNote(noteToMarkdown(n))` redonne le contenu de `n` détrimé —
 *    donc réappliquer l'aller-retour ne produit plus aucune différence.
 *
 * Le bloc de pièces jointes est encadré par des commentaires HTML : Obsidian les
 * masque en mode lecture mais affiche bien les images entre les deux, et à la
 * relecture on sait quoi retirer pour ne pas polluer le texte de la note.
 */

export interface NoteImage {
  id: number | string;
  src: string;
  addedAt?: string;
}

export interface NoteDrawing {
  strokes: unknown[];
  h?: number;
}

export interface Note {
  id: number | string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  images?: NoteImage[];
  drawing?: NoteDrawing | null;
  [extra: string]: unknown;
}

/** Sous-dossier des pièces jointes, relatif au dossier de notes du vault. */
export const ATTACH_DIR = "attachments";
/** Sous-dossier des copies de sauvegarde en cas de conflit. */
export const CONFLICT_DIR = "conflicts";

const ATTACH_OPEN = "<!-- tr4de:attachments -->";
const ATTACH_CLOSE = "<!-- /tr4de:attachments -->";

const TAG_RE = /#([a-zA-Z][a-zA-Z0-9_-]*)/g;

/** Tags `#xxx` présents dans le texte, dédoublonnés et en minuscules. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text || "")) !== null) out.push(m[1].toLowerCase());
  return Array.from(new Set(out));
}

/** Première ligne non vide de la note — son titre implicite. */
export function noteTitle(content: string): string {
  const line = (content || "").split("\n").find((l) => l.trim());
  if (!line) return "";
  // Un titre markdown (`## Titre`) ou une puce ne doit pas laisser sa syntaxe
  // dans le nom de fichier.
  return line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "").trim();
}

/**
 * Nom de fichier sûr, dérivé du titre. Les caractères interdits par Windows
 * (`\ / : * ? " < > |`) comme par Obsidian sont retirés ; les accents sont
 * conservés (Obsidian les gère, et le nom reste lisible dans l'explorateur).
 */
export function slugifyTitle(content: string): string {
  const raw = noteTitle(content);
  const slug = raw
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .replace(/[ .]+$/, "");
  return slug || "Sans titre";
}

/**
 * Rend un nom de fichier unique dans le dossier (`Note.md`, `Note 2.md`, …).
 * `keep` est le nom déjà porté par la note : il n'entre pas en collision avec
 * lui-même.
 */
export function uniqueFileName(base: string, taken: Set<string>, keep?: string | null): string {
  const first = `${base}.md`;
  if (!taken.has(first) || first === keep) return first;
  for (let i = 2; i < 500; i++) {
    const candidate = `${base} ${i}.md`;
    if (!taken.has(candidate) || candidate === keep) return candidate;
  }
  return `${base} ${Date.now()}.md`;
}

/** Nom de fichier sans son extension `.md`. */
export function fileBase(name: string): string {
  return name.replace(/\.md$/i, "");
}

/**
 * Empreinte de texte (FNV-1a 32 bits, en hexa). Sert à détecter « ce fichier
 * a-t-il changé depuis la dernière synchro », ce qui est beaucoup plus fiable
 * que les dates de modification : celles-ci diffèrent entre l'API navigateur,
 * le plugin Tauri et le service de synchro d'Obsidian.
 */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ------------------------------------------------------------- front-matter

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isoOr(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return fallback;
}

/** Front-matter YAML canonique de la note (ordre des clés figé). */
function buildFrontMatter(note: Note): string {
  const now = new Date().toISOString();
  const lines = [
    "---",
    `tr4de-id: ${yamlQuote(String(note.id))}`,
    `created: ${isoOr(note.createdAt, isoOr(note.updatedAt, now))}`,
    `updated: ${isoOr(note.updatedAt, now)}`,
  ];
  if (note.pinned) lines.push("pinned: true");
  const tags = parseTags(note.content || "");
  if (tags.length > 0) {
    lines.push("tags:");
    for (const tag of tags) lines.push(`  - ${tag}`);
  }
  lines.push("---");
  return lines.join("\n");
}

export interface ParsedFrontMatter {
  id: string | null;
  created: string | null;
  updated: string | null;
  pinned: boolean;
}

/**
 * Lit le front-matter d'un fichier. Volontairement minimal : on ne connaît que
 * les clés qu'on écrit soi-même, et toute clé ajoutée par l'utilisateur dans
 * Obsidian est simplement ignorée (et donc perdue au prochain push — c'est
 * documenté dans le panneau de synchro).
 */
function parseFrontMatter(block: string): ParsedFrontMatter {
  const out: ParsedFrontMatter = { id: null, created: null, updated: null, pinned: false };
  for (const raw of block.split("\n")) {
    const m = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (key === "tr4de-id" || key === "tr4de_id") out.id = value || null;
    else if (key === "created") out.created = value || null;
    else if (key === "updated") out.updated = value || null;
    else if (key === "pinned") out.pinned = value === "true" || value === "yes";
  }
  return out;
}

// ------------------------------------------------------------ pièces jointes

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/** Décode une data URL en octets + extension de fichier. */
export function dataUrlToBytes(src: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src || "");
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = MIME_EXT[mime] || (mime.startsWith("image/") ? mime.slice(6) : "bin");
  const payload = m[3];
  try {
    if (m[2]) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, ext };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), ext };
  } catch {
    return null;
  }
}

export interface AttachmentPlanEntry {
  /** Nom du fichier, sans le dossier. */
  name: string;
  /** Chemin relatif au fichier de note, tel qu'écrit dans le markdown. */
  link: string;
  bytes?: Uint8Array;
  text?: string;
}

export interface AttachmentPlan {
  entries: AttachmentPlanEntry[];
  /**
   * Empreinte des SOURCES (images + traits de dessin). Les noms de fichiers ne
   * changent pas quand un dessin est modifié : sans cette empreinte, un schéma
   * retouché ne serait jamais réécrit dans le vault.
   */
  hash: string;
}

/**
 * Fichiers à poser dans `attachments/` pour cette note. `base` est le nom du
 * fichier de note sans extension : les pièces jointes en héritent, ce qui les
 * garde regroupées et identifiables dans le vault.
 *
 * `renderDrawing` est injecté (et non importé) pour que ce module reste sans
 * dépendance : les tests de sérialisation n'ont pas à embarquer le rendu SVG.
 */
export function attachmentPlan(
  note: Note,
  base: string,
  renderDrawing?: (drawing: NoteDrawing) => string | null
): AttachmentPlan {
  const entries: AttachmentPlanEntry[] = [];
  const images = note.images || [];
  const sig: string[] = [];

  images.forEach((img, i) => {
    const decoded = dataUrlToBytes(img.src);
    if (!decoded) return;
    const name = `${base}-${i + 1}.${decoded.ext}`;
    entries.push({ name, link: `${ATTACH_DIR}/${name}`, bytes: decoded.bytes });
    sig.push(`${img.id}:${img.src.length}`);
  });

  const strokes = note.drawing?.strokes || [];
  if (strokes.length > 0 && renderDrawing) {
    const svg = renderDrawing(note.drawing as NoteDrawing);
    if (svg) {
      const name = `${base}-schema.svg`;
      entries.push({ name, link: `${ATTACH_DIR}/${name}`, text: svg });
      sig.push(`draw:${hashText(JSON.stringify(strokes))}`);
    }
  }

  return { entries, hash: hashText(sig.join("|")) };
}

/** Encode un chemin pour un lien markdown (les espaces cassent la syntaxe). */
function encodeLink(link: string): string {
  return link.split("/").map(encodeURIComponent).join("/");
}

// --------------------------------------------------------------- écriture

/**
 * Fichier markdown complet d'une note. `links` est la liste des chemins de
 * pièces jointes (cf. `attachmentPlan`), embarqués en fin de fichier.
 */
export function noteToMarkdown(note: Note, links: string[] = []): string {
  const body = (note.content || "").replace(/\s+$/, "");
  const parts = [buildFrontMatter(note)];
  if (body) parts.push("", body);
  if (links.length > 0) {
    parts.push("", ATTACH_OPEN, ...links.map((l) => `![](${encodeLink(l)})`), ATTACH_CLOSE);
  }
  return `${parts.join("\n")}\n`;
}

// --------------------------------------------------------------- lecture

export interface ParsedNoteFile extends ParsedFrontMatter {
  /** Texte de la note, sans front-matter ni bloc de pièces jointes. */
  content: string;
}

/** Lit un fichier markdown du vault. Tolère l'absence de front-matter. */
export function parseMarkdownNote(text: string): ParsedNoteFile {
  let rest = (text || "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  let fm: ParsedFrontMatter = { id: null, created: null, updated: null, pinned: false };

  if (rest.startsWith("---\n")) {
    const end = rest.indexOf("\n---", 3);
    if (end !== -1) {
      fm = parseFrontMatter(rest.slice(4, end + 1));
      rest = rest.slice(end + 4).replace(/^[ \t]*\n/, "");
    }
  }

  // Bloc de pièces jointes : il appartient au fichier, pas au texte de la note
  // (l'app garde images et dessins dans son propre état).
  const open = rest.indexOf(ATTACH_OPEN);
  if (open !== -1) {
    const close = rest.indexOf(ATTACH_CLOSE, open);
    rest = close === -1
      ? rest.slice(0, open)
      : rest.slice(0, open) + rest.slice(close + ATTACH_CLOSE.length);
  }

  return { ...fm, content: rest.replace(/^\n+/, "").replace(/\s+$/, "") };
}

/**
 * Identifiant de note lu dans un fichier, ramené au type d'origine : les ids de
 * l'app sont des nombres (`Date.now() + Math.random()`) et la page compare en
 * `===`. Un id resté sous forme de chaîne casserait la sélection.
 */
export function normalizeNoteId(raw: string | null): number | string | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && String(n) === raw.trim() ? n : raw;
}
