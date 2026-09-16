"use client";

/* ============================================================================
   COMMUNICATION — la page d’entraînement.

   ── Le principe, et il est contraignant ──────────────────────────────────
   Huit compétences se perturbent entre elles : chercher le mot parfait
   ralentit la phrase, une phrase qui s’allonge fait accélérer le débit, un
   débit qui s’emballe empêche d’écouter, et ne pas écouter coupe le rebond.
   Les monter ensemble revient à n’en monter aucune. La page travaille donc UNE
   compétence à la fois — celle de la phase courante — et le reste attend.

   C’est pour ça que la séance du jour ne va PAS chercher ce qui va le plus
   mal : ce serait travailler les huit à la fois par la bande.

   ── La séance, en cinq temps ─────────────────────────────────────────────
   Échauffement · Compétence du jour · Simulation · Débrief · Mission réelle.
   La mission se vérifie à la séance SUIVANTE, jamais le soir même : cochée par
   celui qui se l’est donnée, une minute après se l’être donnée, elle ne prouve
   rien.

   ── Ce que la page refuse de faire ───────────────────────────────────────
   Aucun score d’aisance calculé, aucune phase décernée par un compteur de
   clics. Elle n’entend pas la séance : elle ne corrige donc pas, elle fournit
   la GRILLE des fautes et c’est celui qui vient de parler qui coche. Séance
   après séance, ces fautes disent ce qu’aucune note ne dit — laquelle revient.

   Le domaine (phases, exercices, simulations, fautes, missions, composition de
   la séance) vit dans lib/communication.ts, pur et sous test. Ici, il n’y a que
   de l’affichage et des gestes.
   ========================================================================== */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ChevronRight, ClipboardCheck, Dices, Flame, Link2, MessageSquare, Mic,
  Pause, Play, Plus, Quote, RotateCcw, Sparkles, Target, Trash2, Users, X,
} from "lucide-react";
import { T, HAIRLINE, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { CARD } from "@/components/ui/da";
import { Field, Input, Textarea, PillButton, IconButton, Modal, CheckChip } from "@/components/ui/form";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { getLocalDateString } from "@/lib/dateUtils";
import {
  COMM_KEY, COMM_CLOUD_KEY, DRILLS, EMPTY_STORE, FAUTES, PHASES, PHASE_MAX, SKILLS,
  MESURES, MESURES_VIDES,
  bilan, debutDuMois, drillById, etatDeLaChaine, etatDeLaPhase, etatDesCompetences,
  fautesFrequentes, finDuMois, joursTravailles, jourPlus, lundiDe, matiereDuJour,
  missionEnAttente, moisPrecedent, normalizeStore, phaseAttendue, seanceDuJour,
  semaineDuParcours, serie, skillById, withCap, withDebrief, withDebut, withEvaluation,
  withFait, withHistoire, withHistoireRacontee, withMission, withMissionReglee, withMot,
  withMotUtilise, withPhase, withPreuve, withTravail, withoutFait, withoutHistoire,
  withoutMot, withoutPreuve,
} from "@/lib/communication";

/* ─── Couleurs d’état ─────────────────────────────────────────────────────

   Trois teintes, jamais une échelle continue : un indicateur se lit d’un coup
   d’œil ou ne sert à rien. Le « vert » prend l’accent du site plutôt que le
   vert des gains — cette page ne parle pas d’argent, et l’accent est ce que
   l’utilisateur a choisi de voir partout ailleurs.
   ------------------------------------------------------------------------ */
const FEU = {
  rouge:  T.red,
  orange: T.amber,
  vert:   T.brand,
};
const TON_MAILLON = {
  inconnu: T.border,
  fragile: T.red,
  "en travail": T.amber,
  solide: T.brand,
};

const ICONE_FORME = { voix: Mic, ecrit: Quote, terrain: Users };
const ICONE_TEMPS = {
  echauffement: Flame,
  competence: Target,
  simulation: MessageSquare,
  debrief: ClipboardCheck,
  mission: Users,
};

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

function Pastille({ feu, titre }) {
  return (
    <span title={titre} aria-label={titre} style={{
      width: 9, height: 9, borderRadius: 999, flexShrink: 0,
      background: feu ? FEU[feu] : "transparent",
      boxShadow: feu ? "none" : `inset 0 0 0 1.5px ${T.border}`,
      display: "inline-block",
    }} />
  );
}

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
 * La courbe d’une compétence, en quelques pixels.
 *
 * Deux notes suffisent à faire une direction, et c’est tout ce qu’on demande
 * ici : le chiffre exact est écrit à côté. Sous deux notes on ne dessine rien
 * plutôt qu’un point seul, qui se lirait comme une stagnation.
 */
function Courbe({ suite, tone }) {
  if (!suite || suite.length < 2) return <div style={{ width: 56, height: 16 }} />;
  const pas = 56 / (suite.length - 1);
  const points = suite.map((n, i) => `${(i * pas).toFixed(1)},${(14 - (n / 10) * 12).toFixed(1)}`).join(" ");
  return (
    <svg width={56} height={16} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={tone || T.textMut} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Vide({ children }) {
  return <div style={{ ...TYPE.body, color: T.textMut, padding: "14px 0" }}>{children}</div>;
}

function Ligne({ children, onSupprimer, labelSuppression }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
      {children}
      {onSupprimer && (
        <IconButton tone="danger" onClick={onSupprimer} aria-label={labelSuppression}>
          <Trash2 size={13} strokeWidth={1.75} />
        </IconButton>
      )}
    </div>
  );
}

/* ─── La mission en attente ───────────────────────────────────────────────── */

/**
 * La première chose de la séance, avant même l’échauffement.
 *
 * Elle porte la mission d’un jour PRÉCÉDENT, et la seule question qui vaille :
 * est-ce que ça a eu lieu ? Répondre « pas fait » n’est pas une punition — une
 * mission ratée trois fois dit qu’elle était trop grosse, et c’est une
 * information qu’on n’a jamais quand on se contente de la recopier.
 */
function MissionEnAttente({ mission, onRepondre }) {
  return (
    <div style={{
      ...CARD, padding: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      boxShadow: `${T.elevCard}, inset 0 0 0 1px color-mix(in srgb, ${T.amber} 38%, transparent)`,
      background: `color-mix(in srgb, ${T.amber} 6%, transparent)`,
    }}>
      <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 2 }}>
        <Etiquette tone={T.amber}>Mission du {mission.date}</Etiquette>
        <span style={{ ...TYPE.callout, color: T.text }}>{mission.texte}</span>
      </div>
      <span style={{ ...TYPE.body, color: T.textSub }}>Tu l’as fait ?</span>
      <div style={{ display: "flex", gap: 8 }}>
        <PillButton variant="primary" onClick={() => onRepondre(true)}>
          <Check size={13} strokeWidth={2.5} /> Oui
        </PillButton>
        <PillButton onClick={() => onRepondre(false)}>
          <X size={13} strokeWidth={2} /> Pas fait
        </PillButton>
      </div>
    </div>
  );
}

