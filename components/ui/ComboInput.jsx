"use client";

/**
 * Champ texte à suggestions — saisie LIBRE, liste en appui.
 *
 * Ce que ne fait pas `SearchableSelect` : son déclencheur est un bouton, donc la
 * valeur ne peut être qu'une des options. Il y a des champs où la liste aide sans
 * devoir enfermer — l'établissement d'un actif, par exemple : le catalogue de
 * l'agrégateur bancaire couvre les banques d'un pays, pas le courtier, la
 * mutuelle ou l'oncle qui a prêté l'apport. Fermer la liste obligerait à créer
 * une entrée « Autre » et à ajouter un second champ pour la préciser.
 *
 * D'où ce troisième cas, entre le champ libre et le menu : on tape ce qu'on veut,
 * et si ce qu'on tape correspond à une entrée du catalogue, le logo apparaît DANS
 * le champ. C'est le seul retour dont l'utilisateur a besoin — il voit que
 * l'établissement a été reconnu sans avoir eu à choisir dans une liste.
 *
 * Le menu s'ouvre au CLIC dans le champ, à la frappe et sur ↓ — mais pas à la
 * simple prise de focus : arriver par Tab sur ce champ ne doit pas recouvrir les
 * suivants d'une liste de plusieurs centaines de banques. C'est aussi ce qui
 * permet au champ de reprendre le focus après un choix sans rouvrir la liste
 * qu'on vient justement de refermer.
 *
 * Une saisie qui tombe pile sur une entrée remontre TOUT le catalogue : à ce
 * moment-là on ne cherche plus, on peut vouloir changer d'avis.
 */

import React from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import Popover from "@/components/ui/Popover";
import { RoundLogo } from "@/components/ui/accountRows";

/** Comparaison souple : casse, accents et espaces multiples ignorés. */
const key = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * @param {string}   props.value        Texte saisi (la valeur est le texte, pas un id).
 * @param {Function} props.onChange     Reçoit le texte.
 * @param {Array}    props.options      `{ id, label, iconUrl? }`.
 * @param {boolean=} props.loading      Suggestions en cours de chargement.
 */
export default function ComboInput({
  value,
  onChange,
  options = [],
  placeholder,
  ariaLabel,
  loading = false,
  emptyLabel,
  maxMenuHeight = 240,
  autoFocus = false,
  name,
}) {
  const boxRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  /* −1 = aucune option préselectionnée : Entrée valide alors la saisie libre
     plutôt que la première suggestion, qui n'est pas ce qu'on a tapé. */
  const [active, setActive] = React.useState(-1);
  const listId = React.useId();

  const q = key(value);
  const exact = React.useMemo(
    () => (q ? options.find((o) => key(o.label) === q) || null : null),
    [options, q],
  );
  const filtered = React.useMemo(
    () => (!q || exact ? options : options.filter((o) => key(o.label).includes(q))),
    [options, q, exact],
  );

  const hasList = options.length > 0;
  const showMenu = open && hasList;

  React.useEffect(() => { setActive(-1); }, [q, open]);

  const close = React.useCallback(() => { setOpen(false); setActive(-1); }, []);

  const pick = (opt) => {
    onChange(opt.label);
    close();
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!showMenu) { setOpen(true); return; }
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      const opt = active >= 0 ? filtered[active] : null;
      if (showMenu && opt) {
        // Sans ça, Entrée validerait aussi le formulaire de la modale.
        e.preventDefault();
        pick(opt);
      } else {
        close();
      }
    } else if (e.key === "Escape") {
      if (!showMenu) return;
      /* La modale ne doit pas se fermer parce qu'on referme une liste :
         l'échappement s'arrête ici. */
      e.stopPropagation();
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", fontFamily: "var(--font-sans)" }}>
      {/* La bordure vit sur le conteneur, pas sur l'`input` : le logo reconnu et
          le chevron sont DANS le champ, comme dans un menu déroulant. */}
      <div
        ref={boxRef}
        /* `mousedown` et pas `click` : la liste doit être ouverte avant que le
           focus n'arrive, sinon elle s'ouvre un cran trop tard. */
        onMouseDown={() => { if (hasList) setOpen(true); }}
        onClick={() => inputRef.current?.focus()}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          /* Hauteur FIXE, et non dérivée du contenu : sans elle, le champ
             grandirait de quelques pixels à l'apparition du logo, et il ne
             serait pas tout à fait aligné sur les `TextInput` voisins. */
          minHeight: 36, boxSizing: "border-box",
          padding: exact?.iconUrl ? "0 6px 0 7px" : "0 6px 0 12px",
          borderRadius: 8, background: T.white,
          border: `1px solid ${focused ? T.border2 : T.border}`,
          transition: "border-color 120ms ease",
          cursor: "text",
        }}
      >
        {/* Décoratif : le nom de l'établissement est déjà dans le champ, un
            lecteur d'écran n'a pas à entendre ses initiales en plus. */}
        {exact?.iconUrl && (
          <span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0 }}>
            <RoundLogo src={exact.iconUrl} size={22} name={exact.label} />
          </span>
        )}

        <input
          ref={inputRef}
          type="text"
          name={name}
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={showMenu ? listId : undefined}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); if (hasList) setOpen(true); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          style={{
            flex: 1, minWidth: 0, padding: 0, border: "none",
            background: "transparent", outline: "none",
            fontSize: 13, lineHeight: "18px", color: T.text, fontFamily: "inherit",
          }}
        />

        {loading && <Loader2 size={13} strokeWidth={1.75} color={T.textMut} className="anim-spin" />}

        {hasList && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            /* `onMouseDown` plutôt que `onClick`, et sans défaut : le champ ne
               doit pas perdre le focus pour ouvrir sa propre liste. La
               propagation s'arrête ici — le conteneur ouvre aussi la liste, et
               les deux ensemble annuleraient la fermeture. */
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
              inputRef.current?.focus();
            }}
            style={{
              width: 26, height: 26, borderRadius: 6, border: "none", flexShrink: 0,
              background: "transparent", color: T.textMut, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {showMenu
              ? <ChevronUp size={14} strokeWidth={2} />
              : <ChevronDown size={14} strokeWidth={2} />}
          </button>
        )}
      </div>

      <Popover
        anchorRef={boxRef}
        open={showMenu}
        onClose={close}
        gap={4}
        matchAnchorWidth
        maxHeight={maxMenuHeight}
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        className="anim-pop scroll-thin"
        style={{
          background: T.white,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          boxShadow: "var(--elev-overlay)",
          padding: 4,
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: "10px 12px", fontSize: 12, color: T.textMut, textAlign: "center" }}>
            {emptyLabel}
          </div>
        ) : (
          filtered.map((opt, idx) => {
            const selected = exact?.id === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(idx)}
                // Le `mousedown` du champ le fait perdre le focus avant le clic.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 8px", border: "none", borderRadius: 6,
                  background: idx === active ? T.accentBg : "transparent",
                  color: T.text, fontSize: 13, fontWeight: selected ? 600 : 400,
                  fontFamily: "inherit", textAlign: "left", cursor: "pointer",
                  transition: "background 100ms ease",
                }}
              >
                <span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0 }}>
                  <RoundLogo src={opt.iconUrl} size={22} name={opt.label} />
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {opt.label}
                </span>
              </button>
            );
          })
        )}
      </Popover>
    </div>
  );
}
