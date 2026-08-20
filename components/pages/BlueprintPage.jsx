"use client";

/**
 * BlueprintPage — « Plan de réussite ».
 *
 * Générateur de plan / blueprint pour atteindre un objectif, structuré autour des
 * CINQ CLÉS de la motivation issues de la psychologie du succès (Brian Tracy) :
 *
 *   1. Objectif clair & écrit  — une cible précise, écrite, avec un « pourquoi »
 *      et une échéance. « You have to have a target to aim at. »
 *   2. Mesures & marqueurs     — des jalons pour savoir, à tout instant, où l'on
 *      en est (comme les bornes kilométriques d'un marathon qui gardent le
 *      coureur motivé).
 *   3. Expériences de réussite — des tâches concrètes, avec un début et une fin,
 *      que l'on COCHE. Sans début/fin clairs → découragement.
 *   4. Reconnaissance          — quelqu'un constate le progrès à chaque jalon
 *      (« most world records are set in front of large cheering audiences »).
 *   5. Récompenses             — définies À L'AVANCE, débloquées à chaque jalon
 *      et à l'arrivée. « Determine the reward before you begin working. »
 *
 * Modèle de données (clé cloud `blueprints`) : un tableau de plans. La progression
 * est DÉRIVÉE des tâches cochées (les seules « expériences de réussite »), jamais
 * persistée séparément. Les jalons sont positionnés en pourcentage sur la piste ;
 * un jalon est « atteint » dès que la progression franchit son seuil, ce qui
 * débloque sa reconnaissance et sa récompense.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, X, Trash2, Pencil, Target, Flag, ListChecks, Gift, Users,
  Check, ChevronLeft, ChevronRight, Wand2, Trophy, Route, Calendar, Quote,
} from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useUndo } from "@/lib/contexts/UndoContext";
import { getLocalDateString } from "@/lib/dateUtils";
import { t, useLang } from "@/lib/i18n";
import { T as BaseT } from "@/lib/ui/tokens";
import { Field as DAField, Modal as DAModal, FIELD as DA_FIELD } from "@/components/ui/form";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";

export const BLUEPRINT_STORAGE_KEY = "tr4de_blueprints";
export const BLUEPRINT_CLOUD_KEY = "blueprints";

// `bg` local (#F5F5F5) = fond subtil, mappé sur la var de survol (thème sombre).
// `violet` absent du T partagé → réutilise la var `purple` existante.
const T = { ...BaseT, bg: "var(--color-hover-bg, #F5F5F5)", violet: "var(--color-purple, #CE82FF)" };

// Les cinq clés de la motivation, dans l'ordre du wizard. Chaque entrée porte
// son texte pédagogique (résumé fidèle de la vidéo) affiché en tête d'étape.
const PILLARS = [
  {
    id: "goal", icon: Target, color: T.blue,
    title: "Objectif clair & écrit",
    intro: "Vous devez avoir une cible précise à viser. Écrivez-la, donnez-lui un « pourquoi » et une échéance — sans cible claire, impossible de réussir.",
  },
  {
    id: "markers", icon: Flag, color: T.amber,
    title: "Marqueurs de progrès",
    intro: "Comme les bornes kilométriques d'un marathon : des jalons qui vous disent en permanence où vous en êtes par rapport à la ligne d'arrivée. C'est ce qui maintient la motivation sur la durée.",
  },
  {
    id: "tasks", icon: ListChecks, color: T.green,
    title: "Expériences de réussite",
    intro: "Découpez l'objectif en tâches concrètes, avec un début et une fin nets. Chaque tâche cochée est une petite victoire. Les missions « sans fin » découragent.",
  },
  {
    id: "recognition", icon: Users, color: T.violet,
    title: "Reconnaissance",
    intro: "Quelqu'un doit constater vos progrès. Les records du monde se battent devant une foule : plus on reconnaît votre réussite, plus vous êtes motivé. Qui célébrera chaque jalon ?",
  },
  {
    id: "rewards", icon: Gift, color: T.red,
    title: "Récompenses",
    intro: "Décidez À L'AVANCE de la récompense liée à chaque jalon et à l'objectif final. Savoir ce qui vous attend vous motive jour et nuit jusqu'à l'arrivée.",
  },
];

const CATEGORIES = [
  { id: "perso",    label: "Personnel", color: "#FF4B4B" },
  { id: "trading",  label: "Trading",   color: "#58CC02" },
  { id: "sport",    label: "Sport",     color: "#FF9600" },
  { id: "career",   label: "Carrière",  color: "#64748B" },
  { id: "learning", label: "Apprentissage", color: "#1CB0F6" },
  { id: "health",   label: "Santé",     color: "#7AF0F2" },
  { id: "finance",  label: "Finances",  color: "#059669" },
  { id: "creative", label: "Créatif",   color: "#CE82FF" },
];
const catById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const getCat = (id) => catById[id] || CATEGORIES[0];

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------- Calculs ---------- */
// Progression d'un plan = part des tâches cochées (« expériences de réussite »).
function progressOf(bp) {
  const tasks = Array.isArray(bp.tasks) ? bp.tasks : [];
  if (tasks.length === 0) return { done: 0, total: 0, pct: 0 };
  const done = tasks.filter(t => t.done).length;
  return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100) };
}
function daysLeft(deadline) {
  if (!deadline) return null;
  const today = new Date(getLocalDateString());
  const dl = new Date(deadline);
  if (isNaN(dl.getTime())) return null;
  return Math.round((dl - today) / 86400000);
}
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// Charpente de jalons par défaut (générateur clé 2) : quatre marqueurs réguliers.
function defaultMilestones() {
  return [
    { id: uid(), label: "Premiers pas",          atPct: 25,  recognizedBy: "", reward: "" },
    { id: uid(), label: "À mi-chemin",            atPct: 50,  recognizedBy: "", reward: "" },
    { id: uid(), label: "Dernière ligne droite",  atPct: 75,  recognizedBy: "", reward: "" },
    { id: uid(), label: "Objectif atteint",       atPct: 100, recognizedBy: "", reward: "" },
  ];
}

