"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { useApp } from "@/lib/contexts/AppContext";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { emptyStudy, normalizeStudy } from "@/lib/study/model";
import { useFloatingVideo, track, dismiss, requestOpen } from "@/components/study/floatingVideo";
import { loadYouTubeApi, SCRIM } from "@/components/study/StudyVideo";

/**
 * La vidéo d'étude qu'on a quittée en pleine lecture, qui continue par-dessus
 * l'app pendant qu'on va voir ailleurs.
 *
 * Montée dans la coquille (`DashboardNew`), comme `FocusSentinel` : une page
 * se démonte dès qu'on la quitte, la coquille jamais. Ne rend rien tant
 * qu'aucune vidéo n'a été confiée (cf. `floatingVideo.js`).
 *
 * Rien que la vidéo : pas de cadre, pas de rangée de boutons. On la saisit
 * pour la déplacer, on tire un coin pour la redimensionner, et les deux seuls
 * gestes — revenir à la note, fermer — apparaissent au survol, sur l'image.
 */
export default function FloatingStudyVideo() {
  const entry = useFloatingVideo();
  if (!entry) return null;
  /* Clé = la passation elle-même : une nouvelle vidéo confiée recrée le
     lecteur au lieu d'hériter de l'iframe précédente. */
  return <Floating key={`${entry.noteId}:${entry.youtubeId}`} entry={entry} />;
}

const RATIO = 16 / 9;
const MIN_W = 200;
const MARGIN = 8;
/* Hauteur de la barre de commandes YouTube, laissée hors du calque de saisie :
   la barre de progression et le volume restent à portée. */
const CONTROLS_H = 48;
const GRIP = 14;
const BOX_KEY = "tao_study_float";

function Floating({ entry }) {
  const { setPage } = useApp();
  /* Même clé que la page Étude : le relais de `useCloudState` garde les deux
     d'accord si la page est montée en même temps (accueil de l'Étude). */
  const [, setRaw] = useCloudState("tao_study", "study", emptyStudy());
  const host = useRef(null);
  const player = useRef(null);
  const lastSaved = useRef(Math.floor(entry.time));

  /* La position remonte dans la note, comme depuis le lecteur d'origine :
     c'est elle qui nourrit « Reprendre à » si l'on rouvre la note plus tard
     au lieu de revenir par le bouton. Sans toucher `updatedAt` — regarder
     n'est pas modifier. */
  const save = useCallback((sec, force = false) => {
    const s = Math.floor(sec);
    if (!force && Math.abs(s - lastSaved.current) < 3) return;
    lastSaved.current = s;
    setRaw(prev => {
      const st = normalizeStudy(prev);
      return {
        ...st,
        notes: st.notes.map(n => (n.id !== entry.noteId ? n : {
          ...n,
          videos: n.videos.map(v => (v.id === entry.videoId ? { ...v, position: s } : v)),
        })),
      };
    });
  }, [setRaw, entry.noteId, entry.videoId]);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(YT => {
      if (cancelled || !host.current) return;
      player.current = new YT.Player(host.current, {
        host: "https://www.youtube-nocookie.com",
        videoId: entry.youtubeId,
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, start: Math.floor(entry.time) },
        events: {
          /* `start` ne connaît que la seconde entière : on recale au dixième
             pour ne pas rejouer le bout de phrase qu'on vient d'entendre. */
          onReady: (e) => { e.target.seekTo(entry.time, true); e.target.playVideo(); },
          onStateChange: (e) => { if (e.data !== YT.PlayerState.PLAYING) save(e.target.getCurrentTime() || 0); },
        },
      });
    }).catch(() => { if (!cancelled) dismiss(); });

    const id = setInterval(() => {
      const p = player.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      const t = p.getCurrentTime() || 0;
      track(t);
      if (p.getPlayerState?.() === 1) save(t);
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(id);
      const p = player.current;
      try { if (p?.getCurrentTime) save(p.getCurrentTime() || 0, true); } catch { /* lecteur déjà parti */ }
      try { p?.destroy?.(); } catch { /* déjà détruit */ }
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un lecteur par passation (cf. clé)
  }, []);

  /* Revenir à la note : l'Étude rouvre la note, et son lecteur reprend la
     main (`claim`) au temps atteint ici. */
  const back = () => {
    requestOpen(entry.noteId);
    setPage("study");
  };

  const [box, setBox] = useState(readBox);
  const live = useRef(box);
  useEffect(() => { live.current = box; }, [box]);
  const frame = useRef(null);
  /* Écrit directement sur le nœud pendant le geste, retenu à la fin : un
     rendu React par mouvement de souris ferait saccader l'iframe. */
  const paint = (b) => {
    live.current = b;
    const el = frame.current;
    if (!el) return;
    el.style.left = `${b.x}px`; el.style.top = `${b.y}px`; el.style.width = `${b.w}px`;
  };
  const commit = (b) => { setBox(b); writeBox(b); };

  /* La fenêtre rétrécie peut laisser la vidéo hors champ : on la ramène. */
  useEffect(() => {
    const onResize = () => { const b = fit(live.current); paint(b); setBox(b); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Le geste suit le pointeur capturé : sans capture, passer au-dessus de
     l'iframe en allant vite ferait perdre les mouvements à YouTube. */
  const drag = (e, onMove, onEnd) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const up = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      onEnd();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  /* Saisir la vidéo la déplace ; un clic sans mouvement met en pause ou
     relance — le calque qui capte le geste masque le clic de YouTube, il
     doit donc le rendre. */
  const onMoveDown = (e) => {
    if (e.button !== 0) return;
    const start = live.current;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    drag(e, (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      paint(fit({ ...start, x: start.x + dx, y: start.y + dy }));
    }, () => {
      if (moved) { commit(live.current); return; }
      const p = player.current;
      if (!p?.getPlayerState) return;
      if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo();
    });
  };

  /* Redimensionner par un coin : le coin opposé reste en place, et le cadre
     garde son 16:9 — seule la largeur se règle, la hauteur suit. */
  const onResizeDown = (corner) => (e) => {
    if (e.button !== 0) return;
    const start = live.current;
    const sx = e.clientX;
    const right = start.x + start.w;
    const bottom = start.y + start.w / RATIO;
    drag(e, (ev) => {
      const dx = ev.clientX - sx;
      const w = clampW(corner.includes("l") ? start.w - dx : start.w + dx);
      paint(fit({
        w,
        x: corner.includes("l") ? right - w : start.x,
        y: corner.includes("t") ? bottom - w / RATIO : start.y,
      }));
    }, () => commit(live.current));
  };

  return (
    <div ref={frame} role="region" aria-label="Vidéo d'étude en cours" className="study-float" style={{
      position: "fixed", zIndex: 40, left: box.x, top: box.y, width: box.w, aspectRatio: "16 / 9",
      borderRadius: 12, overflow: "hidden", background: FIELD_BG, boxShadow: "var(--elev-overlay)",
    }}>
      {/* Même débord rogné que le lecteur de la note : sans lui, un liseré
          noir du lecteur YouTube dépasse sur les bords. */}
      <div style={{ position: "absolute", inset: -3 }}><div ref={host} style={{ width: "100%", height: "100%" }} /></div>
      <div onPointerDown={onMoveDown} title="Glisser pour déplacer — clic pour lecture / pause"
           style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: CONTROLS_H, cursor: "grab", touchAction: "none" }} />
      <div className="study-float-actions" style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
        <Btn label="Revenir à la note" onClick={back}><Maximize2 size={14} strokeWidth={2} /></Btn>
        <Btn label="Fermer la vidéo" onClick={dismiss}><X size={15} strokeWidth={2} /></Btn>
      </div>
      {["tl", "tr", "bl", "br"].map(c => (
        <div key={c} aria-hidden onPointerDown={onResizeDown(c)} style={{
          position: "absolute", width: GRIP, height: GRIP, touchAction: "none",
          ...(c.includes("t") ? { top: 0 } : { bottom: 0 }),
          ...(c.includes("l") ? { left: 0 } : { right: 0 }),
          cursor: c === "tl" || c === "br" ? "nwse-resize" : "nesw-resize",
        }} />
      ))}
      {/* Les boutons n'apparaissent qu'au survol : le reste du temps, il n'y a
          que la vidéo. Toujours visibles au toucher, faute de survol. */}
      <style>{`
        .study-float .study-float-actions { opacity: 0; transition: opacity 140ms var(--ease-out, ease); }
        .study-float:hover .study-float-actions, .study-float:focus-within .study-float-actions { opacity: 1; }
        @media (hover: none) { .study-float .study-float-actions { opacity: 1; } }
        .study-float-btn:hover, .study-float-btn:focus-visible { transform: scale(1.06); }
      `}</style>
    </div>
  );
}

