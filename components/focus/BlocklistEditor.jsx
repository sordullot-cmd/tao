"use client";

/**
 * Composition d'une liste de blocage.
 *
 * L'écran est organisé par CATÉGORIE et non par ordre alphabétique : on ne se
 * dit pas « je bloque Instagram, Snapchat, TikTok », on se dit « je bloque les
 * réseaux ». D'où la coche de tête de groupe, qui prend la catégorie entière —
 * c'est le geste le plus fréquent, il doit coûter un clic.
 *
 * Dès qu'on tape, l'écran change de nature : les catégories s'effacent et
 * laissent une liste ORDONNÉE par vraisemblance (cf. `lib/focus/search.ts`),
 * parcourable aux flèches et validable à Entrée. C'est la façon dont on cherche
 * une application sur un système ; la reproduire ici évite d'avoir à savoir dans
 * quelle famille les auteurs de l'app ont rangé Discord.
 *
 * Ce qui est coché se voit à trois endroits, et ce n'est pas de la redondance
 * décorative : la ligne est teintée (on le voit là où on clique), un compte
 * figure sur la famille repliée (on le voit sans déplier), et les cibles
 * retenues sont rappelées en pastilles au-dessus du champ (on le voit sans rien
 * parcourir du tout). Une coche de 16 px au bout d'une ligne ne suffisait pas.
 *
 * Le mode « seuls autorisés » inverse la liste. Il mérite son explication à
 * l'écran : c'est le seul réglage de la page dont l'effet est contre-intuitif,
 * et le seul qui tienne quand on ne sait pas d'avance par où la distraction va
 * arriver.
 */

import React, { useMemo, useState } from "react";
import { Plus, Trash2, Search, ChevronRight, AppWindow, AlertTriangle, X, CornerDownLeft } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
import { CheckBox, Field, Input, Modal, PillButton } from "@/components/ui/da";
import { CATEGORIES, CATALOG_BY_ID, catalogOf, hostOf, newId } from "@/lib/focus/model";
import { highlight, searchCatalog } from "@/lib/focus/search";

const COLORS = Object.keys(PALETTE);

/** Combien de résultats la recherche montre. Au-delà, la liste redevient le mur
 *  qu'elle cherchait à remplacer, et le bas n'est plus ce qu'on visait. */
const MAX_HITS = 8;

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

/** Texte dont les lettres trouvées sont mises en avant. La graisse plutôt que
 *  la couleur : la teinte de la liste sert déjà à dire « coché », lui donner un
 *  second sens sur la même ligne les rendrait indistinguables. */
function Marked({ text, ranges }) {
  return (
    <>
      {highlight(text, ranges).map((part, i) => (
        <span key={i} style={part.hit ? { fontWeight: 700, color: T.text } : undefined}>{part.text}</span>
      ))}
    </>
  );
}

function Row({ label, sub, on, partial, color, onToggle, action, lead, active, onHover }) {
  /* Trois fonds possibles, et l'ordre compte : coché l'emporte sur survolé,
     sinon la ligne semblerait se décocher au passage de la souris. */
  const base = on
    ? `color-mix(in srgb, ${color} 14%, transparent)`
    : active ? FIELD_BG : "transparent";
  return (
    <div
      onClick={onToggle}
      onMouseEnter={onHover}
      role={onToggle ? "button" : undefined}
      aria-pressed={onToggle && !partial ? !!on : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8,
        cursor: onToggle ? "pointer" : "default", transition: "var(--tr-ui)",
        background: base,
        boxShadow: on ? `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)` : "none",
      }}
      onMouseOver={e => { if (!on && !active) e.currentTarget.style.background = FIELD_BG; }}
      onMouseOut={e => { e.currentTarget.style.background = base; }}
    >
      {lead}
      {onToggle && <CheckBox on={on} partial={partial} color={color} />}
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, color: T.text, fontWeight: on ? 600 : 400,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
        {sub && <span style={{ color: T.textMut, marginLeft: 6, fontSize: 12, fontWeight: 400 }}>{sub}</span>}
      </span>
      {action}
    </div>
  );
}

/**
 * Rappel de ce qui est retenu, au-dessus du champ.
 *
 * C'est la réponse à « est-ce que je l'ai vraiment cochée ? » : elle ne demande
 * ni de déplier une famille, ni de se souvenir de la frappe qui avait sorti
 * l'entrée. Le ✕ retire, parce que c'est là qu'on s'aperçoit d'une erreur.
 */
