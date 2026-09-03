/**
 * Le CONTRAT d'un compte : ce qu'il reste à faire pour le passer financé, et
 * ce qu'on en a retiré une fois qu'il l'est.
 *
 * ── Ce que ce module ajoute ──────────────────────────────────────────────
 * L'app savait déjà additionner des P&L. Elle ne savait pas répondre aux deux
 * questions qu'on se pose vraiment devant un compte de prop firm : « combien
 * me manque-t-il, et de combien puis-je encore perdre ? » avant, « combien
 * ai-je sorti, et quand puis-je redemander ? » après. Les deux se calculent à
 * partir des trades déjà enregistrés — rien à ressaisir — plus deux choses que
 * seul l'utilisateur connaît : le barème exact de son compte, et les retraits
 * qu'il a effectivement reçus.
 *
 * ── Où ça vit ────────────────────────────────────────────────────────────
 * Dans le magasin générique (`useCloudState`), pas dans une colonne : ni
 * migration SQL, ni schéma à décrire, et le relais entre instances fait que la
 * carte du compte et la liste des comptes voient les mêmes écritures. Le
 * magasin est NORMALISÉ à la lecture plutôt que migré, si bien qu'un champ
 * ajouté plus tard prend sa valeur par défaut chez les anciens comptes.
 *
 * ── Reprise de l'existant ────────────────────────────────────────────────
 * `readFundedMeta()` (localStorage, cf. lib/propFirms) portait déjà la date de
 * passage financé et le minimum de retrait. Ces valeurs sont REPRISES à la
 * première lecture au lieu d'être perdues : personne ne doit ressaisir ce
 * qu'il avait déjà renseigné.
 */

import { parseAccountSize, readFundedMeta } from "@/lib/propFirms";
import { firmBrandId } from "@/lib/accountBrand";
import { resolveAccountRules, type AccountRules } from "@/lib/propFirmRules";
import { tradeInstant, type DatedTrade } from "@/lib/tradeOrder";

export const CONTRACTS_KEY = "tr4de_account_contracts";
export const CONTRACTS_CLOUD_KEY = "account_contracts";

/** Un retrait effectivement demandé, avec ce que l'utilisateur en sait. */
export interface Payout {
  id: string;
  /** Jour du retrait, `AAAA-MM-JJ`. */
  date: string;
  amount: number;
  /** « en attente » tant que la firme n'a pas versé. */
  pending?: boolean;
  note?: string;
}

/**
 * Ce que l'utilisateur a posé LUI-MÊME sur ce compte.
 *
 * Tout ce qui vaut `null` suit le barème de la firme : c'est ce qui permet à
 * une grille corrigée dans lib/propFirmRules de profiter aux comptes qui n'ont
 * jamais été édités, sans écraser ceux qui l'ont été.
 */
export interface AccountContract {
  target: number | null;
  maxDD: number | null;
  minDays: number | null;
  dailyLoss: number | null;
  payoutMin: number | null;
  payoutDays: number | null;
  payoutWinDays: number | null;
  /** Jour de passage financé : les compteurs du financé repartent de là. */
  fundedAt: string | null;
  payouts: Payout[];
}

export type ContractStore = Record<string, AccountContract>;

