/**
 * Prop firms — modèle « firme parente ↔ comptes enfants ».
 *
 * Une firme (Apex, Topstep…) est créée une seule fois ; on lui rattache
 * ensuite N comptes depuis sa page détail (« paramètres » : nombre + type +
 * taille). Les comptes gardent `firm_id = null` quand ils n'appartiennent à
 * aucune firme (comptes live/démo perso).
 *
 * Ce module centralise l'accès Supabase pour que la page Comptes, la page
 * détail de la firme et les modales partagent exactement la même logique.
 */

import { createClient } from "@/lib/supabase/client";

export type AccountType = "live" | "demo" | "eval" | "funded";

export interface PropFirm {
  id: string;
  user_id: string;
  name: string;
  platform?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FirmAccount {
  id: string;
  user_id: string;
  name: string;
  broker?: string | null;
  account_type?: AccountType | null;
  eval_account_size?: string | null;
  firm_id?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

/** Seuils appliqués à tous les comptes (en % du capital du compte). */
export const DEFAULT_TARGET_PCT = 6;
export const DEFAULT_MAX_DD_PCT = 5;

export const ACCOUNT_TYPES: AccountType[] = ["eval", "funded", "live", "demo"];

/** Tailles proposées pour les comptes de prop firm. */
export const ACCOUNT_SIZES = ["25k", "50k", "100k", "150k", "250k", "300k"];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Détecte une erreur PostgREST « table/colonne absente du cache de schéma »,
 * c'est-à-dire la migration 031 non appliquée. On la remonte sous un code
 * stable pour afficher un message actionnable au lieu du jargon Supabase.
 */
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // PGRST205 = table inconnue, PGRST204 = colonne inconnue
  if (error.code === "PGRST205" || error.code === "PGRST204") return true;
  const msg = String(error.message || "");
  return /prop_firms|firm_id/.test(msg) && /schema cache|does not exist|n'existe pas/i.test(msg);
}

/** Lève une erreur normalisée à partir d'une erreur Supabase. */
function throwDbError(error: { code?: string; message?: string }): never {
  if (isMissingSchema(error)) throw new Error("MIGRATION_MISSING");
  if (error.code === "23505") throw new Error("DUPLICATE_FIRM");
  throw new Error(error.message || "Erreur inconnue");
}

/**
 * Métadonnées « funded » d'un compte, en localStorage (pas de colonne DB) :
 * date de passage funded et minimum de retrait. Partagé par la page Comptes et
 * la page détail d'une firme, pour que « Payout dispo » y soit identique.
 */
export const FUNDED_META_KEY = "tr4de_accounts_funded_meta";

export function readFundedMeta(): Record<string, { funded_at?: string; funded_payout_min?: number; funded_max_dd?: number }> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(FUNDED_META_KEY) || "{}");
  } catch {
    return {};
  }
}

export function writeFundedMeta(meta: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FUNDED_META_KEY, JSON.stringify(meta));
  } catch {}
}

/** Prévient les autres vues (sélecteurs, sidebar, dashboard) d'un changement. */
export function notifyAccountsChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("tr4de:accounts-changed"));
  } catch {}
}

/** `"50k"` → `50000`. Renvoie null si non parsable. */
export function parseAccountSize(size: unknown): number | null {
  if (size == null) return null;
  const m = String(size).match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k") return num * 1000;
  if (unit === "m") return num * 1_000_000;
  return num;
}

/**
 * Cible et drawdown max d'un compte, dérivés de sa taille. Seuils uniformes :
 * une firme ne porte pas de règles propres.
 */
export function resolveRules(capital: number | null): { profitTarget: number; maxDD: number } {
  const c = Number(capital) || 0;
  if (!c) return { profitTarget: 0, maxDD: 0 };
  return {
    profitTarget: Math.round(c * (DEFAULT_TARGET_PCT / 100)),
    maxDD: Math.round(c * (DEFAULT_MAX_DD_PCT / 100)),
  };
}

/* ─────────────────────────── Firmes ─────────────────────────── */

export async function fetchFirms(userId: string): Promise<PropFirm[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("prop_firms")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throwDbError(error);
  return (data || []) as PropFirm[];
}

export async function createFirm(
  userId: string,
  patch: Partial<PropFirm> & { name: string }
): Promise<PropFirm> {
  const sb = createClient();
  const { data, error } = await sb
    .from("prop_firms")
    .insert([
      {
        user_id: userId,
        name: patch.name.trim(),
        platform: patch.platform || null,
        notes: patch.notes || null,
      },
    ])
    .select()
    .single();
  if (error) {
    // 23505 = violation d'unicité (user_id, lower(name))
    throwDbError(error);
  }
  return data as PropFirm;
}

export async function updateFirm(firmId: string, patch: Partial<PropFirm>): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("prop_firms")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", firmId);
  if (error) {
    throwDbError(error);
  }
}

/**
 * Supprime une firme. `deleteAccounts` supprime aussi ses comptes et leurs
 * trades ; sinon les comptes sont détachés (firm_id → null) et restent
 * visibles dans la section « Autres comptes ».
 */
