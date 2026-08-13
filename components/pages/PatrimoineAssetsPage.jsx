"use client";

/**
 * Actifs — saisie et tenue à jour du patrimoine.
 *
 * Portée de `app/assets/page.tsx` de l'app patrimoine. L'original combinait
 * deux sources : un CRUD d'actifs saisis à la main, et l'import de relevés PDF
 * (Livret A Société Générale, PEA Boursorama) qui lisait la valeur du compte
 * dans le fichier. tr4de n'a pas de route serveur pour lire un PDF ni de
 * parseur de relevés : seule la saisie manuelle est portée, et c'est dit dans
 * l'aide de la page plutôt que laissé deviner.
 *
 * Un actif de type « crédit » se saisit en positif (le capital restant dû) et
 * se stocke en négatif : c'est ainsi qu'il pèse sur le patrimoine net, et
 * l'utilisateur n'a jamais à taper un signe moins.
 */

import React from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { CARD, SectionTitle } from "@/components/ui/da";
import { fmt } from "@/lib/ui/format";
import { getCurrencySymbol } from "@/lib/userPrefs";
import {
  ASSET_TYPES,
  assetTypeKey,
  assetValue,
  classOfType,
  isPortfolio,
  newAssetId,
  usePatrimoine,
} from "@/lib/patrimoine";

const FIELD = {
  height: 40,
  borderRadius: "var(--radius-field)",
  border: `1px solid ${T.border}`,
  background: T.white,
  color: T.text,
  fontSize: 14,
  fontFamily: "inherit",
  padding: "0 10px",
  minWidth: 0,
  width: "100%",
};

const EMPTY_FORM = { name: "", type: "pea", balance: "", institution: "" };

/** « 12 août 2026 » — même granularité que le « maj … » de l'original. */
function formatUpdatedAt(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function Field({ label, htmlFor, children, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 13, color: T.textSub }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 12, color: T.textMut }}>{hint}</span>}
    </div>
  );
}

