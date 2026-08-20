"use client";

/**
 * Paquets et parcours des cartes.
 *
 * Deux écrans dans un seul composant : la liste des paquets, puis le contenu de
 * l'un d'eux. Le passage de l'un à l'autre est une simple sélection — il n'y a
 * pas de route dédiée, et le retour se fait par le fil d'Ariane.
 */

import React, { useMemo, useState } from "react";
import {
  Plus, Search, Pencil, Trash2, EyeOff, Eye, ChevronRight, Play, Layers,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { PALETTE, PALETTE_DARK } from "@/lib/ui/palette";
/* Les briques de formulaire sont importées de `components/ui/form` et les
   aplats de `lib/ui/tokens`, plutôt que de passer par `components/ui/da` qui
   les réexporte : ce chemin-là est valide dans tous les cas, alors que le bloc
   de réexport de `da.jsx` a déjà disparu une fois. Les briques de MISE EN PAGE
   (carte, titre de section, fil d'Ariane) viennent bien de `da`, elles y sont
   définies. */
import { CARD, SectionTitle, BackLink } from "@/components/ui/da";
import { Field, FieldGrid, Input, Modal, PillButton, Select } from "@/components/ui/form";
import { noteTitle, ordsForNote } from "@/lib/srs/model";
import { queueKindOf } from "@/lib/srs/queue";
import { formatInterval } from "@/lib/srs/fsrs";

const COLORS = ["blue", "green", "orange", "purple", "red", "yellow", "pink", "brown"];

const FILTERS = [
  { id: "all", label: "Toutes" },
  { id: "new", label: "Nouvelles" },
  { id: "learning", label: "Apprentissage" },
  { id: "review", label: "En révision" },
  { id: "due", label: "À réviser" },
  { id: "suspended", label: "Suspendues" },
];

const KIND_LABEL = { basic: "Recto/verso", reversed: "Inversée", cloze: "Trous" };

const DECK_LIMITS_HINT =
  "Les limites propres au paquet ne s'appliquent que lorsqu'on le révise seul. Sur une "
  + "séance qui en mélange plusieurs, ce sont les limites générales qui valent.";

const NO_DECK_HINT =
  "Un paquet regroupe les cartes d'un même sujet. Mieux vaut peu de paquets larges que "
  + "beaucoup d'étroits : les limites journalières se règlent par paquet, et douze paquets "
  + "de dix cartes rendent la charge impossible à piloter.";

const EMPTY_DECK_HINT =
  "Ce paquet est vide. Passez par l'atelier pour le remplir depuis un cours ou une note.";

/** Pastille de décompte d'un paquet : trois nombres colorés, sans libellé. Les
 *  couleurs sont les mêmes que dans la séance, on les lit sans légende. */
function DeckCounts({ counts }) {
  const items = [
    { value: counts.new, color: PALETTE.blue, title: "Nouvelles" },
    { value: counts.learning, color: PALETTE.red, title: "En apprentissage" },
    { value: counts.review, color: PALETTE.green, title: "À réviser" },
  ];
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {items.map(i => (
        <span
          key={i.title}
          title={i.title}
          style={{
            fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums",
            color: i.value ? i.color : T.textMut, opacity: i.value ? 1 : 0.45,
          }}
        >
          {i.value}
        </span>
      ))}
    </div>
  );
}

/** Fenêtre de création ou de modification d'un paquet. */
function DeckModal({ deck, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    name: deck?.name || "",
    color: deck?.color || "blue",
    newPerDay: deck?.newPerDay ?? "",
    reviewsPerDay: deck?.reviewsPerDay ?? "",
  });
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  return (
    <Modal
      open
      title={deck ? "Modifier le paquet" : "Nouveau paquet"}
      onClose={onClose}
      onDelete={deck ? onDelete : undefined}
      width={480}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
          <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
          <PillButton
            variant="primary"
            disabled={!form.name.trim()}
            onClick={() => onSave({
              name: form.name.trim(),
              color: form.color,
              newPerDay: form.newPerDay === "" ? null : Math.max(0, Number(form.newPerDay) || 0),
              reviewsPerDay: form.reviewsPerDay === "" ? null : Math.max(0, Number(form.reviewsPerDay) || 0),
            })}
          >
            {deck ? "Enregistrer" : "Créer"}
          </PillButton>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nom">
          <Input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Gestion du risque" autoFocus />
        </Field>
        <Field label="Couleur">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => set({ color: c })}
                aria-label={c}
                style={{
                  width: 34, height: 34, borderRadius: 999, cursor: "pointer",
                  background: PALETTE[c], border: "none", padding: 0,
                  boxShadow: form.color === c ? `0 0 0 2px ${T.white}, 0 0 0 4px ${PALETTE_DARK[c]}` : "none",
                  transition: "var(--tr-ui)",
                }}
              />
            ))}
          </div>
        </Field>
        <FieldGrid columns={2}>
          <Field label="Nouvelles / jour" hint="Vide : la limite générale.">
            <Input type="number" min={0} value={form.newPerDay} onChange={e => set({ newPerDay: e.target.value })} placeholder="—" />
          </Field>
          <Field label="Révisions / jour" hint="Vide : la limite générale.">
            <Input type="number" min={0} value={form.reviewsPerDay} onChange={e => set({ reviewsPerDay: e.target.value })} placeholder="—" />
          </Field>
        </FieldGrid>
        <div style={{ fontSize: 12, color: T.textMut, lineHeight: 1.55 }}>{DECK_LIMITS_HINT}</div>
      </div>
    </Modal>
  );
}

