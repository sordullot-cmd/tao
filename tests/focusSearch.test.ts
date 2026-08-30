import { describe, it, expect } from "vitest";
import { fold, highlight, rankBy, scoreField } from "@/lib/focus/search";

/** Un poste imaginaire, mais pas au hasard : les cas qui départagent mal. */
const APPS = [
  { name: "Discord", system: false },
  { name: "Disk Copy", system: true },
  { name: "Steam", system: false },
  { name: "Musique", system: true },
  { name: "Epic Games Launcher", system: false },
  { name: "Café", system: false },
];

const names = (q: string, limit?: number) =>
  rankBy(APPS, q, a => a.name, limit, a => a.system).map(h => h.item.name);

describe("classement d'une frappe contre des noms", () => {
  it("met en tête ce qui commence par ce qui est tapé", () => {
    /* « Disk Copy » porte bien d-i-s…c, mais en lettres dispersées : un préfixe
       ne se laisse pas dépasser par un ramassage. */
    expect(names("disc")).toEqual(["Discord", "Disk Copy"]);
  });

  it("répond au début d'un mot intérieur, pas seulement au premier", () => {
    // Personne ne tape « Epic Games Launcher » en entier.
    expect(names("games")[0]).toBe("Epic Games Launcher");
  });

  it("retrouve les lettres dans l'ordre sans qu'elles soient collées", () => {
    expect(names("egl")).toContain("Epic Games Launcher");
  });

  it("abaisse les applications du système sans les écarter", () => {
    /* « Musique » et « Disk Copy » sont livrées avec l'OS : proposées, mais
       jamais devant ce qu'on a installé soi-même. */
    const r = names("s");
    expect(r[0]).toBe("Steam");
    expect(r).toContain("Musique");
    expect(r.indexOf("Steam")).toBeLessThan(r.indexOf("Musique"));
  });

  it("ignore accents et casse", () => {
    expect(fold("Café")).toBe("cafe");
    expect(names("cafe")[0]).toBe("Café");
    expect(names("STEAM")[0]).toBe("Steam");
  });

  it("borne ce qu'elle rend et ne rend rien sur une frappe vide", () => {
    expect(rankBy(APPS, "", a => a.name)).toEqual([]);
    expect(rankBy(APPS, "   ", a => a.name)).toEqual([]);
    expect(names("e", 2).length).toBe(2);
  });

  it("classe par paliers : aucune sous-chaîne ne dépasse un préfixe", () => {
    const prefix = scoreField("Discord", "dis")!;
    const inside = scoreField("Dailymotion", "ail")!;
    const fuzzy = scoreField("Dailymotion", "dlm")!;
    expect(prefix.score).toBeGreaterThan(inside.score);
    expect(inside.score).toBeGreaterThan(fuzzy.score);
    expect(scoreField("Steam", "steam")!.score).toBeGreaterThan(prefix.score);
    expect(scoreField("Steam", "zzz")).toBeNull();
  });

  it("désigne les portions à surligner, regroupées", () => {
    const hit = rankBy(APPS, "dis", a => a.name)[0];
    expect(hit.item.name).toBe("Discord");
    expect(hit.ranges).toEqual([[0, 3]]);
    expect(highlight("Discord", hit.ranges)).toEqual([
      { text: "Dis", hit: true },
      { text: "cord", hit: false },
    ]);
  });
});
