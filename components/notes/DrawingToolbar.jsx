"use client";

/**
 * Barre d'outils du mode dessin des notes. Placée dans le flux (au-dessus de la
 * zone d'écriture) plutôt qu'en flottant : elle ne masque jamais le dessin.
 */

import React from "react";
import { Pencil, Highlighter, Eraser, Minus, ArrowRight, Square, Circle, Undo2, Redo2, Trash2, ChevronsDown, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { INKS, INK_KEYS, SIZES } from "./DrawingCanvas";

const TOOLS = [
  { key: "pen",      icon: Pencil,      label: "Crayon" },
  { key: "marker",   icon: Highlighter, label: "Surligneur" },
  { key: "line",     icon: Minus,       label: "Trait" },
  { key: "arrow",    icon: ArrowRight,  label: "Flèche" },
  { key: "rect",     icon: Square,      label: "Rectangle" },
  { key: "ellipse",  icon: Circle,      label: "Ellipse" },
  { key: "eraser",   icon: Eraser,      label: "Gomme" },
];

function IconButton({ icon: Icon, label, active, disabled, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : !!active}
      title={label}
      style={{
        width: 30, height: 30, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8,
        border: `1px solid ${active ? T.text : "transparent"}`,
        background: active ? T.text : "transparent",
        color: active ? T.white : disabled ? T.border2 : T.textMut,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (active || disabled) return;
        e.currentTarget.style.background = danger ? T.redBg : T.accentBg;
        e.currentTarget.style.color = danger ? T.red : T.text;
      }}
      onMouseLeave={(e) => {
        if (active || disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = T.textMut;
      }}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  );
}

const Divider = () => (
  <span aria-hidden style={{ width: 1, alignSelf: "stretch", minHeight: 20, background: T.border, flexShrink: 0 }} />
);

export default function DrawingToolbar({
  tool, setTool,
  inkKey, setInkKey,
  sizeKey, setSizeKey,
  canUndo, canRedo, onUndo, onRedo,
  onClear, onExtend, onClose,
  strokeCount,
}) {
  return (
    <div
      role="toolbar"
      aria-label="Outils de dessin"
      style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6,
        padding: "7px 12px",
        borderBottom: `1px solid ${T.border}`,
        background: T.accentBg,
      }}
    >
      {TOOLS.map(t => (
        <IconButton key={t.key} icon={t.icon} label={t.label} active={tool === t.key} onClick={() => setTool(t.key)} />
      ))}

      <Divider />

      {/* Encres — la couleur affichée vient des tokens, donc lisible en sombre */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {INK_KEYS.map(key => {
          const on = inkKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setInkKey(key)}
              aria-label={INKS[key].label}
              aria-pressed={on}
              title={INKS[key].label}
              style={{
                width: 22, height: 22, flexShrink: 0, padding: 0,
                borderRadius: "50%", cursor: "pointer",
                border: `2px solid ${on ? T.text : "transparent"}`,
                background: "transparent",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <span style={{
                width: on ? 12 : 14, height: on ? 12 : 14, borderRadius: "50%",
                background: `var(${INKS[key].cssVar}, ${INKS[key].fallback})`,
                boxShadow: key === "ink" ? `0 0 0 1px ${T.border2}` : "none",
              }} />
            </button>
          );
        })}
      </div>

      <Divider />

      {/* Épaisseurs */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        {SIZES.map(s => {
          const on = sizeKey === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSizeKey(s.key)}
              aria-label={`Épaisseur : ${s.label}`}
              aria-pressed={on}
              title={s.label}
              style={{
                width: 28, height: 28, flexShrink: 0, padding: 0,
                borderRadius: 8, cursor: "pointer",
                border: `1px solid ${on ? T.text : "transparent"}`,
                background: on ? T.white : "transparent",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <span style={{
                width: s.w * 2.4, height: s.w * 2.4, borderRadius: "50%",
                background: on ? T.text : T.textMut,
              }} />
            </button>
          );
        })}
      </div>

      <Divider />

      <IconButton icon={Undo2} label="Annuler (Ctrl+Z)" disabled={!canUndo} onClick={onUndo} />
      <IconButton icon={Redo2} label="Rétablir (Ctrl+Maj+Z)" disabled={!canRedo} onClick={onRedo} />
      <IconButton icon={ChevronsDown} label="Ajouter de l'espace en bas" onClick={onExtend} />
      <IconButton icon={Trash2} label="Effacer tout le dessin" danger disabled={!strokeCount} onClick={onClear} />

      <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: T.textMut, whiteSpace: "nowrap" }} className="tr4de-draw-hint">
          Maj = trait droit · Échap = écrire
        </span>
        <IconButton icon={X} label="Quitter le mode dessin (Échap)" onClick={onClose} />
      </div>
    </div>
  );
}
