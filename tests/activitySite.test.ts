import { describe, it, expect } from "vitest";
import { classify, classifyDetailed, hostOf, rootDomain } from "@/lib/activity/categories";

/* Le lecteur web de Spotify n'écrit pas son nom dans le titre : il y met le
   morceau en cours. Sans l'hôte de l'onglet, chaque chanson devenait un site. */
const PLAYING = "ELEVEN OCEANS • Moji x Sboy";
const NEXT = "Autre morceau • Autre artiste";

describe("l'hôte de l'onglet nomme le site", () => {
  it("éclate en autant de sites que de morceaux sans lui", () => {
    expect(classify("Arc", PLAYING, []).label).not.toBe(classify("Arc", NEXT, []).label);
  });

  it("regroupe tous les morceaux sous Spotify avec lui", () => {
    for (const title of [PLAYING, NEXT]) {
      const c = classify("Arc", title, [], "https://open.spotify.com/playlist/13Syf0");
      expect(c.label).toBe("Spotify");
      expect(c.category).toBe("music");
    }
  });

  it("nomme un site inconnu par son domaine, donc de façon stable", () => {
    const a = classify("Arc", "Page A", [], "https://www.exemple-inconnu.fr/a");
    const b = classify("Arc", "Page B", [], "https://exemple-inconnu.fr/b");
    expect(a.label).toBe("Exemple-inconnu");
    expect(b.label).toBe(a.label);
  });

  it("laisse le titre décider quand aucune URL n'est lisible", () => {
    expect(classifyDetailed("Arc", "Sujet — Anime-Sama", []).label).toBe("Anime-Sama");
  });

  it("ignore une URL qui n'en est pas une", () => {
    expect(hostOf("pas une url")).toBe("");
    expect(hostOf("")).toBe("");
    expect(hostOf("open.spotify.com")).toBe("open.spotify.com");
  });
});

describe("une règle de domaine range le site entier", () => {
  const rule = [{ id: "u-1", match: "spotify.com", field: "site" as const, category: "dev" }];

  it("vaut pour les sous-domaines", () => {
    expect(classify("Arc", "Un morceau", rule, "https://open.spotify.com/x").category).toBe("dev");
    expect(classify("Arc", "Connexion", rule, "https://accounts.spotify.com/login").category).toBe("dev");
  });

  it("n'attrape pas un domaine qui se termine pareil par hasard", () => {
    expect(classify("Arc", "Page", rule, "https://notspotify.com/x").category).not.toBe("dev");
  });

  it("ne fait rien sans hôte lisible", () => {
    expect(classify("Arc", "spotify.com dans le titre", rule).category).not.toBe("dev");
  });

  it("réduit l'hôte au domaine qui porte la règle", () => {
    expect(rootDomain("open.spotify.com")).toBe("spotify.com");
    expect(rootDomain("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(rootDomain("exemple.fr")).toBe("exemple.fr");
  });
});
