"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Search, Check } from "lucide-react";
import Popover from "@/components/ui/Popover";
import { FIELD_BG } from "@/lib/ui/tokens";
import { FIELD_FOCUS_RING } from "@/components/ui/form";

export interface SearchableOption {
  id: string;
  label: string;
  iconUrl?: string;
  iconNode?: React.ReactNode;
  sublabel?: string;
  isAction?: boolean;
  accessory?: React.ReactNode; // Élément interactif rendu à droite (ex: bouton favori)
}

interface SearchableSelectProps {
  value: string;
  options: SearchableOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  width?: string | number;
  maxMenuHeight?: number;
  renderSelected?: (opt?: SearchableOption) => React.ReactNode;
  onOpen?: () => void;
  separated?: boolean;   // Lignes fines entre items du dropdown
  small?: boolean;       // Typo + icone reduites (trigger + items)
  /** Surcharge l'habillage du déclencheur (pages sans cadre : pastille sur aplat). */
  triggerStyle?: React.CSSProperties;
  /** Bord d'alignement du menu sur le déclencheur (`end` pour un menu posé à droite). */
  align?: "start" | "end";
  /** Menu plus large que son déclencheur : largeur minimale au lieu de la
   *  largeur de l'ancre (un libellé long ne tient pas dans une pastille). */
  menuMinWidth?: number;
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Sélectionner",
  searchable = true,
  searchPlaceholder = "Rechercher...",
  emptyLabel = "Aucun résultat",
  width = "100%",
  maxMenuHeight = 280,
  renderSelected,
  onOpen,
  separated = false,
  small = false,
  triggerStyle,
  align = "start",
  menuMinWidth,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleOpen = () => {
    setOpen(v => {
      const next = !v;
      if (next) onOpen?.();
      return next;
    });
  };

  // Le clic extérieur et Échap sont gérés par le Popover : le menu étant
  // portalisé hors de `containerRef`, un test de descendance sur le conteneur
  // le considérerait comme « extérieur » et le fermerait avant le choix.
  const close = React.useCallback(() => { setOpen(false); setQuery(""); }, []);

  const selected = options.find(o => o.id === value);
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()) || (o.sublabel || "").toLowerCase().includes(query.toLowerCase()))
    : options;

  // Réinitialise l'élément actif à l'ouverture / au changement de filtre.
  useEffect(() => { setActive(0); }, [open, query]);

  // Navigation clavier sur les options (flèches / Entrée / Échap).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const opt = filtered[active];
      if (opt) {
        e.preventDefault();
        onChange(opt.id);
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={containerRef} onKeyDown={onKeyDown} style={{ position: "relative", width, fontFamily: "var(--font-sans)" }}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{minHeight: 34,
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: small ? "6px 12px" : "9px 14px",
          border: "none",
          borderRadius: 999,
          background: FIELD_BG,
          boxShadow: open ? FIELD_FOCUS_RING : "none",
          color: selected ? "var(--color-text)" : "var(--color-text-muted)",
          fontSize: small ? 12 : 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          transition: "box-shadow var(--dur-fast) var(--ease-out)",
          ...triggerStyle,
        }}
      >
        {renderSelected ? (
          renderSelected(selected)
        ) : selected ? (
          <>
            {selected.iconUrl && <img src={selected.iconUrl} alt="" style={{ width: small ? 14 : 16, height: small ? 14 : 16, objectFit: "contain", flexShrink: 0 }} />}
            {selected.iconNode && <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>{selected.iconNode}</span>}
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selected.label}
              {selected.sublabel && <span style={{ color: "var(--color-text-muted)", fontSize: small ? 11 : 12, fontWeight: 400, marginLeft: 6 }}>{selected.sublabel}</span>}
            </span>
          </>
        ) : (
          <span style={{ flex: 1 }}>{placeholder}</span>
        )}
        {open ? <ChevronUp size={small ? 12 : 14} strokeWidth={2} color="var(--color-text-muted)" /> : <ChevronDown size={small ? 12 : 14} strokeWidth={2} color="var(--color-text-muted)" />}
      </button>

      <Popover
        anchorRef={containerRef}
        open={open}
        onClose={close}
        gap={4}
        align={align}
        matchAnchorWidth={menuMinWidth == null}
        minWidth={menuMinWidth}
        atLeastAnchorWidth={menuMinWidth != null}
        scroll={false}
        maxHeight={maxMenuHeight + 44}
        /* Le champ de recherche vit maintenant dans le portail : sans ce
           gestionnaire, les flèches et Entrée ne remonteraient plus jusqu'au
           conteneur du déclencheur. */
        onKeyDown={onKeyDown}
        role="listbox"
        className="anim-pop"
        style={{
          background: "var(--color-card-bg, #FFFFFF)",
          border: "none",
          borderRadius: 10,
          boxShadow: "var(--elev-overlay)",
        }}
      >
        <>
          {searchable && options.length > 5 && (
            <div style={{ flexShrink: 0, padding: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px" }}>
                <Search size={12} strokeWidth={1.75} color="var(--color-text-muted)" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    fontSize: 12,
                    fontFamily: "inherit",
                    color: "var(--color-text)",
                    padding: "4px 0",
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", maxHeight: maxMenuHeight, padding: 4 }} className="scroll-thin">
            {filtered.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>{emptyLabel}</div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.id === value;
                const isActive = idx === active;
                return (
                  <React.Fragment key={opt.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => {
                        onChange(opt.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: small ? "6px 10px" : "8px 10px",
                        border: "none",
                        background: isSelected ? "var(--color-active-bg)" : (isActive ? "var(--color-hover-bg)" : "transparent"),
                        color: "var(--color-text)",
                        fontSize: small ? 12 : 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                        borderRadius: 6,
                        transition: "background 100ms ease",
                      }}
                    >
                      {opt.iconUrl && <img src={opt.iconUrl} alt="" style={{ width: small ? 14 : 16, height: small ? 14 : 16, objectFit: "contain", flexShrink: 0 }} />}
                      {opt.iconNode && <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>{opt.iconNode}</span>}
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                      {opt.sublabel && <span style={{ color: "var(--color-text-muted)", fontSize: small ? 11 : 12 }}>{opt.sublabel}</span>}
                      {opt.accessory && (
                        <span
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
                        >
                          {opt.accessory}
                        </span>
                      )}
                      {isSelected && <Check size={small ? 12 : 14} strokeWidth={2} color="var(--color-text)" />}
                    </button>
                    {separated && idx < filtered.length - 1 && (
                      <div style={{ height: 1, background: "var(--color-border)", margin: "0 8px" }} />
                    )}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </>
      </Popover>
    </div>
  );
}
