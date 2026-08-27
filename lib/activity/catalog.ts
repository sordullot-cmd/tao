/**
 * Catalogue des applications et des sites reconnus par le suivi d'activité.
 *
 * ── Pourquoi un fichier à part ────────────────────────────────────────────
 * Le classement d'avant tenait dans deux listes de fragments cherchés en
 * `includes()` : « code », « mail », « pages ». Deux défauts, tous les deux
 * visibles à l'écran :
 *
 *   • il manquait presque tout — Riot Client, League of Legends, Steam, et
 *     jusqu'à tao trade lui-même (dont le processus s'appelle « tao ») tombaient
 *     dans « Non classé », qui finissait première catégorie de la journée ;
 *   • un fragment de trois lettres attrape n'importe quoi : « x » dans
 *     « Xcode », « npm » dans un titre d'article, « mail » dans « Mailchimp ».
 *
 * Ici, une entrée décrit une chose réelle (un logiciel, un site) et dit COMMENT
 * la reconnaître :
 *
 *   • `app`   — le nom de processus / d'application, comparé À L'IDENTIQUE ;
 *   • `word`  — un mot cherché dans ce nom (jamais un bout de mot, sauf pour
 *               les noms collés type « leagueclientux ») ;
 *   • `web`   — le domaine, extrait du titre de fenêtre quand il s'y trouve ;
 *   • `title` — un nom de site cherché dans le titre.
 *
 * L'ordre de fiabilité est celui-là, et il est appliqué : un nom d'app exact
 * l'emporte sur un mot, qui l'emporte sur un titre. `lib/activity/categories`
 * s'en sert pour classer, et garde la trace de CE qui a décidé — la page
 * « Catégories & règles » l'affiche, sinon on ne peut pas corriger un classement
 * qu'on ne comprend pas.
 *
 * Les noms sont ceux qu'on veut LIRE dans la liste des applications : « League
 * of Legends », pas « leagueclientux ».
 */

/* ─── Forme d'une entrée ─────────────────────────────────────────────────── */

export interface CatalogEntry {
  /** Nom affiché dans l'app. */
  name: string;
  /** Catégorie (cf. lib/activity/categories). */
  cat: string;
  /**
   * Noms d'application exacts, normalisés (minuscules, sans accent ni
   * ponctuation). Par défaut : le nom normalisé de l'entrée.
   */
  app?: string[];
  /**
   * Mots cherchés dans le nom de l'application. Un mot de 5 lettres ou plus
   * peut être collé à d'autres (« steamwebhelper ») ; en dessous, il doit être
   * un mot entier — sans quoi « code » classerait « Barcode Scanner ».
   */
  word?: string[];
  /** Domaines, sans « www. ». Le sous-domaine compte : « console.aws.amazon.com ». */
  web?: string[];
  /** Fragments cherchés dans le titre de la fenêtre, comme des mots entiers. */
  title?: string[];
}

type Seed = Omit<CatalogEntry, "cat">;

const of = (cat: string, seeds: Seed[]): CatalogEntry[] => seeds.map(s => ({ ...s, cat }));

/* ─── Normalisation ──────────────────────────────────────────────────────── */

/**
 * Nom comparable : minuscules, sans accents, sans extension ni ponctuation.
 *
 * « League of Legends.exe » → « league of legends », « VLC média » → « vlc
 * media ». Les trois plateformes ne donnent pas la même chose (nom d'affichage
 * sur macOS, nom de processus sur Windows, classe X11 sur Linux) : c'est ici
 * qu'elles se rejoignent.
 */
