/**
 * Import / export au format texte d'Anki.
 *
 * C'est le format d'échange natif d'Anki (« Notes in Plain Text ») : un fichier
 * tabulé précédé de directives `#…` qui disent quelle colonne porte quoi. Il
 * s'importe tel quel dans Anki, et Anki l'exporte tel quel.
 *
 * Ce qu'on NE fait pas : lire un `.apkg`. C'est une archive zip contenant une
 * base SQLite ; la traiter dans le navigateur demanderait d'embarquer un moteur
 * SQLite complet, pour un gain limité — le texte tabulé transporte les notes,
 * les paquets et les étiquettes, c'est-à-dire tout ce qu'on manipule ici. Ce que
 * le `.apkg` ajoute (médias, modèles de carte sur mesure, historique de
 * planification) n'a pas d'équivalent de ce côté de toute façon.
 *
 * Pour une sauvegarde SANS perte, c'est l'export JSON (`toJsonBackup`) qu'il
 * faut : il emporte l'historique et les paramètres, ce qu'aucun format texte ne
 * sait faire.
 */

import type { NoteKind, SrsStore } from "./model";
import { hasCloze } from "./cloze";

/** Noms des modèles côté Anki. L'orthographe compte : c'est la clé de
 *  correspondance à l'import comme à l'export. */
const NOTETYPE_NAMES: Record<NoteKind, string> = {
  basic: "Basic",
  reversed: "Basic (and reversed card)",
  cloze: "Cloze",
};

/** Marqueur du complément quand le modèle d'accueil n'a pas de champ pour lui.
 *  Le modèle « Basic » d'Anki n'a que recto et verso : plutôt que de perdre la
 *  précision, on la colle au verso derrière ce séparateur, et l'import la
 *  reconnaît pour la remettre à sa place. */
const EXTRA_MARK = "\n---\n";

export interface ParsedRow {
  kind: NoteKind;
  deck: string;
  front: string;
  back: string;
  extra: string;
  tags: string[];
}

/* ── Export ───────────────────────────────────────────────────────────────── */

/** Un champ qui contient le séparateur, un guillemet ou un saut de ligne doit
 *  être protégé — mêmes règles que le CSV, celles qu'Anki applique. */
