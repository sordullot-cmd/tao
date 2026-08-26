"use client";

/**
 * Composition d'une liste de blocage.
 *
 * L'écran est organisé par CATÉGORIE et non par ordre alphabétique : on ne se
 * dit pas « je bloque Instagram, Snapchat, TikTok », on se dit « je bloque les
 * réseaux ». D'où la coche de tête de groupe, qui prend la catégorie entière —
 * c'est le geste le plus fréquent, il doit coûter un clic.
 *
 * Le mode « seuls autorisés » inverse la liste. Il mérite son explication à
 * l'écran : c'est le seul réglage de la page dont l'effet est contre-intuitif,
 * et le seul qui tienne quand on ne sait pas d'avance par où la distraction va
 * arriver.
 */

import React, { useMemo, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
import { CheckBox, Field, Input, Modal, PillButton } from "@/components/ui/da";
import { CATEGORIES, CATALOG, catalogOf, hostOf, newId } from "@/lib/focus/model";

const COLORS = Object.keys(PALETTE);

/** Domaine nu à partir de ce qui a été tapé : on accepte une URL entière, un
 *  `www.`, un chemin — et on n'en garde que l'hôte. Sans ça, la première entrée
 *  libre collée depuis la barre d'adresse ne correspondrait à rien. */
function cleanDomain(raw) {
  const v = (raw || "").trim().toLowerCase();
  if (!v) return "";
  const withScheme = /^https?:\/\//.test(v) ? v : `https://${v}`;
  return hostOf(withScheme) || v.replace(/^www\./, "").split("/")[0];
}

function Row({ label, sub, on, partial, color, onToggle, action }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8,
        cursor: onToggle ? "pointer" : "default", transition: "var(--tr-ui)",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = FIELD_BG; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      {onToggle && <CheckBox on={on} partial={partial} color={color} />}
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
        {sub && <span style={{ color: T.textMut, marginLeft: 6, fontSize: 12 }}>{sub}</span>}
      </span>
      {action}
    </div>
  );
}

