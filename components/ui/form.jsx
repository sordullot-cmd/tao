"use client";

/* ============================================================================
   Champs, formulaires et modales — briques de la nouvelle direction artistique.

   La référence est la modale « Nouvelle séance » (SessionForm, SportPage) :
   c'est elle qui fixe le langage, tout le reste s'aligne dessus.

   Ce que dit cette référence, et qui ne va pas de soi :

   • La modale est une FENÊTRE, pas un écran de blocage. Voile transparent —
     aucun assombrissement —, ombre de couche flottante pour tout détachement,
     et on l'attrape par son en-tête pour la déplacer où l'on veut. On garde
     donc sous les yeux le contexte qu'on est en train de modifier.
   • L'en-tête ne porte PAS de titre. Une poignée centrée, les actions d'icône
     à droite, rien d'autre. Le titre était une ligne de chrome de plus à lire
     avant d'arriver au formulaire — le bouton qui a ouvert la fenêtre a déjà
     dit ce qu'elle fait.
   • Un champ est une PILULE en aplat (rayon 999, `FIELD_BG`), pas un rectangle
     cerné. Sur un formulaire de dix champs, dix contours faisaient dix
     rectangles à lire avant d'atteindre le contenu.
   • Les boutons sont des pilules pleines : `FIELD_BG` en secondaire, encre
     pleine en primaire. Jamais de contour.

   L'aplat est exprimé en TRANSPARENCE d'encre (color-mix sur la couleur de
   texte) et non en gris opaque : il s'inverse tout seul en thème sombre, sans
   valeur dédiée à maintenir.
   ========================================================================== */

import React from "react";
import ReactDOM from "react-dom";
import { Check, X } from "lucide-react";
import { T, FIELD_BG, WRITING_BG, HAIRLINE } from "@/lib/ui/tokens";
import { BTN } from "@/lib/ui/buttons";
import { luminance } from "@/lib/ui/color";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { useModalExit } from "@/lib/hooks/useModalExit";
import { useScrollEdges, scrollEdgeShadow } from "@/lib/hooks/useScrollEdges";

/* ── Contrôles ───────────────────────────────────────────────────────────── */

/**
 * Champ de saisie sur une ligne : pilule en aplat.
 *
 * `minWidth: 0` et `boxSizing` sont là pour de bonnes raisons : sans le
 * premier, un champ dans une grille refuse de descendre sous sa largeur
 * intrinsèque et fait déborder la ligne ; sans le second, le padding s'ajoute
 * au `width: 100%`.
 */
/** @type {import("react").CSSProperties} */
export const FIELD = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "9px 14px",
  borderRadius: 999,
  border: "none",
  background: FIELD_BG,
  color: T.text,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

/**
 * Zone d'écriture. Rayon 14 et non 999 : une pilule haute de cent pixels n'est
 * plus une pilule, ses extrémités deviennent deux demi-cercles absurdes.
 * Aplat plus dilué aussi — la même valeur d'encre, étalée sur cette hauteur,
 * ne se lit plus comme un creux mais comme un pavé gris.
 */
/** @type {import("react").CSSProperties} */
export const FIELD_AREA = {
  ...FIELD,
  borderRadius: 14,
  background: WRITING_BG,
  minHeight: 92,
  padding: "10px 14px",
  lineHeight: 1.45,
  resize: "vertical",
};

/** Variante compacte, pour les lignes de tableau et les barres d'outils. */
/** @type {import("react").CSSProperties} */
export const FIELD_SM = { ...FIELD, padding: "6px 12px", fontSize: 12 };

/**
 * Anneau de focus. Sans cadre au repos, c'est lui qui dit « c'est ici que ça
 * écrit » — il ne peut donc pas être décoratif. Posé en `box-shadow` pour ne
 * pas déplacer la mise en page d'un pixel à la prise de focus.
 */
export const FIELD_FOCUS_RING =
  "0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent)";

