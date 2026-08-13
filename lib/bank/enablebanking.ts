/**
 * Connecteur Enable Banking — agrégation bancaire DSP2, en LECTURE SEULE.
 *
 * Porté de `lib/connectors/enablebanking.ts` de l'app patrimoine. Le flux et les
 * appels à l'API sont repris tels quels ; la persistance change : l'original
 * écrivait dans Postgres via Drizzle sans notion d'utilisateur (app mono-compte),
 * tr4de écrit dans Supabase et rattache chaque session à son `user_id`, protégé
 * par RLS (migration 033).
 *
 * Flux complet :
 *   1. JWT RS256 signé avec la clé privée de l'application ;
 *   2. `GET /aspsps` — la liste des banques du pays ;
 *   3. `POST /auth` — un lien de consentement que l'utilisateur ouvre ;
 *   4. retour avec un `code` → `POST /sessions` — le code devient une session
 *      et la liste des comptes couverts ;
 *   5. `GET /accounts/{uid}/balances` — les soldes, relus à chaque agrégation.
 *
 * Aucun solde n'est stocké : seuls les identifiants de session le sont. Rien
 * n'est jamais écrit côté banque — l'API utilisée est en lecture.
 *
 * Documentation : https://enablebanking.com/docs/api/reference/
 */

import { SignJWT, importPKCS8 } from "jose";

const BASE_URL = "https://api.enablebanking.com";

/** Durée de consentement demandée. La banque peut la plafonner. */
const CONSENT_DAYS = 90;

export interface Institution {
  id: string;
  name: string;
  logo?: string;
}

export interface BankAccount {
  /** `enablebanking-<uid>` — préfixé pour ne jamais collisionner avec un actif saisi. */
  id: string;
  uid: string;
  name: string;
  type: "checking" | "savings";
  balance: number;
  currency: string;
  institution: string;
}

export const bankConfig = {
  appId: process.env.ENABLEBANKING_APP_ID || "",
  privateKeyBase64: process.env.ENABLEBANKING_PRIVATE_KEY_BASE64 || "",
  country: process.env.ENABLEBANKING_COUNTRY || "FR",
};

/** Sans identifiants, tout le reste du module est inutilisable : les routes le
 *  vérifient d'abord et répondent une erreur explicite plutôt qu'un HTTP 500. */
export function isBankConfigured(): boolean {
  return Boolean(bankConfig.appId && bankConfig.privateKeyBase64);
}

/* ── Authentification ──────────────────────────────────────────────────── */

// Le JWT vaut une heure : on le garde pour la durée du process plutôt que de le
// resigner à chaque appel (la signature RS256 n'est pas gratuite).
let cachedJwt: { token: string; expiresAt: number } | null = null;

async function getJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) return cachedJwt.token;

  // La clé privée .pem (PKCS#8) est fournie encodée en base64, sur une ligne —
  // une variable d'environnement ne peut pas porter les retours à la ligne du PEM.
  const pem = Buffer.from(bankConfig.privateKeyBase64, "base64").toString("utf8");
  const key = await importPKCS8(pem, "RS256");

  const iat = Math.floor(Date.now() / 1000);
  const ttl = 3600; // 1 h (24 h maximum autorisé)
  const token = await new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: bankConfig.appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttl)
    .sign(key);

  cachedJwt = { token, expiresAt: (iat + ttl) * 1000 };
  return token;
}

/** Options de `fetch`, dérivées de la fonction elle-même : `RequestInit` est un
 *  type DOM global, que le lint ne résout pas dans un module serveur. */
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

