import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

/**
 * Ce que ces tests protègent, c'est un comportement qu'on VOIT : les comptes
 * bancaires mettaient deux secondes à apparaître, et disparaissaient puis
 * revenaient à chaque changement d'écran. Le remède (cache d'abord, relecture
 * derrière, store partagé) tient en trois promesses testables ici : premier
 * rendu immédiat depuis le cache, une seule requête pour plusieurs pages, et
 * jamais de liste vidée par une relecture qui échoue.
 *
 * Le store vit au niveau du MODULE : chaque test le réimporte à neuf, sinon
 * l'état d'un cas fuirait dans le suivant.
 */

const CACHE_KEY = "tr4de_bank_accounts";

const account = (id: string, balance = 1000) => ({
  id: `enablebanking-${id}`,
  uid: id,
  name: `Compte ${id}`,
  type: "checking" as const,
  balance,
  currency: "EUR",
  institution: "Banque test",
  logo: null,
});

/** Cache tel que l'application l'écrit, daté de `ageMs` millisecondes. */
function seedCache(accounts: ReturnType<typeof account>[], ageMs = 0) {
  window.localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      version: 1,
      configured: true,
      connections: [],
      accounts,
      updatedAt: new Date(Date.now() - ageMs).toISOString(),
    }),
  );
}

/** Réponse de `/api/bank/accounts`. */
const okResponse = (accounts: ReturnType<typeof account>[], extra: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ configured: true, connections: [], accounts, ...extra }),
});

async function loadHook() {
  vi.resetModules();
  return (await import("@/lib/bank/useBankAccounts")).useBankAccounts;
}

/** Affiche le nombre de comptes et l'état du hook, pour les lire à l'écran. */
function probe(useBankAccounts: () => ReturnType<Awaited<ReturnType<typeof loadHook>>>, tag = "a") {
  return function Probe() {
    const bank = useBankAccounts();
    return (
      <div>
        <span data-testid={`${tag}-count`}>{bank.accounts.length}</span>
        <span data-testid={`${tag}-loading`}>{String(bank.loading)}</span>
        <span data-testid={`${tag}-revalidating`}>{String(bank.revalidating)}</span>
        <span data-testid={`${tag}-error`}>{bank.error ?? ""}</span>
      </div>
    );
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("premier affichage", () => {
  it("montre les comptes du cache dès le premier rendu, sans attendre le réseau", async () => {
    seedCache([account("a"), account("b")], 10 * 60_000);
    // La requête ne répond jamais : tout ce qui s'affiche vient donc du cache.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    render(<Probe />);

    // Pas de `waitFor` : c'est le rendu SYNCHRONE qui doit déjà porter les comptes.
    expect(screen.getByTestId("a-count")).toHaveTextContent("2");
    expect(screen.getByTestId("a-loading")).toHaveTextContent("false");
  });

  it("annonce un chargement seulement quand il n'y a rien à montrer", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    render(<Probe />);

    expect(screen.getByTestId("a-loading")).toHaveTextContent("true");
  });

  it("relit en tâche de fond sans vider la liste — plus de disparition puis retour", async () => {
    seedCache([account("a"), account("b")], 10 * 60_000);
    let release: (v: unknown) => void = () => {};
    const pending = new Promise((r) => { release = r; });
    vi.stubGlobal("fetch", vi.fn(async () => {
      await pending;
      return okResponse([account("a"), account("b"), account("c")]);
    }));

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    render(<Probe />);

    // Pendant la relecture : les deux comptes restent, `revalidating` le signale.
    await waitFor(() => expect(screen.getByTestId("a-revalidating")).toHaveTextContent("true"));
    expect(screen.getByTestId("a-count")).toHaveTextContent("2");

    await act(async () => { release(null); });
    await waitFor(() => expect(screen.getByTestId("a-count")).toHaveTextContent("3"));
    expect(screen.getByTestId("a-revalidating")).toHaveTextContent("false");
  });

  it("ne rappelle pas la banque quand le cache a moins d'une minute", async () => {
    seedCache([account("a")], 5_000);
    const fetchMock = vi.fn(async () => okResponse([account("a")]));
    vi.stubGlobal("fetch", fetchMock);

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("a-count")).toHaveTextContent("1"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("store partagé", () => {
  it("ne lance qu'une requête pour plusieurs pages montées ensemble", async () => {
    const fetchMock = vi.fn(async () => okResponse([account("a")]));
    vi.stubGlobal("fetch", fetchMock);

    const useBankAccounts = await loadHook();
    const First = probe(useBankAccounts, "a");
    const Second = probe(useBankAccounts, "b");
    render(<><First /><Second /></>);

    await waitFor(() => expect(screen.getByTestId("a-count")).toHaveTextContent("1"));
    // Les deux composants lisent le MÊME store, donc la même unique requête.
    expect(screen.getByTestId("b-count")).toHaveTextContent("1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("garde les comptes en changeant d'écran : le second montage part garni", async () => {
    const fetchMock = vi.fn(async () => okResponse([account("a"), account("b")]));
    vi.stubGlobal("fetch", fetchMock);

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    const first = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("a-count")).toHaveTextContent("2"));
    first.unmount();

    render(<Probe />);
    // Rendu synchrone du nouvel écran : déjà les deux comptes, aucun état vide.
    expect(screen.getByTestId("a-count")).toHaveTextContent("2");
    expect(screen.getByTestId("a-loading")).toHaveTextContent("false");
  });
});

describe("échecs et fin de session", () => {
  it("conserve les comptes affichés quand l'agrégation échoue", async () => {
    seedCache([account("a"), account("b")], 10 * 60_000);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ configured: true, connections: [], accounts: [], error: "Banque muette" }),
    })));

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("a-error")).toHaveTextContent("Banque muette"));
    expect(screen.getByTestId("a-count")).toHaveTextContent("2");
  });

  it("purge le cache quand la session est terminée", async () => {
    seedCache([account("a")], 10 * 60_000);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    })));

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("a-count")).toHaveTextContent("0"));
    // Un 401 n'est pas une erreur à afficher, mais il ne laisse rien derrière lui.
    expect(screen.getByTestId("a-error")).toHaveTextContent("");
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("ne met pas en cache une réponse en erreur", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ configured: true, connections: [], accounts: [], error: "Banque muette" }),
    })));

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("a-error")).toHaveTextContent("Banque muette"));
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("ignore un cache écrit par une version antérieure du format", async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version: 0, accounts: [account("a")], updatedAt: new Date().toISOString() }),
    );
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const useBankAccounts = await loadHook();
    const Probe = probe(useBankAccounts);
    render(<Probe />);

    expect(screen.getByTestId("a-count")).toHaveTextContent("0");
    expect(screen.getByTestId("a-loading")).toHaveTextContent("true");
  });

  it("clearBankAccountsCache vide le disque et l'affichage", async () => {
    seedCache([account("a")], 10 * 60_000);
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    vi.resetModules();
    const mod = await import("@/lib/bank/useBankAccounts");
    const Probe = probe(mod.useBankAccounts);
    render(<Probe />);
    expect(screen.getByTestId("a-count")).toHaveTextContent("1");

    await act(async () => { mod.clearBankAccountsCache(); });

    expect(screen.getByTestId("a-count")).toHaveTextContent("0");
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});
