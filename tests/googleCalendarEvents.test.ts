import { describe, it, expect } from "vitest";
import {
  flattenEvent,
  mergeCalendarEvents,
  resolveCalendarIds,
} from "@/lib/google/calendarEvents";

const cours = {
  id: "c1",
  summary: "TD Algorithmique",
  location: "Amphi B",
  start: { dateTime: "2026-09-07T08:00:00+02:00" },
  end: { dateTime: "2026-09-07T10:00:00+02:00" },
};

describe("agendas multiples", () => {
  it("s'en tient à l'agenda principal quand rien n'est sélectionné", () => {
    expect(resolveCalendarIds(undefined)).toEqual(["primary"]);
    expect(resolveCalendarIds([])).toEqual(["primary"]);
    // Une liste qui ne contient que du vide vaudrait sinon « aucun agenda » :
    // la grille se viderait au lieu de retomber sur le comportement d'origine.
    expect(resolveCalendarIds([null, "", undefined])).toEqual(["primary"]);
  });

  it("dédoublonne les ids reçus pour ne pas interroger deux fois le même agenda", () => {
    expect(resolveCalendarIds(["primary", "edt@import", "primary"]))
      .toEqual(["primary", "edt@import"]);
  });

  it("rattache chaque évènement à son agenda, sans quoi il serait modifié dans le mauvais", () => {
    const ev = flattenEvent(cours, "edt@import");
    expect(ev.calendarId).toBe("edt@import");
    expect(ev.summary).toBe("TD Algorithmique");
    expect(ev.location).toBe("Amphi B");
    expect(ev.allDay).toBe(false);
    expect(ev.start).toBe("2026-09-07T08:00:00+02:00");
  });

  it("garde le doublon de l'agenda le plus prioritaire, pas la dernière copie vue", () => {
    const merged = mergeCalendarEvents([
      { calendarId: "primary", items: [cours] },
      { calendarId: "partage@groupe", items: [cours] },
    ]);
    expect(merged).toHaveLength(1);
    // L'agenda principal est en tête de la sélection : c'est là que
    // l'utilisateur peut réellement écrire.
    expect(merged[0].calendarId).toBe("primary");
  });

  it("trie l'ensemble par date, les agendas arrivant chacun trié de son côté", () => {
    const merged = mergeCalendarEvents([
      { calendarId: "primary", items: [{ id: "b", start: { dateTime: "2026-09-07T14:00:00Z" } }] },
      { calendarId: "edt", items: [{ id: "a", start: { dateTime: "2026-09-07T08:00:00Z" } }] },
    ]);
    expect(merged.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("ignore un évènement sans id plutôt que de fabriquer une clé bancale", () => {
    const merged = mergeCalendarEvents([
      { calendarId: "edt", items: [{ summary: "sans id" }, cours] },
    ]);
    expect(merged.map((e) => e.id)).toEqual(["c1"]);
  });

  it("relit un cours « journée entière » du flux universitaire au bon format", () => {
    const ev = flattenEvent(
      { id: "j1", summary: "Rentrée", start: { date: "2026-09-01" }, end: { date: "2026-09-02" } },
      "edt@import",
    );
    expect(ev.allDay).toBe(true);
    expect(ev.start).toBe("2026-09-01");
  });
});