function Selected({ entries, color, onRemove }) {
  if (!entries.length) return null;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8,
      maxHeight: 92, overflowY: "auto",
    }} className="scroll-thin">
      {entries.map(e => (
        <span
          key={e.key}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, color: T.text, padding: "3px 6px 3px 9px", borderRadius: 999,
            background: `color-mix(in srgb, ${color} 16%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`,
          }}
        >
          {e.label}
          <button
            type="button"
            onClick={() => onRemove(e)}
            aria-label={`Retirer ${e.label}`}
            style={{
              background: "none", border: "none", padding: 2, cursor: "pointer",
              color: T.textMut, display: "inline-flex", borderRadius: 999,
            }}
          >
            <X size={11} />
          </button>
        </span>
      ))}
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
  /* Ligne visée par le clavier, dans la liste des résultats. */
  const [cursor, setCursor] = useState(0);

  const hue = PALETTE[color] || PALETTE.purple;

  const hits = useMemo(() => searchCatalog(query, MAX_HITS), [query]);

  /* La visée repart en tête à la frappe — pas dans un effet : une lettre de plus
     et le meilleur résultat n'est plus le même, garder l'ancien rang ferait
     cocher autre chose que ce qu'on lit. Le remettre ici, à la source du
     changement, évite le rendu en cascade d'un `useEffect`. */
  const onQuery = (v) => { setQuery(v); setCursor(0); };

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

  const addCustom = (raw) => {
    const t = cleanTarget(raw);
    if (!t) return;
    const dupe = custom.some(c => (
      t.app ? (c.app || "").toLowerCase() === t.app.toLowerCase() : c.domain === t.domain
    ));
    if (!dupe) setCustom(prev => [...prev, { id: newId("c"), ...t }]);
  };

  /* Le champ de recherche sait aussi ajouter : quand rien du catalogue ne
     répond, ce qu'on vient de taper EST la cible voulue, et la faire retaper
     douze lignes plus bas serait une punition pour avoir cherché. */
  const orphan = useMemo(
    () => (query.trim() && !hits.length ? cleanTarget(query) : null),
    [query, hits.length]
  );

  const takeHit = (i) => {
    if (orphan) { addCustom(query); onQuery(""); return; }
    const hit = hits[i];
    if (hit) toggle(hit.entry.id);
  };

  const onSearchKey = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!hits.length) return;
      setCursor(c => (c + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      takeHit(cursor);
    } else if (e.key === "Escape" && query) {
      /* La frappe s'efface avant la fenêtre : Échap sur un champ rempli veut
         dire « annule ma recherche », pas « jette la liste en cours ». Marquer
         la touche comme consommée suffit à retenir la fermeture — c'est le
         contrat de `useEscapeDismiss`, qui ignore un événement déjà traité. */
      e.preventDefault();
      onQuery("");
    }
  };

  /* Ce qui est retenu, catalogue et entrées libres confondus — c'est un seul
     ensemble pour qui compose la liste, la provenance ne l'intéresse pas. */
  const selected = useMemo(() => [
    ...[...itemIds].map(id => CATALOG_BY_ID[id]).filter(Boolean)
      .map(e => ({ key: e.id, label: e.name, kind: "catalog", id: e.id })),
    ...custom.map(c => ({ key: c.id, label: c.domain || c.app, kind: "custom", id: c.id })),
  ], [itemIds, custom]);

  const removeSelected = (item) => {
    if (item.kind === "catalog") toggle(item.id);
    else setCustom(prev => prev.filter(x => x.id !== item.id));
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
          hint="Tapez le nom : les entrées les plus probables remontent. ↑ ↓ pour viser, Entrée pour cocher. Une entrée cochée coupe son site — et son application de bureau quand elle en a une, signalée par le repère « appli »."
        >
          <Selected entries={selected} color={hue} onRemove={removeSelected} />

          <div style={{ position: "relative", marginBottom: 8 }}>
            <Search size={14} color={T.textMut} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <Input
              value={query}
              onChange={e => onQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Rechercher une appli ou un site"
              aria-label="Rechercher une appli ou un site"
              style={{ paddingLeft: 32, paddingRight: query ? 30 : undefined }}
            />
            {query && (
              <button
                type="button" onClick={() => onQuery("")} aria-label="Effacer la recherche"
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", padding: 4, cursor: "pointer",
                  color: T.textMut, display: "inline-flex",
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ maxHeight: 280, overflowY: "auto" }} className="scroll-thin">
            {query.trim() ? (
              <>
                {hits.map((h, i) => (
                  <Row
                    key={h.entry.id}
                    label={<Marked text={h.entry.name} ranges={h.nameRanges} />}
                    sub={h.sub ? <Marked text={h.sub} ranges={h.subRanges} /> : null}
                    on={itemIds.has(h.entry.id)}
                    active={i === cursor}
                    onHover={() => setCursor(i)}
                    color={hue}
                    onToggle={() => toggle(h.entry.id)}
                    action={
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <AppTag entry={h.entry} />
                        {i === cursor && (
                          <CornerDownLeft size={12} color={T.textMut} aria-hidden="true" />
                        )}
                      </span>
                    }
                  />
                ))}
                {orphan && (
                  <Row
                    label={<span>Ajouter « {orphan.domain || orphan.app} »</span>}
                    sub={orphan.domain ? "site inconnu du catalogue" : "application — demande l'app de bureau"}
                    on={false}
                    active
                    color={hue}
                    onToggle={() => { addCustom(query); onQuery(""); }}
                    lead={<Plus size={14} color={T.textMut} style={{ flexShrink: 0 }} />}
                  />
                )}
                {!hits.length && !orphan && (
                  <div style={{ fontSize: 12, color: T.textMut, padding: "10px 4px" }}>
                    Rien ne correspond. Ajoutez le domaine à la main ci-dessous.
                  </div>
                )}
              </>
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
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(draft); setDraft(""); } }}
              placeholder="exemple.fr — ou Steam"
              style={{ flex: 1 }}
            />
            <PillButton onClick={() => { addCustom(draft); setDraft(""); }} disabled={!cleanTarget(draft)}>
              <Plus size={14} /> Ajouter
            </PillButton>
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
