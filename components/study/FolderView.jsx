"use client";

import React, { useEffect, useRef, useState } from "react";
import { Folder, FolderPlus, Plus } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { Modal, PillButton, Select } from "@/components/ui/form";
import { childFolders, notesUnder, progressOf, canMoveFolder } from "@/lib/study/model";
import NoteRows from "@/components/study/NoteRows";
import { useNoteDrop, DROP_RING } from "@/components/study/noteDrag";

/**
 * Un dossier ouvert : son nom (modifiable sur place), ses sous-dossiers en
 * tuiles, puis ses notes.
 *
 * Le nom s'édite dans le titre lui-même, sans modale : un dossier se crée
 * « Sans titre » et on tape son nom dans la foulée — c'est le geste du Finder,
 * et il évite une fenêtre pour un seul champ.
 */
export default function FolderView({ store, folder, autoRename, onAutoRenamed, onRename, onMove, onDelete, onOpenFolder, onCreateFolder, onOpenNote, onCreateNote, onMoveNote }) {
  const title = useRef(null);
  const [moving, setMoving] = useState(false);
  const subfolders = childFolders(store, folder.id);
  const notes = store.notes.filter(n => n.folderId === folder.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const all = notesUnder(store, folder.id);

  /* Dossier tout juste créé : le nom est sélectionné, prêt à être remplacé. */
  useEffect(() => {
    if (autoRename && title.current) { title.current.focus(); title.current.select(); onAutoRenamed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois, à l'arrivée sur le dossier créé
  }, [autoRename, folder.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          ref={title}
          value={folder.name}
          onChange={(e) => onRename(e.target.value)}
          /* Un nom vidé puis abandonné reprend « Sans titre » : un dossier sans
             nom serait un onglet muet dans la barre des dossiers. */
          onBlur={(e) => { if (!e.target.value.trim()) onRename("Sans titre"); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          aria-label="Nom du dossier"
          style={{ ...TYPE.title1, color: T.text, background: "transparent", border: "none", outline: "none", padding: 0, fontFamily: "inherit", width: "100%" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14, ...TYPE.label, color: T.textMut, flexWrap: "wrap" }}>
          <span style={TABULAR}>{all.length} note{all.length > 1 ? "s" : ""}</span>
          <LinkButton onClick={() => setMoving(true)}>Déplacer le dossier</LinkButton>
          <LinkButton onClick={onDelete} danger>Supprimer le dossier</LinkButton>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 8 }}>
        {subfolders.map(f => {
          const p = progressOf(notesUnder(store, f.id));
          return (
            <Tile key={f.id} onClick={() => onOpenFolder(f.id)} label={f.name}
                  onDropNote={onMoveNote && ((id) => onMoveNote(id, f.id))}
                  sub={p.total === 0 ? "Vide" : `${p.total} note${p.total > 1 ? "s" : ""}`}>
              <Folder size={30} strokeWidth={1.25} fill="currentColor" fillOpacity={0.1} />
            </Tile>
          );
        })}
        <Tile onClick={onCreateFolder} label="Nouveau dossier" muted>
          <FolderPlus size={22} strokeWidth={1.5} />
        </Tile>
      </div>

      <div style={{ height: 1, background: HAIRLINE }} />

      {notes.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0" }}>
          <span style={{ ...TYPE.callout, color: T.text }}>Rien de classé pour l&apos;instant.</span>
          <PillButton variant="secondary" onClick={onCreateNote}>
            <Plus size={14} strokeWidth={2} /> Nouvelle note dans {folder.name || "ce dossier"}
          </PillButton>
        </div>
      ) : (
        <NoteRows notes={notes} onOpen={onOpenNote} />
      )}

      {moving && <MoveModal store={store} folder={folder} onClose={() => setMoving(false)} onMove={(p) => { onMove(p); setMoving(false); }} />}
    </div>
  );
}

/**
 * « Feuilles volantes » : les notes rangées dans aucun dossier. Ce n'est pas
 * un dossier stocké mais une vue sur `folderId === null` — rien à migrer, et
 * une note qu'on sort de son dossier y atterrit d'elle-même.
 */
export function LooseView({ store, onOpenNote, onCreateNote }) {
  const notes = store.notes.filter(n => !n.folderId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ ...TYPE.title1, color: T.text, margin: 0 }}>{LOOSE_LABEL}</h1>
        <span style={{ ...TYPE.label, ...TABULAR, color: T.textMut }}>
          {notes.length} note{notes.length > 1 ? "s" : ""} sans dossier
        </span>
      </div>
      <div style={{ height: 1, background: HAIRLINE }} />
      {notes.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0" }}>
          <span style={{ ...TYPE.callout, color: T.text }}>Tout est rangé.</span>
          <PillButton variant="secondary" onClick={onCreateNote}>
            <Plus size={14} strokeWidth={2} /> Nouvelle feuille volante
          </PillButton>
        </div>
      ) : (
        <NoteRows notes={notes} onOpen={onOpenNote} />
      )}
    </div>
  );
}

export const LOOSE_LABEL = "Feuilles volantes";

function LinkButton({ onClick, danger = false, children }) {
  return (
    <button type="button" onClick={onClick}
            style={{ all: "unset", cursor: "pointer", ...TYPE.label, color: T.textSub }}
            onMouseEnter={(e) => { e.currentTarget.style.color = danger ? T.red : T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.textSub; }}>
      {children}
    </button>
  );
}

function Tile({ onClick, label, sub, muted = false, onDropNote, children }) {
  const { over, dropProps } = useNoteDrop(onDropNote);
  return (
    <button type="button" onClick={onClick} {...dropProps}
            style={{
              all: "unset", boxSizing: "border-box", cursor: "pointer", borderRadius: 12, padding: "14px 8px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center",
              color: muted ? T.textSub : T.text, transition: "background 120ms var(--ease-out, ease)",
              ...(over ? { ...DROP_RING, background: FIELD_BG } : null),
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <span style={{ height: 32, display: "flex", alignItems: "center" }}>{children}</span>
      <span style={{ ...TYPE.label, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {sub && <span style={{ ...TYPE.caption, ...TABULAR, color: T.textMut }}>{sub}</span>}
    </button>
  );
}

function MoveModal({ store, folder, onClose, onMove }) {
  const [parentId, setParentId] = useState(folder.parentId ?? "");
  /* Un dossier ne peut pas se ranger dans lui-même ni dans un de ses enfants :
     ces cibles sont retirées de la liste plutôt que refusées après coup. */
  const options = [];
  const walk = (pid, depth) => {
    for (const f of childFolders(store, pid)) {
      if (!canMoveFolder(store, folder.id, f.id)) continue;
      options.push({ id: f.id, label: `${"  ".repeat(depth)}${f.name}` });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return (
    <Modal open title="Déplacer le dossier" onClose={onClose} width={420}
           footer={<>
             <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
             <PillButton variant="primary" onClick={() => onMove(parentId || null)}>Déplacer</PillButton>
           </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ ...TYPE.label, color: T.textSub }}>Ranger « {folder.name} » dans</span>
        <Select value={parentId} onChange={(e) => setParentId(e.target.value)} aria-label="Dossier parent">
          <option value="">Racine (dans les onglets)</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      </div>
    </Modal>
  );
}
