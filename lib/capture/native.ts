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
  /** L'image est aussi dans le presse-papiers, prête pour un ⌘V. */
  copied: boolean;
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
 *
 * `clipboard` met AUSSI l'image dans le presse-papiers — à réserver aux
 * captures demandées à la main. L'échantillonnage de fond prend une image
 * toutes les trente secondes : la copier écraserait sans cesse ce que
 * l'utilisateur vient de copier, y compris au milieu d'un collage.
 */
export async function captureScreen(
  day: string,
  id: string,
  display = 1,
  clipboard = false
): Promise<CaptureResult> {
  if (!isTauri()) {
    return { ok: false, path: null, bytes: 0, copied: false, error: UNSUPPORTED.error };
  }
  try {
    const { invoke } = await core();
    return await invoke<CaptureResult>("capture_screen", { day, id, display, clipboard });
  } catch (e) {
    return { ok: false, path: null, bytes: 0, copied: false, error: String(e) };
  }
}

/* ─── Enregistrement vidéo ────────────────────────────────────────────────── */

export interface RecordResult {
  ok: boolean;
  /** Chemin du fichier sur CE poste. */
  path: string | null;
  /** Début de la prise (ms epoch). */
  startedAt: number;
  bytes: number;
  error: string | null;
}

export interface RecordStatus {
  recording: boolean;
  path: string | null;
  startedAt: number;
  supported: boolean;
}

export interface AudioDevice {
  id: string;
  name: string;
  defaultInput: boolean;
}

/** Ce que `screencapture -g` sait viser : l'entrée PAR DÉFAUT, donc le micro. */
export const AUDIO_DEFAULT = "default";

const NO_RECORD: RecordResult = {
  ok: false, path: null, startedAt: 0, bytes: 0,
  error: "enregistrement réservé à l'app de bureau",
};

export async function recordStatus(): Promise<RecordStatus> {
  if (!isTauri()) return { recording: false, path: null, startedAt: 0, supported: false };
  try {
    const { invoke } = await core();
    const raw = await invoke<{ recording: boolean; path: string | null; started_at: number; supported: boolean }>("record_status");
    return {
      recording: !!raw.recording,
      path: raw.path ?? null,
      startedAt: raw.started_at ?? 0,
      supported: !!raw.supported,
    };
  } catch {
    return { recording: false, path: null, startedAt: 0, supported: false };
  }
}

/**
 * Démarre un enregistrement dans `dir` — un dossier du poste, choisi par
 * l'utilisateur. Rien n'est téléversé : l'app ne retient que le chemin.
 *
 * `audio` : `null` muet, `AUDIO_DEFAULT` l'entrée par défaut (le micro),
 * ou l'identifiant d'un périphérique donné par `recordAudioDevices()`.
 */
export async function recordStart(
  dir: string,
  name: string,
  opts: { display?: number; audio?: string | null; showClicks?: boolean } = {}
): Promise<RecordResult> {
  if (!isTauri()) return NO_RECORD;
  try {
    const { invoke } = await core();
    const raw = await invoke<{ ok: boolean; path: string | null; started_at: number; bytes: number; error: string | null }>(
      "record_start",
      {
        dir,
        name,
        display: opts.display ?? 1,
        audio: opts.audio ?? null,
        showClicks: opts.showClicks ?? false,
      }
    );
    return { ok: raw.ok, path: raw.path, startedAt: raw.started_at ?? 0, bytes: raw.bytes ?? 0, error: raw.error };
  } catch (e) {
    return { ...NO_RECORD, error: String(e) };
  }
}

export async function recordStop(): Promise<RecordResult> {
  if (!isTauri()) return NO_RECORD;
  try {
    const { invoke } = await core();
    const raw = await invoke<{ ok: boolean; path: string | null; started_at: number; bytes: number; error: string | null }>("record_stop");
    return { ok: raw.ok, path: raw.path, startedAt: raw.started_at ?? 0, bytes: raw.bytes ?? 0, error: raw.error };
  } catch (e) {
    return { ...NO_RECORD, error: String(e) };
  }
}

/** Les entrées audio du poste. Vide hors de l'app de bureau. */
export async function recordAudioDevices(): Promise<AudioDevice[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await core();
    const raw = await invoke<{ id: string; name: string; default_input: boolean }[]>("record_audio_devices");
    return (raw || []).map(d => ({ id: d.id, name: d.name, defaultInput: !!d.default_input }));
  } catch {
    return [];
  }
}