async function ebFetch(path: string, init?: FetchInit): Promise<Response> {
  const token = await getJwt();
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/** Enable Banking rend `{ code, message, error, detail }` : on remonte le message
 *  au lieu d'un « HTTP 400 » nu, que l'utilisateur ne peut pas exploiter. */
async function ebError(resp: Response, context: string): Promise<Error> {
  let detail = "";
  try {
    const body = await resp.json();
    detail = body.message || body.error || JSON.stringify(body);
  } catch {
    detail = await resp.text().catch(() => "");
  }
  return new Error(`${context} (HTTP ${resp.status})${detail ? ` : ${detail}` : ""}`);
}

/* ── Banques et consentement ───────────────────────────────────────────── */

export async function listInstitutions(country = bankConfig.country): Promise<Institution[]> {
  const resp = await ebFetch(`/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
  if (!resp.ok) throw await ebError(resp, "Enable Banking (liste des banques)");
  const data = await resp.json();
  const aspsps = (data.aspsps ?? data ?? []) as { name: string; logo?: string }[];
  // Enable Banking n'expose pas d'identifiant par banque : le nom est unique par pays.
  return aspsps.map((a) => ({ id: a.name, name: a.name, logo: a.logo }));
}

/** Crée le lien de consentement que l'utilisateur doit ouvrir chez sa banque. */
export async function createAuthLink(
  institutionName: string,
  redirectUrl: string,
): Promise<string> {
  const state = `taotrade-${institutionName}-${Date.now()}`;
  const validUntil = new Date(Date.now() + CONSENT_DAYS * 86_400_000)
    .toISOString()
    .replace("Z", "+00:00");

  const resp = await ebFetch("/auth", {
    method: "POST",
    body: JSON.stringify({
      aspsp: { name: institutionName, country: bankConfig.country },
      access: { valid_until: validUntil },
      state,
      redirect_url: redirectUrl,
      psu_type: "personal",
    }),
  });
  if (!resp.ok) throw await ebError(resp, "Enable Banking (démarrage du consentement)");
  const data = await resp.json();
  return data.url as string;
}

export interface CreatedSession {
  sessionId: string;
  aspspName: string;
  aspspCountry: string;
  accountUids: string[];
  validUntil: string | null;
}

/** Échange le `code` du retour de consentement contre une session exploitable. */
export async function createSession(code: string): Promise<CreatedSession> {
  const resp = await ebFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!resp.ok) throw await ebError(resp, "Enable Banking (création de la session)");
  const data = await resp.json();
  const accounts = (data.accounts ?? []) as { uid: string }[];
  return {
    sessionId: data.session_id,
    aspspName: data.aspsp?.name ?? "Banque",
    aspspCountry: data.aspsp?.country ?? bankConfig.country,
    accountUids: accounts.map((a) => a.uid),
    validUntil: data.access?.valid_until ?? null,
  };
}

/* ── Soldes ────────────────────────────────────────────────────────────── */

/** Solde le plus pertinent parmi les types ISO 20022 rendus par la banque. */
function pickBalance(
  balances: { balance_amount: { amount: string; currency: string }; balance_type: string }[],
) {
  const order = ["CLBD", "ITAV", "ITBD", "XPCD", "OPAV", "PRCD"];
  for (const type of order) {
    const match = balances.find((b) => b.balance_type === type);
    if (match) return match.balance_amount;
  }
  return balances[0]?.balance_amount;
}

function mapAccountType(cashAccountType?: string): "checking" | "savings" {
  return cashAccountType === "SVGS" ? "savings" : "checking";
}

/** Un compte en échec rend `null` : il ne doit pas faire tomber toute l'agrégation. */
async function fetchOneAccount(uid: string, aspspName: string): Promise<BankAccount | null> {
  try {
    const [balResp, detResp] = await Promise.all([
      ebFetch(`/accounts/${uid}/balances`),
      ebFetch(`/accounts/${uid}/details`),
    ]);
    if (!balResp.ok) return null;
    const balances = (await balResp.json()).balances ?? [];
    const amount = pickBalance(balances);
    if (!amount) return null;

    const details = detResp.ok ? await detResp.json() : {};
    return {
      id: `enablebanking-${uid}`,
      uid,
      name: details.name || details.product || aspspName,
      type: mapAccountType(details.cash_account_type),
      balance: Math.round(parseFloat(amount.amount) * 100) / 100,
      currency: amount.currency || "EUR",
      institution: aspspName,
    };
  } catch {
    return null;
  }
}

/**
 * Soldes de tous les comptes d'une liste de sessions.
 *
 * Les comptes sont interrogés EN PARALLÈLE : la latence totale est celle du
 * compte le plus lent, pas la somme de tous.
 */
export async function fetchAccounts(
  connections: { aspsp_name: string; account_uids: unknown }[],
): Promise<BankAccount[]> {
  const jobs = connections.flatMap((conn) => {
    const uids = Array.isArray(conn.account_uids) ? (conn.account_uids as string[]) : [];
    return uids.map((uid) => fetchOneAccount(uid, conn.aspsp_name));
  });
  const results = await Promise.all(jobs);
  return results.filter((a): a is BankAccount => a !== null);
}
