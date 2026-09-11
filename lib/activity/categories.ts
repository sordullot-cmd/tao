/**
 * Catégories d'activité et classement automatique app → catégorie.
 *
 * C'est le vocabulaire de la section « Activité » : chaque seconde mesurée sur
 * le poste tombe dans UNE catégorie, et chaque catégorie porte un jugement
 * (`productivity`) qui sert à séparer le temps utile du temps subi.
 *
 * Les couleurs viennent de lib/ui/palette : ce sont des couleurs d'IDENTITÉ
 * (une catégorie, comme une classe d'actif), donc des hex qui ne bougent pas
 * avec le thème — deux catégories voisines doivent rester distinguables.
 *
 * ── Comment le classement décide ──────────────────────────────────────────
 * Le SAVOIR (quelles apps, quels sites) vit dans lib/activity/catalog. Ici vit
 * la DÉCISION, et elle est ordonnée par fiabilité décroissante :
 *
 *   1. une règle de l'utilisateur — elle gagne toujours, c'est le principe ;
 *   2. le domaine lu dans le titre d'un navigateur (« youtube.com ») ;
 *   3. le nom d'application reconnu à l'identique (« leagueclient ») ;
 *   4. un mot du nom d'application (« Adobe Photoshop 2024 ») ;
 *   5. un nom de site reconnu dans le titre (« … — YouTube ») ;
 *   6. rien de reconnu — et là, deux réponses selon la surface :
 *        • dans un navigateur, c'est de la NAVIGATION. Une page inconnue n'est
 *          pas une anomalie à corriger, c'est ce que naviguer veut dire ;
 *        • ailleurs, « Non classé », avec un NOM propre, pour qu'un clic suffise
 *          à ranger l'application.
 *
 * Chaque décision garde sa raison (`via`) : la page « Catégories & règles »
 * l'affiche, et un classement qu'on ne peut pas expliquer ne se corrige pas.
 */

import { PALETTE, PALETTE_DARK, PALETTE_LIGHT, GREY } from "@/lib/ui/palette";
import { getLang } from "@/lib/i18n";
import {
  CATALOG, cleanBrowserTitle, domainInTitle, guessSiteName, isBrowserApp, matchAppExact,
  matchAppWord, matchDomain, matchTitle, norm, type CatalogEntry, type CatalogHit,
} from "@/lib/activity/catalog";
import { SELF_SECTIONS, sectionName, selfTitleOf, type SelfSection } from "@/lib/activity/self";

export type Productivity = "productive" | "neutral" | "distracting";

/**
 * Couleur des trois natures de temps — SOURCE UNIQUE.
 *
 * Elle était recopiée dans les trois pages « Activité » : un vert, un gris, un
 * rouge écrits à la main partout, si bien qu'en changer un demandait de les
 * retrouver tous. Ce qui suit est le seul endroit à modifier.
 *
 * Le choix des teintes n'est pas décoratif :
 *
 *   • PRODUCTIF en BLEU CLAIR, et non en vert. Le vert de cette charte est
 *     celui de la marque et de la réussite — il félicite. Or une heure
 *     productive n'est pas une récompense, c'est une mesure : le bleu la
 *     rapporte sans la commenter, et rend le vert à ce qu'il désigne ailleurs
 *     (un objectif atteint, une progression).
 *   • NEUTRE en GRIS PÂLE. Le gris moyen d'avant pesait autant à l'œil que les
 *     deux autres, alors qu'il désigne précisément le temps qui ne se juge pas.
 *     Pâle, il recule — ce qui est exactement ce qu'on veut lui voir faire.
 *   • DISTRACTION en ORANGE plutôt qu'en rouge franc. Le rouge de la charte est
 *     celui des pertes et des erreurs ; une demi-heure de vidéo n'est ni l'un
 *     ni l'autre. L'orange alerte sans accuser, et c'est ce qui fait qu'on
 *     regarde le chiffre au lieu de fermer la page.
 */
export const PRODUCTIVITY_COLOR: Record<Productivity, string> = {
  productive: PALETTE_LIGHT.blue,
  neutral: GREY.grey300,
  distracting: PALETTE.orange,
};

export interface ActivityCategory {
  id: string;
  label: string;
  labelEn: string;
  color: string;
  productivity: Productivity;
  /** Une phrase : ce qui entre dans cette catégorie, et ce qui n'y entre pas. */
  hint: string;
}

/**
 * Sept catégories, et une file d'attente.
 *
 * ── Pourquoi si peu ──────────────────────────────────────────────────────
 * Il y en avait quatorze, et c'était trop pour deux raisons qui se voient à
 * l'écran. D'abord la LECTURE : quatorze parts dans un anneau de 188 px, ce ne
 * sont plus des parts, ce sont des traits. Ensuite, et surtout, le CLASSEMENT :
 * plus une frontière est fine, plus elle se trace mal. « Écriture » et « Admin »
 * séparaient Notion de Google Docs ; « Recherche » et « Développement »
 * séparaient la doc React de l'éditeur qui l'utilise. Une même heure de travail
 * ressortait donc en quatre lignes, dont aucune ne pesait assez pour se voir.
 *
 * Les frontières qui restent sont celles qu'on peut défendre devant l'écran :
 * ce qui produit du code, ce qui regarde les marchés, ce qui produit autre
 * chose, ce qu'on traverse, ce qui parle, ce qui accompagne, ce qui remplace.
 *
 * ── « Navigation », la catégorie qui manquait ────────────────────────────
 * C'est la nouveauté, et elle répond au plus gros défaut de mesure : un onglet
 * que le catalogue ne reconnaît pas ne tombe plus dans « Non classé ». Ouvrir
 * vingt pages dans une journée n'est pas une anomalie à corriger une par une —
 * c'est ce que naviguer veut dire. « Non classé » ne reçoit donc plus QUE des
 * applications de bureau inconnues, ce qui en fait de nouveau une file courte,
 * qu'on vide.
 *
 * Neutre, et c'est délibéré : ranger le web inconnu du côté productif gonflerait
 * le temps de focus de tout ce qu'on n'a pas su nommer — un suivi ne doit pas se
 * flatter. Du côté distraction, il accuserait une recherche de documentation.
 * Entre les deux, il compte le temps sans le juger.
 */
