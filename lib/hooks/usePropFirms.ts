import { useCallback, useEffect, useState } from "react";
import { fetchFirms, type PropFirm } from "@/lib/propFirms";

/**
 * usePropFirms — charge les firmes de prop trading de l'utilisateur.
 *
 * Les mutations passent par les helpers de `lib/propFirms` (createFirm,
 * updateFirm…) ; ce hook expose `refresh` et `setFirms` pour que les vues
 * puissent faire une mise à jour optimiste puis resynchroniser.
 */
export function usePropFirms(userId: string | null | undefined) {
  const [firms, setFirms] = useState<PropFirm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setFirms([]);
      return;
    }
    setLoading(true);
    try {
      setFirms(await fetchFirms(userId));
      setError(null);
    } catch (e) {
      // La table peut ne pas exister si la migration 031 n'est pas appliquée :
      // on dégrade proprement (aucune firme) plutôt que de casser la page.
      setFirms([]);
      setError(e instanceof Error ? e.message : String(e));
      console.warn("prop_firms indisponible (migration 031 appliquée ?) :", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { firms, setFirms, loading, error, refresh };
}
