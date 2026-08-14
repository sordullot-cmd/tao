import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthSuccess } from "@/lib/auth/apiAuth";
import { createClient } from "@/lib/supabase/server";
import { archiveTransactions, readArchivedTransactions } from "@/lib/bank/archiveStore";
import { fetchTransactions, isBankConfigured } from "@/lib/bank/enablebanking";
import { ALL_DAYS, oldestDate } from "@/lib/bank/transactions";

/**
 * POST /api/bank/backfill — capture de l'historique profond.
 *
 * C'est la route qui donne son intérêt à l'archive. Une banque n'ouvre l'accès
 * à ses opérations anciennes que peu de temps après l'authentification forte ;
 * ensuite, la plupart des ASPSP referment l'accès aux 90 derniers jours. Le bon
 * moment pour tout prendre est donc JUSTE APRÈS le consentement — c'est là que
 * l'écran de retour (`/bank/callback`) l'appelle.
 *
 * Elle est aussi rejouable à la main : la relancer ne coûte que des upserts
 * sans effet si rien de nouveau n'est apparu, et elle rattrape tout ce qu'une
 * banque exceptionnellement généreuse voudrait bien rendre plus tard.
 *
 * Les comptes sont traités EN SÉRIE : ce sont autant d'allers-retours jusqu'aux
 * banques, sur la profondeur maximale, et rien ici n'attend de réponse à
 * l'écran — l'écran de retour affiche un compte-rendu, il ne bloque pas dessus.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthSuccess(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isBankConfigured()) {
    return NextResponse.json({ configured: false, accounts: 0, saved: 0 });
  }

  const supabase = await createClient();
  const { data: connections, error } = await supabase
    .from("bank_connections")
    .select("account_uids")
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const uids = (connections ?? []).flatMap((c) =>
    Array.isArray(c.account_uids) ? (c.account_uids as string[]) : [],
  );

  let saved = 0;
  const failed: string[] = [];

  for (const uid of uids) {
    try {
      const transactions = await fetchTransactions(uid, ALL_DAYS);
      saved += await archiveTransactions(supabase, auth.user.id, uid, transactions);
    } catch {
      /* Une banque qui refuse ses opérations ne doit pas interrompre les
         autres : chaque compte est indépendant, et un consentement partiel vaut
         mieux qu'aucun archivage du tout. */
      failed.push(uid);
    }
  }

  /* Jusqu'où l'archive remonte VRAIMENT, une fois la capture faite. C'est la
     seule réponse honnête à « est-ce que j'ai tout mon historique » : demander
     tout ne garantit pas de l'obtenir, seule la date obtenue le dit. */
  let oldest: string | null = null;
  for (const uid of uids) {
    const archived = await readArchivedTransactions(supabase, auth.user.id, uid, ALL_DAYS);
    const first = oldestDate(archived);
    if (first && (oldest === null || first < oldest)) oldest = first;
  }

  return NextResponse.json({
    configured: true,
    accounts: uids.length,
    saved,
    failed: failed.length,
    oldest,
  });
}
