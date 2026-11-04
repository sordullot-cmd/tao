"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";
import { applySlashBlock, continueList, detectSlashAtCursor, matchSlashBlocks } from "@/lib/notes/blocks";
import { uploadPlaybookImage } from "@/lib/playbook/images";
import { chipToken, splitStamps, joinStamps, carryStamps, startedLineIndex, blockHasStamp, secondsToClock } from "@/lib/study/stamps";

/* Même moteur de rendu que la page Notes, chargé à la demande pour la même
   raison : KaTeX pèse ~280 ko et ne sert qu'à l'aperçu. */
const NotePreview = dynamic(() => import("@/components/notes/NotePreview"), {
  ssr: false,
  loading: () => <div style={{ ...TYPE.body, padding: "8px 0", color: T.textMut }}>Rendu…</div>,
});

/* Le texte d'une note d'étude se lit comme un document : 16 px, interligne
   ample. Le même gabarit sert au champ et au miroir qui mesure le caret. */
const TEXT = { ...TYPE.headline, fontWeight: 400, lineHeight: 1.65, letterSpacing: "0" };

/* Blocs propres à l'Étude, servis avant ceux de la page Notes. Le lien
   [[note]] de Notes est retiré : les notes d'étude ne se citent pas entre
   elles par titre. */
const STUDY_BLOCKS = [
  { id: "maxim", label: "Maxime", hint: "> [!maxime]", keywords: ["maxime", "regle", "lecon", "retenir", "principe"], prefix: "> [!maxime] " },
  { id: "time", label: "Repère vidéo", hint: "Alt+M", keywords: ["repere", "temps", "minutage", "video", "moment"], action: "time" },
];
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function matchBlocks(query, withVideo) {
  const q = fold(query).trim();
  const own = STUDY_BLOCKS
    .filter(b => withVideo || b.action !== "time")
    .filter(b => !q || q.split(/\s+/).every(w => `${fold(b.label)} ${b.keywords.join(" ")}`.includes(w)));
  return [...own, ...matchSlashBlocks(query, 8).filter(b => b.id !== "link")].slice(0, 8);
}

const fireAlert = (title, body) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tao:alert", { detail: { title, body, severity: "danger" } }));
  }
};

/**
 * L'éditeur d'une note d'étude : un texte sans cadre, qu'on lit rendu et qu'on
 * modifie au clic.
 *
 * Avec une vidéo (`clock`), deux gestes de plus :
 *   - horodatage : un bloc qu'on COMMENCE pendant la lecture (après une ligne
 *     vide, donc deux Entrée) prend le temps de la vidéo sur sa première
 *     ligne, rangé dans la marge — cf. `lib/study/stamps.ts`. En
 *     édition comme en lecture : le champ travaille sur le texte nu et la
 *     marge est redessinée par-dessus, sinon on verrait `{=1:30}` en bout de
 *     ligne pendant la frappe et des temps dans la marge une fois sorti ;
 *   - Alt+M : insère le moment courant comme une
 *     puce cliquable.
 * Cliquer un temps, dans la marge ou dans le texte, relance la vidéo là.
 *
 * Une capture collée part au stockage et s'insère au caret en `![](…)` :
 * l'image vit dans le texte, là où elle explique quelque chose.
 */
