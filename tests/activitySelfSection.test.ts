/**
 * La PARTIE de tao trade où l'on se trouve, vue par le suivi d'activité.
 *
 * Ce qui est sous test n'est pas « l'app est reconnue » (elle l'était déjà),
 * c'est qu'une heure passée dedans ne soit plus une heure indistincte : le
 * trading rejoint les marchés, la vie perso rejoint le travail, la finance
 * rejoint les marchés elle aussi, et chacune porte un nom à elle — sans quoi la
 * page les agrégerait sous « tao trade » et une seule catégorie survivrait
 * (cf. `oneCategoryPerLabel`).
 *
 * Le titre est le seul canal, et c'est le point délicat : la relecture reclasse
 * chaque segment depuis (app, titre, hôte) seuls. Un test le vérifie
 * explicitement, parce qu'une correction posée au moment de la mesure aurait
 * l'air de marcher jusqu'au premier affichage.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { setLang } from "@/lib/i18n";
import { classify, classifyDetailed, selfTitle, type ClassifyRule } from "@/lib/activity/categories";
import { DEFAULT_SETTINGS, type DayLog } from "@/lib/activity/engine";
import { SECTION_OF_PAGE, sectionOfPage, selfTitleOf } from "@/lib/activity/self";
import { recategorize } from "@/lib/activity/stats";

/** Le titre que le moteur écrit quand l'app de bureau est au premier plan. */
const written = (section: Parameters<typeof selfTitle>[2]) => selfTitle("tao", "tao", section);

describe("les trois parties de l'app ne comptent plus dans le même total", () => {
  it("verse le temps des trades du côté des marchés", () => {
    const c = classify("tao", written("trading"), []);
    expect(c.category).toBe("trading");
    expect(c.label).toBe("tao trade · Trading");
  });

  it("verse le temps de la vie perso du côté du travail", () => {
    const c = classify("tao", written("perso"), []);
    expect(c.category).toBe("work");
    expect(c.label).toBe("tao trade · Personal life");
  });

  it("verse le temps de la finance du côté des marchés, comme les trades", () => {
    // Le choix de l'utilisateur : suivre son patrimoine et suivre ses trades
    // sont pour lui la même heure de la journée.
    const c = classify("tao", written("finance"), []);
    expect(c.category).toBe("trading");
    expect(c.label).toBe("tao trade · Finance");
  });

  it("laisse neutre ce qui ne relève d'aucune partie", () => {
    // Les réglages sont ceux de l'app entière : ce temps n'est celui d'aucune
    // activité, et il reste sous le nom de l'app.
    const c = classify("tao", written(null), []);
    expect(c.category).toBe("tao");
    expect(c.label).toBe("tao trade");
  });

  it("donne à chaque partie un nom à elle, sinon un seul total survivrait", () => {
    const labels = (["trading", "perso", "finance"] as const).map(s => classify("tao", written(s), []).label);
    expect(new Set(labels).size).toBe(3);
  });

  it("nomme la partie dans la langue de l'interface", () => {
    setLang("fr");
    try {
      expect(classify("tao", written("perso"), []).label).toBe("tao trade · Vie perso");
    } finally {
      // La suite entière est épinglée en anglais (cf. tests/setup.ts).
      setLang("en");
    }
  });
});

