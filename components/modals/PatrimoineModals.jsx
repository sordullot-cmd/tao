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
import { Loader2, Star } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { ModalShell, Field, TextInput, PrimaryBtn, GhostBtn } from "@/components/modals/AccountModals";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ComboInput from "@/components/ui/ComboInput";
import { bankLogo } from "@/lib/bank/bankLogos";
import { institutionLogo, useBankInstitutions } from "@/lib/bank/useBankInstitutions";
import { ASSET_TYPES, assetTypeKey, newAssetId, usePatrimoine } from "@/lib/patrimoine";
import { useFavoriteBanks } from "@/lib/bank/useFavoriteBanks";
import { startBankConnection } from "@/lib/bank/startConnection";

const EMPTY_FORM = { name: "", type: "pea", balance: "", institution: "" };

/**
 * @param {object=}   props.asset     Actif à modifier ; absent = création.
 * @param {string=}   props.defaultType  Type pré-sélectionné à la création.
 * @param {Function=} props.onSaved   Reçoit l'identifiant de l'actif écrit.
 */
export function AssetFormModal({ asset = null, defaultType, onClose, onSaved }) {
  useLang();
  const [, setStore] = usePatrimoine();
  /* Même catalogue que la connexion bancaire — d'où le logo. Le champ reste
     LIBRE : la liste des banques d'un pays ne contient ni le courtier, ni
     l'organisme d'un crédit auto, ni la personne qui a prêté l'apport. */
  const { institutions, loading: loadingBanks } = useBankInstitutions();
  const { isFavorite } = useFavoriteBanks();
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

  /* Favoris en tête, puis alphabétique : même ordre que le sélecteur de la
     connexion bancaire, pour que « sa » banque se trouve au même endroit dans
     les deux formulaires. */
  const bankOptions = React.useMemo(
    () =>
      [...institutions]
        .sort((a, b) => {
          const fa = isFavorite(a.id), fb = isFavorite(b.id);
          if (fa !== fb) return fa ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map((inst) => ({ id: inst.id, label: inst.name, iconUrl: bankLogo(inst.name, inst.logo) })),
    [institutions, isFavorite],
  );

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

    /* Le logo suit le NOM saisi, qu'il ait été cliqué dans la liste ou tapé.
       Le repli conserve celui déjà enregistré quand l'établissement n'a pas
       changé : sans lui, modifier le montant d'un crédit alors que le catalogue
       est momentanément injoignable ferait disparaître son logo. */
    const sameInstitution = isEdit && (asset.institution || "") === (institution || "");
    const logo = institutionLogo(institutions, institution) || (sameInstitution ? asset.logo ?? null : null);

    setStore((s) => {
      const list = Array.isArray(s.assets) ? s.assets : [];
      if (!isEdit) {
        return {
          ...s,
          assets: [...list, { id, name, type: form.type, balance, institution, logo, updatedAt, holdings: [] }],
        };
      }
      return {
        ...s,
        assets: list.map((a) => (a.id === id ? { ...a, name, type: form.type, balance, institution, logo, updatedAt } : a)),
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

      <Field
        label={t("patrimoine.assets.fieldInstitution")}
        hint={bankOptions.length > 0 ? t("patrimoine.assets.institutionHint") : undefined}
      >
        <ComboInput
          value={form.institution}
          onChange={(v) => setForm({ ...form, institution: v })}
          options={bankOptions}
          loading={loadingBanks}
          placeholder={t("patrimoine.assets.phInstitution")}
          ariaLabel={t("patrimoine.assets.fieldInstitution")}
          emptyLabel={t("patrimoine.assets.institutionFree")}
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
  /* Le catalogue vient du cache partagé (`useBankInstitutions`) : le même que
     celui du champ « établissement » d'un actif. Ouvrir la modale ne relance
     donc pas l'appel réseau à chaque fois. */
  const { institutions, loading, error: loadError } = useBankInstitutions();
  const [selected, setSelected] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);
  const [connectError, setConnectError] = React.useState(null);
  const { isFavorite, toggle: toggleFavorite } = useFavoriteBanks();

  const connect = async () => {
    if (!selected) return;
    setConnectError(null);
    setConnecting(true);
    try {
      // Rend la main uniquement en cas d'échec : sinon la page entière est quittée.
      await startBankConnection(selected);
    } catch (err) {
      setConnecting(false);
      setConnectError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

  /* Options du sélecteur : favoris en tête, puis alphabétique. Même parti pris
     que les courtiers favoris du formulaire d'import (AddTradePage) — l'étoile
     est un `role="button"` et non un `<button>`, car la ligne de l'option EST
     déjà un bouton et l'imbrication est invalide. */
  const options = (() => {
    const sorted = [...institutions].sort((a, b) => {
      const fa = isFavorite(a.id), fb = isFavorite(b.id);
      if (fa !== fb) return fa ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted.map((inst) => {
      const fav = isFavorite(inst.id);
      const label = fav ? t("patrimoine.bank.removeFav") : t("patrimoine.bank.addFav");
      return {
        id: inst.id,
        label: inst.name,
        iconUrl: bankLogo(inst.name, inst.logo) || undefined,
        accessory: (
          <span
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={fav}
            title={label}
            onClick={() => toggleFavorite(inst)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFavorite(inst); }
            }}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 22, height: 22, borderRadius: 4,
              background: "transparent", cursor: "pointer", padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Star
              size={13}
              strokeWidth={1.75}
              color={fav ? T.amber : T.textMut}
              fill={fav ? T.amber : "none"}
            />
          </span>
        ),
      };
    });
  })();

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

      <Field label={t("patrimoine.bank.chooseBank")} hint={t("patrimoine.bank.favHint")}>
        <SearchableSelect
          value={selected}
          onChange={setSelected}
          options={options}
          placeholder={loading ? t("patrimoine.bank.loadingBanks") : t("patrimoine.bank.select")}
          searchPlaceholder={t("patrimoine.bank.select")}
          searchable
        />
      </Field>
    </ModalShell>
  );
}
