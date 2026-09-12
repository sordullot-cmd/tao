"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createClient,
  clearStaleSession,
  isRefreshTokenError,
  isOfflineError,
  readStoredSession,
} from "@/lib/supabase/client";
import { clearBankAccountsCache, primeBankAccounts } from "@/lib/bank/useBankAccounts";
import { clearBankTransactionsCache } from "@/lib/bank/useBankTransactions";
import type { Session, User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // useMemo + singleton garantissent qu'on ne crée le client qu'une fois.
  const supabase = useMemo(() => createClient(), []);

  // Initialize auth state — l'effect ne se ré-exécute qu'au montage.
  useEffect(() => {
    let cancelled = false;
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        // Token de rafraîchissement périmé : ce n'est pas une panne, juste une
        // session à jeter. On purge le storage pour ne pas rejouer l'erreur au
        // prochain chargement, et on repart en état déconnecté.
        if (error && isRefreshTokenError(error)) {
          await clearStaleSession();
          if (cancelled) return;
          setSession(null);
          setUser(null);
          return;
        }
        /* Coupure réseau : surtout pas un retour à l'état déconnecté. La
           session dort dans le storage, on la relit telle quelle — même
           expirée. Sans ça l'app se croit anonyme, et `useCloudState` cesse de
           poser ses écritures en attente : tout ce qui est saisi hors ligne ne
           remonte jamais. Le jeton sera rafraîchi au retour du réseau
           (écouteur `online` plus bas). */
        if (error && isOfflineError(error)) {
          if (cancelled) return;
          const stored = readStoredSession();
          setSession(stored);
          setUser(stored?.user ?? null);
          return;
        }
        if (error) throw error;
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        /* L'agrégation bancaire démarre ICI, au premier instant où l'on sait
           qu'il y a une session — et non au montage de la première page qui
           affiche des comptes. Elle traverse Enable Banking puis la banque :
           lancée pendant que l'écran d'accueil se dessine, elle est terminée
           avant qu'on arrive sur Patrimoine ou Cashflow. Pas avant la session :
           la route répondrait 401, et un 401 purge le cache. */
        if (session) primeBankAccounts();
      } catch (error) {
        if (isRefreshTokenError(error)) {
          await clearStaleSession();
          if (!cancelled) {
            setSession(null);
            setUser(null);
          }
          return;
        }
        if (isOfflineError(error)) {
          if (!cancelled) {
            const stored = readStoredSession();
            setSession(stored);
            setUser(stored?.user ?? null);
          }
          return;
        }
        console.error("Error getting session:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    getSession();

    // Listen for auth changes (signin, signout, token refresh, user updates)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        /* Connexion depuis l'écran de login : il n'y avait pas de session au
           chargement, c'est donc ici qu'on amorce. Un simple rafraîchissement de
           jeton passe aussi par là et n'en déclenche pas pour autant —
           `primeBankAccounts` ne fait rien tant que la donnée est fraîche. */
        if (session) primeBankAccounts();
      }
    );

    // Re-vérifie la session quand l'onglet redevient actif — utile quand
    // l'app a été inactive longtemps et que le token a pu expirer pendant
    // que le navigateur dormait.
    // Le refresh déclenché ici peut échouer si le token a été révoqué
    // pendant la mise en veille : on purge plutôt que de laisser une
    // promesse rejetée non traitée. Un échec RÉSEAU, lui, ne touche à rien —
    // la session locale reste la bonne jusqu'à preuve du contraire, et cette
    // preuve demande justement le réseau.
    const revalidate = () => {
      supabase.auth
        .getSession()
        .then(({ error }) => {
          if (error && isRefreshTokenError(error)) return clearStaleSession();
        })
        .catch((error) => {
          if (isRefreshTokenError(error)) return clearStaleSession();
          if (isOfflineError(error)) return;
          console.error("Error refreshing session:", error);
        });
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      revalidate();
    };
    /* Retour du réseau : le jeton restauré depuis le storage au démarrage hors
       ligne est probablement périmé. On le rafraîchit ici, et c'est
       `onAuthStateChange` qui remet l'état à jour — d'où l'absence de `setState`
       dans `revalidate`. */
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("online", revalidate);

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("online", revalidate);
    };
  }, [supabase]);

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setSession(null);
      /* Les soldes bancaires sont mis en cache pour s'afficher sans attente
         (`useBankAccounts`) : ils ne doivent pas survivre à la session, ni sur
         le disque, ni dans le store en mémoire — sans quoi ils resteraient
         visibles jusqu'au prochain rechargement de l'application. */
      clearBankAccountsCache();
      clearBankTransactionsCache();
    } catch (error) {
      console.error("Error logging out:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAuthenticated: !!user,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
