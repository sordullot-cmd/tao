/**
 * Les fenêtres des pastilles 1S / 1M / 3M / 6M / 1A, ancrées sur le CALENDRIER.
 *
 * Elles ne l'étaient pas : « 1 mois » retirait trente jours à aujourd'hui, « 1
 * an » trois cent soixante-cinq. Le compte était juste et la lecture fausse —
 * un budget se raisonne en mois civils. Le 5 du mois, la fenêtre glissante
 * attrapait deux loyers et un seul salaire, et le total du poste « Logement »
 * doublait sans que rien n'ait changé dans la vie de personne. Même chose en
 * plus grand pour l'année : « 1 an » au 15 mars comparait mars à mars, quand la
 * question qu'on se pose est « où j'en suis cette année ».
 *
 * La règle, désormais :
 *
 *   1M   du 1er du mois courant à aujourd'hui ;
 *   3M   du 1er du mois, deux mois en arrière — trois mois civils, celui-ci
 *        compris ;
 *   6M   idem sur six ;
 *   1A   du 1er janvier de l'année courante à aujourd'hui.
 *
 * 1S reste GLISSANTE, sept jours pleins. Une semaine civile n'a pas la même
 * évidence qu'un mois — elle commence lundi ici, dimanche ailleurs — et surtout
 * elle ne porte aucune échéance : rien ne tombe « le 1er de la semaine ». La
 * caler aurait donné une fenêtre d'un seul jour tous les lundis.
 *
 * `offset` recule la fenêtre d'un cran ENTIER : le mois précédent pour 1M, le
 * trimestre précédent pour 3M, l'année précédente pour 1A. C'est ce qui permet
 * de remonter le temps sans que deux fenêtres voisines se chevauchent ou
 * laissent un trou — ce qu'un décalage en jours ne garantissait pas dès que les
 * mois n'ont pas la même longueur.
 *
 * La fenêtre courante (`offset` 0) s'arrête AUJOURD'HUI et non à la fin du mois :
 * un mois en cours n'a pas de futur à montrer, et une fenêtre qui court jusqu'au
 * 31 ferait lire « il reste 400 € » là où il reste surtout douze jours.
 */

/** Nombre de mois civils couverts par une fenêtre — les autres n'en couvrent pas. */
const MONTHS: Record<string, number> = { "1M": 1, "3M": 3, "6M": 6 };

/** Jours d'une fenêtre glissante — 1S seule, cf. l'en-tête. */
const ROLLING: Record<string, number> = { "1S": 7 };

/** Une fenêtre de jours, bornes INCLUSES. */
export interface PeriodRange {
  start: Date;
  end: Date;
}

const atMidnight = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * La fenêtre d'une pastille, `offset` crans en arrière.
 *
 * `null` pour un identifiant qui ne désigne aucune fenêtre — « Tout »,
 * « Personnalisé », ou une valeur venue d'un stockage d'une version antérieure.
 * L'appelant décide alors quoi montrer ; ce module ne devine pas à sa place.
 */
export function periodRange(id: string, offset = 0, today: Date = new Date()): PeriodRange | null {
  const now = atMidnight(today);

  const rolling = ROLLING[id];
  if (rolling) {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset * rolling);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - rolling + 1);
    return { start, end };
  }

  const months = MONTHS[id];
  if (months) {
    const endMonth = now.getMonth() - offset * months;
    const start = new Date(now.getFullYear(), endMonth - (months - 1), 1);
    // Le jour 0 du mois suivant donne le dernier jour du mois demandé : février
    // et les bissextiles se règlent sans table.
    const end = offset === 0 ? now : new Date(now.getFullYear(), endMonth + 1, 0);
    return { start, end };
  }

  if (id === "1A") {
    const year = now.getFullYear() - offset;
    const start = new Date(year, 0, 1);
    const end = offset === 0 ? now : new Date(year, 11, 31);
    return { start, end };
  }

  return null;
}

/** Le premier jour compté par une fenêtre. `null` s'il n'y en a pas. */
export function periodStart(id: string, today: Date = new Date()): Date | null {
  return periodRange(id, 0, today)?.start ?? null;
}

/**
 * Longueur de la fenêtre courante, en jours et bornes incluses — ce qu'il faut
 * demander à la banque, et ce que `withinDays` attend.
 *
 * `null` quand la pastille ne borne rien : l'appelant retombe alors sur sa
 * propre valeur pour « tout », qui ne se dit pas de la même façon partout
 * (`ALL_DAYS` ici, `null` là).
 */
export function periodDays(id: string, today: Date = new Date()): number | null {
  const range = periodRange(id, 0, today);
  if (!range) return null;
  const ms = atMidnight(range.end).getTime() - atMidnight(range.start).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
