"use client";

import React, { useMemo, useRef, useState } from "react";
import { X, ExternalLink, Link2, LineChart, SquarePlay, Plus, Trash2 } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { Modal, IconButton } from "@/components/ui/form";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { newId, parseYouTube, youTubeThumb, youTubeWatch, tradeStats, childFolders, wordCount } from "@/lib/study/model";
import { marksOf } from "@/lib/study/stamps";
import { fmtMoney, fmtDay, pnlOf, sideOf, dayOf } from "@/components/study/tradeFormat";
import TradePicker from "@/components/study/TradePicker";
import StudyEditor from "@/components/study/StudyEditor";
import StudyVideo from "@/components/study/StudyVideo";
import TradeCard from "@/components/study/TradeCard";
import { LOOSE_LABEL } from "@/components/study/FolderView";
import { usePlayerPrefs } from "@/components/study/playerPrefs";

/**
 * Le titre d'une vidéo, demandé à YouTube (oEmbed) au moment où on la relie.
 * Au mieux : hors ligne ou refusé, le champ reste vide et se remplit à la main.
 */
export async function fetchYouTubeTitle(id) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youTubeWatch(id, 0))}`);
    if (!res.ok) return "";
    const data = await res.json();
    return typeof data?.title === "string" ? data.title : "";
  } catch {
    return "";
  }
}

/** Une URL tapée sans schéma (« tradingview.com/… ») reste cliquable. */
const withScheme = (url) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);

function looksLikeUrl(s) {
  try { return new URL(withScheme(s.trim())).hostname.includes("."); } catch { return false; }
}

/** Onglet de source (vidéo / trade) — partagé avec l'accueil. */
export function SourceTab({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, padding: "0 12px", borderRadius: 8,
              border: "none", cursor: "pointer", fontFamily: "inherit", ...TYPE.body, fontWeight: 500,
              background: active ? T.text : "transparent", color: active ? T.textInverted : T.text,
              transition: "background 120ms var(--ease-out, ease), color 120ms var(--ease-out, ease)",
            }}>
      {children}
    </button>
  );
}

/**
 * Une note d'étude, présentée comme un document.
 *
 * Ce dont on part passe en tête : la vidéo (lecteur réglable, cf.
 * `StudyVideo`) ou le trade (`TradeCard`), puis le titre, la méta, et le texte.
 * C'est l'ordre du travail — on regarde, puis on écrit ce qu'on a compris.
 *
 * La PREMIÈRE vidéo est celle du lecteur ; les suivantes attendent en liste et
 * passent au lecteur d'un clic. Même règle pour les trades : le premier a sa
 * carte, les autres une ligne. Une note se concentre sur une source à la fois,
 * sans interdire d'en rapprocher plusieurs.
 */
export default function StudyNoteView({ note, store, trades, strategies = [], userId, onPatch, onDelete }) {
  const mobile = useIsMobile();
  const [prefs, setPrefs] = usePlayerPrefs();
  const fresh = note.videos.length === 0 && note.tradeIds.length === 0;
  const [source, setSource] = useState("video");
  const [adding, setAdding] = useState(null); // null | "video" | "replace"
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(null); // null | "add" | "replace"
  const [viewer, setViewer] = useState(null);
  const clock = useRef(null);
  const editor = useRef(null);
  const tradeById = useMemo(() => new Map(trades.map(tr => [String(tr.id), tr])), [trades]);
  const marks = useMemo(() => marksOf(note.content), [note.content]);
  const words = wordCount(note.content);
  const folderName = store.folders.find(f => f.id === note.folderId)?.name;

  const main = note.videos[0];
  const mainTradeId = note.tradeIds[0];
  /* Sur téléphone, « Côté » n'a pas la place : on retombe sur « Haut ». */
  const mode = main ? (mobile && prefs.mode === "side" ? "top" : prefs.mode) : null;
  const effPrefs = { ...prefs, mode: mode || prefs.mode };
  /* Trade à côté de la vidéo : seulement vidéo en haut et sur écran large.
     En « Côté », la vidéo occupe déjà la colonne de droite ; en mini, elle
     flotte — il n'y a pas d'« à côté » où poser la carte. */
  const canPlaceTrade = !!(main && mainTradeId && mode === "top" && !mobile);
  const tradeSide = canPlaceTrade && prefs.tradePlace === "side";

  const folderOptions = useMemo(() => {
    const out = [];
    const walk = (parentId, depth) => {
      for (const f of childFolders(store, parentId)) {
        out.push({ id: f.id, label: `${"  ".repeat(depth)}${f.name}` });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [store]);

  /* Un seul champ : une adresse YouTube devient une vidéo, toute autre adresse
     un lien. Demander d'abord « vidéo ou lien ? » ferait trier à la main ce
     que l'adresse dit déjà. En mode « replace », la vidéo remplace celle du
     lecteur au lieu de s'ajouter. */
  const addSource = () => {
    const value = draft.trim();
    if (!value) return;
    const yt = parseYouTube(value);
    if (yt) {
      if (adding !== "replace" && note.videos.some(v => v.youtubeId === yt.youtubeId && v.start === yt.start)) {
        setError("Cette vidéo est déjà dans la note.");
        return;
      }
      const video = { id: newId(), ...yt, title: "", position: 0 };
      onPatch(n => ({ videos: adding === "replace" ? [video, ...n.videos.slice(1)] : [...n.videos, video] }));
      setDraft(""); setError(""); setAdding(null);
      fetchYouTubeTitle(yt.youtubeId).then(title => {
        if (!title) return;
        /* Ni le titre de la vidéo ni celui de la note ne s'écrasent s'ils ont
           été tapés entre-temps. */
        onPatch(n => ({
          title: n.title || title,
          videos: n.videos.map(v => (v.id === video.id && !v.title ? { ...v, title } : v)),
        }));
      });
      return;
    }
    if (!looksLikeUrl(value)) {
      setError(adding === "replace" ? "Ce n'est pas un lien YouTube." : "Colle une adresse — une vidéo YouTube ou n'importe quel lien.");
      return;
    }
    if (adding === "replace") { setError("Ce n'est pas un lien YouTube."); return; }
    const url = withScheme(value);
    let label = url;
    try { label = new URL(url).hostname.replace(/^www\./, ""); } catch { /* garde l'URL */ }
    onPatch(n => ({ links: [...n.links, { id: newId(), url, label }] }));
    setDraft(""); setError(""); setAdding(null);
  };

  const sourceInput = (
    <form onSubmit={(e) => { e.preventDefault(); addSource(); }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", minHeight: 44, borderRadius: 12, background: FIELD_BG }}>
      <Link2 size={15} strokeWidth={1.75} color={T.textMut} style={{ flexShrink: 0 }} />
      <input
        value={draft}
        autoFocus={Boolean(adding)}
        onChange={(e) => { setDraft(e.target.value); setError(""); }}
        onKeyDown={(e) => { if (e.key === "Escape" && adding) { setAdding(null); setDraft(""); setError(""); } }}
        placeholder={adding === "replace" ? "Colle le lien YouTube de la nouvelle vidéo" : "De quelle vidéo viennent ces notes ? Colle un lien YouTube"}
        aria-label="Ajouter une vidéo ou un lien"
        style={{ ...TYPE.callout, fontWeight: 400, flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.text, fontFamily: "inherit" }}
      />
    </form>
  );

  const pickTrades = (ids) => {
    if (picking === "replace") onPatch(n => ({ tradeIds: [...new Set([ids[0], ...n.tradeIds.slice(1)])] }));
    else onPatch(n => ({ tradeIds: [...new Set([...n.tradeIds, ...ids])] }));
    setPicking(null);
  };

  const mainTradeCard = mainTradeId && (
    <TradeCard
      trade={tradeById.get(mainTradeId)}
      tradeId={mainTradeId}
      strategies={strategies}
      onChange={() => setPicking("replace")}
      onRemove={() => onPatch(n => ({ tradeIds: n.tradeIds.filter(x => x !== mainTradeId) }))}
      onView={setViewer}
      place={canPlaceTrade ? prefs.tradePlace : null}
      onPlace={canPlaceTrade ? (tradePlace) => setPrefs({ tradePlace }) : null}
    />
  );

  const doc = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, gridColumn: tradeSide ? "1 / -1" : undefined }}>
      {!main && mainTradeCard}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <input
          value={note.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="Sans titre"
          aria-label="Titre de la note"
          style={{ ...TYPE.display, color: T.text, background: "transparent", border: "none", outline: "none", padding: 0, fontFamily: "inherit", width: "100%" }}
        />
        {/* Méta et actions sur une seule ligne : chaque bouton sur sa rangée
            repoussait le texte d'autant, pour des gestes qu'on fait rarement. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 28, ...TYPE.label, ...TABULAR, color: T.textMut }}>
          <span style={{ color: T.textSub }}>{folderName || LOOSE_LABEL}</span>
          <span aria-hidden>/</span>
          {/* Le sélecteur se fait passer pour du texte : déplacer une note est
              rare, il ne doit pas peser autant que le titre. */}
          <select value="" aria-label="Déplacer vers"
                  onChange={(e) => { if (e.target.value) onPatch({ folderId: e.target.value === "__root" ? null : e.target.value }); }}
                  style={{ ...TYPE.label, color: T.textMut, background: "transparent", border: "none", outline: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", appearance: "none" }}>
            <option value="">Déplacer vers…</option>
            {note.folderId && <option value="__root">{LOOSE_LABEL}</option>}
            {folderOptions.filter(o => o.id !== note.folderId).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <span>{words} mot{words > 1 ? "s" : ""}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
            {!fresh && (
              <>
                <GhostButton onClick={() => setPicking("add")} title={mainTradeId ? "Relier un autre trade" : "Ajouter ton trade à cette note"}>
                  <Plus size={13} strokeWidth={2} /> Trade
                </GhostButton>
                <GhostButton active={adding === "video"} title={main ? "Ajouter une vidéo ou un lien" : "Ajouter une vidéo"}
                             onClick={() => { setAdding(a => (a === "video" ? null : "video")); setDraft(""); setError(""); }}>
                  <Plus size={13} strokeWidth={2} /> {main ? "Vidéo ou lien" : "Vidéo"}
                </GhostButton>
              </>
            )}
            <IconButton tone="danger" aria-label="Supprimer la note" title="Supprimer la note" onClick={onDelete}
                        style={{ width: 28, height: 28 }}>
              <Trash2 size={14} strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
      </div>

      {main && !tradeSide && mainTradeCard}

      {fresh ? (
        /* Note neuve : on choisit d'où l'on part, comme sur l'accueil. */
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <SourceTab active={source === "video"} onClick={() => setSource("video")}>
              <SquarePlay size={14} strokeWidth={1.75} /> Vidéo YouTube
            </SourceTab>
            <SourceTab active={source === "trade"} onClick={() => setSource("trade")}>
              <LineChart size={14} strokeWidth={1.75} /> Mon trade
            </SourceTab>
            <span style={{ ...TYPE.label, color: T.textMut, marginLeft: 6 }}>
              Étudie à partir d&apos;une vidéo, de ton propre trade, ou des deux.
            </span>
          </div>
          {source === "video" ? sourceInput : (
            <button type="button" onClick={() => setPicking("add")}
                    style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", minHeight: 44, borderRadius: 12, background: FIELD_BG, ...TYPE.callout, fontWeight: 400, color: T.textMut }}>
              <LineChart size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              Relier des trades de ton journal
            </button>
          )}
        </section>
      ) : (
        adding && sourceInput
      )}
      {error && <div role="alert" style={{ ...TYPE.label, color: T.red }}>{error}</div>}

      <MoreVideos videos={note.videos.slice(1)} onPatch={onPatch} />
      <Links note={note} onPatch={onPatch} />
      <MoreTrades ids={note.tradeIds.slice(1)} all={note.tradeIds} tradeById={tradeById} onPatch={onPatch} />

      <div style={{ height: 1, background: HAIRLINE }} />

      <StudyEditor
        ref={editor}
        key={note.id}
        content={note.content}
        onChange={(content) => onPatch({ content })}
        userId={userId}
        clock={main ? { time: () => clock.current?.time() ?? 0, playing: () => Boolean(clock.current?.playing()) } : null}
        /* Toujours actif : le réglage a quitté l'écran, et un ancien « Off »
           retenu sur l'appareil ne doit pas l'éteindre sans moyen de le rallumer. */
        stamps
        onSeek={main ? (sec) => clock.current?.seek(sec) : undefined}
      />

      {/* Captures d'avant l'éditeur en ligne : elles restent visibles, les
          nouvelles s'insèrent dans le texte. */}
      {note.images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {note.images.map(img => (
            <div key={img.id} style={{ position: "relative" }}>
              <button type="button" onClick={() => setViewer(img.url)} aria-label="Agrandir la capture"
                      style={{ all: "unset", cursor: "zoom-in", display: "block", aspectRatio: "16 / 10", borderRadius: 10, overflow: "hidden", background: FIELD_BG }}>
                <img src={img.url} alt={img.caption} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
              <IconButton tone="danger" aria-label="Retirer la capture" title="Retirer"
                          onClick={() => onPatch(n => ({ images: n.images.filter(x => x.id !== img.id) }))}
                          style={{ position: "absolute", top: 4, right: 4, background: T.white }}>
                <X size={13} strokeWidth={2} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <article style={{
      display: "grid", gap: mode === "side" ? 24 : 12, alignItems: "start", minWidth: 0,
      gridTemplateColumns: mode === "side" ? "minmax(0, 1.15fr) minmax(0, 1fr)" : tradeSide ? "minmax(0, 1.3fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
    }}>
      {/* Le lecteur est TOUJOURS le premier enfant : changer de disposition
          ne déplace pas son nœud, l'iframe n'est pas rechargée. */}
      {main && (
        <StudyVideo
          key={main.youtubeId}
          ref={clock}
          video={main}
          noteId={note.id}
          marks={marks}
          prefs={effPrefs}
          setPrefs={setPrefs}
          contained={tradeSide}
          onPosition={(sec) => onPatch(n => ({ videos: n.videos.map((v, i) => (i === 0 ? { ...v, position: sec } : v)) }), { touch: false })}
          onChange={() => { setAdding("replace"); setDraft(""); setError(""); }}
          onRemove={() => onPatch(n => ({ videos: n.videos.slice(1) }))}
        />
      )}
      {/* Deuxième enfant, après le lecteur : passer le trade à côté ne
          déplace pas le nœud du lecteur, la lecture continue. */}
      {tradeSide && mainTradeCard}
      {doc}

      {picking && (
        <TradePicker
          trades={trades}
          taken={new Set(note.tradeIds)}
          onClose={() => setPicking(null)}
          onAdd={pickTrades}
        />
      )}
      {viewer && (
        <Modal open title="Capture" onClose={() => setViewer(null)} width={1100}>
          <img src={viewer} alt="" style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }} />
        </Modal>
      )}
      <style>{`.study-ghost:hover, .study-ghost:focus-visible { background: ${FIELD_BG} !important; color: ${T.text} !important; }`}</style>
    </article>
  );
}

function TextAction({ onClick, danger = false, children }) {
  return (
    <button type="button" onClick={onClick}
            style={{ all: "unset", cursor: "pointer", ...TYPE.label, color: T.textSub }}
            onMouseEnter={(e) => { e.currentTarget.style.color = danger ? T.red : T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.textSub; }}>
      {children}
    </button>
  );
}

/* Bouton sans contour : un fond n'apparaît qu'au survol. Les contours fins à
   côté du titre faisaient des cases vides plus lourdes que leur libellé. */
function GhostButton({ onClick, title, active = false, children }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active || undefined}
            className="study-ghost"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 8px", borderRadius: 7,
              border: "none", background: active ? FIELD_BG : "transparent", cursor: "pointer", fontFamily: "inherit",
              ...TYPE.label, fontWeight: 500, color: active ? T.text : T.textSub, whiteSpace: "nowrap",
              transition: "background 120ms var(--ease-out, ease), color 120ms var(--ease-out, ease)",
            }}>
      {children}
    </button>
  );
}

/* ── Vidéos en attente ───────────────────────────────────────────────────── */

function MoreVideos({ videos, onPatch }) {
  if (videos.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...TYPE.caption2, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMut }}>Autres vidéos</span>
      {videos.map(v => (
        <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={youTubeThumb(v.youtubeId)} alt="" loading="lazy" style={{ width: 72, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          <span style={{ ...TYPE.body, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {v.title || v.youtubeId}
          </span>
          {/* Passer au lecteur = remonter en tête de liste. */}
          <TextAction onClick={() => onPatch(n => ({ videos: [v, ...n.videos.filter(x => x.id !== v.id)] }))}>Regarder</TextAction>
          <IconButton tone="danger" aria-label="Retirer la vidéo" title="Retirer"
                      onClick={() => onPatch(n => ({ videos: n.videos.filter(x => x.id !== v.id) }))}>
            <X size={13} strokeWidth={2} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function Links({ note, onPatch }) {
  if (note.links.length === 0) return null;
  const patchLink = (id, p) => onPatch(n => ({ links: n.links.map(l => (l.id === id ? { ...l, ...p } : l)) }));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {note.links.map((l, i) => (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i > 0 ? `1px solid ${HAIRLINE}` : "none" }}>
          <Link2 size={14} strokeWidth={1.75} color={T.textMut} style={{ flexShrink: 0 }} />
          <input value={l.label} onChange={(e) => patchLink(l.id, { label: e.target.value })} aria-label="Libellé du lien"
                 style={{ ...TYPE.body, color: T.text, background: "transparent", border: "none", outline: "none", padding: 0, flex: 1, minWidth: 0, fontFamily: "inherit" }} />
          <a href={l.url} target="_blank" rel="noreferrer" title={l.url} aria-label={`Ouvrir ${l.label}`}
             style={{ display: "inline-flex", color: T.textSub, padding: 6 }}>
            <ExternalLink size={13} strokeWidth={1.75} />
          </a>
          <IconButton tone="danger" aria-label="Retirer le lien" title="Retirer"
                      onClick={() => onPatch(n => ({ links: n.links.filter(x => x.id !== l.id) }))}>
            <X size={13} strokeWidth={2} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

/* ── Trades suivants ─────────────────────────────────────────────────────── */

function MoreTrades({ ids, all, tradeById, onPatch }) {
  if (ids.length === 0) return null;
  /* Le bilan porte sur TOUS les trades de la note, carte comprise. */
  const stats = tradeStats(all, tradeById);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ ...TYPE.label, ...TABULAR, color: T.textMut }}>
        {`${stats.count} trade${stats.count > 1 ? "s" : ""} · ${Math.round((stats.winRate ?? 0) * 100)} % gagnants · ${fmtMoney(stats.pnl)}`}
      </div>
      {ids.map((id, i) => {
        const tr = tradeById.get(id);
        const pnl = tr ? pnlOf(tr) : 0;
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", borderTop: i > 0 ? `1px solid ${HAIRLINE}` : "none" }}>
            {tr ? (
              <>
                <span style={{ ...TYPE.callout, color: T.text, minWidth: 56 }}>{tr.symbol || "—"}</span>
                <span style={{ ...TYPE.label, color: T.textSub, minWidth: 40 }}>{sideOf(tr)}</span>
                <span style={{ ...TYPE.label, color: T.textMut, flex: 1, whiteSpace: "nowrap" }}>{fmtDay(dayOf(tr))}</span>
                <span style={{ ...TYPE.callout, ...TABULAR, fontWeight: 600, color: pnl > 0 ? T.green : pnl < 0 ? T.red : T.textMut }}>{fmtMoney(pnl)}</span>
              </>
            ) : (
              <span style={{ ...TYPE.label, color: T.textMut, flex: 1 }}>Trade supprimé du journal</span>
            )}
            {/* Mettre en carte = remonter en tête. */}
            {tr && <TextAction onClick={() => onPatch(n => ({ tradeIds: [id, ...n.tradeIds.filter(x => x !== id)] }))}>Étudier</TextAction>}
            <IconButton aria-label="Délier le trade" title="Délier"
                        onClick={() => onPatch(n => ({ tradeIds: n.tradeIds.filter(x => x !== id) }))}>
              <X size={13} strokeWidth={2} />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
