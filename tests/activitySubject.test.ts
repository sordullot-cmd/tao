/**
 * Le SUJET d'une vidéo, quand le site ne dit que là où l'on est.
 *
 * YouTube reste rangé dans « Réseaux sociaux » — c'est bien ce qu'on y fait la
 * plupart du temps. Ce qui est sous test, ce sont les exceptions : une vidéo de
 * trading et une vidéo de cours comptent toutes deux dans « Apprentissage »
 * (on y apprend, on n'y trade pas), un clip compte dans « Musique », chacune
 * sous un nom à elle — et le reste de YouTube n'a pas bougé d'un pouce.
 */

import { describe, it, expect } from "vitest";
import { classify, classifyDetailed, productivityOf } from "@/lib/activity/categories";
import { DEFAULT_SETTINGS, type DayLog } from "@/lib/activity/engine";
import { dayStats } from "@/lib/activity/stats";

const YT = "https://www.youtube.com/watch?v=xxxx";

describe("une vidéo de trading compte comme un apprentissage, pas comme un fil", () => {
  it("range dans « apprentissage » ce que le titre annonce comme du trading", () => {
    const c = classify("Google Chrome", "Scalping du NASDAQ en direct - YouTube", [], YT);
    expect(c.category).toBe("learning");
  });

  it("ne la compte PAS comme du temps passé sur les marchés", () => {
    /* « Combien de temps ai-je passé sur les marchés ? » ne doit pas répondre
       « en regardant des vidéos » : le visionnage gonflait un chiffre qui ne
       parle que des plateformes, des graphiques et du journal de trades. */
    expect(classify("Google Chrome", "Scalping du NASDAQ en direct - YouTube", [], YT).category)
      .not.toBe("trading");
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
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("learning");
    }
  });

  it("vaut aussi pour un direct Twitch, même vocabulaire, même raison", () => {
    expect(classify("Google Chrome", "Session forex du matin", [], "https://www.twitch.tv/qqn").category)
      .toBe("learning");
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

  it("reconnaît un morceau à sa FORME, quand le titre n'en dit pas plus", () => {
    /* « Artiste - Titre » sans mention de clip ni de paroles : c'est la moitié
       de ce qu'on écoute, et ça tombait entièrement dans le fil. */
    for (const titre of [
      "Ninho - Lettre à une femme",
      "SDM — Bolide allemand",
      "Gazo - Mode Akimbo",
      "Chopin - Etude Op. 10 No. 4",
      "Daft Punk - Something About Us",
    ]) {
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("music");
    }
  });

  it("lit le crédit du producteur, où qu'il soit posé", () => {
    // « (prod. X) », « prod by X » : la signature d'un titre de rap.
    for (const titre of [
      "Titre du morceau (prod. Keyzo)",
      "Freestyle #4 prod by Diese",
    ]) {
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("music");
    }
  });

  it("ne prend pas pour un morceau tout ce qui porte un tiret", () => {
    /* Le tiret est une ponctuation avant d'être une convention : sans ces
       garde-fous, la forme emporterait la moitié du fil avec elle. */
    for (const titre of [
      "Compilation de chats",                       // pas de tiret du tout
      "GTA 6 - Trailer 2",                          // un format, pas un artiste
      "Elden Ring - gameplay de la nuit",
      "Je teste la street food coréenne - vlog",
      "Pourquoi les chats ronronnent - la réponse",
      "Les 10 astuces pour mieux dormir - la science le dit", // une phrase, pas un nom
    ]) {
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("social");
    }
  });

  it("ne vaut que là où cette forme désigne un morceau, pas sur un direct", () => {
    /* Sur Twitch, « Pseudo - ce qu'il fait ce soir » est un titre de direct :
       la même forme y rangerait chaque stream dans la musique. */
    expect(classify("Google Chrome", "Kameto - on repart en ranked", [], "https://www.twitch.tv/kamet0").category)
      .toBe("fun");
  });

  it("cède au trading quand le titre parle des deux", () => {
    // « Lofi pour trader » : le vocabulaire de métier est le plus spécialisé des
    // deux, c'est lui qui dit à quoi l'heure a servi.
    const c = classify("Google Chrome", "Lofi mix pour scalper le nasdaq - YouTube", [], YT);
    expect(c.label).toBe("YouTube · Trading");
    expect(c.category).toBe("learning");
  });
});

describe("une vidéo d'apprentissage n'est pas un fil qui passe", () => {
  it("range dans « apprentissage » ce que le titre annonce comme tel", () => {
    for (const titre of [
      // Les sujets que l'utilisateur suit…
      "Comment améliorer sa communication au quotidien",
      "Les 5 biais cognitifs qui décident pour toi",
      "Psychologie de l'attachement expliquée",
      "Le stoïcisme pour les nuls",
      "Nietzsche en 10 minutes",
      "Comment flirter sans être lourd",
      "L'art de la séduction, ce que personne ne dit",
      "Méthode de travail : mes révisions en 3 semaines",
      // …et les formats qui n'existent que pour enseigner.
      "Cours de guitare pour débutant",
      "Tutoriel Excel : les tableaux croisés",
      "Conférence sur les neurosciences de la mémoire",
      "Masterclass : la prise de parole en public",
    ]) {
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("learning");
    }
  });

  it("lui donne son nom à elle, pour qu'elle tienne sa propre ligne", () => {
    expect(classify("Google Chrome", "Psychologie de la confiance en soi - YouTube", [], YT).label)
      .toBe("YouTube · Learning");
  });

  it("compte cette heure au CRÉDIT de la journée, là où le fil la débitait", () => {
    // C'est tout l'objet de la séparation : les deux tombaient au même endroit.
    expect(productivityOf(classify("Google Chrome", "Cours de philosophie - YouTube", [], YT).category))
      .toBe("productive");
    expect(productivityOf(classify("Google Chrome", "Compilation de chats - YouTube", [], YT).category))
      .toBe("distracting");
  });

  it("dit que c'est le TITRE qui a décidé, et lequel de ses mots", () => {
    const d = classifyDetailed("Google Chrome", "Psychologie du narcissisme - YouTube", [], YT);
    expect(d.via).toBe("title");
    expect(d.matched).toBe("psychologie");
  });

  it("vaut sur les autres plateformes qui hébergent, pas seulement YouTube", () => {
    expect(classify("Google Chrome", "Conférence : philosophie et IA", [], "https://vimeo.com/1").category)
      .toBe("learning");
  });

  it("cède à la musique, et laisse au trading le soin de se nommer", () => {
    /* « Lofi beats to study to » est de la musique qu'on laisse tourner PENDANT
       le travail : la compter comme une étude gonflerait le temps d'apprentissage
       de tout ce qu'on a mis en fond. */
    expect(classify("Google Chrome", "Lofi beats to study to - YouTube", [], YT).category).toBe("music");
    /* « Psychologie du trading » parle de marchés, quoi qu'annonce son premier
       mot : même catégorie que le reste de l'apprentissage, mais sous le nom du
       trading — sans quoi on ne saurait plus ce qu'on a appris. */
    const c = classify("Google Chrome", "La psychologie du trading expliquée - YouTube", [], YT);
    expect(c.category).toBe("learning");
    expect(c.label).toBe("YouTube · Trading");
  });

  it("épargne les mots qu'une vidéo quelconque peut porter", () => {
    for (const titre of [
      /* Volontairement écartés du vocabulaire : ils rangeraient en apprentissage
         la moitié d'un fil. */
      /* Une explication qui ne dit pas de quoi elle parle n'est pas un cours :
         ces cinq-là ramenaient du YouTube ordinaire dans l'apprentissage. */
      "La fin de Breaking Bad expliquée",
      "Documentaire : les requins blancs",
      "Comment faire un tiramisu",
      "Cette manipulation de photo est incroyable",
      "Conférence de presse du PSG",
      "Motivation gym : 10 minutes pour y aller",
      "La discipline d'un champion",
      "Mes habits d'hiver",
      // « ted » nu manque au vocabulaire pour cette raison exacte.
      "Ted Lasso saison 3 : mon avis",
      // Un parcours, un discours : « cours » n'y est pas un mot.
      "Mon parcours en 2026",
    ]) {
      expect(classify("Google Chrome", `${titre} - YouTube`, [], YT).category).toBe("social");
    }
  });

  it("laisse une étude de Chopin à la musique classique, pas aux révisions", () => {
    /* Le seul mot du lot qui appartienne aussi à un autre monde : une « étude »
       est une forme musicale. Le titre l'annonce toujours de la même façon. */
    expect(classify("Google Chrome", "Chopin - Etude Op. 10 No. 4 - YouTube", [], YT).category)
      .not.toBe("learning");
  });
});

describe("une conversation d'IA se range sur ce dont elle parle", () => {
  const GEM = "https://gemini.google.com/app/abcdef";

  it("compte les marchés comme un apprentissage, sous leur nom", () => {
    /* On ne trade pas en discutant avec un modèle : on se fait expliquer. */
    const c = classify("Google Chrome", "Comprendre le price action sur le Nasdaq", [], GEM);
    expect(c.category).toBe("learning");
    expect(c.label).toBe("Gemini · Trading");
  });

  it("compte les cours comme un apprentissage, matières comprises", () => {
    for (const titre of [
      "Théorie des coûts en éco-gestion",
      "Exercice de comptabilité analytique",
      "Fiche de révision sur le droit du travail",
      "Plan de dissertation sur la philosophie du langage",
      "Aide pour mes maths de licence 2",
    ]) {
      expect(classify("Google Chrome", titre, [], GEM).category).toBe("learning");
    }
    expect(classify("Google Chrome", "Exercice de comptabilité analytique", [], GEM).label)
      .toBe("Gemini · Learning");
  });

  it("laisse tout le reste au TRAVAIL, qui est ce qu'on y fait", () => {
    for (const titre of [
      "Corrige ce script Python",
      "Rédige un mail de relance",
      "Idées de cadeaux d'anniversaire",
    ]) {
      const c = classify("Google Chrome", titre, [], GEM);
      expect(c.category).toBe("work");
      expect(c.label).toBe("Gemini");
    }
  });

  it("n'y lit QUE les deux sujets qui précisent le travail", () => {
    /* Demander les paroles d'une chanson n'est pas en écouter : sans ce filtre,
       le fil de discussion serait compté comme une bande-son. */
    expect(classify("Google Chrome", "Paroles de la chanson et sa signification", [], GEM).category)
      .toBe("work");
  });

  it("ne vaut que pour Gemini, dont le titre d'onglet porte celui du fil", () => {
    expect(classify("Google Chrome", "Comprendre le price action sur le Nasdaq", [], "https://chatgpt.com/c/1").category)
      .toBe("work");
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
     n'admet qu'une catégorie par nom et le fil aurait tout emporté. Les vingt
     minutes comptent en apprentissage — c'est une vidéo, pas une séance de
     marché. */
  const day: DayLog = {
    date: "2026-09-02",
    segments: [seg(9, 20, "Backtest de ma stratégie - YouTube"), seg(14, 120, "Compilation de chats - YouTube")],
    awayMs: 0,
    updatedAt: 0,
  };

  it("compte l'apprentissage d'un côté et le fil de l'autre", () => {
    const stats = dayStats(day, DEFAULT_SETTINGS);
    const ms = new Map(stats.byCategory.map(c => [c.id, c.ms]));
    expect(ms.get("learning")).toBe(20 * 60_000);
    expect(ms.get("social")).toBe(120 * 60_000);
    // Et rien du tout du côté des marchés : on n'y a pas mis les pieds.
    expect(ms.get("trading")).toBeUndefined();
  });

  it("montre les deux usages de YouTube sur deux lignes", () => {
    const noms = dayStats(day, DEFAULT_SETTINGS).byApp.map(a => a.label);
    expect(noms).toContain("YouTube · Trading");
    expect(noms).toContain("YouTube");
  });
});
