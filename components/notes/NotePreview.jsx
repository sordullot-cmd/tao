"use client";

/**
 * Aperçu formaté d'une note : markdown léger + formules LaTeX rendues par KaTeX.
 *
 * Chargé en `next/dynamic` par la page Notes (cf. NotesPage) pour que le poids
 * de KaTeX et de sa feuille de style ne parte que quand l'aperçu est ouvert.
 */
import React, { useCallback, useMemo } from "react";
import { renderRichText } from "@/lib/ui/richText";
import { toggleTaskLine } from "@/lib/notes/blocks";
import "katex/dist/katex.min.css";

export default function NotePreview({ content, onChange, onOpenNote, onEditAt }) {
  const html = useMemo(() => renderRichText(content), [content]);

  /* Un seul écouteur pour tout l'aperçu : le HTML est injecté, il n'y a pas de
     nœud React sur lequel poser un handler. Trois gestes s'y partagent le clic,
     du plus précis au plus général : cocher une case, suivre un lien, et à
     défaut rouvrir l'édition sur le bloc cliqué — que `data-line` désigne. */
  const onActivate = useCallback((e) => {
    const box = e.target.closest?.(".rt-box[data-line]");
    if (box && onChange) {
      e.preventDefault();
      onChange(toggleTaskLine(content, Number(box.dataset.line)));
      return;
    }
    const link = e.target.closest?.(".rt-wiki[data-note]");
    if (link && onOpenNote) {
      e.preventDefault();
      onOpenNote(link.dataset.note);
      return;
    }
    // Replier un encadré ne doit pas basculer en édition par la même occasion.
    if (e.target.closest?.(".rt-callout-summary")) return;
    // Une sélection en cours veut lire ou copier, pas éditer.
    if (typeof window !== "undefined" && !window.getSelection?.().isCollapsed) return;
    if (!onEditAt) return;
    const block = e.target.closest?.("[data-line]");
    onEditAt(block ? Number(block.dataset.line) : null);
  }, [content, onChange, onOpenNote, onEditAt]);

  const onKeyDown = useCallback((e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!e.target.closest?.(".rt-box[data-line], .rt-wiki[data-note]")) return;
    onActivate(e);
  }, [onActivate]);

  return (
    <div
      className="rt-root"
      onClick={onActivate}
      onKeyDown={onKeyDown}
      title={onEditAt ? "Clique dans le texte pour le modifier" : undefined}
    >
      <style>{`
        /* Le rendu vit dans .rt-root : aucun style ne fuit vers le reste de l'app. */
        .rt-root {
          padding: 20px 24px 40px;
          font-size: var(--text-body, 14px);
          line-height: 1.7;
          color: var(--color-text, #0D0D0D);
          overflow-wrap: break-word;
          /* Le rendu s'édite au clic : le curseur de saisie le dit avant même
             qu'on essaie. Les éléments qui font autre chose (case, lien,
             encadré repliable) reprennent le curseur de main plus bas. */
          cursor: text;
        }
        .rt-root > :first-child { margin-top: 0; }

        /* Échelle de titres franche : un titre doit se voir de loin, sinon il
           ne sert à rien de le poser. Les tailles montent par paliers nets
           plutôt que par petits écarts qu'on ne distingue pas. */
        .rt-h { font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; }
        .rt-h1 { font-size: 28px; margin: 28px 0 10px; }
        .rt-h2 { font-size: 20px; margin: 24px 0 8px; }
        .rt-h3 { font-size: 16px; margin: 20px 0 6px; }
        .rt-h4, .rt-h5, .rt-h6 {
          font-size: var(--text-body, 14px);
          margin: 16px 0 4px;
          color: var(--color-text-sub, #5C5C5C);
        }

        .rt-p { margin: 0 0 10px; }

        /* Listes : marge de puce serrée (le texte prime sur le marqueur) et
           items assez espacés pour se lire un par un. */
        .rt-list { margin: 6px 0 12px; padding-left: 22px; }
        .rt-list .rt-list { margin: 4px 0 0; }
        ul.rt-list { list-style: disc; }
        ul.rt-list ul.rt-list { list-style: circle; }
        ul.rt-list ul.rt-list ul.rt-list { list-style: square; }
        ol.rt-list { list-style: decimal; }
        ol.rt-list ol.rt-list { list-style: lower-alpha; }
        .rt-li { margin: 3px 0; padding-left: 3px; }
        .rt-li::marker { color: var(--color-text-muted, #6B6B6B); font-size: 0.95em; }
        .rt-li-more { margin: 2px 0 6px; color: var(--color-text-sub, #5C5C5C); }

        /* Tâches : la case remplace la puce et se cale sur la marge du texte,
           d'où le retrait exactement égal au padding de la liste. */
        .rt-li.rt-task {
          list-style: none;
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin-left: -22px;
          padding-left: 0;
        }
        .rt-box {
          flex: none;
          position: relative;
          width: 17px;
          height: 17px;
          margin-top: 3px;
          border: 1.5px solid var(--color-border-strong, #D4D4D4);
          border-radius: 5px;
          background: var(--color-card-bg, #FFF);
          transition: var(--tr-ui);
        }
        .rt-box[data-line] { cursor: pointer; }
        .rt-box[data-line]:hover {
          border-color: var(--color-text, #0D0D0D);
          background: var(--color-hover-bg, #F0F0F0);
        }
        .rt-box-on, .rt-box-on[data-line]:hover {
          background: var(--color-text, #0D0D0D);
          border-color: var(--color-text, #0D0D0D);
        }
        /* Coche dessinée en CSS : un « ✓ » de police change de dessin et de
           calage selon la fonte installée. */
        .rt-box-on::after {
          content: "";
          position: absolute;
          left: 4.5px;
          top: 1px;
          width: 4px;
          height: 8px;
          border: solid var(--color-text-inverted, #FFF);
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .rt-task-text { flex: 1; min-width: 0; }
        .rt-task-done .rt-task-text {
          color: var(--color-text-muted, #6B6B6B);
          text-decoration: line-through;
          text-decoration-thickness: 1px;
        }

        /* Encadrés et blocs repliables (syntaxe callout d'Obsidian). */
        .rt-callout {
          margin: 14px 0;
          padding: 10px 14px;
          border: 1px solid var(--rt-cl-bd, var(--color-border, #E5E5E5));
          border-left-width: 3px;
          border-radius: var(--radius-card, 10px);
          background: var(--rt-cl-bg, var(--color-hover-bg, #F0F0F0));
        }
        .rt-callout-note    { --rt-cl-bd: var(--color-purple-bd); --rt-cl-bg: var(--color-purple-bg); --rt-cl-fg: var(--color-purple); }
        .rt-callout-info    { --rt-cl-bd: var(--color-blue-bd);   --rt-cl-bg: var(--color-blue-bg);   --rt-cl-fg: var(--color-blue); }
        .rt-callout-tip     { --rt-cl-bd: var(--color-green-bd);  --rt-cl-bg: var(--color-green-bg);  --rt-cl-fg: var(--color-green); }
        .rt-callout-warning { --rt-cl-bd: var(--color-amber-bd);  --rt-cl-bg: var(--color-amber-bg);  --rt-cl-fg: var(--color-amber); }
        .rt-callout-danger  { --rt-cl-bd: var(--color-red-bd);    --rt-cl-bg: var(--color-red-bg);    --rt-cl-fg: var(--color-red); }
        .rt-callout-quote   { --rt-cl-bd: var(--color-border-strong, #D4D4D4); }

        .rt-callout-head, .rt-callout-summary {
          font-weight: 600;
          color: var(--rt-cl-fg, var(--color-text, #0D0D0D));
        }
        .rt-callout-summary {
          cursor: pointer;
          list-style: none;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .rt-callout-summary::-webkit-details-marker { display: none; }
        /* Chevron du bloc repliable : il pivote à l'ouverture. */
        .rt-callout-summary::before {
          content: "";
          flex: none;
          width: 0; height: 0;
          border-left: 5px solid currentColor;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
          transition: var(--tr-ui);
        }
        .rt-callout-fold[open] > .rt-callout-summary::before { transform: rotate(90deg); }
        .rt-callout-body { margin-top: 6px; }
        .rt-callout-body > :last-child { margin-bottom: 0; }
        .rt-callout-body .rt-p:last-child { margin-bottom: 0; }

        /* Lien vers une autre note. */
        .rt-wiki {
          color: var(--color-blue, #1CB0F6);
          cursor: pointer;
          border-bottom: 1px solid color-mix(in srgb, var(--color-blue, #1CB0F6) 35%, transparent);
        }
        .rt-wiki:hover { border-bottom-color: currentColor; }

        .rt-quote {
          margin: 12px 0;
          padding: 8px 14px;
          border-left: 3px solid var(--color-border-strong, #D4D4D4);
          background: var(--color-hover-bg, #F0F0F0);
          border-radius: 0 var(--radius-field, 6px) var(--radius-field, 6px) 0;
          color: var(--color-text-sub, #5C5C5C);
        }

        .rt-hr { margin: 20px 0; border: none; border-top: 1px solid var(--color-border, #E5E5E5); }

        .rt-code {
          font-family: var(--font-geist-mono, ui-monospace, monospace);
          font-size: 0.9em;
          padding: 1px 5px;
          border-radius: var(--radius-field, 6px);
          background: var(--color-hover-bg, #F0F0F0);
        }
        .rt-pre {
          margin: 12px 0;
          padding: 12px 14px;
          border: 1px solid var(--color-border, #E5E5E5);
          border-radius: var(--radius-card, 10px);
          background: var(--color-hover-bg, #F0F0F0);
          overflow-x: auto;
        }
        .rt-pre code {
          font-family: var(--font-geist-mono, ui-monospace, monospace);
          font-size: 12px;
          line-height: 1.55;
          white-space: pre;
        }

        .rt-a { color: var(--color-blue, #1CB0F6); text-decoration: underline; text-underline-offset: 2px; }
        .rt-tag { color: var(--color-blue, #1CB0F6); font-weight: 500; }
        .rt-img { max-width: 100%; height: auto; border-radius: var(--radius-card, 10px); margin: 8px 0; }

        .rt-table-wrap { margin: 12px 0; overflow-x: auto; }
        .rt-table { border-collapse: collapse; font-size: 13px; min-width: min(100%, 320px); }
        .rt-table th, .rt-table td {
          border: 1px solid var(--color-border, #E5E5E5);
          padding: 6px 10px;
          text-align: left;
          vertical-align: top;
        }
        .rt-table th { background: var(--color-hover-bg, #F0F0F0); font-weight: 600; }

        /* Formules : héritent de la couleur du thème (KaTeX force sinon son noir)
           et défilent horizontalement plutôt que de déborder de la carte. */
        .rt-root .katex { color: inherit; font-size: 1.05em; }
        .rt-math-block { margin: 16px 0; text-align: center; }
        .rt-root .katex-display { margin: 0; overflow-x: auto; overflow-y: hidden; padding: 2px 0; }
        .rt-root .katex-display > .katex { font-size: 1.15em; }
        .rt-root .katex-error { color: var(--color-red, #FF4B4B); }

        @media (max-width: 600px) {
          .rt-root { padding: 16px 16px 32px; }
          .rt-list { padding-left: 20px; }
        }
      `}</style>
      {html
        ? <div dangerouslySetInnerHTML={{ __html: html }} />
        : (
          <div style={{ color: "var(--color-text-muted, #6B6B6B)", fontSize: 13 }}>
            Note vide — repasse en édition pour écrire.
          </div>
        )}
    </div>
  );
}