function focusHandlers(onFocus, onBlur) {
  return {
    onFocus: (e) => { e.currentTarget.style.boxShadow = FIELD_FOCUS_RING; onFocus?.(e); },
    onBlur: (e) => { e.currentTarget.style.boxShadow = "none"; onBlur?.(e); },
  };
}

/** @param {{ style?: import("react").CSSProperties, onFocus?: Function, onBlur?: Function, compact?: boolean } & Record<string, any>} props */
export function Input({ style = undefined, onFocus = undefined, onBlur = undefined, compact = false, ...rest }) {
  return (
    <input
      {...focusHandlers(onFocus, onBlur)}
      style={{ ...(compact ? FIELD_SM : FIELD), ...style }}
      {...rest}
    />
  );
}

/**
 * Zone de saisie multiligne.
 *
 * Elle transmet sa `ref` : certaines saisies ont besoin de l'élément lui-même,
 * pas seulement de sa valeur — poser un trou autour de la sélection courante
 * (éditeur de cartes), replacer le curseur après une insertion. Sans
 * transmission, ces gestes obligeraient à redéfinir un champ en local, ce que la
 * charte interdit.
 */
/** @param {{ style?: import("react").CSSProperties, onFocus?: Function, onBlur?: Function } & Record<string, any>} props */
export const Textarea = React.forwardRef(function Textarea(
  { style = undefined, onFocus = undefined, onBlur = undefined, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...focusHandlers(onFocus, onBlur)}
      style={{ ...FIELD_AREA, ...style }}
      {...rest}
    />
  );
});

/** @param {{ style?: import("react").CSSProperties, onFocus?: Function, onBlur?: Function, children?: import("react").ReactNode } & Record<string, any>} props */
export function Select({ style = undefined, onFocus = undefined, onBlur = undefined, children = undefined, ...rest }) {
  return (
    <select
      {...focusHandlers(onFocus, onBlur)}
      style={{ ...FIELD, cursor: "pointer", ...style }}
      {...rest}
    >
      {children}
    </select>
  );
}

/* ── Boutons ─────────────────────────────────────────────────────────────── */

/**
 * Bouton d'action : pilule pleine, jamais de contour.
 *
 * Un bouton désactivé retombe sur l'aplat plutôt que de se contenter d'une
 * opacité : un bouton primaire à 50 % reste plus visible que les actions
 * réellement disponibles autour de lui.
 */