function escapeField(value: string, sep: string): string {
  const v = value ?? "";
  if (v.includes(sep) || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export interface ExportOptions {
  /** Restreint l'export à ces paquets. Vide : tout. */
  deckIds?: string[];
  separator?: "\t" | ",";
}

export function toAnkiText(store: SrsStore, opts: ExportOptions = {}): string {
  const sep = opts.separator ?? "\t";
  const deckFilter = opts.deckIds && opts.deckIds.length ? new Set(opts.deckIds) : null;
  const deckName = new Map(store.decks.map(d => [d.id, d.name]));

  const lines: string[] = [
    `#separator:${sep === "\t" ? "tab" : "comma"}`,
    "#html:false",
    "#notetype column:1",
    "#deck column:2",
    "#tags column:5",
  ];

  for (const note of store.notes) {
    if (deckFilter && !deckFilter.has(note.deckId)) continue;
    // Le complément a un champ dédié dans le modèle Cloze (« Back Extra ») ;
    // ailleurs il rejoint le verso derrière le marqueur.
    const back = note.kind === "cloze"
      ? note.extra
      : note.extra
        ? `${note.back}${EXTRA_MARK}${note.extra}`
        : note.back;
    const cells = [
      NOTETYPE_NAMES[note.kind],
      deckName.get(note.deckId) || "Default",
      note.front,
      back,
      note.tags.join(" "),
    ];
    lines.push(cells.map(c => escapeField(c, sep)).join(sep));
  }

  return `${lines.join("\n")}\n`;
}

/* ── Import ───────────────────────────────────────────────────────────────── */

/** Découpe une ligne en respectant les guillemets. Un guillemet doublé à
 *  l'intérieur d'un champ protégé vaut un guillemet littéral. */
function splitRow(row: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (quoted) {
      if (ch === '"') {
        if (row[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && cur === "") {
      quoted = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Reconstitue les lignes en tenant compte des champs multi-lignes.
 *
 * Un verso peut contenir des retours à la ligne : ils sont alors à l'intérieur
 * de guillemets, et couper naïvement sur `\n` casserait la note en morceaux.
 */
function splitRecords(body: string): string[] {
  const records: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') {
      if (quoted && body[i + 1] === '"') { cur += '""'; i++; continue; }
      quoted = !quoted;
      cur += ch;
      continue;
    }
    if (ch === "\n" && !quoted) { records.push(cur); cur = ""; continue; }
    if (ch === "\r" && !quoted) continue;
    cur += ch;
  }
  if (cur.trim()) records.push(cur);
  return records;
}

export interface ImportResult {
  rows: ParsedRow[];
  /** Lignes ignorées faute de contenu exploitable, avec leur numéro. */
  skipped: { line: number; reason: string }[];
  /** Le format reconnu, à afficher avant de valider. */
  format: "anki" | "plain";
}

/**
 * Lit un texte tabulé, avec ou sans directives.
 *
 * Sans directives — le cas d'un simple copier-coller de deux colonnes — on
 * suppose `recto <TAB> verso [<TAB> étiquettes]`, ce qui couvre l'essentiel des
 * fichiers qu'on trouve. Le type de note est alors DÉDUIT : la présence d'un
 * `{{c1::…}}` fait un texte à trous, sinon c'est du recto-verso.
 */
export function fromAnkiText(text: string, defaultDeck = "Import"): ImportResult {
  const skipped: ImportResult["skipped"] = [];
  const rows: ParsedRow[] = [];
  if (!text.trim()) return { rows, skipped, format: "plain" };

  let sep = "\t";
  const directives = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  let bodyStart = 0;
  for (const line of lines) {
    if (!line.startsWith("#")) break;
    const m = line.slice(1).match(/^([^:]+):(.*)$/);
    if (m) directives.set(m[1].trim().toLowerCase(), m[2].trim());
    bodyStart++;
  }
  const format: ImportResult["format"] = directives.size > 0 ? "anki" : "plain";

  const sepDir = directives.get("separator");
  if (sepDir === "comma") sep = ",";
  else if (sepDir === "semicolon") sep = ";";
  else if (sepDir === "space") sep = " ";
  else if (sepDir && sepDir !== "tab" && sepDir.length === 1) sep = sepDir;

  // Sans directive de séparateur, on tranche sur ce qui apparaît dans le corps :
  // une tabulation ne se met pas là par hasard, une virgule si.
  const body = lines.slice(bodyStart).join("\n");
  if (!sepDir) sep = body.includes("\t") ? "\t" : (body.includes(";") ? ";" : ",");

  const col = (name: string): number | null => {
    const raw = directives.get(`${name} column`);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n - 1 : null;
  };
  const notetypeCol = col("notetype");
  const deckCol = col("deck");
  const tagsCol = col("tags");

  const records = splitRecords(body);
  records.forEach((record, idx) => {
    const lineNo = bodyStart + idx + 1;
    if (!record.trim()) return;
    const cells = splitRow(record, sep).map(c => c.trim());

    // Les colonnes de service sont retirées de la liste : ce qui reste, dans
    // l'ordre, ce sont les champs de la note.
    const service = new Set([notetypeCol, deckCol, tagsCol].filter(c => c != null) as number[]);
    const fields = cells.filter((_, i) => !service.has(i));

    const rawType = notetypeCol != null ? (cells[notetypeCol] || "") : "";
    const deck = (deckCol != null ? cells[deckCol] : "") || defaultDeck;
    const tags = ((tagsCol != null ? cells[tagsCol] : "") || "")
      .split(/[\s,]+/)
      .map(t => t.trim())
      .filter(Boolean);

    const front = fields[0] || "";
    let back = fields[1] || "";
    if (!front) { skipped.push({ line: lineNo, reason: "recto vide" }); return; }

    let kind: NoteKind;
    const lowered = rawType.toLowerCase();
    if (lowered.includes("cloze")) kind = "cloze";
    else if (lowered.includes("reversed")) kind = "reversed";
    else if (rawType) kind = "basic";
    else kind = hasCloze(front) ? "cloze" : "basic";

    // Un modèle annoncé « Cloze » sans aucun trou dans le texte ne donnerait
    // aucune carte : on le rétrograde plutôt que de créer une note morte.
    if (kind === "cloze" && !hasCloze(front)) {
      if (!back) { skipped.push({ line: lineNo, reason: "texte à trous sans trou" }); return; }
      kind = "basic";
    }
    if (kind !== "cloze" && !back) { skipped.push({ line: lineNo, reason: "verso vide" }); return; }

    let extra = kind === "cloze" ? back : "";
    if (kind !== "cloze" && back.includes(EXTRA_MARK.trim())) {
      const [first, ...rest] = back.split(/\n?---\n?/);
      back = first.trim();
      extra = rest.join("\n").trim();
    }
    if (kind === "cloze") back = "";

    rows.push({ kind, deck, front, back, extra, tags });
  });

  return { rows, skipped, format };
}

/* ── Sauvegarde intégrale ─────────────────────────────────────────────────── */

/** Le magasin entier, historique et paramètres compris. C'est ce qu'il faut
 *  pour changer d'appareil sans rien perdre. */
export function toJsonBackup(store: SrsStore): string {
  return JSON.stringify({ format: "tr4de-srs", version: 1, exportedAt: new Date().toISOString(), store }, null, 2);
}

/** Relit une sauvegarde. Renvoie `null` si ce n'est pas une des nôtres — mieux
 *  vaut refuser que d'écraser un paquet vivant avec du bruit. */
export function fromJsonBackup(text: string): SrsStore | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.format !== "tr4de-srs" || !parsed.store) return null;
    return parsed.store as SrsStore;
  } catch {
    return null;
  }
}
