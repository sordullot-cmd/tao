"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  User,
  Moon,
  LucideIcon,
} from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import Popover from "@/components/ui/Popover";
import { useSwipeToDismiss } from "@/lib/hooks/useSwipeToDismiss";

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export interface SidebarSection {
  label?: string; // section label (uppercase small caps)
  items: SidebarItem[];
}

export interface SidebarAccount {
  id: string;
  name: string;
}

export interface SidebarProps {
  brand: string;                       // "tr4de"
  workspace?: SidebarAccount | null;   // current trading account selected
  workspaces?: SidebarAccount[];       // list of accounts
  onSelectWorkspace?: (id: string) => void;
  onCreateWorkspace?: () => void;
  onManageWorkspaces?: () => void;

  sections: SidebarSection[];
  activeId: string;
  onSelect: (id: string) => void;

  /** Le pied de barre n'affiche plus que la pastille d'initiales : `name` ne
   *  sert qu'à l'infobulle et au libellé accessible. */
  user?: {
    name: string;
    initials: string;
    avatarUrl?: string | null;
  };
  onUserMenu?: () => void;
  onProfile?: () => void;
  onSettings?: () => void;
  onDarkMode?: () => void;
  onLogout?: () => void;

  collapsed?: boolean;
  onToggleCollapsed?: () => void;

  /** Largeur réelle mesurée, remontée à chaque changement : la barre s'adapte
   *  désormais à son libellé le plus long, la coquille ne peut donc plus la
   *  déduire d'une constante. */
  onWidthChange?: (width: number) => void;