export const BUILTIN_CATEGORIES: ActivityCategory[] = [
  { id: "dev",      label: "Développement",     labelEn: "Development",   color: PALETTE.blue,        productivity: "productive",  hint: "Éditeurs, terminaux, dépôts, documentation technique." },
  { id: "trading",  label: "Trading & marchés", labelEn: "Trading",       color: PALETTE.green,       productivity: "productive",  hint: "Plateformes, graphiques, journal de trades, prop firms. Les vidéos qui en parlent comptent dans « Apprentissage »." },
  /* « Travail » absorbe l'écriture, les tableurs, l'agenda, la création, les
     fichiers et la lecture de fond. Ces six-là se distinguaient mal et se
     mélangeaient tout le temps : un même document passait de « Écriture » à
     « Admin » selon qu'il était ouvert dans Notion ou dans Docs. */
  { id: "work",     label: "Travail",           labelEn: "Work",          color: PALETTE.purple,      productivity: "productive",  hint: "Écriture, tableurs, agenda, création, fichiers, cours et lecture de fond." },
  /* L'apprentissage a sa ligne, et il la prend à « Divertissement » plus qu'à
     « Travail » : ce qu'on regarde pour apprendre arrivait dans « Réseaux
     sociaux » avec le reste de YouTube, si bien qu'une heure de cours de
     communication et une heure de fil comptaient au même endroit — l'une au
     débit de la journée alors qu'elle en fait le crédit.
     Les plateformes de cours (Coursera, Anki, Duolingo…) restent dans
     « Travail » : ce sont des séances qu'on ouvre exprès, pas des vidéos qui
     passent, et les déplacer emporterait tout l'historique avec elles. */
  { id: "learning", label: "Apprentissage",      labelEn: "Learning",      color: PALETTE_DARK.blue,   productivity: "productive",  hint: "Ce qu'on regarde pour apprendre : trading, communication, psychologie, philosophie, études, tutoriels." },
  { id: "browsing", label: "Navigation",        labelEn: "Browsing",      color: PALETTE.brown,       productivity: "neutral",     hint: "Le web qu'on traverse : moteurs de recherche, achats, pages non reconnues." },
  { id: "comms",    label: "Communication",     labelEn: "Communication", color: PALETTE.yellow,      productivity: "neutral",     hint: "Messageries, courrier, visioconférence." },
  /* La musique reste à part : elle ACCOMPAGNE le travail au lieu de le
     remplacer, et une heure de Spotify comptée en distraction pendant qu'on
     code fausse la lecture de la journée. */
  { id: "music",    label: "Musique",           labelEn: "Music",         color: PALETTE_DARK.orange, productivity: "neutral",     hint: "Écoute de musique : Spotify, Apple Music, Deezer, SoundCloud, clips et albums sur YouTube." },
  /* Les réseaux méritent leur ligne, séparée du reste du divertissement : un
     film se choisit et se termine, un fil ne se termine jamais. Les confondre
     donnait un total dont on ne pouvait rien faire — c'est précisément la part
     qu'on veut voir isolée. YouTube en fait partie : on y arrive pour une
     vidéo, on y reste pour la suivante. */
  { id: "social",   label: "Réseaux sociaux",   labelEn: "Social media",  color: PALETTE.red,         productivity: "distracting", hint: "Fils sociaux, communautés, YouTube — hors vidéos d'apprentissage (trading compris) et clips musicaux, comptés à part." },
  { id: "fun",      label: "Divertissement",    labelEn: "Entertainment", color: PALETTE_DARK.purple, productivity: "distracting", hint: "Vidéo, séries, jeux, sport." },
  /* L'app elle-même, et NEUTRE — c'est le point délicat.
     Écrire son journal est du travail, personne n'en doute. Mais un suivi qui
     compte son propre écran comme du temps productif se flatte : chaque minute
     passée à le consulter améliorerait le score qu'il affiche, et le chiffre
     cesserait de vouloir dire quelque chose. Neutre, il compte ce temps sans le
     porter à son crédit. Qui n'est pas d'accord le passe en productif d'un clic
     dans « Catégories & règles » — c'est un jugement, il appartient à
     l'utilisateur, pas au code qui le mesure. */
  { id: "tao",      label: "tao trade",         labelEn: "tao trade",     color: PALETTE.pink,        productivity: "neutral",     hint: "Le temps passé dans cette app : journal, relecture, réglages." },
  { id: "other",    label: "Non classé",        labelEn: "Uncategorized", color: GREY.grey500,        productivity: "neutral",     hint: "Les applications de bureau que l'app n'a pas su reconnaître. À ranger en un clic." },
];

/**
 * Les catégories d'avant, et où leur temps s'en va.
 *
 * Une version qui renomme son vocabulaire doit emporter ce qui était écrit
 * dedans, sinon la refonte se paie en journal illisible : les RÈGLES de
 * l'utilisateur pointent vers ces identifiants, et l'historique aussi. Sans
 * cette table, une règle « ce site → Recherche » cesserait de ranger quoi que ce
 * soit du jour au lendemain, sans un mot.
 *
 * Elle est traversée par `settle`, donc par tout le classement : rien ne peut
 * la contourner.
 */
const MOVED: Record<string, string> = {
  writing: "work",
  design: "work",
  research: "work",
  admin: "work",
  utilities: "work",
  meetings: "comms",
  shopping: "browsing",
  games: "fun",
};

/** Catégorie des pages web que le catalogue ne reconnaît pas. */
export const BROWSING = "browsing";

export const OTHER = "other";

/** Cette app elle-même — la seule entrée du catalogue qui se découpe (cf. `SELF_SECTIONS`). */
export const SELF = "tao";

/* ─── Les catégories de CET utilisateur ──────────────────────────────────
   Les quatorze ci-dessus sont un point de départ, pas une liste fermée : le
   vocabulaire d'une journée appartient à celui qui la mesure. Il peut en
   renommer une (« Trading & marchés » → « Marchés »), la recolorer, en créer
   (« Cours », « Musculation »), et décider de la nature de chacune.

   ── Pourquoi un registre de module et non un contexte React ─────────────
   `categoryLabel(id)` et `categoryColor(id)` sont appelés depuis une trentaine
   d'endroits qui ne connaissent qu'un identifiant de catégorie : une liste de
   pavés, une pastille en direct, une ligne de session. Les faire tous passer
   par un contexte demanderait de traverser sept composants avec une prop qui
   ne les concerne pas. Le registre est donc ici, et `useActivitySettings` le
   met à jour PENDANT le rendu, avant que quoi que ce soit ne l'ait lu — l'écrire
   est idempotent (mêmes réglages, même registre), ce qui le rend sûr à relire
   plusieurs fois.
   --------------------------------------------------------------------- */

/** Ce que l'utilisateur change sur une catégorie livrée avec l'app. */
export interface CategoryEdit {
  label?: string;
  color?: string;
  /**
   * Catégorie retirée du vocabulaire.
   *
   * On ne l'efface pas de la liste des livrées : le catalogue continue d'y
   * ranger des centaines d'applications, et il faut pouvoir la RÉTABLIR. Elle
   * disparaît de l'interface, et ce qu'elle classait retourne à « Non classé »
   * (cf. `settle` plus bas) — donc dans la file, où l'utilisateur lui donnera la
   * catégorie qu'il préfère.
   */
  hidden?: boolean;
}

/** Une catégorie créée de toutes pièces. */
export interface CustomCategory {
  id: string;
  label: string;
  color: string;
}

interface CategorySettings {
  customCategories?: CustomCategory[] | null;
  categoryEdits?: Record<string, CategoryEdit> | null;
  categoryOrder?: string[] | null;
}

let REGISTRY: ActivityCategory[] = BUILTIN_CATEGORIES;
let BY_ID: Record<string, ActivityCategory> = Object.fromEntries(
  BUILTIN_CATEGORIES.map(c => [c.id, c])
);
/** Empreinte des réglages déjà appliqués : reconstruire à chaque rendu est inutile. */
let SIGNATURE = "";

