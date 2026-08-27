import { describe, it, expect } from "vitest";

/* Le suivi d'activité mesure des durées : une erreur de découpage ne se voit pas
   à l'écran (le total « a l'air » plausible), elle se voit ici. */

import { classify, classifyDetailed, resolveProductivity } from "@/lib/activity/categories";
import { DEFAULT_SETTINGS, type DayLog } from "@/lib/activity/engine";
import { dayStats, fmtDur, unclassified } from "@/lib/activity/stats";

const DATE = "2026-03-02";
/** 2026-03-02 à h heures m minutes, en heure locale. */
const at = (h: number, m = 0) => new Date(2026, 2, 2, h, m, 0, 0).getTime();

const seg = (from: [number, number], to: [number, number], app: string, cat: string, label = app, title = "") => ({
  s: at(...from), e: at(...to), app, label, title, cat,
});

const day = (segments: DayLog["segments"]): DayLog => ({ date: DATE, segments, awayMs: 0, updatedAt: 0 });

describe("classement", () => {
  it("classe une application de bureau connue", () => {
    expect(classify("Code", "engine.ts — tr4de", []).category).toBe("dev");
  });

  it("classe un navigateur par le titre de sa page, pas par son nom", () => {
    const res = classify("Google Chrome", "Lofi beats - YouTube", []);
    expect(res.category).toBe("fun");
    expect(res.label).toBe("YouTube");
  });

  it("reconnaît les jeux, y compris sous leur nom de processus", () => {
    // Le défaut le plus visible de l'ancien classement : tout ceci tombait
    // dans « Non classé », qui finissait première catégorie de la journée.
    expect(classify("LeagueClientUx", "League of Legends", []).category).toBe("games");
    expect(classify("RiotClientServices", "Riot Client", []).category).toBe("games");
    expect(classify("VALORANT-Win64-Shipping", "VALORANT", []).category).toBe("games");
    expect(classify("steamwebhelper", "Steam", []).category).toBe("games");
    expect(classify("javaw", "Minecraft 1.20.4", []).label).toBe("Minecraft");
  });

  it("reconnaît tao trade, dont le processus s'appelle « tao »", () => {
    const res = classify("tao", "tao", []);
    expect(res.category).toBe("trading");
    expect(res.label).toBe("tao trade");
  });

  it("lit le domaine posé dans le titre d'un navigateur", () => {
    expect(classify("Google Chrome", "op.gg — stats", []).category).toBe("games");
    expect(classify("Google Chrome", "Amazon.fr : chaussures", []).category).toBe("shopping");
  });

  it("ne prend pas un nom de site croisé dans une phrase pour ce site", () => {
    // « le monde » traînait dans le titre : la page finissait dans la presse.
    expect(classify("Safari", "Un site inconnu de tout le monde", []).category).toBe("other");
  });

  it("range le bruit du système au lieu de le laisser en « non classé »", () => {
    expect(classify("dwm", "", []).category).toBe("utilities");
    expect(classify("LockApp", "", []).category).toBe("utilities");
  });

  it("dit ce qui a décidé du classement", () => {
    expect(classifyDetailed("Google Chrome", "Lofi beats - YouTube", []).via).toBe("title");
    expect(classifyDetailed("Code", "", []).via).toBe("app");
    expect(classifyDetailed("Adobe Photoshop 2024", "affiche.psd", []).via).toBe("word");
    expect(classifyDetailed("Code", "", [{ id: "r", match: "code", category: "fun" }]).via).toBe("user");
  });

  it("nomme un site inconnu au lieu de le laisser sous le nom du navigateur", () => {
    // C'est ce nom qui rend la file d'attente cliquable : « Marmiton », et non
    // « Google Chrome » répété douze fois.
    expect(classify("Google Chrome", "Recette de crêpes | Marmiton", []).label).toBe("Marmiton");
  });

  it("fait primer une règle de l'utilisateur, la plus récente d'abord", () => {
    const rules = [
      { id: "1", match: "code", category: "writing" },
      { id: "2", match: "code", category: "design" },
    ];
    expect(classify("Code", "", rules).category).toBe("design");
  });

  it("laisse non classé ce qu'aucune règle ne reconnaît", () => {
    expect(classify("BidulePro", "", []).category).toBe("other");
  });

  it("ne range pas une page inconnue dans une catégorie productive", () => {
    // Sinon tout le web non reconnu gonflerait le temps de focus.
    expect(classify("Safari", "Un site quelconque", []).category).toBe("other");
  });
});

