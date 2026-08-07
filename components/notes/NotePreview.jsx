"use client";

/**
 * Aperçu formaté d'une note : markdown léger + formules LaTeX rendues par KaTeX.
 *
 * Chargé en `next/dynamic` par la page Notes (cf. NotesPage) pour que le poids
 * de KaTeX et de sa feuille de style ne parte que quand l'aperçu est ouvert.
 */
import React, { useMemo } from "react";
import { renderRichText } from "@/lib/ui/richText";
import "katex/dist/katex.min.css";

export default function NotePreview({ content, onDoubleClick }) {
  const html = useMemo(() => renderRichText(content), [content]);

  return (
    <div
      className="rt-root"
      onDoubleClick={onDoubleClick}
      title={onDoubleClick ? "Double-clic pour revenir à l'édition" : undefined}
    >
      <style>{`
        /* Le rendu vit dans .rt-root : aucun style ne fuit vers le reste de l'app. */
        .rt-root {
          padding: 20px 24px 40px;
          font-size: var(--text-body, 14px);
          line-height: 1.7;
          color: var(--color-text, #0D0D0D);
          overflow-wrap: break-word;
        }
        .rt-root > :first-child { margin-top: 0; }

        .rt-h { font-weight: 600; line-height: 1.35; margin: 22px 0 8px; }
        .rt-h1 { font-size: var(--text-h1, 24px); }
        .rt-h2 { font-size: var(--text-h2, 17px); }
        .rt-h3 { font-size: 16px; }
        .rt-h4, .rt-h5, .rt-h6 { font-size: var(--text-body, 14px); }

        .rt-p { margin: 0 0 12px; }

        .rt-list { margin: 0 0 12px; padding-left: 26px; }
        .rt-list .rt-list { margin: 6px 0 2px; }
        ul.rt-list { list-style: disc; }
        ul.rt-list ul.rt-list { list-style: circle; }
        ol.rt-list { list-style: decimal; }
        .rt-li { margin: 4px 0; padding-left: 2px; }
        .rt-li::marker { color: var(--color-text-muted, #6B6B6B); }
        .rt-li-more { margin: 4px 0 6px; color: var(--color-text-sub, #5C5C5C); }

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

        .rt-a { color: var(--color-blue, #3B82F6); text-decoration: underline; text-underline-offset: 2px; }
        .rt-tag { color: var(--color-blue, #3B82F6); font-weight: 500; }
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
        .rt-root .katex-error { color: var(--color-red, #EF4444); }

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
