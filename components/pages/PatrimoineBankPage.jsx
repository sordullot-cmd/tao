"use client";

/**
 * Connecter une banque — agrégation DSP2 en lecture seule.
 *
 * Portée de `app/bank/page.tsx` de l'app patrimoine, et complétée : l'original
 * ne montrait que le sélecteur de banque. Comme un consentement DSP2 expire (90
 * jours au plus, souvent moins), cette page liste aussi les connexions en cours
 * avec leur échéance — sans quoi l'agrégation devient muette un matin sans que
 * rien ne l'ait annoncé.
 *
 * Trois états distincts, à ne pas confondre :
 *   — non configuré : le déploiement n'a pas d'identifiants Enable Banking ;
 *   — configuré mais sans connexion : il n'y a plus qu'à choisir sa banque ;
 *   — connecté : les comptes remontent et alimentent la synthèse.
 */

import React from "react";
import { Building2, Loader2, RefreshCw, Trash2, Check, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { CARD, SectionTitle } from "@/components/ui/da";
import { fmt } from "@/lib/ui/format";
import { useBankAccounts } from "@/lib/bank/useBankAccounts";

const FIELD = {
  height: 40,
  borderRadius: "var(--radius-field)",
  border: `1px solid ${T.border}`,
  background: T.white,
  color: T.text,
  fontSize: 14,
  fontFamily: "inherit",
  padding: "0 10px",
  width: "100%",
};

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return null;
  }
}

