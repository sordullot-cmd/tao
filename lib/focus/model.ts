/**
 * Modèle de données du Focus — sessions de concentration et blocage.
 *
 * La mécanique est celle d'Opal : on ne se fie pas à la volonté au moment où
 * elle manque, on décide À FROID de ce qui sera inaccessible À CHAUD. Trois
 * objets suffisent à dire ça :
 *
 *   LISTE     un paquet d'applis et de sites (« Réseaux sociaux », « Paris »).
 *             C'est le vocabulaire : on ne re-choisit pas Instagram à chaque
 *             fois, on choisit une liste déjà faite.
 *   PRESET    une intention prête à lancer : une durée, des listes, un niveau
 *             de fermeté. « Deep work 90 min, tout coupé, impossible à quitter ».
 *   PROGRAMME une intention qui n'attend pas qu'on y pense : les mêmes réglages,
 *             mais déclenchés par l'horloge (lun–ven, 9 h, 3 h).
 *
 * Et un seul objet vivant : la SESSION en cours. Elle est persistée comme le
 * reste, donc un rechargement de page ne l'annule pas — c'est la première
 * condition pour qu'un blocage veuille dire quelque chose.
 *
 * Le niveau de fermeté (`FocusMode`) est le cœur du dispositif. Un blocage
 * qu'on lève d'un clic ne bloque rien : il informe. D'où trois crans, du plus
 * souple au plus ferme, cf. `MODES`.
 *
 * Tout est sérialisable en JSON : le magasin entier part dans `useCloudState`,
 * donc dans la table générique `user_productivity`. Aucune migration SQL.
 *
 * Portée du blocage — à lire avant de promettre quoi que ce soit à
 * l'utilisateur : le navigateur ne peut pas empêcher une autre application de
 * s'ouvrir. Ce que cette couche tient vraiment est décrit dans
 * `lib/focus/guard.ts`. Le modèle, lui, décrit l'intention complète : le jour où
 * la coquille Tauri saura couper une app au niveau du système, elle lira ces
 * mêmes listes sans qu'on y touche.
 */

/* ── Catégories ───────────────────────────────────────────────────────────── */

/** Familles de distractions. Sert à peupler une liste en un clic (« tout le
 *  divertissement ») et à ventiler les statistiques. */
export const CATEGORIES = [
  { id: "social",    label: "Réseaux sociaux",   color: "purple" },
  { id: "video",     label: "Vidéo & streaming", color: "red" },
  { id: "messaging", label: "Messagerie",        color: "blue" },
  { id: "news",      label: "Actualités",        color: "orange" },
  { id: "shopping",  label: "Achats",            color: "pink" },
  { id: "gaming",    label: "Jeux",              color: "green" },
  { id: "betting",   label: "Paris & casino",    color: "brown" },
  { id: "markets",   label: "Cours & marchés",   color: "yellow" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.id, c.label])
);
export const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.id, c.color])
);

/* ── Catalogue ────────────────────────────────────────────────────────────── */

export interface CatalogEntry {
  id: string;
  name: string;
  category: CategoryId;
  /** Domaines qui identifient le service. Le premier sert de repère visuel.
   *  Un domaine couvre ses sous-domaines (cf. `matchesDomain`). */
  domains: string[];
  /**
   * Noms de l'application de bureau, tels que le SYSTÈME les rapporte : nom de
   * l'app sur macOS, nom de l'exécutable sans « .exe » sur Windows. Les deux
   * coïncident le plus souvent (« Discord »), d'où une seule liste ; les cas
   * où ils divergent y figurent tous les deux (« Epic Games Launcher » /
   * « EpicGamesLauncher »).
   *
   * Absent quand le service n'a pas d'app de bureau : Instagram se bloque par
   * son domaine, pas par un processus qui n'existe pas.
   */
  apps?: string[];
}

/**
 * Les services que l'on bloque le plus souvent, prêts à cocher.
 *
 * Le catalogue n'a pas à être exhaustif — une liste accepte des entrées libres
 * (`custom`). Il doit couvrir ce qu'on coche sans réfléchir, pour que la
 * création d'une liste prenne dix secondes et pas dix minutes.
 *
 * « Cours & marchés » et « Paris & casino » ne sont pas là par hasard dans une
 * app de trading : rafraîchir un cours toutes les deux minutes et jouer sont
 * précisément les deux gestes que la page Discipline cherche à faire tomber.
 */
