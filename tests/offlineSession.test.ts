import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isOfflineError, readStoredSession } from "@/lib/supabase/client";

/**
 * Ce que ces tests protègent, c'est une perte de données silencieuse.
 *
 * La file d'attente de `useCloudState` est gardée par `user?.id`. Si une panne
 * réseau est prise pour une déconnexion, il n'y a plus d'utilisateur, la file
 * ne retient plus rien, et tout ce qui est saisi hors ligne disparaît au lieu
 * de partir au retour de la connexion. Rien, dans l'interface, ne le dirait.
 */

const KEY = "sb-abcdefgh-auth-token";

function session(extra: Record<string, unknown> = {}) {
  return {
    access_token: "jeton",
    refresh_token: "rafraichissement",
    expires_at: 1,
    user: { id: "u-1", email: "sacha@example.com" },
    ...extra,
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("isOfflineError", () => {
  beforeEach(() => setOnline(true));
  afterEach(() => setOnline(true));

  it("reconnaît l'erreur de fetch de chaque moteur", () => {
    expect(isOfflineError(new TypeError("Failed to fetch"))).toBe(true);
    // WKWebView, donc la coquille Tauri — le cas qui nous intéresse le plus.
    expect(isOfflineError(new TypeError("Load failed"))).toBe(true);
    expect(isOfflineError(new Error("NetworkError when attempting to fetch"))).toBe(true);
  });

  it("reconnaît l'emballage de supabase-js", () => {
    const err = new Error("boom");
    err.name = "AuthRetryableFetchError";
    expect(isOfflineError(err)).toBe(true);
  });

  it("croit le navigateur quand il se sait hors ligne", () => {
    setOnline(false);
    expect(isOfflineError(new Error("peu importe"))).toBe(true);
  });

  /* La moitié qui compte : un vrai bug ne doit pas passer pour une coupure,
     sinon on masque la panne au lieu de la montrer. */
  it("laisse passer ce qui n'est pas une panne de réseau", () => {
    expect(isOfflineError(new Error("invalid credentials"))).toBe(false);
    expect(isOfflineError(new TypeError("x is not a function"))).toBe(false);
    expect(isOfflineError(null)).toBe(false);
    expect(isOfflineError("failed to fetch")).toBe(false); // pas un objet
  });
});

describe("readStoredSession", () => {
  beforeEach(() => localStorage.clear());

  it("relit une session en JSON brut", () => {
    localStorage.setItem(KEY, JSON.stringify(session()));
    expect(readStoredSession()?.user.id).toBe("u-1");
  });

  it("relit une session en base64, accents compris", () => {
    const value = session({ user: { id: "u-2", email: "sacha@éxemple.fr" } });
    const utf8 = new TextEncoder().encode(JSON.stringify(value));
    const b64 = btoa(String.fromCharCode(...utf8));
    localStorage.setItem(KEY, `base64-${b64}`);
    expect(readStoredSession()?.user.email).toBe("sacha@éxemple.fr");
  });

  it("recolle une session découpée en morceaux, dans l'ordre", () => {
    const raw = JSON.stringify(session());
    const cut = Math.floor(raw.length / 2);
    // Volontairement posés à l'envers : c'est l'indice qui fait foi, pas
    // l'ordre d'énumération de localStorage.
    localStorage.setItem(`${KEY}.1`, raw.slice(cut));
    localStorage.setItem(`${KEY}.0`, raw.slice(0, cut));
    expect(readStoredSession()?.user.id).toBe("u-1");
  });

  it("rend la session même expirée — c'est le serveur qui tranchera", () => {
    localStorage.setItem(KEY, JSON.stringify(session({ expires_at: 0 })));
    expect(readStoredSession()).not.toBeNull();
  });

  it("rend null plutôt qu'une session bancale", () => {
    expect(readStoredSession()).toBeNull(); // storage vide

    localStorage.setItem(KEY, "{ pas du json");
    expect(readStoredSession()).toBeNull();

    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify({ access_token: "jeton" })); // sans user
    expect(readStoredSession()).toBeNull();

    localStorage.clear();
    localStorage.setItem("autre-chose", JSON.stringify(session()));
    expect(readStoredSession()).toBeNull();
  });
});
