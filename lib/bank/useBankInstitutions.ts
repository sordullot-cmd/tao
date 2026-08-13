"use client";

/**
 * Catalogue des banques de l'agrégateur — la liste, partagée.
 *
 * Deux formulaires ont besoin des mêmes établissements : la connexion DSP2
 * (`BankFormModal`) et la saisie d'un actif ou d'un crédit (`AssetFormModal`),
 * qui s'en sert pour proposer un établissement et récupérer son logo. Chacun
 * appelant `/api/bank/institutions` de son côté, la liste pouvait diverger et
 * était rechargée à chaque ouverture de modale.
 *
 * D'où le cache AU NIVEAU DU MODULE, et non dans le composant : le catalogue de
 * l'agrégateur change au rythme du secteur bancaire, soit à peu près jamais à
 * l'échelle d'une session. Ouvrir dix fois la modale ne doit pas déclencher dix
 * appels réseau. C'est l'inverse du choix fait pour `useBankAccounts`, qui ne
 * cache rien — un SOLDE périmé trompe, un nom de banque périmé non.
 */

import { useEffect, useState } from "react";

import { bankLogo, bankMatchKey } from "@/lib/bank/bankLogos";

export interface InstitutionDTO {
  id: string;
  name: string;
  /** Logo publié par l'agrégateur. Absent pour les banques qui n'en ont pas. */
  logo?: string | null;
}

interface Snapshot {
  institutions: InstitutionDTO[];
  /** Faux quand le déploiement n'a pas d'identifiants Enable Banking. */
  configured: boolean;
  error: string | null;
}

interface Cached extends Snapshot {
  expiresAt: number;
}

const TTL = 30 * 60 * 1000;

let cache: Cached | null = null;
let inflight: Promise<Cached> | null = null;

const isFresh = (c: Cached | null): c is Cached => c !== null && c.expiresAt > Date.now();

async function fetchCatalogue(): Promise<Cached> {
  try {
    const resp = await fetch("/api/bank/institutions");
    const data = await resp.json();
    return {
      institutions: Array.isArray(data.institutions) ? data.institutions : [],
      configured: Boolean(data.configured),
      // Hors session, il n'y a pas de catalogue à lire — ce n'est pas une panne.
      error: resp.status === 401 ? null : data.error ?? null,
      expiresAt: Date.now() + TTL,
    };
  } catch (err) {
    return {
      institutions: [],
      configured: false,
      error: err instanceof Error ? err.message : "Erreur réseau",
      // Un échec ne se garde pas une demi-heure : la prochaine ouverture réessaie.
      expiresAt: 0,
    };
  }
}

/** Un seul appel en vol à la fois, quel que soit le nombre de champs montés. */
function loadCatalogue(): Promise<Cached> {
  if (isFresh(cache)) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchCatalogue().then((next) => {
      if (next.expiresAt > 0) cache = next;
      inflight = null;
      return next;
    });
  }
  return inflight;
}

/** Vide le cache — utile aux tests et après une (dé)connexion de banque. */
export function resetInstitutionsCache(): void {
  cache = null;
  inflight = null;
}

export function useBankInstitutions(): Snapshot & { loading: boolean } {
  const [state, setState] = useState<Snapshot & { loading: boolean }>(() =>
    isFresh(cache)
      ? { institutions: cache.institutions, configured: cache.configured, error: cache.error, loading: false }
      : { institutions: [], configured: false, error: null, loading: true },
  );

  useEffect(() => {
    // Le cache a déjà servi l'état initial : rien à charger, rien à écrire.
    if (isFresh(cache)) return;
    let cancelled = false;
    /* L'écriture n'est pas un rendu en cascade : elle a lieu à la RÉPONSE, pas
       au montage — c'est le cas d'usage même d'un effet. */
    void loadCatalogue().then((next) => {
      if (cancelled) return;
      setState({
        institutions: next.institutions,
        configured: next.configured,
        error: next.error,
        loading: false,
      });
    });
    return () => { cancelled = true; };
  }, []);

  return state;
}

/**
 * Logo de l'établissement portant ce nom, `null` si le nom ne correspond à
 * aucune banque connue.
 *
 * La correspondance se fait sur le NOM et pas sur un identifiant choisi dans la
 * liste : le champ reste libre, et un nom tapé à la main qui tombe juste mérite
 * son logo autant qu'un nom cliqué. « boursorama  banque » retrouve donc
 * « Boursorama Banque » — casse, accents et espaces multiples ignorés par
 * `bankMatchKey`, la clé de comparaison partagée avec les logos livrés.
 *
 * Ces derniers passent DEVANT le catalogue : voir `lib/bank/bankLogos`.
 */
export function institutionLogo(
  institutions: InstitutionDTO[],
  name: string | null | undefined,
): string | null {
  const key = bankMatchKey(String(name || ""));
  if (!key) return null;
  const hit = institutions.find((i) => bankMatchKey(i.name) === key);
  return bankLogo(name, hit?.logo);
}