export default function BlocklistEditor({ list, onSave, onDelete, onClose }) {
  const [name, setName] = useState(list?.name || "");
  const [color, setColor] = useState(list?.color || "purple");
  const [mode, setMode] = useState(list?.mode || "block");
  const [itemIds, setItemIds] = useState(() => new Set(list?.itemIds || []));
  const [custom, setCustom] = useState(list?.custom || []);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const hue = PALETTE[color] || PALETTE.purple;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return CATALOG.filter(e => e.name.toLowerCase().includes(q) || e.domains.some(d => d.includes(q)));
  }, [query]);

  const toggle = (id) => setItemIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleCategory = (cat) => {
    const ids = catalogOf(cat).map(e => e.id);
    const allOn = ids.every(id => itemIds.has(id));
    setItemIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const addCustom = () => {
    const domain = cleanDomain(draft);
    if (!domain) return;
    if (custom.some(c => c.domain === domain)) { setDraft(""); return; }
    setCustom(prev => [...prev, { id: newId("c"), name: domain, domain }]);
    setDraft("");
  };

  const total = itemIds.size + custom.length;

  const submit = () => {
    onSave({
      id: list?.id || newId("bl"),
      name: name.trim() || "Liste sans nom",
      color,
      mode,
      itemIds: [...itemIds],
      custom,
    });
    onClose();
  };

  return (
    <Modal
      open
      title={list ? "Modifier la liste" : "Nouvelle liste"}
      onClose={onClose}
      onDelete={list && onDelete ? () => { onDelete(list.id); onClose(); } : undefined}
      width={620}
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
          <span style={{ fontSize: 12, color: total ? T.textSub : PALETTE.orange }}>
            {total === 0
              ? "Liste vide : elle ne bloquerait rien."
              : `${total} cible${total > 1 ? "s" : ""}${mode === "allow" ? " autorisée" + (total > 1 ? "s" : "") : ""}`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <PillButton variant="ghost" onClick={onClose}>Annuler</PillButton>
            <PillButton variant="primary" onClick={submit}>{list ? "Enregistrer" : "Créer"}</PillButton>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Nom">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Réseaux sociaux" autoFocus />
        </Field>

        <Field label="Couleur">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLORS.map(c => (
              <button
                key={c} type="button" onClick={() => setColor(c)} aria-label={c}
                style={{
                  width: 26, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
                  background: PALETTE[c],
                  boxShadow: color === c ? `0 0 0 2px ${T.white}, 0 0 0 4px ${PALETTE[c]}` : "none",
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="Sens de la liste">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { id: "block", label: "Bloquer ce qui est listé", hint: "Le reste passe. Le réglage courant." },
              { id: "allow", label: "N'autoriser QUE ce qui est listé", hint: "Tout le reste est coupé, y compris ce que vous n'avez pas pensé à lister." },
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setMode(opt.id)}
                style={{
                  display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                  background: mode === opt.id ? `color-mix(in srgb, ${hue} 10%, transparent)` : FIELD_BG,
                  boxShadow: mode === opt.id ? `inset 0 0 0 1px ${hue}` : "none",
                }}
              >
                <CheckBox on={mode === opt.id} color={hue} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: T.textSub, marginTop: 2, lineHeight: 1.5 }}>{opt.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </Field>

        <Field label="Applis et sites">
          <div style={{ position: "relative", marginBottom: 8 }}>
            <Search size={14} color={T.textMut} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Chercher dans le catalogue" style={{ paddingLeft: 32 }} />
          </div>

          <div style={{ maxHeight: 280, overflowY: "auto" }} className="scroll-thin">
            {filtered ? (
              filtered.length ? filtered.map(e => (
                <Row
                  key={e.id} label={e.name} sub={e.domains[0]} on={itemIds.has(e.id)}
                  color={hue} onToggle={() => toggle(e.id)}
                />
              )) : (
                <div style={{ fontSize: 12, color: T.textMut, padding: "10px 4px" }}>
                  Rien dans le catalogue. Ajoutez le domaine à la main ci-dessous.
                </div>
              )
            ) : (
              CATEGORIES.map(cat => {
                const entries = catalogOf(cat.id);
                const on = entries.filter(e => itemIds.has(e.id)).length;
                return (
                  <div key={cat.id} style={{ marginBottom: 6 }}>
                    <Row
                      label={<span style={{ fontWeight: 600 }}>{cat.label}</span>}
                      sub={on ? `${on}/${entries.length}` : null}
                      on={on === entries.length}
                      partial={on > 0 && on < entries.length}
                      color={PALETTE[cat.color]}
                      onToggle={() => toggleCategory(cat.id)}
                    />
                    <div style={{ paddingLeft: 22, borderLeft: `1px solid ${HAIRLINE}`, marginLeft: 14 }}>
                      {entries.map(e => (
                        <Row
                          key={e.id} label={e.name} sub={e.domains[0]} on={itemIds.has(e.id)}
                          color={hue} onToggle={() => toggle(e.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Field>

        <Field label="Ajouter un domaine" hint="Ce que le catalogue ne connaît pas : un forum, un jeu, un site d'infos.">
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="exemple.fr"
              style={{ flex: 1 }}
            />
            <PillButton onClick={addCustom} disabled={!cleanDomain(draft)}><Plus size={14} /> Ajouter</PillButton>
          </div>
          {custom.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {custom.map(c => (
                <Row
                  key={c.id}
                  label={c.domain}
                  action={
                    <button
                      type="button"
                      onClick={() => setCustom(prev => prev.filter(x => x.id !== c.id))}
                      style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: T.textMut, display: "inline-flex" }}
                      aria-label={`Retirer ${c.domain}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </Field>
      </div>
    </Modal>
  );
}
