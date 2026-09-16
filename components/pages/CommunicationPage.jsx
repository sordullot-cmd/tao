"use client";

/* ============================================================================
   COMMUNICATION — la page d'entraînement.

   Elle est construite sur un constat : parler n'est pas une compétence mais une
   CHAÎNE (pensée → formulation → mots → phrase → débit → livraison → réaction →
   rebond). Quand trois maillons cèdent, on croit « ne pas savoir communiquer »
   et on s'entraîne à tout, c'est-à-dire à rien.

   La page fait donc trois choses, et refuse le reste :

     1. elle MONTRE la chaîne, maillon par maillon, à partir d'une auto-note
        hebdomadaire — c'est le diagnostic, et il appartient à l'utilisateur ;
     2. elle SERT une séance de trois exercices par jour, jamais plus, et le
        troisième se passe avec de vraies personnes ;
     3. elle GARDE les preuves : les micro-réussites réelles, les mots enfin
        placés, les histoires racontées. La confiance ne précède pas la prise de
        parole, elle la suit — ce carnet est l'endroit où l'inverse s'accumule.

   Ce qu'elle ne fait PAS, volontairement : aucun score d'aisance calculé,
   aucune promesse de niveau atteint. Le progrès en conversation ne s'observe
   pas dans un navigateur ; l'app tient le carnet, elle ne remet pas les notes.

   Le domaine (compétences, exercices, matière, séance du jour, passage de
   niveau) vit dans lib/communication.ts — pur, donc sous test. Ici, il n'y a
   que de l'affichage et des gestes.
   ========================================================================== */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, ChevronRight, Dices, Flame, Link2, Mic, Pause, Play, Plus,
  RotateCcw, Sparkles, Trash2, Users, Quote,
} from "lucide-react";
import { T, HAIRLINE, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { CARD } from "@/components/ui/da";
import { Field, Input, Textarea, PillButton, IconButton, Modal, CheckChip } from "@/components/ui/form";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { getLocalDateString } from "@/lib/dateUtils";
import {
  COMM_KEY, COMM_CLOUD_KEY, DRILLS, EMPTY_STORE, ETAGES, NIVEAUX, NIVEAU_MAX, SKILLS,
  drillById, etatDeLaChaine, etatDesCompetences, etatDuNiveau, lundiDe, matiereDuJour,
  normalizeStore, seanceDuJour, serie, skillById,
  withEvaluation, withFait, withHistoire, withHistoireRacontee, withMot, withMotUtilise,
  withNiveau, withPreuve, withTravail, withoutFait, withoutHistoire, withoutMot, withoutPreuve,
} from "@/lib/communication";

/* ─── Couleurs d'état ─────────────────────────────────────────────────────

   Trois teintes, et pas une échelle continue : un maillon se lit d'un coup
   d'œil ou ne sert à rien. Le « solide » prend l'accent du site plutôt que le
   vert des gains — cette page ne parle pas d'argent, et l'accent est ce que
   l'utilisateur a choisi de voir partout ailleurs.
   ------------------------------------------------------------------------ */
const TON = {
  inconnu:     { trait: T.border,  encre: T.textMut },
  fragile:     { trait: T.red,     encre: T.red },
  "en travail": { trait: T.amber,  encre: T.amber },
  solide:      { trait: T.brand,   encre: T.brand },
};

const ICONE_FORME = { voix: Mic, ecrit: Quote, terrain: Users };

/* ─── Petites pièces ──────────────────────────────────────────────────────── */

function Etiquette({ children, tone }) {
  return (
    <span style={{
      ...TYPE.caption2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
      color: tone || T.textMut, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

/** Le compteur d'en-tête : un chiffre, son mot dessous. */
function Compteur({ valeur, label, icone: Icone, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {Icone && <Icone size={16} strokeWidth={1.75} color={tone || T.textMut} />}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ ...TYPE.headline, ...TABULAR, color: tone || T.text }}>{valeur}</span>
        <span style={{ ...TYPE.caption, color: T.textMut }}>{label}</span>
      </div>
    </div>
  );
}

/**
 * La courbe d'une compétence, en quelques pixels.
 *
 * Deux notes suffisent à faire une direction, et c'est tout ce qu'on demande
 * ici : le chiffre exact est écrit à côté. Sous deux notes, on ne dessine rien
 * plutôt qu'un point seul, qui se lirait comme une stagnation.
 */
function Courbe({ suite, tone }) {
  if (!suite || suite.length < 2) return <div style={{ width: 56, height: 16 }} />;
  const max = 10, min = 0;
  const pas = 56 / (suite.length - 1);
  const points = suite
    .map((n, i) => `${(i * pas).toFixed(1)},${(14 - ((n - min) / (max - min)) * 12).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={56} height={16} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={tone || T.textMut} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── La chaîne ───────────────────────────────────────────────────────────── */

/**
 * Les huit maillons, dans l'ordre du relais.
 *
 * C'est le diagnostic de la page, et il tient en une ligne : on cherche où ça
 * casse, pas une note globale. Chaque maillon porte la PANNE en toutes lettres
 * (« je ne sais pas quoi dire », « je me dépêche ») parce que c'est sous cette
 * forme qu'on la reconnaît — « conversation : 4/10 » ne se reconnaît pas.
 *
 * Tant que rien n'est noté, tous les maillons sont gris : annoncer « fragile »
 * sur un maillon qu'on n'a pas encore regardé serait un diagnostic inventé.
 */
function Chaine({ etats, onNoter, jamaisNote }) {
  return (
    <div style={{ ...CARD, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Link2 size={15} strokeWidth={1.75} color={T.textSub} />
        <span style={{ ...TYPE.headline, color: T.text, flex: 1 }}>Ta chaîne</span>
        <PillButton compact onClick={onNoter}>
          {jamaisNote ? "Poser le diagnostic" : "Noter la semaine"}
        </PillButton>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 6, flexWrap: "wrap" }}>
        {etats.map(({ maillon, etat, note }, i) => {
          const ton = TON[etat];
          return (
            <React.Fragment key={`${maillon.label}-${i}`}>
              <div
                title={`${maillon.panne}${note == null ? "" : ` — ${note}/10`}`}
                style={{
                  flex: "1 1 96px", minWidth: 92,
                  display: "flex", flexDirection: "column", gap: 6,
                  padding: "8px 10px", borderRadius: 10,
                  background: etat === "inconnu" ? "transparent" : `color-mix(in srgb, ${ton.trait} 7%, transparent)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ton.trait} 40%, transparent)`,
                }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ ...TYPE.label, fontWeight: 600, color: T.text, flex: 1 }}>{maillon.label}</span>
                  {note != null && (
                    <span style={{ ...TYPE.caption2, ...TABULAR, fontWeight: 700, color: ton.encre }}>{note}</span>
                  )}
                </div>
                {/* Le trait sous le maillon : c'est lui qui donne la chaîne à
                    voir. Plein quand la note est bonne, entamé quand elle ne
                    l'est pas — la même grammaire que les jauges du site. */}
                <div style={{ height: 3, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
                  <div style={{
                    width: note == null ? "0%" : `${Math.max(6, note * 10)}%`,
                    height: "100%", borderRadius: 999, background: ton.trait,
                    transition: "width .35s ease",
                  }} />
                </div>
                <span style={{ ...TYPE.caption2, color: T.textMut, lineHeight: 1.3 }}>{maillon.panne}</span>
              </div>
              {i < etats.length - 1 && (
                <div aria-hidden="true" style={{ alignSelf: "center", color: T.border, display: "flex" }}>
                  <ChevronRight size={12} strokeWidth={2} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {jamaisNote && (
        <div style={{ ...TYPE.body, color: T.textSub, marginTop: 12 }}>
          Note-toi une première fois : c’est ce qui colore la chaîne, et c’est la
          seule mesure honnête de départ. Personne d’autre ne verra ces chiffres.
        </div>
      )}
    </div>
  );
}

/* ─── La séance du jour ───────────────────────────────────────────────────── */

/**
 * Une tuile d'exercice.
 *
 * Elle porte la consigne EN ENTIER, pas un titre à déplier : un exercice qu'il
 * faut ouvrir pour savoir ce qu'il demande ne se fait pas le matin. La garde
 * (le piège de l'exercice) est en dessous, plus discrète — on la lit une fois,
 * on s'en souvient ensuite.
 */
function Tuile({ drill, matiere, fait, onLancer, onCocher, onRetirer, rang }) {
  const Icone = ICONE_FORME[drill.forme] || Mic;
  const skill = skillById(drill.skill);
  const tonFait = fait ? T.brand : T.border;

  return (
    <div style={{
      ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10,
      boxShadow: `${T.elevCard}, inset 0 0 0 1px ${fait ? `color-mix(in srgb, ${T.brand} 34%, transparent)` : "transparent"}`,
      background: fait ? `color-mix(in srgb, ${T.brand} 5%, transparent)` : T.white,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icone size={14} strokeWidth={1.75} color={T.textSub} />
        <Etiquette>{rang}</Etiquette>
        <span style={{ flex: 1 }} />
        {drill.duree > 0 && <Etiquette>{drill.duree} min</Etiquette>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ ...TYPE.headline, color: T.text }}>{drill.label}</span>
        {skill && <Etiquette tone={T.textMut}>{skill.label}</Etiquette>}
      </div>

      <div style={{ ...TYPE.body, color: T.textSub }}>{drill.consigne}</div>

      {matiere && (
        /* La matière du jour est le seul élément que l'app TIRE au sort : elle
           est donc encadrée et porte son bouton de relance à côté, pour qu'on
           ne la confonde pas avec la consigne, qui, elle, ne change pas. */
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "9px 11px", borderRadius: 9, background: FIELD_BG,
        }}>
          <span style={{ ...TYPE.callout, color: T.text, flex: 1 }}>{matiere}</span>
          <IconButton onClick={onRetirer} aria-label="Tirer une autre matière" title="Tirer autre chose">
            <Dices size={13} strokeWidth={1.75} />
          </IconButton>
        </div>
      )}

      {drill.garde && (
        <div style={{ ...TYPE.caption, color: T.textMut, lineHeight: 1.4 }}>{drill.garde}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <PillButton variant={fait ? "secondary" : "primary"} onClick={onLancer}>
          {drill.forme === "voix" ? <><Play size={13} strokeWidth={2} /> Lancer</>
            : drill.forme === "ecrit" ? <><Plus size={13} strokeWidth={2} /> Ouvrir l’atelier</>
            : <><Users size={13} strokeWidth={2} /> Préparer</>}
        </PillButton>
        <span style={{ flex: 1 }} />
        {/* Une pilule du site, pas un bouton à soi : la métrique des boutons a
            une source unique (lib/ui/buttons.ts), et une case cochable un peu
            plus courte que ses voisines se voit tout de suite dans une barre.
            Seule la PEAU change ici — l'aplat d'accent quand c'est fait. */}
        <PillButton compact onClick={onCocher}
          role="checkbox" aria-checked={fait}
          aria-label={`${drill.label} — ${fait ? "fait aujourd'hui" : "à faire"}`}
          style={fait
            ? { background: T.brand, color: T.onSolid }
            : { background: "transparent", color: T.textSub, boxShadow: `inset 0 0 0 1px ${tonFait}` }}>
          {fait ? <Check size={11} strokeWidth={3} /> : null}
          {fait ? "Fait" : "Marquer fait"}
        </PillButton>
      </div>
    </div>
  );
}

/* ─── Le studio (exercices à voix haute) ──────────────────────────────────── */

/**
 * Le minuteur des exercices de voix, et la CADENCE du frein.
 *
 * Le frein — une phrase, une pause, une phrase — ne s'obtient pas en le
 * lisant : on se dépêche précisément parce qu'on ne sent plus le temps. La
 * pastille bat donc à sa place (parler / se taire), et c'est elle qu'on suit
 * au lieu de son propre élan.
 *
 * `setInterval` sur une horloge de référence, et non un compteur qu'on
 * décrémente : un onglet en arrière-plan ralentit les timers, et un minuteur
 * qui retarde de trente secondes sur cinq minutes ne minute plus rien.
 */
function Studio({ drill, matiere, onClose, onFait }) {
  const total = Math.max(1, drill.duree || 1) * 60;
  const [reste, setReste] = useState(total);
  const [enCours, setEnCours] = useState(false);
  const [phase, setPhase] = useState("parle");
  const depart = useRef(null);
  const restant = useRef(total);

  useEffect(() => {
    if (!enCours) return undefined;
    depart.current = Date.now();
    const base = restant.current;
    const id = setInterval(() => {
      const ecoule = (Date.now() - depart.current) / 1000;
      const r = Math.max(0, base - ecoule);
      setReste(r);
      /* La cadence : quatre secondes de phrase, deux de silence. Les deux
         secondes paraissent dix quand c'est soi qui les tient — les voir
         défiler est ce qui permet de ne pas les écourter. */
      setPhase(Math.floor(ecoule % 6) < 4 ? "parle" : "pause");
      if (r <= 0) setEnCours(false);
    }, 200);
    return () => {
      clearInterval(id);
      restant.current = Math.max(0, base - (Date.now() - depart.current) / 1000);
    };
  }, [enCours]);

  const mm = String(Math.floor(reste / 60)).padStart(2, "0");
  const ss = String(Math.floor(reste % 60)).padStart(2, "0");
  const cadence = drill.id === "frein";
  const fini = reste <= 0;

  return (
    <Modal open onClose={onClose} title={drill.label} width={460} scrim
      footer={
        <>
          <PillButton onClick={onClose}>Fermer</PillButton>
          <PillButton variant="primary" onClick={() => { onFait(); onClose(); }}>
            C’est fait
          </PillButton>
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center" }}>
        <div style={{ ...TYPE.body, color: T.textSub }}>{drill.consigne}</div>

        {matiere && (
          <div style={{ ...TYPE.title3, color: T.text, padding: "10px 14px", borderRadius: 10, background: FIELD_BG }}>
            {matiere}
          </div>
        )}

        <div style={{ ...TYPE.display, ...TABULAR, color: fini ? T.brand : T.text }}>{mm}:{ss}</div>

        {cadence && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 12, height: 12, borderRadius: 999,
              background: enCours && phase === "pause" ? T.amber : T.brand,
              transition: "background .2s ease",
            }} />
            <span style={{ ...TYPE.callout, color: T.textSub }}>
              {!enCours ? "Une phrase, puis une pause." : phase === "parle" ? "Phrase…" : "Pause. Tu ne parles pas."}
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <PillButton variant={enCours ? "secondary" : "primary"} onClick={() => setEnCours(v => !v)} disabled={fini}>
            {enCours ? <><Pause size={13} strokeWidth={2} /> Pause</> : <><Play size={13} strokeWidth={2} /> Démarrer</>}
          </PillButton>
          <PillButton onClick={() => { setEnCours(false); restant.current = total; setReste(total); }}>
            <RotateCcw size={13} strokeWidth={2} /> Reprendre
          </PillButton>
        </div>

        {drill.garde && <div style={{ ...TYPE.caption, color: T.textMut, maxWidth: 340 }}>{drill.garde}</div>}
      </div>
    </Modal>
  );
}

/* ─── L'atelier (exercices écrits) ────────────────────────────────────────── */

/**
 * Les exercices écrits partagent une seule fenêtre : des champs, une matière,
 * un enregistrement.
 *
 * Ce qu'on y écrit est CONSERVÉ (lib/communication : `travaux`). C'est le point
 * de l'atelier : quatre relances écrites une fois s'oublient, quarante relues
 * de temps en temps deviennent des réflexes — et elles sont de soi, pas d'un
 * livre.
 */
function Atelier({ drill, matiere, onClose, onEnregistrer }) {
  const champs = drill.champs || [];
  const [valeurs, setValeurs] = useState(() => champs.map(() => ""));
  const [titre, setTitre] = useState("");
  const histoire = drill.id === "histoire";
  const rempli = valeurs.some(v => v.trim()) && (!histoire || titre.trim());

  const poser = (i, v) => setValeurs(prev => prev.map((x, j) => (j === i ? v : x)));

  return (
    <Modal open onClose={onClose} title={drill.label} width={560} scrim
      footer={
        <>
          <PillButton onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" disabled={!rempli}
            onClick={() => { onEnregistrer({ valeurs, titre: titre.trim() }); onClose(); }}>
            Enregistrer
          </PillButton>
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...TYPE.body, color: T.textSub }}>{drill.consigne}</div>

        {matiere && (
          <div style={{ ...TYPE.callout, color: T.text, padding: "10px 12px", borderRadius: 9, background: FIELD_BG }}>
            {matiere}
          </div>
        )}

        {histoire && (
          <Field label="Titre" hint="De quoi tu parles, en trois mots">
            <Input aria-label="Titre" value={titre} onChange={e => setTitre(e.target.value)} autoFocus
              placeholder="La soirée sans ambiance" />
          </Field>
        )}

        {champs.map((champ, i) => (
          <Field key={champ} label={champ}>
            {/* Une ligne pour un mot, une zone pour une phrase : un champ d'une
                ligne pour raconter un moment fort décourage d'écrire, un pavé
                pour saisir « ambigu » fait croire qu'il en faut plus. */}
            {champ.length > 22 || drill.id === "histoire" || drill.id === "relances" ? (
              /* Le libellé de `Field` n’est pas relié au contrôle (pas de
                 `htmlFor`) : sans nom accessible posé ici, un lecteur d’écran
                 n’annoncerait que « zone de texte » sur les cinq temps d’une
                 histoire. */
              <Textarea rows={2} aria-label={champ} value={valeurs[i]} onChange={e => poser(i, e.target.value)} />
            ) : (
              <Input aria-label={champ} value={valeurs[i]} onChange={e => poser(i, e.target.value)}
                autoFocus={i === 0 && !histoire} />
            )}
          </Field>
        ))}

        {drill.garde && <div style={{ ...TYPE.caption, color: T.textMut }}>{drill.garde}</div>}
      </div>
    </Modal>
  );
}

/* ─── L'auto-évaluation ───────────────────────────────────────────────────── */

/**
 * Neuf curseurs, une fois par semaine.
 *
 * Pas pour se juger : pour voir bouger. La semaine est la bonne maille — noter
 * tous les jours transforme une mauvaise conversation en mauvaise note, et une
 * mauvaise note en preuve qu'on n'y arrive pas, ce qui est exactement le
 * mécanisme qu'on essaie de défaire ici.
 */
function ModaleEvaluation({ semaine, depart, onClose, onValider }) {
  const [scores, setScores] = useState(() => {
    const init = {};
    for (const s of SKILLS) init[s.id] = depart?.[s.id] ?? 5;
    return init;
  });

  return (
    <Modal open onClose={onClose} title={`Semaine du ${semaine}`} width={520} scrim
      footer={
        <>
          <PillButton onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" onClick={() => { onValider(scores); onClose(); }}>Enregistrer</PillButton>
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...TYPE.body, color: T.textSub }}>
          Où tu en es cette semaine, de 0 à 10. Ce ne sont pas des résultats,
          c’est un repère : seul l’écart avec les semaines d’avant veut dire
          quelque chose.
        </div>
        {SKILLS.map(s => (
          <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ ...TYPE.callout, color: T.text }}>{s.label}</span>
              <span style={{ ...TYPE.caption, color: T.textMut, flex: 1 }}>{s.mesure}</span>
              <span style={{ ...TYPE.callout, ...TABULAR, fontWeight: 700, color: T.brand }}>{scores[s.id]}</span>
            </div>
            <input type="range" min={0} max={10} step={1} value={scores[s.id]}
              aria-label={s.label}
              onChange={e => setScores(prev => ({ ...prev, [s.id]: Number(e.target.value) }))}
              style={{ width: "100%", accentColor: T.brand }} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ─── Les vues secondaires ────────────────────────────────────────────────── */

function Ligne({ children, onSupprimer, labelSuppression }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
      borderBottom: `1px solid ${HAIRLINE}`,
    }}>
      {children}
      {onSupprimer && (
        <IconButton tone="danger" onClick={onSupprimer} aria-label={labelSuppression}>
          <Trash2 size={13} strokeWidth={1.75} />
        </IconButton>
      )}
    </div>
  );
}

function Vide({ children }) {
  return <div style={{ ...TYPE.body, color: T.textMut, padding: "14px 0" }}>{children}</div>;
}

/** Le carnet de preuves — la pièce la plus importante de la page. */
function VuePreuves({ store, onAjouter, onSupprimer }) {
  const [texte, setTexte] = useState("");
  const poser = () => {
    if (!texte.trim()) return;
    onAjouter(texte.trim());
    setTexte("");
  };

  return (
    <div style={{ ...CARD, padding: 18 }}>
      <div style={{ ...TYPE.body, color: T.textSub, marginBottom: 12 }}>
        Une interaction qui s’est bien passée aujourd’hui, même minuscule : une
        question posée, une phrase placée, un silence tenu. C’est la matière
        dont la confiance est faite — elle vient après la prise de parole, pas
        avant.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <Input value={texte} placeholder="Ce que j'ai osé faire aujourd'hui…"
          aria-label="Nouvelle preuve"
          onChange={e => setTexte(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") poser(); }} />
        <PillButton variant="primary" disabled={!texte.trim()} onClick={poser}>
          <Plus size={13} strokeWidth={2} /> Ajouter
        </PillButton>
      </div>
      {store.preuves.length === 0
        ? <Vide>Rien encore. La première preuve est souvent la plus petite.</Vide>
        : store.preuves.map(p => (
          <Ligne key={p.id} onSupprimer={() => onSupprimer(p.id)} labelSuppression={`Supprimer la preuve du ${p.date}`}>
            <span style={{ ...TYPE.caption, ...TABULAR, color: T.textMut, minWidth: 82 }}>{p.date}</span>
            <span style={{ ...TYPE.body, color: T.text, flex: 1 }}>{p.texte}</span>
          </Ligne>
        ))}
    </div>
  );
}

/** Le vocabulaire — un mot n'est acquis que le jour où il a servi pour de vrai. */
function VueMots({ store, onUtilise, onSupprimer, onOuvrirAtelier }) {
  const actifs = store.mots.filter(m => m.utiliseLe).length;
  return (
    <div style={{ ...CARD, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ ...TYPE.body, color: T.textSub, flex: 1 }}>
          Un mot appris n’est pas un mot à toi. Coche-le le jour où tu l’auras
          placé dans une vraie conversation — <strong style={{ color: T.text }}>{actifs} sur {store.mots.length}</strong> ont franchi ce pas.
        </span>
        <PillButton compact onClick={onOuvrirAtelier}><Plus size={13} strokeWidth={2} /> Un mot</PillButton>
      </div>
      {store.mots.length === 0
        ? <Vide>Aucun mot pour l’instant. Cinq par semaine valent mieux que cinq cents dans une liste.</Vide>
        : store.mots.map(m => (
          <Ligne key={m.id} onSupprimer={() => onSupprimer(m.id)} labelSuppression={`Supprimer ${m.mot}`}>
            <button type="button" onClick={() => onUtilise(m.id)}
              role="checkbox" aria-checked={Boolean(m.utiliseLe)}
              aria-label={`${m.mot} — ${m.utiliseLe ? "utilisé en vrai" : "pas encore utilisé"}`}
              title={m.utiliseLe ? `Placé le ${m.utiliseLe}` : "Je l'ai placé dans une vraie conversation"}
              style={{
                width: 16, height: 16, borderRadius: 999, flexShrink: 0, padding: 0, cursor: "pointer",
                border: `1.5px solid ${m.utiliseLe ? T.brand : T.border}`,
                background: m.utiliseLe ? T.brand : "transparent", color: T.onSolid,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
              {m.utiliseLe && <Check size={10} strokeWidth={3} />}
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ ...TYPE.callout, fontWeight: 600, color: T.text }}>{m.mot}</span>
              {m.definition && <span style={{ ...TYPE.caption, color: T.textSub }}>{m.definition}</span>}
              {m.replique && <span style={{ ...TYPE.caption, color: T.textMut, fontStyle: "italic" }}>« {m.replique} »</span>}
            </div>
          </Ligne>
        ))}
    </div>
  );
}

/** Les histoires — un répertoire, pas un journal. */
function VueHistoires({ store, onRacontee, onSupprimer, onOuvrirAtelier }) {
  return (
    <div style={{ ...CARD, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ ...TYPE.body, color: T.textSub, flex: 1 }}>
          Une histoire rangée en cinq temps se raconte deux fois mieux la
          deuxième fois. Compte celles que tu as vraiment racontées : c’est
          comme ça qu’un répertoire se constitue.
        </span>
        <PillButton compact onClick={onOuvrirAtelier}><Plus size={13} strokeWidth={2} /> Une histoire</PillButton>
      </div>
      {store.histoires.length === 0
        ? <Vide>Aucune histoire rangée. La prochaine chose qui t’arrive fera l’affaire.</Vide>
        : store.histoires.map(h => (
          <Ligne key={h.id} onSupprimer={() => onSupprimer(h.id)} labelSuppression={`Supprimer ${h.titre}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ ...TYPE.callout, fontWeight: 600, color: T.text }}>{h.titre}</span>
              <span style={{ ...TYPE.caption, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[h.contexte, h.probleme, h.fin].filter(Boolean).join(" · ")}
              </span>
            </div>
            <PillButton compact onClick={() => onRacontee(h.id)} title="Je viens de la raconter">
              <Sparkles size={12} strokeWidth={2} /> Racontée {h.racontee > 0 ? `· ${h.racontee}` : ""}
            </PillButton>
          </Ligne>
        ))}
    </div>
  );
}

