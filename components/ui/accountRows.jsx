"use client";

/**
 * Lignes de compte — briques partagées entre la page Comptes et la page détail
 * d'une prop firm, pour que la liste des comptes d'une firme soit présentée
 * exactement comme celle de la page Comptes (même géométrie de colonnes, même
 * carte, même vignette de logo, même en-tête).
 *
 * Extrait de AccountsPage (maquette Figma « My accounts », node 283:10382) :
 * ces composants y étaient locaux, ils sont désormais la source unique.
 */

import React from "react";
import { ChevronDown, Trophy, Plus, Link2 } from "lucide-react";
import { T, tileRadius } from "@/lib/ui/tokens";
import { CARD, TH } from "@/components/ui/da";
import Popover from "@/components/ui/Popover";
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
 * Vignette du logo d'une marque — deux silhouettes, selon ce que la marque est.
 *
 * `shape="tile"` (par défaut) : CARRÉ ARRONDI, réservé aux brokers, aux prop
 * firms et aux plateformes de trading. Leurs logos sont dessinés dans un carré,
 * celui de l'icône d'application : le cercle en coupait les angles, et il
 * fallait rétrécir l'image pour qu'ils y rentrent — le logo flottait alors au
 * milieu d'une couronne vide. Le carré arrondi épouse ce cadre d'origine, donc
 * l'image le remplit BORD À BORD (`cover` sur 100 %) sans rien perdre : la
 * quasi-totalité de ces logos étant en ratio 1:1, `cover` ne rogne pas, il fait
 * coïncider les bords. L'arrondi suit la taille (`tileRadius`) au lieu d'être
 * fixe, sinon la même silhouette change de nature entre 16 et 44 px.
 *
 * `shape="circle"` : le DISQUE, silhouette de tout le reste de l'application —
 * banques et établissements du patrimoine, enseignes des relevés, instruments.
 * Le carré arrondi est donc un marqueur : dans une liste, il dit « compte de
 * trading » avant même qu'on ait lu le nom.
 *
 * Sans logo, on retombe sur une icône ou les initiales — jamais un placeholder
 * inventé.
 */
