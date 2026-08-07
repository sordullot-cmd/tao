"use client";

import React from "react";
import {
  Plus, Trash2, ShieldCheck, Lock, Clock, AlertTriangle, TrendingUp,
  Flame, Target, Zap, Calendar as CalIcon, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Pencil, NotebookPen,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import {
  computeStats, describeRule, isRuleLive, RULE_LOCK_MS, computeJournaledDates,
} from "@/lib/compliance";
import { useComplianceRules } from "@/lib/hooks/useComplianceData";
import { useDailySessionNotes } from "@/lib/hooks/useDailySessionNotes";
import { useTradeNotes } from "@/lib/hooks/useTradeNotes";
import { Stat } from "@/components/ui/Stat";

/** Dates journalisées (note de session ou note de trade) pour la règle `journaling`. */
function useJournaledDates(trades) {
  const { notes: dailyNotes } = useDailySessionNotes();
  const { notes: tradeNotes } = useTradeNotes();
  return React.useMemo(
    () => computeJournaledDates(trades, dailyNotes, tradeNotes),
    [trades, dailyNotes, tradeNotes],
  );
}

const RULE_TYPES = [
  { value: "position_limit",        label: "Limite de position",     hint: "Max N contrats par trade",                Icon: Target },
  { value: "time_window",           label: "Fenêtre horaire",        hint: "Trade uniquement entre HH:MM et HH:MM",   Icon: Clock },
  { value: "instrument_ban",        label: "Instrument interdit",    hint: "Ne pas trader certains symboles",         Icon: XCircle },
  { value: "instrument_only",       label: "Instruments autorisés",  hint: "Trader uniquement ces symboles",          Icon: ShieldCheck },
  { value: "max_trades_per_day",    label: "Max trades / jour",      hint: "Cap sur le nombre de trades quotidiens",  Icon: AlertTriangle },
  { value: "max_daily_loss",        label: "Stop-loss journalier",   hint: "Cesser après une perte cumulée",          Icon: TrendingUp },
  { value: "no_reentry_after_loss", label: "Cooldown après perte",   hint: "Pause obligatoire post-trade perdant",    Icon: Lock },
  { value: "min_rr",                label: "RR minimum",             hint: "Risk/Reward plancher sur les winners",    Icon: Zap },
  { value: "journaling",            label: "Journal quotidien",      hint: "Journaliser ses trades chaque jour",      Icon: NotebookPen },
];

/* ─────────────── Custom dropdown for rule types ─────────────── */
function RuleTypeDropdown({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const selected = RULE_TYPES.find(r => r.value === value) || RULE_TYPES[0];
  const SelIcon = selected.Icon;

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px",
          background: T.white,
          border: `1px solid ${open ? T.text : T.border}`,
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
          boxShadow: open ? `0 0 0 3px color-mix(in srgb, ${T.text} 8%, transparent)` : "none",
        }}
      >
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: "var(--radius-card)",
          background: T.bg, color: T.text,
          flexShrink: 0,
        }}>
          <SelIcon size={14} strokeWidth={1.75} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>{selected.label}</span>
          <span style={{ fontSize: 11, color: T.textMut, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {selected.hint}
          </span>
        </span>
        <ChevronDown
          size={15}
          strokeWidth={1.75}
          color={T.textMut}
          style={{ transition: "transform 160ms ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", zIndex: 50, top: "calc(100% + 6px)", left: 0, right: 0,
            background: T.white,
            border: `1px solid ${T.border}`,
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elev-overlay)",
            padding: 6,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {RULE_TYPES.map(rt => {
            const Ic = rt.Icon;
            const isSel = rt.value === value;
            return (
              <button
                key={rt.value}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => { onChange(rt.value); setOpen(false); }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = T.bg; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 10px",
                  background: isSel ? T.bg : "transparent",
                  border: "none",
                  borderRadius: "var(--radius-card)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "background-color 100ms ease",
                }}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 26, borderRadius: "var(--radius-card)",
                  background: isSel ? T.text : T.bg,
                  color: isSel ? "#FFF" : T.text,
                  flexShrink: 0,
                }}>
                  <Ic size={13} strokeWidth={1.75} />
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>{rt.label}</span>
                  <span style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>{rt.hint}</span>
                </span>
                {isSel && <CheckCircle2 size={14} strokeWidth={2} color={T.green} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card = (extra = {}) => ({
  background: T.white,
  border: `1px solid ${T.border}`,
  borderRadius: "var(--radius-card)",
  padding: 20,
  ...extra,
});

const sectionHeader = (title, subtitle, right) => (
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

/* ─────────────── KPIs : streak, multiplier, compliance rate, violations ─────────────── */
export function ComplianceKpiRow({ trades = [], flat = false }) {
  const { rules, loaded } = useComplianceRules();
  const journaledDates = useJournaledDates(trades);
  const stats = React.useMemo(() => computeStats(rules, trades, journaledDates), [rules, trades, journaledDates]);
  const today = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  if (!loaded) return null;

  const sessionViolations = stats.violations.filter(v => v.date === today);
  const activeRules = rules.filter(r => isRuleLive(r)).length;
  const totalRules = rules.length;
  const isClean = sessionViolations.length === 0;

  return <KpiRow stats={stats} sessionViolations={sessionViolations} activeRules={activeRules} totalRules={totalRules} isClean={isClean} flat={flat} />;
}

function KpiRow({ stats, sessionViolations, activeRules, totalRules, isClean, flat = false }) {
  const multiplierTxt = !isFinite(stats.multiplier)
    ? "∞"
    : stats.multiplier === 1
      ? `${stats.streak}j`
      : `${stats.multiplier.toFixed(2)}×`;
  const multiplierSub = stats.compliantTrades > 0
    ? `streak ${stats.streak}j · ${(stats.compliantWinRate * 100).toFixed(0)}% vs ${(stats.violatingWinRate * 100).toFixed(0)}%`
    : `streak ${stats.streak}j`;

  // KPI volontairement sobres : valeurs en couleur de texte neutre, le seul
  // signal coloré est une petite pastille de statut (vert/rouge).
  const cells = [
    {
      label: "Statut session",
      title: isClean ? "Clean" : `${sessionViolations.length} violation${sessionViolations.length > 1 ? "s" : ""}`,
      dot: isClean ? T.green : T.red,
      sub: isClean ? "aucune violation aujourd'hui" : "aujourd'hui",
    },
    {
      label: "Règles actives",
      title: totalRules > 0 ? `${activeRules}/${totalRules}` : "—",
      sub: totalRules > 0 ? "règles live" : "aucune règle définie",
    },
    {
      label: "Streak",
      title: multiplierTxt,
      sub: multiplierSub,
    },
  ];

  const grid = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
      {cells.map((c, i) => (
        <div key={i} style={{
          padding: "16px 20px",
          borderRight: i < cells.length - 1 ? `1px solid ${T.border}` : "none",
          display: "flex", flexDirection: "column", gap: 3, minWidth: 0,
        }}>
          <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500 }}>{c.label}</div>
          <div style={{
            fontSize: 19, fontWeight: 600, color: T.text, letterSpacing: -0.2,
            lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display: "inline-flex", alignItems: "center", gap: 7,
          }}>
            {c.dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />}
            {c.title}
          </div>
          {c.sub && <div style={{ fontSize: 11, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
  if (flat) return grid;
  return (
    <div className="tr4de-kpi-row" style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      {grid}
    </div>
  );
}

/* ─────────────── Recent violations log ─────────────── */
function ViolationsLog({ stats, rules }) {
  const recent = stats.violations.slice(0, 12);
  const ruleById = new Map(rules.map(r => [r.id, r]));
  const [open, setOpen] = React.useState(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("tr4de.violationsLog.open");
    return v === null ? true : v === "1";
  });
  const toggle = () => {
    setOpen(o => {
      const next = !o;
      try { window.localStorage.setItem("tr4de.violationsLog.open", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  const total = stats.violations.length;

  return (
    <div style={card()}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: open ? 14 : 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Violations récentes</div>
          <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>
            {total === 0 ? "Aucune violation détectée." : `${total} au total · les 12 plus récentes`}
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Replier les violations récentes" : "Déplier les violations récentes"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 999,
            border: `1px solid ${T.border}`, background: T.white, color: T.text,
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {open ? "Masquer" : "Afficher"}
          {open ? <ChevronUp size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
        </button>
      </div>

      {!open ? null : recent.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: T.textMut, fontSize: 13 }}>
          <CheckCircle2 size={22} strokeWidth={1.5} style={{ marginBottom: 6, color: T.green }} />
          <div>Aucune violation détectée.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {recent.map((v, i) => {
            const rule = ruleById.get(v.rule_id);
            return (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: 12, alignItems: "center",
                padding: "10px 12px",
                background: T.bg, borderRadius: "var(--radius-card)",
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.red }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {rule ? describeRule(rule) : v.rule_type}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>{v.message}</div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600,
                  padding: "3px 8px", borderRadius: 999,
                  background: T.redBg, color: T.red, border: `1px solid ${T.redBd}`,
                  whiteSpace: "nowrap",
                }}>
                  {v.distance_label}
                </div>
                <div style={{ fontSize: 11, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
                  {v.date}{v.time ? ` · ${v.time}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Insights : top rule, hour cluster, weekday ─────────────── */
export function ComplianceInsights({ trades = [], flat = false }) {
  const { rules, loaded } = useComplianceRules();
  const journaledDates = useJournaledDates(trades);
  const stats = React.useMemo(() => computeStats(rules, trades, journaledDates), [rules, trades, journaledDates]);
  if (!loaded) return null;
  return <Insights stats={stats} rules={rules} flat={flat} />;
}

function Insights({ stats, rules, flat = false }) {
  const Wrapper = flat ? "div" : "div";
  const wrapperStyle = flat ? { padding: 18 } : card();
  const tiles = [];
  if (stats.topRule) {
    const ruleType = RULE_TYPES.find(r => r.value === stats.topRule.rule_type);
    tiles.push({
      icon: ShieldCheck,
      title: "Règle la plus enfreinte",
      value: ruleType ? ruleType.label : stats.topRule.rule_type,
      sub: `${stats.topRule.count} violation${stats.topRule.count > 1 ? "s" : ""}`,
      tone: T.amber,
    });
  }
  if (stats.topHourBin) {
    tiles.push({
      icon: Clock,
      title: "Cluster horaire",
      value: stats.topHourBin.bin,
      sub: `${stats.topHourBin.count} violations dans cette tranche de 30 min`,
      tone: T.red,
    });
  }
  if (stats.topWeekday) {
    tiles.push({
      icon: CalIcon,
      title: "Jour à risque",
      value: stats.topWeekday.weekday,
      sub: `${stats.topWeekday.count} violations sur ce jour`,
      tone: T.blue,
    });
  }
  // Multiplier insight (toujours utile si données suffisantes)
  if (stats.compliantTrades >= 5 && stats.violatingTrades >= 5 && isFinite(stats.multiplier) && stats.multiplier > 1) {
    tiles.push({
      icon: TrendingUp,
      title: "Effet discipline",
      value: `${stats.multiplier.toFixed(1)}× WR`,
      sub: `Tes trades compliants gagnent ${stats.multiplier.toFixed(1)}× plus souvent`,
      tone: T.green,
    });
  }
  if (tiles.length === 0) {
    return (
      <div style={wrapperStyle}>
        {sectionHeader("Insights", "Patterns détectés automatiquement à partir de tes violations")}
        <div style={{ padding: "24px 16px", textAlign: "center", color: T.textMut, fontSize: 13 }}>
          Pas encore assez de données. Définis des règles et tradé un peu pour voir apparaître les patterns ici.
        </div>
      </div>
    );
  }
  return (
    <div style={wrapperStyle}>
      {sectionHeader("Insights", "Patterns détectés automatiquement")}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tiles.map((t, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: 12, alignItems: "center",
            padding: "10px 12px",
            background: T.bg, borderRadius: "var(--radius-card)",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.textMut, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.value}>
                {t.value}
              </div>
              <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>{t.title}</div>
            </div>
            <div style={{
              fontSize: 11, fontWeight: 500,
              color: T.textMut, whiteSpace: "nowrap",
            }}>
              {t.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Rule builder ─────────────── */
function RuleBuilder({ rules, addRule, updateRule, deleteRule }) {
  const [type, setType] = React.useState("position_limit");
  const [params, setParams] = React.useState({});
  const [open, setOpen] = React.useState(false);
  const [editId, setEditId] = React.useState(null);
  const isEditing = editId !== null;

  const reset = () => { setParams({}); setType("position_limit"); setEditId(null); };

  const startEdit = (rule) => {
    const p = { ...(rule.params || {}) };
    if (Array.isArray(p.symbols)) p.symbols = p.symbols.join(", ");
    setEditId(rule.id);
    setType(rule.type);
    setParams(p);
    setOpen(true);
  };

  const submit = () => {
    const cleaned = { ...params };
    if ((type === "instrument_ban" || type === "instrument_only") && typeof cleaned.symbols === "string") {
      cleaned.symbols = cleaned.symbols.split(",").map(s => s.trim()).filter(Boolean);
    }
    ["max", "minutes", "minRR"].forEach(k => {
      if (cleaned[k] != null && cleaned[k] !== "") cleaned[k] = Number(cleaned[k]);
    });
    if (isEditing) {
      updateRule(editId, { type, params: cleaned });
    } else {
      addRule({ type, active: true, params: cleaned });
    }
    reset();
    setOpen(false);
  };

  const renderParamsForm = () => {
    switch (type) {
      case "position_limit":
      case "max_trades_per_day":
        return (
          <input type="number" min={1} placeholder={type === "position_limit" ? "Max contrats" : "Max trades"}
            value={params.max ?? ""} onChange={e => setParams(p => ({ ...p, max: e.target.value }))}
            style={inp()} />
        );
      case "max_daily_loss":
        return (
          <input type="number" min={1} placeholder="Perte max ($)" value={params.max ?? ""}
            onChange={e => setParams(p => ({ ...p, max: e.target.value }))} style={inp()} />
        );
      case "time_window":
        return (
          <div style={{ display: "flex", gap: 8 }}>
            <input type="time" value={params.minTime ?? ""} onChange={e => setParams(p => ({ ...p, minTime: e.target.value }))} style={{ ...inp(), flex: 1 }} />
            <span style={{ color: T.textMut, alignSelf: "center", fontSize: 12 }}>→</span>
            <input type="time" value={params.maxTime ?? ""} onChange={e => setParams(p => ({ ...p, maxTime: e.target.value }))} style={{ ...inp(), flex: 1 }} />
          </div>
        );
      case "instrument_ban":
      case "instrument_only":
        return (
          <input type="text" placeholder="ES, NQ, RTY (séparer par virgules)"
            value={params.symbols ?? ""} onChange={e => setParams(p => ({ ...p, symbols: e.target.value }))}
            style={inp()} />
        );
      case "no_reentry_after_loss":
        return (
          <input type="number" min={1} placeholder="Cooldown (minutes)" value={params.minutes ?? ""}
            onChange={e => setParams(p => ({ ...p, minutes: e.target.value }))} style={inp()} />
        );
      case "min_rr":
        return (
          <input type="number" min={0} step={0.1} placeholder="RR minimum (ex: 1.5)" value={params.minRR ?? ""}
            onChange={e => setParams(p => ({ ...p, minRR: e.target.value }))} style={inp()} />
        );
      case "journaling":
        return (
          <div style={{ fontSize: 12, color: T.textMut, lineHeight: 1.5, padding: "2px 0" }}>
            Aucun paramètre. Chaque jour où tu trades sans journaliser ta session
            (note de journée ou note de trade dans la page Journal) compte comme une violation.
          </div>
        );
      default: return null;
    }
  };

  return (
    <div style={card()}>
      {sectionHeader("Mes règles", `${rules.filter(r => r.active).length} active${rules.filter(r => r.active).length > 1 ? "s" : ""} · règles structurées évaluées automatiquement sur tes trades`,
        <button
          onClick={() => { if (open) { reset(); setOpen(false); } else { setOpen(true); } }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 999,
            border: `1px solid ${T.text}`, background: T.text, color: "#FFF",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
          <Plus size={13} strokeWidth={1.75} />
          {open ? "Annuler" : "Nouvelle règle"}
        </button>
      )}

      {open && (
        <div style={{
          padding: 14, marginBottom: 12,
          background: T.bg, border: `1px dashed ${T.border2}`, borderRadius: 10,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div>
            <label style={lbl()}>Type de règle</label>
            <RuleTypeDropdown value={type} onChange={(v) => { setType(v); setParams({}); }} />
          </div>
          <div>
            <label style={lbl()}>Paramètres</label>
            {renderParamsForm()}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { reset(); setOpen(false); }} style={btnGhost()}>Annuler</button>
            <button onClick={submit} style={btnPrimary()}>
              {isEditing ? "Enregistrer" : "Créer la règle"}
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: T.textMut, fontSize: 13, borderTop: `1px solid ${T.border}`, marginLeft: -18, marginRight: -18 }}>
          Aucune règle pour l'instant. Crée ta première règle structurée pour activer le moteur de compliance.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${T.border}`, marginLeft: -18, marginRight: -18, paddingLeft: 18, paddingRight: 18 }}>
          {rules.map((rule, idx) => {
            const live = isRuleLive(rule);
            const lockMs = new Date(rule.effective_at).getTime() - Date.now();
            const lockHrs = Math.max(0, Math.ceil(lockMs / (60 * 60 * 1000)));
            return (
              <div key={rule.id} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto auto",
                gap: 8, alignItems: "center",
                padding: "12px 4px",
                borderTop: idx === 0 ? "none" : `1px solid ${T.border}`,
                opacity: rule.active ? 1 : 0.55,
              }}>
                <ShieldCheck size={14} strokeWidth={1.75} color={live ? T.green : T.textMut} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{describeRule(rule)}</div>
                  <div style={{ fontSize: 11, color: T.textMut, marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
                    {live ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.green }}>
                        <CheckCircle2 size={11} strokeWidth={2} /> active
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.amber }}>
                        <Lock size={11} strokeWidth={2} /> verrou {lockHrs}h
                      </span>
                    )}
                    <span style={{ color: T.textMut }}>· créée {new Date(rule.created_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                </div>
                <button
                  onClick={() => updateRule(rule.id, { active: !rule.active })}
                  style={{ ...btnGhost(), padding: "5px 10px", fontSize: 11 }}>
                  {rule.active ? "Désactiver" : "Réactiver"}
                </button>
                <button
                  onClick={() => startEdit(rule)}
                  aria-label="Modifier la règle"
                  title="Modifier"
                  style={{ ...btnGhost(), padding: 6 }}>
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => deleteRule(rule.id)}
                  aria-label="Supprimer la règle"
                  title="Supprimer"
                  style={{ ...btnGhost(), padding: 6, color: T.red }}>
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Styles partagés ─────────────── */
const inp = () => ({
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: T.text,
  background: T.white,
  border: `1px solid ${T.border}`,
  borderRadius: "var(--radius-card)",
  outline: "none",
});
const lbl = () => ({
  display: "block",
  fontSize: 11, fontWeight: 600, color: T.textMut,
  textTransform: "uppercase", letterSpacing: 0.4,
  marginBottom: 6,
});
const btnPrimary = () => ({
  padding: "7px 14px", borderRadius: 999,
  border: `1px solid ${T.text}`, background: T.text, color: "#FFF",
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
});
const btnGhost = () => ({
  padding: "7px 14px", borderRadius: 999,
  border: `1px solid ${T.border}`, background: T.white, color: T.text,
  fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
});

/* ─────────────── Module principal ─────────────── */
export default function ComplianceModule({ trades = [] }) {
  const { rules, loaded, addRule, updateRule, deleteRule } = useComplianceRules();
  const journaledDates = useJournaledDates(trades);
  const stats = React.useMemo(() => computeStats(rules, trades, journaledDates), [rules, trades, journaledDates]);

  if (!loaded) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="anim-stagger">
      <RuleBuilder rules={rules} addRule={addRule} updateRule={updateRule} deleteRule={deleteRule} />
      <ViolationsLog stats={stats} rules={rules} />
    </div>
  );
}
