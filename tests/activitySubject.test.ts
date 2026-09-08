/**
 * Le SUJET d'une vidéo, quand le site ne dit que là où l'on est.
 *
 * YouTube reste rangé dans « Réseaux sociaux » — c'est bien ce qu'on y fait la
 * plupart du temps. Ce qui est sous test, ce sont les deux exceptions : une
 * vidéo dont le titre annonce du trading compte dans « Trading & marchés », un
 * clip compte dans « Musique », chacune sous un nom à elle, et le reste de
 * YouTube n'a pas bougé d'un pouce.
 */

import { describe, it, expect } from "vitest";
import { classify, classifyDetailed, productivityOf } from "@/lib/activity/categories";
import { DEFAULT_SETTINGS, type DayLog } from "@/lib/activity/engine";
import { dayStats } from "@/lib/activity/stats";

const YT = "https://www.youtube.com/watch?v=xxxx";

describe("une vidéo de trading ne compte plus dans les réseaux sociaux", () => {
  it("range dans « trading » ce que le titre annonce comme tel", () => {
    const c = classify("Google Chrome", "Scalping du NASDAQ en direct - YouTube", [], YT);
    expect(c.category).toBe("trading");
  });

  it("lui donne un nom à elle, pour qu'elle ne se confonde pas avec le reste du site", () => {
    expect(classify("Google Chrome", "Ma stratégie de trading - YouTube", [], YT).label)
      .toBe("YouTube · Trading");
    expect(classify("Google Chrome", "Vlog de vacances - YouTube", [], YT).label)
      .toBe("YouTube");
  });

  it("laisse le reste de YouTube dans les réseaux sociaux", () => {
    expect(classify("Google Chrome", "Compilation de chats - YouTube", [], YT).category)
      .toBe("social");
  });

  it("dit que c'est le TITRE qui a décidé, et lequel de ses mots", () => {
    const d = classifyDetailed("Google Chrome", "Analyse technique du CAC 40 - YouTube", [], YT);
    expect(d.via).toBe("title");
    expect(d.matched).toBe("analyse technique");
  });

  it("reconnaît le vocabulaire courant d'une chaîne de trading", () => {
    for (const titre of [
      "Trade recap de la semaine",
      "Mon backtesting sur 200 trades",
      "Winrate de 68% : ma strategy expliquée",
      "Ma stratégie du lundi matin",
      "Le trade parfait n'existe pas",
    ]) {
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("trading");
    }
  });

  it("vaut aussi pour un direct Twitch, même vocabulaire, même raison", () => {
    expect(classify("Google Chrome", "Session forex du matin", [], "https://www.twitch.tv/qqn").category)
      .toBe("trading");
  });
});

describe("un clip musical compte comme de la musique, pas comme un fil", () => {
  it("range dans « musique » ce que la mise en forme du titre annonce comme un morceau", () => {
    for (const titre of [
      "Artiste - Nom du morceau (Clip officiel)",
      "SOME BAND - Song Name (Official Music Video)",
      "Chanteuse ft. Rappeur - Titre (Lyrics)",
      "Best of 2026 · DJ Set live",
      "Miles Davis - Kind of Blue (Full Album)",
    ]) {
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("music");
    }
  });

  it("lui donne son nom à elle, pour qu'elle tienne sa propre ligne", () => {
    expect(classify("Google Chrome", "Artiste - Titre (Official Video) - YouTube", [], YT).label)
      .toBe("YouTube · Music");
  });

  it("laisse la musique NEUTRE : elle accompagne le travail, elle ne le remplace pas", () => {
    // Le fil, lui, reste une distraction — c'est toute la raison de les séparer.
    expect(productivityOf(classify("Google Chrome", "Titre (Clip officiel) - YouTube", [], YT).category))
      .toBe("neutral");
    expect(productivityOf(classify("Google Chrome", "Compilation de chats - YouTube", [], YT).category))
      .toBe("distracting");
  });

  it("cède au trading quand le titre parle des deux", () => {
    // « Lofi pour trader » : le vocabulaire de métier est le plus spécialisé des
    // deux, c'est lui qui dit à quoi l'heure a servi.
    expect(classify("Google Chrome", "Lofi mix pour scalper le nasdaq - YouTube", [], YT).category)
      .toBe("trading");
  });
});

describe("le sujet ne déborde pas de son bord", () => {
  it("ne s'applique qu'aux plateformes qui hébergent, pas à un site qui sait ce qu'il est", () => {
    // Un article de presse sur la bourse reste de la presse : Le Monde n'est pas
    // une plateforme d'hébergement, sa catégorie ne dépend pas de sa une.
    const c = classify("Google Chrome", "La bourse de Paris recule", [], "https://www.lemonde.fr/a");
    expect(c.category).not.toBe("trading");
  });

  it("épargne les mots que n'importe quelle vidéo peut porter", () => {
    for (const titre of [
      "Installer pip sous Windows", "Message broker avec Kafka", "Le levier hydraulique",
      // Côté musique : un extrait de jeu est un « clip », un direct n'est pas un
      // concert, et un documentaire sur le rap n'est pas un morceau.
      "Mon meilleur clip sur Valorant", "En live avec vous ce soir", "Histoire du rap français",
    ]) {
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("social");
    }
  });

  it("cède devant une règle de l'utilisateur, comme tout le reste du classement", () => {
    const rules = [{ id: "r1", match: "youtube.com", field: "site" as const, category: "fun" }];
    expect(classify("Google Chrome", "Scalping du NASDAQ - YouTube", rules, YT).category).toBe("fun");
  });
});

describe("la journée mesurée s'en trouve coupée en deux", () => {
  /** Un segment de `min` minutes, à partir de `at` heures. */
  const seg = (at: number, min: number, title: string) => ({
    s: new Date(2026, 8, 2, at, 0).getTime(),
    e: new Date(2026, 8, 2, at, min).getTime(),
    app: "Google Chrome",
    label: "Google Chrome",
    title,
    cat: "other",
    site: YT,
  });

  /* Deux heures de fil et vingt minutes de trading : sans nom distinct, la page
     n'admet qu'une catégorie par nom et le fil aurait tout emporté. */
  const day: DayLog = {
    date: "2026-09-02",
    segments: [seg(9, 20, "Backtest de ma stratégie - YouTube"), seg(14, 120, "Compilation de chats - YouTube")],
    awayMs: 0,
    updatedAt: 0,
  };

  it("compte le trading d'un côté et le fil de l'autre", () => {
    const stats = dayStats(day, DEFAULT_SETTINGS);
    const ms = new Map(stats.byCategory.map(c => [c.id, c.ms]));
    expect(ms.get("trading")).toBe(20 * 60_000);
    expect(ms.get("social")).toBe(120 * 60_000);
  });

  it("montre les deux usages de YouTube sur deux lignes", () => {
    const noms = dayStats(day, DEFAULT_SETTINGS).byApp.map(a => a.label);
    expect(noms).toContain("YouTube · Trading");
    expect(noms).toContain("YouTube");
  });
});
