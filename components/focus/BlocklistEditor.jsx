"use client";

/**
 * Composition d'une liste de blocage.
 *
 * L'écran est organisé par CATÉGORIE et non par ordre alphabétique : on ne se
 * dit pas « je bloque Instagram, Snapchat, TikTok », on se dit « je bloque les
 * réseaux ». D'où la coche de tête de groupe, qui prend la catégorie entière —
 * c'est le geste le plus fréquent, il doit coûter un clic.
 *
 * Ce qui est retenu se voit à deux endroits, et ce n'est pas de la redondance
 * décorative : la ligne est teintée là où on clique, et les cibles retenues sont
 * rappelées en pastilles au-dessus de la liste — donc sans avoir à déplier
 * quoi que ce soit. Une coche de 16 px au bout d'une ligne ne suffisait pas.
 *
 * Le champ d'ajout, lui, ne se contente pas d'accepter ce qu'on tape : il
 * propose les applications RÉELLEMENT INSTALLÉES sur le poste (cf.
 * `lib/focus/native.ts`) et enregistre leur nom système. Sans cela, « Discrod »
 * entrait dans une liste aussi facilement que « Discord », et le blocage muet
 * qui s'ensuivait était indiscernable d'un blocage qui n'a rien eu à faire.
 *
 * La fenêtre ne porte aucun texte d'explication : les libellés disent le
 * réglage, et le seul paragraphe qui subsiste annonce une conséquence
 * irréversible plutôt qu'un mode d'emploi.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, AppWindow, AlertTriangle, X, Check, CornerDownLeft } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
import { CheckBox, Field, Input, Modal, PillButton } from "@/components/ui/da";
import { CATEGORIES, CATALOG_BY_ID, catalogOf, hostOf, newId, normApp } from "@/lib/focus/model";
import { highlight, rankBy } from "@/lib/focus/search";
import { installedApps, nativeAvailable } from "@/lib/focus/native";

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

/**
 * Les applications du poste, lues une fois à l'ouverture de l'éditeur.
 *
 * `ready` n'est pas « la liste n'est pas vide » : c'est « le disque a été lu ».
 * La différence porte tout le reste de l'écran — sans elle, un navigateur, qui
 * ne voit rien, serait indiscernable d'une machine sans applications, et
 * l'interface annoncerait « aucune application de ce nom » à quelqu'un qui a
 * pourtant Discord installé.
 */
