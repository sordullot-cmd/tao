/**
 * La table des pages : dans quelle partie de tao trade vit chaque écran.
 *
 * Séparée de lib/activity/self, dont elle vient, pour une raison de bundle et
 * non de rangement : le thème de la coquille descend de cette même table (cf.
 * lib/ui/sectionTheme) et doit être posé AVANT l'hydratation, donc écrit par
 * app/layout.tsx — un composant serveur. Or `self` a besoin de la langue pour
 * nommer les parties, et lib/i18n expose des hooks React : l'importer depuis le
 * serveur fait échouer le build. La table, elle, ne dépend de rien.
 *
 * `self` la ré-exporte : les appelants existants n'ont pas à savoir qu'elle a
 * déménagé, et la description des trois parties reste là où elle se lit.
 */

export type SelfSection = "trading" | "perso" | "finance";

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
