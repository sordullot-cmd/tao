"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { User, Settings as LucideSettings, Moon, Sun, LogOut } from "lucide-react";
import Popover from "@/components/ui/Popover";

function menuItemStyle() {
  return {
    width: "100%", display: "flex", alignItems: "center", gap: 8,
    textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none",
    background: "transparent", color: "#0D0D0D",
    fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
  };
}

export default function TopBarUserMenu({ user, onProfile, onSettings, onDarkMode, onLogout }) {
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const ref = useRef(null);
  // Fermeture (clic extérieur, Échap) déléguée au Popover, qui vit hors de `ref`.
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const sync = () => setIsDark(document.documentElement.dataset.theme === "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const firstName = (user.name || "").split(" ")[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{minHeight: 34,
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "4px 12px 4px 4px", borderRadius: 999,
          background: open ? "#EDEDED" : "transparent", border: "none",
          cursor: "pointer", fontFamily: "var(--font-sans)", color: "#0D0D0D",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "#EDEDED"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: "#F7F7F7",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, color: "#0D0D0D", flexShrink: 0,
          border: "1px solid #ECECEC",
        }}>{user.initials}</div>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{firstName}</span>
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        gap={4}
        align="end"
        minWidth={200}
        role="menu"
        style={{
          background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)", padding: 4,
          fontFamily: "var(--font-sans)",
        }}
      >
        <>
          {onProfile && (
            <button onClick={() => { setOpen(false); onProfile(); }} style={menuItemStyle()}>
              <User size={14} strokeWidth={1.75} /><span>Profil</span>
            </button>
          )}
          {onSettings && (
            <button onClick={() => { setOpen(false); onSettings(); }} style={menuItemStyle()}>
              <LucideSettings size={14} strokeWidth={1.75} /><span>Paramètres</span>
            </button>
          )}
          {onDarkMode && (
            <button onClick={() => onDarkMode()} style={{ ...menuItemStyle(), justifyContent: "space-between" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {isDark
                  ? <Sun size={14} strokeWidth={1.75} />
                  : <Moon size={14} strokeWidth={1.75} />}
                <span>Mode Sombre</span>
              </span>
              <span
                aria-hidden
                style={{
                  position: "relative",
                  width: 28, height: 16, borderRadius: 999,
                  background: isDark ? "#16A34A" : "#D4D4D4",
                  transition: "background 150ms ease",
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: "absolute", top: 2,
                  left: isDark ? 14 : 2,
                  width: 12, height: 12, borderRadius: "50%",
                  background: "#FFFFFF",
                  transition: "left 150ms ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                }}/>
              </span>
            </button>
          )}
          {onLogout && (onProfile || onSettings || onDarkMode) && (
            <div style={{ height: 1, background: "#E5E5E5", margin: "4px 0" }} />
          )}
          {onLogout && (
            <button onClick={() => { setOpen(false); onLogout(); }} style={{ ...menuItemStyle(), color: "#EF4444" }}>
              <LogOut size={14} strokeWidth={1.75} /><span>Se déconnecter</span>
            </button>
          )}
        </>
      </Popover>
    </div>
  );
}