/** La progression : neuf compétences, et le programme en dessous. */
function VueProgression({ etats, niveau, onNoter, onMonter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...CARD, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ ...TYPE.headline, color: T.text, flex: 1 }}>Où tu en es</span>
          <PillButton compact onClick={onNoter}>Noter la semaine</PillButton>
        </div>
        {etats.map(e => {
          const ton = e.note == null ? T.textMut : e.note <= 3 ? T.red : e.note <= 6 ? T.amber : T.brand;
          return (
            <div key={e.skill.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
              borderBottom: `1px solid ${HAIRLINE}`,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
                <span style={{ ...TYPE.callout, color: T.text }}>{e.skill.label}</span>
                <span style={{ ...TYPE.caption, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.skill.mesure}
                </span>
              </div>
              <span style={{ ...TYPE.caption, ...TABULAR, color: T.textMut, minWidth: 64, textAlign: "right" }}>
                {e.volume} exo{e.volume > 1 ? "s" : ""}
              </span>
              <Courbe suite={e.suite} tone={ton} />
              {/* L'écart depuis la PREMIÈRE note, pas depuis la précédente :
                  une semaine creuse ne dit rien, trois mois de suite disent
                  tout — et c'est le seul chiffre de progrès qu'on puisse
                  honnêtement afficher ici. */}
              <span style={{ ...TYPE.caption, ...TABULAR, color: e.ecart == null ? T.textMut : e.ecart > 0 ? T.brand : e.ecart < 0 ? T.red : T.textMut, minWidth: 34, textAlign: "right" }}>
                {e.ecart == null ? "—" : e.ecart > 0 ? `+${e.ecart}` : String(e.ecart)}
              </span>
              <span style={{ ...TYPE.headline, ...TABULAR, color: ton, minWidth: 30, textAlign: "right" }}>
                {e.note == null ? "—" : e.note}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ ...CARD, padding: 18 }}>
        <span style={{ ...TYPE.headline, color: T.text }}>Le programme</span>
        <div style={{ ...TYPE.caption, color: T.textMut, margin: "4px 0 14px" }}>
          {ETAGES.join("  →  ")} — l’élégance vient après la maîtrise, jamais avant.
        </div>

        {NIVEAUX.map(n => {
          const courant = n.n === niveau.niveau.n;
          const passe = n.n < niveau.niveau.n;
          return (
            <div key={n.n} style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0",
              borderBottom: `1px solid ${HAIRLINE}`, opacity: passe ? 0.55 : 1,
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: 999, flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: courant ? T.brand : passe ? FIELD_BG : "transparent",
                border: courant || passe ? "none" : `1px solid ${T.border}`,
                color: courant ? T.onSolid : T.textMut, ...TYPE.caption2, fontWeight: 700,
              }}>
                {passe ? <Check size={11} strokeWidth={3} /> : n.n}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
                <span style={{ ...TYPE.callout, fontWeight: courant ? 700 : 500, color: T.text }}>{n.label}</span>
                <span style={{ ...TYPE.caption, color: T.textMut }}>{n.vise}</span>
              </div>
            </div>
          );
        })}

        {/* Le passage de niveau se PROPOSE, il ne se décrète pas : deux
            conditions visibles (du volume, une auto-note), et le bouton reste
            à l'utilisateur. Un logiciel qui annonce « niveau 4 atteint » parce
            qu'on a cliqué douze fois se trompe sur ce qu'il observe. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <div style={{ ...TYPE.caption, color: T.textMut, flex: 1 }}>
            Niveau {niveau.niveau.n} — {niveau.volume}/{niveau.volumeAttendu} exercices faits,
            auto-note {niveau.note == null ? "—" : niveau.note}/{niveau.noteAttendue} minimum.
            {niveau.pret ? " Tu peux passer à la suite." : " Les deux conditions ouvrent la suite."}
          </div>
          <PillButton variant={niveau.pret ? "primary" : "secondary"}
            disabled={niveau.niveau.n >= NIVEAU_MAX}
            onClick={onMonter}>
            Passer au niveau {Math.min(NIVEAU_MAX, niveau.niveau.n + 1)}
          </PillButton>
        </div>
      </div>
    </div>
  );
}

/* ─── La page ─────────────────────────────────────────────────────────────── */

const VUES = [
  { id: "aujourdhui", label: "Aujourd'hui" },
  { id: "preuves",    label: "Preuves" },
  { id: "mots",       label: "Vocabulaire" },
  { id: "histoires",  label: "Histoires" },
  { id: "progression", label: "Progression" },
];

export default function CommunicationPage() {
  const [brut, setBrut] = useCloudState(COMM_KEY, COMM_CLOUD_KEY, EMPTY_STORE);
  const store = useMemo(() => normalizeStore(brut), [brut]);
  const today = getLocalDateString(new Date());

  const [vue, setVue] = useState("aujourdhui");
  const [roll, setRoll] = useState(0);
  const [studio, setStudio] = useState(null);
  const [atelier, setAtelier] = useState(null);
  const [notation, setNotation] = useState(false);

  /* Toutes les écritures passent par ici : le magasin brut peut être une forme
     ancienne, et une écriture posée dessus la figerait. On normalise donc
     AVANT d'appliquer, jamais après. */
  const ecrire = useCallback((fn) => setBrut(prev => fn(normalizeStore(prev))), [setBrut]);

  const seance = useMemo(() => seanceDuJour(store, today, roll), [store, today, roll]);
  const chaine = useMemo(() => etatDeLaChaine(store), [store]);
  const competences = useMemo(() => etatDesCompetences(store), [store]);
  const niveau = useMemo(() => etatDuNiveau(store), [store]);
  const jours = useMemo(() => serie(store, today), [store, today]);
  const jamaisNote = store.evaluations.length === 0;

  const basculer = (drillId) => ecrire(s =>
    s.faits.some(f => f.date === today && f.drillId === drillId)
      ? withoutFait(s, today, drillId)
      : withFait(s, today, drillId));

  const lancer = (drill) => {
    const matiere = matiereDuJour(drill, today, roll);
    if (drill.forme === "ecrit") setAtelier({ drill, matiere });
    else if (drill.forme === "voix") setStudio({ drill, matiere });
    else {
      /* Un exercice de terrain n'a pas de fenêtre : il se passe dehors. Le
         « Préparer » envoie donc là où sa trace se posera — le carnet de
         preuves pour la confiance, la liste des phrases d'entrée sinon. */
      setVue("preuves");
    }
  };

  /** Ce qu'on fait d'un atelier rempli : chaque exercice range sa récolte. */
  const enregistrerAtelier = ({ valeurs, titre }) => {
    const { drill, matiere } = atelier;
    ecrire(s => {
      let next = s;
      if (drill.id === "mot") {
        const [mot, definition, synonymes, contraire, phrase, replique] = valeurs;
        next = withMot(next, { date: today, mot, definition, synonymes, contraire, phrase, replique });
      } else if (drill.id === "histoire") {
        const [contexte, objectif, probleme, momentFort, fin] = valeurs;
        next = withHistoire(next, { date: today, titre, contexte, objectif, probleme, momentFort, fin });
      } else {
        next = withTravail(next, { date: today, drillId: drill.id, matiere: matiere || "", reponses: valeurs });
      }
      return withFait(next, today, drill.id);
    });
  };

  const nomsDeRang = ["Instrument", "Atelier", "Terrain"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>
      {/* En-tête : le niveau du moment, et les deux chiffres qui comptent —
          la série (on s'entraîne) et les preuves (ça marche). */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ ...TYPE.title2, color: T.text, margin: 0 }}>Communication</h1>
          <div style={{ ...TYPE.body, color: T.textSub, marginTop: 4 }}>
            Niveau {niveau.niveau.n} · {niveau.niveau.label} — {niveau.niveau.vise}
          </div>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <Compteur valeur={jours} label={jours > 1 ? "jours de suite" : "jour de suite"} icone={Flame}
            tone={jours > 0 ? T.brand : T.textMut} />
          <Compteur valeur={store.preuves.length} label="preuves" icone={Sparkles} />
        </div>
      </div>

      <Chaine etats={chaine} jamaisNote={jamaisNote} onNoter={() => setNotation(true)} />

      {/* Barre de vues. Les quatre carnets sont derrière un onglet et non les
          uns sous les autres : la page d'un jour ordinaire doit tenir dans un
          écran, sinon la séance se lit après un défilement, c'est-à-dire
          jamais. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {VUES.map(v => (
          <CheckChip key={v.id} label={v.label} checked={vue === v.id}
            color={T.brand} onClick={() => setVue(v.id)} />
        ))}
      </div>

      {vue === "aujourdhui" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...TYPE.headline, color: T.text, flex: 1 }}>La séance du jour</span>
            <PillButton compact onClick={() => setRoll(r => r + 1)} title="Composer une autre séance">
              <Dices size={13} strokeWidth={2} /> Autre séance
            </PillButton>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {seance.drills.map((drill, i) => (
              <Tuile key={drill.id} drill={drill} rang={nomsDeRang[i] || "Exercice"}
                matiere={matiereDuJour(drill, today, roll)}
                fait={seance.faits.includes(drill.id)}
                onLancer={() => lancer(drill)}
                onCocher={() => basculer(drill.id)}
                onRetirer={() => setRoll(r => r + 1)} />
            ))}
          </div>

          {/* Le catalogue complet, sous la séance : un jour où l'on a du temps,
              ou une compétence qu'on veut travailler exprès, ne doivent pas
              dépendre d'un tirage. Les exercices encore verrouillés restent
              VISIBLES — le chemin se voit, il ne se devine pas. */}
          <div style={{ ...CARD, padding: 18 }}>
            <span style={{ ...TYPE.headline, color: T.text }}>Tous les exercices</span>
            <div style={{ ...TYPE.caption, color: T.textMut, margin: "4px 0 10px" }}>
              Ceux au-dessus de ton niveau restent ouverts : rien ne t’empêche d’y aller, la séance
              du jour ne te les proposera simplement pas encore.
            </div>
            {DRILLS.map(d => {
              const fait = seance.faits.includes(d.id);
              const verrou = d.niveau > store.niveau;
              const Icone = ICONE_FORME[d.forme] || Mic;
              return (
                <div key={d.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                  borderBottom: `1px solid ${HAIRLINE}`, opacity: verrou ? 0.6 : 1,
                }}>
                  <Icone size={13} strokeWidth={1.75} color={T.textMut} />
                  <span style={{ ...TYPE.callout, color: T.text, minWidth: 0, flex: 1 }}>{d.label}</span>
                  <Etiquette>N{d.niveau}</Etiquette>
                  <Etiquette tone={T.textMut}>{skillById(d.skill)?.label}</Etiquette>
                  <PillButton compact onClick={() => lancer(d)}>Ouvrir</PillButton>
                  <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>
                    {fait && <Check size={13} strokeWidth={2.5} color={T.brand} />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vue === "preuves" && (
        <VuePreuves store={store}
          onAjouter={texte => ecrire(s => withFait(withPreuve(s, { date: today, texte }), today, "preuve"))}
          onSupprimer={id => ecrire(s => withoutPreuve(s, id))} />
      )}

      {vue === "mots" && (
        <VueMots store={store}
          onUtilise={id => ecrire(s => withMotUtilise(s, id, today))}
          onSupprimer={id => ecrire(s => withoutMot(s, id))}
          onOuvrirAtelier={() => setAtelier({ drill: drillById("mot"), matiere: null })} />
      )}

      {vue === "histoires" && (
        <VueHistoires store={store}
          onRacontee={id => ecrire(s => withHistoireRacontee(s, id))}
          onSupprimer={id => ecrire(s => withoutHistoire(s, id))}
          onOuvrirAtelier={() => setAtelier({ drill: drillById("histoire"), matiere: null })} />
      )}

      {vue === "progression" && (
        <VueProgression etats={competences} niveau={niveau}
          onNoter={() => setNotation(true)}
          onMonter={() => ecrire(s => withNiveau(s, s.niveau + 1))} />
      )}

      {studio && (
        <Studio drill={studio.drill} matiere={studio.matiere}
          onClose={() => setStudio(null)}
          onFait={() => ecrire(s => withFait(s, today, studio.drill.id))} />
      )}

      {atelier && (
        <Atelier drill={atelier.drill} matiere={atelier.matiere}
          onClose={() => setAtelier(null)}
          onEnregistrer={enregistrerAtelier} />
      )}

      {notation && (
        <ModaleEvaluation semaine={lundiDe(today)}
          depart={store.evaluations.length > 0 ? store.evaluations[store.evaluations.length - 1].scores : null}
          onClose={() => setNotation(false)}
          onValider={scores => ecrire(s => withEvaluation(s, lundiDe(today), scores))} />
      )}
    </div>
  );
}
