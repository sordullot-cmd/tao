import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page introuvable",
  description: "Cette page n'existe pas ou a été déplacée.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        width: "100%",
        background: "var(--color-bg, #FFFFFF)",
        color: "var(--color-text, #0D0D0D)",
        fontFamily: "var(--font-sans)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Grille décorative en fond */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(to right, rgba(13,13,13,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(13,13,13,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {/* Badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            background: "var(--color-bg-subtle, #F1F2F4)",
            border: "1px solid var(--color-border, #E5E5E5)",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--color-text-sub, #5C5C5C)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--color-warning, #FF9600)",
            }}
          />
          Erreur 404
        </span>

        {/* Numéro géant */}
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(96px, 22vw, 200px)",
            lineHeight: 0.9,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            background:
              "linear-gradient(180deg, var(--color-text, #0D0D0D) 0%, var(--color-text-muted, #8E8E8E) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          404
        </h1>

        {/* Titre */}
        <h2
          style={{
            margin: 0,
            fontSize: "clamp(22px, 3.5vw, 30px)",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          Cette page n'existe pas
        </h2>

        {/* Sous-titre */}
        <p
          style={{
            margin: 0,
            maxWidth: 420,
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--color-text-sub, #5C5C5C)",
          }}
        >
          L'URL que vous avez suivie est peut-être obsolète, ou la page a été
          déplacée. Revenez à l'accueil pour reprendre votre parcours.
        </p>

        {/* Boutons */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 18px",
              borderRadius: 10,
              background: "var(--color-btn-primary-bg, #0D0D0D)",
              color: "var(--color-btn-primary-text, #FFFFFF)",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid var(--color-btn-primary-bg, #0D0D0D)",
              transition: "transform 120ms ease",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 12l9-9 9 9" />
              <path d="M5 10v10h14V10" />
            </svg>
            Retour à l'accueil
          </Link>

          <Link
            href="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 18px",
              borderRadius: 10,
              background: "transparent",
              color: "var(--color-text, #0D0D0D)",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid var(--color-border-strong, #D4D4D4)",
            }}
          >
            Aller au dashboard
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="M13 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "var(--color-text-muted, #8E8E8E)",
          }}
        >
          tao trade · journal · stratégies · discipline
        </div>
      </div>
    </main>
  );
}
