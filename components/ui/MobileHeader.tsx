"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";

interface MobileHeaderProps {
  title: string;
  /** Affiche le chevron de retour et le câble sur ce rappel. */
  onBack?: () => void;
  /** Contenu aligné à droite (bouton d'action de la page). */
  action?: React.ReactNode;
  /** Élément défilant à surveiller pour révéler le bord de l'en-tête. */
  scrollRef?: React.RefObject<HTMLElement | null>;
}

/**
 * En-tête mobile — la réponse à « où suis-je ? ».
 *
 * L'ancienne barre du haut ne contenait qu'un hamburger : aucun écran ne
 * disait son nom. Sur un site, l'onglet du navigateur et l'URL portent cette
 * information ; en application installée, il n'y a ni l'un ni l'autre, et
 * l'écran devient anonyme.
 *
 * Le retour est un vrai retour d'historique, pas un raccourci vers un écran
 * choisi d'avance : depuis le détail d'un compte, on revient là d'où l'on
 * vient — la liste des comptes ou le tableau de bord —, ce qui est aussi ce
 * que fait le bouton système d'Android et le balayage depuis le bord d'iOS.
 */
export default function MobileHeader({ title, onBack, action, scrollRef }: MobileHeaderProps) {
  const ref = React.useRef<HTMLElement>(null);

  /* Le filet sous l'en-tête n'apparaît que si du contenu passe DESSOUS. Une
     bordure permanente trace une frontière même sur une page courte, là où il
     n'y a rien à séparer. */
  React.useEffect(() => {
    const scroller = scrollRef?.current;
    const el = ref.current;
    if (!el) return;
    const target: HTMLElement | Window = scroller ?? window;
    const read = () => (scroller ? scroller.scrollTop : window.scrollY);
    const onScroll = () => {
      if (read() > 2) el.setAttribute("data-scrolled", "");
      else el.removeAttribute("data-scrolled");
    };
    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  return (
    <header ref={ref} className="tr4de-mobile-header">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          style={{
            /* Cible carrée de 44 px pour un chevron de 22 : c'est la ZONE qu'on
               agrandit, pas le dessin. */
            width: 44,
            height: 44,
            marginLeft: -10,
            display: "grid",
            placeItems: "center",
            border: "none",
            background: "transparent",
            color: "var(--color-text)",
            cursor: "pointer",
            flexShrink: 0,
            touchAction: "manipulation",
          }}
        >
          <ChevronLeft size={24} strokeWidth={2} />
        </button>
      )}

      <h1
        style={{
          flex: 1,
          minWidth: 0,
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          /* Interlettrage resserré : à 17 px et en 600, les lettres d'Outfit
             s'écartent visuellement. Le réglage suit la taille, il n'est pas
             posé une fois pour toutes. */
          letterSpacing: "-0.01em",
          lineHeight: 1.2,
          color: "var(--color-text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </h1>

      {action && <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>{action}</div>}
    </header>
  );
}
