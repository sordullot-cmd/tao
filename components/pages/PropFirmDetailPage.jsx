"use client";

/**
 * PropFirmDetailPage — « paramètres » d'une firme de prop trading.
 *
 * C'est ici qu'on règle le NOMBRE et le TYPE de comptes de la firme :
 *  - liste des comptes rattachés (modifier / supprimer / ouvrir le détail),
 *    présentée avec les MÊMES lignes que la page Comptes
 *    (components/ui/accountRows) ;
 *  - ajout en lot (type + taille + nombre → N comptes numérotés), dans une
 *    fenêtre volante ouverte par le bouton de fin de page.
 *
 * La création de la firme elle-même se fait depuis la page Comptes
 * (PropFirmModal), qui porte aussi l'ajout d'UN compte rattaché à la firme
 * (bouton dans la ligne dépliée). L'import de trades ne crée aucun compte.
 */

import React from "react";
import { ArrowLeft, Plus, Pencil, Trash2, Settings2, Wallet } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { t, useLang } from "@/lib/i18n";
import { resolvePlatformIcon, platformName } from "@/lib/brokers/platforms";
import {
  createFirmAccounts,
  deleteFirm,
  deleteTradingAccount,
  parseAccountSize,
  readFundedMeta,
} from "@/lib/propFirms";
import { AccountRowsHeader, TableRow } from "@/components/ui/accountRows";
import {
  AccountModal,
  ConfirmModal,
  Field,
  ModalShell,
  PillGroup,
  PrimaryBtn,
  PropFirmModal,
  SizePicker,
  TextInput,
  firmErrorLabel,
} from "@/components/modals/AccountModals";