export const CATALOG: CatalogEntry[] = [
  // Réseaux sociaux
  { id: "instagram", name: "Instagram", category: "social", domains: ["instagram.com"] },
  { id: "tiktok",    name: "TikTok",    category: "social", domains: ["tiktok.com"] },
  { id: "x",         name: "X (Twitter)", category: "social", domains: ["x.com", "twitter.com", "t.co"] },
  { id: "facebook",  name: "Facebook",  category: "social", domains: ["facebook.com", "fb.com"] },
  { id: "reddit",    name: "Reddit",    category: "social", domains: ["reddit.com", "redd.it"] },
  { id: "snapchat",  name: "Snapchat",  category: "social", domains: ["snapchat.com"] },
  { id: "linkedin",  name: "LinkedIn",  category: "social", domains: ["linkedin.com"] },
  { id: "pinterest", name: "Pinterest", category: "social", domains: ["pinterest.com", "pinterest.fr"] },
  { id: "threads",   name: "Threads",   category: "social", domains: ["threads.net", "threads.com"] },
  // Vidéo & streaming
  { id: "youtube",   name: "YouTube",   category: "video", domains: ["youtube.com", "youtu.be"] },
  { id: "netflix",   name: "Netflix",   category: "video", domains: ["netflix.com"], apps: ["Netflix"] },
  { id: "twitch",    name: "Twitch",    category: "video", domains: ["twitch.tv"], apps: ["Twitch"] },
  { id: "primevideo", name: "Prime Video", category: "video", domains: ["primevideo.com"], apps: ["Prime Video"] },
  { id: "disney",    name: "Disney+",   category: "video", domains: ["disneyplus.com"], apps: ["Disney+"] },
  { id: "dailymotion", name: "Dailymotion", category: "video", domains: ["dailymotion.com"] },
  // Messagerie
  { id: "whatsapp",  name: "WhatsApp",  category: "messaging", domains: ["web.whatsapp.com", "whatsapp.com"], apps: ["WhatsApp"] },
  { id: "telegram",  name: "Telegram",  category: "messaging", domains: ["web.telegram.org", "telegram.org"], apps: ["Telegram", "Telegram Desktop", "Unigram"] },
  { id: "discord",   name: "Discord",   category: "messaging", domains: ["discord.com", "discordapp.com"], apps: ["Discord"] },
  { id: "messenger", name: "Messenger", category: "messaging", domains: ["messenger.com"], apps: ["Messenger"] },
  { id: "slack",     name: "Slack",     category: "messaging", domains: ["slack.com"], apps: ["Slack"] },
  // Actualités
  { id: "gnews",     name: "Google Actualités", category: "news", domains: ["news.google.com"] },
  { id: "lemonde",   name: "Le Monde",  category: "news", domains: ["lemonde.fr"] },
  { id: "lefigaro",  name: "Le Figaro", category: "news", domains: ["lefigaro.fr"] },
  { id: "bfmtv",     name: "BFMTV",     category: "news", domains: ["bfmtv.com"] },
  { id: "hn",        name: "Hacker News", category: "news", domains: ["news.ycombinator.com"] },
  // Achats
  { id: "amazon",    name: "Amazon",    category: "shopping", domains: ["amazon.fr", "amazon.com"] },
  { id: "vinted",    name: "Vinted",    category: "shopping", domains: ["vinted.fr", "vinted.com"] },
  { id: "leboncoin", name: "Leboncoin", category: "shopping", domains: ["leboncoin.fr"] },
  { id: "aliexpress", name: "AliExpress", category: "shopping", domains: ["aliexpress.com"] },
  // Jeux
  { id: "steam",     name: "Steam",     category: "gaming", domains: ["steampowered.com", "steamcommunity.com"], apps: ["Steam", "steamwebhelper"] },
  { id: "epic",      name: "Epic Games", category: "gaming", domains: ["epicgames.com"], apps: ["Epic Games Launcher", "EpicGamesLauncher"] },
  { id: "roblox",    name: "Roblox",    category: "gaming", domains: ["roblox.com"], apps: ["Roblox", "RobloxPlayerBeta"] },
  { id: "chesscom",  name: "Chess.com", category: "gaming", domains: ["chess.com"], apps: ["Chess.com"] },
  { id: "lichess",   name: "Lichess",   category: "gaming", domains: ["lichess.org"] },
  // Paris & casino
  { id: "winamax",   name: "Winamax",   category: "betting", domains: ["winamax.fr"], apps: ["Winamax"] },
  { id: "betclic",   name: "Betclic",   category: "betting", domains: ["betclic.fr"] },
  { id: "unibet",    name: "Unibet",    category: "betting", domains: ["unibet.fr"] },
  { id: "pokerstars", name: "PokerStars", category: "betting", domains: ["pokerstars.fr", "pokerstars.com"], apps: ["PokerStars"] },
  // Cours & marchés
  { id: "tradingview", name: "TradingView", category: "markets", domains: ["tradingview.com"], apps: ["TradingView"] },
  { id: "binance",   name: "Binance",   category: "markets", domains: ["binance.com"], apps: ["Binance"] },
  { id: "coinbase",  name: "Coinbase",  category: "markets", domains: ["coinbase.com"] },
  { id: "coingecko", name: "CoinGecko", category: "markets", domains: ["coingecko.com", "coinmarketcap.com"] },
  { id: "boursorama", name: "Boursorama", category: "markets", domains: ["boursorama.com"] },
];

export const CATALOG_BY_ID: Record<string, CatalogEntry> = Object.fromEntries(
  CATALOG.map(e => [e.id, e])
);

