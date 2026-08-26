/**
 * Pont vers le blocage natif — ce que seule l'app de bureau peut faire.
 *
 * Deux choses, et deux seulement :
 *
 *   • SAVOIR ce qui est devant. La lecture de l'application au premier plan
 *     passe par le même relevé que la page « Activité » (`lib/activity/native`),
 *     donc par une seule commande Rust à maintenir. Ce n'est pas une économie
 *     de code : deux sondes du même poste finiraient par se contredire.
 *
 *   • REPRENDRE la main. `focus_reclaim` ramène la fenêtre devant l'appli
 *     distrayante. Rien n'est tué, rien n'est fermé (cf. src-tauri/src/blocker.rs).
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
