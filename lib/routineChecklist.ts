"use client";

/**
 * Routine du jour — une checklist PAR STRATÉGIE, et ce qui est coché aujourd'hui.
 *
 * Une routine unique supposait qu'on trade toujours pareil. Un scalp d'ouverture
 * et un swing sur FVG ne se préparent pas du tout de la même façon : mélanger
 * leurs règles dans une seule liste donne une liste dont la moitié ne s'applique
 * jamais, et un score de discipline qui ne veut plus rien dire.
 *
 * D'où un magasin à deux étages — des LISTES, chacune pouvant pointer une
 * stratégie de la table `strategies`, et une liste ACTIVE (celle de la pastille
 * et du menu de la barre d'état).
 *
 * ── CE QUI N'A PAS CHANGÉ, ET POURQUOI ────────────────────────────────────
 *
 * Les coches restent un objet PLAT `{ [id de règle]: coché }` rangé par date.
 * Les identifiants de règles sont uniques d'une liste à l'autre, donc aucune
 * migration de l'historique n'était nécessaire — et surtout, le total d'un jour
 * se DÉDUIT : une liste dont au moins une règle apparaît dans les coches du jour
 * est une liste qui a servi ce jour-là (cf. `dayProgress`). Stocker « quelle
 * liste était active le 12 mars » aurait été une troisième source de vérité à
 * tenir à jour, et fausse dès qu'on touche à deux listes dans la même journée.
 *
 * Le magasin est NORMALISÉ à la lecture, jamais migré (cf. CLAUDE.md) :
 * `normalizeRoutineStore` accepte l'ancien tableau plat de règles et l'enveloppe
 * dans une liste. Un utilisateur d'avant retrouve donc sa routine telle quelle,
 * devenue sa première liste.
 *
 * Le relais en bas de fichier joue pour les coches le rôle que `useCloudState`
 * joue pour les listes : deux lecteurs du même jour voient la même écriture tout
 * de suite. Sans lui, cocher depuis le tray ne se verrait dans la page
 * Discipline qu'au montage suivant — et paraîtrait donc perdu.
 */

import { getLocalDateString } from "@/lib/dateUtils";

export interface RoutineRule {
  id: string;
  label: string;
}

export interface RoutineList {
  id: string;
  name: string;
  /** Stratégie liée (`strategies.id`), ou `null` pour une liste libre. */
  strategyId: string | null;
  items: RoutineRule[];
}

export interface RoutineStore {
  lists: RoutineList[];
  /** Liste courante : celle de la pastille et du menu de la barre d'état. */
  activeId: string;
}

/** `{ [id de règle]: coché }`. Une règle absente vaut « pas cochée ». */
export type RoutineChecks = Record<string, boolean>;

export const ROUTINE_RULES_KEY = "tr4de_routine_rules";
export const ROUTINE_RULES_CLOUD_KEY = "routine_rules";

/** Le préfixe est public : la heatmap balaie localStorage avec. */
export const ROUTINE_CHECKS_PREFIX = "tr4de_routine_checklist_";

/** Règles servies tant que l'utilisateur n'a pas fait les siennes. */
export const DEFAULT_ROUTINE_ITEMS: RoutineRule[] = [
  { id: "biais_journalier", label: "Biais journalier défini" },
  { id: "fvg_respecte", label: "FVG respectée identifiée" },
  { id: "zones_cle", label: "Traçage des zones clé" },
];

/* Identifiant de la liste qui recueille l'ancienne routine plate. Fixe, pour que
   deux normalisations successives ne fabriquent pas deux listes différentes à
   partir du même magasin. */
export const DEFAULT_LIST_ID = "routine";
export const DEFAULT_LIST_NAME = "Routine";

/* Le hasard en plus de l'horloge : créer deux règles dans la même milliseconde
   est peu probable, mais DUPLIQUER une liste en crée autant d'un coup. Or deux
   règles de même identifiant partageraient leur coche — la case d'une liste
   cocherait celle de l'autre. */
function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const newRoutineRuleId = (): string => uid("r_");
export const newRoutineListId = (): string => uid("l_");

/* ─── Normalisation ───────────────────────────────────────────────────────── */

function normalizeRule(value: unknown): RoutineRule | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const label = String(o.label ?? "").trim();
  const id = String(o.id ?? "").trim();
  if (!id) return null;
  return { id, label };
}

function normalizeList(value: unknown): RoutineList | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  if (!id) return null;
  const items = Array.isArray(o.items)
    ? (o.items.map(normalizeRule).filter(Boolean) as RoutineRule[])
    : [];
  return {
    id,
    name: String(o.name ?? "").trim() || DEFAULT_LIST_NAME,
    strategyId: o.strategyId ? String(o.strategyId) : null,
    items,
  };
}