export function norm(raw: string): string {
  return (raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.(exe|app|bin|com)$/i, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Le même nom sans ses espaces : « league client ux » → « leagueclientux ». */
export function glued(n: string): string {
  return n.replace(/ /g, "");
}

/* ─── Navigateurs ────────────────────────────────────────────────────────── */

/**
 * Un navigateur ne dit rien de ce qu'on y fait : son titre de fenêtre, si.
 * La liste sert aussi à retirer le suffixe qu'ils collent tous à leur titre.
 */
export const BROWSERS: { app: string[]; suffix: string[] }[] = [
  { app: ["google chrome", "chrome", "chromium", "google chrome beta", "google chrome canary"], suffix: ["google chrome", "chromium"] },
  { app: ["firefox", "firefox developer edition", "mozilla firefox", "librewolf", "waterfox", "zen", "zen browser", "floorp"], suffix: ["mozilla firefox", "firefox", "librewolf", "zen browser"] },
  { app: ["safari", "safari technology preview", "orion"], suffix: ["safari"] },
  { app: ["microsoft edge", "msedge", "edge"], suffix: ["microsoft edge", "edge"] },
  { app: ["brave", "brave browser", "brave-browser"], suffix: ["brave"] },
  { app: ["opera", "opera gx", "operagx", "opera air"], suffix: ["opera", "opera gx"] },
  { app: ["arc", "vivaldi", "tor browser", "duckduckgo", "sigmaos", "min", "helium"], suffix: ["vivaldi", "tor browser", "arc"] },
];

const BROWSER_APPS = new Set(BROWSERS.flatMap(b => b.app));
const BROWSER_SUFFIXES = BROWSERS.flatMap(b => b.suffix);

/** Vrai si l'application relevée est un navigateur. */
export function isBrowserApp(app: string): boolean {
  const n = norm(app);
  if (BROWSER_APPS.has(n)) return true;
  // « Google Chrome — Profil pro », « firefox-esr » : le nom porte parfois une
  // précision. On retombe sur le premier mot, qui suffit à trancher.
  const head = n.split(" ")[0];
  return BROWSER_APPS.has(head);
}

/* ─── Le catalogue ───────────────────────────────────────────────────────── */

export const CATALOG: CatalogEntry[] = [
  ...of("dev", [
    { name: "VS Code", app: ["code", "code insiders", "visual studio code", "vscode", "code oss"], word: ["visual studio code"] },
    { name: "Cursor", app: ["cursor"] },
    { name: "Windsurf" },
    { name: "Zed", app: ["zed"] },
    { name: "Visual Studio", app: ["devenv", "visual studio"] },
    { name: "WebStorm", word: ["webstorm"] },
    { name: "IntelliJ IDEA", app: ["idea", "idea64", "intellij idea"], word: ["intellij"] },
    { name: "PyCharm", word: ["pycharm"] },
    { name: "PhpStorm", word: ["phpstorm"] },
    { name: "GoLand", app: ["goland"] },
    { name: "Rider", app: ["rider", "rider64"] },
    { name: "CLion", app: ["clion"] },
    { name: "DataGrip", word: ["datagrip"] },
    { name: "RubyMine", word: ["rubymine"] },
    { name: "Android Studio", app: ["studio64", "android studio"], word: ["android studio"] },
    { name: "Xcode", app: ["xcode", "xcodebuild"] },
    { name: "Sublime Text", app: ["sublime text", "sublime_text", "subl"], word: ["sublime"] },
    { name: "Neovim", app: ["nvim", "neovim"] },
    { name: "Vim", app: ["vim", "gvim", "macvim"] },
    { name: "Emacs", app: ["emacs"] },
    { name: "Notepad++", app: ["notepad++", "notepad+ +", "notepad"], word: ["notepad+ +"] },
    { name: "Terminal", app: ["terminal", "apple terminal", "gnome terminal", "konsole", "xterm", "urxvt", "ghostty", "tilix"] },
    { name: "iTerm", app: ["iterm", "iterm2"] },
    { name: "Warp", app: ["warp", "warp terminal"] },
    { name: "Alacritty", app: ["alacritty"] },
    { name: "Kitty", app: ["kitty"] },
    { name: "WezTerm", app: ["wezterm", "wezterm gui"] },
    { name: "Hyper", app: ["hyper"] },
    { name: "Tabby", app: ["tabby"] },
    { name: "Terminal Windows", app: ["windowsterminal", "wt", "openconsole"] },
    { name: "PowerShell", app: ["powershell", "pwsh"], word: ["powershell"] },
    { name: "Invite de commandes", app: ["cmd", "conhost"] },
    { name: "WSL", app: ["wsl", "wslhost", "ubuntu", "debian"] },
    { name: "Docker", app: ["docker", "docker desktop", "com docker docker"], word: ["docker"] },
    { name: "OrbStack", word: ["orbstack"] },
    { name: "Postman", word: ["postman"] },
    { name: "Insomnia", word: ["insomnia"] },
    { name: "Bruno", app: ["bruno"] },
    { name: "TablePlus", word: ["tableplus"] },
    { name: "DBeaver", word: ["dbeaver"] },
    { name: "pgAdmin", app: ["pgadmin", "pgadmin4"], word: ["pgadmin"] },
    { name: "MongoDB Compass", app: ["mongodb compass", "compass"], word: ["mongodb"] },
    { name: "Redis Insight", app: ["redisinsight", "redis insight"] },
    { name: "GitHub Desktop", app: ["github desktop", "githubdesktop"] },
    { name: "Sourcetree", word: ["sourcetree"] },
    { name: "GitKraken", word: ["gitkraken"] },
    { name: "Fork", app: ["fork"] },
    { name: "Tower", app: ["tower"] },
    { name: "Sublime Merge", app: ["sublime merge", "smerge"] },
    { name: "Unity", app: ["unity", "unity hub", "unityhub"] },
    { name: "Unreal Engine", app: ["unrealeditor", "unreal engine", "epicgameslauncher unreal"], word: ["unrealeditor"] },
    { name: "Godot", app: ["godot"] },
    { name: "Arduino IDE", app: ["arduino", "arduino ide"] },
    { name: "RStudio", app: ["rstudio"] },
    { name: "MATLAB", app: ["matlab"] },
    { name: "Jupyter", app: ["jupyter", "jupyter notebook", "jupyter lab"], word: ["jupyter"] },
    { name: "Anaconda", word: ["anaconda"] },
    { name: "Eclipse", app: ["eclipse"] },
    { name: "NetBeans", word: ["netbeans"] },
    { name: "VirtualBox", app: ["virtualbox", "virtualboxvm"], word: ["virtualbox"] },
    { name: "VMware", word: ["vmware"] },
    { name: "Parallels", word: ["parallels"] },
    { name: "FileZilla", word: ["filezilla"] },
    { name: "WinSCP", app: ["winscp"] },
    { name: "PuTTY", app: ["putty"] },
    { name: "Termius", word: ["termius"] },
    { name: "Cyberduck", word: ["cyberduck"] },
    { name: "Wireshark", word: ["wireshark"] },
    { name: "Proxyman", word: ["proxyman"] },
    // Sites de développement
    { name: "GitHub", app: [], web: ["github.com", "gist.github.com", "github.io"] },
    { name: "GitLab", app: [], web: ["gitlab.com"] },
    { name: "Bitbucket", app: [], web: ["bitbucket.org"] },
    { name: "Stack Overflow", app: [], web: ["stackoverflow.com", "stackexchange.com"], title: ["stack overflow"] },
    { name: "npm", app: [], web: ["npmjs.com"], title: [] },
    { name: "PyPI", app: [], web: ["pypi.org"] },
    { name: "crates.io", app: [], web: ["crates.io", "docs.rs"] },
    { name: "MDN", app: [], web: ["developer.mozilla.org"], title: ["mdn web docs"] },
    { name: "Vercel", app: [], web: ["vercel.com", "vercel.app"] },
    { name: "Netlify", app: [], web: ["netlify.com", "netlify.app"] },
    { name: "Supabase", app: [], web: ["supabase.com", "supabase.co"] },
    { name: "Firebase", app: [], web: ["firebase.google.com", "console.firebase.google.com"] },
    { name: "AWS", app: [], web: ["console.aws.amazon.com", "aws.amazon.com"], title: ["aws management console"] },
    { name: "Google Cloud", app: [], web: ["console.cloud.google.com"] },
    { name: "Azure", app: [], web: ["portal.azure.com"] },
    { name: "Cloudflare", app: [], web: ["cloudflare.com", "dash.cloudflare.com"] },
    { name: "DigitalOcean", app: [], web: ["digitalocean.com"] },
    { name: "Railway", app: [], web: ["railway.app"] },
    { name: "Render", app: [], web: ["render.com"] },
    { name: "Sentry", app: [], web: ["sentry.io"] },
    { name: "Localhost", app: [], web: ["localhost", "127.0.0.1"], title: ["localhost"] },
    { name: "Replit", app: [], web: ["replit.com"] },
    { name: "CodeSandbox", app: [], web: ["codesandbox.io"] },
    { name: "StackBlitz", app: [], web: ["stackblitz.com"] },
    { name: "CodePen", app: [], web: ["codepen.io"] },
    { name: "Hugging Face", app: [], web: ["huggingface.co"] },
    { name: "Kaggle", app: [], web: ["kaggle.com"] },
    { name: "LeetCode", app: [], web: ["leetcode.com"] },
    { name: "Codewars", app: [], web: ["codewars.com"] },
    { name: "Can I use", app: [], web: ["caniuse.com"] },
    { name: "regex101", app: [], web: ["regex101.com"] },
    { name: "W3Schools", app: [], web: ["w3schools.com"] },
    { name: "GeeksforGeeks", app: [], web: ["geeksforgeeks.org"] },
    { name: "freeCodeCamp", app: [], web: ["freecodecamp.org"] },
    { name: "Tailwind CSS", app: [], web: ["tailwindcss.com"] },
    { name: "React", app: [], web: ["react.dev", "reactjs.org"] },
    { name: "Next.js", app: [], web: ["nextjs.org"] },
    { name: "Node.js", app: [], web: ["nodejs.org"] },
    { name: "Python", app: [], web: ["docs.python.org", "python.org"] },
    { name: "Rust", app: [], web: ["rust-lang.org"] },
    { name: "Tauri", app: [], web: ["tauri.app", "v2.tauri.app"] },
    { name: "Expo", app: [], web: ["expo.dev", "docs.expo.dev"] },
  ]),

  ...of("trading", [
    /* tao trade en premier : c'est CETTE app. Son processus s'appelle « tao »
       (cf. src-tauri/tauri.conf.json), trois lettres qu'on ne peut pas chercher
       comme un fragment — d'où la correspondance exacte. */
    { name: "tao trade", app: ["tao", "tao trade", "taotrade", "tr4de", "tao trade desktop"], web: ["tao-trade.vercel.app"], title: ["tao trade"] },
    { name: "MetaTrader 5", app: ["terminal64", "metatrader 5", "metatrader5"], word: ["metatrader"] },
    { name: "MetaTrader 4", app: ["terminal", "metatrader 4", "metatrader4"] },
    { name: "NinjaTrader", word: ["ninjatrader"] },
    { name: "Tradovate", word: ["tradovate"] },
    { name: "Quantower", word: ["quantower"] },
    { name: "cTrader", app: ["ctrader"], word: ["ctrader"] },
    { name: "Trader Workstation", app: ["tws", "trader workstation"], word: ["trader workstation"] },
    { name: "Sierra Chart", app: ["sierrachart", "sierra chart"], word: ["sierrachart"] },
    { name: "thinkorswim", word: ["thinkorswim"] },
    { name: "ATAS", app: ["atas", "atas platform"] },
    { name: "Bookmap", word: ["bookmap"] },
    { name: "MotiveWave", word: ["motivewave"] },
    { name: "MultiCharts", word: ["multicharts"] },
    { name: "TradeStation", word: ["tradestation"] },
    { name: "ProRealTime", word: ["prorealtime"] },
    { name: "Rithmic", word: ["rithmic"] },
    { name: "TradingView", word: ["tradingview"], web: ["tradingview.com", "fr.tradingview.com"] },
    // Courtiers, prop firms, données de marché
    { name: "Investing.com", app: [], web: ["investing.com", "fr.investing.com"] },
    { name: "Binance", app: [], web: ["binance.com"] },
    { name: "Bybit", app: [], web: ["bybit.com"] },
    { name: "Kraken", app: [], web: ["kraken.com"] },
    { name: "Coinbase", app: [], web: ["coinbase.com"] },
    { name: "OKX", app: [], web: ["okx.com"] },
    { name: "Bitget", app: [], web: ["bitget.com"] },
    { name: "MEXC", app: [], web: ["mexc.com"] },
    { name: "FTMO", app: [], web: ["ftmo.com"], title: ["ftmo"] },
    { name: "The5ers", app: [], web: ["the5ers.com"] },
    { name: "Apex Trader Funding", app: [], web: ["apextraderfunding.com"], title: ["apex trader funding"] },
    { name: "Topstep", app: [], web: ["topstep.com", "topsteptrader.com"] },
    { name: "MyFundedFutures", app: [], web: ["myfundedfutures.com"] },
    { name: "Take Profit Trader", app: [], web: ["takeprofittrader.com"] },
    { name: "TradeZella", app: [], web: ["tradezella.com"], title: ["tradezella"] },
    { name: "TraderSync", app: [], web: ["tradersync.com"] },
    { name: "Edgewonk", app: [], web: ["edgewonk.com"] },
    { name: "Myfxbook", app: [], web: ["myfxbook.com"] },
    { name: "Forex Factory", app: [], web: ["forexfactory.com"] },
    { name: "BabyPips", app: [], web: ["babypips.com"] },
    { name: "Boursorama", app: [], web: ["boursorama.com"] },
    { name: "Bourse Direct", app: [], web: ["boursedirect.fr"] },
    { name: "DEGIRO", app: [], web: ["degiro.fr", "degiro.com"] },
    { name: "Trade Republic", app: [], web: ["traderepublic.com"] },
    { name: "eToro", app: [], web: ["etoro.com"] },
    { name: "Interactive Brokers", app: [], web: ["interactivebrokers.com", "ibkr.com"] },
    { name: "Saxo", app: [], web: ["home.saxo", "saxobank.com"] },
    { name: "CoinMarketCap", app: [], web: ["coinmarketcap.com"] },
    { name: "CoinGecko", app: [], web: ["coingecko.com"] },
    { name: "DexScreener", app: [], web: ["dexscreener.com"] },
    { name: "Yahoo Finance", app: [], web: ["finance.yahoo.com"] },
    { name: "Zonebourse", app: [], web: ["zonebourse.com"] },
    { name: "Finviz", app: [], web: ["finviz.com"] },
    { name: "Barchart", app: [], web: ["barchart.com"] },
    { name: "CME Group", app: [], web: ["cmegroup.com"] },
  ]),

  ...of("writing", [
    { name: "Obsidian", word: ["obsidian"], web: ["obsidian.md"] },
    { name: "Notion", word: ["notion"], web: ["notion.so", "notion.com"] },
    { name: "Word", app: ["winword", "microsoft word", "word"], word: ["microsoft word"] },
    { name: "Pages", app: ["pages"] },
    { name: "Notes", app: ["notes", "apple notes", "stickies", "pense bete"] },
    { name: "OneNote", app: ["onenote", "onenoteim"], word: ["onenote"] },
    { name: "Bear", app: ["bear"] },
    { name: "Ulysses", word: ["ulysses"] },
    { name: "Scrivener", word: ["scrivener"] },
    { name: "Typora", word: ["typora"] },
    { name: "Logseq", word: ["logseq"] },
    { name: "Craft", app: ["craft"] },
    { name: "Joplin", word: ["joplin"] },
    { name: "TextEdit", app: ["textedit"] },
    { name: "Bloc-notes", app: ["notepad", "bloc notes"] },
    { name: "Google Docs", app: [], web: ["docs.google.com"], title: ["google docs"] },
    { name: "Overleaf", app: [], web: ["overleaf.com"] },
    { name: "Grammarly", word: ["grammarly"] },
  ]),

  ...of("design", [
    { name: "Figma", word: ["figma"], web: ["figma.com"] },
    { name: "Photoshop", word: ["photoshop"] },
    { name: "Illustrator", word: ["illustrator"] },
    { name: "InDesign", word: ["indesign"] },
    { name: "After Effects", app: ["afterfx", "after effects"], word: ["after effects"] },
    { name: "Premiere Pro", app: ["adobe premiere pro", "premiere"], word: ["premiere"] },
    { name: "DaVinci Resolve", app: ["resolve", "davinci resolve"], word: ["davinci"] },
    { name: "Final Cut Pro", app: ["final cut pro"], word: ["final cut"] },
    { name: "Affinity", word: ["affinity"] },
    { name: "Sketch", app: ["sketch"] },
    { name: "Blender", word: ["blender"] },
    { name: "Canva", app: ["canva"], web: ["canva.com"] },
    { name: "Lightroom", word: ["lightroom"] },
    { name: "CapCut", word: ["capcut"] },
    { name: "Framer", app: ["framer"], web: ["framer.com"] },
    { name: "Adobe XD", app: ["adobe xd", "xd"] },
    { name: "GIMP", app: ["gimp"] },
    { name: "Inkscape", word: ["inkscape"] },
    { name: "Krita", app: ["krita"] },
    { name: "Cinema 4D", app: ["cinema 4d", "cinema4d"] },
    { name: "AutoCAD", word: ["autocad"] },
    { name: "Fusion 360", app: ["fusion360", "fusion 360"] },
    { name: "SolidWorks", word: ["solidworks"] },
    { name: "OBS Studio", app: ["obs", "obs studio", "obs64"] },
    { name: "Audacity", word: ["audacity"] },
    { name: "Ableton Live", app: ["ableton live", "ableton"], word: ["ableton"] },
    { name: "FL Studio", app: ["fl studio", "fl64"], word: ["fl studio"] },
    { name: "Logic Pro", app: ["logic pro", "logic pro x"] },
    { name: "GarageBand", word: ["garageband"] },
    { name: "Reaper", app: ["reaper"] },
    { name: "Pixelmator", word: ["pixelmator"] },
    { name: "Dribbble", app: [], web: ["dribbble.com"] },
    { name: "Behance", app: [], web: ["behance.net"] },
    { name: "Pinterest", app: ["pinterest"], web: ["pinterest.com", "pinterest.fr"] },
    { name: "Unsplash", app: [], web: ["unsplash.com"] },
    { name: "Midjourney", app: [], web: ["midjourney.com"] },
    { name: "Google Fonts", app: [], web: ["fonts.google.com"] },
  ]),

  ...of("research", [
    { name: "ChatGPT", app: ["chatgpt", "openai chatgpt"], web: ["chatgpt.com", "chat.openai.com"], title: ["chatgpt"] },
    { name: "Claude", app: ["claude"], web: ["claude.ai"], title: ["claude"] },
    { name: "Gemini", app: [], web: ["gemini.google.com"] },
    { name: "Perplexity", app: ["perplexity"], web: ["perplexity.ai"] },
    { name: "Copilot", app: [], web: ["copilot.microsoft.com"] },
    { name: "Le Chat", app: [], web: ["chat.mistral.ai"] },
    { name: "DeepSeek", app: [], web: ["deepseek.com", "chat.deepseek.com"] },
    { name: "Wikipédia", app: [], web: ["wikipedia.org", "fr.wikipedia.org"], title: ["wikipedia", "wikipedia"] },
    { name: "arXiv", app: [], web: ["arxiv.org"] },
    { name: "Google Scholar", app: [], web: ["scholar.google.com"] },
    { name: "ResearchGate", app: [], web: ["researchgate.net"] },
    { name: "PubMed", app: [], web: ["pubmed.ncbi.nlm.nih.gov"] },
    { name: "Coursera", app: [], web: ["coursera.org"] },
    { name: "Udemy", app: [], web: ["udemy.com"] },
    { name: "Khan Academy", app: [], web: ["khanacademy.org"] },
    { name: "OpenClassrooms", app: [], web: ["openclassrooms.com"] },
    { name: "Duolingo", app: ["duolingo"], web: ["duolingo.com"] },
    { name: "Anki", app: ["anki"] },
    { name: "Quizlet", app: [], web: ["quizlet.com"] },
    { name: "DeepL", app: ["deepl"], web: ["deepl.com"] },
    { name: "Google Traduction", app: [], web: ["translate.google.com"] },
    { name: "WordReference", app: [], web: ["wordreference.com"] },
    { name: "Medium", app: [], web: ["medium.com"] },
    { name: "Substack", app: [], web: ["substack.com"] },
    { name: "Hacker News", app: [], web: ["news.ycombinator.com"] },
    { name: "Goodreads", app: [], web: ["goodreads.com"] },
    { name: "Kindle", app: ["kindle", "amazon kindle"] },
    { name: "Livres", app: ["books", "apple books", "ibooks"] },
    { name: "Calibre", app: ["calibre"] },
    { name: "Zotero", word: ["zotero"] },
    { name: "Le Monde", app: [], web: ["lemonde.fr"] },
    { name: "Le Figaro", app: [], web: ["lefigaro.fr"] },
    { name: "France Info", app: [], web: ["francetvinfo.fr"] },
    { name: "Les Échos", app: [], web: ["lesechos.fr"] },
    { name: "BBC", app: [], web: ["bbc.com", "bbc.co.uk"] },
    { name: "The Guardian", app: [], web: ["theguardian.com"] },
    { name: "New York Times", app: [], web: ["nytimes.com"] },
  ]),

  ...of("admin", [
    { name: "Excel", app: ["excel", "microsoft excel"], word: ["excel"] },
    { name: "Numbers", app: ["numbers"] },
    { name: "Google Sheets", app: [], web: ["sheets.google.com"], title: ["google sheets"] },
    { name: "PowerPoint", app: ["powerpnt", "microsoft powerpoint"], word: ["powerpoint"] },
    { name: "Keynote", app: ["keynote"] },
    { name: "Google Slides", app: [], web: ["slides.google.com"] },
    { name: "Calendrier", app: ["calendar", "calendrier", "agenda", "fantastical", "outlookcalendar"] },
    { name: "Google Agenda", app: [], web: ["calendar.google.com"], title: ["google agenda", "google calendar"] },
    { name: "Aperçu", app: ["preview", "apercu"] },
    { name: "Acrobat", app: ["acrobat", "adobe acrobat", "acrord32"], word: ["acrobat"] },
    { name: "PDF Expert", app: ["pdf expert"] },
    { name: "Google Drive", app: ["google drive", "drive"], web: ["drive.google.com"], title: ["google drive"] },
    { name: "Dropbox", word: ["dropbox"] },
    { name: "OneDrive", word: ["onedrive"] },
    { name: "Linear", app: ["linear"], web: ["linear.app"] },
    { name: "Jira", app: ["jira"], web: ["atlassian.net"], title: ["jira"] },
    { name: "Confluence", app: [], web: ["confluence.atlassian.com"] },
    { name: "Asana", app: ["asana"], web: ["asana.com"] },
    { name: "Trello", app: ["trello"], web: ["trello.com"] },
    { name: "ClickUp", app: ["clickup"], web: ["clickup.com"] },
    { name: "Monday.com", app: [], web: ["monday.com"] },
    { name: "Todoist", word: ["todoist"] },
    { name: "Things", app: ["things", "things3"] },
    { name: "TickTick", word: ["ticktick"] },
    { name: "Airtable", app: ["airtable"], web: ["airtable.com"] },
    { name: "Toggl", app: [], web: ["toggl.com", "track.toggl.com"] },
    { name: "Stripe", app: [], web: ["dashboard.stripe.com", "stripe.com"] },
    { name: "PayPal", app: [], web: ["paypal.com"] },
    { name: "Revolut", app: ["revolut"], web: ["revolut.com"] },
    { name: "Qonto", app: [], web: ["qonto.com"] },
    { name: "Impots.gouv", app: [], web: ["impots.gouv.fr"] },
    { name: "Ameli", app: [], web: ["ameli.fr"] },
    { name: "URSSAF", app: [], web: ["urssaf.fr", "autoentrepreneur.urssaf.fr"] },
    { name: "Service-public", app: [], web: ["service-public.fr"] },
    { name: "Doctolib", app: [], web: ["doctolib.fr"] },
    { name: "France Travail", app: [], web: ["francetravail.fr", "pole-emploi.fr"] },
    { name: "Salesforce", app: [], web: ["salesforce.com", "lightning.force.com"] },
    { name: "HubSpot", app: [], web: ["hubspot.com", "app.hubspot.com"] },
  ]),

  ...of("meetings", [
    { name: "Zoom", app: ["zoom", "zoom us", "zoomcpthost"], web: ["zoom.us"], title: ["zoom"] },
    { name: "Microsoft Teams", app: ["teams", "ms teams", "microsoft teams", "msteams"], word: ["microsoft teams"] },
    { name: "Google Meet", app: [], web: ["meet.google.com"], title: ["google meet"] },
    { name: "Webex", word: ["webex"] },
    { name: "FaceTime", word: ["facetime"] },
    { name: "Whereby", app: [], web: ["whereby.com"] },
    { name: "Jitsi", app: [], web: ["meet.jit.si"] },
    { name: "Skype", app: ["skype"] },
    { name: "StreamYard", app: [], web: ["streamyard.com"] },
    { name: "Riverside", app: [], web: ["riverside.fm"] },
  ]),

  ...of("comms", [
    { name: "Slack", app: ["slack"], web: ["slack.com"], title: ["slack"] },
    { name: "Discord", app: ["discord", "discordptb", "discordcanary"], web: ["discord.com"], title: ["discord"] },
    { name: "Mail", app: ["mail", "apple mail", "courrier", "mailmate"] },
    { name: "Gmail", app: [], web: ["mail.google.com"], title: ["gmail"] },
    { name: "Outlook", app: ["outlook", "microsoft outlook", "olk"], web: ["outlook.office.com", "outlook.live.com"], title: ["outlook"] },
    { name: "Thunderbird", word: ["thunderbird"] },
    { name: "Spark", app: ["spark"] },
    { name: "Superhuman", word: ["superhuman"] },
    { name: "Proton Mail", app: [], web: ["mail.proton.me"] },
    { name: "Messages", app: ["messages", "imessage"] },
    { name: "WhatsApp", word: ["whatsapp"], web: ["web.whatsapp.com"], title: ["whatsapp"] },
    { name: "Telegram", word: ["telegram"], web: ["web.telegram.org"] },
    { name: "Signal", app: ["signal"] },
    { name: "Messenger", app: ["messenger"], web: ["messenger.com"], title: ["messenger"] },
    { name: "WeChat", word: ["wechat"] },
    { name: "TeamSpeak", word: ["teamspeak"] },
    { name: "Element", app: ["element"] },
    { name: "Mattermost", word: ["mattermost"] },
    { name: "Zendesk", app: [], web: ["zendesk.com"] },
    { name: "Intercom", app: [], web: ["intercom.com", "app.intercom.com"] },
  ]),

  ...of("social", [
    { name: "X", app: ["x", "twitter", "x twitter"], web: ["x.com", "twitter.com"], title: ["twitter", "x"] },
    { name: "Instagram", app: ["instagram"], web: ["instagram.com"], title: ["instagram"] },
    { name: "TikTok", app: ["tiktok"], web: ["tiktok.com"], title: ["tiktok"] },
    { name: "Reddit", app: ["reddit"], web: ["reddit.com"], title: ["reddit"] },
    { name: "LinkedIn", app: ["linkedin"], web: ["linkedin.com"], title: ["linkedin"] },
    { name: "Facebook", app: ["facebook"], web: ["facebook.com"], title: ["facebook"] },
    { name: "Snapchat", word: ["snapchat"], web: ["web.snapchat.com"] },
    { name: "Bluesky", app: [], web: ["bsky.app"] },
    { name: "Mastodon", app: [], web: ["mastodon.social"] },
    { name: "Threads", app: [], web: ["threads.net"] },
    { name: "Quora", app: [], web: ["quora.com"] },
    { name: "Tumblr", app: [], web: ["tumblr.com"] },
    { name: "9GAG", app: [], web: ["9gag.com"] },
  ]),

  ...of("fun", [
    { name: "YouTube", app: ["youtube"], web: ["youtube.com", "youtu.be", "m.youtube.com"], title: ["youtube"] },
    { name: "YouTube Music", app: [], web: ["music.youtube.com"] },
    { name: "Netflix", app: ["netflix"], web: ["netflix.com"], title: ["netflix"] },
    { name: "Twitch", app: ["twitch"], web: ["twitch.tv"], title: ["twitch"] },
    { name: "Prime Video", app: ["prime video"], web: ["primevideo.com"], title: ["prime video"] },
    { name: "Disney+", app: ["disney+", "disney plus"], web: ["disneyplus.com"], title: ["disney+"] },
    { name: "Max", app: [], web: ["max.com", "hbomax.com"] },
    { name: "Canal+", app: [], web: ["canalplus.com"] },
    { name: "Molotov", app: ["molotov"], web: ["molotov.tv"] },
    { name: "france.tv", app: [], web: ["france.tv"] },
    { name: "ARTE", app: [], web: ["arte.tv"] },
    { name: "6play", app: [], web: ["6play.fr"] },
    { name: "TF1+", app: [], web: ["tf1.fr", "mytf1.tf1.fr"] },
    { name: "Crunchyroll", app: [], web: ["crunchyroll.com"] },
    { name: "Anime-Sama", app: [], web: ["anime-sama.fr"], title: ["anime sama"] },
    { name: "Neko-Sama", app: [], web: ["neko-sama.fr"], title: ["neko sama"] },
    { name: "Voiranime", app: [], web: ["voiranime.com"] },
    { name: "MangaDex", app: [], web: ["mangadex.org"] },
    { name: "Japscan", app: [], web: ["japscan.lol", "japscan.ws", "japscan.me"] },
    { name: "Webtoon", app: [], web: ["webtoons.com"] },
    { name: "Wakanim", app: [], web: ["wakanim.tv"] },
    { name: "ADN", app: [], web: ["animationdigitalnetwork.fr", "animationdigitalnetwork.com"] },
    { name: "Dailymotion", app: [], web: ["dailymotion.com"] },
    { name: "Vimeo", app: [], web: ["vimeo.com"] },
    { name: "Plex", app: ["plex", "plex media player"] },
    { name: "Jellyfin", word: ["jellyfin"] },
    { name: "Kodi", app: ["kodi"] },
    { name: "VLC", app: ["vlc", "vlc media player"] },
    { name: "IINA", app: ["iina"] },
    { name: "mpv", app: ["mpv"] },
    { name: "Spotify", word: ["spotify"], web: ["open.spotify.com"], title: ["spotify"] },
    { name: "Musique", app: ["music", "apple music", "itunes", "musique", "groove"] },
    { name: "Deezer", app: ["deezer"], web: ["deezer.com"] },
    { name: "SoundCloud", app: [], web: ["soundcloud.com"] },
    { name: "Tidal", app: ["tidal"], web: ["tidal.com"] },
    { name: "Podcasts", app: ["podcasts", "overcast", "pocket casts"] },
    { name: "Photos", app: ["photos", "photo", "windowsphotos", "microsoft photos"] },
    { name: "QuickTime", app: ["quicktime player", "quicktime"] },
    { name: "Films et TV", app: ["video ui", "films et tv", "movies tv", "apple tv", "tv"] },
    { name: "L'Équipe", app: [], web: ["lequipe.fr"] },
    { name: "DAZN", app: [], web: ["dazn.com"] },
    { name: "Eurosport", app: [], web: ["eurosport.fr"] },
  ]),

  ...of("games", [
    /* Le manque le plus criant de l'ancien classement : tout ce bloc tombait
       dans « Non classé » ou dans « Divertissement ». Les jeux ont leur
       catégorie parce qu'ils ne se règlent pas comme une série — on veut pouvoir
       les compter, les voir dans le bandeau, et décider de leur nature à part. */
    { name: "Steam", app: ["steam", "steamwebhelper", "steam client"], word: ["steam"], web: ["store.steampowered.com", "steamcommunity.com"] },
    { name: "Epic Games", app: ["epicgameslauncher", "epic games launcher", "epicgames"], word: ["epicgames"], web: ["epicgames.com", "store.epicgames.com"] },
    { name: "Riot Client", app: ["riotclient", "riot client", "riotclientservices", "riotclientux", "riot games"], word: ["riotclient", "riotclientservices"] },
    { name: "League of Legends", app: ["leagueclient", "leagueclientux", "league of legends", "lol", "leagueoflegends"], word: ["leagueclient", "league of legends"], web: ["leagueoflegends.com", "op.gg", "euw.op.gg", "u.gg", "mobalytics.gg", "porofessor.gg", "deeplol.gg"], title: ["league of legends"] },
    { name: "Valorant", app: ["valorant", "valorant win64 shipping", "riot vanguard", "vgtray"], word: ["valorant"], web: ["playvalorant.com", "tracker.gg"] },
    { name: "Teamfight Tactics", app: ["teamfight tactics", "tft"], word: ["teamfight"] },
    { name: "Battle.net", app: ["battle net", "battlenet", "blizzard", "battle net launcher"], word: ["battlenet", "blizzard"] },
    { name: "World of Warcraft", app: ["wow", "world of warcraft", "wowclassic"], word: ["world of warcraft"] },
    { name: "Overwatch", word: ["overwatch"] },
    { name: "Hearthstone", word: ["hearthstone"] },
    { name: "Diablo", word: ["diablo"] },
    { name: "Minecraft", app: ["minecraft", "javaw", "minecraft launcher", "minecraftlauncher"], word: ["minecraft"], web: ["minecraft.net", "curseforge.com", "modrinth.com"] },
    { name: "CurseForge", word: ["curseforge"] },
    { name: "Lunar Client", app: ["lunar client", "lunarclient"], word: ["lunarclient"] },
    { name: "Roblox", app: ["roblox", "robloxplayerbeta"], word: ["roblox"], web: ["roblox.com"] },
    { name: "Fortnite", app: ["fortnite", "fortniteclient win64 shipping"], word: ["fortnite"] },
    { name: "Rocket League", app: ["rocketleague", "rocket league"], word: ["rocketleague"] },
    { name: "Counter-Strike", app: ["cs2", "csgo", "counter strike", "counter strike 2"], word: ["counter strike"] },
    { name: "Dota 2", app: ["dota2", "dota 2"], word: ["dota"] },
    { name: "Apex Legends", app: ["r5apex", "apex legends"], word: ["apex legends"] },
    { name: "Call of Duty", app: ["cod", "modernwarfare", "warzone", "call of duty", "blackops"], word: ["call of duty", "warzone"] },
    { name: "Escape from Tarkov", app: ["escapefromtarkov", "eft"], word: ["tarkov"] },
    { name: "Rust", app: ["rustclient"] },
    { name: "PUBG", app: ["tslgame", "pubg"] },
    { name: "GTA V", app: ["gta5", "gtav", "gta v", "grand theft auto v"], word: ["grand theft auto"] },
    { name: "Rockstar Games", app: ["rockstar games launcher", "launcher rockstar"], word: ["rockstar"] },
    { name: "Ubisoft Connect", app: ["upc", "uplay", "ubisoft connect"], word: ["ubisoft"] },
    { name: "EA app", app: ["eaapp", "ea app", "origin", "eadesktop"], word: ["eadesktop"] },
    { name: "GOG Galaxy", app: ["galaxyclient", "gog galaxy"], word: ["gog galaxy"] },
    { name: "Xbox", app: ["xbox", "xboxapp", "gamingservices", "xbox game bar"] },
    { name: "Genshin Impact", app: ["genshinimpact", "genshin impact", "yuanshen"], word: ["genshin"] },
    { name: "Honkai: Star Rail", app: ["starrail", "honkai star rail"], word: ["honkai"] },
    { name: "HoYoPlay", app: ["hoyoplay", "launcher hoyoverse"], word: ["hoyoplay"] },
    { name: "Palworld", word: ["palworld"] },
    { name: "Elden Ring", app: ["eldenring", "elden ring"], word: ["eldenring"] },
    { name: "Baldur's Gate 3", app: ["bg3", "baldurs gate 3", "bg3 dx11"], word: ["baldurs gate"] },
    { name: "Terraria", word: ["terraria"] },
    { name: "Stardew Valley", app: ["stardew valley", "stardewvalley"], word: ["stardew"] },
    { name: "Factorio", word: ["factorio"] },
    { name: "Satisfactory", app: ["factorygame", "satisfactory"], word: ["satisfactory"] },
    { name: "Cyberpunk 2077", app: ["cyberpunk2077", "cyberpunk 2077"], word: ["cyberpunk"] },
    { name: "The Witcher", app: ["witcher3", "the witcher 3"], word: ["witcher"] },
    { name: "Dofus", app: ["dofus", "ankama launcher", "ankama"], word: ["dofus", "ankama"] },
    { name: "osu!", app: ["osu", "osu!"] },
    { name: "Geometry Dash", app: ["geometrydash", "geometry dash"], word: ["geometrydash"] },
    { name: "Among Us", app: ["among us", "amongus"] },
    { name: "Fall Guys", app: ["fallguys client game", "fall guys"], word: ["fallguys"] },
    { name: "Sea of Thieves", app: ["athena", "sea of thieves"], word: ["sea of thieves"] },
    { name: "Warframe", word: ["warframe"] },
    { name: "Destiny 2", app: ["destiny2", "destiny 2"], word: ["destiny2"] },
    { name: "EA FC", app: ["fc24", "fc25", "fc26", "fifa", "fifa23", "fifa22"], word: ["ea sports fc"] },
    { name: "Forza", word: ["forza"] },
    { name: "Les Sims 4", app: ["ts4", "ts4 x64", "the sims 4"], word: ["the sims"] },
    { name: "Cities: Skylines", app: ["cities skylines", "citiesskylines"], word: ["cities skylines"] },
    { name: "Civilization", app: ["civilizationvi", "civilization vi", "civ6"], word: ["civilization"] },
    { name: "Age of Empires", app: ["aoe2de s", "age of empires"], word: ["age of empires"] },
    { name: "Marvel Rivals", app: ["marvel rivals", "marvel"], word: ["marvel rivals"] },
    { name: "Wuthering Waves", app: ["wuthering waves", "client win64 shipping"], word: ["wuthering"] },
    { name: "Delta Force", app: ["delta force", "deltaforce"], word: ["deltaforce"] },
    { name: "Parsec", app: ["parsec"] },
    { name: "GeForce NOW", app: ["geforcenow", "geforce now"], word: ["geforcenow"] },
    { name: "Chess.com", app: [], web: ["chess.com"] },
    { name: "Lichess", app: [], web: ["lichess.org"] },
    { name: "Jeuxvideo.com", app: [], web: ["jeuxvideo.com"] },
    { name: "itch.io", app: [], web: ["itch.io"] },
    { name: "Instant Gaming", app: [], web: ["instant-gaming.com"] },
    { name: "Tracker.gg", app: [], web: ["tracker.gg", "overwolf.com"] },
  ]),

  ...of("shopping", [
    { name: "Amazon", app: ["amazon"], web: ["amazon.fr", "amazon.com", "amazon.co.uk", "amazon.de"], title: ["amazon"] },
    { name: "Leboncoin", app: [], web: ["leboncoin.fr"] },
    { name: "eBay", app: [], web: ["ebay.fr", "ebay.com"] },
    { name: "AliExpress", app: [], web: ["aliexpress.com", "fr.aliexpress.com"] },
    { name: "Temu", app: [], web: ["temu.com"] },
    { name: "Shein", app: [], web: ["shein.com"] },
    { name: "Vinted", app: ["vinted"], web: ["vinted.fr"] },
    { name: "Cdiscount", app: [], web: ["cdiscount.com"] },
    { name: "Fnac", app: [], web: ["fnac.com"] },
    { name: "Darty", app: [], web: ["darty.com"] },
    { name: "Zalando", app: [], web: ["zalando.fr"] },
    { name: "IKEA", app: [], web: ["ikea.com"] },
    { name: "Etsy", app: [], web: ["etsy.com"] },
    { name: "Back Market", app: [], web: ["backmarket.fr"] },
    { name: "Boulanger", app: [], web: ["boulanger.com"] },
    { name: "Decathlon", app: [], web: ["decathlon.fr"] },
    { name: "Uber Eats", app: [], web: ["ubereats.com"] },
    { name: "Deliveroo", app: [], web: ["deliveroo.fr"] },
    { name: "Carrefour", app: [], web: ["carrefour.fr"] },
    { name: "StockX", app: [], web: ["stockx.com"] },
  ]),

  ...of("utilities", [
    { name: "Finder", app: ["finder"] },
    { name: "Explorateur de fichiers", app: ["explorer", "explorateur", "windows explorer"] },
    { name: "Réglages système", app: ["systemsettings", "system settings", "system preferences", "reglages systeme", "reglages", "parametres", "settings", "systempreferences", "systemsettings exe"] },
    { name: "Moniteur d'activité", app: ["activity monitor", "moniteur d activite"] },
    { name: "Gestionnaire des tâches", app: ["taskmgr", "gestionnaire des taches"] },
    { name: "1Password", app: ["1password", "1password 7", "1password 8"], word: ["1password"] },
    { name: "Bitwarden", word: ["bitwarden"] },
    { name: "Dashlane", word: ["dashlane"] },
    { name: "Proton Pass", app: ["proton pass"] },
    { name: "Trousseau d'accès", app: ["keychain access", "trousseau d acces"] },
    { name: "Raycast", app: ["raycast"] },
    { name: "Alfred", app: ["alfred"] },
    { name: "Calculatrice", app: ["calculator", "calc", "calculatrice", "calculette"] },
    { name: "CleanMyMac", word: ["cleanmymac"] },
    { name: "AppCleaner", word: ["appcleaner"] },
    { name: "The Unarchiver", app: ["the unarchiver", "unarchiver"] },
    { name: "WinRAR", app: ["winrar", "rar"] },
    { name: "7-Zip", app: ["7 zip", "7zfm", "7zg"] },
    { name: "Rectangle", app: ["rectangle"] },
    { name: "BetterTouchTool", word: ["bettertouchtool"] },
    { name: "iStat Menus", app: ["istat menus"] },
    { name: "NVIDIA App", app: ["nvidia app", "nvidia geforce experience", "geforce experience", "nvcontainer", "nvidia share"], word: ["geforce experience"] },
    { name: "MSI Afterburner", word: ["afterburner"] },
    { name: "Razer Synapse", word: ["synapse"] },
    { name: "Logitech G HUB", app: ["lghub", "logitech options", "logi options+"], word: ["lghub"] },
    { name: "SteelSeries GG", app: ["steelseriesgg", "steelseries gg"], word: ["steelseries"] },
    { name: "Corsair iCUE", app: ["icue"], word: ["icue"] },
    { name: "Malwarebytes", word: ["malwarebytes"] },
    { name: "Sécurité Windows", app: ["securityhealthsystray", "securityhealthservice", "windows security", "securite windows", "windowsdefender", "msmpeng"], word: ["securityhealth"] },
    { name: "Utilitaire de disque", app: ["disk utility", "utilitaire de disque"] },
    { name: "NordVPN", word: ["nordvpn"] },
    { name: "ProtonVPN", word: ["protonvpn"] },
    { name: "WireGuard", word: ["wireguard"] },
    { name: "Tailscale", word: ["tailscale"] },
    { name: "TeamViewer", word: ["teamviewer"] },
    { name: "AnyDesk", word: ["anydesk"] },
    { name: "RustDesk", word: ["rustdesk"] },
    { name: "Outil Capture d'écran", app: ["snippingtool", "screensketch", "outil capture d ecran", "capture d ecran", "screenshot", "screencapture", "capture"] },
    { name: "Panneau de configuration", app: ["control", "control panel", "panneau de configuration", "rundll32"] },
    { name: "Éditeur du Registre", app: ["regedit"] },
    { name: "App Store", app: ["app store", "appstore", "microsoft store", "winstore app", "store"] },
    { name: "Installeur", app: ["installer", "setup", "msiexec", "programme d installation"] },
    /* Bruit du système : ces « applications » ne sont pas une activité, mais
       elles sont bien au premier plan et se retrouvaient toutes dans « Non
       classé », où elles noyaient les vraies. */
    { name: "Écran de verrouillage", app: ["loginwindow", "lockapp", "screensaverengine", "logonui"] },
    { name: "Bureau Windows", app: ["dwm", "shellexperiencehost", "sihost", "startmenuexperiencehost", "searchhost", "searchapp", "textinputhost", "applicationframehost", "widgets", "widgetboard"] },
    { name: "Interface macOS", app: ["dock", "systemuiserver", "windowserver", "controlcenter", "notificationcenter", "spotlight", "universalcontrol", "coreautha"] },
  ]),
];

/* ─── Index ──────────────────────────────────────────────────────────────── */

export interface CatalogHit {
  entry: CatalogEntry;
  /** Ce qui a permis de reconnaître : sert à expliquer le classement. */
  via: "app" | "word" | "web" | "title";
  /** Longueur du fragment reconnu — départage deux entrées qui matchent. */
  weight: number;
}

const appIndex = new Map<string, CatalogEntry>();
const webIndex = new Map<string, CatalogEntry>();
const wordIndex: { word: string; entry: CatalogEntry }[] = [];
const titleIndex: { word: string; entry: CatalogEntry }[] = [];

for (const entry of CATALOG) {
  const self = norm(entry.name);
  // `app: []` déclare explicitement « ce n'est pas une application » (un site) :
  // sans ça, « Amazon » capterait tout processus nommé « amazon ».
  const apps = entry.app ?? [self];
  for (const a of apps) {
    const key = norm(a);
    if (key && !appIndex.has(key)) appIndex.set(key, entry);
  }
  for (const w of entry.word ?? []) {
    const key = norm(w);
    if (key) wordIndex.push({ word: key, entry });
  }
  // Un nom d'application de 5 lettres ou plus est cherchable tel quel dans le
  // nom relevé : « Adobe Photoshop 2024 » n'est pas « photoshop » à l'identique.
  if ((entry.app ?? [self]).length > 0 && self.length >= 5 && !(entry.word ?? []).includes(self)) {
    wordIndex.push({ word: self, entry });
  }
  for (const d of entry.web ?? []) {
    const key = d.toLowerCase().replace(/^www\./, "");
    if (key && !webIndex.has(key)) webIndex.set(key, entry);
  }
  for (const t of entry.title ?? []) {
    const key = norm(t);
    if (key) titleIndex.push({ word: key, entry });
  }
  /* Le nom d'un SITE se trouve tel quel dans le titre (« … — YouTube »). En un
     seul mot et à partir de cinq lettres seulement : « Le Monde » chercherait
     « le monde » dans toutes les phrases françaises, et « X » partout. Les noms
     en plusieurs mots qui méritent d'être cherchés le déclarent (`title`). */
  if ((entry.web?.length ?? 0) > 0 && self.length >= 5 && !self.includes(" ")
      && !(entry.title ?? []).some(t => norm(t) === self)) {
    titleIndex.push({ word: self, entry });
  }
}

// Du fragment le plus long au plus court : « league of legends » doit gagner
// contre « league », et « amazon music » contre « amazon ».
wordIndex.sort((a, b) => b.word.length - a.word.length);
titleIndex.sort((a, b) => b.word.length - a.word.length);

/**
 * Un mot est-il présent ? En dessous de 5 caractères, il doit être un mot
 * entier — sinon « lol » classerait « Lollapalooza » et « x » à peu près tout.
 */
function hasWord(hay: string, word: string, allowGlued = true): boolean {
  if (!word) return false;
  if (` ${hay} `.includes(` ${word} `)) return true;
  if (allowGlued && word.length >= 5 && glued(hay).includes(glued(word))) return true;
  return false;
}

/** Application reconnue à son nom exact. */
export function matchAppExact(app: string): CatalogHit | null {
  const n = norm(app);
  const entry = appIndex.get(n) ?? appIndex.get(glued(n));
  return entry ? { entry, via: "app", weight: n.length + 100 } : null;
}

/** Application reconnue à un mot de son nom. */
export function matchAppWord(app: string): CatalogHit | null {
  const n = norm(app);
  for (const { word, entry } of wordIndex) {
    if (hasWord(n, word)) return { entry, via: "word", weight: word.length + 50 };
  }
  return null;
}

/** Site reconnu à son domaine. */
export function matchDomain(host: string): CatalogHit | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  const direct = webIndex.get(h);
  if (direct) return { entry: direct, via: "web", weight: h.length + 80 };
  // Sous-domaine inconnu d'un domaine connu : « fr.instagram.com » →
  // « instagram.com ». On remonte d'un cran à la fois, en gardant le plus précis.
  const parts = h.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    const hit = webIndex.get(parent);
    if (hit) return { entry: hit, via: "web", weight: parent.length + 80 };
  }
  return null;
}

