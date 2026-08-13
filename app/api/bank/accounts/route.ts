import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthSuccess } from "@/lib/auth/apiAuth";
import { createClient } from "@/lib/supabase/server";
import { fetchAccounts, isBankConfigured } from "@/lib/bank/enablebanking";

/**
 * GET /api/bank/accounts — soldes en direct des banques connectées.
 *
 * Aucun solde n'est mis en cache côté serveur : ils sont relus à chaque appel.
 * La liste des connexions est rendue avec les comptes, car la page en a besoin
 * pour afficher les consentements et leur date d'expiration — un consentement
 * DSP2 expire, et l'agrégation devient muette sans prévenir.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthSuccess(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = await createClient();
  const { data: connections, error } = await supabase
    .from("bank_connections")
    .select("id, session_id, aspsp_name, aspsp_country, account_uids, valid_until, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = connections ?? [];
  if (rows.length === 0 || !isBankConfigured()) {
    return NextResponse.json({ configured: isBankConfigured(), connections: rows, accounts: [] });
  }

  try {
    const accounts = await fetchAccounts(rows);
    return NextResponse.json({ configured: true, connections: rows, accounts });
  } catch (err) {
    /* Les connexions sont rendues même quand les soldes échouent : la page peut
       alors proposer de reconnecter la banque, ce qu'une liste vide ne
       permettrait pas de comprendre. */
    return NextResponse.json(
      {
        configured: true,
        connections: rows,
        accounts: [],
        error: err instanceof Error ? err.message : "Erreur inconnue",
      },
      { status: 502 },
    );
  }
}

/** DELETE /api/bank/connections?id=… — révoque une connexion côté application. */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthSuccess(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Connexion manquante." }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
