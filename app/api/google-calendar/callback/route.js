import { getOAuthClient } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

function errorPage(message, status = 400) {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Erreur Google Agenda</title>
      <style>body{font-family:system-ui,sans-serif;max-width:560px;margin:64px auto;padding:0 24px;color:#0D0D0D;line-height:1.5}a{color:#3B82F6}</style></head>
      <body>
        <h2>Connexion à Google Agenda échouée</h2>
        <p>${message}</p>
        <p>Vérifie que l'URI de redirection est bien déclarée dans la Google Cloud Console, et que ton compte est autorisé (testeur ou app publiée).</p>
        <p><a href="/#agenda">← Retour au calendrier</a></p>
      </body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const code = params.get("code");
    const error = params.get("error");

    if (error) return errorPage(`OAuth: ${error}`);
    if (!code) return errorPage("Code d'autorisation manquant.");

    const client = getOAuthClient(req);
    if (!client) return errorPage("Identifiants OAuth absents côté serveur.", 503);

    const { tokens } = await client.getToken(code);

    // On stocke côté navigateur puis on revient sur la page Calendrier (#agenda).
    // JSON.stringify protège contre les injections dans le <script>.
    const payload = JSON.stringify({
      access_token: tokens.access_token || null,
      refresh_token: tokens.refresh_token || null,
      expiry_date: tokens.expiry_date || null,
    });

    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <script>
          try {
            var data = ${payload};
            localStorage.setItem('tao_gcal_tokens', JSON.stringify(data));
          } catch (e) {}
          window.location.replace('/#agenda');
        </script>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (e) {
    return errorPage(e?.message || "Erreur inconnue", 500);
  }
}
