import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect, useCallback } from "react";

/**
 * Hook pour gérer les notes de trades (stockées dans trade_details)
 */
export function useTradeNotes() {
  const { user } = useAuth();
  const supabase = createClient();
  const [notes, setNotes] = useState<Record<string, string>>({}); // tradeId -> note
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Charger les notes depuis Supabase
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const fetchNotes = async () => {
      try {
        setLoading(true);
        console.log("📝 Chargement des notes de trades pour user:", user.id);
        const { data, error: err } = await supabase
          .from("trade_details")
          .select("trade_id, notes")
          .eq("user_id", user.id)
          .not("notes", "is", null);

        if (err) {
          console.error("❌ Erreur Supabase récupération notes:", err);
          throw err;
        }

        // Convertir en map tradeId -> notes
        const notesMap: Record<string, string> = {};
        data?.forEach((detail) => {
          if (detail.notes) {
            notesMap[detail.trade_id] = detail.notes;
          }
        });

        console.log(`✅ ${Object.keys(notesMap).length} notes chargées`);
        setNotes(notesMap);
        setError(null);
      } catch (err) {
        console.error("❌ Erreur récupération notes trades:", err?.message);
        // Essayer localStorage comme fallback
        try {
          const stored = localStorage.getItem("tao_trade_notes");
          const notesData = stored ? JSON.parse(stored) : {};
          setNotes(notesData);
        } catch (parseErr) {
          setNotes({});
        }
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
    const onFocus = () => fetchNotes();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user?.id]);

  // Obtenir la note d'un trade spécifique
  const getNote = useCallback(
    (tradeId: string) => {
      return notes[tradeId] || "";
    },
    [notes]
  );

  // Ajouter/mettre à jour une note
  const setNote = useCallback(
    async (tradeId: string, noteText: string) => {
      if (!user?.id) return;

      try {
        console.log("💾 Sauvegarde note pour trade:", tradeId);
        
        // Mettre à jour le state local d'abord
        setNotes(prev => ({
          ...prev,
          [tradeId]: noteText
        }));

        // Essayer Supabase via upsert (UNIQUE user_id+trade_id)
        try {
          const { error: err } = await supabase
            .from("trade_details")
            .upsert([{
              user_id: user.id,
              trade_id: tradeId,
              notes: noteText,
              updated_at: new Date().toISOString(),
            }], { onConflict: "user_id,trade_id" });
          if (err) throw err;
        } catch (supabaseErr: any) {
          console.error("❌ Supabase upsert trade_details FAILED:", supabaseErr?.message || supabaseErr, "code:", supabaseErr?.code, "details:", supabaseErr?.details, "hint:", supabaseErr?.hint);
          // Fallback to localStorage
          const allNotes = JSON.parse(localStorage.getItem("tao_trade_notes") || "{}");
          allNotes[tradeId] = noteText;
          localStorage.setItem("tao_trade_notes", JSON.stringify(allNotes));
        }

        console.log("✅ Note sauvegardée");
      } catch (err) {
        console.error("❌ Erreur sauvegarde note:", err?.message);
        throw err;
      }
    },
    [user?.id]
  );

  // Supprimer une note
  const deleteNote = useCallback(
    async (tradeId: string) => {
      if (!user?.id) return;

      try {
        console.log("🗑 Suppression note pour trade:", tradeId);
        const { error: err } = await supabase
          .from("trade_details")
          .update({ notes: null })
          .eq("trade_id", tradeId)
          .eq("user_id", user.id);

        if (err) throw err;

        // Mettre à jour le state local
        setNotes(prev => {
          const updated = { ...prev };
          delete updated[tradeId];
          return updated;
        });

        console.log("✅ Note supprimée");
      } catch (err) {
        console.error("❌ Erreur suppression note:", err?.message);
        throw err;
      }
    },
    [user?.id]
  );

  return {
    notes,
    loading,
    error,
    getNote,
    setNote,
    deleteNote,
  };
}