/** Jours restants avant expiration du consentement — négatif s'il est expiré. */
function daysLeft(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export default function PatrimoineBankPage({ setPage }) {
  useLang();
  const { configured, connections, accounts, loading, error, reload } = useBankAccounts();

  const [institutions, setInstitutions] = React.useState([]);
  const [instLoading, setInstLoading] = React.useState(true);
  const [instError, setInstError] = React.useState(null);
  const [selected, setSelected] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);
  const [connectError, setConnectError] = React.useState(null);
  const [confirmingId, setConfirmingId] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/bank/institutions");
        const data = await resp.json();
        if (cancelled) return;
        setInstitutions(Array.isArray(data.institutions) ? data.institutions : []);
        setInstError(data.error || null);
      } catch (err) {
        if (!cancelled) setInstError(err instanceof Error ? err.message : "Erreur réseau");
      } finally {
        if (!cancelled) setInstLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const connect = async () => {
    if (!selected) return;
    setConnectError(null);
    setConnecting(true);
    try {
      const resp = await fetch("/api/bank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution: selected }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.link) throw new Error(data.error || "Impossible de démarrer la connexion.");
      // La suite se passe chez la banque : elle authentifie, puis renvoie sur
      // /api/bank/callback. On quitte donc l'app volontairement.
      window.location.href = data.link;
    } catch (err) {
      setConnecting(false);
      setConnectError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

  const disconnect = async (id) => {
    setConfirmingId(null);
    await fetch(`/api/bank/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  };

  const total = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionTitle>{t("patrimoine.bank.title")}</SectionTitle>
          <div style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub, maxWidth: 620 }}>
            {t("patrimoine.bank.subtitle")}
          </div>
        </div>

        {/* Déploiement sans identifiants : inutile de proposer un formulaire qui
            échouera — on dit ce qui manque. */}
        {!configured && !loading && (
          <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>
              {t("patrimoine.bank.notConfigured")}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: T.textSub }}>
              {t("patrimoine.bank.notConfiguredHint")}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: T.textSub }}>
              <li><code>ENABLEBANKING_APP_ID</code></li>
              <li><code>ENABLEBANKING_PRIVATE_KEY_BASE64</code></li>
              <li><code>ENABLEBANKING_COUNTRY</code> ({t("patrimoine.bank.optional")})</li>
            </ul>
          </section>
        )}

        {/* Connexions en cours */}
        {connections.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle
              size="sm"
              action={
                <button
                  type="button"
                  onClick={reload}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
                    padding: "0 12px", borderRadius: 999, border: "none",
                    background: "transparent", color: T.textSub, fontSize: 13,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <RefreshCw size={14} strokeWidth={1.75} /> {t("patrimoine.bank.refresh")}
                </button>
              }
            >
              {t("patrimoine.bank.connections")}
            </SectionTitle>

            <section style={{ ...CARD, padding: 0 }}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {connections.map((c, i) => {
                  const left = daysLeft(c.valid_until);
                  const expired = left !== null && left <= 0;
                  const expiring = left !== null && left > 0 && left <= 7;
                  const confirming = confirmingId === c.id;
                  return (
                    <li
                      key={c.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
                        borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                      }}
                    >
                      <Building2 size={18} strokeWidth={1.75} style={{ color: T.textSub, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text }}>
                          {c.aspsp_name}
                        </span>
                        <span style={{
                          display: "block", fontSize: 12,
                          color: expired ? T.pnlNeg : expiring ? T.amber : T.textSub,
                        }}>
                          {expired
                            ? t("patrimoine.bank.expired")
                            : left !== null
                              ? t("patrimoine.bank.expiresIn")
                                  .replace("{days}", String(left))
                                  .replace("{date}", formatDate(c.valid_until) || "—")
                              : t("patrimoine.bank.noExpiry")}
                        </span>
                      </span>

                      {confirming ? (
                        <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                          <IconButton danger label={t("patrimoine.bank.confirmDisconnect")} onClick={() => disconnect(c.id)} onBlur={() => setConfirmingId(null)}>
                            <Check size={15} strokeWidth={2} />
                          </IconButton>
                          <IconButton label={t("common.cancel")} onClick={() => setConfirmingId(null)}>
                            <X size={15} strokeWidth={2} />
                          </IconButton>
                        </span>
                      ) : (
                        <IconButton danger label={t("patrimoine.bank.disconnect").replace("{name}", c.aspsp_name)} onClick={() => setConfirmingId(c.id)}>
                          <Trash2 size={15} strokeWidth={1.75} />
                        </IconButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {error && (
              <div role="alert" style={{ fontSize: 13, color: T.pnlNeg }}>
                {t("patrimoine.bank.balancesError")} {error}
              </div>
            )}
          </div>
        )}

        {/* Comptes agrégés */}
        {accounts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle size="sm">{t("patrimoine.bank.accounts")}</SectionTitle>
            <section style={{ ...CARD, padding: 0 }}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {accounts.map((a, i) => (
                  <li
                    key={a.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
                      borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.name}
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: T.textSub }}>
                        {a.institution} · {t(`patrimoine.type.${a.type}`)}
                      </span>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {fmt(a.balance)}
                    </span>
                  </li>
                ))}
              </ul>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 20px", borderTop: `1px solid ${T.border}`,
                fontSize: 14, color: T.textSub,
              }}>
                <span>{t("patrimoine.bank.total")}</span>
                <span style={{ fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</span>
              </div>
            </section>
          </div>
        )}

        {/* Ajouter une banque */}
        {configured && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle size="sm">{t("patrimoine.bank.addBank")}</SectionTitle>
            <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
              <label htmlFor="bank-select" style={{ fontSize: 13, color: T.textSub }}>
                {t("patrimoine.bank.chooseBank")}
              </label>
              <select
                id="bank-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={instLoading || institutions.length === 0}
                style={FIELD}
              >
                <option value="">
                  {instLoading ? t("patrimoine.bank.loadingBanks") : t("patrimoine.bank.select")}
                </option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>

              {instError && (
                <div role="alert" style={{ fontSize: 13, color: T.pnlNeg }}>{instError}</div>
              )}
              {connectError && (
                <div role="alert" style={{ fontSize: 13, color: T.pnlNeg }}>{connectError}</div>
              )}

              <button
                type="button"
                onClick={connect}
                disabled={!selected || connecting}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  minHeight: 40, padding: "0 16px", borderRadius: 999, border: "none",
                  background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
                  cursor: selected && !connecting ? "pointer" : "not-allowed",
                  opacity: selected && !connecting ? 1 : 0.6,
                  fontFamily: "inherit",
                }}
              >
                {connecting && <Loader2 size={15} strokeWidth={1.75} className="anim-spin" />}
                {connecting ? t("patrimoine.bank.redirecting") : t("patrimoine.bank.connect")}
              </button>

              <div style={{ fontSize: 12, lineHeight: 1.6, color: T.textMut }}>
                {t("patrimoine.bank.readOnlyNotice")}
              </div>
            </section>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setPage?.("patrimoine")}
            style={{
              minHeight: 36, padding: "0 14px", borderRadius: 999, border: "none",
              background: "transparent", color: T.textSub, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {t("patrimoine.bank.backToSummary")}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, label, onClick, onBlur, danger }) {
  const rest = danger ? T.textMut : T.textSub;
  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={onBlur}
      aria-label={label}
      title={label}
      style={{
        width: 36, height: 36, borderRadius: 999, border: "none", flexShrink: 0,
        background: "transparent", color: rest, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? T.redBg : T.accentBg;
        e.currentTarget.style.color = danger ? T.red : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = rest;
      }}
    >
      {children}
    </button>
  );
}
