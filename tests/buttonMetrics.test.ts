import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BTN, BTN_ICON, BTN_HEIGHT, BTN_PADDING } from "@/lib/ui/buttons";
import { TYPE_SIZES } from "@/lib/ui/type";

/**
 * Garde-fou des métriques de boutons.
 *
 * L'audit du 20/08/2026 comptait 178 boutons-pilules pour **82 combinaisons**
 * de marges internes : deux boutons dans la même barre d'outils n'avaient pas
 * la même hauteur. Comme pour l'échelle typographique, une convention que rien
 * ne vérifie se défait au premier écran ajouté.
 *
 * Le test ne juge QUE la pilule — `borderRadius: 999`, la forme de bouton de la
 * DA — et seulement quand la marge est écrite en deux valeurs dans la balise
 * `<button>` elle-même. Ce qu'il laisse volontairement passer :
 * - les TAGS et pastilles, qui portent aussi un rayon 999 mais ne sont pas des
 *   boutons : un tag garde ses propres métriques, plus serrées ;
 * - les cartes cliquables (`padding: "48px 32px"`), qui sont des surfaces ;
 * - les lignes de liste et de menu (rayon 8 à 12), qui ne sont pas des pilules ;
 * - les styles définis dans une fabrique hors balise, hors de portée d'une
 *   lecture textuelle — ils sont alignés, mais le test ne peut pas le prouver.
 */

const ROOTS = ["components", "app"];
const EXEMPT = ["font-test"];
const SRC = /\.(jsx|tsx)$/;

/** La seule marge interne de bouton admise. */
const CANON = new Set(Object.values(BTN).map(b => b.padding));
/** La seule hauteur — les trois paliers la partagent. */
const HEIGHTS = new Set(Object.values(BTN).map(b => b.minHeight));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (EXEMPT.some(e => full.includes(e))) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SRC.test(entry)) out.push(full.replace(/\\/g, "/"));
  }
  return out;
}

/** Chaque balise `<button …>` ouvrante, accolades imbriquées comprises. */
function buttonTags(src: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = [];
  let i = 0;
  for (;;) {
    i = src.indexOf("<button", i);
    if (i < 0) break;
    let depth = 0, j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ tag: src.slice(i, j + 1), line: src.slice(0, i).split("\n").length });
    i = j + 1;
  }
  return out;
}

describe("métriques de boutons", () => {
  it("sert la même métrique aux trois paliers", () => {
    expect(Object.keys(BTN)).toEqual(["sm", "md", "lg"]);
    /* Ni hauteur ni marge interne ne varient d'un bouton à l'autre : les deux
       se voyaient dès que deux boutons se croisaient dans une barre, et rien à
       l'écran ne disait pourquoi l'un était plus court ou plus serré. Seul le
       texte de `lg` monte encore d'un cran. */
    for (const [name, b] of Object.entries(BTN)) {
      expect(b.minHeight, `palier ${name}`).toBe(BTN_HEIGHT);
      expect(b.padding, `palier ${name}`).toBe(BTN_PADDING);
    }
  });

  it("prend ses tailles de texte dans l'échelle typographique", () => {
    for (const [name, b] of Object.entries(BTN)) {
      expect(TYPE_SIZES, `palier ${name}`).toContain(b.fontSize);
    }
  });

  it("garde le bouton d'icône carré, à la hauteur commune", () => {
    for (const key of ["sm", "md", "lg"] as const) {
      expect(BTN_ICON[key].width).toBe(BTN_ICON[key].height);
      expect(BTN_ICON[key].height).toBe(BTN_HEIGHT);
    }
  });

  it("ne laisse aucune pilule hors des trois paliers", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf8");
        for (const { tag, line } of buttonTags(src)) {
          if (!/borderRadius:\s*999/.test(tag)) continue;
          const pad = tag.match(/padding:\s*"(\d+px \d+px)"/);
          if (!pad) continue;                       // une seule valeur, ou pas de marge
          const height = 2 * parseInt(pad[1], 10) + 16;
          if (height > 52) continue;                // carte cliquable, pas un bouton
          if (!CANON.has(pad[1])) offenders.push(`${file}:${line} → padding "${pad[1]}"`);
          const mh = tag.match(/minHeight:\s*(\d+)/);
          if (mh && !HEIGHTS.has(Number(mh[1]))) {
            offenders.push(`${file}:${line} → minHeight ${mh[1]}`);
          }
        }
      }
    }
    expect(
      offenders,
      `Pilules hors des paliers de lib/ui/buttons.ts :\n${offenders.join("\n")}\n` +
      `Marges admises : ${[...CANON].join(" | ")}. Prendre BTN.sm / BTN.md / BTN.lg.`
    ).toEqual([]);
  });
});
