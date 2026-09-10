/**
 * Les trois parties de tao trade, vues par le suivi d'activité.
 *
 * Le suivi ne voyait qu'une ligne — « tao trade » — pour trois usages qui n'ont
 * rien à voir : préparer et relire ses trades, tenir sa vie perso, suivre son
 * patrimoine. Une heure passée « dans l'app » ne veut donc rien dire tant qu'on
 * ne sait pas LAQUELLE des trois on a passée.
 *
 * Rien de ce que le poste voit ne porte cette information : le titre de la
 * fenêtre native est figé (« tao », cf. src-tauri/tauri.conf.json) et la
 * navigation vit dans un état React, sans URL (cf. lib/contexts/AppContext).
 * C'est donc l'app qui doit le DIRE, et elle le dit par le TITRE — le seul
 * canal que la relecture n'oublie pas :
 *
 *   • en navigateur, `document.title` suffit, et c'est aussi ce que voit un
 *     poste de bureau mesurant tao trade ouvert dans un onglet (il ne lit alors
 *     rien d'autre que le titre de cet onglet) ;
 *   • dans l'app de bureau, dont le titre de fenêtre ne bouge pas, le moteur
 *     ÉCRIT ce titre lui-même (cf. `selfTitle` dans lib/activity/categories).
 *
 * Pourquoi le titre et pas un classement corrigé après coup : la page Activité
 * reclasse chaque segment à la lecture, depuis (app, titre, hôte) seuls (cf.
 * `recategorize` dans lib/activity/stats). Une correction posée à la mesure
 * serait donc reperdue au premier affichage ; un titre, non.
 *
 * Faire suivre le titre de fenêtre NATIF aurait été l'autre voie — et elle
 * coûte une permission de plus dans les capacités Tauri, donc un binaire à
 * reconstruire, à redistribuer et à re-signer (avec les autorisations
 * Accessibilité à réaccorder). Pour la même information.
 *
 * Ce fichier ne porte que les données : la table des pages, le nom affiché et
 * la catégorie où verser le temps. Le classement, lui, vit dans
 * lib/activity/categories.
 */

import { getLang } from "@/lib/i18n";

export type SelfSection = "trading" | "perso" | "finance";

/**
 * Où va le temps de chaque partie, et sous quel nom.
 *
 * Les catégories ne sont pas trois nouvelles : ce temps rejoint celui des
 * autres applications qui servent à la même chose, sans quoi la mesure dirait
 * « tao trade » là où on veut lire « trading ». Finance rejoint le trading, et
 * c'est un choix assumé de l'utilisateur : suivre son patrimoine et suivre ses
 * trades sont pour lui la même heure de la journée.
 *
 * L'app perd donc, dans ces trois cas, la neutralité qu'elle s'imposait quand
 * elle ne savait pas ce qu'on y faisait (cf. la catégorie « tao » dans
 * lib/activity/categories) : c'est précisément ce que savoir la section
 * permettait de trancher. Ce qui reste hors des trois parties — les réglages —
 * reste neutre.
 *
 * `re` est cherché dans le titre NORMALISÉ (sans accent ni ponctuation, cf.
 * `norm`), et dans les deux langues : le titre est écrit dans la langue du jour
 * mais relu bien plus tard, éventuellement dans l'autre.
 */
export const SELF_SECTIONS: Record<
  SelfSection,
  { cat: string; name: string; nameEn: string; re: RegExp }
> = {
  trading: { cat: "trading", name: "Trading", nameEn: "Trading", re: /\btrading\b/ },
  perso: { cat: "work", name: "Vie perso", nameEn: "Personal life", re: /\b(vie perso|personal life)\b/ },
  finance: { cat: "trading", name: "Finance", nameEn: "Finance", re: /\bfinance\b/ },
};

/** Le nom de la partie, dans la langue de l'interface. */
export function sectionName(section: SelfSection): string {
  const s = SELF_SECTIONS[section];
  return getLang() === "en" ? s.nameEn : s.name;
}

/**
 * Le titre qui annonce une partie — celui de l'onglet, et celui que le moteur
 * écrit pour l'app de bureau.
 *
 * L'ordre est celui que l'app se donne partout ailleurs (« %s · tao trade »,
 * cf. le `template` de app/layout.tsx) ; la reconnaissance, elle, ne dépend pas
 * de l'ordre — elle cherche deux mots dans le titre, où qu'ils soient.
 *
 * Rien d'autre que le nom de la partie et celui de l'app : le nom de la PAGE y
 * serait plus agréable à lire dans un onglet, mais il devrait alors ne jamais
 * contenir le nom d'une autre partie — une contrainte invisible qu'une page
 * ajoutée un jour casserait sans bruit.
 */
export function selfTitleOf(section: SelfSection | null): string {
  return section ? `${sectionName(section)} · tao trade` : "tao trade";
}

/**
 * La partie dont relève chaque page de la coquille.
 *
 * La table est écrite à plat, et non déduite de `SIDEBAR_SECTIONS` : la
 * navigation ne montre pas tout ce qui est routé (les pages de détail —
 * compte, firme, stratégie, titre — n'y figurent pas), et ce sont justement
 * celles où l'on passe le plus de temps.
 *
 * `settings` n'a pas de partie, volontairement : les réglages sont ceux de
 * l'app entière, et les ranger d'un côté ou de l'autre attribuerait à une
 * activité du temps qui n'est celui d'aucune. Ce temps reste sous « tao trade »,
 * neutre — ce qu'il est.
 *
 * Une page absente d'ici retombe sur ce même « tao trade » : le suivi ne mentira
 * jamais, il en dira seulement moins. `tests/activitySelfSection.test.ts` veille
 * quand même à ce que la table suive les pages routées.
 */
export const SECTION_OF_PAGE: Record<string, SelfSection> = {
  // Trading — de la saisie au bilan, journal et discipline compris.
  dashboard: "trading",
  "add-trade": "trading",
  trades: "trading",
  "trade-chart": "trading",
  calendar: "trading",
  journal: "trading",
  discipline: "trading",
  strategies: "trading",
  "strategy-detail": "trading",
  backtest: "trading",
  brokers: "trading",
  accounts: "trading",
  "account-detail": "trading",
  "firm-detail": "trading",

  // Vie perso — le quotidien, le corps, les idées. Y compris la page Activité
  // elle-même : la relire est du temps de vie perso, pas du temps de marché.
  goals: "perso",
  "daily-planner": "perso",
  agenda: "perso",
  sport: "perso",
  reading: "perso",
  notes: "perso",
  revisions: "perso",
  focus: "perso",
  drive: "perso",
  "life-rpg": "perso",
  eloquence: "perso",
  activity: "perso",
  "activity-reports": "perso",
  "activity-rules": "perso",

  // Finance — l'argent personnel (cf. la section « Finance » de la navigation).
  cashflow: "finance",
  budget: "finance",
  spending: "finance",
  patrimoine: "finance",
  "patrimoine-asset": "finance",
  "patrimoine-class": "finance",
  "patrimoine-holding": "finance",
  "patrimoine-bank": "finance",
  "patrimoine-liabilities": "finance",
};

/** La partie d'une page, ou `null` si elle n'appartient à aucune. */
export function sectionOfPage(page: string): SelfSection | null {
  return SECTION_OF_PAGE[(page || "").trim()] ?? null;
}
