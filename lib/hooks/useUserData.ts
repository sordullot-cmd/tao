import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect, useCallback } from "react";

/**
 * Hook pour gérer les stratégies liées au compte utilisateur
 */
export function useStrategies() {
  const { user } = useAuth();
  const supabase = createClient();
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Charger les stratégies depuis localStorage IMMÉDIATEMENT, puis syncer Supabase en arrière-plan
  useEffect(() => {
    // ⚡ FAST PATH: Charger localStorage IMMÉDIATEMENT (client-side only)
    try {
      // ✅ Vérifier qu'on est en client-side
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        const stored = localStorage.getItem("tao_strategies");
        const cachedStrategies = stored ? JSON.parse(stored) : [];
        setStrategies(cachedStrategies);
        console.log("⚡ Stratégies chargées depuis localStorage:", cachedStrategies.length);
      }
      setLoading(false); // ✅ UI prête instantanément
    } catch (parseErr) {
      console.error("Erreur parsing localStorage:", parseErr);
      setStrategies([]);
      setLoading(false);
    }

    // ✅ Si pas d'utilisateur, arrêter ici
    if (!user?.id) {
      console.log("⏸️  No user, skipping Supabase sync");
      return;
    }

    // 🔄 BACKGROUND: Syncer Supabase sans bloquer l'UI
    const syncFromSupabase = async () => {
      try {
        const { data, error: err } = await supabase
          .from("strategies")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (err) {
          // Si la table n'existe pas, garder les données localStorage
          if (err.message?.includes("Could not find the table") || err.code === "PGRST116") {
            console.log("📌 Table strategies pas encore créée sur Supabase");
            return;
          }
          
          console.error("❌ Erreur Supabase récupération stratégies:", {
            message: err.message,
            code: err.code,
            details: err.details,
            hint: err.hint,
            fullError: err
          });
          return;
        }

        if (data && data.length > 0) {
          // Fusionner: Supabase comme source de vérité, mais garder localStorage en priorité pour les changements locaux
          setStrategies(prev => {
            const merged = [...data];
            // Garder les items locaux qui ne sont pas sur Supabase
            prev.forEach(local => {
              if (!merged.find(s => s.id === local.id)) {
                merged.push(local);
              }
            });
            return merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          });
          console.log("🔄 Stratégies synchronisées depuis Supabase:", data.length);
        }
        setError(null);
      } catch (err) {
        console.error("❌ Erreur synchronisation Supabase:", err?.message || JSON.stringify(err));
        // Pas d'erreur affichée car on a déjà les données localStorage
      }
    };

    syncFromSupabase(); // Fire and forget - ne pas attendre
  }, [user?.id]);

  // Ajouter une stratégie
  const addStrategy = useCallback(
    async (strategyData) => {
      if (!user?.id) {
        throw new Error("No user ID");
      }

      try {
        // ✅ Validation des données
        if (!strategyData?.name || !strategyData?.groups) {
          throw new Error("Strategy must have name and groups");
        }

        const newStrategy = {
          id: strategyData.id || crypto.randomUUID?.() || Date.now().toString(),
          name: strategyData.name,
          description: strategyData.description || "",
          color: strategyData.color || "#5F7FB4",
          groups: strategyData.groups || [],
          user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log("➕ Adding strategy with data:", JSON.stringify(newStrategy, null, 2));

        // Essayer Supabase d'abord
        try {
          const { data, error: err } = await supabase
            .from("strategies")
            .insert([newStrategy])
            .select();

          if (err) {
            console.error("📌 Supabase error details:", {
              message: err.message,
              code: err.code,
              details: err.details,
              hint: err.hint,
              status: err.status
            });
            
            if (!err.message?.includes("Could not find the table")) {
              throw err;
            }
            console.log("⚠️  Table not found, using localStorage fallback");
          }
          
          if (data && data.length > 0) {
            console.log("✅ Strategy created on Supabase:", data[0]);
            setStrategies([...strategies, data[0]]);
            localStorage.setItem("tao_strategies", JSON.stringify([...strategies, data[0]]));
            return data[0];
          }
        } catch (supabaseErr) {
          console.error("❌ Supabase operation failed:", supabaseErr);
          if (!supabaseErr?.message?.includes("Could not find the table")) {
            throw supabaseErr;
          }
        }

        // Fallback to localStorage
        console.log("💾 Sauvegarde stratégie dans localStorage");
        const updated = [...strategies, newStrategy];
        setStrategies(updated);
        localStorage.setItem("tao_strategies", JSON.stringify(updated));
        console.log("✅ Strategy saved to localStorage:", newStrategy);
        return newStrategy;
      } catch (err) {
        const errMsg = err?.message || JSON.stringify(err) || "Unknown error";
        console.error("❌ Erreur ajout stratégie - Full error:", {
          message: errMsg,
          stack: err?.stack,
          originalError: err
        });
        throw new Error(`Failed to add strategy: ${errMsg}`);
      }
    },
    [user?.id, strategies]
  );

  // Mettre à jour une stratégie
  const updateStrategy = useCallback(
    async (id, updates) => {
      if (!user?.id) return;

      try {
        // Essayer Supabase d'abord
        try {
          const { data, error: err } = await supabase
            .from("strategies")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("user_id", user.id)
            .select();

          if (err && !err.message?.includes("Could not find the table")) {
            throw err;
          }

          if (data && data[0]) {
            setStrategies(strategies.map((s) => (s.id === id ? data[0] : s)));
            return data[0];
          }
        } catch (supabaseErr) {
          if (!supabaseErr.message?.includes("Could not find the table")) {
            throw supabaseErr;
          }
        }

        // Fallback to localStorage
        console.log("💾 Mise à jour stratégie dans localStorage");
        const updated = strategies.map((s) =>
          s.id === id ? { ...s, ...updates, updated_at: new Date().toISOString() } : s
        );
        setStrategies(updated);
        localStorage.setItem("tao_strategies", JSON.stringify(updated));
        return updated.find((s) => s.id === id);
      } catch (err) {
        console.error("❌ Erreur mise à jour stratégie:", err);
        throw err;
      }
    },
    [user?.id, strategies]
  );

  // Supprimer une stratégie
  const deleteStrategy = useCallback(
    async (id) => {
      if (!user?.id) return;

      try {
        // Essayer Supabase d'abord
        try {
          const { error: err } = await supabase
            .from("strategies")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);

          if (err && !err.message?.includes("Could not find the table")) {
            throw err;
          }
        } catch (supabaseErr) {
          if (!supabaseErr.message?.includes("Could not find the table")) {
            throw supabaseErr;
          }
        }

        // Fallback to localStorage
        console.log("🗑️ Suppression stratégie depuis localStorage");
        const updated = strategies.filter((s) => s.id !== id);
        setStrategies(updated);
        localStorage.setItem("tao_strategies", JSON.stringify(updated));
      } catch (err) {
        console.error("❌ Erreur suppression stratégie:", err);
        throw err;
      }
    },
    [user?.id, strategies]
  );

  return {
    strategies,
    loading,
    error,
    addStrategy,
    updateStrategy,
    deleteStrategy,
  };
}

