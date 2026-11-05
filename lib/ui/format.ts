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

/* Dates d'un échéancier. Le `T00:00:00` est ce qui empêche le décalage d'un
   jour : `new Date("2041-03-05")` se lit en UTC, et un fuseau négatif la rend
   alors au 4 mars. Le repli sur l'ISO brute vaut mieux qu'un « Invalid Date »
   quand la chaîne vient d'un store d'une version antérieure. */
const parseDay = (iso: string): Date | null => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** « mars 2041 » — l'horizon d'un crédit se lit au mois, pas au jour. */
export const fmtMonthYear = (iso: string | null | undefined): string => {
  const d = iso ? parseDay(iso) : null;
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(d);
  } catch {
    return String(iso);
  }
};

/** « 5 mars 2041 » — pour une échéance précise (prochain prélèvement). */
export const fmtDay = (iso: string | null | undefined): string => {
  const d = iso ? parseDay(iso) : null;
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(d);
  } catch {
    return String(iso);
  }
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

/**
 * Montant abrégé au millier, pour les cases où même `fmtInt` déborde (le
 * calendrier du tableau de bord, sept jours dans un tiers de page : une case
 * de 40 px ne loge pas « +$1,158 »). Une décimale sous 10 k seulement — au-delà
 * elle rallonge sans rien apprendre de plus à l'œil.
 * fmtCompact(842, true)   → "+$842"
 * fmtCompact(1158, true)  → "+$1.2k"
 * fmtCompact(-12480)      → "-$12k"
 */
export const fmtCompact = (n: number, sign = false): string => {
  const sym = getCurrencySymbol();
  const abs = Math.abs(n);
  const rounded = Math.round(n);
  const prefix = sign && rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  // Seuil sur l'arrondi : 999,6 doit donner « 1k », pas « $1000 ».
  if (Math.abs(rounded) < 1000) return `${prefix}${sym}${Math.abs(rounded)}`;
  if (abs < 1e6) {
    const k = abs / 1000;
    // `toFixed(1)` sur 9.96 rend « 10.0 » : on retombe alors sur l'entier.
    const txt = k < 9.95 ? k.toFixed(1).replace(/\.0$/, "") : String(Math.round(k));
    return `${prefix}${sym}${txt}k`;
  }
  return `${prefix}${sym}${(abs / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
};
