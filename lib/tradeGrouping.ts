/**
 * Regroupement des exécutions de la page Trades.
 *
 * À quoi ça sert : une prop firm se trade sur plusieurs comptes à la fois. Le
 * même ordre part sur cinq comptes, revient en cinq lignes identiques, et la
 * liste devient illisible — on veut UNE ligne dépliable.
 *
 * Ce que ça ne doit PAS faire, et c'est tout l'objet de ce fichier : fusionner
 * des exécutions d'un MÊME compte. Deux entrées au même prix à moins d'une
 * minute d'écart sur un seul compte sont deux trades — c'est un scale-in, le
 * geste le plus banal du scalping. Le critère d'origine ne regardait que
 * symbole + sens + prix d'entrée : sur un relevé de neuf trades, trois
 * disparaissaient dans les lignes des autres, et la ligne d'accueil affichait
 * le P&L cumulé de plusieurs trades comme s'il était celui d'un seul.
 *
 * D'où la règle : un groupe ne réunit que des comptes DISTINCTS. Un compte
 * déjà présent ouvre un nouveau groupe, même dans la fenêtre de temps.
 */

export interface GroupableTrade {
  date?: unknown;
  symbol?: unknown;
  direction?: unknown;
  entry?: unknown;
  account_id?: unknown;
  entryTime?: unknown;
  entry_time?: unknown;
}

/** Horodatage d'entrée en ms, `null` si l'heure manque ou ne se lit pas. */
const entryStamp = (t: GroupableTrade): number | null => {
  const dateStr = String(t.date || "").slice(0, 10);
  const time = t.entryTime || t.entry_time || "00:00:00";
  const m = String(time).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const v = new Date(`${dateStr}T${String(m[1]).padStart(2, "0")}:${m[2]}:${m[3] || "00"}`).getTime();
  return isNaN(v) ? null : v;
};

/** Ce qui rend deux lignes candidates au même groupe (le compte exclu). */
const shapeKey = (t: GroupableTrade): string =>
  [
    String(t.symbol || "").toUpperCase(),
    String(t.direction || "").toLowerCase(),
    Math.round((Number(t.entry) || 0) * 100),
  ].join("|");

/**
 * Rend les trades en paquets : un paquet d'un seul élément pour un trade
 * isolé, un paquet de n pour un ordre parti sur n comptes.
 *
 * L'ordre à l'intérieur d'un paquet suit l'heure d'entrée — c'est le premier
 * qui sert de ligne d'accueil.
 */
export const groupExecutions = <T extends GroupableTrade>(list: T[], windowSec = 60): T[][] => {
  const buckets = new Map<string, Array<{ t: T; ts: number | null }>>();
  for (const t of list || []) {
    const key = shapeKey(t);
    const bucket = buckets.get(key);
    if (bucket) bucket.push({ t, ts: entryStamp(t) });
    else buckets.set(key, [{ t, ts: entryStamp(t) }]);
  }

  const groups: T[][] = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    let children: T[] | null = null;
    let seenAccounts = new Set<string>();
    let lastTs: number | null = null;

    for (const item of arr) {
      /* Un compte sans id compte comme un compte à lui seul : sans cette
         convention, tous les trades non rattachés (imports anciens) se
         retrouveraient empilés sur une seule ligne. */
      const account = String(item.t.account_id ?? "");
      const nearby =
        children !== null && item.ts !== null && lastTs !== null &&
        Math.abs(item.ts - lastTs) <= windowSec * 1000;

      if (children && nearby && !seenAccounts.has(account)) {
        children.push(item.t);
        seenAccounts.add(account);
        lastTs = item.ts;
        continue;
      }
      if (children) groups.push(children);
      children = [item.t];
      seenAccounts = new Set([account]);
      lastTs = item.ts;
    }
    if (children) groups.push(children);
  }

  return groups;
};