/**
 * Recalcule le registre à partir des réglages. Appelé par `useActivitySettings`.
 *
 * « Non classé » reste en dernier, quoi qu'il arrive : c'est la file d'attente
 * du classement, pas une catégorie parmi d'autres.
 */
export function applyCategorySettings(settings: CategorySettings | null | undefined): void {
  const custom = Array.isArray(settings?.customCategories) ? settings!.customCategories! : [];
  const edits = (settings?.categoryEdits && typeof settings.categoryEdits === "object")
    ? settings.categoryEdits
    : {};
  const order = Array.isArray(settings?.categoryOrder) ? settings!.categoryOrder! : [];
  const signature = JSON.stringify([custom, edits, order]);
  if (signature === SIGNATURE) return;
  SIGNATURE = signature;

  const edited = BUILTIN_CATEGORIES.filter(c => c.id === OTHER || !edits[c.id]?.hidden).map(c => {
    const e = edits[c.id];
    if (!e) return c;
    return {
      ...c,
      label: e.label?.trim() || c.label,
      labelEn: e.label?.trim() || c.labelEn,
      color: e.color || c.color,
    };
  });

  const mine: ActivityCategory[] = custom
    .filter(c => c && typeof c.id === "string" && c.id)
    .map(c => ({
      id: c.id,
      label: c.label || c.id,
      labelEn: c.label || c.id,
      color: c.color || GREY.grey500,
      // La nature d'une catégorie créée se règle comme celle des autres, par
      // `settings.productivity` ; neutre est le seul défaut qui ne présume rien.
      productivity: "neutral" as Productivity,
      hint: "Catégorie que tu as créée.",
    }));

  /* L'ordre de l'utilisateur d'abord ; ce qu'il n'a jamais déplacé garde sa
     place relative derrière (le tri est stable, une catégorie ajoutée par une
     mise à jour ne se retrouve donc pas propulsée en tête). « Non classé » reste
     en dernier quoi qu'il arrive : c'est la file d'attente du classement, pas
     une catégorie parmi les autres. */
  const rank = new Map(order.map((id, i) => [id, i]));
  const withoutOther = [...edited.filter(c => c.id !== OTHER), ...mine]
    .sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6));
  const other = edited.find(c => c.id === OTHER) ?? BUILTIN_CATEGORIES[BUILTIN_CATEGORIES.length - 1];
  REGISTRY = [...withoutOther, other];
  BY_ID = Object.fromEntries(REGISTRY.map(c => [c.id, c]));
}

/** Toutes les catégories : celles de l'app, corrigées, plus celles de l'utilisateur. */
export function allCategories(): ActivityCategory[] {
  return REGISTRY;
}

/** Les catégories qu'on peut CHOISIR (« Non classé » n'est pas un choix). */
export function assignableCategories(): ActivityCategory[] {
  return REGISTRY.filter(c => c.id !== OTHER);
}

export function categoryById(id: string): ActivityCategory | undefined {
  return BY_ID[id];
}

/** Identifiant d'une catégorie créée : stable, lisible, et jamais celui d'une livrée. */
export function newCategoryId(label: string): string {
  const base = norm(label).replace(/ /g, "-").slice(0, 24) || "categorie";
  let id = `u-${base}`;
  let n = 2;
  while (BY_ID[id]) id = `u-${base}-${n++}`;
  return id;
}

/** Libellé de la catégorie dans la langue de l'interface. */
export function categoryLabel(id: string): string {
  const c = BY_ID[id];
  if (!c) return id;
  return getLang() === "en" ? c.labelEn : c.label;
}

export function categoryColor(id: string): string {
  return BY_ID[id]?.color ?? GREY.grey500;
}

export function productivityOf(id: string): Productivity {
  return BY_ID[id]?.productivity ?? "neutral";
}

/**
 * Nature d'une catégorie, surcharges de l'utilisateur comprises.
 *
 * « Réunions » est productif pour l'un et subi pour l'autre ; « Communication »
 * est le métier d'un commercial et une fuite pour un développeur. Le jugement
 * appartient donc à l'utilisateur, et le défaut du code n'est qu'un point de
 * départ.
 */
export function resolveProductivity(
  id: string,
  overrides?: Record<string, Productivity> | null
): Productivity {
  const over = overrides?.[id];
  if (over === "productive" || over === "neutral" || over === "distracting") return over;
  return productivityOf(id);
}

/* ─── Règles de l'utilisateur ────────────────────────────────────────────
   Une règle = un fragment cherché dans le nom de l'app (`app`) ou dans le titre
   de la fenêtre (`title`), et la catégorie qui en découle. Elles passent AVANT
   le catalogue : c'est ce qui rend le classement corrigeable sans toucher au
   code, et sans attendre une mise à jour.
   ---------------------------------------------------------------------- */

export interface ClassifyRule {
  id: string;
  /** Fragment cherché, en minuscules. */
  match: string;
  /**
   * Où le chercher. Par défaut : le nom de l'application.
   *
   * `site` cherche dans l'HÔTE de l'onglet, sous-domaines comprises : une règle
   * sur « spotify.com » couvre `open.spotify.com` comme `accounts.spotify.com`.
   * C'est le seul champ qui range un site d'un seul geste — sur le titre, il
   * faut trouver un mot commun à toutes ses pages, et beaucoup n'en ont aucun.
   */
  field?: "app" | "title" | "site";
  /** Catégorie attribuée. */
  category: string;
}

/**
 * Pose une règle en REMPLAÇANT celle qui visait déjà la même chose.
 *
 * Choisir une catégorie sur une ligne d'activité écrivait une règle de plus à
 * chaque fois : trois hésitations sur la même application laissaient trois
 * règles, dont deux mortes, dans une liste qu'on relit à la main.
 *
 * La nouvelle est posée EN FIN de liste, et pas à la place de l'ancienne :
 * « écrite en dernier = consultée en premier » (cf. `userHit`), donc c'est le
 * seul endroit d'où une correction est sûre de gagner. La remettre à son ancien
 * rang la laisserait perdre contre une règle plus récente qui attrape la même
 * chose — on aurait choisi une catégorie, et rien n'aurait changé.
 */
export function upsertRule(rules: ClassifyRule[], rule: ClassifyRule): ClassifyRule[] {
  const field = rule.field ?? "app";
  const match = (rule.match || "").trim().toLowerCase();
  if (!match) return rules;
  const kept = (rules || []).filter(
    (r) => !(r && (r.field ?? "app") === field && (r.match || "").toLowerCase() === match),
  );
  return [...kept, { ...rule, match, field }];
}

/** Navigateurs : leur titre de fenêtre porte le vrai sujet, pas leur nom. */
export function isBrowser(app: string): boolean {
  return isBrowserApp(app);
}

/* ─── Classement ─────────────────────────────────────────────────────────── */

/** Ce qui a décidé du classement — affiché tel quel dans « Règles ». */
export type ClassifySource = "user" | "web" | "app" | "word" | "title" | "none";

