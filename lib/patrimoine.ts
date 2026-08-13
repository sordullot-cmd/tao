/**
 * Socle de la section Finance — patrimoine.
 *
 * Porté de l'app patrimoine, dont les pages lisaient une base Postgres alimentée
 * par une connexion bancaire (Enable Banking) et l'API Kraken. tr4de n'a ni
 * l'une ni l'autre : la source de vérité devient un store `useCloudState`, saisi
 * à la main depuis la page « Actifs ». Toutes les pages Finance lisent ce même
 * store, ce qui remplace les six `useQuery` de l'original.
 *
 * Ce que le portage perd, faute d'équivalent : la synchronisation bancaire, les
 * cours de marché temps réel (`live`, variation du jour), la plus-value réalisée
 * calculée sur les avis d'opéré, et l'import de relevés PDF. Le prix d'une ligne
 * de titres se saisit donc à la main, comme le reste.
 */

import { useCloudState } from "@/lib/hooks/useCloudState";

/* ── Types ─────────────────────────────────────────────────────────────── */

export type AssetType =
  | "pea"
  | "securities"
  | "life_insurance"
  | "crypto"
  | "real_estate"
  | "savings"
  | "checking"
  | "loan"
  | "other";

/** Ligne de titres d'un portefeuille (PEA / compte-titres / crypto). */
export interface Holding {
  id: string;
  name: string;
  isin: string | null;
  quantity: number;
  /** Prix de revient unitaire (PRU). */
  avgPrice: number | null;
  /** Dernier cours connu, saisi à la main (l'original le lisait du marché). */
  price: number | null;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  /** Valeur de l'actif. Un `loan` est stocké NÉGATIF (c'est un passif). */
  balance: number;
  institution: string | null;
  /** ISO. Sert au « maj … » des en-têtes. */
  updatedAt: string | null;
  /** Portefeuilles seulement : la valeur vient alors des lignes, pas de `balance`. */
  holdings?: Holding[];
  /** Logo de l'établissement. Renseigné pour les comptes agrégés, et pour un
   *  actif saisi dont l'établissement a été reconnu dans le catalogue des
   *  banques. `bankLogo()` reste consulté à l'affichage : un logo livré avec
   *  l'application passe devant celui-ci. */
  logo?: string | null;
}

export interface HistoryPoint {
  /** ISO du jour (AAAA-MM-JJ) — un point par jour, le dernier écrase. */
  date: string;
  total: number;
}

export interface PatrimoineStore {
  assets: Asset[];
  history: HistoryPoint[];
}

/* ── Classes d'actifs ──────────────────────────────────────────────────────
   Regroupement des types : navigation, répartition et sections de la liste des
   comptes. Les COULEURS sont des couleurs d'IDENTITÉ, au même titre que les
   vignettes d'instruments de `da.jsx` : elles ne passent pas par les tokens `T`
   et ne bougent pas en thème sombre — deux classes voisines doivent rester
   distinguables, ce qu'une palette recalculée par thème ne garantit pas.
   `color` contraste ≥ 3:1 sur blanc ; `chip` est un couple fond pastel + encre
   foncée, autonome, donc lisible sur les deux thèmes. Reprises telles quelles de
   l'app d'origine, où ces contrastes avaient été validés.
   ------------------------------------------------------------------------ */

export type AssetClassSlug =
  | "investissements"
  | "crypto"
  | "immobilier"
  | "livrets"
  | "comptes"
  | "autres"
  | "passifs";

export interface AssetClass {
  slug: AssetClassSlug;
  /** Clé i18n du libellé — le libellé lui-même se lit par `classLabel()`. */
  labelKey: string;
  types: AssetType[];
  color: string;
  chip: { bg: string; text: string };
}

