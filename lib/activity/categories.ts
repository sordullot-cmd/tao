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
 * Le classement est du texte contre du texte : le nom de l'application et le
 * titre de la fenêtre, en minuscules, comparés à des fragments. C'est volontaire
 * — aucune API ne dit « ceci est du développement », et un fragment reste
 * lisible et corrigeable par l'utilisateur (page Règles).
 */

import { PALETTE, PALETTE_DARK, GREY } from "@/lib/ui/palette";
import { getLang } from "@/lib/i18n";

export type Productivity = "productive" | "neutral" | "distracting";

export interface ActivityCategory {
  id: string;
  label: string;
  labelEn: string;
  color: string;
  productivity: Productivity;
}

/* Douze catégories : au-delà, l'anneau du jour devient illisible et le réglage
   des règles ne se fait plus. Les catégories « métier » de tao trade (trading)
   ont la leur — c'est le propos de l'app. */
export const CATEGORIES: ActivityCategory[] = [
  { id: "dev",       label: "Développement",     labelEn: "Development",   color: PALETTE.blue,        productivity: "productive" },
  { id: "trading",   label: "Trading & marchés", labelEn: "Trading",       color: PALETTE.green,       productivity: "productive" },
  { id: "writing",   label: "Écriture & notes",  labelEn: "Writing",       color: PALETTE.purple,      productivity: "productive" },
  { id: "design",    label: "Design",            labelEn: "Design",        color: PALETTE.pink,        productivity: "productive" },
  { id: "research",  label: "Recherche & lecture", labelEn: "Research",    color: PALETTE.brown,       productivity: "productive" },
  { id: "admin",     label: "Admin & gestion",   labelEn: "Admin",         color: PALETTE_DARK.blue,   productivity: "productive" },
  { id: "meetings",  label: "Réunions",          labelEn: "Meetings",      color: PALETTE.orange,      productivity: "neutral" },
  { id: "comms",     label: "Communication",     labelEn: "Communication", color: PALETTE.yellow,      productivity: "neutral" },
  { id: "utilities", label: "Utilitaires",       labelEn: "Utilities",     color: PALETTE_DARK.green,  productivity: "neutral" },
  { id: "social",    label: "Réseaux sociaux",   labelEn: "Social media",  color: PALETTE.red,         productivity: "distracting" },
  { id: "fun",       label: "Divertissement",    labelEn: "Entertainment", color: PALETTE_DARK.purple, productivity: "distracting" },
  { id: "other",     label: "Non classé",        labelEn: "Uncategorized", color: GREY.grey500,        productivity: "neutral" },
];

export const CATEGORY_BY_ID: Record<string, ActivityCategory> = Object.fromEntries(
  CATEGORIES.map(c => [c.id, c])
);

export const OTHER = "other";

/** Libellé de la catégorie dans la langue de l'interface. */
export function categoryLabel(id: string): string {
  const c = CATEGORY_BY_ID[id];
  if (!c) return id;
  return getLang() === "en" ? c.labelEn : c.label;
}

export function categoryColor(id: string): string {
  return CATEGORY_BY_ID[id]?.color ?? GREY.grey500;
}

