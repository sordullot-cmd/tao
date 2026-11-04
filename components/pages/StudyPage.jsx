"use client";

/**
 * Page « Étude » — ce qu'on apprend du trading, rangé en dossiers.
 *
 * Trois vues dans une colonne centrale étroite, faite pour lire :
 *   - l'accueil : partir d'une source (vidéo YouTube, trade du journal), le
 *     temps d'étude de la semaine, les notes récentes ;
 *   - un dossier : son nom, ses sous-dossiers en tuiles, ses notes ;
 *   - une note : texte, vidéos, liens, captures, trades reliés.
 * La barre du haut porte l'historique, le fil d'Ariane, la recherche et
 * « Nouvelle note » ; dessous, les dossiers racines en onglets nommés.
 *
 * Le modèle vit dans `lib/study/model.ts`. Le magasin entier tient dans une clé
 * de `useCloudState` — pas de migration SQL.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Plus, X } from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { useUndo } from "@/lib/contexts/UndoContext";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";
import { PillButton, IconButton } from "@/components/ui/form";
import {
  emptyStudy, normalizeStudy, emptyNote, newId, folderPath, removeFolder, canMoveFolder,
  searchNotes, closeSession, addStudySpan,
} from "@/lib/study/model";
import FolderBar from "@/components/study/FolderBar";
import FolderView, { LooseView, LOOSE_LABEL } from "@/components/study/FolderView";
import StudyHome from "@/components/study/StudyHome";
import NoteRows from "@/components/study/NoteRows";
import StudyNoteView, { fetchYouTubeTitle } from "@/components/study/StudyNoteView";
import { fmtDay, dayOf } from "@/components/study/tradeFormat";
import { usePlayerPrefs } from "@/components/study/playerPrefs";

const STORAGE_KEY = "tao_study";
const CLOUD_KEY = "study";
const HOME = { kind: "home" };
const LOOSE = { kind: "loose" };

/** @param {{ trades?: any[], strategies?: any[] }} props — les trades du journal et les stratégies, passés par la coquille. */
export default function StudyPage({ trades = [], strategies = [] }) {
  const [raw, setRaw, hydrated] = useCloudState(STORAGE_KEY, CLOUD_KEY, emptyStudy());
  const store = useMemo(() => normalizeStudy(raw), [raw]);
  const { pushUndo } = useUndo();
  const { user } = useAuth();
  const mobile = useIsMobile();
  const [playerPrefs] = usePlayerPrefs();

  /* Historique propre à la page : la coquille n'a qu'une entrée pour toute
     l'Étude, et les flèches ‹ › servent à revenir d'une note au dossier d'où
     on l'a ouverte — pas à quitter la page. */
  const [nav, setNav] = useState({ stack: [HOME], index: 0 });
  const [renaming, setRenaming] = useState(null);
  const [query, setQuery] = useState(null); // null = recherche fermée
  const [now, setNow] = useState(() => new Date());

  /* Toute écriture repart du magasin NORMALISÉ : `prev` est le JSON brut du
     cache, qui peut venir d'une version antérieure du modèle. */
  const update = useCallback((fn) => setRaw(prev => fn(normalizeStudy(prev))), [setRaw]);

  /* Une pulsation par demi-minute suffit à garder à jour le temps d'étude de
     la semaine affiché sur l'accueil. */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  /* Temps d'étude compté tout seul : le temps passé sur la page, onglet
     visible, tant qu'on n'est pas parti faire autre chose. Sans bouton à
     presser, l'accueil (« Cette semaine ») restait figé à zéro.

     Inactif = ni clavier, ni souris, ni défilement depuis IDLE_MS — sauf si
     le focus est dans le lecteur YouTube : regarder une vidéo sans toucher
     à rien, c'est encore étudier, et l'iframe ne nous transmet aucun
     évènement. Écriture toutes les minutes plutôt qu'au départ seul : une
     fenêtre fermée brutalement ne perd que la dernière minute. */
  const updateRef = useRef(update);
  useEffect(() => { updateRef.current = update; }, [update]);
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return undefined;
    const IDLE_MS = 5 * 60 * 1000;
    let lastInput = Date.now();
    let segStart = null;
    let lastActive = 0;
    const isActive = () => document.visibilityState === "visible"
      && (Date.now() - lastInput < IDLE_MS || document.activeElement?.tagName === "IFRAME");
    const commit = (end) => {
      if (segStart == null) return;
      const from = segStart;
      updateRef.current(s => addStudySpan(s, from, end));
    };
    const tick = () => {
      const now = Date.now();
      if (isActive()) {
        if (segStart == null) segStart = now;
        lastActive = now;
        if (now - segStart >= 60000) { commit(now); segStart = now; }
      } else if (segStart != null) {
        commit(lastActive);
        segStart = null;
      }
    };
    const onInput = () => { lastInput = Date.now(); if (segStart == null) tick(); };
    const onHide = () => { if (document.visibilityState !== "visible") tick(); };
    const events = ["pointerdown", "keydown", "wheel", "mousemove", "touchstart"];
    events.forEach(ev => window.addEventListener(ev, onInput, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", onHide);
    /* Fermeture : l'onglet peut encore se dire « visible », on écrit tel quel. */
    const onLeave = () => { if (segStart != null) { commit(Date.now()); segStart = null; } };
    window.addEventListener("pagehide", onLeave);
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      clearInterval(id);
      events.forEach(ev => window.removeEventListener(ev, onInput, { capture: true }));
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      if (segStart != null) commit(Date.now());
    };
  }, [hydrated]);

  /* Le bouton « Fermer la porte » a quitté l'écran : une séance restée ouverte
     (lancée avant, ou sur un autre appareil) compterait sans fin, sans plus
     aucun moyen de l'arrêter. On la clôt dès qu'on la voit. */
  useEffect(() => {
    if (hydrated && store.running) update(s => closeSession(s, new Date()));
  }, [hydrated, store.running, update]);

  /* Une vue dont l'objet a disparu (supprimé ailleurs) retombe sur l'accueil
     plutôt que sur un écran vide sans issue. */
  const rawView = nav.stack[nav.index];
  const folder = rawView.kind === "folder" ? store.folders.find(f => f.id === rawView.id) : undefined;
  const note = rawView.kind === "note" ? store.notes.find(n => n.id === rawView.id) : undefined;
  const view = folder ? rawView : note ? rawView : rawView.kind === "loose" ? LOOSE : HOME;

  const go = (v) => {
    setQuery(null);
    setNav(n => {
      const cur = n.stack[n.index];
      if (cur.kind === v.kind && cur.id === v.id) return n;
      return { stack: [...n.stack.slice(0, n.index + 1), v], index: n.index + 1 };
    });
  };

  const canBack = nav.index > 0;
  const canForward = nav.index < nav.stack.length - 1;

  const folderName = (id) => store.folders.find(f => f.id === id)?.name ?? "";
  const here = view.kind === "folder" ? folder.id : view.kind === "note" ? note.folderId : null;

  /* ── Notes ── */

  const addNote = (fresh) => {
    update(s => ({ ...s, notes: [fresh, ...s.notes] }));
    go({ kind: "note", id: fresh.id });
  };

  /* `touch: false` pour ce qui n'est pas une modification de la note — la
     position de lecture d'une vidéo, sauvée en continu, ferait sinon remonter
     la note en tête des « Récents » à chaque visionnage. */
  const patchNote = useCallback((id, p, { touch = true } = {}) => update(s => ({
    ...s,
    notes: s.notes.map(n => (n.id === id
      ? { ...n, ...(typeof p === "function" ? p(n) : p), ...(touch ? { updatedAt: new Date().toISOString() } : null) }
      : n)),
  })), [update]);

  /* Déposée sur un dossier : la note change de rangement, pas de contenu —
     elle ne remonte pas dans les « Récents » pour autant. */
  const moveNote = (id, folderId) => patchNote(id, { folderId }, { touch: false });

  const fromVideo = ({ youtubeId, start }) => {
    const video = { id: newId(), youtubeId, start, title: "", position: 0 };
    const fresh = { ...emptyNote(here), videos: [video] };
    addNote(fresh);
    /* La note prend le titre de la vidéo tant qu'on ne lui en a pas donné un. */
    fetchYouTubeTitle(youtubeId).then(title => {
      if (!title) return;
      patchNote(fresh.id, n => ({
        title: n.title || title,
        videos: n.videos.map(v => (v.id === video.id && !v.title ? { ...v, title } : v)),
      }));
    });
  };

  const fromTrades = (ids) => {
    if (ids.length === 0) return;
    const first = trades.find(t => String(t.id) === ids[0]);
    const title = ids.length === 1 && first
      ? `${first.symbol || "Trade"} — ${fmtDay(dayOf(first))}`
      : `${ids.length} trades`;
    addNote({ ...emptyNote(here, title), tradeIds: ids });
  };

  const deleteNote = (target) => {
    const index = store.notes.findIndex(n => n.id === target.id);
    update(s => ({ ...s, notes: s.notes.filter(n => n.id !== target.id) }));
    go(target.folderId ? { kind: "folder", id: target.folderId } : HOME);
    pushUndo({
      label: "Suppression de la note",
      undo: async () => update(s => {
        if (s.notes.some(n => n.id === target.id)) return s;
        const notes = [...s.notes];
        notes.splice(Math.min(index, notes.length), 0, target);
        return { ...s, notes };
      }),
      redo: async () => update(s => ({ ...s, notes: s.notes.filter(n => n.id !== target.id) })),
    });
  };

  /* ── Dossiers ── */

  /* Créé « Sans titre » et ouvert, le nom sélectionné : on le tape dans la
     foulée, sans passer par une fenêtre. */
  const createFolder = (parentId) => {
    const f = { id: newId(), name: "Sans titre", parentId, createdAt: new Date().toISOString() };
    update(s => ({ ...s, folders: [...s.folders, f] }));
    setRenaming(f.id);
    go({ kind: "folder", id: f.id });
  };

  const patchFolder = (id, p) => update(s => ({
    ...s,
    folders: s.folders.map(f => (f.id === id ? { ...f, ...p } : f)),
  }));

  const deleteFolder = (target) => {
    const { folders, notes } = removeFolder(store, target.id);
    update(s => removeFolder(s, target.id).store);
    go(target.parentId ? { kind: "folder", id: target.parentId } : HOME);
    /* L'annulation remet ce qui est parti, et seulement ça : restaurer un
       instantané du magasin effacerait ce qui a été écrit depuis. */
    pushUndo({
      label: `Suppression du dossier${notes.length ? ` et de ${notes.length} note${notes.length > 1 ? "s" : ""}` : ""}`,
      undo: async () => update(s => {
        const haveF = new Set(s.folders.map(f => f.id));
        const haveN = new Set(s.notes.map(n => n.id));
        return {
          ...s,
          folders: [...s.folders, ...folders.filter(f => !haveF.has(f.id))],
          notes: [...s.notes, ...notes.filter(n => !haveN.has(n.id))],
        };
      }),
      redo: async () => update(s => removeFolder(s, target.id).store),
    });
  };

  if (useFirstLoad(hydrated, STORAGE_KEY)) {
    return <PageSkeleton variant="list" label="Étude" gap={16} toolbarRight={[132]} />;
  }

  const isNote = query === null && view.kind === "note";
  const wide = !mobile && isNote && note.videos.length > 0 && playerPrefs.mode === "side";
  const path = folderPath(store, here);
  const activeRoot = view.kind === "home" ? null : path[0]?.id ?? null;
  const results = query !== null && query.trim() ? searchNotes(store.notes, query) : null;

  /* Une note sans dossier se range sous « Feuilles volantes » : c'est là
     qu'on la retrouve, le fil d'Ariane et les onglets doivent le dire. */
  const inLoose = view.kind === "loose" || (view.kind === "note" && !note.folderId);
  const crumbs = [
    { key: "home", label: "Étude", onClick: view.kind === "home" ? null : () => go(HOME) },
    ...(inLoose ? [{ key: "loose", label: LOOSE_LABEL, onClick: view.kind === "loose" ? null : () => go(LOOSE) }] : []),
    ...path.map(f => ({ key: f.id, label: f.name, onClick: view.kind === "folder" && f.id === folder.id ? null : () => go({ kind: "folder", id: f.id }) })),
    ...(view.kind === "note" ? [{ key: "note", label: note.title || "Sans titre", onClick: null }] : []),
  ];

  const tabs = (
    <FolderBar
      store={store}
      activeRoot={activeRoot}
      home={view.kind === "home"}
      loose={inLoose}
      onLoose={() => go(LOOSE)}
      onMoveNote={moveNote}
      onHome={() => go(HOME)}
      onOpen={(id) => go({ kind: "folder", id })}
      onCreate={() => createFolder(null)}
    />
  );

  return (
    <div style={{ minHeight: "calc(100vh - 120px)" }}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: mobile ? 12 : 16 }}>
        {/* ── Barre du haut ── */}
        <header style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 40 }}>
          <IconButton aria-label="Retour" title="Retour" disabled={!canBack}
                      onClick={() => setNav(n => ({ ...n, index: Math.max(0, n.index - 1) }))}
                      style={{ opacity: canBack ? 1 : 0.35, cursor: canBack ? "pointer" : "default" }}>
            <ChevronLeft size={16} strokeWidth={1.75} />
          </IconButton>
          <IconButton aria-label="Suivant" title="Suivant" disabled={!canForward}
                      onClick={() => setNav(n => ({ ...n, index: Math.min(n.stack.length - 1, n.index + 1) }))}
                      style={{ opacity: canForward ? 1 : 0.35, cursor: canForward ? "pointer" : "default" }}>
            <ChevronRight size={16} strokeWidth={1.75} />
          </IconButton>
          <nav aria-label="Fil d'Ariane" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, marginLeft: 4 }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={c.key}>
                {i > 0 && <span aria-hidden style={{ ...TYPE.body, color: T.textMut }}>/</span>}
                {c.onClick ? (
                  <button type="button" onClick={c.onClick}
                          style={{ all: "unset", cursor: "pointer", ...TYPE.callout, fontWeight: 400, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                    {c.label}
                  </button>
                ) : (
                  <span aria-current="page" style={{ ...TYPE.callout, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                    {c.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <IconButton aria-label="Chercher une note" title="Chercher" onClick={() => setQuery(q => (q === null ? "" : null))}
                        style={query !== null ? { background: FIELD_BG, color: T.text } : undefined}>
              <Search size={15} strokeWidth={1.75} />
            </IconButton>
            <PillButton variant="secondary" compact onClick={() => addNote(emptyNote(here))}>
              <Plus size={14} strokeWidth={2} /> {mobile ? "Note" : "Nouvelle note"}
            </PillButton>
          </div>
        </header>

        {tabs}

        {/* Vidéo à côté du texte : la colonne de lecture s'élargit pour les
            deux, sinon chacun n'aurait que la moitié de 760 px. Une note seule
            prend un peu plus que l'accueil : avec vidéo et carte de trade en
            tête, 760 px laissait deux bandes vides plus larges que le texte. */}
        <main style={{ width: "100%", maxWidth: wide ? 1320 : isNote ? 880 : 760, margin: "0 auto", paddingTop: mobile || isNote ? 0 : 8, paddingBottom: 48 }}>
          {query !== null ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", minHeight: 44, borderRadius: 12, background: FIELD_BG }}>
                <Search size={15} strokeWidth={1.75} color={T.textMut} />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                       onKeyDown={(e) => { if (e.key === "Escape") setQuery(null); }}
                       placeholder="Titre, contenu, titre de vidéo…" aria-label="Recherche"
                       style={{ ...TYPE.callout, fontWeight: 400, flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.text, fontFamily: "inherit" }} />
                <IconButton aria-label="Fermer la recherche" onClick={() => setQuery(null)}><X size={14} strokeWidth={2} /></IconButton>
              </div>
              {results === null ? null : results.length === 0 ? (
                <div style={{ ...TYPE.body, color: T.textMut, padding: "8px" }}>Aucune note ne correspond.</div>
              ) : (
                <NoteRows notes={results} compact={mobile} folderOf={(n) => folderName(n.folderId)}
                          onOpen={(id) => go({ kind: "note", id })} />
              )}
            </div>
          ) : view.kind === "note" ? (
            <StudyNoteView
              key={note.id}
              note={note}
              store={store}
              trades={trades}
              userId={user?.id}
              strategies={strategies}
              onPatch={(p, o) => patchNote(note.id, p, o)}
              onDelete={() => deleteNote(note)}
            />
          ) : view.kind === "loose" ? (
            <LooseView
              store={store}
              onOpenNote={(id) => go({ kind: "note", id })}
              onCreateNote={() => addNote(emptyNote(null))}
            />
          ) : view.kind === "folder" ? (
            <FolderView
              key={folder.id}
              store={store}
              folder={folder}
              autoRename={renaming === folder.id}
              onAutoRenamed={() => setRenaming(null)}
              onRename={(name) => { patchFolder(folder.id, { name }); }}
              onMove={(parentId) => { if (canMoveFolder(store, folder.id, parentId)) patchFolder(folder.id, { parentId }); }}
              onDelete={() => deleteFolder(folder)}
              onOpenFolder={(id) => go({ kind: "folder", id })}
              onCreateFolder={() => createFolder(folder.id)}
              onOpenNote={(id) => go({ kind: "note", id })}
              onCreateNote={() => addNote(emptyNote(folder.id))}
              onMoveNote={moveNote}
            />
          ) : (
            <StudyHome
              store={store}
              now={now}
              trades={trades}
              folderOf={mobile ? undefined : (n) => folderName(n.folderId)}
              onOpen={(id) => go({ kind: "note", id })}
              onFromVideo={fromVideo}
              onFromTrades={fromTrades}
            />
          )}
        </main>
      </div>
    </div>
  );
}