/* ─── Un temps de la séance ───────────────────────────────────────────────── */

/**
 * Une tuile de la séance.
 *
 * Elle porte la consigne EN ENTIER, pas un titre à déplier : un exercice qu’il
 * faut ouvrir pour savoir ce qu’il demande ne se fait pas le matin. La garde
 * (le piège de l’exercice) est en dessous, plus discrète — on la lit une fois,
 * on s’en souvient ensuite.
 */
function TuileTemps({ temps, rang, matiere, fait, onOuvrir, onCocher, onRetirer, missionPrise }) {
  const drill = temps.drill;
  const sim = temps.simulation;
  const Icone = ICONE_TEMPS[temps.id] || Mic;
  const skill = drill ? skillById(drill.skill) : null;

  const titre = drill ? drill.label : sim ? sim.titre : temps.id === "debrief" ? "Ce qui a cloché" : "Dehors";
  const corps = drill ? drill.consigne
    : sim ? sim.contexte
    : temps.id === "debrief" ? "Repasse la simulation et coche ce qui s’est produit. Une faute cochée une fois est un accident ; la même six fois de suite est le sujet de ta prochaine phase."
    : temps.mission;

  return (
    <div style={{
      ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10,
      boxShadow: `${T.elevCard}, inset 0 0 0 1px ${fait ? `color-mix(in srgb, ${T.brand} 34%, transparent)` : "transparent"}`,
      background: fait ? `color-mix(in srgb, ${T.brand} 5%, transparent)` : T.white,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icone size={14} strokeWidth={1.75} color={T.textSub} />
        <Etiquette>{rang} · {temps.label}</Etiquette>
        <span style={{ flex: 1 }} />
        <Etiquette>{temps.minutes}</Etiquette>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...TYPE.headline, color: T.text }}>{titre}</span>
        {skill && <Etiquette tone={T.textMut}>{skill.label}</Etiquette>}
        {sim && <Etiquette tone={T.textMut}>{sim.profil}</Etiquette>}
      </div>

      <div style={{ ...TYPE.body, color: T.textSub }}>{corps}</div>

      {matiere && (
        /* La matière du jour est le seul élément que l’app TIRE au sort : elle
           est donc encadrée, avec son bouton de relance à côté, pour qu’on ne
           la confonde pas avec la consigne, qui ne change pas. */
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 11px", borderRadius: 9, background: FIELD_BG }}>
          <span style={{ ...TYPE.callout, color: T.text, flex: 1 }}>{matiere}</span>
          <IconButton onClick={onRetirer} aria-label="Tirer une autre matière" title="Tirer autre chose">
            <Dices size={13} strokeWidth={1.75} />
          </IconButton>
        </div>
      )}

      {drill?.contraintes && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {drill.contraintes.map(c => (
            <span key={c} style={{
              ...TYPE.caption, padding: "3px 9px", borderRadius: 999,
              background: `color-mix(in srgb, ${T.red} 8%, transparent)`, color: T.red,
            }}>{c}</span>
          ))}
        </div>
      )}

      {(drill?.garde || sim?.consigne) && (
        <div style={{ ...TYPE.caption, color: T.textMut, lineHeight: 1.4 }}>{drill?.garde || sim?.consigne}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        {onOuvrir && (
          <PillButton variant={fait ? "secondary" : "primary"} onClick={onOuvrir}>
            {temps.id === "simulation" ? <><Play size={13} strokeWidth={2} /> Jouer</>
              : temps.id === "debrief" ? <><ClipboardCheck size={13} strokeWidth={2} /> Ouvrir le débrief</>
              : temps.id === "mission" ? <><Plus size={13} strokeWidth={2} /> {missionPrise ? "Prise" : "Je la prends"}</>
              : drill?.forme === "ecrit" ? <><Plus size={13} strokeWidth={2} /> Ouvrir l’atelier</>
              : <><Play size={13} strokeWidth={2} /> Lancer</>}
          </PillButton>
        )}
        <span style={{ flex: 1 }} />
        {/* Une pilule du site, pas un bouton à soi : la métrique des boutons a
            une source unique, et une case un peu plus courte que ses voisines
            se voit tout de suite dans une barre. Seule la peau change. */}
        <PillButton compact onClick={onCocher}
          role="checkbox" aria-checked={fait}
          aria-label={`${titre} — ${fait ? "fait aujourd’hui" : "à faire"}`}
          style={fait
            ? { background: T.brand, color: T.onSolid }
            : { background: "transparent", color: T.textSub, boxShadow: `inset 0 0 0 1px ${T.border}` }}>
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
 * Le frein — une phrase, une pause, une phrase — ne s’obtient pas en le lisant :
 * on se dépêche précisément parce qu’on ne sent plus le temps. La pastille bat
 * donc à sa place (parler / se taire), et c’est elle qu’on suit au lieu de son
 * propre élan.
 *
 * `setInterval` sur une horloge de référence, et non un compteur qu’on
 * décrémente : un onglet en arrière-plan ralentit les timers, et un minuteur
 * qui retarde de trente secondes sur cinq minutes ne minute plus rien.
 */
function Studio({ drill, matiere, onClose, onFait }) {
  /* Deux modes, et c'est l'exercice qui décide : un exercice en ÉTAPES (« trois
     secondes de silence, puis trente de réponse ») n'a pas besoin d'un minuteur
     de cinq minutes, il a besoin qu'on lui dise quand changer d'étape. Un seul
     minuteur global pour les deux obligerait à compter dans sa tête ce que
     l'exercice demande justement de ne pas compter. */
  const etapes = drill.etapes && drill.etapes.length > 0 ? drill.etapes : null;
  const [i, setI] = useState(0);
  const duree = etapes
    ? (etapes[i]?.secondes ?? 60)
    : Math.max(1, drill.duree || 1) * 60;

  const [reste, setReste] = useState(duree);
  /* Le départ tient dans l'ÉTAT et non dans une ref : l'horloge de référence
     (`at`) et le temps qu'il restait au moment où l'on a appuyé (`base`) sont
     les deux seules choses dont le minuteur a besoin, et un `setInterval` qui
     décrémenterait un compteur prendrait du retard dès que l'onglet passe en
     arrière-plan — trente secondes d'écart sur cinq minutes, et il ne minute
     plus rien. `null` = à l'arrêt. */
  const [depart, setDepart] = useState(null);
  const [phase, setPhase] = useState("parle");
  const enCours = depart !== null;

  /* Changer d'étape remet le compteur à la durée de la nouvelle : sans ça, on
     hériterait du reliquat de la précédente et la deuxième étape serait fausse.
     L'ajustement se fait PENDANT le rendu et non dans un effet — c'est le
     schéma prévu pour « un état qui dépend d'une entrée » : dans un effet, on
     dessinerait d'abord l'ancienne durée, puis la bonne, et le minuteur
     clignoterait à chaque étape. */
  const [dureeCourante, setDureeCourante] = useState(duree);
  if (dureeCourante !== duree) {
    setDureeCourante(duree);
    setDepart(null);
    setReste(duree);
  }

  useEffect(() => {
    if (!depart) return undefined;
    const id = setInterval(() => {
      const ecoule = (Date.now() - depart.at) / 1000;
      const r = Math.max(0, depart.base - ecoule);
      setReste(r);
      /* Quatre secondes de phrase, deux de silence. Les deux secondes
         paraissent dix quand c'est soi qui les tient — les voir défiler est ce
         qui permet de ne pas les écourter. */
      setPhase(Math.floor(ecoule % 6) < 4 ? "parle" : "pause");
      if (r <= 0) setDepart(null);
    }, 200);
    return () => clearInterval(id);
  }, [depart]);

  const mm = String(Math.floor(reste / 60)).padStart(2, "0");
  const ss = String(Math.floor(reste % 60)).padStart(2, "0");
  const cadence = drill.id === "frein" || drill.id === "groupes-de-mots";
  const fini = reste <= 0;
  const derniere = !etapes || i >= etapes.length - 1;

  return (
    <Modal open onClose={onClose} title={drill.label} width={480} scrim
      footer={
        <>
          <PillButton onClick={onClose}>Fermer</PillButton>
          {etapes && !derniere
            ? <PillButton variant="primary" onClick={() => setI(n => n + 1)}>
                Étape suivante <ChevronRight size={13} strokeWidth={2} />
              </PillButton>
            : <PillButton variant="primary" onClick={() => { onFait(); onClose(); }}>C’est fait</PillButton>}
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}>
        <div style={{ ...TYPE.body, color: T.textSub }}>{drill.consigne}</div>

        {matiere && (
          <div style={{ ...TYPE.title3, color: T.text, padding: "10px 14px", borderRadius: 10, background: FIELD_BG }}>
            {matiere}
          </div>
        )}

        {/* Le contenu se PARCOURT (un texte à lire, une liste de phrases) : il
            ne se tire pas au sort, on le fait en entier. */}
        {drill.contenu && (
          <div style={{
            ...TYPE.callout, color: T.text, textAlign: "left", width: "100%",
            padding: "12px 14px", borderRadius: 10, background: FIELD_BG,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {drill.contenu.map(ligne => <span key={ligne}>{ligne}</span>)}
          </div>
        )}

        {etapes && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {etapes.map((e, n) => (
              <span key={e.label} style={{
                ...TYPE.caption, padding: "4px 10px", borderRadius: 999,
                background: n === i ? T.brand : FIELD_BG,
                color: n === i ? T.onSolid : n < i ? T.textMut : T.textSub,
                fontWeight: n === i ? 700 : 500,
                textDecoration: n < i ? "line-through" : "none",
              }}>
                {e.label}{e.secondes ? ` · ${e.secondes}s` : ""}
              </span>
            ))}
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
          <PillButton variant={enCours ? "secondary" : "primary"} disabled={fini}
            onClick={() => setDepart(enCours ? null : { at: Date.now(), base: reste })}>
            {enCours ? <><Pause size={13} strokeWidth={2} /> Pause</> : <><Play size={13} strokeWidth={2} /> Démarrer</>}
          </PillButton>
          <PillButton onClick={() => { setDepart(null); setReste(duree); }}>
            <RotateCcw size={13} strokeWidth={2} /> Reprendre
          </PillButton>
        </div>

        {/* Les interdits sont ce qui FAIT l'exercice : « raconte ta journée »
            n'est pas un exercice, « raconte ta journée sans recommencer une
            phrase » en est un. Ils restent donc sous les yeux pendant. */}
        {drill.contraintes && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {drill.contraintes.map(c => (
              <span key={c} style={{
                ...TYPE.caption, padding: "4px 10px", borderRadius: 999,
                background: `color-mix(in srgb, ${T.red} 8%, transparent)`, color: T.red,
              }}>
                {c}
              </span>
            ))}
          </div>
        )}

        {drill.critere && (
          <div style={{ ...TYPE.caption, color: T.textSub, maxWidth: 380 }}>
            <strong style={{ color: T.text }}>Réussi si :</strong> {drill.critere}
          </div>
        )}
        {drill.garde && <div style={{ ...TYPE.caption, color: T.textMut, maxWidth: 380 }}>{drill.garde}</div>}
      </div>
    </Modal>
  );
}

/* ─── L’atelier (exercices écrits) ────────────────────────────────────────── */

/**
 * Les exercices écrits partagent une seule fenêtre : des champs, une matière,
 * un enregistrement.
 *
 * Ce qu’on y écrit est CONSERVÉ (lib/communication : `travaux`). C’est le point
 * de l’atelier : quatre relances écrites une fois s’oublient, quarante relues
 * de temps en temps deviennent des réflexes — et elles sont de soi, pas d’un
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
        {drill.contenu && (
          <div style={{
            ...TYPE.callout, color: T.text, padding: "12px 14px", borderRadius: 9, background: FIELD_BG,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            {drill.contenu.map(ligne => <span key={ligne}>{ligne}</span>)}
          </div>
        )}
        {drill.contraintes && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {drill.contraintes.map(c => (
              <span key={c} style={{
                ...TYPE.caption, padding: "4px 10px", borderRadius: 999,
                background: `color-mix(in srgb, ${T.red} 8%, transparent)`, color: T.red,
              }}>{c}</span>
            ))}
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
            {/* Une ligne pour un mot, une zone pour une phrase : un champ d’une
                ligne pour raconter une escalade décourage d’écrire, un pavé pour
                saisir « ambigu » fait croire qu’il en faut plus.
                Le libellé de `Field` n’est pas relié au contrôle (pas de
                `htmlFor`) : sans nom accessible posé ici, un lecteur d’écran
                n’annoncerait que « zone de texte » sur les cinq temps. */}
            {champ.length > 22 || histoire || drill.id === "relances" ? (
              <Textarea rows={2} aria-label={champ} value={valeurs[i]} onChange={e => poser(i, e.target.value)} />
            ) : (
              <Input aria-label={champ} value={valeurs[i]} onChange={e => poser(i, e.target.value)}
                autoFocus={i === 0 && !histoire} />
            )}
          </Field>
        ))}
        {drill.critere && (
          <div style={{ ...TYPE.caption, color: T.textSub }}>
            <strong style={{ color: T.text }}>Réussi si :</strong> {drill.critere}
          </div>
        )}
        {drill.garde && <div style={{ ...TYPE.caption, color: T.textMut }}>{drill.garde}</div>}
      </div>
    </Modal>
  );
}

