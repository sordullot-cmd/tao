/**
 * Couleurs des évènements d'agenda (colorId Google 1–11).
 *
 * Les onze emplacements sont ceux de Google — l'API ne connaît que des
 * `colorId`, et un évènement créé ici doit rester modifiable depuis Google
 * Agenda. Les TEINTES, elles, sont celles de la charte (`HUE`, cf.
 * lib/ui/palette) : les hex de Google étaient les seules couleurs de l'app à
 * n'appartenir à aucune palette maison, et l'agenda détonnait au milieu du
 * reste de la section Vie perso.
 *
 * Ce que ça coûte, et qui est assumé : un évènement n'a plus exactement la même
 * couleur ici et dans l'app Google. Le NOM de l'emplacement est conservé
 * (« Banane » reste le jaune, « Tomate » le rouge), donc le repère tient ;
 * c'est la nuance qui change.
 *
 * ── Pourquoi trois valeurs par emplacement ────────────────────────────────
 * Un bloc d'évènement pose trois choses : un fond, un trait vertical et du
 * texte. Ces trois valeurs étaient DÉRIVÉES de la teinte au rendu
 * (`lighten(…, 0.38)`, `darken(…, 0.5)`), ce que la charte interdit — « chaque
 * couleur posée à l'écran est une couleur publiée ». Elles sont donc calculées
 * une fois pour toutes et écrites ici, à la méthode de `CHIP` : le fond ramené
 * à une clarté choisie (`toLuminance`), l'encre descendue dans la même teinte
 * jusqu'à 4,5:1 sur ce fond (`inkOn`), le trait assombri juste assez pour
 * exister sur le plus clair des fonds qu'il côtoie (`deepen` à 0,28 plutôt que
 * son défaut de 0,30 : au défaut, le trait d'une tâche tombait à 2,89:1 sur son
 * propre fond, sous le seuil des éléments graphiques — WCAG 1.4.11).
 *
 * Dix des onze teintes sont celles de `CATEGORY_PALETTE` (lib/lifeRpgCategories),
 * et pas seulement des voisines prises dans la charte : les deux vivent dans la
 * même section, et une tâche Vie RPG posée dans l'agenda doit y retrouver la
 * couleur EXACTE de sa catégorie, pas l'approximation la moins fausse que
 * `nearestGcalColorId` savait rendre. Le vert foncé (Basilic) est le seul cran
 * en plus — il n'a pas de correspondant côté catégories.
 *
 * Les clartés de fond ne sont PAS toutes égales, contrairement à `CHIP`. Onze
 * emplacements pour six familles de teintes, ça fait des paires (deux verts,
 * deux bleus, deux violets, deux rouges, deux jaunes) : ramenées à la même
 * clarté, les deux moitiés d'une paire deviennent le même pastel — Flamant et
 * Tomate tombaient exactement sur la même valeur. Le membre clair de chaque
 * paire vise donc 0,86 de luminance et le membre foncé 0,74 (0,89 pour le
 * gris), ce qui les sépare mieux que les couleurs d'origine (distance minimale
 * entre fonds : 7,4 contre 5,5 avant).
 *
 * Ces clartés sont HAUTES à dessein. Un premier jeu visait 0,82 / 0,68 : les
 * contrastes tenaient et les emplacements se séparaient mieux encore, mais une
 * journée pleine devenait un mur d'aplats — la grille se lisait comme une
 * mosaïque au lieu d'un fond sur lequel des blocs sont posés. La teinte doit
 * s'apercevoir, pas s'imposer ; ce qui reste des dix points de luminance rendus
 * suffit à nommer la couleur, et le trait dit le reste.
 *
 * `soft` pousse la même logique à son terme : ~0,95 de luminance pour TOUS les
 * emplacements — à peine autre chose que du blanc — et sans chercher à ce que
 * les onze restent distincts entre eux. C'est le fond des tâches et des
 * évènements passés, deux choses qui doivent se tenir derrière ce qui reste à
 * faire. Ce qui les identifie, c'est leur trait et, pour une tâche, son rond de
 * complétion — pas leur fond.
 */

import { HUE } from "@/lib/ui/palette";

/**
 * La teinte PLEINE de chaque emplacement — pastille du sélecteur de couleur, et
 * référence de `nearestGcalColorId`. Ce n'est jamais elle qu'on pose comme fond
 * de bloc : pour ça, voir `GCAL_EVENT`.
 */
export const GCAL_COLORS: Record<string, string> = {
  1: HUE.beetle,     // Lavande
  2: HUE.owl,        // Sauge
  3: HUE.betta,      // Raisin
  4: HUE.flamingo,   // Flamant
  5: HUE.bee,        // Banane
  6: HUE.fox,        // Tangerine
  7: HUE.macaw,      // Paon
  8: HUE.wolf,       // Graphite
  9: HUE.humpback,   // Myrtille
  10: HUE.treeFrog,  // Basilic
  11: HUE.cardinal,  // Tomate
};

