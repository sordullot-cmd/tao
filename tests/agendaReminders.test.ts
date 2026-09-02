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
  normalizeDefaultReminders,
  effectiveReminderMinutes,
  FACTORY_DEFAULT_REMINDERS,
  dueReminders,
  reminderWhen,
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

  it("rabat un évènement sans rappel sur le réglage, sinon les cours ne notifient jamais", () => {
    // Ce que Google renvoie sur un agenda en lecture seule…
    expect(effectiveReminderMinutes({ useDefault: false }, [15])).toEqual([15]);
    // …et ce que porte un cours lu dans un flux iCal.
    expect(effectiveReminderMinutes(null, [15])).toEqual([15]);
  });

  it("laisse le rappel propre de l'évènement l'emporter sur le réglage", () => {
    expect(effectiveReminderMinutes([60], [15])).toEqual([60]);
    expect(effectiveReminderMinutes(remindersFromEvent({
      reminders: { useDefault: false, overrides: [{ minutes: 30 }] },
    }), [15])).toEqual([30]);
  });

  it("fait de « rappels par défaut » le réglage de l'utilisateur, pas une constante", () => {
    expect(effectiveReminderMinutes(["default"], [45, 5])).toEqual([45, 5]);
  });

  it("se tait quand le réglage est vide, sans museler les rappels posés à la main", () => {
    expect(effectiveReminderMinutes(null, [])).toEqual([]);
    expect(effectiveReminderMinutes([10], [])).toEqual([10]);
  });

  it("refuse « default » DANS le réglage — il s'y désignerait lui-même", () => {
    expect(normalizeDefaultReminders(["default"])).toEqual(FACTORY_DEFAULT_REMINDERS);
    expect(normalizeDefaultReminders(null)).toEqual([]);
    expect(normalizeDefaultReminders([30, 5])).toEqual([30, 5]);
  });
});

describe("échéance d'un rappel", () => {
  const T10H = new Date(2026, 8, 3, 10, 0, 0).getTime(); // cours à 10 h, heure locale
  const item = (reminders: unknown = null) => ({
    source: "gcal:events",
    id: "ev1",
    startKey: "2026-09-03T10:00:00+02:00",
    startMs: T10H,
    title: "📅 Algèbre",
    reminders,
  });
  const never = () => false;
  const at = (h: number, m: number) => new Date(2026, 8, 3, h, m, 0).getTime();

  it("se tait tant que l'heure du rappel n'est pas passée", () => {
    expect(dueReminders(item(), at(9, 49), [10], never)).toBeNull();
  });

  it("sonne à l'heure du rappel", () => {
    const due = dueReminders(item(), at(9, 50), [10], never);
    expect(due?.announce).toBe(true);
    expect(due?.keys).toEqual(["ev1|2026-09-03T10:00:00+02:00|10"]);
  });

  it("rattrape un rappel manqué — c'est tout l'objet du correctif", () => {
    // App lancée à 9 h 55 : le rappel de 9 h 50 était purement abandonné avant.
    expect(dueReminders(item(), at(9, 55), [10], never)?.announce).toBe(true);
  });

  it("consomme sans rien dire un rappel trop vieux pour être encore utile", () => {
    // Poste réveillé à 11 h : le cours de 10 h est passé, se taire est la
    // réponse — mais la clé doit être marquée, sinon elle repasserait au tour
    // suivant.
    const due = dueReminders(item(), at(11, 0), [10], never);
    expect(due?.announce).toBe(false);
    expect(due?.keys).toHaveLength(1);
  });

  it("n'annonce qu'une fois quand plusieurs rappels sont échus ensemble", () => {
    const due = dueReminders(item([1440, 10]), at(9, 55), [], never);
    expect(due?.keys).toHaveLength(2); // les deux sont consommés
    expect(due?.announce).toBe(true); // une seule notification
  });

  it("ne resonne pas un rappel déjà consommé", () => {
    const fired = new Set(["ev1|2026-09-03T10:00:00+02:00|10"]);
    expect(dueReminders(item(), at(9, 55), [10], (k) => fired.has(k))).toBeNull();
  });

  it("retombe sur le réglage par défaut pour un cours en lecture seule", () => {
    // Un agenda abonné ne porte aucun `overrides` : sans repli, rien ne sonne.
    expect(dueReminders(item(null), at(9, 30), [30], never)?.announce).toBe(true);
    expect(dueReminders(item(null), at(9, 30), [], never)).toBeNull();
  });

  it("annonce le temps qui RESTE, pas le délai réglé", () => {
    expect(reminderWhen(T10H, at(9, 55))).toBe("Commence à 10:00 (dans 5 min)");
    expect(reminderWhen(T10H, at(10, 0))).toBe("C'est maintenant (10:00)");
    expect(reminderWhen(T10H, at(8, 0))).toBe("Commence à 10:00 (dans 2 h)");
  });
});
