/**
 * Modèle de données des révisions — paquets, notes, cartes.
 *
 * La distinction NOTE / CARTE est celle d'Anki, et elle n'est pas cosmétique :
 * on saisit une note (un fait, avec ses champs), et le TYPE de la note décide
 * combien de cartes en découlent. « Recto/verso » en engendre deux, un texte à
 * trous autant que de trous numérotés. Corriger une faute de frappe se fait
 * donc une fois, sur la note, et les deux cartes en profitent — chacune gardant
 * son propre historique de planification.
 *
 * Tout est sérialisable en JSON : le magasin entier part dans `useCloudState`,
 * donc dans la table générique `user_productivity`. Aucune migration SQL.
 */

import {
  DAY_MS, newSchedulingState, normalizeConfig, type Rating, type SchedulingState,
  type SrsConfig,
} from "./fsrs";
import { clozeNumbers, renderCloze, stripCloze } from "./cloze";

/** Type de note. Le nom des trois est celui d'Anki, l'import/export en dépend. */
export type NoteKind = "basic" | "reversed" | "cloze";

/** D'où vient la note. Sert à afficher la provenance et à retrouver la source :
 *  une carte tirée d'un livre renvoie à sa fiche de lecture. */
export interface CardSource {
  type: "manual" | "note" | "book" | "workshop" | "ai";
  /** Identifiant de la note ou du livre d'origine, quand il y en a un. */
  id?: string | number;
  label?: string;
}

export interface SrsDeck {
  id: string;
  name: string;
  /** Une des clés de `PALETTE` (lib/ui/palette). */
  color: string;
  createdAt: string;
  /** Limites propres au paquet. Absentes : celles du magasin s'appliquent. */
  newPerDay?: number | null;
  reviewsPerDay?: number | null;
}

export interface SrsNote {
  id: string;
  deckId: string;
  kind: NoteKind;
  /** Recto (ou, pour un texte à trous, le texte porteur des `{{c1::…}}`). */
  front: string;
  /** Verso. Vide pour un texte à trous. */
  back: string;
  /** Complément affiché après la réponse : la nuance, la source, le contre-exemple. */
  extra: string;
  tags: string[];
  source?: CardSource;
  createdAt: string;
  updatedAt: string;
}

export interface SrsCard extends SchedulingState {
  id: string;
  noteId: string;
  /** Le rang de la carte dans sa note : 0/1 pour un recto-verso, le numéro du
   *  trou pour un texte à trous. C'est lui qui décide de ce qu'on affiche. */
  ord: number;
  /** Retirée de la circulation à la main, ou automatiquement en tant que sangsue. */
  suspended: boolean;
  /** Repoussée à demain sans toucher à sa planification (ISO), typiquement parce
   *  qu'une carte sœur est déjà passée aujourd'hui. */
  buriedUntil: string | null;
}

/** Une réponse donnée. C'est l'historique complet : les statistiques ET
 *  l'optimiseur de paramètres se rejouent entièrement à partir de lui. */
export interface ReviewLogEntry {
  cardId: string;
  rating: Rating;
  /** Instant de la réponse, en ISO. */
  at: string;
  /** État de la carte AVANT la réponse — indispensable pour distinguer une
   *  première rencontre d'une vraie révision dans les statistiques. */
  state: SchedulingState["state"];
  /** Jours écoulés depuis la révision précédente. `null` à la première. */
  elapsed: number | null;
  /** Stabilité et difficulté avant la réponse : l'optimiseur repart de là. */
  stability: number | null;
  difficulty: number | null;
  /** Temps passé sur la carte, en millisecondes. */
  durationMs?: number;
}

export interface SrsStore {
  decks: SrsDeck[];
  notes: SrsNote[];
  cards: SrsCard[];
  log: ReviewLogEntry[];
  config: SrsConfig;
  /** Limites par défaut, applicables aux paquets qui n'en fixent pas. */
  newPerDay: number;
  reviewsPerDay: number;
  /** Nombre d'oublis à partir duquel une carte est déclarée sangsue. */
  leechThreshold: number;
  /** Ce qu'on fait d'une sangsue : la suspendre, ou seulement la marquer. */
  leechAction: "suspend" | "tag";
  /** Enfouir les cartes sœurs vues le même jour (une note recto-verso ne se
   *  révise pas deux fois dans la même séance : la seconde serait gratuite). */
  burySiblings: boolean;
  /** Heure de bascule du jour, en heures (Anki : 4 h du matin). Réviser à 1 h
   *  du matin appartient encore à la veille — sans ça, une séance nocturne
   *  consomme deux quotas de nouvelles cartes. */
  dayCutoffHour: number;
}