/**
 * Site reconnu à son nom dans le titre de la fenêtre.
 *
 * On ne cherche pas dans la phrase entière mais dans ses MORCEAUX : une page
 * s'appelle « Sujet — Site », et c'est le morceau qui compte. Chercher dans le
 * tout classait « Un site inconnu de tout le monde » dans la presse, à cause
 * des deux derniers mots. Un morceau qui vaut exactement le nom cherché suffit
 * (« Accueil / X ») ; sinon il faut un vrai mot, d'au moins quatre lettres.
 */
export function titleSegments(title: string): string[] {
  const t = cleanBrowserTitle(title);
  const segs = t.split(/\s*[-—–|·•:/]\s*|\s+[-—–|·•]\s+/).map(norm).filter(Boolean);
  const whole = norm(t);
  return whole && !segs.includes(whole) ? [...segs, whole] : segs;
}

export function matchTitle(title: string): CatalogHit | null {
  const segments = titleSegments(title);
  if (!segments.length) return null;
  for (const { word, entry } of titleIndex) {
    for (const seg of segments) {
      if (seg === word) return { entry, via: "title", weight: word.length + 40 };
      if (word.length >= 4 && hasWord(seg, word, false)) {
        return { entry, via: "title", weight: word.length };
      }
    }
  }
  return null;
}