function emptyDraft() {
  return {
    id: uid(),
    title: "", why: "", deadline: "", category: "perso",
    createdAt: new Date().toISOString(),
    milestones: defaultMilestones(),
    tasks: [],
    finalReward: "",
  };
}

/* ---------- Page ---------- */
export default function BlueprintPage() {
  useLang();
  const [blueprints, setBlueprints] = useCloudState(BLUEPRINT_STORAGE_KEY, BLUEPRINT_CLOUD_KEY, []);
  const { pushUndo } = useUndo();
  const list = useMemo(() => (Array.isArray(blueprints) ? blueprints : []), [blueprints]);

  const [wizard, setWizard] = useState(null);   // brouillon en cours (création/édition)
  const [openId, setOpenId] = useState(null);    // plan ouvert en détail

  const openPlan = list.find(b => b.id === openId) || null;

  const saveDraft = (draft) => {
    setBlueprints(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.some(b => b.id === draft.id)
        ? arr.map(b => (b.id === draft.id ? draft : b))
        : [draft, ...arr];
    });
    setWizard(null);
    setOpenId(draft.id);
  };

  const removePlan = (id) => {
    const snap = list;
    setBlueprints(prev => (Array.isArray(prev) ? prev : []).filter(b => b.id !== id));
    if (openId === id) setOpenId(null);
    pushUndo({
      label: "Suppression du plan",
      undo: async () => setBlueprints(snap),
      redo: async () => setBlueprints(prev => (Array.isArray(prev) ? prev : []).filter(b => b.id !== id)),
    });
  };

  const toggleTask = (planId, taskId) => {
    setBlueprints(prev => (Array.isArray(prev) ? prev : []).map(b => {
      if (b.id !== planId) return b;
      const tasks = (b.tasks || []).map(tk => tk.id === taskId
        ? { ...tk, done: !tk.done, doneAt: !tk.done ? new Date().toISOString() : null }
        : tk);
      return { ...b, tasks };
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-sans)" }} className="anim-1">
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: T.textMut }}>Transformez un objectif en plan motivant, fondé sur les 5 clés de la réussite.</span>
        <button onClick={() => setWizard(emptyDraft())} style={{ ...btnPrimary(), marginLeft: "auto" }}>
          <Plus size={14} strokeWidth={2} /> Nouveau plan
        </button>
      </div>

      {openPlan ? (
        <PlanDetail
          plan={openPlan}
          onBack={() => setOpenId(null)}
          onEdit={() => setWizard({ ...openPlan })}
          onDelete={() => removePlan(openPlan.id)}
          onToggleTask={(taskId) => toggleTask(openPlan.id, taskId)}
        />
      ) : list.length === 0 ? (
        <EmptyState onCreate={() => setWizard(emptyDraft())} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
          {list.map(bp => (
            <PlanCard key={bp.id} bp={bp} onOpen={() => setOpenId(bp.id)} onDelete={() => removePlan(bp.id)} />
          ))}
        </div>
      )}

      {wizard && (
        <Wizard initial={wizard} onSave={saveDraft} onClose={() => setWizard(null)} />
      )}
    </div>
  );
}