/**
 * Hook pour gérer le journal de trading
 */
export function useTradingJournal() {
  const { user } = useAuth();
  const supabase = createClient();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Charger les entrées du journal
  useEffect(() => {
    if (!user?.id) return;

    const fetchJournal = async () => {
      try {
        setLoading(true);
        const { data, error: err } = await supabase
          .from("trading_journal")
          .select("*")
          .eq("user_id", user.id)
          .order("date", { ascending: false });

        if (err) throw err;
        setEntries(data || []);
      } catch (err) {
        console.error("❌ Erreur récupération journal:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchJournal();
  }, [user?.id]);

  // Ajouter une entrée
  const addEntry = useCallback(
    async (entryData) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("trading_journal")
          .insert([{ ...entryData, user_id: user.id }])
          .select();

        if (err) throw err;
        setEntries([data[0], ...entries]);
        return data[0];
      } catch (err) {
        console.error("❌ Erreur ajout entrée journal:", err);
        throw err;
      }
    },
    [user?.id, entries]
  );

  // Mettre à jour une entrée
  const updateEntry = useCallback(
    async (id, updates) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("trading_journal")
          .update(updates)
          .eq("id", id)
          .eq("user_id", user.id)
          .select();

        if (err) throw err;
        setEntries(
          entries.map((e) => (e.id === id ? data[0] : e))
        );
        return data[0];
      } catch (err) {
        console.error("❌ Erreur mise à jour journal:", err);
        throw err;
      }
    },
    [user?.id, entries]
  );

  // Supprimer une entrée
  const deleteEntry = useCallback(
    async (id) => {
      if (!user?.id) return;

      try {
        const { error: err } = await supabase
          .from("trading_journal")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (err) throw err;
        setEntries(entries.filter((e) => e.id !== id));
      } catch (err) {
        console.error("❌ Erreur suppression journal:", err);
        throw err;
      }
    },
    [user?.id, entries]
  );

  return {
    entries,
    loading,
    error,
    addEntry,
    updateEntry,
    deleteEntry,
  };
}

