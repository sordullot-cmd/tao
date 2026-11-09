"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { MoveDiagonal, Maximize2, X } from "lucide-react";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";
import { useApp } from "@/lib/contexts/AppContext";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { emptyStudy, normalizeStudy } from "@/lib/study/model";
import { usePlayerPrefs, CORNERS } from "@/components/study/playerPrefs";
import { useFloatingVideo, track, dismiss, requestOpen } from "@/components/study/floatingVideo";
import { loadYouTubeApi } from "@/components/study/StudyVideo";

/**
 * La vidéo d'étude qu'on a quittée en pleine lecture, qui continue dans un
 * coin de l'écran pendant qu'on va voir ailleurs.
 *
 * Montée dans la coquille (`DashboardNew`), comme `FocusSentinel` : une page
 * se démonte dès qu'on la quitte, la coquille jamais. Ne rend rien tant
 * qu'aucune vidéo n'a été confiée (cf. `floatingVideo.js`).
 */
export default function FloatingStudyVideo() {
  const entry = useFloatingVideo();
  if (!entry) return null;
  /* Clé = la passation elle-même : une nouvelle vidéo confiée recrée le
     lecteur au lieu d'hériter de l'iframe précédente. */
  return <Floating key={`${entry.noteId}:${entry.youtubeId}`} entry={entry} />;
}

function Floating({ entry }) {
  const { setPage } = useApp();
  const [prefs, setPrefs] = usePlayerPrefs();
  /* Même clé que la page Étude : le relais de `useCloudState` garde les deux
     d'accord si la page est montée en même temps (accueil de l'Étude). */
  const [, setRaw] = useCloudState("tao_study", "study", emptyStudy());
  const host = useRef(null);
  const player = useRef(null);
  const lastSaved = useRef(Math.floor(entry.time));

  /* La position remonte dans la note, comme depuis le lecteur d'origine :
     c'est elle qui nourrit « Reprendre à » si l'on rouvre la note plus tard
     au lieu de revenir par ce bouton. Sans toucher `updatedAt` — regarder
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

  const corner = prefs.corner;
  return (
    <div role="region" aria-label="Vidéo d'étude en cours" style={{
      position: "fixed", zIndex: 40, width: "min(340px, calc(100vw - 32px))", padding: 10, borderRadius: 14,
      background: T.white, boxShadow: "var(--elev-overlay)", display: "flex", flexDirection: "column", gap: 6,
      ...(corner.includes("b") ? { bottom: 24 } : { top: 84 }),
      ...(corner.includes("r") ? { right: 16 } : { left: 16 }),
    }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", background: FIELD_BG }}>
        {/* Même débord rogné que le lecteur de la note : sans lui, un liseré
            noir du lecteur YouTube dépasse sur les bords. */}
        <div style={{ position: "absolute", inset: -3 }}><div ref={host} style={{ width: "100%", height: "100%" }} /></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, ...TYPE.label, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: 2 }}>
          {entry.title || "Vidéo d'étude"}
        </span>
        <Btn label="Revenir à la note" onClick={back}><Maximize2 size={14} strokeWidth={1.75} /></Btn>
        <Btn label="Changer de coin" onClick={() => setPrefs({ corner: CORNERS[(CORNERS.indexOf(corner) + 1) % CORNERS.length] })}>
          <MoveDiagonal size={14} strokeWidth={1.75} />
        </Btn>
        <Btn label="Fermer la vidéo" onClick={dismiss}><X size={14} strokeWidth={1.75} /></Btn>
      </div>
      <style>{`.study-float-btn:hover, .study-float-btn:focus-visible { color: ${T.text} !important; background: ${FIELD_BG} !important; }`}</style>
    </div>
  );
}

function Btn({ label, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="study-float-btn"
            style={{
              all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: 6, color: T.textMut, flexShrink: 0,
            }}>
      {children}
    </button>
  );
}
