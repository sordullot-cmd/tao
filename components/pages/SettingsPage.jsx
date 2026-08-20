"use client";

import React, { useEffect, useState } from "react";
import {
  User as IconUser,
  Shield as IconShield,
  CreditCard as IconCard,
  Settings as IconSettings,
  Briefcase as IconBriefcase,
  Target as IconTarget,
  DollarSign as IconDollar,
  GitBranch as IconBranch,
  Globe as IconGlobe,
  Tag as IconTag,
  FileText as IconFile,
  Bell as IconBell,
  ExternalLink,
  Sparkles,
  Trash2,
  Download,
  Upload,
  Database,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { refreshTradesCache } from "@/lib/tradesCache";
import { deleteTradingAccount, notifyAccountsChanged } from "@/lib/propFirms";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { getLang, setLang as setLangPref, t, useLang } from "@/lib/i18n";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { DEFAULT_ALERT_SETTINGS } from "@/lib/hooks/useTradeAlerts";
import { notify, ensureNotifyPermission, isNotifyGranted, isTauri } from "@/lib/notify";
import { T as BaseT } from "@/lib/ui/tokens";
import { ACCENT_PRESETS, applyAccent, isHexColor, readAccent } from "@/lib/ui/accent";
import { Field as DAField, FIELD as DA_FIELD } from "@/components/ui/form";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";

// Clés locales absentes de BaseT mappées sur des tokens dark-aware.
const T = { ...BaseT, panel: BaseT.accentBg, borderHover: BaseT.border2 };

const buildSections = () => [
  {
    label: t("settings.section.user"),
    items: [
      { id: "profile",      label: t("settings.nav.profile"),      Icon: IconUser },
      { id: "security",     label: t("settings.nav.security"),     Icon: IconShield },
      { id: "subscription", label: t("settings.nav.subscription"), Icon: IconCard },
    ],
  },
  {
    label: t("settings.section.general"),
    items: [
      { id: "accounts",     label: t("settings.nav.accounts"), Icon: IconBriefcase },
      { id: "globals",      label: t("settings.nav.globals"),  Icon: IconGlobe },
      { id: "alerts",       label: t("settings.nav.alerts"),   Icon: IconBell },
      { id: "import",       label: t("settings.nav.import"),   Icon: IconFile },
      { id: "data",         label: t("settings.nav.data"),     Icon: Database },
    ],
  },
];

export default function SettingsPage({ user, onBack, setPage }) {
  useLang();
  const [active, setActive] = useState("profile");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: T.textSub, margin: "4px 0 0" }}>{t("settings.subtitle")}</p>
      </div>

      <div className="tr4de-settings-grid" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 32, alignItems: "start" }}>
        {/* Left nav */}
        <SettingsNav active={active} setActive={setActive} />

        {/* Right content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {active === "profile"      && <ProfileSection user={user} />}
          {active === "security"     && <SecuritySection />}
          {active === "subscription" && <SubscriptionSection user={user} />}
          {active === "accounts"     && <AccountsSection setPage={setPage} />}
          {active === "globals"      && <GlobalsSection />}
          {active === "alerts"       && <AlertsSection />}
          {active === "import"       && <ImportHistorySection />}
          {active === "data"         && <DataExportSection />}

          <FooterHelp />
        </div>
      </div>
    </div>
  );
}

function SettingsNav({ active, setActive }) {
  useLang();
  const SECTIONS = buildSections();
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 16 }}>
      {SECTIONS.map((sec, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{
            padding: "8px 10px 4px", fontSize: 10, fontWeight: 600,
            color: T.textMut, letterSpacing: 0.5, textTransform: "uppercase",
          }}>
            {sec.label}
          </div>
          {sec.items.map(item => {
            const Icon = item.Icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                style={{
                  width: "100%", display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: "var(--radius-card)", border: "none",
                  background: isActive ? T.text : "transparent",
                  color: isActive ? T.white : T.text,
                  fontSize:13, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.panel; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon size={14} strokeWidth={1.75} />
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Card({ children, padded = true }) {
  return (
    <div style={{
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: "var(--radius-card)",
      padding: padded ? 20 : 0,
      boxShadow: "var(--elev-rest)",
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12, color: T.textMut, margin: "2px 0 0" }}>{subtitle}</p>}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 34, padding: "8px 16px",
        borderRadius: 999,
        border: `1px solid ${T.text}`,
        background: T.text,
        color: T.white,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "background 120ms ease",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = T.textSub; }}
      onMouseLeave={e => { e.currentTarget.style.background = T.text; }}
    >
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: "var(--radius-card)",
        border: `1px solid ${T.border}`,
        background: T.white,
        color: T.text,
        fontSize:13,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "background 120ms ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.panel; }}
      onMouseLeave={e => { e.currentTarget.style.background = T.white; }}
    >
      {Icon && <Icon size={14} strokeWidth={1.75} />}
      {children}
    </button>
  );
}

/** Bouton poubelle des listes de réglages (comptes, imports). */
function DeleteIconButton({ ariaLabel, onClick, busy }) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={busy}
      style={{
        background: "transparent", border: "none",
        cursor: busy ? "wait" : "pointer",
        padding: 6, color: T.red, display: "inline-flex", alignItems: "center",
        borderRadius: 6, transition: "background 120ms ease",
        opacity: busy ? 0.5 : 1, flexShrink: 0,
      }}
      onMouseEnter={e => { if (!busy) e.currentTarget.style.background = T.redBg; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <Trash2 size={14} strokeWidth={1.75} />
    </button>
  );
}

function ComingSoonBadge() {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, background: T.panel,
      color: T.textSub, fontSize: 10, fontWeight: 500, marginLeft: 8,
    }}>
      {t("settings.comingSoon")}
    </span>
  );
}

