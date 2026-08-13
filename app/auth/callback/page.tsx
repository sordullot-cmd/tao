"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createClient,
  clearStaleSession,
  isRefreshTokenError,
} from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the session from the URL
        const { data, error } = await supabase.auth.getSession();

        // Ancienne session périmée dans le storage : on la purge et on
        // renvoie vers le login plutôt que d'afficher une erreur.
        if (error && isRefreshTokenError(error)) {
          await clearStaleSession();
          router.push("/login");
          return;
        }
        if (error) throw error;

        if (data.session) {
          // User is authenticated, redirect to home
          router.push("/");
        } else {
          // No session, redirect to login
          router.push("/login");
        }
      } catch (error) {
        console.error("Auth callback error:", error);
        router.push("/login");
      }
    };

    handleCallback();
  }, [router, supabase.auth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
        <p className="mt-2 text-gray-600">Traitement de votre connexion...</p>
      </div>
    </div>
  );
}
