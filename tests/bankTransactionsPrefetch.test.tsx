import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Préchargement des relevés depuis la synthèse du patrimoine.
 *
 * Ce qui est tenu ici : le relevé est déjà là quand la fiche s'ouvre (pas
 * d'écran de chargement), et surtout la banque n'est JAMAIS appelée deux fois
 * pour un même compte — y compris dans le cas fâcheux du clic pendant que le
 * préchargement est encore en vol, où le cache est vide et ne peut rien dire de
 * ce qui arrive déjà.
 */

const tx = (id: string, amount: number) => ({
  id,
  date: "2026-08-13",
  label: `Op ${id}`,
  detail: null,
  amount,
  currency: "EUR",
  kind: "card" as const,
  pending: false,
});

const response = (transactions: ReturnType<typeof tx>[], windowDays = 90) => ({
  ok: true,
  status: 200,
  json: async () => ({ configured: true, windowDays, transactions }),
});

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/bank/useBankTransactions");
}

type Mod = Awaited<ReturnType<typeof loadModule>>;

function probe(useBankTransactions: Mod["useBankTransactions"]) {
  return function Probe({ uid }: { uid: string | null }) {
    const { transactions, loading } = useBankTransactions(uid);
    return (
      <div>
        <span data-testid="labels">{transactions.map((t) => t.id).join(",")}</span>
        <span data-testid="loading">{String(loading)}</span>
      </div>
    );
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("préchargement des relevés", () => {
  it("garnit la fiche d'avance : elle s'ouvre sans chargement ni requête de plus", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10)]));
    vi.stubGlobal("fetch", fetchMock);

    const { prefetchBankTransactions, useBankTransactions } = await loadModule();
    prefetchBankTransactions(["c1"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const Probe = probe(useBankTransactions);
    render(<Probe uid="c1" />);

    // Le relevé est là au PREMIER rendu : pas d'état de chargement traversé.
    expect(screen.getByTestId("labels")).toHaveTextContent("a");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ne redemande pas un compte déjà en cache", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10)]));
    vi.stubGlobal("fetch", fetchMock);

    const { prefetchBankTransactions } = await loadModule();
    prefetchBankTransactions(["c1"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    prefetchBankTransactions(["c1"]);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("n'appelle la banque qu'une fois quand on clique pendant le préchargement", async () => {
    /* La requête ne se résout que sur commande : on ouvre la fiche pendant que
       le préchargement est en vol, cache encore vide. */
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchMock = vi.fn(async () => {
      await gate;
      return response([tx("a", -10)]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { prefetchBankTransactions, useBankTransactions } = await loadModule();
    prefetchBankTransactions(["c1"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const Probe = probe(useBankTransactions);
    render(<Probe uid="c1" />);
    release!();

    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a"));
    // La fiche s'est greffée sur la requête du préchargement.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enchaîne les comptes un par un plutôt que de les lancer tous ensemble", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const fetchMock = vi.fn(async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return response([tx("a", -10)]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { prefetchBankTransactions } = await loadModule();
    prefetchBankTransactions(["c1", "c2", "c3"]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(maxConcurrent).toBe(1);
  });

  it("s'interrompt quand la page est quittée", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10)]));
    vi.stubGlobal("fetch", fetchMock);

    const { prefetchBankTransactions } = await loadModule();
    const cancel = prefetchBankTransactions(["c1", "c2", "c3"]);
    cancel();

    // Le premier compte est déjà parti ; les suivants ne partiront pas.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignore les actifs sans compte bancaire derrière", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10)]));
    vi.stubGlobal("fetch", fetchMock);

    const { prefetchBankTransactions } = await loadModule();
    prefetchBankTransactions([null, undefined, ""]);

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
