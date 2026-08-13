"use client";

import { useCallback, useEffect, useState } from "react";

import type { BankTransaction } from "@/lib/bank/transactions";

interface State {
  transactions: BankTransaction[];
  /** Fenêtre couverte par la réponse, en jours (90 côté agrégateur). */
  windowDays: number;
  /** Vrai seulement quand il n'y a encore rien à afficher pour ce compte. */
  loading: boolean;
  /** Relecture en cours par-dessus un relevé déjà affiché. */
  revalidating: boolean;
  error: string | null;
}

const DEFAULT_WINDOW = 90;

const EMPTY: State = {
  transactions: [],
  windowDays: DEFAULT_WINDOW,
  loading: false,
  revalidating: false,
  error: null,
};

/* ── Cache de session ──────────────────────────────────────────────────────
   En MÉMOIRE seulement, contrairement aux soldes : un relevé de 90 jours est
   volumineux et son intérêt est de survivre à la navigation, pas au
   rechargement de l'application. Il disparaît donc avec l'onglet — donc avec la
   session, sans rien à purger.
   ------------------------------------------------------------------------ */

interface Entry {
  transactions: BankTransaction[];
  windowDays: number;
  at: number;
}

const cache = new Map<string, Entry>();
/** Une requête en vol par compte : deux montages rapprochés n'en font qu'une. */
const inFlight = new Map<string, Promise<void>>();

/** Au-delà, on relit au montage. En dessous, le relevé en cache suffit. */
const FRESH_MS = 5 * 60_000;

/** Vide le cache des relevés. À appeler quand on quitte la session. */
export const clearBankTransactionsCache = (): void => {
  cache.clear();
};

/**
 * Mouvements d'un compte agrégé — cache d'abord, relecture ensuite.
 *
 * Même parti que `useBankAccounts` : ce qu'on a déjà s'affiche tout de suite, et
 * la relecture se fait par-dessus sans vider la liste. Revenir sur une fiche
 * déjà consultée est donc instantané, là où chaque visite coûtait auparavant
 * l'aller-retour complet jusqu'à la banque.
 *
 * `uid` à `null` (actif saisi à la main, donc sans banque derrière) : le hook ne
 * requête rien et reste au repos.
 */
export function useBankTransactions(uid: string | null): State & { reload: () => void } {
  /* L'état porte le compte auquel il appartient : la fiche reste montée quand on
     passe d'un compte à l'autre, et sans ce marqueur le rendu qui suit le
     changement d'`uid` montrerait encore le relevé du compte précédent — le
     temps que l'effet passe. On repart alors du cache du NOUVEAU compte. */
  const [state, setState] = useState<State & { uid: string | null }>(() => ({
    uid,
    ...fromCache(uid),
  }));
  const shown = state.uid === uid ? state : { uid, ...fromCache(uid) };

  const fetchTransactions = useCallback(
    async (force: boolean, signal?: AbortSignal) => {
      if (!uid) {
        setState({ uid, ...EMPTY });
        return;
      }

      const entry = cache.get(uid);
      const fresh = entry && Date.now() - entry.at < FRESH_MS;
      if (entry) {
        setState({
          uid,
          transactions: entry.transactions,
          windowDays: entry.windowDays,
          loading: false,
          revalidating: !fresh || force,
          error: null,
        });
        if (fresh && !force) return;
      } else {
        setState({ uid, ...EMPTY, loading: true });
      }

      /* Requête déjà en vol pour ce compte : on l'attend au lieu d'en lancer une
         seconde, puis on lit ce qu'elle a déposé dans le cache. */
      const pending = inFlight.get(uid);
      if (pending && !force) {
        await pending;
        if (!signal?.aborted) setState({ uid, ...fromCache(uid) });
        return;
      }

      const job = (async () => {
        try {
          const resp = await fetch(`/api/bank/transactions?uid=${encodeURIComponent(uid)}`);
          const data = await resp.json();
          const transactions = Array.isArray(data.transactions) ? data.transactions : [];
          const windowDays = Number(data.windowDays) || DEFAULT_WINDOW;
          // Hors session il n'y a rien à lire : ce n'est pas une panne à afficher.
          const error = resp.status === 401 ? null : data.error ?? null;

          if (!error) cache.set(uid, { transactions, windowDays, at: Date.now() });

          if (signal?.aborted) return;
          /* Une relecture en échec laisse le relevé en place, comme pour les
             soldes : le faire disparaître donnerait l'impression d'un compte
             vidé alors que c'est la requête qui n'a pas abouti. */
          const kept = cache.get(uid);
          setState({
            uid,
            transactions: error && kept ? kept.transactions : transactions,
            windowDays: error && kept ? kept.windowDays : windowDays,
            loading: false,
            revalidating: false,
            error,
          });
        } catch (err) {
          if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) return;
          const kept = cache.get(uid);
          setState({
            uid,
            transactions: kept?.transactions ?? [],
            windowDays: kept?.windowDays ?? DEFAULT_WINDOW,
            loading: false,
            revalidating: false,
            error: err instanceof Error ? err.message : "Erreur réseau",
          });
        } finally {
          inFlight.delete(uid);
        }
      })();

      inFlight.set(uid, job);
      await job;
    },
    [uid],
  );

  useEffect(() => {
    const controller = new AbortController();
    /* Le premier `setState` de `fetchTransactions` est celui du cache, pris
       avant tout réseau : c'est ce qui fait qu'une fiche déjà consultée
       s'affiche garnie au lieu de repartir d'un état vide. */
    void fetchTransactions(false, controller.signal);
    return () => controller.abort();
  }, [fetchTransactions]);

  const reload = useCallback(() => {
    if (!uid) return;
    void fetchTransactions(true);
  }, [fetchTransactions, uid]);

  // Le marqueur `uid` est interne au hook : les pages reçoivent l'état seul.
  return {
    transactions: shown.transactions,
    windowDays: shown.windowDays,
    loading: shown.loading,
    revalidating: shown.revalidating,
    error: shown.error,
    reload,
  };
}

/** État de départ pour un compte : son relevé en cache s'il y en a un. */
function fromCache(uid: string | null): State {
  if (!uid) return EMPTY;
  const entry = cache.get(uid);
  if (!entry) return { ...EMPTY, loading: true };
  return {
    transactions: entry.transactions,
    windowDays: entry.windowDays,
    loading: false,
    revalidating: false,
    error: null,
  };
}
