import { describe, it, expect } from "vitest";
import {
  FALLBACK_DURATION_MIN, clipFromForm, clipLabel, daysBetween, pasteFormInto, shiftDayKey,
} from "@/lib/agendaClipboard";

/* Le formulaire de la page Agenda, réduit à ce que le presse-papiers regarde.
   Tout le reste (lieu, couleur, invités…) doit traverser sans être touché. */
const form = (over: Record<string, unknown> = {}) => ({
  kind: "event", id: "evt_1", calendarId: "primary", htmlLink: "https://…",
  summary: "Cours de maths", allDay: false,
  date: "2026-03-10", endDate: "2026-03-10", startTime: "09:00", endTime: "10:30",
  location: "B204", description: "Chapitre 4", colorId: "5", guests: "a@b.fr",
  transparency: "opaque", visibility: "default", reminders: [10],
  recur: { preset: "weekly" }, masterId: "master_1", masterStart: { dateTime: "…" },
  done: true, hadMeet: true,
  ...over,
});

describe("presse-papiers de l'agenda", () => {
  it("garde le contenu et jette l'identité", () => {
    /* Ce qui désigne l'évènement d'origine ne doit jamais suivre la copie :
       gardé, `id` ferait d'un collage une modification de l'original. */
    const clip = clipFromForm(form())!;
    expect(clip.summary).toBe("Cours de maths");
    expect(clip.form.location).toBe("B204");
    expect(clip.form.colorId).toBe("5");
    expect(clip.form.reminders).toEqual([10]);
    for (const mort of ["id", "calendarId", "htmlLink", "masterId", "masterStart", "recur", "done"]) {
      expect(clip.form).not.toHaveProperty(mort);
    }
    // Un évènement neuf ne peut pas « avoir eu » un Meet : il en demande un ou non.
    expect(clip.form.hadMeet).toBe(false);
  });

  it("retient la durée, pas les bornes", () => {
    expect(clipFromForm(form())!.durationMin).toBe(90);
    expect(clipFromForm(form())!.startMin).toBe(9 * 60);
    // Un formulaire dont les heures ne disent rien de valable : même repli que
    // `payloadFromForm`, pour que les deux tombent sur la même fin.
    expect(clipFromForm(form({ endTime: "08:00" }))!.durationMin).toBe(FALLBACK_DURATION_MIN);
    expect(clipFromForm(form({ startTime: "", endTime: "" }))!.durationMin).toBe(FALLBACK_DURATION_MIN);
  });

  it("refuse ce qui n'est pas un évènement", () => {
    /* Un bloc ancré n'a pas d'heure à soi (elle est recalculée chaque jour), et
       une tâche n'est pas un évènement : un collage qui changerait discrètement
       de nature serait un piège. */
    expect(clipFromForm(form({ anchored: true }))).toBeNull();
    expect(clipFromForm(form({ kind: "task" }))).toBeNull();
    expect(clipFromForm(null)).toBeNull();
  });

  it("colle à l'heure visée, calée sur le quart d'heure", () => {
    const clip = clipFromForm(form())!;
    const pose = pasteFormInto(clip, "2026-03-12", 14 * 60 + 7)!;
    expect(pose.date).toBe("2026-03-12");
    expect(pose.endDate).toBe("2026-03-12");
    expect(pose.startTime).toBe("14:00");
    expect(pose.endTime).toBe("15:30"); // la durée, pas les bornes d'origine
  });

  it("garde l'heure d'origine quand rien ne désigne d'heure", () => {
    // Ctrl+V loin de la grille : aucun point ne dit où poser dans la journée.
    const pose = pasteFormInto(clipFromForm(form())!, "2026-03-12", null)!;
    expect([pose.startTime, pose.endTime]).toEqual(["09:00", "10:30"]);
  });

  it("remonte un bloc qui déborderait de la journée plutôt que de le couper en deux", () => {
    /* Le formulaire de la page n'a qu'une date : un évènement à cheval sur deux
       jours n'y est pas exprimable. Le début reste une heure ronde, et c'est la
       dernière minute qui saute — minuit ne s'écrit pas dans un champ d'heure,
       et `toISO` en ferait une fin AVANT le début. */
    const clip = clipFromForm(form({ startTime: "09:00", endTime: "11:00" }))!;
    const pose = pasteFormInto(clip, "2026-03-12", 23 * 60)!;
    expect([pose.startTime, pose.endTime]).toEqual(["22:00", "23:59"]);
  });

  it("colle une journée entière en gardant son nombre de jours", () => {
    const clip = clipFromForm(form({ allDay: true, date: "2026-03-10", endDate: "2026-03-12" }))!;
    expect(clip.days).toBe(3);
    const pose = pasteFormInto(clip, "2026-04-01")!;
    expect([pose.date, pose.endDate, pose.allDay]).toEqual(["2026-04-01", "2026-04-03", true]);
  });

  it("compte les jours par-dessus un changement de mois", () => {
    expect(shiftDayKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysBetween("2026-02-28", "2026-03-02")).toBe(2);
  });

  it("nomme un évènement sans titre plutôt que de proposer de coller «  »", () => {
    expect(clipLabel(clipFromForm(form({ summary: "   " })))).toBe("Sans titre");
    expect(clipLabel(null)).toBe("Sans titre");
  });
});
