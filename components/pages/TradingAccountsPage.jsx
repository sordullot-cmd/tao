import React, { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TradingAccountsManager from "@/components/TradingAccountsManager";
import { T as BaseT } from "@/lib/ui/tokens";

const T = { ...BaseT };

export default function TradingAccountsPage({ userId }) {
  const [selectedAccountId, setSelectedAccountId] = useState(null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: T.bg,
      }}
    >
      <div
        style={{
          padding: "24px 32px",
          borderBottom: `1px solid ${T.border}`,
          background: T.white,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: T.textSub,
            margin: 0,
          }}
        >
          Gérez vos comptes de trading et organisez vos trades par compte
        </p>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: T.white,
        }}
      >
        <TradingAccountsManager
          userId={userId}
          onAccountSelect={setSelectedAccountId}
        />
      </div>
    </div>
  );
}