/* =================== PROFILE =================== */
function ProfileSection({ user }) {
  useLang();
  const supabase = createClient();
  const meta = user?.user_metadata || {};
  const fullNameSrc = meta.full_name || meta.name || "";
  const initialFirst = meta.first_name || meta.given_name || (fullNameSrc?.split(" ")[0]) || "";
  const initialLast = meta.last_name || meta.family_name || (fullNameSrc?.split(" ").slice(1).join(" ")) || "";

  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);

  // Auto-save Google-provided names into first_name/last_name on first load
  // so they persist for future sessions and sync to other metadata consumers.
  useEffect(() => {
    if (!user) return;
    const needsBackfill =
      (!meta.first_name && (meta.given_name || fullNameSrc)) ||
      (!meta.last_name && (meta.family_name || fullNameSrc));
    if (!needsBackfill) return;
    const full = [initialFirst, initialLast].filter(Boolean).join(" ") || fullNameSrc;
    supabase.auth.updateUser({
      data: { first_name: initialFirst, last_name: initialLast, full_name: full },
    }).catch((e) => console.error("backfill names failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const [timezone, setTimezone] = useState(() => {
    if (typeof window !== "undefined") {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Paris"; }
    }
    return "Europe/Paris";
  });
  const [now, setNow] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const initials = (firstName?.[0] || user?.email?.[0] || "U").toUpperCase() + (lastName?.[0] || "").toUpperCase();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || (user?.email?.split("@")[0] || t("settings.userFallback"));
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const tzAbbr = (() => {
    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZone: timezone, timeZoneName: "short" }).formatToParts(now);
      return parts.find(p => p.type === "timeZoneName")?.value || timezone;
    } catch { return timezone; }
  })();

  const onSave = async () => {
    setSaving(true);
    setSavedMsg("");
    try {
      await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName, full_name: fullName } });
      setSavedMsg(t("settings.saved"));
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Bloc 1 : identite */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", background: T.panel,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 600, color: T.text, flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{fullName}</div>
            <div style={{ fontSize: 13, color: T.textMut, marginTop: 2 }}>{user?.email}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: T.textSub }}>
              <IconGlobe size={13} strokeWidth={1.75} />
              <span>{tzAbbr}</span>
              <span style={{ color: T.textMut, marginLeft: 6 }}>{timeStr}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Bloc 2 : informations personnelles */}
      <Card>
        <CardHeader title={t("settings.profile.cardTitle")} subtitle={t("settings.profile.cardSub")} />
        <div style={{ height: 1, background: T.border, margin: "0 -20px 16px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("settings.profile.firstName")}>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle()} />
          </Field>
          <Field label={t("settings.profile.lastName")}>
            <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle()} />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label={t("settings.profile.email")}>
              <input value={user?.email || ""} disabled placeholder="email@exemple.com" style={{ ...inputStyle(), background: T.panel, color: T.textSub, cursor: "not-allowed" }} />
              <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>{t("settings.profile.emailLocked")}</div>
            </Field>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18, alignItems: "center", gap: 12 }}>
          {savedMsg && <span style={{ fontSize: 12, color: T.green }}>{savedMsg}</span>}
          <PrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t("settings.saving") : t("settings.saveChanges")}
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}

/* =================== SECURITY =================== */
function SecuritySection() {
  useLang();
  return (
    <Card>
      <CardHeader title={t("settings.security.cardTitle")} subtitle={t("settings.security.cardSub")} />
      <div style={{ height: 1, background: T.border, margin: "0 -20px 0" }} />

      <SecurityRow
        Icon={IconShield}
        title={t("settings.security.password")}
        description={t("settings.security.passwordDesc")}
        action={<SecondaryButton icon={ExternalLink}>{t("settings.security.manage")}</SecondaryButton>}
      />
      <SecurityRow
        Icon={Sparkles}
        title={t("settings.security.twoFA")}
        badge={<ComingSoonBadge />}
        description={t("settings.security.twoFADesc")}
        action={<SecondaryButton>{t("settings.security.activate")}</SecondaryButton>}
      />
      <SecurityRow
        Icon={IconGlobe}
        title={t("settings.security.sessions")}
        badge={<ComingSoonBadge />}
        description={t("settings.security.sessionsDesc")}
        action={<SecondaryButton>{t("settings.security.viewAll")}</SecondaryButton>}
        last
      />
    </Card>
  );
}

