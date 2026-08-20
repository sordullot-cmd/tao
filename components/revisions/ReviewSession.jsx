"use client";

/**
 * La séance de révision.
 *
 * Un écran, une carte, quatre boutons. Tout le reste est écarté : c'est le seul
 * moment de l'application où l'attention doit tenir sur une phrase pendant
 * quelques secondes, et chaque élément d'interface visible en même temps est un
 * prétexte à décrocher.
 *
 * Le geste central est le RAPPEL ACTIF : on doit chercher la réponse AVANT de
 * la voir. D'où la révélation en deux temps, jamais la carte entière d'un bloc —
 * lire une question et sa réponse ensemble ne mémorise rien.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Undo2, Pencil, EyeOff, MoonStar, Flame } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
/* Les briques de formulaire sont importées de `components/ui/form` et les
   aplats de `lib/ui/tokens`, plutôt que de passer par `components/ui/da` qui
   les réexporte : ce chemin-là est valide dans tous les cas, alors que le bloc
   de réexport de `da.jsx` a déjà disparu une fois. Les briques de MISE EN PAGE
   (carte, titre de section, fil d'Ariane) viennent bien de `da`, elles y sont
   définies. */
import { IconButton } from "@/components/ui/form";
import { formatInterval, previewRatings } from "@/lib/srs/fsrs";
import { renderCard } from "@/lib/srs/model";
import { answerCard, pickNext, tagAsLeech } from "@/lib/srs/queue";

/* Les quatre réponses. L'ordre et les couleurs sont ceux d'Anki : on les
   retrouve sous les doigts sans réapprendre, et le rouge est à gauche parce que
   c'est là que tombe l'index quand on tape 1. */
const ANSWERS = [
  { rating: 1, label: "À revoir", key: "1", color: PALETTE.red },
  { rating: 2, label: "Difficile", key: "2", color: PALETTE.orange },
  { rating: 3, label: "Correct", key: "3", color: PALETTE.green },
  { rating: 4, label: "Facile", key: "4", color: PALETTE.blue },
];