  /** Mobile overlay: quand true, la sidebar est visible en overlay (≤1024px) */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar(props: SidebarProps) {
  const {
    sections, activeId, onSelect, user, onUserMenu, onProfile, onSettings, onDarkMode, onLogout,
    collapsed = false, onToggleCollapsed,
    mobileOpen = false, onMobileClose,
    onWidthChange,
  } = props;

  useLang(); // re-render sidebar on language change

  /* La barre se dimensionne sur son libellé le plus long : sa largeur n'est
     plus une constante que la coquille pourrait recopier. On la mesure et on la
     remonte, pour que le contenu de page décale d'exactement ce qu'elle occupe. */

  /* === Renvoi du tiroir au glissé (mobile) ===
     La barre latérale est la plus grande surface saisissable du site et elle
     ne se saisissait pas : on ne pouvait l'ouvrir qu'au hamburger et la fermer
     qu'en visant le voile. Sur un écran tactile, le geste attendu est de la
     repousser vers son bord — c'est-à-dire vers la gauche, d'où `direction`.
     Toute la physique (suivi 1:1, vélocité, projection, résistance) vit dans
     le hook : voir lib/hooks/useSwipeToDismiss. */
  const { ref: asideRef, handlers: swipeHandlers } = useSwipeToDismiss<HTMLElement>({
    onDismiss: () => onMobileClose?.(),
    direction: -1,
    axis: "x",
    enabled: mobileOpen,
  });

  useEffect(() => {
    const el = asideRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const emit = () => onWidthChange?.(Math.round(el.getBoundingClientRect().width));
    emit();
    const ro = new ResizeObserver(emit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onWidthChange, collapsed, asideRef]);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);

  // Sections de la navbar repliables — état mémorisé en localStorage par label.
  const NAV_COLLAPSE_KEY = "tr4de_nav_collapsed_sections";
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_COLLAPSE_KEY);
      if (raw) setCollapsedSections(JSON.parse(raw));
    } catch {}
  }, []);
  const toggleSection = (label: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Clic extérieur : géré par le Popover (le menu vit hors de `userRef`).
  const closeUserMenu = React.useCallback(() => setUserMenuOpen(false), []);

  // Menu utilisateur : fermeture au clavier (Échap) + retour du focus au trigger.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setUserMenuOpen(false);
        userBtnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [userMenuOpen]);

  return (
    <>
    {mobileOpen && (
      <div className="tr4de-sidebar-backdrop" onClick={onMobileClose} />
    )}
    <aside
      ref={asideRef}
      className={`tr4de-sidebar ${mobileOpen ? "is-open" : ""}`}
      {...swipeHandlers}
      style={{
        // Carte blanche flottante posée sur le fond de page, gouttière de 12 px
        // à gauche / en haut / en bas. Sa largeur suit son contenu : elle
        // s'arrête juste après le libellé le plus long, entre deux bornes qui
        // évitent une barre ridicule ou envahissante.
        width: collapsed ? 56 : "fit-content",
        minWidth: collapsed ? undefined : 168,
        maxWidth: collapsed ? undefined : 260,
        flexShrink: 0,
        background: "var(--color-card-bg, #FFFFFF)",
        borderRadius: 12,
        boxShadow: "var(--elev-card)",
        margin: "12px 0 12px 12px",
        display: "flex",
        flexDirection: "column",
        /* Surcouche fixe plutôt qu'élément du flux : la zone de contenu occupe
           alors TOUTE la largeur de la fenêtre, ce qui permet à un bloc pleine
           largeur (la courbe des graphiques) de filer jusqu'au premier pixel et
           de passer DERRIÈRE cette barre. La place qu'elle occupait est rendue
           par le padding gauche du conteneur de contenu (cf. --shell-left).
           `left/top: 0` + les marges de 12 px reproduisent exactement la
           position d'avant, et rejoignent les règles mobiles de globals.css. */
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 30,
        height: "calc(100dvh - 24px)",
        /* Courbe issue des tokens : le tiroir en comptait trois différentes
           dans le site (`.2,.8,.2,1` ici et dans la feuille de trade, plus
           `--ease-drawer`). Une seule, désormais. */
        transition: "width 180ms var(--ease-out), transform 220ms var(--ease-drawer)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* HEADER : brand — le logo, carré (aucun rognage rond), suivi du nom de
          l'application. Le nom disparaît quand la barre est repliée, le logo
          reste seul et centré.
          Retrait bas volontairement court : le titre de la première section
          apporte déjà sa propre respiration (padding du bouton + de la nav), et
          la somme des trois éloignait le logo du reste de la barre. */}
      <div style={{
        display: "flex", alignItems: "center", gap: collapsed ? 0 : 8,
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "18px 0 4px" : "18px 12px 4px",
      }}>
        <img
          src="/logo.svg"
          alt="tao"
          width={32}
          height={32}
          style={{ flexShrink: 0, display: "block", objectFit: "contain" }}
        />
        {!collapsed && (
          <span style={{
            fontSize: 16, fontWeight: 600, letterSpacing: -0.2,
            color: "var(--color-text)", whiteSpace: "nowrap", lineHeight: 1,
          }}>
            tao
          </span>
        )}
      </div>

      {/* NAV */}
      <nav aria-label="Navigation principale" style={{ padding: "0 6px 10px", flex: 1, overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
        {sections.map((sec, i) => {
          const containsActive = sec.items.some(it => it.id === activeId);
          const sectionCollapsed = !!(sec.label && collapsedSections[sec.label]);
          // Si la sidebar est en mode icônes seules ou pas de label : tout afficher.
          // Sinon, si la section est repliée et contient la page active,
          // on n'affiche que cette page ; sinon on cache tout.
          const showAll = collapsed || !sec.label || !sectionCollapsed;
          const itemsToShow = showAll
            ? sec.items
            : (containsActive ? sec.items.filter(it => it.id === activeId) : []);
          return (
          <div key={i} style={{ marginBottom: 12 }}>
            {!collapsed && sec.label && (
              <button
                type="button"
                onClick={() => toggleSection(sec.label!)}
                aria-expanded={!sectionCollapsed}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 12px 6px 10px", fontSize: 12, fontWeight: 500,
                  lineHeight: "18.6px",
                  color: "var(--color-text-muted)", letterSpacing: 0,
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left",
                  borderRadius: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--color-text-sub)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
              >
                <span style={{ flex: 1 }}>{sec.label}</span>
                {sectionCollapsed && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: "var(--color-text-muted)",
                    background: "var(--color-hover-bg)", padding: "1px 6px", borderRadius: 999,
                    letterSpacing: 0,
                  }}>
                    {sec.items.length}
                  </span>
                )}
              </button>
            )}
            {itemsToShow.map(item => {
              const Icon = item.icon;
              const active = item.id === activeId;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  style={{minHeight: 34,
                    width: "100%", display: "flex", alignItems: "center",
                    gap: collapsed ? 0 : 10, justifyContent: collapsed ? "center" : "flex-start",
                    padding: collapsed ? "8px 0" : "8px 12px 8px 10px",
                    // Ovale : le survol dessine une pilule, pas un rectangle aux
                    // coins arrondis.
                    borderRadius: 999, border: "none",
                    /* La page active ne porte plus de pastille de fond : elle est
                       simplement écrite dans la couleur du site. Le fond reste
                       donc libre pour le seul survol, et un seul signal —  la
                       couleur — désigne la page courante. */
                    background: "transparent",
                    color: active ? "var(--color-nav-active-text)" : "var(--color-nav-text)",
                    fontSize: 13, lineHeight: "20.15px",
                    // Gras : libellé ET icône (via strokeWidth) ont le même poids.
                    fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    /* Pas de `padding` dans la liste : il ne change qu'au repli
                       de la barre, et le libellé, lui, est démonté sur-le-champ.
                       On animait donc pendant 200 ms l'espace laissé par un
                       texte déjà disparu — un décalage sans cause visible.
                       `background-color` plutôt que le raccourci `background`. */
                    transition: "background-color 150ms var(--ease-out), color 150ms var(--ease-out)",
                    position: "relative",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--color-nav-hover-bg)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Icon size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
                  {!collapsed && (
                    <>
                      {/* `nowrap` : c'est le libellé le plus long qui fixe la
                          largeur de la barre — il ne doit jamais se replier. */}
                      <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap" }}>{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span style={{
                          padding: "1px 7px", borderRadius: 999, background: "var(--color-text)",
                          color: "var(--color-text-inverted)", fontSize: 10, fontWeight: 500,
                          lineHeight: "15.5px",
                        }}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
          );
        })}
      </nav>

      {/* FOOTER : user + collapse.
          La pastille d'initiales porte le compte, avec le nom complet à sa
          droite ; l'adresse e-mail, elle, reste dans la page Profil. Barre
          repliée : la pastille seule, centrée — il n'y a plus la place. */}
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4, position: "relative" }} ref={userRef}>
        {user && (
          <button
            ref={userBtnRef}
            onClick={() => { setUserMenuOpen(v => !v); onUserMenu?.(); }}
            title={user.name}
            aria-label={`Compte — ${user.name}`}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "6px 0" : "6px 8px",
              borderRadius: "var(--radius-field)", border: "none",
              background: userMenuOpen ? "var(--color-nav-hover-bg)" : "transparent",
              cursor: "pointer", fontFamily: "inherit", color: "var(--color-text)",
            }}
            onMouseEnter={e => { if (!userMenuOpen) e.currentTarget.style.background = "var(--color-nav-hover-bg)"; }}
            onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.background = "transparent"; }}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                width={34}
                height={34}
                style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              /* Pastille pastel : un voile de l'accent de marque plutôt qu'un
                 aplat saturé — la barre reste calme, les initiales portent la
                 couleur. Le liseré intérieur, à peine plus dense que le fond,
                 dessine le disque sans ajouter de bordure franche. */
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "var(--accent-pastel)",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, letterSpacing: 0.2,
                color: "var(--accent-ink)", flexShrink: 0,
              }}>
                {user.initials}
              </div>
            )}
            {!collapsed && (
              <span style={{
                flex: 1, minWidth: 0, textAlign: "left",
                fontSize: 13, fontWeight: 500, lineHeight: 1.3,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {user.name}
              </span>
            )}
          </button>
        )}

        {/* Menu utilisateur. Ancré au pied de la barre, il bascule donc
            naturellement vers le haut : le Popover choisit le côté où il reste
            de la place. */}
        <Popover
          anchorRef={userRef}
          open={userMenuOpen && !!user}
          onClose={closeUserMenu}
          gap={4}
          minWidth={176}
          atLeastAnchorWidth
          maxHeight={360}
          role="menu"
          style={{
            background: "var(--color-card-bg, #FFFFFF)", border: "none",
            borderRadius: 10, boxShadow: "var(--elev-overlay)", padding: 4,
          }}
        >
          <>
            {onProfile && (
              <button
                onClick={() => { setUserMenuOpen(false); onProfile(); }}
                style={dropdownItemStyle()}
                role="menuitem"
                onMouseEnter={e => { e.currentTarget.style.background = "var(--color-hover-bg)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <User size={14} strokeWidth={1.75} />
                <span>{t("settings.profile")}</span>
              </button>
            )}
            {onSettings && (
              <button
                onClick={() => { setUserMenuOpen(false); onSettings(); }}
                style={dropdownItemStyle()}
                role="menuitem"
                onMouseEnter={e => { e.currentTarget.style.background = "var(--color-hover-bg)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <Settings size={14} strokeWidth={1.75} />
                <span>{t("nav.settings")}</span>
              </button>
            )}
            {onDarkMode && (
              <button
                onClick={() => { setUserMenuOpen(false); onDarkMode(); }}
                style={dropdownItemStyle()}
                role="menuitem"
                onMouseEnter={e => { e.currentTarget.style.background = "var(--color-hover-bg)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <Moon size={14} strokeWidth={1.75} />
                <span>Mode Sombre</span>
              </button>
            )}
            {(onProfile || onSettings || onDarkMode) && onLogout && (
              <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />
            )}
            {onLogout && (
              <button
                onClick={() => { setUserMenuOpen(false); onLogout(); }}
                role="menuitem"
                style={{ ...dropdownItemStyle(), color: "var(--color-red, #FF4B4B)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--color-red-bg, #FEF2F2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <LogOut size={14} strokeWidth={1.75} />
                <span>{t("nav.logout")}</span>
              </button>
            )}
          </>
        </Popover>
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Étendre" : "Réduire"}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              justifyContent: "center",
              padding: "6px 0",
              borderRadius: "var(--radius-field)", border: "none", background: "transparent",
              cursor: "pointer", fontFamily: "inherit",
              color: "var(--color-text-sub)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-nav-hover-bg)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>
    </aside>
    </>
  );
}

function dropdownItemStyle(): React.CSSProperties {
  return {
    width: "100%", display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderRadius: 6, border: "none",
    background: "transparent", color: "var(--color-text)",
    fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
  };
}

