/* tao trade — minimal service worker
 *
 * Stratégies:
 *  - HTML / "navigate" requests : network-first, fallback cache
 *  - Static assets sous /_next/static/ : cache-first
 *  - Tout le reste : network-first
 *  - APIs (/api/*) : pas de cache (toujours réseau)
 */

const VERSION = "v6";
const SHELL_CACHE = `tao-shell-${VERSION}`;
const RUNTIME_CACHE = `tao-runtime-${VERSION}`;

/* `/` n'est PAS dans cette liste : c'est une redirection serveur vers /login,
   et une réponse redirigée ne peut pas être mise en cache — `cache.add("/")`
   jette, et l'échec était avalé par le `catch` ci-dessous. Une navigation vers
   `/` hors ligne retombe de toute façon sur `/dashboard` (voir le gestionnaire
   `fetch`), ce qui est le bon écran. */
const SHELL_URLS = [
  "/dashboard",
  "/login",
  // Page de blocage : elle s'affiche dans un onglet qu'on vient de couper, sur
  // un poste qui n'est pas forcément en ligne. La pré-cacher est ce qui la rend
  // sûre — une page de blocage qui n'arrive pas laisse l'onglet sur une erreur
  // de réseau, et le site coupé à un retour arrière.
  "/blocked",
  // Popover de la barre d'état (macOS). Il s'ouvre par définition quand l'app
  // est FERMÉE, donc souvent sur un poste qui vient de se réveiller : sans
  // pré-cache, le premier clic sur l'icône donne une fenêtre blanche. Le menu
  // natif reste au clic droit, mais c'est un repli, pas la surface qu'on vise.
  "/tray",
  "/manifest.webmanifest",
  "/logo.svg",   // logo affiché dans l'interface (écran de chargement hors-ligne)
  "/favicon.svg",
  "/favicon.ico",
];

/* Pages dont on veut aussi le JS, pas seulement le HTML. */
const SHELL_HTML = ["/dashboard", "/login", "/tray"];

/**
 * Pré-cache les assets versionnés référencés par une page.
 *
 * Leurs noms portent un hash qui change à chaque build : impossible de les
 * écrire ici. On les lit donc dans le HTML au moment de l'installation.
 *
 * Sans ça, le cache-first sur `/_next/static/` ne sert à rien au premier
 * démarrage hors ligne suivant un déploiement : le shell HTML est en cache,
 * mais le JS qui le fait vivre n'y est pas — et une coquille sans son JS est
 * une page blanche, ce qui est pire qu'une erreur réseau franche.
 *
 * Le lazy-loading laisse forcément des morceaux dehors (les chunks d'un écran
 * jamais ouvert). C'est assumé : on garantit le démarrage, pas l'app entière.
 */
async function precacheShellAssets(cache) {
  const assets = new Set();
  for (const url of SHELL_HTML) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const html = await res.text();
      for (const match of html.matchAll(/\/_next\/static\/[^"'\s>\\)]+/g)) {
        assets.add(match[0]);
      }
    } catch (err) {
      console.warn("[sw] assets illisibles:", url, err?.message || err);
    }
  }
  await Promise.all(
    [...assets].map((asset) =>
      cache.add(asset).catch((err) => {
        console.warn("[sw] skip asset:", asset, err?.message || err);
      })
    )
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_URLS.map((url) =>
          shell.add(url).catch((err) => {
            console.warn("[sw] skip pre-cache:", url, err?.message || err);
          })
        )
      );
      // Dans RUNTIME_CACHE, comme les assets attrapés à la volée par `fetch`.
      const runtime = await caches.open(RUNTIME_CACHE);
      await precacheShellAssets(runtime);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ne touche pas aux requêtes non-GET
  if (req.method !== "GET") return;

  // Pas de cache pour les APIs (Supabase, Next API routes, OAuth)
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.endsWith(".supabase.co")
  ) {
    return;
  }

  // Static Next.js : cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
            return res;
          })
      )
    );
    return;
  }

  // HTML pages : network-first, fallback cache
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/dashboard")))
    );
    return;
  }

  // Autres GET : network-first avec fallback cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
