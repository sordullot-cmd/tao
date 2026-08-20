import { TS } from "./type";

/**
 * Métriques des boutons — SOURCE UNIQUE des hauteurs, marges internes et
 * tailles de texte d'un bouton.
 *
 * L'audit du 20/08/2026 : 607 `<button>` écrits à la main contre 32
 * `PillButton`, et vingt-cinq combinaisons de marges internes différentes
 * (`10px 12px`, `8px 10px`, `7px 14px`, `9px 18px`…). Deux boutons côte à côte
 * dans la même barre d'outils n'avaient donc pas la même hauteur, et rien ne
 * disait laquelle était la bonne.
 *
 * ── Trois tailles, pas plus ───────────────────────────────────────────────
 * Trois, parce que trois besoins distincts existent vraiment :
 * - `sm` — dans une ligne de tableau ou une barre d'outils dense, où un bouton
 *   de 34 px ferait grossir la ligne ;
 * - `md` — le défaut, et celui qu'on prend quand on hésite ;
 * - `lg` — l'action qui conclut un formulaire ou une modale, seule sur sa
 *   ligne : elle a besoin d'être visée sans être cherchée.
 *
 * `minHeight` autant que le padding : sans lui, deux boutons voisins dont l'un
 * porte une icône et l'autre non ne font pas la même hauteur, parce que la
 * hauteur de ligne du texte diffère de celle du glyphe. C'est le défaut le
 * plus visible de l'état actuel.
 *
 * ── Ce que ce fichier ne dit PAS ──────────────────────────────────────────
 * Ni couleur, ni bordure, ni ombre : la PEAU d'un bouton (primaire, discret,
 * danger, fantôme) reste au composant qui le rend — cf. `PillButton` dans
 * `components/ui/form.jsx`. On unifie la métrique, pas l'apparence : un
 * bouton de suppression doit continuer de se distinguer d'un bouton de
 * validation.
 *
 * ── Comment s'en servir ───────────────────────────────────────────────────
 * ```jsx
 * <button style={{ ...BTN.md, background: T.text, color: T.textInverted }}>
 *   Enregistrer
 * </button>
 * ```
 */

/** Une taille de bouton, prête à étaler dans un style inline. */
export interface ButtonMetrics {
  minHeight: number;
  padding: string;
  borderRadius: number;
  fontSize: number;
  fontWeight: number;
  gap: number;
}

/* Le rayon est 999 partout : la pilule est la forme de bouton de la DA, et un
   rayon qui change avec la taille ferait trois formes au lieu d'une. */
const PILL = { borderRadius: 999, fontWeight: 500 } as const;

export const BTN: Record<"sm" | "md" | "lg", ButtonMetrics> = {
  /** 28 px — ligne de tableau, barre d'outils dense, action secondaire. */
  sm: { ...PILL, minHeight: 28, padding: "5px 12px",  fontSize: TS.body,    gap: 5 },
  /** 34 px — le défaut. Celui qu'on prend sans réfléchir. */
  md: { ...PILL, minHeight: 34, padding: "8px 16px",  fontSize: TS.body,    gap: 6 },
  /** 40 px — l'action qui conclut un formulaire ou une modale. */
  lg: { ...PILL, minHeight: 40, padding: "11px 20px", fontSize: TS.callout, gap: 8 },
};

/**
 * Bouton d'icône seule : un carré, donc une largeur ÉGALE à la hauteur de la
 * taille correspondante. Sans cette table, un bouton d'icône se retrouve plus
 * étroit ou plus large que le bouton texte d'à côté et la barre d'outils
 * ondule.
 */
export const BTN_ICON: Record<"sm" | "md" | "lg", { width: number; height: number; borderRadius: string }> = {
  sm: { width: 28, height: 28, borderRadius: "50%" },
  md: { width: 34, height: 34, borderRadius: "50%" },
  lg: { width: 40, height: 40, borderRadius: "50%" },
};