export interface Classification {
  category: string;
  /** Nom à afficher : le site pour un navigateur, l'application sinon. */
  label: string;
  /** Ce qui a décidé. */
  via: ClassifySource;
  /** Le fragment qui a été reconnu (« youtube.com », « leagueclient »…). */
  matched: string | null;
  /** Vrai quand le temps est celui d'un site vu dans un navigateur. */
  isSite: boolean;
  /** 0 à 1 : sert à signaler les classements fragiles, pas à les cacher. */
  confidence: number;
  /** Mobilier du système : nommé, mais jamais proposé au classement. */
  system: boolean;
}

const CONFIDENCE: Record<ClassifySource, number> = {
  user: 1, web: 0.95, app: 0.9, word: 0.75, title: 0.6, none: 0,
};

/**
 * Catégorie servie à l'interface : celle du catalogue si elle existe encore.
 *
 * Deux cas, et un seul passage pour les deux. Une catégorie DÉPLACÉE par une
 * refonte du vocabulaire suit sa destination (cf. `MOVED`) — c'est ce qui fait
 * qu'une règle écrite l'an dernier range encore quelque chose. Une catégorie
 * retirée par l'utilisateur, elle, n'a plus ni nom ni couleur : ses segments
 * deviendraient du temps gris, impossible à lire et impossible à corriger. Ils
 * retournent donc à « Non classé », d'où la file d'attente les rattrape.
 */
function settle(id: string): string {
  const moved = MOVED[id] ?? id;
  return BY_ID[moved] ? moved : OTHER;
}

/* ─── Le sujet, quand le lieu ne suffit pas ──────────────────────────────── */

/**
 * Ce qu'on REGARDE, sur les plateformes qui ne disent que là où l'on est.
 *
 * YouTube est rangé dans « Réseaux sociaux » pour une bonne raison (cf. le
 * catalogue) : on y enchaîne un fil de vidéos suggérées. Mais on y suit aussi
 * des formations, et deux heures d'analyse de graphiques n'ont rien à faire au
 * même endroit que deux heures de fil — c'est même l'inverse exact, l'une est
 * du travail et l'autre de la distraction. Même chose pour un clip qu'on laisse
 * tourner en fond : c'est de la MUSIQUE, elle accompagne au lieu de remplacer,
 * et la compter en distraction fausse la journée exactement comme le ferait une
 * heure de Spotify rangée là. Et même chose, enfin, pour tout ce qu'on regarde
 * pour APPRENDRE — communication, psychologie, philosophie, études, tutoriels :
 * c'est la part de YouTube qu'on avait le plus de raisons de vouloir lire à
 * part, et la seule que le fil rendait invisible. Le titre est la seule chose
 * qui les sépare, alors on le lit.
 *
 * Ces motifs CLASSENT, là où ceux de `CLUES` se contentent de proposer : ils
 * sont donc volontairement étroits — des termes de métier, pas des mots qu'une
 * vidéo quelconque peut porter. « broker » (un bus de messages en
 * développement), « pip » (l'installeur Python) ou « levier » seul en sont
 * absents pour cette raison ; côté musique, « live », « clip » et « mix » seuls
 * sont écartés pour la même — un extrait de jeu est un « clip », un direct
 * n'est pas un concert.
 *
 * Deux mots font exception et sont volontairement LARGES : « trade » et
 * « stratégie ». Pris hors contexte ils appartiennent à tout le monde (une
 * stratégie de jeu, un accord commercial), mais sur les chaînes que suit
 * l'utilisateur de cette app ils ne parlent que de marchés — et rater un
 * « trade recap » pour éviter une vidéo de stratégie Valorant coûte plus cher
 * que l'inverse. Une erreur reste rattrapable de toute façon : une règle de
 * l'utilisateur passe avant tout le reste.
 *
 * Trading et apprentissage arrivent désormais dans la MÊME catégorie — regarder
 * une vidéo de marchés, c'est apprendre, pas trader — mais restent deux sujets
 * distincts : ils portent deux noms, donc deux lignes, et on lit ce qu'on a
 * appris. L'ORDRE, lui, tranche les titres qui parlent de plusieurs (« musique
 * pour trader », « lofi beats to study to ») : le trading d'abord, parce que son
 * vocabulaire est le plus spécialisé — un titre qui le porte parle rarement
 * d'autre chose ; la musique ensuite, parce qu'un morceau qu'on met POUR
 * travailler reste un morceau ; l'apprentissage en dernier, le plus large des
 * trois.
 */
/* Deux chemins mènent à la musique — les mots du titre et sa forme (cf.
   `trackOf`) — et ils doivent donner LE MÊME nom : la page agrège par nom, et
   « YouTube · Musique » écrit deux fois différemment ferait deux lignes. */
const MUSIC_NAME = { fr: "Musique", en: "Music" } as const;

