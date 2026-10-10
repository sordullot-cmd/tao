"use client";

/**
 * useEloquenceAudio — stockage cloud des enregistrements de la page Éloquence.
 *
 * - uploadAudio(blob) : envoie le blob dans le bucket privé `eloquence_audio`
 *   sous `${user.id}/…` et renvoie le chemin de stockage (ou null si échec /
 *   utilisateur non connecté).
 * - getAudioUrl(path) : renvoie une URL signée (1 h) pour réécouter, ou null.
 *
 * Sans utilisateur connecté, l'upload est ignoré (retourne null) : la réécoute
 * reste alors disponible pour la session en cours via l'URL objet locale.
 */

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";

const BUCKET = "eloquence_audio";

export function useEloquenceAudio() {
  const { user } = useAuth();
  const supabase = createClient();
  const userId = user?.id;

  const uploadAudio = async (blob: Blob | null): Promise<string | null> => {
    if (!userId || !blob) return null;
    const ext = (blob.type || "").includes("mp4") ? "mp4" : "webm";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      cacheControl: "3600",
      upsert: false,
      contentType: blob.type || "audio/webm",
    });
    if (error) {
      console.warn("[eloquence] upload audio échoué:", error.message);
      return null;
    }
    return path;
  };

  const getAudioUrl = async (path: string | null | undefined): Promise<string | null> => {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) {
      console.warn("[eloquence] URL signée échouée:", error.message);
      return null;
    }
    return data?.signedUrl || null;
  };

  return { uploadAudio, getAudioUrl, canStore: !!userId };
}
