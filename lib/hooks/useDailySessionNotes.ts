import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import { getLocalDateString } from "@/lib/dateUtils";
import { useState, useEffect, useCallback } from "react";

/**
 * Hook pour gérer les notes de session journalières
 */
export function useDailySessionNotes() {
  const { user } = useAuth();
  const supabase = createClient();
  const [notes, setNotes] = useState<Record<string, string>>({}); // date -> notes
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Charger les notes depuis localStorage d'abord, puis Supabase en arrière-plan
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    // 1️⃣ CHARGER localStorage IMMÉDIATEMENT (stale-while-revalidate)
    try {
      console.log("⚡ Chargement rapide depuis localStorage");
      const stored = localStorage.getItem("tao_daily_notes");
      const notesMap = stored ? JSON.parse(stored) : {};
      setNotes(notesMap);
      setLoading(false); // ✅ Fini le loading immédiatement
      setError(null);
    } catch (parseErr) {
      console.error("Erreur parsing localStorage:", parseErr);
      setNotes({});
      setLoading(false);
    }

    // 2️⃣ CHARGER Supabase EN ARRIÈRE-PLAN (synchronise sans bloquer)
    const syncFromSupabase = async () => {
      try {
        console.log("🔄 Synchronisation Supabase en arrière-plan...");
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
        
        const { data, error: err } = await supabase
          .from("daily_session_notes")
          .select("date, notes")
          .eq("user_id", user.id)
          .gte("date", getLocalDateString(startDate))
          .order("date", { ascending: false });

        if (err) {
          if (err.message?.includes("Could not find the table") || err.code === "PGRST116") {
            console.log("📌 Table daily_session_notes n'existe pas");
            return;
          }
          throw err;
        }

        // Convertir en map et fusionner avec localStorage
        const notesMap: Record<string, string> = {};
        data?.forEach((entry) => {
          if (entry.notes) {
            notesMap[entry.date] = entry.notes;
          }
        });

        console.log(`✅ ${Object.keys(notesMap).length} notes Supabase chargées, fusion avec localStorage`);
        
        // Fusionner: Supabase + localStorage (priorité: localStorage si deux versions)
        setNotes(prev => ({ ...notesMap, ...prev }));
      } catch (err) {
        console.error("⚠️ Sync Supabase failed:", getErrorMessage(err));
        // Continue avec localStorage, pas d'erreur affichée
      }
    };

    // Appeler la sync Supabase sans attendre
    syncFromSupabase();
  }, [user?.id]);

  // Obtenir la note pour une date
  const getNote = useCallback(
    (date: string) => {
      const dateStr = date.split('T')[0]; // normaliser format
      return notes[dateStr] || "";
    },
    [notes]
  );

  // Mettre à jour/créer une note
  const setNote = useCallback(
    async (date: string, noteText: string) => {
      if (!user?.id) return;

      try {
        const dateStr = date.split('T')[0]; // normaliser format
        console.log("💾 Sauvegarde note journalière pour:", dateStr, "Texte:", noteText.substring(0, 50));
        
        // Mettre à jour le state local d'abord
        setNotes(prev => ({
          ...prev,
          [dateStr]: noteText
        }));

        // Sauvegarder dans localStorage immédiatement
        const allNotes = JSON.parse(localStorage.getItem("tao_daily_notes") || "{}");
        allNotes[dateStr] = noteText;
        localStorage.setItem("tao_daily_notes", JSON.stringify(allNotes));
        console.log("✅ Sauvegardé dans localStorage");

        // Essayer Supabase en arrière-plan (ne pas bloquer si ça échoue)
        try {
          // Vérifier si l'entrée existe
          const { data: existing } = await supabase
            .from("daily_session_notes")
            .select("id")
            .eq("user_id", user.id)
            .eq("date", dateStr)
            .single();

          if (existing) {
            // Mettre à jour
            const { error: err } = await supabase
              .from("daily_session_notes")
              .update({ notes: noteText, updated_at: new Date().toISOString() })
              .eq("id", existing.id);

            if (err && !err.message?.includes("Could not find the table")) {
              throw err;
            }
            console.log("✅ Sauvegardé dans Supabase (UPDATE)");
          } else {
            // Créer nouvelle entrée
            const { error: err } = await supabase
              .from("daily_session_notes")
              .insert([{
                user_id: user.id,
                date: dateStr,
                notes: noteText,
              }]);

            if (err && !err.message?.includes("Could not find the table")) {
              throw err;
            }
            console.log("✅ Sauvegardé dans Supabase (INSERT)");
          }
        } catch (supabaseErr: unknown) {
          console.log("⚠️ Supabase save skipped (table may not exist yet):", getErrorMessage(supabaseErr));
          // Continue - localStorage est notre fallback
        }

        console.log("✅ Note journalière sauvegardée");
      } catch (err: unknown) {
        console.error("❌ Erreur sauvegarde note:", getErrorMessage(err));
        throw err;
      }
    },
    [user?.id]
  );

  // Supprimer une note
  const deleteNote = useCallback(
    async (date: string) => {
      if (!user?.id) return;

      try {
        const dateStr = date.split('T')[0]; // normaliser format
        console.log("🗑 Suppression note journalière pour:", dateStr);
        
        // Mettre à jour le state local d'abord
        setNotes(prev => {
          const updated = { ...prev };
          delete updated[dateStr];
          return updated;
        });

        // Supprimer de localStorage immédiatement
        const allNotes = JSON.parse(localStorage.getItem("tao_daily_notes") || "{}");
        delete allNotes[dateStr];
        localStorage.setItem("tao_daily_notes", JSON.stringify(allNotes));
        console.log("✅ Supprimé de localStorage");

        // Essayer Supabase en arrière-plan
        try {
          const { error: err } = await supabase
            .from("daily_session_notes")
            .update({ notes: null })
            .eq("user_id", user.id)
            .eq("date", dateStr);

          if (err && !err.message?.includes("Could not find the table")) {
            throw err;
          }
          console.log("✅ Supprimé de Supabase");
        } catch (supabaseErr: unknown) {
          console.log("⚠️ Supabase delete skipped:", getErrorMessage(supabaseErr));
          // Continue - localStorage est notre fallback
        }

        console.log("✅ Note journalière supprimée");
      } catch (err: unknown) {
        console.error("❌ Erreur suppression note:", getErrorMessage(err));
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
