/**
 * Recherche du catalogue de blocage — le classement, pas le filtrage.
 *
 * Le champ filtrait avec un `includes` : « disc » sortait Discord et Dailymotion
 * dans l'ordre du fichier, c'est-à-dire dans l'ordre des catégories. Trois
 * lettres tapées ne rapprochaient donc pas de la bonne entrée, elles réduisaient
 * juste un mur à un mur plus petit — et il fallait encore le lire.
 *
 * Ici les résultats sont ORDONNÉS par vraisemblance, comme la recherche
 * d'applications d'un système : ce qui commence par ce qu'on tape passe devant
 * ce qui le contient, un nom passe devant un domaine, et l'entrée la plus
 * probable est en tête, prête à être validée à l'aveugle par Entrée.
 *
 * Le tri est volontairement lisible plutôt que malin : des paliers entiers
 * (égalité, préfixe, début de mot, sous-chaîne, lettres dans l'ordre) qu'on peut
 * justifier devant l'écran. Un score continu façon distance d'édition classerait
 * mieux les fautes de frappe, mais on ne saurait plus expliquer pourquoi Netflix
 * est passé devant Discord — et un classement inexplicable, sur un écran où l'on
 * valide sans lire, se paie en mauvaises coches.
 */

import { CATALOG, type CatalogEntry } from "./model";

/** Intervalle `[début, fin[` d'une portion à mettre en évidence. */
export type Range = [number, number];

/** Quelle information a fait correspondre l'entrée — ce qu'on montre en dessous. */
export type HitField = "name" | "domain" | "app";

export interface SearchHit {
  entry: CatalogEntry;
  score: number;
  /** Portions du nom à surligner. Vide si la correspondance vient d'ailleurs. */
  nameRanges: Range[];
  field: HitField;
  /** Texte de la ligne secondaire : le domaine ou l'appli qui a répondu. */
  sub: string;
  subRanges: Range[];
}

/**
 * Minuscules sans accents, SANS changer la longueur : les indices calculés sur
 * la forme normalisée servent à surligner la chaîne d'origine. Décomposer puis
 * retirer les diacritiques conserve un caractère par caractère d'origine, ce qui
 * suffit ici (aucune ligature dans le catalogue).
 */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Frontière de mot : ce qui suit compte comme un début. « X (Twitter) » doit
 *  répondre à « twitter », « Epic Games » à « games ». */
function isBoundary(c: string): boolean {
  return c === " " || c === "(" || c === "-" || c === "." || c === "+" || c === "_" || c === "/";
}

/** Indices de tous les débuts de mot d'une chaîne repliée. */
function wordStarts(h: string): number[] {
  const out = [0];
  for (let i = 1; i < h.length; i++) if (isBoundary(h[i - 1])) out.push(i);
  return out;
}

/**
 * Lettres de `q` retrouvées dans l'ordre dans `h`, pas forcément collées.
 * C'est ce qui fait répondre « ytb » à YouTube ou « pkst » à PokerStars.
 * Renvoie les positions, ou `null` si une lettre manque.
 */
function subsequence(h: string, q: string): number[] | null {
  const pos: number[] = [];
  let i = 0;
  for (const c of q) {
    const at = h.indexOf(c, i);
    if (at < 0) return null;
    pos.push(at);
    i = at + 1;
  }
  return pos;
}

/** Positions contiguës regroupées en intervalles, pour ne pas surligner lettre à lettre. */
function toRanges(pos: number[]): Range[] {
  const out: Range[] = [];
  for (const p of pos) {
    const last = out[out.length - 1];
    if (last && last[1] === p) last[1] = p + 1;
    else out.push([p, p + 1]);
  }
  return out;
}

/**
 * Score d'un champ face à la requête, ou `null` s'il ne répond pas.
 *
 * Les paliers sont espacés de 100 : aucun bonus de position ne peut faire
 * remonter une sous-chaîne au-dessus d'un préfixe. C'est la propriété qui rend
 * le classement racontable.
 */