export async function deleteFirm(
  firmId: string,
  userId: string,
  { deleteAccounts = false }: { deleteAccounts?: boolean } = {}
): Promise<void> {
  const sb = createClient();
  if (deleteAccounts) {
    const { data: accs, error: readErr } = await sb
      .from("trading_accounts")
      .select("id")
      .eq("firm_id", firmId)
      .eq("user_id", userId);
    if (readErr) throw new Error(readErr.message);
    for (const acc of accs || []) {
      await deleteTradingAccount(acc.id as string, userId);
    }
  }
  const { error } = await sb.from("prop_firms").delete().eq("id", firmId).eq("user_id", userId);
  if (error) throwDbError(error);
  notifyAccountsChanged();
}

/* ─────────────────────────── Comptes ─────────────────────────── */

/**
 * Nom du n-ième compte d'une firme : « Apex 50k #3 ». Le suffixe numéroté
 * garantit l'unicité même quand on ajoute plusieurs comptes identiques.
 */
function buildAccountName(base: string, size: string | null, index: number): string {
  const parts = [base.trim()];
  if (size) parts.push(size);
  return `${parts.join(" ")} #${index}`;
}

/**
 * Crée `count` comptes rattachés à `firm`. Les noms sont numérotés à partir du
 * premier indice libre, en tenant compte des comptes déjà existants (on ne
 * réutilise jamais un nom déjà pris, la page Ajouter un trade résolvant les
 * comptes par nom).
 */
export async function createFirmAccounts(
  userId: string,
  firm: PropFirm,
  {
    count,
    accountType,
    size,
    namePrefix,
  }: { count: number; accountType: AccountType; size?: string | null; namePrefix?: string | null }
): Promise<FirmAccount[]> {
  const n = Math.max(1, Math.min(50, Math.floor(Number(count) || 1)));
  const base = (namePrefix || firm.name || "Compte").trim();
  // Le suffixe de nom ne reprend la taille que pour eval/funded (« Apex 50k #1 »).
  // Pour live/démo, `size` est un solde initial : il est stocké mais pas affiché
  // dans le nom.
  const sizeLabel = accountType === "eval" || accountType === "funded" ? size || null : null;
  const sb = createClient();

  // Noms déjà pris par l'utilisateur (tous comptes confondus).
  const { data: existing, error: readErr } = await sb
    .from("trading_accounts")
    .select("name")
    .eq("user_id", userId);
  if (readErr) throw new Error(readErr.message);
  const taken = new Set((existing || []).map((a) => String(a.name || "").toLowerCase()));

  const rows: Record<string, unknown>[] = [];
  let index = 1;
  for (let created = 0; created < n; created += 1) {
    let name = buildAccountName(base, sizeLabel, index);
    while (taken.has(name.toLowerCase())) {
      index += 1;
      name = buildAccountName(base, sizeLabel, index);
    }
    taken.add(name.toLowerCase());
    index += 1;
    rows.push({
      user_id: userId,
      name,
      broker: firm.platform || null,
      account_type: accountType,
      eval_account_size: size || null,
      firm_id: firm.id,
    });
  }

  const { data, error } = await sb.from("trading_accounts").insert(rows).select();
  if (error) throwDbError(error);
  notifyAccountsChanged();
  return (data || []) as FirmAccount[];
}

/** Crée un compte isolé (hors firme, ou rattaché si `firm_id` est fourni). */
export async function createTradingAccount(
  userId: string,
  patch: {
    name: string;
    broker?: string | null;
    account_type?: AccountType;
    eval_account_size?: string | null;
    firm_id?: string | null;
  }
): Promise<FirmAccount> {
  const sb = createClient();
  const { data, error } = await sb
    .from("trading_accounts")
    .insert([
      {
        user_id: userId,
        name: patch.name.trim(),
        broker: patch.broker || null,
        account_type: patch.account_type || "live",
        eval_account_size: patch.eval_account_size || null,
        firm_id: patch.firm_id || null,
      },
    ])
    .select()
    .single();
  if (error) throwDbError(error);
  notifyAccountsChanged();
  return data as FirmAccount;
}

export async function updateTradingAccount(
  accountId: string,
  patch: Partial<FirmAccount>
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("trading_accounts").update(patch).eq("id", accountId);
  if (error) throwDbError(error);
  notifyAccountsChanged();
}

/**
 * Supprime un compte ET ses trades. `apex_trades.account_id` est en
 * ON DELETE SET NULL : sans suppression explicite, les trades resteraient
 * orphelins et continueraient de compter dans certains agrégats.
 */
export async function deleteTradingAccount(accountId: string, userId: string): Promise<void> {
  const sb = createClient();
  const { error: tradesErr } = await sb
    .from("apex_trades")
    .delete()
    .eq("account_id", accountId)
    .eq("user_id", userId);
  if (tradesErr) throw new Error(tradesErr.message);
  const { error } = await sb
    .from("trading_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", userId);
  if (error) throwDbError(error);
  notifyAccountsChanged();
}

export { errMsg as firmErrorMessage };
