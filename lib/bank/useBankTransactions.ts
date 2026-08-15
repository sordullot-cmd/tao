"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { depthOf, type BankTransaction } from "@/lib/bank/transactions";

interface State {
  transactions: BankTransaction[];
  /** Profondeur effectivement chargée, en jours (`ALL_DAYS` = tout). */
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
   En MÉMOIRE seulement, contrairement aux soldes : un relevé long est
   volumineux et son intérêt est de survivre à la navigation, pas au
   rechargement de l'application. Il disparaît donc avec l'onglet — donc avec la
   session, sans rien à purger.

   Une entrée retient la PROFONDEUR qu'elle couvre. Passer de « 3 mois » à
   « 1 an » ne repart donc pas de zéro : ce qu'on a déjà reste affiché pendant
   que la fenêtre plus large se charge par-dessus, et redescendre à une fenêtre
   courte ne coûte plus rien du tout.
   ------------------------------------------------------------------------ */

interface Entry {
  transactions: BankTransaction[];
  /** Profondeur demandée à la banque pour cette entrée. */
  windowDays: number;
  at: number;
}

const cache = new Map<string, Entry>();

/* Requête en vol pour un compte. Sa PROFONDEUR en fait partie : ouvrir une fiche
   pendant que son relevé se précharge doit se greffer sur la requête en cours, et
   le cache est encore vide à cet instant — il ne peut donc rien dire de ce qui
   est déjà en route. */
interface InFlight {
  days: number;
  job: Promise<LoadResult>;
  /** Numéro d'ordre, pour qu'une requête ne retire de la table que la SIENNE :
   *  une demande plus profonde peut avoir pris la place entre-temps, et elle ne
   *  doit pas disparaître avec celle qui se termine. */
  gen: number;
}

const inFlight = new Map<string, InFlight>();
let sequence = 0;

/** Au-delà, on relit au montage. En dessous, le relevé en cache suffit. */
const FRESH_MS = 5 * 60_000;

interface LoadResult {
  transactions: BankTransaction[];
  windowDays: number;
  error: string | null;
}

/** Le cache couvre-t-il déjà cette profondeur, et depuis assez peu de temps ? */
function covers(uid: string, days: number): boolean {
  const entry = cache.get(uid);
  if (!entry) return false;
  return depthOf(entry.windowDays) >= depthOf(days) && Date.now() - entry.at < FRESH_MS;
}

/**
 * Va chercher un relevé et le dépose dans le cache.
 *
 * Hors de React : c'est la même requête pour la fiche qui l'attend et pour le
 * préchargement qui l'anticipe, donc jamais deux appels pour un même compte.
 * Ne rejette pas — une panne réseau ressort en `error`, que l'appelant affiche
 * ou ignore selon qu'il y avait quelqu'un pour la lire.
 */
function loadTransactions(uid: string, days: number): Promise<LoadResult> {
  const gen = ++sequence;
  const job = (async (): Promise<LoadResult> => {
    try {
      const resp = await fetch(
        `/api/bank/transactions?uid=${encodeURIComponent(uid)}&days=${days}`,
      );
      const data = await resp.json();
      const transactions = Array.isArray(data.transactions) ? data.transactions : [];
      const windowDays = Number.isFinite(Number(data.windowDays)) ? Number(data.windowDays) : days;
      // Hors session il n'y a rien à lire : ce n'est pas une panne à afficher.
      const error = resp.status === 401 ? null : data.error ?? null;

      /* On n'écrase le cache que si la réponse va au moins aussi loin que ce
         qu'il contient déjà : une fenêtre courte revenue après une longue
         perdrait sinon l'historique déjà chargé. */
      if (!error) {
        const known = cache.get(uid);
        if (!known || depthOf(windowDays) >= depthOf(known.windowDays)) {
          cache.set(uid, { transactions, windowDays, at: Date.now() });
        }
      }
      return { transactions, windowDays, error };
    } catch (err) {
      const kept = cache.get(uid);
      return {
        transactions: kept?.transactions ?? [],
        windowDays: kept?.windowDays ?? days,
        error: err instanceof Error ? err.message : "Erreur réseau",
      };
    } finally {
      // Seulement si c'est bien la nôtre : une requête plus profonde lancée
      // entre-temps a pris la place, et ne doit pas être oubliée par la nôtre.
      if (inFlight.get(uid)?.gen === gen) inFlight.delete(uid);
    }
  })();

  inFlight.set(uid, { days, job, gen });
  return job;
}

/**
 * Précharge les relevés de plusieurs comptes, en tâche de fond.
 *
 * Appelé depuis les pages qui LISTENT des comptes (la synthèse du patrimoine) :
 * pendant qu'on parcourt ses classes d'actifs, les relevés arrivent, et ouvrir
 * une fiche n'attend plus la banque. C'est du temps qui existait déjà — il était
 * simplement dépensé après le clic plutôt qu'avant.
 *
 * Séquentiel, délibérément : huit comptes, ce sont huit allers-retours jusqu'aux
 * banques, et les lancer ensemble ferait concurrence aux requêtes que
 * l'utilisateur attend vraiment. Un compte déjà en cache ou déjà en vol est
 * sauté. Retourne de quoi interrompre la file — à brancher sur le nettoyage de
 * l'effet, pour qu'un écran quitté cesse de précharger.
 */
export function prefetchBankTransactions(
  uids: (string | null | undefined)[],
  days: number = DEFAULT_WINDOW,
): () => void {
  let cancelled = false;

  void (async () => {
    for (const uid of uids) {
      if (cancelled) return;
      if (!uid || covers(uid, days) || inFlight.has(uid)) continue;
      await loadTransactions(uid, days);
    }
  })();

  return () => {
    cancelled = true;
  };
}

/**
 * Comptes lus DE FRONT par ce hook. Le préchargement, lui, reste en file (cf.
 * `prefetchBankTransactions`) : il travaille en fond, il a le temps.
 *
 * Ici non — quelqu'un attend l'écran. En file, la page s'ouvrait en la SOMME
 * des allers-retours : trois comptes à une seconde chacun faisaient trois
 * secondes, et le seul remède aurait été d'avoir moins de comptes.
 *
 * Quatre, et pas plus : un navigateur ne tient que six connexions simultanées
 * par hôte en HTTP/1.1, et les épuiser ferait attendre le reste de la page
 * derrière les relevés. Quatre couvre le cas courant (un à cinq comptes) en un
 * seul aller-retour ou deux, et laisse deux voies libres.
 */
const MAX_PARALLEL = 4;

/**
 * Relevés de PLUSIEURS comptes à la fois, indexés par uid.
 *
 * C'est ce qui permet à la synthèse du patrimoine de reconstruire sa courbe : le
 * passé d'un patrimoine, ce sont les mouvements de TOUS les comptes, pas ceux
 * d'un seul. Les comptes arrivent au fil de l'eau — chaque relevé reçu est
 * publié aussitôt, la courbe se précise à mesure plutôt que d'attendre le
 * dernier compte.
 *
 * Même cache que le préchargement : un compte déjà lu assez profondément ne
 * coûte rien, et changer de fenêtre ne redemande que ce qui manque.
 */
export function useBankTransactionsAll(
  uids: (string | null | undefined)[],
  days: number = DEFAULT_WINDOW,
): { byUid: Record<string, BankTransaction[]>; loading: boolean } {
  // Clé stable : le tableau est reconstruit à chaque rendu par l'appelant, sa
  // seule identité relancerait l'effet en boucle.
  const key = useMemo(
    () => uids.filter((u): u is string => Boolean(u)).sort().join(","),
    [uids],
  );

  const [state, setState] = useState(() => shot(key, days));
  /* Comptes ou profondeur qui changent : on repart du cache PENDANT le rendu,
     comme le hook mono le fait avec son marqueur d'`uid`. Attendre l'effet pour
     poser cet état afficherait un instant les relevés de la fenêtre précédente,
     et coûterait un rendu de plus. */
  const shown = state.key === key && state.days === days ? state : shot(key, days);

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) return;
    let cancelled = false;

