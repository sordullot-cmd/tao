"use client";

import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * PWAInstall — gère l'enregistrement du service worker et l'invite
 * d'installation (BeforeInstallPromptEvent).
 *
 * - Enregistre /sw.js au mount
 * - Capture l'événement `beforeinstallprompt` et propose un bouton d'install
 *   discret en bas-gauche (dismissible 7 jours via localStorage)
 */

const DISMISS_KEY = "tr4de_pwa_install_dismissed";
const DISMISS_DAYS = 7;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

// La bannière est masquée si l'app est installée ("installed") ou si l'utilisateur
// l'a fermée il y a moins de 7 jours. Passé ce délai, elle réapparaît.
function isDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    if (v === "installed" || v === "1") return true; // "1" = ancien format (installé)
    const ts = Number(v);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Register service worker
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Eviter d'enregistrer le SW en dev (HMR / cache busting déjà géré par Next)
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[PWA] sw register failed:", err?.message || err);
    });
  }, []);

  // Capture install prompt
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      // Masquée si installée ou fermée il y a moins de 7 jours (voir isDismissed).
      if (isDismissed()) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    // Une fois installée, l'app dispatch ce signal pour que la card disparaisse
    const onInstalled = () => {
      localStorage.setItem(DISMISS_KEY, "installed");
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible || !deferredPrompt) return null;

  const onInstall = async () => {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        // Installation acceptée → on cache (l'événement appinstalled le confirmera aussi)
        localStorage.setItem(DISMISS_KEY, "installed");
        setVisible(false);
        setDeferredPrompt(null);
      }
      // Si "dismissed" : on laisse la card visible, l'utilisateur pourra réessayer.
    } catch {}
  };

  // Fermeture : masquée 7 jours (on stocke l'horodatage), puis elle réapparaît.
  const onClose = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Installer tao trade"
      className="anim-fade-up"
      style={{
        position: "fixed",
        left: 16, bottom: "calc(16px + env(safe-area-inset-bottom))",
        zIndex: 9997,
        maxWidth: 320,
        background: "var(--color-card-bg, #FFFFFF)",
        border: "1px solid var(--color-border, #E5E5E5)",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <img
          src="/favicon.svg"
          alt="tao"
          width={36}
          height={36}
          style={{ flexShrink: 0, borderRadius: "50%", objectFit: "cover" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text, #0D0D0D)", marginBottom: 2 }}>
            Installer tao trade
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-sub, #5C5C5C)", marginBottom: 10 }}>
            Accès direct depuis l&apos;écran d&apos;accueil, mode hors-ligne basique.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onInstall}
              style={{
                padding: "10px 14px", minHeight: 44, borderRadius: 8, border: "none",
                background: "var(--color-btn-primary-bg, #0D0D0D)", color: "var(--color-btn-primary-text, #FFFFFF)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Download size={14} strokeWidth={2} /> Installer
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-muted, #6B6B6B)", width: 44, height: 44, minWidth: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
