"use client";

/**
 * Comptes bancaires agrégés — cache d'abord, relecture ensuite.
 *
 * L'agrégation traverse Enable Banking puis la banque : deux secondes, parfois
 * plus. Le premier parti pris était de ne RIEN garder en cache (un solde périmé
 * affiché comme courant est pire qu'une attente) — mais la conséquence, elle, se
 * payait à chaque écran : les comptes disparaissaient puis réapparaissaient à
 * chaque visite, et cinq pages appelant ce hook lançaient cinq requêtes.
 *
 * Le compromis retenu est celui de `useCloudState`, déjà la convention du
 * projet : on montre tout de suite ce qu'on avait, on relit derrière, et on dit
 * DEPUIS QUAND la donnée date (`updatedAt`) plutôt que de la cacher jusqu'à
 * confirmation. Concrètement :
 *
 *   — un store de module partagé par toutes les pages, donc une seule requête
 *     en vol, et aucun clignotement en changeant d'écran ;
 *   — un cache localStorage, donc un premier rendu immédiat même après
 *     rechargement complet de l'application ;
 *   — `loading` ne vaut vrai que s'il n'y a RIEN à montrer ; une relecture
 *     par-dessus des comptes déjà affichés passe par `revalidating` ;
 *   — une relecture qui échoue laisse les comptes en place et pose `error` :
 *     c'était l'autre cause de disparition ;
 *   — un 401 (session finie) purge le cache, pour ne pas laisser des soldes
 *     derrière soi.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { Asset } from "@/lib/patrimoine";

export interface BankAccountDTO {
  id: string;
  uid: string;
  name: string;
  type: "checking" | "savings";
  balance: number;
  currency: string;
  institution: string;
  logo: string | null;
}

export interface BankConnectionDTO {
  id: string;
  session_id: string;
  aspsp_name: string;
  aspsp_country: string;
  account_uids: string[];
  valid_until: string | null;
  created_at: string;
}

interface State {
  configured: boolean;
  connections: BankConnectionDTO[];
  accounts: BankAccountDTO[];
  /** Vrai seulement quand il n'y a encore rien à afficher. */
  loading: boolean;
  /** Relecture en cours par-dessus des comptes déjà affichés. */
  revalidating: boolean;
  error: string | null;
  /** ISO de la dernière agrégation réussie — `null` si aucune. */
  updatedAt: string | null;
}

const EMPTY: State = {
  configured: false,
  connections: [],
  accounts: [],
  loading: true,
  revalidating: false,
  error: null,
  updatedAt: null,
};

/* ── Cache ─────────────────────────────────────────────────────────────────
   `version` protège d'un cache écrit par une version antérieure du DTO : un
   champ renommé rendrait des comptes à moitié vides, ce qui est plus difficile
   à comprendre qu'une simple attente.
   ------------------------------------------------------------------------ */

const CACHE_KEY = "tr4de_bank_accounts";
const CACHE_VERSION = 1;

/** Fenêtre pendant laquelle on ne rappelle même pas la banque. Elle couvre la
 *  navigation d'un écran à l'autre, pas une session entière. */
const FRESH_MS = 60_000;

interface CacheShape {
  version: number;
  configured: boolean;
  connections: BankConnectionDTO[];
  accounts: BankAccountDTO[];
  updatedAt: string;
}

function readCache(): CacheShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed?.version !== CACHE_VERSION || !Array.isArray(parsed.accounts)) return null;
    if (!parsed.updatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(state: State): void {
  if (typeof window === "undefined" || !state.updatedAt) return;
  try {
    const payload: CacheShape = {
      version: CACHE_VERSION,
      configured: state.configured,
      connections: state.connections,
      accounts: state.accounts,
      updatedAt: state.updatedAt,
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota plein ou stockage refusé : le cache est un confort, pas une source.
  }
}

function clearCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* rien à faire : il n'y a alors rien à purger */
  }
}

/* ── Store de module ───────────────────────────────────────────────────────
   Hors de React, donc partagé par tous les composants montés — c'est ce qui
   ramène les cinq requêtes concurrentes à une seule, et ce qui fait qu'un
   changement de page ne repart pas d'un état vide.
   ------------------------------------------------------------------------ */

const cached = readCache();
let snapshot: State = cached
  ? {
      ...EMPTY,
      configured: cached.configured,
      connections: cached.connections,
      accounts: cached.accounts,
      updatedAt: cached.updatedAt,
      loading: false,
    }
  : EMPTY;

/** Rendu initial côté serveur : constant, sinon l'hydratation n'aurait rien de
 *  déterministe. React relit `getSnapshot` juste après et adopte le cache. */
const SERVER_SNAPSHOT: State = EMPTY;

const listeners = new Set<() => void>();
/** Requête en vol, partagée : deux pages montées ensemble n'en font qu'une. */
let inFlight: Promise<void> | null = null;

