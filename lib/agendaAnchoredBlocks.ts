/**
 * Blocs ancrés de l'agenda — « réveil + préparation », et tout ce qui doit se
 * poser JUSTE AVANT le premier élément de la journée.
 *
 * Pourquoi pas un vrai évènement Google : son heure n'est pas une donnée, c'est
 * un calcul. Un cours à 8 h le lundi et à 10 h le mardi déplace le réveil ; une
 * série récurrente, elle, garderait son horaire et mentirait un jour sur deux.
 * Le bloc n'a donc qu'une DURÉE, et sa fin est empruntée chaque jour au premier
 * élément qui commence.
 *
 * Conséquences assumées :
 *   - un jour sans rien n'a pas de bloc — sans premier élément, il n'y a rien à
 *     quoi s'accrocher, et poser le réveil à une heure inventée serait pire ;
 *   - le bloc ne part jamais chez Google : il vit dans `user_productivity`
 *     (cf. ANCHORED_CLOUD_KEY), donc aucune migration SQL ;
 *   - il n'a pas de rappel : ce qu'on notifierait changerait d'heure sous la
 *     notification déjà programmée.
 */

export const ANCHORED_STORAGE_KEY = "tr4de_anchored_blocks";
export const ANCHORED_CLOUD_KEY = "agenda_anchored_blocks";

/** Durée proposée quand rien ne la dit (le temps d'un lever tranquille). */
export const DEFAULT_ANCHOR_MINUTES = 45;
export const MIN_ANCHOR_MINUTES = 5;
/** Plafond de durée. Une nuit de sommeil est un bloc ancré comme un autre :
 *  la limite doit la laisser passer, sans laisser passer un bloc qui mangerait
 *  plus d'une journée. */
export const MAX_ANCHOR_MINUTES = 16 * 60;

/** Nuit par défaut d'un bloc « sommeil ». */
export const DEFAULT_SLEEP_MINUTES = 8 * 60;
export const DEFAULT_SLEEP_TITLE = "Sommeil";

export const DEFAULT_ANCHOR_TITLE = "Réveil + préparation";

/** 0 = lundi … 6 = dimanche, comme `weekdayIdx` de la page Agenda. */
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type AnchoredBlock = {
  id: string;
  summary: string;
  /** Durée en minutes. La fin, elle, est celle du premier élément du jour. */
  minutes: number;
  /** `colorId` Google (même palette que les évènements) ou `null`. */
  colorId: string | null;
  /** Éteint sans être supprimé : une semaine de vacances ne doit pas coûter
   *  le réglage. */
  enabled: boolean;
  /** Jours où le bloc peut se poser (0 = lundi). */
  days: number[];
  /**
   * `HH:MM` après laquelle le bloc ne commence jamais — l'heure du réveil au
   * plus tard, pour un bloc du matin.
   *
   * C'est le garde-fou ET le repli : un premier rendez-vous à 14 h ne justifie
   * pas un réveil à 13 h 15, et une journée sans rien ne justifie pas de rester
   * couché. Réglée à 9 h, elle pose le bloc à 9 h dans les deux cas ; laissée
   * vide, le bloc reste collé au premier élément et disparaît les jours vides.
   *
   * La NUIT la lit comme l'heure du coucher au plus tard : elle commence alors
   * plus tôt et dure plus longtemps, sa fin restant le réveil. C'est la seule à
   * s'étirer ainsi — un bloc chaîné avant elle garde sa durée et laisse du vide
   * devant lui, comme un bloc du matin.
   */
  maxStart: string;
  /**
   * Minutes laissées libres entre la FIN du bloc et son ancre — l'écart.
   *
   * Zéro colle le bloc à ce qui le suit, ce qui est le cas courant (on se
   * prépare jusqu'au premier cours). Mais rien n'oblige à être collé : « une
   * heure de sport qui finit 5 min avant le premier cours » se dit avec un
   * écart de 5 min, et c'est le seul moyen de poser un bloc à distance d'une
   * ancre qui bouge tous les jours.
   */
  gap: number;
  /** Une tâche posée à une heure compte-t-elle comme premier élément ? */
  countTasks: boolean;
  /**
   * Id d'un autre bloc du même mode : celui-ci se pose JUSTE AVANT lui, au lieu
   * de s'accrocher à l'ancre naturelle (premier élément du jour, ou réveil du
   * lendemain).
   *
   * C'est ce qui permet d'écrire « lecture, juste avant le sommeil » sans avoir
   * à calculer soi-même 8 h 30 avant le réveil : la lecture suit le sommeil,
   * qui suit le réveil, qui suit le premier cours. Un chaînon manquant (bloc
   * supprimé, éteint, ou qui ne travaille pas ce jour-là) fait tomber ce qui
   * pend après lui — c'est la traduction honnête de « avant le sommeil » un
   * jour où il n'y a pas de sommeil. `""` = ancre naturelle.
   */
  before: string;
  /** À quoi le bloc s'accroche :
   *  - `morning` : au premier élément de SA journée, et il finit dessus ;
   *  - `evening` : au réveil du LENDEMAIN (haut de la pile du matin du jour
   *    suivant, à défaut son premier élément). C'est ce qui permet à un bloc
   *    « sommeil » de 8 h de se placer tout seul, quitte à traverser minuit. */
  anchor: AnchorMode;
};

