import { createClient } from "@/lib/supabase/client";

/**
 * Captures du playbook — dans le bucket des captures de trades.
 *
 * Un bucket à part demanderait une migration (création + politiques RLS) pour
 * un besoin identique : des images publiques, rangées sous le dossier de
 * l'utilisateur. Les politiques de `trade_screenshots` (cf. migration 021)
 * n'exigent que le premier segment `<user_id>/` ; le sous-dossier `playbook/`
 * les sépare des captures de trades sans rien changer côté serveur.
 */
const BUCKET = "trade_screenshots";

/** Au-delà, l'envoi est refusé avant de partir : une capture d'écran Retina
 *  en PNG dépasse rarement 8 Mo, une vidéo glissée par erreur oui. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Envoie une image et rend son URL publique, ou une erreur lisible.
 *
 * Pas de repli en base64 dans le magasin quand l'envoi échoue (hors ligne,
 * pas de session) : le magasin est un JSON réécrit à chaque frappe, et une
 * image l'alourdirait d'autant à chaque synchro. Mieux vaut dire que la
 * capture n'est pas partie que la faire peser sur tout le reste.
 */
export async function uploadPlaybookImage(
  userId: string | null | undefined,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!userId) return { error: "Connecte-toi pour ajouter des captures." };
  if (!file.type.startsWith("image/")) return { error: "Ce fichier n'est pas une image." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Image trop lourde (10 Mo maximum)." };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { error: "Hors ligne : la capture n'a pas pu être envoyée." };
  }
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || file.type.split("/")[1] || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/playbook/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext || "png"}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { error: `Envoi impossible : ${error.message}` };
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}
