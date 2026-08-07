import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { T as BaseT } from "@/lib/ui/tokens";

export default function AccountSelector({ userId, onAccountSelect, selectedAccountId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (userId) {
      fetchAccounts();
    }
  }, [userId]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      // D'abord charger depuis localStorage
      const savedAccounts = JSON.parse(localStorage.getItem("trading_accounts") || "[]");
      setAccounts(savedAccounts);

      // OPTIONNEL: Si l'utilisateur est authentifié, charger aussi depuis Supabase
      if (userId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(userId)) {
          try {
            const { data, error } = await supabase
              .from("trading_accounts")
              .select("*")
              .eq("user_id", userId)
              .order("created_at", { ascending: false });

            if (!error && data) {
              setAccounts([...savedAccounts, ...data]);
            }
          } catch (supabaseErr) {
            console.warn("Could not fetch from Supabase (using localStorage only):", supabaseErr);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching accounts:", err);
    } finally {
      setLoading(false);
    }
  };

  const getBrokerEmoji = (broker) => {
    if (broker === "MetaTrader 5") return "🔷";
    if (broker === "Tradovate") return "📊";
    return "💼";
  };

  const T = { ...BaseT };

  if (accounts.length === 0) {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: T.redBg,
          border: `1px solid ${T.redBd}`,
          borderRadius: "var(--radius-field)",
          fontSize: 13,
          color: T.red,
          marginBottom: 16,
        }}
      >
        ⚠️ Vous devez d'abord créer un compte de trading avant d'ajouter des trades.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: T.text,
          marginBottom: 6,
        }}
      >
        Compte de Trading *
      </label>
      <select
        value={selectedAccountId || ""}
        onChange={(e) => onAccountSelect(e.target.value)}
        aria-label="Compte de Trading"
        style={{
          width: "100%",
          padding: "12px 12px",
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          fontSize: 13,
          outline: "none",
          fontFamily: "inherit",
          backgroundColor: T.white,
          color: T.text,
          cursor: "pointer",
        }}
      >
        <option value="">-- Sélectionner un compte --</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {getBrokerEmoji(account.broker)} {account.name} ({account.broker})
          </option>
        ))}
      </select>
      <p
        style={{
          fontSize: 11,
          color: T.textSub,
          marginTop: 4,
          margin: "4px 0 0 0",
        }}
      >
        Choisissez le compte auquel ce trade appartient
      </p>
    </div>
  );
}