const clampW = (w) => Math.max(MIN_W, Math.min(w, window.innerWidth - 2 * MARGIN));

/** Garde la vidéo entière dans la fenêtre, quelle que soit sa taille. */
function fit(b) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(clampW(b.w), (vh - 2 * MARGIN) * RATIO);
  const h = w / RATIO;
  return {
    w,
    x: Math.max(MARGIN, Math.min(b.x, vw - w - MARGIN)),
    y: Math.max(MARGIN, Math.min(b.y, vh - h - MARGIN)),
  };
}

/* Place et taille retenues par appareil, comme les réglages du lecteur : ce
   qui convient à un grand écran n'a pas de sens sur un portable. Par défaut,
   en bas à droite. */
function readBox() {
  try {
    const raw = JSON.parse(localStorage.getItem(BOX_KEY) || "null");
    if (raw && [raw.x, raw.y, raw.w].every(Number.isFinite)) return fit(raw);
  } catch { /* navigation privée ou valeur abîmée */ }
  const w = 360;
  return fit({ w, x: window.innerWidth - w - 24, y: window.innerHeight - w / RATIO - 24 });
}

function writeBox(b) {
  try {
    localStorage.setItem(BOX_KEY, JSON.stringify({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w) }));
  } catch { /* navigation privée */ }
}

/* Posé sur l'image : le voile reste sombre dans les deux thèmes (cf. SCRIM). */
function Btn({ label, onClick, children }) {
  return (
    <button type="button" onClick={onClick} onPointerDown={e => e.stopPropagation()}
            aria-label={label} title={label} className="study-float-btn"
            style={{
              all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 999, background: SCRIM, color: T.onSolid,
              transition: "transform 120ms var(--ease-out, ease)",
            }}>
      {children}
    </button>
  );
}
