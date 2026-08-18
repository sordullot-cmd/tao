import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { ChevronDown, ChevronUp, Search, Check, Plus, Pencil, Trash2, X } from "lucide-react";
import Popover from "@/components/ui/Popover";
import { FIELD_BG } from "@/lib/ui/tokens";
import { FIELD_FOCUS_RING } from "@/components/ui/form";
import { t, useLang } from "@/lib/i18n";

// Map id (lowercase) → chemin du logo. Utilisé pour afficher l'icône à gauche
// du compte dans le dropdown.
const BROKER_ICONS = {
  tradovate: "/trado.png",
  mt5: "/MetaTrader_5.png",
  "metatrader 5": "/MetaTrader_5.png",
  wealthcharts: "/weal.webp",
  rithmic: "/brokers/rithmic.png",
  "rithmic r|trader": "/brokers/rithmic.png",
  ninjatrader: "/brokers/ninja%20trader.png",
  topstep: "/brokers/Topstep_Logo.jpg",
  "topstep x": "/brokers/Topstep_Logo.jpg",
  apex: "/brokers/apex.avif",
  "apex trader funding": "/brokers/apex.avif",
  alphafutures: "/brokers/alpha%20futur.svg",
  "alpha futures": "/brokers/alpha%20futur.svg",
  tradeify: "/brokers/Tradeify.png",
  lucid: "/brokers/lucid.png",
  "lucid trading": "/brokers/lucid.png",
  ftmo: "/brokers/ftmo.png",
  tradingview: "/brokers/tradingview.webp",
  mt4: "/brokers/MetaTrader_4.png",
  "metatrader 4": "/brokers/MetaTrader_4.png",
  thinkorswim: "/brokers/thinkorswim.png",
  ibkr: "/brokers/Interactive%20broker.png",
  "interactive brokers": "/brokers/Interactive%20broker.png",
  capitalcom: "/brokers/capital.png",
  "capital.com": "/brokers/capital.png",
  ig: "/brokers/ig%20logo.png",
  webull: "/brokers/webull.png",
};

