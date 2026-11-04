"use client";

import React from "react";
import { FileText, PlayCircle, LineChart } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { wordCount } from "@/lib/study/model";
import { dragNoteProps } from "@/components/study/noteDrag";

/** La première ligne qui dit quelque chose, sans la syntaxe markdown. */
export function excerpt(content) {
  for (const line of content.split("\n")) {
    const clean = line.replace(/^\s*(#{1,6}\s|[-*+]\s(\[[ xX]\]\s)?|\d+\.\s|>\s?)/, "").replace(/[*_`~[\]]/g, "").trim();
    if (clean) return clean;
  }
  return "";
}

function fmtUpdated(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Les notes en tableau : titre et première ligne, dossier, date, longueur.
 *
 * La longueur en mots plutôt qu'un statut seul : sur une liste de notes
 * d'étude, c'est elle qui dit d'un coup d'œil laquelle est un vrai travail et
 * laquelle une amorce qu'on a laissée là. Le statut garde sa pastille sur
 * l'icône.
 */
export default function NoteRows({ notes, folderOf, onOpen, compact = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {notes.map((n, i) => {
        const text = excerpt(n.content);
        const words = wordCount(n.content);
        return (
          /* Une div et non un <button> : Firefox et WebKit ne lancent pas de
             glisser depuis un bouton, et la ligne doit pouvoir se déposer
             sur un dossier. */
          <div key={n.id} role="button" tabIndex={0} onClick={() => onOpen(n.id)} {...dragNoteProps(n.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(n.id); } }}
                  style={{
                    boxSizing: "border-box", width: "100%", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 10,
                    borderTop: i > 0 ? `1px solid ${HAIRLINE}` : "none",
                    transition: "background 120ms var(--ease-out, ease)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <span style={{ position: "relative", width: 36, height: 28, borderRadius: 6, background: FIELD_BG, flexShrink: 0,
                           display: "flex", alignItems: "center", justifyContent: "center", color: T.textSub }}>
              <FileText size={14} strokeWidth={1.75} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ ...TYPE.callout, color: n.title ? T.text : T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.title || "Sans titre"}
              </span>
              {text && (
                <span style={{ ...TYPE.label, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
              )}
            </span>
            {(n.videos.length > 0 || n.tradeIds.length > 0) && (
              <span style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.caption, ...TABULAR, color: T.textMut, flexShrink: 0 }}>
                {n.videos.length > 0 && <span title="Vidéos" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><PlayCircle size={12} strokeWidth={1.75} />{n.videos.length}</span>}
                {n.tradeIds.length > 0 && <span title="Trades reliés" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><LineChart size={12} strokeWidth={1.75} />{n.tradeIds.length}</span>}
              </span>
            )}
            {!compact && folderOf && (
              <span style={{ ...TYPE.label, color: T.textSub, width: 120, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {folderOf(n)}
              </span>
            )}
            <span style={{ ...TYPE.label, ...TABULAR, color: T.textMut, width: 52, flexShrink: 0, textAlign: "right" }}>{fmtUpdated(n.updatedAt)}</span>
            {!compact && (
              <span style={{ ...TYPE.label, ...TABULAR, color: T.textMut, width: 64, flexShrink: 0, textAlign: "right" }}>
                {words} mot{words > 1 ? "s" : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
