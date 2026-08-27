import { describe, it, expect, vi, beforeEach } from "vitest";

/* Le pont Android passe par `invoke`. On le simule pour vérifier ce que le
   front FAIT des événements du système — pas Tauri lui-même. */
const invoke = vi.fn();
vi.mock("@/lib/notify", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { phoneDay, usageAccess } from "@/lib/activity/phone";

const at = (h: number, m = 0) => {
  const d = new Date(2026, 7, 27, h, m, 0, 0);
  return d.getTime();
};

describe("journée reconstruite depuis Android", () => {
  beforeEach(() => invoke.mockReset());

  it("dit « non pris en charge » hors Android", async () => {
    invoke.mockResolvedValue({ granted: false, supported: false });
    expect(await usageAccess()).toEqual({ granted: false, supported: false });
  });

  it("ne touche à rien quand l'autorisation manque", async () => {
    invoke.mockResolvedValue({ segments: [], granted: false, supported: true });
    expect(await phoneDay("2026-08-27")).toBeNull();
  });

  it("traduit les passages au premier plan en segments classés", async () => {
    invoke.mockResolvedValue({
      supported: true, granted: true,
      segments: [
        { packageName: "com.google.android.youtube", app: "YouTube", s: at(9), e: at(9, 30) },
        { packageName: "com.spotify.music", app: "Spotify", s: at(10), e: at(10, 20) },
      ],
    });
    const segs = await phoneDay("2026-08-27");
    expect(segs).not.toBeNull();
    expect(segs!.map(s => s.label)).toEqual(["YouTube", "Spotify"]);
    // Le nom BRUT est le paquet — c'est lui qu'une règle « application » vise.
    expect(segs![0].app).toBe("com.google.android.youtube");
    // Et le catalogue reconnaît les deux, sans titre de fenêtre.
    expect(segs![0].cat).toBe("fun");
    expect(segs![1].cat).toBe("music");
    // Android ne donne aucun titre : on n'en invente pas.
    expect(segs!.every(s => s.title === "")).toBe(true);
  });

  it("respecte une règle de l'utilisateur posée sur le paquet", async () => {
    invoke.mockResolvedValue({
      supported: true, granted: true,
      segments: [{ packageName: "com.android.chrome", app: "Chrome", s: at(14), e: at(14, 40) }],
    });
    const segs = await phoneDay("2026-08-27", [
      { id: "u-1", match: "chrome", field: "app", category: "research" },
    ]);
    expect(segs![0].cat).toBe("research");
  });
});