const SUBJECTS: { cat: string; name: string; nameEn: string; re: RegExp }[] = [
  {
    /* Une vidéo de trading part dans « Apprentissage », et non dans « Trading &
       marchés » : on ne trade pas en la regardant, on apprend à trader. La
       catégorie des marchés répond à « combien de temps ai-je passé SUR les
       marchés ? » — y verser les heures de YouTube, c'était répondre à côté, et
       gonfler ce chiffre de tout ce qui n'était que du visionnage.
       Elle garde son NOM à elle (« YouTube · Trading ») : deux noms sous une
       même catégorie tiennent deux lignes, et on continue de lire ce qu'on a
       appris. */
    cat: "learning",
    name: "Trading",
    nameEn: "Trading",
    /* Le titre est normalisé avant le test : sans accent, sans ponctuation
       (« S&P 500 » → « s p 500 », « day-trading » → « day trading »). */
    re: /\b(trading|tradingview|traders?|trades?|trade recaps?|day ?trading|swing trading|scalping|scalper|bourse|boursi(er|ere)s?|forex|marches financiers|analyse technique|technical analysis|price action|order ?flow|order block|fair value gap|fvg|liquidity|wyckoff|smart money|ict|backtest(s|ing|er)?|win ?rates?|strateg(y|ies|ie)|chandeliers?|candlesticks?|take profit|stop loss|risk reward|money management|gestion du risque|drawdown|pips|effet de levier|nasdaq|s ?p ?500|cac 40|dow jones|dax 40|us30|xauusd|eurusd|gbpusd|usdjpy|metatrader|mt4|mt5|ninjatrader|prop ?firms?|compte finance|funded account|ftmo|topstep|fundednext|the5ers|apex trader|cryptos?|cryptomonnaies?|bitcoin|btc|ethereum|altcoins?)\b/,
  },
  {
    cat: "music",
    name: MUSIC_NAME.fr,
    nameEn: MUSIC_NAME.en,
    /* Deux familles, et aucune n'est un genre musical : ce qui identifie un
       morceau, c'est la MISE EN FORME que les chaînes lui collent (« official
       video », « clip officiel », « lyrics », « prod by ») et le format d'écoute
       (« full album », « dj set », « live session »). Les genres, eux, sont des
       mots que n'importe quelle vidéo emprunte — un documentaire sur le rap
       n'est pas de la musique. Une exception, « lofi » : sur ces plateformes il
       ne désigne jamais un sujet, toujours une bande-son qu'on laisse tourner —
       et c'est justement le cas qu'on veut compter en neutre plutôt qu'en
       distraction, puisqu'il accompagne le travail.

       « prod » est pris NU (le titre est normalisé : « (prod. Keyzo) » arrive
       ici en « prod keyzo »). C'est un crédit de producteur, et hors d'un titre
       de morceau le mot ne sert à peu près jamais seul — le risque tient dans
       une « prod » de film ou de serveur, et il pèse moins lourd que le rap
       français entier, dont c'est LA signature de titre. */
    re: /\b(clip officiel|clip musical|clip video|official (music )?video|official audio|audio officiel|official visualizer|lyrics?( video)?|paroles|feat|prod|produced by|remix|mashup|nightcore|slowed( and)? reverb|sped up|bass boosted|8d audio|full album|album complet|mixtape|dj (set|mix)|live session|live performance|en concert|concert live|tiny desk|boiler room|karaoke|acoustic|unplugged|instrumental|lofi|lo fi)\b/,
  },
  {
    /* Ce qu'on regarde pour APPRENDRE — et qui tombait dans « Réseaux sociaux »
       avec le reste de YouTube. C'est l'écart le plus coûteux que laissait la
       mesure : une heure de cours de communication ou de psychologie comptait
       exactement là où compte une heure de fil, c'est-à-dire au débit de la
       journée, alors qu'elle en fait le crédit.

       Le vocabulaire est celui des SUJETS qu'on suit (communication, séduction,
       psychologie, philosophie, études) et celui des FORMATS qui n'existent que
       pour enseigner (cours, tutoriel, conférence, masterclass, documentaire,
       vulgarisation). Les deux ensemble, parce qu'aucun ne suffit : un cours ne
       dit pas toujours de quoi il parle, et un sujet ne dit pas toujours qu'il
       est enseigné.

       Ce qui a été volontairement ÉCARTÉ, et c'est le plus important ici : les
       mots qui ANNONCENT une explication sans rien dire de son sujet. « expliqué »
       range « la fin de Breaking Bad expliquée », « documentaire » range un film
       animalier, « comment faire » une recette, « manipulation » une retouche
       photo, et « conférence » seule une conférence de presse. Tous ramenaient
       du YouTube ordinaire, qui doit rester dans le fil. Même raison pour
       « motivation », « discipline » et « habits » — un montage de sport, une
       vidéo de mode — et pour « ted » nu, puisqu'une série s'appelle Ted.
       Manquer une vidéo se rattrape d'une règle ; en attraper cent, non.

       APRÈS la musique, et c'est le seul ordre qui tienne : « lofi beats to
       study to » est de la musique qu'on laisse tourner PENDANT le travail, pas
       une étude. Et après le trading, qui garde « psychologie du trading ». */
    cat: "learning",
    name: "Apprentissage",
    nameEn: "Learning",
    re: /\b(appren(dre|ds|ez)|apprentissage|appris|learn|learning|tutos?|tutoriels?|tutorials?|cours|lecons?|masterclass|formation|conference(?! de presse)|tedx|ted talks?|ted ed|vulgarisation|revisions?|examens?|concours|etudes?(?! op)|etudier|etudiante?s?|methode de travail|memorisation|anki|communication|prise de parole|art oratoire|oratoire|eloquence|rhetorique|storytelling|public speaking|langage corporel|body language|charisme|charisma|social skills|competences sociales|flirt(er)?|seduction|seduire|drague(r)?|dating|psychologie|psychology|psychologique|therapie|therapy|narcissi(sme|que)|manipulation mentale|emprise|biais cognitifs?|cognitive biases?|intelligence emotionnelle|confiance en soi|estime de soi|self esteem|developpement personnel|personal development|self improvement|mindset|philosophie|philosophy|philosophique|stoicisme|stoicism|stoique|nietzsche|socrate|platon|existentialisme|neurosciences|sociologie)\b/,
  },
];

/** Le sujet annoncé par un titre, s'il en annonce un. */
function subjectOf(title: string): { cat: string; name: string; matched: string } | null {
  const hay = norm(title);
  for (const s of SUBJECTS) {
    const m = hay.match(s.re);
    // Le nom suit la langue de l'interface, comme les libellés de catégorie :
    // « YouTube · Musique » n'aurait aucun sens au milieu d'une page anglaise.
    if (m) return { cat: s.cat, name: getLang() === "en" ? s.nameEn : s.name, matched: m[0] };
  }
  return null;
}

/* ─── La FORME d'un morceau, quand aucun mot ne le dit ───────────────────── */

/**
 * « Artiste - Titre » : la convention que suivent les chaînes qui publient de
 * la musique, et que ne suit à peu près rien d'autre.
 *
 * Les mots de `SUBJECTS` ne rattrapent qu'une partie des clips — ceux dont le
 * titre annonce sa mise en forme (« Clip officiel », « Lyrics »). Tout le reste
 * — la moitié du rap français, la plupart des morceaux qu'on met en fond —
 * n'écrit que le nom de l'artiste, un tiret, le titre, et tombait donc dans le
 * fil, c'est-à-dire au débit de la journée.
 *
 * La forme se lit sur le titre BRUT, pas sur sa version normalisée : c'est le
 * tiret qui porte le sens ici, et `norm` l'efface avec le reste de la
 * ponctuation.
 *
 * Un tel motif attrape par construction plus large qu'un mot de métier — d'où
 * trois garde-fous, dans l'ordre où ils coupent :
 *
 *   • il passe en DERNIER, après les trois sujets. « Nietzsche - le surhomme »
 *     ou « Tutoriel Excel - les bases » sont déjà rangés quand on arrive ici :
 *     un vocabulaire reconnu vaut toujours mieux qu'une forme ;
 *   • un seul tiret, et deux côtés de la taille d'un nom (`TRACK_SIDES`). Une
 *     phrase, une date, une énumération ne passent pas ;
 *   • et la liste de ce qui prend cette forme SANS être un morceau — un
 *     épisode, un trailer, un best of, une question posée au spectateur.
 *
 * Ce qui reste de faux positifs se corrige d'une règle, comme le reste du
 * classement ; ce qui était perdu ne se rattrapait pas.
 */
const TRACK_SEP = /\s+[-–—]\s+/;

/**
 * La taille des deux côtés — et ils ne sont pas symétriques : un nom d'artiste
 * est COURT, presque toujours un ou deux mots, jamais une proposition. C'est ce
 * qui sépare « Ninho - Lettre à une femme » d'une phrase coupée par un tiret
 * (« Les 10 astuces pour mieux dormir - la science le dit »).
 */
const TRACK_SIDES = [{ words: 4, chars: 30 }, { words: 7, chars: 45 }];

/**
 * Ce qui, d'un côté ou de l'autre, dit que ce n'est pas un morceau.
 *
 * Des FORMATS (épisode, trailer, best of, unboxing), et l'adresse au
 * spectateur — « je », « comment », « pourquoi » — qui ouvre une vidéo parlée
 * et jamais une chanson. Cherché sur le côté normalisé : « j'ai » y arrive en
 * « j ai ».
 */
