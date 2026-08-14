/**
 * Mélange de couleurs, en hexadécimal.
 *
 * Les palettes de l'app sont écrites en `#RRGGBB` en dur (`lib/bank/categories`,
 * `lib/ui/brandColors`) : ce sont des teintes choisies à l'œil, pas des
 * variables CSS, et c'est bien ainsi — elles doivent être les mêmes d'un
 * graphique à l'autre. Certaines vues ont pourtant besoin d'en DÉRIVER une
 * autre : un pastel pour un ruban qui ne doit pas hurler, une nuance par
 * sous-poste sous la couleur de son poste.
 *
 * Le mélange se fait en sRGB, sans passer par un espace perceptuel. C'est
 * volontairement grossier : on éclaircit vers le blanc de fond, l'écart avec un
 * mélange en Oklab ne se voit pas sur un aplat, et ça évite d'embarquer une
 * conversion d'espace colorimétrique pour deux graphiques.
 *
 * Limite assumée : seules les notations `#RGB` et `#RRGGBB` sont comprises. Une
 * couleur donnée en `var(--…)` ou en `rgb()` ressort telle quelle, non mélangée —
 * elle vaut mieux qu'un `#000000` de repli, qui passerait pour un choix.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Les trois canaux d'un `#RGB` ou `#RRGGBB`, ou `null` si ce n'en est pas un. */
function channels(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  const s = hex.slice(1);
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

const hex2 = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/**
 * `a` et `b` mélangées, `t` étant la part de `b` (0 → `a`, 1 → `b`).
 *
 * Une entrée non hexadécimale renvoie `a` inchangée (cf. en-tête).
 */
export function mixHex(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  if (!ca || !cb) return a;
  const k = Math.max(0, Math.min(1, t));
  return `#${ca.map((v, i) => hex2(v + (cb[i] - v) * k)).join("")}`;
}

/** La couleur éclaircie vers le blanc — `amount` = part de blanc. */
export const tint = (color: string, amount: number): string => mixHex(color, "#FFFFFF", amount);

/** La couleur assombrie vers le noir — `amount` = part de noir. */
export const shade = (color: string, amount: number): string => mixHex(color, "#000000", amount);
