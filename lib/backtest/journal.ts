/**
 * Journal de backtest — le modèle, hors React.
 *
 * À ne pas confondre avec `lib/backtest/engine.ts`, qui rejoue les trades
 * RÉELLEMENT pris sous un filtre. Ici rien n'est rejoué : c'est une saisie. On
 * déroule un graphique en arrière, on note le setup qu'on aurait pris, ce qui
 * l'a justifié (les confluences), ce qu'on a raté (les erreurs) et ce qu'il
 * aurait fallu faire autrement. Un backtest n'a donc ni compte, ni lots, ni
 * P&L en euros — il a un résultat et un multiple de risque.
 *
 * ── Le R plutôt que l'euro ────────────────────────────────────────────────
 * Un backtest ne se mesure pas en argent : la taille de position n'existe pas
 * encore, et deux sessions espacées de six mois n'auraient pas le même capital.
 * Le multiple de risque, lui, reste comparable d'un bout à l'autre du journal.
 *
 * ── Les tags sont des libellés, pas des identifiants ──────────────────────
 * Une confluence est un mot qu'on écrit une fois puis qu'on recoche. Lui donner
 * un id imposerait un catalogue à tenir à jour, et surtout une jointure à faire
 * à chaque lecture pour afficher trois mots. Le catalogue se RECONSTRUIT à la
 * lecture depuis les entrées (cf. `normalizeJournal`) : un tag employé dans une
 * entrée mais absent du catalogue y rentre plutôt que de disparaître de la
 * liste des cases à cocher.
 */

/** Ce que l'utilisateur DÉCLARE du trade. Le « BE » couvre le scratch : sorti
 *  à l'entrée, ni gagnant ni perdant — le compter perdant fausserait le
 *  taux de réussite vers le bas, gagnant vers le haut. */
export type BacktestOutcome = "win" | "loss" | "be";

export interface BacktestEntry {
  id: string;
  /** YYYY-MM-DD — la date du SETUP sur le graphique, pas celle de la saisie. */
  date: string;
  symbol: string;
  direction: "long" | "short";
  outcome: BacktestOutcome;
  /** La stratégie testée, par son id (table Supabase `strategies`). `null`
   *  quand le setup n'en relève d'aucune — on backteste aussi des idées avant
   *  qu'elles ne deviennent une stratégie nommée. */
  strategyId: string | null;
  /** Multiple de risque mesuré. `null` quand on ne l'a pas relevé : le trade
   *  compte alors pour ±1R (cf. `effectiveR`), ce qui est la convention d'un
   *  plan à risque fixe et évite qu'une entrée sans chiffre pèse zéro. */
  r: number | null;
  confluences: string[];
  mistakes: string[];
  /** « Ce que j'aurais dû mieux faire » — le champ qui fait le travail. */
  better: string;
  createdAt: string;
}

export interface BacktestJournal {
  entries: BacktestEntry[];
  /** Catalogues de cases à cocher, enrichis par l'usage. */
  confluences: string[];
  mistakes: string[];
}

/* Les deux listes de départ. Elles ne sont pas là pour être exhaustives mais
   pour qu'un premier backtest se saisisse en cochant, sans commencer par
   inventer un vocabulaire — celui qu'on ajoute ensuite est le bon. */
export const DEFAULT_CONFLUENCES = [
  "Tendance HTF alignée",
  "Prise de liquidité",
  "FVG / imbalance",
  "Order block",
  "Niveau clé",
  "Killzone",
  "Divergence",
  "Volume / delta",
];

export const DEFAULT_MISTAKES = [
  "Entrée anticipée",
  "FOMO",
  "Pas de confirmation",
  "Stop trop serré",
  "Sortie anticipée",
  "Contre-tendance",
  "Risque trop gros",
  "Revenge trade",
  "Hors plan",
];

export function emptyJournal(): BacktestJournal {
  return {
    entries: [],
    confluences: [...DEFAULT_CONFLUENCES],
    mistakes: [...DEFAULT_MISTAKES],
  };
}

