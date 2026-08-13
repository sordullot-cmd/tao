import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

/**
 * Le relevé d'un compte suit le même parti que ses soldes : ce qu'on a déjà lu
 * s'affiche tout de suite, la relecture passe par-dessus. Deux pièges se cachent
 * là, et c'est ce que ces tests tiennent : ne pas relancer la requête en
 * revenant sur une fiche, et ne JAMAIS montrer le relevé d'un compte sur la
 * fiche d'un autre quand on passe de l'un à l'autre.
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

async function loadHook() {
  vi.resetModules();
  return await import("@/lib/bank/useBankTransactions");
}

type Hook = Awaited<ReturnType<typeof loadHook>>["useBankTransactions"];

function probe(useBankTransactions: Hook) {
  return function Probe({ uid, days }: { uid: string | null; days?: number }) {
    const { transactions, loading, revalidating } = useBankTransactions(uid, days);
    return (
      <div>
        <span data-testid="labels">{transactions.map((t) => t.id).join(",")}</span>
        <span data-testid="loading">{String(loading)}</span>
        <span data-testid="revalidating">{String(revalidating)}</span>
      </div>
    );
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("relevé mis en cache", () => {
  it("ne rappelle pas la banque en revenant sur une fiche déjà consultée", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10)]));
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactions } = await loadHook();
    const Probe = probe(useBankTransactions);

    const first = render(<Probe uid="c1" />);
    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a"));
    first.unmount();

    render(<Probe uid="c1" />);
    // Rendu synchrone : le relevé est déjà là, aucun état de chargement.
    expect(screen.getByTestId("labels")).toHaveTextContent("a");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("n'affiche jamais le relevé du compte précédent en changeant de compte", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      response(url.includes("c1") ? [tx("a", -10)] : [tx("b", -20)]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactions } = await loadHook();
    const Probe = probe(useBankTransactions);

    const view = render(<Probe uid="c1" />);
    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a"));

    // Même composant, autre compte : le relevé du premier ne doit pas subsister,
    // même le temps d'un rendu.
    view.rerender(<Probe uid="c2" />);
    expect(screen.getByTestId("labels")).toHaveTextContent("");
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("b"));
  });

  it("garde le relevé affiché quand la relecture échoue", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) return response([tx("a", -10)]);
      return {
        ok: false,
        status: 502,
        json: async () => ({ transactions: [], windowDays: 90, error: "Banque muette" }),
      };
    }));

    const { useBankTransactions } = await loadHook();
    const Probe = probe(useBankTransactions);

    const view = render(<Probe uid="c1" />);
    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a"));

    // `rerender` avec le même uid ne relance rien (cache frais) : on force.
    view.unmount();
    const Forced = function Forced() {
      const { transactions, reload } = useBankTransactions("c1");
      return (
        <div>
          <span data-testid="labels">{transactions.map((t) => t.id).join(",")}</span>
          <button type="button" onClick={reload}>relire</button>
        </div>
      );
    };
    render(<Forced />);
    await act(async () => { screen.getByText("relire").click(); });

    expect(screen.getByTestId("labels")).toHaveTextContent("a");
  });

  it("ne requête rien pour un actif saisi à la main", async () => {
    const fetchMock = vi.fn(async () => response([]));
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactions } = await loadHook();
    const Probe = probe(useBankTransactions);
    render(<Probe uid={null} />);

    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("va chercher plus loin quand on demande une fenêtre plus profonde", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const days = Number(new URL(url, "http://x").searchParams.get("days"));
      return days === 365
        ? response([tx("a", -10), tx("vieux", -30)], 365)
        : response([tx("a", -10)], 90);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactions } = await loadHook();
    const Probe = probe(useBankTransactions);

    const view = render(<Probe uid="c1" days={90} />);
    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a"));

    // Passage à un an : ce qui est déjà là RESTE affiché pendant le chargement.
    view.rerender(<Probe uid="c1" days={365} />);
    expect(screen.getByTestId("labels")).toHaveTextContent("a");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");

    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a,vieux"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ne redemande rien en redescendant sur une fenêtre plus courte", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10), tx("vieux", -30)], 365));
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactions } = await loadHook();
    const Probe = probe(useBankTransactions);

    const view = render(<Probe uid="c1" days={365} />);
    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a,vieux"));

    view.rerender(<Probe uid="c1" days={90} />);
    // L'année couvre les trois mois : le filtrage se fait chez l'appelant, sans
    // aller-retour — et sans jamais rétrécir ce que le cache contient.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("labels")).toHaveTextContent("a,vieux");
  });

  it("« tout » couvre n'importe quelle fenêtre datée", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10), tx("ancien", -5)], 0));
    vi.stubGlobal("fetch", fetchMock);

    const { useBankTransactions } = await loadHook();
    const Probe = probe(useBankTransactions);

    const view = render(<Probe uid="c1" days={0} />);
    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a,ancien"));

    view.rerender(<Probe uid="c1" days={365} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("clearBankTransactionsCache oblige la fiche à relire", async () => {
    const fetchMock = vi.fn(async () => response([tx("a", -10)]));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadHook();
    const Probe = probe(mod.useBankTransactions);

    const first = render(<Probe uid="c1" />);
    await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("a"));
    first.unmount();

    mod.clearBankTransactionsCache();

    render(<Probe uid="c1" />);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
