import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";

/* Le garde natif ne peut pas être éprouvé pour de vrai : jsdom n'a ni poste ni
   fenêtre à reprendre. Ce qu'on met à l'épreuve ici est la BOUCLE — ce qu'elle
   interroge, quand elle reprend la main, et quand elle note une tentative.
   La couche Tauri elle-même (src-tauri/src/blocker.rs) est hors de portée d'un
   test unitaire, et c'est justement pourquoi la frontière est un module à part. */
const snap = { app: "Discord", title: "général", idleSeconds: 0, ok: true, full: true, platform: "macos" };
const frontSnapshot = vi.fn(async () => snap);
const reclaimFocus = vi.fn(async () => true);
type Tab = { app: string; url: string; ok: boolean; error: string | null };
const frontTab = vi.fn(async (app: string): Promise<Tab> => ({ app, url: "", ok: false, error: "not-scriptable" }));
const redirectTab = vi.fn(async (_app: string, _url?: string) => true);

vi.mock("@/lib/focus/native", () => ({
  nativeAvailable: () => true,
  frontSnapshot: () => frontSnapshot(),
  reclaimFocus: () => reclaimFocus(),
  frontTab: (app: string) => frontTab(app),
  redirectTab: (app: string, url?: string) => redirectTab(app, url),
}));

/** Le poste montre un navigateur, sur l'URL donnée. `null` = URL illisible
 *  (Firefox, Windows, automatisation refusée), ce qui doit faire tomber le
 *  garde sur le titre de la fenêtre. */
function showBrowser(title: string, url: string | null, app = "Google Chrome") {
  frontSnapshot.mockResolvedValue({ ...snap, app, title });
  frontTab.mockResolvedValue(
    url ? { app, url, ok: true, error: null } : { app, url: "", ok: false, error: "automation-denied" }
  );
}

import { useFocusGuard, type GuardHit } from "@/lib/focus/guard";
import { emptyStore, sessionFromPreset } from "@/lib/focus/model";

const store = emptyStore();
const session = sessionFromPreset(
  {
    id: "p", name: "Test", durationMin: 30, blocklistIds: ["bl-msg", "bl-video"],
    mode: "normal", color: "blue", icon: "timer",
  },
  new Date()
);

function Harness({ onHit }: { onHit: (h: GuardHit) => void }) {
  useFocusGuard(session, store, onHit);
  return null;
}

/** Laisse la boucle tourner : l'avance des minuteurs, puis les promesses en
 *  attente (le relevé du poste est asynchrone). */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("garde natif", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frontSnapshot.mockReset();
    frontSnapshot.mockResolvedValue(snap);
    frontTab.mockReset();
    frontTab.mockResolvedValue({ app: "", url: "", ok: false, error: "not-scriptable" });
    reclaimFocus.mockClear();
    redirectTab.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("reprend la main et note la tentative quand une appli coupée passe devant", async () => {
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(reclaimFocus).toHaveBeenCalled();
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("app");
    expect(hits[0].target).toBe("discord");
    expect(hits[0].appName).toBe("Discord");
    expect(hits[0].listName).toBe("Messagerie");
  });

  it("ne note qu'UNE tentative quand on insiste, mais reprend la main plusieurs fois", async () => {
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);
    // Vingt secondes d'insistance : sous le délai du journal, au-dessus de
    // celui de la reprise de main.
    for (let i = 0; i < 10; i++) await advance(2_000);

    expect(hits).toHaveLength(1);
    expect(reclaimFocus.mock.calls.length).toBeGreaterThan(1);
    expect(reclaimFocus.mock.calls.length).toBeLessThan(10);
  });

  it("ne touche à rien quand le poste n'est pas lisible", async () => {
    frontSnapshot.mockResolvedValueOnce({ ...snap, ok: false });
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(reclaimFocus).not.toHaveBeenCalled();
    expect(hits).toHaveLength(0);
  });

  it("arrête d'interroger le poste quand la session s'arrête", async () => {
    const { unmount } = render(<Harness onHit={() => {}} />);
    await advance(0);
    const seen = frontSnapshot.mock.calls.length;
    unmount();
    await advance(10_000);
    expect(frontSnapshot.mock.calls.length).toBe(seen);
  });

  it("juge un onglet sur son URL et le renvoie vers une page vide", async () => {
    showBrowser("Mix — YouTube", "https://m.youtube.com/watch?v=x");
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("site");
    expect(hits[0].target).toBe("youtube");
    expect(hits[0].url).toBe("https://m.youtube.com/watch?v=x");
    expect(reclaimFocus).toHaveBeenCalled();

    // L'onglet part sur la page de blocage de l'app, qui porte tout ce qu'elle
    // affiche : le site coupé, la liste, la session, le rang de la tentative.
    const [app, url] = redirectTab.mock.calls[0];
    expect(app).toBe("Google Chrome");
    const dest = new URL(url!);
    expect(dest.origin).toBe(window.location.origin);
    expect(dest.pathname).toBe("/blocked");
    expect(dest.searchParams.get("t")).toBe("YouTube");
    expect(dest.searchParams.get("l")).toBe("Vidéo & streaming");
    expect(dest.searchParams.get("n")).toBe("1");
  });

  it("ne touche pas à un onglet que rien ne retient, même sur un titre trompeur", async () => {
    // Le titre contient « YouTube », l'URL non : c'est l'URL qui tranche.
    showBrowser("Comment YouTube gagne de l'argent — Le Monde", "https://arxiv.org/abs/1");
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(hits).toHaveLength(0);
    expect(redirectTab).not.toHaveBeenCalled();
  });

  it("retombe sur le titre quand l'URL n'est pas lisible, sans renvoyer l'onglet", async () => {
    showBrowser("Mix — YouTube", null, "Firefox");
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("window");
    expect(hits[0].target).toBe("youtube");
    // Rien à renvoyer : on n'a pas su lire l'onglet, on ne prétend pas l'écrire.
    expect(redirectTab).not.toHaveBeenCalled();
  });

  it("ne demande pas d'URL à une appli qui n'est pas un navigateur", async () => {
    render(<Harness onHit={() => {}} />);
    await advance(0);
    expect(frontTab).not.toHaveBeenCalled();
  });
});