function SecurityRow({ Icon, title, description, badge, action, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "16px 0",
      borderBottom: last ? "none" : `1px solid ${T.border}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: T.panel,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={16} strokeWidth={1.75} color={T.text} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 600, color: T.text }}>
          {title}{badge}
        </div>
        <div style={{ fontSize: 12, color: T.textMut, marginTop: 2 }}>{description}</div>
      </div>
      {action}
    </div>
  );
}

/* =================== SUBSCRIPTION =================== */
function SubscriptionSection({ user }) {
  useLang();
  const memberSince = (() => {
    if (!user?.created_at) return "—";
    return new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  })();
  const accountId = user?.id ? `${user.id.slice(0, 8)}...` : "—";

  return (
    <>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>{t("settings.sub.currentPlan")}</h2>
          <PrimaryButton icon={Sparkles}>{t("settings.sub.goPro")}</PrimaryButton>
        </div>
        <div style={{
          padding: 16, borderRadius: 10, background: T.panel,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "var(--radius-card)", background: T.bg,
            border: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <IconCard size={16} strokeWidth={1.75} color={T.text} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{t("settings.sub.freePlan")}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: T.redBg, border: `1px solid ${T.redBd}`, color: T.red, fontSize: 10, fontWeight: 500 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.red }} />
                {t("settings.sub.inactive")}
              </span>
            </div>
            <div style={{ fontSize: 12, color: T.textMut, marginTop: 2 }}>{t("settings.sub.upgradeMsg")}</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("settings.sub.accountInfo")} />
        <div style={{ height: 1, background: T.border, margin: "0 -20px 4px" }} />
        <Row label={t("settings.sub.memberSince")} value={memberSince} />
        <Row label={t("settings.sub.accountId")} value={
          <span style={{ padding: "3px 8px", borderRadius: 6, background: T.panel, border: `1px solid ${T.border}`, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{accountId}</span>
        } last />
      </Card>
    </>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 0", borderBottom: last ? "none" : `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: 13, color: T.textSub }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{value}</span>
    </div>
  );
}

/* =================== ACCOUNTS =================== */
function AccountsSection({ setPage }) {
  useLang();
  const [accounts, setAccounts] = useState([]);
  const [firms, setFirms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data } = await supabase.from("trading_accounts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        setAccounts(data || []);
        // Firmes parentes — affichées à côté du compte. Absentes si la
        // migration 031 n'est pas encore appliquée : on dégrade sans casser.
        const { data: firmRows } = await supabase.from("prop_firms").select("id, name").eq("user_id", user.id);
        setFirms(firmRows || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // count trades per account
  const [tradeCounts, setTradeCounts] = useState({});
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("apex_trades").select("account_id").eq("user_id", user.id);
        const counts = {};
        (data || []).forEach(r => { if (r.account_id) counts[r.account_id] = (counts[r.account_id] || 0) + 1; });
        setTradeCounts(counts);
      } catch (e) { console.error(e); }
    })();
  }, []);

  const brokerLogo = (broker) => {
    if (!broker) return null;
    const k = String(broker).toLowerCase();
    if (k.includes("trado")) return "/trado.png";
    if (k.includes("mt5") || k.includes("meta")) return "/MetaTrader_5.png";
    if (k.includes("wealth")) return "/weal.webp";
    return null;
  };

  // Suppression définitive : le compte ET ses trades. Pour ne retirer que les
  // trades en gardant le compte, voir la section « Historique d'import ».
  const handleDelete = async (acc) => {
    if (!acc?.id) return;
    const count = tradeCounts[acc.id] || 0;
    const ok = window.confirm(
      t("settings.accounts.confirmDelete").replace("{acc}", acc.name || "").replace("{n}", String(count))
    );
    if (!ok) return;
    setDeletingId(acc.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("settings.import.notAuth"));

      await deleteTradingAccount(acc.id, user.id);

      setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
      setTradeCounts((prev) => { const next = { ...prev }; delete next[acc.id]; return next; });

      // Sans ça useTrades() rechargerait les trades supprimés depuis le cache.
      await refreshTradesCache(user.id);
    } catch (e) {
      console.error("[SettingsAccounts] delete failed", e);
      alert(t("settings.accounts.deleteFailed") + (e?.message || t("settings.import.errUnknown")));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0 }}>{t("settings.accounts.cardTitle")}</h2>
          <p style={{ fontSize: 12, color: T.textMut, margin: "2px 0 0" }}>{t("settings.accounts.cardSub")}</p>
        </div>
        <PrimaryButton onClick={() => setPage?.("accounts")}>{t("settings.accounts.manage")}</PrimaryButton>
      </div>
      <div style={{ height: 1, background: T.border, margin: "0 -20px 0" }} />

      {loading ? (
        <div style={{ padding: 16, color: T.textMut, fontSize: 12 }}>{t("settings.loading")}</div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: T.textMut, fontSize: 13 }}>{t("settings.accounts.empty")}</div>
      ) : (
        accounts.map((acc, i) => {
          const logo = brokerLogo(acc.broker);
          const count = tradeCounts[acc.id] || 0;
          const firmName = acc.firm_id ? firms.find(f => f.id === acc.firm_id)?.name : null;
          return (
            <div key={acc.id} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 0",
              borderBottom: i < accounts.length - 1 ? `1px solid ${T.border}` : "none",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "var(--radius-card)", background: T.panel,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                overflow: "hidden",
              }}>
                {logo ? <img src={logo} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} /> : <IconBriefcase size={16} strokeWidth={1.75} color={T.text} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</span>
                  {firmName && (
                    <span style={{
                      padding: "1px 7px", borderRadius: 999, border: `1px solid ${T.border}`,
                      fontSize: 11, color: T.textMut, whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {firmName}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.textMut, marginTop: 2 }}>
                  {acc.broker ? acc.broker.charAt(0).toUpperCase() + acc.broker.slice(1) : "—"} · {count} trade{count !== 1 ? "s" : ""}
                </div>
              </div>
              <DeleteIconButton
                ariaLabel={t("settings.accounts.deleteAria")}
                onClick={() => handleDelete(acc)}
                busy={deletingId === acc.id}
              />
            </div>
          );
        })
      )}
    </Card>
  );
}

