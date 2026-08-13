import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthSuccess } from "@/lib/auth/apiAuth";
import { createAuthLink, isBankConfigured } from "@/lib/bank/enablebanking";

/**
 * POST /api/bank/connect — démarre le consentement pour une banque.
 *
 * Rend le lien à ouvrir : c'est la banque elle-même qui authentifie
 * l'utilisateur, l'application ne voit jamais ses identifiants bancaires.
 *
 * L'URL de retour est déduite de la requête plutôt que d'une variable
 * d'environnement : preview Vercel, localhost et production ont chacune la
 * leur, et une valeur figée casserait deux cas sur trois. Elle doit être
 * déclarée telle quelle dans la console Enable Banking.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthSuccess(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isBankConfigured()) {
    return NextResponse.json(
      { error: "Connexion bancaire non configurée sur ce déploiement." },
      { status: 501 },
    );
  }

  try {
    const body = await request.json();
    const institution = String(body?.institution || "").trim();
    if (!institution) {
      return NextResponse.json({ error: "Banque manquante." }, { status: 400 });
    }

    const redirectUrl = `${request.nextUrl.origin}/api/bank/callback`;
    const link = await createAuthLink(institution, redirectUrl);
    return NextResponse.json({ link });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 },
    );
  }
}
