"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  User,
  Moon,
  ChevronDown,
  LucideIcon,
} from "lucide-react";
import { t, useLang } from "@/lib/i18n";

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

  user?: {
    name: string;
    email?: string;
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
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = asideRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const emit = () => onWidthChange?.(Math.round(el.getBoundingClientRect().width));
    emit();
    const ro = new ResizeObserver(emit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onWidthChange, collapsed]);

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

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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
        transition: "width 180ms var(--ease-out), transform .22s var(--ease-drawer)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* HEADER : brand */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "18px 0" : "18px 16px",
      }}>
        <img
          src="/favicon.svg"
          alt="tao"
          width={32}
          height={32}
          style={{ flexShrink: 0, display: "block", borderRadius: "50%", objectFit: "cover" }}
        />
        {!collapsed && (
          <div style={{ flex: 1, overflow: "hidden", fontSize: 14, fontWeight: 500, lineHeight: "21.7px", color: "var(--color-text)", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            tao trade
          </div>
        )}
      </div>

      {/* NAV */}
      <nav aria-label="Navigation principale" style={{ padding: "10px 8px", flex: 1, overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
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
                  padding: "8px 12px 6px 15px", fontSize: 12, fontWeight: 400,
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
                    fontSize: 9, fontWeight: 600, color: "var(--color-text-muted)",
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
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    gap: collapsed ? 0 : 10, justifyContent: collapsed ? "center" : "flex-start",
                    padding: collapsed ? "8px 0" : "8px 14px",
                    // Ovale : le survol dessine une pilule, pas un rectangle aux
                    // coins arrondis.
                    borderRadius: 999, border: "none",
                    /* La page active ne porte plus de pastille de fond : elle est
                       simplement écrite dans la couleur du site. Le fond reste
                       donc libre pour le seul survol, et un seul signal —  la
                       couleur — désigne la page courante. */
                    background: "transparent",
                    color: active ? "var(--color-nav-active-text)" : "var(--color-text-sub)",
                    fontSize: 13, lineHeight: "20.15px",
                    // Gras : libellé ET icône (via strokeWidth) ont le même poids.
                    fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    transition: "background 150ms cubic-bezier(0.23,1,0.32,1), color 150ms cubic-bezier(0.23,1,0.32,1), padding 200ms cubic-bezier(0.23,1,0.32,1)",
                    position: "relative",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--color-hover-bg)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Icon size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
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

      {/* FOOTER : user + collapse */}
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4, position: "relative" }} ref={userRef}>
        {user && (
          <button
            ref={userBtnRef}
            onClick={() => { setUserMenuOpen(v => !v); onUserMenu?.(); }}
            title={collapsed ? user.name : undefined}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "6px 0" : "6px 8px",
              borderRadius: "var(--radius-field)", border: "none",
              background: userMenuOpen ? "var(--color-hover-bg)" : "transparent",
              cursor: "pointer", fontFamily: "inherit", color: "var(--color-text)",
            }}
            onMouseEnter={e => { if (!userMenuOpen) e.currentTarget.style.background = "var(--color-hover-bg)"; }}
            onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.background = "transparent"; }}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                width={26}
                height={26}
                style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 26, height: 26, borderRadius: "50%", background: "var(--color-amber-bg, #FFE0B2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "var(--color-amber, #9D5800)", flexShrink: 0,
              }}>
                {user.initials}
              </div>
            )}
            {!collapsed && (
              <div style={{ flex: 1, overflow: "hidden", textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 500, lineHeight: "18.6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name}
                </div>
                {user.email && (
                  <div style={{ fontSize: 10, fontWeight: 500, lineHeight: "15.5px", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.email}
                  </div>
                )}
              </div>
            )}
          </button>
        )}

        {/* User menu popover (opens upward) */}
        {userMenuOpen && user && (
          <div
            role="menu"
            style={{
              position: "absolute",
              bottom: "calc(100% + 4px)",
              left: 8, right: 8,
              background: "var(--color-card-bg, #FFFFFF)", border: "1px solid var(--color-border)",
              borderRadius: 10, boxShadow: "var(--elev-overlay)",
              overflow: "hidden", padding: 4, zIndex: 100,
            }}
          >
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
                style={{ ...dropdownItemStyle(), color: "var(--color-red, #EF4444)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--color-red-bg, #FEF2F2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <LogOut size={14} strokeWidth={1.75} />
                <span>{t("nav.logout")}</span>
              </button>
            )}
          </div>
        )}
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
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-hover-bg)"; }}
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