export default function PatrimoineAssetsPage({ setPage, setSelectedAssetId }) {
  useLang();
  const [store, setStore] = usePatrimoine();
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [editingId, setEditingId] = React.useState(null);
  const [confirmingId, setConfirmingId] = React.useState(null);
  const [error, setError] = React.useState(null);
  const formRef = React.useRef(null);

  const assets = store.assets;
  const editing = editingId !== null;
  const isLoan = form.type === "loan";

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
  };

  const submit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return setError(t("patrimoine.assets.errName"));
    const raw = Number(String(form.balance).replace(",", "."));
    if (!Number.isFinite(raw)) return setError(t("patrimoine.assets.errAmount"));
    setError(null);

    /* Un crédit se saisit en positif et se range en négatif. La valeur absolue
       est prise dans les deux sens : sur un actif ordinaire, un signe moins
       tapé par erreur en ferait un passif silencieux. */
    const balance = isLoan ? -Math.abs(raw) : Math.abs(raw);
    const institution = form.institution.trim() || null;
    const updatedAt = new Date().toISOString();

    setStore((s) => {
      const list = Array.isArray(s.assets) ? s.assets : [];
      if (editingId === null) {
        return {
          ...s,
          assets: [
            ...list,
            { id: newAssetId(), name, type: form.type, balance, institution, updatedAt, holdings: [] },
          ],
        };
      }
      return {
        ...s,
        assets: list.map((a) =>
          a.id === editingId ? { ...a, name, type: form.type, balance, institution, updatedAt } : a,
        ),
      };
    });
    resetForm();
  };

  const startEdit = (asset) => {
    setEditingId(asset.id);
    setConfirmingId(null);
    setError(null);
    setForm({
      name: asset.name,
      type: asset.type,
      balance: String(Math.abs(asset.balance || 0)),
      institution: asset.institution || "",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const remove = (id) => {
    setConfirmingId(null);
    if (editingId === id) resetForm();
    setStore((s) => ({ ...s, assets: (s.assets || []).filter((a) => a.id !== id) }));
  };

  const openAsset = (id) => {
    setSelectedAssetId?.(id);
    setPage?.("patrimoine-asset");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionTitle>{t("patrimoine.assets.title")}</SectionTitle>
          <div style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub, maxWidth: 620 }}>
            {t("patrimoine.assets.subtitle")}
          </div>
        </div>

        {/* Formulaire — le même sert à ajouter et à modifier, comme dans
            l'original : l'édition remplit les champs et le bouton change de
            verbe, plutôt qu'un second formulaire en double. */}
        <form
          ref={formRef}
          onSubmit={submit}
          style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label={t("patrimoine.assets.fieldName")} htmlFor="pa-name">
              <input
                id="pa-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={isLoan ? t("patrimoine.assets.phLoan") : t("patrimoine.assets.phName")}
                style={FIELD}
              />
            </Field>
            <Field label={t("patrimoine.assets.fieldInstitution")} htmlFor="pa-institution">
              <input
                id="pa-institution"
                type="text"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
                placeholder={t("patrimoine.assets.phInstitution")}
                style={FIELD}
              />
            </Field>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Field label={t("patrimoine.assets.fieldType")} htmlFor="pa-type">
              <select
                id="pa-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={FIELD}
              >
                {ASSET_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(assetTypeKey(ty))}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={isLoan ? t("patrimoine.assets.fieldOutstanding") : t("patrimoine.assets.fieldValue")}
              htmlFor="pa-balance"
              hint={isLoan ? t("patrimoine.assets.loanHint") : undefined}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  id="pa-balance"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  placeholder={isLoan ? "150000" : "12500"}
                  style={FIELD}
                />
                <span style={{ fontSize: 13, color: T.textSub }}>{getCurrencySymbol()}</span>
              </span>
            </Field>
          </div>

          {error && (
            <div role="alert" style={{ fontSize: 13, color: T.pnlNeg }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="submit"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40,
                padding: "0 16px", borderRadius: 999, border: "none",
                background: T.accentBg, color: T.text, fontSize: 14, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {editing ? <Check size={15} strokeWidth={1.75} /> : <Plus size={15} strokeWidth={1.75} />}
              {editing ? t("common.save") : t("patrimoine.assets.add")}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                style={{
                  minHeight: 40, padding: "0 14px", borderRadius: 999, border: "none",
                  background: "transparent", color: T.textSub, fontSize: 14, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
        </form>

        {/* Liste */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionTitle size="sm">{t("patrimoine.assets.listTitle")}</SectionTitle>
          <section style={{ ...CARD, padding: 0 }}>
            {assets.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 14, color: T.textSub }}>
                {t("patrimoine.assets.empty")}
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {assets.map((a, i) => {
                  const cls = classOfType(a.type);
                  const value = assetValue(a);
                  const updated = formatUpdatedAt(a.updatedAt);
                  const confirming = confirmingId === a.id;
                  const holdings = a.holdings?.length || 0;
                  return (
                    <li
                      key={a.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 20px",
                        borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                          background: cls.chip.bg, color: cls.chip.text,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 600,
                        }}
                      >
                        {(a.name || "?").slice(0, 2).toUpperCase()}
                      </span>

                      <button
                        type="button"
                        onClick={() => openAsset(a.id)}
                        style={{
                          flex: 1, minWidth: 0, textAlign: "left", border: "none",
                          background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: 0,
                        }}
                      >
                        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.name}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t(assetTypeKey(a.type))}
                          {a.institution ? ` · ${a.institution}` : ""}
                          {isPortfolio(a.type) && holdings > 0
                            ? ` · ${t("patrimoine.assets.holdingsCount").replace("{n}", String(holdings))}`
                            : ""}
                          {updated ? ` · ${t("patrimoine.updatedAt").replace("{date}", updated)}` : ""}
                        </span>
                      </button>

                      <span style={{
                        fontSize: 14, fontWeight: 600, flexShrink: 0,
                        fontVariantNumeric: "tabular-nums",
                        color: value < 0 ? T.pnlNeg : T.text,
                      }}>
                        {fmt(value)}
                      </span>

                      {/* La suppression demande confirmation SUR PLACE : un actif
                          supprimé emporte ses lignes de titres, et il n'y a pas
                          d'annulation. Le bouton reprend sa forme au blur. */}
                      {confirming ? (
                        <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                          <IconButton
                            danger
                            label={t("patrimoine.assets.confirmDelete")}
                            onClick={() => remove(a.id)}
                            onBlur={() => setConfirmingId(null)}
                          >
                            <Check size={15} strokeWidth={2} />
                          </IconButton>
                          <IconButton label={t("common.cancel")} onClick={() => setConfirmingId(null)}>
                            <X size={15} strokeWidth={2} />
                          </IconButton>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                          <IconButton
                            label={t("patrimoine.assets.editAria").replace("{name}", a.name)}
                            onClick={() => startEdit(a)}
                          >
                            <Pencil size={15} strokeWidth={1.75} />
                          </IconButton>
                          <IconButton
                            danger
                            label={t("patrimoine.assets.deleteAria").replace("{name}", a.name)}
                            onClick={() => setConfirmingId(a.id)}
                          >
                            <Trash2 size={15} strokeWidth={1.75} />
                          </IconButton>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Bouton icône rond de la ligne d'actif (modifier, supprimer, confirmer). */
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
        width: 36, height: 36, borderRadius: 999, border: "none",
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
