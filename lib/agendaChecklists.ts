/**
 * Check-lists d'évènement — les étapes de ce qu'on fait PENDANT un créneau.
 *
 * Un évènement « Lecture » de deux heures ne dit pas ce qu'on y fait : lire,
 * noter ce qu'on a appris, préparer une restitution. Ces étapes ne sont pas des
 * tâches au sens de l'agenda — elles n'ont ni heure ni place propre, elles
 * n'existent que dans le créneau qui les porte. D'où un magasin à part plutôt
 * que des Google Tasks liées (`event_task_links`, déjà là) : celles-ci
 * apparaissent dans la grille et dans la liste des tâches, ce qui est
 * exactement ce qu'on ne veut pas ici.
 *
 * Conséquence heureuse : une check-list se pose aussi bien sur une séance
 * importée en lecture seule (un TP dont on veut lister les manips) que sur un
 * évènement Google, puisqu'elle ne touche jamais à la source.
 *
 * Le magasin est un objet `{ [identifiant d'évènement]: item[] }` rangé dans
 * `user_productivity` par `useCloudState`. Les fonctions ci-dessous sont pures
 * et rendent TOUJOURS un nouveau magasin : elles se passent directement au
 * `setStore` du hook.
 */

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  /** Quand la case a été cochée (ISO). Absent tant qu'elle ne l'est pas.
      Sert au journal d'activité de la Vie RPG : une ligne sans horaire s'y
      rangerait n'importe où. */
  doneAt?: string | null;
}

export type ChecklistStore = Record<string, ChecklistItem[]>;

export const EVENT_CHECKLISTS_KEY = "tr4de_event_checklists";
export const EVENT_CHECKLISTS_CLOUD_KEY = "event_checklists";

/** Identifiant d'étape. Le hasard suffit : rien ne les compare entre listes. */
export const newChecklistItemId = (): string =>
  `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Une étape, telle qu'on la saisit. `null` si le texte est vide. */
export function newChecklistItem(text: string): ChecklistItem | null {
  const clean = String(text ?? "").trim();
  return clean ? { id: newChecklistItemId(), text: clean, done: false } : null;
}

export function normalizeChecklistItems(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      /* Tolérance à une forme plus ancienne : une chaîne nue vaut une étape à
         faire. Le magasin est normalisé à la lecture, jamais migré. */
      if (typeof item === "string") return newChecklistItem(item);
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const text = String(o.text ?? "").trim();
      if (!text) return null;
      const done = o.done === true;
      const doneAt = done && o.doneAt ? String(o.doneAt) : null;
      return { id: String(o.id || newChecklistItemId()), text, done, doneAt };
    })
    .filter((item): item is ChecklistItem => item !== null);
}

export function normalizeChecklists(raw: unknown): ChecklistStore {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ChecklistStore = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue;
    const items = normalizeChecklistItems(value);
    // Une liste vidée disparaît : elle ne dit rien de plus que son absence, et
    // le magasin garderait sinon une entrée par évènement jamais rempli.
    if (items.length) out[key] = items;
  }
  return out;
}

/** Étapes d'un évènement, dans l'ordre où elles ont été posées. */
export const checklistFor = (store: ChecklistStore, eventId: string): ChecklistItem[] =>
  (eventId && store[eventId]) || [];

/** Remplace la liste d'un évènement (ajout, coche, retrait passent par là). */
export function setChecklist(
  store: ChecklistStore,
  eventId: string,
  items: ChecklistItem[],
): ChecklistStore {
  if (!eventId) return normalizeChecklists(store);
  const next = { ...normalizeChecklists(store), [eventId]: normalizeChecklistItems(items) };
  return normalizeChecklists(next);
}

export function addChecklistItem(store: ChecklistStore, eventId: string, text: string): ChecklistStore {
  const item = newChecklistItem(text);
  if (!item || !eventId) return normalizeChecklists(store);
  return setChecklist(store, eventId, [...checklistFor(normalizeChecklists(store), eventId), item]);
}

export function toggleChecklistItem(store: ChecklistStore, eventId: string, itemId: string): ChecklistStore {
  const items = checklistFor(normalizeChecklists(store), eventId);
  return setChecklist(store, eventId, items.map((i) => {
    if (i.id !== itemId) return i;
    const done = !i.done;
    /* L'horodatage naît à la coche et meurt au décochage : gardé, il daterait
       d'une étape rouverte une ligne du journal qui ne correspond plus à rien.
       Recocher plus tard donne une nouvelle date, qui est la bonne. */
    return { ...i, done, doneAt: done ? new Date().toISOString() : null };
  }));
}

export function removeChecklistItem(store: ChecklistStore, eventId: string, itemId: string): ChecklistStore {
  const items = checklistFor(normalizeChecklists(store), eventId);
  return setChecklist(store, eventId, items.filter((i) => i.id !== itemId));
}

/** Oublie la liste d'un évènement — à sa suppression, sinon elle survivrait. */
export function dropChecklist(store: ChecklistStore, eventId: string): ChecklistStore {
  const next = normalizeChecklists(store);
  delete next[eventId];
  return next;
}

/**
 * Transfère une liste d'un identifiant à un autre. Sert à une seule chose,
 * mais indispensable : les étapes saisies AVANT que l'évènement existe (donc
 * avant que Google lui donne son id) sont tenues dans le formulaire, puis
 * posées ici sous l'id définitif à l'enregistrement.
 */
export function adoptChecklist(store: ChecklistStore, items: ChecklistItem[], eventId: string): ChecklistStore {
  const clean = normalizeChecklistItems(items);
  if (!eventId || clean.length === 0) return normalizeChecklists(store);
  return setChecklist(store, eventId, clean);
}

/**
 * Étapes cochées des évènements rattachés à au moins un objectif de l'année.
 *
 * Rendue ici et pas dans la page Vie RPG parce que c'est une lecture du magasin
 * des étapes, pas un calcul d'XP : le barème (`EVENT_STEP_XP`) reste chez ses
 * frères, dans lib/lifeRpgCategories.jsx.
 *
 * `eventRpg` est le second magasin, écrit par l'agenda : `{ [id d'évènement]:
 * { categories, title } }`. Un évènement sans objectif rattaché ne rapporte
 * rien — cocher les étapes d'un créneau qu'on n'a relié à aucune carte ne dit
 * pas vers quoi on a avancé.
 */
export interface CheckedStep {
  eventId: string;
  itemId: string;
  label: string;
  /** ISO, ou `null` si l'étape a été cochée avant qu'on date les coches. */
  ts: string | null;
  categories: string[];
}

export function checkedStepsFor(
  store: ChecklistStore,
  eventRpg: Record<string, { categories?: unknown; title?: unknown }> | null | undefined,
): CheckedStep[] {
  const lists = normalizeChecklists(store);
  const out: CheckedStep[] = [];
  for (const [eventId, items] of Object.entries(lists)) {
    const entry = (eventRpg || {})[eventId];
    const categories = Array.isArray(entry?.categories)
      ? entry.categories.map(String).filter(Boolean)
      : [];
    if (categories.length === 0) continue;
    for (const item of items) {
      if (!item.done) continue;
      out.push({
        eventId,
        itemId: item.id,
        label: `${String(entry?.title || "")}`.trim()
          ? `${String(entry?.title).trim()} · ${item.text}`
          : item.text,
        ts: item.doneAt || null,
        categories,
      });
    }
  }
  return out;
}

/** « 2/3 » : ce qu'affiche le bloc dans la grille. */
export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  const list = normalizeChecklistItems(items);
  return { done: list.filter((i) => i.done).length, total: list.length };
}
