/**
 * Playbook — le modèle, hors React.
 *
 * Une fiche de playbook décrit UN setup comme on voudrait le relire juste
 * avant de cliquer : à quoi il ressemble (les captures), dans quel contexte il
 * vaut quelque chose, ce qui le déclenche, où l'on entre, où l'on sort dans les
 * deux sens, et ce qui l'annule. Puis la mémoire : des exemples qui ont marché,
 * d'autres qui ont échoué, et les erreurs qu'on y refait.
 *
 * ── Pourquoi pas dans « Stratégies » ──────────────────────────────────────
 * Une stratégie (table Supabase) est une liste de règles à cocher trade par
 * trade : elle sert à mesurer l'adhérence. Une fiche de playbook est un
 * document qu'on lit — des captures, du texte, des exemples. Les fusionner
 * aurait obligé à migrer la table pour y loger des images et des listes
 * d'exemples. La fiche se RATTACHE donc à une stratégie par son id, et c'est ce
 * lien qui lui donne ses statistiques (backtests et trades réels).
 *
 * ── Les captures sont des URL, pas des données ────────────────────────────
 * Le magasin passe par `useCloudState`, donc par un JSON unique réécrit à
 * chaque frappe. Une image en base64 y pèserait des centaines de kilo-octets,
 * renvoyés à Supabase à chaque caractère tapé dans un champ voisin. Les images
 * vont dans le stockage (cf. `lib/playbook/images.ts`), la fiche n'en garde
 * que l'adresse.
 */

import { summarize, type BacktestEntry, type JournalSummary } from "@/lib/backtest/journal";

export type SetupStatus = "active" | "testing" | "retired";
export type ExampleOutcome = "win" | "loss";

export interface PlaybookImage {
  id: string;
  url: string;
  caption: string;
}

export interface PlaybookExample {
  id: string;
  outcome: ExampleOutcome;
  /** YYYY-MM-DD — la date du trade sur le graphique. Vide si inconnue. */
  date: string;
  symbol: string;
  /** Multiple de risque obtenu, `null` s'il n'a pas été relevé. */
  r: number | null;
  /** Ce que l'exemple enseigne — pourquoi il a marché, ou pas. */
  note: string;
  /** URL de la capture, vide sans capture. */
  image: string;
}

/** Une ligne de liste (checklist, erreurs). Un id plutôt que l'index : la
 *  clé React doit survivre à la suppression d'une ligne du milieu, sinon le
 *  champ en cours d'édition saute sur sa voisine. */
export interface PlaybookItem {
  id: string;
  text: string;
}

export interface PlaybookSetup {
  id: string;
  name: string;
  status: SetupStatus;
  /** La stratégie (table `strategies`) dont la fiche tire ses statistiques. */
  strategyId: string | null;

  // Où et quand — ajoutés aux critères demandés : un setup juste sur NQ en
  // killzone de New York ne vaut rien sur l'or à midi.
  markets: string;
  timeframes: string;
  sessions: string;

  context: string;
  setup: string;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  invalidation: string;
  /** Gestion une fois en position : BE, partiels, trailing. */
  management: string;
  /** Risque par trade et conditions pour le réduire. */
  risk: string;

  /** Les conditions à vérifier avant d'entrer, une par ligne. */
  checklist: PlaybookItem[];
  screenshots: PlaybookImage[];
  examples: PlaybookExample[];
  mistakes: PlaybookItem[];
  notes: string;

  createdAt: string;
  updatedAt: string;
}

export interface Playbook {
  /** Ordre d'affichage, géré par l'utilisateur : nouvelle fiche en tête. */
  setups: PlaybookSetup[];
}

export const STATUSES: { id: SetupStatus; label: string }[] = [
  { id: "active", label: "Actif" },
  { id: "testing", label: "En test" },
  { id: "retired", label: "Archivé" },
];

export function emptyPlaybook(): Playbook {
  return { setups: [] };
}

let seq = 0;
/** Un id unique même pour deux créations dans la même milliseconde (un
 *  collage de plusieurs images, par exemple). */
export function newId(prefix: string): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export function emptySetup(name = ""): PlaybookSetup {
  const now = new Date().toISOString();
  return {
    id: newId("pb"),
    name,
    status: "testing",
    strategyId: null,
    markets: "", timeframes: "", sessions: "",
    context: "", setup: "", entry: "", stopLoss: "", takeProfit: "", invalidation: "",
    management: "", risk: "",
    checklist: [], screenshots: [], examples: [], mistakes: [],
    notes: "",
    createdAt: now, updatedAt: now,
  };
}