/**
 * Hook pour gérer les règles de trading
 */
export function useTradingRules() {
  const { user } = useAuth();
  const supabase = createClient();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Charger les règles
  useEffect(() => {
    if (!user?.id) return;

    const fetchRules = async () => {
      try {
        setLoading(true);
        const { data, error: err } = await supabase
          .from("trading_rules")
          .select("*")
          .eq("user_id", user.id)
          .order("priority", { ascending: false });

        if (err) throw err;
        setRules(data || []);
      } catch (err) {
        console.error("❌ Erreur récupération règles:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, [user?.id]);

  // Ajouter une règle
  const addRule = useCallback(
    async (ruleData) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("trading_rules")
          .insert([{ ...ruleData, user_id: user.id }])
          .select();

        if (err) throw err;
        setRules([...rules, data[0]]);
        return data[0];
      } catch (err) {
        console.error("❌ Erreur ajout règle:", err);
        throw err;
      }
    },
    [user?.id, rules]
  );

  // Mettre à jour une règle
  const updateRule = useCallback(
    async (id, updates) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("trading_rules")
          .update(updates)
          .eq("id", id)
          .eq("user_id", user.id)
          .select();

        if (err) throw err;
        setRules(rules.map((r) => (r.id === id ? data[0] : r)));
        return data[0];
      } catch (err) {
        console.error("❌ Erreur mise à jour règle:", err);
        throw err;
      }
    },
    [user?.id, rules]
  );

  // Supprimer une règle
  const deleteRule = useCallback(
    async (id) => {
      if (!user?.id) return;

      try {
        const { error: err } = await supabase
          .from("trading_rules")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (err) throw err;
        setRules(rules.filter((r) => r.id !== id));
      } catch (err) {
        console.error("❌ Erreur suppression règle:", err);
        throw err;
      }
    },
    [user?.id, rules]
  );

  return {
    rules,
    loading,
    error,
    addRule,
    updateRule,
    deleteRule,
  };
}

/**
 * Hook pour gérer les préférences utilisateur
 */
export function useUserPreferences() {
  const { user } = useAuth();
  const supabase = createClient();
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Charger les préférences
  useEffect(() => {
    if (!user?.id) return;

    const fetchPreferences = async () => {
      try {
        setLoading(true);
        let { data, error: err } = await supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", user.id)
          .single();

        // Créer les préférences si elles n'existent pas
        if (err?.code === "PGRST116") {
          const { data: newPrefs, error: insertErr } = await supabase
            .from("user_preferences")
            .insert([{ user_id: user.id }])
            .select()
            .single();

          if (insertErr) throw insertErr;
          data = newPrefs;
        } else if (err) {
          throw err;
        }

        setPreferences(data);
      } catch (err) {
        console.error("❌ Erreur récupération préférences:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [user?.id]);

  // Mettre à jour les préférences
  const updatePreferences = useCallback(
    async (updates) => {
      if (!user?.id) return;

      try {
        const { data, error: err } = await supabase
          .from("user_preferences")
          .update(updates)
          .eq("user_id", user.id)
          .select()
          .single();

        if (err) throw err;
        setPreferences(data);
        return data;
      } catch (err) {
        console.error("❌ Erreur mise à jour préférences:", err);
        throw err;
      }
    },
    [user?.id]
  );

  return {
    preferences,
    loading,
    error,
    updatePreferences,
  };
}
