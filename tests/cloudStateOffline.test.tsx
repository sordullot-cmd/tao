import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";

/* Le comportement hors ligne se joue entre trois pièces : le stockage local, la
   requête qui échoue, et la relecture qui suit. On pilote donc la requête. */
let upsertFails = true;
let cloudValue: unknown = null;
const upsert = vi.fn(async () => (upsertFails ? { error: { message: "Failed to fetch" } } : { error: null }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { value: cloudValue }, error: null }) }),
        }),
      }),
      upsert: (...args: unknown[]) => upsert(...(args as [])),
    }),
  }),
}));
vi.mock("@/lib/auth/supabaseAuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import { useCloudState } from "@/lib/hooks/useCloudState";

const KEY = "test_key";
const PENDING = `${KEY}:pending`;

function Probe() {
  const [v, set] = useCloudState<{ n: number }>(KEY, "cloud_key", { n: 0 });
  return (
    <button type="button" onClick={() => set({ n: v.n + 1 })}>
      n={v.n}
    </button>
  );
}

/** Laisse passer le debounce d'écriture (500 ms) et les promesses en attente. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useCloudState hors ligne", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    upsert.mockClear();
    upsertFails = true;
    cloudValue = null;
  });

  it("retient l'écriture qui n'a pas pu partir", async () => {
    render(<Probe />);
    await act(async () => { screen.getByRole("button").click(); });
    await settle();

    // La valeur vaut localement, et l'écriture attend son tour.
    expect(screen.getByRole("button").textContent).toBe("n=1");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ n: 1 });
    expect(JSON.parse(localStorage.getItem(PENDING)!)).toEqual({ n: 1 });
  });

  it("ne laisse pas la version du serveur écraser un travail en attente", async () => {
    /* Le vrai danger d'avant : l'échec était avalé, le drapeau retombait, et le
       premier refetch au retour du réseau ramenait la version périmée. */
    const view = render(<Probe />);
    await act(async () => { screen.getByRole("button").click(); });
    await settle();

    cloudValue = { n: 0 };
    view.unmount();
    render(<Probe />);
    await settle();

    expect(screen.getByRole("button").textContent).toBe("n=1");
  });

  it("repart tout seul au retour de la connexion", async () => {
    render(<Probe />);
    await act(async () => { screen.getByRole("button").click(); });
    await settle();
    expect(localStorage.getItem(PENDING)).not.toBeNull();

    upsertFails = false;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await settle();

    expect(localStorage.getItem(PENDING)).toBeNull();
    expect(upsert).toHaveBeenCalled();
  });

  it("ne retient rien quand l'écriture passe", async () => {
    upsertFails = false;
    render(<Probe />);
    await act(async () => { screen.getByRole("button").click(); });
    await settle();

    expect(localStorage.getItem(PENDING)).toBeNull();
  });
});