export const LEECH_TAG = "sangsue";

export function emptyStore(): SrsStore {
  return {
    decks: [],
    notes: [],
    cards: [],
    log: [],
    config: normalizeConfig(null),
    newPerDay: 20,
    reviewsPerDay: 200,
    leechThreshold: 8,
    leechAction: "suspend",
    burySiblings: true,
    dayCutoffHour: 4,
  };
}

/** Complète un magasin lu du stockage : il peut venir d'une version antérieure
 *  et manquer un champ ajouté depuis. */
export function normalizeStore(raw: Partial<SrsStore> | null | undefined): SrsStore {
  const base = emptyStore();
  if (!raw || typeof raw !== "object") return base;
  return {
    decks: Array.isArray(raw.decks) ? raw.decks : base.decks,
    notes: Array.isArray(raw.notes) ? raw.notes : base.notes,
    cards: Array.isArray(raw.cards) ? raw.cards : base.cards,
    log: Array.isArray(raw.log) ? raw.log : base.log,
    config: normalizeConfig(raw.config),
    newPerDay: numOr(raw.newPerDay, base.newPerDay),
    reviewsPerDay: numOr(raw.reviewsPerDay, base.reviewsPerDay),
    leechThreshold: numOr(raw.leechThreshold, base.leechThreshold),
    leechAction: raw.leechAction === "tag" ? "tag" : "suspend",
    burySiblings: raw.burySiblings !== false,
    dayCutoffHour: numOr(raw.dayCutoffHour, base.dayCutoffHour),
  };
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ── Identifiants ─────────────────────────────────────────────────────────── */

let idCounter = 0;

/** Identifiant court, croissant et sans collision au sein d'une session.
 *  Le compteur évite les doublons quand on crée quarante cartes d'un coup :
 *  `Date.now()` seul se répète à l'intérieur d'une même milliseconde. */
export function newId(prefix = "c"): string {
  idCounter = (idCounter + 1) % 100000;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/* ── Note → cartes ────────────────────────────────────────────────────────── */

/** Les rangs de carte que porte une note, selon son type. Un texte à trous sans
 *  aucun `{{c1::…}}` n'en porte AUCUNE : c'est le cas d'une saisie inachevée,
 *  et il vaut mieux ne rien programmer que de programmer une carte vide. */
export function ordsForNote(note: Pick<SrsNote, "kind" | "front">): number[] {
  if (note.kind === "cloze") return clozeNumbers(note.front);
  return note.kind === "reversed" ? [0, 1] : [0];
}

export interface RenderedCard {
  question: string;
  answer: string;
  extra: string;
  /** Libellé du sens de la carte, à afficher discrètement : « Recto → verso »,
   *  « Trou 2 ». Sans lui, deux cartes sœurs sont indiscernables en liste. */
  direction: string;
}

/** Ce qu'on montre pour une carte donnée. Toute la logique d'affichage tient
 *  ici : la session de révision ne fait que rendre le résultat. */
export function renderCard(note: SrsNote, ord: number): RenderedCard {
  if (note.kind === "cloze") {
    return {
      question: renderCloze(note.front, ord, false),
      answer: renderCloze(note.front, ord, true),
      extra: note.extra,
      direction: `Trou ${ord}`,
    };
  }
  if (note.kind === "reversed" && ord === 1) {
    return { question: note.back, answer: note.front, extra: note.extra, direction: "Verso → recto" };
  }
  return {
    question: note.front,
    answer: note.back,
    extra: note.extra,
    direction: note.kind === "reversed" ? "Recto → verso" : "",
  };
}

/** Titre d'une note en une ligne, pour les listes. */
export function noteTitle(note: SrsNote): string {
  const raw = note.kind === "cloze" ? stripCloze(note.front) : note.front;
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 89)}…` : flat;
}

/**
 * Aligne les cartes d'une note sur son contenu.
 *
 * Ajouter un `{{c3::…}}` doit créer la carte 3 ; supprimer un trou doit retirer
 * la sienne. Les cartes qui survivent gardent leur planification INTACTE —
 * corriger une faute de frappe ne remet pas le compteur à zéro, ce serait perdre
 * des mois d'historique pour un accent.
 */
export function syncNoteCards(
  note: SrsNote,
  cards: SrsCard[],
  now: Date = new Date(),
): { cards: SrsCard[]; added: number; removed: number } {
  const wanted = ordsForNote(note);
  const mine = cards.filter(c => c.noteId === note.id);
  const others = cards.filter(c => c.noteId !== note.id);
  const kept = mine.filter(c => wanted.includes(c.ord));
  const existing = new Set(kept.map(c => c.ord));
  const created = wanted
    .filter(o => !existing.has(o))
    .map(o => ({ id: newId("k"), noteId: note.id, ord: o, suspended: false, buriedUntil: null, ...newSchedulingState(now) }));
  return {
    cards: [...others, ...kept, ...created],
    added: created.length,
    removed: mine.length - kept.length,
  };
}

/** Crée une note et ses cartes d'un seul geste. */
export function createNote(
  input: {
    deckId: string;
    kind: NoteKind;
    front: string;
    back?: string;
    extra?: string;
    tags?: string[];
    source?: CardSource;
  },
  now: Date = new Date(),
): { note: SrsNote; cards: SrsCard[] } {
  const iso = now.toISOString();
  const note: SrsNote = {
    id: newId("n"),
    deckId: input.deckId,
    kind: input.kind,
    front: input.front,
    back: input.back || "",
    extra: input.extra || "",
    tags: input.tags || [],
    source: input.source,
    createdAt: iso,
    updatedAt: iso,
  };
  return { note, cards: syncNoteCards(note, [], now).cards };
}

/* ── Journée de révision ──────────────────────────────────────────────────── */

/**
 * Le jour de révision auquel appartient un instant, sous forme `AAAA-MM-JJ`.
 *
 * Avant l'heure de bascule (4 h par défaut), on est encore la veille : une
 * séance à 1 h du matin ne doit pas ouvrir un nouveau quota de nouvelles cartes.
 * Le décalage se fait sur l'heure LOCALE, la seule qui corresponde au vécu.
 */
export function srsDay(at: Date, cutoffHour: number): string {
  const d = new Date(at.getTime() - cutoffHour * 3600_000);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Instant de bascule du jour de révision `day` vers le suivant. Sert à dater un
 *  enfouissement : « jusqu'à demain » veut dire jusqu'à la prochaine bascule. */
export function endOfSrsDay(day: string, cutoffHour: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d + 1, cutoffHour, 0, 0, 0);
}

/* ── Sangsues ─────────────────────────────────────────────────────────────── */

/** Une carte qu'on ne cesse de rater. Anki suspend au 8ᵉ oubli, puis tous les
 *  quatre oublis suivants — répéter l'alerte à chaque échec finirait par la
 *  rendre invisible. */
export function isLeech(card: SrsCard, threshold: number): boolean {
  if (card.lapses < threshold) return false;
  return card.lapses === threshold || (card.lapses - threshold) % Math.max(1, Math.floor(threshold / 2)) === 0;
}

/* ── Petites recherches ───────────────────────────────────────────────────── */

export function cardsOfDeck(store: SrsStore, deckId: string): SrsCard[] {
  const noteIds = new Set(store.notes.filter(n => n.deckId === deckId).map(n => n.id));
  return store.cards.filter(c => noteIds.has(c.noteId));
}

export function noteOf(store: SrsStore, card: SrsCard): SrsNote | undefined {
  return store.notes.find(n => n.id === card.noteId);
}

export function deckOf(store: SrsStore, note: SrsNote | undefined): SrsDeck | undefined {
  return note ? store.decks.find(d => d.id === note.deckId) : undefined;
}

/** Toutes les étiquettes en usage, triées — pour le filtre et l'autocomplétion. */
export function allTags(store: SrsStore): string[] {
  return [...new Set(store.notes.flatMap(n => n.tags))].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Une carte est-elle mûre ? Le seuil de 21 jours est celui d'Anki : en deçà,
 *  la mémorisation est encore fragile et un oubli reste probable.
 *
 *  Le critère porte sur l'INTERVALLE en cours, pas sur la stabilité : c'est le
 *  délai réellement accordé à la carte, bruit et plafond compris. */
export const MATURE_DAYS = 21;

export function currentIntervalDays(card: SrsCard): number {
  if (!card.lastReview) return 0;
  return (new Date(card.due).getTime() - new Date(card.lastReview).getTime()) / DAY_MS;
}

export function isMature(card: SrsCard): boolean {
  return card.state === "review" && currentIntervalDays(card) >= MATURE_DAYS;
}
