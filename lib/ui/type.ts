/**
 * Échelle typographique — SOURCE UNIQUE des tailles de texte du site.
 *
 * Avant ce fichier, chaque page posait ses propres nombres : 1 917 `fontSize`
 * en dur pour 21 valeurs distinctes (de 8 à 48 px), plus une échelle CSS
 * (`--text-*`) qu'aucune page n'utilisait et des rustines `!important` dans
 * `globals.css` pour rattraper les tailles au sélecteur d'attribut. Deux pages
 * voisines n'avaient donc pas le même titre, ni le même libellé, ni le même
 * bouton.
 *
 * ── Dix crans, ceux de la maquette ────────────────────────────────────────
 * Les valeurs ne sont pas inventées : ce sont celles que la DA Figma emploie
 * déjà le plus (le socle 12 → 13, cf. lib/ui/tokens.ts). Les onze valeurs
 * orphelines (8, 9, 15, 17, 18, 22, 26, 30, 32, 34, 48) ont été ramenées au
 * cran voisin, ce qui laisse les pages déjà portées inchangées.
 *
 * ── Un rôle = taille + graisse + interligne + approche ────────────────────
 * Une taille seule ne suffit pas à faire une hiérarchie. Trois raisons, toutes
 * les trois vérifiables à l'œil :
 *
 * 1. L'approche (`letterSpacing`) dépend de la taille. Plus un texte grandit,
 *    plus ses lettres PARAISSENT écartées : un titre de 28 px a besoin d'être
 *    resserré (-0.02em) là où un libellé de 10 px a besoin d'air (+0.01em).
 *    Une valeur unique pour toutes les tailles est donc fausse quelque part —
 *    et c'était le cas ici, avec des `letterSpacing: -0.65` posés au jugé.
 * 2. L'interligne varie à l'inverse de la taille : serré sur un titre (1.0),
 *    aéré sur du texte courant (1.4). Les interlignes en pixels relevés dans
 *    Figma (`17.05`, `18.6`, `26.35`) ne survivaient pas au changement de
 *    taille — ils sont remplacés par des rapports.
 * 3. La graisse fait partie du cran : elle donne de la présence sans prendre
 *    de place. C'est elle qu'on monte pour insister, pas la taille.
 *
 * ── Comment s'en servir ───────────────────────────────────────────────────
 * ```jsx
 * <div style={{ ...TYPE.label, color: T.textSub }}>Résultat net</div>
 * <div style={{ ...TYPE.title1, ...TABULAR }}>+1 240,50 €</div>
 * // Insister sur un cran sans en changer : on monte la graisse.
 * <span style={{ ...TYPE.body, fontWeight: 600 }}>MNQU6</span>
 * ```
 * Le rôle s'étale EN PREMIER, les exceptions se posent après. `TS` reste
 * disponible quand seule la taille est en jeu (une tuile de graphique, un
 * glyphe calculé).
 *
 * ── Pixels ici, `rem` dans la feuille de style ────────────────────────────
 * Ce fichier sert des NOMBRES parce que tout le site est en styles inline, où
 * un nombre vaut des pixels. `app/globals.css` expose la même échelle en `rem`
 * (`--text-*`), qui suit le réglage de taille de texte du système. Les deux
 * listes sont les mêmes valeurs, à une racine de 16 px près ; elles se
 * modifient ensemble.
 */

/** Les dix crans, en pixels. Aucune autre taille de texte n'a cours. */
export const TS = {
  /** 10 — méta minuscule : axe de graphique, exposant, mention légale. */
  caption2: 10,
  /** 11 — légende, sous-libellé, unité à côté d'un chiffre. */
  caption: 11,
  /** 12 — libellé de champ, en-tête de tableau, texte atténué. */
  label: 12,
  /** 13 — le socle : valeur d'un champ, texte courant, cellule de tableau. */
  body: 13,
  /** 14 — bouton, onglet, ligne de tableau qu'on veut lire d'abord. */
  callout: 14,
  /** 16 — titre de carte, nom d'instrument, montant secondaire. */
  headline: 16,
  /** 20 — titre de section dans une page. */
  title3: 20,
  /** 24 — titre d'écran. */
  title2: 24,
  /** 28 — chiffre héros d'une carte (KPI, niveau, série). */
  title1: 28,
  /** 40 — le P&L héros du tableau de bord, et lui seul. */
  display: 40,
} as const;

/** Les dix crans triés — sert au garde-fou (tests/typeScale.test.ts). */
export const TYPE_SIZES: readonly number[] = [10, 11, 12, 13, 14, 16, 20, 24, 28, 40];

/**
 * Ramène une taille quelconque au cran le plus proche.
 *
 * Utile là où la taille est CALCULÉE (vignette dont le sigle suit le diamètre,
 * graphique qui se densifie) : le calcul reste, mais il retombe sur l'échelle
 * au lieu de produire un 17 ou un 22 de plus. À égalité de distance, on prend
 * le cran du dessous : mieux vaut un texte un peu plus petit qu'un texte qui
 * déborde de son conteneur.
 */
export function snapType(px: number): number {
  let best = TYPE_SIZES[0];
  let bestGap = Infinity;
  for (const step of TYPE_SIZES) {
    const gap = Math.abs(step - px);
    if (gap < bestGap) { best = step; bestGap = gap; }
  }
  return best;
}

/** Un rôle complet, prêt à étaler dans un style inline. */
export interface TypeRole {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: string;
}

/**
 * Les dix rôles. `letterSpacing` est en `em` — donc proportionnel à la taille,
 * ce qu'une valeur en pixels ne serait pas : un `-0.65px` juste sur un titre
 * de 28 écrase un libellé de 10.
 */
export const TYPE: Record<keyof typeof TS, TypeRole> = {
  caption2: { fontSize: TS.caption2, fontWeight: 500, lineHeight: 1.2,  letterSpacing: "0.01em" },
  caption:  { fontSize: TS.caption,  fontWeight: 500, lineHeight: 1.25, letterSpacing: "0.005em" },
  label:    { fontSize: TS.label,    fontWeight: 500, lineHeight: 1.3,  letterSpacing: "0" },
  body:     { fontSize: TS.body,     fontWeight: 400, lineHeight: 1.4,  letterSpacing: "0" },
  callout:  { fontSize: TS.callout,  fontWeight: 500, lineHeight: 1.35, letterSpacing: "0" },
  headline: { fontSize: TS.headline, fontWeight: 500, lineHeight: 1.25, letterSpacing: "-0.005em" },
  title3:   { fontSize: TS.title3,   fontWeight: 500, lineHeight: 1.2,  letterSpacing: "-0.01em" },
  title2:   { fontSize: TS.title2,   fontWeight: 500, lineHeight: 1.1,  letterSpacing: "-0.015em" },
  title1:   { fontSize: TS.title1,   fontWeight: 500, lineHeight: 1.08, letterSpacing: "-0.02em" },
  display:  { fontSize: TS.display,  fontWeight: 500, lineHeight: 1.0,  letterSpacing: "-0.02em" },
};

/**
 * Chiffres à largeur fixe. À poser sur tout nombre qui VARIE sur place — un
 * P&L qui se rafraîchit, un compte à rebours, une colonne de montants : sans
 * ça, la valeur tremble à chaque changement de chiffre parce que le « 1 » est
 * plus étroit que le « 8 ».
 */
export const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;