/* ── Normalisation ──────────────────────────────────────────────────────── */

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function normalizeItems(raw: unknown, prefix: string): PlaybookItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      // Une liste de chaînes nues (saisie à la main, import) reste lisible.
      if (typeof item === "string") return { id: `${prefix}${i}`, text: item };
      if (!item || typeof item !== "object") return null;
      const o = item as Partial<PlaybookItem>;
      return { id: str(o.id) || `${prefix}${i}`, text: str(o.text) };
    })
    .filter((x): x is PlaybookItem => x !== null);
}

function normalizeImages(raw: unknown): PlaybookImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (typeof item === "string") return item ? { id: `img${i}`, url: item, caption: "" } : null;
      if (!item || typeof item !== "object") return null;
      const o = item as Partial<PlaybookImage>;
      const url = str(o.url);
      // Une capture sans adresse n'affiche rien : elle n'a pas à occuper une case.
      return url ? { id: str(o.id) || `img${i}`, url, caption: str(o.caption) } : null;
    })
    .filter((x): x is PlaybookImage => x !== null);
}

function normalizeExample(raw: unknown, i: number): PlaybookExample | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<PlaybookExample> & { r?: unknown };
  /* Même piège que dans le journal de backtest : `Number("")` et `Number(null)`
     valent 0, et un R non relevé passerait pour un scratch. */
  const rawR: unknown = o.r;
  const hasR = rawR !== null && rawR !== undefined && rawR !== "" && Number.isFinite(Number(rawR));
  return {
    id: str(o.id) || `ex${i}`,
    outcome: o.outcome === "loss" ? "loss" : "win",
    date: str(o.date).slice(0, 10),
    symbol: str(o.symbol).trim(),
    r: hasR ? Number(rawR) : null,
    note: str(o.note),
    image: str(o.image),
  };
}

function normalizeSetup(raw: unknown, i: number): PlaybookSetup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<PlaybookSetup>;
  const base = emptySetup();
  const createdAt = str(o.createdAt) || base.createdAt;
  return {
    id: str(o.id) || `pb${i}`,
    name: str(o.name),
    status: STATUSES.some(s => s.id === o.status) ? (o.status as SetupStatus) : "testing",
    /* Ramené à une chaîne : Supabase rend des uuid, les stratégies locales des
       nombres, et la comparaison se fait au `===`. */
    strategyId: o.strategyId == null || o.strategyId === "" ? null : String(o.strategyId),
    markets: str(o.markets), timeframes: str(o.timeframes), sessions: str(o.sessions),
    context: str(o.context), setup: str(o.setup), entry: str(o.entry),
    stopLoss: str(o.stopLoss), takeProfit: str(o.takeProfit), invalidation: str(o.invalidation),
    management: str(o.management), risk: str(o.risk),
    checklist: normalizeItems(o.checklist, "ck"),
    screenshots: normalizeImages(o.screenshots),
    examples: (Array.isArray(o.examples) ? o.examples : [])
      .map(normalizeExample)
      .filter((x): x is PlaybookExample => x !== null),
    mistakes: normalizeItems(o.mistakes, "mk"),
    notes: str(o.notes),
    createdAt,
    updatedAt: str(o.updatedAt) || createdAt,
  };
}

/**
 * Normalise le magasin à la lecture — la voie du dépôt pour `useCloudState` :
 * un champ ajouté plus tard prend sa valeur par défaut chez les anciens
 * utilisateurs, sans migration.
 */
