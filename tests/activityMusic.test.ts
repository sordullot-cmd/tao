import { describe, it, expect } from "vitest";
import { classify } from "@/lib/activity/categories";

describe("Spotify → Musique", () => {
  const cases: [string, string, string][] = [
    ["Spotify", "Musique", "app de bureau"],
    ["Arc", "Spotify — Daft Punk", "onglet vu par son titre"],
    ["Google Chrome", "open.spotify.com/playlist/37i9", "lecteur web par l'URL"],
    ["Arc", "Discover Weekly - playlist by Spotify", "playlist"],
  ];
  for (const [app, title, what] of cases) {
    it(`classe ${what}`, () => {
      expect(classify(app, title, []).category).toBe("music");
    });
  }
  it("laisse les films dans le divertissement", () => {
    expect(classify("Arc", "Netflix - Regarder des séries", []).category).toBe("fun");
  });
});
