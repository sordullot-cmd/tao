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

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { T } from "@/lib/ui/tokens";

/** « depuis mars 2024 » — la profondeur se lit au mois, pas au jour. */
function monthOf(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
      .format(new Date(y, (m || 1) - 1, 1));
  } catch {
    return iso;
  }
}

/* ── Capture de l'historique ───────────────────────────────────────────────
   Le consentement vient d'être donné : c'est LA fenêtre pendant laquelle la
   banque ouvre ses opérations anciennes, et elle se referme vite (la plupart
   des ASPSP reviennent ensuite à 90 jours). On ne peut donc pas attendre que
   l'utilisateur ouvre la page Patrimoine — la capture part d'ici, tout de
   suite, et l'écran rend compte de ce qu'elle a obtenu.
   ------------------------------------------------------------------------ */

interface Backfill {
  state: "running" | "done" | "error";
  accounts?: number;
  oldest?: string | null;
}

function CallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const failed = params.get("status") === "error";
  const reason = params.get("reason");
  const bank = params.get("bank");

  /* L'état de départ est posé au RENDU, pas dans l'effet : la capture part dès
     l'arrivée sur la page, et « Récupération… » doit s'afficher du premier
     coup plutôt qu'au rendu suivant. */
  const [backfill, setBackfill] = useState<Backfill | null>(
    failed ? null : { state: "running" },
  );

  useEffect(() => {
    if (failed) return;
    let cancelled = false;

    void (async () => {
      try {
        const resp = await fetch("/api/bank/backfill", { method: "POST" });
        const data = await resp.json();
        if (cancelled) return;
        setBackfill(
          resp.ok
            ? { state: "done", accounts: data.accounts, oldest: data.oldest }
            : { state: "error" },
        );
      } catch {
        if (!cancelled) setBackfill({ state: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [failed]);

  const button = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "100%", minHeight: 44, borderRadius: 999, border: "none",
    fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
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

        <h1 style={{ margin: "12px 0 0", fontSize: 16, fontWeight: 500 }}>
          {failed ? "Connexion échouée" : "Banque connectée"}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: T.textSub }}>
          {failed
            ? "La connexion à ta banque n'a pas abouti. Tu peux réessayer."
            : `${bank ? `${bank} est connectée. ` : ""}Tes comptes vont apparaître dans ton patrimoine.`}
        </p>

        {/* La capture ne bloque rien : l'utilisateur peut partir, elle continue
            côté serveur. Ce qui est dit ici, c'est jusqu'où l'historique remonte
            VRAIMENT — demander tout n'en garantit pas l'obtention, et le
            découvrir plus tard sur une courbe trop courte serait pire. */}
        {!failed && backfill && (
          <p style={{
            margin: "14px 0 0", padding: "8px 12px", borderRadius: 8,
            background: T.accentBg, color: T.textSub, fontSize: 12,
          }}>
            {backfill.state === "running" && "Récupération de ton historique…"}
            {backfill.state === "done" && (
              backfill.oldest
                ? `Historique récupéré depuis ${monthOf(backfill.oldest)}.`
                : "Aucun mouvement à récupérer pour l'instant."
            )}
            {backfill.state === "error" &&
              "Historique non récupéré pour le moment — tes comptes restent connectés."}
          </p>
        )}

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