const NOT_A_TRACK = /\b(vlogs?|podcasts?|interviews?|reactions?|gameplays?|let ?s play|speedrun|walkthrough|trailers?|bandes? annonces?|teasers?|episodes?|ep \d|partie \d|part \d|s\d+ ?e\d+|saison \d|best of|highlights?|unboxing|tier ?list|top \d|challenge|prank|storytime|actualites?|debat|documentaire|streams?|direct)\b|^(je|j ai|comment|pourquoi|quand|qui|quoi|combien)\b/;

/** Le titre débarrassé du nom de la plateforme (« … - YouTube »). */
function withoutPlatform(title: string, platform: string): string {
  const t = cleanBrowserTitle(title);
  const name = platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return t.replace(new RegExp(`\\s*[-–—|·]\\s*${name}\\s*$`, "i"), "").trim();
}

/** Le sujet « Musique » quand le titre en a la forme, et rien sinon. */
function trackOf(title: string, platform: string): { cat: string; name: string; matched: string } | null {
  /* Ce que les chaînes collent derrière — « (Official Video) », « [prod. X] »,
     « (feat. Y) ». Les mots de `SUBJECTS` en ont déjà tiré ce qu'ils pouvaient ;
     ce qui reste masquerait la forme du devant. */
  let core = withoutPlatform(title, platform);
  for (let prev = ""; core !== prev; ) {
    prev = core;
    core = core.replace(/\s*[([][^)\]]*[)\]]\s*$/, "").trim();
  }

  const sides = core.split(TRACK_SEP);
  if (sides.length !== 2) return null;

  for (const [i, side] of sides.entries()) {
    const n = norm(side);
    const max = TRACK_SIDES[i];
    if (!n || n.length > max.chars || n.split(" ").length > max.words) return null;
    if (NOT_A_TRACK.test(n)) return null;
    /* Un point d'exclamation ou d'interrogation appelle le spectateur : c'est
       un titre de vidéo parlée ou de direct, pas un morceau. */
    if (/[!?]/.test(side)) return null;
  }

  return {
    cat: "music",
    name: getLang() === "en" ? MUSIC_NAME.en : MUSIC_NAME.fr,
    matched: sides.map(s => norm(s)).join(" - "),
  };
}

/* ─── La partie de l'app, quand c'est l'app qu'on mesure ─────────────────── */

/** Vrai si ce nom de processus est celui de tao trade elle-même. */
export function isSelfApp(app: string): boolean {
  const hit = matchAppExact(app) ?? matchAppWord(app);
  return !!hit && hit.entry.cat === SELF;
}

/** La partie de l'app annoncée par un titre, s'il en annonce une. */
export function sectionInTitle(title: string): SelfSection | null {
  const hay = norm(title);
  for (const [id, s] of Object.entries(SELF_SECTIONS)) {
    if (s.re.test(hay)) return id as SelfSection;
  }
  return null;
}

/**
 * Le titre à ÉCRIRE dans le segment, quand l'app de bureau est au premier plan.
 *
 * Son titre de fenêtre est figé (« tao ») : sans ce relais, ses trois parties se
 * confondent en une ligne. On le pose dans le titre plutôt que dans le
 * classement parce que la relecture repart du titre (cf. `recategorize`), et
 * qu'une correction posée ailleurs serait reperdue au premier affichage.
 *
 * Un titre qui nomme DÉJÀ une partie est laissé tel quel : c'est le cas de
 * l'onglet, qui porte `document.title`, et la partie qu'il annonce est celle
 * qu'on regarde — pas celle où en est l'app de bureau restée derrière.
 */
export function selfTitle(app: string, title: string, section: SelfSection | null): string {
  if (!section || !isSelfApp(app) || sectionInTitle(title)) return title;
  return selfTitleOf(section);
}

/**
 * Le classement d'une partie de l'app : sa catégorie, et un nom à elle.
 *
 * Le nom DOIT différer d'une partie à l'autre — la page agrège le temps par nom
 * et n'admet qu'une catégorie par nom (cf. `oneCategoryPerLabel`), si bien que
 * deux parties sous « tao trade » se seraient écrasées l'une l'autre.
 *
 * `via` ne change pas : c'est bien le NOM de l'application qui l'a fait
 * reconnaître, et la page « Règles » ne doit pas raconter autre chose. Le titre
 * n'a fait que dire ce qu'on y faisait.
 */
function withSelfSection(base: Classification, section: SelfSection): Classification {
  const cat = settle(SELF_SECTIONS[section].cat);
  return {
    ...base,
    // Catégorie retirée par l'utilisateur : celle de l'app vaut mieux que
    // « Non classé », qui renverrait ce temps dans la file d'attente.
    category: cat === OTHER ? base.category : cat,
    label: `${base.label} · ${sectionName(section)}`,
  };
}

function fromHit(hit: CatalogHit, label: string, isSite: boolean, matched: string, title = ""): Classification {
  /* Le sujet passe devant le lieu, mais seulement là où le lieu n'engage à rien
     (cf. `hosted` dans le catalogue).

     Le NOM change avec la catégorie — « YouTube · Trading » à côté de
     « YouTube ». Ce n'est pas cosmétique : la page agrège le temps par nom et
     n'admet qu'UNE catégorie par nom (cf. `oneCategoryPerLabel`), si bien que
     deux classements sous le même nom se seraient écrasés l'un l'autre et que
     la majorité aurait tout emporté. Deux noms, deux lignes, deux totaux — et
     on lit enfin ce que YouTube a servi à faire. */
  /* La FORME du titre passe après ses MOTS : « Artiste - Titre » ne dit qu'une
     convention d'affichage, là où un vocabulaire dit un sujet (cf. `trackOf`). */
  const subject = hit.entry.hosted
    ? subjectOf(title) ?? (hit.entry.tracks ? trackOf(title, hit.entry.name) : null)
    : null;
  const subjectCat = subject ? settle(subject.cat) : null;
  // Catégorie retirée par l'utilisateur : celle du catalogue vaut mieux que
  // « Non classé », qui renverrait ce temps dans la file d'attente.
  if (subject && subjectCat && subjectCat !== OTHER) {
    return {
      category: subjectCat,
      label: `${label} · ${subject.name}`,
      via: "title",
      matched: subject.matched,
      isSite,
      confidence: CONFIDENCE.title,
      system: false,
    };
  }

  const base: Classification = {
    category: settle(hit.entry.cat),
    label,
    via: hit.via,
    matched,
    isSite,
    confidence: CONFIDENCE[hit.via],
    system: hit.entry.system === true,
  };

  /* Cette app se découpe en trois (cf. lib/activity/self) : le titre le dit, que
     ce soit celui de l'onglet ou celui que le moteur a écrit pour la fenêtre
     native. Un onglet vaut ici autant qu'une fenêtre — d'où le test sur les deux
     chemins, et non sur `hosted` comme pour le sujet d'une vidéo. */
  if (hit.entry.cat === SELF) {
    const section = sectionInTitle(title);
    if (section) return withSelfSection(base, section);
  }

  return base;
}

