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
 * jusqu'à 4,5:1 sur ce fond (`inkOn`), le trait ÉCLAIRCI de 38 % vers le blanc.
 *
 * Ce dernier geste est celui de l'ancien rendu, repris tel quel : le trait y
 * était `lighten(teinte, 0.38)`, et c'est cette légèreté qu'on veut retrouver.
 * Il descend donc sous les 3:1 des éléments graphiques (1,33 à 2,51 sur blanc,
 * là où l'ancien allait de 1,33 à 3,38) — un écart à WCAG 1.4.11 assumé, et
 * sans perte d'information : la couleur de l'évènement est AUSSI portée par son
 * texte, dont le contraste est vérifié, lui. Le trait décore et rappelle, il ne
 * porte rien seul. Un `deepen()` conforme a été essayé aux trois jeux
 * précédents et rendait la barre trop dure pour le reste du bloc.
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
 * paire vise donc 0,90 de luminance et le membre foncé 0,82 (0,93 pour le gris).
 *
 * Ces clartés sont HAUTES, et elles ont été montées deux fois. Les premiers jeux
 * visaient 0,82 / 0,68 puis 0,86 / 0,74 : les contrastes tenaient et les
 * emplacements se séparaient mieux, mais une journée pleine devenait un mur
 * d'aplats — la grille se lisait comme une mosaïque au lieu d'un fond sur lequel
 * des blocs sont posés. Les valeurs retenues retrouvent la légèreté qu'avait
 * l'ancien rendu, où la teinte n'était posée qu'à 20 % sur du blanc (ses fonds
 * s'étalaient de 0,78 à 0,95 de luminance, pour une moyenne de 0,86).
 *
 * Ce que ça coûte : les fonds ne se distinguent plus entre eux que de 5,7 au
 * mieux, soit le niveau de l'ancien rendu. Ce n'est PAS une régression cachée,
 * c'est le choix assumé — un voile de couleur ne peut pas à la fois s'effacer et
 * trancher. Ce qui identifie l'emplacement, c'est le trait de gauche, dont le
 * contraste est vérifié, lui, contre les deux fonds qu'il côtoie.
 *
 * `soft` pousse la même logique à son terme : ~0,93 de luminance pour TOUS les
 * emplacements — presque du blanc — et sans chercher à ce que les onze restent
 * distincts entre eux. (0,965 avait été essayé : les tâches y devenaient
 * franchement blanches, au point qu'on ne devinait plus leur couleur du tout.
 * Graphite descend son `bg` à 0,91 pour la même raison : à 0,93, son fond de
 * tâche le rattrapait exactement.) C'est le fond des tâches et des
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
  1:  { bg: "#F9F0FF", soft: "#FBF5FF", accent: "#E1B2FF", ink: "#8756A7" },
  2:  { bg: "#EAF8DF", soft: "#F0FBE9", accent: "#97DF62", ink: "#347902" },
  3:  { bg: "#EDE7F7", soft: "#F8F6FC", accent: "#BAA2E0", ink: "#7556A7" },
  4:  { bg: "#FFF0F0", soft: "#FFF5F5", accent: "#FFCFCF", ink: "#875F5F" },
  5:  { bg: "#FFF4CA", soft: "#FFF8DC", accent: "#FFDD61", ink: "#876A00" },
  6:  { bg: "#FFE7C4", soft: "#FFF6E9", accent: "#FFBE61", ink: "#965900" },
  7:  { bg: "#E6F6FE", soft: "#EDF9FE", accent: "#72CEF9", ink: "#1373A1" },
  8:  { bg: "#F5F5F5", soft: "#F6F6F6", accent: "#ABABAB", ink: "#6B6B6B" },
  9:  { bg: "#E1EAF7", soft: "#F4F8FC", accent: "#7CA6DE", ink: "#2765B5" },
  10: { bg: "#E0EECF", soft: "#F3F9ED", accent: "#97C861", ink: "#3A6E00" },
  11: { bg: "#FFE3E3", soft: "#FFF5F5", accent: "#FF8F8F", ink: "#BA3737" },
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
