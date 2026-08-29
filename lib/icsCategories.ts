/**
 * Couleur d'un cours selon son type (CM, TD, examen, séance annulée…).
 *
 * Une couleur par flux ne dit rien d'utile : tout l'emploi du temps est de la
 * même teinte. Ce qu'on cherche des yeux dans une semaine, c'est « où sont mes
 * TP », « quand est le partiel », « qu'est-ce qui saute aujourd'hui » — d'où la
 * couleur portée par le TYPE de séance.
 *
 * La palette réutilisée est celle de Google Agenda (`GCAL_COLORS`) plutôt qu'une
 * palette maison : les cours voisinent avec des évènements Google dans la même
 * grille, deux gammes différentes se verraient.
 *
 * Les règles ci-dessous ont été calées sur le vocabulaire réel d'un export ADE
 * (université d'Angers) : « TD à distance », « TD (récup) », « Interruption des
 * cours », « Contrôle continu »… Un vocabulaire d'établissement inconnu retombe
 * sur `autre` plutôt que d'être mal rangé.
 */

import { GCAL_COLORS } from "@/lib/gcalColors";

/**
 * Type de base d'une séance. Les variantes d'un même type (« TD à distance »,
 * « TD Hybrides », « TD (récup) ») se rangent sous leur type parent : on veut
 * repérer SES TD d'un coup d'œil, et l'intitulé porte déjà la nuance.
 */
export type CourseKind =
  | "annule" | "pause" | "examen" | "revisions" | "soutien"
  | "cm" | "td" | "tp" | "projet" | "stage" | "reunion" | "autre";

/**
 * Minuscules sans accents. Indispensable AVANT toute règle : `\b` s'appuie sur
 * `[A-Za-z0-9_]`, donc il n'existe pas de frontière de mot après un « é ».
 * `/\bannulé\b/` ne filtrait pas « TD annulé », et `/\bférié\b/` ratait
 * « Férié » — les séances annulées gardaient la couleur d'un cours normal.
 */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Ordre significatif : la première règle qui filtre l'emporte. Motifs en ASCII : l'entrée est normalisée. */
const RULES: { kind: CourseKind; test: RegExp }[] = [
  // En tout premier : une séance annulée est d'abord une séance annulée. Lui
  // laisser la couleur d'un TD normal, c'est se déplacer pour rien.
  { kind: "annule", test: /\b(annulee?s?|supprimee?s?|reportee?s?)\b/ },
  // Avant toute règle mentionnant « cours » : « Interruption des cours » est une
  // absence de cours, pas un cours magistral.
  { kind: "pause", test: /\b(feriee?s?|vacances|interruption|pause|fermeture|conges?)\b/ },
  // Les évaluations avant les types de séance : un « contrôle continu CM » est
  // d'abord un contrôle. La soutenance y est rattachée — c'est une évaluation.
  { kind: "examen", test: /\b(examens?|partiels?|controles?|evaluations?|rattrapage|colle|soutenances?|jury)\b/ },
  { kind: "revisions", test: /\b(revisions?|consultation\s+de\s+copies|corrections?)\b/ },
  { kind: "soutien", test: /\b(tutorat|remediation|soutien|accompagnement)\b/ },
  { kind: "stage", test: /\b(stages?|alternance|immersion)\b/ },
  { kind: "projet", test: /\b(projets?|ateliers?|sae)\b/ },
  { kind: "reunion", test: /\b(reunions?|conferences?|rentree|evenements?|temps\s+fort|accueil|forum)\b/ },
  // « TP » avant « TD » : un « TP/TD » relève du travail en salle machine.
  { kind: "tp", test: /\b(tp|travaux\s+pratiques)\b/ },
  { kind: "td", test: /\b(td|travaux\s+diriges)\b/ },
  { kind: "cm", test: /\b(cm|cours\s+magistral|cours)\b/ },
];

/**
 * Couleur (colorId Google) par type. `pause` et `annule` partagent le gris :
 * sémantiquement, les deux disent « rien à faire », et cela laisse les teintes
 * franches à ce qui demande réellement d'être là.
 */
const KIND_COLOR_ID: Record<CourseKind, string> = {
  cm: "5",         // Banane
  td: "2",         // Sauge
  tp: "7",         // Paon
  examen: "11",    // Tomate — la seule teinte qui doit sauter aux yeux
  revisions: "6",  // Tangerine
  soutien: "9",    // Myrtille — libérée par les CM, passés au jaune
  reunion: "3",    // Raisin
  projet: "4",     // Flamant
  stage: "10",     // Basilic
  pause: "8",      // Graphite
  annule: "8",     // Graphite
  autre: "1",      // Lavande, couleur par défaut des évènements
};

/** Libellés lisibles, pour une légende. */
export const KIND_LABELS: Record<CourseKind, string> = {
  cm: "Cours magistral",
  td: "Travaux dirigés",
  tp: "Travaux pratiques",
  examen: "Examen",
  revisions: "Révisions",
  soutien: "Tutorat",
  reunion: "Réunion",
  projet: "Projet",
  stage: "Stage",
  pause: "Pas de cours",
  annule: "Annulé",
  autre: "Autre",
};

/**
 * Déduit le type d'une séance. `category` (champ `Catégorie` d'un export ADE)
 * prime sur l'intitulé : elle est normalisée par l'établissement, là où un
 * intitulé de matière peut contenir n'importe quel mot — « Introduction au
 * droit du travail » n'est pas un TP, et « Histoire des projets urbains »
 * n'est pas un projet.
 */
export function courseKind(category?: string, summary?: string): CourseKind {
  for (const source of [category, summary]) {
    if (!source) continue;
    const n = normalize(source);
    for (const { kind, test } of RULES) if (test.test(n)) return kind;
  }
  return "autre";
}

/** Couleur hex d'une séance, selon son type. */
export function courseColor(category?: string, summary?: string): string {
  return GCAL_COLORS[KIND_COLOR_ID[courseKind(category, summary)]];
}

/** colorId Google équivalent — pour les traitements qui raisonnent en identifiants. */
export function courseColorId(category?: string, summary?: string): string {
  return KIND_COLOR_ID[courseKind(category, summary)];
}
