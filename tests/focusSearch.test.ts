import { describe, it, expect } from "vitest";
import { fold, highlight, scoreField, searchCatalog } from "@/lib/focus/search";

const names = (q: string, limit?: number) => searchCatalog(q, limit).map(h => h.entry.name);

describe("classement de la recherche du catalogue", () => {
  it("met en tête ce qui commence par ce qui est tapé", () => {
    /* « dis » est dans Discord ET dans Dailymotion ? Non — mais « am » est dans
       Amazon (préfixe) et dans Winamax (milieu) : le préfixe passe devant. */
    const r = names("am");
    expect(r[0]).toBe("Amazon");
    expect(r).toContain("Winamax");
    expect(r.indexOf("Amazon")).toBeLessThan(r.indexOf("Winamax"));
  });

  it("répond au début d'un mot intérieur, pas seulement au premier", () => {
    /* Personne ne tape « X (Twitter) ». On tape « twitter ». */
    expect(names("twitter")[0]).toBe("X (Twitter)");
    expect(names("games")[0]).toBe("Epic Games");
  });

  it("retrouve les lettres dans l'ordre sans qu'elles soient collées", () => {
    expect(names("ytb")).toContain("YouTube");
    expect(names("pkrst")).toContain("PokerStars");
  });

  it("accepte le domaine et le nom d'exécutable, mais après le nom", () => {
    /* « fb.com » n'apparaît nulle part dans « Facebook » : sans les domaines,
       la frappe la plus courte pour Facebook ne donnerait rien. */
    expect(names("fb")[0]).toBe("Facebook");
    expect(names("steamweb")[0]).toBe("Steam");
  });

  it("ignore accents et casse", () => {
    expect(fold("Café")).toBe("cafe");
    expect(names("NETFLIX")[0]).toBe("Netflix");
  });

  it("borne ce qu'elle rend et ne rend rien sur une frappe vide", () => {
    expect(searchCatalog("", 8)).toEqual([]);
    expect(searchCatalog("   ")).toEqual([]);
    expect(searchCatalog("e", 3).length).toBe(3);
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
    const hit = searchCatalog("net")[0];
    expect(hit.entry.name).toBe("Netflix");
    expect(hit.nameRanges).toEqual([[0, 3]]);
    expect(highlight("Netflix", hit.nameRanges)).toEqual([
      { text: "Net", hit: true },
      { text: "flix", hit: false },
    ]);
  });

  it("montre ce qui a répondu quand ce n'est pas le nom", () => {
    const hit = searchCatalog("fb")[0];
    expect(hit.field).toBe("domain");
    expect(hit.sub).toBe("fb.com");
    expect(hit.subRanges).toEqual([[0, 2]]);
  });
});