export type AnchorMode = "morning" | "evening";

/** Occurrence d'un jour donné : la forme d'un évènement de la grille. */
export type AnchoredOccurrence = {
  id: string;
  anchorId: string;
  isAnchored: true;
  allDay: false;
  summary: string;
  colorId: string | null;
  start: string;
  end: string;
};

export function newAnchorId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `anc_${crypto.randomUUID()}`;
  } catch {}
  return `anc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** `HH:MM` → minutes depuis minuit, `null` pour tout le reste (dont `""`, qui
 *  est la façon de dire « pas de limite »). */
export function timeToMinutes(value: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToTime(value: number): string {
  const v = Math.max(0, Math.min(24 * 60 - 1, Math.round(value)));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

export function clampAnchorMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_ANCHOR_MINUTES;
  return Math.min(MAX_ANCHOR_MINUTES, Math.max(MIN_ANCHOR_MINUTES, n));
}

/** Le magasin est un JSON libre : une ligne d'une autre version, ou tronquée,
 *  ne doit pas injecter un bloc sans durée dans la grille. */
export function normalizeAnchoredBlocks(value: unknown): AnchoredBlock[] {
  if (!Array.isArray(value)) return [];
  const out: AnchoredBlock[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Partial<AnchoredBlock>;
    const id = typeof b.id === "string" && b.id ? b.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    /* Chaque réglage a un défaut qui reproduit le comportement d'avant son
       existence : un bloc enregistré par une version précédente ne change pas
       de jour ni d'heure en arrivant ici. */
    const days = Array.isArray(b.days)
      ? [...new Set(b.days.map((d) => Math.round(Number(d))).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((x, y) => x - y)
      : ALL_DAYS;
    out.push({
      id,
      summary: typeof b.summary === "string" && b.summary.trim() ? b.summary.trim() : DEFAULT_ANCHOR_TITLE,
      minutes: clampAnchorMinutes(b.minutes),
      colorId: typeof b.colorId === "string" && b.colorId ? b.colorId : null,
      enabled: b.enabled !== false,
      days: days.length ? days : ALL_DAYS,
      maxStart: timeToMinutes(b.maxStart) === null ? "" : String(b.maxStart).trim(),
      gap: Number.isFinite(Number(b.gap)) ? Math.min(MAX_ANCHOR_MINUTES, Math.max(0, Math.round(Number(b.gap)))) : 0,
      countTasks: b.countTasks !== false,
      anchor: b.anchor === "evening" ? "evening" : "morning",
      before: typeof b.before === "string" && b.before && b.before !== id ? b.before : "",
    });
  }
  return out;
}

/** Ajoute ou remplace un bloc, en gardant l'ordre de la liste. */
export function upsertAnchoredBlock(blocks: AnchoredBlock[], block: AnchoredBlock): AnchoredBlock[] {
  const list = normalizeAnchoredBlocks(blocks);
  const at = list.findIndex((b) => b.id === block.id);
  const clean = normalizeAnchoredBlocks([block])[0];
  if (!clean) return list;
  if (at < 0) return [...list, clean];
  const next = [...list];
  next[at] = clean;
  return next;
}

/**
 * Ancre proposée à un bloc qu'on vient de créer : le dernier bloc du même mode,
 * s'il y en a un. Un deuxième bloc du soir est presque toujours « juste avant »
 * le premier (lire avant de dormir), et un deuxième bloc du matin juste avant
 * celui qui existe déjà — c'est l'empilement d'avant, devenu explicite.
 */
export function defaultBefore(blocks: AnchoredBlock[], anchor: AnchorMode): string {
  const family = normalizeAnchoredBlocks(blocks).filter((b) => b.anchor === anchor);
  return family.length ? family[family.length - 1].id : "";
}

export function removeAnchoredBlock(blocks: AnchoredBlock[], id: string): AnchoredBlock[] {
  return normalizeAnchoredBlocks(blocks).filter((b) => b.id !== id);
}

/** Minutes depuis minuit, à partir de deux `HH:MM`. Sert à lire la durée dans
 *  les champs d'heure du modal plutôt que d'ajouter un champ « durée ». */
export function minutesBetween(startTime: string, endTime: string): number {
  const toMin = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = toMin(startTime);
  const b = toMin(endTime);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return DEFAULT_ANCHOR_MINUTES;
  return clampAnchorMinutes(b - a);
}

/** « 45 min », « 1 h », « 1 h 30 » — le résumé affiché à la place d'une date. */
export function anchorDurationLabel(minutes: number): string {
  const m = clampAnchorMinutes(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
}

type DayItem = { start?: string | null; allDay?: boolean; isAnchored?: boolean; isTask?: boolean };

/** 0 = lundi … 6 = dimanche, pour une clé `YYYY-MM-DD`. */
export function weekdayOfDayKey(dayKey: string): number | null {
  const d = new Date(`${dayKey}T00:00:00`);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return (d.getDay() + 6) % 7;
}

/**
 * Début du premier élément horodaté du jour, en minutes depuis minuit.
 * `null` quand il n'y en a pas — et 0 quand la journée commence déjà occupée
 * (élément à minuit, ou qui déborde de la veille) : il n'y a alors pas de place
 * au-dessus, ce que l'appelant traduit par « pas de bloc ».
 *
 * `countTasks` à `false` écarte les tâches posées à une heure : elles occupent
 * la grille sans être des rendez-vous, et n'ont pas à décider d'un réveil.
 */
export function firstItemMinutes(dayKey: string, items: DayItem[], countTasks = true): number | null {
  const dayStart = new Date(`${dayKey}T00:00:00`).getTime();
  if (!Number.isFinite(dayStart)) return null;
  let best: number | null = null;
  for (const it of items || []) {
    if (!it || it.allDay || it.isAnchored || !it.start) continue;
    if (!countTasks && it.isTask) continue;
    const t = new Date(it.start).getTime();
    if (!Number.isFinite(t)) continue;
    // Un élément commencé la veille occupe le jour dès minuit.
    const min = Math.max(0, Math.round((t - dayStart) / 60000));
    if (min >= 24 * 60) continue;
    if (best === null || min < best) best = min;
  }
  return best;
}

function isoAt(dayKey: string, minutes: number): string {
  const d = new Date(`${dayKey}T00:00:00`);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

/** Clé du jour suivant, à partir d'une clé `YYYY-MM-DD`. */
export function nextDayKey(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Occurrence rangée sous la journée qui doit l'afficher. */
export type PlacedOccurrence = { dayKey: string; occurrence: AnchoredOccurrence };

/** Position d'un bloc, en minutes depuis le minuit du jour traité. Un bloc du
 *  soir dépasse allègrement 1440 : c'est le repère commun aux deux journées. */
type Slot = { startMin: number; endMin: number };

/**
 * Place une famille de blocs (le matin, ou le soir) dans le repère du jour.
 *
 * Chaque bloc finit là où commence son ancre : l'ancre naturelle de la famille
 * (`naturalEnd`) ou, si `before` est renseigné, le bloc désigné. La résolution
 * est récursive et mémoïsée — « lecture avant sommeil avant réveil » se place
 * dans le bon ordre quelle que soit la place des trois dans la liste — avec un
 * garde-fou contre les cycles (deux blocs qui se désignent l'un l'autre ne
 * placent ni l'un ni l'autre, plutôt que de faire tourner la page en rond).
 */
function placeFamily(
  family: AnchoredBlock[],
  weekday: number,
  naturalEnd: (b: AnchoredBlock) => number | null,
): Map<string, Slot> {
  const byId = new Map(family.map((b) => [b.id, b]));
  const done = new Map<string, Slot | null>();
  const busy = new Set<string>();

  const place = (b: AnchoredBlock): Slot | null => {
    const known = done.get(b.id);
    if (known !== undefined) return known;
    if (busy.has(b.id)) return null; // cycle
    busy.add(b.id);
    let slot: Slot | null = null;
    if (b.enabled && b.days.includes(weekday)) {
      let anchorStart: number | null = null;
      if (b.before) {
        const target = byId.get(b.before);
        // Un `before` qui pointe hors de la famille (autre mode, bloc effacé)
        // ne vaut pas ancre naturelle : le bloc dirait autre chose que ce qui
        // est écrit dans son réglage.
        anchorStart = target ? (place(target)?.startMin ?? null) : null;
      } else {
        anchorStart = naturalEnd(b);
      }
      if (anchorStart !== null) {
        const endMin = anchorStart - b.gap;
        let startMin = endMin - b.minutes;
        const limit = timeToMinutes(b.maxStart);
        if (limit !== null && startMin > limit) {
          startMin = limit;
          /* Un bloc repoussé par sa limite GARDE SA DURÉE et décolle de son
             ancre : le vide qui apparaît devant lui est l'information — c'est
             le temps qu'on ne s'était pas donné.
             La seule exception est la nuit, c'est-à-dire le bloc du soir
             accroché DIRECTEMENT au réveil (pas de `before`) : sa fin n'est pas
             négociable, on dort jusqu'à ce qu'on se lève, et se coucher plus tôt
             allonge la nuit au lieu de laisser un trou. Un bloc chaîné avant
             elle — lire, ranger — n'a pas cette propriété : sa durée est un
             fait, et l'étirer jusqu'au coucher faisait durer deux heures une
             lecture réglée sur une. */
          const stretchesToAnchor = b.anchor === "evening" && !b.before;
          if (!stretchesToAnchor) {
            slot = { startMin, endMin: startMin + b.minutes };
          }
        }
        if (!slot) {
          if (startMin < 0) startMin = 0;
          if (startMin < endMin && endMin > 0) slot = { startMin, endMin };
        }
      }
    }
    done.set(b.id, slot);
    busy.delete(b.id);
    return slot;
  };

  const out = new Map<string, Slot>();
  for (const b of family) {
    const slot = place(b);
    if (slot) out.set(b.id, slot);
  }
  return out;
}

/** Découpe une position à minuit et l'habille en occurrence(s) affichable(s). */
function emit(b: AnchoredBlock, dayKey: string, slot: Slot): PlacedOccurrence[] {
  const base = {
    anchorId: b.id,
    isAnchored: true as const,
    allDay: false as const,
    summary: b.summary,
    colorId: b.colorId,
  };
  const next = nextDayKey(dayKey);
  const DAY = 24 * 60;
  if (slot.endMin <= DAY) {
    return [{ dayKey, occurrence: { ...base, id: `anchor:${b.id}:${dayKey}`, start: isoAt(dayKey, slot.startMin), end: isoAt(dayKey, slot.endMin) } }];
  }
  if (slot.startMin >= DAY) {
    return [{ dayKey: next, occurrence: { ...base, id: `anchor:${b.id}:${dayKey}:n`, start: isoAt(next, slot.startMin - DAY), end: isoAt(next, slot.endMin - DAY) } }];
  }
  /* La nuit traverse minuit : deux morceaux, un par journée. La grille place
     chaque bloc dans la colonne de son jour et rogne ce qui dépasse — un seul
     objet à cheval n'afficherait que la soirée et perdrait le petit matin. */
  return [
    { dayKey, occurrence: { ...base, id: `anchor:${b.id}:${dayKey}`, start: isoAt(dayKey, slot.startMin), end: isoAt(dayKey, DAY) } },
    { dayKey: next, occurrence: { ...base, id: `anchor:${b.id}:${dayKey}:n`, start: isoAt(next, 0), end: isoAt(next, slot.endMin - DAY) } },
  ];
}

/**
 * Blocs du matin d'une journée. Chacun finit à l'heure du premier élément —
 * ou de celui qu'il désigne. Rien ne sort si la journée n'a pas d'élément
 * horodaté ET que le bloc n'a pas d'heure de réveil au plus tard, si le bloc ne
 * travaille pas ce jour-là, ou si la place manque avant l'ancre.
 */
export function anchoredOccurrences(
  blocks: AnchoredBlock[],
  dayKey: string,
  items: DayItem[],
): AnchoredOccurrence[] {
  const list = normalizeAnchoredBlocks(blocks).filter((b) => b.anchor === "morning");
  if (!list.length) return [];
  const weekday = weekdayOfDayKey(dayKey);
  if (weekday === null) return [];
  const slots = placeFamily(list, weekday, (b) => {
    const base = firstItemMinutes(dayKey, items, b.countTasks);
    // Journée occupée dès minuit : pas de place au-dessus, et le repli n'a rien
    // à faire au milieu de ce qui est déjà là.
    if (base !== null) return base <= 0 ? null : base;
    // Journée sans rien : seule l'heure de réveil au plus tard peut poser le
    // bloc — c'est elle qui dit « debout à 9 h, même un dimanche ».
    const limit = timeToMinutes(b.maxStart);
    return limit === null ? null : limit + b.minutes + b.gap;
  });
  const out: AnchoredOccurrence[] = [];
  for (const b of list) {
    const slot = slots.get(b.id);
    if (slot) for (const placed of emit(b, dayKey, slot)) out.push(placed.occurrence);
  }
  return out;
}

/**
 * L'heure du réveil d'un jour, en minutes depuis SON minuit : le haut de la
 * pile du matin s'il y en a une, sinon son premier élément. C'est à ça qu'un
 * bloc du soir s'accroche — c'est bien le lever qui fixe l'heure du coucher,
 * pas l'inverse.
 */
export function wakeMinutes(
  dayKey: string,
  items: DayItem[],
  morningOccurrences: AnchoredOccurrence[] = [],
): number | null {
  const dayStart = new Date(`${dayKey}T00:00:00`).getTime();
  let best = firstItemMinutes(dayKey, items);
  for (const occ of morningOccurrences) {
    const t = new Date(occ.start).getTime();
    if (!Number.isFinite(t)) continue;
    const min = Math.round((t - dayStart) / 60000);
    if (min < 0) continue; // morceau de nuit hérité de la veille, pas un réveil
    if (best === null || min < best) best = min;
  }
  return best;
}

/**
 * Pile du soir du jour `dayKey`, calculée à REBOURS depuis le réveil du
 * lendemain (`wake`, en minutes après le minuit du lendemain) : un bloc finit
 * au réveil, celui qui le désigne finit là où il commence.
 */
export function eveningOccurrences(
  blocks: AnchoredBlock[],
  dayKey: string,
  wake: number,
): PlacedOccurrence[] {
  const list = normalizeAnchoredBlocks(blocks).filter((b) => b.anchor === "evening");
  if (!list.length) return [];
  const weekday = weekdayOfDayKey(dayKey);
  if (weekday === null || !Number.isFinite(wake) || wake < 0) return [];
  const slots = placeFamily(list, weekday, () => 24 * 60 + wake);
  const out: PlacedOccurrence[] = [];
  for (const b of list) {
    const slot = slots.get(b.id);
    if (slot) out.push(...emit(b, dayKey, slot));
  }
  return out;
}

/**
 * Tout ce qu'il y a à poser sur une plage de jours : le matin d'abord (chaque
 * jour est indépendant), puis le soir, qui a besoin du matin DÉJÀ calculé du
 * lendemain. Un soir dont le lendemain n'a ni réveil ni évènement ne pose rien
 * — comme un matin sans journée ni heure de réveil au plus tard.
 */
export function anchoredOccurrencesForRange(
  blocks: AnchoredBlock[],
  dayKeys: string[],
  itemsByDay: Map<string, DayItem[]>,
): Map<string, AnchoredOccurrence[]> {
  const out = new Map<string, AnchoredOccurrence[]>();
  const list = normalizeAnchoredBlocks(blocks);
  if (!list.length) return out;
  const push = (k: string, occ: AnchoredOccurrence) => {
    const arr = out.get(k);
    if (arr) arr.push(occ);
    else out.set(k, [occ]);
  };

  const morningByDay = new Map<string, AnchoredOccurrence[]>();
  const morningOf = (k: string) => {
    let occ = morningByDay.get(k);
    if (!occ) {
      occ = anchoredOccurrences(list, k, itemsByDay.get(k) || []);
      morningByDay.set(k, occ);
    }
    return occ;
  };

  for (const k of dayKeys) for (const occ of morningOf(k)) push(k, occ);

  if (!list.some((b) => b.anchor === "evening")) return out;
  for (const k of dayKeys) {
    const next = nextDayKey(k);
    // Le lendemain peut sortir de la plage affichée : on le calcule quand même
    // (les données sont là), sinon le dernier soir de la semaine sauterait.
    const wake = wakeMinutes(next, itemsByDay.get(next) || [], morningOf(next));
    if (wake === null || wake <= 0) continue;
    for (const { dayKey, occurrence } of eveningOccurrences(list, k, wake)) push(dayKey, occurrence);
  }
  return out;
}