export default function DeckBrowser({
  decks, cards, notes, now,
  onCreateDeck, onUpdateDeck, onDeleteDeck,
  onEditNote, onDeleteNote, onToggleSuspend, onStudyDeck, onAddNote,
}) {
  const [openDeckId, setOpenDeckId] = useState(null);
  const [modal, setModal] = useState(null); // null | {deck?}
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [tag, setTag] = useState("");

  /* Décomptes par paquet. Calculés en une passe sur toutes les cartes plutôt
     qu'un filtre par paquet : avec quelques milliers de cartes, la seconde
     forme relit la liste autant de fois qu'il y a de paquets. */
  const byDeck = useMemo(() => {
    const noteDeck = new Map(notes.map(n => [n.id, n.deckId]));
    const acc = new Map(decks.map(d => [d.id, { new: 0, learning: 0, review: 0, total: 0, suspended: 0 }]));
    for (const c of cards) {
      const deckId = noteDeck.get(c.noteId);
      const entry = acc.get(deckId);
      if (!entry) continue;
      entry.total++;
      if (c.suspended) { entry.suspended++; continue; }
      if (c.buriedUntil && new Date(c.buriedUntil) > now) continue;
      const kind = queueKindOf(c);
      if (kind === "new") entry.new++;
      else if (kind === "learning") entry.learning++;
      else if (new Date(c.due) <= now) entry.review++;
    }
    return acc;
  }, [decks, cards, notes, now]);

  const openDeck = decks.find(d => d.id === openDeckId) || null;

  /* ── Liste des paquets ─────────────────────────────────────────────────── */
  if (!openDeck) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <SectionTitle>Paquets</SectionTitle>
            <PillButton compact onClick={() => setModal({})}><Plus size={13} /> Nouveau paquet</PillButton>
          </div>

          {decks.length === 0 ? (
            <div style={{ ...CARD, textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Aucun paquet</div>
              <div style={{ fontSize: 13, color: T.textSub, margin: "8px auto 16px", maxWidth: 420, lineHeight: 1.6 }}>
                {NO_DECK_HINT}
              </div>
              <PillButton variant="primary" onClick={() => setModal({})}>Créer un paquet</PillButton>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {decks.map(deck => {
                const c = byDeck.get(deck.id) || { new: 0, learning: 0, review: 0, total: 0 };
                const due = c.new + c.learning + c.review;
                return (
                  <div
                    key={deck.id}
                    style={{
                      ...CARD, padding: 14, display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer", transition: "var(--tr-ui)",
                    }}
                    onClick={() => setOpenDeckId(deck.id)}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[deck.color] || PALETTE.blue, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {deck.name}
                      </div>
                      <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>
                        {c.total} carte{c.total > 1 ? "s" : ""}
                        {c.suspended ? ` · ${c.suspended} suspendue${c.suspended > 1 ? "s" : ""}` : ""}
                      </div>
                    </div>
                    <DeckCounts counts={c} />
                    {/* Les actions sont espacées de la zone cliquable de la ligne :
                        un bouton posé DANS une carte cliquable doit arrêter la
                        propagation, sinon il ouvre le paquet en même temps. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }} onClick={e => e.stopPropagation()}>
                      {due > 0 && (
                        <button
                          type="button"
                          onClick={() => onStudyDeck(deck.id)}
                          title="Réviser ce paquet"
                          style={{ ...iconBtn, color: T.brand }}
                        >
                          <Play size={15} />
                        </button>
                      )}
                      <button type="button" onClick={() => setModal({ deck })} title="Modifier" style={iconBtn}>
                        <Pencil size={14} />
                      </button>
                    </div>
                    <ChevronRight size={16} color={T.textMut} style={{ flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {modal && (
          <DeckModal
            deck={modal.deck}
            onSave={(data) => {
              if (modal.deck) onUpdateDeck(modal.deck.id, data);
              else onCreateDeck(data);
              setModal(null);
            }}
            onDelete={modal.deck ? () => { onDeleteDeck(modal.deck.id); setModal(null); } : undefined}
            onClose={() => setModal(null)}
          />
        )}
      </>
    );
  }

  /* ── Contenu d'un paquet ───────────────────────────────────────────────── */

  const deckNotes = notes.filter(n => n.deckId === openDeck.id);
  const cardsByNote = new Map();
  for (const c of cards) {
    const arr = cardsByNote.get(c.noteId);
    if (arr) arr.push(c);
    else cardsByNote.set(c.noteId, [c]);
  }

  const tags = [...new Set(deckNotes.flatMap(n => n.tags))].sort((a, b) => a.localeCompare(b, "fr"));
  const needle = search.trim().toLowerCase();

  const rows = deckNotes.filter(note => {
    if (needle && ![note.front, note.back, note.extra].join(" ").toLowerCase().includes(needle)) return false;
    if (tag && !note.tags.includes(tag)) return false;
    if (filter === "all") return true;
    const mine = cardsByNote.get(note.id) || [];
    if (filter === "suspended") return mine.some(c => c.suspended);
    if (filter === "due") return mine.some(c => !c.suspended && new Date(c.due) <= now);
    return mine.some(c => !c.suspended && queueKindOf(c) === filter);
  });

  const deckCounts = byDeck.get(openDeck.id) || { new: 0, learning: 0, review: 0, total: 0 };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Pas de prop `icon` : elle attend un ÉLÉMENT à poser en plus (un logo,
            une pastille), et `BackLink` dessine déjà sa propre flèche. */}
        <BackLink label="Paquets" onClick={() => setOpenDeckId(null)} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[openDeck.color] || PALETTE.blue }} />
            <SectionTitle>{openDeck.name}</SectionTitle>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DeckCounts counts={deckCounts} />
            <PillButton compact onClick={() => onAddNote(openDeck.id)}><Plus size={13} /> Note</PillButton>
            {(deckCounts.new + deckCounts.learning + deckCounts.review) > 0 && (
              <PillButton compact variant="primary" onClick={() => onStudyDeck(openDeck.id)}>
                <Play size={13} /> Réviser
              </PillButton>
            )}
          </div>
        </div>

        {/* Filtres. Recherche, état, étiquette — dans cet ordre : on cherche
            d'abord par ce qu'on se rappelle, ensuite on tamise. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
            <Search size={14} color={T.textMut} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              style={{ paddingLeft: 34 }}
            />
          </div>
          <Select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: "auto", minWidth: 150 }}>
            {FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>
          {tags.length > 0 && (
            <Select value={tag} onChange={e => setTag(e.target.value)} style={{ width: "auto", minWidth: 140 }}>
              <option value="">Toutes les étiquettes</option>
              {tags.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
        </div>

        {rows.length === 0 ? (
          <div style={{ ...CARD, textAlign: "center", padding: 28, fontSize: 13, color: T.textSub }}>
            {deckNotes.length === 0 ? EMPTY_DECK_HINT : "Aucune carte ne correspond à ces filtres."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map(note => {
              const mine = cardsByNote.get(note.id) || [];
              const suspended = mine.length > 0 && mine.every(c => c.suspended);
              const soonest = mine
                .filter(c => !c.suspended)
                .sort((a, b) => a.due.localeCompare(b.due))[0];
              const dueIn = soonest ? new Date(soonest.due).getTime() - now.getTime() : null;

              return (
                <div
                  key={note.id}
                  style={{
                    ...CARD, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                    opacity: suspended ? 0.5 : 1, transition: "var(--tr-ui)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {noteTitle(note)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontSize: 11, color: T.textMut, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Layers size={10} /> {ordsForNote(note).length} · {KIND_LABEL[note.kind]}
                      </span>
                      {soonest && (
                        <span>
                          {dueIn <= 0 ? "à réviser" : `dans ${formatInterval(dueIn)}`}
                        </span>
                      )}
                      {note.tags.map(t => <span key={t}>#{t}</span>)}
                      {note.source?.label && <span style={{ opacity: 0.7 }}>← {note.source.label}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => onToggleSuspend(note.id, !suspended)}
                      title={suspended ? "Réactiver" : "Suspendre"}
                      style={iconBtn}
                    >
                      {suspended ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button type="button" onClick={() => onEditNote(note)} title="Modifier" style={iconBtn}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => onDeleteNote(note.id)} title="Supprimer" style={iconBtn}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <DeckModal
          deck={modal.deck}
          onSave={(data) => {
            if (modal.deck) onUpdateDeck(modal.deck.id, data);
            else onCreateDeck(data);
            setModal(null);
          }}
          onDelete={modal.deck ? () => { onDeleteDeck(modal.deck.id); setOpenDeckId(null); setModal(null); } : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent",
  color: T.textMut, display: "grid", placeItems: "center", cursor: "pointer",
  transition: "var(--tr-ui)", padding: 0, flexShrink: 0,
};