const OUTCOMES: BacktestOutcome[] = ["win", "loss", "be"];

/** Nettoie une liste de tags : des chaînes non vides, sans doublon, dans
 *  l'ordre de première apparition. */
function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const label = String(item ?? "").trim();
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

function normalizeEntry(raw: Partial<BacktestEntry> | null | undefined, index: number): BacktestEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const date = String(raw.date ?? "").slice(0, 10);
  if (!date) return null;
  /* `Number(null)` vaut 0 : sans le test d'existence, une entrée sans R mesuré
     se retrouverait à 0R — c'est-à-dire au scratch, alors qu'elle vaut ±1R.
     La chaîne vide y est aussi : c'est ce que rend un champ de saisie vidé, et
     elle passerait le `Number.isFinite` toute seule. */
  const rawR: unknown = raw.r;
  const hasR = rawR !== null && rawR !== undefined && rawR !== "" && Number.isFinite(Number(rawR));
  return {
    id: String(raw.id ?? `${date}-${index}`),
    date,
    symbol: String(raw.symbol ?? "").trim(),
    direction: raw.direction === "short" ? "short" : "long",
    outcome: OUTCOMES.includes(raw.outcome as BacktestOutcome) ? (raw.outcome as BacktestOutcome) : "be",
    /* L'id est ramené à une chaîne : Supabase rend des uuid, les stratégies
       locales des nombres, et les deux finissent dans la même clé JSON. */
    strategyId: raw.strategyId == null || raw.strategyId === "" ? null : String(raw.strategyId),
    r: hasR ? Number(rawR) : null,
    confluences: cleanTags(raw.confluences),
    mistakes: cleanTags(raw.mistakes),
    better: String(raw.better ?? ""),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
}

/**
 * Normalise le magasin à la lecture — la voie du dépôt pour `useCloudState` :
 * un champ ajouté prend sa valeur par défaut chez les anciens utilisateurs,
 * sans migration.
 *
 * Les catalogues absorbent les tags employés par les entrées. C'est ce qui rend
 * le vocabulaire réparable : une case décochée partout puis retirée du
 * catalogue ne laisse pas d'entrée orpheline, et un journal restauré depuis une
 * sauvegarde retrouve ses cases même si les catalogues, eux, sont perdus.
 */
export function normalizeJournal(raw: unknown): BacktestJournal {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<BacktestJournal>;
  const entries = (Array.isArray(src.entries) ? src.entries : [])
    .map(normalizeEntry)
    .filter((e): e is BacktestEntry => e !== null)
    /* Le plus récent en tête : c'est l'ordre dans lequel on relit un journal. */
    .sort((a, b) => b.date.localeCompare(a.date));

  const used = (key: "confluences" | "mistakes") =>
    cleanTags([...(Array.isArray(src[key]) ? src[key] : []), ...entries.flatMap(e => e[key])]);

  const confluences = used("confluences");
  const mistakes = used("mistakes");
  return {
    entries,
    /* Catalogue vide ≠ catalogue absent : on ne repose les valeurs de départ
       que sur un magasin qui n'en a jamais eu, sinon un utilisateur qui a tout
       décoché verrait la liste d'usine revenir à chaque rechargement. */
    confluences: src.confluences === undefined && confluences.length === 0 ? [...DEFAULT_CONFLUENCES] : confluences,
    mistakes: src.mistakes === undefined && mistakes.length === 0 ? [...DEFAULT_MISTAKES] : mistakes,
  };
}

/** Le R qui compte : celui qu'on a mesuré, sinon ±1 selon le résultat. */
export function effectiveR(entry: Pick<BacktestEntry, "r" | "outcome">): number {
  if (entry.r !== null && Number.isFinite(entry.r)) return entry.r;
  if (entry.outcome === "win") return 1;
  if (entry.outcome === "loss") return -1;
  return 0;
}

export interface TagStat {
  tag: string;
  count: number;
  wins: number;
  losses: number;
  /** % entre 0 et 100, scratchs exclus du dénominateur. */
  winRate: number;
  totalR: number;
  avgR: number;
}