/* =================== GLOBAL SETTINGS =================== */
function GlobalsSection() {
  useLang();
  const { user } = useAuth();
  const supabase = createClient();
  const [timezone, setTimezone] = useState(() => {
    if (typeof window === "undefined") return "America/New_York";
    try {
      return localStorage.getItem("tr4de_timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch { return "America/New_York"; }
  });
  const [currency, setCurrency] = useState(() => {
    if (typeof window === "undefined") return "USD";
    return localStorage.getItem("tr4de_base_currency") || "USD";
  });
  const [lang, setLangState] = useState(() => (typeof window === "undefined" ? "en" : getLang()));
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return "system";
    try { return localStorage.getItem("tr4de_theme") || "system"; } catch { return "system"; }
  });
  const [risk, setRisk] = useState(() => {
    if (typeof window === "undefined") return 100;
    try { return parseFloat(localStorage.getItem("tr4de_risk_per_trade") || "100") || 100; } catch { return 100; }
  });
  const [savedMsg, setSavedMsg] = useState("");
  const [loadedFromCloud, setLoadedFromCloud] = useState(false);
  // Accent de marque : principale (--accent) et secondaire (--accent-2).
  const [accent, setAccent] = useState(() => readAccent());

  // Applique le thème choisi : "system" retire l'attribut (fallback CSS
  // prefers-color-scheme), sinon force data-theme="light|dark".
  const applyTheme = (v) => {
    try {
      if (v === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = v;
      localStorage.setItem("tr4de_theme", v);
    } catch {}
  };

  // L'état initial est calculé côté serveur (valeurs par défaut) : on relit une
  // fois monté pour refléter ce qui est réellement enregistré.
  useEffect(() => { setAccent(readAccent()); }, []);

  const setAccentColors = (primary, secondary) => {
    setAccent({ primary, secondary });
    applyAccent(primary, secondary);
  };

  // Charger depuis Supabase au montage (et sur focus)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("timezone, base_currency")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) {
          // Table ou colonnes manquantes → on log et on autorise quand même la sauvegarde
          // (l'upsert ultérieur aura aussi son propre log d'erreur si rien n'existe).
          console.warn("load preferences error:", error.code, error.message);
        } else if (!cancelled) {
          if (data?.timezone) {
            setTimezone(data.timezone);
            try { localStorage.setItem("tr4de_timezone", data.timezone); } catch {}
          }
          if (data?.base_currency) {
            setCurrency(data.base_currency);
            try { localStorage.setItem("tr4de_base_currency", data.base_currency); } catch {}
          }
        }
      } catch (e) {
        console.error("load preferences failed:", e?.message || e);
      } finally {
        if (!cancelled) setLoadedFromCloud(true);
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [user?.id]);

  // Auto-save dans Supabase + localStorage à chaque changement (debounced 400ms).
  useEffect(() => {
    if (!user?.id) return;
    if (!loadedFromCloud) return;
    try {
      localStorage.setItem("tr4de_timezone", timezone);
      localStorage.setItem("tr4de_base_currency", currency);
      window.dispatchEvent(new Event("tr4de:prefs-changed"));
    } catch {}
    const handle = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("user_preferences")
          .upsert([{
            user_id: user.id,
            timezone,
            base_currency: currency,
            updated_at: new Date().toISOString(),
          }], { onConflict: "user_id" })
          .select();
        if (error) {
          console.error("save preferences failed:", error.message, error.code, error.details);
          return;
        }
        setSavedMsg(t("settings.savedShort"));
        setTimeout(() => setSavedMsg(""), 1500);
      } catch (e) { console.error("save preferences error:", e); }
    }, 400);
    return () => clearTimeout(handle);
  }, [timezone, currency, user?.id, loadedFromCloud]);

  const onSave = () => {
    try {
      localStorage.setItem("tr4de_timezone", timezone);
      localStorage.setItem("tr4de_base_currency", currency);
      setSavedMsg(t("settings.prefsSaved"));
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (e) { console.error(e); }
  };

  const TIMEZONE_OPTIONS = [
    { id: "America/New_York",    label: "Eastern Time (ET) — New York" },
    { id: "America/Chicago",     label: "Central Time (CT) — Chicago" },
    { id: "America/Denver",      label: "Mountain Time (MT) — Denver" },
    { id: "America/Los_Angeles", label: "Pacific Time (PT) — Los Angeles" },
    { id: "Europe/Paris",        label: "Europe / Paris (CET/CEST)" },
    { id: "Europe/London",       label: "Europe / London (GMT/BST)" },
    { id: "Asia/Tokyo",          label: "Asia / Tokyo (JST)" },
  ];

  const CURRENCY_OPTIONS = [
    { id: "USD", label: t("settings.currency.usd") },
    { id: "EUR", label: t("settings.currency.eur") },
    { id: "GBP", label: t("settings.currency.gbp") },
    { id: "JPY", label: t("settings.currency.jpy") },
    { id: "CAD", label: t("settings.currency.cad") },
    { id: "CHF", label: t("settings.currency.chf") },
  ];

  return (
    <Card>
      <CardHeader title={t("settings.globals.cardTitle")} subtitle={t("settings.globals.cardSub")} />
      <div style={{ height: 1, background: T.border, margin: "0 -20px 16px" }} />

      <SectionLabel>{t("settings.globals.timezone")}</SectionLabel>
      <SearchableSelect
        value={timezone}
        onChange={setTimezone}
        options={TIMEZONE_OPTIONS}
        searchPlaceholder={t("settings.globals.timezoneSearch")}
      />
      <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>{t("settings.globals.timezoneHint")}</div>

      <SectionLabel mt={20}>{t("settings.globals.currency")}</SectionLabel>
      <SearchableSelect
        value={currency}
        onChange={setCurrency}
        options={CURRENCY_OPTIONS}
        searchable={false}
      />
      <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>{t("settings.globals.currencyHint")}</div>

      <SectionLabel mt={20}><label htmlFor="tr4de-risk">{t("settings.globals.risk")}</label></SectionLabel>
      <input
        id="tr4de-risk"
        type="number"
        min={1}
        step={10}
        value={risk}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") { setRisk(""); return; }
          const n = Math.max(1, parseFloat(raw) || 0);
          setRisk(n);
          try { localStorage.setItem("tr4de_risk_per_trade", String(n)); } catch {}
        }}
        style={{ width: "100%", padding: "8px 10px", border: "none", borderRadius: "var(--radius-field)", fontSize: 13, fontFamily: "inherit", color: T.text, outline: "none", background: DA_FIELD_BG }}
      />
      <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>{t("settings.globals.riskHint")}</div>

      <SectionLabel mt={20}>{t("settings.globals.language")}</SectionLabel>
      <SearchableSelect
        value={lang}
        onChange={(v) => { setLangState(v); setLangPref(v); }}
        options={[
          { id: "fr", label: "Français" },
          { id: "en", label: "English" },
        ]}
        searchable={false}
      />
      <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>{t("settings.globals.languageHint")}</div>

      <SectionLabel mt={20}>Thème</SectionLabel>
      <SearchableSelect
        value={theme}
        onChange={(v) => { setThemeState(v); applyTheme(v); }}
        options={[
          { id: "system", label: "Système" },
          { id: "light", label: "Clair" },
          { id: "dark", label: "Sombre" },
        ]}
        searchable={false}
      />
      <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>Choisis l'apparence de l'interface (Système suit ton OS).</div>

      <SectionLabel mt={20}>Couleurs d'accent</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {ACCENT_PRESETS.map((p) => {
          const active = p.primary.toLowerCase() === accent.primary.toLowerCase()
            && p.secondary.toLowerCase() === accent.secondary.toLowerCase();
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setAccentColors(p.primary, p.secondary)}
              aria-pressed={active}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: "var(--radius-pill)",
                border: `1px solid ${active ? T.text : T.border}`,
                background: active ? T.accentBg : T.white,
                color: T.text, fontSize:12, fontFamily: "inherit",
                cursor: "pointer", transition: "border-color 150ms, background 150ms",
              }}
            >
              <span style={{ display: "inline-flex" }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.primary }} />
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.secondary, marginLeft: -4 }} />
              </span>
              {p.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <AccentField
          label="Principale"
          hint="Nav active, pastilles, éléments actifs"
          value={accent.primary}
          onChange={(v) => setAccentColors(v, accent.secondary)}
        />
        <AccentField
          label="Secondaire"
          hint="Courbe de portefeuille, graphiques"
          value={accent.secondary}
          onChange={(v) => setAccentColors(accent.primary, v)}
        />
      </div>
      <div style={{ fontSize: 11, color: T.textMut, marginTop: 6 }}>
        Appliqué immédiatement et conservé sur cet appareil.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        {savedMsg && <span style={{ fontSize: 12, color: T.green }}>{savedMsg}</span>}
        <PrimaryButton onClick={onSave}>{t("settings.saveChanges")}</PrimaryButton>
      </div>
    </Card>
  );
}

