"use client";

/**
 * Modales du patrimoine.
 *
 *  - AssetFormModal : saisit ou modifie un actif. Le formulaire vivait dans la
 *    page « Actifs », qui n'existait que pour lui : il est désormais appelé
 *    depuis les pages qui montrent les actifs (synthèse, classe, crédits) et
 *    depuis la fiche d'un actif pour la modification.
 *  - BankFormModal : choisit une banque à connecter (DSP2). Même raison : le
 *    sélecteur occupait un bloc entier de la page Banque, alors qu'on ne
 *    connecte une banque qu'une fois.
 *
 * Les deux réutilisent la coquille des modales de compte (`ModalShell`), pour
 * que toutes les modales du site aient la même géométrie et le même pied.
 */

import React from "react";
import { Loader2 } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { ModalShell, Field, TextInput, PrimaryBtn, GhostBtn } from "@/components/modals/AccountModals";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { ASSET_TYPES, assetTypeKey, newAssetId, usePatrimoine } from "@/lib/patrimoine";

const EMPTY_FORM = { name: "", type: "pea", balance: "", institution: "" };

/**
 * @param {object=}   props.asset     Actif à modifier ; absent = création.
 * @param {string=}   props.defaultType  Type pré-sélectionné à la création.
 * @param {Function=} props.onSaved   Reçoit l'identifiant de l'actif écrit.
 */
export function AssetFormModal({ asset = null, defaultType, onClose, onSaved }) {
  useLang();
  const [, setStore] = usePatrimoine();
  const isEdit = !!asset;
  const [form, setForm] = React.useState(() =>
    asset
      ? {
          name: asset.name || "",
          type: asset.type || "pea",
          // Un crédit se saisit en positif : le signe est une convention de
          // stockage, pas quelque chose à taper.
          balance: String(Math.abs(asset.balance || 0)),
          institution: asset.institution || "",
        }
      : { ...EMPTY_FORM, ...(defaultType ? { type: defaultType } : null) },
  );
  const [error, setError] = React.useState(null);

  const isLoan = form.type === "loan";

  const submit = () => {
    const name = form.name.trim();
    if (!name) return setError(t("patrimoine.assets.errName"));
    const raw = Number(String(form.balance).replace(",", "."));
    if (!Number.isFinite(raw)) return setError(t("patrimoine.assets.errAmount"));
    setError(null);

    /* Un crédit se range en négatif. La valeur absolue est prise dans les deux
       sens : sur un actif ordinaire, un signe moins tapé par erreur en ferait
       un passif silencieux. */
    const balance = isLoan ? -Math.abs(raw) : Math.abs(raw);
    const institution = form.institution.trim() || null;
    const updatedAt = new Date().toISOString();
    const id = asset?.id || newAssetId();

    setStore((s) => {
      const list = Array.isArray(s.assets) ? s.assets : [];
      if (!isEdit) {
        return {
          ...s,
          assets: [...list, { id, name, type: form.type, balance, institution, updatedAt, holdings: [] }],
        };
      }
      return {
        ...s,
        assets: list.map((a) => (a.id === id ? { ...a, name, type: form.type, balance, institution, updatedAt } : a)),
      };
    });
    onSaved?.(id);
    onClose?.();
  };

  return (
    <ModalShell
      title={isEdit ? t("patrimoine.assets.editTitle") : t("patrimoine.assets.add")}
      subtitle={t("patrimoine.assets.modalSub")}
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>{t("common.cancel")}</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={!form.name.trim()}>
            {isEdit ? t("common.save") : t("patrimoine.assets.add")}
          </PrimaryBtn>
        </>
      }
    >
      {error && (
        <div role="alert" style={{ fontSize: 12, color: T.red, lineHeight: 1.5 }}>{error}</div>
      )}

      <Field label={t("patrimoine.assets.fieldName")}>
        <TextInput
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder={isLoan ? t("patrimoine.assets.phLoan") : t("patrimoine.assets.phName")}
          autoFocus
        />
      </Field>

      <Field label={t("patrimoine.assets.fieldInstitution")}>
        <TextInput
          value={form.institution}
          onChange={(v) => setForm({ ...form, institution: v })}
          placeholder={t("patrimoine.assets.phInstitution")}
        />
      </Field>

      <Field label={t("patrimoine.assets.fieldType")}>
        <SearchableSelect
          value={form.type}
          onChange={(v) => setForm({ ...form, type: v })}
          options={ASSET_TYPES.map((ty) => ({ id: ty, label: t(assetTypeKey(ty)) }))}
          searchable={ASSET_TYPES.length > 6}
        />
      </Field>

      <Field
        label={isLoan ? t("patrimoine.assets.fieldOutstanding") : t("patrimoine.assets.fieldValue")}
        hint={isLoan ? t("patrimoine.assets.loanHint") : undefined}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TextInput
            type="number"
            inputMode="decimal"
            min={0}
            value={form.balance}
            onChange={(v) => setForm({ ...form, balance: v })}
            placeholder={isLoan ? "150000" : "12500"}
          />
          <span style={{ fontSize: 13, color: T.textSub, flexShrink: 0 }}>{getCurrencySymbol()}</span>
        </span>
      </Field>
    </ModalShell>
  );
}

/**
 * Connexion d'une banque : on choisit l'établissement, la suite se passe chez
 * lui (redirection DSP2), donc la modale ne se referme pas — la page entière
 * est quittée.
 */
export function BankFormModal({ onClose }) {
  useLang();
  const [institutions, setInstitutions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);
  const [selected, setSelected] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);
  const [connectError, setConnectError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/bank/institutions");
        const data = await resp.json();
        if (cancelled) return;
        setInstitutions(Array.isArray(data.institutions) ? data.institutions : []);
        setLoadError(data.error || null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Erreur réseau");
      } finally {
        if (!cancelled) setLoading(false);
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
      window.location.href = data.link;
    } catch (err) {
      setConnecting(false);
      setConnectError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

  return (
    <ModalShell
      title={t("patrimoine.bank.addBank")}
      subtitle={t("patrimoine.bank.readOnlyNotice")}
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>{t("common.cancel")}</GhostBtn>
          <PrimaryBtn onClick={connect} disabled={!selected || connecting}>
            {connecting && <Loader2 size={14} strokeWidth={1.75} className="anim-spin" />}
            {connecting ? t("patrimoine.bank.redirecting") : t("patrimoine.bank.connect")}
          </PrimaryBtn>
        </>
      }
    >
      {(loadError || connectError) && (
        <div role="alert" style={{ fontSize: 12, color: T.red, lineHeight: 1.5 }}>
          {loadError || connectError}
        </div>
      )}

      <Field label={t("patrimoine.bank.chooseBank")}>
        <SearchableSelect
          value={selected}
          onChange={setSelected}
          options={institutions.map((inst) => ({ id: inst.id, label: inst.name }))}
          placeholder={loading ? t("patrimoine.bank.loadingBanks") : t("patrimoine.bank.select")}
          searchPlaceholder={t("patrimoine.bank.select")}
          searchable
        />
      </Field>
    </ModalShell>
  );
}