export function normalizePlaybook(raw: unknown): Playbook {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<Playbook>;
  const seen = new Set<string>();
  const setups = (Array.isArray(src.setups) ? src.setups : [])
    .map(normalizeSetup)
    .filter((s): s is PlaybookSetup => s !== null)
    // Deux fiches au même id s'éditeraient l'une l'autre : la première gagne.
    .filter(s => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  return { setups };
}

/* ── Complétude ─────────────────────────────────────────────────────────── */

/** Les critères qu'une fiche doit remplir pour qu'on puisse la trader sans
 *  improviser. L'ordre est celui de la page. */
export const CRITERIA: { id: string; label: string; filled: (s: PlaybookSetup) => boolean }[] = [
  { id: "screenshots", label: "Captures", filled: s => s.screenshots.length > 0 },
  { id: "context", label: "Contexte", filled: s => s.context.trim() !== "" },
  { id: "setup", label: "Setup", filled: s => s.setup.trim() !== "" },
  { id: "entry", label: "Entrée", filled: s => s.entry.trim() !== "" },
  { id: "stopLoss", label: "Stop loss", filled: s => s.stopLoss.trim() !== "" },
  { id: "takeProfit", label: "Take profit", filled: s => s.takeProfit.trim() !== "" },
  { id: "invalidation", label: "Invalidation", filled: s => s.invalidation.trim() !== "" },
  { id: "wins", label: "Exemples gagnants", filled: s => s.examples.some(e => e.outcome === "win") },
  { id: "losses", label: "Exemples perdants", filled: s => s.examples.some(e => e.outcome === "loss") },
  { id: "mistakes", label: "Erreurs", filled: s => s.mistakes.some(m => m.text.trim() !== "") },
  /* Les statistiques ne se remplissent pas à la main : elles existent dès
     qu'il y a quelque chose à compter. Une fiche sans aucun exemple ni
     stratégie rattachée n'a pas de chiffres — et doit le montrer. */
  { id: "stats", label: "Statistiques", filled: s => s.examples.length > 0 || s.strategyId !== null },
];

export function completeness(setup: PlaybookSetup): { done: number; total: number; missing: string[] } {
  const missing = CRITERIA.filter(c => !c.filled(setup)).map(c => c.label);
  return { done: CRITERIA.length - missing.length, total: CRITERIA.length, missing };
}

/* ── Statistiques ───────────────────────────────────────────────────────── */

/**
 * Le bilan des exemples consignés dans la fiche.
 *
 * On réutilise `summarize` du journal de backtest plutôt que de recompter :
 * deux calculs du taux de réussite et du R par défaut finiraient par diverger,
 * et la fiche dirait autre chose que la page Backtest pour les mêmes trades.
 */
export function exampleStats(examples: PlaybookExample[]): JournalSummary {
  return summarize(examples.map(e => ({ outcome: e.outcome, r: e.r }) as BacktestEntry));
}

export interface TradeStats {
  count: number;
  wins: number;
  losses: number;
  /** % entre 0 et 100, trades à 0 exclus du dénominateur. */
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  /** Gain moyen / perte moyenne, `null` sans gagnant ou sans perdant. */
  payoff: number | null;
}

/** Bilan des trades réels rattachés à la stratégie de la fiche. Le P&L vient
 *  du broker (import ou synchro) : c'est la seule source fiable des chiffres. */
export function tradeStats(trades: { pnl?: number | string | null }[]): TradeStats {
  let wins = 0, losses = 0, totalPnl = 0, gain = 0, loss = 0;
  for (const tr of trades) {
    const pnl = Number(tr.pnl) || 0;
    totalPnl += pnl;
    if (pnl > 0) { wins += 1; gain += pnl; }
    else if (pnl < 0) { losses += 1; loss += -pnl; }
  }
  const decided = wins + losses;
  return {
    count: trades.length,
    wins, losses,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    totalPnl,
    avgPnl: trades.length > 0 ? totalPnl / trades.length : 0,
    payoff: wins > 0 && losses > 0 ? (gain / wins) / (loss / losses) : null,
  };
}

/**
 * Les trades rattachés à une stratégie, d'après la table `trade_strategies`.
 *
 * La table est indexée par l'id du trade, mais d'anciennes affectations
 * portent encore la clé composite `date+symbole+entrée` (cf. DashboardPage) :
 * les deux sont essayées, sinon ces trades disparaîtraient des stats.
 */
export function tradesOfStrategy<Tr extends { id?: unknown; date?: unknown; symbol?: unknown; entry?: unknown }>(
  trades: Tr[],
  links: Record<string, (string | number)[]>,
  strategyId: string | null,
): Tr[] {
  if (!strategyId) return [];
  const has = (key: string) => (links[key] || []).some(id => String(id) === strategyId);
  return trades.filter(tr => {
    if (tr.id != null && has(String(tr.id))) return true;
    if (tr.date == null || tr.symbol == null || tr.entry == null) return false;
    const k1 = `${tr.date}${tr.symbol}${tr.entry}`;
    const k2 = `${tr.date}${tr.symbol}${Number.parseFloat(String(tr.entry)).toFixed(2)}`;
    return has(k1) || has(k2);
  });
}
