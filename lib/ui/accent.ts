/**
 * Accent de marque réglable (Réglages → Apparence).
 *
 * Deux teintes seulement :
 *   - principale  → `--accent`   : item de nav actif, pastilles, éléments actifs
 *   - secondaire  → `--accent-2` : courbe de portefeuille, séries de graphiques
 *
 * Les dérivés (`--accent-soft`, `--accent-tint`) sont calculés en `color-mix`
 * dans app/globals.css : rien d'autre à écrire quand la teinte change.
 *
 * Application : style inline sur <html>, qui prime sur les valeurs par défaut
 * du CSS. Persistance en localStorage, relue avant l'hydratation par le script
 * `tr4de-accent-init` de app/layout.tsx (évite le flash de l'ancienne couleur).
 */

export const ACCENT_KEY = "tr4de_accent";
export const ACCENT_2_KEY = "tr4de_accent_2";

export type AccentPreset = {
  id: string;
  label: string;
  /** Couleur principale (`--accent`). */
  primary: string;
  /** Couleur secondaire (`--accent-2`). */
  secondary: string;
};

/** Valeurs livrées par défaut (essai en cours). */
export const DEFAULT_ACCENT = "#64D741";
export const DEFAULT_ACCENT_2 = "#4CC72C";

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "green",  label: "Vert",              primary: DEFAULT_ACCENT, secondary: DEFAULT_ACCENT_2 },
  // Accent d'origine de la maquette Figma, conservé tel quel.
  { id: "violet", label: "Violet (d'origine)", primary: "#9C7BFF", secondary: "#7C4DFF" },
  { id: "blue",   label: "Bleu",              primary: "#3B82F6", secondary: "#2563EB" },
  { id: "amber",  label: "Ambre",             primary: "#F59E0B", secondary: "#EA8C00" },
  // Charbon en principale, doré en secondaire : les éléments actifs restent
  // sobres, la couleur ne parle que dans les courbes et les séries.
  { id: "charcoal", label: "Charbon & or",    primary: "#232323", secondary: "#FEC76C" },
];

/** `#abc` / `#aabbcc` uniquement : on n'injecte pas une valeur arbitraire dans le DOM. */
export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** Teintes enregistrées, avec repli sur les valeurs par défaut. */
export function readAccent(): { primary: string; secondary: string } {
  if (typeof window === "undefined") return { primary: DEFAULT_ACCENT, secondary: DEFAULT_ACCENT_2 };
  let primary = DEFAULT_ACCENT;
  let secondary = DEFAULT_ACCENT_2;
  try {
    const p = localStorage.getItem(ACCENT_KEY);
    const s = localStorage.getItem(ACCENT_2_KEY);
    if (p && isHexColor(p)) primary = p;
    if (s && isHexColor(s)) secondary = s;
  } catch {}
  return { primary, secondary };
}

/** Applique les teintes à <html> et les enregistre. */
export function applyAccent(primary: string, secondary: string): void {
  if (typeof document === "undefined") return;
  if (!isHexColor(primary) || !isHexColor(secondary)) return;
  const root = document.documentElement;
  root.style.setProperty("--accent", primary);
  root.style.setProperty("--accent-2", secondary);
  try {
    localStorage.setItem(ACCENT_KEY, primary);
    localStorage.setItem(ACCENT_2_KEY, secondary);
  } catch {}
}
