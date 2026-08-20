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
 * ── UNE seule métrique ────────────────────────────────────────────────────
 * Tous les boutons font **34 px de haut** et **16 px de marge de chaque côté
 * du texte** — les valeurs du bouton « Créer une stratégie », prises comme
 * référence. Les trois paliers d'avant se distinguaient par leur hauteur puis
 * par leur respiration : dans les deux cas la nuance était lisible ici, pas à
 * l'écran, où elle ne produisait qu'un bouton plus court ou plus serré que son
 * voisin sans qu'on sache pourquoi.
 *
 * Les clés `sm` / `md` / `lg` survivent pour ne pas casser leurs appels ; elles
 * rendent la même métrique. Seul `lg` garde son texte d'un cran au-dessus, pour
 * l'action qui conclut une modale.
 *
 * `minHeight` autant que le padding : sans lui, deux boutons voisins dont l'un
 * porte une icône et l'autre non ne font pas la même hauteur, parce que la
 * hauteur de ligne du texte diffère de celle du glyphe.
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

/** La hauteur, commune à tous les boutons. Un bouton du site fait ça, point. */
export const BTN_HEIGHT = 34;
/** La marge interne, commune elle aussi : 8 px au-dessus, 16 px de chaque côté. */
export const BTN_PADDING = "8px 16px";

export const BTN: Record<"sm" | "md" | "lg", ButtonMetrics> = {
  /** Ligne de tableau, barre d'outils dense. */
  sm: { ...PILL, minHeight: BTN_HEIGHT, padding: BTN_PADDING, fontSize: TS.body,    gap: 6 },
  /** Le défaut. Celui qu'on prend sans réfléchir. */
  md: { ...PILL, minHeight: BTN_HEIGHT, padding: BTN_PADDING, fontSize: TS.body,    gap: 6 },
  /** L'action qui conclut un formulaire ou une modale — seul son texte diffère. */
  lg: { ...PILL, minHeight: BTN_HEIGHT, padding: BTN_PADDING, fontSize: TS.callout, gap: 6 },
};

/**
 * Bouton d'icône seule : un carré, donc une largeur ÉGALE à la hauteur de la
 * taille correspondante. Sans cette table, un bouton d'icône se retrouve plus
 * étroit ou plus large que le bouton texte d'à côté et la barre d'outils
 * ondule.
 */
export const BTN_ICON: Record<"sm" | "md" | "lg", { width: number; height: number; borderRadius: string }> = {
  sm: { width: BTN_HEIGHT, height: BTN_HEIGHT, borderRadius: "50%" },
  md: { width: BTN_HEIGHT, height: BTN_HEIGHT, borderRadius: "50%" },
  lg: { width: BTN_HEIGHT, height: BTN_HEIGHT, borderRadius: "50%" },
};
