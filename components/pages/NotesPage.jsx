"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Search, Trash2, Tag as TagIcon, Sparkles, X, ImagePlus, Pin, PinOff, PenLine, Eye, Pencil } from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useUndo } from "@/lib/contexts/UndoContext";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { t, useLang } from "@/lib/i18n";
import { T as BaseT } from "@/lib/ui/tokens";
import DrawingCanvas, { strokeMaxY } from "@/components/notes/DrawingCanvas";
import DrawingToolbar from "@/components/notes/DrawingToolbar";
import { htmlToMarkdown, htmlHasStructure } from "@/lib/ui/clipboardMarkdown";

// KaTeX (~280 ko) n'est téléchargé qu'à la première ouverture de l'aperçu.
const NotePreview = dynamic(() => import("@/components/notes/NotePreview"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 20, fontSize: 13, color: "var(--color-text-muted, #6B6B6B)" }}>
      Rendu des formules…
    </div>
  ),
});

const T = { ...BaseT };

const STORAGE_KEY = "tr4de_notes";

const TAG_RE = /#([a-zA-Z][a-zA-Z0-9_-]*)/g;

function parseTags(text) {
  const out = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) out.push(m[1].toLowerCase());
  return Array.from(new Set(out));
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Compresse une image (File ou Blob) en data URL JPEG, max 1200px de large.
async function fileToCompressedDataUrl(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const MAX = 1200;
  let { width, height } = img;
  if (width > MAX) { height = Math.round(height * (MAX / width)); width = MAX; }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  // PNG si déjà PNG et petit, sinon JPEG q=0.85
  const isPng = file.type === "image/png" && width <= 800;
  return canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.85);
}