/**
 * Rend un magasin exploitable quoi qu'on lui donne — y compris l'ANCIENNE forme
 * (un simple tableau de règles), qui devient la première liste.
 *
 * Invariants garantis à la sortie : au moins une liste, et un `activeId` qui
 * désigne vraiment l'une d'elles. Tout le reste du module s'appuie dessus et
 * n'a donc pas à re-vérifier.
 */
export function normalizeRoutineStore(value: unknown): RoutineStore {
  const fresh = (): RoutineStore => ({
    lists: [{ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, strategyId: null, items: DEFAULT_ROUTINE_ITEMS }],
    activeId: DEFAULT_LIST_ID,
  });

  if (Array.isArray(value)) {
    /* Ancienne forme : un tableau de règles, sans notion de liste. On l'enveloppe
       plutôt que de la jeter — ce sont les règles que l'utilisateur a écrites. */
    const items = value.map(normalizeRule).filter(Boolean) as RoutineRule[];
    if (!items.length) return fresh();
    return {
      lists: [{ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, strategyId: null, items }],
      activeId: DEFAULT_LIST_ID,
    };
  }

  if (!value || typeof value !== "object") return fresh();
  const o = value as Record<string, unknown>;
  const lists = Array.isArray(o.lists)
    ? (o.lists.map(normalizeList).filter(Boolean) as RoutineList[])
    : [];
  if (!lists.length) return fresh();

  const wanted = String(o.activeId ?? "");
  // Un `activeId` périmé (liste supprimée ailleurs) retombe sur la première.
  const activeId = lists.some(l => l.id === wanted) ? wanted : lists[0].id;
  return { lists, activeId };
}

export function activeList(store: RoutineStore): RoutineList {
  return store.lists.find(l => l.id === store.activeId) ?? store.lists[0];
}

export function listById(store: RoutineStore, id: string): RoutineList | undefined {
  return store.lists.find(l => l.id === id);
}

/* ─── Mutations — pures, elles se passent au `setStore` de useCloudState ───── */

function mapList(store: RoutineStore, id: string, fn: (l: RoutineList) => RoutineList): RoutineStore {
  return { ...store, lists: store.lists.map(l => (l.id === id ? fn(l) : l)) };
}

export function setActiveList(store: RoutineStore, id: string): RoutineStore {
  return store.lists.some(l => l.id === id) ? { ...store, activeId: id } : store;
}

/** Crée une liste et la rend active — on la crée pour s'en servir. */
export function addList(store: RoutineStore, name: string, strategyId: string | null = null): RoutineStore {
  const id = newRoutineListId();
  const list: RoutineList = { id, name: name.trim() || DEFAULT_LIST_NAME, strategyId, items: [] };
  return { lists: [...store.lists, list], activeId: id };
}

export function renameList(store: RoutineStore, id: string, name: string): RoutineStore {
  const clean = name.trim();
  return clean ? mapList(store, id, l => ({ ...l, name: clean })) : store;
}

export function bindListToStrategy(store: RoutineStore, id: string, strategyId: string | null): RoutineStore {
  return mapList(store, id, l => ({ ...l, strategyId: strategyId || null }));
}

/**
 * Copie une liste, AVEC DES IDENTIFIANTS NEUFS pour ses règles.
 *
 * C'est tout l'intérêt de la fonction : partir d'une routine proche sans que
 * cocher une case de la copie coche aussi celle de l'originale — ce qui
 * arriverait mot pour mot si les identifiants étaient repris, les coches étant
 * indexées par règle et non par liste.
 */
export function duplicateList(store: RoutineStore, id: string): RoutineStore {
  const src = listById(store, id);
  if (!src) return store;
  const copy: RoutineList = {
    id: newRoutineListId(),
    name: `${src.name} (copie)`,
    strategyId: src.strategyId,
    items: src.items.map(it => ({ id: newRoutineRuleId(), label: it.label })),
  };
  return { lists: [...store.lists, copy], activeId: copy.id };
}

/**
 * Supprime une liste. L'historique des coches n'est PAS touché : les jours déjà
 * colorés dans la heatmap le restent, et `dayProgress` ignore simplement des
 * règles qu'aucune liste ne revendique plus.
 */
export function removeList(store: RoutineStore, id: string): RoutineStore {
  const lists = store.lists.filter(l => l.id !== id);
  // Plus rien : la normalisation recrée la liste par défaut plutôt que de
  // laisser un magasin sans liste active, que tout le reste suppose impossible.
  return normalizeRoutineStore({ lists, activeId: store.activeId });
}

