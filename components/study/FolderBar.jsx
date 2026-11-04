"use client";

import React from "react";
import { Home, Folder, FolderPlus, Files } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";
import { childFolders } from "@/lib/study/model";
import { useNoteDrop, DROP_RING } from "@/components/study/noteDrag";

/**
 * Barre d'onglets de la page Étude, sous la barre du haut : l'accueil, les
 * feuilles volantes, un onglet par dossier racine, et « Nouveau dossier ».
 *
 * Remplace le rail d'icônes vertical : un rail ne montrait les noms qu'au
 * survol et mangeait une colonne à gauche de la page. Ici chaque dossier se
 * lit d'un coup d'œil, et la page garde toute sa largeur.
 *
 * Seuls les dossiers RACINES y figurent — les sous-dossiers vivent en tuiles
 * dans leur parent, sinon la barre s'allongerait à chaque sous-dossier. Trop
 * de dossiers pour la largeur : la barre défile, elle ne passe pas à la ligne
 * (deux rangées d'onglets ne se lisent plus comme des onglets).
 */
export default function FolderBar({ store, activeRoot, home, loose = false, onHome, onLoose, onOpen, onCreate, onMoveNote }) {
  const roots = childFolders(store, null);
  return (
    <nav
      aria-label="Dossiers"
      className="study-folderbar"
      style={{
        display: "flex", alignItems: "center", gap: 2, minWidth: 0,
        overflowX: "auto", scrollbarWidth: "none",
        paddingBottom: 8, borderBottom: `1px solid ${HAIRLINE}`,
      }}
    >
      <style>{`.study-folderbar::-webkit-scrollbar { display: none; }
.study-tab:hover:not([aria-current]) { background: ${FIELD_BG}; color: ${T.text}; }`}</style>
      <Tab label="Accueil" icon={<Home size={14} strokeWidth={1.75} />} active={home} onClick={onHome} />
      <Tab label="Feuilles volantes" icon={<Files size={14} strokeWidth={1.75} />} active={loose} onClick={onLoose}
           onDropNote={onMoveNote && ((id) => onMoveNote(id, null))} />
      {roots.length > 0 && <span aria-hidden style={{ width: 1, height: 16, background: HAIRLINE, margin: "0 6px", flexShrink: 0 }} />}
      {roots.map(f => (
        <Tab key={f.id} label={f.name || "Sans titre"} active={activeRoot === f.id} onClick={() => onOpen(f.id)}
             icon={<Folder size={14} strokeWidth={1.75} fill={activeRoot === f.id ? "currentColor" : "none"} fillOpacity={0.15} />}
             onDropNote={onMoveNote && ((id) => onMoveNote(id, f.id))} />
      ))}
      <Tab label="Nouveau dossier" icon={<FolderPlus size={14} strokeWidth={1.75} />} muted onClick={onCreate} />
    </nav>
  );
}

function Tab({ label, icon, active = false, muted = false, onClick, onDropNote }) {
  const { over, dropProps } = useNoteDrop(onDropNote);
  /* L'enveloppe porte la zone de dépôt : un dossier reçoit une note glissée
     dessus, comme les tuiles de dossier. */
  return (
    <div style={{ flexShrink: 0, borderRadius: 8 }} {...dropProps}>
      <button
        type="button"
        className="study-tab"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        style={{
          all: "unset", boxSizing: "border-box", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", borderRadius: 8,
          ...TYPE.body, fontWeight: active ? 500 : 400, whiteSpace: "nowrap", maxWidth: 200,
          color: active ? T.text : muted ? T.textMut : T.textSub,
          background: active ? FIELD_BG : "transparent",
          transition: "background 120ms var(--ease-out, ease), color 120ms var(--ease-out, ease)",
          ...(over ? { ...DROP_RING, background: FIELD_BG } : null),
        }}
      >
        <span aria-hidden style={{ display: "inline-flex", flexShrink: 0 }}>{icon}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </button>
    </div>
  );
}