/* ─── La simulation ───────────────────────────────────────────────────────── */

/**
 * Une conversation jouée, tour par tour.
 *
 * L’app ne peut pas improviser une réponse à ce qu’on vient de dire — elle ne
 * l’entend pas. Elle fait donc l’autre chose, celle qui manque le plus quand on
 * s’entraîne seul : elle donne le tour SUIVANT sans qu’on sache lequel. On
 * répond à voix haute, on découvre la réplique d’après, on enchaîne. C’est la
 * contrainte de la vraie conversation — répondre à ce qui vient, pas à ce qu’on
 * avait préparé.
 *
 * Les tours déjà passés restent à l’écran : c’est de là que sortent les
 * relances, et les relire après coup est la moitié du débrief.
 */
function SimulationJouee({ simulation, onClose, onFini }) {
  const [tour, setTour] = useState(0);
  const dernier = tour >= simulation.tours.length - 1;

  return (
    <Modal open onClose={onClose} title={simulation.titre} width={560} scrim
      footer={
        <>
          <PillButton onClick={onClose}>Fermer</PillButton>
          {dernier
            ? <PillButton variant="primary" onClick={() => { onFini(); onClose(); }}>Passer au débrief</PillButton>
            : <PillButton variant="primary" onClick={() => setTour(t => t + 1)}>
                J’ai répondu <ChevronRight size={13} strokeWidth={2} />
              </PillButton>}
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...TYPE.caption, color: T.textMut }}>{simulation.profil}</div>
        <div style={{ ...TYPE.body, color: T.textSub }}>{simulation.contexte}</div>
        <div style={{ ...TYPE.callout, color: T.text, padding: "10px 12px", borderRadius: 9, background: FIELD_BG }}>
          {simulation.consigne}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {simulation.tours.slice(0, tour + 1).map((t, i) => (
            <div key={t} style={{
              display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", borderRadius: 10,
              background: i === tour ? `color-mix(in srgb, ${T.brand} 7%, transparent)` : "transparent",
              boxShadow: `inset 0 0 0 1px ${i === tour ? `color-mix(in srgb, ${T.brand} 30%, transparent)` : HAIRLINE}`,
            }}>
              <Etiquette tone={i === tour ? T.brand : T.textMut}>Tour {i + 1}</Etiquette>
              <span style={{ ...TYPE.callout, color: T.text }}>{t}</span>
              {i === tour && (
                <span style={{ ...TYPE.caption, color: T.textMut }}>À toi. À voix haute, maintenant.</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ─── Le débrief ──────────────────────────────────────────────────────────── */

/**
 * La grille des fautes, cochée par celui qui vient de parler.
 *
 * L’app n’entend rien : elle ne peut pas corriger. Ce qu’elle peut, c’est
 * fournir les fautes PRÉCISES — formulées comme on les reconnaît, « j’ai
 * recommencé une phrase en cours de route » et pas « syntaxe » — et les
 * compter dans le temps. Une liste vide est une information : une séance sans
 * faute cochée existe, et se voit.
 */
function Debrief({ simulation, depart, onClose, onValider }) {
  const [fautes, setFautes] = useState(() => depart?.fautes || []);
  const [note, setNote] = useState(() => depart?.note || "");
  const [mesures, setMesures] = useState(() => ({ ...MESURES_VIDES, ...(depart?.mesures || {}) }));
  const basculer = (id) => setFautes(prev => (prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]));
  const poser = (id, v) => setMesures(prev => ({ ...prev, [id]: v === "" ? null : Number(v) }));

  return (
    <Modal open onClose={onClose} title="Débrief" width={560} scrim
      footer={
        <>
          <PillButton onClick={onClose}>Annuler</PillButton>
          <PillButton variant="primary" onClick={() => { onValider({ fautes, note, mesures }); onClose(); }}>
            Enregistrer
          </PillButton>
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...TYPE.body, color: T.textSub }}>
          {simulation ? `Après « ${simulation.titre} ». ` : ""}
          Coche ce qui s’est produit, sans indulgence et sans t’accabler : c’est
          la fréquence qui compte, pas la séance.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FAUTES.map(f => (
            <CheckChip key={f.id} label={f.label} checked={fautes.includes(f.id)}
              color={T.amber} onClick={() => basculer(f.id)} />
          ))}
        </div>

        {/* Les six chiffres. Ce sont eux qui pilotent le renfort du lendemain :
            « j’ai dit du coup onze fois » est vérifiable, « ma fluidité était à
            6 » ne l’est pas. Chacun peut rester vide — un chiffre inventé pour
            remplir une case vaut moins que la case vide. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {MESURES.map(m => (
            <Field key={m.id} label={m.label} hint={m.aide}>
              <Input type="number" inputMode="numeric" aria-label={m.label}
                min={0} max={m.type === "note" ? 10 : undefined}
                placeholder={m.type === "note" ? "/10" : "combien ?"}
                value={mesures[m.id] == null ? "" : String(mesures[m.id])}
                onChange={e => poser(m.id, e.target.value.trim())} />
            </Field>
          ))}
        </div>
        <Field label="Ce que je retiens" hint="Une phrase suffit">
          <Textarea rows={2} aria-label="Ce que je retiens" value={note} onChange={e => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ─── L’auto-évaluation ───────────────────────────────────────────────────── */

/**
 * Huit curseurs, une fois par semaine.
 *
 * Pas pour se juger : pour voir bouger. La semaine est la bonne maille — noter
 * tous les jours transforme une mauvaise conversation en mauvaise note, et une
 * mauvaise note en preuve qu’on n’y arrive pas, ce qui est exactement le
 * mécanisme qu’on essaie de défaire ici.
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
            <input type="range" min={0} max={10} step={1} value={scores[s.id]} aria-label={s.label}
              onChange={e => setScores(prev => ({ ...prev, [s.id]: Number(e.target.value) }))}
              style={{ width: "100%", accentColor: T.brand }} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ─── Les carnets ─────────────────────────────────────────────────────────── */

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
        question posée, une phrase placée, un silence tenu. C’est la matière dont
        la confiance est faite — elle vient après la prise de parole, pas avant.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <Input value={texte} placeholder="Ce que j’ai osé faire aujourd’hui…" aria-label="Nouvelle preuve"
          onChange={e => setTexte(e.target.value)} onKeyDown={e => { if (e.key === "Enter") poser(); }} />
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

/** Le vocabulaire — un mot n’est acquis que le jour où il a servi pour de vrai. */
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
        ? <Vide>Aucun mot pour l’instant. Dix par semaine, chacun avec une phrase à toi.</Vide>
        : store.mots.map(m => (
          <Ligne key={m.id} onSupprimer={() => onSupprimer(m.id)} labelSuppression={`Supprimer ${m.mot}`}>
            <button type="button" onClick={() => onUtilise(m.id)}
              role="checkbox" aria-checked={Boolean(m.utiliseLe)}
              aria-label={`${m.mot} — ${m.utiliseLe ? "utilisé en vrai" : "pas encore utilisé"}`}
              title={m.utiliseLe ? `Placé le ${m.utiliseLe}` : "Je l’ai placé dans une vraie conversation"}
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
          Contexte → objectif → problème → escalade → résultat. Une histoire
          rangée se raconte deux fois mieux la deuxième fois ; compte celles que
          tu as vraiment racontées.
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
                {[h.contexte, h.probleme, h.resultat].filter(Boolean).join(" · ")}
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

/* ─── La progression ──────────────────────────────────────────────────────── */

function VueProgression({ etats, fautes, chaine, phase, onNoter, onMonter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Les huit indicateurs. Le DÉPART est à gauche et ne bouge jamais : sans
          lui, une note à 5 ne dit pas si l’on vient de 2 ou de 8. */}
      <div style={{ ...CARD, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ ...TYPE.headline, color: T.text, flex: 1 }}>Les huit indicateurs</span>
          <PillButton compact onClick={onNoter}>Noter la semaine</PillButton>
        </div>
        <div style={{ ...TYPE.caption, color: T.textMut, marginBottom: 10 }}>
          On n’essaie pas de les faire monter ensemble : une seule est travaillée
          à la fois, celle de la phase. Les autres attendent leur tour.
        </div>
        {etats.map(e => {
          const ton = e.feu ? FEU[e.feu] : T.textMut;
          const active = e.skill.id === phase.phase.skill;
          return (
            <div key={e.skill.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
              borderBottom: `1px solid ${HAIRLINE}`,
            }}>
              <Pastille feu={e.skill.depart} titre={`Départ : ${e.skill.depart}`} />
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
                <span style={{ ...TYPE.callout, fontWeight: active ? 700 : 500, color: T.text }}>
                  {e.skill.label}{active ? " — en cours" : ""}
                </span>
                <span style={{ ...TYPE.caption, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.skill.mesure}
                </span>
              </div>
              <span style={{ ...TYPE.caption, ...TABULAR, color: T.textMut, minWidth: 56, textAlign: "right" }}>
                {e.volume} exo{e.volume > 1 ? "s" : ""}
              </span>
              <span style={{ ...TYPE.caption, ...TABULAR, color: e.fautes > 0 ? T.amber : T.textMut, minWidth: 56, textAlign: "right" }}>
                {e.fautes} faute{e.fautes > 1 ? "s" : ""}
              </span>
              <Courbe suite={e.suite} tone={ton} />
              {/* L’écart depuis la PREMIÈRE note, pas depuis la précédente :
                  une semaine creuse ne dit rien, trois mois disent tout. */}
              <span style={{
                ...TYPE.caption, ...TABULAR, minWidth: 34, textAlign: "right",
                color: e.ecart == null ? T.textMut : e.ecart > 0 ? T.brand : e.ecart < 0 ? T.red : T.textMut,
              }}>
                {e.ecart == null ? "—" : e.ecart > 0 ? `+${e.ecart}` : String(e.ecart)}
              </span>
              <span style={{ ...TYPE.headline, ...TABULAR, color: ton, minWidth: 30, textAlign: "right" }}>
                {e.note == null ? "—" : e.note}
              </span>
            </div>
          );
        })}
      </div>

      {/* Ce que les débriefs ont fini par dire. C’est le seul endroit où la page
          apprend quelque chose qu’on ne savait pas : on se souvient de la
          dernière séance, pas des dix. */}
      <div style={{ ...CARD, padding: 18 }}>
        <span style={{ ...TYPE.headline, color: T.text }}>Ce qui revient</span>
        <div style={{ ...TYPE.caption, color: T.textMut, margin: "4px 0 10px" }}>
          Les fautes cochées sur tes dix derniers débriefs.
        </div>
        {fautes.length === 0
          ? <Vide>Pas encore de débrief. C’est le quatrième temps de la séance.</Vide>
          : fautes.slice(0, 6).map(({ faute, n }) => (
            <div key={faute.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
              <span style={{ ...TYPE.body, color: T.text, flex: 1 }}>{faute.label}</span>
              <Etiquette tone={T.textMut}>{skillById(faute.skill)?.label}</Etiquette>
              <div style={{ width: 80, height: 5, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, n * 10)}%`, height: "100%", borderRadius: 999, background: T.amber }} />
              </div>
              <span style={{ ...TYPE.callout, ...TABULAR, color: T.text, minWidth: 22, textAlign: "right" }}>{n}</span>
            </div>
          ))}
      </div>

      {/* La chaîne : le diagnostic, en mots qu’on reconnaît. « Je me dépêche »
          se reconnaît, « débit : 4/10 » ne se reconnaît pas. */}
      <div style={{ ...CARD, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Link2 size={15} strokeWidth={1.75} color={T.textSub} />
          <span style={{ ...TYPE.headline, color: T.text }}>Où la chaîne casse</span>
        </div>
        <div style={{ display: "flex", alignItems: "stretch", gap: 6, flexWrap: "wrap" }}>
          {chaine.map(({ maillon, etat, note }, i) => {
            const ton = TON_MAILLON[etat];
            return (
              <React.Fragment key={`${maillon.label}-${i}`}>
                <div title={`${maillon.panne}${note == null ? "" : ` — ${note}/10`}`} style={{
                  flex: "1 1 96px", minWidth: 92, display: "flex", flexDirection: "column", gap: 6,
                  padding: "8px 10px", borderRadius: 10,
                  background: etat === "inconnu" ? "transparent" : `color-mix(in srgb, ${ton} 7%, transparent)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ton} 40%, transparent)`,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ ...TYPE.label, fontWeight: 600, color: T.text, flex: 1 }}>{maillon.label}</span>
                    {note != null && <span style={{ ...TYPE.caption2, ...TABULAR, fontWeight: 700, color: ton }}>{note}</span>}
                  </div>
                  <div style={{ height: 3, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
                    <div style={{
                      width: note == null ? "0%" : `${Math.max(6, note * 10)}%`,
                      height: "100%", borderRadius: 999, background: ton, transition: "width .35s ease",
                    }} />
                  </div>
                  <span style={{ ...TYPE.caption2, color: T.textMut, lineHeight: 1.3 }}>{maillon.panne}</span>
                </div>
                {i < chaine.length - 1 && (
                  <div aria-hidden="true" style={{ alignSelf: "center", color: T.border, display: "flex" }}>
                    <ChevronRight size={12} strokeWidth={2} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Le parcours, et le passage de phase. */}
      <div style={{ ...CARD, padding: 18 }}>
        <span style={{ ...TYPE.headline, color: T.text }}>Le parcours</span>
        <div style={{ ...TYPE.caption, color: T.textMut, margin: "4px 0 14px" }}>
          Dix phases, dans cet ordre. L’élégance vient après la maîtrise, jamais avant.
        </div>

        {PHASES.map(p => {
          const courante = p.n === phase.phase.n;
          const passee = p.n < phase.phase.n;
          return (
            <div key={p.n} style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0",
              borderBottom: `1px solid ${HAIRLINE}`, opacity: passee ? 0.55 : 1,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: courante ? T.brand : passee ? FIELD_BG : "transparent",
                border: courante || passee ? "none" : `1px solid ${T.border}`,
                color: courante ? T.onSolid : T.textMut, ...TYPE.caption2, fontWeight: 700,
              }}>
                {passee ? <Check size={11} strokeWidth={3} /> : p.n}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ ...TYPE.callout, fontWeight: courante ? 700 : 500, color: T.text }}>{p.label}</span>
                  <Etiquette>{p.semaines}</Etiquette>
                </div>
                <span style={{ ...TYPE.caption, color: T.textMut }}>{p.objectif}</span>
                {courante && p.ecarte && (
                  <span style={{ ...TYPE.caption, color: T.amber, marginTop: 2 }}>{p.ecarte}</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Le passage se PROPOSE sous trois conditions visibles — dont une que
            l’app ne peut pas fabriquer : des missions réellement faites, donc
            confirmées un autre jour. Le bouton reste à l’utilisateur. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ ...TYPE.caption, color: T.textMut, flex: 1, minWidth: 220 }}>
            Phase {phase.phase.n} — {phase.volume}/{phase.volumeAttendu} exercices,
            auto-note {phase.note == null ? "—" : phase.note}/{phase.noteAttendue} minimum,
            {" "}{phase.missions}/{phase.missionsAttendues} missions faites dehors.
            {phase.pret ? " Tu peux passer à la suite." : " Les trois ouvrent la suite."}
          </div>
          <PillButton variant={phase.pret ? "primary" : "secondary"}
            disabled={phase.phase.n >= PHASE_MAX} onClick={onMonter}>
            Passer à la phase {Math.min(PHASE_MAX, phase.phase.n + 1)}
          </PillButton>
        </div>
      </div>
    </div>
  );
}

/* ─── L’année ─────────────────────────────────────────────────────────────── */

/**
 * La trame des jours travaillés — une case par jour, une colonne par semaine.
 *
 * Sur douze mois, c’est la seule vue qui dise la VÉRITÉ sur la régularité : une
 * série en cours flatte la semaine, la trame montre les trois semaines vides de
 * février. Elle ne compte pas les exercices d’un jour au-delà de trois — au
 * quatrième, la case est pleine, et une journée de dix ne doit pas écraser
 * visuellement dix journées de une.
 */
function Trame({ jours, depuis, today }) {
  const debut = lundiDe(depuis);
  const semaines = [];
  let curseur = debut;
  let garde = 0;
  while (curseur <= today && garde < 60) {
    const colonne = [];
    for (let i = 0; i < 7; i++) {
      const jour = jourPlus(curseur, i);
      colonne.push({ jour, n: jour <= today ? (jours.get(jour) || 0) : -1 });
    }
    semaines.push(colonne);
    curseur = jourPlus(curseur, 7);
    garde += 1;
  }

  const teinte = (n) =>
    n < 0 ? "transparent"
    : n === 0 ? FIELD_BG
    : `color-mix(in srgb, ${T.brand} ${Math.min(100, 30 + n * 25)}%, transparent)`;

  return (
    <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 4 }}>
      {semaines.map(colonne => (
        <div key={colonne[0].jour} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {colonne.map(({ jour, n }) => (
            <span key={jour}
              title={n < 0 ? undefined : `${jour} — ${n} exercice${n > 1 ? "s" : ""}`}
              style={{
                width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                background: teinte(n),
                boxShadow: n === 0 ? `inset 0 0 0 1px ${HAIRLINE}` : "none",
              }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Chiffre({ valeur, label, tone }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 74 }}>
      <span style={{ ...TYPE.title3, ...TABULAR, color: tone || T.text }}>{valeur}</span>
      <span style={{ ...TYPE.caption, color: T.textMut }}>{label}</span>
    </div>
  );
}

/** Le bilan d’une période, tel que la page le recompose — pas de mémoire. */
function BlocBilan({ titre, sous, b }) {
  const bouges = b.progres.filter(p => p.de != null && p.a != null && p.a !== p.de);
  return (
    <div style={{ ...CARD, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...TYPE.headline, color: T.text, flex: 1 }}>{titre}</span>
        <Etiquette>{sous}</Etiquette>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "14px 0 6px" }}>
        <Chiffre valeur={b.jours} label={b.jours > 1 ? "jours travaillés" : "jour travaillé"} />
        <Chiffre valeur={b.exercices} label="exercices" />
        <Chiffre valeur={b.simulations} label="simulations" />
        <Chiffre valeur={b.missionsFaites} label="missions faites" tone={b.missionsFaites > 0 ? T.brand : undefined} />
        <Chiffre valeur={b.missionsRatees} label="missions ratées" tone={b.missionsRatees > 0 ? T.amber : undefined} />
        <Chiffre valeur={b.preuves} label="preuves" />
        <Chiffre valeur={b.motsUtilises} label="mots placés" />
        <Chiffre valeur={b.histoiresRacontees} label="histoires racontées" />
      </div>

      {/* Une mission ratée n’est pas une faute : répétée, elle dit que la
          mission était trop grosse — ce qu’on ne voit qu’au bilan. */}
      {b.missionsRatees >= 2 && (
        <div style={{ ...TYPE.caption, color: T.amber, marginBottom: 8 }}>
          {b.missionsRatees} missions non faites : elles sont probablement trop grosses. Coupe-les en deux.
        </div>
      )}

      {bouges.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {bouges.map(p => (
            <span key={p.skill.id} style={{
              ...TYPE.caption, padding: "4px 9px", borderRadius: 999,
              background: FIELD_BG, color: T.text,
            }}>
              {p.skill.label} {p.de} → <strong style={{ color: p.a > p.de ? T.brand : T.red }}>{p.a}</strong>
            </span>
          ))}
        </div>
      )}

      {b.fautes.length > 0 && (
        <div style={{ ...TYPE.caption, color: T.textSub, marginTop: 10 }}>
          Ce qui est revenu le plus : <strong style={{ color: T.text }}>{b.fautes[0].faute.label}</strong>
          {" "}({b.fautes[0].n} fois){b.fautes[1] ? `, puis ${b.fautes[1].faute.label} (${b.fautes[1].n})` : ""}.
        </div>
      )}

      {b.jours === 0 && <Vide>Rien sur cette période.</Vide>}
    </div>
  );
}

function VueAnnee({ store, today, semaine, attendue, phase, onDemarrer, onCap }) {
  const [cap, setCap] = useState(store.cap);
  const jours = useMemo(() => joursTravailles(store), [store]);
  const mois = useMemo(() => bilan(store, debutDuMois(today), finDuMois(today)), [store, today]);
  const precedent = useMemo(() => {
    const { du, au } = moisPrecedent(today);
    return { bornes: { du, au }, b: bilan(store, du, au) };
  }, [store, today]);
  const depuis = store.debut || jourPlus(today, -7 * 25);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Le cap. Il n’est pas décoratif : à la douzième semaine, c’est lui qui
          dit pourquoi on coche des cases, et il se reformule quand il a changé. */}
      <div style={{ ...CARD, padding: 18 }}>
        <span style={{ ...TYPE.headline, color: T.text }}>Le cap</span>
        <div style={{ ...TYPE.caption, color: T.textMut, margin: "4px 0 10px" }}>
          Ce que tu veux pouvoir faire dans douze mois. Une phrase, à la première personne.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input aria-label="Le cap de l’année" value={cap} onChange={e => setCap(e.target.value)} />
          <PillButton variant="primary" disabled={cap.trim() === store.cap} onClick={() => onCap(cap)}>
            Enregistrer
          </PillButton>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          {semaine == null ? (
            <>
              <span style={{ ...TYPE.body, color: T.textSub, flex: 1, minWidth: 220 }}>
                Le parcours n’a pas encore de premier jour. Sans lui, pas d’échelle : ni semaine, ni année.
              </span>
              <PillButton variant="primary" onClick={onDemarrer}>Je commence aujourd’hui</PillButton>
            </>
          ) : (
            <span style={{ ...TYPE.body, color: T.textSub }}>
              <strong style={{ color: T.text }}>Semaine {semaine}</strong> depuis le {store.debut}.
              {attendue && attendue.n !== phase.phase.n
                ? ` Le calendrier situerait la phase ${attendue.n} (${attendue.label}) — tu es en ${phase.phase.n}. Le parcours avance à la pratique, pas à la date.`
                : " Tu es à la page du calendrier."}
            </span>
          )}
        </div>
      </div>

      <div style={{ ...CARD, padding: 18 }}>
        <span style={{ ...TYPE.headline, color: T.text }}>La trame</span>
        <div style={{ ...TYPE.caption, color: T.textMut, margin: "4px 0 12px" }}>
          Un carré par jour. C’est la régularité qui se voit ici — une série en cours flatte la semaine,
          la trame montre les trous.
        </div>
        <Trame jours={jours} depuis={depuis} today={today} />
      </div>

      <BlocBilan titre="Ce mois-ci" sous={`${mois.du} → ${mois.au}`} b={mois} />
      <BlocBilan titre="Le mois précédent" sous={`${precedent.bornes.du} → ${precedent.bornes.au}`} b={precedent.b} />
    </div>
  );
}

/* ─── La page ─────────────────────────────────────────────────────────────── */

const VUES = [
  { id: "aujourdhui", label: "La séance" },
  { id: "preuves", label: "Preuves" },
  { id: "mots", label: "Vocabulaire" },
  { id: "histoires", label: "Histoires" },
  { id: "progression", label: "Progression" },
  { id: "annee", label: "L’année" },
];

const RANGS = ["①", "②", "③", "④", "⑤"];

export default function CommunicationPage() {
  const [brut, setBrut] = useCloudState(COMM_KEY, COMM_CLOUD_KEY, EMPTY_STORE);
  const store = useMemo(() => normalizeStore(brut), [brut]);
  const today = getLocalDateString(new Date());

  const [vue, setVue] = useState("aujourdhui");
  const [roll, setRoll] = useState(0);
  const [studio, setStudio] = useState(null);
  const [atelier, setAtelier] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [debrief, setDebrief] = useState(false);
  const [notation, setNotation] = useState(false);

  /* Toutes les écritures passent par ici : le magasin brut peut être une forme
     ancienne (les neuf « niveaux » de la première version, par exemple), et une
     écriture posée dessus la figerait. On normalise AVANT d’appliquer. */
  const ecrire = useCallback((fn) => setBrut(prev => fn(normalizeStore(prev))), [setBrut]);

  const seance = useMemo(() => seanceDuJour(store, today, roll), [store, today, roll]);
  const chaine = useMemo(() => etatDeLaChaine(store), [store]);
  const competences = useMemo(() => etatDesCompetences(store), [store]);
  const phase = useMemo(() => etatDeLaPhase(store), [store]);
  const fautes = useMemo(() => fautesFrequentes(store), [store]);
  const jours = useMemo(() => serie(store, today), [store, today]);
  const attente = useMemo(() => missionEnAttente(store, today), [store, today]);
  const semaine = useMemo(() => semaineDuParcours(store, today), [store, today]);
  const attendue = useMemo(() => phaseAttendue(semaine), [semaine]);
  const debriefDuJour = store.debriefs.find(d => d.date === today) || null;
  const missionPrise = store.missions.some(m => m.date === today);

  /** L’identifiant sous lequel un temps se coche. */
  const cleDe = (temps) =>
    temps.drill ? temps.drill.id
    : temps.simulation ? `sim:${temps.simulation.id}`
    : temps.id;

  const basculer = (cle) => ecrire(s =>
    s.faits.some(f => f.date === today && f.drillId === cle)
      ? withoutFait(s, today, cle)
      : withFait(s, today, cle));

  const ouvrir = (temps) => {
    if (temps.id === "simulation") return setSimulation(temps.simulation);
    if (temps.id === "debrief") return setDebrief(true);
    if (temps.id === "mission") {
      /* Prendre la mission l’enregistre en « en cours » : c’est demain qu’on
         demandera si elle a eu lieu. */
      if (!missionPrise && temps.mission) {
        ecrire(s => withFait(withMission(s, today, temps.mission, s.phase), today, "mission"));
      }
      return undefined;
    }
    const drill = temps.drill;
    if (!drill) return undefined;
    const matiere = matiereDuJour(drill, today, roll);
    if (drill.forme === "ecrit") return setAtelier({ drill, matiere });
    if (drill.forme === "voix") return setStudio({ drill, matiere });
    /* Un exercice de terrain n’a pas de fenêtre : il se passe dehors. On envoie
       là où sa trace se posera. */
    setVue("preuves");
    return undefined;
  };

  /** Ce qu’on fait d’un atelier rempli : chaque exercice range sa récolte. */
  const enregistrerAtelier = ({ valeurs, titre }) => {
    const { drill, matiere } = atelier;
    ecrire(s => {
      let next = s;
      if (drill.id === "mot") {
        const [mot, definition, synonymes, contraire, phrase, replique] = valeurs;
        next = withMot(next, { date: today, mot, definition, synonymes, contraire, phrase, replique });
      } else if (drill.id === "histoire") {
        const [contexte, objectif, probleme, escalade, resultat] = valeurs;
        next = withHistoire(next, { date: today, titre, contexte, objectif, probleme, escalade, resultat });
      } else {
        next = withTravail(next, { date: today, drillId: drill.id, matiere: matiere || "", reponses: valeurs });
      }
      return withFait(next, today, drill.id);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>
      {/* En-tête : la phase du moment — une seule compétence travaillée — et les
          deux chiffres qui comptent : la série (on s’entraîne) et les preuves
          (ça marche). */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ ...TYPE.title2, color: T.text, margin: 0 }}>Communication</h1>
          <div style={{ ...TYPE.body, color: T.textSub, marginTop: 4 }}>
            Phase {phase.phase.n} · {phase.phase.label} — {phase.phase.semaines}
          </div>
          <div style={{ ...TYPE.caption, color: T.textMut, marginTop: 2 }}>{phase.phase.objectif}</div>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <Compteur valeur={jours} label={jours > 1 ? "jours de suite" : "jour de suite"} icone={Flame}
            tone={jours > 0 ? T.brand : T.textMut} />
          <Compteur valeur={store.preuves.length} label="preuves" icone={Sparkles} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {VUES.map(v => (
          <CheckChip key={v.id} label={v.label} checked={vue === v.id} color={T.brand} onClick={() => setVue(v.id)} />
        ))}
      </div>

      {vue === "aujourdhui" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {attente && (
            <MissionEnAttente mission={attente}
              onRepondre={faite => ecrire(s => withMissionReglee(s, attente.id, faite, today))} />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...TYPE.headline, color: T.text, flex: 1 }}>La séance du jour</span>
            <PillButton compact onClick={() => setRoll(r => r + 1)} title="Composer une autre séance">
              <Dices size={13} strokeWidth={2} /> Autre séance
            </PillButton>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {seance.temps.map((temps, i) => {
              const cle = cleDe(temps);
              return (
                <TuileTemps key={temps.id} temps={temps} rang={RANGS[i]}
                  matiere={temps.drill ? matiereDuJour(temps.drill, today, roll) : null}
                  fait={seance.faits.includes(cle)}
                  missionPrise={missionPrise}
                  onOuvrir={() => ouvrir(temps)}
                  onCocher={() => basculer(cle)}
                  onRetirer={() => setRoll(r => r + 1)} />
              );
            })}
          </div>

          {/* Le renfort : hors des cinq temps, et avec sa RAISON écrite. Le
              parcours reste linéaire — une phase, une compétence — mais il
              serait absurde de dérouler le calendrier quand six débriefs de
              suite disent la même chose. */}
          {seance.renfort && (
            <div style={{
              ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10,
              boxShadow: `${T.elevCard}, inset 0 0 0 1px color-mix(in srgb, ${T.amber} 34%, transparent)`,
              background: `color-mix(in srgb, ${T.amber} 5%, transparent)`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Target size={14} strokeWidth={1.75} color={T.amber} />
                <Etiquette tone={T.amber}>Renfort · ce qui revient chez toi</Etiquette>
                <span style={{ flex: 1 }} />
                <Etiquette>{seance.renfort.drill.duree} min</Etiquette>
              </div>
              <div style={{ ...TYPE.body, color: T.textSub }}>{seance.renfort.priorite.raison}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...TYPE.headline, color: T.text }}>{seance.renfort.drill.label}</span>
                <Etiquette tone={T.textMut}>{seance.renfort.priorite.skill.label}</Etiquette>
              </div>
              <div style={{ ...TYPE.body, color: T.textSub }}>{seance.renfort.drill.consigne}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PillButton variant={seance.faits.includes(seance.renfort.drill.id) ? "secondary" : "primary"}
                  onClick={() => ouvrir({ id: "libre", drill: seance.renfort.drill })}>
                  <Play size={13} strokeWidth={2} /> Ouvrir
                </PillButton>
                <span style={{ flex: 1 }} />
                <PillButton compact onClick={() => basculer(seance.renfort.drill.id)}
                  role="checkbox" aria-checked={seance.faits.includes(seance.renfort.drill.id)}
                  aria-label={`${seance.renfort.drill.label} — ${seance.faits.includes(seance.renfort.drill.id) ? "fait aujourd’hui" : "à faire"}`}
                  style={seance.faits.includes(seance.renfort.drill.id)
                    ? { background: T.brand, color: T.onSolid }
                    : { background: "transparent", color: T.textSub, boxShadow: `inset 0 0 0 1px ${T.border}` }}>
                  {seance.faits.includes(seance.renfort.drill.id) ? <Check size={11} strokeWidth={3} /> : null}
                  {seance.faits.includes(seance.renfort.drill.id) ? "Fait" : "Marquer fait"}
                </PillButton>
              </div>
            </div>
          )}

          {/* Le catalogue complet, sous la séance : un jour où l’on a du temps,
              ou un exercice qu’on veut refaire exprès, ne doivent pas dépendre
              d’un tirage. Les exercices des phases suivantes restent VISIBLES —
              le chemin se voit, il ne se devine pas. */}
          <div style={{ ...CARD, padding: 18 }}>
            <span style={{ ...TYPE.headline, color: T.text }}>Tous les exercices</span>
            <div style={{ ...TYPE.caption, color: T.textMut, margin: "4px 0 10px" }}>
              Ceux des phases suivantes restent ouverts : rien ne t’empêche d’y aller,
              la séance du jour ne te les proposera simplement pas encore.
            </div>
            {DRILLS.map(d => {
              const fait = seance.faits.includes(d.id);
              const devant = d.phase > store.phase;
              const Icone = ICONE_FORME[d.forme] || Mic;
              return (
                <div key={d.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                  borderBottom: `1px solid ${HAIRLINE}`, opacity: devant ? 0.6 : 1,
                }}>
                  <Icone size={13} strokeWidth={1.75} color={T.textMut} />
                  <span style={{ ...TYPE.callout, color: T.text, minWidth: 0, flex: 1 }}>{d.label}</span>
                  <Etiquette>{d.phase === 0 ? "Échauff." : `P${d.phase}`}</Etiquette>
                  <Etiquette tone={T.textMut}>{skillById(d.skill)?.label}</Etiquette>
                  <PillButton compact onClick={() => ouvrir({ id: "libre", drill: d })}>Ouvrir</PillButton>
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
        <VueProgression etats={competences} fautes={fautes} chaine={chaine} phase={phase}
          onNoter={() => setNotation(true)}
          onMonter={() => ecrire(s => withPhase(s, s.phase + 1))} />
      )}

      {vue === "annee" && (
        <VueAnnee store={store} today={today} semaine={semaine} attendue={attendue} phase={phase}
          onDemarrer={() => ecrire(s => withDebut(s, today))}
          onCap={texte => ecrire(s => withCap(s, texte))} />
      )}

      {studio && (
        <Studio drill={studio.drill} matiere={studio.matiere}
          onClose={() => setStudio(null)}
          onFait={() => ecrire(s => withFait(s, today, studio.drill.id))} />
      )}

      {atelier && (
        <Atelier drill={atelier.drill} matiere={atelier.matiere}
          onClose={() => setAtelier(null)} onEnregistrer={enregistrerAtelier} />
      )}

      {simulation && (
        <SimulationJouee simulation={simulation}
          onClose={() => setSimulation(null)}
          onFini={() => {
            ecrire(s => withFait(s, today, `sim:${simulation.id}`));
            setDebrief(true);
          }} />
      )}

      {debrief && (
        <Debrief simulation={seance.temps.find(t => t.id === "simulation")?.simulation || null}
          depart={debriefDuJour}
          onClose={() => setDebrief(false)}
          onValider={({ fautes: f, note, mesures }) => ecrire(s => withFait(
            withDebrief(s, {
              date: today, fautes: f, note, mesures,
              simulationId: seance.temps.find(t => t.id === "simulation")?.simulation?.id || null,
            }), today, "debrief"))} />
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
