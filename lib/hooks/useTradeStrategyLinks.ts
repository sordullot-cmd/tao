"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";

const CACHE_KEY = "tao_trade_strategies";

function readCache(): Record<string, (string | number)[]> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Les affectations trade → stratégies, en lecture seule.
 *
 * Même source et même cache que TradesPage (`trade_strategies`, recopiée dans
 * `tao_trade_strategies`) : on part du cache pour peindre tout de suite et
 * fonctionner hors ligne, la table remplace ensuite. Seule TradesPage écrit —
 * une deuxième page qui affecterait des stratégies ferait deux vérités.
 */
export function useTradeStrategyLinks(): Record<string, (string | number)[]> {
  const { user } = useAuth();
  const [links, setLinks] = useState(readCache);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await createClient()
          .from("trade_strategies")
          .select("trade_id, strategy_id")
          .eq("user_id", user.id);
        if (error || cancelled) return;
        const map: Record<string, (string | number)[]> = {};
        for (const row of (data || []) as { trade_id: string; strategy_id: string }[]) {
          (map[row.trade_id] ||= []).push(row.strategy_id);
        }
        setLinks(map);
      } catch {
        // Hors ligne : le cache suffit, on ne le remplace pas par du vide.
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return links;
}
