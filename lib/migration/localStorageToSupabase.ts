/**
 * Script de migration: Copie les données de localStorage vers Supabase
 * A exécuter une seule fois quand l'utilisateur se connecte pour la première fois
 */

import { createClient } from "@/lib/supabase/client";

export async function migrateLocalStorageToSupabase(userId) {
  if (!userId) {
    console.warn("⚠️ userId requis pour la migration");
    return;
  }

  const supabase = createClient();
  let migratedCount = 0;

  try {
    console.log("🔄 Démarrage de la migration localStorage → Supabase...");

    // ==================== STRATÉGIES ====================
    try {
      const savedStrategies = localStorage.getItem("apex_strategies");
      if (savedStrategies) {
        const strategies = JSON.parse(savedStrategies);
        if (Array.isArray(strategies) && strategies.length > 0) {
          console.log(`📊 Migration de ${strategies.length} stratégies...`);

          // Vérifier les stratégies existantes
          const { data: existing } = await supabase
            .from("strategies")
            .select("id")
            .eq("user_id", userId);

          const existingNames = new Set(existing?.map((s) => s.name) || []);

          // Filtrer les nouvelles stratégies
          const newStrategies = strategies
            .filter((s) => !existingNames.has(s.name))
            .map((s) => ({
              ...s,
              user_id: userId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));

          if (newStrategies.length > 0) {
            const { error: err } = await supabase
              .from("strategies")
              .insert(newStrategies);

            if (err) throw err;
            migratedCount += newStrategies.length;
            console.log(`✅ ${newStrategies.length} stratégies migrées`);
          } else {
            console.log("ℹ️ Aucune nouvelle stratégie à migrer");
          }
        }
      }
    } catch (err) {
      console.error("❌ Erreur migration stratégies:", err);
    }

    // ==================== NOTES DE TRADES ====================
    try {
      const savedNotes = localStorage.getItem("tao_trade_notes");
      if (savedNotes) {
        const notes = JSON.parse(savedNotes);
        const noteIds = Object.keys(notes);

        if (noteIds.length > 0) {
          console.log(
            `📝 Migration de ${noteIds.length} notes de trades...`
          );

          // Récupérer les détails de trades existants
          const { data: existingDetails } = await supabase
            .from("trade_details")
            .select("id, trade_id")
            .eq("user_id", userId);

          const existingTradeIds = new Set(
            existingDetails?.map((d) => d.trade_id) || []
          );

          // Créer des détails de trade pour les notes
          const tradeDetailsToInsert = [];
          for (const [tradeId, noteData] of Object.entries(notes)) {
            if (!existingTradeIds.has(tradeId)) {
              tradeDetailsToInsert.push({
                trade_id: tradeId,
                user_id: userId,
                notes: noteData.notes || "",
                emotion_tags: noteData.emotionTags || [],
                rule_indices: noteData.errorTags || [],
                quality_score: noteData.quality_score || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }

          if (tradeDetailsToInsert.length > 0) {
            const { error: err } = await supabase
              .from("trade_details")
              .insert(tradeDetailsToInsert);

            if (err) throw err;
            migratedCount += tradeDetailsToInsert.length;
            console.log(`✅ ${tradeDetailsToInsert.length} notes migrées`);
          }
        }
      }
    } catch (err) {
      console.error("❌ Erreur migration notes:", err);
    }

    // ==================== PRÉFÉRENCES ====================
    try {
      const { data: existing } = await supabase
        .from("user_preferences")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (!existing) {
        console.log("⚙️ Création des préférences utilisateur...");
        const { error: err } = await supabase
          .from("user_preferences")
          .insert([{ user_id: userId }]);

        if (err && err.code !== "23505") throw err; // Ignore les doublons
        console.log("✅ Préférences créées");
      }
    } catch (err) {
      console.error("❌ Erreur création préférences:", err);
    }

    console.log(`\n✅ Migration terminée! ${migratedCount} éléments migrés.`);

    // ==================== NETTOYAGE ====================
    // Note: Ne pas supprimer localStorage automatiquement, laisser le choix à l'utilisateur
    console.log(
      "\n💡 Conseil: Vous pouvez maintenant vider le localStorage"
    );
    console.log("localStorage.removeItem('apex_strategies')");
    console.log("localStorage.removeItem('tao_trade_notes')");

    return { success: true, migratedCount };
  } catch (error) {
    console.error("❌ Erreur migration complète:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Fonction pour afficher le statut de la migration
 */
export async function getMigrationStatus(userId) {
  if (!userId) return null;

  const supabase = createClient();

  try {
    const { data: strategies } = await supabase
      .from("strategies")
      .select("id")
      .eq("user_id", userId);

    const { data: entries } = await supabase
      .from("trading_journal")
      .select("id")
      .eq("user_id", userId);

    const { data: rules } = await supabase
      .from("trading_rules")
      .select("id")
      .eq("user_id", userId);

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("id")
      .eq("user_id", userId)
      .single();

    return {
      strategiesCount: strategies?.length || 0,
      journalEntriesCount: entries?.length || 0,
      rulesCount: rules?.length || 0,
      preferencesExists: !!prefs,
    };
  } catch (error) {
    console.error("Erreur récupération statut migration:", error);
    return null;
  }
}
