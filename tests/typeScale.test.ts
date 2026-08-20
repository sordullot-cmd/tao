import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TYPE_SIZES, snapType, TYPE, TS } from "@/lib/ui/type";

/**
 * Garde-fou de l'échelle typographique.
 *
 * Le site est écrit en styles inline : rien, dans le langage, n'empêche une
 * page de poser `fontSize: 15`. C'est exactement ce qui s'est produit — 21
 * valeurs distinctes pour 1 917 déclarations, et deux pages voisines qui
 * n'avaient pas le même titre. Une échelle qui n'est vérifiée par rien se
 * défait au premier écran ajouté ; ce test est donc la moitié utile du
 * travail, pas sa décoration.
 *
 * Il lit le code source comme du texte, ce qui est inhabituel pour un test,
 * mais c'est la seule façon d'attraper une valeur écrite en dur : à
 * l'exécution, `fontSize: 15` est indiscernable de `fontSize: TS.callout`.
 */

const ROOTS = ["components", "app", "lib"];

/* Deux exceptions, et elles sont justifiées :
   - `app/font-test` : cette page EXISTE pour comparer des tailles de texte,
     lui imposer l'échelle la viderait de son objet ;
   - `lib/export` : les PDF sont en POINTS sur une page A4, pas en pixels sur
     un écran. Même nom de propriété, autre unité, autre médium. */
const EXEMPT = ["app/font-test", "lib/export"];

const SRC = /\.(jsx?|tsx?)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    const rel = full.replace(/\\/g, "/");
    if (EXEMPT.some(e => rel.includes(e))) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SRC.test(entry)) out.push(rel);
  }
  return out;
}

/** Les deux façons d'écrire une taille : objet de style JS, ou CSS en gabarit. */
const INLINE = /fontSize\s*:\s*(\d+(?:\.\d+)?)/g;
const IN_CSS = /font-size\s*:\s*(\d+(?:\.\d+)?)px/g;

describe("échelle typographique", () => {
  it("n'a que dix crans, et ils sont triés", () => {
    expect(TYPE_SIZES).toEqual([10, 11, 12, 13, 14, 16, 20, 24, 28, 40]);
    expect(Object.values(TS).sort((a, b) => a - b)).toEqual([...TYPE_SIZES]);
  });

  it("donne à chaque rôle une taille de l'échelle", () => {
    for (const [name, role] of Object.entries(TYPE)) {
      expect(TYPE_SIZES, `rôle ${name}`).toContain(role.fontSize);
    }
  });

  it("resserre l'approche à mesure que la taille monte", () => {
    // Un titre a besoin d'être resserré, un libellé a besoin d'air : les deux
    // extrémités de l'échelle ne peuvent donc pas avoir le même signe.
    const em = (v: string) => parseFloat(v);
    expect(em(TYPE.display.letterSpacing)).toBeLessThan(0);
    expect(em(TYPE.caption2.letterSpacing)).toBeGreaterThan(0);
    // L'interligne, lui, va dans l'autre sens : serré en haut, aéré en bas.
    expect(TYPE.display.lineHeight).toBeLessThan(TYPE.body.lineHeight);
  });

  it("ramène une taille calculée au cran le plus proche", () => {
    expect(snapType(15)).toBe(14);
    expect(snapType(18)).toBe(16);
    // 22 est à égale distance de 20 et de 24 : on garde le cran du dessous,
    // un texte un peu plus petit valant mieux qu'un texte qui déborde.
    expect(snapType(22)).toBe(20);
    expect(snapType(9)).toBe(10);
    expect(snapType(100)).toBe(40);
  });

  it("ne laisse aucune taille de texte hors échelle dans le code", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf8");
        for (const re of [INLINE, IN_CSS]) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(src))) {
            const px = Number(m[1]);
            if (!TYPE_SIZES.includes(px)) {
              const line = src.slice(0, m.index).split("\n").length;
              offenders.push(`${file}:${line} → ${px}px`);
            }
          }
        }
      }
    }
    expect(
      offenders,
      `Tailles hors des dix crans de lib/ui/type.ts :\n${offenders.join("\n")}\n` +
      `Crans autorisés : ${TYPE_SIZES.join(", ")}. Prendre le rôle correspondant ` +
      `dans TYPE, ou snapType() si la taille est calculée.`
    ).toEqual([]);
  });
});
