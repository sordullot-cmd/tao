"use client";

/**
 * Page « Révisions » — répétition espacée, moteur FSRS-6.
 *
 * Le principe : on ne révise pas ce qu'on veut quand on veut, on révise ce qui
 * est sur le point d'être oublié. L'algorithme estime pour chaque carte la date
 * où la probabilité de rappel tombera sur la cible, et ne la présente qu'à ce
 * moment-là. C'est ce qui fait tenir des milliers de cartes en vingt minutes par
 * jour, là où la relecture classique s'évapore en une semaine.
 *
 * Découpage :
 *   lib/srs/fsrs.ts       le moteur, portage fidèle de l'implémentation officielle
 *   lib/srs/model.ts      paquets, notes, cartes
 *   lib/srs/queue.ts      la file du jour, les limites, les sangsues
 *   lib/srs/stats.ts      tout ce qui se recalcule depuis le journal
 *   lib/srs/optimizer.ts  l'ajustement des poids sur l'historique réel
 *
 * Le magasin entier tient dans une clé de `useCloudState` : il part dans la
 * table générique `user_productivity`, sans migration SQL.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Play, Sparkles, Plus, Brain } from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useUndo } from "@/lib/contexts/UndoContext";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, PeriodPills, SectionTitle } from "@/components/ui/da";
import { PillButton } from "@/components/ui/form";
import { emptyStore, createNote, newId, normalizeStore, syncNoteCards } from "@/lib/srs/model";
import { buildQueue, dayCounters } from "@/lib/srs/queue";
import { streak } from "@/lib/srs/stats";
import ReviewSession from "@/components/revisions/ReviewSession";
import NoteEditor from "@/components/revisions/NoteEditor";
import Workshop from "@/components/revisions/Workshop";
import DeckBrowser from "@/components/revisions/DeckBrowser";

const STORAGE_KEY = "tr4de_srs";

/** Couleurs attribuées aux paquets créés automatiquement à l'import, dans
 *  l'ordre : deux paquets voisins ne se retrouvent pas de la même teinte. */
const DECK_COLORS = ["blue", "green", "orange", "purple", "red", "yellow", "pink", "brown"];

/* `PeriodPills` n'affiche que le libellé : pas d'icône ici, elle rétrécirait
   le texte sans rien ajouter.

   Trois onglets, et non cinq : « Statistiques » et « Réglages » ont été
   retirés. La page ne garde que ce qu'on vient y FAIRE — réviser, tenir ses
   paquets, fabriquer des cartes. */
const TABS = [
  { id: "today", label: "Aujourd'hui" },
  { id: "decks", label: "Paquets" },
  { id: "workshop", label: "Atelier" },
];

/* La prose d'accueil vit ici, hors de l'arbre de rendu : c'est le texte qui
   explique la MÉTHODE, et c'est lui qui décide si la page servira. Le sortir du
   JSX le rend relisable et modifiable sans toucher à la mise en page. */
const INTRO_METHOD =
  "Ce qu'on apprend aujourd'hui, on en a oublié l'essentiel dans deux jours si on n'y "
  + "retouche pas. Chaque rappel réussi aplatit cette courbe : l'information tient de plus "
  + "en plus longtemps. L'algorithme estime pour chaque carte le moment où vous alliez "
  + "l'oublier, et vous la représente juste avant — ni trop tôt, ce qui serait du temps "
  + "perdu, ni trop tard, ce qui serait tout à réapprendre.";
const INTRO_RULE_BEFORE = "La seule règle qui compte à la saisie : ";
const INTRO_RULE_STRONG = "une carte, une information";
const INTRO_RULE_AFTER = ". Le reste, l'atelier s'en charge.";

