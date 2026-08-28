import { describe, it, expect } from "vitest";
import {
  MAX_REMINDERS,
  normalizeReminders,
  remindersFromEvent,
  remindersToGoogle,
  reminderMinutesList,
  reminderLabel,
  addReminder,
  removeReminder,
} from "@/lib/agendaReminders";

describe("rappels d'agenda", () => {
  it("accepte plusieurs délais sur le même item, du plus lointain au plus proche", () => {
    expect(normalizeReminders([10, 1440, 0])).toEqual([1440, 10, 0]);
  });

  it("dédoublonne au lieu de programmer deux fois la même notification", () => {
    expect(normalizeReminders([10, 10, "10"])).toEqual([10]);
  });

  it("coupe ce que Google refuse au-delà de cinq rappels", () => {
    const list = normalizeReminders([1, 2, 3, 4, 5, 6, 7]);
    expect(list).toHaveLength(MAX_REMINDERS);
    expect(list).toEqual([7, 6, 5, 4, 3]); // les plus anticipés d'abord
  });

  it("rend « par défaut » exclusif : le mélanger fausserait le total côté Google", () => {
    expect(normalizeReminders(["default", 10])).toEqual(["default"]);
    expect(addReminder([10, 60], "default")).toEqual(["default"]);
    expect(addReminder(["default"], 30)).toEqual([30]);
  });

  it("relit l'ancien format scalaire des items enregistrés avant le multiple", () => {
    expect(normalizeReminders(10)).toEqual([10]);
    expect(normalizeReminders("default")).toEqual(["default"]);
    expect(normalizeReminders("none")).toEqual([]);
    expect(normalizeReminders(null)).toEqual([]);
  });

  it("refuse un ajout de plus quand la limite est atteinte, sans perdre la liste", () => {
    const full = [1440, 60, 30, 10, 5];
    expect(addReminder(full, 2)).toEqual(full);
    expect(addReminder(full, 60)).toEqual(full); // déjà présent : pas un ajout
  });

  it("retire un seul délai et laisse les autres", () => {
    expect(removeReminder([1440, 60, 10], 60)).toEqual([1440, 10]);
  });

  it("traduit la liste en overrides Google, un par délai", () => {
    expect(remindersToGoogle([60, 10])).toEqual({
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },
        { method: "popup", minutes: 10 },
      ],
    });
    expect(remindersToGoogle(["default"])).toEqual({ useDefault: true });
    // Liste vide = « aucune notification », pas « rappels du calendrier ».
    expect(remindersToGoogle([])).toEqual({ useDefault: false, overrides: [] });
  });

  it("relit tous les overrides d'un évènement, pas seulement le premier", () => {
    const ev = { reminders: { useDefault: false, overrides: [{ minutes: 10 }, { minutes: 1440 }] } };
    expect(remindersFromEvent(ev)).toEqual([1440, 10]);
    expect(remindersFromEvent({ reminders: { useDefault: true } })).toEqual(["default"]);
    expect(remindersFromEvent({ reminders: null })).toEqual([]);
  });

  it("programme un timer par délai, « par défaut » valant dix minutes", () => {
    expect(reminderMinutesList([60, 10])).toEqual([60, 10]);
    expect(reminderMinutesList(["default"])).toEqual([10]);
    expect(reminderMinutesList([])).toEqual([]);
  });

  it("nomme les délais dans l'unité qui se lit", () => {
    expect(reminderLabel(0)).toBe("À l'heure de l'évènement");
    expect(reminderLabel(5)).toBe("5 minutes avant");
    expect(reminderLabel(60)).toBe("1 heure avant");
    expect(reminderLabel(120)).toBe("2 heures avant");
    expect(reminderLabel(1440)).toBe("1 jour avant");
    expect(reminderLabel(90)).toBe("90 minutes avant");
  });
});