/** Pastille de décompte : le nombre, sa couleur, et rien d'autre. */
function Counter({ value, color, label, dim }) {
  return (
    <div title={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, opacity: dim ? 0.3 : 1 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: dim ? T.textMut : T.text, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

export default function ReviewSession({ store, setStore, queue, openedAt, onExit, onEditNote }) {
  const [remaining, setRemaining] = useState(queue.cardIds);
  /* La carte servie. C'est un état posé par les GESTES (répondre, suspendre,
     reporter, annuler), jamais dérivé dans un effet : le choix dépend de
     l'heure, et le recalculer à chaque rendu ferait sauter la carte sous les
     yeux. L'instant d'ouverture vient du parent pour que la toute première
     sélection n'ait pas à lire l'horloge pendant le rendu. */
  const [currentId, setCurrentId] = useState(
    () => pickNext(store, queue.cardIds, openedAt, 0),
  );
  const [revealed, setRevealed] = useState(false);
  const [served, setServed] = useState(0);
  const [done, setDone] = useState(0);
  const [toast, setToast] = useState(null);
  /* Instantané du magasin avant la dernière réponse. Se tromper de bouton
     arrive — et sans retour arrière, la seule issue serait de vivre avec un
     intervalle faux pendant des mois. */
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  /* Horodatage du début d'examen de la carte courante, posé par l'effet qui la
     choisit et non ici : lire l'horloge pendant le rendu rendrait le composant
     impur, et la valeur serait fausse dès le premier re-rendu. */
  const startedAt = useRef(0);
  /* Taille de la file au DÉPART, figée à l'ouverture : c'est le dénominateur de
     la barre d'avancement. En état plutôt qu'en référence — elle est lue pendant
     le rendu, ce qu'une référence n'a pas le droit de faire. */
  const [total] = useState(queue.cardIds.length);

  const card = useMemo(
    () => store.cards.find(c => c.id === currentId) || null,
    [store.cards, currentId],
  );
  const note = useMemo(
    () => (card ? store.notes.find(n => n.id === card.noteId) : null),
    [store.notes, card],
  );

  /** Passe à la carte suivante. Appelée par tous les gestes qui retirent la
   *  carte courante de l'écran. `cards` est l'état APRÈS le geste : la file se
   *  choisit sur les cartes telles qu'elles viennent d'être modifiées, pas
   *  telles qu'elles étaient au rendu précédent. */
  const advance = useCallback((cards, nextRemaining, now, servedCount) => {
    setRemaining(nextRemaining);
    setCurrentId(pickNext({ ...store, cards }, nextRemaining, now, servedCount));
    setRevealed(false);
    setServed(servedCount);
    startedAt.current = Date.now();
  }, [store]);

  const counts = useMemo(() => {
    const byId = new Map(store.cards.map(c => [c.id, c]));
    const out = { new: 0, learning: 0, review: 0 };
    for (const id of remaining) {
      const c = byId.get(id);
      if (!c) continue;
      if (c.state === "review") out.review++;
      else if (c.state === "relearning" || c.reps > 0) out.learning++;
      else out.new++;
    }
    return out;
  }, [remaining, store.cards]);

  const previews = useMemo(() => {
    if (!card) return null;
    return previewRatings(card, new Date(), store.config, card.id);
  }, [card, store.config]);

  const answer = useCallback((rating) => {
    if (!card) return;
    const now = new Date();
    // `startedAt` vaut 0 tant que l'effet de sélection n'a pas tourné : on ne
    // journalise pas une durée de cinquante-six ans.
    const spent = startedAt.current ? Date.now() - startedAt.current : undefined;
    const result = answerCard(store, card.id, rating, now, spent);
    if (!result) return;

    setUndoSnapshot({ cards: store.cards, log: store.log, notes: store.notes, cardId: card.id, remaining });

    setStore(prev => ({
      ...prev,
      cards: result.cards,
      log: result.log,
      notes: result.becameLeech ? tagAsLeech(prev.notes, card.noteId) : prev.notes,
    }));

    if (result.becameLeech) {
      setToast({
        tone: "warn",
        text: result.suspended
          ? "Sangsue : carte suspendue. Elle vous a coûté trop d'échecs — reformulez-la avant de la remettre."
          : "Sangsue : carte marquée. Elle mérite d'être reformulée.",
      });
    } else {
      setToast({ tone: "neutral", text: `Revue dans ${formatInterval(result.intervalMs)}` });
    }

    setDone(d => d + 1);
    // Une carte encore en paliers reste dans la séance ; les sœurs enfouies en
    // sortent, sans quoi on les verrait juste après leur jumelle.
    const buried = new Set(
      result.cards.filter(c => c.buriedUntil && new Date(c.buriedUntil) > now).map(c => c.id),
    );
    const nextRemaining = remaining.filter(id => (
      id === card.id ? result.stillInSession : !buried.has(id)
    ));
    advance(result.cards, nextRemaining, now, served + 1);
  }, [card, store, setStore, remaining, served, advance]);

  const undo = useCallback(() => {
    if (!undoSnapshot) return;
    setStore(prev => ({
      ...prev,
      cards: undoSnapshot.cards,
      log: undoSnapshot.log,
      notes: undoSnapshot.notes,
    }));
    setRemaining(undoSnapshot.remaining);
    setCurrentId(undoSnapshot.cardId);
    setRevealed(true);
    setDone(d => Math.max(0, d - 1));
    setUndoSnapshot(null);
    setToast(null);
  }, [undoSnapshot, setStore]);

  const suspend = useCallback(() => {
    if (!card) return;
    const cards = store.cards.map(c => (c.id === card.id ? { ...c, suspended: true } : c));
    setStore(prev => ({ ...prev, cards }));
    advance(cards, remaining.filter(id => id !== card.id), new Date(), served + 1);
    setToast({ tone: "neutral", text: "Carte suspendue. Elle ne reviendra plus tant qu'on ne la réactive pas." });
  }, [card, store.cards, setStore, remaining, served, advance]);

  const bury = useCallback(() => {
    if (!card) return;
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + 1);
    until.setHours(store.dayCutoffHour, 0, 0, 0);
    const cards = store.cards.map(
      c => (c.id === card.id ? { ...c, buriedUntil: until.toISOString() } : c),
    );
    setStore(prev => ({ ...prev, cards }));
    advance(cards, remaining.filter(id => id !== card.id), now, served + 1);
    setToast({ tone: "neutral", text: "Reportée à demain." });
  }, [card, store.cards, store.dayCutoffHour, setStore, remaining, served, advance]);

  /* Raccourcis clavier. Toute la séance se mène au clavier : c'est ce qui fait
     la différence entre vingt minutes tenables et vingt minutes de clics. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "Escape") { e.preventDefault(); onExit(); return; }
      if (!card) return;
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); setRevealed(true); }
        return;
      }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); answer(3); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= 4) { e.preventDefault(); answer(n); return; }
      if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, answer, undo, onExit]);

  // Le retour d'intervalle s'efface tout seul : c'est une confirmation, pas un
  // message à traiter. Les alertes de sangsue restent, elles demandent une action.
  useEffect(() => {
    if (!toast || toast.tone === "warn") return undefined;
    const handle = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(handle);
  }, [toast]);

  const rendered = note && card ? renderCard(note, card.ord) : null;
  const progress = total ? done / total : 0;

  /* ── Fin de séance ─────────────────────────────────────────────────────── */
  if (!card || !rendered) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: "60vh", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: FIELD_BG, display: "grid", placeItems: "center" }}>
          <Flame size={26} color={PALETTE.green} />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: T.text }}>Séance terminée</div>
          <div style={{ fontSize: 13, color: T.textSub, marginTop: 6 }}>
            {done > 0
              ? `${done} carte${done > 1 ? "s" : ""} revue${done > 1 ? "s" : ""}. Les prochaines reviendront d'elles-mêmes.`
              : "Rien à réviser pour le moment."}
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          style={{ padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: T.brand, color: T.onSolid, fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", transition: "var(--tr-ui)" }}
        >
          Retour
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760, margin: "0 auto" }}>
      {/* En-tête : les compteurs, la sortie, et rien qui appelle le regard. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Counter value={counts.new} color={PALETTE.blue} label="Nouvelles" dim={!counts.new} />
          <Counter value={counts.learning} color={PALETTE.red} label="En apprentissage" dim={!counts.learning} />
          <Counter value={counts.review} color={PALETTE.green} label="À réviser" dim={!counts.review} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {undoSnapshot && (
            <IconButton onClick={undo} title="Annuler la dernière réponse (Ctrl+Z)"><Undo2 size={16} /></IconButton>
          )}
          <IconButton onClick={() => onEditNote(note)} title="Modifier la note"><Pencil size={16} /></IconButton>
          <IconButton onClick={bury} title="Reporter à demain"><MoonStar size={16} /></IconButton>
          <IconButton onClick={suspend} title="Suspendre la carte"><EyeOff size={16} /></IconButton>
          <IconButton onClick={onExit} title="Quitter la séance (Échap)"><X size={16} /></IconButton>
        </div>
      </div>

      {/* Avancement : un trait, pas un pourcentage. On veut savoir qu'on avance,
          pas calculer de combien. */}
      <div style={{ height: 3, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, progress * 100)}%`, background: T.brand, borderRadius: 999, transition: "width var(--dur-base) var(--ease-out)" }} />
      </div>

      {/* La carte. Elle grandit avec son contenu et reste centrée : une question
          d'un mot ne doit pas flotter en haut d'un bloc vide. */}
      <div
        style={{
          background: T.white, borderRadius: 16, boxShadow: T.elevCard,
          padding: "40px 32px", minHeight: 260,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center", gap: 20,
        }}
      >
        {rendered.direction && (
          <div style={{ fontSize: 11, fontWeight: 500, color: T.textMut, letterSpacing: 0.2 }}>
            {rendered.direction}
          </div>
        )}

        <div style={{ fontSize: 24, lineHeight: 1.45, fontWeight: 500, color: T.text, whiteSpace: "pre-wrap" }}>
          {rendered.question}
        </div>

        {revealed && (
          <>
            <div style={{ width: 40, height: 1, background: HAIRLINE }} />
            {note.kind !== "cloze" && (
              <div className="anim-fade-in" style={{ fontSize: 20, lineHeight: 1.45, color: T.text, whiteSpace: "pre-wrap" }}>
                {rendered.answer}
              </div>
            )}
            {note.kind === "cloze" && (
              <div className="anim-fade-in" style={{ fontSize: 20, lineHeight: 1.45, color: PALETTE.green, fontWeight: 500, whiteSpace: "pre-wrap" }}>
                {rendered.answer}
              </div>
            )}
            {rendered.extra && (
              <div className="anim-fade-in" style={{ fontSize: 14, lineHeight: 1.55, color: T.textSub, whiteSpace: "pre-wrap", maxWidth: 520 }}>
                {rendered.extra}
              </div>
            )}
          </>
        )}
      </div>

      {/* Les commandes. Un seul bouton tant que la réponse est cachée : à ce
          moment-là il n'y a qu'une chose à faire, chercher puis révéler. */}
      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          style={{
            padding: "14px 20px", borderRadius: 14, border: "none",
            background: T.text, color: T.textInverted,
            fontSize:14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
            transition: "var(--tr-ui)",
          }}
        >
          Afficher la réponse
          <span style={{ opacity: 0.5, marginLeft: 8, fontWeight: 500 }}>Espace</span>
        </button>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {ANSWERS.map(a => (
            <button
              key={a.rating}
              type="button"
              onClick={() => answer(a.rating)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                padding: "12px 6px", borderRadius: 14, border: "none",
                background: FIELD_BG, color: T.text, cursor: "pointer",
                fontFamily: "inherit", transition: "var(--tr-ui)",
                boxShadow: `inset 0 -2px 0 0 ${a.color}`,
              }}
            >
              {/* Le délai AVANT le libellé : c'est l'information qu'on compare
                  d'un bouton à l'autre pour choisir, le mot ne fait que la nommer. */}
              <span style={{ fontSize: 14, fontWeight: 600, color: a.color, fontVariantNumeric: "tabular-nums" }}>
                {previews ? formatInterval(previews[a.rating].intervalMs) : "—"}
              </span>
              <span style={{ fontSize: 12, color: T.textSub }}>{a.label}</span>
              <span style={{ fontSize: 10, color: T.textMut }}>{a.key}</span>
            </button>
          ))}
        </div>
      )}

      {/* Retour discret sous les boutons : il confirme, il n'interrompt pas. */}
      <div style={{ minHeight: 20, textAlign: "center" }}>
        {toast && (
          <span
            className="anim-fade-in"
            style={{
              fontSize: 12,
              color: toast.tone === "warn" ? PALETTE.orange : T.textMut,
              fontWeight: toast.tone === "warn" ? 500 : 400,
            }}
          >
            {toast.text}
          </span>
        )}
      </div>
    </div>
  );
}
