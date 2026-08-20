"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useSwipeToDismiss } from "@/lib/hooks/useSwipeToDismiss";
import { useModalExit } from "@/lib/hooks/useModalExit";
import { useScrollLock } from "@/lib/hooks/useScrollLock";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Hauteur maximale, en fraction de la hauteur d'écran utile. */
  maxHeight?: string;
  children: React.ReactNode;
}

/** Durée de la sortie — doit rester égale à celle de `.tr4de-sheet.is-closing`. */
const EXIT_MS = 220;

/**
 * Feuille basse (« bottom sheet ») — la surface modale du tactile.
 *
 * Pourquoi pas une boîte de dialogue centrée : sur un téléphone tenu à une
 * main, le centre de l'écran est à peu près le seul endroit que le pouce
 * n'atteint pas. Une feuille arrive par le bas, ses actions naissent DANS la
 * zone de préhension, et elle laisse voir le contexte qu'elle recouvre au lieu
 * de le remplacer.
 *
 * Ce qui la rend physique plutôt que décorative :
 *
 *   • Elle se saisit et se repousse au doigt, avec la vraie physique du geste
 *     (`useSwipeToDismiss`) : suivi au pixel, décision à la VITESSE de
 *     relâchement — pas seulement à la distance —, et résistance élastique si
 *     l'on tire vers le haut au lieu de vers le bas.
 *   • Elle entre et ressort par le MÊME chemin. Une surface qui arrive du bas
 *     et disparaît en fondu perd le lien spatial : on ne sait plus où elle est
 *     partie, ni par où la rappeler.
 *   • Le voile s'assombrit pour désigner la feuille comme la tâche du moment,
 *     et il est cliquable — la sortie ne dépend jamais du seul geste.
 */
export default function Sheet({ open, onClose, title, maxHeight = "min(80dvh, 640px)", children }: SheetProps) {
  const { closing, requestClose } = useModalExit(onClose, EXIT_MS);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // Le geste vaut demande de fermeture, pas fermeture : il passe par la même
  // porte que le voile et Échap, donc la surface finit sa course au lieu de
  // disparaître à l'instant où le doigt se lève.
  /* Déstructuré à l'appel plutôt que gardé en objet : lire `swipe.ref` dans le
     JSX se lit comme un accès à une ref pendant le rendu (règle
     `react-hooks/refs`). Même convention que la barre latérale. */
  const { ref: sheetRef, handlers: swipeHandlers } = useSwipeToDismiss<HTMLDivElement>({
    onDismiss: requestClose,
    axis: "y",
    direction: 1,
    enabled: open && !closing,
  });

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); requestClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  /* Verrou de défilement du fond. Sans lui, un glissé qui commence sur la
     feuille mais continue au-delà de sa fin fait défiler la PAGE derrière —
     l'utilisateur perd sa position de lecture en refermant une feuille. */
  useScrollLock(open);

  if (!mounted || !open) return null;

  return createPortal(
    /* C'est ce conteneur qui ancre la feuille en bas — la classe, elle, ne
       décrit que son apparence, pour pouvoir servir aussi à la modale
       partagée qui, elle, est placée par son propre voile. */
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div
        className={`tr4de-sheet-scrim ${closing ? "is-closing" : ""}`}
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        {...swipeHandlers}
        className={`tr4de-sheet ${closing ? "is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        style={{ maxHeight }}
      >
        {/* Poignée : elle dit « ceci se saisit » avant tout geste. Sans cet
            indice, la possibilité de repousser la feuille au doigt n'existe
            que pour qui l'essaie par hasard. */}
        <div className="tr4de-sheet-handle" aria-hidden="true">
          <span />
        </div>

        {title && (
          <div
            style={{
              padding: "0 20px 12px",
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "var(--color-text)",
            }}
          >
            {title}
          </div>
        )}

        <div
          className="scroll-thin"
          style={{
            overflowY: "auto",
            // Défilement confiné : arrivé en bout de liste, la page derrière ne
            // prend PAS le relais du geste.
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            padding: "0 16px",
            // La réserve de la barre de gestes vit dans le padding de fin : la
            // dernière entrée de la liste reste atteignable au pouce.
            paddingBottom: "calc(16px + var(--sa-bottom))",
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
