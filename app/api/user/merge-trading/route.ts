import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createMergeCode, verifyMergeCode } from "@/lib/accountMerge";

/**
 * POST /api/user/merge-trading
 *
 *   { action: "code" }   → émet un code de transfert pour le compte connecté
 *   { code: "tr4de-…", scope?: "trading" | "all" }
 *                        → rapatrie le trading (ou tout) du compte émetteur
 *                          dans le compte connecté
 *
 * L'identité vient du jeton Bearer et non des cookies : la coquille Tauri et
 * le navigateur n'ont pas toujours les mêmes cookies, le jeton, si.
 */

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* Le bucket Éloquence est privé et rangé par utilisateur : passée à la
   cible, une session dont l'audio reste sous le dossier de la source ne
   pourrait plus être réécoutée. On recopie AVANT la transaction et on ne
   supprime l'original qu'APRÈS : si la base échoue, la source n'a rien perdu,
   il ne reste que des copies orphelines côté cible. */
const AUDIO_BUCKET = "eloquence_audio";

async function listAudio(admin: ReturnType<typeof adminClient>, userId: string) {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(AUDIO_BUCKET).list(userId, { limit: 1000, offset });
    if (error || !data?.length) break;
    names.push(...data.filter((o) => o.id).map((o) => o.name));
    if (data.length < 1000) break;
  }
  return names;
}

export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return NextResponse.json({ error: "Serveur mal configuré" }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const admin = adminClient();
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  let body: { action?: string; code?: string; scope?: string };
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

  const all = body.scope === "all";
  const audio = all ? await listAudio(admin, check.sourceUserId) : [];
  for (const name of audio) {
    const { error: copyError } = await admin.storage
      .from(AUDIO_BUCKET)
      .copy(`${check.sourceUserId}/${name}`, `${user.id}/${name}`);
    // Déjà là : une tentative précédente a été interrompue après la copie.
    if (copyError && !/exists/i.test(copyError.message)) {
      console.error("[merge-trading] audio", name, copyError.message);
      return NextResponse.json({ error: "Copie des enregistrements audio impossible, rien n'a été déplacé." }, { status: 500 });
    }
  }

  const fn = all ? "transfer_all_data" : "merge_trading_data";
  const { data: moved, error } = await admin.rpc(fn, {
    p_source: check.sourceUserId,
    p_target: user.id,
  });
  if (error) {
    console.error("[merge-trading]", error.message);
    const missing = new RegExp(fn).test(error.message) && /function|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: missing ? `Migration ${all ? "037" : "036"} non appliquée sur la base.` : "La fusion a échoué, rien n'a été déplacé." },
      { status: 500 },
    );
  }

  if (audio.length) {
    await admin.storage.from(AUDIO_BUCKET).remove(audio.map((name) => `${check.sourceUserId}/${name}`)).catch(() => {});
  }

  return NextResponse.json({ moved, sourceEmail: source.user.email ?? null });
}
