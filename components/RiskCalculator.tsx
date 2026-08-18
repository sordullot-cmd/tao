"use client";

import React, { useMemo, useState } from "react";
import { Calculator, Info } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { getContractMultiplier } from "@/lib/csvParsers";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { Field as DAField, FIELD as DA_FIELD } from "@/components/ui/form";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";

/**
 * RiskCalculator — calcule la taille de position optimale pour un trade donné.
 *
 * Inputs:
 *  - taille de compte
 *  - % risque max
 *  - symbole (auto-multiplicateur via csvParsers)
 *  - entry / stop loss / take profit
 *
 * Outputs:
 *  - perte $ par contrat
 *  - nb contrats max selon le budget de risque
 *  - perte / gain en $ + en % du compte
 *  - ratio R:R
 *
 * 100% client-side, aucun appel réseau. Persiste les inputs en localStorage
 * pour réouverture rapide.
 */

const LS_KEY = "tr4de_risk_calc_inputs";

interface RiskInputs {
  accountSize: string;
  riskPct: string;
  symbol: string;
  entry: string;
  stop: string;
  target: string;
}

const DEFAULT: RiskInputs = {
  accountSize: "50000",
  riskPct: "1",
  symbol: "ES",
  entry: "",
  stop: "",
  target: "",
};

function loadInputs(): RiskInputs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v) return { ...DEFAULT, ...JSON.parse(v) };
  } catch {}
  return DEFAULT;
}

export default function RiskCalculator() {
  const [inputs, setInputs] = useState<RiskInputs>(() => loadInputs());

  const update = (patch: Partial<RiskInputs>) => {
    const next = { ...inputs, ...patch };
    setInputs(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  };

  const result = useMemo(() => {
    const account = parseFloat(inputs.accountSize) || 0;
    const riskPct = parseFloat(inputs.riskPct) || 0;
    const entry = parseFloat(inputs.entry) || 0;
    const stop = parseFloat(inputs.stop) || 0;
    const target = parseFloat(inputs.target) || 0;
    const symbol = inputs.symbol.trim().toUpperCase();
    const mult = getContractMultiplier(symbol) || 1;

    const stopDistance = Math.abs(entry - stop);
    const targetDistance = Math.abs(target - entry);

    const lossPerContract = stopDistance * mult;
    const winPerContract = targetDistance * mult;
    const riskBudget = (account * riskPct) / 100;

    const maxContracts =
      lossPerContract > 0 ? Math.floor(riskBudget / lossPerContract) : 0;
    const totalRisk = maxContracts * lossPerContract;
    const totalReward = maxContracts * winPerContract;
    const rr = lossPerContract > 0 && targetDistance > 0
      ? targetDistance / stopDistance
      : 0;
    const lossPctOfAccount = account > 0 ? (totalRisk / account) * 100 : 0;
    const winPctOfAccount = account > 0 ? (totalReward / account) * 100 : 0;

    return {
      mult,
      lossPerContract,
      winPerContract,
      riskBudget,
      maxContracts,
      totalRisk,
      totalReward,
      rr,
      lossPctOfAccount,
      winPctOfAccount,
      ready: account > 0 && riskPct > 0 && entry > 0 && stop > 0 && entry !== stop,
    };
  }, [inputs]);

  const sym = getCurrencySymbol();
  const fmt = (n: number, dp = 2) =>
    `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

  return (
    <div style={{
      background: T.white,
      border: `1px solid ${T.border}`,
      borderRadius: "var(--radius-card)",
      padding: 18,
      fontFamily: "var(--font-sans)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Calculator size={16} strokeWidth={1.75} color={T.text} />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>
          Risk calculator
        </h3>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <Field label="Taille du compte">
          <input type="number" value={inputs.accountSize}
            onChange={e => update({ accountSize: e.target.value })}
            style={inputStyle()} placeholder="50000" />
        </Field>
        <Field label="Risque max (%)">
          <input type="number" step="0.1" value={inputs.riskPct}
            onChange={e => update({ riskPct: e.target.value })}
            style={inputStyle()} placeholder="1" />
        </Field>
        <Field label="Symbole">
          <input type="text" value={inputs.symbol}
            onChange={e => update({ symbol: e.target.value })}
            style={inputStyle()} placeholder="ES" />
        </Field>
        <Field label="Multiplicateur" hint={`${result.mult}× pour ${inputs.symbol.toUpperCase() || "—"}`}>
          <input type="number" value={result.mult} disabled
            style={{ ...inputStyle(), color: T.textMut, background: DA_FIELD_BG }} />
        </Field>
        <Field label="Entry">
          <input type="number" step="0.01" value={inputs.entry}
            onChange={e => update({ entry: e.target.value })}
            style={inputStyle()} placeholder="5000" />
        </Field>
        <Field label="Stop loss">
          <input type="number" step="0.01" value={inputs.stop}
            onChange={e => update({ stop: e.target.value })}
            style={inputStyle()} placeholder="4990" />
        </Field>
        <Field label="Take profit (optionnel)">
          <input type="number" step="0.01" value={inputs.target}
            onChange={e => update({ target: e.target.value })}
            style={inputStyle()} placeholder="5020" />
        </Field>
      </div>

      {result.ready ? (
        <div style={{
          background: T.bg,
          borderRadius: 10,
          padding: 14,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <Row label="Budget risque" value={fmt(result.riskBudget)} sub={`${inputs.riskPct}% du compte`} />
          <Row label="Perte / contrat" value={fmt(result.lossPerContract)} sub={`Stop à ${Math.abs(parseFloat(inputs.entry) - parseFloat(inputs.stop)).toFixed(2)} pts`} />
          <Row label="Contrats max" value={String(result.maxContracts)}
            color={result.maxContracts > 0 ? T.green : T.red}
            sub={result.maxContracts === 0 ? "Stop trop large pour le budget" : null} />
          {result.maxContracts > 0 && (
            <>
              <div style={{ height: 1, background: T.border, margin: "2px 0" }} />
              <Row label="Risque total" value={fmt(result.totalRisk)} sub={`${result.lossPctOfAccount.toFixed(2)}% du compte`} color={T.red} />
              {parseFloat(inputs.target) > 0 && (
                <>
                  <Row label="Gain potentiel" value={fmt(result.totalReward)} sub={`${result.winPctOfAccount.toFixed(2)}% du compte`} color={T.green} />
                  <Row label="Ratio R:R" value={`1:${result.rr.toFixed(2)}`}
                    color={result.rr >= 2 ? T.green : result.rr >= 1 ? T.amber : T.red}
                    sub={result.rr >= 2 ? "Favorable" : result.rr >= 1 ? "Neutre" : "Défavorable"} />
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: 12, background: T.bg, borderRadius: "var(--radius-card)",
          fontSize: 12, color: T.textMut,
        }}>
          <Info size={14} strokeWidth={1.75} />
          Entre la taille du compte, le risque, l&apos;entry et le stop pour calculer.
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  // Delegue a la brique commune (components/ui/form.jsx).
  return <DAField label={label} hint={hint}>{children}</DAField>;
}

function Row({ label, value, sub, color }: { label: string; value: string; sub?: string | null; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 11, color: T.textSub, fontWeight: 500 }}>{label}</span>
        {sub && <span style={{ fontSize: 10, color: T.textMut }}>{sub}</span>}
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: color || T.text, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/* Delegue a la brique commune (components/ui/form.jsx) : aplat en pilule. */
function inputStyle(): React.CSSProperties {
  return { ...DA_FIELD };
}