function renderHighlighted(text) {
  let html = "";
  let last = 0;
  const re = /#([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    html += escapeHtml(text.slice(last, m.index));
    html += `<span style="color:#3B82F6">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  html += escapeHtml(text.slice(last));
  // ensure trailing newline keeps height
  if (html.endsWith("\n")) html += " ";
  return html;
}

export default function NotesPage() {
  useLang();
  const [notes, setNotes] = useCloudState(STORAGE_KEY, "notes", []);
  const { pushUndo } = useUndo();
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState("");

  // Aperçu formaté (markdown + formules LaTeX rendues) vs édition du source.
  const [preview, setPreview] = useState(false);

  const createNote = () => {
    // Flush la note courante AVANT toute autre mise à jour, sinon le batching
    // de React peut déclencher l'update de draftRef avant l'effet sur
    // selectedId, et la note précédente serait sauvegardée vide.
    if (selectedIdRef.current) flushSave(selectedIdRef.current, draftRef.current);
    const note = { id: Date.now() + Math.random(), content: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setNotes(prev => [note, ...prev]);
    setSelectedId(note.id);
    setPreview(false); // une note vide n'a rien à afficher en aperçu
  };

  const selected = notes.find(n => n.id === selectedId);

  // Refs to flush pending saves on selection change / unmount
  const draftRef = useRef("");
  const selectedIdRef = useRef(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const flushSave = (id, content) => {
    if (!id) return;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, content, updatedAt: new Date().toISOString() } : n));
  };

  const fileInputRef = useRef(null);

  const addImagesToSelected = async (files) => {
    if (!selectedId || !files || files.length === 0) return;
    const imgs = [];
    for (const f of files) {
      if (!f.type || !f.type.startsWith("image/")) continue;
      try {
        const url = await fileToCompressedDataUrl(f);
        imgs.push({ id: Date.now() + Math.random(), src: url, addedAt: new Date().toISOString() });
      } catch (e) {
        console.warn("Image upload failed:", e);
      }
    }
    if (imgs.length === 0) return;
    setNotes(prev => prev.map(n => n.id === selectedId
      ? { ...n, images: [...(n.images || []), ...imgs], updatedAt: new Date().toISOString() }
      : n));
  };

  const removeImage = (imgId) => {
    if (!selectedId) return;
    setNotes(prev => prev.map(n => n.id === selectedId
      ? { ...n, images: (n.images || []).filter(im => im.id !== imgId), updatedAt: new Date().toISOString() }
      : n));
  };

  // Sync draft <-> selected (loaded from picked note) + flush previous note
  useEffect(() => {
    const prevId = selectedIdRef.current;
    if (prevId && prevId !== selectedId) {
      // Flush the previous note's draft synchronously before switching
      flushSave(prevId, draftRef.current);
    }
    selectedIdRef.current = selectedId;
    const cur = notes.find(n => n.id === selectedId);
    setDraft(cur ? cur.content : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Auto-save current draft (debounced 400ms)
  useEffect(() => {
    if (!selectedId) return;
    const id = setTimeout(() => flushSave(selectedId, draft), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Flush on unmount (page change / reload close)
  useEffect(() => {
    return () => {
      if (selectedIdRef.current) flushSave(selectedIdRef.current, draftRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePin = (id) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() } : n));
  };

  const removeNote = (id) => {
    const snapshot = notes.find(n => n.id === id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (snapshot) {
      pushUndo({
        label: "Suppression de la note",
        undo: async () => { setNotes(prev => [snapshot, ...prev]); setSelectedId(snapshot.id); },
        redo: async () => { setNotes(prev => prev.filter(n => n.id !== snapshot.id)); if (selectedId === snapshot.id) setSelectedId(null); },
      });
    }
  };

  // Compte le nb d'usage de chaque tag (pour trier les suggestions du plus
  // utilisé au moins utilisé).
  const tagCounts = useMemo(() => {
    const counts = {};
    notes.forEach(n => parseTags(n.content).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    return counts;
  }, [notes]);

  const allTags = useMemo(() => {
    return Object.keys(tagCounts).sort((a, b) => (tagCounts[b] - tagCounts[a]) || a.localeCompare(b));
  }, [tagCounts]);

  // Détecte si le curseur est en train d'écrire un tag, et renvoie {prefix, start}
  // ou null. `start` est l'index du `#`, `prefix` le mot tapé après (sans #).
  const detectTagAtCursor = (text, caret) => {
    if (caret == null) return null;
    let i = caret - 1;
    while (i >= 0) {
      const c = text[i];
      if (c === "#") {
        // Vérifie que le # est en début de ligne ou précédé d'un espace.
        const prev = i > 0 ? text[i - 1] : " ";
        if (prev !== " " && prev !== "\n" && prev !== "\t") return null;
        const prefix = text.slice(i + 1, caret);
        if (prefix.length === 0) return { prefix: "", start: i };
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(prefix)) return null;
        return { prefix, start: i };
      }
      if (!/[a-zA-Z0-9_-]/.test(c)) return null;
      i--;
    }
    return null;
  };

  const [tagSuggest, setTagSuggest] = useState(null); // { prefix, start, candidates: [tag] }
  const textareaRef = useRef(null);

  const updateTagSuggest = (text, caret) => {
    const det = detectTagAtCursor(text, caret);
    if (!det) { setTagSuggest(null); return; }
    const lower = det.prefix.toLowerCase();
    // candidates : tags existants commençant par le préfixe (insensible à la casse),
    // triés par nb d'usage desc puis alpha. On exclut le tag exactement égal au
    // préfixe (rien à compléter).
    const cand = allTags
      .filter(t => t.startsWith(lower) && t !== lower)
      .sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0) || a.localeCompare(b))
      .slice(0, 5);
    if (cand.length === 0) { setTagSuggest(null); return; }
    setTagSuggest({ prefix: det.prefix, start: det.start, candidates: cand });
  };

  const acceptTagSuggestion = () => {
    if (!tagSuggest || tagSuggest.candidates.length === 0) return false;
    const ta = textareaRef.current;
    if (!ta) return false;
    const tag = tagSuggest.candidates[0];
    const caret = ta.selectionStart;
    const before = draft.slice(0, tagSuggest.start);
    const after = draft.slice(caret);
    const insertion = `#${tag} `;
    const next = before + insertion + after;
    setDraft(next);
    const pos = (before + insertion).length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
      }
    });
    setTagSuggest(null);
    return true;
  };

  // ------------------------------------------------------------- dessin
  // Le dessin est stocké dans la note : { strokes: [...], h } où `h` est la
  // hauteur réservée au canevas (permet de dessiner en dessous du texte).
  const [drawMode, setDrawMode] = useState(false);
  const [tool, setTool] = useState("pen");
  const [inkKey, setInkKey] = useState("ink");
  const [sizeKey, setSizeKey] = useState("m");
  const scrollRef = useRef(null);
  // Piles d'annulation propres au dessin (snapshots de la liste de traits).
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const drawing = selected?.drawing || null;
  const strokes = drawing?.strokes || [];
  const drawH = drawing?.h || 0;

  // Miroir synchrone des traits : plusieurs traits peuvent être validés avant
  // que React n'ait re-rendu (dessin rapide, gomme en glissé), et l'historique
  // d'annulation doit partir de l'état réel, pas de celui du dernier rendu.
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  // Écrit le dessin de la note courante. `next` reçoit le dessin actuel.
  const updateDrawing = useCallback((next) => {
    const id = selectedIdRef.current;
    if (!id) return;
    setNotes(prev => prev.map(n => {
      if (n.id !== id) return n;
      const cur = n.drawing || { strokes: [], h: 0 };
      const d = next(cur);
      const empty = !d || ((d.strokes || []).length === 0 && !d.h);
      const { drawing: _drop, ...rest } = n;
      return empty
        ? { ...rest, updatedAt: new Date().toISOString() }
        : { ...rest, drawing: d, updatedAt: new Date().toISOString() };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNotes]);

  const pushDrawHistory = useCallback((prevStrokes) => {
    setUndoStack(s => [...s.slice(-39), prevStrokes]);
    setRedoStack([]);
  }, []);

  const commitStroke = useCallback((stroke) => {
    const before = strokesRef.current;
    pushDrawHistory(before);
    const next = [...before, stroke];
    strokesRef.current = next;
    updateDrawing(cur => ({
      ...cur,
      strokes: next,
      // Réserve juste ce qu'il faut pour ne pas rogner un trait tracé bas.
      h: Math.max(cur.h || 0, Math.ceil(strokeMaxY(stroke) + 24)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateDrawing, pushDrawHistory]);

  // `firstOfDrag` regroupe tout un passage de gomme en une seule annulation.
  const eraseStrokes = useCallback((ids, firstOfDrag) => {
    const set = new Set(ids);
    const before = strokesRef.current;
    if (!before.some(s => set.has(s.id))) return;
    if (firstOfDrag) pushDrawHistory(before);
    const next = before.filter(s => !set.has(s.id));
    strokesRef.current = next;
    updateDrawing(cur => ({ ...cur, strokes: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateDrawing, pushDrawHistory]);

  const restoreStrokes = (list) => {
    strokesRef.current = list;
    updateDrawing(cur => ({ ...cur, strokes: list }));
  };

  const undoDraw = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(s => [...s, strokes]);
    restoreStrokes(prev);
  };

  const redoDraw = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(s => s.slice(0, -1));
    setUndoStack(s => [...s, strokes]);
    restoreStrokes(next);
  };

  const clearDraw = () => {
    const snapshot = selected?.drawing || null;
    if (!snapshot || (snapshot.strokes || []).length === 0) return;
    const noteId = selectedId;
    pushDrawHistory(snapshot.strokes);
    strokesRef.current = [];
    updateDrawing(() => ({ strokes: [], h: 0 }));
    pushUndo({
      label: "Effacement du dessin",
      undo: async () => setNotes(prev => prev.map(n => n.id === noteId ? { ...n, drawing: snapshot } : n)),
      redo: async () => setNotes(prev => prev.map(n => {
        if (n.id !== noteId) return n;
        const { drawing: _drop, ...rest } = n;
        return rest;
      })),
    });
  };

  // Ajoute une page d'espace vierge sous le contenu pour continuer un schéma.
  const extendDraw = () => {
    const el = scrollRef.current;
    const base = Math.max(drawH, el ? el.scrollHeight : 0);
    updateDrawing(cur => ({ ...cur, h: base + 420 }));
    // Double frame : le premier laisse React appliquer la nouvelle hauteur.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }));
  };

  // Historique repart de zéro à chaque note ; pas de mode dessin sans note.
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    if (!selectedId) setDrawMode(false);
  }, [selectedId]);

  // Raccourcis actifs uniquement en mode dessin (le textarea n'a plus le focus).
  // En capture : sans quoi Ctrl+Z déclencherait AUSSI l'undo global de l'app
  // (UndoContext ne s'abstient que si le focus est dans un champ éditable).
  useEffect(() => {
    if (!drawMode) return;
    const onKey = (e) => {
      if (e.key === "Escape") { exitDrawMode(); return; }
      const mod = e.ctrlKey || e.metaKey;
      const key = (e.key || "").toLowerCase();
      if (!mod || (key !== "z" && key !== "y")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (key === "y" || e.shiftKey) redoDraw(); else undoDraw();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, undoStack, redoStack, strokes]);

  const enterDrawMode = () => {
    setTagSuggest(null);
    // Le dessin est calé sur le texte source : il n'a de sens qu'en édition.
    setPreview(false);
    textareaRef.current?.blur();
    setDrawMode(true);
  };

  const exitDrawMode = () => {
    setDrawMode(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const toggleDrawMode = () => { if (drawMode) exitDrawMode(); else enterDrawMode(); };

  // ------------------------------------------------------ aperçu / édition
  const togglePreview = useCallback(() => {
    setPreview((p) => {
      const next = !p;
      if (next) {
        // On quitte l'édition : on fige le texte tout de suite (le debounce de
        // 400 ms pourrait sinon rendre un aperçu en retard d'une frappe).
        setTagSuggest(null);
        setDrawMode(false);
        if (selectedIdRef.current) flushSave(selectedIdRef.current, draftRef.current);
      } else {
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/⌘+E bascule aperçu ↔ édition, y compris depuis le textarea.
  const shortcuts = useMemo(() => [
    {
      key: "e",
      ctrlOrCmd: true,
      ignoreInInputs: false,
      handler: (e) => {
        if (!selectedIdRef.current) return;
        e.preventDefault();
        togglePreview();
      },
    },
  ], [togglePreview]);
  useKeyboardShortcuts(shortcuts);

  /**
   * Collage enrichi : quand le presse-papier contient du HTML structuré (copie
   * depuis ChatGPT, Claude, Notion, un site de cours…), on le convertit en
   * markdown au lieu de laisser le navigateur coller son `text/plain`, qui
   * aplatit les listes et recolle les items bout à bout. Les formules déjà
   * rendues sont récupérées sous leur forme LaTeX (`$…$`).
   */
  const handlePaste = (e) => {
    const cd = e.clipboardData;
    if (!cd) return;

    // 1) Images : comportement existant (pièce jointe à la note).
    const imgFiles = Array.from(cd.items || [])
      .filter(it => it.kind === "file" && it.type.startsWith("image/"))
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (imgFiles.length > 0) {
      e.preventDefault();
      addImagesToSelected(imgFiles);
      return;
    }

    // 2) Texte enrichi → markdown.
    const html = cd.getData("text/html");
    if (!html || !htmlHasStructure(html)) return;
    let md;
    try {
      md = htmlToMarkdown(html);
    } catch (err) {
      console.warn("[Notes] conversion du collage impossible:", err);
      return;
    }
    if (!md) return;
    const plain = cd.getData("text/plain") || "";
    // Formules, tableaux et titres n'existent pas dans le `text/plain` : le
    // markdown gagne toujours. Sinon, si le plain text est déjà aussi découpé,
    // il est plus fidèle (cas d'une copie de source markdown) : on ne touche à rien.
    const richOnly = /<(math|table|h[1-6])\b|mjx-container|annotation/i.test(html);
    if (!richOnly && plain.trim() && plain.split("\n").length >= md.split("\n").length) return;

    const ta = textareaRef.current;
    if (!ta) return;
    e.preventDefault();

    // Un bloc collé au milieu d'une ligne non vide part à la ligne.
    const before = draft.slice(0, ta.selectionStart);
    const needsBreak = md.includes("\n") && before.trim() && !before.endsWith("\n");
    const insertion = (needsBreak ? "\n\n" : "") + md;

    // execCommand conserve l'historique d'annulation natif du textarea (Ctrl+Z)
    // et déclenche onChange ; on ne repasse par setDraft qu'en secours.
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, insertion);
    } catch { inserted = false; }
    if (!inserted) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = draft.slice(0, start) + insertion + draft.slice(end);
      setDraft(next);
      const pos = start + insertion.length;
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos; });
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = notes.filter(n => {
      const tags = parseTags(n.content);
      if (activeTag && !tags.includes(activeTag)) return false;
      if (!q) return true;
      return n.content.toLowerCase().includes(q);
    });
    // Les notes épinglées remontent toujours en haut (tri stable : on conserve
    // l'ordre d'origine au sein de chaque groupe).
    return list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [notes, query, activeTag]);

  const firstLine = (content) => (content || "").split("\n").find(l => l.trim()) || "(Sans titre)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "calc(100vh - 120px)" }} className="anim-1 tr4de-notes-page">
      {/* Responsive: en dessous de 900px on passe en stack vertical
          (liste au-dessus, éditeur en dessous) ; en dessous de 600px la page
          n'a plus de hauteur fixe pour pouvoir scroller naturellement. */}
      <style>{`
        @media (max-width: 900px) {
          .tr4de-notes-layout {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto 1fr;
          }
          .tr4de-notes-list { max-height: 260px; }
        }
        @media (max-width: 600px) {
          .tr4de-notes-page {
            height: auto !important;
            min-height: calc(100vh - 120px);
          }
          .tr4de-notes-layout { gap: 10px !important; }
          .tr4de-notes-list { max-height: 220px; }
          .tr4de-notes-editor { min-height: 60vh; }
        }
        @media (max-width: 900px) {
          .tr4de-draw-hint { display: none; }
        }
        @media (max-width: 480px) {
          .tr4de-notes-newbtn-label { display: none; }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={createNote}
          style={{ marginLeft: "auto", padding: "7px 16px", height: 34, borderRadius: 999, background: T.text, border: `1px solid ${T.text}`, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} strokeWidth={2} /> <span className="tr4de-notes-newbtn-label">Nouvelle note</span>
        </button>
        <div id="tr4de-page-header-slot" />
      </div>

      <div className="tr4de-notes-layout" style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 12, flex: 1, minHeight: 0 }}>
        {/* Left : list */}
        <div className="tr4de-notes-list" style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Search */}
          <div style={{ padding: 10, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ position: "relative" }}>
              <Search size={13} strokeWidth={1.75} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textMut }} />
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher..."
                style={{ width: "100%", padding: "8px 12px 8px 30px", border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", fontSize: 13, outline: "none", fontFamily: "inherit", color: T.text, background: T.white }} />
            </div>
            {allTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {activeTag && (
                  <button onClick={() => setActiveTag(null)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.white, fontSize: 10, cursor: "pointer", color: T.textSub, fontFamily: "inherit" }}>
                    <X size={9} /> clear
                  </button>
                )}
                {allTags.map(tag => (
                  <button key={tag} onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                    style={{
                      padding: "3px 8px", borderRadius: 999,
                      border: `1px solid ${activeTag === tag ? T.text : T.border}`,
                      background: activeTag === tag ? T.text : T.white,
                      color: activeTag === tag ? T.white : T.textSub,
                      fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    }}>
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: T.textSub, fontSize: 12 }}>
                {notes.length === 0 ? "Aucune note encore" : "Rien ne correspond"}
              </div>
            ) : filtered.map((n, i) => {
              const tags = parseTags(n.content);
              return (
                <div key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  style={{
                    padding: "10px 12px", borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : "none",
                    cursor: "pointer",
                    background: selectedId === n.id ? T.accentBg : "transparent",
                  }}
                  onMouseEnter={(e) => { if (selectedId !== n.id) e.currentTarget.style.background = "var(--color-hover-bg, #F0F0F0)"; }}
                  onMouseLeave={(e) => { if (selectedId !== n.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                    {n.pinned && <Pin size={11} strokeWidth={2} style={{ flexShrink: 0, color: T.textMut, fill: T.textMut }} />}
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firstLine(n.content)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: T.textMut }}>{new Date(n.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                    {(n.drawing?.strokes || []).length > 0 && (
                      <PenLine size={10} strokeWidth={2} style={{ color: T.textMut, flexShrink: 0 }} aria-label="Contient un dessin" />
                    )}
                    {tags.slice(0, 3).map(t => (
                      <span key={t} style={{ fontSize: 9, color: T.blue, background: `color-mix(in srgb, ${T.blue} 8%, transparent)`, padding: "1px 6px", borderRadius: 999, fontWeight: 500 }}>#{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right : editor */}
        <div className="tr4de-notes-editor" style={{ position: "relative", background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: selected ? 0 : 20, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          {selected ? (
            <>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: T.textMut }}>Mis à jour {new Date(selected.updatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <button onClick={togglePreview}
                    aria-label={preview ? "Modifier la note" : "Afficher le rendu formaté"}
                    aria-pressed={preview}
                    title={preview ? "Modifier (Ctrl+E)" : "Aperçu formaté : formules $…$, titres, listes (Ctrl+E)"}
                    style={{
                      height: 28, padding: "0 10px", borderRadius: 999,
                      background: preview ? T.text : "transparent",
                      border: `1px solid ${preview ? T.text : T.border}`,
                      color: preview ? "#fff" : T.textSub,
                      cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                      display: "inline-flex", alignItems: "center", gap: 5, marginRight: 4,
                    }}
                  >
                    {preview ? <Pencil size={12} strokeWidth={1.75} /> : <Eye size={12} strokeWidth={1.75} />}
                    {preview ? "Modifier" : "Aperçu"}
                  </button>
                  <button onClick={() => togglePin(selected.id)}
                    aria-label={selected.pinned ? "Désépingler la note" : "Épingler la note en haut"}
                    aria-pressed={!!selected.pinned}
                    title={selected.pinned ? "Désépingler" : "Épingler en haut"}
                    style={{ width: 28, height: 28, background: selected.pinned ? T.accentBg : "transparent", border: "none", color: selected.pinned ? T.text : T.textMut, cursor: "pointer", borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = selected.pinned ? T.accentBg : "transparent"; e.currentTarget.style.color = selected.pinned ? T.text : T.textMut; }}
                  >
                    {selected.pinned ? <PinOff size={14} strokeWidth={1.75} /> : <Pin size={14} strokeWidth={1.75} />}
                  </button>
                  <button onClick={toggleDrawMode}
                    aria-label={drawMode ? "Quitter le mode dessin" : "Dessiner sur la note"}
                    aria-pressed={drawMode}
                    title={drawMode ? "Quitter le mode dessin (Échap)" : "Dessiner / annoter (schémas, flèches, surlignage)"}
                    style={{ width: 28, height: 28, background: drawMode ? T.text : "transparent", border: "none", color: drawMode ? T.white : T.textMut, cursor: "pointer", borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={(e) => { if (drawMode) return; e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                    onMouseLeave={(e) => { if (drawMode) return; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}
                  >
                    <PenLine size={14} strokeWidth={1.75} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => { addImagesToSelected(Array.from(e.target.files || [])); e.target.value = ""; }}
                  />
                  <button onClick={() => fileInputRef.current?.click()}
                    aria-label="Ajouter une image"
                    title="Ajouter une image (ou colle-la directement)"
                    style={{ width: 28, height: 28, background: "transparent", border: "none", color: T.textMut, cursor: "pointer", borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}
                  >
                    <ImagePlus size={14} strokeWidth={1.75} />
                  </button>
                  <button onClick={() => removeNote(selected.id)}
                    aria-label="Supprimer la note"
                    style={{ width: 28, height: 28, background: "transparent", border: "none", color: T.textMut, cursor: "pointer", borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}
                    title="Supprimer"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              {(selected.images || []).length > 0 && (
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(selected.images || []).map(img => (
                    <div key={img.id} style={{ position: "relative", width: 96, height: 96, borderRadius: "var(--radius-card)", overflow: "hidden", border: `1px solid ${T.border}`, background: "var(--color-hover-bg, #F0F0F0)" }}>
                      <img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "zoom-in" }}
                        onClick={() => window.open(img.src, "_blank")} />
                      <button onClick={() => removeImage(img.id)}
                        aria-label="Retirer l'image"
                        title="Retirer l'image"
                        style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(13,13,13,0.72)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <X size={12} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {drawMode && (
                <DrawingToolbar
                  tool={tool} setTool={setTool}
                  inkKey={inkKey} setInkKey={setInkKey}
                  sizeKey={sizeKey} setSizeKey={setSizeKey}
                  canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
                  onUndo={undoDraw} onRedo={redoDraw}
                  onClear={clearDraw} onExtend={extendDraw}
                  onClose={exitDrawMode}
                  strokeCount={strokes.length}
                />
              )}
              {/* Zone d'écriture + dessin : c'est le conteneur qui scrolle (et
                  non le textarea), pour que le canvas reste aligné au texte. */}
              <div ref={scrollRef} style={{ position: "relative", flex: 1, minHeight: 0, overflow: "auto" }}>
              {preview ? (
                <NotePreview content={draft} onDoubleClick={togglePreview} />
              ) : (
              <div style={{ position: "relative", minHeight: drawH ? `max(100%, ${drawH}px)` : "100%" }}>
                <div
                  aria-hidden
                  style={{
                    padding: 20,
                    fontSize: 14, lineHeight: 1.6, fontFamily: "inherit",
                    color: T.text, whiteSpace: "pre-wrap", wordWrap: "break-word",
                    pointerEvents: "none",
                  }}
                  dangerouslySetInnerHTML={{ __html: draft ? renderHighlighted(draft) : `<span style="color:${T.textMut}">Commence à écrire... utilise #tag pour catégoriser.</span>` }}
                />
              <textarea
                ref={textareaRef}
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // Recalcule les suggestions de tag après cette frappe.
                  // selectionStart de target n'est pas fiable dans onChange selon
                  // le browser ; on utilise requestAnimationFrame pour lire après.
                  const next = e.target.value;
                  requestAnimationFrame(() => {
                    const ta = textareaRef.current;
                    if (ta) updateTagSuggest(next, ta.selectionStart);
                  });
                }}
                onSelect={(e) => updateTagSuggest(e.currentTarget.value, e.currentTarget.selectionStart)}
                onBlur={() => setTimeout(() => setTagSuggest(null), 100)}
                onPaste={handlePaste}
                onScroll={(e) => {
                  // Le textarea ne scrolle pas lui-même (overflow hidden), mais
                  // le navigateur le fait défiler pour garder le caret visible.
                  // On reporte ce delta sur le conteneur, sinon le texte se
                  // décalerait du calque de coloration et du dessin.
                  const ta = e.currentTarget;
                  const sc = scrollRef.current;
                  if (!sc) return;
                  if (ta.scrollTop !== 0) { sc.scrollTop += ta.scrollTop; ta.scrollTop = 0; }
                  if (ta.scrollLeft !== 0) { sc.scrollLeft += ta.scrollLeft; ta.scrollLeft = 0; }
                }}
                onKeyDown={(e) => {
                  // Autocomplete de tag : Entrée ou Tab insère la suggestion
                  // courante. Échap masque les suggestions.
                  if (tagSuggest && tagSuggest.candidates.length > 0) {
                    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                      e.preventDefault();
                      acceptTagSuggestion();
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setTagSuggest(null);
                      return;
                    }
                  }
                  // Backspace : supprimer un bloc d'indentation (jusqu'à 8
                  // espaces) d'un seul coup, comme s'il s'agissait d'une
                  // tabulation, au lieu d'espace par espace.
                  if (e.key === "Backspace") {
                    const ta = e.currentTarget;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    if (start === end && start > 0) {
                      const lineStart = draft.lastIndexOf("\n", start - 1) + 1;
                      const prefix = draft.slice(lineStart, start);
                      // Uniquement dans la zone d'indentation en début de ligne
                      if (prefix.length > 0 && /^ +$/.test(prefix)) {
                        const n = prefix.length;
                        const remove = n % 8 === 0 ? 8 : n % 8;
                        e.preventDefault();
                        const next = draft.slice(0, start - remove) + draft.slice(start);
                        setDraft(next);
                        const pos = start - remove;
                        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos; });
                        return;
                      }
                    }
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const ta = e.currentTarget;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    const indent = "        ";
                    if (e.shiftKey) {
                      // Outdent: remove up to 8 leading spaces (or 1 tab) from line start
                      const lineStart = draft.lastIndexOf("\n", start - 1) + 1;
                      const before = draft.slice(0, lineStart);
                      const lineRest = draft.slice(lineStart);
                      let removed = 0;
                      let stripped = lineRest;
                      if (stripped.startsWith("\t")) { stripped = stripped.slice(1); removed = 1; }
                      else {
                        const m = stripped.match(/^ {1,8}/);
                        if (m) { removed = m[0].length; stripped = stripped.slice(removed); }
                      }
                      if (removed > 0) {
                        const next = before + stripped;
                        setDraft(next);
                        const pos = Math.max(lineStart, start - removed);
                        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos; });
                      }
                    } else {
                      const next = draft.slice(0, start) + indent + draft.slice(end);
                      setDraft(next);
                      const pos = start + indent.length;
                      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos; });
                    }
                  }
                }}
                placeholder=""
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  border: "none", outline: "none", overflow: "hidden",
                  padding: 20, fontSize: 14, lineHeight: 1.6, fontFamily: "inherit",
                  color: "transparent", caretColor: T.text, background: "transparent", resize: "none",
                  WebkitTextFillColor: "transparent",
                }}
              />
              <DrawingCanvas
                strokes={strokes}
                active={drawMode}
                tool={tool}
                inkKey={inkKey}
                sizeKey={sizeKey}
                onCommitStroke={commitStroke}
                onEraseStrokes={eraseStrokes}
                scrollRef={scrollRef}
              />
              </div>
              )}
              </div>
              {tagSuggest && tagSuggest.candidates.length > 0 && (
                <div style={{
                  position: "absolute", left: 12, right: 12, bottom: 10,
                  background: T.white, border: `1px solid ${T.border}`, borderRadius: 10,
                  boxShadow: "var(--elev-overlay)",
                  padding: "6px 8px",
                  display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
                  fontSize: 12, fontFamily: "inherit", zIndex: 5,
                }}
                onMouseDown={(e) => e.preventDefault()}>
                  <span style={{ color: T.textMut, fontSize: 11, marginRight: 2 }}>↩ pour compléter</span>
                  {tagSuggest.candidates.map((tag, i) => (
                    <button key={tag} type="button"
                      onClick={() => {
                        // Permet aussi de cliquer une suggestion (pas que la 1ʳᵉ).
                        const ta = textareaRef.current;
                        if (!ta) return;
                        const caret = ta.selectionStart;
                        const before = draft.slice(0, tagSuggest.start);
                        const after = draft.slice(caret);
                        const insertion = `#${tag} `;
                        const next = before + insertion + after;
                        setDraft(next);
                        const pos = (before + insertion).length;
                        requestAnimationFrame(() => {
                          if (textareaRef.current) {
                            textareaRef.current.focus();
                            textareaRef.current.selectionStart = pos;
                            textareaRef.current.selectionEnd = pos;
                          }
                        });
                        setTagSuggest(null);
                      }}
                      style={{
                        padding: "3px 10px", borderRadius: 999,
                        border: `1px solid ${i === 0 ? T.text : T.border}`,
                        background: i === 0 ? T.text : T.white,
                        color: i === 0 ? "#fff" : T.blue,
                        fontWeight: 600, fontSize: 11, cursor: "pointer",
                        fontFamily: "inherit",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}>
                      #{tag}
                      <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 500 }}>
                        {tagCounts[tag] || 0}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: T.textSub, gap: 8 }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--radius-card)", background: T.accentBg }}>
                <Sparkles size={20} strokeWidth={1.75} color={T.textSub} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Capture tes idées</div>
              <div style={{ fontSize: 12, textAlign: "center", maxWidth: 280 }}>Sélectionne une note existante ou crée-en une nouvelle. Utilise <code style={{ background: T.accentBg, padding: "1px 4px", borderRadius: "var(--radius-field)" }}>#tag</code> pour trier.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
