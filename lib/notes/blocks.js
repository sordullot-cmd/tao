/**
 * Blocs de texte des notes : catalogue du menu « / », et manipulation des
 * lignes qui va avec (continuation de liste, indentation, cases à cocher).
 *
 * Le markdown reste la seule source de vérité — c'est lui que voit l'éditeur,
 * que rend l'aperçu et que reçoit le vault Obsidian. Ce module n'ajoute donc
 * aucun format propriétaire : chaque bloc s'écrit dans une syntaxe qu'Obsidian
 * comprend telle quelle (`- [ ]` pour les tâches, `> [!info]` pour les
 * encadrés, `> [!note]-` pour les blocs repliables, `[[…]]` pour les liens).
 *
 * Tout est en fonctions pures prenant `(text, caret)` et rendant le texte
 * suivant + la position du caret : la page n'a qu'à appliquer le résultat.
 */

/* ─────────────────────────────────────────────── reconnaissance de ligne */

/** Puce, éventuellement suivie d'une case à cocher. */
const BULLET_RE = /^([ \t]*)([-*+])[ \t]+(\[([ xX])\][ \t]+)?(.*)$/;
/** Item numéroté : `1. ` ou `1) `. */
const ORDERED_RE = /^([ \t]*)(\d{1,3})([.)])[ \t]+(\[([ xX])\][ \t]+)?(.*)$/;
/** Citation, encadré et bloc repliable partagent le même chevron. */
const QUOTE_RE = /^([ \t]*)>[ \t]?(.*)$/;

/** Un niveau d'indentation de liste = 2 espaces (comme Obsidian). */
export const LIST_INDENT = "  ";

/**
 * Décrit la ligne qui contient `pos`.
 * @returns {{start:number,end:number,text:string,kind:string,indent:string,
 *   marker:string,body:string,checked:(boolean|null),number:number}}
 */
export function lineAt(text, pos) {
  const start = text.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
  let end = text.indexOf("\n", pos);
  if (end === -1) end = text.length;
  const line = text.slice(start, end);

  const b = line.match(BULLET_RE);
  if (b) {
    return {
      start, end, text: line, kind: "bullet",
      indent: b[1], marker: b[2], body: b[5],
      checked: b[3] ? /[xX]/.test(b[4]) : null,
      number: 0,
    };
  }
  const o = line.match(ORDERED_RE);
  if (o) {
    return {
      start, end, text: line, kind: "ordered",
      indent: o[1], marker: o[3], body: o[6],
      checked: o[4] ? /[xX]/.test(o[5]) : null,
      number: parseInt(o[2], 10),
    };
  }
  const q = line.match(QUOTE_RE);
  if (q) {
    return {
      start, end, text: line, kind: "quote",
      indent: q[1], marker: ">", body: q[2], checked: null, number: 0,
    };
  }
  return {
    start, end, text: line, kind: "plain",
    indent: (line.match(/^[ \t]*/) || [""])[0],
    marker: "", body: line.trim(), checked: null, number: 0,
  };
}

/** Reconstruit le préfixe d'une ligne de liste (sans son contenu). */
function prefixOf(info, opts) {
  const number = opts && opts.number != null ? opts.number : info.number;
  const box = info.checked === null ? "" : info.checked ? "[x] " : "[ ] ";
  if (info.kind === "bullet") return `${info.indent}${info.marker} ${box}`;
  if (info.kind === "ordered") return `${info.indent}${number}${info.marker} ${box}`;
  if (info.kind === "quote") return `${info.indent}> `;
  return info.indent;
}

/* ───────────────────────────────────────────────────── cases à cocher */

/** Coche / décoche la ligne qui contient `pos`. `null` si ce n'est pas une liste. */
export function toggleTaskAt(text, pos) {
  const info = lineAt(text, pos);
  if (info.kind !== "bullet" && info.kind !== "ordered") return null;

  // Une puce ordinaire devient une tâche : c'est le geste attendu quand on
  // demande « cocher » sur une ligne qui n'a pas encore de case.
  const next = info.checked === null ? false : !info.checked;
  const line = prefixOf({ ...info, checked: next }) + info.body;
  const delta = line.length - info.text.length;
  return {
    text: text.slice(0, info.start) + line + text.slice(info.end),
    caret: Math.max(info.start, pos + delta),
  };
}

