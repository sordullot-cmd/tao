import { getCurrencySymbol } from "@/lib/userPrefs";

/* Lecture d'un trade du journal, telle que la page Étude l'affiche. Les mêmes
   règles que le playbook : un trade porte son P&L en nombre OU en chaîne selon
   l'import, et son sens en toutes lettres ou en abrégé. */

export const pnlOf = (tr) => (typeof tr?.pnl === "number" ? tr.pnl : Number(tr?.pnl) || 0);
export const dayOf = (tr) => String(tr?.date || "").slice(0, 10);
export const sideOf = (tr) => (String(tr?.direction || "").toLowerCase().startsWith("s") ? "Short" : "Long");

export function fmtMoney(value) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${getCurrencySymbol()}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
