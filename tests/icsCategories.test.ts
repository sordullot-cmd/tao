import { describe, it, expect } from "vitest";
import {
  courseKind, courseColor, courseColorId, kindColor, kindColorId,
  normalizeKindColors, KIND_DEFAULT_COLOR_ID, KIND_LABELS,
} from "@/lib/icsCategories";
import { GCAL_COLORS } from "@/lib/gcalColors";

describe("type de séance et couleur", () => {
  it("range les variantes d'un type sous leur type parent", () => {
    // On veut repérer SES TD d'un coup d'œil ; la nuance « à distance » est
    // déjà écrite dans l'intitulé, elle n'a pas besoin d'une teinte à elle.
    for (const c of ["TD", "TD à distance", "TD Hybrides", "TD (récup)", "TD à distance (récup)"]) {
      expect(courseKind(c), c).toBe("td");
    }
    for (const c of ["CM", "CM à distance", "CM Hybrides", "CM (récup)"]) {
      expect(courseKind(c), c).toBe("cm");
    }
  });

  it("classe une séance annulée comme annulée, pas comme le cours qu'elle aurait été", () => {
    // La régression coûteuse : « TD annulé » en vert TD, on se déplace pour rien.
    expect(courseKind("TD annulé")).toBe("annule");
    expect(courseKind("CM annulé")).toBe("annule");
    expect(courseKind("Tutorat annulé")).toBe("annule");
  });

  it("reconnaît les accents, que `\\b` seul ne sait pas délimiter", () => {
    // `/\\bannulé\\b/` ne filtre PAS « TD annulé » : après « é », il n'y a pas de
    // frontière de mot au sens de JavaScript. D'où la normalisation préalable.
    expect(courseKind("Férié")).toBe("pause");
    expect(courseKind("Révisions")).toBe("revisions");
    expect(courseKind("Remédiation")).toBe("soutien");
    expect(courseKind("Evénement UA")).toBe("reunion");
    expect(courseKind("Contrôle continu")).toBe("examen");
  });

  it("ne prend pas « Interruption des cours » pour un cours magistral", () => {
    // Le mot « cours » y figure : sans priorité, la règle CM l'emportait.
    expect(courseKind("Interruption des cours")).toBe("pause");
  });

  it("fait primer l'évaluation sur le type de séance", () => {
    expect(courseKind("Contrôle Continu CM")).toBe("examen");
    expect(courseKind("Examen rattrapage")).toBe("examen");
    // La soutenance est une évaluation : même teinte, même urgence.
    expect(courseKind("Soutenance de stage")).toBe("examen");
  });

  it("préfère la catégorie de l'établissement à l'intitulé de la matière", () => {
    // Un intitulé contient n'importe quel mot ; la catégorie est normalisée.
    expect(courseKind("CM", "Histoire des projets urbains")).toBe("cm");
    expect(courseKind("TD", "Introduction au droit du travail")).toBe("td");
  });

  it("se rabat sur l'intitulé quand la catégorie manque", () => {
    expect(courseKind("", "TP Chimie organique")).toBe("tp");
    expect(courseKind(undefined, "Examen blanc")).toBe("examen");
  });

  it("range dans « autre » un vocabulaire inconnu, au lieu de le classer au hasard", () => {
    expect(courseKind("Sociologie")).toBe("autre");
    expect(courseKind("", "")).toBe("autre");
    expect(courseKind()).toBe("autre");
  });

  it("donne une couleur distincte à chaque type qui demande une action", () => {
    const kinds = ["cm", "td", "tp", "examen", "revisions", "soutien", "reunion", "projet", "stage"] as const;
    const colors = kinds.map((k) => courseColorId(KIND_LABELS[k]));
    // `pause` et `annule` partagent volontairement le gris ; tout le reste doit
    // se distinguer, sinon la couleur ne renseigne plus sur rien.
    expect(new Set(colors).size).toBe(kinds.length);
  });

  it("rend une couleur de la palette Google, pour ne pas jurer avec les évènements voisins", () => {
    expect(Object.values(GCAL_COLORS)).toContain(courseColor("TD"));
    expect(courseColor("Examen")).toBe(GCAL_COLORS["11"]); // Tomate
    expect(courseColor("TD annulé")).toBe(GCAL_COLORS["8"]); // Graphite
  });
});

/* ── Couleurs réglées par l'utilisateur ───────────────────────────────────── */

describe("couleur d'un type, réglée depuis les paramètres", () => {
  it("remplace la couleur livrée pour le seul type visé", () => {
    const mine = { examen: "3" };
    expect(kindColorId("examen", mine)).toBe("3");
    expect(courseColor("Partiel", "", mine)).toBe(GCAL_COLORS["3"]);
    // Les autres types ne bougent pas : on n'a réglé qu'une ligne.
    expect(kindColorId("td", mine)).toBe(KIND_DEFAULT_COLOR_ID.td);
  });

  it("n'enregistre pas une couleur égale à celle d'origine", () => {
    /* Sinon la valeur du jour serait recopiée dans le magasin et gelée pour
       toujours — y compris si la charte la corrige plus tard. Rendre un type à
       sa couleur d'origine, c'est RETIRER la surcharge, pas l'écrire. */
    expect(normalizeKindColors({ examen: KIND_DEFAULT_COLOR_ID.examen })).toEqual({});
    expect(normalizeKindColors({ examen: "3" })).toEqual({ examen: "3" });
  });

  it("refuse ce qui n'est ni un type connu ni un emplacement Google", () => {
    /* Le magasin est un JSON quelconque, relu tel quel d'un appareil à l'autre :
       une valeur libre poserait à l'écran une couleur qui n'appartient à aucune
       palette, au milieu d'évènements Google qui n'en ont que onze. */
    expect(normalizeKindColors({ examen: "#ff0000" })).toEqual({});
    expect(normalizeKindColors({ examen: "42" })).toEqual({});
    expect(normalizeKindColors({ inconnu: "3" })).toEqual({});
    expect(normalizeKindColors(null)).toEqual({});
    expect(normalizeKindColors(["3"])).toEqual({});
  });

  it("retombe sur la couleur livrée quand rien n'est réglé", () => {
    expect(kindColor("examen")).toBe(GCAL_COLORS["11"]);
    expect(kindColor("examen", {})).toBe(GCAL_COLORS["11"]);
    expect(courseColorId("Examen", "", {})).toBe("11");
  });
});
