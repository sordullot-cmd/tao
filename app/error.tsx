"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        height: "100dvh",
        width: "100vw",
        background: "var(--color-bg, #FFFFFF)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
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

      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text, #0D0D0D)" }}>
        Une erreur est survenue
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-sub, #5C5C5C)", maxWidth: 340, textAlign: "center", lineHeight: 1.5 }}>
        Quelque chose n'a pas fonctionné. Réessaie, ou recharge la page si le problème persiste.
      </div>

      <div style={{ display: "inline-flex", gap: 10, fontSize: 13, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "var(--color-btn-primary-bg, #0D0D0D)",
            color: "var(--color-btn-primary-text, #FFFFFF)",
            border: "1px solid var(--color-btn-primary-bg, #0D0D0D)",
            padding: "8px 16px", fontSize: 14,
            minHeight: 34,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 500,
          }}
        >
          Réessayer
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: "var(--color-card-bg, #FFFFFF)",
            color: "var(--color-text, #0D0D0D)",
            border: "1px solid var(--color-border, #E5E5E5)",
            padding: "8px 16px", fontSize: 14,
            minHeight: 34,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 500,
          }}
        >
          Recharger la page
        </button>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "9px 18px",
            minHeight: 40,
            borderRadius: 999,
            color: "var(--color-text-sub, #5C5C5C)",
          }}
        >
          Tableau de bord
        </Link>
      </div>

      {error?.digest && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted, #6B6B6B)", marginTop: 4 }}>
          ref&nbsp;: {error.digest}
        </div>
      )}
    </div>
  );
}