/**
 * Coche / décoche la case de la ligne `index` (aperçu : clic sur la case).
 * On vise la ligne plutôt que le n-ième item : le rendu et le markdown ne
 * comptent pas forcément les mêmes tâches (celles des encadrés, par exemple).
 */
export function toggleTaskLine(text, index) {
  const lines = String(text || "").split("\n");
  const line = lines[index];
  if (line == null) return text;
  const b = line.match(BULLET_RE);
  const o = b ? null : line.match(ORDERED_RE);
  if (!(b ? b[3] : o && o[4])) return text; // ni tâche, ni même une liste
  lines[index] = line.replace(/\[([ xX])\]/, (_m, c) => (/[xX]/.test(c) ? "[ ]" : "[x]"));
  return lines.join("\n");
}

/**
 * Vrai si `pos` tombe sur la case à cocher de sa ligne — ce qui permet de la
 * cocher au clic depuis l'éditeur, sans passer par l'aperçu.
 */
export function isOnCheckbox(text, pos) {
  const info = lineAt(text, pos);
  if (info.checked === null) return false;
  const m = info.text.match(/\[[ xX]\]/);
  if (!m) return false;
  const rel = pos - info.start;
  return rel >= m.index && rel <= m.index + 3;
}

/**
 * Lien `[[…]]` sous la position `pos`, ou `null`.
 * Seul le libellé compte, pas les crochets : les cliquer laisse donc encore
 * poser le caret dans le lien pour le corriger.
 */
export function wikiLinkAt(text, pos) {
  const info = lineAt(text, pos);
  const rel = pos - info.start;
  const re = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;
  let m;
  while ((m = re.exec(info.text)) !== null) {
    const from = m.index + 2;
    const to = m.index + m[0].length - 2;
    if (rel >= from && rel <= to) {
      return { target: m[1].trim(), start: info.start + m.index, end: info.start + m.index + m[0].length };
    }
  }
  return null;
}

/* ─────────────────────────────────────────────── Entrée dans une liste */

/**
 * Entrée sur une ligne de liste : ouvre l'item suivant, ou sort de la liste si
 * l'item courant est vide. Rend `null` quand la touche doit garder son effet
 * normal (hors liste, ou sélection non vide).
 */
export function continueList(text, start, end) {
  if (start !== end) return null;
  const info = lineAt(text, start);
  if (info.kind === "plain") return null;
  // Ne rien faire si le caret est encore dans le préfixe (« - |Truc »).
  if (start < info.start + prefixOf(info).length) return null;

  const body = info.body.trim();

  // Item vide : Entrée sort de la liste (dépile un niveau, sinon vide la ligne).
  if (!body) {
    if (info.indent.length >= LIST_INDENT.length) {
      const line = prefixOf({ ...info, indent: info.indent.slice(LIST_INDENT.length) });
      return {
        text: renumber(text.slice(0, info.start) + line + text.slice(info.end)),
        caret: info.start + line.length,
      };
    }
    return {
      text: text.slice(0, info.start) + text.slice(info.end),
      caret: info.start,
    };
  }

  // Une tâche cochée n'engendre pas une tâche cochée : on repart d'une case vide.
  const prefix = prefixOf(
    { ...info, checked: info.checked === null ? null : false },
    { number: info.number + 1 },
  );
  const insertion = "\n" + prefix;
  const next = text.slice(0, start) + insertion + text.slice(start);
  return { text: renumber(next), caret: start + insertion.length };
}

/* ───────────────────────────────────────────────────────── indentation */