describe("nature d'une catégorie", () => {
  it("suit la surcharge de l'utilisateur quand elle existe", () => {
    expect(resolveProductivity("comms", {})).toBe("neutral");
    expect(resolveProductivity("comms", { comms: "distracting" })).toBe("distracting");
  });
});

describe("statistiques d'une journée", () => {
  const log = day([
    seg([9, 0], [10, 30], "Code", "dev"),          // 1 h 30 productif
    seg([10, 30], [10, 40], "Discord", "comms"),   // 10 min neutre (coupe le focus)
    seg([10, 40], [11, 10], "Code", "dev"),        // 30 min productif
    seg([12, 30], [12, 50], "Chrome", "fun", "Youtube", "Lofi beats - YouTube"), // 20 min distraction, après une pause
  ]);
  const stats = dayStats(log, DEFAULT_SETTINGS);

  it("additionne le temps actif sans compter les trous", () => {
    expect(stats.activeMs).toBe((90 + 10 + 30 + 20) * 60_000);
  });

  it("sépare productif, neutre et distraction", () => {
    expect(stats.productiveMs).toBe(120 * 60_000);
    expect(stats.neutralMs).toBe(10 * 60_000);
    expect(stats.distractingMs).toBe(20 * 60_000);
  });

  it("coupe la session de focus sur une interruption plus longue que la tolérance", () => {
    // 10 min de Discord > 2 min tolérées : deux sessions, pas une.
    expect(stats.focusSessions.map(s => s.ms)).toEqual([90 * 60_000, 30 * 60_000]);
    expect(stats.longestFocusMs).toBe(90 * 60_000);
  });

  it("retient la pause d'1 h 20 entre 11 h 10 et 12 h 30", () => {
    expect(stats.breaks).toHaveLength(1);
    expect(stats.breaks[0].ms).toBe(80 * 60_000);
    expect(stats.breakMs).toBe(80 * 60_000);
  });

  it("répartit un segment à cheval sur deux heures au prorata", () => {
    // 9 h → 10 h 30 : une heure pleine à 9 h, une demie à 10 h — plus les
    // 20 min de 10 h 40 à 11 h, soit 50 min sur le créneau de 10 h.
    expect(stats.hourly[9].productiveMs).toBe(60 * 60_000);
    expect(stats.hourly[10].productiveMs).toBe(50 * 60_000);
  });

  it("compte les bascules d'application", () => {
    expect(stats.switches).toBe(3);
  });

  it("donne un score nul à une journée sans mesure", () => {
    expect(dayStats(day([]), DEFAULT_SETTINGS).focusScore).toBe(0);
  });

  it("reclasse l'historique avec les règles courantes", () => {
    const withRule = dayStats(log, { ...DEFAULT_SETTINGS, rules: [{ id: "r", match: "code", category: "fun" }] });
    expect(withRule.distractingMs).toBe((120 + 20) * 60_000);
  });
});

describe("file des applications non classées", () => {
  it("oublie une application que les règles courantes savent classer", () => {
    // L'historique garde « other » ; c'est le classement du jour qui décide.
    const log = day([seg([9, 0], [9, 30], "BidulePro", "other")]);
    const rules = [{ id: "r", match: "bidulepro", category: "dev" }];
    expect(unclassified([log], { ...DEFAULT_SETTINGS, rules })).toHaveLength(0);
  });

  it("remonte les applications inconnues, la plus longue d'abord", () => {
    const log = day([
      seg([9, 0], [9, 30], "BidulePro", "other"),
      seg([9, 30], [10, 30], "MachinApp", "other"),
      seg([10, 30], [11, 0], "Code", "dev"),
    ]);
    expect(unclassified([log], DEFAULT_SETTINGS).map(a => a.label)).toEqual(["MachinApp", "BidulePro"]);
  });
});

describe("format des durées", () => {
  it("écrit des heures et des minutes, jamais des décimales", () => {
    expect(fmtDur(3 * 3600_000 + 24 * 60_000)).toBe("3 h 24");
    expect(fmtDur(24 * 60_000)).toBe("24 min");
    expect(fmtDur(48_000)).toBe("48 s");
  });
});
