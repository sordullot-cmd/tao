"use client";

/**
 * Modales de création / modification — firmes et comptes.
 *
 * Séparation volontaire des responsabilités :
 *  - PropFirmModal : crée ou modifie UNE firme (l'objet parent). À la création
 *    elle ne touche pas aux comptes ; en MODIFICATION elle gère aussi les
 *    comptes de la firme : retirer ceux qu'on ne veut plus (marqués, puis
 *    appliqués à l'enregistrement) et régler ce que montre son montant
 *    principal. L'ajout de comptes reste dans la page de la firme.
 *  - AccountModal  : crée ou modifie UN compte isolé (live/démo perso, ou
 *    compte rattaché à une firme).
 *
 * La page Ajouter un trade ne crée plus de compte : elle sélectionne
 * uniquement parmi les comptes existants.
 */

import React from "react";
import ReactDOM from "react-dom";
import { X, Trash2, Lock, Check, Link2, ArrowRight } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { PLATFORMS, PROP_FIRM_PRESETS, resolvePlatformIcon } from "@/lib/brokers/platforms";
import { accountColor } from "@/lib/ui/accountTypes";
import { firmLogo, firmBrandId } from "@/lib/accountBrand";
import { refreshTradesCache } from "@/lib/tradesCache";
import {
  ACCOUNT_SIZES,
  createFirm,
  createTradingAccount,
  deleteTradingAccount,
  readFirmHeroMode,
  updateFirm,
  updateTradingAccount,
  writeFirmHeroMode,
} from "@/lib/propFirms";

