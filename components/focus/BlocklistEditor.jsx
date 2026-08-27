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
import { Plus, Trash2, Search, ChevronRight, AppWindow, AlertTriangle } from "lucide-react";
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

/**
 * Site ou application ? Le champ est unique, et c'est délibéré : on tape le nom
 * de ce dont on veut se couper sans avoir à choisir une catégorie d'abord.
 *
 * La règle de tri est celle qui se lit à l'œil nu — un point suivi d'une
 * extension fait un domaine, le reste fait une application. « discord.com »
 * coupe le site, « Discord » coupe l'appli. Le doute penche du côté du domaine,
 * qui est ce qu'on colle le plus souvent depuis la barre d'adresse.
 */
function cleanTarget(raw) {
  const v = (raw || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || /^[^\s/]+\.[a-z]{2,}(\/|$)/i.test(v)) {
    const domain = cleanDomain(v);
    return domain ? { name: domain, domain } : null;
  }
  // « steam.exe » désigne bien une appli : l'extension n'est pas un domaine.
  const app = v.replace(/\.exe$/i, "");
  return { name: app, domain: "", app };
}

/**
 * Repère « appli » — cette entrée couvre aussi un logiciel installé.
 *
 * Sans lui, rien à l'écran ne distingue Discord, qui a une application de
 * bureau et sera vraiment coupé, de Instagram, qui n'existe que sur le web.
 * C'est la question qu'on se pose en composant une liste, et elle n'avait pas
 * de réponse visible.
 */
