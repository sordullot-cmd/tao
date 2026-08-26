/**
 * Pont vers le blocage natif — ce que seule l'app de bureau peut faire.
 *
 * Trois choses, et trois seulement :
 *
 *   • SAVOIR ce qui est devant. La lecture de l'application au premier plan
 *     passe par le même relevé que la page « Activité » (`lib/activity/native`),
 *     donc par une seule commande Rust à maintenir. Ce n'est pas une économie
 *     de code : deux sondes du même poste finiraient par se contredire.
 *
 *   • REPRENDRE la main. `focus_reclaim` ramène la fenêtre devant l'appli
 *     distrayante. Rien n'est tué, rien n'est fermé (cf. src-tauri/src/blocker.rs).
 *
 *   • LIRE ET RENVOYER UN ONGLET. Sur un navigateur, savoir quelle appli est
 *     devant ne dit rien : c'est l'URL qui compte. `frontTab` la lit,
 *     `redirectTab` renvoie l'onglet vers une page vide. Les deux échouent
 *     proprement — navigateur non pilotable, autorisation refusée, Windows —
 *     et le garde retombe alors sur le titre de la fenêtre.
 *
 * En navigateur, tout ici répond « non » sans échouer : la page de focus
 * continue de tourner avec le seul garde web, et l'interface le dit.
 */

import { isTauri } from "@/lib/notify";
import { snapshot, type Snapshot } from "@/lib/activity/native";

/** Vrai si l'app tourne dans la coquille de bureau, seul cas où l'OS est lisible. */
export function nativeAvailable(): boolean {
  return isTauri();
}

/**
 * L'app tourne-t-elle dans sa propre fenêtre, installée depuis le web ?
 *
 * La question a l'air cosmétique et ne l'est pas. Une app installée depuis le
 * navigateur a son icône, son cadre, sa place dans le dock — tout dit
 * « application », et rien ne dit qu'à l'intérieur c'est toujours une page web,
 * qui ne voit donc RIEN du reste du poste. Sans cette distinction, l'interface
 * annonce le même blocage dans les deux cas et l'un des deux ment.
 *
 * `display-mode` couvre les navigateurs de bureau et Android ; iOS ne
 * l'implémente pas et pose `navigator.standalone` à la place.
 */
export function webAppInstalled(): boolean {
  if (typeof window === "undefined" || isTauri()) return false;
  const mm = window.matchMedia;
  if (typeof mm === "function") {
    for (const mode of ["standalone", "window-controls-overlay", "minimal-ui"]) {
      try {
        if (mm.call(window, `(display-mode: ${mode})`).matches) return true;
      } catch {
        // Un navigateur qui ne connaît pas la requête la rejette : ce n'est pas
        // une panne, c'est une réponse — celle-là n'est simplement pas la bonne.
      }
    }
  }
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Ramène la fenêtre au premier plan.
 *
 * Ne jette jamais : un échec de reprise (fenêtre en cours de fermeture, version
 * de l'app de bureau antérieure à la commande) ne doit pas interrompre la boucle
 * de surveillance ni la session.
 */
export async function reclaimFocus(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<boolean>("focus_reclaim")) !== false;
  } catch {
    return false;
  }
}

/** Relevé du poste : quelle appli est devant, et le titre de sa fenêtre. */
export async function frontSnapshot(): Promise<Snapshot | null> {
  if (!isTauri()) return null;
  try {
    return await snapshot();
  } catch {
    return null;
  }
}

/** L'onglet actif d'un navigateur, tel que le système le rapporte. */
export interface TabInfo {
  app: string;
  /** URL de l'onglet actif, vide si elle n'a pas pu être lue. */
  url: string;
  ok: boolean;
  error?: string | null;
}

/**
 * URL de l'onglet actif du navigateur nommé.
 *
 * Le nom est celui que vient de rendre le relevé du poste : on le transmet
 * plutôt que de le redemander, pour que les deux couches parlent forcément de
 * la même fenêtre. Rend `null` hors de l'app de bureau.
 */
export async function frontTab(app: string): Promise<TabInfo | null> {
  if (!isTauri() || !app) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<TabInfo>("front_tab", { app });
    return { app: raw.app || app, url: raw.url || "", ok: !!raw.ok, error: raw.error ?? null };
  } catch (e) {
    // App de bureau antérieure à la commande : le garde retombe sur le titre.
    return { app, url: "", ok: false, error: String(e) };
  }
}

/**
 * Renvoie l'onglet actif vers une page vide.
 *
 * Ne jette jamais, pour la même raison que `reclaimFocus` : un onglet qu'on n'a
 * pas su renvoyer ne doit pas emporter la boucle de surveillance avec lui. Rend
 * `false` quand rien n'a été fait — c'est au garde de décider s'il le dit.
 */
export async function redirectTab(app: string): Promise<boolean> {
  if (!isTauri() || !app) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<boolean>("redirect_tab", { app })) === true;
  } catch {
    return false;
  }
}