/** Tab / Shift+Tab sur des lignes de liste. `null` hors liste. */
export function indentLines(text, start, end, outdent) {
  const first = lineAt(text, start);
  const last = lineAt(text, end);
  if (first.kind === "plain" && last.kind === "plain") return null;

  const block = text.slice(first.start, last.end);
  let shift = 0; // décalage appliqué à la première ligne
  const lines = block.split("\n").map((line, i) => {
    if (!line.trim()) return line;
    if (outdent) {
      const cut = line.startsWith(LIST_INDENT) ? LIST_INDENT.length
        : /^[ \t]/.test(line) ? 1 : 0;
      if (i === 0) shift = -cut;
      return line.slice(cut);
    }
    if (i === 0) shift = LIST_INDENT.length;
    return LIST_INDENT + line;
  });

  const next = text.slice(0, first.start) + renumber(lines.join("\n")) + text.slice(last.end);
  return {
    text: next,
    caret: Math.max(first.start, start + shift),
    selectionEnd: Math.max(first.start, end + shift),
  };
}

/* ─────────────────────────────────────────────────────── renumérotation */

/**
 * Renumérote les listes ordonnées : chaque niveau suit sa propre indentation.
 * Sans ça, insérer un item au milieu laisserait « 1. 2. 2. 3. ».
 */
export function renumber(text) {
  const lines = String(text || "").split("\n");
  let counters = new Map();
  let prevWidth = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const b = line.match(BULLET_RE);
    const o = b ? null : line.match(ORDERED_RE);

    if (!o && !b) {
      // Une ligne vide referme les listes en cours ; les autres blocs aussi.
      counters = new Map();
      prevWidth = -1;
      continue;
    }
    const width = (o ? o[1] : b[1]).replace(/\t/g, "  ").length;
    // On remonte d'un sous-niveau : ses compteurs ne valent plus rien.
    if (width < prevWidth) {
      for (const key of Array.from(counters.keys())) if (key > width) counters.delete(key);
    }
    prevWidth = width;
    if (!o) { counters.delete(width); continue; }

    const n = (counters.get(width) || 0) + 1;
    counters.set(width, n);
    lines[i] = `${o[1]}${n}${o[3]} ${o[4] || ""}${o[6]}`;
  }
  return lines.join("\n");
}

/* ────────────────────────────────────────────────── catalogue du menu « / » */

const TABLE_SNIPPET = [
  "| Colonne | Colonne |",
  "| --- | --- |",
  "|  |  |",
].join("\n");

/**
 * Chaque bloc décrit comment il s'écrit :
 * - `prefix` : remplace le préfixe de la ligne courante (titres, listes…) ;
 * - `snippet` : insère un bloc sur plusieurs lignes, `caretBack` disant de
 *   combien de caractères remonter depuis la fin pour poser le caret ;
 * - `action` : la page s'en charge (ouvrir le sélecteur d'image, par exemple).
 *
 * `keywords` sert au filtre : les mots tapés après « / » sont cherchés là et
 * dans le libellé, sans accents ni casse. « /liste tache » trouve donc bien
 * « Liste de tâches ».
 */
