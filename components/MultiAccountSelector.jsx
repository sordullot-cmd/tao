import React, { useState, useRef } from "react";
import ReactDOM from "react-dom";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import Popover from "@/components/ui/Popover";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { t, useLang } from "@/lib/i18n";

export default function MultiAccountSelector({
  accounts = [],
  selectedAccountIds = [],
  onSelectionChange,
  onDeleteAccount,
  onCreateAccount,
  T = {},
}) {
  useLang(); // re-render on language change
  const [isOpen, setIsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // account object ou null
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef(null);

  // Fermeture au clic extérieur : gérée par le Popover. Elle est suspendue tant
  // que la modale de confirmation est ouverte — sinon le clic dans cette modale
  // (elle aussi portalisée, donc « extérieure ») démonterait le menu avant que
  // l'utilisateur ait pu répondre.
  const closeMenu = React.useCallback(() => setIsOpen(false), []);

  const handleToggleAccount = (accountId) => {
    let updatedIds;
    if (selectedAccountIds.includes(accountId)) {
      updatedIds = selectedAccountIds.filter((id) => id !== accountId);
    } else {
      updatedIds = [...selectedAccountIds, accountId];
    }
    onSelectionChange(updatedIds);
  };

  const handleSelectAll = () => {
    if (selectedAccountIds.length === accounts.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(accounts.map((acc) => acc.id));
    }
  };

  const allSelected = accounts.length > 0 && selectedAccountIds.length === accounts.length;
  const displayText =
    selectedAccountIds.length === 0
      ? t("accounts.noAccount")
      : allSelected
      ? t("accounts.allAccountsCount").replace("{n}", String(accounts.length))
      : selectedAccountIds.length === 1
      ? accounts.find((a) => a.id === selectedAccountIds[0])?.name || t("accounts.singular")
      : t("accounts.multiple").replace("{n}", String(selectedAccountIds.length));

  return (
    <div style={{ position: "relative", minWidth: 180, fontFamily: "var(--font-sans)" }} ref={menuRef}>
      {/* Sur pointeur tactile (pas de hover) : boutons icône toujours visibles et
          cible tactile ≥44px pour l'accessibilité. */}
      <style>{`
        @media (pointer: coarse) {
          .tr4de-acct-iconbtn { opacity: 1 !important; width: 44px !important; height: 44px !important; }
        }
      `}</style>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          width: "100%",
          minHeight: 28, padding: "5px 12px",
          height: 34,
          borderRadius: 999,
          background: "var(--color-card-bg, #FFFFFF)",
          border: `1px solid ${isOpen ? "var(--color-border-strong)" : "var(--color-border)"}`,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          color: "var(--color-text)",
          fontFamily: "inherit",
          transition: "border-color 120ms ease",
        }}
      >
        <span suppressHydrationWarning style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayText}
        </span>
        {isOpen ? <ChevronUp size={14} strokeWidth={2} color="var(--color-text-muted)" /> : <ChevronDown size={14} strokeWidth={2} color="var(--color-text-muted)" />}
      </button>

      {/* Dropdown menu */}
      <Popover
        anchorRef={menuRef}
        open={isOpen}
        onClose={closeMenu}
        closeOnOutside={!confirmDelete}
        gap={4}
        matchAnchorWidth
        role="listbox"
        style={{
          background: "var(--color-card-bg, #FFFFFF)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-modal)",
          boxShadow: "var(--elev-overlay)",
          padding: 4,
        }}
      >
        <>
          {/* Tous les comptes */}
          {accounts.length > 0 && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "7px 10px",
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: "inherit",
                color: "var(--color-text)",
                fontSize: 13,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                style={{ width: 14, height: 14, accentColor: "var(--color-text)", cursor: "pointer", margin: 0, flexShrink: 0 }}
              />
              <span style={{ flex: 1 }}>{t("accounts.allAccounts")}</span>
            </label>
          )}

          {/* Separateur */}
          {accounts.length > 0 && (
            <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />
          )}

          {/* Section label */}
          {accounts.length > 0 && (
            <div
              style={{
                padding: "4px 10px 4px",
                fontSize: 11,
                color: "var(--color-text-muted)",
                fontWeight: 500,
              }}
            >
              {t("accounts.myAccounts")}
            </div>
          )}

          {/* Items des comptes */}
          {accounts.map((account, idx) => {
            const isSelected = selectedAccountIds.includes(account.id);
            return (
              <React.Fragment key={account.id}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    borderRadius: 10,
                    fontFamily: "inherit",
                    color: "var(--color-text)",
                    fontSize: 13,
                    fontWeight: 500,
                    transition: "background .12s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"; const btn = e.currentTarget.querySelector('[data-del-btn]'); if (btn) btn.style.opacity = 1; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; const btn = e.currentTarget.querySelector('[data-del-btn]'); if (btn) btn.style.opacity = 0; }}
                >
                  <label style={{display:"flex",alignItems:"center",gap:10,flex:1,cursor:"pointer",minWidth:0}}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleAccount(account.id)}
                      style={{ width: 14, height: 14, accentColor: "var(--color-text)", cursor: "pointer", margin: 0, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {account.name}
                    </span>
                  </label>
                  {onDeleteAccount && (
                    <button
                      data-del-btn
                      className="tr4de-acct-iconbtn"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(account); }}
                      title={t("accounts.deleteTip")}
                      aria-label={t("accounts.deleteTip")}
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, border: "none", background: "transparent",
                        cursor: "pointer", color: "var(--color-text-muted)", borderRadius: "var(--radius-field)", flexShrink: 0,
                        opacity: 0, transition: "opacity .15s ease, background .12s ease, color .12s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-red, #EF4444)"; e.currentTarget.style.background = "var(--color-red-bg, #FEF2F2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.background = "transparent"; }}
                    >
                      <Trash2 size={14} strokeWidth={1.75}/>
                    </button>
                  )}
                </div>
                {idx < accounts.length - 1 && (
                  <div style={{ height: 1, background: "var(--color-border)", margin: "0 8px" }} />
                )}
              </React.Fragment>
            );
          })}

          {accounts.length === 0 && (
            <div style={{ padding: "12px", textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
              {t("accounts.noAccount")}
            </div>
          )}

          {/* Footer : Creation de compte */}
          {onCreateAccount && (
            <>
              {accounts.length > 0 && <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />}
              <button
                onClick={() => { setIsOpen(false); onCreateAccount(); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  background: "transparent",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  color: "var(--color-text)",
                  fontSize:13,
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Plus size={14} strokeWidth={2} />
                {t("accounts.createNew")}
              </button>
            </>
          )}
        </>
      </Popover>

      {/* Modale de confirmation suppression — rendue au root du composant
          (et non dans le dropdown) pour ne pas être unmount quand le
          dropdown se ferme. */}
      {confirmDelete && typeof document !== "undefined" && ReactDOM.createPortal(
        <div {...backdropDismiss(()=>!deleting && setConfirmDelete(null))}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-sans)",padding:"24px"}}>
          <div onClick={(e)=>e.stopPropagation()}
            style={{background:"var(--color-card-bg, #FFFFFF)",borderRadius:14,maxWidth:420,width:"100%",boxShadow:"var(--elev-overlay)",border:"1px solid var(--color-border)",overflow:"hidden"}}>
            <div style={{padding:"20px 24px 8px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:36,borderRadius:10,background:"var(--color-red-bg, #FEF2F2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Trash2 size={16} strokeWidth={1.75} color="var(--color-red, #EF4444)"/>
              </div>
              <h3 style={{fontSize:14,fontWeight:600,color:"var(--color-text)",margin:0,letterSpacing:-0.1}}>
                {t("accounts.confirmDeleteTitle").replace("{name}", confirmDelete.name)}
              </h3>
            </div>
            <div style={{padding:"4px 24px 20px",fontSize:13,color:"var(--color-text-sub)",lineHeight:1.5}}>
              {t("accounts.confirmDeletePart1")} <strong style={{color:"var(--color-text)"}}>{t("accounts.confirmDeletePart2")}</strong>{t("accounts.confirmDeletePart3")}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",padding:"14px 24px",borderTop:"1px solid var(--color-border)",background:"var(--color-bg-subtle, #FAFAFA)"}}>
              <button onClick={()=>setConfirmDelete(null)} disabled={deleting}
                style={{padding:"0 16px",height:36,borderRadius:"var(--radius-card)",border:"1px solid var(--color-border)",background:"var(--color-card-bg, #FFFFFF)",color:"var(--color-text)",fontSize:13,fontWeight:500,cursor: deleting ? "not-allowed" : "pointer",fontFamily:"inherit",opacity: deleting ? 0.5 : 1}}>
                {t("common.cancel")}
              </button>
              <button
                onClick={async ()=>{
                  if (!onDeleteAccount) return;
                  setDeleting(true);
                  try { await onDeleteAccount(confirmDelete.id); }
                  catch (e) { console.error("delete account failed:", e); }
                  finally { setDeleting(false); setConfirmDelete(null); setIsOpen(false); }
                }}
                disabled={deleting}
                style={{padding:"0 16px",height:36,borderRadius:"var(--radius-card)",border:"1px solid var(--color-red, #EF4444)",background:"var(--color-red, #EF4444)",color:"#FFFFFF",fontSize:13,fontWeight: 500,cursor: deleting ? "not-allowed" : "pointer",fontFamily:"inherit",opacity: deleting ? 0.7 : 1}}>
                {deleting ? t("accounts.deleting") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
