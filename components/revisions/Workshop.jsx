"use client";

/**
 * L'atelier : d'un texte à des cartes.
 *
 * C'est la partie qui décide si la page sert vraiment. Saisir des cartes une à
 * une est un travail ingrat qu'on abandonne au bout de trois jours ; partir d'un
 * cours, d'une note ou d'un livre déjà écrit supprime cette friction.
 *
 * Le principe qui gouverne l'écran : rien n'entre dans un paquet sans être
 * RELU. Les propositions arrivent en brouillon, se modifient sur place et se
 * décochent une à une. Une carte qu'on n'a pas formulée soi-même se retient
 * moins bien — la relire est le minimum qui rattrape cette perte.
 */

import React, { useMemo, useState } from "react";
import {
  Sparkles, Check, Trash2, Pencil, FileText, BookOpen, ClipboardPaste,
  AlertTriangle, Loader2, ChevronDown,
} from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
/* Les briques de formulaire sont importées de `components/ui/form` et les
   aplats de `lib/ui/tokens`, plutôt que de passer par `components/ui/da` qui
   les réexporte : ce chemin-là est valide dans tous les cas, alors que le bloc
   de réexport de `da.jsx` a déjà disparu une fois. Les briques de MISE EN PAGE
   (carte, titre de section, fil d'Ariane) viennent bien de `da`, elles y sont
   définies. */
import { CARD, SectionTitle } from "@/components/ui/da";
import { Field, FieldGrid, Input, PillButton, Select, Textarea } from "@/components/ui/form";
import { stripCloze } from "@/lib/srs/cloze";
import { fromAnkiText } from "@/lib/srs/ankiText";

const SOURCES = [
  { id: "paste", label: "Coller un texte", icon: ClipboardPaste },
  { id: "note", label: "Depuis une note", icon: FileText },
  { id: "book", label: "Depuis un livre", icon: BookOpen },
  { id: "import", label: "Importer un fichier", icon: ChevronDown },
];

const KIND_LABEL = { basic: "Recto/verso", reversed: "Inversée", cloze: "Texte à trous" };

const IMPORT_HINT_TAIL =
  ". Les paquets d'origine et les étiquettes sont conservés quand le fichier les porte.";

const TRUNCATED_HINT =
  "Texte tronqué : seules les 24 000 premières lettres ont été traitées. Collez la suite en "
  + "deux fois.";

const NO_DECK_HINT =
  "Un paquet regroupe les cartes d'un même sujet et porte ses propres limites journalières.";

/** Une proposition en attente de validation. Modifiable sur place : corriger
 *  vaut mieux que jeter, et c'est plus rapide que de repartir de zéro. */
function DraftCard({ draft, onToggle, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);
  const dim = !draft.keep;

  return (
    <div
      style={{
        background: T.white, borderRadius: 12, padding: 12,
        boxShadow: T.elevCard, opacity: dim ? 0.45 : 1,
        transition: "var(--tr-ui)",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* La case à cocher tient toute la hauteur de la ligne de titre : on
            décoche une proposition sans viser un carré de 14 px. */}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={draft.keep}
          title={draft.keep ? "Écarter cette carte" : "Reprendre cette carte"}
          style={{
            width: 18, height: 18, flexShrink: 0, marginTop: 2,
            borderRadius: 6, border: draft.keep ? "none" : `1px solid ${HAIRLINE}`,
            background: draft.keep ? T.brand : "transparent",
            display: "grid", placeItems: "center", cursor: "pointer",
            transition: "var(--tr-ui)", padding: 0,
          }}
        >
          {draft.keep && <Check size={12} color={T.onSolid} strokeWidth={3} />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Textarea
                rows={2}
                value={draft.front}
                onChange={e => onChange({ front: e.target.value })}
                placeholder="Recto"
              />
              {draft.kind !== "cloze" && (
                <Textarea
                  rows={2}
                  value={draft.back}
                  onChange={e => onChange({ back: e.target.value })}
                  placeholder="Verso"
                />
              )}
              <Textarea
                rows={1}
                value={draft.extra}
                onChange={e => onChange({ extra: e.target.value })}
                placeholder="Complément (facultatif)"
              />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.text, lineHeight: 1.45 }}>
                {draft.kind === "cloze" ? stripCloze(draft.front) : draft.front}
              </div>
              {draft.kind !== "cloze" && draft.back && (
                <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.45, marginTop: 3 }}>
                  {draft.back}
                </div>
              )}
              {draft.extra && (
                <div style={{ fontSize: 12, color: T.textMut, lineHeight: 1.45, marginTop: 4 }}>
                  {draft.extra}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setEditing(v => !v)}
            title={editing ? "Terminer" : "Modifier"}
            style={iconBtn}
          >
            {editing ? <Check size={14} /> : <Pencil size={14} />}
          </button>
          <button type="button" onClick={onRemove} title="Retirer" style={iconBtn}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: T.textMut, background: FIELD_BG, borderRadius: 999, padding: "2px 8px" }}>
          {KIND_LABEL[draft.kind]}
        </span>
        {draft.deck && (
          <span style={{ fontSize: 11, color: T.textMut, background: FIELD_BG, borderRadius: 999, padding: "2px 8px" }}>
            {draft.deck}
          </span>
        )}
        {draft.tags.map(tag => (
          <span key={tag} style={{ fontSize: 11, color: T.textMut }}>#{tag}</span>
        ))}
      </div>
    </div>
  );
}