/**
 * Ajoute une règle. L'identifiant est acceptable en paramètre parce que
 * l'appelant en a parfois besoin AVANT l'écriture — la page Discipline crée une
 * règle vide puis la passe aussitôt en édition, ce qu'elle ne peut pas faire
 * sans savoir laquelle viser.
 */
export function addRule(
  store: RoutineStore,
  listId: string,
  label: string,
  id: string = newRoutineRuleId()
): RoutineStore {
  return mapList(store, listId, l => ({
    ...l,
    items: [...l.items, { id, label: label.trim() }],
  }));
}

/** Renomme une règle. Un libellé vide la SUPPRIME — une règle sans texte ne dit rien. */
export function editRule(store: RoutineStore, listId: string, ruleId: string, label: string): RoutineStore {
  const clean = label.trim();
  return mapList(store, listId, l => ({
    ...l,
    items: clean
      ? l.items.map(it => (it.id === ruleId ? { ...it, label: clean } : it))
      : l.items.filter(it => it.id !== ruleId),
  }));
}

export function removeRule(store: RoutineStore, listId: string, ruleId: string): RoutineStore {
  return mapList(store, listId, l => ({ ...l, items: l.items.filter(it => it.id !== ruleId) }));
}

/* ─── Progression ─────────────────────────────────────────────────────────── */

export function listProgress(list: RoutineList, checks: RoutineChecks): { done: number; total: number } {
  return {
    done: list.items.reduce((n, it) => n + (checks[it.id] ? 1 : 0), 0),
    total: list.items.length,
  };
}

/**
 * Progression d'une JOURNÉE, toutes listes confondues — ce que lit la heatmap.
 *
 * Une liste compte si l'une de ses règles apparaît dans les coches du jour, même
 * décochée : la présence de la clé est la trace qu'on s'est servi de cette liste
 * ce jour-là. Cocher puis tout décocher reste donc « 0 sur 3 », et non « aucune
 * donnée » — c'est la distinction que faisait déjà l'ancienne heatmap, et la
 * perdre aurait blanchi les journées où la routine a justement été négligée.
 */
export function dayProgress(store: RoutineStore, checks: RoutineChecks): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const list of store.lists) {
    if (!list.items.some(it => it.id in checks)) continue;
    const p = listProgress(list, checks);
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

/* ─── Coches du jour ──────────────────────────────────────────────────────── */

export function routineChecksKey(date: string = getLocalDateString()): string {
  return `${ROUTINE_CHECKS_PREFIX}${date}`;
}

export function readRoutineChecks(date?: string): RoutineChecks {
  try {
    const raw = localStorage.getItem(routineChecksKey(date));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as RoutineChecks) : {};
  } catch {
    return {};
  }
}

/* Relais entre les composants qui lisent la même journée. Un `CustomEvent`
   plutôt que l'événement `storage` du navigateur : celui-ci ne se déclenche PAS
   dans l'onglet qui écrit, c'est-à-dire précisément celui où vivent les deux
   lecteurs qu'on veut accorder. */
const CHANGE_EVENT = "tr4de:routine-checklist";

export function writeRoutineChecks(checks: RoutineChecks, date?: string): RoutineChecks {
  try {
    localStorage.setItem(routineChecksKey(date), JSON.stringify(checks));
  } catch { /* quota ou storage refusé : l'état en mémoire reste juste */ }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { date: date ?? getLocalDateString(), checks } }));
  } catch { /* pas de fenêtre (SSR) : personne à prévenir */ }
  return checks;
}

/** Coche/décoche une règle du jour et rend l'état complet qui en résulte. */
export function toggleRoutineCheck(id: string, date?: string): RoutineChecks {
  const current = readRoutineChecks(date);
  return writeRoutineChecks({ ...current, [id]: !current[id] }, date);
}

/** Retire la coche d'une règle supprimée — sinon elle compterait encore. */
export function forgetRoutineCheck(id: string, date?: string): RoutineChecks {
  const current = readRoutineChecks(date);
  if (!(id in current)) return current;
  const next = { ...current };
  delete next[id];
  return writeRoutineChecks(next, date);
}

/** S'abonne aux écritures des autres lecteurs. Rend la fonction de désabonnement. */
export function onRoutineChecksChange(
  fn: (checks: RoutineChecks, date: string) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { date: string; checks: RoutineChecks } | undefined;
    if (detail) fn(detail.checks, detail.date);
  };
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