export const ASSET_CLASSES: AssetClass[] = [
  {
    slug: "investissements",
    labelKey: "patrimoine.class.investments",
    types: ["pea", "securities", "life_insurance"],
    color: "#0060a1",
    chip: { bg: "#d8efff", text: "#0060a1" },
  },
  {
    slug: "crypto",
    labelKey: "patrimoine.class.crypto",
    types: ["crypto"],
    color: "#9f5c04",
    chip: { bg: "#fff9d8", text: "#9f5c04" },
  },
  {
    slug: "immobilier",
    labelKey: "patrimoine.class.realEstate",
    types: ["real_estate"],
    color: "#046c39",
    chip: { bg: "#dcf5e5", text: "#046c39" },
  },
  {
    slug: "livrets",
    labelKey: "patrimoine.class.savings",
    types: ["savings"],
    color: "#5b4bc4",
    chip: { bg: "#e9e4ff", text: "#5b4bc4" },
  },
  {
    slug: "comptes",
    labelKey: "patrimoine.class.checking",
    types: ["checking"],
    color: "#9b0058",
    chip: { bg: "#ffdffa", text: "#9b0058" },
  },
  {
    slug: "autres",
    labelKey: "patrimoine.class.other",
    types: ["other"],
    color: "#4b5157",
    chip: { bg: "#eceef0", text: "#4b5157" },
  },
  // Les passifs ne sont pas une part de la répartition (montants négatifs).
  {
    slug: "passifs",
    labelKey: "patrimoine.class.liabilities",
    types: ["loan"],
    color: "#9f2f22",
    chip: { bg: "#ffe3e0", text: "#9f2f22" },
  },
];

/** Classe « Autres » en repli : un type inconnu ne doit pas faire disparaître
 *  l'actif de la liste — il atterrit dans la classe fourre-tout. */
export function classOfType(type: AssetType): AssetClass {
  return ASSET_CLASSES.find((c) => c.types.includes(type)) ?? ASSET_CLASSES[5];
}

export function classBySlug(slug: string): AssetClass | null {
  return ASSET_CLASSES.find((c) => c.slug === slug) ?? null;
}

/** Clé i18n du libellé d'un type d'actif (`patrimoine.type.pea`, …). */
export function assetTypeKey(type: AssetType): string {
  return `patrimoine.type.${type}`;
}

/** Types proposés à la saisie. `crypto` en fait partie ici — l'original le
 *  réservait au connecteur Kraken, qui n'existe pas dans tr4de. */
export const ASSET_TYPES: AssetType[] = [
  "pea",
  "securities",
  "life_insurance",
  "crypto",
  "real_estate",
  "savings",
  "checking",
  "loan",
  "other",
];

/** Types qui portent des lignes de titres (page « Titre » accessible). */
export const PORTFOLIO_TYPES: AssetType[] = ["pea", "securities", "crypto"];

export const isPortfolio = (type: AssetType): boolean =>
  PORTFOLIO_TYPES.includes(type);

/* ── Valorisation ──────────────────────────────────────────────────────── */

/** Valorisation d'une ligne : au dernier cours connu, à défaut au PRU. */
export function holdingValue(h: Holding): number {
  const unit = h.price ?? h.avgPrice ?? 0;
  return h.quantity * unit;
}

/** Prix de revient total d'une ligne — `null` si aucun PRU saisi. */
export function holdingCost(h: Holding): number | null {
  return h.avgPrice === null ? null : h.quantity * h.avgPrice;
}

/** Plus-value latente d'une ligne — `null` tant que PRU et cours ne sont pas
 *  tous deux connus (sans les deux, il n'y a rien à comparer). */
export function holdingGain(h: Holding): number | null {
  if (h.avgPrice === null || h.price === null) return null;
  return h.quantity * (h.price - h.avgPrice);
}

export function holdingGainPct(h: Holding): number | null {
  const cost = holdingCost(h);
  const gain = holdingGain(h);
  if (gain === null || cost === null || cost === 0) return null;
  return (gain / cost) * 100;
}

/**
 * Valeur d'un actif. Un portefeuille qui porte des lignes vaut la somme de ses
 * lignes — `balance` n'est alors plus consulté, sinon la valeur saisie sur le
 * compte et celle de ses titres pourraient diverger sans qu'on sache laquelle
 * fait foi.
 */
export function assetValue(a: Asset): number {
  if (a.holdings && a.holdings.length > 0) {
    return a.holdings.reduce((s, h) => s + holdingValue(h), 0);
  }
  return a.balance || 0;
}

/** Plus-value latente d'un actif — `null` si aucune de ses lignes n'est chiffrée. */
export function assetGain(a: Asset): number | null {
  if (!a.holdings || a.holdings.length === 0) return null;
  const gains = a.holdings.map(holdingGain).filter((g): g is number => g !== null);
  return gains.length > 0 ? gains.reduce((s, g) => s + g, 0) : null;
}

export interface NetWorth {
  /** Somme des actifs (valeurs positives). */
  gross: number;
  /** Somme des passifs — négatif ou nul. */
  liabilities: number;
  /** Patrimoine net : actifs − passifs. */
  total: number;
}

