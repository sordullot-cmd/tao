import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

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
/**
 * Les clés de session dans localStorage (`sb-<ref>-auth-token`, éventuellement
 * suffixées `.0`, `.1`… quand supabase-js découpe la valeur).
 *
 * Énumérées via `length`/`key(i)` — l'API Storage — et non `Object.keys`. Un
 * vrai `Storage` expose ses clés comme propriétés, mais pas un objet qui
 * l'imite : sous le polyfill des tests, `Object.keys` rend « getItem »,
 * « setItem »… et jamais une seule clé stockée.
 */
function authStorageKeys(): string[] {
  const keys: string[] = [];
  try {
    const store = window.localStorage;
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith("sb-") && key.includes("-auth-token")) keys.push(key);
    }
  } catch {
    // localStorage indisponible (mode privé strict) : rien à énumérer.
  }
  return keys;
}

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
    authStorageKeys().forEach((key) => window.localStorage.removeItem(key));
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

/* ── Hors ligne ───────────────────────────────────────────────────────────────
 * Une panne de réseau n'est PAS une déconnexion, et les confondre coûte cher :
 * sans utilisateur, `useCloudState` cesse de poser ses écritures en attente
 * (sa file est gardée par `user?.id`). Le travail fait hors ligne n'est alors
 * pas seulement invisible — il ne remonte jamais au retour du réseau.
 */

/** Vrai quand l'échec vient du réseau, pas d'un refus du serveur. */
export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: string; message?: string };
  // supabase-js emballe lui-même les pannes réseau sous ce nom. On ne va PAS
  // jusqu'à accepter tout `TypeError` : `fetch` en jette un, mais un vrai bug
  // aussi, et le prendre pour une coupure masquerait la panne au lieu de la
  // montrer. Le message, lui, est sans ambiguïté.
  if (name === "AuthRetryableFetchError") return true;
  const msg = (message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||          // Chromium
    msg.includes("load failed") ||              // WKWebView — donc la coquille Tauri
    msg.includes("networkerror") ||             // Firefox
    msg.includes("network request failed") ||
    msg.includes("err_internet_disconnected")
  );
}

/** Le JSON de session est stocké en base64 (UTF-8) dans les versions récentes. */
function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * La session telle qu'elle dort dans le storage, SANS aucun appel réseau.
 *
 * Même convention de clé que `clearStaleSession` (`sb-<ref>-auth-token`), et
 * mêmes tolérances : supabase-js écrit du JSON brut ou ce JSON en base64
 * préfixé `base64-`, et peut le découper en `<clé>.0`, `<clé>.1`…
 *
 * On rend la session MÊME EXPIRÉE. Ici on ne cherche pas à prouver un droit
 * d'accès — le serveur s'en chargera au retour du réseau — mais seulement à
 * savoir DE QUI est le travail en cours, pour pouvoir le lui rattacher.
 */
export function readStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    const keys = authStorageKeys();
    if (keys.length === 0) return null;
    const chunks = keys.filter((key) => /\.\d+$/.test(key));
    raw = chunks.length
      ? chunks
          .sort((a, b) => Number(a.split(".").pop()) - Number(b.split(".").pop()))
          .map((key) => window.localStorage.getItem(key) ?? "")
          .join("")
      : window.localStorage.getItem(keys[0]);
  } catch {
    return null; // localStorage indisponible (mode privé strict)
  }
  if (!raw) return null;
  try {
    const json = raw.startsWith("base64-")
      ? decodeBase64Utf8(raw.slice("base64-".length))
      : raw;
    const parsed = JSON.parse(json);
    // Selon la version : la session à la racine, ou sous `currentSession`.
    const session = (parsed?.currentSession ?? parsed) as Session | null;
    if (!session || typeof session !== "object") return null;
    if (!session.access_token || !session.user?.id) return null;
    return session;
  } catch {
    return null; // storage corrompu : on repart en déconnecté, c'est le bon défaut
  }
}
