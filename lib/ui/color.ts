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

/**
 * Luminance relative au sens WCAG, entre 0 (noir) et 1 (blanc).
 *
 * Sert à décider si une couleur peut porter du texte blanc — question qu'on ne
 * tranche PAS à l'œil : un vert vif « paraît » sombre et ne rend pourtant que
 * 2,3:1 en blanc. Une entrée non hexadécimale rend 0, donc « assez sombre » :
 * c'est le repli le moins risqué, l'encre claire restant lisible.
 */
export function luminance(hex: string): number {
  const c = channels(hex);
  if (!c) return 0;
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/* Luminance maximale d'un fond qui porte du texte blanc : 1,05 / (L + 0,05) ≥ 3
   donne L ≤ 0,30 — le seuil des éléments graphiques (WCAG 1.4.11), celui qui
   s'applique à un glyphe posé sur un aplat. */
const WHITE_SAFE = 0.3;

/**
 * La couleur assombrie JUSTE ASSEZ pour porter un glyphe blanc.
 *
 * Une palette d'identité mélange des teintes sombres (bordeaux, brun) et claires
 * (cyan clair, mauve, ambre) : posées telles quelles sous une icône blanche, la
 * moitié tient et l'autre s'efface. Plutôt que de choisir une encre par couleur
 * — ce qui donne une colonne d'icônes moitié blanches moitié noires, illisible
 * comme famille —, on ramène chaque teinte au même niveau de profondeur. Le TON
 * est conservé (on mélange vers le noir, pas vers le gris), et les couleurs
 * déjà sombres ne bougent pas du tout.
 */
export function deepen(color: string, max = WHITE_SAFE): string {
  let out = color;
  // Six passes suffisent : chacune retire 12 % de lumière, et la plus claire des
  // palettes part de 0,7 environ.
  for (let i = 0; i < 6 && luminance(out) > max; i++) out = shade(out, 0.12);
  return out;
}

/**
 * Vignette d'identité : le disque PÂLE, le glyphe dans la teinte.
 *
 * C'est la forme que prend une icône de sujet partout dans l'app — un poste de
 * dépense, une habitude, une catégorie d'objectif. Elle n'invente rien : elle
 * met un nom sur la règle déjà écrite à la main une quinzaine de fois, des
 * pages Focus et Sport aux bandeaux de session (`components/focus/*`,
 * `FocusPage`, `SessionRunner`) — voile de la teinte à 14 %, glyphe dans cette
 * même teinte, telle quelle.
 *
 * L'inverse — aplat saturé, glyphe blanc — a été essayé sur trois pages et
 * écarté : ces vignettes se lisaient comme une famille à part au milieu d'une
 * interface qui pose partout ailleurs de l'encre colorée sur un fond calme.
 *
 * Le fond est un `color-mix` vers `transparent` et non une teinte mélangée vers
 * le blanc : il se compose avec le fond réel, donc il reste discret sur une
 * carte claire comme sur le thème sombre, là où un mélange vers le blanc ferait
 * une pastille lumineuse.
 *
 * Ce que ça coûte, et qui est assumé parce que c'est la règle de l'app : sur les
 * teintes les plus claires de la palette, le glyphe pris tel quel descend sous
 * 3:1 contre son propre disque. Le voile est trop léger pour éloigner beaucoup
 * les deux, et le NOM est toujours juste à côté — la vignette colore et situe,
 * elle ne porte pas l'information seule.
 */
export function vignette(color: string): { background: string; color: string } {
  return {
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    color,
  };
}

/** Contraste WCAG entre deux couleurs, de 1 (identiques) à 21 (noir sur blanc). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * La couleur amenée à une luminance donnée, en l'éclaircissant OU en
 * l'assombrissant selon d'où elle part.
 *
 * Sert aux VIGNETTES. Une palette d'identité étale ses teintes sur toute
 * l'échelle de clarté — le rose rend 0,72 de luminance, le bleu profond 0,16 —
 * et posées telles quelles dans une colonne de pastilles, les unes brûlent
 * pendant que les autres s'éteignent. En les ramenant TOUTES au même niveau, la
 * famille se lit comme une famille et il ne reste que la teinte pour les
 * distinguer, ce qui est exactement le travail qu'on leur demande.
 *
 * Recherche par dichotomie sur la part de blanc (positive) ou de noir
 * (négative) : c'est monotone, vingt itérations suffisent largement.
 */
export function toLuminance(color: string, target: number): string {
  if (!HEX.test(color)) return color;
  let lo = -1;
  let hi = 1;
  let out = color;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    out = m >= 0 ? tint(color, m) : shade(color, -m);
    if (luminance(out) > target) hi = m;
    else lo = m;
  }
  return out;
}

/**
 * De l'encre lisible sur `bg` : la MÊME teinte, assombrie juste assez.
 *
 * On ne choisit pas une encre neutre — un glyphe noir sur une vignette colorée
 * casse la parenté entre le disque et son dessin. On descend la teinte jusqu'au
 * ratio demandé, et pas plus loin.
 */
export function inkOn(color: string, bg: string, ratio = 4.5): string {
  let out = color;
  for (let i = 0; i < 20 && contrast(out, bg) < ratio; i++) out = shade(out, 0.1);
  return out;
}

/**
 * Anneau de lisibilité d'une pastille, à poser en `boxShadow`.
 *
 * Une puce de 8 px doit tenir 3:1 pour exister sur une carte blanche, et les
 * teintes claires de la palette sont loin du compte (le jaune rend 1,55:1, le
 * rose 1,39:1). Les assombrir marcherait, mais le jaune vire olive et le rose
 * gris : on perd ce que la puce est censée dire. On garde donc la teinte PLEINE
 * au centre et on cerne la puce d'un liseré de la même teinte, assez foncé pour
 * la détacher du fond. `inset` : le liseré ne change pas l'encombrement.
 */
export const dotRing = (color: string): string => `inset 0 0 0 1px ${deepen(color)}`;
