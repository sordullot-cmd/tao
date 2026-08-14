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

import { createPrivateKey, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";

import {
  ALL_DAYS,
  normalizeTransaction,
  sortTransactions,
  type BankTransaction,
  type RawTransaction,
} from "@/lib/bank/transactions";

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
  /** Logo de la banque, tel que publié par l'agrégateur. `null` s'il n'en a pas. */
  logo: string | null;
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

/**
 * Retrouve le PEM depuis la variable d'environnement.
 *
 * Le format attendu est le base64 du fichier `.pem` — une variable
 * d'environnement ne peut pas porter ses retours à la ligne. Mais certains
 * hébergeurs acceptent le multi-ligne, et il est naturel d'y coller le PEM tel
 * quel : les deux formes sont donc reconnues, plutôt que de faire échouer la
 * signature sur une saisie qui n'a rien d'absurde.
 */
export function readPrivateKeyPem(raw: string): string {
  const value = raw.trim();
  if (value.includes("-----BEGIN")) return value;

  const decoded = Buffer.from(value, "base64").toString("utf8").trim();
  if (decoded.includes("-----BEGIN")) return decoded;

  throw new Error(
    "ENABLEBANKING_PRIVATE_KEY_BASE64 ne contient pas de clé PEM. " +
      "Attendu : le base64 du fichier .pem, ou son contenu tel quel " +
      "(commençant par -----BEGIN).",
  );
}

/**
 * Charge la clé de signature.
 *
 * `crypto.createPrivateKey` remplace ici `jose.importPKCS8`, qui n'accepte QUE
 * du PKCS#8 (`-----BEGIN PRIVATE KEY-----`) et rejette le PKCS#1
 * (`-----BEGIN RSA PRIVATE KEY-----`) — un format que les fournisseurs livrent
 * couramment. Node lit les deux, et jose signe indifféremment à partir d'un
 * `KeyObject`. Cela évite d'imposer une conversion `openssl pkcs8 -topk8`
 * préalable, et la signature est identique dans les deux cas.
 */
export function loadPrivateKey(raw: string = bankConfig.privateKeyBase64): KeyObject {
  const pem = readPrivateKeyPem(raw);
  try {
    return createPrivateKey(pem);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Clé privée Enable Banking illisible (${detail}). ` +
        "Vérifie qu'il s'agit bien d'une clé privée RSA non chiffrée.",
    );
  }
}

async function getJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) return cachedJwt.token;

  const key = loadPrivateKey();

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

/* ── Logos ─────────────────────────────────────────────────────────────────
   Les soldes ne portent pas le logo de la banque : il vit sur la fiche ASPSP.
   On récupère donc la liste une fois et on garde la correspondance nom → logo
   en mémoire pour la durée du process. Elle change au rythme du catalogue de
   l'agrégateur, soit à peu près jamais à l'échelle d'un déploiement.
   ------------------------------------------------------------------------ */

let cachedLogos: { map: Map<string, string>; expiresAt: number } | null = null;
const LOGO_TTL = 6 * 3600_000; // 6 h

async function getLogoMap(): Promise<Map<string, string>> {
  if (cachedLogos && cachedLogos.expiresAt > Date.now()) return cachedLogos.map;
  try {
    const institutions = await listInstitutions();
    const map = new Map<string, string>();
    for (const inst of institutions) {
      if (inst.logo) map.set(inst.name, inst.logo);
    }
    cachedLogos = { map, expiresAt: Date.now() + LOGO_TTL };
    return map;
  } catch {
    // Un logo manquant n'est pas une raison de faire échouer l'agrégation :
    // l'affichage retombe sur les initiales de la banque.
    return new Map();
  }
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
      logo: null, // rempli par `fetchAccounts`, qui a la table des logos
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

  // La table des logos se charge PENDANT les soldes, pas après : elle ne doit
  // rien ajouter au temps d'attente.
  const [results, logos] = await Promise.all([Promise.all(jobs), getLogoMap()]);

  return results
    .filter((a): a is BankAccount => a !== null)
    .map((a) => ({ ...a, logo: logos.get(a.institution) ?? null }));
}

/* ── Mouvements ────────────────────────────────────────────────────────────
   `GET /accounts/{uid}/transactions` pagine par `continuation_key`.

   La profondeur d'historique n'est PAS la même chose que la durée du
   consentement : les 90 jours de la DSP2 bornent l'accès sans nouvelle
   authentification forte, pas la fenêtre qu'on peut demander. La plupart des
   banques rendent 12 à 24 mois, certaines beaucoup moins — d'où une profondeur
   passée en paramètre, et un affichage qui dit ensuite jusqu'où l'historique
   remonte réellement plutôt que de promettre ce qui a été demandé.
   ------------------------------------------------------------------------ */

/** Profondeur par défaut, en jours : de quoi remplir les fenêtres courtes sans
 *  faire attendre. Les vues longues la redemandent explicitement. */
export const TRANSACTIONS_WINDOW_DAYS = 90;

/** Profondeurs qu'un client peut demander. Liste fermée : `date_from` part chez
 *  l'agrégateur, et une valeur arbitraire venue de l'URL n'a rien à y faire.
 *  `ALL_DAYS` (0) demande tout ce que la banque veut bien rendre. */
export const TRANSACTIONS_DEPTHS = [90, 180, 365, ALL_DAYS] as const;

/** Garde-fous de pagination. Ils bornent le pire cas — un historique de
 *  plusieurs années sur un compte très actif — et empêchent une
 *  `continuation_key` qui se répéterait de boucler indéfiniment. */
const TRANSACTIONS_MAX_PAGES = 60;
const TRANSACTIONS_MAX_ROWS = 5000;

/**
 * Mouvements d'un compte, du plus récent au plus ancien.
 *
 * Deux régimes, et c'est TOUT le sujet de la profondeur d'historique :
 *
 *  - jusqu'à 90 jours, un simple `date_from`. C'est la fenêtre que toutes les
 *    banques ouvrent sans condition (le plancher DSP2), donc elle ne rate rien
 *    et ne coûte qu'une page ou deux ;
 *
 *  - au-delà, `strategy=longest`. Sans ce paramètre, l'ASPSP répond avec SA
 *    profondeur par défaut — le plus souvent 90 jours — et un `date_from` plus
 *    ancien se solde par un `WRONG_TRANSACTIONS_PERIOD` plutôt que par ce
 *    qu'elle a. Avec, l'agrégateur cherche la plus ancienne opération
 *    disponible et remonte jusqu'à elle ; `date_from` n'est plus qu'une
 *    suggestion de point de départ, et une banque courte rend simplement moins
 *    que demandé au lieu d'échouer. `ALL_DAYS` n'envoie pas de `date_from` du
 *    tout : la recherche part alors du plus loin que l'agrégateur connaisse.
 *
 * Ce que la banque rend vraiment reste sa décision : l'accès à l'historique
 * long dépend surtout de la fraîcheur de l'authentification forte, beaucoup
 * d'ASPSP le refermant à 90 jours passé le consentement initial. L'appelant
 * annonce donc la date du plus ancien mouvement OBTENU, jamais la fenêtre
 * demandée.
 */
export async function fetchTransactions(
  uid: string,
  days: number = TRANSACTIONS_WINDOW_DAYS,
): Promise<BankTransaction[]> {
  const raw: RawTransaction[] = [];
  let continuationKey: string | null = null;
  const longest = days === ALL_DAYS || days > TRANSACTIONS_WINDOW_DAYS;

  for (let page = 0; page < TRANSACTIONS_MAX_PAGES; page += 1) {
    const params = new URLSearchParams();
    if (days !== ALL_DAYS) {
      params.set("date_from", new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10));
    }
    if (longest) params.set("strategy", "longest");
    if (continuationKey) params.set("continuation_key", continuationKey);

    const query = params.toString();
    const resp = await ebFetch(`/accounts/${uid}/transactions${query ? `?${query}` : ""}`);
    if (!resp.ok) throw await ebError(resp, "Enable Banking (mouvements du compte)");

    const data = await resp.json();
    raw.push(...((data.transactions ?? []) as RawTransaction[]));
    /* Une page VIDE accompagnée d'une clé n'est pas la fin : en `longest`,
       l'agrégateur remonte le temps par paliers et rend des pages vides tant
       qu'il cherche. C'est la clé qui dit s'il reste quelque chose, jamais le
       nombre de lignes — d'où le plafond de pages relevé, qui doit absorber
       cette recherche en plus des lignes elles-mêmes. */
    continuationKey = data.continuation_key ?? null;
    if (!continuationKey || raw.length >= TRANSACTIONS_MAX_ROWS) break;
  }

  return sortTransactions(raw.map((tx, i) => normalizeTransaction(tx, i)));
}
