"use client";

/**
 * Le popover de la barre d'état — ce que déroule l'icône, sur macOS.
 *
 * Il remplace un `NSMenu`, qui ne se dessine pas : macOS n'y accepte ni
 * couleur, ni graisse, ni mise en page. La routine du jour y tenait en texte
 * brut, jusqu'à la progression qui s'écrivait « — 3/5 » dans un entête inerte.
 * Ici, elle se lit d'un coup d'œil : une jauge d'un segment par règle, et la
 * même case à cocher que la page Discipline.
 *
 * ── CETTE PAGE NE SAIT RIEN ───────────────────────────────────────────────
 *
 * Aucune lecture de `user_productivity`, aucun `useCloudState`, aucune session.
 * C'est délibéré, et c'est ce qui la rend simple : le popover est une SECONDE
 * webview, donc un second contexte JS où le relais mémoire de
 * `lib/routineChecklist` ne porte pas. Deux magasins vivants sur la même clé
 * auraient divergé au premier décochage.
 *
 * Elle reçoit donc tout de la fenêtre principale, par le Rust :
 *
 *   `tray_get_checklist` au montage (l'état déjà poussé, pour se peindre tout
 *   de suite), puis l'événement `tray-checklist-state` à chaque changement.
 *
 * Et elle n'écrit jamais : un clic ÉMET l'événement que le menu natif émettait
 * déjà (`tray-checklist-toggle`), que `components/TrayBridge.jsx` traite dans
 * la fenêtre principale avant de repousser la liste. Le chemin est donc
 * exactement celui du menu — ce qui veut dire qu'il était déjà éprouvé.
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
 *
 * ── POURQUOI LA PALETTE D'APPLE ET NON CELLE DE L'APP ─────────────────────
 *
 * C'est la seule surface du produit qui ne s'affiche pas DANS l'app : elle
 * s'ouvre sous la barre de menus, entre les panneaux du Wi-Fi et de la
 * batterie. Le vert de marque s'y lisait comme un corps étranger, là où le bleu
 * système se lit sans y penser. D'où `MAC` (cf. lib/ui/tokens.ts) — la seule
 * dérogation à la règle « tout descend de l'accent », et elle ne vaut que pour
 * ce fichier.
 *
 * Les mesures sont serrées pour la même raison : un panneau de la barre de
 * menus est une colonne, pas une carte. Tout ce qui l'élargit ou l'aère
 * l'éloigne de ses voisins.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isTauri } from "@/lib/notify";
import { MAC } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
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
  type TrayState,
} from "@/lib/tray/native";

/* Marge autour du panneau : c'est la place de l'ombre. La fenêtre native est
   opaque à la souris sur toute sa surface, mais transparente à l'œil — cette
   bande ne se voit donc que par ce qu'elle laisse passer. */
const PAD = 8;

