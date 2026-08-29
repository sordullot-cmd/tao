import { parseIcs, filterByRange, prettifyIcsEvent } from "@/lib/ics";
import { checkFeedUrl } from "@/lib/icsFetch";

export const dynamic = "force-dynamic";

/** Un export universitaire complet pèse quelques centaines de Ko ; au-delà, c'est autre chose. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Un ENT lent ne doit pas retenir la fonction jusqu'à son propre délai maximum. */
const TIMEOUT_MS = 15_000;
/**
 * Le même emploi du temps est redemandé à chaque changement de semaine. Un cache
 * mémoire court évite de marteler le serveur de l'établissement — les instances
 * étant réutilisées, il sert la plupart des navigations d'une même session. Il
 * n'est pas partagé entre instances : c'est un adoucisseur, pas une garantie.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // url → { at, text }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Récupère le flux, en refusant tout ce qui sort du cadre (taille, redirection privée). */
async function fetchFeed(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8", "User-Agent": "tr4de-agenda/1.0" },
    });
    if (!res.ok) return { error: `http_${res.status}`, status: res.status === 404 ? 404 : 502 };

    // Une redirection a pu mener ailleurs que la cible validée : on revérifie.
    const finalCheck = checkFeedUrl(res.url || url.toString());
    if (!finalCheck.ok) return { error: "blocked_host", status: 400 };

    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > MAX_BYTES) return { error: "too_large", status: 413 };

    const text = await res.text();
    if (text.length > MAX_BYTES) return { error: "too_large", status: 413 };
    if (!/BEGIN:VCALENDAR/i.test(text)) return { error: "not_a_calendar", status: 422 };
    return { text };
  } catch (e) {
    if (e?.name === "AbortError") return { error: "timeout", status: 504 };
    return { error: "fetch_failed", status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lit un flux iCal et renvoie les évènements de la fenêtre demandée.
 * Body : { url, timeMin?, timeMax? }
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body" }, 400);
  }

  const check = checkFeedUrl(body?.url);
  if (!check.ok) return json({ error: check.error }, 400);

  const key = check.url.toString();
  const hit = cache.get(key);
  let text = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.text : null;

  if (!text) {
    const res = await fetchFeed(check.url);
    if (res.error) return json({ error: res.error }, res.status);
    text = res.text;
    cache.set(key, { at: Date.now(), text });
    // Le cache est borné : sans ça, une instance longue durée accumulerait un
    // flux par URL jamais revisitée.
    if (cache.size > 50) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
  }

  let events;
  try {
    events = parseIcs(text);
  } catch {
    return json({ error: "parse_failed" }, 422);
  }

  const total = events.length;
  if (body.timeMin && body.timeMax) events = filterByRange(events, body.timeMin, body.timeMax);

  return json({ events: events.map(prettifyIcsEvent), total, cached: !!hit });
}