/** Entrées du catalogue d'une catégorie. */
export function catalogOf(category: CategoryId): CatalogEntry[] {
  return CATALOG.filter(e => e.category === category);
}

/* ── Listes de blocage ────────────────────────────────────────────────────── */

/** Site ou appli ajouté à la main : ce que le catalogue ne connaît pas. */
export interface CustomTarget {
  id: string;
  name: string;
  /** Domaine nu, sans schéma ni chemin (`exemple.fr`). Vide pour une appli. */
  domain: string;
  /**
   * Nom de l'application, tel que le système la rapporte. Une entrée porte
   * l'un OU l'autre : « steam.com » se coupe par le domaine, « Photoshop » par
   * le processus. `cleanTarget` tranche à la saisie.
   */
  app?: string;
}

export interface Blocklist {
  id: string;
  name: string;
  /** Une des clés de `PALETTE` (lib/ui/palette). */
  color: string;
  /** Identifiants du catalogue retenus. */
  itemIds: string[];
  custom: CustomTarget[];
  /**
   * `block` : tout ce qui est listé est coupé, le reste passe.
   * `allow` : l'inverse — SEUL ce qui est listé passe, tout le reste est coupé.
   *
   * Le second cran est celui d'Opal en « allowlist », et c'est le seul qui tient
   * quand on ne sait pas d'avance par où la distraction va arriver.
   */
  mode: "block" | "allow";
}

/* ── Niveaux de fermeté ───────────────────────────────────────────────────── */

export type FocusMode = "normal" | "deep" | "locked";

/**
 * Ce qu'il faut faire pour interrompre une session, par cran.
 *
 * `friction` n'est pas de la décoration : c'est la seule variable qui décide si
 * la session tient. Le geste doit coûter plus cher que l'envie qui le motive,
 * sans devenir un piège — d'où le nombre limité de sorties de secours en mode
 * verrouillé plutôt qu'aucune.
 */
export const MODES: Record<FocusMode, {
  id: FocusMode;
  label: string;
  hint: string;
  /** Comment on arrête avant la fin. */
  exit: "free" | "typed" | "emergency";
  /** Nombre de sorties de secours autorisées (mode verrouillé). */
  emergencies: number;
  /** Pauses autorisées dans la session. */
  breaks: number;
  color: string;
}> = {
  normal: {
    id: "normal", label: "Souple", exit: "free", emergencies: Infinity, breaks: 3,
    hint: "Arrêt possible à tout moment. Pour les journées où le minuteur suffit.",
    color: "blue",
  },
  deep: {
    id: "deep", label: "Profond", exit: "typed", emergencies: Infinity, breaks: 1,
    hint: "Pour arrêter, il faut recopier une phrase. Assez long pour que l'envie passe.",
    color: "purple",
  },
  locked: {
    id: "locked", label: "Verrouillé", exit: "emergency", emergencies: 1, breaks: 0,
    hint: "Aucun arrêt, sauf une sortie de secours unique. La session décide, pas vous.",
    color: "red",
  },
};

/** Phrase à recopier pour quitter une session en mode profond. */
export const EXIT_PHRASE = "je choisis de perdre cette session";

/* ── Presets ──────────────────────────────────────────────────────────────── */

export interface FocusPreset {
  id: string;
  name: string;
  durationMin: number;
  blocklistIds: string[];
  mode: FocusMode;
  color: string;
  /** Icône Lucide, par nom — cf. `PRESET_ICONS` dans components/focus. */
  icon: string;
}

/* ── Programmes ───────────────────────────────────────────────────────────── */

export interface FocusSchedule {
  id: string;
  name: string;
  presetId: string | null;
  /** Jours actifs, 0 = lundi … 6 = dimanche. */
  days: number[];
  /** Début, en minutes depuis minuit (9 h 30 → 570). */
  startMin: number;
  durationMin: number;
  enabled: boolean;
  /** Réglages du programme, quand il ne suit pas un preset. */
  blocklistIds: string[];
  mode: FocusMode;
  /** Date (AAAA-MM-JJ) du dernier déclenchement, pour ne pas relancer deux fois. */
  lastFired?: string | null;
}

export const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Jour de la semaine en base lundi (0) — `getDay()` compte à partir de dimanche. */
export function weekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/* ── Session ──────────────────────────────────────────────────────────────── */

/** Une tentative d'ouvrir ce qui est bloqué, ou un écart constaté. */
export interface FocusAttempt {
  /** Identifiant catalogue, domaine libre, ou `away` pour une sortie de l'app. */
  target: string;
  at: string;
  /** Par où la tentative est passée (cf. `GuardHit` dans guard.ts). Absent sur
   *  les sessions d'avant le blocage natif : les statistiques ne s'en servent
   *  que pour nuancer un libellé, jamais pour compter. */
  kind?: "url" | "site" | "app" | "window" | "away";
  /** Temps passé dehors, pour un écart (ms). */
  awayMs?: number;
}

