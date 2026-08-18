/**
 * Construction de la file du jour.
 *
 * Le moteur FSRS dit QUAND une carte redevient utile ; il ne dit pas combien on
 * peut en absorber. C'est le rôle de ce module : appliquer les limites, écarter
 * ce qui est suspendu ou enfoui, et décider dans quel ordre les cartes se
 * présentent.
 *
 * Le principe qui gouverne tout : ce qui est en cours d'apprentissage passe
 * AVANT. Une carte à un palier de dix minutes est chronométrée — la repousser,
 * c'est casser la séquence courte qui la fixe. Les révisions, elles, ont un jour
 * entier de marge.
 */

import type { Rating, SchedulingState } from "./fsrs";
import { reviewCard } from "./fsrs";
import {
  LEECH_TAG, endOfSrsDay, isLeech, srsDay,
  type ReviewLogEntry, type SrsCard, type SrsNote, type SrsStore,
} from "./model";

/** Les trois natures qu'une carte peut avoir dans la file, et qui donnent les
 *  trois compteurs affichés en tête de séance. */
export type QueueKind = "new" | "learning" | "review";

export function queueKindOf(card: SrsCard): QueueKind {
  if (card.state === "review") return "review";
  if (card.state === "relearning" || card.reps > 0) return "learning";
  return "new";
}

export interface DayCounters {
  day: string;
  /** Nouvelles cartes déjà introduites aujourd'hui — elles consomment le quota. */
  introduced: number;
  /** Révisions faites aujourd'hui (cartes en régime de croisière uniquement). */
  reviewsDone: number;
  /** Total des réponses, tous états confondus. */
  answered: number;
}

/**
 * Ce qui a déjà été fait aujourd'hui, reconstitué depuis le journal.
 *
 * Aucun compteur n'est stocké à part : deux sources qui doivent rester d'accord
 * finissent toujours par diverger (un appareil hors ligne, une synchro à
 * cheval sur minuit). Le journal est la seule vérité, et il porte tout ce qu'il
 * faut pour recalculer.
 */
export function dayCounters(store: SrsStore, now: Date): DayCounters {
  const day = srsDay(now, store.dayCutoffHour);
  const firstSeen = new Map<string, string>();
  for (const e of store.log) {
    const prev = firstSeen.get(e.cardId);
    if (!prev || e.at < prev) firstSeen.set(e.cardId, e.at);
  }
  let introduced = 0;
  for (const at of firstSeen.values()) {
    if (srsDay(new Date(at), store.dayCutoffHour) === day) introduced++;
  }
  let reviewsDone = 0;
  let answered = 0;
  for (const e of store.log) {
    if (srsDay(new Date(e.at), store.dayCutoffHour) !== day) continue;
    answered++;
    if (e.state === "review") reviewsDone++;
  }
  return { day, introduced, reviewsDone, answered };
}

/** Est-elle disponible ? Suspendue et enfouie sont deux choses différentes : la
 *  première est une décision durable, la seconde expire à la bascule du jour. */
export function isAvailable(card: SrsCard, now: Date): boolean {
  if (card.suspended) return false;
  if (card.buriedUntil && new Date(card.buriedUntil) > now) return false;
  return true;
}

export interface SessionQueue {
  /** Les identifiants de carte que la séance a le droit de servir aujourd'hui. */
  cardIds: string[];
  counts: Record<QueueKind, number>;
  /** Cartes dues aujourd'hui mais écartées par les limites — l'utilisateur doit
   *  le savoir, sinon « 0 carte » se lit comme « rien à faire ». */
  heldBack: { new: number; review: number };
}

interface BuildOptions {
  /** Restreint à ces paquets. Vide ou absent : tous. */
  deckIds?: string[];
  /** Restreint à ces étiquettes (union). */
  tags?: string[];
  /** Ignore les limites journalières — le mode « tout réviser quand même ». */
  ignoreLimits?: boolean;
}

/**
 * Sélectionne les cartes que la séance peut servir.
 *
 * L'échéance des cartes en RÉVISION se compare à la fin du jour de révision, pas
 * à l'instant présent : une carte due ce soir à 22 h est disponible dès le
 * matin. Anki fait pareil, et c'est ce qui permet de réviser quand on a le
 * temps plutôt qu'à l'heure dite. Les cartes en APPRENTISSAGE, elles, se
 * comparent à l'instant : leurs paliers se comptent en minutes.
 */