function AppTag({ entry }) {
  if (!entry.apps?.length) return null;
  return (
    <span
      title={`Couvre aussi l'application ${entry.apps[0]}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
        fontSize: 10, fontWeight: 500, color: T.textMut,
        padding: "2px 7px", borderRadius: 999, background: FIELD_BG,
      }}
    >
      <AppWindow size={10} /> appli
    </span>
  );
}

function Row({ label, sub, on, partial, color, onToggle, action, lead }) {
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
      {lead}
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
  const [always, setAlways] = useState(list?.always === true);
  const [itemIds, setItemIds] = useState(() => new Set(list?.itemIds || []));
  const [custom, setCustom] = useState(list?.custom || []);
  /* Catégories fermées au départ, toutes.
   *
   * Quarante-et-une entrées déroulées d'un coup, ce n'est pas une liste, c'est
   * un mur : on la parcourt à la molette au lieu de la lire. Fermées, les huit
   * familles tiennent à l'écran d'un seul regard, chacune avec son compte
   * (« 3/9 »), ce qui suffit à savoir où aller. Et pour chercher un service
   * précis, le champ au-dessus va plus vite que n'importe quel dépliage. */
  const [openCats, setOpenCats] = useState(() => new Set());
  const toggleCat = (id) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
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
    const t = cleanTarget(draft);
    if (!t) return;
    const dupe = custom.some(c => (
      t.app ? (c.app || "").toLowerCase() === t.app.toLowerCase() : c.domain === t.domain
    ));
    if (dupe) { setDraft(""); return; }
    setCustom(prev => [...prev, { id: newId("c"), ...t }]);
    setDraft("");
  };

  const total = itemIds.size + custom.length;

  const submit = () => {
    onSave({
      id: list?.id || newId("bl"),
      name: name.trim() || "Liste sans nom",
      color,
      mode,
      always,
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

        <Field label="Quand">
          <div
            onClick={() => setAlways(v => !v)}
            style={{
              display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
              background: always ? `color-mix(in srgb, ${hue} 10%, transparent)` : FIELD_BG,
              boxShadow: always ? `inset 0 0 0 1px ${hue}` : "none",
            }}
          >
            <CheckBox on={always} color={hue} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>Bloquer en permanence</div>
              <div style={{ fontSize: 12, color: T.textSub, marginTop: 2, lineHeight: 1.5 }}>
                {/* La phrase dit l'usage, pas le mécanisme : une liste permanente
                    ne se lance pas, on l'oublie — et c'est à ce moment-là
                    qu'elle sert. La contrepartie doit être dite aussi
                    franchement, sinon on la découvre en la subissant. */}
                Sans session, tout le temps. Pour ce dont on a décidé de ne plus rien vouloir —
                le jeu réinstallé trois fois, le site où l&apos;on ne retourne pas. Décoché,
                la liste ne s&apos;applique que pendant les sessions qui l&apos;incluent.
              </div>
              {/* Les deux réglages se combinent en un piège : « seuls autorisés »
                  coupe tout ce qui n'est pas listé, et « en permanence » ne
                  s'arrête jamais. Ensemble, ils coupent Internet pour de bon.
                  C'est un choix défendable, mais il doit être fait les yeux
                  ouverts — pas découvert le lendemain. */}
              {always && mode === "allow" && (
                <div style={{
                  display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10,
                  padding: "8px 10px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
                  background: `color-mix(in srgb, ${PALETTE.orange} 12%, transparent)`,
                  color: T.text,
                }}>
                  <AlertTriangle size={14} color={PALETTE.orange} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Avec « seuls autorisés », cette liste coupe <strong>tout ce qui n&apos;y figure
                    pas</strong>, et sans fin. Vérifiez que ce dont vous avez besoin pour travailler
                    y est bien.
                  </span>
                </div>
              )}
            </div>
          </div>
        </Field>

        <Field
          label="Applis et sites"
          hint="Cocher une entrée coupe son site — et son application de bureau quand elle en a une, signalée par le repère « appli »."
        >
          <div style={{ position: "relative", marginBottom: 8 }}>
            <Search size={14} color={T.textMut} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Chercher dans le catalogue" style={{ paddingLeft: 32 }} />
          </div>

          <div style={{ maxHeight: 280, overflowY: "auto" }} className="scroll-thin">
            {filtered ? (
              filtered.length ? filtered.map(e => (
                <Row
                  key={e.id} label={e.name} sub={e.domains[0]} on={itemIds.has(e.id)}
                  color={hue} onToggle={() => toggle(e.id)} action={<AppTag entry={e} />}
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
                const open = openCats.has(cat.id);
                return (
                  <div key={cat.id} style={{ marginBottom: 6 }}>
                    <Row
                      label={<span style={{ fontWeight: 600 }}>{cat.label}</span>}
                      sub={on ? `${on}/${entries.length}` : null}
                      on={on === entries.length}
                      partial={on > 0 && on < entries.length}
                      color={PALETTE[cat.color]}
                      onToggle={() => toggleCategory(cat.id)}
                      /* Le chevron ouvre, la ligne coche : deux gestes voisins
                         mais distincts, d'où l'arrêt de propagation — sans lui,
                         déplier une famille la cocherait tout entière. */
                      lead={
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); toggleCat(cat.id); }}
                          aria-expanded={open}
                          aria-label={`${open ? "Replier" : "Déplier"} ${cat.label}`}
                          style={{
                            background: "none", border: "none", padding: 2, cursor: "pointer",
                            color: T.textMut, display: "inline-flex", flexShrink: 0,
                            transform: open ? "rotate(90deg)" : "none", transition: "var(--tr-ui)",
                          }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      }
                    />
                    <div style={{ paddingLeft: 22, borderLeft: `1px solid ${HAIRLINE}`, marginLeft: 14, display: open ? "block" : "none" }}>
                      {entries.map(e => (
                        <Row
                          key={e.id} label={e.name} sub={e.domains[0]} on={itemIds.has(e.id)}
                          color={hue} onToggle={() => toggle(e.id)} action={<AppTag entry={e} />}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Field>

        <Field
          label="Ajouter un site ou une appli"
          hint="Ce que le catalogue ne connaît pas. Un domaine coupe le site (exemple.fr) ; un nom seul coupe l'application (Steam), et cela demande l'app de bureau."
        >
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="exemple.fr — ou Steam"
              style={{ flex: 1 }}
            />
            <PillButton onClick={addCustom} disabled={!cleanTarget(draft)}><Plus size={14} /> Ajouter</PillButton>
          </div>
          {custom.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {custom.map(c => (
                <Row
                  key={c.id}
                  label={c.domain || c.app}
                  sub={c.domain ? undefined : "application"}
                  action={
                    <button
                      type="button"
                      onClick={() => setCustom(prev => prev.filter(x => x.id !== c.id))}
                      style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: T.textMut, display: "inline-flex" }}
                      aria-label={`Retirer ${c.domain || c.app}`}
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