    void (async () => {
      const todo = list.filter((uid) => !covers(uid, days));

      /* Une file d'attente partagée par quelques ouvriers, plutôt qu'un
         `Promise.all` sur toute la liste : à vingt comptes, tout lancer d'un
         coup saturerait le navigateur et l'agrégateur, et les premiers relevés
         arriveraient PLUS tard qu'en les étalant. */
      let next = 0;
      const worker = async (): Promise<void> => {
        while (!cancelled) {
          const i = next++;
          if (i >= todo.length) return;
          const uid = todo[i];
          // Requête déjà en vol et assez profonde (le préchargement,
          // typiquement) : on l'attend plutôt que d'en lancer une seconde.
          const pending = inFlight.get(uid);
          if (pending && depthOf(pending.days) >= depthOf(days)) await pending.job;
          else await loadTransactions(uid, days);
          if (cancelled) return;
          // Publication au fil de l'eau : la courbe se précise compte par compte.
          setState({ ...shot(key, days), loading: true });
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(MAX_PARALLEL, todo.length) }, worker),
      );
      if (!cancelled) setState(shot(key, days));
    })();

    return () => {
      cancelled = true;
    };
  }, [key, days]);

  return { byUid: shown.byUid, loading: shown.loading };
}

/** État dérivé du cache pour une liste de comptes et une profondeur. */
function shot(key: string, days: number) {
  const list = key ? key.split(",") : [];
  return {
    key,
    days,
    byUid: snapshotOf(key),
    loading: list.some((uid) => !covers(uid, days)),
  };
}

