import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { T as BaseT } from "@/lib/ui/tokens";

export default function TradingAccountsManager({ userId, onAccountSelect }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", broker: "MetaTrader 5" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const supabase = createClient();

  // Récupérer les comptes
  useEffect(() => {
    if (userId) {
      fetchAccounts();
    }
  }, [userId]);

  const fetchAccounts = async () => {
    try {
      // D'abord essayer localStorage
      const savedAccounts = JSON.parse(localStorage.getItem("trading_accounts") || "[]");
      setAccounts(savedAccounts);
      
      if (savedAccounts.length > 0) {
        setSelectedAccountId(savedAccounts[0].id);
        onAccountSelect?.(savedAccounts[0].id);
      }

      // OPTIONNEL: Si l'utilisateur est authentifié, charger aussi depuis Supabase
      if (userId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(userId)) {
          try {
            const { data, error: err } = await supabase
              .from("trading_accounts")
              .select("*")
              .eq("user_id", userId)
              .order("created_at", { ascending: false });

            if (!err && data) {
              // Merger les résultats Supabase avec localStorage
              const merged = [...savedAccounts, ...data];
              setAccounts(merged);
            }
          } catch (supabaseErr) {
            console.warn("Could not fetch from Supabase (using localStorage only):", supabaseErr);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      console.error("Error fetching accounts:", err);
    }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError("Le nom du compte est requis");
      return;
    }

    setLoading(true);
    try {
      // Créer un nouvel compte localement
      const newAccount = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_id: userId || "local_user",
        name: formData.name,
        broker: formData.broker,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Sauvegarder en localStorage
      const savedAccounts = JSON.parse(localStorage.getItem("trading_accounts") || "[]");
      savedAccounts.push(newAccount);
      localStorage.setItem("trading_accounts", JSON.stringify(savedAccounts));

      // OPTIONNEL: Si l'utilisateur est authentifié, syncer avec Supabase
      if (userId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(userId)) {
          try {
            await supabase
              .from("trading_accounts")
              .insert([
                {
                  user_id: userId,
                  name: formData.name,
                  broker: formData.broker,
                },
              ])
              .select();
          } catch (supabaseErr) {
            console.warn("Could not sync to Supabase (continuing with localStorage):", supabaseErr);
            // Continue - les données sont sauvegardées en localStorage
          }
        }
      }

      setFormData({ name: "", broker: "MetaTrader 5" });
      setShowForm(false);
      setError(null);
      fetchAccounts();
    } catch (err) {
      setError(err.message || "Erreur lors de la création du compte");
      console.error("Error creating account:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce compte et tous ses trades ?")) {
      return;
    }

    try {
      // Supprimer de localStorage
      const savedAccounts = JSON.parse(localStorage.getItem("trading_accounts") || "[]");
      const filtered = savedAccounts.filter(acc => acc.id !== accountId);
      localStorage.setItem("trading_accounts", JSON.stringify(filtered));

      // OPTIONNEL: Si l'utilisateur est authentifié et que c'est un UUID Supabase, supprimer aussi là-bas
      if (userId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(accountId)) {
          try {
            await supabase
              .from("trading_accounts")
              .delete()
              .eq("id", accountId)
              .eq("user_id", userId);
          } catch (supabaseErr) {
            console.warn("Could not delete from Supabase (deleted locally):", supabaseErr);
          }
        }
      }

      if (selectedAccountId === accountId) {
        setSelectedAccountId(null);
      }
      setError(null);
      fetchAccounts();
    } catch (err) {
      setError(err.message || "Erreur lors de la suppression du compte");
      console.error("Error deleting account:", err);
    }
  };

  const getBrokerLogo = (broker) => {
    if (broker === "MetaTrader 5") {
      return "🔷";
    } else if (broker === "Tradovate") {
      return "📊";
    }
    return "💼";
  };

  const T = {
    ...BaseT,
    // Clés absentes de BaseT, en var pour rester dark-aware :
    bgLight: "var(--color-card-bg, #FFFFFF)",
    accentHover: "var(--color-hover-bg, #F0F0F0)",
  };

  return (
    <div style={{ padding: "20px", maxWidth: "100%" }}>
      <div style={{ marginBottom: "24px" }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: T.text,
            marginBottom: 16,
          }}
        >
          📈 Comptes de Trading
        </h3>

        {/* Affichage des comptes */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {accounts.map((account) => (
            <div
              key={account.id}
              role="button"
              tabIndex={0}
              aria-pressed={selectedAccountId === account.id}
              aria-label={account.name}
              onClick={() => {
                setSelectedAccountId(account.id);
                onAccountSelect?.(account.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedAccountId(account.id);
                  onAccountSelect?.(account.id);
                }
              }}
              style={{
                padding: 16,
                background: selectedAccountId === account.id ? T.accentHover : T.bgLight,
                border: `2px solid ${selectedAccountId === account.id ? T.accent : T.border}`,
                borderRadius: "var(--radius-card)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (selectedAccountId !== account.id) {
                  e.currentTarget.style.background = T.accentHover;
                  e.currentTarget.style.borderColor = T.border2;
                }
              }}
              onMouseLeave={(e) => {
                if (selectedAccountId !== account.id) {
                  e.currentTarget.style.background = T.bgLight;
                  e.currentTarget.style.borderColor = T.border;
                }
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>
                    {getBrokerLogo(account.broker)}
                  </div>
                  <h4
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: T.text,
                      margin: 0,
                    }}
                  >
                    {account.name}
                  </h4>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAccount(account.id);
                  }}
                  aria-label={`Supprimer le compte ${account.name}`}
                  title="Supprimer le compte"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: T.textSub,
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1,
                    minWidth: 32,
                    minHeight: 32,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: T.textSub,
                  marginBottom: 8,
                }}
              >
                {account.broker}
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: T.accent,
                  fontWeight: 500,
                }}
              >
                {account.trades?.[0]?.count || 0} trades
              </div>
            </div>
          ))}
        </div>

        {/* Bouton + Formulaire de création */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: "10px 16px",
              background: T.accent,
              color: T.white,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = T.textSub;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = T.accent;
            }}
          >
            + Ajouter un compte
          </button>
        ) : (
          <form
            onSubmit={handleCreateAccount}
            style={{
              padding: 16,
              background: T.bgLight,
              border: `1px solid ${T.border}`,
              borderRadius: "var(--radius-card)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <input
              type="text"
              placeholder="Nom du compte (ex: My Funded 50k)"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                padding: "10px 12px",
                background: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: "var(--radius-field)",
                color: T.text,
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
              }}
              autoFocus
            />

            <select
              value={formData.broker}
              onChange={(e) => setFormData({ ...formData, broker: e.target.value })}
              style={{
                padding: "10px 12px",
                background: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: "var(--radius-field)",
                color: T.text,
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <option value="MetaTrader 5">🔷 MetaTrader 5</option>
              <option value="Tradovate">📊 Tradovate</option>
            </select>

            {error && (
              <div style={{ color: T.red, fontSize: 12 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "10px 16px",
                  background: loading ? T.textMut : T.accent,
                  color: T.white,
                  border: "none",
                  borderRadius: "var(--radius-field)",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  flex: 1,
                }}
              >
                {loading ? "Création..." : "Créer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  color: T.textSub,
                  border: `1px solid ${T.border}`,
                  borderRadius: "var(--radius-field)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  flex: 1,
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>

      {accounts.length === 0 && !showForm && (
        <div
          style={{
            padding: 20,
            background: T.bgLight,
            border: `1px dashed ${T.border}`,
            borderRadius: "var(--radius-card)",
            textAlign: "center",
            color: T.textSub,
            fontSize: 13,
          }}
        >
          <p style={{ margin: 0, marginBottom: 12 }}>
            Aucun compte créé. Créez-en un pour commencer à ajouter des trades.
          </p>
        </div>
      )}
    </div>
  );
}