export const SLASH_BLOCKS = [
  {
    id: "text", label: "Texte", icon: "text", hint: "Paragraphe simple",
    keywords: ["texte", "paragraphe", "normal", "vider", "corps"],
    prefix: "",
  },
  {
    id: "h1", label: "Titre 1", icon: "h1", hint: "#",
    keywords: ["titre", "grand", "h1", "heading", "section"],
    prefix: "# ",
  },
  {
    id: "h2", label: "Titre 2", icon: "h2", hint: "##",
    keywords: ["titre", "moyen", "h2", "heading", "sous titre"],
    prefix: "## ",
  },
  {
    id: "h3", label: "Titre 3", icon: "h3", hint: "###",
    keywords: ["titre", "petit", "h3", "heading", "sous titre"],
    prefix: "### ",
  },
  {
    id: "todo", label: "Liste de tâches", icon: "check", hint: "- [ ]",
    keywords: ["tache", "taches", "case a cocher", "cocher", "checkbox", "todo",
      "checklist", "a faire", "case"],
    prefix: "- [ ] ",
  },
  {
    id: "bullet", label: "Liste à puces", icon: "bullet", hint: "-",
    keywords: ["liste", "puce", "puces", "point", "points", "bullet", "tiret"],
    prefix: "- ",
  },
  {
    id: "ordered", label: "Liste numérotée", icon: "ordered", hint: "1.",
    keywords: ["liste", "numero", "numerotee", "chiffre", "chiffres", "nombre",
      "ordonnee", "etapes", "ordered"],
    prefix: "1. ",
  },
  {
    id: "quote", label: "Citation", icon: "quote", hint: ">",
    keywords: ["citation", "citer", "quote", "verbatim"],
    prefix: "> ",
  },
  {
    id: "link", label: "Lien vers une note", icon: "link", hint: "[[…]]",
    keywords: ["lien", "note", "wikilink", "reference", "relier", "obsidian",
      "page", "vers"],
    snippet: "[[]]", caretBack: 2,
  },
  {
    id: "divider", label: "Séparateur", icon: "divider", hint: "---",
    keywords: ["separateur", "trait", "ligne", "division", "hr", "barre"],
    snippet: "---\n", caretBack: 0, standalone: true,
  },
  {
    id: "code", label: "Bloc de code", icon: "code", hint: "```",
    keywords: ["code", "extrait", "snippet", "programme", "console"],
    snippet: "```\n\n```", caretBack: 4, standalone: true,
  },
  {
    id: "table", label: "Tableau", icon: "table", hint: "| … |",
    keywords: ["tableau", "table", "colonnes", "lignes", "grille"],
    snippet: TABLE_SNIPPET, caretBack: 5, standalone: true,
  },
  {
    id: "math", label: "Formule", icon: "math", hint: "$$…$$",
    keywords: ["formule", "math", "maths", "equation", "latex", "katex", "calcul"],
    snippet: "$$\n\n$$", caretBack: 3, standalone: true,
  },
  {
    id: "toggle", label: "Bloc repliable", icon: "toggle", hint: "> [!note]-",
    keywords: ["repliable", "replier", "pliable", "toggle", "accordeon",
      "deroulant", "masquer", "details"],
    snippet: "> [!note]- Titre\n> Contenu masqué", caretBack: 17, standalone: true,
  },
  {
    id: "callout-info", label: "Encadré info", icon: "info", hint: "> [!info]",
    keywords: ["encadre", "callout", "info", "information", "remarque", "bloc",
      "note", "bleu"],
    snippet: "> [!info] Titre\n> Contenu", caretBack: 10, standalone: true,
  },
  {
    id: "callout-tip", label: "Encadré astuce", icon: "tip", hint: "> [!tip]",
    keywords: ["encadre", "callout", "astuce", "conseil", "tip", "idee", "vert"],
    snippet: "> [!tip] Titre\n> Contenu", caretBack: 10, standalone: true,
  },
  {
    id: "callout-warning", label: "Encadré attention", icon: "warning", hint: "> [!warning]",
    keywords: ["encadre", "callout", "attention", "avertissement", "warning",
      "prudence", "orange"],
    snippet: "> [!warning] Titre\n> Contenu", caretBack: 10, standalone: true,
  },
  {
    id: "callout-danger", label: "Encadré danger", icon: "danger", hint: "> [!danger]",
    keywords: ["encadre", "callout", "danger", "erreur", "interdit", "risque",
      "rouge", "important"],
    snippet: "> [!danger] Titre\n> Contenu", caretBack: 10, standalone: true,
  },
  {
    id: "image", label: "Image", icon: "image", hint: "Depuis un fichier",
    keywords: ["image", "photo", "illustration", "capture", "png", "jpg", "coller"],
    action: "image",
  },
];

/** Minuscules sans accents : « tâche » et « tache » doivent se valoir. */
function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Filtre le catalogue avec ce qui est tapé après « / ».
 * Tous les mots de la requête doivent se retrouver dans le libellé ou les
 * mots-clés ; les correspondances en début de libellé remontent en tête.
 */
