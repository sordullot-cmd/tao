"use client";

import React, { useState, useMemo } from "react";
import { ChevronDown, Plus, Check, ArrowRight, Trash2 } from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { t, useLang } from "@/lib/i18n";
import { T as BaseT } from "@/lib/ui/tokens";

const T = { ...BaseT };

const STORAGE_KEY = "tr4de_prop_firm_accounts";
const STORAGE_SIM_KEY = "tr4de_scaling_sim";

const STATUS_META = {
  funded:  { label: "Financé",  color: T.green, bg: T.greenBg },
  phase1:  { label: "Phase 1",  color: T.blue,  bg: T.blueBg },
  phase2:  { label: "Phase 2",  color: T.amber, bg: T.amberBg },
  failed:  { label: "Échoué",   color: T.red,   bg: T.redBg },
};

const FIRMS = ["Apex Trader Funding", "FTMO", "The Funded Trader", "Topstep", "MyFundedFutures", "Autre"];
const SIZES = ["10k", "25k", "50k", "100k", "150k", "200k"];

const fmtMoney = (n) => `${getCurrencySymbol()}${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const sizeToUsd = (s) => {
  const m = String(s || "").match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const u = (m[2] || "").toLowerCase();
  return u === "k" ? num * 1000 : u === "m" ? num * 1_000_000 : num;
};

export default function ScalingPage({ onGeneratePlan }) {
  useLang();
  const [accounts, setAccounts] = useCloudState(STORAGE_KEY, "prop_firm_accounts", []);
  const [sim, setSim] = useCloudState(STORAGE_SIM_KEY, "scaling_sim", { capitalSize: 50000, pctMonthly: 5, accountsTarget: 3, weeksPerEval: 7 });
  const [expanded, setExpanded] = useState({});
  const [showForm, setShowForm] = useState(false);

  const totalCapital = accounts.filter(a => a.status !== "failed").reduce((s, a) => s + sizeToUsd(a.size), 0);
  const totalPnL = accounts.reduce((s, a) => s + (Number(a.pnl) || 0), 0);
  const activeCount = accounts.filter(a => a.status !== "failed").length;

  return (
    <div className="anim-1" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* SECTION 1 — Header metrics */}
      <div className="tr4de-kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <MetricCard label="Capital total géré" value={fmtMoney(totalCapital)} />
        <MetricCard label="Profit cumulé" value={`${totalPnL >= 0 ? "+" : ""}${fmtMoney(Math.abs(totalPnL))}`} valueColor={totalPnL > 0 ? T.green : totalPnL < 0 ? T.red : T.text} />
        <MetricCard label="Comptes actifs" value={`${activeCount} / ${accounts.length || 0}`} />
      </div>

      {/* SECTION 2 — Liste comptes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>Mes comptes</div>
        {accounts.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: T.textSub, fontSize: 12, background: T.white, border: `1px dashed ${T.border}`, borderRadius: "var(--radius-card)" }}>
            Aucun compte pour l'instant
          </div>
        )}
        {accounts.map(acc => (
          <AccountCard
            key={acc.id}
            account={acc}
            expanded={!!expanded[acc.id]}
            onToggle={() => setExpanded(p => ({ ...p, [acc.id]: !p[acc.id] }))}
            onDelete={() => setAccounts(prev => prev.filter(a => a.id !== acc.id))}
          />
        ))}
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "12px 16px", border: `1px dashed ${T.border}`, borderRadius: "var(--radius-card)",
            background: "transparent", color: T.textSub, fontSize: 13, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.text; e.currentTarget.style.color = T.text; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSub; }}
        >
          <Plus size={14} strokeWidth={2} /> Ajouter un compte
        </button>
      </div>

      {/* MODAL — ajout compte */}
      {showForm && (
        <AccountForm
          onClose={() => setShowForm(false)}
          onSave={(acc) => { setAccounts(prev => [...prev, acc]); setShowForm(false); }}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, valueColor = T.text }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: T.textMut, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function AccountCard({ account, expanded, onToggle, onDelete }) {
  const meta = STATUS_META[account.status] || STATUS_META.phase1;
  const failed = account.status === "failed";
  const pnl = Number(account.pnl) || 0;
  const target = Number(account.targetProfit) || 0;
  const pct = target > 0 ? Math.min(100, Math.max(0, (pnl / target) * 100)) : 0;

  return (
    <div style={{
      background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden",
      opacity: failed ? 0.55 : 1,
    }}>
      {/* HEADER */}
      <div
        onClick={failed ? undefined : onToggle}
        role={failed ? undefined : "button"}
        tabIndex={failed ? undefined : 0}
        aria-expanded={failed ? undefined : expanded}
        onKeyDown={failed ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
          cursor: failed ? "default" : "pointer",
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: -0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {account.firm} — ${account.size} {account.ref ? `#${account.ref}` : ""}
          </div>
          <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>
            {meta.label}{account.subtitle ? ` · ${account.subtitle}` : ""}
          </div>
        </div>
        <span style={{
          padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
          background: meta.bg, color: meta.color,
        }}>{meta.label}</span>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Supprimer" aria-label="Supprimer"
          style={{ background: "transparent", border: "none", color: T.textMut, cursor: "pointer", padding: 4, display: "inline-flex", borderRadius: 6 }}
          onMouseEnter={e => { e.currentTarget.style.color = T.red; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.textMut; }}
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
        {!failed && (
          <ChevronDown size={14} strokeWidth={1.75} color={T.textMut} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .15s ease" }} />
        )}
      </div>

      {/* BODY */}
      {!failed && expanded && (
        <div style={{ padding: "16px 18px 18px", borderTop: `1px solid ${T.border}` }}>
          {target > 0 && (() => {
            const achieved = pnl >= target;
            const inLoss = pnl < 0;
            const barColor = achieved ? T.green : inLoss ? T.red : T.blue;
            const remaining = Math.max(0, target - pnl);
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.textMut, marginBottom: 2 }}>
                      Progression vers l'objectif
                    </div>
                    <div style={{ fontSize: 11, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: inLoss ? T.red : achieved ? T.green : T.text, fontWeight: 600 }}>
                        {pnl >= 0 ? "+" : ""}{fmtMoney(Math.abs(pnl))}
                      </span>
                      <span style={{ color: T.textMut }}> / {fmtMoney(target)}</span>
                      {!achieved && !inLoss && (
                        <span style={{ color: T.textMut, marginLeft: 8 }}>
                          il reste {fmtMoney(remaining)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 700,
                    color: barColor, letterSpacing: -0.4,
                    fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                  }}>
                    {Math.round(pct)}<span style={{ fontSize: 14, fontWeight: 600 }}>%</span>
                  </div>
                </div>
                <div style={{ height: 8, background: T.bg, borderRadius: 999, overflow: "hidden", border: `1px solid ${T.border}`, position: "relative" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`, borderRadius: 999,
                    background: achieved
                      ? `linear-gradient(90deg, ${T.green} 0%, ${T.green} 100%)`
                      : inLoss
                      ? T.red
                      : `linear-gradient(90deg, ${T.blue} 0%, ${T.text} 100%)`,
                    transition: "width .4s ease",
                    boxShadow: achieved ? "0 0 0 1px rgba(16,163,74,0.25)" : "none",
                  }} />
                  {achieved && (
                    <div style={{
                      position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                      width: 14, height: 14, borderRadius: "50%",
                      background: T.white, color: T.green,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Check size={9} strokeWidth={3} />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Stats détaillées en grille 3 colonnes — séparées par lignes verticales fines */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)",
            overflow: "hidden",
          }}>
            <MiniMetric label="P&L total"    value={`${pnl >= 0 ? "+" : ""}${fmtMoney(Math.abs(pnl))}`} color={pnl > 0 ? T.green : pnl < 0 ? T.red : T.text} />
            <MiniMetric label="DD restant"   value={fmtMoney(account.ddRemaining)}    color={Number(account.ddRemaining) > 0 ? T.text : T.textMut} divider />
            <MiniMetric label="Payout dispo" value={fmtMoney(account.payoutAvailable)} color={Number(account.payoutAvailable) > 0 ? T.green : T.textMut} divider />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value, color = T.text, divider }) {
  return (
    <div style={{
      padding: "10px 12px",
      borderLeft: divider ? `1px solid ${T.border}` : "none",
    }}>
      <div style={{ fontSize: 10, color: T.textMut, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function AccountForm({ onClose, onSave }) {
  const [firm, setFirm] = useState(FIRMS[0]);
  const [size, setSize] = useState("100k");
  const [status, setStatus] = useState("phase1");
  const [trailingDD, setTrailingDD] = useState(true);
  const [consistencyRule, setConsistencyRule] = useState(false);
  const [targetProfit, setTargetProfit] = useState("");
  const [maxDD, setMaxDD] = useState("");
  const [ref, setRef] = useState("");

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    onSave({
      id: Date.now(),
      firm, size, status, ref,
      trailingDD, consistencyRule,
      targetProfit: parseFloat(targetProfit) || 0,
      maxDD: parseFloat(maxDD) || 0,
      pnl: 0, ddRemaining: 0, payoutAvailable: 0,
      subtitle: "",
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div {...backdropDismiss(onClose)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-label="Nouveau compte" onClick={e => e.stopPropagation()} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-modal)", maxWidth: 440, width: "100%", boxShadow: "var(--elev-overlay)", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, letterSpacing: -0.1 }}>Nouveau compte</div>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Firm">
            <select value={firm} onChange={e => setFirm(e.target.value)} style={inputStyle()}>
              {FIRMS.map(f => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Taille du compte">
            <select value={size} onChange={e => setSize(e.target.value)} style={inputStyle()}>
              {SIZES.map(s => <option key={s} value={s}>${s}</option>)}
            </select>
          </Field>
          <Field label="Type / Statut">
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle()}>
              <option value="phase1">Phase 1</option>
              <option value="phase2">Phase 2</option>
              <option value="funded">Compte financé</option>
              <option value="failed">Échoué</option>
            </select>
          </Field>
          <Field label="Référence (optionnel)">
            <input type="text" value={ref} onChange={e => setRef(e.target.value)} placeholder="ATF-7821" style={inputStyle()} />
          </Field>
          <Field label="Objectif de profit ($)">
            <input type="number" value={targetProfit} onChange={e => setTargetProfit(e.target.value)} placeholder="5000" style={inputStyle()} />
          </Field>
          <Field label="Drawdown max (%)">
            <input type="number" value={maxDD} onChange={e => setMaxDD(e.target.value)} placeholder="6" style={inputStyle()} />
          </Field>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
            <Toggle label="Trailing drawdown" checked={trailingDD} onChange={setTrailingDD} />
            <Toggle label="Consistency rule" checked={consistencyRule} onChange={setConsistencyRule} />
          </div>
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 8, background: T.bg }}>
          <button onClick={onClose} style={{ padding: "8px 16px", height: 34, borderRadius: 999, border: `1px solid ${T.border}`, background: T.white, color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          <button onClick={submit} style={{ padding: "8px 18px", height: 34, borderRadius: 999, border: `1px solid ${T.text}`, background: T.white, color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Créer</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: T.textSub, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}
function inputStyle() {
  return {
    padding: "8px 12px", borderRadius: "var(--radius-card)", border: `1px solid ${T.border}`,
    background: T.white, color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none",
  };
}
function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: T.text }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 32, height: 18, borderRadius: 999, background: checked ? T.text : T.border2,
          position: "relative", transition: "background .15s ease", flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: checked ? 16 : 2,
          width: 14, height: 14, borderRadius: "50%", background: T.white,
          transition: "left .15s ease",
        }} />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function RoadmapSection({ accounts, sim, glued }) {
  useLang();
  const fundedCount = accounts.filter(a => a.status === "funded").length;
  const total = accounts.length;
  // Taille de compte persistée — partage le même cloud-state que le
  // simulateur de ScalingPage pour rester sync entre les deux pages.
  const [simState, setSimState] = useCloudState("tr4de_scaling_sim", "scaling_sim", {
    capitalSize: sim?.capitalSize || 50000, pctMonthly: 5, accountsTarget: 3, weeksPerEval: 7,
  });
  const capital = simState.capitalSize || sim?.capitalSize || 50000;
  const setCapital = (v) => setSimState(prev => ({ ...(prev || {}), capitalSize: v }));
  const capitalLabel = `$${(capital / 1000).toFixed(0)}k`;
  const profitTarget = Math.round(capital * 0.06);     // ~6 % du capital
  const trailingDD = Math.round(capital * 0.05);       // ~5 % du capital
  const dailyTargetMin = Math.round(capital * 0.003);  // 0.3 % par jour
  const dailyTargetMax = Math.round(capital * 0.004);  // 0.4 % par jour
  const consistencyDay = Math.round(capital * 0.018);  // 30 % du target ≈ 1.8 % capital
  const totalCapitalAt3 = capital * 3;
  const totalCapitalAt5 = capital * 5;
  const monthlyMin = Math.round(totalCapitalAt5 * 0.015);
  const monthlyMax = Math.round(totalCapitalAt5 * 0.030);

  const steps = [
    {
      title: `Passer l'évaluation ${capitalLabel}`,
      desc: `Atteindre ${fmtMoney(profitTarget)} de profit sans toucher le trailing DD de ${fmtMoney(trailingDD)}. Viser ${fmtMoney(dailyTargetMin)}–${fmtMoney(dailyTargetMax)}/jour max.`,
      tip: `Consistency rule : un jour à +${fmtMoney(profitTarget / 3)} fait baisser ton plafond journalier pour la suite.`,
      eta: "~2–3 sem.",
    },
    {
      title: "Obtenir le 1er payout",
      desc: "Trader 7 jours minimum sur le compte financé puis demander le payout. Apex prend 10 % sur le 1er, 0 % ensuite.",
      tip: "Ne pas retirer plus de 50 % du profit dispo — garder du buffer de drawdown.",
      eta: "+1 sem.",
    },
    {
      title: `Lancer un 2ème compte ${capitalLabel} en parallèle`,
      desc: "Dès le 1er compte stable, lancer une 2ème évaluation. Mêmes setup et stratégie, en simultané.",
      tip: "Apex autorise plusieurs comptes en même temps — c'est la clé pour scaler vite.",
      eta: "En cours",
    },
    {
      title: "3 payouts consécutifs sur le compte #1",
      desc: `Prouve la régularité. Signal pour monter en taille : scaling interne ${capitalLabel} → $${(capital * 2 / 1000).toFixed(0)}k, ou nouveau compte.`,
      tip: "Si winrate > 60 % et R:R > 1.5 → scaling interne. Sinon → nouveaux comptes.",
      eta: "~6 sem.",
    },
    {
      title: "3 comptes financés actifs",
      desc: `${fmtMoney(totalCapitalAt3)} de capital géré. Standardiser la stratégie et mesurer les métriques compte par compte.`,
      tip: "Même stratégie, même taille de lot proportionnelle, même gestion du risque.",
      eta: "~10 sem.",
    },
    {
      title: "Scaling max — 5+ comptes actifs",
      desc: `5 × ${capitalLabel} = ${fmtMoney(totalCapitalAt5)} géré, ~${fmtMoney(monthlyMin)}–${fmtMoney(monthlyMax)}/mois.`,
      tip: `Éval ${capitalLabel} ≈ $167/mois — à comparer au payout potentiel avant d'en ajouter.`,
      eta: "—",
    },
  ];

  // Étape courante choisie manuellement (persistée). Initialisée par
  // détection automatique selon le nombre de comptes financés au premier
  // chargement, puis l'utilisateur prend la main.
  const autoIdx = (() => {
    if (fundedCount >= 5) return 5;
    if (fundedCount >= 3) return 4;
    if (fundedCount >= 2) return 3;
    if (fundedCount >= 1 && total >= 2) return 2;
    if (fundedCount >= 1) return 1;
    return 0;
  })();
  const [stepIdx, setStepIdx] = useCloudState("tr4de_scaling_step", "scaling_step", autoIdx);
  const currentStep = Math.max(0, Math.min(steps.length - 1, Number(stepIdx) || 0));

  const [open, setOpen] = useState(false);
  const doneCount = currentStep;

  return (
    <div style={{
      background: T.white,
      border: `1px solid ${T.border}`,
      borderRadius: glued ? "0 0 var(--radius-card) var(--radius-card)" : "var(--radius-card)",
      // En mode glued on garde le borderTop : il sert de séparateur entre
      // les 5 KPIs et la roadmap.
      overflow: "hidden",
    }}>
      <div
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        role="button"
        style={{
          width: "100%", padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 12,
          background: "transparent",
          borderBottom: open ? `1px solid ${T.border}` : "none",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          transition: "background .12s ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover-bg, #F0F0F0)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: -0.1 }}>{t("scaling.roadmapTitle")}</div>
          <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>
            {t("scaling.roadmapSubtitle").replace("{n}", String(steps.length))}
            {doneCount > 0 && ` · ${t("scaling.roadmapDone").replace("{c}", String(doneCount)).replace("{t}", String(steps.length)).replace("{s}", doneCount > 1 ? "s" : "")}`}
          </div>
        </div>
        {/* Sélecteur Taille du compte juste à côté du bouton "Déployer" */}
        <div onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 4 }}>
          {[50000, 100000, 150000, 200000].map(v => {
            const active = capital === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setCapital(v)}
                style={{
                  padding: "3px 9px", borderRadius: 999,
                  border: `1px solid ${active ? T.text : T.border}`,
                  background: active ? T.text : T.white,
                  color: active ? T.white : T.textSub,
                  fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  fontVariantNumeric: "tabular-nums",
                }}>
                ${v / 1000}k
              </button>
            );
          })}
        </div>
        <span style={{
          fontSize: 11, color: T.textSub, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          {open ? t("scaling.collapse") : t("scaling.expand")}
          <ArrowRight size={12} strokeWidth={2}
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s ease" }} />
        </span>
      </div>
      {open && (
      <div
        onDoubleClick={(e) => {
          if (e.target.closest("button, input, a, select")) return;
          setOpen(false);
        }}
      >
      <div style={{ padding: "8px 4px" }}>
        {steps.map((s, i) => {
          const state = i < currentStep ? "done" : i === currentStep ? "current" : "todo";
          const ringBg = state === "done" ? T.green : state === "current" ? T.blue : T.bg;
          const ringColor = state === "todo" ? T.textMut : T.white;
          const ringBorder = state === "todo" ? T.border : "transparent";
          const isLast = i === steps.length - 1;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "16px 14px",
              borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
              background: state === "current" ? "var(--color-hover-bg, #F0F0F0)" : "transparent",
              transition: "background .12s ease",
            }}>
              <button
                type="button"
                onClick={() => setStepIdx(i)}
                aria-label={`Aller à l'étape ${i + 1}`}
                title={`Marquer l'étape ${i + 1} comme en cours`}
                style={{
                  width: 26, height: 26, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: ringBg, color: ringColor, border: `1px solid ${ringBorder}`,
                  fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                  cursor: "pointer", padding: 0, fontFamily: "inherit",
                  transition: "transform .12s ease, box-shadow .12s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 0 3px ${T.blueBg}`; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
              >
                {state === "done" ? <Check size={13} strokeWidth={2.5} /> : state === "current" ? <ArrowRight size={13} strokeWidth={2.5} /> : (i + 1)}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: T.textSub, marginTop: 6, lineHeight: 1.5 }}>{s.desc}</div>
                {s.tip && (
                  <div style={{ fontSize: 11, color: T.textMut, marginTop: 8, fontStyle: "italic", lineHeight: 1.45 }}>
                    {s.tip}
                  </div>
                )}
                {state === "current" && (
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {currentStep > 0 && (
                      <button
                        type="button"
                        onClick={() => setStepIdx(i - 1)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 12px", borderRadius: 999,
                          border: `1px solid ${T.border}`, background: T.white,
                          color: T.textSub, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                        }}>
                        <ArrowRight size={11} strokeWidth={2} style={{ transform: "rotate(180deg)" }} />
                        {t("scaling.prevStep")}
                      </button>
                    )}
                    {!isLast && (
                      <button
                        type="button"
                        onClick={() => setStepIdx(i + 1)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 12px", borderRadius: 999,
                          border: "none", background: T.blue, color: "#FFFFFF",
                          fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        }}>
                        <Check size={11} strokeWidth={2.5} /> {t("scaling.markDone")}
                      </button>
                    )}
                    {isLast && (
                      <button
                        type="button"
                        onClick={() => setStepIdx(steps.length)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 12px", borderRadius: 999,
                          border: "none", background: T.green, color: "#FFFFFF",
                          fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        }}>
                        <Check size={11} strokeWidth={2.5} /> {t("scaling.roadmapDoneBtn")}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 11, color: T.textMut, fontWeight: 500,
                whiteSpace: "nowrap", flexShrink: 0, marginTop: 2,
              }}>{s.eta}</div>
            </div>
          );
        })}
      </div>
      </div>
      )}
    </div>
  );
}

