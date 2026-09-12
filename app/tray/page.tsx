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

/* Aucune marge autour du panneau. Elle servait à loger une ombre dessinée en
   CSS ; l'ombre est celle du système depuis le passage au verre, et le matériau
   occupe TOUTE la fenêtre. Une marge y laisserait une bande de verre nu autour
   du contenu, et le liseré d'arête tomberait au mauvais endroit — au bord du
   contenu au lieu du bord de la plaque. */
const PAD = 0;

/* Le rayon des coins. Il est dessiné par l'effet de vibrancy, côté Rust
   (`glass()` dans src-tauri/src/tray.rs) : la valeur est donc reprise ici, et
   non décidée — le liseré et le rognage du contenu doivent suivre la MÊME
   courbe, faute de quoi on voit un coin dépasser de l'autre. */
const RADIUS = 12;

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
        html { background: transparent !important; margin: 0; overflow: hidden; }
        /* Le voile, et rien de plus : la page ne doit toujours pas peindre de
           fond opaque, sinon elle recouvre le matériau (cf. src-tauri/src/tray.rs).
           Un blanc translucide l'éclaircit en le laissant vivre. */
        body { background: ${MAC.veil} !important; margin: 0; overflow: hidden; }
        body { -webkit-user-select: none; user-select: none; cursor: default; }
        /* L'arête de la plaque de verre. En pseudo-élément fixe et non en
           bordure d'un bloc : elle doit épouser le bord de la FENÊTRE, là où
           l'effet dessine sa courbe, et non celui du contenu. Le second reflet,
           plus marqué sur la seule arête du haut, est ce que fait la lumière sur
           une plaque posée à plat. */
        body::after {
          content: ""; position: fixed; inset: 0;
          border-radius: ${RADIUS}px;
          box-shadow: inset 0 0 0 0.5px ${MAC.rim}, inset 0 0.5px 0 0 ${MAC.rim};
          pointer-events: none;
        }
      ` }} />

      <div style={{ padding: PAD }}>
        <div
          ref={panel}
          /* AUCUN FOND, AUCUNE BORDURE, AUCUNE OMBRE. Le matériau de vibrancy
             est appliqué à la FENÊTRE (cf. src-tauri/src/tray.rs) : la moindre
             couleur posée ici le recouvrirait, et on retomberait sur l'aplat
             gris qu'on cherchait à éviter. Le rayon ne sert qu'à rogner le
             contenu sur la courbe que l'effet dessine déjà. */
          style={{ borderRadius: RADIUS, overflow: "hidden", padding: "5px 0" }}
        >
          <Header
            title={state.title || "Routine du jour"}
            date={today}
            done={done}
            total={total}
            complete={complete}
            recording={state.recording}
            lists={state.lists}
            onPick={selectList}
          />

          <Sep />
          <Rules items={state.items} onToggle={toggle} native={isTauri()} ready={ready} />

          <Sep />
          <QuickNote />

          <Sep />
          <Footer recording={state.recording} />
        </div>
      </div>
    </>
  );
}

/**
 * Le trait qui sépare deux blocs.
 *
 * En élément propre, et non en `borderTop` du bloc suivant : une bordure court
 * d'un bord à l'autre du panneau et vient buter contre la courbe des angles —
 * le trait touche le verre là où il commence à tourner, et ça se voit. Une
 * marge de chaque côté l'arrête avant, comme dans les menus du système.
 */
function Sep() {
  return <div style={{ height: 1, background: MAC.sep, margin: "0 10px" }} />;
}

/* ─── Entête ───────────────────────────────────────────────────────────────── */

function Header({ title, date, done, total, complete, recording, lists, onPick }: {
  title: string; date: string; done: number; total: number; complete: boolean;
  recording: boolean; lists: TrayList[]; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const many = lists.length > 1;
  /* Plus de jauge sous le titre. Une barre remplie est un code de tableau de
     bord : elle pesait le tiers de l'entête et mettait un aplat de couleur au
     repos, là où « 3 / 5 » dit la même chose sur la ligne déjà présente. */
  return (
    <div style={{ padding: "9px 11px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ ...TYPE.caption2, color: MAC.label3, textTransform: "uppercase" }}>
          {date}
        </div>
        {recording && <RecordingDot />}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 1 }}>
        {/* Le NOM de la stratégie est le déclencheur.

            La rangée de segments qui servait à en changer occupait une ligne
            entière pour un réglage qu'on touche une fois par jour, au-dessus de
            la routine, qu'on vient lire à chaque ouverture. Or le titre affiche
            DÉJÀ la stratégie active : en faire le bouton ne coûte rien et rend
            la ligne. C'est le « pop-up button » d'AppKit, et c'est ce que macOS
            emploie partout où un choix exclusif doit tenir dans un panneau. */}
        <button
          onClick={() => many && setOpen(o => !o)}
          disabled={!many}
          style={{
            ...TYPE.headline,
            display: "flex", alignItems: "center", gap: 4,
            minWidth: 0,
            padding: 0, border: "none", background: "transparent",
            color: MAC.label,
            cursor: many ? "pointer" : "default",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
          {/* Le chevron n'apparaît QUE s'il y a de quoi choisir : sur une seule
              stratégie, il annoncerait un menu qui ne s'ouvre pas. */}
          {many && <Chevron open={open} />}
        </button>

        <div style={{ ...TYPE.caption, ...TABULAR, color: complete ? MAC.label : MAC.label2, flexShrink: 0 }}>
          {total > 0 ? `${done} / ${total}` : "—"}
        </div>
      </div>

      {open && <ListPicker lists={lists} onPick={id => { onPick(id); setOpen(false); }} />}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden
      style={{
        flexShrink: 0,
        color: MAC.label3,
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform 160ms ease",
      }}
    >
      <path d="M2 3.8 5 6.8 8 3.8" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

/* ─── Choix de stratégie ───────────────────────────────────────────────────── */

/**
 * Les stratégies, déroulées sous le titre qui les porte.
 *
 * Des lignes cochées, et non des segments : le contrôle segmenté suppose qu'on
 * compare des options côte à côte, ce qui demande de la largeur et n'a de sens
 * qu'à deux ou trois. Une routine par stratégie, il y en a autant qu'on en
 * trade — la rangée devenait illisible et débordait. Empilées, elles tiennent
 * quel qu'en soit le nombre, et la coche dit laquelle est active sans avoir à
 * comparer des fonds.
 *
 * Le déroulé est REPLIÉ par défaut : c'est un réglage qu'on touche une fois par
 * séance, il n'a pas à occuper le panneau qu'on ouvre vingt fois par jour.
 */
function ListPicker({ lists, onPick }: { lists: TrayList[]; onPick: (id: string) => void }) {
  return (
    <div style={{ marginTop: 6, maxHeight: 150, overflowY: "auto" }}>
      {lists.map(l => <ListRow key={l.id} list={l} onPick={onPick} />)}
    </div>
  );
}

function ListRow({ list, onPick }: { list: TrayList; onPick: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onPick(list.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...TYPE.body,
        display: "flex", alignItems: "center", gap: 7,
        width: "100%", textAlign: "left",
        padding: "4px 6px",
        border: "none", borderRadius: 5,
        background: hover ? MAC.fill : "transparent",
        color: list.active ? MAC.label : MAC.label2,
        cursor: "pointer",
      }}
    >
      {/* La coche occupe sa colonne même vide : sans elle, les noms danseraient
          d'un cran en changeant de stratégie. */}
      <span style={{ width: 11, flexShrink: 0, display: "flex", alignItems: "center" }}>
        {list.active && <Check />}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {list.name}
      </span>
    </button>
  );
}

/* ─── Les règles ───────────────────────────────────────────────────────────── */

function Rules({ items, onToggle, native, ready }: {
  items: TrayEntry[]; onToggle: (id: string) => void; native: boolean; ready: boolean;
}) {
  if (!items.length) {
    return (
      <div style={{ padding: "13px 11px", textAlign: "center" }}>
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
    <div style={{ padding: "3px 5px", maxHeight: 300, overflowY: "auto" }}>
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
    <div style={{ padding: "7px 8px" }}>
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
            /* Pas de cadre : le creux suffit à dire qu'on peut écrire là, et un
               trait gris de plus dans un panneau qui en a déjà trois le découpe
               en cases. */
            border: "none",
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
    <div style={{ padding: 6 }}>
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
        /* Sans contour : un cadre posé sur du verre le découpe en cases, et
           deux boutons encadrés côte à côte se lisent comme un formulaire. Le
           survol suffit à dire qu'on peut cliquer — c'est le parti des panneaux
           du système. */
        border: "none",
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
