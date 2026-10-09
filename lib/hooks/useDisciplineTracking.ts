import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage, getErrorCode } from "@/lib/utils/errorUtils";
import { getLocalDateString } from "@/lib/dateUtils";
import { useState, useEffect, useCallback } from "react";

interface DisciplineEntry {
  rule_id: string;
  rule_label: string;
  completed: boolean;
  notes?: string;
}

interface DailyDisciplineState {
  [date: string]: Record<string, boolean>; // date -> ruleId -> completed
}

/**
 * Hook pour gérer le suivi de la discipline quotidienne
 * Utilise la table daily_discipline_tracking de Supabase
 */
export function useDisciplineTracking() {
  const { user } = useAuth();
  const supabase = createClient();
  const [disciplineData, setDisciplineData] = useState<DailyDisciplineState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Définitions des règles de base
  const BASE_RULES = [
    { id: "premarket", label: "Pre Market Routine" },
    { id: "biais", label: "Biais Journalier" },
    { id: "news", label: "News et Key Levels" },
    { id: "followall", label: "Followed All Rules" },
    { id: "journal", label: "Journal d'après session" }
  ];

  // Charger les données de discipline: localStorage IMMÉDIATEMENT, puis Supabase en arrière-plan
  // Refetch automatique quand la fenêtre reprend le focus (sync entre navigateurs)
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const today = getLocalDateString();

    // ⚡ FAST PATH: Charger localStorage IMMÉDIATEMENT pour aujourd'hui (évite le flicker)
    try {
      const stored = localStorage.getItem(`tao_checked_rules_${today}`);
      const rulesData = stored ? JSON.parse(stored) : {};
      setDisciplineData({ [today]: rulesData });
      setLoading(false);
    } catch {
      setDisciplineData({ [today]: {} });
      setLoading(false);
    }

    // 🔄 Sync depuis Supabase: REMPLACE complètement disciplineData (Supabase = source de vérité).
    //    Les optimistic updates de setRuleCompleted modifient disciplineData synchronement,
    //    donc tout toggle utilisateur après le sync est préservé tel quel.
    const syncFromSupabase = async () => {
      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);

        const { data, error: err } = await supabase
          .from("daily_discipline_tracking")
          .select("date, rule_id, completed")
          .eq("user_id", user.id)
          .gte("date", getLocalDateString(startDate))
          .order("date", { ascending: false });

        if (err) {
          if (err.message?.includes("Could not find the table") || err.code === "PGRST116") {
            return;
          }
          throw err;
        }

        const dataMap: DailyDisciplineState = {};
        data?.forEach((entry) => {
          if (!dataMap[entry.date]) dataMap[entry.date] = {};
          dataMap[entry.date][entry.rule_id] = entry.completed;
        });

        // Remplacer entièrement: Supabase est source de vérité.
        setDisciplineData(dataMap);
        setError(null);
      } catch (err: unknown) {
        console.error("❌ Erreur sync discipline:", getErrorMessage(err));
      }
    };

    syncFromSupabase();

    // Refetch quand la fenêtre reprend le focus (autre navigateur a peut-être modifié)
    const onFocus = () => { syncFromSupabase(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user?.id]);

  // Obtenir l'état de discipline pour une date
  const getDayDiscipline = useCallback(
    (date: string) => {
      const dateStr = date.split('T')[0]; // normaliser format
      const dayData = disciplineData[dateStr] || {};
      
      // Retourner un objet complet avec toutes les règles
      return BASE_RULES.map(rule => ({
        id: rule.id,
        label: rule.label,
        completed: dayData[rule.id] || false
      }));
    },
    [disciplineData]
  );

  // Mettre à jour l'état de discipline pour une règle
  const setRuleCompleted = useCallback(
    async (date: string, ruleId: string, completed: boolean) => {
      if (!user?.id) return;

      try {
        const dateStr = date.split('T')[0]; // normaliser format
        console.log(`📍 Mise à jour rule ${ruleId} pour ${dateStr}: ${completed}`);

        // Mettre à jour le state local d'abord
        setDisciplineData(prev => ({
          ...prev,
          [dateStr]: {
            ...prev[dateStr],
            [ruleId]: completed
          }
        }));

        // Sauvegarder dans localStorage d'abord (synchrone et immédiat)
        const allRules = JSON.parse(localStorage.getItem(`tao_checked_rules_${dateStr}`) || "{}");
        allRules[ruleId] = completed;
        localStorage.setItem(`tao_checked_rules_${dateStr}`, JSON.stringify(allRules));
        console.log("✅ Sauvegardé dans localStorage");

        // Essayer Supabase en arrière-plan (ne pas bloquer)
        try {
          // Utiliser UPSERT pour créer ou mettre à jour en une seule requête
          const { error: err } = await supabase
            .from("daily_discipline_tracking")
            .upsert([{
              user_id: user.id,
              date: dateStr,
              rule_id: ruleId,
              completed,
            }], {
              onConflict: "user_id,date,rule_id"
            });

          if (err) {
            if (err.message?.includes("Could not find the table") || err.code === "PGRST116") {
              console.log("⚠️ Table daily_discipline_tracking n'existe pas encore - continue avec localStorage");
            } else {
              console.error("⚠️ Erreur Supabase:", err.message);
            }
          } else {
            console.log("✅ Sauvegardé dans Supabase");
          }
        } catch (supabaseErr) {
          console.log("⚠️ Supabase save failed:", getErrorMessage(supabaseErr));
          // localStorage déjà sauvegardé, donc pas de problème
        }

        console.log("✅ Mise à jour sauvegardée");
      } catch (err: unknown) {
        console.error("❌ Erreur mise à jour discipline:", getErrorMessage(err));
        throw err;
      }
    },
    [user?.id]
  );

  // Obtenir le score de discipline pour une date (nombre de règles complétées)
  const getDayScore = useCallback(
    (date: string) => {
      const dayRules = getDayDiscipline(date);
      const completed = dayRules.filter(r => r.completed).length;
      return {
        completed,
        total: dayRules.length,
        percentage: Math.round((completed / dayRules.length) * 100)
      };
    },
    [getDayDiscipline]
  );

  // Obtenir les statistiques sur une période
  const getStatsPeriod = useCallback(
    (startDate: string, endDate: string) => {
      let totalDays = 0;
      let completedDays = 0;
      let totalRules = 0;
      let completedRules = 0;

      Object.entries(disciplineData).forEach(([date, rules]) => {
        if (date >= startDate && date <= endDate) {
          totalDays++;
          const dayRules = Object.values(rules);
          const completedCount = dayRules.filter(Boolean).length;
          
          if (completedCount === dayRules.length) {
            completedDays++;
          }
          
          totalRules += dayRules.length;
          completedRules += completedCount;
        }
      });

      return {
        totalDays,
        completedDays,
        totalRules,
        completedRules,
        disciplineScore: totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0,
        ruleCompletionRate: totalRules > 0 ? Math.round((completedRules / totalRules) * 100) : 0
      };
    },
    [disciplineData]
  );

  return {
    disciplineData,
    loading,
    error,
    baseRules: BASE_RULES,
    getDayDiscipline,
    setRuleCompleted,
    getDayScore,
    getStatsPeriod,
  };
}
