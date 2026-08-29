/**
 * Garde-fous de la récupération d'un flux iCal fourni par l'utilisateur.
 *
 * Le serveur va chercher une URL que n'importe quel compte a saisie : c'est,
 * littéralement, une requête sortante pilotée depuis l'extérieur. Sans filtre,
 * elle atteindrait le réseau interne de l'hébergeur — métadonnées d'instance,
 * services privés, `localhost`. D'où le contrôle du schéma ET de la cible, y
 * compris à chaque redirection.
 */

/** `webcal://` est l'habillage historique d'un `https://` — les ENT n'exposent souvent que celui-là. */
export function normalizeFeedUrl(input: string): string {
  const raw = String(input || "").trim();
  if (/^webcals?:\/\//i.test(raw)) return raw.replace(/^webcals?:\/\//i, "https://");
  return raw;
}

/**
 * IPv4 encapsulée en IPv6 → forme pointée.
 *
 * `new URL()` réécrit `::ffff:127.0.0.1` en `::ffff:7f00:1` : une comparaison
 * sur la forme pointée seule laisserait donc passer la boucle locale. Les deux
 * écritures doivent être ramenées au même quadruplet.
 */
function unwrapMappedIPv4(h: string): string {
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(h);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h);
  if (hex) {
    const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  return h;
}

/** Adresse littérale non routable (boucle locale, réseau privé, lien-local, métadonnées cloud). */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;

  // IPv6 : boucle locale, lien-local (fe80::/10), unique-local (fc00::/7).
  if (h === "::1" || h === "::" || /^fe[89ab][0-9a-f]:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  const v4 = unwrapMappedIPv4(h);

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (m.slice(1).some((n) => Number(n) > 255)) return true; // adresse absurde : on refuse
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // lien-local, dont 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast et réservé
  return false;
}

export type FeedCheck = { ok: true; url: URL } | { ok: false; error: string };

/** Valide une URL de flux avant toute requête sortante. */
export function checkFeedUrl(input: string): FeedCheck {
  let url: URL;
  try {
    url = new URL(normalizeFeedUrl(input));
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "bad_protocol" };
  if (isPrivateHost(url.hostname)) return { ok: false, error: "blocked_host" };
  return { ok: true, url };
}
