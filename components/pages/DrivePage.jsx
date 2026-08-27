"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Folder, FileText, File as FileIcon, Upload,
  Trash2, Users, Share2, Copy, Check, X, ArrowLeft,
  Scissors, Files as FilesIcon, Download, Lock, Unlock, RefreshCw,
  Link as LinkIcon, Video, ListTodo, Square, CheckSquare, ExternalLink,
  Pencil, Mic, Play, Pause, StopCircle, Image as ImageIcon, Eraser,
  GripVertical,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { useUndo } from "@/lib/contexts/UndoContext";
import { T as BaseT } from "@/lib/ui/tokens";
import { Skeleton, SkeletonCircle } from "@/components/ui/Skeleton";
import { hasFinePointer } from "@/lib/ui/pointer";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";
import { Modal as DAModal, PillButton as DAPillButton, Field as DAField, Input as DAInput, FIELD_FOCUS_RING as DA_FOCUS_RING } from "@/components/ui/form";

// Palette centralisée (valeurs = var(--color-*), dark-aware). Toutes les clés
// utilisées ici (white, border, border2, text, textSub, textMut, accent,
// accentBg, green/red/blue/amber + variantes Bg/Bd) existent déjà dans BaseT :
// aucun token local à ajouter.
const T = { ...BaseT };

// Notification non bloquante via le toast global (AlertToast écoute
// l'événement "tr4de:alert"). Remplace les alert() natifs, indisponibles dans
// la webview Tauri (où ils sont neutralisés → les fonctions restaient muettes).
function notify(title, body, severity = "danger") {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("tr4de:alert", {
      detail: { title, body: String(body ?? ""), severity },
    }));
  } catch {}
}

