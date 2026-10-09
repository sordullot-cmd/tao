/* ─── Comptes archivés (eval passés en funded) ───────────────────────────
   Quand un compte eval atteint son objectif et passe funded, on NE modifie
   plus le compte eval : on crée un tout nouveau compte funded vierge, et on
   « archive » l'ancien compte eval. Le compte archivé garde ses trades en
   base (donc ses stats restent visibles dans la page Stratégies, qui charge
   TOUS les trades), mais il est retiré partout ailleurs sur le site :
   sélecteur de comptes, sélection par défaut, KPI/totaux de la page Comptes,
   dashboard, calendrier, trades.

   Persistance : localStorage uniquement (même choix que funded_meta, pas de
   migration DB). Meta par account.id : date d'archivage + id du compte funded
   enfant créé au passage. */

const ARCHIVED_META_KEY = "tao_accounts_archived_meta";

/** ID « virtuel » de la carte/vue détail qui agrège tous les comptes eval passés. */
export const ARCHIVED_VIEW_ID = "__archived_accounts__";

export function readArchivedMeta() {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(ARCHIVED_META_KEY) || "{}"); } catch { return {}; }
}

export function writeArchivedMeta(meta) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(ARCHIVED_META_KEY, JSON.stringify(meta || {})); } catch {}
}

/** Renvoie true si l'id de compte est archivé selon la meta fournie. */
export function isArchivedAccount(accountId, meta) {
  if (!accountId || !meta) return false;
  return Object.prototype.hasOwnProperty.call(meta, accountId);
}

/** Liste des ids de comptes archivés. */
export function archivedIds(meta) {
  return meta ? Object.keys(meta) : [];
}
