/**
 * Texte à trous, syntaxe Anki : `{{c1::la réponse}}` ou `{{c1::la réponse::indice}}`.
 *
 * Un même texte porte autant de cartes que de numéros DISTINCTS employés : c1,
 * c2, c3… Sur la carte c2, seul le trou n° 2 est masqué ; les autres restent
 * lisibles et servent de contexte. C'est ce qui permet de découper une phrase
 * dense en plusieurs rappels sans la recopier trois fois.
 *
 * Le même numéro peut revenir plusieurs fois dans un texte — deux occurrences
 * du même terme se masquent alors ensemble, sur une seule carte.
 */

/** Un trou repéré dans le texte, avec ses bornes pour pouvoir le remplacer. */
export interface ClozeSpan {
  n: number;
  answer: string;
  hint: string | null;
  start: number;
  end: number;
}

/* `[\s\S]` et non `.` : un trou peut enjamber un retour à la ligne (une formule
   recopiée, une définition sur deux lignes). Quantificateurs paresseux pour ne
   pas avaler jusqu'au dernier `}}` du texte. */
const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export function parseClozes(text: string): ClozeSpan[] {
  const out: ClozeSpan[] = [];
  if (!text) return out;
  CLOZE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLOZE_RE.exec(text)) !== null) {
    out.push({
      n: parseInt(m[1], 10),
      answer: m[2],
      hint: m[3] != null && m[3] !== "" ? m[3] : null,
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/** Les numéros employés, triés et dédoublonnés — un par carte à engendrer. */
export function clozeNumbers(text: string): number[] {
  return [...new Set(parseClozes(text).map(c => c.n))].sort((a, b) => a - b);
}

export function hasCloze(text: string): boolean {
  CLOZE_RE.lastIndex = 0;
  return CLOZE_RE.test(text || "");
}

/**
 * Rend le texte pour la carte n° `n`.
 *
 * `revealed = false` (la question) : le trou visé devient `[...]`, ou `[indice]`
 * s'il en porte un. `revealed = true` (la réponse) : il reprend sa valeur, mise
 * en évidence par les crochets — c'est le seul repère visuel dont on dispose
 * sans balisage riche, et il faut bien pouvoir situer ce qu'on cherchait.
 *
 * Dans les deux cas, les trous des AUTRES cartes sont simplement dépliés : ils
 * appartiennent au contexte, pas à la question.
 */
export function renderCloze(text: string, n: number, revealed: boolean): string {
  const spans = parseClozes(text);
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const s of spans) {
    out += text.slice(cursor, s.start);
    if (s.n === n) {
      out += revealed ? `[${s.answer}]` : (s.hint ? `[${s.hint}]` : "[…]");
    } else {
      out += s.answer;
    }
    cursor = s.end;
  }
  return out + text.slice(cursor);
}

/** Le texte débarrassé de son balisage — pour un aperçu en liste ou une recherche. */
export function stripCloze(text: string): string {
  return parseClozes(text).length === 0
    ? text
    : text.replace(CLOZE_RE, (_m, _n, answer) => answer);
}

/**
 * Enveloppe une sélection dans un nouveau trou.
 *
 * Le numéro proposé est le suivant disponible : sélectionner successivement
 * trois termes d'une phrase donne c1, c2, c3 sans avoir à les compter. Renvoie
 * le texte inchangé si la sélection est vide.
 */
export function wrapCloze(text: string, start: number, end: number, n?: number): string {
  if (start >= end) return text;
  const nums = clozeNumbers(text);
  const num = n ?? (nums.length ? Math.max(...nums) + 1 : 1);
  return `${text.slice(0, start)}{{c${num}::${text.slice(start, end)}}}${text.slice(end)}`;
}