export function netWorth(assets: Asset[]): NetWorth {
  let gross = 0;
  let liabilities = 0;
  for (const a of assets) {
    const v = assetValue(a);
    if (v < 0) liabilities += v;
    else gross += v;
  }
  return {
    gross: round2(gross),
    liabilities: round2(liabilities),
    total: round2(gross + liabilities),
  };
}

/** Actifs d'une classe, du plus lourd au plus léger. */
export function assetsOfClass(assets: Asset[], cls: AssetClass): Asset[] {
  return assets
    .filter((a) => cls.types.includes(a.type))
    .sort((x, y) => assetValue(y) - assetValue(x));
}

/** Classes non vides, dans l'ordre de `ASSET_CLASSES`. */
export function sectionsByClass(
  assets: Asset[],
): { cls: AssetClass; assets: Asset[]; total: number }[] {
  return ASSET_CLASSES.map((cls) => {
    const list = assetsOfClass(assets, cls);
    return {
      cls,
      assets: list,
      total: round2(list.reduce((s, a) => s + assetValue(a), 0)),
    };
  }).filter((s) => s.assets.length > 0);
}

/**
 * Part d'un montant dans le total des actifs POSITIFS.
 *
 * Les passifs sont exclus du dénominateur : une répartition se lit sur ce qu'on
 * possède. Un passif n'a donc pas de part — d'où le `null`, que l'appelant rend
 * par un tiret plutôt que par « 0 % », qui se lirait comme « négligeable ».
 */
export function shareOf(value: number, positiveTotal: number): number | null {
  if (value <= 0 || positiveTotal <= 0) return null;
  return (value / positiveTotal) * 100;
}

/* ── Historique ────────────────────────────────────────────────────────────
   L'original reconstruisait la courbe à partir des relevés bancaires
   quotidiens. Ici on empile un point par jour d'ouverture de la page : c'est
   l'équivalent le plus proche sans source externe, et la courbe se remplit au
   fil de l'usage plutôt que rétroactivement.
   ------------------------------------------------------------------------ */

export const dayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Pose le point du jour. Idempotent : rouvrir la page dix fois n'ajoute pas dix
 * points, le dernier total du jour écrase le précédent. Retourne l'historique
 * inchangé (même référence) si le point est déjà à jour — l'appelant peut donc
 * comparer par identité et éviter une écriture inutile dans le store.
 */
export function withTodayPoint(history: HistoryPoint[], total: number): HistoryPoint[] {
  const today = dayKey();
  const list = Array.isArray(history) ? history : [];
  const last = list[list.length - 1];
  if (last && last.date === today) {
    if (last.total === total) return list;
    return [...list.slice(0, -1), { date: today, total }];
  }
  return [...list, { date: today, total }];
}

/** Points de `PnlChart`, qui lit `{ date, cum }` et non `{ date, total }`. */
export function toChartPoints(history: HistoryPoint[]): { date: string; cum: number }[] {
  return (Array.isArray(history) ? history : []).map((p) => ({
    date: p.date,
    cum: p.total,
  }));
}

/* ── Store ─────────────────────────────────────────────────────────────── */

export const PATRIMOINE_LOCAL_KEY = "tr4de_patrimoine";
export const PATRIMOINE_CLOUD_KEY = "patrimoine";

export const emptyStore = (): PatrimoineStore => ({ assets: [], history: [] });

export const newAssetId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `asset-${Math.random().toString(36).slice(2)}`;

/**
 * Store partagé par toutes les pages Finance.
 *
 * Le store vient de localStorage ou du cloud : il peut être d'une version
 * antérieure, ou tronqué. On normalise donc à la lecture plutôt que de laisser
 * un `undefined` traverser tout le rendu — même parti pris que `BudgetPage`.
 */
export function usePatrimoine(): [
  PatrimoineStore,
  (updater: PatrimoineStore | ((prev: PatrimoineStore) => PatrimoineStore)) => void,
] {
  const [raw, setStore] = useCloudState<PatrimoineStore>(
    PATRIMOINE_LOCAL_KEY,
    PATRIMOINE_CLOUD_KEY,
    emptyStore(),
  );
  const store: PatrimoineStore = {
    assets: Array.isArray(raw?.assets) ? raw.assets : [],
    history: Array.isArray(raw?.history) ? raw.history : [],
  };
  return [store, setStore];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