describe("le titre, seul canal qui survit à la relecture", () => {
  it("écrit le titre que la fenêtre native ne donne pas", () => {
    // Le titre de la fenêtre de bureau est figé (« tao », cf. tauri.conf.json).
    expect(selfTitle("tao", "tao", "finance")).toBe(selfTitleOf("finance"));
    expect(selfTitle("tao", "tao", null)).toBe("tao");
  });

  it("ne réécrit pas un titre qui annonce déjà une partie", () => {
    /* C'est le cas de l'onglet : il porte `document.title`, et la partie qu'il
       annonce est celle qu'on REGARDE — pas celle où en est l'app de bureau
       restée derrière. */
    expect(selfTitle("Google Chrome", "Trading · tao trade", "finance")).toBe("Trading · tao trade");
    expect(selfTitle("tao", "Trading · tao trade", "finance")).toBe("Trading · tao trade");
  });

  it("ne touche au titre d'aucune autre application", () => {
    expect(selfTitle("Code", "engine.ts — tr4de", "trading")).toBe("engine.ts — tr4de");
    expect(selfTitle("Google Chrome", "Compilation de chats - YouTube", "perso"))
      .toBe("Compilation de chats - YouTube");
  });

  it("reconnaît la partie dans l'onglet d'un navigateur, hôte ou pas", () => {
    /* Le cas que le relais interne ne peut pas couvrir : un poste de bureau
       mesurant tao trade ouvert dans un navigateur ne voit que le titre. */
    const withHost = classify("Google Chrome", "Finance · tao trade", [], "https://tao-trade.vercel.app/dashboard");
    expect(withHost.category).toBe("trading");
    expect(withHost.label).toBe("tao trade · Finance");
    expect(classify("Google Chrome", "Personal life · tao trade", []).category).toBe("work");
    // L'ordre des deux mots n'entre pas en jeu : un titre ancien, écrit dans
    // l'autre sens, se relit aussi bien.
    expect(classify("Google Chrome", "tao trade · Finance", []).label).toBe("tao trade · Finance");
  });

  it("garde la partie quand la page reclasse la journée", () => {
    /* La régression que ce test attrape : la page Activité reclasse chaque
       segment depuis (app, titre, hôte) seuls. Un classement corrigé à la
       mesure, et non écrit dans le titre, disparaîtrait ici. */
    const day: DayLog = {
      date: "2026-03-02",
      segments: [{
        s: 0, e: 60_000, app: "tao",
        label: "tao trade · Finance", title: written("finance"), cat: "trading",
      }],
      awayMs: 0,
      updatedAt: 0,
    };
    const [seg] = recategorize(day, DEFAULT_SETTINGS);
    expect(seg.cat).toBe("trading");
    expect(seg.label).toBe("tao trade · Finance");
  });

  it("cède le pas à une règle de l'utilisateur", () => {
    // Un classement qu'on ne peut pas corriger n'en est pas un.
    const rules: ClassifyRule[] = [{ id: "r1", match: "tao", field: "app", category: "dev" }];
    const c = classifyDetailed("tao", written("trading"), rules);
    expect(c.category).toBe("dev");
    expect(c.via).toBe("user");
  });
});

describe("la table des parties suit les pages de la coquille", () => {
  /* Une page routée sans partie retombe sur « tao trade » neutre : rien ne
     casse, mais son temps disparaît des trois totaux sans que personne le
     remarque. D'où la lecture de la coquille elle-même — la navigation ne
     suffirait pas, les pages de détail n'y figurent pas. */
  const source = readFileSync("components/DashboardNew.jsx", "utf8");
  const block = source.slice(source.indexOf("const pages = {"));
  const routed = [...block.slice(0, block.indexOf("\n  };")).matchAll(/^\s+"?([a-z0-9-]+)"?:\s*</gm)]
    .map(m => m[1]);

  /** Pages routées dont l'absence de partie est un choix, pas un oubli. */
  const NO_SECTION = ["settings"];

  it("lit bien l'objet des pages de la coquille", () => {
    // Sans ce garde-fou, un renommage rendrait les deux tests suivants vides et
    // toujours verts.
    expect(routed).toContain("dashboard");
    expect(routed.length).toBeGreaterThan(30);
  });

  it("range chaque page routée dans une partie", () => {
    const orphans = routed.filter(id => !NO_SECTION.includes(id) && sectionOfPage(id) === null);
    expect(orphans).toEqual([]);
  });

  it("ne range aucune page qui n'existe plus", () => {
    const ghosts = Object.keys(SECTION_OF_PAGE).filter(id => !routed.includes(id));
    expect(ghosts).toEqual([]);
  });
});