/**
 * Ce que rapporte chaque tag.
 *
 * C'est la raison d'être de la page : savoir laquelle de ses confluences tient
 * vraiment, et laquelle de ses erreurs coûte le plus. Une confluence présente
 * dans vingt backtests à 40 % de réussite se lit ici, et nulle part ailleurs.
 *
 * Les scratchs sortent du DÉNOMINATEUR du taux de réussite mais restent dans
 * `count` et dans `totalR` : ils ont eu lieu, ils ne tranchent simplement pas.
 * Sans cette distinction, dix scratchs feraient tomber une confluence à 50 %
 * alors qu'elle n'a pas perdu une fois.
 */
export function tagStats(entries: BacktestEntry[], key: "confluences" | "mistakes"): TagStat[] {
  return groupBy(entries, entry => entry[key]);
}

/**
 * Le même classement, mais par stratégie.
 *
 * Une stratégie est au backtest ce qu'une confluence est à une entrée : une
 * ligne de plus dans le même tableau, avec le même R et le même taux. D'où le
 * partage de `groupBy` — deux calculs séparés auraient fini par diverger sur le
 * traitement des scratchs, et la page dirait alors deux vérités.
 *
 * `tag` porte ici l'ID de la stratégie, pas son nom : les noms vivent dans la
 * table `strategies`, et un backtest doit survivre au renommage de la sienne.
 * Les backtests sans stratégie sortent du classement plutôt que de former une
 * ligne « (aucune) » qui ne se compare à rien.
 */
export function strategyStats(entries: BacktestEntry[]): TagStat[] {
  return groupBy(entries, entry => (entry.strategyId ? [entry.strategyId] : []));
}

function groupBy(entries: BacktestEntry[], keysOf: (entry: BacktestEntry) => string[]): TagStat[] {
  const acc = new Map<string, TagStat>();
  for (const entry of entries) {
    for (const tag of keysOf(entry)) {
      const stat = acc.get(tag) ?? { tag, count: 0, wins: 0, losses: 0, winRate: 0, totalR: 0, avgR: 0 };
      stat.count += 1;
      if (entry.outcome === "win") stat.wins += 1;
      if (entry.outcome === "loss") stat.losses += 1;
      stat.totalR += effectiveR(entry);
      acc.set(tag, stat);
    }
  }
  return [...acc.values()]
    .map(stat => {
      const decided = stat.wins + stat.losses;
      return {
        ...stat,
        winRate: decided > 0 ? Math.round((stat.wins / decided) * 100) : 0,
        avgR: stat.count > 0 ? stat.totalR / stat.count : 0,
      };
    })
    /* Trié par R total : c'est ce qu'on vient chercher. À égalité, le plus
       fréquent d'abord — un tag vu quinze fois vaut mieux qu'un vu une fois. */
    .sort((a, b) => (b.totalR - a.totalR) || (b.count - a.count));
}

export interface JournalSummary {
  count: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** % entre 0 et 100, scratchs exclus du dénominateur. */
  winRate: number;
  totalR: number;
  avgR: number;
}

/**
 * Le bilan du journal.
 *
 * Le taux de réussite se compte sur `outcome`, jamais sur le signe du R : le
 * résultat est DÉCLARÉ par l'utilisateur, le R n'est qu'une mesure — et une
 * sortie partielle peut très bien laisser un gagnant à +0,2R. Compter les
 * gagnants d'après le R ferait dire au tableau autre chose que ce qui a été
 * saisi.
 */
export function summarize(entries: BacktestEntry[]): JournalSummary {
  let wins = 0, losses = 0, breakevens = 0, totalR = 0;
  for (const entry of entries) {
    if (entry.outcome === "win") wins += 1;
    else if (entry.outcome === "loss") losses += 1;
    else breakevens += 1;
    totalR += effectiveR(entry);
  }
  const decided = wins + losses;
  return {
    count: entries.length,
    wins, losses, breakevens,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    totalR,
    avgR: entries.length > 0 ? totalR / entries.length : 0,
  };
}