/** @param {{ variant?: string, disabled?: boolean, compact?: boolean, style?: import("react").CSSProperties, children?: import("react").ReactNode } & Record<string, any>} props */
export function PillButton({
  variant = "secondary",
  disabled = false,
  compact = false,
  style = undefined,
  children = undefined,
  ...rest
}) {
  const skins = {
    primary: { background: T.text, color: T.textInverted },
    secondary: { background: FIELD_BG, color: T.text },
    ghost: { background: "transparent", color: T.textSub },
    danger: { background: T.redBg, color: T.red },
  };
  const skin = disabled ? { background: FIELD_BG, color: T.textSub } : skins[variant];
  const metrics = compact ? BTN.sm : BTN.md;
  return (
    <button
      disabled={disabled}
      /* Métriques : BTN (lib/ui/buttons.ts), jamais des nombres écrits ici.
         `compact` = le palier `sm`, qui a maintenant une hauteur minimale au
         lieu de zéro : sans elle, un bouton compact portant une icône était
         plus haut que son voisin qui n'en porte pas. */
      style={{
        minHeight: metrics.minHeight,
        padding: metrics.padding,
        borderRadius: metrics.borderRadius,
        border: "none",
        fontSize: metrics.fontSize,
        fontWeight: metrics.fontWeight,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: metrics.gap,
        whiteSpace: "nowrap",
        transition: "var(--tr-ui)",
        ...skin,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Bouton d'icône rond de l'en-tête d'une modale (fermer, supprimer).
 *
 * Sans fond au repos : dans un en-tête qui ne porte rien d'autre, un aplat
 * permanent ferait de la fermeture l'élément le plus visible de la fenêtre.
 */
/** @param {{ tone?: string, style?: import("react").CSSProperties, children?: import("react").ReactNode } & Record<string, any>} props */
export function IconButton({ tone = "neutral", style = undefined, children = undefined, ...rest }) {
  const hover = tone === "danger"
    ? { bg: T.redBg, fg: T.red }
    : { bg: FIELD_BG, fg: T.text };
  return (
    <button
      type="button"
      style={{
        width: 28, height: 28, borderRadius: "50%", border: "none",
        background: "transparent", color: T.textSub, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "var(--tr-ui)", flexShrink: 0,
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hover.bg; e.currentTarget.style.color = hover.fg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Case à cocher de l'app : carré au trait dilué au repos, aplat plein coché.
 *
 * Elle remplace `<input type="checkbox">` partout où la ligne entière est
 * cliquable : la case native ne suit ni le rayon ni l'encre de la DA, et son
 * `accentColor` ne dit rien du glyphe posé dessus.
 *
 * `color` attend de préférence un HEX — les principales de la charte sont
 * claires (Owl rend 2,09:1 sur blanc), une coche blanche y disparaîtrait. Le
 * glyphe est donc calculé à partir de la luminance de l'aplat, seuil 0,45,
 * comme les autres coches sur couleur de l'app. Une valeur non hexadécimale
 * (une `var()`) retombe sur l'encre claire, le repli le moins risqué.
 *
 * `partial` sert aux têtes de groupe dont seule une partie des lignes est
 * cochée : un tiret, pas une coche.
 */
/** @param {{ on?: boolean, partial?: boolean, color?: string, size?: number }} props */
export function CheckBox({ on = false, partial = false, color = T.text, size = 16 }) {
  const filled = on || partial;
  const glyph = luminance(color) > 0.45 ? T.text : T.onSolid;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: "var(--radius-field)", flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${filled ? color : HAIRLINE}`,
        background: filled ? color : "transparent",
        transition: "var(--tr-ui)",
      }}
    >
      {on && <Check size={size - 4} strokeWidth={3} color={glyph} />}
      {!on && partial && (
        <span style={{ width: size - 7, height: 1.5, borderRadius: 1, background: glyph }} />
      )}
    </span>
  );
}

/* ── Étiquetage ──────────────────────────────────────────────────────────── */

/** Libellé d'un champ : 12 px atténué, jamais de capitales espacées. */
/** @param {{ children?: import("react").ReactNode, style?: import("react").CSSProperties }} props */
export function Label({ children, style = undefined }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 500, color: T.text, opacity: 0.5, ...style }}>
      {children}
    </div>
  );
}

/**
 * Champ étiqueté : libellé 12 px atténué au-dessus, contrôle en dessous.
 *
 * Le libellé est en minuscules atténuées et non en capitales espacées : les
 * capitales se lisent moins vite et, répétées sur douze champs, elles crient
 * plus fort que les valeurs qu'elles annoncent.
 */
/** @param {{ label?: import("react").ReactNode, hint?: import("react").ReactNode, error?: import("react").ReactNode, required?: boolean, children?: import("react").ReactNode, style?: import("react").CSSProperties }} props */
export function Field({ label, hint = undefined, error = undefined, required = false, children = undefined, style = undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, ...style }}>
      {label && (
        <Label>
          {label}
          {required && <span style={{ color: T.red, marginLeft: 3 }} aria-hidden="true">*</span>}
        </Label>
      )}
      {children}
      {/* L'erreur remplace l'aide : afficher les deux ferait lire deux fois. */}
      {error
        ? <div role="alert" style={{ fontSize: 11, color: T.red, lineHeight: 1.5 }}>{error}</div>
        : hint ? <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  );
}

/** Grille de champs : N colonnes en large, une seule dès que c'est étroit
 *  (le repli est dans globals.css, sur `.tr4de-field-grid`). */
/** @param {{ columns?: number, gap?: number, children?: import("react").ReactNode, style?: import("react").CSSProperties }} props */
export function FieldGrid({ columns = 2, gap = 14, children = undefined, style = undefined }) {
  return (
    <div
      className="tr4de-field-grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Bloc groupé dans une modale (panneau de choix, encart d'options) : un aplat
 * arrondi, sans contour. C'est le seul niveau d'imbrication autorisé — au-delà,
 * on empile des cadres.
 */
export function FieldGroup({ children = undefined, style = undefined }) {
  return (
    <div style={{ background: FIELD_BG, border: "none", borderRadius: 12, padding: 12, ...style }}>
      {children}
    </div>
  );
}

/* ── Zone défilante ──────────────────────────────────────────────────────── */

/**
 * Zone qui défile, avec ses ombres de bord.
 *
 * Autonome exprès : elle porte sa propre ref et son propre hook. Les dialogues
 * écrits à la main vivent au milieu de composants de page de deux mille lignes,
 * où glisser un `useRef` au bon endroit est laborieux et fragile. Ici le
 * remplacement se fait sur place, une balise contre une balise.
 */
/** @param {{ style?: import("react").CSSProperties, className?: string, children?: import("react").ReactNode } & Record<string, any>} props */
export function ScrollArea({ style = undefined, className = undefined, children = undefined, ...rest }) {
  const ref = React.useRef(null);
  const edges = useScrollEdges(ref);
  return (
    <div
      ref={ref}
      className={["scroll-thin", className].filter(Boolean).join(" ")}
      style={{
        overflowY: "auto",
        minHeight: 0,
        boxShadow: scrollEdgeShadow(edges),
        transition: "box-shadow var(--dur-fast) var(--ease-out)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── Modale ──────────────────────────────────────────────────────────────── */

/**
 * Déplacement de la fenêtre à la souris, par son en-tête.
 *
 * Souris seule, volontairement : sur un écran tactile la modale occupe déjà
 * presque toute la largeur — il n'y a nulle part où la déplacer — et le geste
 * entrerait en concurrence avec le défilement du formulaire.
 */
function useWindowDrag() {
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const ref = React.useRef(null);

  const onMouseDown = React.useCallback((e) => {
    // Un clic sur une action de l'en-tête n'est pas une prise de fenêtre.
    if (e.target.closest("button")) return;
    e.preventDefault();
    setDragging(true);
    ref.current = { x: pos.x, y: pos.y, startX: e.clientX, startY: e.clientY };
    const onMove = (ev) => {
      const d = ref.current;
      if (!d) return;
      setPos({ x: d.x + (ev.clientX - d.startX), y: d.y + (ev.clientY - d.startY) });
    };
    const onUp = () => {
      ref.current = null;
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pos.x, pos.y]);

  return { pos, dragging, onMouseDown };
}

/**
 * Modale de la DA — calquée sur « Nouvelle séance ».
 *
 * Structure : poignée + actions d'icône en haut, corps défilant, pied
 * d'actions en pilules. Aucun titre dans le chrome.
 *
 * @param title     lu par les lecteurs d'écran uniquement, jamais affiché — le
 *                  chrome n'a pas de barre de titre, mais un dialogue sans nom
 *                  accessible est inutilisable au lecteur d'écran.
 * @param draggable faux pour une fenêtre qui n'a nulle part où aller.
 * @param scrim     vrai pour assombrir le fond. Réservé aux décisions
 *                  irréversibles, où voir le contexte importe moins que
 *                  comprendre qu'on doit répondre.
 * @param onDelete  ajoute l'action de suppression à gauche de la fermeture.
 */
/** @param {{ open?: boolean, title?: string, onClose?: Function, onDelete?: Function, deleteLabel?: string, children?: import("react").ReactNode, footer?: import("react").ReactNode, width?: number, maxHeight?: string, draggable?: boolean, scrim?: boolean, style?: import("react").CSSProperties, bodyStyle?: import("react").CSSProperties }} props */
export function Modal({
  open = true,
  title = undefined,
  onClose = undefined,
  onDelete = undefined,
  deleteLabel = "Supprimer",
  children = undefined,
  footer = undefined,
  width = 560,
  maxHeight = "min(88vh, 820px)",
  draggable = true,
  scrim = false,
  bodyStyle = undefined,
}) {
  const { pos, dragging, onMouseDown } = useWindowDrag();
  const { closing, requestClose } = useModalExit(onClose, 160);

  // Échap ferme : la fenêtre n'a pas de barre de titre système pour le faire.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); requestClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  if (!open || typeof document === "undefined") return null;

  const moved = pos.x !== 0 || pos.y !== 0;

  return ReactDOM.createPortal(
    <div
      {...backdropDismiss(requestClose)}
      className={closing ? "anim-backdrop-out" : "anim-backdrop"}
      data-scrim={scrim ? "" : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        /* Voile transparent : la modale est une fenêtre posée sur le travail en
           cours, pas un écran qui l'efface. L'extérieur reste cliquable pour
           fermer, mais on continue de voir ce qu'on modifie — ce qui est tout
           l'intérêt de pouvoir déplacer la fenêtre pour lire dessous. */
        background: scrim ? "rgba(13, 13, 13, 0.42)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        /* Une fois la fenêtre déplacée, plus d'animation : elle vit dans le même
           `transform` que la position, et l'animation l'écraserait — la fenêtre
           sauterait au centre le temps de jouer. */
        className={`tr4de-modal-card ${moved ? "" : (closing ? "anim-modal-out" : "anim-modal")}`}
        style={{
          width: `min(${width}px, 100%)`,
          maxHeight,
          display: "flex", flexDirection: "column",
          background: T.white,
          border: "none",
          borderRadius: "var(--radius-modal)",
          boxShadow: "var(--elev-overlay)",
          overflow: "hidden",
          transform: moved ? `translate(${pos.x}px, ${pos.y}px)` : undefined,
        }}
      >
        {/* En-tête : une poignée, des actions. Pas de titre. */}
        <div
          onMouseDown={draggable ? onMouseDown : undefined}
          style={{
            position: "relative",
            padding: "8px 12px",
            display: "flex", alignItems: "center", gap: 10,
            cursor: draggable ? "move" : "default",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          {draggable && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute", left: "50%", top: 7, transform: "translateX(-50%)",
                width: 40, height: 4, borderRadius: 999,
                background: dragging ? T.textSub : T.border,
                transition: "background-color 120ms ease",
              }}
            />
          )}
          {onDelete && (
            <IconButton
              tone="danger"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onDelete}
              aria-label={deleteLabel}
              title={deleteLabel}
              style={{ marginLeft: "auto" }}
            >
              <TrashGlyph />
            </IconButton>
          )}
          {onClose && (
            <IconButton
              onMouseDown={(e) => e.stopPropagation()}
              onClick={requestClose}
              aria-label="Fermer"
              style={{ marginLeft: onDelete ? 0 : "auto" }}
            >
              <X size={16} strokeWidth={1.9} />
            </IconButton>
          )}
        </div>

        {/* Corps. `minHeight: 0` (via ScrollArea) : sans lui, un enfant flex
            refuse de descendre sous sa hauteur de contenu — et c'est la modale
            entière qui déborde au lieu que son corps défile. */}
        <ScrollArea style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14, ...bodyStyle }}>
          {children}
        </ScrollArea>

        {footer && (
          <div style={{
            flexShrink: 0,
            padding: "12px 18px",
            /* Le seul filet de la fenêtre, et il est dilué : le pied porte des
               actions engageantes, il doit se détacher du contenu qu'on vient
               de remplir. Partout ailleurs, l'espace suffit. */
            borderTop: `1px solid ${HAIRLINE}`,
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            gap: 8, flexWrap: "wrap",
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* Corbeille dessinée à la main : importer `Trash2` ici obligerait toutes les
   pages qui n'affichent jamais l'action de suppression à embarquer l'icône. */
function TrashGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
