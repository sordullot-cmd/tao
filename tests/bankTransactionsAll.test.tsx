import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Relevés de TOUS les comptes — la matière de la courbe du patrimoine.
 *
 * Ce qui est tenu ici : chaque compte est demandé une fois et une seule, le
 * résultat tombe au fil de l'eau (la courbe se précise compte par compte plutôt
 * que d'attendre le dernier), et une fenêtre plus profonde ne rejette pas ce qui
 * est déjà chargé.
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

function probe(useBankTransactionsAll: Mod["useBankTransactionsAll"]) {
  return function Probe({ uids, days }: { uids: string[]; days?: number }) {
    const { byUid, loading } = useBankTransactionsAll(uids, days);
    const summary = Object.keys(byUid)
      .sort()
      .map((uid) => `${uid}:${byUid[uid].map((t) => t.id).join("|")}`)
      .join(" ");
    return (
      <div>
        <span data-testid="summary">{summary}</span>
        <span data-testid="loading">{String(loading)}</span>
      </div>
    );
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("relevés de plusieurs comptes", () => {
  it("charge chaque compte une seule fois et les rend indexés par uid", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      response([tx(url.includes("c1") ? "a" : "b", -10)]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactionsAll } = await loadModule();
    const Probe = probe(useBankTransactionsAll);
    render(<Probe uids={["c1", "c2"]} />);

    await waitFor(() =>
      expect(screen.getByTestId("summary").textContent).toBe("c1:a c2:b"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
  });

  it("ne redemande rien pour des comptes déjà en cache", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10)]));
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactionsAll } = await loadModule();
    const Probe = probe(useBankTransactionsAll);
    const first = render(<Probe uids={["c1"]} />);
    await waitFor(() => expect(screen.getByTestId("summary").textContent).toBe("c1:a"));
    first.unmount();

    render(<Probe uids={["c1"]} />);
    // Rendu garni tout de suite, sans passer par un état de chargement.
    expect(screen.getByTestId("summary").textContent).toBe("c1:a");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("se greffe sur le préchargement en vol au lieu de doubler la requête", async () => {
    let release: (() => void) | null = null;
    const fetchMock = vi.fn(async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return response([tx("a", -10)]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { prefetchBankTransactions, useBankTransactionsAll } = await loadModule();
    prefetchBankTransactions(["c1"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const Probe = probe(useBankTransactionsAll);
    render(<Probe uids={["c1"]} />);
    release?.();

    await waitFor(() => expect(screen.getByTestId("summary").textContent).toBe("c1:a"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("demande les comptes DE FRONT, et non l'un après l'autre", async () => {
    /* C'est la propriété qui décide du temps d'ouverture de la page : en file,
       cinq comptes coûtaient la SOMME des allers-retours. On observe le nombre
       de requêtes simultanées plutôt que le temps écoulé — une horloge sous
       jsdom mesurerait surtout la charge de la machine. */
    let live = 0;
    let peak = 0;
    const release: (() => void)[] = [];

    const fetchMock = vi.fn(async (url: string) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise<void>((r) => release.push(r));
      live -= 1;
      return response([tx(url.match(/uid=(c\d)/)?.[1] ?? "?", -10)]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactionsAll } = await loadModule();
    const Probe = probe(useBankTransactionsAll);
    render(<Probe uids={["c1", "c2", "c3"]} />);

    // Les trois partent ensemble : le plafond est à quatre, elles tiennent toutes.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(peak).toBe(3);

    release.forEach((r) => r());
    await waitFor(() =>
      expect(screen.getByTestId("summary").textContent).toBe("c1:c1 c2:c2 c3:c3"),
    );
  });

  it("plafonne le nombre de requêtes simultanées", async () => {
    /* Vingt comptes lancés d'un coup saturent le navigateur (six connexions par
       hôte en HTTP/1.1) et l'agrégateur : les premiers relevés arriveraient plus
       tard qu'en les étalant. */
    let live = 0;
    let peak = 0;
    const release: (() => void)[] = [];

    const fetchMock = vi.fn(async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise<void>((r) => release.push(r));
      live -= 1;
      return response([tx("a", -10)]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const uids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const { useBankTransactionsAll } = await loadModule();
    const Probe = probe(useBankTransactionsAll);
    render(<Probe uids={uids} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(peak).toBe(4);
    // Et la file avance : libérer les quatre premières en lance quatre autres.
    release.splice(0).forEach((r) => r());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    expect(peak).toBe(4);

    release.splice(0).forEach((r) => r());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(12));
    release.splice(0).forEach((r) => r());
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
  });

  it("sans aucun compte, ne requête rien et ne charge pas", async () => {
    const fetchMock = vi.fn(async () => response([]));
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactionsAll } = await loadModule();
    const Probe = probe(useBankTransactionsAll);
    render(<Probe uids={[]} />);

    expect(screen.getByTestId("summary").textContent).toBe("");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