export function matchSlashBlocks(query, limit = 7) {
  const q = fold(query).trim();
  if (!q) return SLASH_BLOCKS.slice(0, limit);
  const words = q.split(/\s+/).filter(Boolean);

  const scored = [];
  for (const block of SLASH_BLOCKS) {
    const label = fold(block.label);
    const hay = `${label} ${block.keywords.map(fold).join(" ")}`;
    if (!words.every(w => hay.includes(w))) continue;

    let score = 0;
    if (label.startsWith(q)) score += 100;
    else if (label.includes(q)) score += 50;
    if (block.keywords.some(k => fold(k).startsWith(q))) score += 30;
    // Un libellé court qui matche est plus probablement celui qu'on vise.
    score -= label.length / 100;
    scored.push({ block, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.block);
}

/**
 * Repère un « / » ouvert avant le caret. Il doit être en début de ligne ou
 * précédé d'une espace, et ce qui suit ne doit pas ressembler à une phrase :
 * on tolère les espaces (« /liste tache ») mais on abandonne au-delà de trois
 * mots, sinon le menu resterait ouvert pendant toute la frappe.
 */
export function detectSlashAtCursor(text, caret) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const before = text.slice(lineStart, caret);
  const at = before.lastIndexOf("/");
  if (at === -1) return null;
  const prev = at === 0 ? "\n" : before[at - 1];
  if (prev !== " " && prev !== "\n" && prev !== "\t") return null;
  const query = before.slice(at + 1);
  if (/[/\\]/.test(query)) return null;           // une URL, pas une commande
  if (query.split(/\s+/).filter(Boolean).length > 3) return null;
  if (query.length > 24) return null;
  return { query, start: lineStart + at };
}

/**
 * Applique un bloc : retire le « /… » puis écrit le bloc au bon endroit.
 * @returns {{text:string, caret:number, action?:string}}
 */
export function applySlashBlock(text, block, det, caret) {
  const before = text.slice(0, det.start);
  const after = text.slice(caret);

  if (block.action) return { text: before + after, caret: det.start, action: block.action };

  const info = lineAt(before + after, det.start);
  const linePrefixEnd = Math.min(det.start, info.start + prefixOf(info).length);

  if (block.prefix != null) {
    // On remplace le préfixe de la ligne : « - truc » devient « ## truc ».
    const head = text.slice(info.start, linePrefixEnd);
    const rest = before.slice(info.start + head.length);
    const line = block.prefix + rest;
    const next = text.slice(0, info.start) + line + after;
    return { text: renumber(next), caret: info.start + line.length };
  }

  // Bloc autonome : il lui faut sa propre ligne, et une ligne vide au-dessus
  // s'il suit du texte (sinon le rendu le collerait au paragraphe précédent).
  const lead = block.standalone && text.slice(info.start, det.start).trim() ? "\n\n" : "";
  const insertion = lead + block.snippet;
  const next = before + insertion + after;
  return { text: next, caret: before.length + insertion.length - (block.caretBack || 0) };
}

/* ─────────────────────────────────────────── liens entre notes [[…]] */

/**
 * Repère un `[[` ouvert avant le caret, pour proposer les titres de notes.
 * On s'arrête au `]]` fermant : une fois le lien complet, plus de suggestion.
 */
export function detectWikiLinkAtCursor(text, caret) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const before = text.slice(lineStart, caret);
  const at = before.lastIndexOf("[[");
  if (at === -1) return null;
  const query = before.slice(at + 2);
  if (query.includes("]")) return null;
  if (query.length > 80) return null;
  return { query, start: lineStart + at };
}

/** Écrit `[[Titre]]` à la place du `[[…` en cours. */
export function applyWikiLink(text, title, det, caret) {
  const insertion = `[[${title}]]`;
  const next = text.slice(0, det.start) + insertion + text.slice(caret);
  return { text: next, caret: det.start + insertion.length };
}
