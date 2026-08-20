"use client";

import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { useState, useEffect } from "react";
import { migrateLocalStorageToSupabase, getMigrationStatus } from "@/lib/migration/localStorageToSupabase";
import { T as BaseT } from "@/lib/ui/tokens";

// Palette migrée vers les tokens partagés (dark-aware) au lieu du bleu hors charte.
const T = { ...BaseT };

export default function MigrationGuide() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState(null);

  // Vérifier le statut de migration au montage
  useEffect(() => {
    if (!user?.id) return;

    const checkStatus = async () => {
      try {
        const migrationStatus = await getMigrationStatus(user.id);
        setStatus(migrationStatus);
      } catch (err) {
        console.error("Erreur vérification statut:", err);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [user?.id]);

  const handleMigration = async () => {
    if (!user?.id) return;

    setMigrating(true);
    try {
      const migrationResult = await migrateLocalStorageToSupabase(user.id);
      setResult(migrationResult);

      // Recharger le statut après la migration
      const newStatus = await getMigrationStatus(user.id);
      setStatus(newStatus);
    } catch (err) {
      console.error("Erreur durant migration:", err);
      setResult({ success: false, error: err.message });
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: T.textMut }}>
          Vérification du statut de migration...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "40px 24px",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* En-tête */}
      <div style={{ marginBottom: 40 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: T.text,
            marginBottom: 8,
          }}
        >
          🔄 Migration des Données
        </h1>
        <p style={{ fontSize: 14, color: T.textMut }}>
          Transférez vos stratégies et notes depuis localStorage vers Supabase
          pour les synchroniser avec votre compte utilisateur.
        </p>
      </div>

      {/* Statut Actuel */}
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: "var(--radius-card)",
          padding: "24px",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 16 }}>
          📊 Statut Actuel
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          <div
            style={{
              background: T.bg,
              padding: "12px 16px",
              borderRadius: "var(--radius-card)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, color: T.blue }}>
              {status?.strategiesCount || 0}
            </div>
            <div style={{ fontSize: 12, color: T.textMut, marginTop: 4 }}>
              Stratégies
            </div>
          </div>
          <div
            style={{
              background: T.bg,
              padding: "12px 16px",
              borderRadius: "var(--radius-card)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, color: T.blue }}>
              {status?.journalEntriesCount || 0}
            </div>
            <div style={{ fontSize: 12, color: T.textMut, marginTop: 4 }}>
              Entrées Journal
            </div>
          </div>
          <div
            style={{
              background: T.bg,
              padding: "12px 16px",
              borderRadius: "var(--radius-card)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, color: T.blue }}>
              {status?.rulesCount || 0}
            </div>
            <div style={{ fontSize: 12, color: T.textMut, marginTop: 4 }}>
              Règles
            </div>
          </div>
          <div
            style={{
              background: T.bg,
              padding: "12px 16px",
              borderRadius: "var(--radius-card)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: status?.preferencesExists ? T.green : T.red,
              }}
            >
              {status?.preferencesExists ? "✓" : "⚠"}
            </div>
            <div style={{ fontSize: 12, color: T.textMut, marginTop: 4 }}>
              Préférences
            </div>
          </div>
        </div>
      </div>

      {/* Qu'est-ce qui sera migré */}
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: "var(--radius-card)",
          padding: "24px",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 16 }}>
          📋 Données à Migrer
        </h2>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <li style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <div>
              <div style={{ fontWeight: 600, color: T.text }}>Stratégies</div>
              <div style={{ fontSize: 12, color: T.textMut, marginTop: 4 }}>
                Toutes vos stratégies personnalisées seront liées à votre compte
              </div>
            </div>
          </li>
          <li style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <span style={{ fontSize: 16 }}>📝</span>
            <div>
              <div style={{ fontWeight: 600, color: T.text }}>Notes de Trades</div>
              <div style={{ fontSize: 12, color: T.textMut, marginTop: 4 }}>
                Vos notes, émotions et tags associés aux trades
              </div>
            </div>
          </li>
          <li style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <div>
              <div style={{ fontWeight: 600, color: T.text }}>Règles de Trading</div>
              <div style={{ fontSize: 12, color: T.textMut, marginTop: 4 }}>
                Vos règles personnalisées de conformité
              </div>
            </div>
          </li>
          <li style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <span style={{ fontSize: 16 }}>⚙️</span>
            <div>
              <div style={{ fontWeight: 600, color: T.text }}>Préférences</div>
              <div style={{ fontSize: 12, color: T.textMut, marginTop: 4 }}>
                Vos paramètres personnalisés (fuseau horaire, brokers, risque, etc.)
              </div>
            </div>
          </li>
        </ul>
      </div>

      {/* Résultat de migration */}
      {result && (
        <div
          style={{
            background: result.success ? T.greenBg : T.redBg,
            border: `1px solid ${result.success ? T.greenBd : T.redBd}`,
            borderRadius: "var(--radius-card)",
            padding: "24px",
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: result.success ? T.green : T.red,
              marginBottom: 8,
            }}
          >
            {result.success ? "✅ Migration Réussie" : "❌ Erreur lors de la Migration"}
          </h2>
          <p style={{ fontSize: 14, color: T.text }}>
            {result.success
              ? `${result.migratedCount} éléments ont été migrés avec succès`
              : result.error}
          </p>
        </div>
      )}

      {/* Bouton d'action */}
      <div style={{ display: "flex", gap: "12px" }}>
        <button
          onClick={handleMigration}
          disabled={migrating}
          style={{
            flex: 1,
            padding: "12px 24px",
            borderRadius: "var(--radius-card)",
            border: "none",
            background: T.blue,
            color: T.white,
            fontSize:14,
            fontWeight: 500,
            cursor: migrating ? "not-allowed" : "pointer",
            opacity: migrating ? 0.6 : 1,
            transition: "all 0.2s ease",
          }}
        >
          {migrating ? "Migration en cours..." : "🚀 Lancer la Migration"}
        </button>
      </div>

      {/* Prochaines étapes */}
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: "var(--radius-card)",
          padding: "24px",
          marginTop: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 16 }}>
          📚 Prochaines Étapes
        </h2>
        <ol
          style={{
            paddingLeft: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <li style={{ fontSize: 14, color: T.text }}>
            Lancez la migration ci-dessus
          </li>
          <li style={{ fontSize: 14, color: T.text }}>
            Vérifiez que vos données sont bien présentes dans Supabase
          </li>
          <li style={{ fontSize: 14, color: T.text }}>
            Les nouveaux dashboards utiliseront automatiquement les données Supabase
          </li>
          <li style={{ fontSize: 14, color: T.text }}>
            Vous pouvez nettoyer localStorage une fois que vous êtes sûr que tout fonctionne
          </li>
        </ol>
      </div>
    </div>
  );
}
