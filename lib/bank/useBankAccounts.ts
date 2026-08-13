"use client";

import { useCallback, useEffect, useState } from "react";

import type { Asset } from "@/lib/patrimoine";

export interface BankAccountDTO {
  id: string;
  uid: string;
  name: string;
  type: "checking" | "savings";
  balance: number;
  currency: string;
  institution: string;
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
  loading: boolean;
  error: string | null;
}

const EMPTY: State = {
  configured: false,
  connections: [],
  accounts: [],
  loading: true,
  error: null,
};

/**
 * Comptes bancaires agrégés, relus à chaque montage.
 *
 * Volontairement sans cache local : un solde bancaire périmé affiché comme
 * courant est pire qu'un instant de chargement. C'est aussi la raison pour
 * laquelle ces comptes ne rejoignent pas le store `useCloudState` du patrimoine
 * — ils ne sont ni saisis, ni persistés côté application.
 */
export function useBankAccounts(): State & { reload: () => void } {
  const [state, setState] = useState<State>(EMPTY);

  /* Le seul `setState` est celui qui pose le RÉSULTAT, après l'attente : l'état
     initial porte déjà `loading: true`, donc rien n'a à être basculé avant de
     partir. C'est ce qui permet d'appeler cette fonction depuis un effet sans
     déclencher de rendu en cascade. */
  const fetchAccounts = useCallback(async (signal?: AbortSignal) => {
    try {
      const resp = await fetch("/api/bank/accounts", { signal });
      const data = await resp.json();
      if (signal?.aborted) return;
      setState({
        configured: Boolean(data.configured),
        connections: Array.isArray(data.connections) ? data.connections : [],
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        loading: false,
        // Un 401 n'est pas une panne : hors session, il n'y a simplement rien à
        // agréger. On ne le remonte donc pas comme une erreur à afficher.
        error: resp.status === 401 ? null : data.error ?? null,
      });
    } catch (err) {
      // Démontage en cours de requête : il n'y a plus personne à informer.
      if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) return;
      setState({
        ...EMPTY,
        loading: false,
        error: err instanceof Error ? err.message : "Erreur réseau",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    /* La règle voit un appel qui finit par `setState` et suppose un rendu en
       cascade. Ici il est derrière un `await` : le rendu qui suit est celui de
       la RÉPONSE, pas du montage — c'est le cas d'usage même d'un effet,
       synchroniser React avec un système externe. L'analyse étant statique,
       elle ne peut pas faire cette distinction. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAccounts(controller.signal);
    return () => controller.abort();
  }, [fetchAccounts]);

  // Rechargement manuel : déclenché par un geste, il peut rebasculer l'affichage
  // en attente sans que ce soit un rendu en cascade.
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    void fetchAccounts();
  }, [fetchAccounts]);

  return { ...state, reload };
}

/**
 * Un compte bancaire vu comme un actif du patrimoine.
 *
 * `id` reste préfixé `enablebanking-` : il ne peut donc jamais entrer en
 * collision avec un actif saisi, et les pages savent qu'il n'est pas modifiable
 * — sa valeur vient de la banque, pas d'un formulaire.
 */
export function bankAccountToAsset(a: BankAccountDTO): Asset {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    balance: a.balance,
    institution: a.institution,
    updatedAt: null,
  };
}

/** Vrai pour un actif agrégé (non modifiable à la main). */
export const isBankAsset = (asset: { id: string }): boolean =>
  asset.id.startsWith("enablebanking-");
