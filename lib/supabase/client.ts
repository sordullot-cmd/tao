import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton browser client. createBrowserClient doit être appelé une seule fois
// par onglet : sinon le listener onAuthStateChange et le rafraîchissement
// automatique des tokens se réinitialisent à chaque rendu, ce qui peut
// déconnecter l'utilisateur de manière intermittente.
let _client: SupabaseClient | null = null;

export function createClient() {
  if (typeof window === "undefined") {
    // Côté serveur (SSR/SSG) : on retourne toujours un nouveau client,
    // un singleton n'aurait pas de sens entre requêtes.
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}

// Le refresh token stocké localement peut ne plus exister côté Supabase :
// session révoquée, token déjà utilisé (rotation), ou projet réinitialisé.
// Supabase renvoie alors une AuthApiError qu'il faut traiter comme
// « pas de session » et non comme une panne : sinon l'erreur remonte à
// l'overlay Next et l'utilisateur reste bloqué avec un storage périmé.
export function isRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  if (code === "refresh_token_not_found" || code === "refresh_token_already_used") {
    return true;
  }
  const msg = (message ?? "").toLowerCase();
  return (
    msg.includes("refresh token not found") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token already used")
  );
}

// Purge la session locale sans appel réseau (le token est déjà invalide,
// inutile de tenter une révocation serveur qui échouerait à son tour).
export async function clearStaleSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await createClient().auth.signOut({ scope: "local" });
  } catch {
    // signOut peut lui-même échouer si le storage est corrompu : on force
    // la suppression des clés `sb-<ref>-auth-token` (localStorage + cookies).
  }
  const isAuthKey = (key: string) =>
    key.startsWith("sb-") && key.includes("-auth-token");
  try {
    Object.keys(window.localStorage)
      .filter(isAuthKey)
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // localStorage indisponible (mode privé strict) : rien à purger.
  }
  document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter(isAuthKey)
    .forEach((name) => {
      document.cookie = `${name}=; Max-Age=0; path=/`;
    });
}
