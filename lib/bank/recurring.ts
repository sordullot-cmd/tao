/**
 * Les dépenses qui REVIENNENT — abonnements, loyers, mensualités.
 *
 * C'est le chiffre qui manque à « ce que j'ai dépensé » : sur 1 800 € sortis,
 * savoir que 1 100 € repartiront le mois prochain quoi qu'il arrive n'est pas la
 * même information que le total. Aucune banque ne le dit ; il se déduit du
 * relevé, et c'est tout ce que fait ce module.
 *
 * ── La règle, et pourquoi elle est prudente ────────────────────────────────
 * Une dépense est réputée récurrente quand une même contrepartie revient sur
 * PLUSIEURS MOIS avec un montant STABLE. Les deux conditions comptent :
 *   — plusieurs mois, parce que trois courses chez le même marchand la même
 *     semaine ne sont pas un abonnement ;
 *   — montant stable, parce qu'un supermarché revient tous les mois lui aussi,
 *     mais à 40 € puis 130 € ; un abonnement, non.
 * Deux mois suffisent : un historique de banque en rend souvent trois, exiger
 * trois occurrences ne laisserait rien passer le premier mois.
 *
 * Ce que la règle rate est assumé : un abonnement annuel, une souscription du
 * mois dernier, un loyer viré à un particulier dont le libellé change de
 * référence à chaque fois. Mieux vaut manquer une dépense récurrente que d'en
 * inventer une — le chiffre sert à se rassurer sur ce qui est engagé, et un
 * total gonflé par des courses ne rassure sur rien.
 *
 * La DÉTECTION se fait sur l'historique le plus large disponible ; la SOMME, sur
 * la fenêtre affichée. Les deux listes sont donc distinctes, et c'est voulu :
 * chercher la récurrence dans un mois isolé ne trouverait jamais rien.
 *
 * Module PUR : pas de React, pas de `t()`.
 */

import { findMerchant } from "@/lib/bank/merchants";
import type { BankTransaction } from "@/lib/bank/transactions";

/** Mois distincts qu'une contrepartie doit toucher pour être dite récurrente. */
const MIN_MONTHS = 2;

/** Écart toléré entre le plus gros et le plus petit montant d'une contrepartie.
 *  Assez large pour un abonnement qui augmente ou une facture indexée, assez
 *  serré pour écarter un marchand chez qui on passe au hasard. */
const MAX_SPREAD = 1.35;

/** En dessous, on ne se prononce pas : deux euros par mois ne pèsent sur aucune
 *  décision, et les frais de tenue de compte feraient du bruit dans la liste. */
const MIN_AMOUNT = 1;

/**
 * Ce qui identifie la CONTREPARTIE d'un débit, `null` si le libellé n'en dit
 * rien.
 *
 * L'enseigne reconnue d'abord — c'est la seule forme stable, le libellé brut
 * d'une carte portant la date et le numéro de terminal. À défaut, les premiers
 * mots du libellé, chiffres retirés : c'est ce qui reste identique d'un
 * prélèvement au suivant (« PRLV SEPA FONCIA 04421 » et « PRLV SEPA FONCIA
 * 04422 » donnent la même clé).
 */
export function counterpartyKey(tx: BankTransaction): string | null {
  const merchant = findMerchant(tx);
  if (merchant) return `m:${merchant.slug}`;

  const words = `${tx.label ?? ""} ${tx.detail ?? ""}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 3);

  return words.length > 0 ? `l:${words.join(" ")}` : null;
}

/**
 * Les contreparties dont les débits reviennent, lues sur tout l'historique
 * fourni.
 *
 * Rendue à part de `recurringOf` pour que l'appelant puisse la calculer UNE fois
 * sur un historique long et la réutiliser sur plusieurs fenêtres.
 */
export function recurringKeys(history: BankTransaction[]): Set<string> {
  const seen = new Map<string, { months: Set<string>; min: number; max: number }>();

  for (const tx of history) {
    if (tx.amount >= 0 || !tx.date) continue;
    const value = Math.abs(tx.amount);
    if (value < MIN_AMOUNT) continue;
    const key = counterpartyKey(tx);
    if (!key) continue;

    const row = seen.get(key) ?? { months: new Set<string>(), min: value, max: value };
    row.months.add(tx.date.slice(0, 7));
    row.min = Math.min(row.min, value);
    row.max = Math.max(row.max, value);
    seen.set(key, row);
  }

  const keys = new Set<string>();
  for (const [key, row] of seen) {
    if (row.months.size < MIN_MONTHS) continue;
    if (row.min <= 0 || row.max / row.min > MAX_SPREAD) continue;
    keys.add(key);
  }
  return keys;
}

/**
 * Les débits d'une fenêtre qui appartiennent à une contrepartie récurrente.
 *
 * `history` sert à la DÉTECTION et contient normalement `txs` : c'est le relevé
 * le plus profond dont on dispose. Sans lui, on retombe sur la fenêtre seule —
 * ce qui ne trouve rien sur un mois isolé, et c'est le comportement juste : on
 * ne peut pas dire d'une opération vue une seule fois qu'elle reviendra.
 */
export function recurringOf<T extends BankTransaction>(txs: T[], history: T[] = txs): T[] {
  const keys = recurringKeys(history);
  if (keys.size === 0) return [];
  return txs.filter((tx) => {
    if (tx.amount >= 0) return false;
    const key = counterpartyKey(tx);
    return key !== null && keys.has(key);
  });
}