/* Sélecteur d'une teinte d'accent : pastille native + saisie hex.
   Le champ texte garde son propre tampon pour laisser taper « #6 », « #64… »
   sans repeindre l'app à chaque frappe : on ne remonte qu'une valeur valide. */
function AccentField({ label, hint, value, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = (raw) => {
    const next = raw.trim();
    if (isHexColor(next)) onChange(next.toUpperCase());
    else setDraft(value);
  };

  return (
    <label style={{ flex: "1 1 180px", minWidth: 160 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: T.text, marginBottom: 6 }}>{label}</div>
      {/* Le champ est un aplat, pas un cadre : la pastille de couleur et le code
          hexadecimal vivent dans la meme pilule. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "5px 8px 5px 6px",
        border: "none", borderRadius: 999, background: DA_FIELD_BG,
      }}>
        <input
          type="color"
          value={isHexColor(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${label} — sélecteur de couleur`}
          style={{
            width: 28, height: 28, padding: 0, border: "none", borderRadius: "50%",
            background: "none", cursor: "pointer", flexShrink: 0,
          }}
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); }}
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", background: "none",
            fontSize: 13, fontFamily: "var(--font-mono)", color: T.text, textTransform: "uppercase",
          }}
        />
      </div>
      {hint && <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

function SectionLabel({ children, mt }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: T.textMut, letterSpacing: 0.5,
      textTransform: "uppercase", marginBottom: 8, marginTop: mt || 0,
    }}>
      {children}
    </div>
  );
}

/* =================== IMPORT HISTORY =================== */

function ImportHistorySection() {
  useLang();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const supabase = createClient();

  const handleDelete = async (item) => {
    if (!item?.id) return;
    const tradeCount = item.count || 0;
    const ok = window.confirm(
      t("settings.import.confirmDeleteTrades").replace("{n}", String(tradeCount)).replace("{acc}", item.account || "")
    );
    if (!ok) return;
    setDeletingId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("settings.import.notAuth"));

      // Supprimer uniquement les trades rattachés à ce compte (= cet import).
      // Le compte est conservé : il reste utilisable pour un nouvel import.
      // Pour supprimer le compte lui-même → Paramètres › Comptes de trading.
      const { error: tradesError } = await supabase
        .from("apex_trades")
        .delete()
        .eq("user_id", user.id)
        .eq("account_id", item.id);
      if (tradesError) throw tradesError;

      // L'entrée disparaît de l'historique car un compte sans trade n'a plus
      // d'import à montrer (voir le filtre au chargement).
      setHistory((prev) => prev.filter((h) => h.id !== item.id));

      // Re-synchroniser le cache localStorage + notifier toute l'app.
      // SANS ça, useTrades() recharge les trades supprimés depuis le cache.
      await refreshTradesCache(user.id);
      notifyAccountsChanged();
    } catch (e) {
      console.error("[ImportHistory] delete failed", e);
      alert(t("settings.import.deleteFailed") + (e?.message || t("settings.import.errUnknown")));
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        // Recuperer un resume des trades par account_id (proxy d'imports)
        const { data: accounts } = await supabase.from("trading_accounts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        const items = [];
        for (const acc of accounts || []) {
          const { count } = await supabase.from("apex_trades").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("account_id", acc.id);
          // Un compte sans trade n'a rien à montrer ici : c'est un compte, pas
          // un import. Il reste visible/supprimable dans la section Comptes.
          if (!count) continue;
          items.push({
            id: acc.id, name: "Orders.csv", account: acc.name, broker: acc.broker,
            count, date: acc.created_at,
          });
        }
        setHistory(items);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <Card>
      <CardHeader title={t("settings.import.cardTitle")} subtitle={t("settings.import.cardSub")} />
      <div style={{ height: 1, background: T.border, margin: "0 -20px 0" }} />

      {loading ? (
        <div style={{ padding: 16, color: T.textMut, fontSize: 12 }}>{t("settings.loading")}</div>
      ) : history.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: T.textMut, fontSize: 13 }}>{t("settings.import.empty")}</div>
      ) : (
        history.map((h, i) => (
          <div key={h.id} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 0",
            borderBottom: i < history.length - 1 ? `1px solid ${T.border}` : "none",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{h.name}</span>
                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, background: T.greenBg, border: `1px solid ${T.greenBd}`, color: T.green, fontSize: 10, fontWeight: 500 }}>
                  {t("settings.import.success")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: T.textMut, marginTop: 4 }}>
                <span>{h.account}</span>
                <span>·</span>
                <span>{h.broker || "—"}</span>
                <span>·</span>
                <span>{h.count} trade{h.count !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{new Date(h.date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            </div>
            <DeleteIconButton
              ariaLabel={t("settings.import.deleteAria")}
              onClick={() => handleDelete(h)}
              busy={deletingId === h.id}
            />
          </div>
        ))
      )}
    </Card>
  );
}

/* =================== DATA EXPORT / IMPORT =================== */
function DataExportSection() {
  useLang();
  const supabase = createClient();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState({ kind: "idle", text: "" });
  const fileInputRef = React.useRef(null);

  const TABLES = [
    "trading_accounts",
    "apex_trades",
    "strategies",
    "trade_strategies",
    "trade_details",
    "daily_session_notes",
    "user_preferences",
  ];

  const handleExport = async () => {
    setExporting(true);
    setMsg({ kind: "idle", text: "" });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("settings.import.notAuth"));

      const payload = {
        version: 1,
        exported_at: new Date().toISOString(),
        user_email: user.email || null,
        data: {},
      };

      for (const table of TABLES) {
        try {
          const { data, error } = await supabase.from(table).select("*").eq("user_id", user.id);
          if (error) {
            console.warn(`⚠️ skip ${table}:`, error.message);
            continue;
          }
          payload.data[table] = data || [];
        } catch (e) {
          console.warn(`⚠️ skip ${table}:`, e?.message);
        }
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `tr4de-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMsg({ kind: "success", text: t("settings.data.exportSuccess") });
    } catch (e) {
      console.error(e);
      setMsg({ kind: "error", text: t("settings.import.deleteFailed") + (e?.message || t("settings.import.errUnknown")) });
    } finally {
      setExporting(false);
      setTimeout(() => setMsg({ kind: "idle", text: "" }), 5000);
    }
  };

  const handleImport = async (file) => {
    if (!file) return;
    setImporting(true);
    setMsg({ kind: "idle", text: "" });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("settings.import.notAuth"));

      const text = await file.text();
      let payload;
      try { payload = JSON.parse(text); }
      catch { throw new Error(t("settings.data.importInvalid")); }

      if (!payload || typeof payload !== "object" || !payload.data) {
        throw new Error(t("settings.data.importInvalid"));
      }

      let inserted = 0;
      for (const table of TABLES) {
        const rows = Array.isArray(payload.data[table]) ? payload.data[table] : [];
        if (rows.length === 0) continue;
        // Réécrire user_id pour pointer sur l'utilisateur courant
        const rewritten = rows.map(r => ({ ...r, user_id: user.id }));
        try {
          const { error } = await supabase.from(table).upsert(rewritten, { onConflict: "id", ignoreDuplicates: true });
          if (error) {
            console.warn(`⚠️ import ${table}:`, error.message);
            continue;
          }
          inserted += rewritten.length;
        } catch (e) {
          console.warn(`⚠️ import ${table}:`, e?.message);
        }
      }

      await refreshTradesCache(user.id);
      try { window.dispatchEvent(new CustomEvent("tr4de:accounts-changed")); } catch {}

      setMsg({ kind: "success", text: t("settings.data.importDone").replace("{n}", String(inserted)) });
    } catch (e) {
      console.error(e);
      setMsg({ kind: "error", text: t("settings.data.importErr") + (e?.message || t("settings.import.errUnknown")) });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setMsg({ kind: "idle", text: "" }), 6000);
    }
  };

  return (
    <Card>
      <CardHeader title={t("settings.data.cardTitle")} subtitle={t("settings.data.cardSub")} />
      <div style={{ height: 1, background: T.border, margin: "0 -20px 0" }} />

      {/* Export */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "16px 0",
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: T.panel,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Download size={16} strokeWidth={1.75} color={T.text} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t("settings.data.exportTitle")}</div>
          <div style={{ fontSize: 12, color: T.textMut, marginTop: 2 }}>{t("settings.data.exportDesc")}</div>
        </div>
        <PrimaryButton onClick={handleExport} disabled={exporting} icon={Download}>
          {exporting ? t("settings.data.exporting") : t("settings.data.exportBtn")}
        </PrimaryButton>
      </div>

      {/* Import */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "16px 0",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: T.panel,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Upload size={16} strokeWidth={1.75} color={T.text} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t("settings.data.importTitle")}</div>
          <div style={{ fontSize: 12, color: T.textMut, marginTop: 2 }}>{t("settings.data.importDesc")}</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
          }}
        />
        <SecondaryButton icon={Upload} onClick={() => fileInputRef.current?.click()}>
          {importing ? t("settings.data.importing") : t("settings.data.importBtn")}
        </SecondaryButton>
      </div>

      {msg.text && (
        <div style={{
          marginTop: 4, padding: "10px 12px", borderRadius: "var(--radius-card)", fontSize: 12, fontWeight: 500,
          background: msg.kind === "error" ? T.redBg : T.greenBg,
          color: msg.kind === "error" ? T.red : T.green,
          border: `1px solid ${msg.kind === "error" ? T.redBd : T.greenBd}`,
        }}>
          {msg.text}
        </div>
      )}
    </Card>
  );
}

/* =================== HELPERS =================== */
function FooterHelp() {
  useLang();
  return (
    <div style={{ paddingTop: 8, paddingBottom: 16, fontSize: 12, color: T.textMut }}>
      {t("settings.helpFull")} <a href="mailto:support@taotrade.com" style={{ color: T.text, fontWeight: 500, textDecoration: "underline" }}>{t("settings.helpContact")}</a>
    </div>
  );
}

function Field({ label, hint, children }) {
  /* Delegue a la brique commune (components/ui/form.jsx) : le site comptait
     quatorze definitions locales de champ, chacune avec sa taille de libelle,
     sa hauteur et son rayon. Le style vit la-bas, une seule fois. */
  return <DAField label={label} hint={hint}>{children}</DAField>;
}

/* Delegue a la brique commune (components/ui/form.jsx) : un champ est un aplat
   en pilule, pas un rectangle cerne. Le `selectStyle` qui en derivait est parti
   avec : plus aucun appel depuis que les menus deroulants sont des popovers. */
function inputStyle() {
  return { ...DA_FIELD };
}

/* ── Alerts section ────────────────────────────────────────────────── */
function AlertsSection() {
  useLang();
  const [settings, setSettings] = useCloudState(
    "tr4de_alert_settings",
    "alert_settings",
    DEFAULT_ALERT_SETTINGS
  );
  // "granted" | "denied" | "default". Sur desktop (Tauri) l'API Web Notification
  // n'est pas fiable : on interroge le plugin natif via isNotifyGranted().
  const [permission, setPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    isNotifyGranted().then((ok) => { if (ok) setPermission("granted"); });
  }, []);

  const requestPermission = async () => {
    const ok = await ensureNotifyPermission();
    setPermission(ok ? "granted" : isTauri() ? "denied" : (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied"));
  };

  const fireTest = () => {
    setTesting(true);
    window.dispatchEvent(new CustomEvent("tr4de:alert", {
      detail: { title: t("settings.alerts.testTitle"), body: t("settings.alerts.testBody"), severity: "info" },
    }));
    void notify("tao trade — Test", { body: t("settings.alerts.testNotifBody") });
    setTimeout(() => setTesting(false), 1200);
  };

  const update = (patch) => setSettings(prev => ({ ...prev, ...patch }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <CardHeader title={t("settings.alerts.cardTitle")} subtitle={t("settings.alerts.cardSub")} />

      {/* Permission */}
      <div style={{
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)",
        padding: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t("settings.alerts.notifTitle")}</div>
          <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>
            {t("settings.alerts.statusLabel")} {permission === "granted" ? t("settings.alerts.statusGranted") : permission === "denied" ? t("settings.alerts.statusDenied") : t("settings.alerts.statusDefault")}
          </div>
        </div>
        {permission !== "granted" && permission !== "denied" && (
          <button onClick={requestPermission} style={primaryBtn()}>{t("settings.alerts.activate")}</button>
        )}
        <button onClick={fireTest} disabled={testing} style={secondaryBtn(testing)}>
          {testing ? t("settings.alerts.tested") : t("settings.alerts.test")}
        </button>
      </div>

      {/* Master switch */}
      <Field label={t("settings.alerts.activeWatch")} hint={t("settings.alerts.activeWatchHint")}>
        <AlertSwitch
          checked={settings.enabled}
          onChange={v => update({ enabled: v })}
          label={settings.enabled ? t("settings.alerts.enabled") : t("settings.alerts.disabled")}
        />
      </Field>

      {/* Thresholds */}
      <Field label={t("settings.alerts.takeProfit")} hint={t("settings.alerts.takeProfitHint")}>
        <NumberInput
          value={settings.dailyTakeProfit}
          onChange={v => update({ dailyTakeProfit: v })}
          suffix="$"
          placeholder="500"
        />
      </Field>

      <Field label={t("settings.alerts.maxLoss")} hint={t("settings.alerts.maxLossHint")}>
        <NumberInput
          value={settings.dailyMaxLoss}
          onChange={v => update({ dailyMaxLoss: v })}
          suffix="$"
          placeholder="300"
        />
      </Field>

      <Field label={t("settings.alerts.losingStreak")} hint={t("settings.alerts.losingStreakHint")}>
        <NumberInput
          value={settings.losingStreak}
          onChange={v => update({ losingStreak: v })}
          suffix={t("settings.alerts.tradesSuffix")}
          placeholder="3"
        />
      </Field>
    </div>
  );
}

function AlertSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        background: "transparent", border: "none", cursor: "pointer",
        padding: 0, fontFamily: "inherit",
      }}
    >
      <span style={{
        width: 36, height: 20, borderRadius: 999,
        background: checked ? T.green : T.border,
        position: "relative", transition: "background 150ms",
        flexShrink: 0,
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: T.white,
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          transition: "left 150ms",
        }} />
      </span>
      <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{label}</span>
    </button>
  );
}

function NumberInput({ value, onChange, suffix, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="number"
        value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        placeholder={placeholder}
        min={0}
        style={{ ...inputStyle(), maxWidth: 160 }}
      />
      {suffix && <span style={{ fontSize: 13, color: T.textMut, fontWeight: 500 }}>{suffix}</span>}
    </div>
  );
}

// Harmonisé avec PrimaryButton : primaire = fond T.text / texte blanc.
function primaryBtn() {
  return {
    minHeight: 34, padding: "8px 16px", borderRadius: 999, border: `1px solid ${T.text}`,
    background: T.text, color: T.white,
    fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
  };
}
// Secondaire = fond T.white, bordure T.border (comme SecondaryButton).
function secondaryBtn(disabled) {
  return {
    minHeight: 34, padding: "8px 16px", borderRadius: 999, border: `1px solid ${T.border}`,
    background: T.white, color: T.text,
    fontSize: 12, fontWeight: 500, cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1, fontFamily: "inherit",
  };
}
