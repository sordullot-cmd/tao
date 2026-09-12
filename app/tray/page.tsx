"use client";

/**
 * Le popover de la barre d'état — ce que déroule l'icône, sur macOS.
 *
 * Il remplace un `NSMenu`, qui ne se dessine pas : macOS n'y accepte ni
 * couleur, ni graisse, ni mise en page. Mais il ne cherche pas à s'en
 * distinguer — au contraire. Un panneau posé sous la barre de menus voisine
 * ceux du système (Wi-Fi, son, batterie), et tout ce qui l'en écarte se lit
 * comme une erreur. Il en reprend donc les mesures et les usages, et ne garde
 * du dessin que ce qu'un menu natif ne savait PAS faire.
 *
 * ── CE QU'ON PREND AU MENU, ET CE QU'ON GARDE DU DESSIN ───────────────────
 *
 * Du menu : la largeur étroite, les lignes denses, la coche ✓ dans sa colonne à
 * gauche, les séparateurs, l'entête inerte, la surbrillance pleine largeur au
 * survol, les libellés qui annoncent l'action (« Arrêter l'enregistrement »).
 *
 * Du dessin : ce qu'aucun `NSMenu` ne permet — une zone de saisie pour noter au
 * journal sans ouvrir l'app, et une progression posée à sa place plutôt que
 * collée au titre. La barre de progression colorée, elle, a été retirée : elle
 * parlait le langage d'un tableau de bord, pas celui d'un menu.
 *
 * ── CETTE PAGE NE SAIT RIEN ───────────────────────────────────────────────
 *
 * Aucune lecture de `user_productivity`, aucun `useCloudState`, aucune session.
 * C'est délibéré, et c'est ce qui la rend simple : le popover est une SECONDE
 * webview, donc un second contexte JS où le relais mémoire de
 * `lib/routineChecklist` ne porte pas. Deux magasins vivants sur la même clé
 * auraient divergé au premier décochage.
 *
 * Elle reçoit donc tout de la fenêtre principale, par le Rust (`trayState` au
 * montage, puis `onTrayState`), et n'écrit jamais : un clic ÉMET l'événement
 * que le menu natif émettait déjà, que `components/TrayBridge.jsx` traite avant
 * de repousser la liste. Le chemin était éprouvé avant d'être réemprunté.
 *
 * ── DEUX DÉTAILS QUI NE SONT PAS DU CONFORT ───────────────────────────────
 *
 * 1. La coche est posée LOCALEMENT avant le retour de l'événement. L'aller-
 *    retour passe par une autre fenêtre ; sans cet optimisme, la case répondrait
 *    avec un temps de retard, ce qui se sent à la souris.
 * 2. La hauteur est mesurée et renvoyée au Rust. Une fenêtre sans décoration
 *    n'a pas de taille naturelle : figée, elle laisserait du vide sous une
 *    liste de trois règles et couperait une liste de douze.
 *
 * Le fond est TRANSPARENT (cf. `macOSPrivateApi`) : les angles arrondis et
 * l'ombre sont dessinés ici, la fenêtre native n'en portant aucun.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@/lib/notify";
import { T, HAIRLINE, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";
import { applyThemeForPage } from "@/lib/ui/sectionTheme";
import {
  EMPTY_TRAY_STATE,
  TRAY_CAPTURE,
  TRAY_JOURNAL,
  TRAY_RECORD,
  TRAY_SELECT,
  TRAY_TOGGLE,
  onTrayState,
  trayClose,
  trayEmit,
  trayOpenMain,
  trayQuit,
  trayResize,
  trayState,
  type TrayEntry,
  type TrayList,
} from "@/lib/tray/native";

/* La routine appartient à la page Discipline : le popover porte donc son thème,
   et non un thème propre. Sans cette ligne, il s'ouvrirait en clair au-dessus
   d'une app en sombre. */
const THEME_PAGE = "discipline";

/* Marge autour du panneau : c'est la place de l'ombre. La fenêtre native est
   opaque à la souris sur toute sa surface, mais transparente à l'œil — cette
   bande ne se voit donc que par ce qu'elle laisse passer. */
