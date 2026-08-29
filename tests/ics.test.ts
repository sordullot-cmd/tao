import { describe, it, expect } from "vitest";
import {
  parseIcs,
  prettifyIcsEvent,
  parseIcsDate,
  parseDuration,
  unfoldLines,
  splitLine,
  unescapeText,
  filterByRange,
} from "@/lib/ics";
import { checkFeedUrl, normalizeFeedUrl } from "@/lib/icsFetch";

/* Extrait d'un export ADE tel qu'un ENT le sert : lignes pliées, TZID,
   description échappée, VALARM imbriqué. */
const ADE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//ADE/version 6.0//FR",
  "BEGIN:VEVENT",
  "UID:ADE60-1",
  "DTSTART;TZID=Europe/Paris:20260907T080000",
  "DTEND;TZID=Europe/Paris:20260907T100000",
  "SUMMARY:TD Algorithmique et structures de don",
  " nées",
  "LOCATION:Amphi B",
  "DESCRIPTION:L3 Informatique\\nGroupe 2\\, salle modifiée",
  "BEGIN:VALARM",
  "TRIGGER:-PT15M",
  "END:VALARM",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("lecture d'un flux iCal", () => {
  it("recolle une ligne pliée au lieu de tronquer l'intitulé du cours", () => {
    expect(unfoldLines("SUMMARY:TD Algo\r\n rithmique")).toEqual(["SUMMARY:TD Algorithmique"]);
    // La tabulation est un pliage valide au même titre que l'espace.
    expect(unfoldLines("A:1\n\tsuite")).toEqual(["A:1suite"]);
  });

  it("coupe au deux-points de séparation, pas à celui d'un paramètre entre guillemets", () => {
    const l = splitLine('DTSTART;TZID="Europe/Paris":20260907T080000');
    expect(l?.name).toBe("DTSTART");
    expect(l?.params.TZID).toBe("Europe/Paris");
    expect(l?.value).toBe("20260907T080000");
  });

  it("déséchappe le texte : une virgule échappée n'est pas un séparateur", () => {
    expect(unescapeText("Groupe 2\\, salle B\\nSuite")).toBe("Groupe 2, salle B\nSuite");
  });

  it("résout un TZID en instant absolu, heure d'été comprise", () => {
    // 7 septembre : Paris est à UTC+2, donc 08:00 locales = 06:00 UTC.
    expect(parseIcsDate("20260907T080000", "Europe/Paris")?.iso).toBe("2026-09-07T06:00:00.000Z");
    // 7 décembre : UTC+1, la même heure murale tombe une heure plus tôt en UTC.
    expect(parseIcsDate("20261207T080000", "Europe/Paris")?.iso).toBe("2026-12-07T07:00:00.000Z");
  });

  it("laisse une heure sans fuseau « flottante », pour que le client l'interprète chez lui", () => {
    const d = parseIcsDate("20260907T080000");
    expect(d?.iso).toBe("2026-09-07T08:00:00");
    expect(d?.iso.endsWith("Z")).toBe(false);
  });

  it("reconnaît une date seule comme journée entière", () => {
    expect(parseIcsDate("20260901")).toEqual({ iso: "2026-09-01", allDay: true });
  });

  it("retombe sur l'heure flottante quand le TZID est inconnu de la plateforme", () => {
    expect(parseIcsDate("20260907T080000", "Mars/Olympus")?.iso).toBe("2026-09-07T08:00:00");
  });

  it("lit les durées ISO 8601 utilisées à la place d'un DTEND", () => {
    expect(parseDuration("PT1H30M")).toBe(5400000);
    expect(parseDuration("P1D")).toBe(86400000);
    expect(parseDuration("n'importe quoi")).toBe(0);
  });

  it("extrait une séance complète d'un export ADE", () => {
    const [ev] = parseIcs(ADE);
    expect(ev.summary).toBe("TD Algorithmique et structures de données");
    expect(ev.location).toBe("Amphi B");
    expect(ev.description).toBe("L3 Informatique\nGroupe 2, salle modifiée");
    expect(ev.start).toBe("2026-09-07T06:00:00.000Z");
    expect(ev.end).toBe("2026-09-07T08:00:00.000Z");
    expect(ev.allDay).toBe(false);
  });

  it("ignore le DTSTART d'un VALARM : c'est le rappel, pas le cours", () => {
    const withAlarmDate = ADE.replace("TRIGGER:-PT15M", "DTSTART:20990101T000000Z");
    const [ev] = parseIcs(withAlarmDate);
    expect(ev.start).toBe("2026-09-07T06:00:00.000Z");
  });

  it("complète un DTEND manquant par la DURATION plutôt que d'aplatir la séance", () => {
    const src = ADE.replace("DTEND;TZID=Europe/Paris:20260907T100000", "DURATION:PT1H30M");
    const [ev] = parseIcs(src);
    expect(ev.end).toBe("2026-09-07T07:30:00.000Z");
  });

  it("écarte un VEVENT sans début : il n'a nulle part où se poser dans la grille", () => {
    const src = ADE.replace("DTSTART;TZID=Europe/Paris:20260907T080000", "X-IGNORE:1");
    expect(parseIcs(src)).toHaveLength(0);
  });

  it("ne garde que ce qui recoupe la semaine affichée", () => {
    const events = parseIcs(ADE);
    expect(filterByRange(events, "2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z")).toHaveLength(1);
    expect(filterByRange(events, "2026-10-01T00:00:00Z", "2026-10-08T00:00:00Z")).toHaveLength(0);
    // Une séance à cheval sur le bord de la fenêtre reste visible.
    expect(filterByRange(events, "2026-09-07T07:00:00Z", "2026-09-14T00:00:00Z")).toHaveLength(1);
  });
});

