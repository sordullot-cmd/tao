import { getCurrencySymbol } from "@/lib/userPrefs";

/**
 * Formate un nombre en devise avec signe optionnel.
 * fmt(123.4)       → "$123.40"
 * fmt(-50)         → "-$50.00"
 * fmt(42, true)    → "+$42.00"
 */
export const fmt = (n: number, sign = false): string => {
  const sym = getCurrencySymbol();
  const prefix = sign && n > 0 ? "+" : n < 0 ? "-" : "";
  return `${prefix}${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Montant arrondi à l'unité, pour les surfaces où les centimes n'apportent
 * rien et coûtent de la largeur (cellules du calendrier).
 * fmtInt(1158.4, true) → "+$1,158"
 */
export const fmtInt = (n: number, sign = false): string => {
  const sym = getCurrencySymbol();
  const rounded = Math.round(n);
  const prefix = sign && rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${prefix}${sym}${Math.abs(rounded).toLocaleString("en-US")}`;
};