const PAD = 8;

/* Les mesures d'un menu de la barre de menus. Elles ne sont pas choisies : ce
   sont celles que le système emploie, et c'est tout l'intérêt de les reprendre.
   Une ligne y fait une vingtaine de pixels, avec sa colonne de coche à gauche
   et une gouttière étroite entre la surbrillance et le bord du panneau. */
const ROW_PADDING = "3px 8px";
const GUTTER = 5;
const CHECK_COL = 15;

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function TrayPopoverPage() {
  const [state, setState] = useState(EMPTY_TRAY_STATE);
  const [ready, setReady] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => { applyThemeForPage(THEME_PAGE); }, []);

  // État initial, puis les poussées suivantes.
  useEffect(() => {
    let dropped = false;
    trayState().then(s => {
      if (dropped) return;
      setState(s);
      setReady(true);
    });
    const off = onTrayState(s => { if (!dropped) setState(s); });
    return () => { dropped = true; off(); };
  }, []);

  /* Hauteur renvoyée au Rust. `useLayoutEffect` et non `useEffect` : la mesure
     doit précéder la peinture, sinon la fenêtre saute de taille sous les yeux
     à chaque coche. Un `ResizeObserver` par-dessus, parce que le contenu bouge
     aussi sans remontage — une liste qui arrive, un champ de note qui grandit. */
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el || !isTauri()) return;
    let last = 0;
    const push = () => {
      const h = Math.ceil(el.getBoundingClientRect().height) + PAD * 2;
      // Le bruit d'un pixel ne vaut pas un aller-retour natif.
      if (Math.abs(h - last) < 2) return;
      last = h;
      trayResize(h);
    };
    push();
    const ro = new ResizeObserver(push);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  /* Échap referme, comme tout menu de la barre d'état — mais PAS pendant qu'on
     écrit une note : la touche y sert d'abord à abandonner la saisie, et fermer
     le panneau jetterait le texte au même geste. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el instanceof HTMLTextAreaElement && el.value.trim()) return;
      trayClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback((id: string) => {
    // Optimisme local : voir l'entête du fichier.
    setState(s => ({ ...s, items: s.items.map(it => (it.id === id ? { ...it, done: !it.done } : it)) }));
    trayEmit(TRAY_TOGGLE, id);
  }, []);

  const selectList = useCallback((id: string) => {
    setState(s => ({ ...s, lists: s.lists.map(l => ({ ...l, active: l.id === id })) }));
    trayEmit(TRAY_SELECT, id);
  }, []);

  const done = state.items.filter(i => i.done).length;
  const total = state.items.length;

  return (
    <>
      {/* La fenêtre native n'a ni fond ni coins : c'est cette page qui les
          dessine. `overflow: hidden` sur `html` empêche l'ascenseur que la
          moindre sur-mesure ferait apparaître dans un panneau aussi étroit. */}
      <style dangerouslySetInnerHTML={{ __html: `
        html, body { background: transparent !important; margin: 0; overflow: hidden; }
        body { -webkit-user-select: none; user-select: none; cursor: default; }
      ` }} />

      <div style={{ padding: PAD }}>
        <div
          ref={panel}
          style={{
            borderRadius: 10,
            background: T.bg,
            /* Un demi-pixel de liseré : c'est le bord des menus du système, et
               il ne doit surtout pas se lire comme une bordure de carte. */
            boxShadow: `0 0 0 0.5px ${HAIRLINE}, 0 8px 24px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.14)`,
            padding: "5px 0",
            overflow: "hidden",
          }}
        >
          <Heading title={state.title || "Routine du jour"} done={done} total={total} />

          <Rules items={state.items} onToggle={toggle} native={isTauri()} ready={ready} />

          {state.lists.length > 1 && (
            <>
              <Separator />
              <SectionLabel text="Liste" />
              {state.lists.map(l => (
                <ListRow key={l.id} list={l} onPick={selectList} />
              ))}
            </>
          )}

          <Separator />
          <QuickNote />

          <Separator />
          <Row label="Capturer l’écran" onClick={() => { trayEmit(TRAY_CAPTURE); trayClose(); }} />
          <Row
            /* Un seul item dont le libellé dit ce qu'il va faire — exactement le
               parti du menu natif (cf. src-tauri/src/tray.rs). Deux entrées dont
               une toujours inerte se lisent moins vite. */
            label={state.recording ? "Arrêter l’enregistrement" : "Enregistrer l’écran"}
            onClick={() => { trayEmit(TRAY_RECORD); trayClose(); }}
          />

          <Separator />
          <Row label="Ouvrir tao" onClick={trayOpenMain} />
          <Row label="Quitter" onClick={trayQuit} />
        </div>
      </div>
    </>
  );
}

