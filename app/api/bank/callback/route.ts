import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthSuccess } from "@/lib/auth/apiAuth";
import { createClient } from "@/lib/supabase/server";
import { createSession, isBankConfigured } from "@/lib/bank/enablebanking";

/**
 * GET /api/bank/callback — retour du consentement bancaire.
 *
 * La banque renvoie l'utilisateur ici avec un `code` à échanger contre une
 * session. Cette route ne rend pas de JSON : elle REDIRIGE vers l'écran
 * `/bank/callback`, qui est ce que l'utilisateur a sous les yeux au retour de
 * son application bancaire.
 *
 * L'échec est porté par l'URL (`status=error&reason=…`) plutôt que par un code
 * HTTP : à ce stade, l'utilisateur revient d'un site tiers et doit voir une
 * page, pas une erreur brute.
 */
function redirectTo(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/bank/callback", request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthSuccess(auth)) {
    return redirectTo(request, { status: "error", reason: "Session expirée. Reconnecte-toi puis réessaie." });
  }

  if (!isBankConfigured()) {
    return redirectTo(request, { status: "error", reason: "Connexion bancaire non configurée sur ce déploiement." });
  }

  const code = request.nextUrl.searchParams.get("code");
  // La banque peut refuser le consentement : elle renvoie alors une erreur au
  // lieu d'un code. C'est un abandon, pas une panne — on le dit tel quel.
  const denied = request.nextUrl.searchParams.get("error");
  if (denied) {
    return redirectTo(request, { status: "error", reason: `Consentement refusé (${denied}).` });
  }
  if (!code) {
    return redirectTo(request, { status: "error", reason: "Code d'autorisation manquant." });
  }

  try {
    const session = await createSession(code);
    const supabase = await createClient();

    /* Reconnecter la même banque ne doit pas empiler des sessions mortes :
       l'index unique (user_id, session_id) de la migration 033 fait de ce
       second passage une mise à jour. */
    const { error } = await supabase.from("bank_connections").upsert(
      {
        user_id: auth.user.id,
        session_id: session.sessionId,
        aspsp_name: session.aspspName,
        aspsp_country: session.aspspCountry,
        account_uids: session.accountUids,
        valid_until: session.validUntil,
      },
      { onConflict: "user_id,session_id" },
    );
    if (error) throw new Error(error.message);

    return redirectTo(request, { status: "ok", bank: session.aspspName });
  } catch (err) {
    return redirectTo(request, {
      status: "error",
      reason: err instanceof Error ? err.message : "Erreur inconnue",
    });
  }
}
