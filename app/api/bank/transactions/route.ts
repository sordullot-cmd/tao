import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthSuccess } from "@/lib/auth/apiAuth";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTransactions,
  isBankConfigured,
  TRANSACTIONS_WINDOW_DAYS,
} from "@/lib/bank/enablebanking";

/**
 * GET /api/bank/transactions?uid=… — mouvements d'un compte agrégé.
 *
 * L'`uid` arrive du client : il est VÉRIFIÉ contre les connexions de
 * l'utilisateur avant tout appel à l'agrégateur. Sans ce contrôle, un uid
 * deviné suffirait à lire le relevé d'un autre utilisateur — la clé de
 * signature Enable Banking est celle de l'application, pas celle du porteur du
 * compte, donc l'API distante, elle, ne poserait aucune question.
 *
 * Rien n'est stocké : comme les soldes, les mouvements sont relus à chaque
 * appel (cf. `useBankAccounts`).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthSuccess(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const uid = request.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Compte manquant." }, { status: 400 });

  if (!isBankConfigured()) {
    return NextResponse.json({ configured: false, transactions: [] });
  }

  const supabase = await createClient();
  const { data: connections, error } = await supabase
    .from("bank_connections")
    .select("account_uids")
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const owned = (connections ?? []).some(
    (c) => Array.isArray(c.account_uids) && (c.account_uids as string[]).includes(uid),
  );
  // Volontairement un 404 et non un 403 : répondre « interdit » confirmerait
  // l'existence du compte à qui a deviné son identifiant.
  if (!owned) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });

  try {
    const transactions = await fetchTransactions(uid);
    return NextResponse.json({
      configured: true,
      windowDays: TRANSACTIONS_WINDOW_DAYS,
      transactions,
    });
  } catch (err) {
    /* Toutes les banques n'ouvrent pas l'accès aux opérations, et un
       consentement expiré échoue ici avant d'échouer sur les soldes. La page
       affiche le message tel quel : « mouvements indisponibles » sans raison ne
       dit pas s'il faut reconnecter la banque ou attendre. */
    return NextResponse.json(
      {
        configured: true,
        windowDays: TRANSACTIONS_WINDOW_DAYS,
        transactions: [],
        error: err instanceof Error ? err.message : "Erreur inconnue",
      },
      { status: 502 },
    );
  }
}