/* ─── Briques de menu ──────────────────────────────────────────────────────── */

/**
 * L'entête inerte, comme celui que le menu natif posait en première ligne.
 *
 * La progression s'y écrit en toutes lettres plutôt qu'en barre : « 3 sur 5 »
 * se lit d'un coup, ne prend pas de hauteur, et ne met pas de couleur dans un
 * panneau qui n'en a nulle part ailleurs.
 */
function Heading({ title, done, total }: { title: string; done: number; total: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
      padding: `2px ${8 + GUTTER}px 4px`,
    }}>
      <span style={{
        ...TYPE.caption,
        color: T.textMut,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {title}
      </span>
      {total > 0 && (
        <span style={{ ...TYPE.caption, color: T.textMut, flexShrink: 0 }}>
          {done} sur {total}
        </span>
      )}
    </div>
  );
}

/** Le trait des menus : pleine largeur à une gouttière près, et rien d'autre. */
function Separator() {
  return <div style={{ height: 1, background: HAIRLINE, margin: `5px ${GUTTER}px` }} />;
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ ...TYPE.caption, color: T.textMut, padding: `2px ${8 + GUTTER}px 3px` }}>
      {text}
    </div>
  );
}

/**
 * Une ligne de menu.
 *
 * La surbrillance au survol est un APLAT plein, pas un fond discret : c'est la
 * signature d'un menu macOS, et la seule couleur du panneau. Elle est
 * transitoire, donc elle n'ajoute rien au repos — ce qui était le reproche fait
 * à la jauge.
 *
 * `cursor: default` et non `pointer` : dans un menu, le curseur ne se change
 * pas en main. C'est un de ces détails qu'on ne remarque que quand il manque.
 */
function Row({ label, checked, muted, onClick }: {
  label: string;
  checked?: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const showCheck = checked !== undefined;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...TYPE.body,
        display: "flex", alignItems: "center",
        width: `calc(100% - ${GUTTER * 2}px)`,
        margin: `0 ${GUTTER}px`,
        padding: ROW_PADDING,
        textAlign: "left",
        border: "none",
        borderRadius: 5,
        background: hover ? T.brand : "transparent",
        color: hover ? "#FFFFFF" : muted ? T.textMut : T.text,
        cursor: "default",
      }}
    >
      {showCheck && (
        <span style={{ width: CHECK_COL, flexShrink: 0, display: "flex", alignItems: "center" }}>
          {checked && <Check />}
        </span>
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </button>
  );
}

/** La coche des menus : un ✓ fin, à l'encre du texte — jamais un aplat de couleur. */
function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 6.3 4.6 8.9 10 3" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Les règles ───────────────────────────────────────────────────────────── */

function Rules({ items, onToggle, native, ready }: {
  items: TrayEntry[]; onToggle: (id: string) => void; native: boolean; ready: boolean;
}) {
  if (!items.length) {
    return (
      <div style={{ ...TYPE.body, color: T.textMut, padding: `3px ${8 + GUTTER}px 5px` }}>
        {!ready ? "Chargement…"
          : native ? "Aucune règle de routine"
          : "Menu de l’app de bureau"}
      </div>
    );
  }
  /* Le défilement est borné ici, pas par la fenêtre : au-delà, c'est la hauteur
     renvoyée au Rust qui plafonne, et une liste de vingt règles doit rester
     parcourable sans que le pied de panneau parte hors de l'écran. */
  return (
    <div style={{ maxHeight: 320, overflowY: "auto" }}>
      {items.map(it => (
        <Row
          key={it.id}
          label={it.label || "—"}
          checked={it.done}
          // Une règle faite s'efface : ce qui reste à faire doit ressortir.
          muted={it.done}
          onClick={() => onToggle(it.id)}
        />
      ))}
    </div>
  );
}

