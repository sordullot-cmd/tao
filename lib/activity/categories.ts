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
 *   6. rien : « Non classé », mais avec un NOM propre (le site deviné), pour
 *      qu'un clic suffise à le ranger.
 *
 * Chaque décision garde sa raison (`via`) : la page « Catégories & règles »
 * l'affiche, et un classement qu'on ne peut pas expliquer ne se corrige pas.
 */

import { PALETTE, PALETTE_DARK, PALETTE_LIGHT, GREY, HUE } from "@/lib/ui/palette";
import { getLang } from "@/lib/i18n";
import {
  CATALOG, domainInTitle, guessSiteName, isBrowserApp, matchAppExact, matchAppWord,
  matchDomain, matchTitle, norm, type CatalogEntry, type CatalogHit,
} from "@/lib/activity/catalog";

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

/* Quatorze catégories. Deux sont nouvelles et répondent à un défaut de mesure,
   pas à une envie de nuance :
     • « Jeux » — ils étaient soit dans « Divertissement » (à côté d'un film,
       alors qu'on ne les règle pas pareil), soit, le plus souvent, dans « Non
       classé » ;
     • « Achats » — Amazon et Leboncoin comptaient comme du divertissement,
       ce qui rendait le total de « Divertissement » illisible. */
export const BUILTIN_CATEGORIES: ActivityCategory[] = [
  { id: "dev",       label: "Développement",      labelEn: "Development",   color: PALETTE.blue,        productivity: "productive",  hint: "Éditeurs, terminaux, docs techniques, dépôts." },
  { id: "trading",   label: "Trading & marchés",  labelEn: "Trading",       color: PALETTE.green,       productivity: "productive",  hint: "Plateformes, graphiques, journal de trades, prop firms." },
  { id: "writing",   label: "Écriture & notes",   labelEn: "Writing",       color: PALETTE.purple,      productivity: "productive",  hint: "Traitement de texte, prise de notes, rédaction." },
  { id: "design",    label: "Design & création",  labelEn: "Design",        color: PALETTE.pink,        productivity: "productive",  hint: "Image, vidéo, son, 3D, maquettes." },
  { id: "research",  label: "Recherche & lecture",labelEn: "Research",      color: PALETTE.brown,       productivity: "productive",  hint: "IA, encyclopédies, cours, presse, documentation." },
  { id: "admin",     label: "Admin & gestion",    labelEn: "Admin",         color: PALETTE_DARK.blue,   productivity: "productive",  hint: "Tableurs, agenda, fichiers, démarches, gestion de projet." },
  { id: "meetings",  label: "Réunions",           labelEn: "Meetings",      color: PALETTE.orange,      productivity: "neutral",     hint: "Visioconférence et appels." },
  { id: "comms",     label: "Communication",      labelEn: "Communication", color: PALETTE.yellow,      productivity: "neutral",     hint: "Messageries et courrier." },
  /* La musique sort de « Divertissement » : elle ACCOMPAGNE le travail au lieu
     de le remplacer, et une heure de Spotify comptée en distraction pendant
     qu'on code fausse la lecture de la journée. Neutre, donc — ni portée au
     crédit du travail, ni retenue contre lui ; celui pour qui c'est autre chose
     le change dans « Catégories & règles ».
     La teinte suit la règle de la charte (cf. lib/ui/palette) : les huit
     principales étant prises, on descend d'un cran — l'ambre profond n'est pas
     l'orange vif des réunions. */
  { id: "music",     label: "Musique",            labelEn: "Music",         color: PALETTE_DARK.orange, productivity: "neutral",     hint: "Écoute de musique : Spotify, Apple Music, Deezer, SoundCloud." },
  { id: "utilities", label: "Utilitaires & système", labelEn: "Utilities",  color: PALETTE_DARK.green,  productivity: "neutral",     hint: "Fichiers, réglages, mots de passe, bureau du système." },
  { id: "shopping",  label: "Achats",             labelEn: "Shopping",      color: HUE.moonJelly,       productivity: "neutral",     hint: "Boutiques en ligne, petites annonces, livraison." },
  { id: "social",    label: "Réseaux sociaux",    labelEn: "Social media",  color: PALETTE.red,         productivity: "distracting", hint: "Fils sociaux et communautés." },
  { id: "games",     label: "Jeux",               labelEn: "Games",         color: PALETTE_DARK.pink,   productivity: "distracting", hint: "Jeux, lanceurs et sites de jeu." },
  { id: "fun",       label: "Divertissement",     labelEn: "Entertainment", color: PALETTE_DARK.purple, productivity: "distracting", hint: "Vidéo, musique, séries, sport." },
  { id: "other",     label: "Non classé",         labelEn: "Uncategorized", color: GREY.grey500,        productivity: "neutral",     hint: "Ce que l'app n'a pas su reconnaître. À ranger en un clic." },
];

export const OTHER = "other";

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
}

const CONFIDENCE: Record<ClassifySource, number> = {
  user: 1, web: 0.95, app: 0.9, word: 0.75, title: 0.6, none: 0,
};

/**
 * Catégorie servie à l'interface : celle du catalogue si elle existe encore.
 *
 * Une catégorie retirée par l'utilisateur (ou disparue d'une version à l'autre)
 * laisserait sinon des segments pointant vers un identifiant sans nom ni
 * couleur — du temps gris, impossible à lire et impossible à corriger. Il
 * retourne donc à « Non classé », d'où la file d'attente le rattrape.
 */
function settle(id: string): string {
  return BY_ID[id] ? id : OTHER;
}

function fromHit(hit: CatalogHit, label: string, isSite: boolean, matched: string): Classification {
  return {
    category: settle(hit.entry.cat),
    label,
    via: hit.via,
    matched,
    isSite,
    confidence: CONFIDENCE[hit.via],
  };
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
    return { category: settle(mine.category), label, via: "user", matched: mine.match, isSite: browser, confidence: 1 };
  }

  if (browser) {
    /* Une page qu'on ne reconnaît pas reste NON CLASSÉE, jamais rangée d'office
       dans une catégorie productive : sinon tout le web inconnu gonflerait le
       temps de focus, ce qu'un suivi ne doit précisément pas faire. */
    if (siteHit) return fromHit(siteHit, label, true, domain ?? siteHit.entry.name);
    return { category: OTHER, label, via: "none", matched: null, isSite: true, confidence: 0 };
  }

  const exact = matchAppExact(app);
  if (exact) return fromHit(exact, label, false, norm(app));

  const word = matchAppWord(app);
  if (word) return fromHit(word, label, false, word.entry.name);

  /* Dernier recours : le titre d'une application de bureau. Une app inconnue
     ouvrant un PDF de compta, un Electron dont le processus s'appelle
     « Electron » — le titre est alors la seule chose qui parle. */
  const byTitle = matchTitle(title) ?? (() => {
    const d = domainInTitle(title);
    return d ? matchDomain(d) : null;
  })();
  if (byTitle) return fromHit(byTitle, label, false, byTitle.entry.name);

  return { category: OTHER, label, via: "none", matched: null, isSite: false, confidence: 0 };
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
      matched: mine.match, isSite: false, confidence: 1,
    };
  }

  for (const candidate of [shown, packageName]) {
    if (!candidate) continue;
    const hit = matchAppExact(candidate) ?? matchAppWord(candidate);
    if (hit) return fromHit(hit, shown, false, norm(candidate));
  }

  return { category: OTHER, label: shown, via: "none", matched: null, isSite: false, confidence: 0 };
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