// Extrait un message lisible depuis un PostgrestError / objet Supabase.
// PostgrestError (postgrest-js v2 ESM) expose ses champs via des getters sur le
// prototype : JSON.stringify les ignore et le devtools Next.js n'affiche que
// "{}". On parcourt donc explicitement la chaÃ®ne de prototype pour matÃ©rialiser
// toutes les valeurs sur un objet plat sÃ©rialisable.
function dumpError(e) {
  if (!e || typeof e !== "object") return e;
  const out = {
    __ctor: e?.constructor?.name || null,
    __toString: (() => { try { return String(e); } catch { return null; } })(),
  };
  const seen = new Set();
  let cur = e;
  while (cur && cur !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(cur)) {
      if (seen.has(k) || k === "constructor") continue;
      seen.add(k);
      try {
        const v = e[k];
        if (typeof v === "function") continue;
        if (v !== undefined) out[k] = v;
      } catch {}
    }
    cur = Object.getPrototypeOf(cur);
  }
  // Filet de sÃ©curitÃ© : clÃ©s courantes (StorageError, fetch errors).
  for (const k of [
    "message", "code", "details", "hint", "name", "status", "statusText",
    "error", "originalError", "statusCode", "stack", "cause",
  ]) {
    if (out[k] === undefined) {
      try { if (e[k] !== undefined) out[k] = e[k]; } catch {}
    }
  }
  return out;
}
function describeError(e) {
  if (!e) return "Erreur inconnue";
  if (typeof e === "string") return e;
  const d = dumpError(e);
  const parts = [];
  if (d.message) parts.push(d.message);
  if (d.details) parts.push(d.details);
  if (d.hint)    parts.push(`Hint: ${d.hint}`);
  if (d.code)    parts.push(`Code: ${d.code}`);
  if (d.status)  parts.push(`Status: ${d.status}`);
  if (parts.length === 0) {
    try {
      const flat = {};
      for (const [k, v] of Object.entries(d)) {
        if (v === undefined || v === null) continue;
        if (typeof v === "object") { try { flat[k] = JSON.parse(JSON.stringify(v)); } catch {} }
        else flat[k] = v;
      }
      const s = JSON.stringify(flat);
      return s && s !== "{}" ? s : (d.__toString || String(e));
    } catch { return String(e); }
  }
  return parts.join(" â€” ");
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "â€”";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Extrait l'ID YouTube depuis une URL (watch, youtu.be, embed, shorts).
function getYouTubeId(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts)\/([^/]+)/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

// Renvoie une URL d'image preview pour un lien :
//  â€¢ YouTube â†’ miniature de la vidÃ©o (hqdefault)
//  â€¢ Autres  â†’ favicon haute rÃ©solution via Google s2 (logo de la page/site)
function getLinkPreviewImage(raw) {
  if (!raw) return null;
  const yt = getYouTubeId(raw);
  if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
  try {
    const u = new URL(raw);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=128`;
  } catch { return null; }
}

// Convertit une URL vidÃ©o (YouTube, Vimeo) en URL embed. Renvoie null si
// l'URL n'est pas embeddable (ex. fichier .mp4 direct â€” utilise <video>).
function getVideoEmbedUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (/^\d+$/.test(id || "")) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {}
  return null;
}

export default function DrivePage() {
  const { user } = useAuth();
  const { pushUndo } = useUndo();
  const supabase = createClient();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  // selectedProjectId est persistÃ© dans localStorage pour qu'on revienne
  // exactement lÃ  oÃ¹ on Ã©tait en relanÃ§ant la page Drive.
  const [selectedProjectId, _setSelectedProjectId] = useState(() => {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem("tr4de.drive.currentProject") || null; } catch { return null; }
  });
  const setSelectedProjectId = (id) => {
    _setSelectedProjectId(id);
    try {
      if (id) window.localStorage.setItem("tr4de.drive.currentProject", id);
      else    window.localStorage.removeItem("tr4de.drive.currentProject");
    } catch {}
  };
  const [error, setError] = useState(null);

  // Modales Membres / Partager (affichÃ©es au-dessus de ProjectDetail).
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  // Projet en attente de confirmation de suppression (modale in-app).
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(null);

  // Demande de crÃ©ation de projet : quand on clique "Nouveau projet" depuis
  // n'importe quelle vue, on bascule vers le canvas des projets et on lui
  // demande d'ouvrir l'Ã©diteur de nom au centre de sa viewport.
  const [pendingCreate, setPendingCreate] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  const requestNewProject = () => {
    if (selectedProjectId) setSelectedProjectId(null);
    setPendingCreate(true);
  };

  // â”€â”€â”€ Load projects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadProjects = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("drive_projects")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setProjects(data || []);
    } catch (e) {
      console.error("[Drive] load projects failed:", describeError(e), dumpError(e));
      const msg = describeError(e);
      if (/relation .*drive_projects.* does not exist/i.test(msg) || /Could not find the table/i.test(msg)) {
        setError("La migration 022_drive_projects.sql n'a pas encore Ã©tÃ© appliquÃ©e sur Supabase. Lance-la dans le SQL editor.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, supabase]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Si le selectedProjectId persistÃ© n'existe plus (projet supprimÃ© / quittÃ©),
  // on revient sur le canvas des projets.
  useEffect(() => {
    if (loading) return;
    if (selectedProjectId && !projects.find((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, loading]);

  // CrÃ©e un projet Ã  la position fournie (centre du viewport courant du
  // canvas des projets). On NE bascule PAS dans le projet : on reste sur le
  // canvas pour voir le projet apparaÃ®tre.
  const createProject = async ({ name, pos_x, pos_y }) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const authedId = authData?.user?.id;
      if (!authedId) throw new Error("Session Supabase introuvable. Reconnecte-toi.");

      const payload = { name: trimmed, owner_id: authedId };
      if (Number.isFinite(pos_x)) payload.pos_x = Math.round(pos_x);
      if (Number.isFinite(pos_y)) payload.pos_y = Math.round(pos_y);

      const insertRes = await supabase.from("drive_projects").insert(payload);
      if (insertRes.error) throw insertRes.error;

      const { data: rows, error: selErr } = await supabase
        .from("drive_projects")
        .select("*")
        .eq("owner_id", authedId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (selErr) throw selErr;
      const data = rows?.[0];
      if (!data) throw new Error("Projet crÃ©Ã© mais non visible (RLS sur SELECT).");

      setProjects((prev) => [data, ...prev]);
      return data;
    } catch (e) {
      console.error("[Drive] create project failed:", describeError(e), dumpError(e));
      const msg = describeError(e);
      // Hint typique quand la migration n'a pas Ã©tÃ© appliquÃ©e
      if (/relation .*drive_projects.* does not exist/i.test(msg) || /Could not find the table/i.test(msg)) {
        setError("La migration 022_drive_projects.sql n'a pas encore Ã©tÃ© appliquÃ©e sur Supabase. Lance-la dans le SQL editor.");
      } else {
        setError(msg);
      }
      return null;
    }
  };

  // Persiste la position d'un projet sur le canvas niveau 1 (debounce).
  const projectPosTimers = useRef({});
  const persistProjectPosition = (id, pos_x, pos_y, width, height) => {
    if (projectPosTimers.current[id]) clearTimeout(projectPosTimers.current[id]);
    projectPosTimers.current[id] = setTimeout(async () => {
      const patch = { updated_at: new Date().toISOString() };
      if (Number.isFinite(pos_x))  patch.pos_x  = Math.round(pos_x);
      if (Number.isFinite(pos_y))  patch.pos_y  = Math.round(pos_y);
      if (Number.isFinite(width))  patch.width  = Math.round(width);
      if (Number.isFinite(height)) patch.height = Math.round(height);
      const { error } = await supabase.from("drive_projects").update(patch).eq("id", id);
      if (error) console.error("[Drive] persist project pos failed:", describeError(error), dumpError(error));
    }, 300);
  };

  const updateProjectLocal = (id, patch) => {
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  };

  const renameProject = async (id, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    updateProjectLocal(id, { name: trimmed });
    const { error } = await supabase.from("drive_projects")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[Drive] rename failed:", describeError(error), dumpError(error));
      setError(describeError(error));
    }
  };

  const toggleProjectLock = async (id, locked) => {
    updateProjectLocal(id, { locked });
    const { error } = await supabase.from("drive_projects")
      .update({ locked, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[Drive] lock failed:", describeError(error), dumpError(error));
      const msg = describeError(error);
      if (/locked/i.test(msg)) {
        setError("Migration 026_drive_project_locked.sql manquante â€” lance-la dans le SQL editor.");
      } else {
        setError(msg);
      }
      // rollback local
      updateProjectLocal(id, { locked: !locked });
    }
  };

  const duplicateProject = async (sourceId) => {
    const src = projects.find((p) => p.id === sourceId);
    if (!src) return;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const authedId = authData?.user?.id;
      if (!authedId) throw new Error("Non authentifiÃ©.");

      // 1) duplique le projet (positionnÃ© Ã  cÃ´tÃ© de la source)
      const w = src.width ?? 240;
      const h = src.height ?? 140;
      const PAD = 16;
      const rects = projects.map((p) => ({
        x: p.pos_x, y: p.pos_y,
        w: p.width || 240, h: p.height || 140,
      }));
      const overlaps = (rx, ry) => rects.some((r) =>
        rx < r.x + r.w + PAD && rx + w + PAD > r.x &&
        ry < r.y + r.h + PAD && ry + h + PAD > r.y
      );
      let nx = Math.round((src.pos_x ?? 80) + 40);
      let ny = Math.round((src.pos_y ?? 80) + 40);
      if (overlaps(nx, ny)) {
        const STEP_X = w + PAD;
        const STEP_Y = h + PAD;
        let found = false;
        for (let layer = 1; layer < 30 && !found; layer++) {
          for (let dy = -layer; dy <= layer && !found; dy++) {
            for (let dx = -layer; dx <= layer && !found; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== layer) continue;
              const tx = nx + dx * STEP_X;
              const ty = ny + dy * STEP_Y;
              if (!overlaps(tx, ty)) { nx = tx; ny = ty; found = true; }
            }
          }
        }
      }
      const payload = {
        name: `${src.name} (copie)`,
        owner_id: authedId,
        pos_x: nx,
        pos_y: ny,
        width: w,
        height: h,
        color: src.color ?? null,
      };
      const ins = await supabase.from("drive_projects").insert(payload);
      if (ins.error) throw ins.error;

      const { data: rows, error: selErr } = await supabase
        .from("drive_projects").select("*")
        .eq("owner_id", authedId)
        .order("created_at", { ascending: false }).limit(1);
      if (selErr) throw selErr;
      const newProj = rows?.[0];
      if (!newProj) throw new Error("Duplication Ã©chouÃ©e (RLS SELECT).");

      // 2) copie les fichiers (sans le binaire storage, juste les metadata + contenu doc/folder)
      const { data: srcFiles, error: filesErr } = await supabase
        .from("drive_files").select("*").eq("project_id", sourceId);
      if (filesErr) console.warn("[Drive] duplicate files load failed:", describeError(filesErr), dumpError(filesErr));
      if (srcFiles && srcFiles.length > 0) {
        // On ne re-uploade pas les binaires â€” on garde uniquement docs/folders.
        // (Pour copier les fichiers, il faudrait re-upload chaque storage_path.)
        const toCopy = srcFiles
          .filter((f) => f.type !== "file")
          .map((f) => ({
            project_id: newProj.id,
            parent_id: null, // on aplatit pour Ã©viter les rÃ©fÃ©rences croisÃ©es
            name: f.name,
            type: f.type,
            content: f.content,
            mime_type: f.mime_type,
            size_bytes: f.size_bytes,
            created_by: authedId,
            pos_x: f.pos_x, pos_y: f.pos_y,
            width: f.width, height: f.height,
            color: f.color,
          }));
        if (toCopy.length > 0) {
          const { error: copyErr } = await supabase.from("drive_files").insert(toCopy);
          if (copyErr) console.warn("[Drive] duplicate files insert failed:", describeError(copyErr), dumpError(copyErr));
        }
      }

      setProjects((prev) => [newProj, ...prev]);
    } catch (e) {
      console.error("[Drive] duplicate failed:", describeError(e), dumpError(e));
      setError(describeError(e));
    }
  };

  // Suppression : on passe par une modale in-app (le confirm() natif est
  // supprimé dans la webview Tauri, donc la suppression ne partait jamais).
  const requestDeleteProject = (id) => {
    const proj = projects.find((p) => p.id === id);
    if (proj) setConfirmDeleteProject(proj);
  };

  const deleteProject = async (id, { skipConfirm = false } = {}) => {
    if (!skipConfirm) { requestDeleteProject(id); return; }
    const snapshot = projects.find((p) => p.id === id);
    if (!snapshot) return;
    try {
      const { error } = await supabase.from("drive_projects").delete().eq("id", id);
      if (error) throw error;
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedProjectId === id) setSelectedProjectId(null);
      // Undo : rÃ©-insÃ¨re le projet avec son ancien id (RLS owner_id = auth.uid()
      // â€” donc seul l'owner peut undelete son propre projet).
      pushUndo({
        label: `Suppression du projet "${snapshot.name}"`,
        undo: async () => {
          const payload = { ...snapshot };
          delete payload.locked; // colonne pourrait ne pas exister
          const { data, error: insErr } = await supabase
            .from("drive_projects").insert(payload).select().single();
          if (insErr) { console.error("[undo] re-insert project failed:", describeError(insErr), dumpError(insErr)); return; }
          setProjects((prev) => [data, ...prev]);
        },
        redo: async () => {
          await supabase.from("drive_projects").delete().eq("id", id);
          setProjects((prev) => prev.filter((p) => p.id !== id));
        },
      });
    } catch (e) {
      console.error("[Drive] delete project failed:", describeError(e), dumpError(e));
      setError(describeError(e));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "calc(100vh - 120px)" }} className="anim-1 tr4de-drive-page">
      <style>{`
        @media (max-width: 600px) {
          .tr4de-drive-page { height: auto !important; min-height: calc(100vh - 120px); }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {selectedProject ? (
          <>
            <button
              onClick={() => setSelectedProjectId(null)}
              title="Retour aux projets"
              style={{ padding: "8px 16px", height: 34, minHeight: 34, borderRadius: 999, background: T.white, border: `1px solid ${T.border}`, color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ArrowLeft size={14} strokeWidth={1.75} /> Projets
            </button>
            <h1 className="t-h2" style={{ color: T.text, margin: 0 }}>
              {selectedProject.name}
            </h1>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: T.textMut }}>
              {projects.length} projet{projects.length !== 1 ? "s" : ""}
            </span>
          </>
        )}
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          {selectedProject && (
            <>
              <button
                onClick={() => setShowMembersModal(true)}
                style={{ padding: "8px 16px", height: 34, minHeight: 34, borderRadius: 999, background: T.white, border: `1px solid ${T.border}`, color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Users size={14} strokeWidth={1.75} /> Membres
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                style={{ padding: "8px 16px", height: 34, minHeight: 34, borderRadius: 999, background: T.white, border: `1px solid ${T.border}`, color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Share2 size={14} strokeWidth={1.75} /> Partager
              </button>
              {selectedProject.owner_id === user?.id && (
                <button
                  onClick={() => deleteProject(selectedProject.id)}
                  title="Supprimer le projet"
                  aria-label="Supprimer le projet"
                  style={{ width: 34, height: 34, background: T.white, border: `1px solid ${T.border}`, color: T.textMut, cursor: "pointer", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; e.currentTarget.style.borderColor = T.redBd; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = T.white; e.currentTarget.style.color = T.textMut; e.currentTarget.style.borderColor = T.border; }}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </>
          )}
          {/* "Nouveau projet" : toujours visible, dans les deux vues. */}
          <button
            onClick={requestNewProject}
            style={{ padding: "8px 16px", height: 34, minHeight: 34, borderRadius: 999, background: T.text, border: `1px solid ${T.text}`, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} strokeWidth={2} /> Nouveau projet
          </button>
        </div>
        <div id="tr4de-page-header-slot" />
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: T.redBg, color: T.red, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Fermer l'erreur" title="Fermer" style={{ background: "transparent", border: "none", color: T.red, cursor: "pointer" }}><X size={14} /></button>
        </div>
      )}

      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", display: "flex", flexDirection: "column", minHeight: 0, flex: 1, overflow: "hidden" }}>
        {selectedProject ? (
          <ProjectDetail
            key={selectedProject.id}
            project={selectedProject}
            currentUserId={user?.id}
            onProjectRenamed={(name) => updateProjectLocal(selectedProject.id, { name })}
          />
        ) : (
          <ProjectsCanvas
            projects={projects}
            loading={loading}
            currentUserId={user?.id}
            pendingCreate={pendingCreate}
            onPendingCreateHandled={() => setPendingCreate(false)}
            onOpenProject={(id) => setSelectedProjectId(id)}
            onCreateProject={createProject}
            onDeleteProject={deleteProject}
            onRenameProject={renameProject}
            onDuplicateProject={duplicateProject}
            onToggleLockProject={toggleProjectLock}
            onMoveProject={(id, x, y) => updateProjectLocal(id, { pos_x: x, pos_y: y })}
            onMoveProjectEnd={(id, x, y, w, h) => persistProjectPosition(id, x, y, w, h)}
            onResizeProject={(id, w, h) => updateProjectLocal(id, { width: w, height: h })}
            onResizeProjectEnd={(id, x, y, w, h) => persistProjectPosition(id, x, y, w, h)}
          />
        )}
      </div>

      {selectedProject && showShareModal && (
        <ShareModal project={selectedProject} onClose={() => setShowShareModal(false)} />
      )}
      {selectedProject && showMembersModal && (
        <MembersModal project={selectedProject} currentUserId={user?.id} onClose={() => setShowMembersModal(false)} />
      )}
      {confirmDeleteProject && (
        <ConfirmDialog
          title="Supprimer ce projet ?"
          message={`« ${confirmDeleteProject.name} » et tous ses fichiers seront supprimés. Cette action est définitive.`}
          confirmLabel="Supprimer"
          danger
          onCancel={() => setConfirmDeleteProject(null)}
          onConfirm={() => {
            const id = confirmDeleteProject.id;
            setConfirmDeleteProject(null);
            deleteProject(id, { skipConfirm: true });
          }}
        />
      )}
    </div>
  );
}

/* â”€â”€â”€ Modale de confirmation in-app (remplace window.confirm, KO sous Tauri) â”€â”€ */
function ConfirmDialog({ title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      // Capture + stopImmediatePropagation : empêche les raccourcis du canvas
      // (Entrée = ouvrir le projet) de se déclencher en même temps.
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.key === "Escape") onCancel?.();
      else onConfirm?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onConfirm, onCancel]);

  /* Voile assombri et fenetre fixe : une confirmation attend une reponse,
     il n y a rien a lire dessous ni nulle part ou la pousser. */
  return (
    <DAModal
      title={title}
      onClose={onCancel}
      width={400}
      draggable={false}
      scrim
      footer={<>
        <DAPillButton onClick={onCancel}>{cancelLabel}</DAPillButton>
        <DAPillButton
          autoFocus
          variant="primary"
          style={danger ? { background: T.red, color: "#fff" } : undefined}
          onClick={onConfirm}>
          {confirmLabel}
        </DAPillButton>
      </>}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, letterSpacing: -0.1 }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: T.text, opacity: 0.6, lineHeight: 1.55 }}>{message}</div>}
    </DAModal>
  );
}

/* â”€â”€â”€ Dialogue de saisie in-app (remplace window.prompt, KO sous Tauri) â”€â”€â”€â”€ */
function PromptDialog({
  title, label, defaultValue = "", placeholder = "",
  confirmLabel = "OK", cancelLabel = "Annuler", onSubmit, onCancel,
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    // Sélectionne le contenu par défaut pour une saisie rapide.
    const el = inputRef.current;
    if (el) { el.focus(); el.select?.(); }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onCancel?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const submit = () => onSubmit?.(value);

  return (
    <DAModal
      title={title}
      onClose={onCancel}
      width={420}
      draggable={false}
      scrim
      footer={<>
        <DAPillButton onClick={onCancel}>{cancelLabel}</DAPillButton>
        <DAPillButton variant="primary" onClick={submit}>{confirmLabel}</DAPillButton>
      </>}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, letterSpacing: -0.1 }}>{title}</div>
      <DAField label={label}>
        <DAInput
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
          placeholder={placeholder}
        />
      </DAField>
    </DAModal>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   ProjectsCanvas : canvas niveau 1 oÃ¹ chaque projet est une carte
   draggable. Sert d'Ã©cran d'accueil du Drive.
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ProjectsCanvas({
  projects, loading, currentUserId,
  pendingCreate, onPendingCreateHandled,
  onOpenProject, onCreateProject, onDeleteProject,
  onRenameProject, onDuplicateProject, onToggleLockProject,
  onMoveProject, onMoveProjectEnd, onResizeProject, onResizeProjectEnd,
}) {
  // Menu contextuel : { rect, project } ou null.
  const [ctxMenu, setCtxMenu] = useState(null);
  // Renommage inline : id du projet en cours d'Ã©dition.
  const [renamingId, setRenamingId] = useState(null);
  // SÃ©lection clavier : carte cible des raccourcis (Delete, F2, Ctrl+D).
  const [selectedCardId, setSelectedCardId] = useState(null);
  // Zoom canvas : 0.25 → 2x. Persiste pour que la position de scroll restauree
  // au prochain mount corresponde bien aux memes cartes a l'ecran.
  const ZOOM_KEY = "tr4de.drive.zoom.__projects";
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const raw = window.localStorage.getItem(ZOOM_KEY);
      if (raw) {
        const z = parseFloat(raw);
        if (Number.isFinite(z) && z >= 0.25 && z <= 2) return z;
      }
    } catch {}
    return 1;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(ZOOM_KEY, String(zoom)); } catch {}
  }, [zoom]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [ctxMenu]);
  // TrÃ¨s grand monde + origine centrÃ©e : les cartes sont positionnÃ©es
  // relativement Ã  (ORIGIN_X, ORIGIN_Y), donc on peut pan dans toutes les
  // directions (gauche, droite, haut, bas) sans toucher de bord visible.
  const WORLD_W = 40000;
  const WORLD_H = 40000;
  const ORIGIN_X = WORLD_W / 2;
  const ORIGIN_Y = WORLD_H / 2;
  const SCROLL_KEY = "tr4de.drive.scroll.v2.__projects";

  const canvasRef = useRef(null);
  const [creating, setCreating] = useState(null); // { pos_x, pos_y } | null
  const [draftName, setDraftName] = useState("");

  // Scroll restore + save. On attend que le canvas soit *réellement*
  // scrollable (scrollWidth > clientWidth) avant de poser scrollLeft : sinon
  // le navigateur clampe à 0 et on reste collé au bord gauche du monde.
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (initialScrollDone.current) return;
    const el = canvasRef.current;
    if (!el || loading) return;

    const apply = () => {
      if (!el) return;
      // Si le canvas n'est pas encore scrollable, on retente à la frame suivante.
      if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth) {
        requestAnimationFrame(apply);
        return;
      }
      initialScrollDone.current = true;

      let restored = false;
      try {
        const raw = window.localStorage.getItem(SCROLL_KEY);
        if (raw) {
          const { x, y } = JSON.parse(raw);
          // On ignore (0,0) — c'est presque toujours un état corrompu sauvegardé
          // avant que le canvas soit mesurable (cf. bug "scroll uniquement à droite").
          if (Number.isFinite(x) && Number.isFinite(y) && (x > 100 || y > 100)) {
            el.scrollLeft = x; el.scrollTop = y;
            restored = true;
          }
        }
      } catch {}
      if (restored) return;

      if (projects.length > 0) {
        const cx = projects.reduce((s, p) => s + ((Number.isFinite(p.pos_x) ? p.pos_x : 80) + (Number.isFinite(p.width)  ? p.width  : 240) / 2), 0) / projects.length;
        const cy = projects.reduce((s, p) => s + ((Number.isFinite(p.pos_y) ? p.pos_y : 80) + (Number.isFinite(p.height) ? p.height : 140) / 2), 0) / projects.length;
        el.scrollLeft = Math.max(0, (ORIGIN_X + cx) * zoom - el.clientWidth / 2);
        el.scrollTop  = Math.max(0, (ORIGIN_Y + cy) * zoom - el.clientHeight / 2);
      } else {
        el.scrollLeft = ORIGIN_X * zoom - el.clientWidth / 2;
        el.scrollTop  = ORIGIN_Y * zoom - el.clientHeight / 2;
      }
    };
    apply();
  }, [loading, projects]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let t = null;
    const onScroll = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try { window.localStorage.setItem(SCROLL_KEY, JSON.stringify({ x: el.scrollLeft, y: el.scrollTop })); } catch {}
      }, 200);
    };
    el.addEventListener("scroll", onScroll);
    return () => { el.removeEventListener("scroll", onScroll); if (t) clearTimeout(t); };
  }, []);

  // Pan
  const panState = useRef(null);
  const onCanvasPointerDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const el = canvasRef.current;
    if (!el) return;
    panState.current = {
      startX: e.clientX, startY: e.clientY,
      startScrollX: el.scrollLeft, startScrollY: el.scrollTop,
      moved: false,
    };
    const onMove = (ev) => {
      if (!panState.current) return;
      const dx = ev.clientX - panState.current.startX;
      const dy = ev.clientY - panState.current.startY;
      if (!panState.current.moved && Math.abs(dx) + Math.abs(dy) > 3) {
        panState.current.moved = true;
        el.style.cursor = "grabbing";
      }
      if (panState.current.moved) {
        el.scrollLeft = panState.current.startScrollX - dx;
        el.scrollTop  = panState.current.startScrollY - dy;
      }
    };
    const onUp = () => {
      // Si pas de drag, c'est un clic vide â†’ dÃ©sÃ©lectionne la carte.
      if (panState.current && !panState.current.moved) setSelectedCardId(null);
      panState.current = null;
      el.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Cherche une position libre proche de (x, y) : on teste des points sur une
  // spirale carrÃ©e jusqu'Ã  trouver un rectangle qui n'en chevauche aucun autre.
  // PAD ajoute un petit espace visuel entre cartes.
  const findFreeSpot = (x, y, w = 240, h = 140, pad = 16) => {
    const rects = (projects || []).map((p) => ({
      x: p.pos_x, y: p.pos_y,
      w: p.width || 240, h: p.height || 140,
    }));
    const overlaps = (rx, ry) => rects.some((r) =>
      rx < r.x + r.w + pad && rx + w + pad > r.x &&
      ry < r.y + r.h + pad && ry + h + pad > r.y
    );
    if (!overlaps(x, y)) return { x, y };
    const STEP_X = w + pad;
    const STEP_Y = h + pad;
    // Spirale : on Ã©loigne progressivement, en couches concentriques.
    for (let layer = 1; layer < 30; layer++) {
      for (let dy = -layer; dy <= layer; dy++) {
        for (let dx = -layer; dx <= layer; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== layer) continue;
          const tx = x + dx * STEP_X;
          const ty = y + dy * STEP_Y;
          if (!overlaps(tx, ty)) return { x: tx, y: ty };
        }
      }
    }
    return { x, y };
  };

  const newProjectAtCenter = () => {
    const el = canvasRef.current;
    // Centre viewport en coords DOM, puis on retranche ORIGIN pour obtenir
    // les coords "carte" (relatives au centre logique du monde).
    const cx = el ? (el.scrollLeft + el.clientWidth / 2) / zoom - ORIGIN_X - 120 : 0;
    const cy = el ? (el.scrollTop  + el.clientHeight / 2) / zoom - ORIGIN_Y - 70  : 0;
    const spot = findFreeSpot(Math.round(cx), Math.round(cy));
    setCreating({ pos_x: spot.x, pos_y: spot.y });
    setDraftName("");
  };

  // RÃ©agit Ã  une demande externe (bouton "Nouveau projet" du header global)
  useEffect(() => {
    if (!pendingCreate) return;
    // Le scroll initial peut prendre une frame ; on attend qu'il soit fait.
    if (!initialScrollDone.current) return;
    newProjectAtCenter();
    onPendingCreateHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCreate, loading]);

  const submitCreate = async () => {
    if (!creating) return;
    const name = draftName.trim();
    if (!name) { setCreating(null); setDraftName(""); return; }
    const created = await onCreateProject({ name, pos_x: creating.pos_x, pos_y: creating.pos_y });
    setCreating(null);
    setDraftName("");
    // On scroll pour montrer le projet crÃ©Ã©.
    if (created && canvasRef.current) {
      const el = canvasRef.current;
      el.scrollLeft = Math.max(0, (ORIGIN_X + (created.pos_x ?? creating.pos_x) + 120) * zoom - el.clientWidth / 2);
      el.scrollTop  = Math.max(0, (ORIGIN_Y + (created.pos_y ?? creating.pos_y) + 70) * zoom - el.clientHeight / 2);
    }
  };

  // â”€â”€â”€ Zoom Ctrl+wheel : ancrÃ© sur la position du curseur â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      // Coord monde sous le curseur AVANT zoom
      const worldX = (el.scrollLeft + mx) / zoom;
      const worldY = (el.scrollTop + my) / zoom;
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextZoom = Math.max(0.25, Math.min(2, zoom * factor));
      setZoom(nextZoom);
      // Aligne le scroll pour que le point monde reste sous le curseur
      requestAnimationFrame(() => {
        if (!el) return;
        el.scrollLeft = worldX * nextZoom - mx;
        el.scrollTop  = worldY * nextZoom - my;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom]);

  // â”€â”€â”€ Raccourcis : Delete, F2, Ctrl+D, Ã‰chap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const onKey = (e) => {
      // Ignore si l'utilisateur Ã©dite un champ
      const ae = document.activeElement;
      const tag = (ae?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || ae?.isContentEditable) return;

      if (e.key === "Escape") {
        if (ctxMenu) { setCtxMenu(null); return; }
        if (creating) { setCreating(null); setDraftName(""); return; }
        if (selectedCardId) { setSelectedCardId(null); return; }
        return;
      }

      // Les raccourcis suivants nÃ©cessitent une carte sÃ©lectionnÃ©e
      const sel = selectedCardId ? projects.find((p) => p.id === selectedCardId) : null;
      if (!sel) return;
      const isOwner = sel.owner_id === currentUserId;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (isOwner && !sel.locked) onDeleteProject(sel.id);
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        if (isOwner && !sel.locked) setRenamingId(sel.id);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        onDuplicateProject?.(sel.id);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onOpenProject(sel.id);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCardId, projects, currentUserId, ctxMenu, creating, onDeleteProject, onDuplicateProject, onOpenProject]);

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        style={{
          flex: 1, position: "relative", overflow: "auto",
          background: `radial-gradient(circle, color-mix(in srgb, ${T.border2} 33%, transparent) 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
          backgroundColor: "var(--color-hover-bg, #F0F0F0)",
          cursor: "grab",
        }}
      >
        {/* Outer wrapper dimensionne la scroll-area en fonction du zoom :
            sinon scrollWidth reste a WORLD_W meme zoome a 2x → cartes a droite
            inaccessibles, donc invisibles. */}
        <div style={{ position: "relative", width: WORLD_W * zoom, height: WORLD_H * zoom }}>
        <div style={{
          position: "absolute", top: 0, left: 0,
          width: WORLD_W, height: WORLD_H,
          transform: `scale(${zoom})`, transformOrigin: "0 0",
        }}>
          {loading && (
            <div role="status" aria-label="Chargement des projets" style={{ position: "absolute", top: ORIGIN_Y - 80, left: ORIGIN_X - 130, display: "flex", gap: 16 }}>
              {[0, 1].map((i) => (
                <div key={i} className="anim-shimmer" style={{ width: 240, height: 140, borderRadius: "var(--radius-card)" }} />
              ))}
            </div>
          )}
          {!loading && projects.length === 0 && !creating && (
            <div style={{ position: "absolute", top: ORIGIN_Y - 40, left: ORIGIN_X - 200, width: 400, textAlign: "center", color: T.textSub, fontSize: 13, pointerEvents: "none" }}>
              Aucun projet â€” clique sur <strong>Nouveau projet</strong> pour dÃ©marrer.
            </div>
          )}

          {/* Wrapper offset : (0,0) = centre logique du monde, pour pan
              dans toutes les directions (gauche, haut, etc.). */}
          <div style={{ position: "absolute", left: ORIGIN_X, top: ORIGIN_Y, width: 0, height: 0 }}>

          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              currentUserId={currentUserId}
              isRenaming={renamingId === p.id}
              isSelected={selectedCardId === p.id}
              zoom={zoom}
              onSelect={() => setSelectedCardId(p.id)}
              onOpen={() => onOpenProject(p.id)}
              onDelete={() => onDeleteProject(p.id)}
              onMove={(x, y) => onMoveProject(p.id, x, y)}
              onMoveEnd={(x, y) => onMoveProjectEnd(p.id, x, y, p.width, p.height)}
              onResize={(w, h) => onResizeProject(p.id, w, h)}
              onResizeEnd={(w, h) => onResizeProjectEnd(p.id, p.pos_x, p.pos_y, w, h)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedCardId(p.id);
                const rect = e.currentTarget.getBoundingClientRect();
                setCtxMenu({ rect, project: p });
              }}
              onSubmitRename={(newName) => {
                setRenamingId(null);
                if (newName && newName.trim() && newName.trim() !== p.name) {
                  onRenameProject?.(p.id, newName.trim());
                }
              }}
              onCancelRename={() => setRenamingId(null)}
            />
          ))}

          {creating && (
            <div
              style={{
                position: "absolute",
                left: creating.pos_x, top: creating.pos_y,
                width: 240, minHeight: 90,
                background: T.white, border: `2px dashed ${T.text}`,
                borderRadius: 10, padding: 12,
                display: "flex", flexDirection: "column", gap: 8,
                boxShadow: "var(--elev-hover)",
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4 }}>Nouveau projet</div>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitCreate(); }
                  if (e.key === "Escape") { setCreating(null); setDraftName(""); }
                }}
                onBlur={submitCreate}
                placeholder="Nom du projetâ€¦"
                style={{ padding: "6px 8px", border: "none", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", color: T.text, background: DA_FIELD_BG,}}
              />
            </div>
          )}

          </div>{/* /offset wrapper */}
        </div>
        </div>{/* /scroll-size wrapper */}
      </div>

      {/* Badge zoom + hint raccourcis */}
      <div style={{
        position: "absolute", right: 14, bottom: 14, zIndex: 5,
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "5px 10px", borderRadius: 999,
        background: "rgba(255,255,255,0.92)", border: `1px solid ${T.border}`,
        fontSize: 10, color: T.textMut, fontFamily: "inherit",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        pointerEvents: "none",
      }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: T.text }}>{Math.round(zoom * 100)}%</span>
        <span>Â·</span>
        <span>Ctrl+molette : zoom Â· Suppr : supprimer Â· F2 : renommer Â· Ctrl+D : dupliquer Â· Ctrl+Z : annuler</span>
      </div>

      {ctxMenu && (
        <ProjectContextMenu
          cardRect={ctxMenu.rect}
          project={ctxMenu.project}
          isOwner={ctxMenu.project.owner_id === currentUserId}
          onClose={() => setCtxMenu(null)}
          onOpen={() => { onOpenProject(ctxMenu.project.id); setCtxMenu(null); }}
          onRename={() => { setRenamingId(ctxMenu.project.id); setCtxMenu(null); }}
          onDuplicate={() => { onDuplicateProject?.(ctxMenu.project.id); setCtxMenu(null); }}
          onToggleLock={() => { onToggleLockProject?.(ctxMenu.project.id, !ctxMenu.project.locked); setCtxMenu(null); }}
          onDelete={() => { onDeleteProject(ctxMenu.project.id); setCtxMenu(null); }}
        />
      )}
    </div>
  );
}

function ProjectContextMenu({ cardRect, project, isOwner, onClose, onOpen, onRename, onDuplicate, onToggleLock, onDelete }) {
  // Le menu s'affiche juste Ã  cÃ´tÃ© de la carte : Ã  droite si possible,
  // sinon Ã  gauche. AlignÃ© en haut sur la carte, clampÃ© pour rester visible.
  const W = 220, H = 240;
  const GAP = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth  : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  // Ã€ droite : cardRect.right + GAP ; Ã  gauche : cardRect.left - W - GAP.
  const placeRight = cardRect ? (cardRect.right + GAP + W <= vw) : true;
  let left;
  if (cardRect) {
    left = placeRight ? cardRect.right + GAP : cardRect.left - W - GAP;
  } else {
    left = (vw - W) / 2;
  }
  // Si mÃªme Ã  gauche Ã§a dÃ©borde (carte trÃ¨s Ã  gauche), on clampe au bord.
  left = Math.max(8, Math.min(left, vw - W - 8));
  let top = cardRect ? cardRect.top : (vh - H) / 2;
  top = Math.max(8, Math.min(top, vh - H - 8));
  const locked = !!project.locked;

  const Item = ({ icon, label, onClick, danger, disabled, hint }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", width: "100%",
        background: "transparent", border: "none",
        color: disabled ? T.textMut : (danger ? T.red : T.text),
        fontSize:13, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? T.redBg : T.accentBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ display: "inline-flex", width: 14, justifyContent: "center", color: "inherit" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={{ fontSize: 10, color: T.textMut }}>{hint}</span>}
    </button>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed", left, top, width: W,
        background: T.white, border: "none",
        borderRadius: 10, boxShadow: "var(--elev-overlay)",
        padding: 4, zIndex: 2000,
        fontFamily: "inherit",
      }}
    >
      <div style={{ padding: "8px 12px 10px", fontSize: 12, color: T.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {project.name}
      </div>
      <div style={{ height: 1, background: T.border, margin: "0 4px 4px" }} />
      <Item icon={<Folder size={13} strokeWidth={1.75} />} label="Ouvrir" onClick={onOpen} />
      <Item icon={<FileText size={13} strokeWidth={1.75} />} label="Renommer" onClick={onRename}
            disabled={!isOwner} hint={!isOwner ? "owner" : undefined} />
      <Item icon={<Copy size={13} strokeWidth={1.75} />} label="Dupliquer" onClick={onDuplicate} />
      <Item
        icon={locked ? <Check size={13} strokeWidth={1.75} /> : <X size={13} strokeWidth={1.75} />}
        label={locked ? "DÃ©verrouiller" : "Verrouiller"}
        onClick={onToggleLock}
        disabled={!isOwner}
        hint={!isOwner ? "owner" : undefined}
      />
      <div style={{ height: 1, background: T.border, margin: "4px 4px" }} />
      <Item icon={<Trash2 size={13} strokeWidth={1.75} />} label="Supprimer" onClick={onDelete}
            danger disabled={!isOwner} hint={!isOwner ? "owner" : undefined} />
    </div>,
    document.body
  );
}

function ProjectCard({
  project, currentUserId,
  isRenaming, isSelected, zoom = 1, onSelect,
  onOpen, onDelete, onMove, onMoveEnd, onResize, onResizeEnd,
  onContextMenu, onSubmitRename, onCancelRename,
}) {
  const dragState = useRef(null);
  const movedRef = useRef(false);
  const [draftName, setDraftName] = useState(project.name);

  useEffect(() => { if (isRenaming) setDraftName(project.name); }, [isRenaming, project.name]);

  const px = Number.isFinite(project.pos_x)  ? project.pos_x  : 80;
  const py = Number.isFinite(project.pos_y)  ? project.pos_y  : 80;
  const pw = Number.isFinite(project.width)  ? project.width  : 240;
  const ph = Number.isFinite(project.height) ? project.height : 140;

  const isOwner = project.owner_id === currentUserId;
  const locked = !!project.locked;

  const startDrag = (e) => {
    if (e.button !== 0) return;
    // SÃ©lectionne la carte au mousedown (pour les raccourcis), mÃªme verrouillÃ©e.
    onSelect?.();
    if (locked || isRenaming) return;
    e.stopPropagation();
    movedRef.current = false;
    dragState.current = {
      kind: "move", startX: e.clientX, startY: e.clientY,
      origX: px, origY: py,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const startResize = (e) => {
    if (e.button !== 0) return;
    if (locked) return;
    e.stopPropagation();
    e.preventDefault();
    dragState.current = {
      kind: "resize", startX: e.clientX, startY: e.clientY,
      origW: pw, origH: ph,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (e) => {
    const s = dragState.current;
    if (!s) return;
    // Les deltas Ã©cran sont divisÃ©s par le zoom pour rester cohÃ©rents en
    // coordonnÃ©es monde (la carte suit toujours le curseur).
    if (s.kind === "move") {
      const dx = (e.clientX - s.startX) / zoom;
      const dy = (e.clientY - s.startY) / zoom;
      if (Math.abs(e.clientX - s.startX) + Math.abs(e.clientY - s.startY) > 3) movedRef.current = true;
      const nx = s.origX + dx;
      const ny = s.origY + dy;
      s.lastX = nx; s.lastY = ny;
      onMove(nx, ny);
    } else {
      const nw = Math.max(160, s.origW + (e.clientX - s.startX) / zoom);
      const nh = Math.max(90,  s.origH + (e.clientY - s.startY) / zoom);
      s.lastW = nw; s.lastH = nh;
      onResize(nw, nh);
    }
  };

  const onPointerUp = () => {
    const s = dragState.current;
    if (s) {
      if (s.kind === "move") onMoveEnd(s.lastX ?? s.origX, s.lastY ?? s.origY);
      else                   onResizeEnd(s.lastW ?? s.origW, s.lastH ?? s.origH);
    }
    dragState.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  return (
    <div
      onPointerDown={startDrag}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => { if (isOwner && !locked) { e.stopPropagation(); /* lance rename via menu â€” alt: enable via dblclick */ } }}
      onClick={(e) => {
        e.stopPropagation();
        if (isRenaming) return;
        // Si on n'a pas glissÃ©, c'est un vrai clic â†’ ouvrir le projet.
        if (!movedRef.current) onOpen();
      }}
      style={{
        position: "absolute",
        left: px, top: py, width: pw, height: ph,
        background: project.color || T.white,
        border: `${isSelected ? 2 : 1}px solid ${isSelected ? T.text : (locked ? T.amber : T.border)}`,
        boxShadow: isSelected ? "var(--elev-hover)" : "var(--elev-rest)",
        borderRadius: "var(--radius-card)",
        cursor: locked ? "pointer" : "grab",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        userSelect: "none", touchAction: "none",
        transition: "box-shadow 120ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
    >
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Folder size={16} strokeWidth={1.75} color={locked ? T.amber : T.amber} />
          {isRenaming ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); onSubmitRename?.(draftName); }
                if (e.key === "Escape") { e.preventDefault(); onCancelRename?.(); }
              }}
              onBlur={() => onSubmitRename?.(draftName)}
              style={{
                flex: 1, padding: "3px 8px", border: "none", boxShadow: DA_FOCUS_RING,
                borderRadius: 999, fontSize: 13, fontWeight: 600,
                outline: "none", fontFamily: "inherit", color: T.text, background: DA_FIELD_BG, minWidth: 0,
              }}
            />
          ) : (
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {project.name}
            </div>
          )}
          {locked && (
            <span title="VerrouillÃ©" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "var(--radius-field)", background: `color-mix(in srgb, ${T.amber} 13%, transparent)`, color: T.amber, fontSize: 11 }}>
              ðŸ”’
            </span>
          )}
        </div>
        {!isOwner && (
          <span style={{ fontSize: 10, color: T.blue, background: `color-mix(in srgb, ${T.blue} 8%, transparent)`, padding: "2px 8px", borderRadius: 999, fontWeight: 600, alignSelf: "flex-start" }}>
            PartagÃ© avec vous
          </span>
        )}
        <div style={{ fontSize: 11, color: T.textMut, marginTop: "auto" }}>
          {locked ? "VerrouillÃ© â€” clic droit pour options" : "Clique pour ouvrir Â· clic droit pour menu"}
        </div>
      </div>

      {!locked && (
        <div
          onPointerDown={startResize}
          style={{
            position: "absolute", right: 0, bottom: 0, width: 14, height: 14,
            cursor: "nwse-resize",
            background: `linear-gradient(135deg, transparent 50%, ${T.textMut} 50%)`,
            opacity: 0.5, borderBottomRightRadius: 12,
          }}
        />
      )}
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   ProjectDetail : fichiers + membres + invitations
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ProjectDetail({ project, currentUserId, onProjectRenamed }) {
  const supabase = createClient();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDocId, setOpenDocId] = useState(null);
  const [signedUrls, setSignedUrls] = useState({}); // { fileId: url }
  const [selectedId, setSelectedId] = useState(null);
  // DerniÃ¨re carte sÃ©lectionnÃ©e ou bougÃ©e â†’ passe au-dessus des autres et perd
  // son contour pour un rendu "carte qu'on vient de saisir".
  const [topId, setTopId] = useState(null);
  const [lightboxFileId, setLightboxFileId] = useState(null); // image en plein Ã©cran
  // Dialogue de saisie in-app (remplace prompt() natif, KO sous Tauri).
  const [promptState, setPromptState] = useState(null);

  // â”€â”€â”€ Enregistrement audio (bouton Audio de la toolbar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [recordingAudio, setRecordingAudio] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);

  const canvasRef = useRef(null);

  // â”€â”€â”€ Menu contextuel (clic droit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [contextMenu, setContextMenu] = useState(null); // { x, y, fileId } | null
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  // Menu canvas (clic droit sur le fond) pour crÃ©er Note/Lien/VidÃ©o/TÃ¢che.
  const [canvasMenu, setCanvasMenu] = useState(null); // { x, y, worldX, worldY } | null
  const closeCanvasMenu = useCallback(() => setCanvasMenu(null), []);

  // â”€â”€â”€ Verrouillage local persistÃ© par projet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const LOCK_KEY = `tr4de.drive.locked.${project.id}`;
  const [lockedIds, setLockedIds] = useState(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(LOCK_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const toggleLock = (fileId) => {
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      try { window.localStorage.setItem(LOCK_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // â”€â”€â”€ Clipboard interne (cut/copy â†’ paste) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ref pour pouvoir le lire dans le handler paste sans recrÃ©er le listener.
  const internalClipboardRef = useRef(null); // { mode: "cut"|"copy", fileId }

  // â”€â”€â”€ Input cachÃ© pour "remplacer l'image" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const replaceInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const genericInputRef = useRef(null);
  const replaceTargetRef = useRef(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("drive_files")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setFiles(data || []);
    } catch (e) {
      console.error("[Drive] load files failed:", describeError(e), dumpError(e));
    } finally { setLoading(false); }
  }, [project.id, supabase]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // GÃ©nÃ¨re les signed URLs pour les images (lazy)
  useEffect(() => {
    const todo = files.filter(
      (f) => f.type === "file" && f.storage_path && (f.mime_type || "").startsWith("image/") && !signedUrls[f.id]
    );
    if (todo.length === 0) return;
    (async () => {
      const updates = {};
      for (const f of todo) {
        try {
          const { data, error } = await supabase.storage
            .from("drive_files")
            .createSignedUrl(f.storage_path, 3600);
          if (!error && data?.signedUrl) updates[f.id] = data.signedUrl;
        } catch {}
      }
      if (Object.keys(updates).length > 0) setSignedUrls((p) => ({ ...p, ...updates }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // TrÃ¨s grand monde + origine centrÃ©e : pan dans toutes les directions.
  const WORLD_W = 40000;
  const WORLD_H = 40000;
  const ORIGIN_X = WORLD_W / 2;
  const ORIGIN_Y = WORLD_H / 2;

  // Zoom du canvas (Ctrl+molette), persisté par projet.
  const ZOOM_KEY = `tr4de.drive.zoom.${project.id}`;
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const raw = window.localStorage.getItem(ZOOM_KEY);
      if (raw) {
        const z = parseFloat(raw);
        if (Number.isFinite(z) && z >= 0.25 && z <= 2) return z;
      }
    } catch {}
    return 1;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(ZOOM_KEY, String(zoom)); } catch {}
  }, [zoom, ZOOM_KEY]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const rect = el.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const worldX = (el.scrollLeft + mx) / zoom;
      const worldY = (el.scrollTop + my) / zoom;
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      const next = Math.max(0.25, Math.min(2, zoom * factor));
      setZoom(next);
      requestAnimationFrame(() => {
        if (!el) return;
        el.scrollLeft = worldX * next - mx;
        el.scrollTop  = worldY * next - my;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom]);

  // Au mount, restore la derniÃ¨re position de scroll pour ce projet
  // (sinon la vue se dÃ©cale par rapport Ã  ce que l'utilisateur voyait avant
  // reload, mÃªme si la position en DB est correcte).
  const SCROLL_KEY = `tr4de.drive.scroll.v2.${project.id}`;
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (initialScrollDone.current) return;
    const el = canvasRef.current;
    if (!el || loading) return;

    // On attend que le canvas soit reellement scrollable pour eviter de coller
    // au bord gauche du monde (sinon "pan uniquement vers la droite").
    const apply = () => {
      if (!el) return;
      if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth) {
        requestAnimationFrame(apply);
        return;
      }
      initialScrollDone.current = true;

      let restored = false;
      try {
        const raw = window.localStorage.getItem(SCROLL_KEY);
        if (raw) {
          const { x, y } = JSON.parse(raw);
          // Ignore (0,0) : etat sauvegarde avant que le canvas soit mesurable.
          if (Number.isFinite(x) && Number.isFinite(y) && (x > 100 || y > 100)) {
            el.scrollLeft = x;
            el.scrollTop  = y;
            restored = true;
          }
        }
      } catch {}
      if (restored) return;

      if (files.length > 0) {
        const cx = files.reduce((s, f) => s + ((Number.isFinite(f.pos_x) ? f.pos_x : 40) + (Number.isFinite(f.width)  ? f.width  : 240) / 2), 0) / files.length;
        const cy = files.reduce((s, f) => s + ((Number.isFinite(f.pos_y) ? f.pos_y : 40) + (Number.isFinite(f.height) ? f.height : 180) / 2), 0) / files.length;
        el.scrollLeft = Math.max(0, (ORIGIN_X + cx) * zoom - el.clientWidth / 2);
        el.scrollTop  = Math.max(0, (ORIGIN_Y + cy) * zoom - el.clientHeight / 2);
      } else {
        el.scrollLeft = ORIGIN_X * zoom - el.clientWidth / 2;
        el.scrollTop  = ORIGIN_Y * zoom - el.clientHeight / 2;
      }
    };
    apply();
  }, [loading, files, SCROLL_KEY]);

  // Sauvegarde le scroll (debounce) pour le restaurer au prochain reload.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let t = null;
    const onScroll = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try { window.localStorage.setItem(SCROLL_KEY, JSON.stringify({ x: el.scrollLeft, y: el.scrollTop })); } catch {}
      }, 200);
    };
    el.addEventListener("scroll", onScroll);
    return () => { el.removeEventListener("scroll", onScroll); if (t) clearTimeout(t); };
  }, [SCROLL_KEY]);

  // Position : trouve un emplacement au centre du viewport courant
  // (en coordonnÃ©es monde, donc en tenant compte du zoom).
  const nextPosition = () => {
    const el = canvasRef.current;
    const cx = el ? (el.scrollLeft + el.clientWidth / 2) / zoom - ORIGIN_X - 120 : 0;
    const cy = el ? (el.scrollTop  + el.clientHeight / 2) / zoom - ORIGIN_Y - 80  : 0;
    return {
      pos_x: cx + Math.round((Math.random() - 0.5) * 80),
      pos_y: cy + Math.round((Math.random() - 0.5) * 80),
    };
  };

  // â”€â”€â”€ PAN : clic-gauche sur le fond du canvas (ou middle-mouse) â†’ drag pour
  // dÃ©placer la vue (scroll). Si on n'a pas bougÃ©, on dÃ©sÃ©lectionne.
  const panState = useRef(null);
  const onCanvasPointerDown = (e) => {
    // Ignore si l'event vient d'une carte (les cartes stopPropagation).
    // Ici, e.target peut Ãªtre le fond ou la div monde â€” les deux sont OK.
    if (e.button !== 0 && e.button !== 1) return;
    const el = canvasRef.current;
    if (!el) return;
    panState.current = {
      startX: e.clientX, startY: e.clientY,
      startScrollX: el.scrollLeft, startScrollY: el.scrollTop,
      moved: false,
    };
    const onMove = (ev) => {
      if (!panState.current) return;
      const dx = ev.clientX - panState.current.startX;
      const dy = ev.clientY - panState.current.startY;
      if (!panState.current.moved && Math.abs(dx) + Math.abs(dy) > 3) {
        panState.current.moved = true;
        el.style.cursor = "grabbing";
      }
      if (panState.current.moved) {
        el.scrollLeft = panState.current.startScrollX - dx;
        el.scrollTop  = panState.current.startScrollY - dy;
      }
    };
    const onUp = () => {
      if (panState.current && !panState.current.moved) {
        setSelectedId(null);
      }
      panState.current = null;
      el.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Convertit des coords Ã©cran en coords du canvas "monde".
  const clientToWorld = (clientX, clientY) => {
    const el = canvasRef.current;
    if (!el) return { x: 100, y: 100 };
    const rect = el.getBoundingClientRect();
    return {
      x: el.scrollLeft + (clientX - rect.left),
      y: el.scrollTop  + (clientY - rect.top),
    };
  };
  const posFromAt = (at, fb) => at
    ? { pos_x: Math.round(at.x), pos_y: Math.round(at.y) }
    : { pos_x: fb.pos_x, pos_y: fb.pos_y };

  const createDoc = async (at) => {
    try {
      const { pos_x, pos_y } = posFromAt(at, nextPosition());
      const { data, error } = await supabase
        .from("drive_files")
        .insert({
          project_id: project.id,
          name: "Nouvelle note",
          type: "doc",
          content: "",
          created_by: currentUserId,
          pos_x, pos_y, width: 240, height: 180,
          color: "#FFFFFF",
        })
        .select()
        .single();
      if (error) throw error;
      setFiles((prev) => [...prev, data]);
    } catch (e) { notify("Échec", describeError(e)); }
  };

  // Lien / Vidéo : la saisie d'URL passe par un PromptDialog in-app (le prompt()
  // natif est indisponible sous Tauri). createLink/createVideo ouvrent le
  // dialogue ; insertLink/insertVideo font l'insertion une fois validé.
  const createLink = (at) => {
    setPromptState({
      kind: "link", at,
      title: "Ajouter un lien",
      label: "URL du lien",
      defaultValue: "https://",
      placeholder: "https://exemple.com",
      confirmLabel: "Ajouter",
    });
  };
  const insertLink = async (url, at) => {
    if (!url || !url.trim()) return;
    try {
      const { pos_x, pos_y } = posFromAt(at, nextPosition());
      const cleanUrl = url.trim();
      let displayName = cleanUrl;
      try { displayName = new URL(cleanUrl).hostname.replace(/^www\./, ""); } catch {}
      const { data, error } = await supabase
        .from("drive_files")
        .insert({
          project_id: project.id, name: displayName, type: "link",
          content: cleanUrl, created_by: currentUserId,
          pos_x, pos_y, width: 240, height: 90,
        })
        .select().single();
      if (error) throw error;
      setFiles((prev) => [...prev, data]);
    } catch (e) { notify("Échec", describeError(e)); }
  };

  const createVideo = (at) => {
    setPromptState({
      kind: "video", at,
      title: "Ajouter une vidéo",
      label: "URL de la vidéo (YouTube, Vimeo, .mp4…)",
      defaultValue: "https://",
      placeholder: "https://youtube.com/watch?v=…",
      confirmLabel: "Ajouter",
    });
  };
  const insertVideo = async (url, at) => {
    if (!url || !url.trim()) return;
    try {
      const { pos_x, pos_y } = posFromAt(at, nextPosition());
      const { data, error } = await supabase
        .from("drive_files")
        .insert({
          project_id: project.id, name: "Vidéo", type: "video",
          content: url.trim(), created_by: currentUserId,
          pos_x, pos_y, width: 320, height: 200,
        })
        .select().single();
      if (error) throw error;
      setFiles((prev) => [...prev, data]);
    } catch (e) { notify("Échec", describeError(e)); }
  };

  const createTask = async (at) => {
    try {
      const { pos_x, pos_y } = posFromAt(at, nextPosition());
      const { data, error } = await supabase
        .from("drive_files")
        .insert({
          project_id: project.id, name: "Nouvelle tÃ¢che", type: "task",
          content: "Nouvelle tÃ¢che", done: false, created_by: currentUserId,
          pos_x, pos_y, width: 240, height: 80, color: "#FFFFFF",
        })
        .select().single();
      if (error) throw error;
      setFiles((prev) => [...prev, data]);
    } catch (e) { notify("Échec", describeError(e)); }
  };

  // CrÃ©e une carte dessin vide. content = JSON {strokes:[{color,width,points:[[x,y],â€¦]}]}
  const createDraw = async (at) => {
    try {
      const { pos_x, pos_y } = posFromAt(at, nextPosition());
      const initial = JSON.stringify({ strokes: [] });
      const { data, error } = await supabase
        .from("drive_files")
        .insert({
          project_id: project.id, name: "Dessin", type: "draw",
          content: initial, created_by: currentUserId,
          pos_x, pos_y, width: 320, height: 240, color: "#FFFFFF",
        })
        .select().single();
      if (error) throw error;
      setFiles((prev) => [...prev, data]);
    } catch (e) { notify("Échec", describeError(e)); }
  };

  // Persiste les strokes d'une carte dessin (debounce 400 ms).
  const drawSaveTimers = useRef({});
  const persistDrawing = (id, strokes) => {
    if (drawSaveTimers.current[id]) clearTimeout(drawSaveTimers.current[id]);
    drawSaveTimers.current[id] = setTimeout(async () => {
      try {
        const content = JSON.stringify({ strokes });
        await supabase.from("drive_files")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", id);
      } catch (e) { console.error("[Drive] persist drawing failed:", e); }
    }, 400);
  };

  // CrÃ©e une carte audio en uploadant un Blob enregistrÃ© (webm/opus).
  const createAudioFromBlob = async (blob, at) => {
    try {
      const { pos_x, pos_y } = posFromAt(at, nextPosition());
      const { data: row, error: rowErr } = await supabase
        .from("drive_files")
        .insert({
          project_id: project.id, name: "Audio", type: "audio",
          mime_type: blob.type || "audio/webm",
          size_bytes: blob.size || null,
          created_by: currentUserId,
          pos_x, pos_y, width: 300, height: 90,
        })
        .select().single();
      if (rowErr) throw rowErr;

      const ext = (blob.type && blob.type.split("/")[1]?.split(";")[0]) || "webm";
      const path = `${project.id}/${row.id}/audio.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("drive_files")
        .upload(path, blob, { upsert: true, contentType: blob.type || "audio/webm" });
      if (upErr) {
        await supabase.from("drive_files").delete().eq("id", row.id);
        throw upErr;
      }
      const { data: updated, error: updErr } = await supabase
        .from("drive_files")
        .update({ storage_path: path })
        .eq("id", row.id).select().single();
      if (updErr) throw updErr;

      setFiles((prev) => [...prev, updated]);
    } catch (e) {
      console.error("[Drive] audio create failed:", describeError(e), dumpError(e));
      notify("Échec audio", describeError(e));
    }
  };

  const startAudioRecord = async () => {
    if (recordingAudio) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      notify("Audio indisponible", "L'enregistrement audio n'est pas supporté sur ce navigateur.", "warn");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        // libÃ¨re le micro
        try { audioStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
        audioStreamRef.current = null;
        await createAudioFromBlob(blob);
      };
      rec.start();
      mediaRecorderRef.current = rec;
      setRecordingAudio(true);
    } catch (e) {
      console.error("[Drive] mic permission denied:", e);
      notify("Micro inaccessible", e?.message || e);
    }
  };

  const stopAudioRecord = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    try { rec.stop(); } catch {}
    mediaRecorderRef.current = null;
    setRecordingAudio(false);
  };

  // Cleanup : si l'utilisateur change de projet pendant un enregistrement,
  // on coupe proprement le micro.
  useEffect(() => {
    return () => {
      try { mediaRecorderRef.current?.stop(); } catch {}
      try { audioStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    };
  }, []);

  // GÃ©nÃ¨re les signed URLs pour l'audio aussi (en plus des images).
  useEffect(() => {
    const todo = files.filter(
      (f) => f.type === "audio" && f.storage_path && !signedUrls[f.id]
    );
    if (todo.length === 0) return;
    (async () => {
      const updates = {};
      for (const f of todo) {
        try {
          const { data, error } = await supabase.storage
            .from("drive_files")
            .createSignedUrl(f.storage_path, 3600);
          if (!error && data?.signedUrl) updates[f.id] = data.signedUrl;
        } catch {}
      }
      if (Object.keys(updates).length > 0) setSignedUrls((p) => ({ ...p, ...updates }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const toggleTaskDone = async (file) => {
    const next = !file.done;
    updateCardLocal(file.id, { done: next });
    try {
      const { error } = await supabase
        .from("drive_files")
        .update({ done: next, updated_at: new Date().toISOString() })
        .eq("id", file.id);
      if (error) throw error;
    } catch (e) {
      console.error("[Drive] toggle task failed:", describeError(e), dumpError(e));
      updateCardLocal(file.id, { done: file.done });
    }
  };

  const uploadFiles = async (fileList, { silent = false } = {}) => {
    if (!fileList || fileList.length === 0) return;
    let offset = 0;
    for (const f of fileList) {
      try {
        const base = nextPosition();
        const isImg = (f.type || "").startsWith("image/");
        const { data: row, error: rowErr } = await supabase
          .from("drive_files")
          .insert({
            project_id: project.id,
            name: f.name,
            type: "file",
            mime_type: f.type || null,
            size_bytes: f.size || null,
            created_by: currentUserId,
            pos_x: base.pos_x + offset, pos_y: base.pos_y + offset,
            width: isImg ? 260 : 220, height: isImg ? 200 : 90,
          })
          .select().single();
        if (rowErr) throw rowErr;

        const path = `${project.id}/${row.id}/${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("drive_files")
          .upload(path, f, { upsert: true, contentType: f.type || undefined });
        if (upErr) {
          await supabase.from("drive_files").delete().eq("id", row.id);
          throw upErr;
        }

        const { data: updated, error: updErr } = await supabase
          .from("drive_files")
          .update({ storage_path: path })
          .eq("id", row.id)
          .select().single();
        if (updErr) throw updErr;

        setFiles((prev) => [...prev, updated]);
        offset += 24;
      } catch (e) {
        console.error("[Drive] upload failed:", describeError(e), dumpError(e));
        if (!silent) notify("Échec de l'import", `« ${f.name} » : ${describeError(e)}`);
      }
    }
  };

  const downloadFile = async (file) => {
    if (!file.storage_path) return;
    try {
      const { data, error } = await supabase.storage
        .from("drive_files")
        .createSignedUrl(file.storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e) { notify("Échec", describeError(e)); }
  };

  // Duplique un fichier (re-tÃ©lÃ©charge le blob et l'uploade dans une nouvelle row).
  const duplicateFile = async (file, { offset = 24 } = {}) => {
    try {
      const isImg = (file.mime_type || "").startsWith("image/");
      const newName = file.type === "file"
        ? file.name.replace(/(\.[^.]+)?$/, (m) => " (copie)" + (m || ""))
        : (file.name || "Sans titre") + " (copie)";

      const { data: row, error: rowErr } = await supabase
        .from("drive_files")
        .insert({
          project_id: project.id,
          name: newName,
          type: file.type,
          mime_type: file.mime_type || null,
          size_bytes: file.size_bytes || null,
          content: file.content || null,
          color: file.color || null,
          created_by: currentUserId,
          pos_x: (Number.isFinite(file.pos_x) ? file.pos_x : 40) + offset,
          pos_y: (Number.isFinite(file.pos_y) ? file.pos_y : 40) + offset,
          width: file.width || (isImg ? 260 : 240),
          height: file.height || (isImg ? 200 : 180),
        })
        .select().single();
      if (rowErr) throw rowErr;

      let updated = row;
      if (file.storage_path) {
        // Copie storage : download puis re-upload sous un nouveau path.
        const { data: blob, error: dlErr } = await supabase.storage
          .from("drive_files").download(file.storage_path);
        if (dlErr) throw dlErr;
        const path = `${project.id}/${row.id}/${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("drive_files")
          .upload(path, blob, { upsert: true, contentType: file.mime_type || undefined });
        if (upErr) {
          await supabase.from("drive_files").delete().eq("id", row.id);
          throw upErr;
        }
        const { data: u, error: updErr } = await supabase
          .from("drive_files")
          .update({ storage_path: path })
          .eq("id", row.id).select().single();
        if (updErr) throw updErr;
        updated = u;
      }
      setFiles((prev) => [...prev, updated]);
      return updated;
    } catch (e) {
      console.error("[Drive] duplicate failed:", describeError(e), dumpError(e));
      notify("Échec duplication", describeError(e));
      return null;
    }
  };

  // Remplace le storage d'un fichier existant en gardant la mÃªme row (donc mÃªme position).
  const replaceFileContent = async (file, newFile) => {
    try {
      const oldPath = file.storage_path;
      const newPath = `${project.id}/${file.id}/${newFile.name}`;
      if (oldPath && oldPath !== newPath) {
        await supabase.storage.from("drive_files").remove([oldPath]).catch(() => {});
      }
      const { error: upErr } = await supabase.storage
        .from("drive_files")
        .upload(newPath, newFile, { upsert: true, contentType: newFile.type || undefined });
      if (upErr) throw upErr;

      const { data: updated, error: updErr } = await supabase
        .from("drive_files")
        .update({
          storage_path: newPath,
          name: newFile.name,
          mime_type: newFile.type || null,
          size_bytes: newFile.size || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", file.id)
        .select().single();
      if (updErr) throw updErr;

      // Force le re-signe de l'URL en supprimant l'ancienne.
      setSignedUrls((p) => { const n = { ...p }; delete n[file.id]; return n; });
      setFiles((prev) => prev.map((x) => x.id === file.id ? updated : x));
    } catch (e) {
      console.error("[Drive] replace failed:", describeError(e), dumpError(e));
      notify("Échec remplacement", describeError(e));
    }
  };

  const deleteFile = async (file) => {
    try {
      if (file.storage_path) {
        await supabase.storage.from("drive_files").remove([file.storage_path]).catch(() => {});
      }
      const { error } = await supabase.from("drive_files").delete().eq("id", file.id);
      if (error) throw error;
      setFiles((prev) => prev.filter((x) => x.id !== file.id));
      if (selectedId === file.id) setSelectedId(null);
    } catch (e) { notify("Échec", describeError(e)); }
  };

  // Persistance de la position (debounce par carte)
  const posTimers = useRef({});
  const persistPosition = (id, pos_x, pos_y, width, height) => {
    if (posTimers.current[id]) clearTimeout(posTimers.current[id]);
    posTimers.current[id] = setTimeout(async () => {
      // Patch dynamique : on n'envoie que les champs finis (Ã©vite NaN/undefined).
      const patch = { updated_at: new Date().toISOString() };
      if (Number.isFinite(pos_x))  patch.pos_x  = Math.round(pos_x);
      if (Number.isFinite(pos_y))  patch.pos_y  = Math.round(pos_y);
      if (Number.isFinite(width))  patch.width  = Math.round(width);
      if (Number.isFinite(height)) patch.height = Math.round(height);

      const { error } = await supabase
        .from("drive_files")
        .update(patch)
        .eq("id", id);
      if (error) {
        console.error("[Drive] position update failed:", describeError(error), dumpError(error));
        const msg = describeError(error);
        if (/pos_x|pos_y/i.test(msg)) {
          notify("Migration manquante", "Migration 024_drive_canvas.sql manquante — les colonnes pos_x/pos_y n'existent pas en DB.", "warn");
        }
      }
    }, 300);
  };

  const updateCardLocal = (id, patch) => {
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  };

  const openDoc = files.find((f) => f.id === openDocId) || null;

  // Drop natif depuis l'explorateur sur le canvas
  const onCanvasDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
  const onCanvasDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) uploadFiles(dropped);
  };

  // Ctrl+V / Cmd+V : colle fichiers ou images depuis le presse-papier.
  // Ignore le paste si l'utilisateur Ã©dite un champ (note ouverte, renameâ€¦).
  useEffect(() => {
    const onPaste = async (e) => {
      if (openDocId) return;
      const ae = document.activeElement;
      const tag = ae?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || ae?.isContentEditable) return;

      // 1) Clipboard interne (cut/copy depuis le menu contextuel) â†’ duplique.
      const clip = internalClipboardRef.current;
      if (clip?.file) {
        e.preventDefault();
        const src = clip.file;
        await duplicateFile(src);
        if (clip.mode === "cut") {
          try {
            if (src.storage_path) {
              await supabase.storage.from("drive_files").remove([src.storage_path]).catch(() => {});
            }
            await supabase.from("drive_files").delete().eq("id", src.id);
            setFiles((prev) => prev.filter((x) => x.id !== src.id));
          } catch (err) { console.error("[Drive] cut cleanup failed:", err); }
          internalClipboardRef.current = null;
        }
        return;
      }

      const cd = e.clipboardData;
      if (!cd) return;

      const filesFromClipboard = Array.from(cd.files || []);
      const itemsAsFiles = [];
      if (filesFromClipboard.length === 0 && cd.items) {
        for (const it of cd.items) {
          if (it.kind === "file") {
            const f = it.getAsFile();
            if (f) itemsAsFiles.push(f);
          }
        }
      }
      const toUpload = filesFromClipboard.length > 0 ? filesFromClipboard : itemsAsFiles;
      if (toUpload.length === 0) return;

      e.preventDefault();
      // Renomme les captures gÃ©nÃ©riques ("image.png") pour Ã©viter les collisions.
      const named = toUpload.map((f) => {
        if (f.name && f.name !== "image.png") return f;
        const ext = (f.type && f.type.split("/")[1]) || "png";
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        return new File([f], `collage-${ts}.${ext}`, { type: f.type });
      });
      uploadFiles(named, { silent: true });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, openDocId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      {/* Input cachÃ© : "remplacer l'image/le fichier" depuis le menu contextuel. */}
      <input
        ref={replaceInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={(e) => {
          const newFile = e.target.files?.[0];
          const target = replaceTargetRef.current;
          if (newFile && target) replaceFileContent(target, newFile);
          replaceTargetRef.current = null;
          e.target.value = "";
        }}
      />

      {/* Input cachÃ© : "Image" depuis la toolbar (multi, images uniquement). */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          if (picked.length > 0) uploadFiles(picked);
          e.target.value = "";
        }}
      />

      {/* Input cachÃ© : "Importer" (tout type de fichier, multi) â€” empty state. */}
      <input
        ref={genericInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          if (picked.length > 0) uploadFiles(picked);
          e.target.value = "";
        }}
      />

      {/* Toolbar flottante : reprend toutes les actions du clic droit + dessin/audio */}
      <DriveToolbar
        recordingAudio={recordingAudio}
        onAddImage={() => imageInputRef.current?.click()}
        onAddNote={() => createDoc()}
        onAddLink={() => createLink()}
        onAddVideo={() => createVideo()}
        onAddTask={() => createTask()}
        onAddDraw={() => createDraw()}
        onToggleAudio={() => recordingAudio ? stopAudioRecord() : startAudioRecord()}
      />

      {/* Canvas */}
      <div
        ref={canvasRef}
        onDragOver={onCanvasDragOver}
        onDrop={onCanvasDrop}
        onPointerDown={onCanvasPointerDown}
        onContextMenu={(e) => {
          // Si la cible est une carte, le menu carte gÃ¨re ; ici on cible le fond.
          if (e.target.closest("[data-tr4de-card]")) return;
          e.preventDefault();
          const world = clientToWorld(e.clientX, e.clientY);
          setCanvasMenu({ x: e.clientX, y: e.clientY, worldX: world.x, worldY: world.y });
        }}
        style={{
          flex: 1, position: "relative", overflow: "auto",
          background: `
            radial-gradient(circle, color-mix(in srgb, ${T.border2} 33%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
          backgroundColor: "var(--color-hover-bg, #F0F0F0)",
          cursor: "grab",
        }}
      >
        {/* zone "monde" : grand canvas pour avoir de la place.
            Outer wrapper dimensionne la scroll-area en fonction du zoom. */}
        <div style={{ position: "relative", width: WORLD_W * zoom, height: WORLD_H * zoom }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: WORLD_W, height: WORLD_H, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
          {loading && (
            <div role="status" aria-label="Chargement du canvas" style={{ position: "absolute", top: ORIGIN_Y - 100, left: ORIGIN_X - 140, display: "flex", gap: 16 }}>
              {[0, 1].map((i) => (
                <div key={i} className="anim-shimmer" style={{ width: 240, height: 180, borderRadius: 10 }} />
              ))}
            </div>
          )}
          {!loading && files.length === 0 && (
            <div style={{ position: "absolute", top: ORIGIN_Y - 60, left: ORIGIN_X - 240, width: 480, textAlign: "center", color: T.textSub, fontSize: 13, pointerEvents: "none" }}>
              <div>Canvas vide â€” glisse des fichiers ici, ou utilise <strong>Image</strong> / <strong>Note</strong> dans la barre d'outils.</div>
              <div style={{ marginTop: 14, pointerEvents: "auto", display: "inline-flex" }}>
                <button
                  onClick={() => genericInputRef.current?.click()}
                  style={{ padding: "8px 16px", minHeight: 34, borderRadius: 999, background: T.text, border: `1px solid ${T.text}`, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <Upload size={15} strokeWidth={1.75} /> Importer un fichier
                </button>
              </div>
            </div>
          )}
          {/* Wrapper offset : (0,0) = centre logique du monde, pan dans toutes les directions */}
          <div style={{ position: "absolute", left: ORIGIN_X, top: ORIGIN_Y, width: 0, height: 0 }}>
          {files.map((f) => (
            <CanvasCard
              key={f.id}
              file={f}
              zoom={zoom}
              selected={selectedId === f.id}
              isTop={topId === f.id}
              locked={lockedIds.has(f.id)}
              previewUrl={signedUrls[f.id]}
              onSelect={(e) => { e.stopPropagation(); setSelectedId(f.id); setTopId(f.id); }}
              onOpen={() => {
                if (f.type === "doc" || f.type === "task") setOpenDocId(f.id);
                else if (f.type === "link" || f.type === "video") {
                  if (f.content) window.open(f.content, "_blank", "noopener");
                }
                else if (f.type === "file") {
                  const isImg = (f.mime_type || "").startsWith("image/");
                  if (isImg) setLightboxFileId(f.id);
                  else downloadFile(f);
                }
              }}
              onToggleDone={() => toggleTaskDone(f)}
              onDrawingChange={(strokes) => { updateCardLocal(f.id, { content: JSON.stringify({ strokes }) }); persistDrawing(f.id, strokes); }}
              audioUrl={signedUrls[f.id]}
              onDelete={() => deleteFile(f)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedId(f.id);
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({ x: e.clientX, y: e.clientY, fileId: f.id, cardRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } });
              }}
              onMove={(nx, ny) => { setTopId(f.id); updateCardLocal(f.id, { pos_x: nx, pos_y: ny }); }}
              onMoveEnd={(nx, ny) => persistPosition(f.id, nx, ny, f.width, f.height)}
              onResize={(nw, nh) => updateCardLocal(f.id, { width: nw, height: nh })}
              onResizeEnd={(nw, nh) => persistPosition(f.id, f.pos_x, f.pos_y, nw, nh)}
            />
          ))}
          </div>{/* /offset wrapper */}
        </div>
        </div>{/* /scroll-size wrapper */}
      </div>

      {openDoc && (
        <DocEditor
          doc={openDoc}
          onClose={() => setOpenDocId(null)}
          onSaved={(content) => updateCardLocal(openDoc.id, { content })}
          onRenamed={(name) => updateCardLocal(openDoc.id, { name })}
        />
      )}

      {lightboxFileId && (() => {
        const f = files.find((x) => x.id === lightboxFileId);
        if (!f) return null;
        const url = signedUrls[f.id];
        return (
          <ImageLightbox
            url={url}
            alt={f.name}
            onClose={() => setLightboxFileId(null)}
            onDownload={() => downloadFile(f)}
          />
        );
      })()}

      {contextMenu && (() => {
        const f = files.find((x) => x.id === contextMenu.fileId);
        if (!f) return null;
        const isImg = (f.mime_type || "").startsWith("image/");
        const isFileLike = f.type === "file";
        const isLocked = lockedIds.has(f.id);
        const item = (icon, label, onClick, opts = {}) => (
          <button
            key={label}
            disabled={opts.disabled}
            onClick={() => { closeContextMenu(); onClick(); }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 12px", width: "100%",
              background: "transparent", border: "none", textAlign: "left",
              fontSize:12, color: opts.danger ? T.red : (opts.disabled ? T.textMut : T.text),
              cursor: opts.disabled ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { if (!opts.disabled) e.currentTarget.style.background = T.accentBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {icon} <span style={{ flex: 1 }}>{label}</span>
            {opts.shortcut && <span style={{ fontSize: 10, color: T.textMut }}>{opts.shortcut}</span>}
          </button>
        );
        return (
          <ContextMenuPortal x={contextMenu.x} y={contextMenu.y} cardRect={contextMenu.cardRect} onClose={closeContextMenu}>
            {item(<Scissors size={13} strokeWidth={1.75} />, "Couper", () => {
              internalClipboardRef.current = { mode: "cut", file: f };
            }, { shortcut: "Ctrl+X" })}
            {item(<Copy size={13} strokeWidth={1.75} />, "Copier", () => {
              internalClipboardRef.current = { mode: "copy", file: f };
            }, { shortcut: "Ctrl+C" })}
            {item(<FilesIcon size={13} strokeWidth={1.75} />, "Dupliquer", () => duplicateFile(f))}
            {item(<Trash2 size={13} strokeWidth={1.75} />, "Supprimer", () => deleteFile(f), { danger: true })}
            <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
            {item(<RefreshCw size={13} strokeWidth={1.75} />, isImg ? "Remplacer l'image" : "Remplacer le fichier", () => {
              replaceTargetRef.current = f;
              replaceInputRef.current?.click();
            }, { disabled: !isFileLike })}
            {item(<Download size={13} strokeWidth={1.75} />, isImg ? "TÃ©lÃ©charger l'image originale" : "TÃ©lÃ©charger", () => downloadFile(f), { disabled: !isFileLike || !f.storage_path })}
            <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
            {item(isLocked ? <Unlock size={13} strokeWidth={1.75} /> : <Lock size={13} strokeWidth={1.75} />, isLocked ? "DÃ©verrouiller" : "Verrouiller", () => toggleLock(f.id))}
          </ContextMenuPortal>
        );
      })()}

      {canvasMenu && (() => {
        const at = { x: canvasMenu.worldX, y: canvasMenu.worldY };
        const item = (icon, label, onClick) => (
          <button
            key={label}
            onClick={() => { closeCanvasMenu(); onClick(); }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 12px", width: "100%",
              background: "transparent", border: "none", textAlign: "left",
              fontSize:12, color: T.text, cursor: "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {icon} <span style={{ flex: 1 }}>{label}</span>
          </button>
        );
        return (
          <ContextMenuPortal x={canvasMenu.x} y={canvasMenu.y} onClose={closeCanvasMenu}>
            <div style={{ padding: "4px 12px 6px", fontSize: 10, color: T.textMut, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Ajouter ici
            </div>
            {item(<FileText size={13} strokeWidth={1.75} color={T.blue} />, "Note", () => createDoc(at))}
            {item(<LinkIcon size={13} strokeWidth={1.75} />, "Lien", () => createLink(at))}
            {item(<Video size={13} strokeWidth={1.75} />, "VidÃ©o", () => createVideo(at))}
            {item(<ListTodo size={13} strokeWidth={1.75} />, "TÃ¢che", () => createTask(at))}
            {item(<Pencil size={13} strokeWidth={1.75} />, "Dessin", () => createDraw(at))}
            {item(<Mic size={13} strokeWidth={1.75} color={recordingAudio ? T.red : undefined} />, recordingAudio ? "ArrÃªter l'enregistrement" : "Audio", () => recordingAudio ? stopAudioRecord() : startAudioRecord())}
          </ContextMenuPortal>
        );
      })()}

      {promptState && (
        <PromptDialog
          title={promptState.title}
          label={promptState.label}
          defaultValue={promptState.defaultValue}
          placeholder={promptState.placeholder}
          confirmLabel={promptState.confirmLabel}
          onCancel={() => setPromptState(null)}
          onSubmit={(value) => {
            const { kind, at } = promptState;
            setPromptState(null);
            if (kind === "link") insertLink(value, at);
            else if (kind === "video") insertVideo(value, at);
          }}
        />
      )}
    </div>
  );
}

/* â”€â”€â”€ Toolbar flottante du canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function DriveToolbar({ recordingAudio, onAddImage, onAddNote, onAddLink, onAddVideo, onAddTask, onAddDraw, onToggleAudio }) {
  const Btn = ({ icon: Icon, label, onClick, active, danger }) => (
    <button
      onClick={onClick}
      title={label}
      style={{
        height: 36, padding: "0 10px", borderRadius: "var(--radius-card)",
        background: active ? (danger ? T.red : T.text) : "transparent",
        border: "none",
        color: active ? "#fff" : T.text,
        cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500,
        display: "inline-flex", alignItems: "center", gap: 6,
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.accentBg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon size={15} strokeWidth={1.75} /> <span>{label}</span>
    </button>
  );
  const Sep = () => <div style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />;

  // Position dÃ©plaÃ§able : null = centrÃ© par dÃ©faut (top), sinon coords px relatives au conteneur.
  const STORAGE_KEY = "drive.toolbar.pos";
  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return v;
    } catch {}
    return null;
  });
  const rootRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !pos) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {}
  }, [pos]);

  const onGripDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = rootRef.current;
    const parent = el?.offsetParent;
    if (!el || !parent) return;
    const elRect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const startLeft = elRect.left - parentRect.left;
    const startTop = elRect.top - parentRect.top;
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: startLeft, origY: startTop,
      w: elRect.width, h: elRect.height,
      pw: parentRect.width, ph: parentRect.height,
    };
    setPos({ x: startLeft, y: startTop });
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
  };
  const onDragMove = (e) => {
    const s = dragRef.current;
    if (!s) return;
    let nx = s.origX + (e.clientX - s.startX);
    let ny = s.origY + (e.clientY - s.startY);
    nx = Math.max(4, Math.min(s.pw - s.w - 4, nx));
    ny = Math.max(4, Math.min(s.ph - s.h - 4, ny));
    setPos({ x: nx, y: ny });
  };
  const onDragUp = () => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
  };

  const posStyle = pos
    ? { left: pos.x, top: pos.y, transform: "none" }
    : { top: 12, left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      style={{
        position: "absolute", ...posStyle,
        zIndex: 10,
        background: T.white, border: `1px solid ${T.border}`,
        borderRadius: "var(--radius-card)", boxShadow: "var(--elev-hover)",
        padding: 4, display: "inline-flex", alignItems: "center", gap: 2,
      }}
    >
      <div
        onPointerDown={onGripDown}
        title="DÃ©placer la barre d'outils"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          height: 36, width: 20, cursor: "grab", color: T.textMut,
          borderRadius: 6,
        }}
      >
        <GripVertical size={14} strokeWidth={1.75} />
      </div>
      {/* Bouton Image â€” action principale, mis en avant (plus grand, accentuÃ©). */}
      <button
        onClick={onAddImage}
        title="Ajouter une image"
        style={{
          height: 44, padding: "0 16px", borderRadius: 10,
          background: T.text, color: "#fff", border: "none",
          cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 8,
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
          transition: "transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        }}
        onMouseEnter={(e) => { if (!hasFinePointer()) return; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.18)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.12)"; }}
      >
        <ImageIcon size={20} strokeWidth={2} />
        <span>Image</span>
      </button>
      <Sep />
      <Btn icon={FileText} label="Note" onClick={onAddNote} />
      <Btn icon={LinkIcon} label="Lien" onClick={onAddLink} />
      <Btn icon={Video} label="VidÃ©o" onClick={onAddVideo} />
      <Btn icon={ListTodo} label="TÃ¢che" onClick={onAddTask} />
      <Sep />
      <Btn icon={Pencil} label="Dessin" onClick={onAddDraw} />
      <Btn icon={Mic} label={recordingAudio ? "ArrÃªter" : "Audio"} onClick={onToggleAudio} active={recordingAudio} danger />
    </div>
  );
}

// Petit conteneur de menu contextuel ancrÃ© aux coords Ã©cran, fermant au clic
// extÃ©rieur ou Escape.
function ContextMenuPortal({ x, y, cardRect, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDocDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamp dans la fenÃªtre pour Ã©viter de sortir Ã  droite/en bas.
  const W = 240, H = 320;
  const vw = typeof window !== "undefined" ? window.innerWidth  : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  let left, top;
  if (cardRect) {
    const GAP = 6;
    const placeRight = cardRect.right + GAP + W <= vw;
    left = placeRight ? cardRect.right + GAP : cardRect.left - W - GAP;
    top  = cardRect.top;
  } else {
    left = x;
    top  = y;
  }
  left = Math.max(8, Math.min(left, vw - W - 8));
  top  = Math.max(8, Math.min(top,  vh - H - 8));

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed", left, top, zIndex: 2000,
        background: T.white, border: "none",
        borderRadius: 10, boxShadow: "var(--elev-overlay)",
        padding: 4, minWidth: 220,
        fontFamily: "var(--font-sans)",
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/* â”€â”€â”€ Canvas Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   Une carte draggable / resizable sur le canvas.
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function CanvasCard({ file, zoom = 1, selected, isTop, locked, previewUrl, audioUrl, onSelect, onOpen, onDelete, onToggleDone, onDrawingChange, onContextMenu, onMove, onMoveEnd, onResize, onResizeEnd }) {
  const dragState = useRef(null);
  // Fallbacks dÃ©fensifs : si la migration 024 n'a pas tournÃ©, pos_x/y/width/height
  // peuvent Ãªtre undefined â†’ on Ã©vite NaN dans left/top.
  const px = Number.isFinite(file.pos_x)  ? file.pos_x  : 40;
  const py = Number.isFinite(file.pos_y)  ? file.pos_y  : 40;
  const pw = Number.isFinite(file.width)  ? file.width  : 240;
  const ph = Number.isFinite(file.height) ? file.height : 180;

  const startDrag = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(e);
    if (locked) return; // VerrouillÃ©e : on sÃ©lectionne mais on n'amorce pas le drag.
    dragState.current = {
      kind: "move",
      startX: e.clientX, startY: e.clientY,
      origX: px, origY: py,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const startResize = (e) => {
    if (e.button !== 0 || locked) return;
    e.stopPropagation();
    e.preventDefault();
    dragState.current = {
      kind: "resize",
      startX: e.clientX, startY: e.clientY,
      origW: pw, origH: ph,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (e) => {
    const s = dragState.current;
    if (!s) return;
    // Les deltas Ã©cran sont divisÃ©s par le zoom pour rester cohÃ©rents en
    // coordonnÃ©es monde (la carte suit toujours le curseur sous le zoom).
    if (s.kind === "move") {
      const nx = s.origX + (e.clientX - s.startX) / zoom;
      const ny = s.origY + (e.clientY - s.startY) / zoom;
      s.lastX = nx; s.lastY = ny;
      onMove(nx, ny);
    } else if (s.kind === "resize") {
      const nw = Math.max(120, s.origW + (e.clientX - s.startX) / zoom);
      const nh = Math.max(80,  s.origH + (e.clientY - s.startY) / zoom);
      s.lastW = nw; s.lastH = nh;
      onResize(nw, nh);
    }
  };

  const onPointerUp = () => {
    const s = dragState.current;
    if (s) {
      // Utilise la DERNIÃˆRE position vue dans onPointerMove (pas les fallbacks
      // px/py qui sont capturÃ©s au render et donc stale).
      if (s.kind === "move") onMoveEnd(s.lastX ?? s.origX, s.lastY ?? s.origY);
      else if (s.kind === "resize") onResizeEnd(s.lastW ?? s.origW, s.lastH ?? s.origH);
    }
    dragState.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const isImage = file.type === "file" && (file.mime_type || "").startsWith("image/");
  const isDoc = file.type === "doc";
  const isLink = file.type === "link";
  const isVideo = file.type === "video";
  const isTask = file.type === "task";
  const isDraw = file.type === "draw";
  const isAudio = file.type === "audio";
  // Notes et tÃ¢ches : toujours fond blanc (on ignore `color` Ã©ventuellement
  // stockÃ© en base par d'anciennes crÃ©ations colorÃ©es).
  const bg = (isDoc || isTask) ? T.white : (file.color || T.white);

  return (
    <div
      data-tr4de-card="1"
      onPointerDown={startDrag}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => { e.stopPropagation(); onOpen(); }}
      style={{
        position: "absolute",
        left: px, top: py,
        width: pw, height: ph,
        background: bg,
        // Pas de bordure pour la carte au-dessus / derniÃ¨rement bougÃ©e : elle se
        // dÃ©tache dÃ©jÃ  visuellement via son ombre, le ring devient superflu.
        border: isTop
          ? "1px solid transparent"
          : `1px solid ${locked ? T.amber : (selected ? T.text : T.border)}`,
        boxShadow: isTop
          ? "var(--elev-hover)"
          : (selected ? "var(--elev-hover)" : "var(--elev-rest)"),
        borderRadius: 10,
        cursor: locked ? "default" : "grab",
        zIndex: isTop ? 5 : 1,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {locked && (
        <div
          title="VerrouillÃ©e"
          style={{
            position: "absolute", top: 6, left: 6, zIndex: 3,
            width: 18, height: 18, borderRadius: 999,
            background: "rgba(245,158,11,0.95)",
            color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Lock size={10} strokeWidth={2.25} />
        </div>
      )}
      {/* Header â€” cachÃ© pour les images, on affiche juste le bouton supprimer en coin */}
      {isImage ? (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Supprimer"
          style={{
            position: "absolute", top: 6, right: 6, zIndex: 2,
            width: 20, height: 20,
            background: "rgba(0,0,0,0.45)", border: "none",
            color: "#fff", cursor: "pointer", padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            borderRadius: 999,
            opacity: selected ? 1 : 0,
            transition: "opacity 120ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = selected ? 1 : 0; }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 8px",
          borderBottom: `1px solid ${T.border}`,
          background: "transparent",
          color: T.text,
          position: "relative",
          zIndex: 2,
        }}>
          {isDoc   ? <FileText size={12} strokeWidth={1.75} color={T.blue} /> :
           isLink  ? <LinkIcon size={12} strokeWidth={1.75} color={T.blue} /> :
           isVideo ? <Video    size={12} strokeWidth={1.75} color={T.red} /> :
           isTask  ? <ListTodo size={12} strokeWidth={1.75} color={T.green} /> :
           isDraw  ? <Pencil   size={12} strokeWidth={1.75} color={T.text} /> :
           isAudio ? <Mic      size={12} strokeWidth={1.75} color={T.red} /> :
           <FileIcon size={12} strokeWidth={1.75} color={T.textSub} />}
          <div style={{ flex: 1 }} />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Supprimer"
            style={{
              width: 18, height: 18, background: "transparent", border: "none",
              color: T.textMut, cursor: "pointer", padding: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-field)",
            }}
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Body */}
      {isImage ? (
        previewUrl ? (
          <img
            src={previewUrl}
            alt={file.name}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMut, fontSize: 11 }}>
            chargementâ€¦
          </div>
        )
      ) : isDoc ? (
        <div style={{ flex: 1, padding: 10, fontSize: 11, color: T.textSub, lineHeight: 1.4, overflow: "hidden", whiteSpace: "pre-wrap" }}>
          {(file.content && file.content.trim()) || <span style={{ color: T.textMut, fontStyle: "italic" }}>Note vide â€” double-clic pour Ã©diter</span>}
        </div>
      ) : isLink ? (
        (() => {
          const preview = getLinkPreviewImage(file.content);
          const isYt = !!getYouTubeId(file.content);
          return (
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {/* AperÃ§u : miniature YouTube ou favicon site */}
              <div style={{
                width: isYt ? "42%" : 64,
                minWidth: isYt ? "42%" : 64,
                background: "var(--color-hover-bg, #F0F0F0)",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
                borderRight: `1px solid ${T.border}`,
              }}>
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    draggable={false}
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    style={{
                      width: isYt ? "100%" : 32,
                      height: isYt ? "100%" : 32,
                      objectFit: isYt ? "cover" : "contain",
                      display: "block",
                    }}
                  />
                ) : (
                  <LinkIcon size={20} strokeWidth={1.5} color={T.textMut} />
                )}
              </div>
              {/* Texte */}
              <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, overflow: "hidden", minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 10, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.content}
                </div>
              </div>
            </div>
          );
        })()
      ) : isVideo ? (
        (() => {
          const embedUrl = getVideoEmbedUrl(file.content);
          if (embedUrl) {
            return (
              <iframe
                src={embedUrl}
                title={file.name || "video"}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                style={{ flex: 1, border: "none", width: "100%", height: "100%", pointerEvents: selected ? "auto" : "none" }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            );
          }
          return (
            <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, background: "#0D0D0D", color: "#fff" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
                <Video size={12} strokeWidth={1.75} /> VidÃ©o
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.content}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>double-clic pour ouvrir</div>
            </div>
          );
        })()
      ) : isTask ? (
        <div style={{ flex: 1, padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleDone?.(); }}
            title={file.done ? "Marquer comme Ã  faire" : "Marquer comme fait"}
            style={{ width: 22, height: 22, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: file.done ? T.green : T.textSub, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            {file.done ? <CheckSquare size={18} strokeWidth={1.75} /> : <Square size={18} strokeWidth={1.75} />}
          </button>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: file.done ? T.textMut : T.text, textDecoration: file.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(file.content && file.content.trim()) || <span style={{ color: T.textMut, fontStyle: "italic" }}>TÃ¢che vide</span>}
          </div>
        </div>
      ) : isDraw ? (
        <DrawSurface
          content={file.content}
          locked={locked}
          onChange={onDrawingChange}
        />
      ) : isAudio ? (
        <AudioPlayer url={audioUrl} />
      ) : (
        <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
          <div style={{ fontSize: 10, color: T.textMut }}>{file.mime_type || "Fichier"}</div>
          <div style={{ fontSize: 10, color: T.textMut }}>{fmtSize(file.size_bytes)}</div>
          <div style={{ fontSize: 10, color: T.blue, marginTop: 4 }}>double-clic pour tÃ©lÃ©charger</div>
        </div>
      )}

      {/* Resize handle */}
      {!locked && (
        <div
          onPointerDown={startResize}
          style={{
            position: "absolute", right: 0, bottom: 0,
            width: 14, height: 14,
            cursor: "nwse-resize",
            background: `linear-gradient(135deg, transparent 50%, ${selected ? T.text : T.textMut} 50%)`,
            opacity: 0.6,
            borderBottomRightRadius: 10,
            zIndex: 3,
          }}
        />
      )}
    </div>
  );
}

function ToolbarBtn({ icon: Icon, label, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 12px", height: 30, borderRadius: "var(--radius-card)",
        background: primary ? T.text : T.white,
        border: `1px solid ${primary ? T.text : T.border}`,
        color: primary ? "#fff" : T.text,
        fontSize:12, fontWeight: 500, cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      <Icon size={13} strokeWidth={1.75} /> {label}
    </button>
  );
}

/* â”€â”€â”€ Image Lightbox : aperÃ§u plein Ã©cran avec fond assombri â”€â”€â”€â”€â”€â”€â”€ */
function ImageLightbox({ url, alt, onClose, onDownload }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32,
        animation: "tr4de-lightbox-in 140ms ease-out",
      }}
    >
      <style>{`@keyframes tr4de-lightbox-in { from { opacity: 0 } to { opacity: 1 } }`}</style>

      {/* Bouton fermer */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Fermer (Ã‰chap)"
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 2,
          width: 34, height: 34, borderRadius: 999,
          background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.22)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
      >
        <X size={16} strokeWidth={1.75} />
      </button>

      {/* Bouton tÃ©lÃ©charger */}
      {onDownload && (
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
          title="TÃ©lÃ©charger l'image originale"
          style={{
            position: "absolute", top: 16, right: 60, zIndex: 2,
            height: 34, padding: "8px 16px", borderRadius: 999,
            background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 500,
            fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.22)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
        >
          <Download size={13} strokeWidth={1.75} /> TÃ©lÃ©charger
        </button>
      )}

      {/* Image */}
      {url ? (
        <img
          src={url}
          alt={alt || ""}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
          style={{
            maxWidth: "100%", maxHeight: "100%",
            objectFit: "contain", borderRadius: 6,
            boxShadow: "var(--elev-overlay)",
            userSelect: "none",
          }}
        />
      ) : (
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>Chargementâ€¦</div>
      )}
    </div>
  );
}

/* â”€â”€â”€ Doc Editor (full-screen overlay) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function DocEditor({ doc, onClose, onSaved, onRenamed }) {
  const supabase = createClient();
  const [content, setContent] = useState(doc.content || "");
  const [name, setName] = useState(doc.name);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  // autosave (debounce 600ms)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const { error } = await supabase
          .from("drive_files")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", doc.id);
        if (!error) onSaved(content);
      } finally { setSaving(false); }
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const saveName = async () => {
    const n = name.trim();
    if (!n || n === doc.name) { setName(doc.name); return; }
    try {
      const { error } = await supabase.from("drive_files").update({ name: n }).eq("id", doc.id);
      if (error) throw error;
      onRenamed(n);
    } catch (e) { console.error(e); setName(doc.name); }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.white, borderRadius: "var(--radius-card)", width: "100%", maxWidth: 900, height: "90vh",
          /* Couche flottante : c'est l'ombre qui la detache du travail en
             dessous, jamais un contour ni un voile sombre. */
          boxShadow: "var(--elev-overlay)", border: "none",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Pas de filet sous l'en-tete : le nom du document et la surface
            d'ecriture se separent par l'espace. */}
        <div style={{ padding: "12px 16px 10px", display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={14} strokeWidth={1.75} color={T.blue} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text, border: "none", outline: "none", background: "transparent", fontFamily: "inherit" }}
          />
          <span style={{ fontSize: 11, color: T.textMut }}>{saving ? "Enregistrementâ€¦" : "EnregistrÃ©"}</span>
          <button onClick={onClose} aria-label="Fermer l'éditeur" title="Fermer" style={{ width: 30, height: 30, background: "transparent", border: "none", color: T.textMut, cursor: "pointer", borderRadius: 6 }}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          autoFocus
          style={{
            flex: 1, border: "none", outline: "none", padding: 24,
            fontSize: 14, lineHeight: 1.6, fontFamily: "inherit",
            color: T.text, resize: "none",
          }}
          placeholder="Commence Ã  Ã©crireâ€¦"
        />
      </div>
    </div>
  );
}

/* â”€â”€â”€ Share Modal : gÃ©nÃ¨re un lien d'invitation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ShareModal({ project, onClose }) {
  const supabase = createClient();
  const [role, setRole] = useState("editor");
  const [token, setToken] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [existingInvites, setExistingInvites] = useState([]);
  // Token en attente de confirmation de révocation (modale in-app vs confirm() natif).
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("drive_invites")
        .select("token, role, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });
      setExistingInvites(data || []);
    })();
  }, [project.id, supabase]);

  const generateLink = async () => {
    setCreating(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) throw new Error("Non authentifiÃ©.");
      const { data, error } = await supabase
        .from("drive_invites")
        .insert({ project_id: project.id, role, created_by: uid })
        .select()
        .single();
      if (error) throw error;
      setToken(data.token);
      setExistingInvites((prev) => [data, ...prev]);
    } catch (e) {
      console.error("[Drive] generate invite failed:", describeError(e), dumpError(e));
      notify("Échec génération lien", describeError(e));
    }
    finally { setCreating(false); }
  };

  const link = token ? `${window.location.origin}/dashboard/join/${token}` : null;

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const revokeInvite = (tok) => setConfirmRevoke(tok);
  const doRevokeInvite = async (tok) => {
    await supabase.from("drive_invites").delete().eq("token", tok);
    setExistingInvites((prev) => prev.filter((i) => i.token !== tok));
    if (token === tok) setToken(null);
  };

  return (
    <>
    <ModalShell title="Partager le projet" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
        <div>
          <label style={{ fontSize: 11, color: T.textMut, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>RÃ´le</label>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {["editor", "viewer"].map((r) => (
              <button key={r} onClick={() => setRole(r)}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: "var(--radius-card)",
                  border: `1px solid ${role === r ? T.text : T.border}`,
                  background: role === r ? T.text : T.white,
                  color: role === r ? "#fff" : T.text,
                  fontSize:12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                }}>
                {r === "editor" ? "Ã‰diteur (peut modifier)" : "Lecteur (lecture seule)"}
              </button>
            ))}
          </div>
        </div>

        <button onClick={generateLink} disabled={creating}
          style={{ padding: "8px 16px", minHeight: 34, borderRadius: 999, background: T.text, color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Share2 size={14} strokeWidth={1.75} /> {creating ? "GÃ©nÃ©rationâ€¦" : "GÃ©nÃ©rer un lien"}
        </button>

        {link && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 6px 6px 14px", border: "none", borderRadius: 999, background: DA_FIELD_BG }}>
            <input readOnly value={link} style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 11, fontFamily: "monospace", color: T.text }} />
            <button onClick={copy}
              style={{ padding: "8px 16px", minHeight: 34, borderRadius: 999, background: copied ? T.green : T.text, color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {copied ? <><Check size={11} /> CopiÃ©</> : <><Copy size={11} /> Copier</>}
            </button>
          </div>
        )}

        {existingInvites.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: T.textMut, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
              Liens actifs
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {existingInvites.map((inv) => (
                <div key={inv.token} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 6 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: T.textSub, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    â€¦{inv.token.slice(-10)}
                  </span>
                  <span style={{ fontSize: 10, color: T.textMut }}>{inv.role}</span>
                  <button onClick={() => revokeInvite(inv.token)}
                    aria-label="Révoquer le lien" title="Révoquer le lien"
                    style={{ width: 22, height: 22, background: "transparent", border: "none", color: T.textMut, cursor: "pointer", borderRadius: "var(--radius-field)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.red; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: T.textMut, margin: 0 }}>
          Toute personne avec le lien et un compte connectÃ© pourra rejoindre ce projet.
        </p>
      </div>
    </ModalShell>
    {confirmRevoke && (
      <ConfirmDialog
        title="Révoquer ce lien ?"
        message="Le lien d'invitation ne fonctionnera plus. Cette action est définitive."
        confirmLabel="Révoquer"
        danger
        onCancel={() => setConfirmRevoke(null)}
        onConfirm={() => { const t = confirmRevoke; setConfirmRevoke(null); doRevokeInvite(t); }}
      />
    )}
    </>
  );
}

/* â”€â”€â”€ Members Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function MembersModal({ project, currentUserId, onClose }) {
  const supabase = createClient();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const isOwner = project.owner_id === currentUserId;
  // Action en attente de confirmation (modale in-app vs confirm() natif KO sous Tauri).
  const [confirmAction, setConfirmAction] = useState(null); // { title, message, confirmLabel, run }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("drive_project_members")
        .select("user_id, role, added_at")
        .eq("project_id", project.id);
      if (!error) setMembers(data || []);
      setLoading(false);
    })();
  }, [project.id, supabase]);

  const remove = (userId) => setConfirmAction({
    title: "Retirer ce membre ?",
    message: "Ce membre perdra l'accès au projet.",
    confirmLabel: "Retirer",
    run: async () => {
      const { error } = await supabase
        .from("drive_project_members")
        .delete()
        .eq("project_id", project.id)
        .eq("user_id", userId);
      if (!error) setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    },
  });

  const leave = () => setConfirmAction({
    title: "Quitter ce projet ?",
    message: "Tu perdras l'accès à ce projet.",
    confirmLabel: "Quitter",
    run: async () => {
      await supabase
        .from("drive_project_members")
        .delete()
        .eq("project_id", project.id)
        .eq("user_id", currentUserId);
      onClose();
      window.location.reload();
    },
  });

  return (
    <>
    <ModalShell title="Membres" onClose={onClose}>
      {loading ? (
        /* Trois lignes de membres : la modale garde sa hauteur au lieu de
           s'agrandir d'un coup quand la liste arrive. */
        <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)" }}>
              <SkeletonCircle size={28} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                <Skeleton width="60%" height={12} />
                <Skeleton width="20%" height={10} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {members.map((m) => {
            const isMe = m.user_id === currentUserId;
            const isProjectOwner = m.role === "owner";
            return (
              <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.accentBg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: T.text }}>
                  {m.user_id.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.user_id} {isMe && <span style={{ color: T.textMut }}>(vous)</span>}
                  </div>
                  <div style={{ fontSize: 10, color: T.textMut }}>{m.role}</div>
                </div>
                {!isProjectOwner && isOwner && !isMe && (
                  <button onClick={() => remove(m.user_id)}
                    aria-label="Retirer ce membre" title="Retirer ce membre"
                    style={{ width: 24, height: 24, background: "transparent", border: "none", color: T.textMut, cursor: "pointer", borderRadius: "var(--radius-field)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.red; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; }}
                  >
                    <X size={12} />
                  </button>
                )}
                {isMe && !isOwner && (
                  <button onClick={leave}
                    style={{ padding: "4px 10px", border: `1px solid ${T.border}`, borderRadius: 6, background: T.white, color: T.red, fontSize:11, fontWeight: 500, cursor: "pointer" }}>
                    Quitter
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
    {confirmAction && (
      <ConfirmDialog
        title={confirmAction.title}
        message={confirmAction.message}
        confirmLabel={confirmAction.confirmLabel}
        danger
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { const a = confirmAction; setConfirmAction(null); a.run?.(); }}
      />
    )}
    </>
  );
}

/* â”€â”€â”€ Modal shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ModalShell({ title, onClose, children }) {
  return (
    <DAModal open title={title} onClose={onClose} width={460} maxHeight="85vh">
      {/* Le titre n'est plus dans le chrome (la DA n'y met qu'une poignee et les
          actions) : il ouvre le contenu, la ou on le lit avant le formulaire. */}
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</div>
      {children}
    </DAModal>
  );
}

/* â”€â”€â”€ DrawSurface : carte dessin (SVG, free-draw) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   â€¢ Drag Ã  l'intÃ©rieur = trait de crayon
   â€¢ Bouton gomme dans le coin = efface tous les traits
   â€¢ La carte se dÃ©place en cliquant sur le header de la carte (extÃ©rieur du SVG)
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function DrawSurface({ content, locked, onChange }) {
  const parsed = (() => {
    try { return JSON.parse(content || "{}"); } catch { return {}; }
  })();
  const initialStrokes = Array.isArray(parsed.strokes) ? parsed.strokes : [];
  const [strokes, setStrokes] = useState(initialStrokes);
  const [active, setActive] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => { setStrokes(initialStrokes); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [content]);

  const pointFromEvent = (e) => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    return [
      Math.round((e.clientX - rect.left) * 10) / 10,
      Math.round((e.clientY - rect.top)  * 10) / 10,
    ];
  };

  const onPointerDown = (e) => {
    if (locked) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setActive({ color: "#0D0D0D", width: 2, points: [pointFromEvent(e)] });
  };
  const onPointerMove = (e) => {
    if (!active) return;
    e.stopPropagation();
    setActive((s) => s ? { ...s, points: [...s.points, pointFromEvent(e)] } : s);
  };
  const onPointerUp = (e) => {
    if (!active) return;
    e.stopPropagation();
    const next = [...strokes, active];
    setStrokes(next);
    setActive(null);
    onChange?.(next);
  };

  const clear = (e) => {
    e.stopPropagation();
    setStrokes([]); setActive(null);
    onChange?.([]);
  };

  const renderStroke = (s, i) => {
    if (!s?.points?.length) return null;
    const d = s.points.map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x} ${y}`).join(" ");
    return (
      <path key={i} d={d} fill="none"
        stroke={s.color || "#0D0D0D"}
        strokeWidth={s.width || 2}
        strokeLinecap="round" strokeLinejoin="round" />
    );
  };

  return (
    <div style={{ flex: 1, position: "relative", background: "#FFFFFF" }}>
      <svg
        ref={svgRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: "100%", height: "100%", display: "block",
          cursor: locked ? "default" : "crosshair",
          touchAction: "none",
        }}
      >
        {strokes.map(renderStroke)}
        {active && renderStroke(active, "active")}
      </svg>
      {!locked && strokes.length > 0 && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={clear}
          title="Effacer tout"
          style={{
            position: "absolute", bottom: 6, left: 6, zIndex: 2,
            width: 24, height: 24, borderRadius: 999,
            background: "rgba(255,255,255,0.9)", border: `1px solid ${T.border}`,
            color: T.textSub, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.red; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.textSub; }}
        >
          <Eraser size={12} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

/* â”€â”€â”€ AudioPlayer : lecture d'une piste audio enregistrÃ©e â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function AudioPlayer({ url }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => { setPlaying(false); setCurrent(0); }, [url]);

  const toggle = (e) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const fmtTime = (s) => {
    if (!Number.isFinite(s)) return "â€”";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ flex: 1, padding: 12, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {url ? (
        <>
          <audio
            ref={audioRef}
            src={url}
            preload="metadata"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
            onEnded={() => { setPlaying(false); setCurrent(0); }}
          />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggle}
            title={playing ? "Pause" : "Lecture"}
            style={{
              width: 34, height: 34, borderRadius: 999,
              background: T.text, color: "#fff", border: "none",
              cursor: "pointer", flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {playing ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} style={{ marginLeft: 1 }} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 4, background: T.border, borderRadius: 999, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: duration > 0 ? `${(current / duration) * 100}%` : "0%",
                background: T.red,
                transition: "width 80ms linear",
              }} />
            </div>
            <div style={{ fontSize: 10, color: T.textMut, marginTop: 4, fontFamily: "monospace" }}>
              {fmtTime(current)} / {fmtTime(duration)}
            </div>
          </div>
        </>
      ) : (
        /* La forme du lecteur (bouton rond + onde + minutage), pour que la
           tuile ne change pas de taille quand le fichier arrive. */
        <div aria-busy="true" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SkeletonCircle size={28} />
          <Skeleton height={10} radius={999} style={{ flex: 1 }} />
          <Skeleton width={48} height={10} />
        </div>
      )}
    </div>
  );
}