/** « Eval · 50k » — type du compte, suivi de sa taille quand elle existe. */
function accountTypeSizeLabel(acc) {
  const type = acc?.account_type || "live";
  const base =
    type === "eval" ? t("addTrade.eval")
      : type === "funded" ? t("addTrade.funded")
        : type === "demo" ? t("accountsPage.demo")
          : t("accountsPage.live");
  return acc?.eval_account_size ? `${base} · ${acc.eval_account_size}` : base;
}

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

        {/* `minHeight: 0` : sans lui, un enfant flex refuse de descendre sous sa
            hauteur de contenu et le corps ne défile jamais — il déborde. */}
        <div className="scroll-thin" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", minHeight: 0 }}>
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
export function PropFirmModal({ firm = null, accounts = [], userId, onClose, onSaved, onAccountsChanged, onHeroModeChanged }) {
  useLang();
  const isEdit = !!firm;
  const [name, setName] = React.useState(firm?.name || "");
  /* La marque est indépendante du nom : c'est elle qui rattache la firme à une
     maison connue (et lui donne son logo). Une firme d'avant la migration 032
     n'a pas de `brand` : on la déduit une fois de son nom, puis elle survit à
     tous les renommages. */
  const [brand, setBrand] = React.useState(() => firmBrandId(firm) || "");
  const [platform, setPlatform] = React.useState(firm?.platform || "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Ce que montre le chiffre héros de la page firme (préférence d'affichage).
  const [heroMode, setHeroMode] = React.useState(() => (firm ? readFirmHeroMode(firm.id) : "value"));

  /* Gestion des comptes de la firme, en édition seulement.

     Les retraits sont MARQUÉS, pas exécutés au clic : supprimer un compte
     supprime aussi ses trades, on ne le fait donc qu'à l'enregistrement, et la
     marque reste annulable jusque-là. */
  const [removeIds, setRemoveIds] = React.useState(() => new Set());

  const toggleRemove = (id) => {
    setRemoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* Un preset renseigne la plateforme et, seulement si l'utilisateur n'a rien
     écrit de personnel, le nom. Un nom déjà saisi n'est jamais écrasé : on ne
     remplace que le champ vide ou le nom laissé par un preset précédent. */
  const isUntouchedName = () => {
    const current = name.trim().toLowerCase();
    if (!current) return true;
    return PROP_FIRM_PRESETS.some((p) => p.name.toLowerCase() === current);
  };

  /* Choisir une maison la rattache (`brand`) et, à la création seulement,
     propose son nom. Recliquer la maison active la détache. */
  const applyPreset = (preset) => {
    if (brand === preset.id) { setBrand(""); return; }
    setBrand(preset.id);
    if (!isEdit) {
      if (isUntouchedName()) setName(preset.name);
      setPlatform(preset.id === "ftmo" ? "" : "tradovate");
    }
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t("firms.err.nameRequired")); return; }
    setBusy(true);
    setError("");
    try {
      const patch = {
        name: trimmed,
        brand: brand || null,
        platform: platform || null,
      };
      if (isEdit) {
        await updateFirm(firm.id, patch);
        const nextFirm = { ...firm, ...patch };
        writeFirmHeroMode(firm.id, heroMode);
        onHeroModeChanged?.(heroMode);

        // Les retraits marqués ne sont appliqués qu'ici. L'AJOUT de comptes
        // reste dans la page de la firme (bouton « Ajouter des comptes ») :
        // cette modale ne fait que retirer.
        for (const id of removeIds) {
          await deleteTradingAccount(id, userId);
        }
        onSaved?.(nextFirm);
        if (removeIds.size > 0) {
          // Un compte retiré emporte ses trades : le cache local doit suivre.
          await refreshTradesCache(userId);
          onAccountsChanged?.({ removedIds: Array.from(removeIds), created: [] });
        }
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

      {/* Le choix de la maison reste disponible en MODIFICATION : c'est là que
          le nom change, et c'est le seul endroit où rattacher (ou détacher)
          une firme dont le nom ne dit plus la maison. */}
      <Field
        label={t("firms.presets")}
        hint={isEdit ? t("firms.brandHintEdit") : t("firms.presetsHint")}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PROP_FIRM_PRESETS.map((preset) => {
            /* Actif = la MARQUE retenue, plus le nom saisi : c'est tout
               l'objet du changement, le rattachement survit au renommage. */
            const active = brand === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preset.iconPath} alt="" style={{ height: 14, maxWidth: 40, objectFit: "contain" }} />
                )}
                {preset.name}
              </button>
            );
          })}
        </div>
      </Field>

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

      {/* ── Affichage & comptes de la firme (édition seulement) ──────────── */}
      {isEdit && (
        <>
          <div style={{ height: 1, background: T.border }} />

          {/* Chiffre héros de la page : la valeur des comptes n'a de sens que si
              leur capital est connu ; sinon le P&L seul est plus honnête. */}
          <Field label={t("firms.heroLabel")} hint={t("firms.heroHint")}>
            <PillGroup
              ariaLabel={t("firms.heroLabel")}
              value={heroMode}
              onChange={setHeroMode}
              options={[
                { id: "value", label: t("firms.heroValue") },
                { id: "pnl", label: t("firms.heroPnl") },
              ]}
            />
          </Field>

          <div style={{ height: 1, background: T.border }} />

          <Field
            label={`${t("firms.accountsTitle")} (${accounts.length - removeIds.size})`}
            hint={t("firms.manageAccountsHint")}
          >
            {accounts.length === 0 ? (
              <div style={{ fontSize: 12, color: T.textMut }}>{t("firms.noAccountYet")}</div>
            ) : (
              /* Une seule surface encadrée, des lignes séparées par un filet :
                 une liste se lit comme un bloc. Des cartes individuelles à
                 bordure faisaient bégayer huit fois le même contour. */
              <div style={{
                border: `1px solid ${T.border}`, borderRadius: "var(--radius-field)",
                overflow: "hidden", background: T.white,
              }}>
                {accounts.map((acc, i) => {
                  const marked = removeIds.has(acc.id);
                  return (
                    <div
                      key={acc.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 10px", minHeight: 44,
                        borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                        background: marked ? T.redBg : "transparent",
                        transition: "background var(--dur-fast) var(--ease-out)",
                      }}
                    >
                      {/* Pastille de couleur du TYPE de compte : le même repère
                          que la liste des comptes et les courbes. */}
                      <span aria-hidden style={{
                        width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                        background: accountColor(acc),
                        opacity: marked ? 0.4 : 1,
                      }} />
                      <span style={{
                        flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2,
                      }}>
                        <span style={{
                          fontSize: 13, fontWeight: 500, color: marked ? T.textMut : T.text,
                          textDecoration: marked ? "line-through" : "none",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {acc.name || acc.eval_account_size || "Compte"}
                        </span>
                        <span style={{ fontSize: 11, color: T.textMut, whiteSpace: "nowrap" }}>
                          {accountTypeSizeLabel(acc)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleRemove(acc.id)}
                        aria-label={marked ? t("common.cancel") : t("common.delete")}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          gap: 6, height: 30, padding: marked ? "0 10px" : "0 8px",
                          borderRadius: 999, flexShrink: 0,
                          border: `1px solid ${marked ? T.border : "transparent"}`,
                          background: "transparent",
                          color: marked ? T.text : T.textMut, cursor: "pointer",
                          fontFamily: "inherit", fontSize: 12, fontWeight: 500,
                          transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = marked ? T.accentBg : T.redBg;
                          if (!marked) e.currentTarget.style.color = T.red;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          if (!marked) e.currentTarget.style.color = T.textMut;
                        }}
                      >
                        {marked ? t("common.cancel") : <Trash2 size={14} strokeWidth={1.75} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Field>

          {/* L'avertissement n'apparaît qu'en cas de retrait marqué : supprimer
              un compte supprime aussi ses trades, ça doit être dit avant de
              valider, pas après. */}
          {removeIds.size > 0 && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 12px", borderRadius: "var(--radius-field)",
              border: `1px solid ${T.redBd}`, background: T.redBg,
              fontSize: 12, color: T.red, lineHeight: 1.5,
            }}>
              <Trash2 size={13} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{t("firms.removeAccountsWarn").replace("{n}", String(removeIds.size))}</span>
            </div>
          )}

        </>
      )}
    </ModalShell>
  );
}

/* ────────── Rattachement de comptes EXISTANTS à une firme ────────── */

/**
 * Rattache à une firme des comptes qui existent déjà — elle n'en crée aucun.
 *
 * C'est le pendant de la création en lot (page de la firme, « Ajouter des
 * comptes ») : un compte saisi avant sa firme, ou créé hors firme, n'avait qu'un
 * seul chemin de rattachement — la modale du compte, un compte à la fois, à
 * condition de savoir que le champ « Firme » s'y trouve. Ici on part de la
 * firme, c'est-à-dire du sens dans lequel la question se pose.
 *
 * Les comptes d'une AUTRE firme sont proposés aussi : déplacer un compte est le
 * même geste que le rattacher. L'origine est affichée sur la ligne et le
 * déplacement récapitulé avant validation, pour qu'il ne soit jamais implicite.
 *
 * @param {object}    props.firm       Firme d'accueil.
 * @param {Array}     props.accounts   Comptes actifs de l'utilisateur (archivés exclus).
 * @param {Array=}    props.firms      Sert à nommer la firme d'origine d'un compte.
 * @param {Function}  props.onClose
 * @param {Function=} props.onAttached Reçoit { updated: [comptes patchés] }.
 */
export function AttachAccountsModal({ firm, accounts = [], firms = [], onClose, onAttached }) {
  useLang();
  const [picked, setPicked] = React.useState(() => new Set());
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const candidates = React.useMemo(
    () => (accounts || []).filter((a) => a && a.firm_id !== firm.id),
    [accounts, firm.id]
  );

  const q = query.trim().toLowerCase();
  const shown = q
    ? candidates.filter((a) => `${a.name || ""} ${accountTypeSizeLabel(a)}`.toLowerCase().includes(q))
    : candidates;

  const firmNameOf = (id) => firms.find((f) => f.id === id)?.name || "";
  const movedCount = candidates.filter((a) => picked.has(a.id) && a.firm_id).length;

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    setError("");
    try {
      /* La plateforme de la firme fait foi : tous les comptes d'une même prop
         firm passent par le même broker (même règle que la modale du compte).
         Mais on n'EFFACE pas le broker d'un compte pour une firme dont la
         plateforme n'est pas réglée : rattacher ne doit pas perdre une donnée
         déjà saisie. */
      const brokerName = firm.platform
        ? PLATFORMS.find((p) => p.id === firm.platform)?.name || null
        : null;
      const updated = [];
      for (const acc of candidates.filter((a) => picked.has(a.id))) {
        const patch = brokerName ? { firm_id: firm.id, broker: brokerName } : { firm_id: firm.id };
        await updateTradingAccount(acc.id, patch);
        updated.push({ ...acc, ...patch });
      }
      onAttached?.({ updated });
      onClose?.();
    } catch (e) {
      setError(firmErrorLabel(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={t("firms.attachTitle")}
      subtitle={t("firms.attachSub").replace("{name}", firm.name || "")}
      width={520}
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>{t("common.cancel")}</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy || picked.size === 0}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Link2 size={13} strokeWidth={2} />
              {busy
                ? t("common.saving")
                : picked.size === 1
                  ? t("firms.attachOneCta")
                  : t("firms.attachNCta").replace("{n}", String(picked.size || 0))}
            </span>
          </PrimaryBtn>
        </>
      }
    >
      <ErrorLine>{error}</ErrorLine>

      {candidates.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textMut, lineHeight: 1.6 }}>{t("firms.attachNone")}</div>
      ) : (
        <>
          {/* La recherche n'apparaît que quand la liste cesse d'être lisible d'un
              coup d'œil — même seuil que les autres sélecteurs de l'app. */}
          {candidates.length > 6 && (
            <TextInput value={query} onChange={setQuery} placeholder={t("firms.attachSearch")} autoFocus />
          )}

          <Field label={`${t("firms.accountsTitle")} (${picked.size}/${candidates.length})`} hint={t("firms.attachHint")}>
            {shown.length === 0 ? (
              <div style={{ fontSize: 12, color: T.textMut }}>{t("firms.attachNoMatch")}</div>
            ) : (
              /* Une seule surface encadrée, des lignes séparées par un filet —
                 la même présentation que la liste des comptes de la modale
                 firme, pour que les deux se lisent pareil. */
              <div
                className="scroll-thin"
                style={{
                  border: `1px solid ${T.border}`, borderRadius: "var(--radius-field)",
                  overflow: "hidden", background: T.white,
                  maxHeight: 280, overflowY: "auto",
                }}
              >
                {shown.map((acc, i) => {
                  const on = picked.has(acc.id);
                  const from = acc.firm_id ? firmNameOf(acc.firm_id) : "";
                  return (
                    /* La ligne ENTIÈRE est le bouton : pas de zone cliquable
                       contenant un autre bouton — cette imbrication déplace la
                       cible sous le curseur à l'appui et le clic se perd. */
                    <button
                      key={acc.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      data-no-press
                      onClick={() => toggle(acc.id)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 10px", minHeight: 44, textAlign: "left",
                        border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                        /* `backgroundColor`, pas le raccourci `background` : on ne
                           remplace qu'une couleur, et le raccourci réinitialise
                           tout le reste du fond au passage. */
                        backgroundColor: on ? T.accentBg : "transparent",
                        fontFamily: "inherit", cursor: "pointer",
                        transition: "background-color var(--dur-fast) var(--ease-out)",
                      }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.backgroundColor = T.rowHighlight; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = on ? T.accentBg : "transparent"; }}
                    >
                      <span aria-hidden style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        border: `1px solid ${on ? T.text : T.border2}`,
                        background: on ? T.text : T.white,
                        color: T.textInverted,
                      }}>
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      {/* Même pastille de type que partout ailleurs. */}
                      <span aria-hidden style={{
                        width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                        background: accountColor(acc),
                      }} />
                      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 500, color: T.text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {acc.name || acc.eval_account_size || t("accountsPage.account")}
                        </span>
                        <span style={{
                          fontSize: 11, color: T.textMut, whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {accountTypeSizeLabel(acc)}
                          {" · "}
                          {from ? t("firms.attachMoveFrom").replace("{name}", from) : t("firms.attachFree")}
                        </span>
                      </span>
                      {/* Un compte qui change de firme le dit sur sa ligne : la
                          flèche rend le déplacement lisible avant validation. */}
                      {on && from && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                          fontSize: 11, color: T.textSub, whiteSpace: "nowrap",
                        }}>
                          <ArrowRight size={11} strokeWidth={2} />
                          {firm.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>

          {movedCount > 0 && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 12px", borderRadius: "var(--radius-field)",
              border: `1px solid ${T.border}`, background: T.bg,
              fontSize: 12, color: T.textSub, lineHeight: 1.5,
            }}>
              <ArrowRight size={13} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{t("firms.attachMoveWarn").replace("{n}", String(movedCount))}</span>
            </div>
          )}
        </>
      )}
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

  /* Un compte rattaché à une firme suit OBLIGATOIREMENT la plateforme de sa
     firme : tous les comptes d'une même prop firm passent par le même broker.
     Le champ n'est donc plus modifiable tant qu'une firme est choisie, et la
     valeur est réalignée à chaque changement de firme (pas seulement quand elle
     est vide, sinon un compte gardait l'ancienne plateforme en changeant de
     firme). */
  const linkedFirm = firms.find((f) => f.id === firmId) || null;
  React.useEffect(() => {
    if (!linkedFirm) return;
    setPlatform(linkedFirm.platform || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, linkedFirm?.platform]);

  const isSized = type === "eval" || type === "funded";

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t("accountModal.err.nameRequired")); return; }
    setBusy(true);
    setError("");
    try {
      // Rattaché à une firme → la plateforme de la firme fait foi, quoi qu'il y
      // ait dans l'état local.
      const effectivePlatform = linkedFirm ? (linkedFirm.platform || "") : platform;
      const brokerName = effectivePlatform
        ? PLATFORMS.find((p) => p.id === effectivePlatform)?.name || null
        : null;
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
              // Logo de la firme (son nom), pas de sa plateforme d'exécution.
              iconUrl: firmLogo(f) || undefined,
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

      {/* Plateforme : héritée et verrouillée dès qu'une firme est choisie —
          tous les comptes d'une prop firm partagent le même broker. Elle reste
          affichée (pas masquée) pour que l'information soit lisible, avec la
          raison du verrou. */}
      <Field
        label={t("accountModal.platform")}
        hint={linkedFirm ? t("accountModal.platformLockedHint") : t("accountModal.platformHint")}
      >
        {linkedFirm ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 12px", minHeight: 40, borderRadius: "var(--radius-field)",
            border: `1px solid ${T.border}`, background: T.accentBg,
            fontSize: 13, color: T.textSub,
          }}>
            {/* Ce champ parle de la plateforme d'EXÉCUTION : son icône est celle
                de la plateforme, pas celle de la firme — sans plateforme
                réglée, aucune icône plutôt que le logo de la firme. */}
            {resolvePlatformIcon(linkedFirm.platform) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvePlatformIcon(linkedFirm.platform)}
                alt=""
                width={16}
                height={16}
                style={{ borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
              />
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {linkedFirm.platform
                ? PLATFORMS.find((p) => p.id === linkedFirm.platform)?.name || linkedFirm.platform
                : t("firms.noPlatform")}
            </span>
            <Lock size={13} strokeWidth={1.75} style={{ marginLeft: "auto", flexShrink: 0, color: T.textMut }} />
          </div>
        ) : (
          <SearchableSelect
            value={platform}
            onChange={setPlatform}
            options={[{ id: "", label: t("firms.noPlatform") }, ...platformOptions]}
            searchPlaceholder={t("firms.searchPlatform")}
            placeholder={t("firms.noPlatform")}
          />
        )}
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