/** Photo du cache pour une liste de comptes — sans entrée pour ceux qu'on n'a
 *  pas encore lus, plutôt qu'un tableau vide qui se lirait « aucun mouvement ». */
function snapshotOf(key: string): Record<string, BankTransaction[]> {
  const out: Record<string, BankTransaction[]> = {};
  for (const uid of key ? key.split(",") : []) {
    const entry = cache.get(uid);
    if (entry) out[uid] = entry.transactions;
  }
  return out;
}

/** Vide le cache des relevés. À appeler quand on quitte la session. */
export const clearBankTransactionsCache = (): void => {
  cache.clear();
  inFlight.clear();
};

/**
 * Mouvements d'un compte agrégé — cache d'abord, relecture ensuite.
 *
 * Même parti que `useBankAccounts` : ce qu'on a déjà s'affiche tout de suite, et
 * la relecture se fait par-dessus sans vider la liste. Revenir sur une fiche
 * déjà consultée est donc instantané, là où chaque visite coûtait auparavant
 * l'aller-retour complet jusqu'à la banque.
 *
 * `days` demande une profondeur d'historique (`ALL_DAYS` pour tout). Elle n'est
 * redemandée à la banque que si le cache ne la couvre PAS : les fenêtres plus
 * courtes se servent dans ce qui est déjà chargé.
 *
 * `uid` à `null` (actif saisi à la main, donc sans banque derrière) : le hook ne
 * requête rien et reste au repos.
 */
export function useBankTransactions(
  uid: string | null,
  days: number = DEFAULT_WINDOW,
): State & { reload: () => void } {
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
      // Couvert = déjà chargé au moins aussi loin que ce qu'on demande.
      const covered = entry ? depthOf(entry.windowDays) >= depthOf(days) : false;
      const fresh = entry && Date.now() - entry.at < FRESH_MS;

      if (entry) {
        setState({
          uid,
          transactions: entry.transactions,
          windowDays: entry.windowDays,
          loading: false,
          // Une fenêtre plus profonde que le cache se charge par-dessus ce qui
          // est affiché : c'est une relecture, pas un chargement à vide.
          revalidating: !covered || !fresh || force,
          error: null,
        });
        if (covered && fresh && !force) return;
      } else {
        setState({ uid, ...EMPTY, windowDays: days, loading: true });
      }

      /* Requête déjà en vol pour ce compte : on l'attend au lieu d'en lancer une
         seconde, puis on lit ce qu'elle a déposé dans le cache. On ne s'y greffe
         que si elle va chercher AU MOINS aussi loin — sinon elle ne répondrait
         pas à la fenêtre demandée.

         C'est la profondeur de la REQUÊTE qu'on interroge, pas celle du cache :
         quand le préchargement de la synthèse est encore en vol, le cache est
         vide et ne dit rien de ce qui arrive déjà. */
      const pending = inFlight.get(uid);
      if (pending && !force && depthOf(pending.days) >= depthOf(days)) {
        await pending.job;
        if (!signal?.aborted) setState({ uid, ...fromCache(uid) });
        return;
      }

      const { transactions, windowDays, error } = await loadTransactions(uid, days);
      if (signal?.aborted) return;

      /* Une relecture en échec laisse le relevé en place, comme pour les
         soldes : le faire disparaître donnerait l'impression d'un compte vidé
         alors que c'est la requête qui n'a pas abouti. */
      const kept = cache.get(uid);
      setState({
        uid,
        transactions: error && kept ? kept.transactions : transactions,
        windowDays: error && kept ? kept.windowDays : windowDays,
        loading: false,
        revalidating: false,
        error,
      });
    },
    [uid, days],
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
