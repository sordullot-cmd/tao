"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createClient,
  clearStaleSession,
  isRefreshTokenError,
} from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";
import { Field as DAField, FIELD as DA_FIELD } from "@/components/ui/form";

// Détecte qu'on tourne dans la webview Tauri (app desktop) et non dans un
// navigateur normal. __TAURI_INTERNALS__ est toujours injecté par le runtime
// Tauri, indépendamment de withGlobalTauri.
const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// URL de retour pour le flow OAuth desktop : un scheme custom capté par
// tauri-plugin-deep-link. Doit être déclaré dans tauri.conf.json ET ajouté
// aux "Redirect URLs" de Supabase (Authentication → URL Configuration).
const TAURI_REDIRECT = "taotrade://auth/callback";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      // Sur la page de login, un token périmé doit simplement laisser
      // l'utilisateur se reconnecter, storage nettoyé.
      if (error) {
        if (isRefreshTokenError(error)) await clearStaleSession();
        return;
      }
      if (data.session) router.push("/dashboard");
    };
    checkAuth().catch(async (error) => {
      if (isRefreshTokenError(error)) await clearStaleSession();
      else console.error("Error checking session:", error);
    });
  }, [router, supabase.auth]);

  // Dans l'app desktop (Tauri), Google refuse l'OAuth lancé depuis une webview
  // embarquée ("disallowed_useragent"). On ouvre donc le flux dans le navigateur
  // système, et Supabase nous renvoie le code d'autorisation via le deep link
  // taotrade://auth/callback, capté ci-dessous, qu'on échange contre une session.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let active = true;
    (async () => {
      try {
        const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
        const fn = await onOpenUrl(async (urls) => {
          try {
            const url = urls?.[0];
            if (!url) return;
            const parsed = new URL(url);
            const code = parsed.searchParams.get("code");
            if (!code) {
              const desc = parsed.searchParams.get("error_description");
              throw new Error(desc || "Aucun code d'autorisation reçu");
            }
            const { error: exchangeError } =
              await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
            router.push("/dashboard");
          } catch (err) {
            console.error("[google-login][tauri][callback]", err);
            setError(err instanceof Error ? err.message : "Erreur de connexion");
            setLoading(false);
          }
        });
        if (active) unlisten = fn;
        else fn();
      } catch (err) {
        console.error("[google-login][tauri][listen]", err);
      }
    })();
    return () => {
      active = false;
      unlisten?.();
    };
  }, [router, supabase.auth]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError("");

      if (isTauri()) {
        // Flow desktop : pas de redirection de la webview, on ouvre le navigateur.
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        const { data, error: authError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: TAURI_REDIRECT, skipBrowserRedirect: true },
        });
        if (authError) throw authError;
        if (!data?.url) throw new Error("Impossible de démarrer la connexion Google.");
        await openUrl(data.url);
        // loading reste actif : le retour se fait via le listener deep link.
        return;
      }

      // Flow navigateur classique : supabase-js redirige automatiquement
      // window.location vers Google quand data.url est renvoyé.
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
      if (!data?.url) {
        throw new Error(
          "Impossible de démarrer la connexion Google (aucune URL renvoyée). Vérifie que le provider Google est activé dans Supabase."
        );
      }
    } catch (err) {
      console.error("[google-login]", err);
      setError(err instanceof Error ? err.message : "Erreur de connexion");
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push("/dashboard");
      } else {
        if (password !== confirmPassword) throw new Error("Les mots de passe ne correspondent pas");
        if (password.length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères");

        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setError("");
        setSuccess("Compte créé ! Vérifie ta boîte mail pour confirmer ton inscription.");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setIsLogin(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--color-bg-subtle, #F9FAFA)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        {/* Logo + brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <img src="/logo.svg" alt="tao" width={36} height={36} style={{ display: "block", borderRadius: "50%", objectFit: "cover" }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text, #0D0D0D)" }}>tao trade</div>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text, #0D0D0D)", margin: 0, letterSpacing: -0.2 }}>
          {isLogin ? "Connexion" : "Créer un compte"}
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-sub, #5C5C5C)", marginTop: 4, marginBottom: 24 }}>
          {isLogin ? "Accède à ton dashboard de trading" : "Quelques secondes pour commencer"}
        </p>

        {/* Form */}
        <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Email">
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nom@email.com"
              required
              style={inputStyle()}
            />
          </Field>

          <Field label="Mot de passe">
            <input
              type="password"
              name="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle()}
            />
          </Field>

          {!isLogin && (
            <Field label="Confirme le mot de passe">
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={inputStyle()}
              />
            </Field>
          )}

          {error && (
            <div role="alert" style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 12px", background: "var(--color-red-bg, #FEF2F2)", border: "1px solid var(--color-red-bd, #FECACA)",
              borderRadius: 8, color: "var(--color-red, #FF4B4B)", fontSize: 12,
            }}>
              <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div role="status" style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 12px", background: "var(--color-green-bg, #F0FDF4)", border: "1px solid var(--color-green-bd, #86EFAC)",
              borderRadius: 8, color: "var(--color-green, #58CC02)", fontSize: 12,
            }}>
              <span>{success}</span>
            </div>
          )}

          <Button type="submit" variant="primary" loading={loading} fullWidth size="lg">
            {isLogin ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--color-border, #E5E5E5)" }} />
          <span style={{ fontSize: 11, color: "var(--color-text-muted, #6B6B6B)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>OU</span>
          <div style={{ flex: 1, height: 1, background: "var(--color-border, #E5E5E5)" }} />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          type="button"
          style={{
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 14px",
            minHeight:44,
            borderRadius: 8,
            border: "1px solid var(--color-border, #E5E5E5)",
            background: "var(--color-card-bg, #FFFFFF)",
            color: "var(--color-text, #0D0D0D)",
            fontSize:14,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: loading ? 0.6 : 1,
            transition: "background 120ms ease",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-card-bg, #FFFFFF)"; }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuer avec Google
        </button>

        {/* Switch mode */}
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--color-text-sub, #5C5C5C)", marginTop: 24 }}>
          {isLogin ? "Pas encore de compte ? " : "Déjà inscrit ? "}
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(""); setSuccess(""); }}
            style={{
              background: "transparent", border: "none", padding: 0,
              color: "var(--color-text, #0D0D0D)", fontWeight: 500, cursor: "pointer",
              textDecoration: "underline", fontFamily: "inherit", fontSize: "inherit",
            }}
          >
            {isLogin ? "S'inscrire" : "Se connecter"}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Delegue a la brique commune (components/ui/form.jsx).
  return <DAField label={label}>{children}</DAField>;
}

/* Delegue a la brique commune (components/ui/form.jsx) : aplat en pilule.
   Le 16 px et la hauteur restent : c'est la seule page ou l'on tape un mot de
   passe au telephone, et sous 16 px Safari iOS zoome tout seul au focus. */
function inputStyle(): React.CSSProperties {
  return { ...DA_FIELD, padding: "11px 16px", fontSize: 16 };
}
