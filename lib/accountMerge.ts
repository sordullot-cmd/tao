import { createHmac, timingSafeEqual } from "crypto";

/* Code de transfert pour la fusion de comptes (Paramètres → Fusion).
 *
 * Il prouve qu'on tient la session du compte SOURCE. Un formulaire e-mail +
 * mot de passe aurait suffi pour les comptes classiques, mais pas pour ceux
 * créés via Google : ils n'ont pas de mot de passe. Le code est émis depuis
 * la source, collé dans la cible.
 *
 * Signé plutôt que stocké : rien à migrer, rien à purger. Le revers est qu'un
 * code reste valable jusqu'à son expiration même après usage — sans gravité,
 * une seconde fusion ne trouve plus rien à déplacer. */

export const MERGE_CODE_TTL_MS = 15 * 60 * 1000;
const PREFIX = "tao-";

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(`merge-trading:${body}`).digest().subarray(0, 16);
}

export function createMergeCode(sourceUserId: string, secret: string, now = Date.now()) {
  const expiresAt = now + MERGE_CODE_TTL_MS;
  const body = b64url(Buffer.from(JSON.stringify({ s: sourceUserId, e: expiresAt })));
  return { code: `${PREFIX}${body}.${b64url(sign(body, secret))}`, expiresAt };
}

export type MergeCodeCheck =
  | { ok: true; sourceUserId: string }
  | { ok: false; reason: "invalid" | "expired" };

export function verifyMergeCode(code: string, secret: string, now = Date.now()): MergeCodeCheck {
  // Un copier-coller ramasse volontiers une espace ou un saut de ligne.
  const raw = String(code || "").replace(/\s+/g, "");
  if (!raw.startsWith(PREFIX)) return { ok: false, reason: "invalid" };
  const [body, mac] = raw.slice(PREFIX.length).split(".");
  if (!body || !mac) return { ok: false, reason: "invalid" };

  const expected = sign(body, secret);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "invalid" };
  }

  let payload: { s?: unknown; e?: unknown };
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { return { ok: false, reason: "invalid" }; }
  if (typeof payload.s !== "string" || typeof payload.e !== "number") return { ok: false, reason: "invalid" };
  if (payload.e < now) return { ok: false, reason: "expired" };
  return { ok: true, sourceUserId: payload.s };
}