function ListRow({ list, onPick }: { list: TrayList; onPick: (id: string) => void }) {
  return <Row label={list.name} checked={list.active} onClick={() => onPick(list.id)} />;
}

/* ─── Note de journal ──────────────────────────────────────────────────────── */

/**
 * Écrire au journal sans ouvrir l'app.
 *
 * Ce qu'on note en séance tient en une phrase — « sorti trop tôt sur NQ », « je
 * revenge-trade » — et c'est justement ce qui ne s'écrit jamais : ouvrir la
 * fenêtre, aller sur Journal, trouver la journée, le graphe a bougé entre-temps
 * et la phrase est perdue. Trois secondes de trajet suffisent à ne pas tenir un
 * journal.
 *
 * La note est AJOUTÉE à celle du jour, jamais substituée : c'est la même entrée
 * que celle de la page Journal (`daily_session_notes`, une par date), et
 * l'écraser effacerait ce que la séance du matin y avait déjà mis. La couture se
 * fait dans la fenêtre principale, seule à tenir le magasin (cf.
 * components/TrayBridge.jsx) — ici on n'envoie que le texte.
 *
 * ⏎ envoie, ⇧⏎ passe à la ligne. Pas de bouton d'envoi : un aplat de couleur se
 * verrait de trop dans un menu, et le rappel « ⏎ » en dit autant pour rien.
 */
function QuickNote() {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [focused, setFocused] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);

  /* L'accusé de réception s'efface seul. Sans lui, rien ne distingue une note
     partie d'un champ qu'on aurait vidé par mégarde ; en le laissant, il
     finirait par se lire comme une étiquette permanente. */
  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => setSent(false), 2200);
    return () => clearTimeout(id);
  }, [sent]);

  const send = () => {
    const clean = text.trim();
    if (!clean) return;
    trayEmit(TRAY_JOURNAL, clean);
    setText("");
    setSent(true);
    // Le champ garde la main : on note souvent deux choses de suite.
    area.current?.focus();
  };

  /* Le champ grandit avec le texte, dans la limite de trois lignes. Une hauteur
     fixe imposerait un ascenseur dans un champ de deux lignes — illisible —, et
     sans limite le panneau finirait par couvrir l'écran. */
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 60)}px`;
  };

  return (
    <div style={{ padding: `1px ${GUTTER}px`, position: "relative" }}>
      <textarea
        ref={el => { area.current = el; grow(el); }}
        value={text}
        onChange={e => { setText(e.target.value); grow(e.target); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
        }}
        rows={1}
        placeholder={sent ? "Ajouté au journal" : "Noter au journal…"}
        style={{
          ...TYPE.body,
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          resize: "none",
          padding: "4px 22px 4px 8px",
          borderRadius: 5,
          border: "none",
          background: FIELD_BG,
          color: T.text,
          outline: focused ? `2px solid ${T.brand}` : "none",
          outlineOffset: -1,
          fontFamily: "inherit",
          /* Un champ de saisie est la seule chose ici qu'on doit pouvoir
             sélectionner : le panneau entier est verrouillé (cf. le style
             global), sans quoi glisser dessus surlignerait les libellés. */
          WebkitUserSelect: "text",
          userSelect: "text",
          cursor: "text",
        }}
      />
      {/* Le rappel ne s'affiche qu'une fois qu'il y a quelque chose à envoyer. */}
      {!!text.trim() && (
        <span style={{
          ...TYPE.caption,
          position: "absolute", right: GUTTER + 7, bottom: 6,
          color: T.textMut, pointerEvents: "none",
        }}>
          ⏎
        </span>
      )}
    </div>
  );
}
