/**
 * L'avatar du profil : initiales colorées, photo importée, ou photo du compte
 * Google.
 *
 * Rangé par `useCloudState` (table `user_productivity`) et non dans les
 * métadonnées Supabase : celles-ci voyagent dans le JWT, à chaque requête, et
 * une image même réduite l'aurait gonflé de plusieurs kilo-octets. Pas de
 * bucket non plus — une vignette de 256 px tient dans un JSON, et elle reste
 * ainsi disponible hors ligne comme le reste du magasin.
 *
 * La photo importée est GARDÉE quand on repasse aux initiales : revenir en
 * arrière ne doit pas obliger à la réimporter.
 */

import { isHexColor } from "@/lib/ui/accent";
import { PALETTE } from "@/lib/ui/palette";

export const AVATAR_STORAGE_KEY = "tr4de_profile_avatar";
export const AVATAR_CLOUD_KEY = "profile_avatar";

/** "auto" : la photo Google s'il y en a une, sinon les initiales — le
 *  comportement d'avant le réglage, gardé pour ceux qui n'y touchent pas. */
export type AvatarMode = "auto" | "initials" | "image" | "provider";

export type AvatarStore = {
  mode: AvatarMode;
  /** Teinte des initiales ; `null` = l'accent de l'app. */
  color: string | null;
  /** Photo importée, en data URL JPEG carrée. */
  image: string | null;
};

export const DEFAULT_AVATAR: AvatarStore = { mode: "auto", color: null, image: null };

/** Teintes proposées en plus de l'accent et du sélecteur libre. */
export const AVATAR_COLORS: string[] = [
  PALETTE.green, PALETTE.blue, PALETTE.purple, PALETTE.pink,
  PALETTE.red, PALETTE.orange, PALETTE.yellow, PALETTE.brown,
];

const MODES: AvatarMode[] = ["auto", "initials", "image", "provider"];

/** Le magasin est un JSON libre : on le normalise à la lecture plutôt que de
 *  faire confiance à ce qu'une version précédente y a laissé. */
export function normalizeAvatar(raw: unknown): AvatarStore {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<AvatarStore>;
  const image = typeof v.image === "string" && v.image.startsWith("data:image/") ? v.image : null;
  let mode: AvatarMode = MODES.includes(v.mode as AvatarMode) ? (v.mode as AvatarMode) : "auto";
  // Une photo choisie puis disparue (magasin tronqué) : on retombe sur le défaut
  // plutôt que d'afficher une image cassée.
  if (mode === "image" && !image) mode = "auto";
  const color = typeof v.color === "string" && isHexColor(v.color) ? v.color : null;
  return { mode, color, image };
}

/** Ce qu'il faut réellement dessiner : une image, ou des initiales teintées. */
export function resolveAvatar(store: AvatarStore, providerUrl: string | null): { src: string | null; color: string | null } {
  const s = normalizeAvatar(store);
  if (s.mode === "image" && s.image) return { src: s.image, color: s.color };
  if ((s.mode === "provider" || s.mode === "auto") && providerUrl) return { src: providerUrl, color: s.color };
  return { src: null, color: s.color };
}

/** Taille maximale du fichier choisi — au-delà, le décodage seul fige l'onglet
 *  sur un téléphone, pour une vignette de toute façon réduite à 256 px. */
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;

/**
 * Recadre au centre en carré et réduit à `size` px, en JPEG.
 * Le JPEG plutôt que le PNG : une photo y pèse cinq à dix fois moins, et un
 * avatar n'a pas de transparence à préserver (il est découpé en disque).
 */
export function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("not_image")); return; }
    if (file.size > AVATAR_MAX_INPUT_BYTES) { reject(new Error("too_large")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx || !side) { reject(new Error("decode")); return; }
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
        0, 0, size, size,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
