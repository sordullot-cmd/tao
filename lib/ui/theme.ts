/**
 * Le thème de l'app : un seul fond pour toutes les pages.
 *
 * Il a un temps suivi la PARTIE de l'app (trading sombre, vie perso et finance
 * claires). Abandonné : passer d'une partie à l'autre faisait clignoter tout
 * l'écran du noir au blanc, et l'app ne se lisait plus comme un seul outil.
 * Un ancien réglage "section" encore stocké est lu comme le défaut.
 */

/** Le mode d'apparence, tel qu'il est stocké dans `tao_theme`. */
export type ThemeMode = "system" | "light" | "dark";

export const THEME_KEY = "tao_theme";

/** Le mode enregistré. Par défaut : le système. */
export function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/**
 * Le fond que porte réellement l'écran, quel que soit le mode.
 *
 * Lu sur le DOM et non déduit du mode : en "system", seul le navigateur sait de
 * quel côté penche `prefers-color-scheme`, et c'est pourtant la valeur dont a
 * besoin l'inverseur de la barre latérale pour proposer le contraire.
 */
export function effectiveTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.dataset.theme === "dark") return "dark";
  if (document.documentElement.dataset.theme === "light") return "light";
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Pose le thème sur <html>, et fait suivre la couleur de la barre d'état.
 *
 * `theme-color` compte autant que le reste : en PWA installée et sur mobile,
 * c'est elle qui colore la zone au-dessus de la page. Figée à la valeur claire
 * du manifeste, elle laissait un bandeau blanc au-dessus d'un écran sombre. La
 * valeur est LUE dans les tokens plutôt qu'écrite ici — une couleur en dur
 * cesserait de suivre le jour où le fond change.
 */
function paint(theme: "light" | "dark" | null) {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;

  const bg = getComputedStyle(root).getPropertyValue("--color-bg-subtle").trim();
  if (!bg) return;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", bg);
}

/** Applique le mode enregistré. */
export function applyTheme() {
  if (typeof document === "undefined") return;
  const mode = readThemeMode();
  paint(mode === "system" ? null : mode);
}

/** Enregistre un mode et l'applique tout de suite. */
export function setThemeMode(mode: ThemeMode) {
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* stockage refusé : le mode vaut pour la session */ }
  applyTheme();
}