/** Première règle de l'utilisateur qui reconnaît ce relevé (la plus récente). */
function userHit(
  rules: ClassifyRule[], app: string, title: string, host = ""
): { category: string; match: string } | null {
  const al = (app || "").toLowerCase();
  const tl = (title || "").toLowerCase();
  const hl = (host || "").toLowerCase();
  // Écrite en dernier = consultée en premier : corriger une erreur ne demande
  // pas de supprimer l'ancienne règle.
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i];
    if (!r?.match) continue;
    const needle = r.match.toLowerCase();
    if (r.field === "site") {
      /* Sur un hôte, on ne cherche pas n'importe où dans la chaîne : « ted.com »
         ne doit pas attraper « limited.com ». La règle vaut pour le domaine
         lui-même et pour ses sous-domaines, et pour rien d'autre. */
      if (hl && (hl === needle || hl.endsWith(`.${needle}`))) {
        return { category: r.category, match: r.match };
      }
      continue;
    }
    const hay = r.field === "title" ? tl : al;
    if (hay.includes(needle)) return { category: r.category, match: r.match };
  }
  return null;
}

/**
 * Classe un instantané (app + titre), en disant POURQUOI.
 *
 * Deux chemins, parce que ce sont deux mondes : dans un navigateur, le nom de
 * l'application ne dit rien (« Google Chrome » n'est pas une activité) et tout
 * se joue dans le titre ; ailleurs, c'est l'inverse.
 */
export function classifyDetailed(
  app: string,
  title: string,
  userRules: ClassifyRule[] = [],
  /* Hote de l'onglet, quand le navigateur a bien voulu le dire (cf.
     lib/activity/engine). Vide le reste du temps : tout ce qui suit doit
     continuer de fonctionner sans lui. */
  site = ""
): Classification {
  const browser = isBrowserApp(app);
  const host = browser ? hostOf(site) : "";

  /* Le nom d'abord : il est utile MÊME quand rien n'est classé, et c'est lui
     qui fait la différence entre une file de « Google Chrome » identiques et
     une liste de sites qu'on peut ranger.

     L'hôte passe AVANT le titre, sur les deux plans. Pour reconnaître le site,
     parce qu'un domaine ne se trompe pas là où un titre peut tout dire. Et pour
     le NOMMER, parce que beaucoup de pages n'écrivent pas le nom du site dans
     leur titre : le lecteur web de Spotify affiche « ELEVEN OCEANS • Moji x
     Sboy », si bien que chaque morceau écouté devenait un site à lui seul, et
     qu'aucun ne pouvait être rangé — le nom deviné changeait à chaque chanson.
     L'hôte, lui, ne change pas. */
  const domain = browser ? (host || domainInTitle(title)) : null;
  const siteHit = browser
    ? (domain ? matchDomain(domain) : null) ?? matchTitle(title)
    : null;
  const label = browser
    ? (siteHit?.entry.name ?? hostLabel(host) ?? guessSiteName(title) ?? appLabel(app))
    : (matchAppExact(app)?.entry.name ?? matchAppWord(app)?.entry.name ?? appLabel(app));

  const mine = userHit(userRules, app, title, host);
  if (mine) {
    return { category: settle(mine.category), label, via: "user", matched: mine.match, isSite: browser, confidence: 1, system: false };
  }

  if (browser) {
    if (siteHit) return fromHit(siteHit, label, true, domain ?? siteHit.entry.name, title);
    /* Une page inconnue est de la NAVIGATION, pas une anomalie.
       Elle tombait dans « Non classé », et c'était le plus gros défaut de la
       mesure : un navigateur qui ne dit pas son URL (Arc, Firefox, un poste sans
       autorisation d'automatisation) n'offre qu'un titre de page, où le nom du
       site ne figure souvent pas. Des journées entières y passaient, la file
       « à classer » comptait quarante entrées inrangeables — une par article lu
       — et « Non classé » finissait première catégorie du jour.
       Navigation est NEUTRE : ce temps ne se met ni au crédit du travail ni au
       débit de la distraction, ce qui est exactement ce qu'on sait de lui. */
    return { category: settle(BROWSING), label, via: "none", matched: null, isSite: true, confidence: 0, system: false };
  }

  const exact = matchAppExact(app);
  if (exact) return fromHit(exact, label, false, norm(app), title);

  const word = matchAppWord(app);
  if (word) return fromHit(word, label, false, word.entry.name, title);

  /* Dernier recours : le titre d'une application de bureau. Une app inconnue
     ouvrant un PDF de compta, un Electron dont le processus s'appelle
     « Electron » — le titre est alors la seule chose qui parle. */
  const byTitle = matchTitle(title) ?? (() => {
    const d = domainInTitle(title);
    return d ? matchDomain(d) : null;
  })();
  if (byTitle) return fromHit(byTitle, label, false, byTitle.entry.name, title);

  return { category: OTHER, label, via: "none", matched: null, isSite: false, confidence: 0, system: false };
}

/**
 * Classement, forme courte — c'est ce que le moteur écrit dans chaque segment.
 */
export function classify(
  app: string,
  title: string,
  userRules: ClassifyRule[] = [],
  site = ""
): { category: string; label: string } {
  const { category, label } = classifyDetailed(app, title, userRules, site);
  return { category, label };
}

/**
 * Classement d'une application de TÉLÉPHONE.
 *
 * Pourquoi une porte séparée plutôt que `classifyDetailed` : sur un poste, un
 * navigateur au premier plan veut dire « une page », et tout le classement se
 * joue alors dans le titre de la fenêtre. Android ne donne aucun titre (cf.
 * PhonePlugin.kt) — passer « Chrome » dans le chemin navigateur reviendrait donc
 * à chercher un site dans une chaîne vide, et à laisser chaque navigateur
 * éternellement non classé. Ici, un navigateur est une APPLICATION comme une
 * autre : c'est moins précis, et c'est tout ce que la plateforme permet.
 *
 * Deux noms arrivent pour la même chose — « YouTube » et
 * « com.google.android.youtube ». Les deux sont essayés, et une règle de
 * l'utilisateur peut viser l'un ou l'autre : le paquet est stable, le nom
 * lisible est ce qu'on a sous les yeux.
 */
export function classifyPhoneApp(
  label: string,
  packageName: string,
  userRules: ClassifyRule[] = []
): Classification {
  const shown = (label || packageName || "").trim();

  /* Les règles d'abord, et sur les DEUX noms : `app` porte le paquet (c'est
     l'identifiant que l'OS donne, comme un nom de processus ailleurs), `title`
     porte le nom lisible. Une règle « dans l'application » sur « youtube »
     attrape donc le paquet, une règle « dans le titre » sur « YouTube » aussi. */
  const mine = userHit(userRules, packageName, shown);
  if (mine) {
    return {
      category: settle(mine.category), label: shown, via: "user",
      matched: mine.match, isSite: false, confidence: 1, system: false,
    };
  }

  for (const candidate of [shown, packageName]) {
    if (!candidate) continue;
    const hit = matchAppExact(candidate) ?? matchAppWord(candidate);
    if (hit) return fromHit(hit, shown, false, norm(candidate));
  }

  return { category: OTHER, label: shown, via: "none", matched: null, isSite: false, confidence: 0, system: false };
}