function publish(patch: Partial<State>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): State => snapshot;
const getServerSnapshot = (): State => SERVER_SNAPSHOT;

const isFresh = (): boolean =>
  Boolean(snapshot.updatedAt) && Date.now() - Date.parse(snapshot.updatedAt as string) < FRESH_MS;

/**
 * Relit les comptes. Un appel pendant qu'une requête est en vol attend celle-ci
 * au lieu d'en lancer une seconde.
 */
function refresh(): Promise<void> {
  if (inFlight) return inFlight;

  // `loading` seulement à vide : sinon on garde les comptes sous les yeux et on
  // signale la relecture, ce qui évite le vide-puis-retour à chaque visite.
  publish(snapshot.accounts.length > 0 ? { revalidating: true } : { loading: true });

  inFlight = (async () => {
    try {
      const resp = await fetch("/api/bank/accounts");
      const data = await resp.json();

      /* Session terminée : ce n'est pas une panne, mais il n'y a plus rien à
         montrer — et surtout plus rien à garder en cache. */
      if (resp.status === 401) {
        clearCache();
        publish({ ...EMPTY, loading: false });
        return;
      }

      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      const error = data.error ?? null;

      /* Agrégation en échec (consentement expiré, banque muette) : les
         connexions arrivent quand même, mais pas les soldes. On conserve alors
         les comptes déjà affichés — les effacer ferait croire à une
         déconnexion, alors qu'il s'agit d'une relecture qui n'a pas abouti. */
      const keepAccounts = error && accounts.length === 0 && snapshot.accounts.length > 0;

      const next: State = {
        configured: Boolean(data.configured),
        connections: Array.isArray(data.connections) ? data.connections : [],
        accounts: keepAccounts ? snapshot.accounts : accounts,
        loading: false,
        revalidating: false,
        error,
        // L'horodatage ne bouge que sur une agrégation réussie : il doit dater
        // les SOLDES affichés, pas la dernière tentative.
        updatedAt: keepAccounts || error ? snapshot.updatedAt : new Date().toISOString(),
      };

      publish(next);
      if (!error) writeCache(next);
    } catch (err) {
      publish({
        loading: false,
        revalidating: false,
        error: err instanceof Error ? err.message : "Erreur réseau",
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Comptes bancaires agrégés.
 *
 * Au montage : rien à faire si la donnée a moins d'une minute, sinon relecture
 * en tâche de fond. Également relu au retour sur l'onglet, comme
 * `useCloudState` — c'est le moment où un solde a le plus de chances d'avoir
 * bougé.
 */
export function useBankAccounts(): State & { reload: () => void } {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!isFresh()) void refresh();

    const onFocus = () => {
      if (!isFresh()) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Geste explicite (bouton « Actualiser ») : on relit sans considérer la
  // fenêtre de fraîcheur, c'est précisément ce qu'on demande en cliquant.
  const reload = useCallback(() => {
    void refresh();
  }, []);

  return { ...state, reload };
}

/**
 * Un compte bancaire vu comme un actif du patrimoine.
 *
 * `id` reste préfixé `enablebanking-` : il ne peut donc jamais entrer en
 * collision avec un actif saisi, et les pages savent qu'il n'est pas modifiable
 * — sa valeur vient de la banque, pas d'un formulaire.
 *
 * `updatedAt` porte la date de l'agrégation quand l'appelant la connaît
 * (`bank.updatedAt`) : depuis que les soldes peuvent venir du cache, « à quand
 * remonte ce chiffre » est une question qui a un sens, et les fiches d'actif
 * savent déjà l'afficher.
 */
export function bankAccountToAsset(a: BankAccountDTO, updatedAt: string | null = null): Asset {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    balance: a.balance,
    institution: a.institution,
    updatedAt,
    logo: a.logo,
  };
}

const BANK_ID_PREFIX = "enablebanking-";

/** Vrai pour un actif agrégé (non modifiable à la main). */
export const isBankAsset = (asset: { id: string }): boolean =>
  asset.id.startsWith(BANK_ID_PREFIX);

/**
 * Identifiant du compte chez l'agrégateur, relu depuis l'id de l'actif — `null`
 * pour un actif saisi à la main.
 *
 * L'uid n'est pas recopié dans l'actif : `bankAccountToAsset` produit un `Asset`
 * du patrimoine, et un champ propre à une source d'agrégation n'a rien à y
 * faire. Il se retrouve par son préfixe, qui est justement là pour ça.
 */
export const bankAssetUid = (asset: { id: string }): string | null =>
  asset.id.startsWith(BANK_ID_PREFIX) ? asset.id.slice(BANK_ID_PREFIX.length) : null;

/** Purge le cache des comptes. À appeler quand on quitte la session. */
export const clearBankAccountsCache = (): void => {
  clearCache();
  publish({ ...EMPTY, loading: false });
};
