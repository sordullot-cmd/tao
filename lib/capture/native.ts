"use client";

/**
 * Capture d'écran — le pont vers la coquille.
 *
 * Même contrat que `lib/focus/native.ts` et `lib/activity/native.ts` : hors de
 * l'app de bureau, rien ne jette. Les fonctions rendent « non supporté », et
 * l'interface annonce la portée réelle au lieu de proposer un bouton qui ne
 * fera rien. Un navigateur ne PEUT pas capturer l'écran sans un dialogue de
 * partage à chaque prise — ce n'est pas un manque à combler, c'est la frontière
 * du bac à sable.
 */

import { isTauri } from "@/lib/notify";

export interface CaptureSupport {
  /** La plateforme sait capturer, autorisation mise à part. */
  supported: boolean;
  /** L'autorisation « Enregistrement de l'écran » est accordée. */
  granted: boolean;
  platform: string;
  /** Dossier des images sur ce poste, à montrer dans les réglages. */
  dir: string | null;
  error: string | null;
}

export interface CaptureResult {
  ok: boolean;
  path: string | null;
  bytes: number;
  error: string | null;
}

const UNSUPPORTED: CaptureSupport = {
  supported: false,
  granted: false,
  platform: "web",
  dir: null,
  error: "capture d'écran réservée à l'app de bureau",
};

async function core() {
  return import("@tauri-apps/api/core");
}

export async function captureSupport(): Promise<CaptureSupport> {
  if (!isTauri()) return UNSUPPORTED;
  try {
    const { invoke } = await core();
    return await invoke<CaptureSupport>("capture_support");
  } catch (e) {
    return { ...UNSUPPORTED, platform: "desktop", error: String(e) };
  }
}

/**
 * Demande l'autorisation au système. Rend `true` si elle est accordée.
 *
 * ⚠️ macOS ne montre sa fenêtre QU'UNE FOIS par app. Une fois refusée, aucun
 * appel ne la fera revenir : il faut passer par Réglages Système →
 * Confidentialité → Enregistrement de l'écran. L'interface doit dire ça, et pas
 * « réessayez ».
 */
export async function captureRequestAccess(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await core();
    return await invoke<boolean>("capture_request_access");
  } catch {
    return false;
  }
}

/**
 * Capture l'écran et range l'image dans le dossier du jour.
 *
 * `day` et `id` composent le chemin : le Rust les refuse s'ils sortent de
 * `[A-Za-z0-9_-]`, le front tournant sur une URL distante.
 */
export async function captureScreen(
  day: string,
  id: string,
  display = 1
): Promise<CaptureResult> {
  if (!isTauri()) {
    return { ok: false, path: null, bytes: 0, error: UNSUPPORTED.error };
  }
  try {
    const { invoke } = await core();
    return await invoke<CaptureResult>("capture_screen", { day, id, display });
  } catch (e) {
    return { ok: false, path: null, bytes: 0, error: String(e) };
  }
}