/* --- Hote ----------------------------------------------------------------- */

/** L'hote d'une URL, sans `www.` -- ou la chaine vide si ce n'en est pas une. */
export function hostOf(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    /* Certains navigateurs rendent l'hote nu, sans protocole. On ne va pas plus
       loin qu'une forme evidente : mieux vaut pas de nom qu'un faux nom. */
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw) ? raw.replace(/^www\./, "").toLowerCase() : "";
  }
}

/* Suffixes a deux etages : sans eux, « bbc.co.uk » se reduirait a « co.uk » et
   une regle de domaine attraperait tout le Royaume-Uni. La liste est courte
   exprès — elle couvre ce qu'on rencontre, pas la liste publique entiere. */
const TWO_LEVEL_TLD = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.jp", "or.jp", "ne.jp",
  "com.au", "net.au", "org.au", "com.br", "com.mx", "com.tr", "com.cn",
  "co.in", "co.kr", "co.nz", "co.za", "com.ar", "com.sg", "com.hk",
]);

/**
 * Le domaine sur lequel poser une regle : « open.spotify.com » -> « spotify.com ».
 *
 * C'est ce niveau-la qu'il faut viser et pas l'hote complet : un site se
 * promene sur ses sous-domaines (`open.`, `accounts.`, `www.`), et une regle par
 * sous-domaine ferait recommencer le rangement a chaque fois.
 */
export function rootDomain(host: string): string {
  const h = hostOf(host) || (host || "").trim().toLowerCase();
  if (!h) return "";
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const lastTwo = parts.slice(-2).join(".");
  return TWO_LEVEL_TLD.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

/**
 * Le nom presentable d'un hote : « open.spotify.com » -> « Spotify ».
 *
 * Sert de nom de repli quand le catalogue ne connait pas le domaine. C'est
 * grossier -- « Mon-Super-Site » ressort « Mon-super-site » -- mais c'est
 * STABLE d'une page a l'autre du meme site, ce qu'un nom devine dans le titre
 * n'est pas, et c'est ce qui permet de ranger le site d'un clic.
 */
function hostLabel(host: string): string | null {
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length < 2) return null;
  const core = parts[parts.length - 2];
  if (!core || core === "localhost") return host;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

/* ─── Noms ───────────────────────────────────────────────────────────────── */

/** Noms d'app rendus lisibles quand le catalogue ne les connaît pas. */
const APP_LABELS: Record<string, string> = {
  msedge: "Microsoft Edge",
  chrome: "Google Chrome",
  firefox: "Firefox",
  explorer: "Explorateur de fichiers",
  taskmgr: "Gestionnaire des tâches",
  systemsettings: "Réglages système",
  loginwindow: "Écran de verrouillage",
  dwm: "Bureau Windows",
  javaw: "Java",
};

/** Nom d'application présentable, à partir du nom brut donné par l'OS. */
export function appLabel(app: string): string {
  const raw = (app || "").trim();
  if (!raw) return "Inconnu";
  const key = norm(raw);
  const known = appIndexName(key);
  if (known) return known;
  const mapped = APP_LABELS[key];
  if (mapped) return mapped;
  // « visual studio code » → « Visual Studio Code » ; les noms déjà capitalisés
  // par le système (macOS) ressortent inchangés.
  const clean = raw.replace(/\.(exe|app)$/i, "");
  if (clean === clean.toLowerCase()) {
    return clean.replace(/\b\p{L}/gu, c => c.toUpperCase());
  }
  return clean;
}

/** Le nom du catalogue pour un nom d'app normalisé, s'il y en a un. */
function appIndexName(normalized: string): string | null {
  const hit = matchAppExact(normalized);
  return hit ? hit.entry.name : null;
}

/**
 * Site reconnu dans un titre de navigateur, pour l'afficher comme une « app »
 * à part entière (c'est ainsi qu'on lit son temps : « YouTube », pas « Chrome »).
 */
export function siteOf(title: string): string | null {
  const domain = domainInTitle(title);
  const hit = (domain ? matchDomain(domain) : null) ?? matchTitle(title);
  return hit?.entry.name ?? guessSiteName(title);
}

/* ─── Suggestion ─────────────────────────────────────────────────────────── */

/** Indices FAIBLES : ils proposent, ils ne classent pas. */
const CLUES: { cat: string; re: RegExp }[] = [
  { cat: "games",    re: /\b(jeu|jeux|game|gaming|gameplay|serveur|server|mod(s|pack)?|patch notes|ranked|elo)\b/ },
  { cat: "fun",      re: /\b(film|serie|episode|saison|streaming|vostfr|vf|replay|bande annonce|trailer|clip)\b/ },
  { cat: "music",    re: /\b(album|playlist|morceau|titre en cours|now playing|discographie)\b/ },
  { cat: "shopping", re: /\b(panier|livraison|promo|soldes|acheter|prix|commande|boutique|shop|checkout)\b/ },
  { cat: "research", re: /\b(wiki|documentation|tutoriel|tutorial|guide|cours|lecon|article|actualites|journal)\b/ },
  { cat: "dev",      re: /\b(api|sdk|github|npm|typescript|javascript|python|docker|erreur|error|stack trace|compil)\b/ },
  { cat: "trading",  re: /\b(trading|bourse|forex|crypto|btc|eth|nasdaq|cac ?40|sp ?500|chandelier|backtest)\b/ },
  { cat: "admin",    re: /\b(facture|devis|impots|urssaf|banque|releve|contrat|assurance|rendez ?vous)\b/ },
];

/**
 * Catégorie PROPOSÉE pour un relevé que rien n'a su classer.
 *
 * Elle ne classe jamais toute seule : elle s'affiche dans la file d'attente, à
 * côté du nom et du titre, et il faut un clic pour l'accepter. Un suivi qui
 * devine en silence est un suivi qu'on cesse de croire — mais une file de
 * quarante lignes où chaque ligne demande de choisir parmi treize catégories
 * est une file qu'on ne vide jamais.
 */
export function suggestCategory(app: string, title: string): string | null {
  const hay = `${norm(app)} ${norm(title)}`;
  // Un domaine en .gg est, à une exception près, un site de jeu.
  const domain = domainInTitle(title);
  if (domain && /\.gg$/.test(domain)) return "games";
  for (const c of CLUES) {
    if (c.re.test(hay)) return c.cat;
  }
  return null;
}

/* ─── Le catalogue, vu de l'interface ────────────────────────────────────── */

/** Nombre d'applications et de sites connus, par catégorie. */
export function catalogSize(): { total: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {};
  for (const e of CATALOG as CatalogEntry[]) {
    byCategory[e.cat] = (byCategory[e.cat] || 0) + 1;
  }
  return { total: CATALOG.length, byCategory };
}