/* ─── Pictogrammes ─────────────────────────────────────────────────────────── */

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 6.2 4.8 8.5 9.5 3.5" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="4" width="13" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 4 6.6 2.2h2.8L10.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="8" cy="8.7" r="2.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function RecordIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />
      {on
        ? <rect x="5.6" y="5.6" width="4.8" height="4.8" rx="1" fill="currentColor" />
        : <circle cx="8" cy="8" r="3" fill="currentColor" />}
    </svg>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function TrayPopoverPage() {
  const [state, setState] = useState<TrayState>(EMPTY_TRAY_STATE);
  const [ready, setReady] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  /* Le thème suit l'APPARENCE DU SYSTÈME, et non la section de l'app.
     C'est la seule surface où la règle de `lib/ui/sectionTheme` ne s'applique
     pas, pour la même raison que la palette : ce panneau s'ouvre entre ceux du
     Wi-Fi et de la batterie, qui suivent tous les réglages du Mac. Lui faire
     porter le thème de la page Discipline — sombre, puisque trading — le
     rendait noir au milieu de panneaux blancs sur un Mac en apparence claire.

     L'écoute vaut le détour : macOS bascule seul au coucher du soleil, et un
     popover qui garde l'apparence de la veille est une fenêtre à rouvrir pour
     rien. */
  useEffect(() => {
    /* `matchMedia` au conditionnel, comme dans `effectiveTheme()` : tout
       environnement de rendu ne l'expose pas, et une apparence manquante doit
       laisser le thème clair plutôt que faire tomber la page. */
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const apply = () => {
      document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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
     aussi sans remontage — une liste qui arrive, un mode d'enregistrement. */
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
  const complete = total > 0 && done === total;

  /* Date COURTE. La forme longue (« vendredi 12 septembre ») occupait la
     largeur entière d'un panneau qui n'en a pas à revendre, pour une précision
     dont personne n'a besoin en ouvrant sa routine du jour. */
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <>
      {/* La fenêtre native n'a ni fond ni coins : c'est cette page qui les
          dessine. Le `overflow: hidden` sur `html` empêche l'ascenseur que la
          moindre sur-mesure ferait apparaître dans un panneau de 340 px. */}
      <style dangerouslySetInnerHTML={{ __html: `
        html, body { background: transparent !important; margin: 0; overflow: hidden; }
        body { -webkit-user-select: none; user-select: none; cursor: default; }
      ` }} />

      <div style={{ padding: PAD }}>
        <div
          ref={panel}
          /* AUCUN FOND, AUCUNE BORDURE, AUCUNE OMBRE. Le matériau de vibrancy
             est appliqué à la FENÊTRE (cf. src-tauri/src/tray.rs) : la moindre
             couleur posée ici le recouvrirait, et on retomberait sur l'aplat
             gris qu'on cherchait à éviter. Le rayon ne sert qu'à rogner le
             contenu sur la courbe que l'effet dessine déjà. */
          style={{ borderRadius: 11, overflow: "hidden" }}
        >
          <Header
            title={state.title || "Routine du jour"}
            date={today}
            done={done}
            total={total}
            complete={complete}
            recording={state.recording}
          />

          {state.lists.length > 1 && (
            <ListPicker lists={state.lists} onPick={selectList} />
          )}

          <Rules items={state.items} onToggle={toggle} native={isTauri()} ready={ready} />

          <QuickNote />

          <Footer recording={state.recording} />
        </div>
      </div>
    </>
  );
}

/* ─── Entête ───────────────────────────────────────────────────────────────── */

function Header({ title, date, done, total, complete, recording }: {
  title: string; date: string; done: number; total: number; complete: boolean; recording: boolean;
}) {
  return (
    <div style={{ padding: "9px 11px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ ...TYPE.caption2, color: MAC.label3, textTransform: "uppercase" }}>
          {date}
        </div>
        {recording && <RecordingDot />}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 1 }}>
        <div style={{
          ...TYPE.headline,
          color: MAC.label,
          // Un nom de liste long ne doit pas pousser le compteur hors du panneau.
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {title}
        </div>
        <div style={{ ...TYPE.caption, ...TABULAR, color: complete ? MAC.label : MAC.label2, flexShrink: 0 }}>
          {total > 0 ? `${done} / ${total}` : "—"}
        </div>
      </div>

      {total > 0 && <Gauge done={done} total={total} />}
    </div>
  );
}

/**
 * Jauge à un segment par règle.
 *
 * Une barre continue dirait la proportion ; celle-ci dit aussi COMBIEN il reste
 * de règles — l'information qu'on vient chercher à onze heures du matin. Au-delà
 * d'une douzaine, les segments deviendraient des traits : on repasse alors à une
 * barre pleine, qui reste juste.
 */
function Gauge({ done, total }: { done: number; total: number }) {
  const ratio = total ? done / total : 0;

  if (total > 12) {
    return (
      <div style={{ marginTop: 7, height: 3, borderRadius: 2, background: MAC.fill, overflow: "hidden" }}>
        <div style={{
          width: `${ratio * 100}%`, height: "100%", borderRadius: 2,
          background: MAC.label, transition: "width 180ms ease",
        }} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 7, display: "flex", gap: 3 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i < done ? MAC.label : MAC.fill,
          transition: "background 180ms ease",
        }} />
      ))}
    </div>
  );
}