function useInstalledApps() {
  const [state, setState] = useState({ list: [], ready: false });
  useEffect(() => {
    if (!nativeAvailable()) return undefined;
    let alive = true;
    installedApps().then(list => {
      if (alive) setState({ list, ready: true });
    });
    return () => { alive = false; };
  }, []);
  return state;
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
   * (« 3/9 »), ce qui suffit à savoir où aller. */
  const [openCats, setOpenCats] = useState(() => new Set());
  const toggleCat = (id) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [draft, setDraft] = useState("");
  /* Ligne visée par le clavier dans les suggestions d'applications. */
  const [appCursor, setAppCursor] = useState(0);
  const nativeApps = useInstalledApps();

  const hue = PALETTE[color] || PALETTE.purple;

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

  /* ── Champ d'ajout ────────────────────────────────────────────────────── */

  /* Ce qui est tapé désigne-t-il un site ? Alors il n'y a pas d'application à
     proposer : on ne suggère pas Firefox à quelqu'un qui vient de coller une
     adresse. */
  const draftTarget = cleanTarget(draft);
  const draftIsApp = !!draftTarget && !draftTarget.domain;

  const appHits = useMemo(
    () => (draftIsApp ? rankBy(nativeApps.list, draft, a => a.name, 6, a => a.system) : []),
    [draftIsApp, nativeApps.list, draft]
  );

  /** L'application installée qui porte EXACTEMENT ce nom, s'il y en a une. */
  const installedName = (v) => {
    const n = normApp(v || "");
    return n ? nativeApps.list.find(a => normApp(a.name) === n) || null : null;
  };

  const onDraft = (v) => { setDraft(v); setAppCursor(0); };

  const addDraft = () => { addCustom(draft); onDraft(""); };

  const onDraftKey = (e) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && appHits.length) {
      e.preventDefault();
      setAppCursor(c => (c + (e.key === "ArrowDown" ? 1 : appHits.length - 1)) % appHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      /* Entrée prend la suggestion visée quand il y en a une : c'est le nom du
         système, donc celui qui sera reconnu. À défaut seulement, la frappe
         telle quelle — un nom d'application absent du poste reste légitime, on
         peut préparer une liste avant d'installer le jeu. */
      const pick = appHits[appCursor];
      if (pick) { addCustom(pick.item.name); onDraft(""); }
      else addDraft();
    } else if (e.key === "Escape" && draft) {
      e.preventDefault();
      onDraft("");
    }
  };

  /**
   * Ce que deviendra la frappe, dit avant de valider.
   *
   * Le champ acceptait n'importe quoi en silence : « Discrod » entrait dans la
   * liste aussi facilement que « Discord », et rien, jamais, ne signalait la
   * lettre inversée. Le blocage restait muet — exactement comme un blocage qui
   * n'a rien eu à bloquer.
   */
  const draftVerdict = (() => {
    if (!draftTarget) return null;
    if (draftTarget.domain) {
      return { tone: "ok", text: `Site « ${draftTarget.domain} » — coupé dans le navigateur et, sur l'app de bureau, dans les autres navigateurs.` };
    }
    const found = installedName(draftTarget.app);
    if (found) return { tone: "ok", text: `« ${found.name} » est installée sur ce poste : le nom enregistré est celui que le système rapporte.` };
    if (nativeApps.ready) {
      return { tone: "warn", text: `Aucune application installée ne porte ce nom. Elle sera quand même enregistrée — utile si vous l'installez plus tard, sans effet sinon.` };
    }
    return { tone: "ok", text: "Le nom sera comparé à l'application au premier plan. L'app de bureau propose ici les applications réellement installées." };
  })();

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
              { id: "block", label: "Bloquer ce qui est listé" },
              { id: "allow", label: "N'autoriser QUE ce qui est listé" },
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
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{opt.label}</div>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>Bloquer en permanence</div>
              {/* Le seul texte qui reste dans cette fenêtre, et il n'explique
                  pas un réglage : il annonce une CONSÉQUENCE, celle des deux
                  seuls réglages qui, combinés, coupent Internet sans fin. Une
                  glose se relit quand on veut ; celle-ci se découvrirait le
                  lendemain, en la subissant.
                  Les deux réglages se combinent en un piège : « seuls autorisés »
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

        <Field label="Applis et sites">
          <Selected entries={selected} color={hue} onRemove={removeSelected} />

          <div style={{ maxHeight: 280, overflowY: "auto" }} className="scroll-thin">
            {CATEGORIES.map(cat => {
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
            })}
          </div>
        </Field>

        <Field label="Ajouter un site ou une appli">
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={draft}
              onChange={e => onDraft(e.target.value)}
              onKeyDown={onDraftKey}
              placeholder="exemple.fr — ou Steam"
              aria-label="Nom de l'application ou du site à ajouter"
              style={{ flex: 1 }}
            />
            <PillButton onClick={() => addDraft()} disabled={!cleanTarget(draft)}>
              <Plus size={14} /> Ajouter
            </PillButton>
          </div>

          {/* Les applications du poste, proposées à mesure qu'on tape.
              C'est la seule façon d'écrire un nom d'application QUI EXISTE :
              une chaîne tapée à la main ne se distingue pas, à l'écran, d'une
              faute de frappe — et un blocage qui n'attrape rien à cause d'une
              lettre est indiscernable d'un blocage qui n'a rien eu à attraper. */}
          {appHits.length > 0 && (
            <div role="group" aria-label="Applications installées" style={{ marginTop: 8 }}>
              {appHits.map((h, i) => {
                const already = custom.some(c => normApp(c.app || "") === normApp(h.item.name));
                return (
                  <Row
                    key={h.item.path || h.item.name}
                    label={<Marked text={h.item.name} ranges={h.ranges} />}
                    sub={already ? "déjà dans la liste" : h.item.system ? "application du système" : null}
                    on={already}
                    active={i === appCursor}
                    onHover={() => setAppCursor(i)}
                    color={hue}
                    onToggle={() => { if (!already) { addCustom(h.item.name); onDraft(""); } }}
                    lead={<AppWindow size={13} color={T.textMut} style={{ flexShrink: 0 }} />}
                    action={i === appCursor && !already ? <CornerDownLeft size={12} color={T.textMut} aria-hidden="true" /> : null}
                  />
                );
              })}
            </div>
          )}

          {/* Verdict sur ce qui est tapé. Court, mais c'est lui qui répond à la
              question qu'on se pose vraiment devant ce champ : « est-ce que ça
              va marcher ? » Il ne se prononce que là où il sait — le disque
              n'est lisible que depuis l'app de bureau. */}
          {draftVerdict && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginTop: 8,
              fontSize: 12, color: draftVerdict.tone === "warn" ? PALETTE.orange : T.textSub,
            }}>
              {draftVerdict.tone === "warn"
                ? <AlertTriangle size={12} color={PALETTE.orange} style={{ flexShrink: 0 }} />
                : <Check size={12} color={T.textMut} style={{ flexShrink: 0 }} />}
              <span>{draftVerdict.text}</span>
            </div>
          )}

        </Field>
      </div>
    </Modal>
  );
}