export function buildQueue(store: SrsStore, now: Date, opts: BuildOptions = {}): SessionQueue {
  const counters = dayCounters(store, now);
  const dayEnd = endOfSrsDay(counters.day, store.dayCutoffHour);
  const deckFilter = opts.deckIds && opts.deckIds.length ? new Set(opts.deckIds) : null;
  const tagFilter = opts.tags && opts.tags.length ? new Set(opts.tags) : null;

  const notes = new Map<string, SrsNote>(store.notes.map(n => [n.id, n]));
  const eligible = store.cards.filter(c => {
    if (!isAvailable(c, now)) return false;
    const note = notes.get(c.noteId);
    if (!note) return false;
    if (deckFilter && !deckFilter.has(note.deckId)) return false;
    if (tagFilter && !note.tags.some(t => tagFilter.has(t))) return false;
    return true;
  });

  const learning: SrsCard[] = [];
  const review: SrsCard[] = [];
  const fresh: SrsCard[] = [];
  for (const c of eligible) {
    const kind = queueKindOf(c);
    if (kind === "learning") {
      // Un palier peut tomber après la fin de la journée (dernier palier tardif) :
      // on le sert quand même, il appartient à la séance en cours.
      learning.push(c);
    } else if (kind === "review") {
      if (new Date(c.due) < dayEnd) review.push(c);
    } else {
      fresh.push(c);
    }
  }

  // Les plus en retard d'abord : ce sont celles dont la mémoire s'est le plus
  // dégradée, donc celles où une révision rapporte le plus.
  review.sort((a, b) => a.due.localeCompare(b.due));
  learning.sort((a, b) => a.due.localeCompare(b.due));
  // Les nouvelles suivent l'ordre de création : une leçon se prend dans l'ordre
  // où on l'a écrite.
  fresh.sort((a, b) => a.id.localeCompare(b.id));

  const newAllowance = opts.ignoreLimits
    ? fresh.length
    : Math.max(0, limitFor(store, opts.deckIds, "new") - counters.introduced);
  const reviewAllowance = opts.ignoreLimits
    ? review.length
    : Math.max(0, limitFor(store, opts.deckIds, "review") - counters.reviewsDone);

  const takenNew = fresh.slice(0, newAllowance);
  const takenReview = review.slice(0, reviewAllowance);

  return {
    cardIds: [...learning, ...takenReview, ...takenNew].map(c => c.id),
    counts: { learning: learning.length, review: takenReview.length, new: takenNew.length },
    heldBack: {
      new: fresh.length - takenNew.length,
      review: review.length - takenReview.length,
    },
  };
}

/** La limite applicable : celle du paquet quand la séance ne porte que sur LUI,
 *  celle du magasin sinon. Mélanger plusieurs paquets rend les limites par
 *  paquet ininterprétables — additionner des plafonds ne donne pas un plafond. */
function limitFor(store: SrsStore, deckIds: string[] | undefined, kind: "new" | "review"): number {
  const fallback = kind === "new" ? store.newPerDay : store.reviewsPerDay;
  if (!deckIds || deckIds.length !== 1) return fallback;
  const deck = store.decks.find(d => d.id === deckIds[0]);
  const own = kind === "new" ? deck?.newPerDay : deck?.reviewsPerDay;
  return own == null ? fallback : own;
}

/**
 * La prochaine carte à servir, parmi celles que la séance a en réserve.
 *
 * L'ordre de priorité :
 *   1. une carte d'apprentissage dont le palier est ÉCHU — elle est en retard
 *      sur son propre chronomètre ;
 *   2. une révision ou une nouvelle carte, alternées pour ne pas enchaîner
 *      quarante nouveautés puis quarante rappels ;
 *   3. faute de mieux, une carte d'apprentissage dont le palier n'est pas encore
 *      échu : plutôt que d'imposer une attente de huit minutes devant un écran
 *      vide, on la sert en avance. Anki fait ce choix aussi.
 */
