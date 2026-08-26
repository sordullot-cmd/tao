/**
 * Instantané de l'activité du poste.
 *
 * Deux sources, jamais mélangées :
 *
 *  • Desktop (Tauri) — la commande Rust `activity_snapshot` (src-tauri/src/
 *    tracker.rs) lit l'application au premier plan, le titre de sa fenêtre et
 *    l'inactivité clavier/souris à l'échelle du SYSTÈME. C'est la seule voie qui
 *    voit tout le PC.
 *
 *  • Navigateur — repli honnête : une page web ne peut pas savoir ce qui se
 *    passe dans les AUTRES applications. On ne mesure alors que le temps passé
 *    dans tao trade lui-même, et `full` reste faux pour que l'interface le dise
 *    clairement au lieu de faire passer un onglet pour un poste entier.
 */

import { isTauri } from "@/lib/notify";

export interface Snapshot {
  app: string;
  title: string;
  /** Secondes depuis la dernière frappe / le dernier mouvement de souris. */
  idleSeconds: number;
  /** Vrai si le relevé est exploitable. */
  ok: boolean;
  /** Vrai si le relevé couvre TOUT le poste (desktop), faux en navigateur. */
  full: boolean;
  platform: string;
  error?: string | null;
}

/* Dernière interaction dans la page — sert au repli navigateur, où aucune API
   ne donne l'inactivité système. */
let lastWebInput = Date.now();
let webWired = false;

function wireWebInput(): void {
  if (webWired || typeof window === "undefined") return;
  webWired = true;
  const touch = () => { lastWebInput = Date.now(); };
  for (const ev of ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "focus"]) {
    window.addEventListener(ev, touch, { passive: true });
  }
}

/** Vrai si le suivi peut couvrir tout le poste (app de bureau installée). */
export function hasNativeTracking(): boolean {
  return isTauri();
}

export async function snapshot(): Promise<Snapshot> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<{
        app: string; title: string; idle_seconds: number;
        ok: boolean; platform: string; error?: string | null;
      }>("activity_snapshot");
      return {
        app: raw.app || "",
        title: raw.title || "",
        idleSeconds: raw.idle_seconds ?? 0,
        ok: !!raw.ok,
        full: true,
        platform: raw.platform || "desktop",
        error: raw.error ?? null,
      };
    } catch (e) {
      // Version de l'app de bureau antérieure à la commande : on le dit, plutôt
      // que de basculer en repli navigateur sans prévenir.
      return {
        app: "", title: "", idleSeconds: 0, ok: false, full: true,
        platform: "desktop", error: String(e),
      };
    }
  }

  wireWebInput();
  if (typeof document === "undefined") {
    return { app: "", title: "", idleSeconds: 0, ok: false, full: false, platform: "ssr" };
  }
  const hidden = document.visibilityState === "hidden";
  return {
    app: "tao trade",
    title: document.title || "tao trade",
    // Onglet masqué = on ne sait rien : on le déclare inactif au-delà du seuil
    // le plus large, ce qui coupe la session au lieu de la prolonger à l'aveugle.
    idleSeconds: hidden ? 3600 : Math.round((Date.now() - lastWebInput) / 1000),
    ok: !hidden,
    full: false,
    platform: "web",
    error: hidden ? "tab-hidden" : null,
  };
}