const EMPTY: AccountContract = {
  target: null, maxDD: null, minDays: null, dailyLoss: null,
  payoutMin: null, payoutDays: null, payoutWinDays: null,
  fundedAt: null, payouts: [],
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const dayOf = (v: unknown): string => String(v ?? "").slice(0, 10);

/** Un contrat lisible, quelle que soit la forme trouvée dans le magasin. */
export function normalizeContract(raw: unknown): AccountContract {
  const r = (raw || {}) as Record<string, unknown>;
  const payouts = Array.isArray(r.payouts) ? r.payouts : [];
  return {
    target: num(r.target),
    maxDD: num(r.maxDD),
    minDays: num(r.minDays),
    dailyLoss: num(r.dailyLoss),
    payoutMin: num(r.payoutMin),
    payoutDays: num(r.payoutDays),
    payoutWinDays: num(r.payoutWinDays),
    fundedAt: dayOf(r.fundedAt) || null,
    payouts: payouts
      .map((p, i) => {
        const o = (p || {}) as Record<string, unknown>;
        const amount = num(o.amount) ?? 0;
        const date = dayOf(o.date);
        if (!date) return null;
        return {
          id: String(o.id ?? `${date}-${i}`),
          date,
          amount,
          pending: o.pending === true,
          note: o.note ? String(o.note) : undefined,
        } as Payout;
      })
      .filter((p): p is Payout => p !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  };
}

/**
 * Le magasin entier, normalisé, complété par les métadonnées « financé » de
 * l'ancienne version pour les comptes qui n'ont pas encore de contrat propre.
 */
export function normalizeStore(raw: unknown): ContractStore {
  const src = (raw || {}) as Record<string, unknown>;
  const out: ContractStore = {};
  for (const [id, v] of Object.entries(src)) out[id] = normalizeContract(v);

  /* Reprise : `funded_at` et `funded_payout_min` étaient déjà renseignés sur la
     page Comptes. On ne les recopie que là où le contrat ne dit rien — une
     valeur saisie ici doit rester la plus forte. */
  const legacy = readFundedMeta();
  for (const [id, meta] of Object.entries(legacy || {})) {
    const cur = out[id] || { ...EMPTY };
    out[id] = {
      ...cur,
      fundedAt: cur.fundedAt ?? (dayOf(meta?.funded_at) || null),
      payoutMin: cur.payoutMin ?? num(meta?.funded_payout_min),
      maxDD: cur.maxDD ?? num(meta?.funded_max_dd),
    };
  }
  return out;
}

/** Le contrat d'un compte, jamais `undefined`. */
export function contractOf(store: ContractStore | null | undefined, accountId: string): AccountContract {
  return (store || {})[accountId] || { ...EMPTY };
}

/** Lecture SYNCHRONE, hors composant — la liste des comptes en a besoin. */
export function readContracts(): ContractStore {
  if (typeof window === "undefined") return {};
  try {
    return normalizeStore(JSON.parse(localStorage.getItem(CONTRACTS_KEY) || "{}"));
  } catch {
    return normalizeStore({});
  }
}

/* ─── Objectifs effectifs ─────────────────────────────────────────────────── */

export interface Objectives {
  target: number;
  maxDD: number;
  trailing: boolean;
  minDays: number;
  dailyLoss: number;
  payoutMin: number;
  payoutDays: number;
  payoutWinDays: number;
  winDayMin: number;
  /** Barème de la firme, repli générique, ou valeurs saisies à la main. */
  source: "firm" | "default" | "custom";
}

/** Le barème de la firme, écrasé champ par champ par ce que l'utilisateur a posé. */
export function resolveObjectives(contract: AccountContract, rules: AccountRules): Objectives {
  const pick = (mine: number | null, theirs: number) => (mine == null ? theirs : mine);
  const edited = [
    contract.target, contract.maxDD, contract.minDays, contract.dailyLoss,
    contract.payoutMin, contract.payoutDays, contract.payoutWinDays,
  ].some(v => v != null);
  return {
    target: pick(contract.target, rules.target),
    maxDD: pick(contract.maxDD, rules.maxDD),
    trailing: rules.trailing,
    minDays: pick(contract.minDays, rules.minDays),
    dailyLoss: pick(contract.dailyLoss, rules.dailyLoss),
    payoutMin: pick(contract.payoutMin, rules.payoutMin),
    payoutDays: pick(contract.payoutDays, rules.payoutDays),
    payoutWinDays: pick(contract.payoutWinDays, rules.payoutWinDays),
    winDayMin: rules.winDayMin,
    source: edited ? "custom" : rules.source,
  };
}

/* ─── Progression ────────────────────────────────────────────────────────── */

interface ContractTrade extends DatedTrade {
  pnl?: unknown;
}

/** Les trades postérieurs à `since` (jour inclus), du plus ancien au plus récent. */
function since(trades: ContractTrade[] | null | undefined, from: string | null): ContractTrade[] {
  const floor = from ? `${from}T00:00:00` : "";
  return [...(trades || [])]
    .filter(tr => dayOf(tr?.date))
    .map(tr => ({ tr, at: tradeInstant({ ...tr, date: dayOf(tr.date) }) }))
    .filter(({ at }) => !floor || at >= floor)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(({ tr }) => tr);
}

/** P&L par jour tradé, dans l'ordre. */
function dailyPnl(trades: ContractTrade[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const tr of trades) {
    const d = dayOf(tr.date);
    byDay.set(d, (byDay.get(d) || 0) + (Number(tr.pnl) || 0));
  }
  return byDay;
}

export interface EvalProgress {
  pnl: number;
  /** Le plus haut cumul atteint — c'est lui qui fait monter un drawdown trailing. */
  peak: number;
  target: number;
  /** 0 à 1 — borné, pour une barre qui ne déborde pas. */
  pct: number;
  /** Perte depuis le pic (trailing) ou depuis le départ. */
  ddUsed: number;
  maxDD: number;
  ddLeft: number;
  daysTraded: number;
  minDays: number;
  /** La pire journée, en négatif. */
  worstDay: number;
  dailyLoss: number;
  /** Tous les objectifs sont tenus : le compte peut passer financé. */
  passed: boolean;
  /** Une limite a été franchie — le compte est perdu, pas en retard. */
  breached: boolean;
}

/**
 * Où en est une évaluation.
 *
 * Le drawdown se mesure de deux façons selon la firme, et la différence n'est
 * pas un détail : STATIQUE, il se compte depuis le capital de départ ;
 * TRAILING, il suit le plus haut atteint — à +2 000 sur un compte à 2 500 de
 * marge, il reste 2 500 et non 4 500. Se tromper de mesure fait croire à une
 * réserve qui n'existe pas.
 */
export function evalProgress(trades: ContractTrade[] | null | undefined, obj: Objectives): EvalProgress {
  const list = since(trades, null);
  let cum = 0, peak = 0, worstDD = 0;
  for (const tr of list) {
    cum += Number(tr.pnl) || 0;
    if (cum > peak) peak = cum;
    const drop = obj.trailing ? peak - cum : -Math.min(0, cum);
    if (drop > worstDD) worstDD = drop;
  }

  const byDay = dailyPnl(list);
  const worstDay = byDay.size ? Math.min(0, ...byDay.values()) : 0;
  const daysTraded = byDay.size;

  const targetOk = obj.target > 0 && cum >= obj.target;
  const daysOk = daysTraded >= obj.minDays;
  const ddBreach = obj.maxDD > 0 && worstDD >= obj.maxDD;
  const dayBreach = obj.dailyLoss > 0 && -worstDay >= obj.dailyLoss;

  return {
    pnl: cum,
    peak,
    target: obj.target,
    pct: obj.target > 0 ? Math.max(0, Math.min(1, cum / obj.target)) : 0,
    ddUsed: worstDD,
    maxDD: obj.maxDD,
    ddLeft: Math.max(0, obj.maxDD - worstDD),
    daysTraded,
    minDays: obj.minDays,
    worstDay,
    dailyLoss: obj.dailyLoss,
    passed: targetOk && daysOk && !ddBreach && !dayBreach,
    breached: ddBreach || dayBreach,
  };
}

export interface AccountAxis {
  /** Valeur du compte sous laquelle l'évaluation est perdue. */
  floor: number;
  /** Valeur du compte à la cible. */
  ceiling: number;
  /** Valeur du compte maintenant. */
  current: number;
  /** Valeur de départ — le capital, ou 0 si la taille n'est pas renseignée. */
  start: number;
}

/**
 * L'évaluation vue comme un SEGMENT du compte : un plancher, un plafond, et
 * nous quelque part entre les deux.
 *
 * Le plancher est le nombre qu'on regarde vraiment en séance — « 50k moins le
 * drawdown », soit la valeur à ne jamais franchir. Il ne vaut `capital − maxDD`
 * qu'au départ : sur un drawdown TRAILING, il monte avec le plus haut atteint
 * (à +2 000 sur un compte à 2 500 de marge, le plancher est déjà remonté de
 * 2 000). L'afficher figé donnerait une réserve qui n'existe plus.
 *
 * Sans taille de compte renseignée, l'axe retombe en P&L pur (départ à zéro,
 * plancher négatif) : la lecture reste juste, seule l'échelle change.
 */
export function accountAxis(
  capital: number | null | undefined,
  progress: EvalProgress,
  obj: Objectives,
): AccountAxis {
  const c = Number(capital);
  const start = Number.isFinite(c) && c > 0 ? c : 0;
  const lifted = obj.trailing ? Math.max(0, progress.peak) : 0;
  return {
    floor: start + lifted - obj.maxDD,
    ceiling: start + obj.target,
    current: start + progress.pnl,
    start,
  };
}

export interface PayoutState {
  /** P&L réalisé depuis le passage financé. */
  earned: number;
  /** Somme des retraits enregistrés (les en attente comptent : l'argent est sorti). */
  withdrawn: number;
  /** Ce qui reste sur le compte et n'a pas encore été retiré. */
  balance: number;
  min: number;
  daysTraded: number;
  daysRequired: number;
  winDays: number;
  winDaysRequired: number;
  /** Rien ne s'y oppose : le retrait peut être demandé maintenant. */
  eligible: boolean;
  /** Ce qu'on peut demander aujourd'hui — 0 tant qu'une condition manque. */
  available: number;
  /** Ce qui manque, en une phrase, ou `null` si rien ne manque. */
  blocker: string | null;
  /** Date du dernier retrait, pour la lecture de l'historique. */
  lastAt: string | null;
}

/**
 * Où en est un compte financé côté retraits.
 *
 * Le solde retirable n'est pas le P&L : c'est le P&L MOINS ce qui a déjà été
 * sorti. La colonne « payout dispo » de la liste des comptes montrait le P&L
 * brut, si bien qu'un retrait encaissé restait affiché comme disponible et que
 * la même somme se comptait deux fois.
 */
export function payoutState(
  trades: ContractTrade[] | null | undefined,
  contract: AccountContract,
  obj: Objectives,
): PayoutState {
  const list = since(trades, contract.fundedAt);
  const earned = list.reduce((s, tr) => s + (Number(tr.pnl) || 0), 0);
  const withdrawn = contract.payouts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = earned - withdrawn;

  const byDay = dailyPnl(list);
  const daysTraded = byDay.size;
  const winDays = [...byDay.values()].filter(v => v >= Math.max(1, obj.winDayMin)).length;

  const daysMissing = Math.max(0, obj.payoutDays - daysTraded);
  const winMissing = Math.max(0, obj.payoutWinDays - winDays);
  const belowMin = obj.payoutMin > 0 && balance < obj.payoutMin;

  /* Un seul obstacle annoncé à la fois, le plus proche du terrain : savoir
     qu'il manque « 2 jours gagnants ET 300 $ » n'aide pas plus que de savoir
     ce qui bloque en premier, et deux phrases se lisent moins vite qu'une. */
  const blocker =
    balance <= 0 ? "Rien à retirer pour le moment"
    : daysMissing > 0 ? `Encore ${daysMissing} jour${daysMissing > 1 ? "s" : ""} tradé${daysMissing > 1 ? "s" : ""}`
    : winMissing > 0 ? `Encore ${winMissing} jour${winMissing > 1 ? "s" : ""} gagnant${winMissing > 1 ? "s" : ""}`
    : belowMin ? `Minimum de retrait non atteint`
    : null;

  return {
    earned,
    withdrawn,
    balance,
    min: obj.payoutMin,
    daysTraded,
    daysRequired: obj.payoutDays,
    winDays,
    winDaysRequired: obj.payoutWinDays,
    eligible: blocker === null,
    available: blocker === null ? balance : 0,
    blocker,
    lastAt: contract.payouts[0]?.date ?? null,
  };
}

/* ─── Écritures ──────────────────────────────────────────────────────────── */

/** Identifiant d'un retrait — unique sans dépendre de `crypto`, absent en test. */
export function newPayoutId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Le magasin, un contrat remplacé. Rend un NOUVEL objet (état React). */
export function withContract(
  store: ContractStore | null | undefined,
  accountId: string,
  patch: Partial<AccountContract>,
): ContractStore {
  const base = contractOf(store, accountId);
  return { ...(store || {}), [accountId]: normalizeContract({ ...base, ...patch }) };
}

/** Le magasin, un retrait ajouté au compte. */
export function withPayout(
  store: ContractStore | null | undefined,
  accountId: string,
  payout: Omit<Payout, "id"> & { id?: string },
): ContractStore {
  const base = contractOf(store, accountId);
  const entry: Payout = { ...payout, id: payout.id || newPayoutId() };
  return withContract(store, accountId, { payouts: [entry, ...base.payouts] });
}

/** Le magasin, un retrait retiré du compte. */
export function withoutPayout(
  store: ContractStore | null | undefined,
  accountId: string,
  payoutId: string,
): ContractStore {
  const base = contractOf(store, accountId);
  return withContract(store, accountId, { payouts: base.payouts.filter(p => p.id !== payoutId) });
}

/* ─── Vue d'ensemble ─────────────────────────────────────────────────────── */

interface PayoutAccount {
  id: string;
  account_type?: string | null;
  eval_account_size?: string | null;
  firm_id?: string | null;
}

/**
 * L'état des retraits de CHAQUE compte financé, en un passage.
 *
 * Cette porte existe pour que la liste des comptes, la page d'une firme et la
 * carte d'un compte disent le même chiffre. Elles le calculaient chacune de son
 * côté — `P&L − minimum de retrait` — et se trompaient de la même façon : un
 * retrait déjà encaissé restait compté comme disponible. Un seul calcul, une
 * seule occasion de se tromper.
 */
export function payoutsByAccount(
  accounts: PayoutAccount[] | null | undefined,
  trades: (ContractTrade & { account_id?: string })[] | null | undefined,
  store: ContractStore | null | undefined,
  firmById: Map<string, { brand?: string | null; name?: string }> | null | undefined,
): Map<string, PayoutState> {
  const byAccount = new Map<string, ContractTrade[]>();
  for (const tr of trades || []) {
    const id = String(tr?.account_id ?? "");
    if (!id) continue;
    const list = byAccount.get(id);
    if (list) list.push(tr);
    else byAccount.set(id, [tr]);
  }

  const out = new Map<string, PayoutState>();
  for (const acc of accounts || []) {
    if ((acc.account_type || "live") !== "funded") continue;
    const contract = contractOf(store, acc.id);
    const firm = (acc.firm_id ? firmById?.get(acc.firm_id) : null) ?? null;
    const rules = resolveAccountRules(firmBrandId(firm), parseAccountSize(acc.eval_account_size));
    out.set(acc.id, payoutState(byAccount.get(acc.id) || [], contract, resolveObjectives(contract, rules)));
  }
  return out;
}
