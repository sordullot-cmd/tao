import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthSuccess } from "@/lib/auth/apiAuth";
import { createClient } from "@/lib/supabase/server";
import { mergeTransactions } from "@/lib/bank/archive";
import { archiveTransactions, readArchivedTransactions } from "@/lib/bank/archiveStore";
import {
  fetchTransactions,
  isBankConfigured,
  TRANSACTIONS_DEPTHS,
  TRANSACTIONS_WINDOW_DAYS,
} from "@/lib/bank/enablebanking";

/**
 * GET /api/bank/transactions?uid=…&days=… — mouvements d'un compte agrégé.
 *
 * `days` choisit la profondeur d'historique, parmi une liste fermée
 * (`TRANSACTIONS_DEPTHS`, dont `0` = tout ce que la banque rend). Elle est
 * validée plutôt que transmise telle quelle : la valeur finit en `date_from`
 * chez l'agrégateur, et une profondeur arbitraire venue de l'URL n'y a rien à
 * faire. Une valeur inconnue retombe sur la fenêtre par défaut.
 *
 * L'`uid` arrive du client : il est VÉRIFIÉ contre les connexions de
 * l'utilisateur avant tout appel à l'agrégateur. Sans ce contrôle, un uid
 * deviné suffirait à lire le relevé d'un autre utilisateur — la clé de
 * signature Enable Banking est celle de l'application, pas celle du porteur du
 * compte, donc l'API distante, elle, ne poserait aucune question.
 *
 * Les mouvements sont relus à chaque appel, comme les soldes — mais contrairement
 * à eux ils sont AUSSI archivés au passage (`bank_transactions`, migration 034).
 * La banque referme l'accès à son historique profond peu après le consentement :
 * sans archive, le passé de l'application reculerait tout seul jusqu'à 90 jours.
 * La réponse est donc l'union de ce que la banque rend et de ce qu'on a conservé.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthSuccess(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const uid = request.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Compte manquant." }, { status: 400 });

  const asked = Number(request.nextUrl.searchParams.get("days"));
  const days = (TRANSACTIONS_DEPTHS as readonly number[]).includes(asked)
    ? asked
    : TRANSACTIONS_WINDOW_DAYS;

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
    const fresh = await fetchTransactions(uid, days);

    /* Ce que la banque rend AUJOURD'HUI est le passé inaccessible de demain :
       chaque lecture alimente donc l'archive au passage. C'est ce qui fait que
       l'historique s'allonge avec le temps au lieu de reculer avec la fenêtre
       DSP2 (cf. migration 034). */
    await archiveTransactions(supabase, auth.user.id, uid, fresh);
    const archived = await readArchivedTransactions(supabase, auth.user.id, uid, days);
    const transactions = mergeTransactions(fresh, archived);

    return NextResponse.json({
      configured: true,
      // La profondeur RÉELLEMENT demandée : le client s'en sert pour savoir ce
      // que son cache couvre, et n'a donc pas à supposer qu'elle a été honorée.
      windowDays: days,
      transactions,
      // Ce que l'archive a ajouté par-dessus la fenêtre de la banque.
      fromArchive: transactions.length - fresh.length,
    });
  } catch (err) {
    /* Toutes les banques n'ouvrent pas l'accès aux opérations, et un
       consentement expiré échoue ici avant d'échouer sur les soldes.

       L'archive prend alors le relais : un relevé conservé vaut mieux qu'un
       écran vide doublé d'un message d'erreur, et c'est exactement le cas
       qu'elle existe pour couvrir. On ne le signale pas comme une panne — il
       n'y a rien à faire pour l'utilisateur tant que les opérations récentes
       sont là. */
    const archived = await readArchivedTransactions(supabase, auth.user.id, uid, days);
    if (archived.length > 0) {
      return NextResponse.json({
        configured: true,
        windowDays: days,
        transactions: archived,
        source: "archive",
      });
    }

    // Rien en archive non plus : là, le message doit dire s'il faut reconnecter
    // la banque ou attendre.
    return NextResponse.json(
      {
        configured: true,
        windowDays: days,
        transactions: [],
        error: err instanceof Error ? err.message : "Erreur inconnue",
      },
      { status: 502 },
    );
  }
}
