"use client";

/**
 * Modales de création / modification — firmes et comptes.
 *
 * Séparation volontaire des responsabilités :
 *  - PropFirmModal : crée ou modifie UNE firme (l'objet parent). Elle ne crée
 *    aucun compte : le nombre et le type de comptes se règlent ensuite dans la
 *    page détail de la firme.
 *  - AccountModal  : crée ou modifie UN compte isolé (live/démo perso, ou
 *    compte rattaché à une firme).
 *
 * La page Ajouter un trade ne crée plus de compte : elle sélectionne
 * uniquement parmi les comptes existants.
 */

import React from "react";
import ReactDOM from "react-dom";
import { X, Trash2 } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { PLATFORMS, PROP_FIRM_PRESETS, resolvePlatformIcon } from "@/lib/brokers/platforms";
import {
  ACCOUNT_SIZES,
  createFirm,
  createTradingAccount,
  updateFirm,
  updateTradingAccount,
} from "@/lib/propFirms";

/* ─────────────────────────── Primitives ─────────────────────────── */

export function ModalShell({ title, subtitle, onClose, children, footer, width = 480 }) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div
      {...backdropDismiss(onClose)}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-modal"
        style={{
          background: T.white, borderRadius: 14, width: "100%", maxWidth: width,
          boxShadow: "var(--elev-overlay)", border: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 32px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 20px 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: -0.1 }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 12, color: T.textMut, marginTop: 4, lineHeight: 1.5 }}>{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: "transparent", color: T.textMut, cursor: "pointer", flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="scroll-thin" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {children}
        </div>

        {footer && (
          <div style={{ padding: "0 20px 20px", display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: T.textSub }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${T.border}`, background: T.white,
  fontSize: 13, color: T.text, fontFamily: "inherit", outline: "none",
};

export function TextInput({ value, onChange, placeholder, type = "text", ...rest }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
      onFocus={(e) => { e.currentTarget.style.borderColor = T.border2; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = T.border; }}
      {...rest}
    />
  );
}

/** Sélecteur en pilules (type de compte). */
export function PillGroup({ options, value, onChange, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            style={{
              padding: "8px 14px", borderRadius: 999,
              border: `1px solid ${active ? T.text : T.border}`,
              background: active ? T.text : T.white,
              color: active ? T.bg : T.text,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Choix de la taille du compte en boutons (pas de menu déroulant) : les
 * tailles sont peu nombreuses et figées, tout voir d'un coup d'œil est plus
 * rapide qu'ouvrir une liste.
 */
export function SizePicker({ value, onChange, sizes = ACCOUNT_SIZES }) {
  return (
    <PillGroup
      ariaLabel={t("accountModal.size")}
      value={value}
      onChange={onChange}
      options={sizes.map((s) => ({ id: s, label: `$${s.toUpperCase()}` }))}
    />
  );
}

export function PrimaryBtn({ children, onClick, disabled, tone = "text" }) {
  const bg = tone === "danger" ? T.red : T.text;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "9px 16px", minHeight: 40, borderRadius: 999,
        border: `1px solid ${bg}`, background: bg, color: "#fff",
        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function GhostBtn({ children, onClick, tone }) {
  const color = tone === "danger" ? T.red : T.text;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "9px 16px", minHeight: 40, borderRadius: 999,
        border: `1px solid ${tone === "danger" ? T.redBd : T.border}`,
        background: T.white, color,
        fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Traduit les erreurs normalisées de lib/propFirms en message lisible.
 * MIGRATION_MISSING = la migration 031 n'est pas appliquée sur la base.
 */
export function firmErrorLabel(e) {
  const msg = String(e?.message || e || "");
  if (msg === "MIGRATION_MISSING") return t("firms.err.migrationMissing");
  if (msg === "DUPLICATE_FIRM") return t("firms.err.duplicate");
  return msg;
}

function ErrorLine({ children }) {
  if (!children) return null;
  return (
    <div style={{
      fontSize: 12, color: T.red, background: T.redBg,
      border: `1px solid ${T.redBd}`, borderRadius: 8, padding: "8px 10px", lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

const platformOptions = PLATFORMS.map((p) => ({ id: p.id, label: p.name, iconUrl: p.iconPath }));

/* ─────────────────────── Modale firme ─────────────────────── */

/**
 * @param {object}   props
 * @param {object=}  props.firm     Firme à modifier ; absent = création.
 * @param {string}   props.userId
 * @param {Function} props.onClose
 * @param {Function} props.onSaved  Reçoit la firme créée/modifiée.
 */
export function PropFirmModal({ firm = null, userId, onClose, onSaved }) {
  useLang();
  const isEdit = !!firm;
  const [name, setName] = React.useState(firm?.name || "");
  const [platform, setPlatform] = React.useState(firm?.platform || "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const applyPreset = (preset) => {
    setName(preset.name);
    setPlatform(preset.id === "ftmo" ? "" : "tradovate");
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t("firms.err.nameRequired")); return; }
    setBusy(true);
    setError("");
    try {
      const patch = {
        name: trimmed,
        platform: platform || null,
      };
      if (isEdit) {
        await updateFirm(firm.id, patch);
        onSaved?.({ ...firm, ...patch });
      } else {
        onSaved?.(await createFirm(userId, patch));
      }
      onClose?.();
    } catch (e) {
      setError(firmErrorLabel(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={isEdit ? t("firms.editTitle") : t("firms.createTitle")}
      subtitle={isEdit ? t("firms.editSub") : t("firms.createSub")}
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>{t("common.cancel")}</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy || !name.trim()}>
            {busy ? t("common.saving") : isEdit ? t("common.save") : t("firms.createCta")}
          </PrimaryBtn>
        </>
      }
    >
      <ErrorLine>{error}</ErrorLine>

      {!isEdit && (
        <Field label={t("firms.presets")} hint={t("firms.presetsHint")}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PROP_FIRM_PRESETS.map((preset) => {
              const active = name.trim().toLowerCase() === preset.name.toLowerCase();
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", borderRadius: 999,
                    border: `1px solid ${active ? T.text : T.border}`,
                    background: active ? T.accentBg : T.white,
                    color: T.text, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {preset.iconPath && (
                    <img src={preset.iconPath} alt="" style={{ height: 14, maxWidth: 40, objectFit: "contain" }} />
                  )}
                  {preset.name}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <Field label={t("firms.name")}>
        <TextInput value={name} onChange={setName} placeholder={t("firms.namePh")} autoFocus />
      </Field>

      <Field label={t("firms.platform")} hint={t("firms.platformHint")}>
        <SearchableSelect
          value={platform}
          onChange={setPlatform}
          options={[{ id: "", label: t("firms.noPlatform") }, ...platformOptions]}
          searchPlaceholder={t("firms.searchPlatform")}
          placeholder={t("firms.noPlatform")}
        />
      </Field>
    </ModalShell>
  );
}

/* ─────────────────────── Modale compte ─────────────────────── */

/**
 * @param {object}   props
 * @param {object=}  props.account  Compte à modifier ; absent = création.
 * @param {Array}    props.firms    Firmes disponibles pour le rattachement.
 * @param {string=}  props.defaultFirmId
 * @param {string}   props.userId
 * @param {Function} props.onClose
 * @param {Function} props.onSaved
 * @param {Function=} props.onDelete Affiche l'action de suppression en édition.
 */
export function AccountModal({
  account = null,
  firms = [],
  defaultFirmId = "",
  userId,
  onClose,
  onSaved,
  onDelete,
}) {
  useLang();
  const isEdit = !!account;
  const [name, setName] = React.useState(account?.name || "");
  const [firmId, setFirmId] = React.useState(account?.firm_id || defaultFirmId || "");
  const [type, setType] = React.useState(account?.account_type || "eval");
  // Taille normalisée (eval/funded) et solde initial libre (live/démo) sont
  // stockés dans la même colonne, mais saisis par deux champs distincts.
  const isNumericSize = /^\d+(\.\d+)?$/.test(String(account?.eval_account_size || ""));
  const [size, setSize] = React.useState(
    account?.eval_account_size && !isNumericSize ? account.eval_account_size : "50k"
  );
  const [balance, setBalance] = React.useState(isNumericSize ? String(account.eval_account_size) : "");
  const [platform, setPlatform] = React.useState(() => {
    if (!account?.broker) return "";
    const hit = PLATFORMS.find(
      (p) => p.name.toLowerCase() === String(account.broker).toLowerCase() || p.id === String(account.broker).toLowerCase()
    );
    return hit?.id || "";
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Rattacher une firme préremplit la plateforme de la firme (si vide).
  React.useEffect(() => {
    if (!firmId || platform) return;
    const firm = firms.find((f) => f.id === firmId);
    if (firm?.platform) setPlatform(firm.platform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId]);

  const isSized = type === "eval" || type === "funded";

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t("accountModal.err.nameRequired")); return; }
    setBusy(true);
    setError("");
    try {
      const brokerName = platform ? PLATFORMS.find((p) => p.id === platform)?.name || null : null;
      const patch = {
        name: trimmed,
        broker: brokerName,
        account_type: type,
        eval_account_size: isSized ? size || null : balance || null,
        firm_id: firmId || null,
      };
      if (isEdit) {
        await updateTradingAccount(account.id, patch);
        onSaved?.({ ...account, ...patch });
      } else {
        onSaved?.(await createTradingAccount(userId, patch));
      }
      onClose?.();
    } catch (e) {
      setError(firmErrorLabel(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={isEdit ? t("accountModal.editTitle") : t("accountModal.createTitle")}
      subtitle={isEdit ? t("accountModal.editSub") : t("accountModal.createSub")}
      onClose={onClose}
      footer={
        <>
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(account)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, marginRight: "auto",
                padding: "9px 14px", minHeight: 40, borderRadius: 999,
                border: `1px solid ${T.redBd}`, background: T.white, color: T.red,
                fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <Trash2 size={13} strokeWidth={1.75} /> {t("common.delete")}
            </button>
          )}
          <GhostBtn onClick={onClose}>{t("common.cancel")}</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy || !name.trim()}>
            {busy ? t("common.saving") : isEdit ? t("common.save") : t("accountModal.createCta")}
          </PrimaryBtn>
        </>
      }
    >
      <ErrorLine>{error}</ErrorLine>

      <Field label={t("accountModal.name")} hint={t("accountModal.nameHint")}>
        <TextInput value={name} onChange={setName} placeholder={t("accountModal.namePh")} autoFocus />
      </Field>

      <Field label={t("accountModal.firm")} hint={t("accountModal.firmHint")}>
        <SearchableSelect
          value={firmId}
          onChange={setFirmId}
          options={[
            { id: "", label: t("accountModal.noFirm") },
            ...firms.map((f) => ({
              id: f.id,
              label: f.name,
              iconUrl: resolvePlatformIcon(f.platform || f.name) || undefined,
            })),
          ]}
          searchable={firms.length > 6}
          searchPlaceholder={t("firms.searchFirm")}
          placeholder={t("accountModal.noFirm")}
        />
      </Field>

      <Field label={t("accountModal.type")}>
        <PillGroup
          ariaLabel={t("accountModal.type")}
          value={type}
          onChange={setType}
          options={[
            { id: "eval", label: t("addTrade.eval") },
            { id: "funded", label: t("addTrade.funded") },
            { id: "live", label: t("addTrade.live") },
            { id: "demo", label: t("addTrade.demo") },
          ]}
        />
      </Field>

      {isSized ? (
        <Field label={t("accountModal.size")}>
          <SizePicker value={size} onChange={setSize} />
        </Field>
      ) : (
        <Field label={t("accountModal.balance")}>
          <TextInput type="number" value={balance} onChange={setBalance} placeholder="10000" min="0" step="any" />
        </Field>
      )}

      <Field label={t("accountModal.platform")} hint={t("accountModal.platformHint")}>
        <SearchableSelect
          value={platform}
          onChange={setPlatform}
          options={[{ id: "", label: t("firms.noPlatform") }, ...platformOptions]}
          searchPlaceholder={t("firms.searchPlatform")}
          placeholder={t("firms.noPlatform")}
        />
      </Field>
    </ModalShell>
  );
}

/* ─────────────── Confirmation générique (suppressions) ─────────────── */

export function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, busy = false, extra }) {
  useLang();
  return (
    <ModalShell title={title} onClose={onClose} width={430}
      footer={
        <>
          <GhostBtn onClick={onClose}>{t("common.cancel")}</GhostBtn>
          <PrimaryBtn onClick={onConfirm} disabled={busy} tone="danger">
            {busy ? t("common.saving") : confirmLabel || t("common.delete")}
          </PrimaryBtn>
        </>
      }
    >
      <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>{message}</div>
      {extra}
    </ModalShell>
  );
}
