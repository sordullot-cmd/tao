import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * L'amorçage de l'agrégation bancaire à l'ouverture de l'application.
 *
 * `useBankAccounts` sait déjà se taire quand la donnée est fraîche et partager
 * une requête en vol ; ce qui se teste ici est le DÉCLENCHEUR, et lui seul : le
 * fournisseur d'authentification doit lancer l'agrégation à l'instant où il
 * apprend qu'il y a une session, sans attendre qu'une page affiche des comptes.
 *
 * Et surtout PAS avant : la route répond 401 sans session, et un 401 purge le
 * cache des soldes. Amorcer trop tôt effacerait donc exactement ce qu'on cherche
 * à montrer sans attente — c'est le cas que le dernier test tient.
 */

/* `vi.mock` est remonté en tête du fichier : tout ce que ses fabriques
   utilisent doit l'être aussi, d'où `vi.hoisted`. */
type Fake = { user: { id: string } } | null;

const h = vi.hoisted(() => ({
  prime: vi.fn(),
  /** Session rendue par `getSession`, et rappel d'`onAuthStateChange`. */
  session: null as Fake,
  onAuthChange: null as ((event: string, s: Fake) => void) | null,
}));

vi.mock("@/lib/bank/useBankAccounts", () => ({
  primeBankAccounts: h.prime,
  clearBankAccountsCache: vi.fn(),
}));

vi.mock("@/lib/bank/useBankTransactions", () => ({
  clearBankTransactionsCache: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: h.session }, error: null }),
      onAuthStateChange: (cb: (event: string, s: Fake) => void) => {
        h.onAuthChange = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => ({ error: null }),
    },
  }),
  clearStaleSession: vi.fn(),
  isRefreshTokenError: () => false,
}));

import { AuthProvider } from "@/lib/auth/supabaseAuthProvider";

beforeEach(() => {
  h.prime.mockClear();
  h.session = null;
  h.onAuthChange = null;
});

describe("amorçage des comptes bancaires", () => {
  it("part dès que la session est lue au chargement", async () => {
    h.session = { user: { id: "u1" } };
    render(<AuthProvider><div /></AuthProvider>);

    await waitFor(() => expect(h.prime).toHaveBeenCalled());
  });

  it("part à la connexion quand il n'y avait pas de session", async () => {
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(h.onAuthChange).not.toBeNull());

    // Rien tant que personne n'est connecté.
    expect(h.prime).not.toHaveBeenCalled();

    h.onAuthChange?.("SIGNED_IN", { user: { id: "u1" } });
    await waitFor(() => expect(h.prime).toHaveBeenCalled());
  });

  it("n'amorce RIEN sans session — un 401 purgerait le cache", async () => {
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(h.onAuthChange).not.toBeNull());

    h.onAuthChange?.("SIGNED_OUT", null);

    expect(h.prime).not.toHaveBeenCalled();
  });
});
