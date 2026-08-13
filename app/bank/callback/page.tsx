"use client";

/**
 * Écran de retour du consentement bancaire.
 *
 * Porté de `app/bank/callback/page.tsx` de l'app patrimoine. C'est la page que
 * l'utilisateur a sous les yeux en revenant du site de sa banque : elle est
 * atteinte par une redirection de `/api/bank/callback`, qui a déjà échangé le
 * code contre une session et porte le résultat dans l'URL.
 *
 * Elle vit hors de la coquille applicative, comme les pages légales : au retour
 * d'un site tiers, la sidebar et son état n'ont pas encore de sens.
 *
 * `useSearchParams` impose le `Suspense` : sans lui, la page bascule en rendu
 * dynamique et le build échoue au prerender.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { T } from "@/lib/ui/tokens";

function CallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const failed = params.get("status") === "error";
  const reason = params.get("reason");
  const bank = params.get("bank");

  const button = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "100%", minHeight: 44, borderRadius: 999, border: "none",
    fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
  } as const;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: "48px 16px",
      background: "var(--color-bg-subtle, #F9FAFA)",
      color: T.text, fontFamily: "var(--font-sans)",
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: T.white,
        borderRadius: 16, boxShadow: T.elevCard, padding: 28, textAlign: "center",
      }}>
        {failed ? (
          <AlertCircle size={40} strokeWidth={1.5} style={{ color: T.pnlNeg }} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={40} strokeWidth={1.5} style={{ color: T.pnlPos }} aria-hidden="true" />
        )}

        <h1 style={{ margin: "12px 0 0", fontSize: 18, fontWeight: 500 }}>
          {failed ? "Connexion échouée" : "Banque connectée"}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: T.textSub }}>
          {failed
            ? "La connexion à ta banque n'a pas abouti. Tu peux réessayer."
            : `${bank ? `${bank} est connectée. ` : ""}Tes comptes vont apparaître dans ton patrimoine.`}
        </p>

        {failed && reason && (
          <p style={{
            margin: "14px 0 0", padding: "8px 12px", borderRadius: 8,
            background: T.accentBg, color: T.textSub,
            fontSize: 12, textAlign: "left", wordBreak: "break-word",
          }}>
            {reason}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={() => router.replace("/dashboard")}
            style={{ ...button, background: T.text, color: T.textInverted }}
          >
            {failed ? "Réessayer" : "Voir mon patrimoine"}
          </button>
          {failed && (
            <button
              type="button"
              onClick={() => router.replace("/dashboard")}
              style={{ ...button, background: "transparent", color: T.textSub }}
            >
              Retour à l&apos;accueil
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BankCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackContent />
    </Suspense>
  );
}
