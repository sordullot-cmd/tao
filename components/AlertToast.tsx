"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, AlertOctagon, Info, X } from "lucide-react";

type Severity = "info" | "warn" | "danger";

interface ToastItem {
  id: number;
  title: string;
  body: string;
  severity: Severity;
  /** Passe à true juste avant le démontage pour jouer l'animation de sortie. */
  leaving?: boolean;
}

const COLORS: Record<Severity, { bg: string; bd: string; fg: string; ico: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = {
  info:   { bg: "var(--color-blue-bg, #EFF6FF)",  bd: "var(--color-blue-bd, #BFDBFE)",  fg: "var(--color-blue, #1E40AF)",  ico: Info },
  warn:   { bg: "var(--color-amber-bg, #FFF7ED)", bd: "var(--color-amber-bd, #FED7AA)", fg: "var(--color-amber, #9A3412)",  ico: AlertTriangle },
  danger: { bg: "var(--color-red-bg, #FEF2F2)",   bd: "var(--color-red-bd, #FECACA)",   fg: "var(--color-red, #991B1B)",   ico: AlertOctagon },
};

// Nombre maximum de toasts affichés simultanément.
const MAX_VISIBLE = 3;

/**
 * Écoute l'événement `tr4de:alert` (émis par useTradeAlerts) et affiche les
 * messages dans une stack en bas-droite. Auto-dismiss après 6 secondes.
 */
// Durée de l'animation de sortie — doit matcher `toastOut` ci-dessous.
const EXIT_MS = 180;

export default function AlertToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  // Timers d'auto-dismiss par toast (clé = id). Permet de mettre en pause au survol.
  const timers = React.useRef<Record<number, number>>({});

  const clearTimer = React.useCallback((id: number) => {
    if (timers.current[id] != null) {
      window.clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  // Marque un toast comme « sortant » (joue l'anim), puis le retire du DOM
  // une fois l'animation terminée. La sortie est plus rapide que l'entrée
  // (180ms vs 220ms) — le système répond vite quand il retire.
  const dismiss = React.useCallback((id: number) => {
    clearTimer(id);
    setItems(prev => prev.map(x => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => {
      setItems(prev => prev.filter(x => x.id !== id));
    }, EXIT_MS);
  }, [clearTimer]);

  // (Re)programme l'auto-dismiss d'un toast après `delay` ms.
  const scheduleDismiss = React.useCallback((id: number, delay = 6000) => {
    clearTimer(id);
    timers.current[id] = window.setTimeout(() => dismiss(id), delay);
  }, [clearTimer, dismiss]);

  useEffect(() => {
    const onAlert = (e: Event) => {
      const detail = (e as CustomEvent).detail as { title: string; body: string; severity?: Severity };
      const id = Date.now() + Math.random();
      const item: ToastItem = {
        id,
        title: detail.title,
        body: detail.body,
        severity: detail.severity || "info",
      };
      // Limite la pile visible : retire les plus anciens au-delà de MAX_VISIBLE.
      setItems(prev => {
        const next = [...prev, item];
        if (next.length > MAX_VISIBLE) {
          next.slice(0, next.length - MAX_VISIBLE).forEach(old => clearTimer(old.id));
          return next.slice(-MAX_VISIBLE);
        }
        return next;
      });
      scheduleDismiss(id);
    };
    window.addEventListener("tr4de:alert", onAlert);
    return () => window.removeEventListener("tr4de:alert", onAlert);
  }, [scheduleDismiss, clearTimer]);

  // Nettoyage des timers au démontage.
  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(id => window.clearTimeout(id)); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: "fixed",
        right: 16, bottom: 16,
        display: "flex", flexDirection: "column", gap: 10,
        zIndex: 9999,
        maxWidth: 380,
        fontFamily: "var(--font-sans)",
      }}
    >
      <style>{`
        /* Entrée depuis la droite (là où le toast vit) : cohérence spatiale. */
        @keyframes tr4deToastIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        /* Sortie vers la droite, plus rapide que l'entrée. */
        @keyframes tr4deToastOut {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(16px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tr4de-toast, .tr4de-toast--leaving {
            animation: none !important;
          }
          .tr4de-toast--leaving { opacity: 0; }
        }
      `}</style>
      {items.map(item => {
        const c = COLORS[item.severity];
        const Icon = c.ico;
        const isDanger = item.severity === "danger";
        return (
          <div
            key={item.id}
            role={isDanger ? "alert" : "status"}
            aria-live={isDanger ? "assertive" : "polite"}
            onMouseEnter={() => clearTimer(item.id)}
            onMouseLeave={() => { if (!item.leaving) scheduleDismiss(item.id); }}
            className={item.leaving ? "tr4de-toast tr4de-toast--leaving" : "tr4de-toast anim-toast"}
            style={{
              background: c.bg,
              border: `1px solid ${c.bd}`,
              borderRadius: 10,
              padding: "10px 12px",
              display: "flex", alignItems: "flex-start", gap: 10,
              boxShadow: "var(--elev-overlay)",
              color: c.fg,
              animation: item.leaving
                ? `tr4deToastOut ${EXIT_MS}ms var(--ease-out) both`
                : undefined,
            }}
          >
            <Icon size={16} strokeWidth={2} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>{item.body}</div>
            </div>
            <button
              onClick={() => dismiss(item.id)}
              aria-label="Fermer"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: c.fg, padding: 2, display: "inline-flex", alignItems: "center" }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
