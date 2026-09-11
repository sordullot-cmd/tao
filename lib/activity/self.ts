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

/* La table des pages vit à part (lib/activity/sections) : le thème de la
   coquille en descend et doit être posé depuis un composant serveur, qui ne
   peut pas importer ce fichier-ci — il tire lib/i18n, donc des hooks React.
   Ré-exportée ici : rien ne change pour les appelants. */
export { SECTION_OF_PAGE, sectionOfPage } from "@/lib/activity/sections";
export type { SelfSection } from "@/lib/activity/sections";
import type { SelfSection } from "@/lib/activity/sections";

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
