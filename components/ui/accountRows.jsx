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

/* Géométrie des colonnes — reprise de la maquette (nom 170 px avec sa gouttière,
   4 cellules de 88 px), mais en bases FLEXIBLES plutôt qu'en largeurs figées :
   nom et cellules grandissent ensemble pour occuper toute la ligne, donc les
   colonnes restent étalées comme dans la maquette.

   Le point important est que ces largeurs ne dépendent QUE des bases ci-dessous,
   jamais du contenu. Avant, la colonne de nom prenait la largeur de son texte
   (entre 170 et 360 px) et la ligne était répartie en `space-between` : un nom
   long — ou un badge « Passer en Funded » — mangeait l'espace libre et TOUTES
   les cellules de cette ligne glissaient par rapport aux autres et à l'en-tête.
   Ici un nom trop long est simplement tronqué (`minWidth: 0` + ellipsis) et rien
   ne bouge : toutes les lignes et l'en-tête tombent sur les mêmes verticales. */
export const NAME_COL = { flex: "1 1 134px", minWidth: 0, minHeight: 0, overflow: "hidden", paddingRight: 12 };
export const CELL = { flex: "1 1 88px", minWidth: 0 };
export const CELL_VALUE = {
  ...CELL, fontSize: 12, fontWeight: 500, lineHeight: 1, color: T.text, opacity: 0.6,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
/* Dernière colonne (payout) : alignée à droite, son chiffre venait buter contre
   les boutons d'action. Le retrait la décolle sans déplacer les autres
   colonnes — `border-box` le prend sur la largeur de la cellule, pas en plus.
   Appliqué à l'en-tête ET aux lignes, sinon les verticales ne coïncident plus. */
export const LAST_CELL = { paddingRight: 16, boxSizing: "border-box" };
/* Emplacement des actions de fin de ligne (modifier / supprimer). Seule colonne
   à largeur figée : deux boutons de 28 px n'ont aucune raison de s'étirer. */
export const ACTIONS_COL = { width: 68, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 };
/* La colonne d'actions est un FRÈRE de la zone de navigation (voir TableRow),
   et le conteneur de ligne a un `gap: 4` : sans cette compensation, la colonne
   serait poussée de 4 px et la dernière cellule ne tomberait plus sous son
   en-tête. À n'appliquer que là où un gap sépare réellement les deux blocs. */
const ACTIONS_COL_GAPLESS = { ...ACTIONS_COL, marginLeft: -4 };

/* Gouttière de tête d'une ligne : le carré du chevron (32) et son écart (4).
   L'en-tête et les sous-lignes la reprennent pour que tous les noms de la liste
   démarrent sur la même verticale, celle du logo des lignes principales. */
export const ROW_GUTTER = 36;

/**
 * Vignette ronde d'un compte / d'une firme.
 *
 * Le logo remplit TOUT le disque (`object-fit: cover` sur 100 % de la boîte),
 * le rond du parent le détourant. Auparavant l'image était posée à 82 % en
 * `contain` : comme les logos de brokers sont des carrés à fond opaque, on
 * voyait ce carré à l'intérieur du cercle et le rond paraissait incomplet.
 * La quasi-totalité des logos étant carrés (ratio 1:1), `cover` ne rogne rien —
 * il ne fait que faire coïncider les bords de l'image avec ceux du disque.
 *
 * Sans logo, on retombe sur une icône ou les initiales — jamais un placeholder
 * inventé.
 */
export function RoundLogo({ src, size = 20, fallback, name }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: T.accentBg, overflow: "hidden",
    }}>
      {src ? (
        <img src={src} alt="" width={size} height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : fallback || (
        <span style={{ fontSize: Math.max(9, Math.round(size * 0.4)), fontWeight: 500, color: T.textSub }}>
          {String(name || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/* Bouton compact « Passer en Funded » (eval dont la cible est atteinte).
   Il vit DANS la zone de navigation de la ligne (collé au nom du compte) : le
   `scale` d'appui le rétrécirait sous le curseur et le relâchement tomberait sur
   la ligne — donc sur la navigation — au lieu du bouton. D'où `data-no-press`. */
export function PassFundedButton({ busy, onClick }) {
  return (
    <button
      type="button"
      disabled={busy}
      data-no-press
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
 * Bouton d'action de fin de ligne (supprimer, modifier…). Atténué au repos pour
 * ne pas concurrencer les chiffres de la ligne, plein au survol ; `danger` le
 * passe en rouge, réservé aux actions destructrices.
 *
 * `stopPropagation` sur le clic : ces boutons sont posés à côté d'une zone de
 * navigation (la ligne ouvre la fiche du compte), et rien ne garantit qu'un
 * appelant ne les remette pas dedans.
 *
 * `data-no-press` : globals.css fait scaler tout bouton à 0.97 au `:active`.
 * Sur un carré de 34 px le retrait est d'environ 1 px — assez pour qu'un
 * pointeur posé sur le bord extrême du bouton se retrouve HORS de lui au
 * relâchement, auquel cas le navigateur n'émet aucun `click`.
 */
export function RowIconButton({ label, onClick, danger = false, busy = false, children }) {
  const idle = danger ? T.red : T.textSub;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={busy}
      data-no-press
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      /* Le clic est aussi intercepté au pointerdown : la ligne entière est une
         zone de navigation, et sans ça un relâchement légèrement décalé partait
         ouvrir la fiche au lieu d'actionner le bouton. */
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        /* Le bouton REMPLIT sa colonne d'actions au lieu d'être une vignette de
           34 px collée à droite : les pixels restants de la colonne ne
           répondaient à rien (le conteneur y arrête la propagation), ce qui
           donnait l'impression d'un bouton qui « ne marche qu'aux extrémités ».
           La surface surlignée au survol est désormais exactement la surface
           cliquable. L'icône, elle, reste à 14. */
        flex: "1 1 auto", minWidth: 34, height: 34, marginTop: -3, marginBottom: -3,
        borderRadius: 8, padding: 0,
        border: "none", background: "transparent", color: idle,
        opacity: busy ? 0.4 : 0.55, cursor: busy ? "wait" : "pointer",
        transition: "background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        if (busy) return;
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.background = danger ? T.redBg : T.accentBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = busy ? "0.4" : "0.55";
        e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Les icônes sont rendues transparentes au pointeur par globals.css :
          le clic atteint le bouton où qu'il tombe, centre compris. */}
      {children}
    </button>
  );
}

/**
 * En-tête de colonnes, à 40 % d'opacité.
 * `withActions` réserve la colonne d'actions pour garder l'alignement.
 * `flush` retire le retrait horizontal de 20 px : à utiliser quand l'en-tête est
 * placé DANS la carte, dont le propre padding assure déjà ce retrait — sinon il
 * serait décalé de 20 px par rapport aux lignes.
 */
export function AccountRowsHeader({ firstLabel, withActions = false, flush = false, gutter = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: flush ? 0 : "0 20px", opacity: 0.4 }}>
      {/* Même gouttière que le chevron des lignes : sans elle, « NOM » démarrait
          36 px avant les noms qu'il intitule. */}
      {gutter && <span style={{ width: ROW_GUTTER, flexShrink: 0 }} aria-hidden />}
      <div style={{ ...NAME_COL, display: "flex", alignItems: "center" }}>
        <span style={TH}>{t("accountsPage.colName")}</span>
      </div>
      <span style={{ ...TH, ...CELL }}>{firstLabel || t("accountsPage.colAccount")}</span>
      <span style={{ ...TH, ...CELL }}>{t("accountsPage.colValue")}</span>
      <span style={{ ...TH, ...CELL }}>{t("accountsPage.colWinrate")}</span>
      <span style={{ ...TH, ...CELL, ...LAST_CELL, textAlign: "right" }}>{t("accountsPage.colPayout")}</span>
      {withActions && <span style={ACTIONS_COL} aria-hidden />}
    </div>
  );
}

/**
 * Ligne de tableau : chevron à gauche quand la ligne est dépliable (comptes
 * d'une firme), logo rond, nom, puis les cellules alignées sur l'en-tête.
 *
 * Deux présentations :
 *  - par défaut, la ligne EST une carte blanche autonome ;
 *  - `flat`, elle n'a plus de fond ni d'ombre : elle est destinée à vivre DANS
 *    une carte englobante (celle qui porte aussi l'en-tête de colonnes). Le
 *    retrait tombe alors à 0 horizontalement, le padding de la carte le
 *    fournissant, et un survol matérialise la zone cliquable — sans fond propre,
 *    plus rien n'indiquerait que la ligne réagit.
 *
 * @param {React.ReactNode=} actions  Boutons de fin de ligne (colonne fixe).
 * @param {boolean=} reserveActions  Garde la colonne d'actions vide sur une
 *   ligne qui n'en a pas. Indispensable dès qu'une SEULE ligne de la liste
 *   porte des actions : les cellules sont réparties en `space-between`, donc une
 *   ligne avec un enfant de moins voit toutes ses colonnes glisser.
 */
export function TableRow({
  icon, fallbackIcon, label, badge, cells,
  expandable, open, onToggle, onOpen, actions, reserveActions = false, children, flat = false,
}) {
  const isOpen = expandable && open;
  return (
    <div style={flat
      ? {
          display: "flex", flexDirection: "column", gap: 16, overflow: "visible",
          /* Une firme dépliée forme un bloc : sans respiration en dessous, son
             dernier sous-compte collait à la ligne de compte suivante et on ne
             voyait plus où le groupe s'arrêtait. */
          paddingBottom: isOpen ? 20 : 0,
          transition: "padding-bottom 140ms ease",
        }
      : { ...CARD, padding: 20, display: "flex", flexDirection: "column", gap: 24, overflow: "visible" }}>
      {/* Deux actions distinctes, et surtout DEUX ZONES SÉPARÉES :
          - le chevron déplie les comptes ;
          - tout le reste de la ligne ouvre la fiche du compte / de la firme.
          Le chevron est volontairement placé À CÔTÉ de la zone cliquable, pas
          dedans : tant qu'il en était un descendant, un clic sur lui remontait
          à la ligne et il fallait l'arrêter à la main — ce qui échouait dès que
          la cible réelle était le SVG de l'icône. Ici, aucun clic sur le carré
          ne peut atteindre la navigation, il n'y a plus rien à intercepter. */}
      <div
        onMouseEnter={flat ? (e) => { e.currentTarget.style.background = T.rowHighlight; } : undefined}
        onMouseLeave={flat ? (e) => { e.currentTarget.style.background = "transparent"; } : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          borderRadius: 12, overflow: "visible",
          /* En mode plat, la bande de survol dépasse de 8 px de chaque côté puis
             les récupère en padding : le contenu reste donc aligné sur l'en-tête
             tout en donnant au survol une zone plus généreuse que le texte. */
          ...(flat ? {
            margin: "0 -8px", padding: "10px 8px",
            transition: "background 120ms ease",
          } : null),
        }}
      >
        <button
          type="button"
          disabled={!expandable}
          aria-expanded={expandable ? !!open : undefined}
          aria-label={expandable ? (open ? t("common.collapse") : t("common.expand")) : undefined}
          aria-hidden={expandable ? undefined : true}
          tabIndex={expandable ? 0 : -1}
          onClick={() => { if (expandable) onToggle?.(); }}
          style={{
            /* Carré de 32 px, entièrement cliquable et entièrement surligné au
               survol (l'icône, elle, reste à 16). Seules les marges VERTICALES
               sont négatives : elles absorbent la hauteur du carré dans le
               padding de la ligne, sans quoi chaque ligne grandirait de 12 px. */
            width: 32, height: 32, marginTop: -6, marginBottom: -6,
            flexShrink: 0, padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "none", background: "transparent",
            color: T.text, opacity: expandable ? 1 : 0,
            cursor: expandable ? "pointer" : "default",
            pointerEvents: expandable ? "auto" : "none",
            borderRadius: 8,
            transition: "background 120ms ease",
          }}
          /* `accentBg` et non `rowHighlight` : la ligne entière porte déjà ce
             dernier au survol, le carré du chevron s'y serait fondu. */
          onMouseEnter={(e) => { if (expandable) e.currentTarget.style.background = T.accentBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <ChevronDown
            size={16} strokeWidth={1.75}
            style={{
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 140ms ease",
              pointerEvents: "none",
            }}
          />
        </button>

        {/* Zone de navigation : tout sauf le chevron ET les actions de fin de
            ligne, qui sont ses FRÈRES (voir plus bas).

            `data-no-press` retire le `transform: scale(0.97)` que globals.css
            applique au `:active` de tout `[role="button"]`. Sur une ligne large
            de plusieurs centaines de pixels, ce retrait de 3 % déplace ses bords
            d'une dizaine de pixels PENDANT l'appui : la cible glissait sous le
            curseur entre le mousedown et le mouseup, le navigateur n'émettait
            alors aucun `click` sur le bouton visé — c'est ce qui donnait des
            boutons « qui ne marchent qu'aux extrémités ». Une ligne de tableau
            n'a de toute façon rien à gagner à se rétrécir au clic. */}
        <div
          role="button"
          tabIndex={0}
          data-no-press
          onClick={onOpen}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
          style={{
            flex: 1, minWidth: 0, cursor: "pointer",
            display: "flex", alignItems: "center",
          }}
        >
          <div style={{ ...NAME_COL, display: "flex", alignItems: "center", gap: 8 }}>
            <RoundLogo src={icon} size={20} fallback={fallbackIcon} name={label} />
            <span title={label} style={{ fontSize: 16, fontWeight: 500, lineHeight: "17.05px", color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </span>
            {/* C'est le NOM qui se tronque, jamais le badge : sans ce
                `flexShrink: 0`, un nom long écrasait « Passer en Funded ». */}
            {badge && <span style={{ flexShrink: 0, display: "inline-flex" }}>{badge}</span>}
          </div>
          {cells.map((c, i) => (
            <span key={i} style={{ ...CELL_VALUE, ...(i === cells.length - 1 ? LAST_CELL : null), textAlign: i === cells.length - 1 ? "right" : "left" }}>{c}</span>
          ))}
        </div>

        {/* Actions de fin de ligne — HORS de la zone de navigation, exactement
            comme le chevron : tant qu'elles en étaient un descendant, il fallait
            arrêter l'événement à la main, et le `:active` de la ligne les
            déplaçait sous le curseur en pleine action. Ici aucun clic sur un
            bouton d'action ne peut atteindre la navigation, il n'y a plus rien à
            intercepter. */}
        {(actions || reserveActions) && (
          <div style={ACTIONS_COL_GAPLESS} aria-hidden={actions ? undefined : true}>{actions}</div>
        )}
      </div>

      {isOpen && (
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
 * à cette firme. Alignée sur les sous-lignes (même gouttière) pour se lire
 * comme la suite de la liste, mais en texte atténué pour rester secondaire.
 */
export function AddAccountRow({ onClick, label, icon }) {
  return (
    <button
      type="button"
      /* Bouton pleine largeur : le `scale` d'appui de globals.css déplacerait ses
         bords d'une dizaine de pixels, et un clic près d'une extrémité se
         perdrait entre l'appui et le relâchement. */
      data-no-press
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingLeft: ROW_GUTTER, paddingRight: 8, marginRight: -8,
        paddingTop: 6, paddingBottom: 6, marginTop: -6, marginBottom: -6,
        border: "none", background: "transparent", borderRadius: 12,
        color: T.textSub, fontSize: 14, lineHeight: "17.05px",
        fontFamily: "inherit", cursor: "pointer", textAlign: "left",
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; e.currentTarget.style.color = T.text; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}
    >
      {/* L'icône est paramétrable : plusieurs actions peuvent clore la liste
          (créer un compte, en rattacher un qui existe déjà) et le « + » ne dit
          pas la seconde. */}
      <span style={{
        width: 12, height: 12, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon || <Plus size={12} strokeWidth={2} />}
      </span>
      {label || t("firms.addAccount")}
    </button>
  );
}

/**
 * Sous-ligne : un compte, à l'intérieur d'une carte. Format compact (14 px,
 * pas de carte propre) — c'est la présentation des comptes d'une firme, aussi
 * bien dépliés sur la page Comptes que listés sur la page détail d'une firme.
 *
 * @param {number=} indent  Retrait à gauche. 30 px aligne sous le chevron d'une
 *   ligne dépliable ; 0 aligne la colonne de nom sur l'en-tête quand il n'y a
 *   pas de chevron (page détail d'une firme).
 */
/**
 * Sous-ligne d'une liste de comptes.
 *
 * Deux emplacements distincts autour du nom, parce que les deux contenus ne
 * jouent pas le même rôle :
 *  - `dot`   : marqueur d'identité (pastille de couleur du compte) → AVANT le
 *              nom, comme une puce de liste ;
 *  - `badge` : élément d'action ou de statut (ex. « Passer en Funded ») → APRÈS
 *              le nom, où on le lit après avoir identifié la ligne.
 */
export function SubRow({ label, dot, badge, cells, onOpen, actions, reserveActions = false, indent = ROW_GUTTER }) {
  return (
    /* La racine porte le survol et la géométrie de la ligne, mais n'est PAS
       cliquable : la navigation vit dans son premier enfant, les actions de fin
       de ligne dans le second. Voir TableRow — une zone de navigation qui
       contient les boutons d'action se les déplace sous le curseur au `:active`,
       et le clic n'arrive jamais. */
    <div
      onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{
        display: "flex", alignItems: "center",
        paddingLeft: indent, paddingRight: 8, marginRight: -8,
        paddingTop: 6, paddingBottom: 6, marginTop: -6, marginBottom: -6,
        borderRadius: 12, transition: "background 120ms ease",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        data-no-press
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onOpen?.(); } }}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", cursor: "pointer" }}
      >
        {/* Retrait par défaut = la gouttière du chevron : le nom d'un compte tombe
            exactement sous le logo de sa firme. Les cellules, elles, sont calées à
            droite en largeur fixe : `indent` ne les déplace pas. */}
        <div style={{ ...NAME_COL, display: "flex", alignItems: "center", gap: 8 }}>
          {dot}
          <span title={label} style={{ fontSize: 14, lineHeight: "17.05px", color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </span>
          {badge && <span style={{ flexShrink: 0, display: "inline-flex" }}>{badge}</span>}
        </div>
        {cells.map((c, i) => (
          <span key={i} style={{ ...CELL_VALUE, ...(i === cells.length - 1 ? LAST_CELL : null), textAlign: i === cells.length - 1 ? "right" : "left" }}>{c}</span>
        ))}
      </div>
      {/* Pas de compensation de gap ici : la ligne n'en a pas. */}
      {(actions || reserveActions) && (
        <div style={ACTIONS_COL} aria-hidden={actions ? undefined : true}>{actions}</div>
      )}
    </div>
  );
}