export interface RunningSession {
  id: string;
  name: string;
  presetId: string | null;
  startedAt: string;
  /** Durée visée (ms). 0 = chronomètre libre, sans fin. */
  plannedMs: number;
  blocklistIds: string[];
  mode: FocusMode;
  /** Début de la pause en cours, s'il y en a une. */
  pausedAt: string | null;
  /** Total des pauses déjà terminées (ms). */
  pausedMs: number;
  breaks: number;
  emergencies: number;
  attempts: FocusAttempt[];
}

/** Session terminée, telle qu'elle part au journal. */
export interface SessionLog {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  plannedMs: number;
  /** Temps réellement concentré : total moins les pauses. */
  focusedMs: number;
  mode: FocusMode;
  blocklistIds: string[];
  breaks: number;
  attempts: FocusAttempt[];
  /** Vraie si la session est allée au bout de sa durée visée. */
  completed: boolean;
  /** Comment elle s'est arrêtée : d'elle-même, abandonnée, ou par la sortie de
   *  secours du mode verrouillé. Écrit par la page qui ferme la session. */
  endedBy?: "completed" | "abandoned" | "emergency";
}

/* ── Réglages ─────────────────────────────────────────────────────────────── */

export interface FocusSettings {
  /** Objectif quotidien de temps concentré (minutes). Décide de la série. */
  dailyGoalMin: number;
  /** Notifier au début et à la fin d'une session. */
  notify: boolean;
  /** Lancer les programmes tout seuls quand l'app est ouverte. */
  autoSchedule: boolean;
  /** Compter une sortie de l'app comme un écart au-delà de ce délai (secondes). */
  awayGraceSec: number;
}

/* ── Magasin ──────────────────────────────────────────────────────────────── */

export interface FocusStore {
  version: number;
  blocklists: Blocklist[];
  presets: FocusPreset[];
  schedules: FocusSchedule[];
  running: RunningSession | null;
  log: SessionLog[];
  settings: FocusSettings;
}

export const STORE_VERSION = 1;

