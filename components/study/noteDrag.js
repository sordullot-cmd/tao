"use client";

import { useState } from "react";
import { T } from "@/lib/ui/tokens";

/* Glisser une note sur un dossier pour l'y ranger.
 *
 * Glisser-déposer natif plutôt qu'une bibliothèque : les cibles sont peu
 * nombreuses (onglets, tuiles) et on ne réordonne rien. Un type MIME propre
 * pour que ni un fichier ni un texte tiré d'ailleurs ne soit pris pour une
 * note — et qu'une capture lâchée sur l'éditeur reste une capture. */
export const NOTE_MIME = "application/x-tao-note";

const carriesNote = (e) => Array.from(e.dataTransfer?.types || []).includes(NOTE_MIME);

export function dragNoteProps(id) {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(NOTE_MIME, id);
      e.dataTransfer.effectAllowed = "move";
    },
  };
}

/** Cible de dépôt. `onDrop` absent : l'élément n'accepte rien. */
export function useNoteDrop(onDrop) {
  const [over, setOver] = useState(false);
  if (!onDrop) return { over: false, dropProps: {} };
  return {
    over,
    dropProps: {
      onDragOver: (e) => {
        if (!carriesNote(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      /* `dragleave` part aussi en entrant dans un enfant (l'icône) : sans ce
         filtre, le surlignage clignote pendant qu'on survole la cible. */
      onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
      onDrop: (e) => {
        setOver(false);
        const id = e.dataTransfer.getData(NOTE_MIME);
        if (!id) return;
        e.preventDefault();
        onDrop(id);
      },
    },
  };
}

/** Le même signal partout : un anneau, pas une couleur d'accent. */
export const DROP_RING = { boxShadow: `0 0 0 2px ${T.accent}` };
