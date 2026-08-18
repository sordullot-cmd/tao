"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, AlertOctagon, Info, X } from "lucide-react";
import {
  VelocityTracker,
  project,
  rubberband,
  FLICK_VELOCITY,
  DRAG_HYSTERESIS,
} from "@/lib/ui/gesture";

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

  /* === Renvoi au glissé ===
     L'entrée et la sortie par la droite étaient déjà en place — c'est
     précisément ce qui rend le geste évident : la carte annonce d'où elle
     vient et donc où la repousser. Il ne manquait que le geste lui-même.

     La distance seule ne suffit pas à décider : le mouvement naturel pour
     écarter une notification est une chiquenaude, courte et rapide. On mesure
     donc la vitesse et on projette où la carte se serait arrêtée. */
  const drag = useRef({ id: -1, toast: -1, startX: 0, startY: 0, decided: -1, dx: 0, width: 0 });
  const tracker = useRef(new VelocityTracker());

  const paint = (el: HTMLElement | null, dx: number) => {
    if (!el) return;
    el.style.transform = dx ? `translateX(${dx}px)` : "";
    // L'opacité suit le geste : la carte s'efface à mesure qu'elle s'en va.
    el.style.opacity = dx > 0 ? String(Math.max(0, 1 - dx / (el.offsetWidth || 1))) : "";
  };

  const resetDrag = (el: HTMLElement | null) => {
    if (el) {
      el.classList.remove("tr4de-toast--dragging");
      el.style.transform = "";
      el.style.opacity = "";
      el.style.willChange = "";
    }
    drag.current.id = -1;
    drag.current.decided = -1;
    tracker.current.reset();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: number) => {
    // Un seul doigt : changer de doigt en cours de glissé ferait sauter la
    // carte à la nouvelle position, puisque l'origine du geste changerait.
    if (drag.current.id !== -1) return;
    const el = e.currentTarget;
    drag.current = {
      id: e.pointerId, toast: id,
      startX: e.clientX, startY: e.clientY,
      decided: -1, dx: 0,
      width: el.getBoundingClientRect().width,
    };
    tracker.current.reset();
    tracker.current.add(e.clientX, e.clientY, e.timeStamp);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.id !== e.pointerId || d.decided === 0) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.decided === -1) {
      if (Math.abs(dx) < DRAG_HYSTERESIS && Math.abs(dy) < DRAG_HYSTERESIS) return;
      if (Math.abs(dy) > Math.abs(dx)) { d.decided = 0; return; }
      d.decided = 1;
      clearTimer(d.toast);                     // on ne retire pas sous le doigt
      e.currentTarget.classList.add("tr4de-toast--dragging");
      e.currentTarget.style.willChange = "transform, opacity";
      /* La capture garde le geste vivant même si le doigt sort de la carte —
         ce qui arrive systématiquement, puisque le but est de l'emmener hors
         de l'écran. */
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    tracker.current.add(e.clientX, e.clientY, e.timeStamp);
    // Vers la droite (la sortie) : suivi exact. Vers la gauche : résistance.
    d.dx = dx >= 0 ? dx : -rubberband(-dx, d.width);
    paint(e.currentTarget, d.dx);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    const el = e.currentTarget;
    if (d.decided !== 1) { resetDrag(el); return; }

    const vx = tracker.current.velocity().x;
    const projected = d.dx + project(vx);
    const flick = vx / 1000 > FLICK_VELOCITY;
    const gone = flick || projected > d.width / 2;

    resetDrag(el);
    if (gone) dismiss(d.toast);
    else scheduleDismiss(d.toast);            // reste : le compte à rebours repart
  };

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
        /* TRANSITION, et pas @keyframes.
           Les toasts s'empilent et se retirent vite, parfois pendant qu'un
           autre est déjà en train d'entrer ou de sortir. Une keyframe
           interrompue repart de son image zéro : le toast saute. Une
           transition, elle, repart de la valeur affichée à l'écran — c'est
           exactement ce qu'il faut quand l'utilisateur attrape un toast en
           train de disparaître, ou en fait entrer un nouveau au même instant.

           Le point de départ vient de @starting-style : il remplace le
           traditionnel useEffect(() => setMounted(true)), sans re-rendu. */
        .tr4de-toast {
          opacity: 1;
          transform: translateX(0);
          transition: opacity 220ms var(--ease-out),
                      transform 220ms var(--ease-out);
          touch-action: pan-y;
        }
        @starting-style {
          .tr4de-toast { opacity: 0; transform: translateX(16px); }
        }
        /* Sortie par le MÊME bord que l'entrée : c'est cette symétrie qui rend
           le geste de renvoi vers la droite évident sans qu'on l'explique.
           Plus rapide que l'entrée (180 contre 220 ms) : on prend son temps
           pour proposer, jamais pour retirer. */
        .tr4de-toast--leaving {
          opacity: 0;
          transform: translateX(16px);
          transition: opacity 180ms var(--ease-out),
                      transform 180ms var(--ease-out);
          pointer-events: none;
        }
        /* Pendant le glissé : suivi au pixel, aucune interpolation. */
        .tr4de-toast--dragging { transition: none; }
        @media (prefers-reduced-motion: reduce) {
          .tr4de-toast, .tr4de-toast--leaving { transform: none !important; }
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
            onPointerDown={e => onPointerDown(e, item.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={item.leaving ? "tr4de-toast tr4de-toast--leaving" : "tr4de-toast"}
            style={{
              background: c.bg,
              /* Couche flottante : `--elev-overlay` la detache, et la gravite se lit
                 deja dans l'aplat teinte et l'icone. */
              border: "none",
              borderRadius: 10,
              padding: "10px 12px",
              display: "flex", alignItems: "flex-start", gap: 10,
              boxShadow: "var(--elev-overlay)",
              color: c.fg,
              cursor: "grab",
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
