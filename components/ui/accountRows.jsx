"use client";

/**
 * Lignes de compte — briques partagées entre la page Comptes et la page détail
 * d'une prop firm, pour que la liste des comptes d'une firme soit présentée
 * exactement comme celle de la page Comptes (même géométrie de colonnes, même
 * carte, même logo rond, même en-tête).
 *
 * Extrait de AccountsPage (maquette Figma « My accounts », node 283:10382) :
 * ces composants y étaient locaux, ils sont désormais la source unique.
 */

import React from "react";
import { ChevronDown, Trophy, Plus } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { CARD, TH } from "@/components/ui/da";
import { t } from "@/lib/i18n";

/* Géométrie des colonnes, relevée sur la maquette : colonne de nom à 170 px
   (extensible jusqu'à 360 px plutôt que laisser le texte déborder) puis
   4 cellules de 88 px. */
export const NAME_COL = { minWidth: 170, maxWidth: 360, flex: "0 1 auto", minHeight: 0, overflow: "hidden" };
export const CELL = { width: 88, flexShrink: 0 };
export const CELL_VALUE = {
  ...CELL, fontSize: 12, fontWeight: 500, lineHeight: 1, color: T.text, opacity: 0.6,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
/* Emplacement des actions de fin de ligne (modifier / supprimer). Largeur fixe
   pour que les colonnes restent alignées avec l'en-tête. */
export const ACTIONS_COL = { width: 68, flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 2 };

/* Vignette ronde d'un compte / d'une firme : boîte fixe, logo contenu dedans.
   Sans logo, on retombe sur une icône ou les initiales — jamais un placeholder
   inventé. */
export function RoundLogo({ src, size = 20, fallback, name }) {
  const inner = Math.round(size * 0.82);
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: T.accentBg, overflow: "hidden",
    }}>
      {src ? (
        <img src={src} alt="" width={inner} height={inner}
          style={{ width: inner, height: inner, objectFit: "contain", display: "block" }} />
      ) : fallback || (
        <span style={{ fontSize: Math.max(9, Math.round(size * 0.4)), fontWeight: 500, color: T.textSub }}>
          {String(name || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/* Bouton compact « Passer en Funded » (eval dont la cible est atteinte). */
export function PassFundedButton({ busy, onClick }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 10px", borderRadius: 48, border: "none",
        background: T.tagLongBg, color: T.tagLongText,
        fontSize: 12, lineHeight: "17.05px", fontFamily: "inherit",
        cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, whiteSpace: "nowrap",
      }}
    >
      <Trophy size={11} strokeWidth={1.75} /> {busy ? t("firms.passing") : t("firms.passFunded")}
    </button>
  );
}

/**
 * En-tête de colonnes — hors carte, à 40 % d'opacité.
 * `withActions` réserve la colonne d'actions pour garder l'alignement.
 */
export function AccountRowsHeader({ firstLabel, withActions = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", opacity: 0.4 }}>
      <div style={{ ...NAME_COL, display: "flex", alignItems: "center" }}>
        <span style={TH}>{t("accountsPage.colName")}</span>
      </div>
      <span style={{ ...TH, ...CELL }}>{firstLabel || t("accountsPage.colAccount")}</span>
      <span style={{ ...TH, ...CELL }}>{t("accountsPage.colValue")}</span>
      <span style={{ ...TH, ...CELL }}>{t("accountsPage.colWinrate")}</span>
      <span style={{ ...TH, ...CELL, textAlign: "right" }}>{t("accountsPage.colPayout")}</span>
      {withActions && <span style={ACTIONS_COL} aria-hidden />}
    </div>
  );
}

/**
 * Ligne de tableau : une carte blanche. Chevron à gauche quand la ligne est
 * dépliable (comptes d'une firme), logo rond, nom, puis les cellules alignées
 * sur l'en-tête.
 *
 * @param {React.ReactNode=} actions  Boutons de fin de ligne (colonne fixe).
 */
export function TableRow({
  icon, fallbackIcon, label, badge, cells,
  expandable, open, onToggle, onOpen, actions, children,
}) {
  return (
    <div style={{ ...CARD, padding: 20, display: "flex", flexDirection: "column", gap: 24, overflow: "visible" }}>
      {/* Deux actions distinctes sur la même ligne :
          - un clic n'importe où sur la ligne ouvre la fiche du compte / de la firme ;
          - un clic sur le seul chevron déplie les comptes, sans naviguer
            (le chevron arrête la propagation, cf. plus bas). */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", borderRadius: 12 }}
      >
        <div style={{ ...NAME_COL, display: "flex", alignItems: "center", gap: 12 }}>
          <span
            role={expandable ? "button" : undefined}
            tabIndex={expandable ? 0 : undefined}
            aria-expanded={expandable ? !!open : undefined}
            aria-label={expandable ? (open ? t("common.collapse") : t("common.expand")) : undefined}
            /* stopPropagation AVANT le test : sinon, sur une ligne non
               dépliable, le clic remonte à la ligne et ouvre la fiche. */
            onClick={(e) => { e.stopPropagation(); if (expandable) onToggle?.(); }}
            onKeyDown={(e) => { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); e.stopPropagation(); if (expandable) onToggle?.(); }}
            style={{
              // Cible de clic élargie à 32 px (l'icône reste à 16) : à 18 px,
              // un clic un peu à côté partait sur la navigation de la ligne.
              width: 32, height: 32, margin: -7, flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: T.text, opacity: expandable ? 1 : 0,
              cursor: expandable ? "pointer" : "default",
              pointerEvents: expandable ? "auto" : "none",
              borderRadius: 6,
            }}
            onMouseEnter={(e) => { if (expandable) e.currentTarget.style.background = T.rowHighlight; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <ChevronDown
              size={16} strokeWidth={1.75}
              style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 140ms ease" }}
            />
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <RoundLogo src={icon} size={20} fallback={fallbackIcon} name={label} />
            <span title={label} style={{ fontSize: 16, fontWeight: 500, lineHeight: "17.05px", color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </span>
            {badge}
          </div>
        </div>
        {cells.map((c, i) => (
          <span key={i} style={{ ...CELL_VALUE, textAlign: i === cells.length - 1 ? "right" : "left" }}>{c}</span>
        ))}
        {actions && (
          <div style={ACTIONS_COL} onClick={(e) => e.stopPropagation()}>{actions}</div>
        )}
      </div>

      {expandable && open && (
        <>
          <div style={{ height: 1, width: "100%", background: T.border }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
        </>
      )}
    </div>
  );
}

/**
 * Dernière sous-ligne d'une firme dépliée : action d'ajout d'un compte rattaché
 * à cette firme. Alignée sur les sous-lignes (retrait de 30 px) pour se lire
 * comme la suite de la liste, mais en texte atténué pour rester secondaire.
 */
export function AddAccountRow({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingLeft: 30, paddingRight: 8, marginRight: -8,
        paddingTop: 6, paddingBottom: 6, marginTop: -6, marginBottom: -6,
        border: "none", background: "transparent", borderRadius: 12,
        color: T.textSub, fontSize: 14, lineHeight: "17.05px",
        fontFamily: "inherit", cursor: "pointer", textAlign: "left",
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; e.currentTarget.style.color = T.text; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}
    >
      <span style={{
        width: 12, height: 12, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <Plus size={12} strokeWidth={2} />
      </span>
      {label || t("firms.addAccount")}
    </button>
  );
}

/* Sous-ligne dépliée : un compte de la firme, à l'intérieur de sa carte. */
export function SubRow({ label, badge, cells, onOpen, actions }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onOpen?.(); } }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingLeft: 30, paddingRight: 8, marginRight: -8,
        paddingTop: 6, paddingBottom: 6, marginTop: -6, marginBottom: -6,
        borderRadius: 12, cursor: "pointer", transition: "background 120ms ease",
      }}
    >
      <div style={{ ...NAME_COL, minWidth: 140, display: "flex", alignItems: "center", gap: 8 }}>
        <span title={label} style={{ fontSize: 14, lineHeight: "17.05px", color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        {badge}
      </div>
      {cells.map((c, i) => (
        <span key={i} style={{ ...CELL_VALUE, textAlign: i === cells.length - 1 ? "right" : "left" }}>{c}</span>
      ))}
      {actions && (
        <div style={ACTIONS_COL} onClick={(e) => e.stopPropagation()}>{actions}</div>
      )}
    </div>
  );
}