export function productivityOf(id: string): Productivity {
  return CATEGORY_BY_ID[id]?.productivity ?? "neutral";
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

/* ─── Règles ──────────────────────────────────────────────────────────────
   Une règle = un fragment cherché dans le nom de l'app (`app`) ou dans le titre
   de la fenêtre (`title`), et la catégorie qui en découle. Les règles de
   l'utilisateur passent AVANT celles-ci : c'est ce qui rend le classement
   corrigeable sans toucher au code.
   ---------------------------------------------------------------------- */

export interface ClassifyRule {
  id: string;
  /** Fragment cherché, en minuscules. */
  match: string;
  /** Où le chercher. Par défaut : le nom de l'application. */
  field?: "app" | "title";
  /** Catégorie attribuée. */
  category: string;
}

/** Navigateurs : leur titre de fenêtre porte le vrai sujet, pas leur nom. */
export const BROWSERS = [
  "chrome", "chromium", "safari", "firefox", "edge", "msedge", "brave",
  "opera", "arc", "vivaldi", "orion", "zen browser",
];

export function isBrowser(app: string): boolean {
  const a = app.toLowerCase();
  return BROWSERS.some(b => a.includes(b));
}

/* Sites reconnus dans un titre de fenêtre de navigateur. Le titre est tout ce
   qu'on a : la WebView ne lit pas l'URL des AUTRES navigateurs, et aucune API
   système ne la donne. On cherche donc le nom du site, que la plupart des pages
   posent dans leur titre (« … — YouTube », « … · GitHub »). */
export const SITE_RULES: ClassifyRule[] = [
  // Développement
  { id: "s-github",    match: "github",        field: "title", category: "dev" },
  { id: "s-gitlab",    match: "gitlab",        field: "title", category: "dev" },
  { id: "s-stack",     match: "stack overflow",field: "title", category: "dev" },
  { id: "s-vercel",    match: "vercel",        field: "title", category: "dev" },
  { id: "s-supabase",  match: "supabase",      field: "title", category: "dev" },
  { id: "s-localhost", match: "localhost",     field: "title", category: "dev" },
  { id: "s-mdn",       match: "mdn web docs",  field: "title", category: "dev" },
  { id: "s-npm",       match: "npm",           field: "title", category: "dev" },
  // Trading
  { id: "s-tv",        match: "tradingview",   field: "title", category: "trading" },
  { id: "s-investing", match: "investing.com", field: "title", category: "trading" },
  { id: "s-binance",   match: "binance",       field: "title", category: "trading" },
  { id: "s-apex",      match: "apex trader",   field: "title", category: "trading" },
  { id: "s-ftmo",      match: "ftmo",          field: "title", category: "trading" },
  { id: "s-tradezella",match: "tradezella",    field: "title", category: "trading" },
  { id: "s-tao",       match: "tao trade",     field: "title", category: "trading" },
  { id: "s-boursorama",match: "boursorama",    field: "title", category: "trading" },
  // Réunions
  { id: "s-meet",      match: "google meet",   field: "title", category: "meetings" },
  { id: "s-zoom-web",  match: "zoom",          field: "title", category: "meetings" },
  { id: "s-whereby",   match: "whereby",       field: "title", category: "meetings" },
  // Communication
  { id: "s-gmail",     match: "gmail",         field: "title", category: "comms" },
  { id: "s-mail",      match: "boîte de réception", field: "title", category: "comms" },
  { id: "s-outlook",   match: "outlook",       field: "title", category: "comms" },
  { id: "s-whatsapp",  match: "whatsapp",      field: "title", category: "comms" },
  { id: "s-messenger", match: "messenger",     field: "title", category: "comms" },
  // Écriture & organisation
  { id: "s-notion",    match: "notion",        field: "title", category: "writing" },
  { id: "s-docs",      match: "google docs",   field: "title", category: "writing" },
  { id: "s-obsidian-w",match: "obsidian",      field: "title", category: "writing" },
  { id: "s-claude",    match: "claude",        field: "title", category: "research" },
  { id: "s-chatgpt",   match: "chatgpt",       field: "title", category: "research" },
  { id: "s-wikipedia", match: "wikipédia",     field: "title", category: "research" },
  { id: "s-wikipedia2",match: "wikipedia",     field: "title", category: "research" },
  { id: "s-medium",    match: "medium",        field: "title", category: "research" },
  { id: "s-arxiv",     match: "arxiv",         field: "title", category: "research" },
  // Admin
  { id: "s-sheets",    match: "google sheets", field: "title", category: "admin" },
  { id: "s-drive",     match: "google drive",  field: "title", category: "admin" },
  { id: "s-calendar",  match: "google agenda", field: "title", category: "admin" },
  { id: "s-calendar2", match: "google calendar",field: "title", category: "admin" },
  { id: "s-linear",    match: "linear",        field: "title", category: "admin" },
  { id: "s-jira",      match: "jira",          field: "title", category: "admin" },
  { id: "s-impots",    match: "impots.gouv",   field: "title", category: "admin" },
  // Design
  { id: "s-figma-w",   match: "figma",         field: "title", category: "design" },
  { id: "s-dribbble",  match: "dribbble",      field: "title", category: "design" },
  { id: "s-behance",   match: "behance",       field: "title", category: "design" },
  // Réseaux sociaux
  { id: "s-x",         match: "twitter",       field: "title", category: "social" },
  { id: "s-x2",        match: "/ x",           field: "title", category: "social" },
  { id: "s-insta",     match: "instagram",     field: "title", category: "social" },
  { id: "s-tiktok",    match: "tiktok",        field: "title", category: "social" },
  { id: "s-reddit",    match: "reddit",        field: "title", category: "social" },
  { id: "s-linkedin",  match: "linkedin",      field: "title", category: "social" },
  { id: "s-facebook",  match: "facebook",      field: "title", category: "social" },
  { id: "s-discord-w", match: "discord",       field: "title", category: "comms" },
  // Divertissement
  { id: "s-youtube",   match: "youtube",       field: "title", category: "fun" },
  { id: "s-netflix",   match: "netflix",       field: "title", category: "fun" },
  { id: "s-twitch",    match: "twitch",        field: "title", category: "fun" },
  { id: "s-primevideo",match: "prime video",   field: "title", category: "fun" },
  { id: "s-disney",    match: "disney+",       field: "title", category: "fun" },
  { id: "s-spotify-w", match: "spotify",       field: "title", category: "fun" },
  { id: "s-amazon",    match: "amazon",        field: "title", category: "fun" },
  { id: "s-leboncoin", match: "leboncoin",     field: "title", category: "fun" },
];

/** Applications de bureau reconnues, par nom de processus / d'app. */
export const APP_RULES: ClassifyRule[] = [
  // Développement
  { id: "a-code",      match: "code",          category: "dev" },
  { id: "a-cursor",    match: "cursor",        category: "dev" },
  { id: "a-webstorm",  match: "webstorm",      category: "dev" },
  { id: "a-intellij",  match: "intellij",      category: "dev" },
  { id: "a-pycharm",   match: "pycharm",       category: "dev" },
  { id: "a-xcode",     match: "xcode",         category: "dev" },
  { id: "a-androidst", match: "android studio",category: "dev" },
  { id: "a-sublime",   match: "sublime",       category: "dev" },
  { id: "a-vim",       match: "neovim",        category: "dev" },
  { id: "a-terminal",  match: "terminal",      category: "dev" },
  { id: "a-iterm",     match: "iterm",         category: "dev" },
  { id: "a-warp",      match: "warp",          category: "dev" },
  { id: "a-alacritty", match: "alacritty",     category: "dev" },
  { id: "a-powershell",match: "powershell",    category: "dev" },
  { id: "a-cmd",       match: "windowsterminal",category: "dev" },
  { id: "a-docker",    match: "docker",        category: "dev" },
  { id: "a-postman",   match: "postman",       category: "dev" },
  { id: "a-tableplus", match: "tableplus",     category: "dev" },
  { id: "a-sourcetree",match: "sourcetree",    category: "dev" },
  { id: "a-github-d",  match: "github desktop",category: "dev" },
  // Trading
  { id: "a-mt4",       match: "metatrader",    category: "trading" },
  { id: "a-mt5",       match: "terminal64",    category: "trading" },
  { id: "a-ninja",     match: "ninjatrader",   category: "trading" },
  { id: "a-tradovate", match: "tradovate",     category: "trading" },
  { id: "a-quantower", match: "quantower",     category: "trading" },
  { id: "a-ctrader",   match: "ctrader",       category: "trading" },
  { id: "a-tws",       match: "trader workstation", category: "trading" },
  { id: "a-tv-app",    match: "tradingview",   category: "trading" },
  { id: "a-sierra",    match: "sierra chart",  category: "trading" },
  // Écriture & notes
  { id: "a-obsidian",  match: "obsidian",      category: "writing" },
  { id: "a-notion-app",match: "notion",        category: "writing" },
  { id: "a-word",      match: "winword",       category: "writing" },
  { id: "a-word2",     match: "microsoft word",category: "writing" },
  { id: "a-pages",     match: "pages",         category: "writing" },
  { id: "a-notes",     match: "notes",         category: "writing" },
  { id: "a-bear",      match: "bear",          category: "writing" },
  { id: "a-textedit",  match: "textedit",      category: "writing" },
  // Design
  { id: "a-figma",     match: "figma",         category: "design" },
  { id: "a-photoshop", match: "photoshop",     category: "design" },
  { id: "a-illustrator",match:"illustrator",   category: "design" },
  { id: "a-affinity",  match: "affinity",      category: "design" },
  { id: "a-sketch",    match: "sketch",        category: "design" },
  { id: "a-blender",   match: "blender",       category: "design" },
  { id: "a-canva",     match: "canva",         category: "design" },
  { id: "a-premiere",  match: "premiere",      category: "design" },
  { id: "a-davinci",   match: "resolve",       category: "design" },
  // Réunions
  { id: "a-zoom",      match: "zoom",          category: "meetings" },
  { id: "a-teams",     match: "teams",         category: "meetings" },
  { id: "a-facetime",  match: "facetime",      category: "meetings" },
  { id: "a-webex",     match: "webex",         category: "meetings" },
  // Communication
  { id: "a-slack",     match: "slack",         category: "comms" },
  { id: "a-discord",   match: "discord",       category: "comms" },
  { id: "a-mail",      match: "mail",          category: "comms" },
  { id: "a-outlook-a", match: "outlook",       category: "comms" },
  { id: "a-thunderbird",match:"thunderbird",   category: "comms" },
  { id: "a-messages",  match: "messages",      category: "comms" },
  { id: "a-whatsapp-a",match: "whatsapp",      category: "comms" },
  { id: "a-telegram",  match: "telegram",      category: "comms" },
  { id: "a-signal",    match: "signal",        category: "comms" },
  // Admin & gestion
  { id: "a-excel",     match: "excel",         category: "admin" },
  { id: "a-numbers",   match: "numbers",       category: "admin" },
  { id: "a-calendar-a",match: "calendar",      category: "admin" },
  { id: "a-agenda",    match: "agenda",        category: "admin" },
  { id: "a-preview",   match: "preview",       category: "admin" },
  { id: "a-acrobat",   match: "acrobat",       category: "admin" },
  { id: "a-powerpoint",match: "powerpnt",      category: "admin" },
  { id: "a-keynote",   match: "keynote",       category: "admin" },
  // Utilitaires
  { id: "a-finder",    match: "finder",        category: "utilities" },
  { id: "a-explorer",  match: "explorer",      category: "utilities" },
  { id: "a-settings",  match: "systemsettings",category: "utilities" },
  { id: "a-prefs",     match: "réglages",      category: "utilities" },
  { id: "a-activity",  match: "activity monitor", category: "utilities" },
  { id: "a-taskmgr",   match: "taskmgr",       category: "utilities" },
  { id: "a-1password", match: "1password",     category: "utilities" },
  { id: "a-raycast",   match: "raycast",       category: "utilities" },
  { id: "a-alfred",    match: "alfred",        category: "utilities" },
  { id: "a-calc",      match: "calculator",    category: "utilities" },
  // Divertissement
  { id: "a-spotify",   match: "spotify",       category: "fun" },
  { id: "a-music",     match: "music",         category: "fun" },
  { id: "a-vlc",       match: "vlc",           category: "fun" },
  { id: "a-steam",     match: "steam",         category: "fun" },
  { id: "a-epic",      match: "epicgames",     category: "fun" },
  { id: "a-riot",      match: "riotclient",    category: "fun" },
  { id: "a-photos",    match: "photos",        category: "fun" },
  { id: "a-tv",        match: "apple tv",      category: "fun" },
];

/** Noms d'app rendus lisibles (le système donne des noms de binaires). */
const APP_LABELS: Record<string, string> = {
  code: "VS Code",
  "code - insiders": "VS Code Insiders",
  msedge: "Microsoft Edge",
  chrome: "Google Chrome",
  winword: "Word",
  powerpnt: "PowerPoint",
  excel: "Excel",
  explorer: "Explorateur de fichiers",
  taskmgr: "Gestionnaire des tâches",
  terminal64: "MetaTrader 5",
  windowsterminal: "Terminal",
  systemsettings: "Réglages système",
  riotclient: "Riot Client",
  epicgameslauncher: "Epic Games",
};

/** Nom d'application présentable, à partir du nom brut donné par l'OS. */
export function appLabel(app: string): string {
  const raw = (app || "").trim();
  if (!raw) return "Inconnu";
  const mapped = APP_LABELS[raw.toLowerCase()];
  if (mapped) return mapped;
  // « visual studio code » → « Visual Studio Code » ; les noms déjà capitalisés
  // par le système (macOS) ressortent inchangés.
  if (raw === raw.toLowerCase()) {
    return raw.replace(/\b\p{L}/gu, c => c.toUpperCase());
  }
  return raw;
}

/**
 * Site reconnu dans un titre de navigateur, pour l'afficher comme une « app »
 * à part entière (c'est ainsi qu'on lit son temps : « YouTube », pas « Chrome »).
 */
export function siteOf(title: string): string | null {
  const tl = (title || "").toLowerCase();
  for (const r of SITE_RULES) {
    if (r.match.length > 2 && tl.includes(r.match)) {
      return appLabel(r.match.replace(/\.(com|gouv|fr|org)$/, ""));
    }
  }
  return null;
}

/**
 * Classe un instantané (app + titre) en catégorie.
 *
 * Ordre : règles de l'utilisateur (les plus récentes d'abord, une correction
 * doit l'emporter), puis le titre pour les navigateurs, puis l'application,
 * puis le titre en dernier recours — un titre parle parfois d'un sujet que
 * l'application ne dit pas (un PDF de compta ouvert dans Preview).
 */
export function classify(
  app: string,
  title: string,
  userRules: ClassifyRule[] = []
): { category: string; label: string } {
  const al = (app || "").toLowerCase();
  const tl = (title || "").toLowerCase();

  const hit = (rules: ClassifyRule[]): string | null => {
    for (const r of rules) {
      if (!r.match) continue;
      const hay = r.field === "title" ? tl : al;
      if (hay.includes(r.match.toLowerCase())) return r.category;
    }
    return null;
  };

  const browser = isBrowser(al);
  const site = browser ? siteOf(title) : null;
  const label = site ?? appLabel(app);

  // 1. L'utilisateur d'abord (dernière règle écrite = première consultée).
  const mine = hit([...userRules].reverse());
  if (mine) return { category: mine, label };

  /* 2. Navigateur : le titre porte le sujet. Une page qu'on ne reconnaît pas
        reste NON CLASSÉE et non « recherche » : la ranger d'office dans une
        catégorie productive gonflerait le temps de focus de tout ce qu'on ne
        sait pas lire, et c'est précisément ce qu'un suivi ne doit pas faire.
        Elle remonte alors dans la file « applications non classées », où deux
        clics lui donnent sa catégorie. */
  if (browser) {
    const bySite = hit(SITE_RULES);
    return { category: bySite ?? OTHER, label };
  }

  // 3. L'application, puis son titre.
  const byApp = hit(APP_RULES);
  if (byApp) return { category: byApp, label };
  const byTitle = hit(SITE_RULES);
  if (byTitle) return { category: byTitle, label };

  return { category: OTHER, label };
}