/* ─── Lecture d'un titre de navigateur ───────────────────────────────────── */

/** Extensions de domaine acceptées — sans cette liste, « engine.ts » passerait
 *  pour un site (et « stats.ts », et tous les fichiers ouverts dans un éditeur). */
const TLD = new Set([
  "com", "net", "org", "io", "fr", "dev", "app", "gg", "tv", "co", "ai", "me",
  "xyz", "so", "info", "news", "shop", "store", "cloud", "tech", "live", "media",
  "edu", "gov", "eu", "uk", "de", "es", "it", "be", "ch", "ca", "nl", "pl", "pt",
  "se", "no", "fi", "dk", "at", "ie", "cz", "ru", "jp", "cn", "br", "in", "au",
  "kr", "mx", "ar", "tr", "ua", "ro", "gr", "hu", "sk", "si", "hr", "bg", "lt",
  "lv", "ee", "is", "lu", "md", "to", "sh", "fm", "am", "im", "re", "gouv", "lol",
]);

/**
 * Domaine trouvé dans un titre de fenêtre, s'il y en a un.
 *
 * Beaucoup de pages posent leur URL dans le titre (ou l'utilisateur regarde une
 * capture d'écran d'URL) ; quand elle y est, c'est le signal le plus sûr qu'on
 * puisse avoir sans lire la barre d'adresse — ce qu'aucune API ne permet depuis
 * une autre application.
 */
