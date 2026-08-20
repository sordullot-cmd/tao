"use client";

import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import {
  useStrategies,
  useTradingJournal,
  useTradingRules,
  useUserPreferences,
} from "@/lib/hooks/useUserData";
import { useTrades, useTradingAccounts, useTradeDetails } from "@/lib/hooks/useTradeData";
import { useState } from "react";
import { T as BaseT } from "@/lib/ui/tokens";

// Écran de debug : tokens partagés (dark-aware) au lieu de hex en dur.
const T = { ...BaseT };

export default function DataMigrationTest() {
  const { user } = useAuth();
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { entries: journalEntries, loading: journalLoading } = useTradingJournal();
  const { rules, loading: rulesLoading } = useTradingRules();
  const { preferences, loading: prefsLoading } = useUserPreferences();
  const { trades, loading: tradesLoading } = useTrades();
  const { accounts, loading: accountsLoading } = useTradingAccounts();
  const { details: tradeDetails, loading: detailsLoading } = useTradeDetails();

  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const Section = ({ title, icon, data, loading, count }) => (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: "var(--radius-card)",
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => toggleSection(title)}
        style={{
          width: "100%",
          padding: "16px",
          border: "none",
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 14,
          fontWeight: 500,
          color: T.text,
        }}
      >
        <span>
          {icon} {title}
          {count !== undefined && (
            <span style={{ marginLeft: 8, color: T.textMut, fontSize: 12 }}>
              ({count} éléments)
            </span>
          )}
        </span>
        <span>{expandedSections[title] ? "▼" : "▶"}</span>
      </button>

      {expandedSections[title] && (
        <div
          style={{
            padding: "16px",
            borderTop: `1px solid ${T.border}`,
            background: T.bg,
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {loading ? (
            <div style={{ color: T.textMut, fontSize: 12 }}>Chargement...</div>
          ) : (
            <pre
              style={{
                fontSize: 11,
                color: T.text,
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "40px 24px",
        fontFamily: "var(--font-sans)",
        background: T.bg,
        minHeight: "100vh",
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
          🔬 Test de Données Supabase
        </h1>
        <p style={{ fontSize: 14, color: T.textMut }}>
          Vérifiez que vos données sont correctement synchronisées
        </p>
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: T.surface,
            borderRadius: "var(--radius-card)",
            border: `1px solid ${T.border}`,
            fontSize: 12,
            color: T.textMut,
          }}
        >
          <strong>Utilisateur connecté:</strong> {user?.email || "Non connecté"}
        </div>
      </div>

      {/* Statistiques Globales */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <StatCard label="Stratégies" value={strategies.length} icon="📊" />
        <StatCard label="Journal Entries" value={journalEntries.length} icon="📝" />
        <StatCard label="Règles" value={rules.length} icon="✅" />
        <StatCard label="Trades" value={trades.length} icon="📈" />
        <StatCard label="Comptes" value={accounts.length} icon="💼" />
        <StatCard label="Détails Trades" value={Object.keys(tradeDetails).length} icon="🏷️" />
      </div>

      {/* Sections Détaillées */}
      <div style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: T.text,
            marginBottom: 16,
          }}
        >
          📋 Détails des Données
        </h2>

        <Section
          title="Stratégies"
          icon="📊"
          data={strategies}
          loading={strategiesLoading}
          count={strategies.length}
        />

        <Section
          title="Journal de Trading"
          icon="📝"
          data={journalEntries}
          loading={journalLoading}
          count={journalEntries.length}
        />

        <Section
          title="Règles de Trading"
          icon="✅"
          data={rules}
          loading={rulesLoading}
          count={rules.length}
        />

        <Section
          title="Préférences Utilisateur"
          icon="⚙️"
          data={preferences}
          loading={prefsLoading}
        />

        <Section
          title="Trades"
          icon="📈"
          data={trades}
          loading={tradesLoading}
          count={trades.length}
        />

        <Section
          title="Comptes de Trading"
          icon="💼"
          data={accounts}
          loading={accountsLoading}
          count={accounts.length}
        />

        <Section
          title="Détails des Trades"
          icon="🏷️"
          data={tradeDetails}
          loading={detailsLoading}
          count={Object.keys(tradeDetails).length}
        />
      </div>

      {/* Conseils */}
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: "var(--radius-card)",
          padding: 16,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>
          💡 Conseils
        </h3>
        <ul
          style={{
            fontSize: 12,
            color: T.textMut,
            lineHeight: 1.6,
            paddingLeft: 20,
          }}
        >
          <li>Si les données sont vides, lancez d'abord la migration</li>
          <li>Vous pouvez cliquer sur chaque section pour voir les données brutes (JSON)</li>
          <li>Les changements devraient être visibles en temps réel</li>
          <li>Consultez Supabase Dashboard pour une vue plus détaillée</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: "var(--radius-card)",
        padding: "16px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: T.blue,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: T.textMut }}>{label}</div>
    </div>
  );
}
