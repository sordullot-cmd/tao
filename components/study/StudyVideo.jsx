"use client";

import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Play, ChevronDown, MoveDiagonal, PanelTop, PanelRight, PictureInPicture2, Replace, X } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { youTubeThumbs } from "@/lib/study/model";
import { secondsToClock } from "@/lib/study/stamps";
import { CORNERS } from "@/components/study/playerPrefs";
import { handOff, claim } from "@/components/study/floatingVideo";

/* Voile posé sur une vignette vidéo. Volontairement hors thème : il repose sur
   une image, pas sur le fond de page, et doit rester sombre en thème clair
   comme en thème sombre pour que le blanc du bouton se lise. */
export const SCRIM = "rgba(13, 13, 13, 0.72)";
const MODES = [
  { id: "top", label: "Haut", Icon: PanelTop },
  { id: "side", label: "Côté", Icon: PanelRight },
  { id: "mini", label: "Mini", Icon: PictureInPicture2 },
];
/* En deçà, « Reprendre » ne vaut pas mieux que « Lire » : c'est l'intro. */
const RESUME_MIN = 5;
const MIN_H = 140;
const RATIO = 16 / 9;
/* Marge gardée de chaque côté quand la vidéo déborde de la colonne. */
const GUTTER = 16;
/* Plafonnée par la place réellement disponible (`room`) : une hauteur retenue
   sur grand écran ne doit pas déborder une fenêtre plus étroite. Tant que la
   place n'est pas mesurée, on s'en tient à la colonne. */
const frameWidth = (h, room) => {
  const px = Math.round(h * RATIO);
  return room ? `${Math.min(px, room)}px` : `min(100%, ${px}px)`;
};

/* L'API IFrame de YouTube, chargée une fois pour toute l'app et seulement au
   premier clic sur « Lire » : tant qu'on n'a rien lancé, rien ne part chez
   YouTube hormis la vignette. */
