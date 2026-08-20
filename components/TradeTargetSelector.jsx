"use client";

/**
 * TradeTargetSelector — premier niveau du choix de destination d'un import.
 *
 * Liste PLATE, volontairement : une entrée par prop firm (le « compte mère »)
 * et une entrée par compte hors firme, mêlées dans le même ordre alphabétique
 * — rien ne distingue visuellement les deux, elles se choisissent pareil. Les
 * sous-comptes d'une firme n'apparaissent pas ici : on les choisit ensuite dans
 * le bloc « Type de compte », une fois la firme sélectionnée.
 *
 * Sélection unique : on importe un relevé pour une firme OU pour un compte
 * isolé, pas pour un mélange des deux.
 *
 * Ne crée ni ne modifie aucun compte — cf. la page Comptes pour ça.
 */

import React from "react";
import { ChevronDown, ChevronUp, Search, Check, Wallet } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import Popover from "@/components/ui/Popover";
import { t, useLang } from "@/lib/i18n";
import { firmLogo, accountLogo } from "@/lib/accountBrand";

/* Une entrée de la liste : firme (avec son nombre de comptes) ou compte isolé. */
function OptionRow({ opt, active, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(opt)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", border: "none", borderRadius: 6,
        background: active ? "var(--color-active-bg)" : "transparent",
        color: "var(--color-text)", fontSize:13, fontWeight: 500,
        fontFamily: "inherit", textAlign: "left", cursor: "pointer", minWidth: 0,
        transition: "background 100ms ease",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {/* Même icône de repli pour tous : rien ne distingue visuellement une
          firme d'un compte isolé dans la liste. */}
      {opt.icon ? (
        <img src={opt.icon} alt="" style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0 }} />
      ) : (
        <Wallet size={14} strokeWidth={1.75} color={T.textSub} style={{ flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {opt.label}
      </span>
      {opt.kind === "firm" && (
        <span style={{ fontSize: 11, color: T.textMut, flexShrink: 0 }}>
          {opt.count === 0
            ? t("firms.noAccountYet")
            : opt.count === 1 ? t("firms.oneAccount") : t("firms.nAccounts").replace("{n}", String(opt.count))}
        </span>
      )}
      {opt.sublabel && (
        <span style={{ fontSize: 11, color: T.textMut, flexShrink: 0 }}>{opt.sublabel}</span>
      )}
      {active && <Check size={14} color={T.text} style={{ flexShrink: 0 }} />}
    </button>
  );
}

export default function TradeTargetSelector({
  accounts = [],
  firms = [],
  /** `{ kind: "firm" | "account", id }` ou null. */
  value = null,
  onChange,
  /** Renvoie vers la page Comptes quand il n'y a rien à sélectionner. */
  onRequestManage,
}) {
  useLang();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef(null);

  // Clic extérieur : géré par le Popover, seul à connaître son panneau portalisé.
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => { if (!open) setQuery(""); }, [open]);

  /* Une seule liste, sans séparation entre prop firms et comptes isolés : les
     deux se choisissent de la même façon et se lisent dans le même ordre
     alphabétique. Une firme sans compte reste listée — on le signale plutôt
     que de la masquer. */
  const options = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const keep = (label) => !q || String(label).toLowerCase().includes(q);

    const firmEntries = (firms || []).map((firm) => ({
      kind: "firm",
      id: firm.id,
      label: firm.name || "Firme",
      count: (accounts || []).filter((a) => a.firm_id === firm.id).length,
      icon: firmLogo(firm),
    }));

    const firmIds = new Set((firms || []).map((f) => f.id));
    const looseEntries = (accounts || [])
      .filter((a) => !a.firm_id || !firmIds.has(a.firm_id))
      .map((acc) => ({
        kind: "account",
        id: acc.id,
        label: acc.name || "Compte",
        sublabel: acc.eval_account_size || null,
        /* Ces comptes-là n'ont pas de firme (la liste ne garde que ceux-là) :
           leur seul rattachement est leur broker. */
        icon: accountLogo(acc, firms),
      }));

    return [...firmEntries, ...looseEntries]
      .filter((o) => keep(o.label))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [accounts, firms, query]);

  const selectedOption = React.useMemo(() => {
    if (!value) return null;
    if (value.kind === "firm") {
      const firm = (firms || []).find((f) => f.id === value.id);
      if (!firm) return null;
      return {
        kind: "firm",
        label: firm.name || "Firme",
        count: (accounts || []).filter((a) => a.firm_id === firm.id).length,
        icon: firmLogo(firm),
      };
    }
    const acc = (accounts || []).find((a) => a.id === value.id);
    if (!acc) return null;
    return { kind: "account", label: acc.name || "Compte", icon: accountLogo(acc, firms) };
  }, [value, accounts, firms]);

  const isEmpty = options.length === 0;
  const nothingAtAll = (accounts || []).length === 0 && (firms || []).length === 0;

  const pick = (opt) => {
    onChange?.({ kind: opt.kind, id: opt.id });
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative", fontFamily: "var(--font-sans)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderRadius: "var(--radius-card)",
          border: `1px solid ${open ? "var(--color-border-strong)" : "var(--color-border)"}`,
          background: "var(--color-card-bg, #FFFFFF)",
          color: selectedOption ? "var(--color-text)" : "var(--color-text-muted)",
          fontSize:13, fontWeight: 500, fontFamily: "inherit", textAlign: "left",
          cursor: "pointer", transition: "border-color 120ms ease",
        }}
      >
        {selectedOption?.icon && (
          <img src={selectedOption.icon} alt=""
            style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0 }} />
        )}
        {selectedOption && !selectedOption.icon && (
          <Wallet size={14} strokeWidth={1.75} color={T.textSub} style={{ flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedOption ? selectedOption.label : t("addTrade.target.placeholder")}
        </span>
        {open ? <ChevronUp size={14} color={T.textMut} /> : <ChevronDown size={14} color={T.textMut} />}
      </button>

      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        gap={4}
        matchAnchorWidth
        scroll={false}
        maxHeight={340}
        style={{
          background: "var(--color-card-bg, #FFFFFF)", border: "none", borderRadius: 10,
          boxShadow: "var(--elev-overlay)",
        }}
      >
        <>
          <div style={{ flexShrink: 0, padding: 8, borderBottom: "1px solid var(--color-border)", background: "var(--color-hover-bg, #FAFAFA)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
              <Search size={13} color={T.textMut} />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("accounts.searchOnlyPlaceholder")}
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  fontSize: 13, padding: "6px 0", color: T.text, fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          <div className="scroll-thin" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", maxHeight: 300, padding: 4 }}>
            {nothingAtAll && (
              <button
                type="button"
                onClick={() => { setOpen(false); onRequestManage?.(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8, padding: 10,
                  border: "none", background: "transparent", color: T.text, fontSize: 13,
                  fontFamily: "inherit", textAlign: "left", cursor: "pointer", borderRadius: 6,
                }}
              >
                <Wallet size={14} strokeWidth={1.75} /> {t("accounts.goToCreate")}
              </button>
            )}

            {!nothingAtAll && isEmpty && (
              <div style={{ padding: "12px 14px", fontSize: 12, color: T.textMut, textAlign: "center" }}>
                {t("accounts.noAccount")}
              </div>
            )}

            {options.map((opt) => (
              <OptionRow
                key={`${opt.kind}:${opt.id}`}
                opt={opt}
                onPick={pick}
                active={!!value && value.kind === opt.kind && value.id === opt.id}
              />
            ))}
          </div>
        </>
      </Popover>
    </div>
  );
}