const StudyEditor = React.forwardRef(function StudyEditor({ content, onChange, userId, clock = null, stamps = false, onSeek = undefined }, ref) {
  const [editing, setEditing] = useState(() => !content.trim());
  const [slash, setSlash] = useState(null); // { start, items, index, top }
  const [busy, setBusy] = useState(0);
  const area = useRef(null);
  const mirror = useRef(null);
  const file = useRef(null);
  const pendingCaret = useRef(null);
  const lastCaret = useRef(null);
  const [margin, setMargin] = useState([]); // [{ top, sec, line }] en édition

  /* Le champ ne voit que le texte ; les temps de ligne vivent à côté. */
  const view = useMemo(() => splitStamps(content), [content]);
  const text = view.text;
  const emit = (next, stamps = carryStamps(view.text, view.stamps, next)) => onChange(joinStamps(next, stamps));

  /* Hauteur au contenu : la note s'allonge avec la page au lieu de défiler
     dans une boîte. */
  useLayoutEffect(() => {
    const ta = area.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    if (pendingCaret.current != null) {
      ta.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [content, editing]);

  /* Position de chaque temps dans la marge, mesurée sur le miroir : une
     ligne longue qui passe à la ligne décale toutes les suivantes. */
  const measureMargin = () => {
    const m = mirror.current;
    const ta = area.current;
    if (!m || !ta || !view.stamps.some(v => v != null)) { setMargin(prev => (prev.length ? [] : prev)); return; }
    m.style.width = `${ta.clientWidth}px`;
    const out = [];
    let pos = 0;
    text.split("\n").forEach((line, i) => {
      if (view.stamps[i] != null && line.trim()) {
        m.textContent = text.slice(0, pos);
        const mark = document.createElement("span");
        mark.textContent = "\u200b";
        m.appendChild(mark);
        out.push({ top: mark.offsetTop, sec: view.stamps[i], line: i });
      }
      pos += line.length + 1;
    });
    setMargin(out);
  };
  useLayoutEffect(() => {
    if (!editing) return undefined;
    measureMargin();
    const ta = area.current;
    if (!ta || typeof ResizeObserver === "undefined") return undefined;
    let w = ta.clientWidth;
    const ro = new ResizeObserver(() => { if (ta.clientWidth !== w) { w = ta.clientWidth; measureMargin(); } });
    ro.observe(ta);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mesure liée au texte affiché
  }, [view, editing]);

  useEffect(() => {
    if (editing && area.current && document.activeElement !== area.current && text.trim()) {
      area.current.focus();
      const end = area.current.value.length;
      area.current.setSelectionRange(end, end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au passage en édition seulement
  }, [editing]);

  /** Hauteur du caret dans le champ, mesurée sur un miroir : un calcul par
   *  numéro de ligne se tromperait dès qu'un paragraphe passe à la ligne. */
  const caretTop = (text, pos) => {
    const m = mirror.current;
    if (!m || !area.current) return 0;
    m.style.width = `${area.current.clientWidth}px`;
    m.textContent = text.slice(0, pos);
    const mark = document.createElement("span");
    mark.textContent = "​";
    m.appendChild(mark);
    return mark.offsetTop + mark.offsetHeight;
  };

  const write = (next, caret) => {
    pendingCaret.current = caret;
    emit(next);
  };

  /** Insère au caret (ou à la dernière position connue, si le champ n'a plus
   *  le focus). */
  const insertInline = (snippet) => {
    const ta = area.current;
    const pos = ta && document.activeElement === ta ? ta.selectionStart : (lastCaret.current ?? text.length);
    const pad = pos > 0 && !/\s/.test(text[pos - 1]) ? " " : "";
    setEditing(true);
    write(text.slice(0, pos) + pad + snippet + " " + text.slice(pos), pos + pad.length + snippet.length + 1);
  };

  const insertBlock = (snippet) => {
    const ta = area.current;
    const pos = ta ? ta.selectionStart : text.length;
    const lead = pos > 0 && text[pos - 1] !== "\n" ? "\n" : "";
    write(text.slice(0, pos) + lead + snippet + "\n" + text.slice(pos), pos + lead.length + snippet.length + 1);
  };

  React.useImperativeHandle(ref, () => ({ insertTime: (sec) => insertInline(chipToken(sec)) }));

  const upload = async (files) => {
    if (files.length === 0) return;
    setEditing(true);
    setBusy(n => n + files.length);
    try {
      for (const f of files) {
        const r = await uploadPlaybookImage(userId, f, "study");
        if ("error" in r) fireAlert("Capture non ajoutée", r.error);
        else insertBlock(`![capture](${r.url})`);
      }
    } finally {
      setBusy(n => n - files.length);
    }
  };

  const refreshSlash = (src, caret) => {
    const det = detectSlashAtCursor(src, caret);
    if (!det) { setSlash(null); return; }
    const items = matchBlocks(det.query, Boolean(clock));
    if (items.length === 0) { setSlash(null); return; }
    setSlash(s => ({ start: det.start, items, index: s && s.start === det.start ? Math.min(s.index, items.length - 1) : 0, top: caretTop(src, caret) }));
  };

  const choose = (block) => {
    const ta = area.current;
    const caret = ta ? ta.selectionStart : text.length;
    const r = applySlashBlock(text, block, { start: slash.start }, caret);
    setSlash(null);
    if (r.action === "time" && clock) {
      const chip = chipToken(clock.time());
      write(r.text.slice(0, r.caret) + chip + " " + r.text.slice(r.caret), r.caret + chip.length + 1);
      return;
    }
    write(r.text, r.caret);
    if (r.action === "image") file.current?.click();
  };

  const onKeyDown = (e) => {
    if (slash) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlash(s => ({ ...s, index: (s.index + 1) % s.items.length })); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlash(s => ({ ...s, index: (s.index - 1 + s.items.length) % s.items.length })); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(slash.items[slash.index]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSlash(null); return; }
    }
    /* Alt+M : le moment courant de la vidéo, au caret. `code` et non `key` :
       sur macOS, Option+M produit « µ ». */
    if (clock && e.altKey && e.code === "KeyM") {
      e.preventDefault();
      insertInline(chipToken(clock.time()));
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const r = continueList(text, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
      if (r) { e.preventDefault(); write(r.text, r.caret); }
    }
  };

  const onInput = (e) => {
    const next = e.target.value;
    const caret = e.target.selectionStart;
    lastCaret.current = caret;
    const carried = carryStamps(view.text, view.stamps, next);
    if (stamps && clock && clock.playing()) {
      const idx = startedLineIndex(text, next, caret);
      if (idx != null && carried[idx] == null && !blockHasStamp(next, carried, idx)) carried[idx] = Math.floor(clock.time());
    }
    emit(next, carried);
    refreshSlash(next, caret);
  };

  const imagesOf = (list) => [...(list || [])]
    .map(item => (item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null))
    .filter(f => f && f.type.startsWith("image/"));

  return (
    <div className="study-doc" style={{ position: "relative" }}
         onDragOver={(e) => e.preventDefault()}
         onDrop={(e) => { const files = imagesOf(e.dataTransfer?.files); if (files.length) { e.preventDefault(); upload(files); } }}>
      <input ref={file} type="file" accept="image/*" multiple hidden
             onChange={(e) => { upload(imagesOf(e.target.files)); e.target.value = ""; }} />

      {editing || !content.trim() ? (
        <>
          <textarea
            ref={area}
            value={text}
            rows={3}
            placeholder={clock ? "Tape / pour les blocs — Alt+M insère le moment de la vidéo" : "Tape / pour les blocs"}
            aria-label="Contenu de la note"
            onChange={onInput}
            onClick={(e) => { lastCaret.current = e.currentTarget.selectionStart; refreshSlash(text, e.currentTarget.selectionStart); }}
            onKeyUp={(e) => { lastCaret.current = e.currentTarget.selectionStart; }}
            onKeyDown={onKeyDown}
            onFocus={() => setEditing(true)}
            /* Le clic dans le menu passe par `onMouseDown` + preventDefault :
               le champ ne perd pas le focus, et ce blur ne se produit pas. */
            onBlur={(e) => { lastCaret.current = e.currentTarget.selectionStart; setSlash(null); if (content.trim()) setEditing(false); }}
            onPaste={(e) => { const files = imagesOf(e.clipboardData?.items); if (files.length) { e.preventDefault(); upload(files); } }}
            style={{
              ...TEXT, width: "100%", minHeight: 120, resize: "none", overflow: "hidden",
              border: "none", outline: "none", background: "transparent", color: T.text,
              padding: 0, fontFamily: "inherit", display: "block",
            }}
          />
          {margin.map(m => (
            /* Même rendu que la marge de l'aperçu ; `mousedown` retenu pour
               que le clic ne fasse pas perdre le focus au champ. */
            <span key={m.line} className="rt-stamp rt-stamp-edit" role="button" tabIndex={-1}
                  title="Aller à ce moment de la vidéo"
                  style={{ top: `calc(${m.top}px + 0.35em)` }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSeek?.(m.sec)}>
              {secondsToClock(m.sec)}
            </span>
          ))}
          <div ref={mirror} aria-hidden
               style={{ ...TEXT, position: "absolute", visibility: "hidden", top: 0, left: 0, whiteSpace: "pre-wrap", overflowWrap: "break-word", padding: 0, pointerEvents: "none" }} />
        </>
      ) : (
        <NotePreview content={content} onChange={onChange} onEditAt={() => setEditing(true)} onSeek={onSeek} />
      )}

      {busy > 0 && <div style={{ ...TYPE.label, color: T.textMut, marginTop: 8 }}>Envoi de la capture…</div>}

      {slash && (
        <div role="listbox" aria-label="Blocs"
             style={{
               position: "absolute", left: 0, top: slash.top + 6, zIndex: 30, width: 260,
               padding: 6, borderRadius: 12, background: T.white, boxShadow: "var(--elev-overlay)",
               display: "flex", flexDirection: "column",
             }}>
          {slash.items.map((b, i) => (
            <div key={b.id} role="option" aria-selected={i === slash.index}
                 onMouseDown={(e) => { e.preventDefault(); choose(b); }}
                 onMouseEnter={() => setSlash(s => ({ ...s, index: i }))}
                 style={{
                   display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                   padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                   background: i === slash.index ? FIELD_BG : "transparent",
                 }}>
              <span style={{ ...TYPE.body, color: T.text }}>{b.label}</span>
              <span style={{ ...TYPE.caption, color: T.textMut, fontFamily: "var(--font-mono, monospace)" }}>{b.hint}</span>
            </div>
          ))}
        </div>
      )}

      {/* Le temps d'une ligne sort dans la marge, à gauche du bloc qui le
          porte — un élément de liste l'emporte avec son retrait. */}
      {/* Le rendu de la page Notes porte 20 px en haut et 40 px en bas, pensés
          pour un panneau. Ici le texte suit la méta : on les retire, sinon il
          descend d'un cran en sortant de l'édition et laisse un trou dessous. */}
      <style>{`
        .study-doc .rt-root { padding: 0 0 8px; }
        .study-doc .rt-root [data-line] { position: relative; }
        .study-doc .rt-stamp {
          position: absolute; left: -56px; top: 0.35em; width: 44px; text-align: right;
          font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px;
          font-variant-numeric: tabular-nums; color: var(--color-text-muted, #6B6B6B);
          cursor: pointer; white-space: nowrap;
        }
        .study-doc .rt-stamp::before { content: "× "; opacity: 0.6; }
        .study-doc .rt-stamp:hover { color: var(--color-text, #0D0D0D); }
        @media (max-width: 720px) {
          .study-doc .rt-stamp { position: static; display: inline; margin-left: 6px; }
          .study-doc .rt-stamp::before { content: "▸ "; }
          .study-doc .rt-stamp-edit { display: none; }
        }
      `}</style>
    </div>
  );
});

export default StudyEditor;