/** Pastille d'enregistrement en cours — la seule chose qui le signale hors de l'app. */
function RecordingDot() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
      <style dangerouslySetInnerHTML={{ __html:
        "@keyframes tray-rec { 0%,100% { opacity: 1 } 50% { opacity: .35 } }" }} />
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: MAC.label,
        animation: "tray-rec 1.6s ease-in-out infinite",
      }} />
      <span style={{ ...TYPE.caption2, color: MAC.label, textTransform: "uppercase" }}>Enreg.</span>
    </div>
  );
}

/* ─── Choix de liste ───────────────────────────────────────────────────────── */

/**
 * Le choix de liste, en contrôle segmenté — et non en pilules.
 *
 * Une pilule de l’app mesure 34 px de haut pour 16 px de marge latérale
 * (lib/ui/buttons.ts) : trois listes en occuperaient la moitié d’un panneau de
 * 340 px, au-dessus de ce qu’on vient réellement lire. Le segment est la forme
 * que macOS donne lui-même à ce choix-là dans ses popovers, et il tient sur une
 * ligne.
 */
function ListPicker({ lists, onPick }: { lists: TrayList[]; onPick: (id: string) => void }) {
  return (
    <div style={{ padding: "0 11px 8px" }}>
      <div style={{
        display: "flex", gap: 2, padding: 2,
        background: MAC.fill, borderRadius: 9,
        overflowX: "auto", scrollbarWidth: "none",
      }}>
        {lists.map(l => (
          <button
            key={l.id}
            onClick={() => onPick(l.id)}
            style={{
              ...TYPE.caption,
              flex: 1,
              padding: "4px 7px",
              borderRadius: 6,
              border: "none",
              /* Le segment actif est un aplat de FOND, pas de marque : il dit
                 « c’est ici », là où la jauge dit déjà l’avancement. Deux verts
                 dans quarante pixels se disputeraient l’œil. */
              background: l.active ? MAC.raised : "transparent",
              boxShadow: l.active ? "0 1px 2px rgba(0,0,0,0.14)" : "none",
              color: l.active ? MAC.label : MAC.label2,
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Les règles ───────────────────────────────────────────────────────────── */

function Rules({ items, onToggle, native, ready }: {
  items: TrayEntry[]; onToggle: (id: string) => void; native: boolean; ready: boolean;
}) {
  if (!items.length) {
    return (
      <div style={{ borderTop: `1px solid ${MAC.sep}`, padding: "13px 11px", textAlign: "center" }}>
        <div style={{ ...TYPE.body, color: MAC.label2 }}>
          {!ready ? "Chargement…"
            : native ? "Aucune règle de routine"
            : "Cette page est le menu de l'app de bureau."}
        </div>
        {ready && native && (
          <div style={{ ...TYPE.caption, color: MAC.label3, marginTop: 4 }}>
            Elles s’écrivent dans Discipline.
          </div>
        )}
      </div>
    );
  }

  return (
    /* Le défilement est borné ici, pas par la fenêtre : au-delà, c'est la
       hauteur renvoyée au Rust qui plafonne, et une liste de vingt règles doit
       rester parcourable sans que le pied de panneau parte hors de l'écran. */
    <div style={{ borderTop: `1px solid ${MAC.sep}`, padding: "3px 5px", maxHeight: 300, overflowY: "auto" }}>
      {items.map(it => <Rule key={it.id} entry={it} onToggle={onToggle} />)}
    </div>
  );
}

function Rule({ entry, onToggle }: { entry: TrayEntry; onToggle: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onToggle(entry.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 9,
        width: "100%", textAlign: "left",
        padding: "5px 6px",
        border: "none", borderRadius: 6,
        background: hover ? MAC.fill : "transparent",
        cursor: "pointer",
      }}
    >
      <span style={{
        flexShrink: 0,
        width: 15, height: 15, borderRadius: "50%",
        display: "grid", placeItems: "center",
        border: `1.5px solid ${entry.done ? "transparent" : MAC.label3}`,
        background: entry.done ? MAC.label : "transparent",
        color: MAC.labelInv,
        transition: "background 140ms ease, border-color 140ms ease",
      }}>
        {entry.done && <Check />}
      </span>
      <span style={{
        ...TYPE.body,
        color: entry.done ? MAC.label3 : MAC.label,
        // Une règle tient sur une ligne : sur deux, la liste perd son rythme et
        // la fenêtre grandit pour un libellé mal écrit.
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {entry.label || "—"}
      </span>
    </button>
  );
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
 * l'écraser effacerait ce que la séance du matin y avait déjà mis. La couture
 * se fait dans la fenêtre principale, seule à tenir le magasin (cf.
 * components/TrayBridge.jsx) — ici on n'envoie que le texte.
 *
 * ⏎ envoie, ⇧⏎ passe à la ligne : l'inverse coûterait un clic à chaque note,
 * pour un champ dont l'usage normal tient sur une ligne.
 */
function QuickNote() {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
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

  /* Le champ grandit avec le texte, dans la limite de quatre lignes. Une hauteur
     fixe imposerait un ascenseur dans un champ de trois lignes — illisible —, et
     sans limite le panneau finirait par couvrir l'écran. */
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 88)}px`;
  };

  return (
    <div style={{ borderTop: `1px solid ${MAC.sep}`, padding: "7px 8px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <textarea
          ref={el => { area.current = el; grow(el); }}
          value={text}
          onChange={e => { setText(e.target.value); grow(e.target); }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={1}
          placeholder={sent ? "Ajouté au journal du jour" : "Noter au journal…"}
          style={{
            ...TYPE.body,
            flex: 1,
            resize: "none",
            padding: "5px 8px",
            borderRadius: 6,
            border: `1px solid ${MAC.sep}`,
            background: MAC.fill,
            color: MAC.label,
            outline: "none",
            fontFamily: "inherit",
            // Un champ de saisie est la seule chose ici qu'on doit pouvoir
            // sélectionner : le panneau entier est verrouillé (cf. le style
            // global), sans quoi le glissement dessus surlignerait les libellés.
            WebkitUserSelect: "text",
            userSelect: "text",
          }}
        />
        <SendButton active={!!text.trim()} onClick={send} />
      </div>
    </div>
  );
}

function SendButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={!active}
      aria-label="Ajouter au journal"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 27, height: 27,
        flexShrink: 0,
        display: "grid", placeItems: "center",
        borderRadius: 6,
        border: "none",
        background: active ? MAC.label : MAC.fill,
        color: active ? MAC.labelInv : MAC.label3,
        opacity: active && hover ? 0.88 : 1,
        cursor: active ? "pointer" : "default",
        transition: "background 140ms ease, opacity 140ms ease",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2.6 8h10.2M8.6 3.4 13.2 8l-4.6 4.6" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/* ─── Pied ─────────────────────────────────────────────────────────────────── */

function Footer({ recording }: { recording: boolean }) {
  return (
    <div style={{ borderTop: `1px solid ${MAC.sep}`, padding: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <Action
          icon={<CameraIcon />}
          label="Capturer"
          onClick={() => { trayEmit(TRAY_CAPTURE); trayClose(); }}
        />
        <Action
          icon={<RecordIcon on={recording} />}
          label={recording ? "Arrêter" : "Enregistrer"}
          onClick={() => { trayEmit(TRAY_RECORD); trayClose(); }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <Quiet label="Ouvrir l’app" onClick={trayOpenMain} />
        <Quiet label="Quitter" onClick={trayQuit} />
      </div>
    </div>
  );
}

function Action({ icon, label, onClick }: {
  icon: ReactNode; label: string; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...TYPE.label,
        flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "6px 9px",
        borderRadius: 6,
        border: `1px solid ${MAC.sep}`,
        background: hover ? MAC.fill : "transparent",
        color: MAC.label,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Quiet({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...TYPE.caption,
        padding: "4px 6px",
        border: "none", background: "transparent",
        color: hover ? MAC.label : MAC.label3,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