/** Grand nombre d'un compteur de séance, avec son libellé sous lui. */
function DueCounter({ value, label, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1, color: value ? color : T.textMut, opacity: value ? 1 : 0.4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: T.textSub, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function RevisionsPage() {
  const [raw, setRaw, srsReady] = useCloudState(STORAGE_KEY, "srs", emptyStore());
  const [notes] = useCloudState("tr4de_notes", "notes", []);
  const [books] = useCloudState("tr4de_books", "reading_list", []);
  const { pushUndo } = useUndo();

  const [tab, setTab] = useState("today");
  const [session, setSession] = useState(null); // { queue, deckIds }
  const [editing, setEditing] = useState(null); // { note?, deckId? }

  /* Le magasin lu du stockage peut venir d'une version antérieure : on le
     complète à la lecture plutôt qu'en écrivant une migration, ce qui évite un
     aller-retour de synchronisation au premier chargement. */
  const store = useMemo(() => normalizeStore(raw), [raw]);
  const setStore = useCallback((updater) => {
    setRaw(prev => {
      const base = normalizeStore(prev);
      return typeof updater === "function" ? updater(base) : updater;
    });
  }, [setRaw]);

  /* L'instant de référence de tout l'écran. Fixé une fois par rendu : si chaque
     calcul appelait `new Date()`, les décomptes et la file pourraient se
     contredire sur le passage d'une seconde. */
  const now = useMemo(() => new Date(), [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  const queue = useMemo(() => buildQueue(store, now), [store, now]);
  const counters = useMemo(() => dayCounters(store, now), [store, now]);
  const sk = useMemo(() => streak(store, now), [store, now]);

  const totalDue = queue.counts.new + queue.counts.learning + queue.counts.review;

  /* ── Actions sur les paquets ───────────────────────────────────────────── */

  const createDeck = (data) => {
    const deck = { id: newId("p"), createdAt: new Date().toISOString(), ...data };
    setStore(prev => ({ ...prev, decks: [...prev.decks, deck] }));
    return deck.id;
  };

  const updateDeck = (id, data) => {
    setStore(prev => ({ ...prev, decks: prev.decks.map(d => (d.id === id ? { ...d, ...data } : d)) }));
  };

  const deleteDeck = (id) => {
    const snapshot = store;
    const doomed = new Set(store.notes.filter(n => n.deckId === id).map(n => n.id));
    setStore(prev => ({
      ...prev,
      decks: prev.decks.filter(d => d.id !== id),
      notes: prev.notes.filter(n => n.deckId !== id),
      cards: prev.cards.filter(c => !doomed.has(c.noteId)),
    }));
    // Supprimer un paquet emporte tout son historique de planification : sans
    // retour arrière, une erreur de clic coûterait des mois de travail.
    pushUndo({
      label: `Suppression du paquet « ${store.decks.find(d => d.id === id)?.name || "" } »`,
      undo: () => setRaw(snapshot),
    });
  };

  /* ── Actions sur les notes ─────────────────────────────────────────────── */

  const saveNote = (data) => {
    const at = new Date();
    if (editing?.note) {
      const updated = { ...editing.note, ...data, updatedAt: at.toISOString() };
      setStore(prev => ({
        ...prev,
        notes: prev.notes.map(n => (n.id === updated.id ? updated : n)),
        cards: syncNoteCards(updated, prev.cards, at).cards,
      }));
    } else {
      const { note, cards } = createNote({ ...data, source: { type: "manual" } }, at);
      setStore(prev => ({ ...prev, notes: [...prev.notes, note], cards: [...prev.cards, ...cards] }));
    }
    setEditing(null);
  };

  const deleteNote = (id) => {
    const snapshot = store;
    setStore(prev => ({
      ...prev,
      notes: prev.notes.filter(n => n.id !== id),
      cards: prev.cards.filter(c => c.noteId !== id),
    }));
    setEditing(null);
    pushUndo({ label: "Suppression de la note", undo: () => setRaw(snapshot) });
  };

  const toggleSuspend = (noteId, suspended) => {
    setStore(prev => ({
      ...prev,
      cards: prev.cards.map(c => (c.noteId === noteId ? { ...c, suspended } : c)),
    }));
  };

  /**
   * Versement d'un lot venu de l'atelier.
   *
   * Une seule écriture pour tout le lot : quarante `setStore` enchaînés se
   * marcheraient dessus. Les paquets nommés dans un fichier importé sont
   * retrouvés par leur nom, ou créés à la volée — un export Anki en porte
   * plusieurs, et les fondre en un seul détruirait l'organisation importée.
   */
  const commitDrafts = (fallbackDeckId, drafts) => {
    const at = new Date();
    const newDecks = [];
    const newNotes = [];
    const newCards = [];
    // Index par nom normalisé : « Trading » et « trading » sont le même paquet.
    const byName = new Map(store.decks.map(d => [d.name.trim().toLowerCase(), d.id]));

    const resolveDeck = (name) => {
      const key = (name || "").trim().toLowerCase();
      if (!key) return fallbackDeckId;
      const found = byName.get(key);
      if (found) return found;
      const deck = {
        id: newId("p"),
        name: name.trim(),
        color: DECK_COLORS[newDecks.length % DECK_COLORS.length],
        createdAt: at.toISOString(),
      };
      newDecks.push(deck);
      byName.set(key, deck.id);
      return deck.id;
    };

    for (const { deckName, ...rest } of drafts) {
      const { note, cards } = createNote({ deckId: resolveDeck(deckName), ...rest }, at);
      newNotes.push(note);
      newCards.push(...cards);
    }
    setStore(prev => ({
      ...prev,
      decks: [...prev.decks, ...newDecks],
      notes: [...prev.notes, ...newNotes],
      cards: [...prev.cards, ...newCards],
    }));
    setTab("decks");
  };

  /* L'instant d'ouverture accompagne la file : la séance s'en sert pour choisir
     sa PREMIÈRE carte sans avoir à lire l'horloge pendant son rendu. */
  const startSession = (deckIds) => {
    const at = new Date();
    const q = buildQueue(store, at, deckIds ? { deckIds } : {});
    if (!q.cardIds.length) return;
    setSession({ queue: q, at });
  };

  /* Appelé AVANT le retour anticipé de la séance : un hook placé après lui ne
     serait pas exécuté sur tous les rendus, et React perdrait son ordre. */
  const booting = useFirstLoad(srsReady, STORAGE_KEY);

  /* ── Séance ────────────────────────────────────────────────────────────── */

  if (session) {
    return (
      <div>
        <ReviewSession
          store={store}
          setStore={setStore}
          queue={session.queue}
          openedAt={session.at}
          onExit={() => setSession(null)}
          onEditNote={(note) => setEditing({ note })}
        />
        {editing && (
          <NoteEditor
            key={editing.note?.id || "new"}
            open
            note={editing.note}
            decks={store.decks}
            defaultDeckId={editing.deckId}
            onSave={saveNote}
            onDelete={editing.note ? () => deleteNote(editing.note.id) : undefined}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    );
  }

  if (booting) return <PageSkeleton variant="list" gap={18} toolbarLeft={[74, 82, 96]} toolbarRight={[140]} />;

  /* ── Page ──────────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <PeriodPills value={tab} onChange={setTab} options={TABS} track size={13} />
        {/* À l'encre : c'est l'action de la page, comme « Nouvelle séance » sur
            Sport ou « Nouvelle habitude » sur Habitudes. L'aplat gris du variant
            par défaut la faisait passer pour une commande secondaire à côté des
            onglets. */}
        {store.decks.length > 0 && (
          <PillButton variant="primary" compact onClick={() => setEditing({ deckId: store.decks[0].id })}>
            <Plus size={13} /> Nouvelle note
          </PillButton>
        )}
      </div>

      {tab === "today" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {store.cards.length === 0 ? (
            /* Premier passage. On explique la méthode, pas l'interface : c'est
               elle qui décide si la page servira à quelque chose. */
            <div style={{ ...CARD, padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: 999, background: FIELD_BG, display: "grid", placeItems: "center" }}>
                <Brain size={24} color={T.brand} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>Réviser au bon moment</div>
              <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.65, maxWidth: 520 }}>
                {INTRO_METHOD}
              </div>
              <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.65, maxWidth: 520 }}>
                {INTRO_RULE_BEFORE}
                <strong style={{ color: T.text }}>{INTRO_RULE_STRONG}</strong>
                {INTRO_RULE_AFTER}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <PillButton variant="primary" onClick={() => setTab("workshop")}>
                  <Sparkles size={14} /> Créer des cartes depuis un texte
                </PillButton>
                <PillButton onClick={() => setTab("decks")}>Commencer par un paquet</PillButton>
              </div>
            </div>
          ) : (
            <div style={{ ...CARD, padding: 26, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <div style={{ display: "flex", gap: 36 }}>
                <DueCounter value={queue.counts.new} label="Nouvelles" color={PALETTE.blue} />
                <DueCounter value={queue.counts.learning} label="Apprentissage" color={PALETTE.red} />
                <DueCounter value={queue.counts.review} label="À réviser" color={PALETTE.green} />
              </div>

              {totalDue > 0 ? (
                <button
                  type="button"
                  onClick={() => startSession(null)}
                  style={{
                    padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none",
                    /* À l'encre, comme l'action principale des autres pages :
                       l'accent vert servait ici à une action ordinaire, alors
                       qu'ailleurs il est réservé aux repères de progression. */
                    background: T.text, color: T.textInverted,
                    fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 8,
                    transition: "var(--tr-ui)",
                  }}
                >
                  <Play size={16} /> Réviser
                </button>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Rien à réviser</div>
                  <div style={{ fontSize: 13, color: T.textSub, marginTop: 6, lineHeight: 1.6, maxWidth: 400 }}>
                    {counters.answered > 0
                      ? `${counters.answered} réponse${counters.answered > 1 ? "s" : ""} aujourd'hui. La suite reviendra d'elle-même.`
                      : "Vos cartes ne sont pas encore dues. Revenez demain, ou ajoutez-en."}
                  </div>
                </div>
              )}

              {/* Ce que les limites retiennent. Sans cette ligne, « rien à
                  réviser » se lirait comme « tout est à jour », ce qui serait faux. */}
              {(queue.heldBack.new > 0 || queue.heldBack.review > 0) && (
                <div style={{ fontSize: 12, color: T.textMut, textAlign: "center", lineHeight: 1.6, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 14, width: "100%" }}>
                  {queue.heldBack.new > 0 && `${queue.heldBack.new} nouvelle${queue.heldBack.new > 1 ? "s" : ""} `}
                  {queue.heldBack.new > 0 && queue.heldBack.review > 0 && "et "}
                  {queue.heldBack.review > 0 && `${queue.heldBack.review} révision${queue.heldBack.review > 1 ? "s" : ""} `}
                  au-delà des limites du jour.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      const at = new Date();
                      const q = buildQueue(store, at, { ignoreLimits: true });
                      if (q.cardIds.length) setSession({ queue: q, at });
                    }}
                    style={{ background: "none", border: "none", padding: 0, color: T.text, fontSize: 12, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Tout réviser quand même
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Série et travail du jour : trois repères, pas un tableau de bord.
              C'est tout ce que la page chiffre depuis que l'onglet
              « Statistiques » a été retiré. */}
          {store.cards.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              {[
                { label: "Série en cours", value: `${sk.current} j`, hint: `record ${sk.best} j` },
                { label: "Aujourd'hui", value: counters.answered, hint: "réponses données" },
                { label: "Cartes au total", value: store.cards.length, hint: `${store.notes.length} note${store.notes.length > 1 ? "s" : ""}` },
              ].map(item => (
                <div key={item.label} style={{ ...CARD, padding: 14 }}>
                  <div style={{ fontSize: 11, color: T.textSub }}>{item.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: T.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>{item.hint}</div>
                </div>
              ))}
            </div>
          )}

          {/* Raccourci vers chaque paquet qui a du travail. */}
          {store.decks.length > 1 && totalDue > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SectionTitle size="sm">Par paquet</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {store.decks.map(deck => {
                  const q = buildQueue(store, now, { deckIds: [deck.id] });
                  const due = q.counts.new + q.counts.learning + q.counts.review;
                  if (!due) return null;
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => startSession([deck.id])}
                      style={{
                        ...CARD, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                        border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                        transition: "var(--tr-ui)",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[deck.color] || PALETTE.blue }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.text }}>{deck.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>{due}</span>
                      <Play size={14} color={T.brand} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "decks" && (
        <DeckBrowser
          decks={store.decks}
          cards={store.cards}
          notes={store.notes}
          now={now}
          onCreateDeck={createDeck}
          onUpdateDeck={updateDeck}
          onDeleteDeck={deleteDeck}
          onEditNote={(note) => setEditing({ note })}
          onDeleteNote={deleteNote}
          onToggleSuspend={toggleSuspend}
          onStudyDeck={(deckId) => startSession([deckId])}
          onAddNote={(deckId) => setEditing({ deckId })}
        />
      )}

      {tab === "workshop" && (
        <Workshop
          decks={store.decks}
          notes={notes}
          books={books}
          onCommit={commitDrafts}
          onCreateDeck={() => setTab("decks")}
        />
      )}

      {editing && (
        <NoteEditor
          key={editing.note?.id || "new"}
          open
          note={editing.note}
          decks={store.decks}
          defaultDeckId={editing.deckId}
          onSave={saveNote}
          onDelete={editing.note ? () => deleteNote(editing.note.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
