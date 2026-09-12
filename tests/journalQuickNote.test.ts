import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La note rapide du journal (`lib/journal/quickNote.ts`).
 *
 * Ce qui est en jeu tient en un mot : AJOUTER. Le popover écrit dans la même
 * entrée que la page Journal — une par date —, et la remplacer effacerait ce
 * que la séance du matin y avait mis. C'est le genre de perte qu'on ne
 * remarque que le lendemain, quand la note qu'on cherchait n'est plus là.
 */

vi.mock("@/lib/supabase/client", () => ({
  // La remontée n'est pas l'objet de ce test : elle est tentée sans être
  // attendue, et son échec ne doit pas faire échouer l'écriture locale.
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { appendDailyNote, mergeNote } from "@/lib/journal/quickNote";

const KEY = "tr4de_daily_notes";
const DAY = "2026-03-12";
const at = new Date("2026-03-12T14:32:00");

function stored(): Record<string, string> {
  return JSON.parse(localStorage.getItem(KEY) || "{}");
}

describe("note rapide du journal", () => {
  beforeEach(() => { localStorage.clear(); });

  it("horodate la ligne, parce qu'une séance se relit dans l'ordre", () => {
    expect(mergeNote("", "sorti trop tôt", at)).toBe("14:32 — sorti trop tôt");
  });

  it("colle la nouvelle ligne sous ce qui était déjà écrit", () => {
    const before = "09:05 — plan : range NY";
    expect(mergeNote(before, "je revenge-trade", at))
      .toBe("09:05 — plan : range NY\n14:32 — je revenge-trade");
  });

  it("n'écrase pas la note du jour — c'est toute la question", async () => {
    localStorage.setItem(KEY, JSON.stringify({ [DAY]: "09:05 — plan : range NY" }));
    await appendDailyNote("deuxième idée", DAY, at);
    expect(stored()[DAY]).toContain("plan : range NY");
    expect(stored()[DAY]).toContain("deuxième idée");
  });

  it("laisse intactes les autres journées", async () => {
    localStorage.setItem(KEY, JSON.stringify({ "2026-03-11": "la veille" }));
    await appendDailyNote("aujourd'hui", DAY, at);
    expect(stored()["2026-03-11"]).toBe("la veille");
  });

  it("refuse une note vide plutôt que d'écrire une ligne d'horloge seule", async () => {
    const res = await appendDailyNote("   ", DAY, at);
    expect(res.ok).toBe(false);
    expect(stored()[DAY]).toBeUndefined();
  });

  it("écrit même sans réseau : le magasin local fait foi", async () => {
    const res = await appendDailyNote("hors ligne", DAY, at);
    expect(res.ok).toBe(true);
    expect(stored()[DAY]).toBe("14:32 — hors ligne");
  });
});