export function pickNext(
  store: SrsStore,
  remaining: string[],
  now: Date,
  servedCount: number,
): string | null {
  if (remaining.length === 0) return null;
  const byId = new Map(store.cards.map(c => [c.id, c]));
  const cards = remaining.map(id => byId.get(id)).filter((c): c is SrsCard => !!c);
  if (cards.length === 0) return null;

  const dueLearning = cards
    .filter(c => queueKindOf(c) === "learning" && new Date(c.due) <= now)
    .sort((a, b) => a.due.localeCompare(b.due));
  if (dueLearning.length) return dueLearning[0].id;

  const reviews = cards.filter(c => queueKindOf(c) === "review");
  const fresh = cards.filter(c => queueKindOf(c) === "new");

  // Une nouvelle carte toutes les quatre, tant qu'il en reste : assez pour
  // avancer sans noyer la séance sous de l'inconnu.
  if (fresh.length && reviews.length) {
    return servedCount % 4 === 3 ? fresh[0].id : reviews[0].id;
  }
  if (reviews.length) return reviews[0].id;
  if (fresh.length) return fresh[0].id;

  return cards.sort((a, b) => a.due.localeCompare(b.due))[0].id;
}

export interface AnswerResult {
  cards: SrsCard[];
  log: ReviewLogEntry[];
  /** La carte vient de franchir le seuil de sangsue à cette réponse. */
  becameLeech: boolean;
  /** Elle vient d'être suspendue automatiquement. */
  suspended: boolean;
  /** Ses sœurs enfouies dans la foulée. */
  buried: number;
  /** Le délai accordé, en millisecondes — c'est le retour affiché à l'écran. */
  intervalMs: number;
  /** Reste-t-elle à repasser dans la séance en cours ? */
  stillInSession: boolean;
}

/**
 * Applique une réponse : planification, journal, sangsues, enfouissement.
 *
 * Tout est fait ici et renvoyé d'un bloc, pour que la page n'ait qu'un seul
 * `setStore` à faire. Deux écritures successives sur `useCloudState` partant du
 * même état perdraient la première.
 */
export function answerCard(
  store: SrsStore,
  cardId: string,
  rating: Rating,
  now: Date,
  durationMs?: number,
): AnswerResult | null {
  const card = store.cards.find(c => c.id === cardId);
  if (!card) return null;

  const before: SchedulingState = { ...card };
  const { card: after, intervalMs } = reviewCard(before, rating, now, store.config, card.id);

  const entry: ReviewLogEntry = {
    cardId,
    rating,
    at: now.toISOString(),
    state: before.state,
    elapsed: before.lastReview
      ? (now.getTime() - new Date(before.lastReview).getTime()) / 86_400_000
      : null,
    stability: before.stability,
    difficulty: before.difficulty,
    ...(durationMs != null ? { durationMs } : {}),
  };

  const updated: SrsCard = { ...card, ...after };

  const becameLeech = updated.lapses > before.lapses && isLeech(updated, store.leechThreshold);
  let suspended = false;
  if (becameLeech) {
    if (store.leechAction === "suspend") {
      updated.suspended = true;
      suspended = true;
    }
  }

  let cards = store.cards.map(c => (c.id === cardId ? updated : c));

  // Enfouissement des sœurs : seulement quand la carte QUITTE la séance du jour
  // (délai d'au moins un jour). Une carte encore en paliers va revenir dans
  // l'heure — enfouir ses sœurs maintenant les perdrait pour rien.
  let buried = 0;
  const leavesToday = updated.state === "review";
  if (store.burySiblings && leavesToday) {
    const day = srsDay(now, store.dayCutoffHour);
    const until = endOfSrsDay(day, store.dayCutoffHour).toISOString();
    cards = cards.map(c => {
      if (c.noteId !== updated.noteId || c.id === cardId || c.suspended) return c;
      if (c.buriedUntil && c.buriedUntil >= until) return c;
      buried++;
      return { ...c, buriedUntil: until };
    });
  }

  return {
    cards,
    log: [...store.log, entry],
    becameLeech,
    suspended,
    buried,
    intervalMs,
    stillInSession: !suspended && updated.state !== "review",
  };
}

/** Étiquette « sangsue » posée sur la note : c'est elle qu'on retrouve au filtre,
 *  et elle survit à une reprogrammation de la carte. */
export function tagAsLeech(notes: SrsNote[], noteId: string): SrsNote[] {
  return notes.map(n =>
    n.id === noteId && !n.tags.includes(LEECH_TAG) ? { ...n, tags: [...n.tags, LEECH_TAG] } : n,
  );
}