describe("garde-fous d'une URL de flux", () => {
  it("traduit webcal:// en https:// — les ENT n'exposent souvent que celui-là", () => {
    expect(normalizeFeedUrl("webcal://edt.exemple.fr/ics?id=X")).toBe("https://edt.exemple.fr/ics?id=X");
    expect(normalizeFeedUrl("  https://edt.exemple.fr/a.ics  ")).toBe("https://edt.exemple.fr/a.ics");
  });

  it("accepte une adresse publique", () => {
    expect(checkFeedUrl("https://edt.univ-exemple.fr/edt/ics?id=X").ok).toBe(true);
  });

  it("refuse le réseau interne : l'URL vient de l'utilisateur, la requête part du serveur", () => {
    // Sans ce filtre, n'importe quel compte ferait sonder l'infrastructure de
    // l'hébergeur depuis l'intérieur.
    for (const bad of [
      "http://localhost:3000/api/secret",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.9/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://base-interne.internal/",
    ]) {
      expect(checkFeedUrl(bad), bad).toEqual({ ok: false, error: "blocked_host" });
    }
  });

  it("refuse les schémas hors http(s), file:// en tête", () => {
    expect(checkFeedUrl("file:///etc/passwd")).toEqual({ ok: false, error: "bad_protocol" });
    expect(checkFeedUrl("pas une url")).toEqual({ ok: false, error: "invalid_url" });
  });
});

describe("lisibilité des exports ADE", () => {
  const seance = {
    uid: "u1",
    summary: "TD - DEG - Salle 07 (36) - Laboratoire Langues - UE 17A : Anglais - EG1G04A",
    description: "Catégorie : TD\nSalle : DEG - Salle 07 (36)\nMatière : UE 17A : Anglais\nGroupe : EG1G04A\nPersonnel : LECAUDEY Lynda\nRemarques : ",
    location: "DEG - Salle 07 (36)",
    allDay: false,
    start: "2026-09-07T06:00:00.000Z",
    end: "2026-09-07T07:00:00.000Z",
    status: "confirmed",
  };

  it("remonte la matière en tête : dans une case de grille, c'est la seule chose qu'on lit", () => {
    // L'intitulé brut commence par le type et la salle ; la matière, tout au
    // bout, est le premier mot coupé par l'ellipse.
    expect(prettifyIcsEvent(seance).summary).toBe("Anglais · TD");
  });

  it("récupère la salle depuis la description quand LOCATION est vide", () => {
    const distanciel = { ...seance, location: "", description: seance.description.replace("Salle : DEG - Salle 07 (36)", "Salle : Amphi C") };
    expect(prettifyIcsEvent(distanciel).location).toBe("Amphi C");
  });

  it("laisse la salle vide quand le champ l'est, au lieu de happer la ligne suivante", () => {
    // Un cours à distance a « Salle : » sans valeur ; une expression trop
    // permissive y lisait la ligne d'après et affichait la matière en salle.
    const distanciel = { ...seance, location: "", description: "Catégorie : TD à distance\nSalle : \nMatière : UE 17A : Anglais\nGroupe : EG1G04A" };
    const out = prettifyIcsEvent(distanciel);
    expect(out.location).toBe("");
    expect(out.summary).toBe("Anglais · TD à distance");
  });

  it("laisse intact un évènement qui n'a pas la structure ADE", () => {
    const perso = { ...seance, summary: "Dentiste", description: "penser à la carte vitale", location: "" };
    expect(prettifyIcsEvent(perso)).toEqual(perso);
  });
});
