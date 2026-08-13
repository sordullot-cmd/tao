import type { ReactNode } from "react";
import Link from "next/link";

import { T } from "@/lib/ui/tokens";

/**
 * Gabarit des pages légales (confidentialité, conditions d'utilisation).
 *
 * Porté de `components/LegalLayout.tsx` de l'app patrimoine. Ces pages vivent
 * HORS de la coquille applicative : elles doivent être lisibles sans être
 * connecté, donc pas de sidebar, pas de `DashboardNew` — juste le logo, qui
 * ramène à l'accueil.
 *
 * Composant serveur : les pages qui l'utilisent exportent un `metadata`, et les
 * tokens `T` ne sont que des chaînes `var(--color-*)`, donc sans état.
 */
export function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--color-bg-subtle, #F9FAFA)",
      color: T.text,
      padding: "48px 16px",
      fontFamily: "var(--font-sans)",
    }}>
      <main style={{ margin: "0 auto", width: "100%", maxWidth: 680 }}>
        <Link
          href="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            marginBottom: 32, textDecoration: "none", color: T.text,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={24} height={24} style={{ borderRadius: "50%", display: "block" }} />
          <span style={{ fontSize: 16, fontWeight: 500 }}>tao trade</span>
        </Link>

        <article style={{
          background: T.white,
          borderRadius: 16,
          boxShadow: T.elevCard,
          padding: 32,
        }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: -0.2, color: T.text }}>
            {title}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.textSub }}>
            Dernière mise à jour : {updatedAt}
          </p>
          <div
            className="tr4de-legal-body"
            style={{ marginTop: 24, fontSize: 15, lineHeight: 1.65, color: T.textSub }}
          >
            {children}
          </div>
        </article>
      </main>
    </div>
  );
}

export default LegalLayout;
