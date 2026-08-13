"use client";

import React from "react";

type Props = {
  label?: string;
  fullscreen?: boolean;
};

export default function LoadingScreen({ label, fullscreen = true }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: "var(--color-bg, #FFFFFF)",
        ...(fullscreen
          ? { position: "fixed", inset: 0, zIndex: 9999, height: "100dvh", width: "100vw" }
          : { width: "100%", padding: "48px 16px" }),
      }}
    >
      <style>{`
        @keyframes tr4de-loading-dot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40%           { opacity: 1;    transform: translateY(-3px); }
        }
      `}</style>

      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--color-card-bg, #FFFFFF)",
          border: "1px solid var(--color-border, #E5E5E5)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <img
          src="/logo.svg"
          alt=""
          width={96}
          height={96}
          style={{ display: "block", transform: "scale(1.05)", transformOrigin: "center" }}
        />
      </div>

      <div
        role="status"
        aria-label={label || "Chargement"}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-text, #0D0D0D)",
              display: "inline-block",
              animation: "tr4de-loading-dot 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>

      {label && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted, #6B6B6B)", letterSpacing: 0.2 }}>
          {label}
        </div>
      )}
    </div>
  );
}
