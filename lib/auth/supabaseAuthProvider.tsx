"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createClient,
  clearStaleSession,
  isRefreshTokenError,
} from "@/lib/supabase/client";
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
        if (error) throw error;
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        if (isRefreshTokenError(error)) {
          await clearStaleSession();
          if (!cancelled) {
            setSession(null);
            setUser(null);
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
      }
    );

    // Re-vérifie la session quand l'onglet redevient actif — utile quand
    // l'app a été inactive longtemps et que le token a pu expirer pendant
    // que le navigateur dormait.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // Le refresh déclenché ici peut échouer si le token a été révoqué
      // pendant la mise en veille : on purge plutôt que de laisser une
      // promesse rejetée non traitée.
      supabase.auth
        .getSession()
        .then(({ error }) => {
          if (error && isRefreshTokenError(error)) return clearStaleSession();
        })
        .catch((error) => {
          if (isRefreshTokenError(error)) return clearStaleSession();
          console.error("Error refreshing session:", error);
        });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [supabase]);

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setSession(null);
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
