"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";

// PostgrestError (postgrest-js v2) expose ses champs via des getters sur le
// prototype : JSON.stringify / console renvoient "{}" et e?.message est undefined.
// On lit explicitement la chaine de prototype pour materialiser l'erreur.
function describeError(e: any): string {
  if (!e) return "Erreur inconnue";
  if (typeof e === "string") return e;
  const out: Record<string, any> = {};
  let cur = e;
  while (cur && cur !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(cur)) {
      if (k === "constructor" || k in out) continue;
      try {
        const v = e[k];
        if (typeof v === "function" || v === undefined) continue;
        out[k] = v;
      } catch {}
    }
    cur = Object.getPrototypeOf(cur);
  }
  const parts: string[] = [];
  if (out.message) parts.push(String(out.message));
  if (out.details) parts.push(String(out.details));
  if (out.hint)    parts.push(`Hint: ${out.hint}`);
  if (out.code)    parts.push(`Code: ${out.code}`);
  if (parts.length > 0) return parts.join(" — ");
  try { return JSON.stringify(out) || String(e); } catch { return String(e); }
}

export default function JoinProjectPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<"idle" | "joining" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [projectName, setProjectName] = useState<string | null>(null);

  const token = params?.token;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // ProtectedRoute le redirigera, mais on garde un fallback
      router.replace(`/login?next=/dashboard/join/${token}`);
      return;
    }
    if (!token) return;

    const join = async () => {
      setStatus("joining");
      const supabase = createClient();
      try {
        // 1) récupère le projet pointé par le token
        const { data: invite, error: invErr } = await supabase
          .from("drive_invites")
          .select("project_id, role")
          .eq("token", token)
          .maybeSingle();
        if (invErr) throw invErr;
        if (!invite) throw new Error("Lien d'invitation invalide ou révoqué.");

        // Récup nom du projet (best effort — peut échouer si pas encore membre)
        const { data: proj } = await supabase
          .from("drive_projects")
          .select("name")
          .eq("id", invite.project_id)
          .maybeSingle();
        if (proj?.name) setProjectName(proj.name);

        // 2) s'ajoute comme membre (RLS autorise user_id = auth.uid())
        const { error: memErr } = await supabase
          .from("drive_project_members")
          .upsert(
            { project_id: invite.project_id, user_id: user.id, role: invite.role },
            { onConflict: "project_id,user_id", ignoreDuplicates: true }
          );
        if (memErr) throw memErr;

        setStatus("ok");
        setTimeout(() => router.replace("/dashboard"), 1500);
      } catch (e: any) {
        const msg = describeError(e);
        console.error("[join]", msg, e);
        setStatus("error");
        setMessage(msg);
      }
    };
    join();
  }, [loading, user, token, router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#FAFAFA" }}>
      <div style={{ background: "#fff", border: "1px solid #E5E5E5", borderRadius: 14, padding: 28, maxWidth: 420, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#0D0D0D" }}>
          {status === "ok" ? "Tu as rejoint le projet" :
           status === "error" ? "Impossible de rejoindre" :
           "Rejoindre un projet"}
        </h1>
        <p style={{ marginTop: 10, fontSize: 13, color: "#5C5C5C" }}>
          {status === "idle" || status === "joining" ? (
            projectName ? `Ajout en cours à "${projectName}"…` : "Validation du lien…"
          ) : status === "ok" ? (
            `Bienvenue${projectName ? ` dans "${projectName}"` : ""}. Redirection…`
          ) : (
            message
          )}
        </p>
        {status === "error" && (
          <button
            onClick={() => router.replace("/dashboard")}
            style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, background: "#0D0D0D", color: "#fff", border: "none", fontSize:13, fontWeight: 500, cursor: "pointer" }}>
            Retour au dashboard
          </button>
        )}
      </div>
    </div>
  );
}
