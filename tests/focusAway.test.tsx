import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";

/* Une page web ne voit pas le poste : ces cas-là valent pour le navigateur ET
   pour l'app installée depuis le web, qui est la même page dans un autre cadre. */
vi.mock("@/lib/focus/native", () => ({
  nativeAvailable: () => false,
  webAppInstalled: () => false,
  frontSnapshot: async () => null,
  frontTab: async () => null,
  reclaimFocus: async () => false,
  redirectTab: async () => false,
}));

import { useFocusGuard, type GuardHit } from "@/lib/focus/guard";
import { emptyStore, sessionFromPreset } from "@/lib/focus/model";

const store = {
  ...emptyStore(),
  settings: { ...emptyStore().settings, awayGraceSec: 10 },
};
const session = sessionFromPreset(
  { id: "p", name: "Test", durationMin: 30, blocklistIds: ["bl-msg"], mode: "normal", color: "blue", icon: "timer" },
  new Date()
);

function Harness({ onHit }: { onHit: (h: GuardHit) => void }) {
  useFocusGuard(session, store, onHit);
  return null;
}

/** Le focus de la fenêtre, tel que le voit `document.hasFocus()`. */
function setFocused(on: boolean) {
  vi.spyOn(document, "hasFocus").mockReturnValue(on);
}

/** Visibilité de la page, telle que la voit `document.hidden`. */
function setHidden(on: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => on });
}

async function fire(target: Window | Document, type: string) {
  await act(async () => {
    target.dispatchEvent(new Event(type));
    // Le `blur` est tranché au tour suivant : un focus qui part dans une iframe
    // ne doit pas compter comme une sortie.
    vi.advanceTimersByTime(1);
  });
}

describe("écarts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setFocused(true);
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("compte une sortie quand la FENÊTRE perd le focus, même restée visible", async () => {
    /* C'est tout le cas de l'app installée depuis le web : sa fenêtre reste à
       l'écran à côté de celle où l'on est parti, donc `visibilitychange` ne dit
       jamais rien. Avant, l'écart n'était pas compté du tout. */
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);

    setFocused(false);
    await fire(window, "blur");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    setFocused(true);
    await fire(window, "focus");

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("away");
    expect(hits[0].awayMs).toBeGreaterThanOrEqual(30_000);
  });

  it("compte encore une sortie quand la page est masquée", async () => {
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);

    setHidden(true);
    await fire(document, "visibilitychange");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    setHidden(false);
    await fire(document, "visibilitychange");

    expect(hits).toHaveLength(1);
  });

  it("ne compte rien sous le délai de grâce", async () => {
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);

    setFocused(false);
    await fire(window, "blur");
    await act(async () => { vi.advanceTimersByTime(3_000); });
    setFocused(true);
    await fire(window, "focus");

    expect(hits).toHaveLength(0);
  });

  it("ne compte pas un focus qui se déplace DANS la page", async () => {
    // `blur` de la fenêtre, mais le document garde le focus : iframe, console.
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);

    await fire(window, "blur");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    await fire(window, "focus");

    expect(hits).toHaveLength(0);
  });

  it("ne compte qu'une sortie quand les deux signaux tombent ensemble", async () => {
    /* Une fenêtre réduite perd le focus ET la visibilité. Deux écouteurs qui
       décideraient chacun de leur côté compteraient deux départs, ou en
       oublieraient un au retour. */
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);

    setFocused(false);
    setHidden(true);
    await fire(window, "blur");
    await fire(document, "visibilitychange");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    setFocused(true);
    setHidden(false);
    await fire(document, "visibilitychange");
    await fire(window, "focus");

    expect(hits).toHaveLength(1);
  });
});
