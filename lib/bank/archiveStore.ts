/**
 * Lecture et écriture de l'archive des mouvements (table `bank_transactions`).
 *
 * SERVEUR uniquement : appelé par les routes bancaires, jamais par une page. La
 * logique de clé et de fusion est à côté, dans `archive.ts`, qui reste pur —
 * ici il n'y a que l'accès à la base.
 *
 * Aucune de ces fonctions ne lève : l'archive est un CONFORT (garder le passé
 * que la banque referme), pas une dépendance. Une table absente ou une écriture
 * refusée doit dégrader l'historique, jamais faire échouer un relevé que la
 * banque, elle, a bien rendu.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { archivable, keyTransactions } from "@/lib/bank/archive";
import {
  ALL_DAYS,
  sortTransactions,
  type BankTransaction,
  type TransactionKind,
} from "@/lib/bank/transactions";

/** Lignes par requête. PostgREST plafonne ses réponses (1000 par défaut) : sans
 *  pagination explicite, un long historique serait tronqué en silence. */
const PAGE = 1000;

/** Plafond de lecture, aligné sur celui de l'agrégateur. */
const MAX_ROWS = 5000;

/** Lignes par écriture : un upsert de plusieurs milliers de lignes d'un coup
 *  dépasse les limites de taille de requête. */
const CHUNK = 500;

interface Row {
  tx_key: string;
  booked_on: string;
  label: string;
  detail: string | null;
  amount: number | string;
  currency: string;
  kind: string;
}

const rowToTransaction = (row: Row): BankTransaction => ({
  // La clé d'archive fait un identifiant de liste parfait : stable et unique
  // par compte, là où l'identifiant de l'agrégateur peut manquer.
  id: row.tx_key,
  date: row.booked_on,
  label: row.label ?? "",
  detail: row.detail,
  amount: typeof row.amount === "number" ? row.amount : parseFloat(row.amount),
  currency: row.currency || "EUR",
  kind: (row.kind || "other") as TransactionKind,
  // Rien d'en attente n'est archivé : ce qui ressort d'ici est comptabilisé.
  pending: false,
});

/** Jour d'il y a `days` jours, borne incluse — la même fenêtre que `withinDays`. */
function fromDay(days: number): string {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  const m = String(from.getMonth() + 1).padStart(2, "0");
  const d = String(from.getDate()).padStart(2, "0");
  return `${from.getFullYear()}-${m}-${d}`;
}

/**
 * Mouvements archivés d'un compte, du plus récent au plus ancien.
 *
 * `days = ALL_DAYS` ne borne rien : c'est tout ce qui a été conservé.
 */
export async function readArchivedTransactions(
  supabase: SupabaseClient,
  userId: string,
  accountUid: string,
  days: number = ALL_DAYS,
): Promise<BankTransaction[]> {
  const rows: Row[] = [];

  try {
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      let query = supabase
        .from("bank_transactions")
        .select("tx_key, booked_on, label, detail, amount, currency, kind")
        .eq("user_id", userId)
        .eq("account_uid", accountUid)
        .order("booked_on", { ascending: false })
        .range(offset, offset + PAGE - 1);

      if (days !== ALL_DAYS) query = query.gte("booked_on", fromDay(days));

      const { data, error } = await query;
      if (error || !data) break;
      rows.push(...(data as Row[]));
      if (data.length < PAGE) break;
    }
  } catch {
    return [];
  }

  return sortTransactions(rows.map(rowToTransaction));
}

/**
 * Dépose des mouvements dans l'archive, sans jamais rien y perdre.
 *
 * Écriture IDEMPOTENTE : la clé de contenu (cf. `archive.ts`) fait de la
 * relecture d'une fenêtre déjà archivée une mise à jour, pas une duplication.
 * Rien n'est supprimé — une opération absente du relevé de la banque parce que
 * sa fenêtre s'est refermée doit rester dans l'archive, c'est tout l'objet.
 *
 * Retourne le nombre de lignes présentées à la base (écrites ou confirmées).
 */
export async function archiveTransactions(
  supabase: SupabaseClient,
  userId: string,
  accountUid: string,
  transactions: BankTransaction[],
): Promise<number> {
  const keyed = keyTransactions(transactions.filter(archivable));
  if (keyed.length === 0) return 0;

  const rows = keyed.map((tx) => ({
    user_id: userId,
    account_uid: accountUid,
    tx_key: tx.key,
    booked_on: tx.date,
    label: tx.label,
    detail: tx.detail,
    amount: tx.amount,
    currency: tx.currency,
    kind: tx.kind,
    updated_at: new Date().toISOString(),
  }));

  let written = 0;
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from("bank_transactions")
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "user_id,account_uid,tx_key" });
      // Un lot en échec n'annule pas les précédents : l'archive est un ajout
      // progressif, un trou sera comblé à la prochaine lecture de la fenêtre.
      if (error) break;
      written += Math.min(CHUNK, rows.length - i);
    }
  } catch {
    return written;
  }

  return written;
}
