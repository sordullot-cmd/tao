/**
 * Minutages de vidéo dans le texte d'une note d'étude.
 *
 * Deux jetons, écrits dans le markdown lui-même :
 *   `{1:30}`   une puce : un moment de la vidéo cité dans une phrase ;
 *   `{=1:30}`  le temps d'une LIGNE : posé en fin de ligne quand on la commence
 *              pendant la lecture, et rangé dans la marge à l'affichage.
 *
 * ── Pourquoi dans le texte ────────────────────────────────────────────────
 * Une table à part (ligne → temps) se désynchroniserait au premier paragraphe
 * inséré au-dessus : les numéros de ligne glissent, pas le texte. Un jeton
 * voyage avec sa ligne quand on la déplace, se copie avec elle, et survit à
 * l'export. Il est en FIN de ligne pour ne pas casser la syntaxe du début
 * (`## titre`, `- puce`).
 */

const CLOCK = "\\d{1,2}(?::\\d{2}){1,2}";
const STAMP_END = new RegExp(`[ \\t]*\\{=${CLOCK}\\}[ \\t]*$`);
/* Pour l'édition : retire UNE espace de séparation, pas toutes — sinon
   l'espace qu'on vient de taper en fin de ligne disparaîtrait au rendu. */
const STAMP_SPLIT = new RegExp(` ?\\{=(${CLOCK})\\}[ \\t]*$`);
const ANY = new RegExp(`\\{(=?)(${CLOCK})\\}`, "g");