let seq = 0;
/** Identifiant court, unique dans la session de navigation. */
export function newId(prefix = "f"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

/**
 * Magasin de départ — quatre listes et quatre intentions, pas une page vide.
 *
 * Un écran de blocage vide ne se remplit jamais : au premier passage on veut
 * pouvoir lancer « Deep work » sans avoir d'abord composé une liste. Les
 * identifiants sont fixes (`bl-social`, `p-deep`…) pour que les presets puissent
 * pointer dessus sans passer par une résolution de noms.
 */
export function emptyStore(): FocusStore {
  const listOf = (category: CategoryId) => catalogOf(category).map(e => e.id);
  const blocklists: Blocklist[] = [
    { id: "bl-social", name: "Réseaux sociaux", color: "purple", itemIds: listOf("social"), custom: [], mode: "block" },
    { id: "bl-video",  name: "Vidéo & streaming", color: "red",  itemIds: listOf("video"),  custom: [], mode: "block" },
    { id: "bl-msg",    name: "Messagerie",      color: "blue",   itemIds: listOf("messaging"), custom: [], mode: "block" },
    {
      id: "bl-noise", name: "Bruit de fond", color: "orange",
      itemIds: [...listOf("news"), ...listOf("shopping")], custom: [], mode: "block",
    },
    {
      id: "bl-market", name: "Cours & paris", color: "brown",
      itemIds: [...listOf("markets"), ...listOf("betting")], custom: [], mode: "block",
    },
  ];
  const presets: FocusPreset[] = [
    { id: "p-deep",  name: "Deep work", durationMin: 90, blocklistIds: ["bl-social", "bl-video", "bl-msg", "bl-noise"], mode: "deep", color: "purple", icon: "brain" },
    { id: "p-pomo",  name: "Pomodoro",  durationMin: 25, blocklistIds: ["bl-social", "bl-video"], mode: "normal", color: "blue", icon: "timer" },
    { id: "p-trade", name: "Séance de marché", durationMin: 60, blocklistIds: ["bl-social", "bl-video", "bl-msg"], mode: "deep", color: "green", icon: "target" },
    { id: "p-night", name: "Coupure du soir", durationMin: 120, blocklistIds: ["bl-social", "bl-video", "bl-msg", "bl-noise", "bl-market"], mode: "locked", color: "red", icon: "moon" },
  ];
  return {
    version: STORE_VERSION,
    blocklists,
    presets,
    schedules: [],
    running: null,
    log: [],
    settings: { dailyGoalMin: 120, notify: true, autoSchedule: true, awayGraceSec: 25 },
  };
}

/**
 * Complète un magasin lu du stockage.
 *
 * Fait à la LECTURE, et non par une migration écrite : la valeur vient d'une
 * clé JSON générique, possiblement écrite par une version antérieure de la page
 * ou par un autre appareil. Compléter ici évite un aller-retour de
 * synchronisation au premier chargement, et rend le magasin tolérant à une clé
 * absente sans la répandre dans tout le rendu.
 */
export function normalizeStore(raw: unknown): FocusStore {
  const base = emptyStore();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<FocusStore>;
  const settings = { ...base.settings, ...(s.settings || {}) };
  return {
    version: STORE_VERSION,
    blocklists: Array.isArray(s.blocklists) && s.blocklists.length
      ? s.blocklists.map(normalizeBlocklist)
      : base.blocklists,
    presets: Array.isArray(s.presets) && s.presets.length
      ? s.presets.map(normalizePreset)
      : base.presets,
    schedules: Array.isArray(s.schedules) ? s.schedules.map(normalizeSchedule) : [],
    running: s.running && typeof s.running === "object" ? normalizeRunning(s.running) : null,
    log: Array.isArray(s.log) ? s.log.filter(e => e && e.startedAt) : [],
    settings,
  };
}

function normalizeBlocklist(b: Blocklist): Blocklist {
  return {
    id: b.id || newId("bl"),
    name: b.name || "Liste",
    color: b.color || "purple",
    itemIds: Array.isArray(b.itemIds) ? b.itemIds : [],
    custom: Array.isArray(b.custom) ? b.custom : [],
    mode: b.mode === "allow" ? "allow" : "block",
  };
}

function normalizePreset(p: FocusPreset): FocusPreset {
  return {
    id: p.id || newId("p"),
    name: p.name || "Session",
    durationMin: Number.isFinite(p.durationMin) ? p.durationMin : 25,
    blocklistIds: Array.isArray(p.blocklistIds) ? p.blocklistIds : [],
    mode: p.mode in MODES ? p.mode : "normal",
    color: p.color || "blue",
    icon: p.icon || "timer",
  };
}

function normalizeSchedule(s: FocusSchedule): FocusSchedule {
  return {
    id: s.id || newId("s"),
    name: s.name || "Programme",
    presetId: s.presetId ?? null,
    days: Array.isArray(s.days) ? s.days.filter(d => d >= 0 && d <= 6) : [0, 1, 2, 3, 4],
    startMin: Number.isFinite(s.startMin) ? s.startMin : 9 * 60,
    durationMin: Number.isFinite(s.durationMin) ? s.durationMin : 60,
    enabled: s.enabled !== false,
    blocklistIds: Array.isArray(s.blocklistIds) ? s.blocklistIds : [],
    mode: s.mode in MODES ? s.mode : "normal",
    lastFired: s.lastFired ?? null,
  };
}

function normalizeRunning(r: RunningSession): RunningSession {
  return {
    id: r.id || newId("run"),
    name: r.name || "Session",
    presetId: r.presetId ?? null,
    startedAt: r.startedAt || new Date().toISOString(),
    plannedMs: Number.isFinite(r.plannedMs) ? r.plannedMs : 0,
    blocklistIds: Array.isArray(r.blocklistIds) ? r.blocklistIds : [],
    mode: r.mode in MODES ? r.mode : "normal",
    pausedAt: r.pausedAt ?? null,
    pausedMs: Number.isFinite(r.pausedMs) ? r.pausedMs : 0,
    breaks: Number.isFinite(r.breaks) ? r.breaks : 0,
    emergencies: Number.isFinite(r.emergencies) ? r.emergencies : 0,
    attempts: Array.isArray(r.attempts) ? r.attempts : [],
  };
}

/* ── Cycle de vie d'une session ───────────────────────────────────────────── */

export interface StartOptions {
  name: string;
  durationMin: number;
  blocklistIds: string[];
  mode: FocusMode;
  presetId?: string | null;
}

export function startSession(opts: StartOptions, now = new Date()): RunningSession {
  return {
    id: newId("run"),
    name: opts.name,
    presetId: opts.presetId ?? null,
    startedAt: now.toISOString(),
    plannedMs: Math.max(0, Math.round(opts.durationMin * 60_000)),
    blocklistIds: opts.blocklistIds,
    mode: opts.mode,
    pausedAt: null,
    pausedMs: 0,
    breaks: 0,
    emergencies: 0,
    attempts: [],
  };
}

export function sessionFromPreset(p: FocusPreset, now = new Date()): RunningSession {
  return startSession({
    name: p.name, durationMin: p.durationMin, blocklistIds: p.blocklistIds,
    mode: p.mode, presetId: p.id,
  }, now);
}

/** Temps écoulé HORS pauses (ms). C'est le temps « concentré ». */
export function focusedMs(r: RunningSession, now = new Date()): number {
  const gross = now.getTime() - new Date(r.startedAt).getTime();
  const pausing = r.pausedAt ? now.getTime() - new Date(r.pausedAt).getTime() : 0;
  return Math.max(0, gross - r.pausedMs - pausing);
}

/** Temps restant (ms), ou `null` pour un chronomètre libre. */
export function remainingMs(r: RunningSession, now = new Date()): number | null {
  if (!r.plannedMs) return null;
  return Math.max(0, r.plannedMs - focusedMs(r, now));
}

/** Fraction accomplie, entre 0 et 1. Un chronomètre libre n'en a pas : 0. */
export function progress(r: RunningSession, now = new Date()): number {
  if (!r.plannedMs) return 0;
  return Math.min(1, focusedMs(r, now) / r.plannedMs);
}

/** La durée visée est-elle atteinte ? */
export function isDone(r: RunningSession, now = new Date()): boolean {
  return Boolean(r.plannedMs) && focusedMs(r, now) >= r.plannedMs;
}

/** Peut-on encore mettre en pause ? Le mode verrouillé n'en donne aucune. */
export function canPause(r: RunningSession): boolean {
  if (r.pausedAt) return true; // reprendre est toujours permis
  return r.breaks < MODES[r.mode].breaks;
}

export function pause(r: RunningSession, now = new Date()): RunningSession {
  if (r.pausedAt) return r;
  return { ...r, pausedAt: now.toISOString(), breaks: r.breaks + 1 };
}

export function resume(r: RunningSession, now = new Date()): RunningSession {
  if (!r.pausedAt) return r;
  const add = now.getTime() - new Date(r.pausedAt).getTime();
  return { ...r, pausedAt: null, pausedMs: r.pausedMs + Math.max(0, add) };
}

/** Ferme la session et produit son entrée de journal. */
export function closeSession(r: RunningSession, now = new Date()): SessionLog {
  const done = isDone(r, now);
  return {
    id: r.id,
    name: r.name,
    startedAt: r.startedAt,
    endedAt: now.toISOString(),
    plannedMs: r.plannedMs,
    focusedMs: focusedMs(r, now),
    mode: r.mode,
    blocklistIds: r.blocklistIds,
    breaks: r.breaks,
    attempts: r.attempts,
    completed: done,
  };
}

/* ── Correspondance d'URL ─────────────────────────────────────────────────── */

/** Domaine nu d'une URL, ou `null` si elle n'en porte pas (mailto:, #ancre…). */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url, typeof window === "undefined" ? "https://x" : window.location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** `m.youtube.com` correspond à `youtube.com` ; `notyoutube.com` non. */
export function matchesDomain(host: string, domain: string): boolean {
  const d = domain.replace(/^www\./, "").toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

/** Tous les domaines couverts par une liste, catalogue et entrées libres. */
export function listDomains(b: Blocklist): string[] {
  const fromCatalog = b.itemIds.flatMap(id => CATALOG_BY_ID[id]?.domains || []);
  const fromCustom = b.custom.map(c => c.domain).filter(Boolean);
  return [...fromCatalog, ...fromCustom];
}

/** Toutes les applications couvertes par une liste. */
export function listApps(b: Blocklist): string[] {
  const fromCatalog = b.itemIds.flatMap(id => CATALOG_BY_ID[id]?.apps || []);
  const fromCustom = b.custom.map(c => c.app || "").filter(Boolean);
  return [...fromCatalog, ...fromCustom];
}

/** Nom lisible d'une cible, pour l'écran de blocage et les statistiques. */
export function targetLabel(target: string, store: FocusStore): string {
  if (target === "away") return "Sortie de l'app";
  const entry = CATALOG_BY_ID[target];
  if (entry) return entry.name;
  for (const b of store.blocklists) {
    const c = b.custom.find(x => x.id === target || x.domain === target || x.app === target);
    if (c) return c.name || c.domain || c.app || target;
  }
  return target;
}

export interface BlockVerdict {
  blocked: boolean;
  /** Liste responsable de la décision. */
  list?: Blocklist;
  /** Identifiant catalogue, ou domaine pour une entrée libre. */
  target?: string;
}

/**
 * Cette URL est-elle coupée par les listes actives ?
 *
 * Une liste en mode `allow` inverse la question : ce qui n'y figure PAS est
 * coupé. Quand plusieurs listes sont actives, il suffit qu'une seule coupe —
 * une session ne se relâche pas parce qu'on lui a ajouté une liste.
 */
export function verdictFor(url: string, store: FocusStore, blocklistIds: string[]): BlockVerdict {
  const host = hostOf(url);
  if (!host) return { blocked: false };
  /* L'app elle-même passe TOUJOURS, quoi qu'en disent les listes. Sans cette
     ligne, une liste en mode « seuls autorisés » couperait ses propres liens
     internes — et donc l'écran depuis lequel on arrête la session. Un blocage
     qui enferme l'utilisateur hors de son outil n'est pas un blocage ferme,
     c'est une panne. */
  if (typeof window !== "undefined" && host === hostOf(window.location.href)) {
    return { blocked: false };
  }
  const lists = store.blocklists.filter(b => blocklistIds.includes(b.id));
  for (const b of lists) {
    const hit = findTarget(host, b);
    if (b.mode === "allow") {
      if (!hit) return { blocked: true, list: b, target: host };
    } else if (hit) {
      return { blocked: true, list: b, target: hit };
    }
  }
  return { blocked: false };
}

/** Identifiant de la cible d'une liste qui couvre cet hôte, sinon `null`. */
function findTarget(host: string, b: Blocklist): string | null {
  for (const id of b.itemIds) {
    const entry = CATALOG_BY_ID[id];
    if (entry && entry.domains.some(d => matchesDomain(host, d))) return id;
  }
  for (const c of b.custom) {
    if (c.domain && matchesDomain(host, c.domain)) return c.id || c.domain;
  }
  return null;
}

/* ── Applications et fenêtres ─────────────────────────────────────────────── */

/**
 * Ce que le garde natif ne coupe JAMAIS.
 *
 * Sans cette liste, une liste en mode « seuls autorisés » reprendrait la main
 * sur le Finder, sur l'explorateur de fichiers ou sur les réglages du système —
 * c'est-à-dire sur les outils qui servent à s'en sortir. Un blocage qui rend le
 * poste inutilisable n'est pas ferme, c'est une panne (même raison que
 * l'exception de `verdictFor` pour l'app elle-même).
 */
const SYSTEM_APPS = new Set([
  // macOS
  "finder", "dock", "systemuiserver", "controlcenter", "notificationcenter",
  "loginwindow", "windowserver", "spotlight", "system settings",
  "system preferences", "securityagent", "universalaccessauthwarn",
  "coreautha", "screensaverengine", "installer", "keychain access",
  // Windows
  "explorer", "shellexperiencehost", "startmenuexperiencehost", "searchhost",
  "searchapp", "applicationframehost", "textinputhost", "lockapp", "logonui",
  "systemsettings", "taskmgr", "dwm", "sihost", "ctfmon", "consent",
]);

/** L'app elle-même, sous les noms que lui donne le système selon la build. */
const SELF_APPS = new Set(["tao trade", "taotrade", "app"]);

/**
 * Navigateurs — traités à part, et pour une raison précise.
 *
 * Un navigateur n'est pas une distraction : c'est un contenant. Le couper en
 * bloc parce qu'un onglet YouTube y traîne couperait aussi la documentation
 * ouverte à côté. C'est donc le SITE qu'on juge, jamais le navigateur.
 *
 * Le chemin normal passe par l'URL de l'onglet actif, lue par la coquille de
 * bureau et tranchée par `verdictFor` — mêmes règles que pour un lien cliqué
 * dans l'app, sous-domaines et mode « seuls autorisés » compris.
 *
 * `appVerdictFor` n'intervient sur un navigateur qu'en REPLI, quand cette URL
 * n'a pas pu être lue : Firefox, Windows, ou autorisation d'automatisation
 * refusée. Il ne lui reste alors que le TITRE de la fenêtre, qui porte le nom du
 * site actif — et jamais en mode « seuls autorisés », où un titre ne suffit pas
 * à prouver qu'un onglet est permis.
 */
const BROWSER_APPS = new Set([
  "google chrome", "chrome", "chromium", "safari", "firefox", "librewolf",
  "microsoft edge", "msedge", "brave browser", "brave", "opera", "opera gx",
  "arc", "vivaldi", "zen", "tor browser", "duckduckgo",
]);

/**
 * Cette application est-elle un navigateur ?
 *
 * Le garde s'en sert pour choisir sa question : sur un navigateur, il demande
 * l'URL de l'onglet actif (précise, jugeable par `verdictFor`) ; ailleurs, le
 * nom de l'appli suffit.
 */
export function isBrowserApp(app: string): boolean {
  return BROWSER_APPS.has(normApp(app));
}

/** Nom d'appli ramené à une forme comparable : minuscules, sans « .exe ». */
export function normApp(name: string): string {
  return (name || "").trim().replace(/\.exe$/i, "").toLowerCase();
}

/** `Telegram` couvre `Telegram Desktop` ; `Tel` ne couvre rien. */
export function matchesApp(front: string, listed: string): boolean {
  const a = normApp(front);
  const b = normApp(listed);
  if (!a || !b) return false;
  // Le préfixe n'est retenu que s'il s'arrête sur une frontière de mot :
  // sinon « Steam » couvrirait « Steamworks Common Redistributables ».
  return a === b || (a.startsWith(b) && /[^a-z0-9]/.test(a.charAt(b.length)));
}

/**
 * Ce titre de fenêtre porte-t-il le nom d'une cible de la liste ?
 *
 * On cherche le nom du service et la racine de ses domaines (`youtube` pour
 * `youtube.com`) comme MOTS ENTIERS. Les racines de moins de trois lettres sont
 * écartées — `x.com` ferait feu sur presque tous les titres.
 */
function findTitleTarget(title: string, b: Blocklist): string | null {
  const t = (title || "").toLowerCase();
  if (!t) return null;
  const hit = (needle: string) => {
    const n = needle.toLowerCase();
    if (n.length < 3) return false;
    const i = t.indexOf(n);
    if (i < 0) return false;
    const before = i === 0 ? "" : t.charAt(i - 1);
    const after = t.charAt(i + n.length);
    return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
  };
  for (const id of b.itemIds) {
    const e = CATALOG_BY_ID[id];
    if (!e) continue;
    if (hit(e.name) || e.domains.some(d => hit(d.replace(/^www\./, "").split(".")[0]))) return id;
  }
  for (const c of b.custom) {
    if (c.domain && hit(c.domain.split(".")[0])) return c.id || c.domain;
  }
  return null;
}

/** Identifiant de la cible d'une liste qui couvre cette appli, sinon `null`. */
function findAppTarget(app: string, b: Blocklist): string | null {
  for (const id of b.itemIds) {
    const e = CATALOG_BY_ID[id];
    if (e?.apps?.some(a => matchesApp(app, a))) return id;
  }
  for (const c of b.custom) {
    if (c.app && matchesApp(app, c.app)) return c.id || c.app;
  }
  return null;
}

export interface AppVerdict extends BlockVerdict {
  /** Ce qui a tranché : l'appli elle-même, ou le titre de sa fenêtre. */
  via?: "app" | "window";
}

/**
 * Cette application au premier plan est-elle coupée par les listes actives ?
 *
 * C'est le pendant de `verdictFor` pour ce qui vit HORS du navigateur, et il
 * n'a de sens que dans l'app de bureau : une page web ne sait pas quelle appli
 * est devant (cf. `lib/focus/guard.ts`).
 *
 * Trois refus d'emblée, avant même de regarder les listes : l'app elle-même, la
 * coquille du système, et un relevé vide — mieux vaut ne rien couper que couper
 * au hasard sur un nom d'appli qu'on n'a pas su lire.
 */
export function appVerdictFor(
  app: string,
  title: string,
  store: FocusStore,
  blocklistIds: string[]
): AppVerdict {
  const name = normApp(app);
  if (!name || SELF_APPS.has(name) || SYSTEM_APPS.has(name)) return { blocked: false };
  const browser = BROWSER_APPS.has(name);

  const lists = store.blocklists.filter(b => blocklistIds.includes(b.id));
  for (const b of lists) {
    if (b.mode === "allow") {
      // Le navigateur échappe au mode « seuls autorisés » : son titre dit quel
      // site est devant, pas si TOUS les onglets sont permis. Le garde du
      // navigateur (guard.ts) reste seul juge à l'intérieur.
      if (browser) continue;
      if (!findAppTarget(name, b)) return { blocked: true, list: b, target: app, via: "app" };
      continue;
    }
    if (!browser) {
      const hit = findAppTarget(name, b);
      if (hit) return { blocked: true, list: b, target: hit, via: "app" };
      continue;
    }
    const hit = findTitleTarget(title, b);
    if (hit) return { blocked: true, list: b, target: hit, via: "window" };
  }
  return { blocked: false };
}

/** Nombre de cibles d'une liste — ce qui s'affiche sous son nom. */
export function listSize(b: Blocklist): number {
  return b.itemIds.length + b.custom.filter(c => c.domain || c.app).length;
}

/* ── Programmes : quand déclencher ────────────────────────────────────────── */

/** Date locale au format AAAA-MM-JJ (clé de journée du magasin). */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function fmtHhMm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Le programme doit-il partir maintenant ?
 *
 * Fenêtre de rattrapage de 5 minutes plutôt qu'un instant exact : l'app n'est
 * pas forcément ouverte à la seconde prévue, et une session lancée à 9 h 03 vaut
 * mieux qu'une session sautée. Au-delà, on ne rattrape pas — démarrer un « 9 h »
 * à 11 h ne sert plus l'intention.
 */
export const CATCH_UP_MIN = 5;

export function shouldFire(s: FocusSchedule, now = new Date()): boolean {
  if (!s.enabled) return false;
  if (!s.days.includes(weekday(now))) return false;
  if (s.lastFired === dayKey(now)) return false;
  const cur = minutesOfDay(now);
  return cur >= s.startMin && cur < s.startMin + CATCH_UP_MIN;
}

/** Prochain déclenchement, en texte lisible (« demain 09:00 »), ou null. */
export function nextRun(s: FocusSchedule, now = new Date()): string | null {
  if (!s.enabled || !s.days.length) return null;
  const today = weekday(now);
  for (let offset = 0; offset < 8; offset++) {
    const day = (today + offset) % 7;
    if (!s.days.includes(day)) continue;
    if (offset === 0 && minutesOfDay(now) >= s.startMin) continue;
    const when = fmtHhMm(s.startMin);
    if (offset === 0) return `aujourd'hui ${when}`;
    if (offset === 1) return `demain ${when}`;
    return `${DAY_LABELS[day].toLowerCase()} ${when}`;
  }
  return null;
}

/** Session décrite par un programme, prête à démarrer. */
export function sessionFromSchedule(s: FocusSchedule, store: FocusStore, now = new Date()): RunningSession {
  const preset = s.presetId ? store.presets.find(p => p.id === s.presetId) : null;
  return startSession({
    name: s.name || preset?.name || "Programme",
    durationMin: s.durationMin || preset?.durationMin || 60,
    blocklistIds: s.blocklistIds.length ? s.blocklistIds : (preset?.blocklistIds || []),
    mode: s.blocklistIds.length ? s.mode : (preset?.mode || s.mode),
    presetId: preset?.id ?? null,
  }, now);
}
