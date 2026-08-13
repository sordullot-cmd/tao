"use client";

/**
 * Popover ancré — la couche flottante commune à TOUS les menus du site.
 *
 * Le problème qu'il résout : un menu en `position: absolute` vit dans le flux de
 * son parent. Dès qu'un ancêtre porte `overflow` — corps de modale qui défile,
 * carte en `overflow: hidden`, tableau à défilement horizontal — le menu est
 * découpé à ses bords. On voyait donc trois options sur douze, sans pouvoir
 * faire défiler la liste : elle n'était pas trop courte, elle était rognée.
 *
 * La correction est structurelle : le panneau est PORTALISÉ dans `document.body`
 * et positionné en `fixed` à partir du rectangle de son ancre. Plus aucun
 * ancêtre ne peut le rogner, puisqu'il n'en a plus. En contrepartie, il faut
 * suivre l'ancre à la main — d'où le repositionnement sur `scroll` (en phase de
 * capture, pour attraper AUSSI les conteneurs internes qui défilent) et sur
 * `resize`.
 *
 * Il bascule au-dessus de l'ancre quand le bas de l'écran manque, et sa hauteur
 * maximale est toujours bornée par la place réellement disponible : un menu ne
 * peut plus déborder sous la ligne de flottaison.
 */

import React from "react";
import ReactDOM from "react-dom";

/** Marge minimale conservée entre le panneau et les bords de l'écran. */
const SCREEN_MARGIN = 8;
/** En dessous de cette hauteur utile, on préfère basculer de l'autre côté. */
const MIN_USEFUL = 160;
/** Au-dessus des modales (z-index 10000). */
const Z_POPOVER = 12000;

export interface PopoverProps {
  /** Élément sur lequel le panneau s'aligne (le déclencheur). */
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  /** Appelé sur clic extérieur et sur Échap. */
  onClose?: () => void;
  /** `start` aligne les bords gauches, `end` les bords droits. */
  align?: "start" | "end";
  /** Écart vertical entre l'ancre et le panneau. */
  gap?: number;
  /** Le panneau prend exactement la largeur de l'ancre (cas des champs). */
  matchAnchorWidth?: boolean;
  minWidth?: number;
  /** Le panneau ne peut pas être plus étroit que son ancre (menu de champ large
   *  dont le contenu, lui, est court). Ignoré si `matchAnchorWidth`. */
  atLeastAnchorWidth?: boolean;
  maxHeight?: number;
  /**
   * `false` quand l'appelant gère lui-même le défilement interne (en-tête figé
   * + liste défilante). Le panneau passe alors en colonne flex, et c'est à
   * l'enfant défilant de porter `flex: 1; min-height: 0; overflow-y: auto`.
   */
  scroll?: boolean;
  closeOnOutside?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  role?: string;
  id?: string;
  "aria-label"?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

interface Placement {
  left: number;
  top?: number;
  bottom?: number;
  width?: number;
  minWidth?: number;
  maxHeight: number;
}

/** Le panneau flottant qui contient ce nœud, s'il y en a un. */
function closestPopoverPanel(node: Node | null): Element | null {
  if (!node) return null;
  const el = node instanceof Element ? node : node.parentElement;
  return el?.closest("[data-popover-panel]") ?? null;
}

const samePlacement = (a: Placement | null, b: Placement) =>
  a !== null &&
  a.left === b.left &&
  a.top === b.top &&
  a.bottom === b.bottom &&
  a.width === b.width &&
  a.minWidth === b.minWidth &&
  a.maxHeight === b.maxHeight;

export default function Popover({
  anchorRef,
  open,
  onClose,
  align = "start",
  gap = 6,
  matchAnchorWidth = false,
  minWidth,
  atLeastAnchorWidth = false,
  maxHeight = 320,
  scroll = true,
  closeOnOutside = true,
  className,
  style,
  children,
  ...rest
}: PopoverProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<Placement | null>(null);

  const place = React.useCallback(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const below = vh - r.bottom - gap - SCREEN_MARGIN;
    const above = r.top - gap - SCREEN_MARGIN;
    // Hauteur naturelle du contenu : inutile de basculer pour un menu de deux
    // lignes qui tient déjà sous l'ancre.
    const natural = panelRef.current?.scrollHeight ?? maxHeight;
    const wanted = Math.min(maxHeight, natural);
    const flip = below < Math.min(wanted, MIN_USEFUL) && above > below;
    const space = Math.max(MIN_USEFUL, flip ? above : below);

    const floor = atLeastAnchorWidth && !matchAnchorWidth
      ? Math.max(minWidth ?? 0, r.width)
      : minWidth;
    const measured = panelRef.current?.offsetWidth ?? 0;
    const w = matchAnchorWidth ? r.width : Math.max(measured, floor ?? 0);
    let left = align === "end" ? r.right - w : r.left;
    // Recalage horizontal : un menu aligné à droite d'un déclencheur en bord
    // d'écran sortirait du cadre.
    left = Math.min(Math.max(SCREEN_MARGIN, left), Math.max(SCREEN_MARGIN, vw - w - SCREEN_MARGIN));

    const next: Placement = {
      left: Math.round(left),
      top: flip ? undefined : Math.round(r.bottom + gap),
      bottom: flip ? Math.round(vh - r.top + gap) : undefined,
      width: matchAnchorWidth ? Math.round(r.width) : undefined,
      minWidth: floor != null ? Math.round(floor) : undefined,
      maxHeight: Math.round(Math.min(maxHeight, space)),
    };
    // Comparaison avant écriture : le ResizeObserver ci-dessous rappellerait
    // sinon `place` à chaque rendu qu'il provoque lui-même.
    setPos((prev) => (samePlacement(prev, next) ? prev : next));
  }, [anchorRef, align, gap, matchAnchorWidth, atLeastAnchorWidth, minWidth, maxHeight]);