export default function QuickAccountSelector({
  selectedAccountName,
  onAccountNameChange,
  multi = false,
  selectedAccountNames = [],
  onAccountNamesChange = () => {},
  // Si fourni, le parent est la source de vérité (mise à jour optimiste instantanée).
  // Sinon, le composant charge lui-même les comptes depuis Supabase.
  accounts: accountsProp = null,
  // Active le bouton de suppression de compte dans le dropdown.
  allowDelete = false,
  // Sélection seule : masque la création à la volée, le renommage et la
  // suppression. Utilisé par la page Ajouter un trade, où la gestion des
  // comptes est déportée vers la page Comptes / la page détail d'une firme.
  selectionOnly = false,
  // Appelé quand l'utilisateur cherche un compte inexistant en mode
  // sélection seule (renvoie vers l'écran de création).
  onRequestCreate = null,
  // Callback appelé après suppression (id du compte) — permet au parent de
  // resynchroniser sa propre liste de comptes en mode piloté par prop.
  onAccountDeleted = null,
  T = {},
}) {
  useLang();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  // Compte en attente de confirmation de suppression (confirmation inline,
  // fiable partout — window.confirm peut être bloqué en PWA / standalone).
  const [confirmingId, setConfirmingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const supabase = createClient();
  const containerRef = useRef(null);

  const loadAccounts = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from("trading_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) { console.error("Error loading accounts:", error); setAccounts([]); return; }
      setAccounts(data || []);
    } catch (err) { console.error(err); setAccounts([]); }
  };
  useEffect(() => {
    // Mode piloté par le parent : on reflète le prop directement (instantané),
    // pas de chargement DB ni d'écoute d'événement.
    if (accountsProp != null) {
      setAccounts(accountsProp);
      return;
    }
    loadAccounts();
    // Réagit aux mises à jour de comptes (ex: changement de broker dans AddTradePage)
    const onAccountsChanged = () => loadAccounts();
    window.addEventListener("tr4de:accounts-changed", onAccountsChanged);
    return () => window.removeEventListener("tr4de:accounts-changed", onAccountsChanged);
  }, [user?.id, accountsProp]);

  // Réinitialise les états transitoires quand le dropdown se ferme.
  useEffect(() => {
    if (!open) { setConfirmingId(null); setEditingId(null); }
  }, [open]);

  // Click outside — délégué au Popover : la liste est portalisée hors de
  // `containerRef`, qui ne peut donc plus servir de test de descendance.
  const closeMenu = React.useCallback(() => {
    setOpen(false);
    setEditingId(null);
    setConfirmingId(null);
  }, []);

  const resolveBrokerIcon = (broker) => {
    if (!broker) return null;
    const key = String(broker).toLowerCase().trim();
    if (BROKER_ICONS[key]) return BROKER_ICONS[key];
    // Heuristiques de fallback
    if (key.includes("trado"))   return BROKER_ICONS.tradovate;
    if (key.includes("mt5"))     return BROKER_ICONS.mt5;
    if (key.includes("mt4"))     return BROKER_ICONS.mt4;
    if (key.includes("meta"))    return BROKER_ICONS.mt5;
    if (key.includes("wealth"))  return BROKER_ICONS.wealthcharts;
    if (key.includes("rithmic")) return BROKER_ICONS.rithmic;
    if (key.includes("ninja"))   return BROKER_ICONS.ninjatrader;
    if (key.includes("topstep")) return BROKER_ICONS.topstep;
    if (key.includes("apex"))    return BROKER_ICONS.apex;
    if (key.includes("alpha"))   return BROKER_ICONS.alphafutures;
    if (key.includes("tradeify")) return BROKER_ICONS.tradeify;
    if (key.includes("lucid"))   return BROKER_ICONS.lucid;
    if (key.includes("ftmo"))    return BROKER_ICONS.ftmo;
    if (key.includes("trading view") || key.includes("tradingview")) return BROKER_ICONS.tradingview;
    if (key.includes("think"))   return BROKER_ICONS.thinkorswim;
    if (key.includes("interactive") || key === "ibkr") return BROKER_ICONS.ibkr;
    if (key.includes("capital")) return BROKER_ICONS.capitalcom;
    if (key === "ig" || key.startsWith("ig "))  return BROKER_ICONS.ig;
    if (key.includes("webull"))  return BROKER_ICONS.webull;
    return null;
  };

  const filtered = query
    ? accounts.filter(a => (a.name || "").toLowerCase().includes(query.toLowerCase()))
    : accounts;

  const queryTrim = query.trim();
  const exactMatch = accounts.some(a => (a.name || "").toLowerCase() === queryTrim.toLowerCase());
  const showCreate = !selectionOnly && queryTrim.length > 0 && !exactMatch;
  // En sélection seule, un nom inconnu ne crée rien : on propose d'aller à
  // l'écran de gestion des comptes.
  const showGoToCreate = selectionOnly && !!onRequestCreate && (queryTrim.length > 0 ? !exactMatch : accounts.length === 0);

  const selected = accounts.find(a => a.name === selectedAccountName);

  const isSelectedMulti = (name) => selectedAccountNames.includes(name);

  const toggleMulti = (name) => {
    if (!onAccountNamesChange) return;
    const next = isSelectedMulti(name)
      ? selectedAccountNames.filter((n) => n !== name)
      : [...selectedAccountNames, name];
    onAccountNamesChange(next);
  };

  const commitCreate = (e) => {
    if (!queryTrim) return;
    const additive = !!(e && (e.ctrlKey || e.metaKey));
    if (multi) {
      if (additive) {
        if (!isSelectedMulti(queryTrim) && onAccountNamesChange) {
          onAccountNamesChange([...selectedAccountNames, queryTrim]);
        }
        setQuery("");
        return;
      }
      if (onAccountNamesChange) onAccountNamesChange([queryTrim]);
      setOpen(false);
      setQuery("");
      return;
    }
    onAccountNameChange(queryTrim);
    setOpen(false);
    setQuery("");
  };

  const commitEdit = async (acc) => {
    const newName = editDraft.trim();
    if (!newName || newName === acc.name) { setEditingId(null); return; }
    try {
      const { error } = await supabase
        .from("trading_accounts")
        .update({ name: newName })
        .eq("id", acc.id)
        .eq("user_id", user?.id);
      if (error) { console.error("rename failed:", error.message); return; }
      // Si le compte renommé est le compte sélectionné, mettre à jour le nom sélectionné
      if (selectedAccountName === acc.name) onAccountNameChange(newName);
      if (multi && onAccountNamesChange && selectedAccountNames.includes(acc.name)) {
        onAccountNamesChange(selectedAccountNames.map(n => n === acc.name ? newName : n));
      }
      await loadAccounts();
    } catch (e) { console.error(e); }
    setEditingId(null);
  };

  // Supprime un compte + ses trades associés (irréversible). Nettoie la
  // sélection, met à jour l'état local et notifie les autres vues.
  // La confirmation est gérée en amont (UI inline), pas via window.confirm.
  const deleteAccount = async (acc) => {
    if (!acc?.id) return;
    setDeletingId(acc.id);
    try {
      const uid = user?.id;
      // Supprimer d'abord les trades liés au compte (sinon la contrainte de clé
      // étrangère empêche la suppression du compte).
      const { error: tradesError } = await supabase
        .from("apex_trades").delete().eq("account_id", acc.id).eq("user_id", uid);
      if (tradesError) {
        console.error("delete trades failed:", tradesError.message);
        if (typeof window !== "undefined") window.alert("Échec de la suppression des trades du compte : " + tradesError.message);
        return;
      }
      // Puis le compte
      const { error } = await supabase
        .from("trading_accounts")
        .delete()
        .eq("id", acc.id)
        .eq("user_id", uid);
      if (error) {
        console.error("delete account failed:", error.message);
        if (typeof window !== "undefined") window.alert("Échec de la suppression du compte : " + error.message);
        return;
      }

      // Retirer le compte de la sélection
      if (multi && onAccountNamesChange) {
        onAccountNamesChange(selectedAccountNames.filter(n => n !== acc.name));
      } else if (selectedAccountName === acc.name) {
        onAccountNameChange("");
      }
      // MAJ immédiate de la liste affichée
      setAccounts(prev => prev.filter(a => a.id !== acc.id));
      // Resync parent (mode piloté par prop) + autres vues
      if (onAccountDeleted) onAccountDeleted(acc.id);
      try { window.dispatchEvent(new CustomEvent("tr4de:accounts-changed")); } catch {}
      try { window.dispatchEvent(new CustomEvent("tr4de:trades-imported", { detail: { count: 0 } })); } catch {}
    } catch (e) {
      console.error(e);
      if (typeof window !== "undefined") window.alert("Erreur lors de la suppression : " + (e?.message || e));
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };


  return (
    <div ref={containerRef} style={{ position: "relative", fontFamily: "var(--font-sans)" }}>
      {/* Sur pointeur tactile (pas de hover) : boutons icône toujours visibles et
          cible tactile ≥44px pour l'accessibilité. */}
      <style>{`
        @media (pointer: coarse) {
          .tr4de-acct-iconbtn { opacity: 1 !important; width: 44px !important; height: 44px !important; }
        }
      `}</style>
      {/* Trigger — identique au mode mono ; en multi, affiche le 1er compte + badge "+N" */}
      {(() => {
        const primaryName = multi
          ? (selectedAccountNames[0] || "")
          : selectedAccountName;
        const primaryAccount = primaryName ? accounts.find(a => a.name === primaryName) : null;
        const extraCount = multi ? Math.max(0, selectedAccountNames.length - 1) : 0;
        const hasValue = !!primaryName;
        return (
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "9px 14px", border: "none",
              borderRadius: 999, background: FIELD_BG,
              boxShadow: open ? FIELD_FOCUS_RING : "none",
              color: hasValue ? "var(--color-text)" : "var(--color-text-muted)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              fontFamily: "inherit", textAlign: "left",
              transition: "box-shadow var(--dur-fast) var(--ease-out)",
            }}
          >
            {primaryAccount ? (
              <>
                {resolveBrokerIcon(primaryAccount.broker) && (
                  <img src={resolveBrokerIcon(primaryAccount.broker)} alt="" style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {primaryAccount.name}
                </span>
              </>
            ) : (
              <span style={{ flex: 1 }}>{primaryName || t("accounts.selectPlaceholder")}</span>
            )}
            {extraCount > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999,
                background: "var(--color-text)", color: "var(--color-bg)", fontSize: 11, fontWeight: 600,
                flexShrink: 0,
              }}>
                +{extraCount}
              </span>
            )}
            {open ? <ChevronUp size={14} color="var(--color-text-muted)"/> : <ChevronDown size={14} color="var(--color-text-muted)"/>}
          </button>
        );
      })()}

      {/* Dropdown */}
      <Popover
        anchorRef={containerRef}
        open={open}
        onClose={closeMenu}
        gap={4}
        matchAnchorWidth
        scroll={false}
        maxHeight={340}
        role="listbox"
        style={{
          background: "var(--color-card-bg, #FFFFFF)", border: "none", borderRadius: 10,
          boxShadow: "var(--elev-overlay)",
        }}
      >
        <>
          {/* Search / Create input */}
          <div style={{ flexShrink: 0, padding: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px" }}>
              <Search size={13} color="var(--color-text-muted)" />
              <input
                type="text" autoFocus value={query}
                onChange={(e)=>setQuery(e.target.value)}
                onKeyDown={(e)=>{ if (e.key === "Enter" && showCreate) { e.preventDefault(); commitCreate(e); } }}
                placeholder={selectionOnly ? t("accounts.searchOnlyPlaceholder") : t("accounts.searchPlaceholder")}
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, border: "none", background: "transparent",
                  outline: "none", boxShadow: "none",
                  fontSize: 13, padding: "6px 0",
                  color: "var(--color-text)", fontFamily: "inherit",
                  WebkitAppearance: "none", appearance: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
                onFocus={(e)=>{ e.currentTarget.style.outline = "none"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* Liste */}
          <div className="scroll-thin" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", maxHeight: 280, padding: 4 }}>
            {/* Option Créer (apparaît dynamiquement quand la requête ne matche aucun compte) */}
            {showCreate && (
              <button
                type="button"
                onClick={commitCreate}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", border: "none", background: "transparent",
                  color: "var(--color-text)", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left", borderRadius: 6,
                }}
                onMouseEnter={(e)=>{e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"}}
                onMouseLeave={(e)=>{e.currentTarget.style.background = "transparent"}}
              >
                <Plus size={14} strokeWidth={2}/>
                <span>{t("accounts.create")} « <strong>{queryTrim}</strong> »</span>
              </button>
            )}

            {showGoToCreate && (
              <button
                type="button"
                onClick={() => { setOpen(false); setQuery(""); onRequestCreate(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", border: "none", background: "transparent",
                  color: "var(--color-text)", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left", borderRadius: 6,
                }}
                onMouseEnter={(e)=>{e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"}}
                onMouseLeave={(e)=>{e.currentTarget.style.background = "transparent"}}
              >
                <Plus size={14} strokeWidth={2}/>
                <span>{t("accounts.goToCreate")}</span>
              </button>
            )}

            {filtered.length === 0 && !showCreate && !showGoToCreate && (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>
                {t("accounts.noAccount")}
              </div>
            )}

            {filtered.map((acc) => {
              const isSelected = multi ? isSelectedMulti(acc.name) : acc.name === selectedAccountName;
              const isEditing = editingId === acc.id;
              const icon = resolveBrokerIcon(acc.broker);
              return (
                <div
                  key={acc.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 6,
                    background: isSelected ? "var(--color-active-bg)" : "transparent",
                    transition: "background 100ms ease",
                  }}
                  onMouseEnter={(e)=>{ if (!isSelected) e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"; e.currentTarget.querySelectorAll('[data-hover]').forEach(b => { b.style.opacity = 1; }); }}
                  onMouseLeave={(e)=>{ if (!isSelected) e.currentTarget.style.background = "transparent"; e.currentTarget.querySelectorAll('[data-hover]').forEach(b => { b.style.opacity = 0; }); }}
                >
                  <button
                    type="button"
                    title={multi ? "Ctrl/Cmd+clic pour sélectionner plusieurs comptes" : undefined}
                    onClick={(e)=>{
                      if (isEditing) return;
                      if (multi && (e.ctrlKey || e.metaKey)) {
                        toggleMulti(acc.name);
                        return;
                      }
                      if (multi) {
                        // clic simple en mode multi = sélection unique (remplace)
                        if (onAccountNamesChange) onAccountNamesChange([acc.name]);
                        setOpen(false);
                        setQuery("");
                        return;
                      }
                      onAccountNameChange(acc.name);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8,
                      padding: 0, border: "none", background: "transparent",
                      cursor: isEditing ? "text" : "pointer",
                      color: "var(--color-text)", fontSize: 13, fontWeight: isSelected ? 600 : 500,
                      fontFamily: "inherit", textAlign: "left", minWidth: 0,
                    }}
                  >
                    {icon && <img src={icon} alt="" style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0 }}/>}
                    {isEditing ? (
                      <input
                        type="text" autoFocus value={editDraft}
                        onChange={(e)=>setEditDraft(e.target.value)}
                        onClick={(e)=>e.stopPropagation()}
                        onBlur={()=>commitEdit(acc)}
                        onKeyDown={(e)=>{ if (e.key === "Enter") commitEdit(acc); if (e.key === "Escape") setEditingId(null); }}
                        style={{ flex: 1, padding: "2px 8px", fontSize: 13, border: "none", borderRadius: 999, outline: "none", boxShadow: FIELD_FOCUS_RING, fontFamily: "inherit", color: "var(--color-text)", background: FIELD_BG, minWidth: 0 }}
                      />
                    ) : (
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {acc.name}
                      </span>
                    )}
                    {acc.broker && !isEditing && (
                      <span style={{ color: "var(--color-text-muted)", fontSize: 12, fontWeight: 400 }}>
                        ({String(acc.broker).charAt(0).toUpperCase() + String(acc.broker).slice(1)})
                      </span>
                    )}
                  </button>
                  {/* Confirmation inline de suppression (✓ / ✕). Remplace les
                      icônes habituelles pour la ligne concernée. */}
                  {confirmingId === acc.id && !isEditing ? (
                    <>
                      <span style={{ fontSize: 11, color: "var(--color-red, #DC2626)", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {t("accounts.deleteTip")} ?
                      </span>
                      <span
                        role="button"
                        title={t("accounts.confirmDelete")}
                        aria-label={t("accounts.confirmDelete")}
                        onClick={(e)=>{ e.stopPropagation(); if (deletingId !== acc.id) deleteAccount(acc); }}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 28, height: 28, borderRadius: "var(--radius-field)", cursor: "pointer",
                          background: "var(--color-red-bg, #FEE2E2)", color: "var(--color-red, #DC2626)",
                          opacity: deletingId === acc.id ? 0.5 : 1,
                        }}
                      >
                        <Check size={14} strokeWidth={2.25}/>
                      </span>
                      <span
                        role="button"
                        title={t("accounts.cancelDelete")}
                        aria-label={t("accounts.cancelDelete")}
                        onClick={(e)=>{ e.stopPropagation(); setConfirmingId(null); }}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 28, height: 28, borderRadius: "var(--radius-field)", cursor: "pointer",
                          background: "var(--color-hover-bg, #F0F0F0)", color: "var(--color-text-sub)",
                        }}
                      >
                        <X size={14} strokeWidth={2.25}/>
                      </span>
                    </>
                  ) : (
                    <>
                      {!isEditing && !selectionOnly && (
                        <span
                          data-hover
                          className="tr4de-acct-iconbtn"
                          role="button"
                          title={t("accounts.rename")}
                          aria-label={t("accounts.rename")}
                          onClick={(e)=>{ e.stopPropagation(); setEditingId(acc.id); setEditDraft(acc.name); }}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: "var(--radius-field)", cursor: "pointer",
                            color: "var(--color-text-muted)", opacity: 0, transition: "opacity .15s ease, background .12s ease, color .12s ease",
                          }}
                          onMouseEnter={(e)=>{e.currentTarget.style.background = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text)"}}
                          onMouseLeave={(e)=>{e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-muted)"}}
                        >
                          <Pencil size={14} strokeWidth={1.75}/>
                        </span>
                      )}
                      {allowDelete && !isEditing && !selectionOnly && (
                        <span
                          data-hover
                          className="tr4de-acct-iconbtn"
                          role="button"
                          title={t("accounts.deleteTip")}
                          aria-label={t("accounts.deleteTip")}
                          onClick={(e)=>{ e.stopPropagation(); setConfirmingId(acc.id); }}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: "var(--radius-field)", cursor: "pointer",
                            color: "var(--color-text-muted)", opacity: 0, transition: "opacity .15s ease, background .12s ease, color .12s ease",
                          }}
                          onMouseEnter={(e)=>{e.currentTarget.style.background = "var(--color-red-bg, #FEE2E2)"; e.currentTarget.style.color = "var(--color-red, #DC2626)"}}
                          onMouseLeave={(e)=>{e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-muted)"}}
                        >
                          <Trash2 size={14} strokeWidth={1.75}/>
                        </span>
                      )}
                      {isSelected && !isEditing && <Check size={14} color="var(--color-text)"/>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      </Popover>
    </div>
  );
}
