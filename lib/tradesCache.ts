import { createClient } from "@/lib/supabase/client";

/**
 * Re-synchronise le cache local des trades après une mutation qui les touche
 * (suppression d'un compte, suppression d'un import, import de données…).
 *
 * C'est `localStorage.tr4de_trades` qui alimente le hook useTrades() dans toute
 * l'app, et l'événement `trades-refreshed` qui pousse la nouvelle liste aux
 * composants déjà montés. Sans ces deux-là, l'UI continue d'afficher les trades
 * supprimés jusqu'à un rechargement complet de la page — et le hook, qui
 * fusionne son état précédent avec la réponse Supabase pour survivre au mode
 * hors-ligne, les réinjecterait au montage suivant.
 *
 * Renvoie la liste fraîche, ou `null` si la relecture a échoué (le cache est
 * alors laissé intact : mieux vaut une liste périmée qu'une liste vide).
 */
export async function refreshTradesCache(userId: string): Promise<unknown[] | null> {
  if (!userId) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("apex_trades")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const fresh = data || [];
    try { localStorage.setItem("tr4de_trades", JSON.stringify(fresh)); } catch {}
    try {
      window.dispatchEvent(new CustomEvent("trades-refreshed", { detail: { trades: fresh } }));
    } catch {}
    return fresh;
  } catch (e) {
    console.error("[refreshTradesCache] failed", e);
    return null;
  }
}
