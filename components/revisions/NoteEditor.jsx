"use client";

/**
 * Éditeur de note.
 *
 * On saisit une NOTE, pas une carte : le type choisi décide combien de cartes en
 * découlent, et le compteur au bas de la fenêtre le dit en temps réel. C'est la
 * seule façon de comprendre pourquoi ajouter un `{{c3::…}}` fait apparaître une
 * troisième carte à réviser.
 */

import React, { useMemo, useRef, useState } from "react";
import { Scissors, Layers } from "lucide-react";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
/* Les briques de formulaire sont importées de `components/ui/form` et les
   aplats de `lib/ui/tokens`, plutôt que de passer par `components/ui/da` qui
   les réexporte : ce chemin-là est valide dans tous les cas, alors que le bloc
   de réexport de `da.jsx` a déjà disparu une fois. Les briques de MISE EN PAGE
   (carte, titre de section, fil d'Ariane) viennent bien de `da`, elles y sont
   définies. */
import { Field, FieldGrid, Input, Modal, PillButton, Select, Textarea } from "@/components/ui/form";
import { clozeNumbers, wrapCloze } from "@/lib/srs/cloze";
import { ordsForNote } from "@/lib/srs/model";

const KINDS = [
  { id: "basic", label: "Recto / verso", hint: "Une carte. Le cas courant." },
  { id: "reversed", label: "Recto / verso inversé", hint: "Deux cartes, dans les deux sens. Pour les paires vraiment symétriques." },
  { id: "cloze", label: "Texte à trous", hint: "Une carte par trou numéroté, qui partagent le contexte." },
];

const REVERSED_WARNING =
  "Deux cartes, donc deux fois le travail d'entretien. À réserver aux paires qui se "
  + "demandent vraiment dans les deux sens — un mot et sa traduction, un terme et son symbole.";

export default function NoteEditor({ open, note, decks, defaultDeckId, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => ({
    deckId: note?.deckId || defaultDeckId || decks[0]?.id || "",
    kind: note?.kind || "basic",
    front: note?.front || "",
    back: note?.back || "",
    extra: note?.extra || "",
    tags: (note?.tags || []).join(" "),
  }));
  const frontRef = useRef(null);
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const cardCount = useMemo(
    () => ordsForNote({ kind: form.kind, front: form.front }).length,
    [form.kind, form.front],
  );
  const clozeNums = useMemo(
    () => (form.kind === "cloze" ? clozeNumbers(form.front) : []),
    [form.kind, form.front],
  );

  /** Enveloppe la sélection du champ recto dans un nouveau trou, et replace le
   *  curseur juste après : on enchaîne les trous sans reprendre la souris. */
  const makeCloze = () => {
    const el = frontRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    if (start === end) return;
    const next = wrapCloze(form.front, start, end);
    set({ front: next, kind: "cloze" });
    requestAnimationFrame(() => {
      el.focus();
      const pos = next.length - (form.front.length - end);
      el.setSelectionRange(pos, pos);
    });
  };

  const canSave = form.deckId && form.front.trim() && (form.kind === "cloze" ? cardCount > 0 : form.back.trim());

  const submit = () => {
    if (!canSave) return;
    onSave({
      deckId: form.deckId,
      kind: form.kind,
      front: form.front.trim(),
      back: form.kind === "cloze" ? "" : form.back.trim(),
      extra: form.extra.trim(),
      tags: form.tags.split(/[\s,]+/).map(t => t.trim()).filter(Boolean),
    });
  };

  const kindHint = KINDS.find(k => k.id === form.kind)?.hint;

  return (
    <Modal
      open={open}
      title={note ? "Modifier la note" : "Nouvelle note"}
      onClose={onClose}
      onDelete={note ? onDelete : undefined}
      width={640}
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
          {/* Le compteur de cartes vit dans le pied, à côté du bouton qui
              valide : c'est au moment d'enregistrer qu'on veut savoir ce qu'on
              vient de créer. */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: cardCount ? T.textSub : PALETTE.orange }}>
            <Layers size={13} />
            {cardCount === 0
              ? "Aucune carte : il manque un trou numéroté."
              : `${cardCount} carte${cardCount > 1 ? "s" : ""} à réviser`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
            <PillButton variant="primary" disabled={!canSave} onClick={submit}>
              {note ? "Enregistrer" : "Créer"}
            </PillButton>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldGrid columns={2}>
          <Field label="Paquet">
            <Select value={form.deckId} onChange={e => set({ deckId: e.target.value })}>
              {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Type" hint={kindHint}>
            <Select value={form.kind} onChange={e => set({ kind: e.target.value })}>
              {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </Select>
          </Field>
        </FieldGrid>

        <Field
          label={form.kind === "cloze" ? "Texte" : "Recto"}
          hint={form.kind === "cloze"
            ? "Sélectionnez ce qu'il faut masquer, puis « Créer un trou »."
            : "Une seule question, et une seule réponse possible."}
        >
          <Textarea
            ref={frontRef}
            rows={form.kind === "cloze" ? 5 : 3}
            value={form.front}
            onChange={e => set({ front: e.target.value })}
            placeholder={form.kind === "cloze"
              ? "On coupe la position à {{c1::-1R}} et on vise {{c2::+2R}}."
              : "Que mesure la stabilité ?"}
          />
        </Field>

        {form.kind === "cloze" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: -6 }}>
            <PillButton compact onClick={makeCloze}>
              <Scissors size={13} /> Créer un trou
            </PillButton>
            {clozeNums.length > 0 && (
              <span style={{ fontSize: 12, color: T.textMut }}>
                Trous : {clozeNums.map(n => `c${n}`).join(", ")}
              </span>
            )}
          </div>
        )}

        {form.kind !== "cloze" && (
          <Field label="Verso" hint="Aussi court que possible : un nom, un chiffre, une définition ramassée.">
            <Textarea
              rows={3}
              value={form.back}
              onChange={e => set({ back: e.target.value })}
              placeholder="Le délai au bout duquel il reste 90 % de chances de se souvenir."
            />
          </Field>
        )}

        <Field label="Complément" hint="Affiché après la réponse. La nuance, la source, le contre-exemple.">
          <Textarea rows={2} value={form.extra} onChange={e => set({ extra: e.target.value })} />
        </Field>

        <Field label="Étiquettes" hint="Séparées par des espaces.">
          <Input
            value={form.tags}
            onChange={e => set({ tags: e.target.value })}
            placeholder="gestion-du-risque psychologie"
          />
        </Field>

        {form.kind === "reversed" && (
          <div style={{ background: FIELD_BG, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
            {REVERSED_WARNING}
          </div>
        )}
      </div>
    </Modal>
  );
}
