"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

export interface TabItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Onglet d'action (le « + » central) : traité comme une cible, pas comme une destination. */
  primary?: boolean;
}

interface TabBarProps {
  items: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Vrai quand l'onglet « Plus » est ouvert : il doit s'afficher actif. */
  moreOpen?: boolean;
}

/**
 * Barre d'onglets basse — la navigation principale sur téléphone.
 *
 * Pourquoi elle remplace le hamburger : la navigation est l'action la plus
 * fréquente de l'application, et elle vivait dans le coin SUPÉRIEUR GAUCHE,
 * c'est-à-dire le point le plus difficile à atteindre du pouce sur un grand
 * téléphone. Une barre basse met les quatre destinations les plus utilisées à
 * portée immédiate, et affiche en permanence où l'on se trouve — deux choses
 * qu'un tiroir refermé ne peut pas faire.
 *
 * Détails qui font la différence :
 *
 *   • Matériau translucide plutôt qu'un aplat opaque : le contenu défile
 *     visiblement dessous, la barre se lit comme une couche flottante et non
 *     comme une bande qui ampute l'écran.
 *   • Retour visuel à l'APPUI (`pointerdown`), pas au relâchement. Attendre le
 *     `click` donne une interface morte de ~100 ms.
 *   • La réserve de la barre de gestes (`--sa-bottom`) est dans le padding, pas
 *     dans la hauteur : les cibles restent hautes de 44 px et collées au bas de
 *     la zone utile, sans flotter au-dessus d'un vide.
 */
export default function TabBar({ items, activeId, onSelect, moreOpen = false }: TabBarProps) {
  return (
    <nav
      className="tr4de-tabbar"
      aria-label="Navigation principale"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "stretch",
        // La hauteur utile est fixe ; la réserve système s'ajoute EN DESSOUS.
        height: "var(--tabbar-total)",
        paddingBottom: "var(--sa-bottom)",
        paddingLeft: "var(--sa-left)",
        paddingRight: "var(--sa-right)",
        // Couche flottante : le contenu passe dessous et reste perceptible.
        background: "var(--tabbar-bg)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        // Un liseré clair en haut, comme la lumière qui accroche l'arête d'une
        // vitre — c'est ce qui distingue un matériau d'un simple fond gris.
        borderTop: "1px solid var(--tabbar-edge)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {items.map(item => {
        const active = item.id === "more" ? moreOpen : !moreOpen && item.id === activeId;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="tr4de-tab"
            data-active={active ? "" : undefined}
            aria-current={active && item.id !== "more" ? "page" : undefined}
            aria-label={item.label}
            onClick={() => onSelect(item.id)}
            style={{
              flex: 1,
              minWidth: 0,
              // Toute la hauteur utile est cliquable : la cible fait 56 px de
              // haut sur ~75 px de large, bien au-delà du minimum de 44.
              height: "var(--tabbar-h)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: 0,
              border: "none",
              background: "transparent",
              color: active ? "var(--accent)" : "var(--color-text-muted, #6B6B6B)",
              fontFamily: "inherit",
              cursor: "pointer",
              /* Le geste vertical appartient au défilement de la page ; ici il
                 n'y en a pas. `manipulation` supprime en plus l'attente du
                 double-tap. */
              touchAction: "manipulation",
            }}
          >
            {item.primary ? (
              /* Onglet d'action : une pastille pleine à l'accent. Ce n'est pas
                 une destination — on n'y « est » jamais —, donc il ne prend
                 jamais l'état actif, il reste une cible constante. */
              <span
                className="tr4de-tab-fab"
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: "var(--accent)",
                  color: "var(--color-on-solid, #FFFFFF)",
                  boxShadow: "0 2px 10px color-mix(in srgb, var(--accent) 35%, transparent)",
                }}
              >
                <Icon size={20} strokeWidth={2.2} />
              </span>
            ) : (
              <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />
            )}
            {!item.primary && (
              <span
                style={{
                  fontSize: 10,
                  lineHeight: 1,
                  fontWeight: 500,
                  letterSpacing: 0.1,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