/* ---------- État vide ---------- */
function EmptyState({ onCreate }) {
  return (
    <div style={{ border: `1px dashed ${T.border}`, borderRadius: "var(--radius-modal)", padding: "48px 24px", textAlign: "center", background: T.white }}>
      <div style={{ width: 56, height: 56, borderRadius: "var(--radius-modal)", background: T.accentBg, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Route size={26} strokeWidth={1.75} color={T.text} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>{"Aucun plan pour l'instant"}</div>
      <div style={{ fontSize: 13, color: T.textSub, maxWidth: 440, margin: "0 auto 20px", lineHeight: 1.55 }}>
        {"Choisissez un objectif et l'assistant le structure autour des 5 clés de la motivation : cible écrite, marqueurs de progrès, victoires concrètes, reconnaissance et récompenses."}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 24 }}>
        {PILLARS.map(p => (
          <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: p.color, background: `color-mix(in srgb, ${p.color} 7%, transparent)`, border: `1px solid color-mix(in srgb, ${p.color} 20%, transparent)`, borderRadius: 999, padding: "5px 11px" }}>
            <p.icon size={13} strokeWidth={2} /> {p.title}
          </span>
        ))}
      </div>
      <button onClick={onCreate} style={btnPrimary()}><Wand2 size={14} strokeWidth={2} /> Générer mon premier plan</button>
    </div>
  );
}

/* ---------- Carte de plan (vue liste) ---------- */
function PlanCard({ bp, onOpen, onDelete }) {
  const [hover, setHover] = useState(false);
  const { pct, done, total } = progressOf(bp);
  const cat = getCat(bp.category);
  const dl = daysLeft(bp.deadline);
  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: 16, background: T.white, cursor: "pointer", display: "flex", flexDirection: "column", gap: 12, transition: "box-shadow .15s ease", boxShadow: hover ? "var(--elev-hover)" : "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: cat.color }}>{cat.label}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{bp.title || "Objectif sans titre"}</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Supprimer" aria-label="Supprimer le plan"
          style={{ ...iconBtnSm(), opacity: hover ? 1 : 0.5, pointerEvents: "auto", transition: "opacity .15s ease" }}>
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>

      <ProgressTrack pct={pct} milestones={bp.milestones || []} compact />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: T.textMut }}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{done}/{total} étapes · {pct}%</span>
        {dl != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: dl < 0 ? T.red : dl <= 7 ? T.amber : T.textMut, fontWeight: 600 }}>
            <Calendar size={11} strokeWidth={2} />
            {dl < 0 ? `${-dl} j de retard` : dl === 0 ? "Aujourd'hui" : `${dl} j restants`}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- Piste de progression jalonnée (le « marathon ») ---------- */
