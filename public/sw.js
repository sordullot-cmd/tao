/* tao trade — minimal service worker
 *
 * Stratégies:
 *  - HTML / "navigate" requests : network-first, fallback cache
 *  - Static assets sous /_next/static/ : cache-first
 *  - Tout le reste : network-first
 *  - APIs (/api/*) : pas de cache (toujours réseau)
 */

const VERSION = "v4";
const SHELL_CACHE = `tao-shell-${VERSION}`;
const RUNTIME_CACHE = `tao-runtime-${VERSION}`;

const SHELL_URLS = [
  "/",
  "/dashboard",
  "/login",
  // Page de blocage : elle s'affiche dans un onglet qu'on vient de couper, sur
  // un poste qui n'est pas forcément en ligne. La pré-cacher est ce qui la rend
  // sûre — une page de blocage qui n'arrive pas laisse l'onglet sur une erreur
  // de réseau, et le site coupé à un retour arrière.
  "/blocked",
  "/manifest.webmanifest",
  "/logo.svg",   // logo affiché dans l'interface (écran de chargement hors-ligne)
  "/favicon.svg",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[sw] skip pre-cache:", url, err?.message || err);
          })
        )
      )
    ).then(() => self.skipWaiting())
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