/** Couleur par défaut (évènement sans colorId) : l'emplacement 1. */
export const DEFAULT_EVENT_COLOR = GCAL_COLORS[1];

/** Les trois rôles d'un bloc d'évènement, plus le fond atténué des tâches. */
export type EventPaint = {
  /** Fond du bloc. Opaque : il masque les lignes d'heures de la grille. */
  bg: string;
  /** Fond d'une tâche, et d'un évènement passé : la teinte à peine posée. */
  soft: string;
  /** Trait vertical à gauche du bloc. C'est lui qui porte l'identité. */
  accent: string;
  /** Texte du bloc, ≥ 4,5:1 sur `bg` comme sur `soft`. */
  ink: string;
};

/** Le jeu complet, par colorId. Valeurs publiées : rien n'est calculé au rendu. */
export const GCAL_EVENT: Record<string, EventPaint> = {
  1:  { bg: "#F7EBFF", soft: "#FCF8FF", accent: "#B572E0", ink: "#8756A7" },
  2:  { bg: "#E0F6D0", soft: "#F4FBEE", accent: "#449E02", ink: "#347902" },
  3:  { bg: "#E5DCF3", soft: "#FAF9FD", accent: "#9069CD", ink: "#694D96" },
  4:  { bg: "#FFE9E9", soft: "#FFF8F8", accent: "#AD7979", ink: "#875F5F" },
  5:  { bg: "#FFEEB2", soft: "#FFF9E5", accent: "#AD8800", ink: "#7A5F00" },
  6:  { bg: "#FFDAA4", soft: "#FFF9EF", accent: "#C57400", ink: "#875000" },
  7:  { bg: "#DBF2FE", soft: "#F2FAFE", accent: "#1688BE", ink: "#1373A1" },
  8:  { bg: "#F2F2F2", soft: "#F9F9F9", accent: "#777777", ink: "#6B6B6B" },
  9:  { bg: "#D2E1F3", soft: "#F7F9FD", accent: "#2B70C9", ink: "#235BA3" },
  10: { bg: "#D1E6B8", soft: "#F7FBF2", accent: "#4D9300", ink: "#3A6E00" },
  11: { bg: "#FFD6D6", soft: "#FFF8F8", accent: "#FF4B4B", ink: "#A73232" },
};

/** Le jeu de l'emplacement 1, servi à tout ce qui n'a pas de colorId. */
export const DEFAULT_EVENT_PAINT = GCAL_EVENT[1];

/**
 * Le jeu d'une TÂCHE à laquelle on n'a pas choisi de couleur.
 *
 * Une tâche sans couleur ne devrait rien affirmer : lui servir l'emplacement 1
 * la teintait de lavande, une couleur qu'on n'a pas demandée et qui la faisait
 * passer pour un évènement classé. Elle est donc neutre — le fond le plus clair
 * de la charte, à peine détaché de la carte (1,07:1), et c'est le trait qui la
 * délimite.
 *
 * Valeurs prises dans la famille grise de `HUE`, aucune couleur inventée, et
 * les deux contraintes du fichier sont tenues : trait ≥ 3:1 sur la carte
 * (`wolf` : 4,48:1) et encre ≥ 4,5:1 sur le fond (`eel` sur `polar` : 8,14:1).
 * `hare` conviendrait mieux au trait à l'œil, mais tombe à 2,19:1 — invisible
 * pour qui distingue mal les gris.
 */
export const TASK_DEFAULT_PAINT: EventPaint = {
  bg: HUE.swan,     // #E5E5E5
  soft: HUE.polar,  // #F7F7F7 — le fond réellement posé sur une tâche
  accent: HUE.wolf, // #777777
  ink: HUE.eel,     // #4B4B4B
};

/**
 * Le jeu d'un évènement. `colorId` absent → emplacement par défaut : un agenda
 * ABONNÉ (l'emploi du temps universitaire) n'en donne pas, et ses évènements
 * seraient sinon incolores.
 */
export function eventPaint(colorId?: string | number | null): EventPaint {
  return (colorId != null && GCAL_EVENT[String(colorId)]) || DEFAULT_EVENT_PAINT;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return null;
  const n = parseInt(full, 16);
  if (isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Le colorId (1–11) dont la teinte est la plus proche d'une couleur arbitraire
 * (distance RGB pondérée perceptuellement). Sert à donner à une tâche la
 * couleur de sa catégorie Vie RPG lorsqu'elle est posée dans l'agenda.
 *
 * Le rapprochement est devenu presque exact : les catégories Vie RPG puisent
 * dans `CATEGORY_PALETTE`, donc dans la même charte que les onze emplacements.
 * Avant, une catégorie verte tombait sur le vert de Google, voisin mais autre.
 */
export function nearestGcalColorId(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "1";
  let best = "1", bestD = Infinity;
  for (const [id, h] of Object.entries(GCAL_COLORS)) {
    const c = hexToRgb(h);
    if (!c) continue;
    const d = 0.3 * (rgb.r - c.r) ** 2 + 0.59 * (rgb.g - c.g) ** 2 + 0.11 * (rgb.b - c.b) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