export function scoreField(hay: string, query: string): { score: number; ranges: Range[] } | null {
  const h = fold(hay);
  const q = fold(query);
  if (!q) return null;

  if (h === q) return { score: 1000, ranges: [[0, q.length]] };
  if (h.startsWith(q)) return { score: 900, ranges: [[0, q.length]] };

  for (const w of wordStarts(h)) {
    if (w > 0 && h.startsWith(q, w)) return { score: 700 - Math.min(w, 40), ranges: [[w, w + q.length]] };
  }

  const at = h.indexOf(q);
  if (at >= 0) return { score: 500 - Math.min(at, 40), ranges: [[at, at + q.length]] };

  const pos = subsequence(h, q);
  if (!pos) return null;
  /* Deux bonus, tous deux plafonnés sous le palier suivant : les lettres collées
     valent mieux que dispersées, et une frappe qui suit les initiales des mots
     (« eg » → Epic Games) vaut mieux qu'un ramassage au hasard. */
  const starts = new Set(wordStarts(h));
  let bonus = 0;
  for (let i = 0; i < pos.length; i++) {
    if (i > 0 && pos[i] === pos[i - 1] + 1) bonus += 3;
    if (starts.has(pos[i])) bonus += 4;
  }
  const spread = pos[pos.length - 1] - pos[0] - (q.length - 1);
  return { score: 200 + Math.min(bonus, 60) - Math.min(spread, 40), ranges: toRanges(pos) };
}

/* Un nom passe devant un domaine, qui passe devant un nom d'exécutable : on tape
   ce qu'on lit sur l'écran d'accueil, pas ce que rapporte le système. */
const WEIGHT: Record<HitField, number> = { name: 1, domain: 0.9, app: 0.86 };

/** Meilleure correspondance d'une entrée, tous champs confondus. */
export function scoreEntry(entry: CatalogEntry, query: string): SearchHit | null {
  let best: SearchHit | null = null;
  const consider = (field: HitField, text: string) => {
    const m = scoreField(text, query);
    if (!m) return;
    const score = m.score * WEIGHT[field];
    if (best && score <= best.score) return;
    best = {
      entry,
      score,
      field,
      nameRanges: field === "name" ? m.ranges : [],
      sub: field === "name" ? (entry.domains[0] || entry.apps?.[0] || "") : text,
      subRanges: field === "name" ? [] : m.ranges,
    };
  };
  consider("name", entry.name);
  for (const d of entry.domains) consider("domain", d);
  for (const a of entry.apps || []) consider("app", a);
  return best;
}

/**
 * Catalogue trié par vraisemblance. `limit` borne ce qui s'affiche : au-delà
 * d'une dizaine de lignes la liste redevient un mur, et les entrées du bas ne
 * sont de toute façon plus celles qu'on cherchait.
 */
export function searchCatalog(query: string, limit = 8): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const e of CATALOG) {
    const h = scoreEntry(e, q);
    if (h) hits.push(h);
  }
  /* À score égal, le nom le plus court gagne : « Steam » avant « steamwebhelper ».
     Puis l'alphabet, pour qu'une même frappe donne toujours le même ordre. */
  hits.sort((a, b) =>
    b.score - a.score ||
    a.entry.name.length - b.entry.name.length ||
    a.entry.name.localeCompare(b.entry.name)
  );
  return hits.slice(0, limit);
}

/** Découpe un texte en segments surlignés ou non, prêts à rendre. */
export function highlight(text: string, ranges: Range[]): { text: string; hit: boolean }[] {
  if (!ranges.length) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  for (const [s, e] of ranges) {
    if (s > i) out.push({ text: text.slice(i, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    i = e;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out;
}

/* ── Classement d'une liste quelconque ────────────────────────────────────── */

export interface RankedHit<T> {
  item: T;
  score: number;
  ranges: Range[];
}

/**
 * Même classement, appliqué à autre chose que le catalogue — les applications
 * réellement installées sur le poste, dont la liste n'est connue qu'au moment
 * où on la demande au système.
 *
 * `demote` abaisse une entrée sans la sortir : les applications du système sont
 * proposées (on peut vouloir couper Mail) mais ne doivent jamais passer devant
 * ce qu'on a soi-même installé, sous peine de voir « Musique » remonter avant
 * « Discord » sur deux lettres communes.
 */
export function rankBy<T>(
  items: T[],
  query: string,
  name: (t: T) => string,
  limit = 6,
  demote: (t: T) => boolean = () => false,
): RankedHit<T>[] {
  const q = query.trim();
  if (!q) return [];
  const hits: RankedHit<T>[] = [];
  for (const item of items) {
    const m = scoreField(name(item), q);
    if (m) hits.push({ item, score: m.score * (demote(item) ? 0.55 : 1), ranges: m.ranges });
  }
  hits.sort((a, b) =>
    b.score - a.score ||
    name(a.item).length - name(b.item).length ||
    name(a.item).localeCompare(name(b.item))
  );
  return hits.slice(0, limit);
}
