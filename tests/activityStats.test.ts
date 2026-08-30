import { PALETTE } from "@/lib/ui/palette";
import { describe, it, expect } from "vitest";

/* Le suivi d'activité mesure des durées : une erreur de découpage ne se voit pas
   à l'écran (le total « a l'air » plausible), elle se voit ici. */

import { classify, classifyDetailed, productivityOf, resolveProductivity, PRODUCTIVITY_COLOR } from "@/lib/activity/categories";
import { DEFAULT_SETTINGS, type DayLog } from "@/lib/activity/engine";
import { dayBlocks, dayStats, fmtDur, unclassified } from "@/lib/activity/stats";

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
    // Les jeux ont rejoint « Divertissement » : on ne les réglait pas
    // différemment, et deux catégories distraction faisaient deux petites parts
    // là où une seule se lit.
    expect(classify("LeagueClientUx", "League of Legends", []).category).toBe("fun");
    expect(classify("RiotClientServices", "Riot Client", []).category).toBe("fun");
    expect(classify("VALORANT-Win64-Shipping", "VALORANT", []).category).toBe("fun");
    expect(classify("steamwebhelper", "Steam", []).category).toBe("fun");
    expect(classify("javaw", "Minecraft 1.20.4", []).label).toBe("Minecraft");
  });

  it("reconnaît tao trade, dont le processus s'appelle « tao »", () => {
    const res = classify("tao", "tao", []);
    expect(res.category).toBe("trading");
    expect(res.label).toBe("tao trade");
  });

  it("lit le domaine posé dans le titre d'un navigateur", () => {
    expect(classify("Google Chrome", "op.gg — stats", []).category).toBe("fun");
    // Les achats sont de la navigation : on traverse une boutique, on n'y produit rien.
    expect(classify("Google Chrome", "Amazon.fr : chaussures", []).category).toBe("browsing");
  });

  it("ne prend pas un nom de site croisé dans une phrase pour ce site", () => {
    // « le monde » traînait dans le titre : la page finissait dans la presse.
    // Elle reste donc de la navigation — inconnue, pas mal rangée.
    expect(classify("Safari", "Un site inconnu de tout le monde", []).category).toBe("browsing");
  });

  it("nomme le mobilier du système sans jamais le proposer au classement", () => {
    /* Un écran de verrouillage au premier plan veut dire qu'on n'est pas là :
       le compter comme du travail gonflerait le temps productif de chaque
       absence. Il reste donc « Non classé » — mais reconnu, nommé, et écarté de
       la file à ranger, où il noyait les vraies applications inconnues. */
    for (const app of ["dwm", "LockApp"]) {
      const res = classifyDetailed(app, "", []);
      expect(res.category).toBe("other");
      expect(res.system).toBe(true);
    }
    expect(classifyDetailed("Finder", "", []).category).toBe("work");
    expect(classifyDetailed("BidulePro", "", []).system).toBe(false);
  });

  it("dit ce qui a décidé du classement", () => {
    expect(classifyDetailed("Google Chrome", "Lofi beats - YouTube", []).via).toBe("title");
    expect(classifyDetailed("Code", "", []).via).toBe("app");
    expect(classifyDetailed("Adobe Photoshop 2024", "affiche.psd", []).via).toBe("word");
    expect(classifyDetailed("Code", "", [{ id: "r", match: "code", category: "fun" }]).via).toBe("user");
  });

  it("devine le nom du site même quand une accroche suit le titre", () => {
    // « … | Anime-Sama - Streaming et catalogage d'animes et scans. » : le dernier
    // morceau est une phrase, pas un nom. Sans remonter d'un cran, la ligne
    // restait sous le nom du navigateur — donc impossible à ranger d'un clic.
    const res = classifyDetailed("Arc", "Hunter x Hunter - Scans | Anime-Sama - Streaming et catalogage d'animes et scans.", []);
    expect(res.label).toBe("Anime-Sama");
    expect(res.category).toBe("fun");
  });

  it("nomme un site inconnu au lieu de le laisser sous le nom du navigateur", () => {
    // C'est ce nom qui rend la file d'attente cliquable : « Marmiton », et non
    // « Google Chrome » répété douze fois.
    expect(classify("Google Chrome", "Recette de crêpes | Marmiton", []).label).toBe("Marmiton");
  });

  it("fait primer une règle de l'utilisateur, la plus récente d'abord", () => {
    const rules = [
      { id: "1", match: "code", category: "trading" },
      { id: "2", match: "code", category: "fun" },
    ];
    expect(classify("Code", "", rules).category).toBe("fun");
  });

  it("suit une règle écrite avec le vocabulaire d'avant", () => {
    /* Une refonte du vocabulaire doit emporter ce qui était écrit dedans :
       sans reprise, une règle « ce site → Design » cesserait de ranger quoi que
       ce soit du jour au lendemain, et sans un mot. */
    expect(classify("Code", "", [{ id: "1", match: "code", category: "design" }]).category).toBe("work");
    expect(classify("Code", "", [{ id: "1", match: "code", category: "games" }]).category).toBe("fun");
    expect(classify("Code", "", [{ id: "1", match: "code", category: "shopping" }]).category).toBe("browsing");
  });

  it("laisse non classé ce qu'aucune règle ne reconnaît", () => {
    expect(classify("BidulePro", "", []).category).toBe("other");
  });

  it("range une page inconnue dans « Navigation », et jamais en productif", () => {
    /* Le plus gros défaut de la mesure : un navigateur qui ne rend qu'un titre
       (Arc, Firefox, un poste sans autorisation d'automatisation) envoyait des
       journées entières dans « Non classé » — une entrée par article lu, aucune
       rangeable. Naviguer n'est pas une anomalie.
       Neutre, et pas productif : le web qu'on n'a pas su nommer ne doit pas
       gonfler le temps de focus. */
    const res = classifyDetailed("Safari", "Un site quelconque", []);
    expect(res.category).toBe("browsing");
    expect(productivityOf("browsing")).toBe("neutral");
    // Une application de bureau inconnue, elle, reste à ranger.
    expect(classify("BidulePro", "", []).category).toBe("other");
  });
});