const iconBtn = {
  width: 26, height: 26, borderRadius: 8, border: "none", background: "transparent",
  color: T.textMut, display: "grid", placeItems: "center", cursor: "pointer",
  transition: "var(--tr-ui)", padding: 0,
};

export default function Workshop({ decks, notes, books, onCommit, onCreateDeck }) {
  const [source, setSource] = useState("paste");
  const [text, setText] = useState("");
  const [deckId, setDeckId] = useState(decks[0]?.id || "");
  const [prefer, setPrefer] = useState("auto");
  const [maxCards, setMaxCards] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { drafts, summary, skipped, truncated }
  const [pickedNoteId, setPickedNoteId] = useState("");
  const [pickedBookId, setPickedBookId] = useState("");

  /* Le paquet retenu, recalculé à chaque rendu : `decks` arrive vide au premier
     rendu puis se remplit à l'hydratation cloud, et un identifiant figé dans
     l'état resterait vide pour toujours. */
  const activeDeckId = decks.some(d => d.id === deckId) ? deckId : (decks[0]?.id || "");
  const deckName = decks.find(d => d.id === activeDeckId)?.name || "";

  /* Les notes proposées sont celles qui ont de la matière : une note de deux
     lignes ne donnera rien, et l'afficher dans la liste ne fait que la rallonger. */
  const usableNotes = useMemo(
    () => (notes || []).filter(n => (n.content || "").trim().length > 120).slice(0, 60),
    [notes],
  );
  const usableBooks = useMemo(
    () => (books || []).filter(b => (b.notes || "").trim().length > 80),
    [books],
  );

  const pickNote = (id) => {
    setPickedNoteId(id);
    const note = (notes || []).find(n => String(n.id) === String(id));
    if (note) { setText(note.content || ""); setError(null); }
  };
  const pickBook = (id) => {
    setPickedBookId(id);
    const book = (books || []).find(b => String(b.id) === String(id));
    if (book) {
      setText(`${book.title}${book.author ? ` — ${book.author}` : ""}\n\n${book.notes || ""}`);
      setError(null);
    }
  };

  /** Découpage par l'IA. */
  const generate = async () => {
    if (!activeDeckId) { setError("Choisissez d'abord un paquet."); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, maxCards: Number(maxCards) || 20, prefer, topic: deckName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "La génération a échoué."); return; }
      setResult({
        drafts: data.cards.map((c, i) => ({ ...c, id: `d${i}`, keep: true, tags: c.tags || [] })),
        summary: data.summary,
        skipped: data.skipped || [],
        truncated: !!data.truncated,
      });
    } catch {
      setError("Impossible de joindre le service. Vérifiez votre connexion.");
    } finally {
      setBusy(false);
    }
  };

  /** Lecture d'un fichier tabulé : aucun appel réseau, tout se fait sur place. */
  const parseFile = (raw) => {
    const parsed = fromAnkiText(raw, deckName || "Import");
    if (!parsed.rows.length) {
      setError("Aucune carte reconnue dans ce fichier.");
      return;
    }
    setError(null);
    setResult({
      drafts: parsed.rows.map((r, i) => ({ ...r, id: `f${i}`, keep: true })),
      summary: `${parsed.rows.length} carte${parsed.rows.length > 1 ? "s" : ""} lue${parsed.rows.length > 1 ? "s" : ""} (format ${parsed.format === "anki" ? "Anki" : "texte simple"}).`,
      skipped: parsed.skipped.map(s => `Ligne ${s.line} : ${s.reason}`),
      truncated: false,
    });
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parseFile(String(reader.result || ""));
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const kept = result?.drafts.filter(d => d.keep) || [];

  const commit = () => {
    if (!kept.length || !activeDeckId) return;
    onCommit(activeDeckId, kept.map(d => ({
      kind: d.kind,
      front: d.front.trim(),
      back: d.kind === "cloze" ? "" : (d.back || "").trim(),
      extra: (d.extra || "").trim(),
      tags: d.tags || [],
      /* Le paquet nommé dans le fichier prime sur celui choisi à l'écran : un
         export Anki en porte plusieurs, et tout verser dans un seul détruirait
         l'organisation qu'on vient d'importer. Le sélecteur ne sert alors que
         de destination par défaut, pour les lignes sans colonne de paquet. */
      deckName: d.deck || null,
      source: {
        type: source === "paste" ? "workshop" : source === "import" ? "manual" : source,
        label: sourceLabel(source, notes, books, pickedNoteId, pickedBookId),
      },
    })));
    setResult(null);
    setText("");
  };

  const updateDraft = (id, patch) => {
    setResult(r => ({ ...r, drafts: r.drafts.map(d => (d.id === id ? { ...d, ...patch } : d)) }));
  };

  if (!decks.length) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Aucun paquet</div>
        <div style={{ fontSize: 13, color: T.textSub, margin: "8px 0 16px" }}>
          {NO_DECK_HINT}
        </div>
        <PillButton variant="primary" onClick={onCreateDeck}>Créer un paquet</PillButton>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
        <SectionTitle>Atelier</SectionTitle>

        {/* Choix de la source. Quatre entrées, une seule zone de texte en
            dessous : la source ne change que la façon dont on la remplit. */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SOURCES.map(s => {
            const Icon = s.icon;
            const active = source === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => { setSource(s.id); setError(null); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none",
                  background: active ? T.text : FIELD_BG,
                  color: active ? T.textInverted : T.textSub,
                  fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                  cursor: "pointer", transition: "var(--tr-ui)",
                }}
              >
                <Icon size={13} /> {s.label}
              </button>
            );
          })}
        </div>

        {source === "note" && (
          <Field label="Note" hint={usableNotes.length ? "Seules les notes assez fournies pour donner des cartes sont proposées." : "Aucune note assez fournie pour l'instant."}>
            <Select value={pickedNoteId} onChange={e => pickNote(e.target.value)}>
              <option value="">Choisir…</option>
              {usableNotes.map(n => (
                <option key={n.id} value={n.id}>
                  {(n.content || "").split("\n").find(l => l.trim())?.replace(/^#+\s*/, "").slice(0, 70) || "Note sans titre"}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {source === "book" && (
          <Field label="Livre" hint={usableBooks.length ? "Ce sont vos notes de lecture qui deviennent des cartes." : "Aucun livre ne porte encore de notes."}>
            <Select value={pickedBookId} onChange={e => pickBook(e.target.value)}>
              <option value="">Choisir…</option>
              {usableBooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </Select>
          </Field>
        )}

        {source === "import" ? (
          <div
            style={{
              border: `1px dashed ${HAIRLINE}`, borderRadius: 12, padding: 24,
              textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            }}
          >
            <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.55, maxWidth: 460 }}>
              {"Fichier texte exporté depuis Anki, ou simple tableau "}
              <code>recto ⇥ verso</code>
              {IMPORT_HINT_TAIL}
            </div>
            <label style={{ display: "inline-block" }}>
              <input type="file" accept=".txt,.tsv,.csv,text/plain" onChange={onFile} style={{ display: "none" }} />
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "8px 16px",
                  borderRadius: 999, background: FIELD_BG, color: T.text,
                  fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "var(--tr-ui)",
                }}
              >
                Choisir un fichier
              </span>
            </label>
          </div>
        ) : (
          <Field
            label="Texte"
            hint="Un cours, un chapitre, des notes. Plus il est structuré, meilleures sont les cartes."
          >
            <Textarea
              rows={10}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"Collez ici votre cours.\n\nL'IA le découpe en cartes atomiques : une information par carte, jamais de liste à restituer, et un texte à trous quand le fait a besoin de sa phrase pour se comprendre."}
            />
          </Field>
        )}

        {source !== "import" && (
          <>
            <FieldGrid columns={3}>
              <Field label="Paquet">
                <Select value={activeDeckId} onChange={e => setDeckId(e.target.value)}>
                  {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Type privilégié">
                <Select value={prefer} onChange={e => setPrefer(e.target.value)}>
                  <option value="auto">Au cas par cas</option>
                  <option value="basic">Recto / verso</option>
                  <option value="cloze">Textes à trous</option>
                </Select>
              </Field>
              <Field label="Cartes visées" hint="Un plafond, pas un objectif.">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={maxCards}
                  onChange={e => setMaxCards(e.target.value)}
                />
              </Field>
            </FieldGrid>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <PillButton variant="primary" disabled={busy || text.trim().length < 40} onClick={generate}>
                {busy ? <Loader2 size={14} className="anim-spin" /> : <Sparkles size={14} />}
                {busy ? "Découpage en cours…" : "Découper en cartes"}
              </PillButton>
              {text.trim().length > 0 && text.trim().length < 40 && (
                <span style={{ fontSize: 12, color: T.textMut }}>Encore un peu de texte…</span>
              )}
            </div>
          </>
        )}

        {source === "import" && (
          <Field label="Paquet de destination">
            <Select value={activeDeckId} onChange={e => setDeckId(e.target.value)}>
              {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        )}

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: PALETTE.red }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}
      </div>

      {/* Les propositions. Elles ne partent dans le paquet qu'après relecture. */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.55 }}>{result.summary}</div>
            {result.truncated && (
              <div style={{ fontSize: 12, color: PALETTE.orange }}>{TRUNCATED_HINT}</div>
            )}
            {result.skipped.length > 0 && (
              <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: T.textMut, marginBottom: 5 }}>
                  Écarté volontairement
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
                  {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: T.textSub }}>
              {kept.length} carte{kept.length > 1 ? "s" : ""} retenue{kept.length > 1 ? "s" : ""} sur {result.drafts.length}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <PillButton
                compact
                onClick={() => setResult(r => ({ ...r, drafts: r.drafts.map(d => ({ ...d, keep: kept.length !== r.drafts.length })) }))}
              >
                {kept.length === result.drafts.length ? "Tout décocher" : "Tout cocher"}
              </PillButton>
              <PillButton variant="primary" compact disabled={!kept.length} onClick={commit}>
                Ajouter au paquet {deckName}
              </PillButton>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.drafts.map(d => (
              <DraftCard
                key={d.id}
                draft={d}
                onToggle={() => updateDraft(d.id, { keep: !d.keep })}
                onChange={patch => updateDraft(d.id, patch)}
                onRemove={() => setResult(r => ({ ...r, drafts: r.drafts.filter(x => x.id !== d.id) }))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Étiquette de provenance conservée sur la note : elle permet de retrouver
 *  d'où vient une carte des mois plus tard, quand la formulation ne le dit plus. */
function sourceLabel(source, notes, books, noteId, bookId) {
  if (source === "note") {
    const n = (notes || []).find(x => String(x.id) === String(noteId));
    return n ? (n.content || "").split("\n").find(l => l.trim())?.replace(/^#+\s*/, "").slice(0, 60) : "Note";
  }
  if (source === "book") {
    const b = (books || []).find(x => String(x.id) === String(bookId));
    return b ? b.title : "Livre";
  }
  return source === "import" ? "Import" : "Atelier";
}