const fmtNoCents = (n) => {
  const sym = getCurrencySymbol();
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? "-" : ""}${sym}${Math.abs(v).toLocaleString("en-US")}`;
};

const typeLabel = (type, size) => {
  const base =
    type === "eval" ? t("addTrade.eval")
      : type === "funded" ? t("addTrade.funded")
        : type === "demo" ? t("accountsPage.demo")
          : t("accountsPage.live");
  return size ? `${base} · ${size}` : base;
};

export default function PropFirmDetailPage({
  firmId,
  firms = [],
  accounts = [],
  trades = [],
  userId,
  setPage,
  setAccounts,
  setFirms,
  setSelectedAccountDetailId,
  setSelectedAccountIds,
}) {
  useLang();
  const firm = firms.find((f) => f.id === firmId) || null;

  const [editingFirm, setEditingFirm] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState(null);
  const [confirmAccount, setConfirmAccount] = React.useState(null);
  const [confirmFirm, setConfirmFirm] = React.useState(false);
  const [deleteFirmAccounts, setDeleteFirmAccounts] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  /* Formulaire d'ajout en lot — désormais dans une fenêtre volante ouverte par
     le bouton de fin de page, au lieu d'un bloc inline. */
  const [addOpen, setAddOpen] = React.useState(false);
  const [addType, setAddType] = React.useState("eval");
  // Taille normalisée pour eval/funded ; solde initial libre pour live/démo.
  const [addSize, setAddSize] = React.useState("50k");
  const [addBalance, setAddBalance] = React.useState("");
  const [addCount, setAddCount] = React.useState("1");
  const [addPrefix, setAddPrefix] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const isSizedType = addType === "eval" || addType === "funded";
  const addSizeValue = isSizedType ? addSize : (addBalance || null);

  const firmAccounts = React.useMemo(
    () => accounts.filter((a) => a.firm_id === firmId),
    [accounts, firmId]
  );

  // Agrégats par compte (trades, P&L, win rate)
  const statsByAccount = React.useMemo(() => {
    const map = new Map();
    firmAccounts.forEach((a) => map.set(a.id, { trades: 0, wins: 0, losses: 0, pnl: 0 }));
    (trades || []).forEach((tr) => {
      const s = map.get(tr.account_id);
      if (!s) return;
      const p = Number(tr.pnl) || 0;
      s.trades += 1;
      s.pnl += p;
      if (p > 0) s.wins += 1;
      else if (p < 0) s.losses += 1;
    });
    return map;
  }, [firmAccounts, trades]);

  /* Vue « compte » alignée sur celle de la page Comptes, pour que les mêmes
     colonnes affichent les mêmes chiffres des deux côtés. */
  const fundedMeta = React.useMemo(() => readFundedMeta(), []);
  const viewOf = React.useCallback((acc) => {
    const s = statsByAccount.get(acc.id) || { trades: 0, wins: 0, pnl: 0 };
    const capital = parseAccountSize(acc.eval_account_size);
    const isFunded = (acc.account_type || "live") === "funded";
    return {
      trades: s.trades,
      pnl: s.pnl,
      capital,
      value: capital != null ? capital + s.pnl : s.pnl,
      winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : null,
      payout: isFunded ? Math.max(0, s.pnl - (fundedMeta[acc.id]?.funded_payout_min || 0)) : 0,
    };
  }, [statsByAccount, fundedMeta]);

  const totals = React.useMemo(() => {
    let count = 0, tradeCount = 0, wins = 0, pnl = 0, capital = 0;
    firmAccounts.forEach((a) => {
      count += 1;
      capital += parseAccountSize(a.eval_account_size) || 0;
      const s = statsByAccount.get(a.id);
      if (s) { tradeCount += s.trades; wins += s.wins; pnl += s.pnl; }
    });
    return { count, tradeCount, wins, pnl, capital, winRate: tradeCount > 0 ? (wins / tradeCount) * 100 : 0 };
  }, [firmAccounts, statsByAccount]);

  if (!firm) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
        <BackButton onClick={() => setPage?.("accounts")} />
        <div style={{
          background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)",
          padding: 40, textAlign: "center", color: T.textMut, fontSize: 13,
        }}>
          {t("firms.notFound")}
        </div>
      </div>
    );
  }

  const logo = resolvePlatformIcon(firm.platform || firm.name);

  /* ─── Actions ─── */

  const nextIndexPreview = () => {
    const base = (addPrefix || firm.name || "Compte").trim();
    const sizeLabel = isSizedType ? addSize : null;
    const taken = new Set(accounts.map((a) => String(a.name || "").toLowerCase()));
    const names = [];
    const n = Math.max(1, Math.min(50, parseInt(addCount, 10) || 1));
    let i = 1;
    while (names.length < n) {
      const name = `${[base, sizeLabel].filter(Boolean).join(" ")} #${i}`;
      if (!taken.has(name.toLowerCase())) { names.push(name); taken.add(name.toLowerCase()); }
      i += 1;
      if (i > 200) break;
    }
    return names;
  };

  const onAddAccounts = async () => {
    setAdding(true);
    setError("");
    try {
      const created = await createFirmAccounts(userId, firm, {
        count: parseInt(addCount, 10) || 1,
        accountType: addType,
        size: addSizeValue,
        namePrefix: addPrefix || null,
      });
      setAccounts?.((prev) => [...created, ...(prev || [])]);
      // Les nouveaux comptes entrent dans la sélection courante pour être
      // immédiatement visibles dans le dashboard et les autres pages.
      setSelectedAccountIds?.((prev) => {
        const next = [...(prev || [])];
        created.forEach((a) => { if (!next.includes(a.id)) next.push(a.id); });
        try { localStorage.setItem("selectedAccountIds", JSON.stringify(next)); } catch {}
        return next;
      });
      setAddCount("1");
      setAddOpen(false);
    } catch (e) {
      setError(firmErrorLabel(e));
    } finally {
      setAdding(false);
    }
  };

  const onDeleteAccount = async () => {
    if (!confirmAccount) return;
    setBusy(true);
    setError("");
    try {
      await deleteTradingAccount(confirmAccount.id, userId);
      setAccounts?.((prev) => (prev || []).filter((a) => a.id !== confirmAccount.id));
      setSelectedAccountIds?.((prev) => {
        const next = (prev || []).filter((id) => id !== confirmAccount.id);
        try { localStorage.setItem("selectedAccountIds", JSON.stringify(next)); } catch {}
        return next;
      });
      setConfirmAccount(null);
      setEditingAccount(null);
    } catch (e) {
      setError(firmErrorLabel(e));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFirm = async () => {
    setBusy(true);
    setError("");
    try {
      const removedIds = firmAccounts.map((a) => a.id);
      await deleteFirm(firm.id, userId, { deleteAccounts: deleteFirmAccounts });
      setFirms?.((prev) => (prev || []).filter((f) => f.id !== firm.id));
      setAccounts?.((prev) =>
        deleteFirmAccounts
          ? (prev || []).filter((a) => a.firm_id !== firm.id)
          : (prev || []).map((a) => (a.firm_id === firm.id ? { ...a, firm_id: null } : a))
      );
      if (deleteFirmAccounts) {
        setSelectedAccountIds?.((prev) => {
          const next = (prev || []).filter((id) => !removedIds.includes(id));
          try { localStorage.setItem("selectedAccountIds", JSON.stringify(next)); } catch {}
          return next;
        });
      }
      setConfirmFirm(false);
      setPage?.("accounts");
    } catch (e) {
      setError(firmErrorLabel(e));
      setBusy(false);
    }
  };

  const previewNames = nextIndexPreview();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      {/* ─── Header ─── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <BackButton onClick={() => setPage?.("accounts")} />
        {logo && <img src={logo} alt="" style={{ height: 22, maxWidth: 72, objectFit: "contain" }} />}
        <h1 style={{
          margin: 0, fontSize: 17, fontWeight: 600, color: T.text, letterSpacing: -0.1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {firm.name}
        </h1>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
          background: T.bg, color: T.textSub, border: `1px solid ${T.border}`, whiteSpace: "nowrap",
        }}>
          {totals.count === 1 ? t("firms.oneAccount") : t("firms.nAccounts").replace("{n}", String(totals.count))}
        </span>
        {firm.platform && (
          <span style={{ fontSize: 12, color: T.textMut }}>{platformName(firm.platform)}</span>
        )}
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setEditingFirm(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
              borderRadius: 999, border: `1px solid ${T.border}`, background: T.white,
              color: T.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Settings2 size={13} strokeWidth={1.75} /> {t("firms.editFirm")}
          </button>
          <button
            type="button"
            onClick={() => { setDeleteFirmAccounts(false); setConfirmFirm(true); }}
            aria-label={t("firms.deleteFirm")}
            title={t("firms.deleteFirm")}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 999,
              border: `1px solid ${T.border}`, background: T.white, color: T.textMut, cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.borderColor = T.redBd; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.borderColor = T.border; }}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          fontSize: 12, color: T.red, background: T.redBg, border: `1px solid ${T.redBd}`,
          borderRadius: 8, padding: "9px 12px",
        }}>
          {error}
        </div>
      )}

      {/* ─── KPIs de la firme ─── */}
      <div style={{
        background: T.white, border: `1px solid ${T.border}`,
        borderRadius: "var(--radius-card)", overflow: "hidden",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          <Kpi label={t("accountsPage.kpiAccounts")} value={String(totals.count)} />
          <Kpi label={t("accountsPage.kpiCapital")} value={totals.capital > 0 ? fmtNoCents(totals.capital) : "—"} />
          <Kpi label={t("accountsPage.kpiTrades")} value={String(totals.tradeCount)} />
          <Kpi
            label={t("accountsPage.kpiPnL")}
            value={fmt(totals.pnl, true)}
            valueColor={totals.pnl > 0 ? T.green : totals.pnl < 0 ? T.red : T.text}
          />
          <Kpi
            label={t("accountsPage.kpiWR")}
            value={totals.tradeCount > 0 ? `${totals.winRate.toFixed(1)}%` : "—"}
            last
          />
        </div>
      </div>

      {/* ─── Comptes de la firme ───
          Présentés exactement comme la liste de la page Comptes : mêmes
          lignes-cartes, mêmes colonnes, même en-tête (components/ui/accountRows). */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0 }}>{t("firms.accountsTitle")}</h2>
          <span style={{ fontSize: 11, color: T.textMut }}>{t("firms.accountsSub")}</span>
        </div>

        {firmAccounts.length === 0 ? (
          <div style={{
            background: T.white, border: `1px solid ${T.border}`,
            borderRadius: "var(--radius-card)", padding: "32px 18px", textAlign: "center",
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "var(--radius-card)", background: T.accentBg,
              display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
            }}>
              <Wallet size={18} strokeWidth={1.75} color={T.text} />
            </div>
            <div style={{ fontSize: 13, color: T.textSub }}>{t("firms.noAccountYet")}</div>
          </div>
        ) : (
          <>
            <AccountRowsHeader firstLabel={t("accountModal.type")} withActions />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {firmAccounts.map((acc) => {
                const v = viewOf(acc);
                return (
                  <TableRow
                    key={acc.id}
                    icon={resolvePlatformIcon(acc.broker) || resolvePlatformIcon(firm.platform || firm.name)}
                    fallbackIcon={<Wallet size={12} strokeWidth={1.75} color={T.textSub} />}
                    label={acc.name || acc.eval_account_size || "Compte"}
                    cells={[
                      typeLabel(acc.account_type, acc.eval_account_size),
                      v.capital != null ? fmtNoCents(v.value) : fmt(v.pnl, false),
                      v.winRate != null ? `${Math.round(v.winRate)}%` : "—",
                      fmtNoCents(v.payout),
                    ]}
                    expandable={false}
                    onOpen={() => {
                      setSelectedAccountDetailId?.(acc.id);
                      setPage?.("account-detail");
                    }}
                    actions={
                      <>
                        <IconBtn label={t("common.edit")} onClick={() => setEditingAccount(acc)}>
                          <Pencil size={14} strokeWidth={1.75} />
                        </IconBtn>
                        <IconBtn label={t("common.delete")} danger onClick={() => setConfirmAccount(acc)}>
                          <Trash2 size={14} strokeWidth={1.75} />
                        </IconBtn>
                      </>
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ─── Bouton de fin de page : ouvre le formulaire d'ajout en lot ─── */}
      <div>
        <PrimaryBtn onClick={() => setAddOpen(true)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={13} strokeWidth={2} />
            {t("nav.addTrade")}
          </span>
        </PrimaryBtn>
      </div>

      {/* ─── Modales ─── */}
      {/* Formulaire d'ajout en lot (type + taille + nombre + préfixe) : même
          questionnaire qu'avant, sorti du bas de page vers une fenêtre volante. */}
      {addOpen && (
        <ModalShell
          title={t("firms.addTitle")}
          subtitle={t("firms.addSub")}
          width={520}
          onClose={() => setAddOpen(false)}
          footer={
            <PrimaryBtn onClick={onAddAccounts} disabled={adding}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Plus size={13} strokeWidth={2} />
                {adding
                  ? t("common.saving")
                  : previewNames.length === 1
                    ? t("firms.addOneCta")
                    : t("firms.addNCta").replace("{n}", String(previewNames.length))}
              </span>
            </PrimaryBtn>
          }
        >
          <Field label={t("accountModal.type")}>
            <PillGroup
              ariaLabel={t("accountModal.type")}
              value={addType}
              onChange={setAddType}
              options={[
                { id: "eval", label: t("addTrade.eval") },
                { id: "funded", label: t("addTrade.funded") },
                { id: "live", label: t("addTrade.live") },
                { id: "demo", label: t("addTrade.demo") },
              ]}
            />
          </Field>

          {isSizedType ? (
            <Field label={t("accountModal.size")}>
              <SizePicker value={addSize} onChange={setAddSize} />
            </Field>
          ) : (
            <Field label={t("accountModal.balance")}>
              <div style={{ maxWidth: 200 }}>
                <TextInput
                  type="number"
                  value={addBalance}
                  onChange={setAddBalance}
                  placeholder="10000"
                  min="0"
                  step="any"
                />
              </div>
            </Field>
          )}

          <Field label={t("firms.count")}>
            <div style={{ maxWidth: 140 }}>
              <TextInput type="number" value={addCount} onChange={setAddCount} min="1" max="50" step="1" />
            </div>
          </Field>

          <Field label={t("firms.namePrefix")} hint={t("firms.namePrefixHint")}>
            <TextInput value={addPrefix} onChange={setAddPrefix} placeholder={firm.name} />
          </Field>

          {previewNames.length > 0 && (
            <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.6 }}>
              {t("firms.preview")}{" "}
              {previewNames.slice(0, 4).map((n) => (
                <span
                  key={n}
                  style={{
                    display: "inline-block", padding: "2px 8px", marginRight: 6, marginTop: 4,
                    borderRadius: 999, border: `1px solid ${T.border}`, background: T.bg,
                    color: T.textSub, fontSize: 11,
                  }}
                >
                  {n}
                </span>
              ))}
              {previewNames.length > 4 && <span>+{previewNames.length - 4}</span>}
            </div>
          )}

          {/* L'échec garde la fenêtre ouverte : le bandeau d'erreur de la page
              serait caché derrière, on le répète donc ici. */}
          {error && (
            <div style={{
              fontSize: 12, color: T.red, background: T.redBg, border: `1px solid ${T.redBd}`,
              borderRadius: 8, padding: "9px 12px",
            }}>
              {error}
            </div>
          )}
        </ModalShell>
      )}

      {editingFirm && (
        <PropFirmModal
          firm={firm}
          userId={userId}
          onClose={() => setEditingFirm(false)}
          onSaved={(next) => setFirms?.((prev) => (prev || []).map((f) => (f.id === next.id ? next : f)))}
        />
      )}

      {editingAccount && (
        <AccountModal
          account={editingAccount}
          firms={firms}
          userId={userId}
          onClose={() => setEditingAccount(null)}
          onDelete={(acc) => { setEditingAccount(null); setConfirmAccount(acc); }}
          onSaved={(next) =>
            setAccounts?.((prev) => (prev || []).map((a) => (a.id === next.id ? { ...a, ...next } : a)))
          }
        />
      )}

      {confirmAccount && (
        <ConfirmModal
          title={t("firms.deleteAccountTitle")}
          message={t("firms.deleteAccountMsg").replace("{name}", confirmAccount.name || "")}
          confirmLabel={t("common.delete")}
          busy={busy}
          onConfirm={onDeleteAccount}
          onClose={() => setConfirmAccount(null)}
        />
      )}

      {confirmFirm && (
        <ConfirmModal
          title={t("firms.deleteFirmTitle").replace("{name}", firm.name)}
          message={
            firmAccounts.length === 0
              ? t("firms.deleteFirmMsgEmpty")
              : t("firms.deleteFirmMsg").replace("{n}", String(firmAccounts.length))
          }
          confirmLabel={t("firms.deleteFirm")}
          busy={busy}
          onConfirm={onDeleteFirm}
          onClose={() => setConfirmFirm(false)}
          extra={
            firmAccounts.length > 0 ? (
              <label style={{
                display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12,
                color: T.textSub, cursor: "pointer", lineHeight: 1.5,
              }}>
                <input
                  type="checkbox"
                  checked={deleteFirmAccounts}
                  onChange={(e) => setDeleteFirmAccounts(e.target.checked)}
                  style={{ marginTop: 2, accentColor: T.red }}
                />
                <span>{t("firms.deleteFirmAlsoAccounts").replace("{n}", String(firmAccounts.length))}</span>
              </label>
            ) : null
          }
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Sous-composants ─────────────────────────── */

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("common.back")}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 999, border: `1px solid ${T.border}`,
        background: T.white, color: T.text, cursor: "pointer", flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.bg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.white; }}
    >
      <ArrowLeft size={14} strokeWidth={1.75} />
    </button>
  );
}

function IconBtn({ children, onClick, label, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 8, border: "none",
        background: "transparent", color: T.textMut, cursor: "pointer", flexShrink: 0,
        transition: "background .12s ease, color .12s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? T.redBg : T.accentBg;
        e.currentTarget.style.color = danger ? T.red : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = T.textMut;
      }}
    >
      {children}
    </button>
  );
}

function Kpi({ label, value, valueColor, last }) {
  return (
    <div style={{ padding: "14px 18px", borderRight: last ? "none" : `1px solid ${T.border}` }}>
      <div style={{ fontSize: 11, color: T.textMut, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 700, color: valueColor || T.text,
        letterSpacing: -0.3, fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}