describe("GitHub et GitHub Desktop, une seule chose", () => {
  it("réunit le site et l'application sous le même nom et la même catégorie", () => {
    /* Deux entrées de catalogue en faisaient deux lignes, deux parts et deux
       totaux à rapprocher à la main — alors qu'on travaille sur le même dépôt. */
    const web = classifyDetailed("Arc", "PR · github.com/tr4de", []);
    const app = classifyDetailed("GitHub Desktop", "", []);
    expect(web.label).toBe("GitHub");
    expect(app.label).toBe("GitHub");
    expect(app.category).toBe(web.category);
  });
});

describe("une chose, une seule catégorie", () => {
  /* Le défaut qui faussait tous les totaux : le classement décide segment par
     segment, et deux segments d'un même site ne décidaient pas toujours pareil
     — l'URL lisible sur l'un, perdue sur l'autre. Le temps s'agrégeait par nom,
     la catégorie par segment, et les trois figures de la page se contredisaient
     sur la même journée. */
  it("range tout le temps d'un nom là où il en a passé le plus", () => {
    /* Deux pages du MÊME site, et le navigateur n'a pas dit la même chose :
       la première porte le domaine dans son titre, la seconde seulement le nom.
       Le nom deviné est identique, la catégorie ne l'était pas. */
    const log = day([
      seg([9, 0], [10, 0], "Chrome", "x", "GitHub", "PR · github.com/tr4de"),
      seg([10, 0], [10, 20], "Chrome", "x", "GitHub", "Issue #12 | GitHub"),
    ]);
    const stats = dayStats(log, DEFAULT_SETTINGS);

    expect(stats.byApp).toHaveLength(1);
    expect(stats.byApp[0].cat).toBe("dev");
    // La ligne et la catégorie disent le MÊME temps : c'est tout l'enjeu.
    expect(stats.byApp[0].ms).toBe(80 * 60_000);
    expect(stats.byCategory.find(b => b.id === "dev")!.ms).toBe(80 * 60_000);
    expect(stats.byCategory.find(b => b.id === "browsing")).toBeUndefined();
  });

  it("ne laisse jamais « Non classé » l'emporter sur une catégorie réelle", () => {
    /* Un seul segment reconnu suffit à ranger tout ce qui porte le même nom :
       « Non classé » est un aveu d'ignorance, pas un jugement — il ne peut pas
       gagner un vote contre quelque chose qu'on a su nommer. */
    const log = day([
      seg([9, 0], [11, 0], "BidulePro", "x", "BidulePro", ""),
      seg([11, 0], [11, 5], "BidulePro", "x", "BidulePro", "chantier"),
    ]);
    // Une règle ne reconnaît QUE la seconde : cinq minutes contre deux heures.
    const stats = dayStats(log, {
      ...DEFAULT_SETTINGS,
      rules: [{ id: "r", match: "chantier", field: "title" as const, category: "dev" }],
    });
    expect(stats.byApp[0].cat).toBe("dev");
    expect(stats.byApp[0].ms).toBe(125 * 60_000);
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

describe("pavés de la journée", () => {
  const M = 60_000;

  it("regroupe une suite de segments de même matière en un seul pavé", () => {
    const blocks = dayBlocks([
      seg([9, 0], [9, 20], "Code", "dev"),
      seg([9, 20], [9, 50], "Cursor", "dev"),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].ms).toBe(50 * M);
    // Le pavé porte le nom de ce qui l'a occupé le plus longtemps.
    expect(blocks[0].label).toBe("Cursor");
    expect(blocks[0].apps.map(a => a.label)).toEqual(["Cursor", "Code"]);
  });

  it("absorbe une miette prise entre deux moments de la même matière", () => {
    // Une minute sur Discord au milieu d'une heure de code ne fait pas trois
    // pavés : sinon la grille horaire est illisible.
    const blocks = dayBlocks([
      seg([9, 0], [9, 30], "Code", "dev"),
      seg([9, 30], [9, 31], "Discord", "comms"),
      seg([9, 31], [10, 0], "Code", "dev"),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].ms).toBe(60 * M);
  });

  it("coupe sur un vrai trou — c'est lui qui dessine la pause", () => {
    const blocks = dayBlocks([
      seg([9, 0], [10, 0], "Code", "dev"),
      seg([11, 0], [11, 30], "Code", "dev"),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].start - blocks[0].end).toBe(60 * M);
  });

  it("donne le créneau à la matière qui l'a le plus occupé", () => {
    // Sur la demi-heure de 9 h 30, vingt minutes de messagerie contre dix de
    // code : c'est la messagerie qui prend le créneau, en entier.
    const blocks = dayBlocks([
      seg([9, 0], [9, 30], "Code", "dev"),
      seg([9, 30], [9, 50], "Discord", "comms"),
      seg([9, 50], [10, 0], "Code", "dev"),
    ]);
    expect(blocks.map(b => b.cat)).toEqual(["dev", "comms"]);
    // Les dix minutes de code perdues par le créneau ne sont pas perdues tout
    // court : elles restent nommées dans le détail du pavé.
    expect(blocks[1].apps.map(a => a.label)).toEqual(["Discord", "Code"]);
  });

  it("ne descend jamais sous la demi-heure, même pour dix minutes mesurées", () => {
    const blocks = dayBlocks([seg([9, 0], [9, 10], "Code", "dev")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].end - blocks[0].start).toBe(30 * M);
    // La mesure, elle, reste la vraie : le pavé occupe une demi-heure et dit
    // dix minutes.
    expect(blocks[0].ms).toBe(10 * M);
  });

  it("cale les pavés sur l'horloge, pas sur la première activité", () => {
    const blocks = dayBlocks([seg([9, 12], [9, 40], "Code", "dev")]);
    expect(blocks).toHaveLength(1);
    expect(new Date(blocks[0].start).getMinutes()).toBe(0);
    expect(new Date(blocks[0].end).getMinutes()).toBe(0);
    expect(blocks[0].end - blocks[0].start).toBe(60 * M);
  });

  it("agrandit le même pavé tant que la matière tient, demi-heure après demi-heure", () => {
    const blocks = dayBlocks([seg([9, 0], [11, 30], "Code", "dev")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].end - blocks[0].start).toBe(150 * M);
  });

  it("laisse le créneau vide quand il n'a presque rien vu", () => {
    // Une minute à 3 h du matin ne réserve pas une demi-heure sur la grille.
    const blocks = dayBlocks([
      seg([3, 0], [3, 1], "Safari", "other"),
      seg([9, 0], [9, 30], "Code", "dev"),
    ]);
    expect(blocks.map(b => b.cat)).toEqual(["dev"]);
  });
});

/* ── Couleurs des natures ─────────────────────────────────────────────────── */

describe("couleurs des natures", () => {
  it("donne une couleur distincte à chacune des trois", () => {
    /* Elles se lisent CÔTE À CÔTE dans le même anneau : deux natures de la même
       teinte y seraient un seul arc. */
    const values = Object.values(PRODUCTIVITY_COLOR);
    expect(new Set(values).size).toBe(3);
  });

  it("garde le productif hors du vert de la marque", () => {
    /* Le vert félicite ; une heure productive est une mesure, pas une
       récompense. Il reste disponible pour ce qu'il désigne ailleurs — un
       objectif atteint, une progression. */
    expect(PRODUCTIVITY_COLOR.productive).not.toBe(PALETTE.green);
  });

  it("laisse le neutre plus clair que les deux autres", () => {
    // Le temps qui ne se juge pas doit reculer, pas peser autant que le reste.
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
    };
    expect(lum(PRODUCTIVITY_COLOR.neutral)).toBeGreaterThan(lum(PRODUCTIVITY_COLOR.productive));
    expect(lum(PRODUCTIVITY_COLOR.neutral)).toBeGreaterThan(lum(PRODUCTIVITY_COLOR.distracting));
  });
});
