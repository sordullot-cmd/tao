import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createMergeCode, verifyMergeCode } from "@/lib/accountMerge";

/**
 * POST /api/user/merge-trading
 *
 *   { action: "code" }   → émet un code de transfert pour le compte connecté
 *   { code: "tr4de-…" }  → rapatrie le trading du compte émetteur dans le
 *                          compte connecté
 *
 * L'identité vient du jeton Bearer et non des cookies : la coquille Tauri et
 * le navigateur n'ont pas toujours les mêmes cookies, le jeton, si.
 */

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return NextResponse.json({ error: "Serveur mal configuré" }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const admin = adminClient();
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  let body: { action?: string; code?: string };
  try { body = await req.json(); } catch { body = {}; }

  if (body.action === "code") {
    const { code, expiresAt } = createMergeCode(user.id, secret);
    return NextResponse.json({ code, expiresAt });
  }

  const check = verifyMergeCode(body.code || "", secret);
  if (!check.ok) {
    return NextResponse.json(
      { error: check.reason === "expired" ? "Code expiré — génères-en un nouveau." : "Code invalide." },
      { status: 400 },
    );
  }
  if (check.sourceUserId === user.id) {
    return NextResponse.json({ error: "Ce code vient de ce compte-ci : génère-le depuis l'AUTRE compte." }, { status: 400 });
  }

  // Le code a pu être émis par un compte supprimé depuis.
  const { data: source } = await admin.auth.admin.getUserById(check.sourceUserId);
  if (!source?.user) return NextResponse.json({ error: "Le compte d'origine n'existe plus." }, { status: 404 });

  const { data: moved, error } = await admin.rpc("merge_trading_data", {
    p_source: check.sourceUserId,
    p_target: user.id,
  });
  if (error) {
    console.error("[merge-trading]", error.message);
    const missing = /merge_trading_data/.test(error.message) && /function|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: missing ? "Migration 036 non appliquée sur la base." : "La fusion a échoué, rien n'a été déplacé." },
      { status: 500 },
    );
  }

  return NextResponse.json({ moved, sourceEmail: source.user.email ?? null });
}