function ProgressTrack({ pct, milestones, compact = false, onMilestoneClick }) {
  const sorted = [...(milestones || [])].sort((a, b) => a.atPct - b.atPct);
  const h = compact ? 8 : 12;
  return (
    <div style={{ position: "relative", padding: compact ? "6px 0" : "22px 2px 26px" }}>
      <div role="progressbar" aria-valuenow={Math.max(0, Math.min(100, Math.round(pct)))} aria-valuemin={0} aria-valuemax={100} aria-label="Progression du plan"
        style={{ position: "relative", height: h, borderRadius: 999, background: T.accentBg }}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, height: "100%", borderRadius: 999, background: pct >= 100 ? T.green : T.text, transition: "width .5s ease" }} />
        {sorted.map(m => {
          const reached = pct >= m.atPct;
          const size = compact ? 12 : 18;
          return (
            <div key={m.id} title={!compact ? undefined : `${m.label} · ${m.atPct}%`}
              onClick={onMilestoneClick ? (e) => { e.stopPropagation(); onMilestoneClick(m); } : undefined}
              style={{ position: "absolute", left: `${m.atPct}%`, top: "50%", transform: "translate(-50%,-50%)", width: size, height: size, borderRadius: "50%", background: reached ? (m.atPct >= 100 ? T.green : T.text) : T.white, border: `2px solid ${reached ? (m.atPct >= 100 ? T.green : T.text) : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: onMilestoneClick ? "pointer" : "default", zIndex: 2 }}>
              {reached && !compact && (m.atPct >= 100 ? <Trophy size={9} strokeWidth={2.5} color="#fff" /> : <Check size={9} strokeWidth={3} color="#fff" />)}
            </div>
          );
        })}
      </div>
      {!compact && sorted.map(m => (
        <div key={m.id} style={{ position: "absolute", left: `${m.atPct}%`, bottom: 2, transform: m.atPct >= 98 ? "translateX(-100%)" : m.atPct <= 2 ? "translateX(0)" : "translateX(-50%)", fontSize: 10, fontWeight: 600, color: pct >= m.atPct ? T.text : T.textMut, whiteSpace: "nowrap", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
          {m.label}
        </div>
      ))}
    </div>
  );
}

/* ---------- Vue détail d'un plan ---------- */
function PlanDetail({ plan, onBack, onEdit, onDelete, onToggleTask }) {
  const { pct, done, total } = progressOf(plan);
  const cat = getCat(plan.category);
  const dl = daysLeft(plan.deadline);
  const milestones = useMemo(() => [...(plan.milestones || [])].sort((a, b) => a.atPct - b.atPct), [plan.milestones]);
  const tasks = useMemo(() => plan.tasks || [], [plan.tasks]);

  // Tâches regroupées par jalon le plus proche (un découpage visuel par étape).
  const tasksByMilestone = useMemo(() => {
    const map = new Map(milestones.map(m => [m.id, []]));
    const orphans = [];
    for (const tk of tasks) {
      if (tk.milestoneId && map.has(tk.milestoneId)) map.get(tk.milestoneId).push(tk);
      else orphans.push(tk);
    }
    return { map, orphans };
  }, [tasks, milestones]);

  const nextMilestone = milestones.find(m => pct < m.atPct);
  const reachedFinal = pct >= 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Barre d'actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} aria-label="Retour aux plans" style={iconBtnSm()}><ChevronLeft size={16} strokeWidth={2} /></button>
        <span style={{ fontSize: 12, color: T.textSub }}>Retour aux plans</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <button onClick={onEdit} style={btnGhost()}><Pencil size={13} strokeWidth={1.75} /> Modifier</button>
          <button onClick={onDelete} style={btnGhost()}><Trash2 size={13} strokeWidth={1.75} /> Supprimer</button>
        </div>
      </div>

      {/* Bandeau objectif (clé 1) */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, background: T.white, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: cat.color }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: cat.color }}>{cat.label}</span>
              {plan.deadline && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: dl != null && dl < 0 ? T.red : T.textMut, marginLeft: 8 }}>
                  <Calendar size={12} strokeWidth={2} /> {fmtDate(plan.deadline)}
                  {dl != null && <span style={{ fontWeight: 600 }}>· {dl < 0 ? `${-dl} j de retard` : dl === 0 ? "aujourd'hui" : `${dl} j`}</span>}
                </span>
              )}
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0, letterSpacing: -0.3, lineHeight: 1.25 }}>{plan.title || "Objectif sans titre"}</h2>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: reachedFinal ? T.green : T.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
            <div style={{ fontSize: 11, color: T.textMut }}>{done}/{total} étapes</div>
          </div>
        </div>

        {plan.why && (
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-card)", background: `color-mix(in srgb, ${cat.color} 4%, transparent)`, border: `1px solid color-mix(in srgb, ${cat.color} 12%, transparent)` }}>
            <Quote size={16} strokeWidth={2} color={cat.color} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: T.textSub, fontStyle: "italic", lineHeight: 1.5 }}>{plan.why}</div>
          </div>
        )}

        {/* Piste marathon (clé 2) */}
        <ProgressTrack pct={pct} milestones={milestones} />

        {/* Prochain marqueur / arrivée */}
        {reachedFinal ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-card)", background: T.greenBg, border: `1px solid ${T.greenBd}` }}>
            <Trophy size={18} strokeWidth={2} color={T.green} />
            <div style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>
              Objectif atteint — vous êtes un vrai gagnant !{plan.finalReward ? ` Récompense : ${plan.finalReward}.` : ""}
            </div>
          </div>
        ) : nextMilestone && (
          <div style={{ fontSize: 12, color: T.textSub }}>
            Prochain marqueur : <strong style={{ color: T.text }}>{nextMilestone.label}</strong> à {nextMilestone.atPct}%
            {nextMilestone.reward ? <> — récompense : <strong style={{ color: T.text }}>{nextMilestone.reward}</strong></> : null}
          </div>
        )}
      </div>

      {/* Étapes de réussite (clé 3) groupées par jalon */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, background: T.white, overflow: "hidden" }}>
        <SectionHeader icon={ListChecks} color={T.green} title="Étapes de réussite" subtitle="Cochez chaque victoire pour avancer sur la piste" />
        <div style={{ padding: "4px 16px 14px" }}>
          {tasks.length === 0 ? (
            <div style={{ fontSize: 13, color: T.textMut, padding: "16px 0" }}>Aucune étape. Modifiez le plan pour en ajouter.</div>
          ) : (
            <>
              {milestones.map(m => {
                const items = tasksByMilestone.map.get(m.id) || [];
                if (items.length === 0) return null;
                return (
                  <MilestoneGroup key={m.id} milestone={m} items={items} reached={pct >= m.atPct} onToggle={onToggleTask} />
                );
              })}
              {tasksByMilestone.orphans.length > 0 && (
                <MilestoneGroup milestone={null} items={tasksByMilestone.orphans} reached={false} onToggle={onToggleTask} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Reconnaissance & récompenses par jalon (clés 4 & 5) */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, background: T.white, overflow: "hidden" }}>
        <SectionHeader icon={Gift} color={T.red} title="Reconnaissance & récompenses" subtitle="Ce qui vous attend à chaque marqueur" />
        <div style={{ padding: "4px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {milestones.map(m => {
            const reached = pct >= m.atPct;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: reached ? T.greenBg : T.bg, border: `1px solid ${reached ? T.greenBd : T.border}` }}>
                <div style={{ width: 30, height: 30, borderRadius: "var(--radius-card)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: reached ? T.green : T.white, border: `1px solid ${reached ? T.green : T.border}`, color: reached ? "#fff" : T.textMut, fontSize: 11, fontWeight: 700 }}>
                  {reached ? <Check size={14} strokeWidth={3} /> : `${m.atPct}%`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{m.label}</div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 2 }}>
                    {m.reward ? <span style={{ fontSize: 11, color: T.textSub, display: "inline-flex", alignItems: "center", gap: 4 }}><Gift size={11} strokeWidth={2} color={T.red} /> {m.reward}</span> : null}
                    {m.recognizedBy ? <span style={{ fontSize: 11, color: T.textSub, display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={11} strokeWidth={2} color={T.violet} /> {m.recognizedBy}</span> : null}
                    {!m.reward && !m.recognizedBy && <span style={{ fontSize: 11, color: T.textMut, fontStyle: "italic" }}>Aucune récompense ni reconnaissance définie</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {plan.finalReward && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", borderRadius: 10, background: T.amberBg, border: `1px solid color-mix(in srgb, ${T.amber} 35%, transparent)` }}>
              <Trophy size={18} strokeWidth={2} color={T.amber} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: T.amber }}>Récompense finale</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{plan.finalReward}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MilestoneGroup({ milestone, items, reached, onToggle }) {
  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Flag size={12} strokeWidth={2} color={reached ? T.green : T.textMut} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: reached ? T.green : T.textMut }}>
          {milestone ? `${milestone.label} · ${milestone.atPct}%` : "Autres étapes"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((tk, i) => (
          <button key={tk.id} onClick={() => onToggle(tk.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderBottom: i < items.length - 1 ? `1px solid ${T.border}` : "none" }}>
            <span style={{ width: 16, height: 16, borderRadius: "var(--radius-field)", flexShrink: 0, border: `1.5px solid ${tk.done ? T.green : T.border}`, background: tk.done ? T.green : T.white, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {tk.done && <Check size={11} strokeWidth={3} />}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: tk.done ? T.textMut : T.text, textDecoration: tk.done ? "line-through" : "none" }}>{tk.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, color, title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 8px" }}>
      <div style={{ width: 30, height: 30, borderRadius: "var(--radius-card)", background: `color-mix(in srgb, ${color} 8%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} strokeWidth={2} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: T.textMut }}>{subtitle}</div>}
      </div>
    </div>
  );
}

/* ---------- Assistant de création (wizard 5 étapes) ---------- */
function Wizard({ initial, onSave, onClose }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initial);
  const set = (patch) => setDraft(d => ({ ...d, ...patch }));

  const pillar = PILLARS[step];
  const canNext = step > 0 || (draft.title || "").trim().length > 0;
  const isLast = step === PILLARS.length - 1;

  const next = () => (isLast ? onSave(normalizeDraft(draft)) : setStep(s => s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  // Helpers d'édition des jalons / tâches du brouillon.
  const setMilestones = (fn) => set({ milestones: fn([...(draft.milestones || [])]) });
  const setTasks = (fn) => set({ tasks: fn([...(draft.tasks || [])]) });

  return (
    <Modal onClose={onClose} maxWidth={640}>
      {/* Fil d'étapes */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px", marginBottom: 18 }}>
        {PILLARS.map((p, i) => (
          <React.Fragment key={p.id}>
            <button onClick={() => i < step && setStep(i)} disabled={i > step}
              title={p.title}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", flexShrink: 0, border: `2px solid ${i <= step ? p.color : T.border}`, background: i < step ? p.color : i === step ? `color-mix(in srgb, ${p.color} 9%, transparent)` : T.white, color: i < step ? "#fff" : i === step ? p.color : T.textMut, cursor: i < step ? "pointer" : "default", padding: 0 }}>
              {i < step ? <Check size={14} strokeWidth={3} /> : <p.icon size={14} strokeWidth={2} />}
            </button>
            {i < PILLARS.length - 1 && <div style={{ flex: 1, height: 2, borderRadius: "var(--radius-field)", background: i < step ? p.color : T.border }} />}
          </React.Fragment>
        ))}
      </div>

      {/* Intro pédagogique de l'étape */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: pillar.color, letterSpacing: 0.4 }}>CLÉ {step + 1}/5</span>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>{pillar.title}</h3>
      </div>
      <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.55, margin: "0 0 16px" }}>{pillar.intro}</p>

      {/* Corps de l'étape */}
      <div style={{ minHeight: 220 }}>
        {step === 0 && <StepGoal draft={draft} set={set} />}
        {step === 1 && <StepMarkers draft={draft} setMilestones={setMilestones} />}
        {step === 2 && <StepTasks draft={draft} setTasks={setTasks} />}
        {step === 3 && <StepRecognition draft={draft} setMilestones={setMilestones} />}
        {step === 4 && <StepRewards draft={draft} setMilestones={setMilestones} set={set} />}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
        <button onClick={onClose} style={btnGhost()}>Annuler</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {step > 0 && <button onClick={back} style={btnGhost()}><ChevronLeft size={14} strokeWidth={2} /> Précédent</button>}
          <button onClick={next} disabled={!canNext} style={{ ...btnPrimary(), opacity: canNext ? 1 : 0.5, cursor: canNext ? "pointer" : "not-allowed" }}>
            {isLast ? <><Check size={14} strokeWidth={2.5} /> Créer le plan</> : <>Suivant <ChevronRight size={14} strokeWidth={2} /></>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Nettoie le brouillon avant sauvegarde : retire les jalons/tâches vides, trie.
function normalizeDraft(d) {
  const milestones = (d.milestones || [])
    .filter(m => (m.label || "").trim())
    .map(m => ({ ...m, label: m.label.trim(), atPct: Math.min(100, Math.max(1, parseInt(m.atPct, 10) || 0)) }))
    .sort((a, b) => a.atPct - b.atPct);
  const tasks = (d.tasks || []).filter(tk => (tk.label || "").trim()).map(tk => ({ ...tk, label: tk.label.trim() }));
  return { ...d, title: (d.title || "").trim(), milestones, tasks };
}

/* --- Étape 1 : objectif --- */
function StepGoal({ draft, set }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Quel est votre objectif ?">
        <input autoFocus value={draft.title} onChange={e => set({ title: e.target.value })}
          placeholder="Ex. Courir un semi-marathon en moins de 2 h" style={inputStyle()} />
      </Field>
      <Field label="Pourquoi est-ce important pour vous ?" hint="Votre « pourquoi » vous motivera dans les moments difficiles.">
        <textarea value={draft.why} onChange={e => set({ why: e.target.value })} rows={3}
          placeholder="Ex. Prouver que je peux tenir un engagement long et me sentir en pleine forme." style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.5 }} />
      </Field>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Field label="Échéance" style={{ flex: 1, minWidth: 160 }}>
          <input type="date" value={draft.deadline || ""} onChange={e => set({ deadline: e.target.value })} style={inputStyle()} />
        </Field>
        <Field label="Catégorie" style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => set({ category: c.id })}
                style={{ fontSize: 13, fontWeight: 500, padding: "8px 16px", minHeight: 34, borderRadius: 999, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${draft.category === c.id ? c.color : T.border}`, background: draft.category === c.id ? `color-mix(in srgb, ${c.color} 8%, transparent)` : T.white, color: draft.category === c.id ? c.color : T.textSub }}>
                {c.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

/* --- Étape 2 : marqueurs / jalons --- */
function StepMarkers({ draft, setMilestones }) {
  const milestones = [...(draft.milestones || [])].sort((a, b) => a.atPct - b.atPct);
  const add = () => setMilestones(ms => [...ms, { id: uid(), label: "Nouveau marqueur", atPct: 50, recognizedBy: "", reward: "" }]);
  const patch = (id, p) => setMilestones(ms => ms.map(m => (m.id === id ? { ...m, ...p } : m)));
  const remove = (id) => setMilestones(ms => ms.filter(m => m.id !== id));
  const reset = () => setMilestones(() => defaultMilestones());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={reset} style={btnSoft()}><Wand2 size={13} strokeWidth={2} /> Charpente 25 · 50 · 75 · 100 %</button>
        <button onClick={add} style={btnGhost()}><Plus size={13} strokeWidth={2} /> Ajouter</button>
      </div>
      {milestones.map(m => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: T.bg, border: `1px solid ${T.border}` }}>
          <Flag size={14} strokeWidth={2} color={T.amber} style={{ flexShrink: 0 }} />
          <input value={m.label} onChange={e => patch(m.id, { label: e.target.value })} placeholder="Nom du marqueur" style={{ ...inputStyle(), flex: 1, padding: "6px 9px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <input type="number" min={1} max={100} value={m.atPct} onChange={e => patch(m.id, { atPct: e.target.value === "" ? "" : Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) })} style={{ ...inputStyle(), width: 64, padding: "6px 8px", textAlign: "right" }} />
            <span style={{ fontSize: 12, color: T.textMut }}>%</span>
          </div>
          <button onClick={() => remove(m.id)} aria-label="Retirer le marqueur" style={iconBtnSm()}><X size={13} strokeWidth={2} /></button>
        </div>
      ))}
      {milestones.length === 0 && <div style={{ fontSize: 12, color: T.textMut, padding: "8px 0" }}>Ajoutez au moins un marqueur pour suivre votre progression.</div>}
    </div>
  );
}

/* --- Étape 3 : tâches / expériences de réussite --- */
function StepTasks({ draft, setTasks }) {
  const [val, setVal] = useState("");
  const milestones = [...(draft.milestones || [])].sort((a, b) => a.atPct - b.atPct);
  const tasks = draft.tasks || [];
  const add = () => {
    const label = val.trim();
    if (!label) return;
    setTasks(ts => [...ts, { id: uid(), label, milestoneId: milestones[0]?.id || null, done: false, doneAt: null }]);
    setVal("");
  };
  const patch = (id, p) => setTasks(ts => ts.map(tk => (tk.id === id ? { ...tk, ...p } : tk)));
  const remove = (id) => setTasks(ts => ts.filter(tk => tk.id !== id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Ajouter une étape concrète (ex. M'inscrire à la course)" style={{ ...inputStyle(), flex: 1 }} />
        <button onClick={add} style={btnPrimary()}><Plus size={14} strokeWidth={2} /> Ajouter</button>
      </div>
      {tasks.length === 0 ? (
        <div style={{ fontSize: 12, color: T.textMut, padding: "8px 0" }}>Listez les actions concrètes — chacune deviendra une victoire à cocher.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
          {tasks.map(tk => (
            <div key={tk.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, background: T.bg, border: `1px solid ${T.border}` }}>
              <ListChecks size={14} strokeWidth={2} color={T.green} style={{ flexShrink: 0 }} />
              <input value={tk.label} onChange={e => patch(tk.id, { label: e.target.value })} style={{ ...inputStyle(), flex: 1, padding: "6px 9px" }} />
              {milestones.length > 0 && (
                <select value={tk.milestoneId || ""} onChange={e => patch(tk.id, { milestoneId: e.target.value || null })}
                  style={{ ...inputStyle(), width: 150, padding: "6px 8px", flexShrink: 0, cursor: "pointer" }}>
                  <option value="">— Sans marqueur</option>
                  {milestones.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              )}
              <button onClick={() => remove(tk.id)} aria-label="Retirer l'étape" style={iconBtnSm()}><X size={13} strokeWidth={2} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Étape 4 : reconnaissance --- */
function StepRecognition({ draft, setMilestones }) {
  const milestones = [...(draft.milestones || [])].sort((a, b) => a.atPct - b.atPct);
  const patch = (id, p) => setMilestones(ms => ms.map(m => (m.id === id ? { ...m, ...p } : m)));
  if (milestones.length === 0) return <div style={{ fontSize: 12, color: T.textMut }}>{"Revenez à l'étape « Marqueurs » pour définir vos jalons."}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {milestones.map(m => (
        <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 10, background: T.bg, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.violet, fontVariantNumeric: "tabular-nums" }}>{m.atPct}%</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{m.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={14} strokeWidth={2} color={T.violet} style={{ flexShrink: 0 }} />
            <input value={m.recognizedBy} onChange={e => patch(m.id, { recognizedBy: e.target.value })}
              placeholder="Qui reconnaîtra ce progrès ? (ex. partager à un proche, publier, en parler à mon coach)" style={{ ...inputStyle(), flex: 1, padding: "7px 9px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* --- Étape 5 : récompenses --- */
function StepRewards({ draft, setMilestones, set }) {
  const milestones = [...(draft.milestones || [])].sort((a, b) => a.atPct - b.atPct);
  const patch = (id, p) => setMilestones(ms => ms.map(m => (m.id === id ? { ...m, ...p } : m)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {milestones.map(m => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: T.bg, border: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.red, fontVariantNumeric: "tabular-nums", width: 36, flexShrink: 0 }}>{m.atPct}%</span>
          <Gift size={14} strokeWidth={2} color={T.red} style={{ flexShrink: 0 }} />
          <input value={m.reward} onChange={e => patch(m.id, { reward: e.target.value })}
            placeholder={`Récompense pour « ${m.label} »`} style={{ ...inputStyle(), flex: 1, padding: "7px 9px" }} />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px", borderRadius: 10, background: T.amberBg, border: `1px solid color-mix(in srgb, ${T.amber} 35%, transparent)`, marginTop: 4 }}>
        <Trophy size={16} strokeWidth={2} color={T.amber} style={{ flexShrink: 0 }} />
        <input value={draft.finalReward} onChange={e => set({ finalReward: e.target.value })}
          placeholder="Grande récompense à l'arrivée (ex. un week-end, un achat que je m'offre)" style={{ ...inputStyle(), flex: 1, padding: "7px 9px", background: DA_FIELD_BG }} />
      </div>
    </div>
  );
}

/* ---------- Primitives UI ---------- */
function Field({ label, hint, children, style }) {
  /* Delegue a la brique commune (components/ui/form.jsx) : le site comptait
     quatorze definitions locales de champ, chacune avec sa taille de libelle,
     sa hauteur et son rayon. Le style vit la-bas, une seule fois. */
  return <DAField label={label} hint={hint} style={style}>{children}</DAField>;
}

/**
 * Assistant de création de plan : délègue à la modale de la DA.
 *
 * Le blocage du défilement du fond a été retiré avec la coque locale : le corps
 * de la modale défile de lui-même, et geler `document.body` faisait sauter la
 * page d'un cran à chaque ouverture (la barre de défilement disparaît, la
 * largeur utile change).
 */
function Modal({ children, onClose, maxWidth = 600 }) {
  return (
    <DAModal title="Assistant de création de plan" onClose={onClose} width={maxWidth} bodyStyle={{ padding: 22 }}>
      {children}
    </DAModal>
  );
}

/* Delegue a la brique commune (components/ui/form.jsx) : aplat en pilule. */
function inputStyle() {
  return { ...DA_FIELD };
}
function btnPrimary() {
  return { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: T.text, color: T.white, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
}
function btnGhost() {
  return { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: DA_FIELD_BG, color: T.textSub, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
}
function btnSoft() {
  return { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: T.accentBg, color: T.text, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
}
function iconBtnSm() {
  return { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", border: "none", background: DA_FIELD_BG, color: T.textMut, cursor: "pointer", flexShrink: 0, padding: 0 };
}