export function domainInTitle(title: string): string | null {
  const t = (title || "").toLowerCase();
  const re = /(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const host = m[1];
    const parts = host.split(".");
    const tld = parts[parts.length - 1];
    // « impots.gouv.fr » : le vrai suffixe est en deux morceaux.
    if (parts.length >= 2 && (TLD.has(tld) || TLD.has(parts.slice(-2).join(".")))) {
      if (parts.length === 2 && parts[0].length <= 1) continue;
      return host;
    }
  }
  if (/\blocalhost(:\d+)?\b/.test(t)) return "localhost";
  return null;
}

/** Le titre débarrassé du nom du navigateur et des compteurs de notifications. */
export function cleanBrowserTitle(title: string): string {
  let t = (title || "").replace(/^\(\d+\+?\)\s*/, "").trim();
  t = t.replace(/\s+(?:and|et)\s+\d+\s+(?:more\s+)?(?:pages?|autres?\s+onglets?).*$/i, "");
  for (const suffix of BROWSER_SUFFIXES) {
    const re = new RegExp(`\\s*[-—–|·]\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    t = t.replace(re, "");
  }
  t = t.replace(/\s*[-—–|]\s*(?:profil|profile)\s*\d*\s*$/i, "");
  return t.trim();
}

/**
 * Nom du site DEVINÉ à partir du titre, quand aucune entrée du catalogue ne
 * correspond. La plupart des pages écrivent « Sujet — Site » : le dernier
 * morceau est le site neuf fois sur dix.
 *
 * Ce n'est pas un classement (la page reste « Non classé ») : c'est un NOM, pour
 * que la file d'attente dise « Le Monde » et non « Google Chrome » douze fois —
 * et qu'un clic suffise à la classer.
 */
export function guessSiteName(title: string): string | null {
  const t = cleanBrowserTitle(title);
  if (!t) return null;
  const domain = domainInTitle(t);
  if (domain) {
    const parts = domain.split(".");
    const core = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    if (core && core !== "localhost") return core.charAt(0).toUpperCase() + core.slice(1);
    return domain;
  }
  const parts = t.split(/\s+[-—–|·•:]\s+/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  /* On remonte les morceaux depuis la fin. Le site est le plus souvent le
     dernier — mais beaucoup de pages ajoutent une accroche derrière lui
     (« … | Anime-Sama - Streaming et catalogage d'animes et scans. ») : s'arrêter
     au dernier morceau ne donnait alors AUCUN nom, et la ligne restait sous le
     nom du navigateur, impossible à ranger d'un clic. Le premier morceau qui a
     la taille d'un nom fait l'affaire. */
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i];
    if (seg.length <= 32 && seg.split(/\s+/).length <= 4) return seg;
  }
  return null;
}