/** « 1:02:03 » → 3723. */
export function clockToSeconds(clock: string): number {
  return clock.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** 83 → « 1:23 », 3723 → « 1:02:03 ». */
export function secondsToClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export const chipToken = (sec: number) => `{${secondsToClock(sec)}}`;

/** Retire les jetons — pour compter les mots ou tirer un extrait. */
export function stripStamps(text: string): string {
  return text.replace(ANY, "");
}

/**
 * Horodatage automatique : rend le texte avec la ligne du caret minutée, ou
 * `null` s'il n'y a rien à faire.
 *
 * Ne minute que la ligne qu'on COMMENCE — vide avant la frappe, non vide
 * après. Une ligne qu'on retouche plus tard garde le moment où elle a été
 * écrite ; c'est ce moment-là qui renvoie au passage de la vidéo.
 */
export function stampStartedLine(before: string, after: string, caret: number, sec: number): string | null {
  const lineStart = after.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  let lineEnd = after.indexOf("\n", caret);
  if (lineEnd === -1) lineEnd = after.length;
  const line = after.slice(lineStart, lineEnd);
  if (!line.trim() || STAMP_END.test(line)) return null;

  /* La même ligne dans le texte d'avant : même début, puisque seule la frappe
     au caret a changé ce qui précède. */
  const index = after.slice(0, lineStart).split("\n").length - 1;
  const old = before.split("\n")[index];
  if (old !== undefined && old.trim() !== "") return null;

  return `${after.slice(0, lineEnd)} {=${secondsToClock(sec)}}${after.slice(lineEnd)}`;
}

export interface Mark {
  sec: number;
  /** La ligne, jetons retirés : ce qu'on y disait à ce moment. */
  label: string;
}

/** Tous les moments cités dans la note, triés, sans doublon de seconde. */
export function marksOf(text: string): Mark[] {
  const seen = new Map<number, Mark>();
  for (const line of text.split("\n")) {
    const label = stripStamps(line).replace(/^\s*(#{1,6}\s|[-*+]\s(\[[ xX]\]\s)?|\d+\.\s|>\s?(\[![a-z]+\]\s?)?)/i, "").trim();
    for (const m of line.matchAll(ANY)) {
      const sec = clockToSeconds(m[2]);
      if (!seen.has(sec)) seen.set(sec, { sec, label });
    }
  }
  return [...seen.values()].sort((a, b) => a.sec - b.sec);
}

/* ── Édition sans jetons visibles ─────────────────────────────────────────
 * Le champ de saisie ne montre pas `{=1:30}` : il afficherait le jeton brut
 * en fin de ligne alors que l'aperçu le range dans la marge. L'éditeur
 * travaille donc sur le texte nu plus un temps par ligne, et recompose le
 * markdown à chaque frappe. */

export interface SplitStamps {
  text: string;
  /** Un temps (secondes) par ligne de `text`, ou null. */
  stamps: (number | null)[];
}

export function splitStamps(content: string): SplitStamps {
  const stamps: (number | null)[] = [];
  const lines = content.split("\n").map(line => {
    const m = line.match(STAMP_SPLIT);
    if (!m) { stamps.push(null); return line; }
    stamps.push(clockToSeconds(m[1]));
    return line.slice(0, line.length - m[0].length);
  });
  return { text: lines.join("\n"), stamps };
}

/** L'inverse : une ligne vide perd son temps, elle n'a plus rien à minuter. */
export function joinStamps(text: string, stamps: (number | null)[]): string {
  return text.split("\n")
    .map((line, i) => (stamps[i] != null && line.trim() ? `${line} {=${secondsToClock(stamps[i] as number)}}` : line))
    .join("\n");
}

/**
 * Reporte les temps de l'ancien texte sur le nouveau. Les lignes intactes
 * en tête et en queue gardent le leur ; dans la zone modifiée, une ligne
 * retrouvée telle quelle reprend le sien, et à nombre de lignes égal (on
 * a tapé DANS une ligne) chacune garde celui de sa position. Une ligne
 * coupée en deux laisse le temps à sa première moitié — c'est là qu'elle
 * avait été commencée.
 */
export function carryStamps(oldText: string, oldStamps: (number | null)[], newText: string): (number | null)[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;

  const out: (number | null)[] = new Array(b.length).fill(null);
  for (let i = 0; i < p; i++) out[i] = oldStamps[i] ?? null;
  for (let k = 1; k <= s; k++) out[b.length - k] = oldStamps[a.length - k] ?? null;

  const oldMid = a.slice(p, a.length - s);
  const newMid = b.length - s - p;
  if (oldMid.length === newMid) {
    for (let k = 0; k < newMid; k++) out[p + k] = oldStamps[p + k] ?? null;
    return out;
  }
  const used = new Set<number>();
  for (let k = 0; k < newMid; k++) {
    const j = oldMid.findIndex((l, idx) => !used.has(idx) && l === b[p + k] && l.trim() !== "");
    if (j !== -1) { used.add(j); out[p + k] = oldStamps[p + j] ?? null; }
  }
  if (newMid > 0 && oldMid.length > 0 && out[p] == null && !used.has(0)) out[p] = oldStamps[p] ?? null;
  return out;
}

/**
 * La ligne `index` appartient-elle à un bloc déjà minuté ? Un bloc = les
 * lignes non vides contiguës, bornées par une ligne vide.
 *
 * C'est ce qui groupe les temps : un seul Entrée continue la pensée en cours
 * et reste sous son temps ; deux Entrée (une ligne vide) ouvrent un bloc neuf,
 * qui prendra le sien. Minuter chaque ligne alignait dans la marge une
 * colonne de secondes qui se suivaient sans rien dire de plus. Un bloc écrit
 * vidéo en pause reste sans temps : la première ligne qu'on y ajoute en
 * lecture le minute.
 */
export function blockHasStamp(text: string, stamps: (number | null)[], index: number): boolean {
  const lines = text.split("\n");
  for (let i = index; i >= 0 && lines[i]?.trim(); i--) if (stamps[i] != null && i !== index) return true;
  for (let i = index + 1; i < lines.length && lines[i].trim(); i++) if (stamps[i] != null) return true;
  return false;
}

/** La ligne du caret, si la frappe vient de la COMMENCER (vide → non vide). */
export function startedLineIndex(before: string, after: string, caret: number): number | null {
  const lineStart = after.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  let lineEnd = after.indexOf("\n", caret);
  if (lineEnd === -1) lineEnd = after.length;
  if (!after.slice(lineStart, lineEnd).trim()) return null;
  const index = after.slice(0, lineStart).split("\n").length - 1;
  const old = before.split("\n")[index];
  if (old !== undefined && old.trim() !== "") return null;
  return index;
}
