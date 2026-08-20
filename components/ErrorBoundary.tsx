"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof window !== "undefined") {
      // Garder les erreurs visibles en console pour le debug, mais une seule trace.
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return (
      <div
        role="alert"
        style={{
          margin: "32px auto",
          maxWidth: 540,
          padding: 20,
          background: "var(--color-card-bg, #FFFFFF)",
          border: "1px solid var(--color-red-bd, #FECACA)",
          borderRadius: "var(--radius-card)",
          fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
          color: "var(--color-text, #0D0D0D)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-red, #B91C1C)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
          Une erreur est survenue
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          Quelque chose s'est mal passé
        </div>
        {/* On n'affiche pas le détail technique de l'erreur à l'utilisateur —
            il reste consultable en console (voir componentDidCatch). */}
        <div style={{ fontSize: 13, color: "var(--color-text-sub, #5C5C5C)", lineHeight: 1.5, marginBottom: 16 }}>
          Une erreur inattendue est survenue. Tu peux réessayer, recharger la page ou revenir au tableau de bord.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            onClick={this.reset}
            style={{
              padding: "8px 16px",
              background: "var(--color-text, #0D0D0D)",
              color: "var(--color-bg, #fff)",
              border: "none",
              borderRadius: "var(--radius-card)",
              fontSize:13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
            style={{
              padding: "8px 16px",
              background: "var(--color-card-bg, #FFFFFF)",
              color: "var(--color-text, #0D0D0D)",
              border: "1px solid var(--color-border, #E5E5E5)",
              borderRadius: "var(--radius-card)",
              fontSize:13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Recharger la page
          </button>
          <a
            href="/"
            style={{
              padding: "8px 16px",
              background: "var(--color-card-bg, #FFFFFF)",
              color: "var(--color-text, #0D0D0D)",
              border: "1px solid var(--color-border, #E5E5E5)",
              borderRadius: "var(--radius-card)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Tableau de bord
          </a>
        </div>
      </div>
    );
  }
}
