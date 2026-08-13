"use client";

/**
 * Banques favorites — les établissements qu'on connecte, encore et encore.
 *
 * Enable Banking rend plusieurs centaines de banques pour un seul pays : le
 * sélecteur est donc une liste à chercher, pas une liste à parcourir. Et comme
 * un consentement DSP2 expire au bout de 90 jours au plus, reconnecter SA banque
 * est un geste récurrent — pas un réglage qu'on fait une fois. Les favoris
 * existent pour ça : ils remontent en tête du sélecteur et s'offrent en
 * connexion directe sur la page.
 *
 * Le nom et le logo sont stockés avec l'identifiant, pas seulement celui-ci :
 * la page doit pouvoir afficher ses favoris AVANT (ou sans) que la liste des
 * établissements soit chargée — et cette liste demande un appel réseau qui peut
 * échouer.
 */

import { useCallback, useMemo } from "react";

import { useCloudState } from "@/lib/hooks/useCloudState";

export interface FavoriteBank {
  /** Chez Enable Banking, l'identifiant d'une banque EST son nom (unique par pays). */
  id: string;
  name: string;
  logo: string | null;
}

const LOCAL_KEY = "tr4de_bank_favorites";
const CLOUD_KEY = "bank_favorites";

interface FavoriteBanks {
  favorites: FavoriteBank[];
  isFavorite: (id: string) => boolean;
  toggle: (inst: { id: string; name?: string; logo?: string | null }) => void;
}

export function useFavoriteBanks(): FavoriteBanks {
  const [raw, setRaw] = useCloudState<FavoriteBank[]>(LOCAL_KEY, CLOUD_KEY, []);

  /* Normalisé à la lecture : la valeur vient de localStorage ou du cloud, elle
     peut donc être d'une version antérieure ou tronquée — même parti pris que
     `usePatrimoine`. */
  const favorites: FavoriteBank[] = useMemo(
    () =>
      Array.isArray(raw)
        ? raw.filter((f): f is FavoriteBank => !!f && typeof f.id === "string" && f.id.length > 0)
        : [],
    [raw],
  );

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites],
  );

  const toggle = useCallback(
    (inst: { id: string; name?: string; logo?: string | null }) => {
      if (!inst?.id) return;
      setRaw((prev) => {
        const list = Array.isArray(prev) ? prev.filter((f) => f && typeof f.id === "string") : [];
        if (list.some((f) => f.id === inst.id)) return list.filter((f) => f.id !== inst.id);
        return [...list, { id: inst.id, name: inst.name || inst.id, logo: inst.logo ?? null }];
      });
    },
    // `setRaw` de useCloudState n'est pas mémoïsé : la dépendance est là pour
    // l'exactitude, elle ne stabilise rien.
    [setRaw],
  );

  return { favorites, isFavorite, toggle };
}
