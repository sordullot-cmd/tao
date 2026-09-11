/**
 * Le thème suit la PARTIE de l'app où l'on se trouve.
 *
 * Trading se lit sur fond sombre — c'est l'écran des graphiques et des chiffres,
 * regardé longtemps, souvent tôt ou tard dans la journée ; vie perso et finance
 * se lisent sur fond clair, comme des pages qu'on parcourt. Le découpage n'est
 * pas inventé ici : c'est exactement celui que le suivi d'activité connaît déjà
 * (cf. `SECTION_OF_PAGE` dans lib/activity/sections), et le réutiliser évite d'avoir
 * deux tables de pages qui divergeraient au premier écran ajouté.
 *
 * Une page HORS des trois parties — les réglages — ne change RIEN : `null` veut
 * dire « garde le thème courant ». Ouvrir les réglages depuis le trading ne doit
 * pas blanchir l'écran pour y revenir en sortant ; les réglages sont ceux de
 * l'app entière, ils n'appartiennent à aucune partie.
 */

import { SECTION_OF_PAGE, type SelfSection } from "@/lib/activity/sections";

/** Le mode d'apparence, tel qu'il est stocké dans `tr4de_theme`. */
export type ThemeMode = "section" | "system" | "light" | "dark";

export const THEME_KEY = "tr4de_theme";

/* La bascule par section est posée UNE fois sur les installations existantes :
   un réglage déjà choisi ("light", "dark", "system") aurait sinon neutralisé la
   règle sans rien dire, et l'app serait restée telle quelle chez celui qui la
   demande. Après ce passage, un choix manuel reprend la main pour de bon. */
export const THEME_MIGRATION_KEY = "tr4de_theme_bysection";

/** Le fond de chaque partie. */
export const THEME_OF_SECTION: Record<SelfSection, "light" | "dark"> = {
  trading: "dark",
  perso: "light",
  finance: "light",
};

/**
 * Les pages qui s'affichent en sombre.
 *
 * Sérialisée dans le script de pré-hydratation (app/layout.tsx) : sans elle, la
 * première peinture se ferait en clair avant que React ne corrige, et le tableau
 * de bord — première page de l'app, donc du trading — clignerait à chaque
 * ouverture.
 */
export const DARK_PAGES: string[] = Object.keys(SECTION_OF_PAGE)
  .filter(p => THEME_OF_SECTION[SECTION_OF_PAGE[p]] === "dark")
  .sort();

/** Le thème d'une page, ou `null` si elle n'appartient à aucune partie. */
export function themeForPage(page: string): "light" | "dark" | null {
  const section = SECTION_OF_PAGE[(page || "").trim()];
  return section ? THEME_OF_SECTION[section] : null;
}

/** Le mode enregistré. Par défaut : la bascule par section. */
export function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "section";
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "system" || v === "light" || v === "dark" || v === "section" ? v : "section";
  } catch {
    return "section";
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

/**
 * Applique le mode courant pour la page donnée.
 *
 * En mode "section" et sur une page sans partie, on ne touche à rien : voir
 * l'en-tête du fichier.
 */
export function applyThemeForPage(page: string) {
  if (typeof document === "undefined") return;
  const mode = readThemeMode();
  if (mode === "section") {
    const theme = themeForPage(page);
    if (theme) paint(theme);
    return;
  }
  paint(mode === "system" ? null : mode);
}

/** Enregistre un mode et l'applique tout de suite. */
export function setThemeMode(mode: ThemeMode, page: string) {
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* stockage refusé : le mode vaut pour la session */ }
  applyThemeForPage(page);
}