let apiPromise = null;
export function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("pas de fenêtre"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => { apiPromise = null; reject(new Error("API YouTube injoignable")); };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

/**
 * Le lecteur d'une note d'étude.
 *
 * Il expose par `ref` l'horloge dont l'éditeur a besoin — le temps courant,
 * « est-ce que ça joue », aller à un moment — pour minuter les lignes et
 * insérer des repères. La position atteinte remonte par `onPosition`, ce qui
 * nourrit « Reprendre à » la fois suivante.
 *
 * Trois dispositions (`prefs.mode`) :
 *   top   au-dessus du texte, collée en haut au défilement, taille réglable ;
 *   side  à côté du texte (la note gère la grille) ;
 *   mini  petite, dans un coin de l'écran.
 * Le même nœud DOM sert aux trois : changer de disposition ne recharge pas
 * l'iframe, la lecture continue.
 *
 * Quitter la note en pleine lecture ne coupe pas la vidéo : au démontage, le
 * lecteur la confie à la fenêtre flottante de la coquille
 * (`FloatingStudyVideo`), et la reprend à son retour (cf. `floatingVideo.js`).
 */
const StudyVideo = React.forwardRef(function StudyVideo(
  { video, noteId, marks, prefs, setPrefs, onPosition, onChange, onRemove, contained = false },
  ref,
) {
  const host = useRef(null);
  const player = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(video.position || video.start || 0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showMarks, setShowMarks] = useState(false);
  const lastSaved = useRef(video.position || 0);
  const pendingSeek = useRef(null);

  const resumeAt = video.position >= RESUME_MIN ? video.position : video.start;

  const save = useCallback((sec) => {
    const s = Math.floor(sec);
    if (Math.abs(s - lastSaved.current) < 3) return;
    lastSaved.current = s;
    onPosition(s);
  }, [onPosition]);

  const start = useCallback((at) => {
    if (player.current) {
      player.current.seekTo(at, true);
      player.current.playVideo();
      return;
    }
    pendingSeek.current = at;
    setLoaded(true);
  }, []);

  /* Création du lecteur une fois le nœud monté. */
  useEffect(() => {
    if (!loaded || !host.current || player.current) return undefined;
    let cancelled = false;
    loadYouTubeApi().then(YT => {
      if (cancelled || !host.current) return;
      player.current = new YT.Player(host.current, {
        host: "https://www.youtube-nocookie.com",
        videoId: video.youtubeId,
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, start: Math.floor(pendingSeek.current ?? resumeAt) },
        events: {
          onReady: (e) => { e.target.playVideo(); setDuration(e.target.getDuration() || 0); },
          onStateChange: (e) => {
            const isPlaying = e.data === YT.PlayerState.PLAYING;
            setPlaying(isPlaying);
            /* Pause ou fin : le meilleur moment pour retenir la position. */
            if (!isPlaying) save(e.target.getCurrentTime() || 0);
          },
        },
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule création par chargement
  }, [loaded]);

  /* De retour d'une autre page : la fenêtre flottante rend la main, et la
     lecture repart là où elle en était, sans repasser par la vignette. */
  useEffect(() => {
    const at = claim(noteId, video.youtubeId);
    if (at != null) { setTime(at); start(at); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule reprise, au montage
  }, []);

  /* « Retirer » démonte aussi le lecteur : ce départ-là ne doit pas flotter. */
  const removed = useRef(false);
  const titleRef = useRef(video.title);
  titleRef.current = video.title;

  /* Le parent remonte le lecteur à chaque vidéo (clé = id YouTube) : le
     nettoyage n'a lieu qu'au démontage. C'est aussi le seul moment où l'on
     sait qu'on quitte la note — d'où la passation ici, avant de détruire.
     Seulement si ça JOUAIT : une vidéo en pause qu'on laisse derrière soi n'a
     pas à vous suivre. */
  useEffect(() => () => {
    const p = player.current;
    try {
      if (!removed.current && p?.getPlayerState?.() === 1) {
        const at = p.getCurrentTime?.() || 0;
        handOff({ noteId, videoId: video.id, youtubeId: video.youtubeId, title: titleRef.current, time: at });
      }
    } catch { /* lecteur à moitié détruit : on n'a rien à transmettre */ }
    try { p?.destroy?.(); } catch { /* déjà détruit */ }
    player.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nettoyage du démontage seul
  }, []);

  /* L'horloge affichée, et une sauvegarde de position en cours de lecture
     (toutes les ~15 s) pour qu'une fermeture brutale perde peu. */
  useEffect(() => {
    if (!loaded) return undefined;
    let tick = 0;
    const id = setInterval(() => {
      const p = player.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      const t = p.getCurrentTime() || 0;
      setTime(t);
      if (!duration) setDuration(p.getDuration?.() || 0);
      tick += 1;
      if (tick % 60 === 0 && p.getPlayerState?.() === 1) save(t);
    }, 250);
    return () => clearInterval(id);
  }, [loaded, duration, save]);

  useImperativeHandle(ref, () => ({
    time: () => (player.current?.getCurrentTime?.() ?? time),
    playing: () => playing,
    seek: (sec) => start(sec),
  }), [time, playing, start]);

  /* Poignée de taille (disposition « Haut ») : glisser règle, double-clic
     revient à la pleine largeur. Retenue par appareil.
     On règle la hauteur mais le cadre garde son 16:9 — la largeur suit. Ne
     changer que la hauteur laissait YouTube remplir le surplus de bandes
     noires : la vidéo elle-même ne grandissait pas. La pleine largeur de la
     colonne ne suffit pas comme plafond (880 px, c'est peu sur un grand
     écran) : la vidéo en déborde, centrée, jusqu'à la largeur de la zone de
     contenu — le texte, lui, garde sa colonne de lecture. */
  const box = useRef(null);
  /* Le bloc entier (vidéo, infos, séparateur) : c'est LUI qui prend la
     largeur réglée, pour que les infos suivent le cadre au lieu de rester
     calées sur la colonne pendant que la vidéo rapetisse. */
  const block = useRef(null);
  const stage = useRef(null);
  const [measured, setRoom] = useState(null);
  /* La carte du trade à côté : déborder de la colonne passerait dessus. */
  const room = contained ? null : measured;
  const mode = prefs.mode;
  useEffect(() => {
    if (mode !== "top") return undefined;
    /* La zone qui entoure la colonne de la note : c'est elle, et non la
       fenêtre, qui borne — la barre latérale de l'app prend sa part. */
    const area = box.current?.closest("main")?.parentElement;
    if (!area || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setRoom(Math.max(0, area.clientWidth - 2 * GUTTER) || null);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, [mode]);
  const onHandleDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = box.current?.getBoundingClientRect().height || 300;
    const columnW = stage.current?.getBoundingClientRect().width || window.innerWidth;
    const fullH = columnW / RATIO;
    const max = Math.max(MIN_H, Math.min(Math.max(room || columnW, columnW) / RATIO, window.innerHeight * 0.85));
    let latest = startH;
    const move = (ev) => {
      latest = Math.max(MIN_H, Math.min(max, startH + ev.clientY - startY));
      if (block.current) block.current.style.width = frameWidth(latest, room);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      /* Ramené pile à la largeur de la colonne : on ne retient rien, pour que
         le cadre suive la colonne si la fenêtre change ensuite. */
      setPrefs({ height: Math.abs(latest - fullH) < 2 ? null : Math.round(latest) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const mini = mode === "mini";
  const corner = prefs.corner;
  const fixedPos = mini ? {
    position: "fixed", zIndex: 40, width: 340, padding: 10, borderRadius: 14,
    background: T.white, boxShadow: "var(--elev-overlay)",
    ...(corner.includes("b") ? { bottom: 24 } : { top: 84 }),
    ...(corner.includes("r") ? { right: 24 } : { left: 24 }),
  } : mode === "top" ? {
    /* Collée en haut : on garde la vidéo sous les yeux en descendant dans le
       texte, c'est tout l'intérêt de prendre des notes à côté. */
    /* Fond et clics portés par le BLOC, pas par cette bande pleine largeur :
       réduite, la vidéo laissait deux pans blancs de part et d'autre, qui
       masquaient en plus le texte défilant dessous. */
    position: "sticky", top: 0, zIndex: 5, pointerEvents: "none",
  } : { position: "sticky", top: 16 };

  const width = mode === "top" && prefs.height ? frameWidth(prefs.height, room) : "100%";

  return (
    <div style={{ ...fixedPos, minWidth: 0 }}>
      {/* Aucune place réservée à la taille normale : réduite, la vidéo fait
          remonter avec elle ses infos et le texte — garder la hauteur d'origine
          laissait un grand blanc sous une petite vignette. `minmax(0, 1fr)` :
          sans lui, la piste s'élargirait à la vidéo agrandie au lieu de la
          laisser déborder centrée. */}
      <div ref={stage} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0 }}>
      <div ref={block} style={{
        gridArea: "1 / 1", justifySelf: "center", alignSelf: "start", width, minWidth: 0, display: "flex", flexDirection: "column", gap: 6,
        ...(mode === "top" ? { background: T.bg, paddingBottom: 4, pointerEvents: "auto" } : null),
      }}>
      <div ref={box} style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", background: FIELD_BG }}>
        {loaded && !failed ? (
          /* Débord de 3 px rogné par le cadre : à une fraction de pixel près le
             cadre n'est pas exactement 16:9, et le fond noir du lecteur
             YouTube apparaissait en liseré sur les côtés et en bas. */
          <div style={{ position: "absolute", inset: -3 }}><div ref={host} style={{ width: "100%", height: "100%" }} /></div>
        ) : (
          /* Vignette seule : rien n'est chargé depuis YouTube avant le clic. */
          <button type="button" className="study-thumb" onClick={() => (failed ? window.open(`https://www.youtube.com/watch?v=${video.youtubeId}`, "_blank") : start(resumeAt))}
                  aria-label={video.position >= RESUME_MIN ? `Reprendre à ${secondsToClock(video.position)}` : "Lire la vidéo"}
                  style={{ all: "unset", cursor: "pointer", position: "absolute", inset: 0 }}>
            <img src={youTubeThumbs(video.youtubeId)[0]} alt="" loading="lazy"
                 onError={e => {
                   /* Repli vers la taille suivante ; la dernière existe toujours. */
                   const list = youTubeThumbs(video.youtubeId);
                   const next = list[list.indexOf(e.currentTarget.src) + 1];
                   if (next) e.currentTarget.src = next;
                 }}
                 /* Légèrement agrandie, le cadre rogne le surplus : beaucoup de
                    vignettes YouTube portent de fines bandes noires sur les
                    côtés, incrustées dans l'image elle-même — `cover` ne les
                    enlève pas, elles font partie de l'image. */
                 style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transform: "scale(1.04)" }} />
            <span aria-hidden style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
              display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 999,
              background: SCRIM, color: T.onSolid, ...TYPE.body, fontWeight: 600, whiteSpace: "nowrap",
            }}>
              <Play size={14} fill={T.onSolid} color={T.onSolid} />
              {failed ? "Ouvrir sur YouTube" : video.position >= RESUME_MIN ? `Reprendre à ${secondsToClock(video.position)}` : "Lire"}
            </span>
          </button>
        )}
      </div>

      {/* Une seule ligne : le titre, les repères, puis des icônes. Le temps,
          ±5 s, la vitesse et le repère sont déjà dans le lecteur YouTube ou au
          clavier (Alt+M) — les répéter ici chargeait la ligne sans rien
          apporter. « Changer » et « Retirer » en toutes lettres prenaient une
          seconde rangée sous la vidéo pour deux gestes rares. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, ...TYPE.label, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {video.title}
        </span>
        {!mini && (
          <Ctl onClick={() => setShowMarks(v => !v)} label="Repères de la note">
            Repères{marks.length ? ` (${marks.length})` : ""}
            <ChevronDown size={12} strokeWidth={1.75} style={{ transform: showMarks ? "rotate(180deg)" : "none", transition: "transform 140ms var(--ease-out, ease)" }} />
          </Ctl>
        )}
        {mini && (
          <ModeBtn onClick={() => setPrefs({ corner: CORNERS[(CORNERS.indexOf(corner) + 1) % CORNERS.length] })} label="Changer de coin">
            <MoveDiagonal size={14} strokeWidth={1.75} />
          </ModeBtn>
        )}
        <div role="group" aria-label="Disposition de la vidéo" style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {MODES.map(({ id, label, Icon }) => (
            <ModeBtn key={id} label={label} active={mode === id} onClick={() => setPrefs({ mode: id })}>
              <Icon size={14} strokeWidth={1.75} />
            </ModeBtn>
          ))}
        </div>
        {!mini && (
          <div style={{ display: "flex", gap: 2, flexShrink: 0, paddingLeft: 6, borderLeft: `1px solid ${HAIRLINE}` }}>
            <ModeBtn onClick={onChange} label="Changer de vidéo"><Replace size={14} strokeWidth={1.75} /></ModeBtn>
            <ModeBtn onClick={() => { removed.current = true; onRemove(); }} label="Retirer la vidéo" danger><X size={14} strokeWidth={1.75} /></ModeBtn>
          </div>
        )}
      </div>
      {/* Une ligne sous les infos les détache du texte. En « Haut », c'est
          aussi la poignée de taille : une seule ligne plutôt qu'un trait
          séparateur ET une barrette de poignée. */}
      {mode === "top" ? (
        <div role="separator" aria-orientation="horizontal" aria-label="Redimensionner la vidéo"
             title="Glisser pour redimensionner — double-clic pour revenir"
             onPointerDown={onHandleDown}
             onDoubleClick={() => setPrefs({ height: null })}
             className="study-handle"
             style={{ height: 9, cursor: "row-resize", display: "flex", alignItems: "center", touchAction: "none" }}>
          <span style={{ flex: 1, height: 1, background: HAIRLINE }} />
        </div>
      ) : !mini && <div aria-hidden style={{ height: 1, background: HAIRLINE }} />}
      {!mini && showMarks && (
        marks.length === 0 ? (
          <div style={{ ...TYPE.label, color: T.textMut }}>
            Aucun repère : Alt+M en écrivant insère le moment courant dans le texte.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", maxHeight: 180, overflowY: "auto" }}>
            {marks.map(m => (
              <button key={m.sec} type="button" onClick={() => start(m.sec)}
                      style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, padding: "4px 0", ...TYPE.label, color: T.textSub }}>
                <span style={{ ...TABULAR, color: T.text, minWidth: 44 }}>▸ {secondsToClock(m.sec)}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label || "—"}</span>
              </button>
            ))}
          </div>
        )
      )}

      </div>
      </div>

      <style>{`
        .study-handle:hover span { background: ${T.border2} !important; }
        .study-mode:hover, .study-mode:focus-visible { color: ${T.text} !important; background: ${FIELD_BG} !important; }
        .study-mode-danger:hover, .study-mode-danger:focus-visible { color: ${T.red} !important; background: ${T.redBg} !important; }
      `}</style>
    </div>
  );
});

export default StudyVideo;

function Ctl({ onClick, disabled = false, label, danger = false, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
            style={{
              all: "unset", cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 4,
              ...TYPE.label, ...TABULAR, color: disabled ? T.textMut : T.textSub, opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = danger ? T.red : T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = disabled ? T.textMut : T.textSub; }}>
      {children}
    </button>
  );
}

/* Bouton-icône de disposition : l'actif se distingue par un fond, pas par une
   couleur d'accent — il doit rester discret à côté de la vidéo. */
function ModeBtn({ onClick, label, active = undefined, danger = false, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} title={label}
            className={danger ? "study-mode study-mode-danger" : "study-mode"}
            style={{
              all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: 6,
              background: active ? FIELD_BG : "transparent", color: active ? T.text : T.textMut,
            }}>
      {children}
    </button>
  );
}