export function LogoTile({ src, size = 20, fallback, name, shape = "tile" }) {
  return (
    <span style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: shape === "circle" ? "50%" : tileRadius(size),
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

/**
 * Anatomie d'une LIGNE DE COMPTE dans une liste compacte : un marqueur, le nom,
 * le type, la valeur — sur une seule ligne de 32 px.
 *
 * C'est la présentation du menu « N comptes » de la page d'une prop firm, et
 * elle vaut partout où l'on énumère des comptes sans les mettre en tableau
 * (menu de la firme, choix des comptes visés par un import). Elle vit ici, et
 * non recopiée dans chaque page : deux listes de comptes qui divergent, c'est
 * deux fois le même écran avec deux hauteurs de ligne.
 *
 * Un seul étage, jamais le nom au-dessus de son type : sur deux lignes chaque
 * compte pesait 40 px pour deux mots, et la liste ne se lisait plus d'un
 * regard.
 *
 * `marker` est le premier créneau — la pastille de couleur qui rappelle la
 * courbe du compte dans un graphique, une case à cocher quand la ligne est un
 * choix. C'est l'appelant qui sait laquelle des deux a un sens chez lui.
 * `value` est optionnelle : toutes les pages ne connaissent pas les trades d'un
 * compte, et une colonne vide vaut mieux qu'un zéro inventé.
 */
export function AccountLine({ marker, name, type, value, valueColor, dim = false }) {
  return (
    <>
      {marker}
      <span style={{
        fontSize: 13, fontWeight: 500, minWidth: 0, flex: "1 1 auto",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: dim ? T.textSub : T.text,
      }}>
        {name}
      </span>
      {/* Le type SANS sa taille : celle-ci est presque toujours déjà dans le nom
          du compte (« Topstep 50k »), et l'écrire deux fois sur la même ligne la
          rendait illisible. */}
      {type && (
        <span style={{ fontSize: 11, color: T.textMut, whiteSpace: "nowrap", flexShrink: 0 }}>
          {type}
        </span>
      )}
      {value != null && (
        <span style={{
          fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0,
          fontVariantNumeric: "tabular-nums", color: valueColor || T.textSub,
        }}>
          {value}
        </span>
      )}
    </>
  );
}

/** Géométrie du conteneur d'une `AccountLine`, à étaler sur la ligne cliquable. */
export const ACCOUNT_LINE = {
  display: "flex", alignItems: "center", gap: 8, minWidth: 0,
  minHeight: 32, padding: "6px 10px", borderRadius: 6,
};

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
        fontSize:12, lineHeight: "17.05px", fontFamily: "inherit",
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
 * d'une firme), vignette du logo, nom, puis les cellules alignées sur l'en-tête.
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
/**
 * `drag` — tout ce qu'il faut pour attraper la ligne et la reposer ailleurs, ou
 * `null` pour une ligne fixe. La forme :
 *
 *   { dragging, edge, onStart, onOver, onLeave, onDrop, onEnd }
 *
 * Les gestionnaires sont posés sur la RANGÉE et non sur le bloc qui l'englobe :
 * une firme dépliée contient ses comptes, et un `draggable` sur le bloc aurait
 * fait partir la firme entière dès qu'on tirait sur l'un d'eux.
 *
 * `edge` (`"before"` / `"after"`) trace le trait d'insertion. Il est dessiné en
 * `boxShadow` et non en bordure : une bordure ajouterait un pixel à la hauteur
 * de la ligne, et toute la liste sauterait au passage du curseur.
 */
export function TableRow({
  icon, fallbackIcon, label, badge, cells,
  expandable, open, onToggle, onOpen, actions, reserveActions = false, children, flat = false,
  drag = null,
}) {
  const isOpen = expandable && open;
  const edgeShadow = drag?.edge === "before"
    ? `inset 0 2px 0 0 ${T.text}`
    : drag?.edge === "after" ? `inset 0 -2px 0 0 ${T.text}` : "none";
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
        draggable={!!drag}
        onPointerDown={drag?.onPointerDown}
        onDragStart={drag?.onStart}
        onDragOver={drag?.onOver}
        onDragLeave={drag?.onLeave}
        onDrop={drag?.onDrop}
        onDragEnd={drag?.onEnd}
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
          /* La ligne tirée s'efface au lieu de disparaître : on garde sous les
             yeux d'où elle vient pendant qu'on cherche où la poser. */
          ...(drag?.dragging ? { opacity: 0.4, cursor: "grabbing" } : null),
          boxShadow: edgeShadow,
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
          /* Un glissé qui se termine sur sa propre ligne émet quand même un
             `click` : sans ce garde-fou, reposer un compte là où on l'avait pris
             ouvrait sa fiche. */
          onClick={() => { if (!drag?.dragging) onOpen?.(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
          style={{
            flex: 1, minWidth: 0, cursor: "pointer",
            display: "flex", alignItems: "center",
          }}
        >
          <div style={{ ...NAME_COL, display: "flex", alignItems: "center", gap: 8 }}>
            <LogoTile src={icon} size={20} fallback={fallbackIcon} name={label} />
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
          {/* Le filet remonte de la hauteur du padding de survol de la rangée.
              Ce padding est INVISIBLE au repos mais s'ajoutait au `gap` du bloc :
              il y avait 26 px au-dessus du trait contre 16 en dessous, et la
              firme paraissait décrochée de ses propres comptes. Les sous-lignes,
              elles, absorbent déjà le leur (`marginTop: -6`) — d'où le même
              procédé ici, et un écart désormais égal des deux côtés. */}
          <div style={{ height: 1, width: "100%", background: T.border, marginTop: flat ? -10 : 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
        </>
      )}
    </div>
  );
}

/* Ouverture d'un petit menu ancré. Le clic extérieur et Échap sont désormais
   l'affaire du Popover : le panneau étant portalisé, un test de descendance sur
   le déclencheur le tiendrait pour « extérieur » et le fermerait avant le clic.
   Partagé par les deux déclencheurs d'ajout de compte (ligne de liste et
   pastille de barre d'actions), qui ne diffèrent que par leur habillage. */
function useAnchoredMenu() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  return { open, setOpen, ref };
}

/* Les deux façons de garnir la liste d'une firme, dans l'ordre où on les
   cherche : créer un compte, ou récupérer un compte qui existe déjà (saisi
   avant la firme, ou hors firme). */
function AddAccountsMenu({ anchorRef, open, align = "left", onCreate, onAttach, onDone }) {
  const item = {
    width: "100%", display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", minHeight: 36, borderRadius: 8, border: "none",
    background: "transparent", color: T.text, fontSize: 13, fontWeight: 500,
    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
    transition: "background 120ms var(--ease-out, ease)",
  };
  const choose = (fn) => { onDone?.(); fn?.(); };
  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onDone}
      align={align === "right" ? "end" : "start"}
      minWidth={236}
      role="menu"
      className="anim-pop"
      style={{
        background: T.white, border: "none",
        borderRadius: 12, boxShadow: "var(--elev-overlay)", padding: 6,
      }}
    >
      <button type="button" role="menuitem" data-no-press style={item}
        onClick={(e) => { e.stopPropagation(); choose(onCreate); }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
        <Plus size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
        {t("firms.addAccountNew")}
      </button>
      <button type="button" role="menuitem" data-no-press style={item}
        onClick={(e) => { e.stopPropagation(); choose(onAttach); }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.rowHighlight; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
        <Link2 size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
        {t("firms.attachAccount")}
      </button>
    </Popover>
  );
}

/**
 * Dernière sous-ligne d'une firme dépliée : action d'ajout d'un compte rattaché
 * à cette firme. Alignée sur les sous-lignes (même gouttière) pour se lire
 * comme la suite de la liste, mais en texte atténué pour rester secondaire.
 *
 * `onAttach` fourni → la ligne devient un menu à deux entrées (créer / rattacher)
 * au lieu de deux lignes empilées qui disaient deux fois « ajouter ».
 */
export function AddAccountRow({ onClick, label, icon, onAttach }) {
  const { open, setOpen, ref } = useAnchoredMenu();
  const trigger = (
    <button
      type="button"
      /* Bouton pleine largeur : le `scale` d'appui de globals.css déplacerait ses
         bords d'une dizaine de pixels, et un clic près d'une extrémité se
         perdrait entre l'appui et le relâchement. */
      data-no-press
      aria-haspopup={onAttach ? "menu" : undefined}
      aria-expanded={onAttach ? open : undefined}
      onClick={(e) => { e.stopPropagation(); if (onAttach) setOpen((v) => !v); else onClick?.(); }}
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
      {onAttach && (
        <ChevronDown
          size={13} strokeWidth={2}
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 140ms var(--ease-out, ease)" }}
        />
      )}
    </button>
  );

  if (!onAttach) return trigger;
  return (
    <div ref={ref} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
      {trigger}
      <AddAccountsMenu anchorRef={ref} open={open} onCreate={onClick} onAttach={onAttach} onDone={() => setOpen(false)} />
    </div>
  );
}

/**
 * Même choix, en pilule bordée sur le fond des cartes. Un seul bouton plutôt que
 * « Ajouter » + « Rattacher » côte à côte, qui se disputaient la même intention.
 *
 * L'aplat d'encre est passé à « Modifier la firme », qui est l'action pour
 * laquelle on ouvre la page : garnir la firme se fait une fois, la régler se
 * refait. Deux pleins côte à côte n'auraient rien hiérarchisé du tout.
 */
export function AddAccountsButton({ onCreate, onAttach }) {
  const { open, setOpen, ref } = useAnchoredMenu();
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        data-no-press
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
          minHeight: 34, borderRadius: 999, border: `1px solid ${T.border}`, background: T.white,
          color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <Plus size={13} strokeWidth={1.75} /> {t("firms.addAccount")}
        <ChevronDown
          size={13} strokeWidth={2}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 140ms var(--ease-out, ease)" }}
        />
      </button>
      <AddAccountsMenu anchorRef={ref} open={open} align="right" onCreate={onCreate} onAttach={onAttach} onDone={() => setOpen(false)} />
    </div>
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