export function SimulatorSection({ sim, setSim, accounts, onGeneratePlan }) {
  const totalCapital = sim.capitalSize * sim.accountsTarget;
  const monthlyRevenue = totalCapital * (sim.pctMonthly / 100);
  const challengesLeft = Math.max(0, sim.accountsTarget - accounts.filter(a => a.status === "funded").length);
  const weeksPerEval = Number(sim.weeksPerEval) || 7;
  const weeks = challengesLeft * weeksPerEval;

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: -0.1 }}>Simulateur de scaling</div>
        <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>Ajuste les paramètres pour estimer ton revenu cible</div>
      </div>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        <Slider label="Capital par compte" value={sim.capitalSize} min={50000} max={200000} step={50000} fmt={fmtMoney} onChange={v => setSim(p => ({ ...p, capitalSize: v }))} />
        <Slider label="% profit mensuel réaliste" value={sim.pctMonthly} min={1} max={10} step={0.5} fmt={v => `${v}%`} onChange={v => setSim(p => ({ ...p, pctMonthly: v }))} />
        <Slider label="Nombre de comptes visés" value={sim.accountsTarget} min={1} max={5} step={1} fmt={v => `${v}`} onChange={v => setSim(p => ({ ...p, accountsTarget: v }))} />
        <Slider label="Semaines par évaluation" value={sim.weeksPerEval ?? 7} min={1} max={16} step={1} fmt={v => `${v} sem.`} onChange={v => setSim(p => ({ ...p, weeksPerEval: v }))} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 4 }}>
          <MetricCard label="Revenu mensuel cible" value={fmtMoney(monthlyRevenue)} valueColor={T.green} />
          <MetricCard label="Capital total géré" value={fmtMoney(totalCapital)} />
          <MetricCard label="Temps estimé" value={`${weeks} sem.`} />
          <MetricCard label="Challenges restants" value={`${challengesLeft}`} />
        </div>

        {/* Timeline visuelle — stepper avec dots numérotés */}
        {(() => {
          const fundedCount = accounts.filter(a => a.status === "funded").length;
          const target = sim.accountsTarget;
          const pct = target > 0 ? Math.min(100, Math.round((fundedCount / target) * 100)) : 0;
          const remaining = Math.max(0, target - fundedCount);
          const allDone = fundedCount >= target;
          return (
            <div>
              {/* Header avec gros chiffre */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: T.textMut, marginBottom: 2 }}>Progression</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{
                      fontSize: 22, fontWeight: 700,
                      color: allDone ? T.green : T.text,
                      letterSpacing: -0.4, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                    }}>
                      {fundedCount}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
                      / {target}
                    </span>
                    <span style={{ fontSize: 11, color: T.textMut, marginLeft: 4 }}>
                      compte{target > 1 ? "s" : ""} financé{fundedCount > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600,
                  padding: "3px 10px", borderRadius: 999,
                  background: allDone ? T.greenBg : T.accentBg,
                  color: allDone ? T.green : T.text,
                  border: `1px solid ${allDone ? T.greenBd : T.border}`,
                  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                }}>
                  {pct}%
                </div>
              </div>

              {/* Stepper de comptes */}
              <div style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
                {Array.from({ length: target }).map((_, idx) => {
                  const done = idx < fundedCount;
                  const isNext = idx === fundedCount && !allDone;
                  return (
                    <React.Fragment key={idx}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        background: done ? T.green : isNext ? T.white : T.bg,
                        color: done ? T.white : isNext ? T.text : T.textMut,
                        border: `1px solid ${done ? T.green : isNext ? T.text : T.border}`,
                        fontSize: 10, fontWeight: 700, fontFamily: "var(--font-sans)",
                        boxShadow: isNext ? `0 0 0 3px ${T.accentBg}` : "none",
                        transition: "all .15s ease",
                      }}>
                        {done ? <Check size={10} strokeWidth={3} /> : idx + 1}
                      </div>
                      {idx < target - 1 && (
                        <div style={{
                          flex: 1, height: 2, margin: "0 3px",
                          background: idx < fundedCount - 1 ? T.green : (idx === fundedCount - 1 ? `linear-gradient(90deg, ${T.green} 0%, ${T.border} 100%)` : T.border),
                          borderRadius: "var(--radius-field)",
                          transition: "background .3s ease",
                        }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Sous-texte */}
              <div style={{ marginTop: 8, fontSize: 11, color: T.textMut }}>
                {allDone
                  ? "🎉 Objectif atteint — tu peux viser plus haut depuis le simulateur."
                  : remaining === 1
                    ? "Encore 1 compte à financer pour boucler l'objectif."
                    : `Encore ${remaining} comptes à financer pour boucler l'objectif.`}
              </div>
            </div>
          );
        })()}

        <button
          onClick={() => onGeneratePlan?.(sim)}
          style={{
            alignSelf: "flex-start",
            padding: "8px 18px", height: 34, borderRadius: 999,
            border: `1px solid ${T.text}`, background: T.white, color: T.text,
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            marginTop: 4,
          }}
        >
          Générer le plan détaillé
        </button>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }) {
  const id = React.useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <style>{`
        input[type="range"].tr4de-slim {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 4px; padding: 0; margin: 0;
          background: transparent; cursor: pointer; outline: none;
        }
        input[type="range"].tr4de-slim::-webkit-slider-runnable-track {
          height: 4px; border-radius: 2px;
          background: linear-gradient(to right, ${T.text} 0%, ${T.text} var(--p,0%), ${T.border} var(--p,0%), ${T.border} 100%);
        }
        input[type="range"].tr4de-slim::-moz-range-track {
          height: 4px; border-radius: 2px; background: ${T.border};
        }
        input[type="range"].tr4de-slim::-moz-range-progress {
          height: 4px; border-radius: 2px; background: ${T.text};
        }
        input[type="range"].tr4de-slim::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 12px; height: 12px; border-radius: 50%;
          background: ${T.white}; border: 2px solid ${T.text};
          margin-top: -4px; cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12);
          transition: transform .12s ease;
        }
        input[type="range"].tr4de-slim::-webkit-slider-thumb:hover { transform: scale(1.15); }
        input[type="range"].tr4de-slim::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 50%;
          background: ${T.white}; border: 2px solid ${T.text}; cursor: pointer;
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: T.textMut, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</span>
      </div>
      <input
        id={id}
        className="tr4de-slim"
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ "--p": `${pct}%` }}
      />
    </div>
  );
}
