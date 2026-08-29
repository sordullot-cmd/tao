import { describe, it, expect } from "vitest";
import { GCAL_COLORS, GCAL_EVENT, DEFAULT_EVENT_COLOR, TASK_DEFAULT_PAINT, eventPaint, nearestGcalColorId } from "@/lib/gcalColors";
import { HUE } from "@/lib/ui/palette";
import { contrast, luminance } from "@/lib/ui/color";
import { CATEGORY_PALETTE } from "@/lib/lifeRpgCategories";

const IDS = Object.keys(GCAL_COLORS);
const paints = IDS.map((id) => GCAL_EVENT[id]);

describe("couleurs de l'agenda", () => {
  /* Le cas qui a motivé la reprise : les onze emplacements portaient les hex
     de Google, seules couleurs de l'app à n'appartenir à aucune palette
     maison. Ce test échoue si l'une d'elles y retourne. */
  it("ne sert que des teintes de la charte", () => {
    const charte = new Set(Object.values(HUE).map((c) => c.toUpperCase()));
    for (const id of IDS) expect(charte, `colorId ${id}`).toContain(GCAL_COLORS[id].toUpperCase());
    expect(charte).toContain(DEFAULT_EVENT_COLOR.toUpperCase());
  });

  it("donne les trois rôles à chacun des onze emplacements", () => {
    expect(IDS).toHaveLength(11);
    for (const id of IDS) {
      const p = GCAL_EVENT[id];
      expect(p, `colorId ${id}`).toBeDefined();
      for (const k of ["bg", "soft", "accent", "ink"] as const) {
        expect(p[k], `${k} de ${id}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  /* Le texte est posé sur `bg` ET sur `soft` (une tâche, un évènement passé) :
     les deux doivent tenir, pas seulement le premier. */
  it("garde le texte lisible sur les deux fonds", () => {
    for (const id of IDS) {
      const p = GCAL_EVENT[id];
      expect(contrast(p.ink, p.bg), `ink/bg de ${id}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.ink, p.soft), `ink/soft de ${id}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  /* Le trait NE tient PAS les 3:1 des éléments graphiques, et c'est voulu : il
     reprend l'éclaircissement de 38 % de l'ancien rendu, dont c'est toute la
     légèreté. Ce qu'on vérifie à la place, c'est qu'il reste visible — plus
     franc que le fond du bloc, sans quoi il n'y aurait plus de bord du tout —
     et que la couleur est bien portée AILLEURS que par lui, par le texte, qui
     est tenu à 4,5:1 (cas précédent). */
  it("garde le trait de gauche plus franc que le fond qu'il borde", () => {
    for (const id of IDS) {
      const { accent, bg, soft } = GCAL_EVENT[id];
      expect(luminance(accent), `accent de ${id} vs bg`).toBeLessThan(luminance(bg));
      expect(luminance(accent), `accent de ${id} vs soft`).toBeLessThan(luminance(soft));
      expect(contrast(accent, soft), `accent de ${id} sur soft`).toBeGreaterThan(1.1);
    }
  });

  /* Le reproche fait au premier jeu de valeurs : une journée pleine devenait un
     mur d'aplats. Les fonds doivent rester des voiles — et `soft`, celui des
     tâches et du passé, à deux doigts du blanc. */
  it("garde les fonds légers, et ceux des tâches presque blancs", () => {
    for (const id of IDS) {
      expect(luminance(GCAL_EVENT[id].bg), `bg de ${id}`).toBeGreaterThan(0.8);
      expect(luminance(GCAL_EVENT[id].soft), `soft de ${id}`).toBeGreaterThan(0.91);
      // …et jamais confondu avec le fond plein, sinon une tâche ne se
      // distinguerait plus d'un évènement (le cas qu'a posé Graphite).
      expect(luminance(GCAL_EVENT[id].soft), `soft de ${id}`).toBeGreaterThan(luminance(GCAL_EVENT[id].bg));
      // …sans jamais être blanc pour autant : la teinte doit s'apercevoir.
      expect(GCAL_EVENT[id].soft, `soft de ${id}`).not.toBe("#FFFFFF");
    }
  });

  /* Onze emplacements pour six familles de teintes : c'est la contrainte qui a
     fait renoncer à une clarté de fond unique. Le seuil (5,7 obtenu) ne garde
     qu'un plancher : des voiles aussi légers ne peuvent pas trancher entre eux,
     et c'est le trait qui identifie l'emplacement. Il ne vaut que pour `bg` :
     les `soft` convergent vers le blanc, c'est leur raison d'être. */
  it("sépare les fonds des emplacements voisins", () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    for (let i = 0; i < paints.length; i++) {
      for (let j = i + 1; j < paints.length; j++) {
        const [a, b] = [rgb(paints[i].bg), rgb(paints[j].bg)];
        const d = Math.sqrt(0.3 * (a[0] - b[0]) ** 2 + 0.59 * (a[1] - b[1]) ** 2 + 0.11 * (a[2] - b[2]) ** 2);
        expect(d, `${IDS[i]} ↔ ${IDS[j]}`).toBeGreaterThan(5);
      }
    }
  });

  /* Un agenda ABONNÉ (l'emploi du temps universitaire) n'envoie pas de
     colorId : sans repli, ses évènements sortiraient sans fond ni encre. */
  it("sert un jeu complet quand l'évènement n'a pas de couleur", () => {
    expect(eventPaint(null)).toEqual(GCAL_EVENT[1]);
    expect(eventPaint(undefined)).toEqual(GCAL_EVENT[1]);
    expect(eventPaint("42")).toEqual(GCAL_EVENT[1]);
    expect(eventPaint(7)).toEqual(GCAL_EVENT[7]);
  });

  /* Bénéfice attendu du passage à la charte : les catégories Vie RPG puisent
     dans la même planche, donc une tâche planifiée retrouve sa couleur EXACTE
     au lieu de la voisine la moins fausse. */
  it("retrouve à l'identique la couleur d'une catégorie Vie RPG", () => {
    const servies = CATEGORY_PALETTE.filter((c: string) =>
      Object.values(GCAL_COLORS).some((g) => g.toUpperCase() === c.toUpperCase()));
    expect(servies.length).toBeGreaterThanOrEqual(10);
    for (const c of servies) {
      expect(GCAL_COLORS[nearestGcalColorId(c)].toUpperCase()).toBe(c.toUpperCase());
    }
  });
});

describe("tâche sans couleur choisie", () => {
  /* Une tâche à laquelle on n'a rien choisi prenait l'emplacement 1 : elle
     ressortait lavande, une teinte qu'on n'avait pas demandée et qui la faisait
     passer pour classée. Elle est désormais neutre. */
  it("reste grise : aucun des quatre rôles ne porte de teinte", () => {
    // Gris au sens strict, les trois canaux égaux. C'est la seule garantie qui
    // tienne dans le temps : le gris de la charte est aussi celui de
    // l'emplacement Graphite, les comparer ne dirait rien.
    for (const role of ["bg", "soft", "accent", "ink"] as const) {
      const [, r, g, b] = /^#(..)(..)(..)$/.exec(TASK_DEFAULT_PAINT[role])!;
      expect([r, g, b], `${role}`).toEqual([r, r, r]);
    }
  });

  it("ne sort pas de la charte, comme les onze emplacements", () => {
    const charte = new Set(Object.values(HUE).map((c) => c.toUpperCase()));
    for (const role of ["bg", "soft", "accent", "ink"] as const) {
      expect(charte, role).toContain(TASK_DEFAULT_PAINT[role].toUpperCase());
    }
  });

  it("tient les mêmes seuils de lisibilité que les autres jeux", () => {
    expect(contrast(TASK_DEFAULT_PAINT.ink, TASK_DEFAULT_PAINT.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(TASK_DEFAULT_PAINT.ink, TASK_DEFAULT_PAINT.soft)).toBeGreaterThanOrEqual(4.5);
    // Sans le trait, une tâche presque blanche sur une grille blanche n'aurait
    // plus aucun bord : c'est lui, ici, qui la délimite.
    expect(contrast(TASK_DEFAULT_PAINT.accent, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(contrast(TASK_DEFAULT_PAINT.accent, TASK_DEFAULT_PAINT.soft)).toBeGreaterThanOrEqual(3);
  });

  it("pose un fond presque blanc, mais jamais blanc", () => {
    // Le gris le plus clair de la charte (`polar`, 0,929) : à peine détaché de
    // la carte, ce qui est l'intention — sans disparaître tout à fait.
    expect(luminance(TASK_DEFAULT_PAINT.soft)).toBeGreaterThan(0.92);
    expect(TASK_DEFAULT_PAINT.soft).not.toBe("#FFFFFF");
  });

  it("laisse une couleur choisie l'emporter", () => {
    // Le neutre est un défaut, pas une règle : poser une couleur doit la rendre.
    expect(eventPaint("11")).toBe(GCAL_EVENT["11"]);
  });
});