  // Mesure avant peinture : le panneau ne doit jamais s'afficher mal placé.
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
  }, [open, place, children]);

  React.useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    // `capture: true` — un `scroll` ne remonte pas, il faut donc l'intercepter
    // à la descente pour voir défiler les conteneurs internes.
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onMove) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    if (ro && anchorRef?.current) ro.observe(anchorRef.current);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      ro?.disconnect();
    };
  }, [open, place, anchorRef]);

  React.useEffect(() => {
    if (!open || !closeOnOutside) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      // Le déclencheur gère lui-même sa bascule : le fermer ici le rouvrirait
      // aussitôt au `click` qui suit.
      if (anchorRef?.current?.contains(target)) return;
      /* Menus imbriqués : un popover ouvert DEPUIS ce panneau (un calendrier
         dans un menu, par exemple) est un portail FRÈRE, pas un descendant —
         un simple `contains` le prendrait pour l'extérieur et refermerait le
         parent au premier clic dans l'enfant. Les portails s'ajoutent dans
         l'ordre de montage : un panneau qui SUIT celui-ci dans le document est
         donc né de lui. */
      const other = closestPopoverPanel(target);
      if (
        other && panelRef.current &&
        panelRef.current.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING
      ) return;
      onClose?.();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose?.(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeOnOutside, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      className={className}
      data-popover-panel=""
      style={{
        position: "fixed",
        zIndex: Z_POPOVER,
        left: pos?.left ?? 0,
        top: pos?.top,
        bottom: pos?.bottom,
        width: pos?.width,
        minWidth: pos?.minWidth ?? minWidth,
        maxHeight: pos?.maxHeight ?? maxHeight,
        ...(scroll
          ? { overflowY: "auto" as const, overscrollBehavior: "contain" as const }
          : { display: "flex", flexDirection: "column" as const, overflow: "hidden" }),
        // Premier rendu : le panneau doit exister pour être mesuré, mais pas
        // être vu tant qu'il n'est pas placé.
        visibility: pos ? "visible" : "hidden",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Vrai si le nœud appartient à un panneau flottant (utile aux gestionnaires
 *  de clic extérieur qui doivent ignorer les menus portalisés). */
export function isInsidePopover(node: Node | null): boolean {
  return closestPopoverPanel(node) !== null;
}
