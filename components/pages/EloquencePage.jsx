"use client";

/* ════════════════════════════════════════════════════════════════════════════
   Page « Éloquence » — trois temps d'entraînement, quatre repères.

   Organisation : les six onglets d'avant (Lecture · Discours libre · Sujets ·
   Diction · Structure · Défis) mélangeaient un exercice, un tiroir de sujets, un
   aide-mémoire et un catalogue qui rejouait les deux premiers sous un autre nom.
   Il en reste trois, dans l'ordre où on les enchaîne :

     1. Articulation — la mécanique, à la répétition : T·D·B·P, virelangues,
        échauffement. Des compteurs, pas des notes.
     2. Lecture      — le texte d'un autre, avec une intention : lente et
        exagérée, théâtrale, ou imitation d'un modèle.
     3. Parole       — ses propres mots, sous contrainte : sujet, cadre, format.

   Au-dessus des trois, les MÊMES quatre repères, mesurés sur chaque prise :
   débit 110–130, vrais silences, pas de bruit parasite, fins de phrase qui
   descendent. C'est le fil de la page — le score IA vient après, pas avant.
   ════════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic, Square, Volume2, Loader2, Check, ChevronRight, Sparkles, RefreshCw,
  Lightbulb, Video, VideoOff, Clock, Ban, Eye, RotateCcw,
  AlertTriangle, Minus,
} from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { SkeletonScreen, SkeletonCard, SkeletonStats, SkeletonList, Skeleton } from "@/components/ui/Skeleton";
import { useAudioRecorder } from "@/lib/hooks/useAudioRecorder";
import { useEloquenceAudio } from "@/lib/hooks/useEloquenceAudio";
import { decodeAudioBlob, analyzeAudioBuffer, deriveAudioScores, encodeWav } from "@/lib/eloquenceAudioAnalysis";
import {
  ELOQ_STORAGE_KEY, ELOQ_CLOUD_KEY, LEVELS, SCORE_AXES, FIDELITY_AXIS, AUDIO_AXES,
  READING_TEXTS, TONGUE_TWISTERS, WARMUPS, TOPIC_THEMES, STRUCTURE_FRAMEWORKS, FRAMEWORK_BY_ID,
  CONSONANT_DRILLS, CONSONANT_REPS, CONSONANT_DRILL_INSTRUCTION, TWISTER_REPS, TWISTER_SERIES,
  READING_INTENTIONS, SPEAKING_FORMATS,
  SPEECH_RULES, buildCoachChecks, coachChecksScore,
  EXERCISE_MODES, countWords, countFillers, countWordOccurrences, computeWpm, describeWpm, overallScore,
  getTopicsFromBank, pickRandomTopic, todayKey, buildDailyAggregate, migrateEloquenceStore,
} from "@/lib/eloquenceData";
import { T } from "@/lib/ui/tokens";
import { CARD, MiniKpi, PeriodPills, FIELD_BG, HAIRLINE, FIELD as DA_FIELD, FIELD_AREA as DA_FIELD_AREA } from "@/components/ui/da";

/* ─────────────── Helpers génériques ─────────────── */
// Couleur d'un score 0–100.
function scoreColor(v) {
  if (v == null) return T.textMut;
  if (v >= 80) return T.green;
  if (v >= 65) return T.blue;
  if (v >= 50) return T.amber;
  return T.red;
}
// Couleur du verdict d'un repère.
function statusColor(status) {
  return { ok: T.green, warn: T.amber, bad: T.red }[status] || T.textMut;
}
// Format mm:ss.
function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
// Format d'une durée en secondes → « 1 min » / « 30 s ».
function fmtDuration(s) {
  return s >= 60 ? `${s % 60 === 0 ? s / 60 : (s / 60).toFixed(1)} min` : `${s} s`;
}
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
// Identifiant unique côté client.
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* Styles partagés : carte sans bordure posée sur l'ombre douce `elevCard`,
   boutons à la métrique 12 px / Medium des autres pages, et aucune couleur en
   dur — `#fff` sur un aplat `T.text` devient invisible en thème sombre. */
const card = { ...CARD, padding: 20, boxSizing: "border-box" };
const SURFACE = FIELD_BG;
const pill = (active) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 16px", minHeight: 34, borderRadius: 999, cursor: "pointer", border: "none",
  background: active ? T.text : FIELD_BG, color: active ? T.textInverted : T.text,
  fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  transition: "background 120ms ease, color 120ms ease",
});
const ghost = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: `1px solid ${T.border}`, background: T.white, color: T.text,
  fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  transition: "opacity 120ms ease",
});
const primary = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: "none", background: T.text, color: T.textInverted,
  fontSize: 12, fontWeight: 500, fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
  transition: "opacity 120ms ease",
});
/* Champ de la page : l'aplat de la DA, en 15 px. La taille est plus grande
   qu'ailleurs parce qu'on relit ce qu'on vient d'écrire à voix haute — un sujet
   de discours ou un texte à dire se lisent en levant les yeux, pas en se
   penchant sur l'écran. */
const field = { ...DA_FIELD, fontSize: 14 };
/* Zone d'écriture : même taille, aplat plus dilué et rayon de zone. */
const writing = { ...DA_FIELD_AREA, fontSize: 14 };
const lead = { fontSize: 14, color: T.textSub, lineHeight: 1.5, margin: 0 };
const sectionTitle = { fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 };
const metricBox = { flex: 1, minWidth: 120, borderRadius: 8, padding: "10px 12px", background: SURFACE };
const metricLabel = { fontSize: 11, color: T.text, opacity: 0.5, fontWeight: 500 };
const metricVal = { fontSize: 16, fontWeight: 600, color: T.text, marginTop: 2, fontVariantNumeric: "tabular-nums" };
/* Carte sélectionnable (texte, virelangue, format…). Plate, posée sur le fond de
   champ plutôt qu'en relief : la page en aligne parfois une dizaine à la suite, et
   dix cartes qui flottent chacune sur leur ombre font un damier que l'œil ne trie
   plus. L'état actif est un liseré d'encre en `boxShadow` plutôt qu'une bordure,
   qui décalerait le contenu. */
/* Voile d'une couleur. `color-mix` avec du transparent laisse le fond de la page
   transparaître : le même pourcentage tient donc en clair comme en sombre, là où
   un aplat figé serait blanchâtre dans l'un des deux. */
const veil = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
/* `tone` : la couleur propre de la carte, pour les rangées où chaque choix est
   d'une nature différente (intentions de lecture, formats de parole, cadres de
   discours). Sans `tone`, la carte reste neutre — c'est le cas des catalogues
   où toutes les cartes disent la même chose (virelangues, textes) : les teinter
   toutes de la même couleur ne distingue rien et sature la page. Dans les deux
   cas, la sélection reste le vert de marque. */
const selectable = (active, tone) => {
  const c = tone || T.brand;
  return {
    textAlign: "left", cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box",
    border: "none", borderRadius: 12, padding: 14,
    background: active ? veil(c, 22) : tone ? veil(c, 8) : SURFACE,
    boxShadow: active ? `inset 0 0 0 1.5px ${c}` : "none",
    transition: "background 120ms ease, box-shadow 120ms ease",
  };
};
/* Une couleur par carte quand plusieurs se suivent sur une ligne (intentions de
   lecture, formats de parole) : six tuiles grises de même taille ne se
   distinguent que par leur texte, donc on les lit toutes avant de choisir. */
const TONE_CYCLE = [T.blue, T.purple, T.amber, T.green, T.cyan, T.red];
const cycleTone = (i) => TONE_CYCLE[i % TONE_CYCLE.length];
// Filet de séparation entre deux blocs d'un même onglet : moins bruyant qu'une
// carte de plus, et suffisant pour dire « autre exercice ».
const divider = { height: 1, background: HAIRLINE, border: "none", margin: 0 };

/* ─────────────── La couleur comme clé de lecture ───────────────
   Une teinte par repère, tenue d'un bout à l'autre de la page : le débit est
   bleu dans la barre de consignes comme dans le verdict d'une prise, les
   silences sont violets partout. La couleur dit de quoi on parle — elle n'est
   décorative nulle part, sinon elle redevient du bruit.
   Les fonds passent par les tokens `*Bg`, qui ont leur valeur sombre. */
const RULE_TONES = {
  pace:     { fg: T.blue,   bg: T.blueBg },
  silences: { fg: T.purple, bg: T.purpleBg },
  noise:    { fg: T.amber,  bg: T.amberBg },
  endings:  { fg: T.green,  bg: T.greenBg },
};
const ruleTone = (id) => RULE_TONES[id] || { fg: T.textSub, bg: SURFACE };
// Les deux séries de virelangue : l'une pousse la vitesse, l'autre la netteté.
const SERIE_TONES = {
  accelerate: { fg: T.amber, bg: T.amberBg },
  articulate: { fg: T.blue,  bg: T.blueBg },
};
// Fond teinté d'un verdict, pour que le statut se voie avant d'être lu.
const statusBg = (status) => ({ ok: T.greenBg, warn: T.amberBg, bad: T.redBg }[status] || SURFACE);
/* Cible chiffrée d'un exercice, en pastille teintée : c'est la seule ligne de la
   consigne qu'on relit en cours de route, elle ne doit pas se perdre dans le
   gris du paragraphe. Bleu quand elle parle de débit — la couleur du repère. */
const targetChip = (tone) => ({
  display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
  fontSize: 13, fontWeight: 600, color: tone.fg, background: tone.bg,
  borderRadius: 999, padding: "6px 12px",
});

/* Titre de bloc précédé de sa pastille de couleur : c'est ce qui donne à
   l'onglet son rythme, et ce qui rattache chaque exercice à sa teinte. */
function BlockTitle({ color, children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0, alignSelf: "center" }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{children}</span>
      </span>
      {right}
    </div>
  );
}

/* ─────────────── Synthèse vocale (modèle à écouter) ─────────────── */
function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const speak = (text, rate = 0.95) => {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = rate;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    } catch { setSpeaking(false); }
  };
  const stop = () => {
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  };
  // Coupe la synthèse au démontage.
  useEffect(() => () => { try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch {} }, []);
  const supported = typeof window !== "undefined" && !!window.speechSynthesis;
  return { speaking, speak, stop, supported };
}

/* Bouton « Écouter le modèle ». `rate` permet d'entendre le texte au tempo de
   l'exercice — une lecture lente ne s'écoute pas à la vitesse normale. */
function ListenButton({ text, rate = 0.95, label = "Écouter le modèle" }) {
  const { speaking, speak, stop, supported } = useSpeech();
  if (!supported || !text) return null;
  return (
    <button type="button" style={ghost(false)} onClick={() => (speaking ? stop() : speak(text, rate))}>
      {speaking ? <Square size={15} /> : <Volume2 size={15} />}
      {speaking ? "Arrêter" : label}
    </button>
  );
}

/* Écoute réelle par le modèle audio (best effort).
 * Réencode l'AudioBuffer en WAV 16 kHz mono puis l'envoie à la route `voice`.
 * Renvoie null en cas d'indisponibilité (modèle absent, réseau) sans jamais lever. */
async function runVoiceAnalysis(audioBuffer, mode, topic) {
  try {
    const wav = encodeWav(audioBuffer, 16000);
    if (!wav) return null;
    const fd = new FormData();
    fd.append("audio", wav, "speech.wav");
    if (mode) fd.append("mode", mode);
    if (topic) fd.append("topic", topic);
    const r = await fetch("/api/ai/eloquence/voice", { method: "POST", body: fd });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════
   LES QUATRE REPÈRES
   ═══════════════════════════════════════════════════════════ */

/* Rappel des consignes, affiché en permanence sous l'en-tête. Ce n'est pas de la
   décoration : ce sont exactement les quatre critères mesurés sur chaque prise,
   donc les lire avant de parler suffit à savoir ce qui sera jugé.

   Deux lignes par repère au lieu de trois : le « pourquoi » se lit une fois, pas
   à chaque visite — il passe en infobulle et rend la barre deux fois plus
   courte, ce qui laisse l'exercice arriver plus haut dans l'écran.

   Une seule carte blanche à quatre colonnes, sans teinte : c'est la consigne
   permanente, elle est là à chaque visite et n'a pas à réclamer l'attention. La
   couleur des repères reste là où elle informe — le verdict d'une prise et le
   suivi « repères tenus ». */
function SpeechRulesBar() {
  return (
    <div style={{ ...card, padding: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
      {SPEECH_RULES.map((r) => (
        <div key={r.id} title={r.why} style={{ flex: "1 1 190px", minWidth: 180, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 11, color: T.text, opacity: 0.5, fontWeight: 500 }}>{r.label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{r.rule}</div>
        </div>
      ))}
    </div>
  );
}

// Verdict d'un repère après une prise. Le fond suit le statut : vert tenu,
// orange limite, rouge raté — l'ensemble se lit d'un coup d'œil, avant lecture.
function CheckTile({ check }) {
  const color = statusColor(check.status);
  const Icon = check.status === "ok" ? Check : check.status === "bad" ? AlertTriangle : check.status === "warn" ? Minus : Clock;
  return (
    <div style={{ flex: "1 1 200px", minWidth: 180, borderRadius: 12, padding: "12px 14px", background: statusBg(check.status), display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{check.label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{check.value}</div>
      <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.4 }}>{check.detail}</div>
    </div>
  );
}

function CoachChecks({ checks }) {
  if (!checks || checks.length === 0) return null;
  const score = coachChecksScore(checks);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={sectionTitle}>Les quatre repères</div>
        {score != null && (
          <span style={{ fontSize: 13, fontWeight: 600, color: scoreColor(score), fontVariantNumeric: "tabular-nums" }}>
            {score} / 100
          </span>
        )}
        <span style={{ fontSize: 11, color: T.textMut }}>mesurés sur ton enregistrement, sans IA</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {checks.map((c) => <CheckTile key={c.id} check={c} />)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ENREGISTREMENT + ANALYSE
   ═══════════════════════════════════════════════════════════ */

// Miroir : la webcam retournée, sans enregistrement ni envoi. Affiché pendant la
// prise pour ceux qui veulent aussi travailler le regard et le visage.
function MirrorView() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices) throw new Error("no-media");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setErr("Caméra indisponible — fais l'exercice devant un vrai miroir.");
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  if (err) return <div style={{ fontSize: 12, color: T.textMut, textAlign: "center" }}>{err}</div>;
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 420, aspectRatio: "4 / 3", borderRadius: 12, overflow: "hidden", background: T.scrim }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
      <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", color: T.onSolid, fontSize: 12, textShadow: "0 1px 3px rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Eye size={13} /> Regarde tes yeux, uniquement.
      </div>
    </div>
  );
}

/* VU-mètre : le niveau d'entrée du micro pendant la prise. Il sert au repère
   « bruits parasites » — on voit tout de suite un souffle qui sature ou un fond
   qui ne redescend jamais entre deux phrases. */
function LevelMeter({ level, recording }) {
  const pct = Math.min(100, Math.round(Math.sqrt(Math.max(0, level)) * 140));
  const hot = pct > 92;
  return (
    <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ height: 6, borderRadius: 999, background: HAIRLINE, overflow: "hidden" }}>
        <div style={{
          width: `${recording ? pct : 0}%`, height: "100%", borderRadius: 999,
          background: hot ? T.red : T.green, transition: "width 100ms linear, background 150ms ease",
        }} />
      </div>
      <div style={{ fontSize: 11, color: hot ? T.red : T.textMut, textAlign: "center" }}>
        {hot ? "Trop fort — éloigne-toi du micro." : recording ? "Niveau du micro" : "Le niveau s'affiche pendant la prise."}
      </div>
    </div>
  );
}

/* Panneau d'enregistrement : capture, transcription, mesures acoustiques,
 * analyse IA du texte et écoute par le modèle audio.
 *
 * `mode` est la GRILLE D'ANALYSE demandée à l'IA ("reading" | "diction" |
 * "freeSpeech" | "structure"), pas l'onglet : un virelangue est un exercice
 * d'articulation pour la page, mais s'analyse comme de la diction, et une prise
 * de parole avec cadre s'analyse comme de la structure. Les trois onglets, eux,
 * ne servent qu'au rangement et au suivi (`EXERCISE_MODES`).
 *
 * `paceTarget` porte la cible de débit de l'exercice : les quatre repères et
 * l'IA jugent sur CETTE fourchette, pas sur celle de la conversation. */
function RecorderPanel({ mode, referenceText, topic, framework, drillGoal, paceTarget, mirror, onResult }) {
  const { recording, durationSec, level, error, supported, start, stop, reset } = useAudioRecorder();
  const { uploadAudio } = useEloquenceAudio();
  const [phase, setPhase] = useState("idle"); // idle | analyzing | error
  const [netError, setNetError] = useState(null);

  const handleStart = async () => {
    setNetError(null);
    try { await start(); } catch { setNetError("Impossible d'accéder au micro."); }
  };

  const handleStop = async () => {
    let blob = null;
    try { blob = await stop(); } catch { /* ignore */ }
    if (!blob) { setNetError("Aucun enregistrement capté. Réessaie."); return; }
    await analyze(blob);
  };

  const analyze = async (blob) => {
    setPhase("analyzing");
    setNetError(null);
    try {
      // Décodage audio unique (best effort) : sert aux mesures acoustiques ET au
      // WAV envoyé au modèle audio. Lancé en parallèle de la transcription.
      const audioBufferP = decodeAudioBlob(blob).catch(() => null);

      // 1) Transcription
      const fd = new FormData();
      fd.append("audio", blob, "speech.webm");
      fd.append("lang", "fr");
      const tr = await fetch("/api/ai/eloquence/transcribe", { method: "POST", body: fd });
      if (!tr.ok) throw new Error("transcribe");
      const { text, duration } = await tr.json();

      // 2) Métriques locales (avant l'IA)
      const dur = duration || durationSec || 0;
      const wordCount = countWords(text);
      const wpm = computeWpm(wordCount, dur);
      const { total: fillerCount, byWord: fillers } = countFillers(text);

      // 3) Mesures acoustiques réelles (analyse du signal, côté navigateur)
      const audioBuffer = await audioBufferP;
      const audioMetrics = audioBuffer ? analyzeAudioBuffer(audioBuffer) : null;
      const audioScores = deriveAudioScores(audioMetrics);
      // 4) Les quatre repères : disponibles immédiatement, même si l'IA échoue.
      const checks = buildCoachChecks(audioMetrics, wpm, paceTarget);

      // 5) Analyse IA du texte (nourrie par les mesures) + 6) écoute réelle par
      // le modèle audio, en parallèle. L'analyse vocale est best effort.
      const analysisP = fetch("/api/ai/eloquence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, transcript: text, referenceText, topic, framework, drillGoal,
          durationSec: dur, wpm, fillerCount, fillers, audioMetrics,
          paceTarget: paceTarget || null,
        }),
      });
      const voiceP = audioBuffer ? runVoiceAnalysis(audioBuffer, mode, topic) : Promise.resolve(null);
      const [an, voiceAnalysis] = await Promise.all([analysisP, voiceP]);
      if (!an.ok) throw new Error("analyze");
      const analysis = await an.json();

      // URL locale pour la réécoute immédiate + upload cloud pour la conserver.
      const audioUrl = URL.createObjectURL(blob);
      const audioPath = await uploadAudio(blob); // null si non connecté ou échec

      onResult({
        transcript: text, durationSec: dur, wpm, fillerCount, fillers, analysis,
        audioUrl, audioPath, audioMetrics, audioScores, voiceAnalysis, checks,
        paceTarget: paceTarget || null,
      });
      setPhase("idle");
      reset();
    } catch {
      setPhase("error");
      setNetError("L'analyse a échoué. Vérifie ta connexion et réessaie.");
    }
  };

  if (!supported) {
    return (
      <div style={{ ...card, color: T.red, fontSize: 14 }}>
        L&apos;enregistrement audio n&apos;est pas pris en charge par ce navigateur.
      </div>
    );
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {/* Animation de pulsation pour le micro */}
      <style>{`@keyframes eloqPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.45)}70%{box-shadow:0 0 0 16px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}`}</style>

      {phase === "analyzing" ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 0" }}>
          <Loader2 size={34} color={T.text} className="anim-spin" />
          <div style={{ fontSize: 14, color: T.textSub, fontWeight: 600 }}>Analyse en cours…</div>
          <div style={{ fontSize: 12, color: T.textMut }}>Transcription, mesures acoustiques, puis évaluation.</div>
        </div>
      ) : (
        <>
          {mirror && recording && <MirrorView />}
          <button
            type="button"
            onClick={recording ? handleStop : handleStart}
            style={{
              width: 96, height: 96, borderRadius: "50%", cursor: "pointer",
              border: "none", fontFamily: "inherit",
              /* En cours d'enregistrement, l'aplat est le rouge saturé : l'encre
                 y reste blanche (`onSolid`) dans les deux thèmes. Au repos c'est
                 l'aplat d'encre `T.text`, qui s'inverse avec le thème — d'où
                 `textInverted`, sans quoi le bouton devient blanc sur blanc. */
              background: recording ? T.red : T.text, color: recording ? T.onSolid : T.textInverted,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
              animation: recording ? "eloqPulse 1.6s infinite" : "none",
              transition: "background 150ms ease",
            }}
          >
            {recording ? <Square size={26} fill="currentColor" /> : <Mic size={28} />}
            <span style={{ fontSize: 11, fontWeight: 500 }}>{recording ? "Arrêter" : "Commencer"}</span>
          </button>

          <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: recording ? T.red : T.textMut }}>
            {fmtTime(durationSec)}
          </div>
          <LevelMeter level={level} recording={recording} />
        </>
      )}

      {(error || netError) && (
        <div style={{ color: T.red, fontSize: 13, textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <span>{netError || error}</span>
          {phase === "error" && (
            <button type="button" style={ghost(false)} onClick={() => { setPhase("idle"); setNetError(null); }}>
              <RefreshCw size={14} /> Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Lignes d'affichage voix/mélodie : privilégie l'écoute par l'IA (voiceAnalysis),
 * retombe sur les sous-scores déterministes (audioScores) sinon. Ajoute
 * expressivité/chaleur uniquement quand l'IA a réellement écouté. */
function buildAudioRows(voiceAnalysis, audioScores) {
  const va = voiceAnalysis;
  const as = audioScores;
  const rows = [];
  const pick = (aiVal, aiFb, det) => ({
    score: typeof aiVal === "number" ? aiVal : (det && typeof det.score === "number" ? det.score : null),
    fb: aiFb || (det ? det.label : null),
  });
  const voice = pick(va && va.voice, va && va.feedback && va.feedback.voice, as && as.voice);
  if (voice.score != null) rows.push({ id: "voice", label: "Voix", ...voice });
  const melody = pick(va && va.melody, va && va.feedback && va.feedback.melody, as && as.melody);
  if (melody.score != null) rows.push({ id: "melody", label: "Mélodie", ...melody });
  if (va) {
    if (typeof va.expressiveness === "number")
      rows.push({ id: "expr", label: "Expressivité", score: va.expressiveness, fb: (va.feedback && va.feedback.expressiveness) || null });
    if (typeof va.warmth === "number")
      rows.push({ id: "warmth", label: "Chaleur", score: va.warmth, fb: (va.feedback && va.feedback.warmth) || null });
  }
  return rows;
}

// Barre d'un axe noté, avec la justification de la note en dessous.
function AxisBar({ label, desc, value, feedback }) {
  const val = typeof value === "number" ? value : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 96, fontSize: 13, color: T.textSub, fontWeight: 600 }} title={desc}>{label}</div>
        <div style={{ flex: 1, height: 8, background: T.accentBg, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${val}%`, height: "100%", background: scoreColor(val), borderRadius: 999, transition: "width 400ms ease" }} />
        </div>
        <div style={{ width: 30, textAlign: "right", fontSize: 13, fontWeight: 700, color: scoreColor(val) }}>{val}</div>
      </div>
      {feedback && (
        <div style={{ paddingLeft: 108, fontSize: 12, color: T.textSub, lineHeight: 1.5, borderLeft: `2px solid ${scoreColor(val)}`, marginLeft: 2 }}>
          {feedback}
        </div>
      )}
    </div>
  );
}

function FeedbackList({ title, icon, color, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ ...sectionTitle, color }}>{title}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: T.textSub, lineHeight: 1.4 }}>
            <span style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VocabSuggestions({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <div style={sectionTitle}>Dis plutôt</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ color: T.textMut, textDecoration: "line-through" }}>{s.original}</span>
            <ChevronRight size={14} color={T.textMut} />
            <span style={{ color: T.green, fontWeight: 600 }}>{s.better}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Carte de résultats ───────────────
 * Les quatre repères d'abord (mesurés, immédiats, actionnables), le jugement de
 * l'IA ensuite, le détail acoustique replié. L'ordre inverse faisait chercher le
 * débit et les silences sous six barres de notes. */
function ResultCard({ result, showFidelity }) {
  const audioUrl = result && result.audioUrl;
  // Libère l'URL objet quand la carte disparaît ou quand l'enregistrement change.
  useEffect(() => {
    if (!audioUrl) return;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  if (!result || !result.analysis) return null;
  const { analysis, fillerCount, fillers, durationSec, transcript, checks } = result;
  const audioRows = buildAudioRows(result.voiceAnalysis, result.audioScores);
  const heardByAI = !!result.voiceAnalysis;
  const overall = analysis.overall != null ? analysis.overall : overallScore(analysis.scores);

  const axes = [...SCORE_AXES];
  if (showFidelity && analysis.scores && analysis.scores.fidelity != null) axes.push(FIDELITY_AXIS);
  const topFillers = Object.entries(fillers || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
      <CoachChecks checks={checks} />

      {result.forbiddenWord && (
        <ForbiddenVerdict word={result.forbiddenWord} count={result.forbiddenCount || 0} />
      )}

      {/* Score global de l'IA */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", paddingTop: 4, borderTop: `1px solid ${HAIRLINE}` }}>
        <div style={{
          width: 84, height: 84, borderRadius: "50%", flexShrink: 0, marginTop: 12,
          background: scoreColor(overall), color: T.onSolid,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{overall}</span>
          <span style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>/ 100</span>
        </div>
        <div style={{ flex: 1, minWidth: 200, marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Jugement du coach</div>
          {analysis.summary && (
            <div style={{ fontSize: 13, color: T.textSub, marginTop: 4, fontStyle: "italic" }}>{analysis.summary}</div>
          )}
        </div>
      </div>

      {/* Barres par axe + justification */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {axes.map((ax) => (
          <AxisBar
            key={ax.id}
            label={ax.label}
            desc={ax.desc}
            value={analysis.scores ? analysis.scores[ax.id] : null}
            feedback={analysis.axisFeedback ? analysis.axisFeedback[ax.id] : null}
          />
        ))}
      </div>

      {/* Points forts / À améliorer / Conseils */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <FeedbackList title="Points forts" icon={<Check size={15} color={T.green} />} color={T.green} items={analysis.strengths} />
        <FeedbackList title="À améliorer" icon={<ChevronRight size={15} color={T.amber} />} color={T.amber} items={analysis.improvements} />
        <FeedbackList title="Conseils" icon={<Lightbulb size={15} color={T.blue} />} color={T.blue} items={analysis.tips} />
      </div>

      <VocabSuggestions items={analysis.vocabSuggestions} />

      {/* Réécoute de l'enregistrement (disponible pour la session en cours) */}
      {audioUrl && (
        <div>
          <div style={sectionTitle}>Réécoute-toi</div>
          <audio controls src={audioUrl} style={{ width: "100%", height: 40 }} />
        </div>
      )}

      {/* Détail : son, mesures, transcription — replié, on n'y va que si on cherche. */}
      <details style={{ fontSize: 13 }}>
        <summary style={{ cursor: "pointer", color: T.textSub, fontWeight: 600 }}>Détail de la prise</summary>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 18 }}>
          {audioRows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ ...sectionTitle, marginBottom: 0 }}>Analyse du son</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: heardByAI ? T.blue : T.textMut }}>
                  {heardByAI ? "écoutée par l'IA" : "mesurée sur le signal"}
                </span>
              </div>
              {audioRows.map((ax) => (
                <AxisBar key={ax.id} label={ax.label} value={ax.score} feedback={ax.fb} />
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={metricBox}>
              <div style={metricLabel}>Durée</div>
              <div style={metricVal}>{fmtTime(durationSec)}</div>
            </div>
            <div style={metricBox}>
              <div style={metricLabel}>Tics de langage</div>
              <div style={{ ...metricVal, color: fillerCount > 5 ? T.amber : T.text }}>{fillerCount || 0}</div>
              {topFillers.length > 0 && (
                <div style={{ fontSize: 11, color: T.textMut }}>
                  {topFillers.map(([w, n]) => `${w} ×${n}`).join(" · ")}
                </div>
              )}
            </div>
            {result.audioMetrics && result.audioMetrics.phraseCount != null && (
              <div style={metricBox}>
                <div style={metricLabel}>Groupes de souffle</div>
                <div style={metricVal}>{result.audioMetrics.phraseCount}</div>
                <div style={{ fontSize: 11, color: T.textMut }}>phrases séparées par un silence</div>
              </div>
            )}
          </div>

          {transcript && (
            <div>
              <div style={sectionTitle}>Transcription</div>
              <p style={{ margin: 0, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{transcript}</p>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

// Verdict du format « mot interdit » : comptage local sur la transcription.
function ForbiddenVerdict({ word, count }) {
  const ok = count === 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 10, padding: "12px 14px", background: ok ? T.greenBg : T.redBg }}>
      {ok ? <Check size={18} color={T.green} /> : <Ban size={18} color={T.red} />}
      <div style={{ fontSize: 13, color: T.text }}>
        {ok ? (
          <>Le mot « <strong>{word}</strong> » n&apos;est jamais sorti.</>
        ) : (
          <>Le mot interdit « <strong>{word}</strong> » est apparu <strong>{count}</strong> fois.</>
        )}
      </div>
    </div>
  );
}

// Niveau d'entrée des catalogues (virelangues, textes) : le dernier de
// l'échelle, « Expert ».
const DEFAULT_LEVEL = LEVELS[LEVELS.length - 1].id;

/* ─────────────── Sélecteur de niveau ───────────────
   `showAll` : le « Tous » vidait le catalogue entier à l'écran — vingt-neuf
   virelangues, vingt-trois textes — et on ne choisit plus rien devant un mur.
   Un seul niveau à la fois, l'expert par défaut. */
function LevelFilter({ value, onChange, showAll = true }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {showAll && <button type="button" style={pill(value === 0)} onClick={() => onChange(0)}>Tous</button>}
      {/* Chaque niveau porte sa couleur même quand il n'est pas choisi : le vert
          du facile et le rouge de l'expert se repèrent avant d'être lus. Choisi,
          l'aplat devient plein. */}
      {LEVELS.map((l) => (
        <button
          key={l.id}
          type="button"
          style={{
            ...pill(value === l.id),
            background: value === l.id ? l.color : veil(l.color, 16),
            color: value === l.id ? T.onSolid : l.color,
          }}
          onClick={() => onChange(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ONGLET 1 — ARTICULATION
   ═══════════════════════════════════════════════════════════ */

/* Compteur de répétitions. Toute la tuile est la cible de frappe : on compte en
   tapant, sans viser un petit bouton, ce qui est indispensable quand on répète
   vingt fois de suite. Le « remettre à zéro » est donc en dehors — deux boutons
   imbriqués et la zone parente avale les clics du bord.

   Une seule surface visible : la tuile de frappe. Le geste de la consonne passe
   en infobulle et la remise à zéro n'apparaît qu'une fois qu'on a compté —
   quatre compteurs côte à côte, chacun avec son titre, sa consigne et son
   bouton, faisaient un mur avant même le premier « TA ». */
function RepCounter({ title, srName, subtitle, hint, total, count, onInc, onReset }) {
  const done = count >= total;
  const pct = Math.min(100, Math.round((count / total) * 100));
  // Trois états, trois teintes : gris tant qu'on n'a rien fait, bleu pendant la
  // série, vert une fois bouclée. On voit d'un regard où en sont les quatre
  // consonnes sans lire un seul chiffre.
  const tone = done ? T.green : count > 0 ? T.blue : T.text;
  const padBg = done ? T.greenBg : count > 0 ? T.blueBg : SURFACE;
  return (
    <div title={hint || undefined} style={{ flex: "1 1 200px", minWidth: 180, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: T.textMut, textAlign: "right", flexShrink: 0 }}>{subtitle}</div>}
      </div>

      <button
        type="button"
        onClick={onInc}
        disabled={done}
        aria-label={`${srName || title} — compter une répétition (${count} sur ${total})`}
        style={{
          border: "none", borderRadius: 12, padding: "20px 12px", cursor: done ? "default" : "pointer",
          fontFamily: "inherit", background: padBg, color: T.text,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          transition: "background 150ms ease",
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: tone, lineHeight: 1 }}>
          {count}<span style={{ fontSize: 14, color: T.numMuted, fontWeight: 500 }}> / {total}</span>
        </span>
        <span style={{ fontSize: 11, color: done ? T.green : T.textMut, display: "inline-flex", alignItems: "center", gap: 4 }}>
          {done ? <><Check size={12} /> Série bouclée</> : "Tape à chaque répétition"}
        </span>
      </button>

      {count > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 999, background: HAIRLINE, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: tone, transition: "width 200ms ease" }} />
          </div>
          <button
            type="button"
            onClick={onReset}
            aria-label={`${srName || title} — remettre à zéro`}
            style={{ border: "none", background: "transparent", padding: 2, cursor: "pointer", color: T.textMut, display: "inline-flex", lineHeight: 0 }}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// Occlusives T · D · B · P : vingt répétitions chacune, en exagérant.
function ConsonantSection({ reps, incRep, resetRep }) {
  const done = CONSONANT_DRILLS.filter((c) => (reps[`cons-${c.id}`] || 0) >= CONSONANT_REPS).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Le décompte du jour tient sur la ligne du titre : c'est un état, pas une
          consigne — il n'a pas besoin d'une ligne à lui. */}
      <div>
        <BlockTitle
          color={T.blue}
          right={(
            <div style={{ fontSize: 12, color: done === CONSONANT_DRILLS.length ? T.green : T.textMut, fontWeight: 500 }}>
              {done} / {CONSONANT_DRILLS.length} consonnes bouclées aujourd&apos;hui
            </div>
          )}
        >
          Occlusives T · D · B · P
        </BlockTitle>
        <p style={{ ...lead, marginTop: 6, paddingLeft: 16 }}>{CONSONANT_DRILL_INSTRUCTION}</p>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {CONSONANT_DRILLS.map((c) => (
          <RepCounter
            key={c.id}
            title={`${c.letter} — ${c.syllables.join(" · ")}`}
            srName={`Consonne ${c.letter}`}
            subtitle={c.pair}
            hint={c.cue}
            total={CONSONANT_REPS}
            count={reps[`cons-${c.id}`] || 0}
            onInc={() => incRep(`cons-${c.id}`, CONSONANT_REPS)}
            onReset={() => resetRep(`cons-${c.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

/* Virelangues : le protocole en deux séries de dix — la vitesse d'abord, la
   netteté ensuite — sur le même virelangue. L'enregistrement est facultatif :
   c'est un exercice de bouche, pas un examen. */
function TwisterSection({ reps, incRep, resetRep, onSession }) {
  // Expert par défaut : c'est le niveau qu'on vient chercher ici, et démarrer
  // au plus dur évite d'avoir à balayer le catalogue avant de commencer.
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [selectedId, setSelectedId] = useState(null);
  const [serieId, setSerieId] = useState(TWISTER_SERIES[0].id);
  const [result, setResult] = useState(null);

  const list = useMemo(() => TONGUE_TWISTERS.filter((tw) => level === 0 || tw.level === level), [level]);
  const selected = TONGUE_TWISTERS.find((tw) => tw.id === selectedId) || null;
  const serie = TWISTER_SERIES.find((s) => s.id === serieId) || TWISTER_SERIES[0];
  const repKey = selected ? `tw-${selected.id}-${serie.id}` : null;
  const count = repKey ? (reps[repKey] || 0) : 0;

  const handleResult = (r) => {
    setResult(r);
    onSession({ mode: EXERCISE_MODES.articulation, r });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <BlockTitle color={T.purple}>Virelangues</BlockTitle>
        <p style={{ ...lead, marginTop: 6, paddingLeft: 16 }}>
          Un virelangue, deux séries de {TWISTER_REPS} : en accélérant, puis en articulant à fond.
        </p>
      </div>

      <LevelFilter value={level} onChange={setLevel} showAll={false} />

      {/* Le catalogue reste affiché pendant l'exercice — on change de virelangue
          en tapant sur un autre, sans revenir en arrière. Pas de pastille de
          niveau sur les cartes, ni de teinte : un seul niveau est listé à la
          fois, le filtre coloré juste au-dessus le dit déjà — les cartes, elles,
          restent neutres pour que le texte du virelangue soit tout ce qu'on
          voit. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {list.map((tw) => {
          const active = tw.id === selectedId;
          return (
            <button
              key={tw.id}
              type="button"
              onClick={() => { setSelectedId(active ? null : tw.id); setResult(null); }}
              style={{ ...selectable(active), width: 300 }}
            >
              <div style={{ fontSize: 14, color: T.text, lineHeight: 1.45 }}>{tw.text}</div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 24, lineHeight: 1.5, color: T.text, margin: 0, fontWeight: 600 }}>{selected.text}</p>

            {/* Les deux séries ne cherchent pas la même chose : l'orange pousse
                la vitesse, le bleu la netteté. La pastille garde sa teinte même
                éteinte, pour qu'on sache laquelle on va choisir. */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {TWISTER_SERIES.map((s) => {
                const active = serieId === s.id;
                const tone = SERIE_TONES[s.id] || { fg: T.text, bg: FIELD_BG };
                return (
                  <button
                    key={s.id}
                    type="button"
                    style={{ ...pill(active), background: active ? tone.fg : tone.bg, color: active ? T.onSolid : tone.fg }}
                    onClick={() => { setSerieId(s.id); setResult(null); }}
                  >
                    {s.title}
                  </button>
                );
              })}
              <ListenButton text={selected.text} rate={serie.id === "articulate" ? 0.6 : 1} label="Écouter au tempo" />
            </div>

            {/* La consigne et ses rappels, en un seul bloc de texte calme : trois
                ampoules jaunes empilées attiraient l'œil plus que le virelangue. */}
            <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.55 }}>{serie.instruction}</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {serie.tips.map((t, i) => (
                <li key={i} style={{ fontSize: 12, color: T.textMut, lineHeight: 1.45 }}>{t}</li>
              ))}
            </ul>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <RepCounter
              title={serie.short}
              subtitle={serie.title}
              total={TWISTER_REPS}
              count={count}
              onInc={() => repKey && incRep(repKey, TWISTER_REPS)}
              onReset={() => repKey && resetRep(repKey)}
            />
            <div style={{ flex: "2 1 320px", minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: T.textMut, lineHeight: 1.45 }}>
                Facultatif : enregistre une série pour faire noter ton articulation.
              </div>
              <RecorderPanel
                key={`${selected.id}-${serie.id}`}
                mode="diction"
                referenceText={selected.text}
                drillGoal={serie.goal}
                onResult={handleResult}
              />
            </div>
          </div>

          {result && <ResultCard result={result} showFidelity />}
        </div>
      )}
    </div>
  );
}

// Échauffement : la routine avant tout le reste, repliée par défaut.
function WarmupSection() {
  const [openId, setOpenId] = useState(null);
  return (
    <details style={{ ...card, padding: 0, overflow: "hidden" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: T.text }}>
        <Sparkles size={15} color={T.amber} />
        Échauffement de la voix
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500, color: T.textMut }}>
          3 minutes avant de commencer
        </span>
      </summary>
      <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {WARMUPS.map((w) => {
          const open = openId === w.id;
          return (
            <div key={w.id} style={{ borderRadius: 8, background: open ? SURFACE : "transparent" }}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : w.id)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ChevronRight size={15} color={T.textMut} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{w.title}</span>
                </span>
                <span style={{ fontSize: 12, color: T.textMut }}>{w.duration}s</span>
              </button>
              {open && <div style={{ padding: "0 12px 12px 37px", fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>{w.instruction}</div>}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/* Deux exercices, séparés par du vide et un filet plutôt que par des cadres :
   l'œil sait où finit l'un et où commence l'autre sans qu'on empile une carte
   de plus autour de chaque. */
function ArticulationTab({ reps, incRep, resetRep, onSession }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <WarmupSection />
      <ConsonantSection reps={reps} incRep={incRep} resetRep={resetRep} />
      <hr style={divider} />
      <TwisterSection reps={reps} incRep={incRep} resetRep={resetRep} onSession={onSession} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ONGLET 2 — LECTURE
   ═══════════════════════════════════════════════════════════ */
function ReadingTab({ onSession }) {
  const [intentionId, setIntentionId] = useState(READING_INTENTIONS[0].id);
  // Même entrée que les virelangues : un seul niveau listé, l'expert d'abord.
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [selectedId, setSelectedId] = useState(null);
  const [ownText, setOwnText] = useState("");
  const [result, setResult] = useState(null);

  const intention = READING_INTENTIONS.find((i) => i.id === intentionId) || READING_INTENTIONS[0];
  const list = useMemo(() => READING_TEXTS.filter((tx) => level === 0 || tx.level === level), [level]);
  const libraryText = READING_TEXTS.find((tx) => tx.id === selectedId) || null;

  // Le texte réellement lu : la bibliothèque, ou celui que l'utilisateur a collé.
  const useOwn = intention.source === "own" || (intention.source === "both" && ownText.trim().length > 0);
  const reference = useOwn ? ownText.trim() : (libraryText ? libraryText.text : "");
  const paceTarget = intention.target || null;

  const switchIntention = (id) => {
    setIntentionId(id);
    setResult(null);
    // Un texte de bibliothèque n'a pas de sens pour l'imitation : elle exige le
    // modèle exact que l'utilisateur veut copier.
    if ((READING_INTENTIONS.find((i) => i.id === id) || {}).source === "own") setSelectedId(null);
  };

  const handleResult = (r) => {
    setResult(r);
    onSession({ mode: EXERCISE_MODES.reading, r });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Intention de lecture — une couleur par intention : trois cartes de même
          taille alignées ne se distinguaient que par leur texte. */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {READING_INTENTIONS.map((i, idx) => {
          const active = i.id === intentionId;
          const tone = cycleTone(idx);
          return (
            <button key={i.id} type="button" onClick={() => switchIntention(i.id)} style={{ ...selectable(active, tone), width: 260, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: tone }}>{i.label}</div>
              <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.4 }}>{i.tagline}</div>
            </button>
          );
        })}
      </div>

      {/* Consigne de l'intention choisie — même traitement calme que les
          virelangues : du texte, pas une guirlande d'ampoules. */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ ...lead, color: T.text }}>{intention.description}</p>
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          {intention.tips.map((t, i) => (
            <li key={i} style={{ fontSize: 12, color: T.textMut, lineHeight: 1.45 }}>{t}</li>
          ))}
        </ul>
        {paceTarget && (
          <div style={targetChip(ruleTone("pace"))}>
            <Clock size={14} /> Débit cible de cet exercice : {paceTarget.wpmMin}–{paceTarget.wpmMax} mots/minute.
          </div>
        )}
      </div>

      {/* Texte à lire — bibliothèque et/ou texte collé selon l'intention */}
      {intention.source !== "own" && (
        <>
          <LevelFilter value={level} onChange={setLevel} showAll={false} />
          {/* Cartes neutres, comme les virelangues : le niveau est déjà porté par
              le filtre coloré juste au-dessus. */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {list.map((tx) => {
              const active = tx.id === selectedId && !useOwn;
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => { setSelectedId(active ? null : tx.id); setOwnText(""); setResult(null); }}
                  style={{ ...selectable(active), width: 240 }}
                >
                  <div style={{ fontSize: 11, color: T.textMut, fontWeight: 500, marginBottom: 4 }}>{tx.genre}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{tx.title}</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {intention.source !== "library" && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
            {intention.source === "own" ? "Le texte de ton modèle" : "…ou colle ton propre texte"}
          </div>
          <textarea
            value={ownText}
            onChange={(e) => { setOwnText(e.target.value); setResult(null); }}
            placeholder={intention.placeholder || "Colle ici un extrait de roman, de pièce ou de poème…"}
            rows={5}
            style={{ ...writing, lineHeight: 1.5 }}
          />
        </div>
      )}

      {/* Le texte, en grand, prêt à être lu */}
      {reference && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {useOwn ? "Ton texte" : libraryText.title}
              </div>
              <ListenButton text={reference} rate={intention.id === "slow" ? 0.6 : 0.95} />
            </div>
            <p style={{ fontSize: intention.id === "slow" ? 20 : 18, lineHeight: 1.85, color: T.text, margin: 0 }}>{reference}</p>
          </div>
          <RecorderPanel
            key={`${intention.id}-${useOwn ? "own" : selectedId}`}
            mode="reading"
            referenceText={reference}
            drillGoal={intention.goal}
            paceTarget={paceTarget}
            onResult={handleResult}
          />
          {result && <ResultCard result={result} showFidelity />}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ONGLET 3 — PAROLE
   ═══════════════════════════════════════════════════════════ */

// Aide-mémoire des cadres de discours, à garder sous les yeux pendant l'impro.
function FrameworkPicker({ value, onChange }) {
  return (
    <details style={{ ...card, padding: 0, overflow: "hidden" }} open={!!value}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: T.text }}>
        <Lightbulb size={15} color={T.amber} />
        Cadre de discours
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500, color: value ? T.text : T.textMut }}>
          {value ? FRAMEWORK_BY_ID[value].name : "facultatif — pour être jugé sur la structure"}
        </span>
      </summary>
      <div style={{ padding: "0 18px 18px", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Même cycle de couleurs que les formats : quatre cadres alignés, quatre
            teintes, on retrouve le sien d'un coup d'œil d'une séance à l'autre. */}
        {STRUCTURE_FRAMEWORKS.map((f, idx) => {
          const active = f.id === value;
          const tone = cycleTone(idx);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange(active ? null : f.id)}
              style={{ ...selectable(active, tone), flex: "1 1 260px", minWidth: 240 }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: tone }}>{f.name}</div>
              <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500, marginBottom: 8 }}>{f.short}</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {f.steps.map((s, i) => (
                  <li key={i} style={{ fontSize: 12, color: T.textSub }}>
                    <span style={{ fontWeight: 700, color: T.text }}>{s.label}</span>{s.hint ? ` — ${s.hint}` : ""}
                  </li>
                ))}
              </ol>
            </button>
          );
        })}
      </div>
    </details>
  );
}

/* Tiroir de sujets : la banque locale (instantanée) et le générateur IA. C'était
   un onglet à part, qui obligeait à faire l'aller-retour pour choisir un sujet
   puis revenir parler. Il est maintenant là où le sujet sert. */
function TopicDrawer({ onPick }) {
  const [theme, setTheme] = useState(TOPIC_THEMES[0].key);
  const [topics, setTopics] = useState(() => getTopicsFromBank(TOPIC_THEMES[0].key, 4));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const generate = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/ai/eloquence/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "topics", theme, count: 4 }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setTopics(data.topics || []);
    } catch {
      setErr("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details style={{ ...card, padding: 0, overflow: "hidden" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: T.text }}>
        <Sparkles size={15} color={T.blue} />
        Trouver un sujet
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500, color: T.textMut }}>banque ou génération IA</span>
      </summary>
      <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TOPIC_THEMES.map((th) => (
            <button
              key={th.key}
              type="button"
              onClick={() => { setTheme(th.key); setTopics(getTopicsFromBank(th.key, 4)); setErr(null); }}
              style={pill(theme === th.key)}
            >
              <span>{th.emoji}</span> {th.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={ghost(false)} onClick={() => { setErr(null); setTopics(getTopicsFromBank(theme, 4)); }}>
            <RefreshCw size={14} /> Repiocher
          </button>
          <button type="button" style={primary(loading)} disabled={loading} onClick={generate}>
            {loading ? <Loader2 size={15} className="anim-spin" /> : <Sparkles size={15} />}
            Générer avec l&apos;IA
          </button>
        </div>

        {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {topics.map((tp, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(tp.title)}
              style={{
                flex: "1 1 240px", minWidth: 220, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                border: "none", borderRadius: 10, padding: 14, background: SURFACE,
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.35 }}>{tp.title}</div>
              {tp.angle && <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.4 }}>{tp.angle}</div>}
              <div style={{ fontSize: 11, color: T.blue, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Mic size={12} /> Prendre ce sujet
              </div>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

function SpeakingTab({ onSession }) {
  const [formatId, setFormatId] = useState(SPEAKING_FORMATS[0].id);
  const [topic, setTopic] = useState("");
  const [frameworkId, setFrameworkId] = useState(null);
  const [durationIdx, setDurationIdx] = useState(0);
  const [forbiddenWord, setForbiddenWord] = useState("");
  const [prep, setPrep] = useState(0); // 0 / 30 / 60 secondes
  const [countdown, setCountdown] = useState(0);
  const [mirror, setMirror] = useState(false);
  const [result, setResult] = useState(null);

  const format = SPEAKING_FORMATS.find((f) => f.id === formatId) || SPEAKING_FORMATS[0];
  const targetSec = format.durations ? format.durations[durationIdx] : (format.timerTargetSec || null);
  const activeForbidden = format.forbidden ? (forbiddenWord.trim() || format.forbiddenChoices[0]) : "";
  const framework = frameworkId ? FRAMEWORK_BY_ID[frameworkId] : null;

  // Compte à rebours de préparation.
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Un format suggère parfois son cadre (le storytelling appelle « Raconter »).
  const switchFormat = (id) => {
    const f = SPEAKING_FORMATS.find((x) => x.id === id);
    setFormatId(id);
    setResult(null);
    setDurationIdx(0);
    if (f && f.frameworkId) setFrameworkId(f.frameworkId);
  };

  // Consigne finale envoyée à l'IA : base du format + contraintes dynamiques.
  const goal = useMemo(() => {
    let g = format.goal || "";
    if (format.durations && targetSec) g += ` Durée cible STRICTE : ${targetSec} secondes maximum.`;
    if (activeForbidden) g += ` Le mot précisément interdit est : « ${activeForbidden} ».`;
    return g.trim();
  }, [format, targetSec, activeForbidden]);

  const handleResult = (r) => {
    const merged = activeForbidden
      ? { ...r, forbiddenWord: activeForbidden, forbiddenCount: countWordOccurrences(r.transcript, activeForbidden) }
      : r;
    setResult(merged);
    onSession({ mode: EXERCISE_MODES.speaking, r: merged });
  };

  const ready = (!format.needsTopic || topic.trim().length > 0) && countdown === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Format de prise de parole — une couleur par format, sur le même cycle
          que les intentions de lecture : six tuiles identiques obligeaient à
          toutes les lire pour en choisir une. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {SPEAKING_FORMATS.map((f, idx) => {
          const active = f.id === formatId;
          const tone = cycleTone(idx);
          return (
            <button key={f.id} type="button" onClick={() => switchFormat(f.id)} style={{ ...selectable(active, tone), flex: "1 1 200px", minWidth: 190, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: tone }}>{f.label}</div>
              <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.4, marginTop: 3 }}>{f.tagline}</div>
            </button>
          );
        })}
      </div>

      {/* Consigne du format */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ ...lead, color: T.text }}>{format.description}</p>
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          {format.tips.map((t, i) => (
            <li key={i} style={{ fontSize: 12, color: T.textMut, lineHeight: 1.45 }}>{t}</li>
          ))}
        </ul>
        {format.target && (
          <div style={targetChip(ruleTone("pace"))}>
            <Clock size={14} /> Débit cible de ce format : {format.target.wpmMin}–{format.target.wpmMax} mots/minute.
          </div>
        )}
        {format.timerTargetSec && (
          <div style={targetChip({ fg: T.amber, bg: T.amberBg })}>
            <Clock size={14} /> Objectif : tenir {fmtTime(format.timerTargetSec)} sans jamais t&apos;arrêter.
          </div>
        )}
      </div>

      {/* Sujet + contraintes */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          value={topic}
          onChange={(e) => { setTopic(e.target.value); setResult(null); }}
          placeholder={format.topicPlaceholder || "Écris ton sujet, ou tire-en un au hasard…"}
          style={field}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={ghost(false)} onClick={() => {
            const tp = pickRandomTopic("surprise");
            if (tp) { setTopic(tp.title); setResult(null); }
          }}>
            <Sparkles size={14} /> Tirer un sujet
          </button>
          <span style={{ fontSize: 12, color: T.textMut, marginLeft: 4 }}>Préparation :</span>
          {[0, 30, 60].map((s) => (
            <button key={s} type="button" style={pill(prep === s)} onClick={() => setPrep(s)}>
              {s === 0 ? "Aucune" : `${s}s`}
            </button>
          ))}
          {prep > 0 && (
            <button type="button" style={primary(countdown > 0)} disabled={countdown > 0} onClick={() => setCountdown(prep)}>
              {countdown > 0 ? `${countdown}s…` : "Démarrer la prépa"}
            </button>
          )}
        </div>

        {countdown > 0 && (
          <div style={{ textAlign: "center", fontSize: 40, fontWeight: 800, color: T.amber, fontVariantNumeric: "tabular-nums" }}>{countdown}</div>
        )}

        {format.durations && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: T.textMut }}>Temps imposé :</span>
            {format.durations.map((s, i) => (
              <button key={s} type="button" style={pill(durationIdx === i)} onClick={() => { setDurationIdx(i); setResult(null); }}>
                {fmtDuration(s)}
              </button>
            ))}
          </div>
        )}

        {format.forbidden && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, color: T.textMut }}>Mot interdit :</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {format.forbiddenChoices.map((w) => (
                <button key={w} type="button" style={pill(activeForbidden === w)} onClick={() => { setForbiddenWord(w); setResult(null); }}>
                  {w}
                </button>
              ))}
            </div>
            <input
              value={forbiddenWord}
              onChange={(e) => { setForbiddenWord(e.target.value); setResult(null); }}
              placeholder="…ou saisis ton propre mot à bannir"
              style={field}
            />
          </div>
        )}

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textSub, cursor: "pointer" }}>
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} style={{ accentColor: T.text }} />
          {mirror ? <Video size={14} /> : <VideoOff size={14} />}
          Me voir pendant que je parle (caméra en miroir, rien n&apos;est enregistré)
        </label>
      </div>

      <TopicDrawer onPick={(title) => { setTopic(title); setResult(null); }} />
      <FrameworkPicker value={frameworkId} onChange={(id) => { setFrameworkId(id); setResult(null); }} />

      {framework && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Ton guide : {framework.name}</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            {framework.steps.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: T.textSub }}>
                <span style={{ fontWeight: 700, color: T.text }}>{s.label}</span>{s.hint ? ` — ${s.hint}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}

      {ready ? (
        <>
          <RecorderPanel
            key={`${format.id}-${frameworkId || "none"}`}
            mode={framework ? "structure" : "freeSpeech"}
            topic={topic.trim()}
            framework={framework ? { name: framework.name, steps: framework.steps } : undefined}
            drillGoal={goal}
            paceTarget={format.target || null}
            mirror={mirror}
            onResult={handleResult}
          />
          {result && <ResultCard result={result} />}
        </>
      ) : (
        <div style={{ ...card, fontSize: 13, color: T.textMut, textAlign: "center", padding: 28 }}>
          {countdown > 0 ? "Prépare ton propos…" : "Choisis ou écris un sujet pour débloquer l'enregistrement."}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUIVI
   ═══════════════════════════════════════════════════════════ */
const SESSION_MODES = [
  { id: EXERCISE_MODES.articulation, label: "Articulation" },
  { id: EXERCISE_MODES.reading,      label: "Lecture" },
  { id: EXERCISE_MODES.speaking,     label: "Parole" },
];
const modeLabel = (m) => (SESSION_MODES.find((x) => x.id === m) || {}).label;

// Tendance d'une série : moyenne de la 2nde moitié (récent) moins la 1re (ancien).
function seriesTrend(vals) {
  if (!vals || vals.length < 2) return null;
  const mid = Math.floor(vals.length / 2);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return Math.round(mean(vals.slice(mid)) - mean(vals.slice(0, mid)));
}

// Mini-courbe SVG (sparkline) d'une série de valeurs 0–100.
function Sparkline({ values }) {
  if (!values || values.length < 2) return null;
  const W = 100, H = 28, pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i * (W - 2 * pad)) / (values.length - 1);
    const y = pad + (1 - v / 100) * (H - 2 * pad);
    return [x, y];
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 40, display: "block" }}>
      <path d={path} fill="none" stroke={scoreColor(last)} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={2.2} fill={scoreColor(last)} />
    </svg>
  );
}

function TrendTag({ delta }) {
  if (delta == null) return <span style={{ color: T.textMut }}>—</span>;
  if (delta > 0) return <span style={{ color: T.pnlPos, fontWeight: 600 }}>▲ +{delta}</span>;
  if (delta < 0) return <span style={{ color: T.pnlNeg, fontWeight: 600 }}>▼ {delta}</span>;
  return <span style={{ color: T.textMut, fontWeight: 600 }}>= 0</span>;
}

/* Progression de l'exercice affiché : le score moyen de la catégorie, sa courbe,
 * puis la moyenne et la tendance de chaque critère. */
function ProgressPanel({ sessions, mode }) {
  const catLabel = modeLabel(mode);
  const filtered = (sessions || []).filter((s) => s.mode === mode);
  const chrono = [...filtered].reverse();
  const n = filtered.length;
  const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);

  if (n === 0) {
    return (
      <div style={{ ...card, fontSize: 13, color: T.textMut, textAlign: "center", padding: 32 }}>
        Fais une prise enregistrée en « {catLabel} » pour lancer le suivi.
      </div>
    );
  }

  const overalls = chrono.map((s) => s.overall || 0);
  const avg = mean(overalls);
  const best = Math.max(...overalls);
  const last = overalls[overalls.length - 1];
  const delta = seriesTrend(overalls);

  const rows = [...SCORE_AXES, FIDELITY_AXIS]
    .map((ax) => {
      const vals = chrono.map((s) => (s.scores ? s.scores[ax.id] : null)).filter((v) => typeof v === "number");
      if (vals.length < 1) return null;
      return { ax, avg: mean(vals), delta: seriesTrend(vals) };
    })
    .filter(Boolean);

  // Les quatre repères, moyennés sur la catégorie : c'est le suivi qui compte le
  // plus, puisque c'est sur eux que chaque prise est jugée en premier.
  const checkRows = ["pace", "silences", "noise", "endings"]
    .map((id) => {
      const vals = chrono
        .map((s) => (s.checkStatus ? s.checkStatus[id] : null))
        .filter((v) => v === "ok" || v === "warn" || v === "bad");
      if (!vals.length) return null;
      const label = (SPEECH_RULES.find((r) => r.id === id) || {}).label;
      const okCount = vals.filter((v) => v === "ok").length;
      return { id, label, okCount, total: vals.length, ratio: okCount / vals.length };
    })
    .filter(Boolean);

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={sectionTitle}>Progression · {catLabel}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{
          width: 84, height: 84, borderRadius: "50%", flexShrink: 0,
          background: scoreColor(avg), color: T.onSolid,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{avg}</span>
          <span style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>moyenne</span>
        </div>
        <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: T.textSub, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span>{n} prise{n > 1 ? "s" : ""}</span>
            <span>Dernière <strong style={{ color: scoreColor(last) }}>{last}</strong></span>
            <span>Record <strong style={{ color: scoreColor(best) }}>{best}</strong></span>
            <TrendTag delta={delta} />
          </div>
          <Sparkline values={overalls} />
        </div>
      </div>

      {checkRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: T.text, opacity: 0.5, fontWeight: 500 }}>Repères tenus</div>
          {checkRows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* La même pastille de couleur que dans la barre de consignes :
                  on relie le suivi au repère sans réécrire son nom en entier. */}
              <div style={{ width: 104, fontSize: 13, color: T.textSub, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: ruleTone(r.id).fg, flexShrink: 0 }} />
                {r.label}
              </div>
              <div style={{ flex: 1, height: 8, background: T.accentBg, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${Math.round(r.ratio * 100)}%`, height: "100%", background: r.ratio >= 0.7 ? T.green : r.ratio >= 0.4 ? T.amber : T.red, borderRadius: 999 }} />
              </div>
              <div style={{ width: 46, textAlign: "right", fontSize: 12, fontWeight: 600, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
                {r.okCount}/{r.total}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, color: T.text, opacity: 0.5, fontWeight: 500 }}>Notes du coach par critère</div>
        {rows.map(({ ax, avg: a, delta: d }) => (
          <div key={ax.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 104, fontSize: 13, color: T.textSub, fontWeight: 600 }} title={ax.desc}>{ax.label}</div>
            <div style={{ flex: 1, height: 8, background: T.accentBg, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${a}%`, height: "100%", background: scoreColor(a), borderRadius: 999 }} />
            </div>
            <div style={{ width: 30, textAlign: "right", fontSize: 13, fontWeight: 700, color: scoreColor(a) }}>{a}</div>
            <div style={{ width: 52, textAlign: "right", fontSize: 12 }}><TrendTag delta={d} /></div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: T.textMut }}>
        Tendance = écart entre tes prises récentes et les plus anciennes.
      </div>
    </div>
  );
}

/* ─────────────── Le coach : bilan du jour + dernière séance ───────────────
 * Deux blocs affichaient le même contenu (résumé, points forts, axes, conseils),
 * l'un pour la journée, l'autre pour la dernière prise. Ils n'en font plus qu'un :
 * le plan du jour en haut, le détail de la dernière prise replié en dessous. */
function CoachPanel({ sessions, store, setStore, mode, onOpenTab }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const genGuard = useRef(null);

  const dateKey = todayKey();
  const aggregate = useMemo(() => buildDailyAggregate(sessions, dateKey), [sessions, dateKey]);
  const reviews = (store && store.dailyReviews) || {};
  const review = reviews[dateKey] || null;
  const stale = !!review && review.sessionCount < aggregate.sessionCount;

  const generate = async () => {
    if (aggregate.sessionCount < 1) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/ai/eloquence/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aggregate),
      });
      if (!r.ok) throw new Error("plan");
      const data = await r.json();
      setStore((prev) => ({
        ...(prev || {}),
        dailyReviews: {
          ...((prev && prev.dailyReviews) || {}),
          [dateKey]: { generatedAt: new Date().toISOString(), sessionCount: aggregate.sessionCount, ...data },
        },
      }));
    } catch {
      setErr("La génération du bilan a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-génération : une seule fois par (jour + nombre de prises). Déclenchée
  // hors du corps synchrone de l'effet pour ne pas setState pendant le rendu.
  useEffect(() => {
    if (aggregate.sessionCount < 1) return;
    if (review && !stale) return;
    const key = `${dateKey}:${aggregate.sessionCount}`;
    if (genGuard.current === key) return;
    genGuard.current = key;
    Promise.resolve().then(generate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, aggregate.sessionCount, review, stale]);

  // L'historique est stocké du plus récent au plus ancien → find = dernière prise.
  const last = (sessions || []).find((s) => s.mode === mode);
  const lastHasContent = !!last && (
    !!last.summary ||
    (last.strengths && last.strengths.length) ||
    (last.improvements && last.improvements.length) ||
    (last.tips && last.tips.length) ||
    (last.vocabSuggestions && last.vocabSuggestions.length)
  );

  if (aggregate.sessionCount < 1 && !review && !lastHasContent) {
    return (
      <div style={{ ...card, fontSize: 13, color: T.textMut, textAlign: "center", padding: 32 }}>
        Le coach t&apos;écrira ici son bilan dès ta première prise enregistrée.
      </div>
    );
  }

  const axisDefs = [...SCORE_AXES, ...AUDIO_AXES];

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={sectionTitle}>Ton coach</div>
        {aggregate.sessionCount > 0 && (
          <span style={{ fontSize: 12, color: T.textMut }}>
            {aggregate.sessionCount} prise{aggregate.sessionCount > 1 ? "s" : ""} aujourd&apos;hui
          </span>
        )}
        {aggregate.sessionCount > 0 && (
          <button type="button" style={{ ...ghost(loading), marginLeft: "auto" }} onClick={generate} disabled={loading}>
            {loading ? <Loader2 size={14} className="anim-spin" /> : <RefreshCw size={14} />}
            {review ? "Régénérer" : "Générer le bilan"}
          </button>
        )}
      </div>

      {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}
      {loading && !review && <div style={{ fontSize: 13, color: T.textSub }}>Analyse de ta séance en cours…</div>}

      {review && (
        <>
          {stale && (
            <div style={{ fontSize: 12, color: T.amber }}>
              De nouvelles prises depuis ce bilan — clique sur « Régénérer ».
            </div>
          )}
          {review.summary && <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>{review.summary}</div>}

          {review.priority && (
            <div style={{ background: SURFACE, borderRadius: 8, padding: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Sparkles size={16} color={T.text} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: T.text }}>
                <span style={{ fontWeight: 700 }}>Priorité n°1 : </span>{review.priority}
              </div>
            </div>
          )}

          {Array.isArray(review.dayPlan) && review.dayPlan.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: T.text, opacity: 0.5, fontWeight: 500, marginBottom: 8 }}>À travailler maintenant</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {review.dayPlan.map((t, i) => (
                  <div key={i} style={{ background: SURFACE, borderRadius: 10, padding: 12, display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t.title}</div>
                      {t.why && <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>{t.why}</div>}
                    </div>
                    {t.mode && modeLabel(t.mode) && (
                      <button type="button" style={ghost(false)} onClick={() => onOpenTab(t.mode)}>
                        {modeLabel(t.mode)} <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(review.weekPlan) && review.weekPlan.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: T.text, opacity: 0.5, fontWeight: 500, marginBottom: 8 }}>Cette semaine</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {review.weekPlan.map((t, i) => (
                  <li key={i} style={{ fontSize: 13, color: T.textSub }}>
                    <span style={{ fontWeight: 700, color: T.text }}>{t.title}</span>{t.why ? ` — ${t.why}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.axisReview && (
            <details style={{ fontSize: 13 }}>
              <summary style={{ cursor: "pointer", color: T.textSub, fontWeight: 600 }}>Détail par critère</summary>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {axisDefs.map((ax) => (review.axisReview[ax.id] ? (
                  <div key={ax.id} style={{ fontSize: 12, color: T.textSub }}>
                    <span style={{ fontWeight: 700, color: T.text }}>{ax.label} : </span>{review.axisReview[ax.id]}
                  </div>
                ) : null))}
              </div>
            </details>
          )}

          {review.generatedAt && (
            <div style={{ fontSize: 11, color: T.textMut }}>Bilan généré le {fmtDate(review.generatedAt)}</div>
          )}
        </>
      )}

      {lastHasContent && (
        <details style={{ fontSize: 13, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12 }}>
          <summary style={{ cursor: "pointer", color: T.textSub, fontWeight: 600 }}>
            Retour de ta dernière prise « {modeLabel(mode)} »
            {last.date && <span style={{ color: T.textMut, fontWeight: 500 }}> · {fmtDate(last.date)}</span>}
          </summary>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
            {last.summary && <div style={{ fontSize: 13, color: T.textSub, fontStyle: "italic" }}>{last.summary}</div>}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <FeedbackList title="Points forts" icon={<Check size={15} color={T.green} />} color={T.green} items={last.strengths} />
              <FeedbackList title="À améliorer" icon={<ChevronRight size={15} color={T.amber} />} color={T.amber} items={last.improvements} />
              <FeedbackList title="Conseils" icon={<Lightbulb size={15} color={T.blue} />} color={T.blue} items={last.tips} />
            </div>
            <VocabSuggestions items={last.vocabSuggestions} />
          </div>
        </details>
      )}
    </div>
  );
}

/* Réécoute des prises passées de l'exercice courant (enregistrements cloud).
 * L'URL signée n'est demandée qu'au clic sur « Écouter ». */
function RecordingsPanel({ sessions, mode }) {
  const { getAudioUrl } = useEloquenceAudio();
  const [urls, setUrls] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  const items = (sessions || []).filter((s) => s.mode === mode && s.audioPath).slice(0, 10);
  if (items.length === 0) return null;

  const listen = async (s) => {
    if (urls[s.id]) return;
    setLoadingId(s.id);
    const url = await getAudioUrl(s.audioPath);
    setLoadingId(null);
    if (url) setUrls((prev) => ({ ...prev, [s.id]: url }));
  };

  return (
    <details style={card}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: T.text }}>
        Tes enregistrements ({items.length})
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {items.map((s) => (
          <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: scoreColor(s.overall), color: T.onSolid, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {s.overall}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{fmtDate(s.date)}</div>
                {s.summary && (
                  <div style={{ fontSize: 12, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.summary}</div>
                )}
              </div>
              {!urls[s.id] && (
                <button type="button" style={ghost(false)} onClick={() => listen(s)} disabled={loadingId === s.id}>
                  {loadingId === s.id
                    ? <Loader2 size={14} className="anim-spin" />
                    : <Volume2 size={14} />}
                  Écouter
                </button>
              )}
            </div>
            {urls[s.id] && <audio controls autoPlay src={urls[s.id]} style={{ width: "100%", height: 38 }} />}
          </div>
        ))}
      </div>
    </details>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════ */
const TABS = [
  { id: EXERCISE_MODES.articulation, label: "Articulation" },
  { id: EXERCISE_MODES.reading,      label: "Lecture" },
  { id: EXERCISE_MODES.speaking,     label: "Parole" },
];

// Ne conserve que les quatorze derniers jours de compteurs de répétitions : au-delà
// ils ne servent plus à rien et alourdiraient le state synchronisé.
function trimReps(reps) {
  return Object.fromEntries(
    Object.entries(reps).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)
  );
}

export default function EloquencePage() {
  const [tab, setTab] = useState(EXERCISE_MODES.articulation);
  const [store, setStore, hydrated] = useCloudState(ELOQ_STORAGE_KEY, ELOQ_CLOUD_KEY, { sessions: [] });

  // Mémoïsé : `(store && store.sessions) || []` recrée un tableau vide à chaque
  // rendu tant qu'aucune prise n'existe, ce qui relancerait tous les calculs.
  const sessions = useMemo(() => (store && store.sessions) || [], [store]);
  const dateKey = todayKey();
  const reps = useMemo(() => ((store && store.reps) || {})[dateKey] || {}, [store, dateKey]);

  /* Migration : les prises enregistrées sous les six anciens onglets sont
     réétiquetées vers les trois nouveaux modes, sinon leur historique
     disparaîtrait des courbes. Après hydratation seulement — avant, on
     réécrirait la valeur par défaut par-dessus les données du cloud. */
  useEffect(() => {
    if (!hydrated) return;
    const migrated = migrateEloquenceStore(store);
    // Référence identique = rien à réétiqueter : on n'écrit pas, sinon chaque
    // montage de la page déclencherait un upsert Supabase pour rien.
    if (migrated && migrated !== store) setStore(migrated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Compteurs de répétitions du jour (articulation).
  const setRep = (id, next) => setStore((prev) => {
    const all = (prev && prev.reps) || {};
    const day = all[dateKey] || {};
    return { ...(prev || {}), reps: trimReps({ ...all, [dateKey]: { ...day, [id]: next(day[id] || 0) } }) };
  });
  const incRep = (id, max) => setRep(id, (n) => Math.min(max, n + 1));
  const resetRep = (id) => setRep(id, () => 0);

  /* ── Chiffre héros + mini-KPI ──
     Le périmètre suit l'exercice choisi, comme le P&L suit le compte affiché. */
  const scoped = useMemo(() => {
    const list = sessions.filter((s) => s.mode === tab);
    return { list, label: modeLabel(tab) };
  }, [sessions, tab]);

  const hero = useMemo(() => {
    const list = scoped.list;
    // Régularité : jours consécutifs travaillés en remontant depuis aujourd'hui.
    // On compte des JOURS distincts, pas des prises — trois prises le même jour
    // ne font pas trois jours de suite. Les compteurs d'articulation comptent
    // aussi : une séance de virelangues sans enregistrement reste une séance.
    const days = new Set(sessions.map((s) => String(s.date || "").slice(0, 10)));
    for (const [day, counts] of Object.entries((store && store.reps) || {})) {
      if (Object.values(counts || {}).some((n) => n > 0)) days.add(day);
    }
    let streak = 0;
    const cur = new Date();
    for (;;) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      if (!days.has(key)) break;
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    }

    if (list.length === 0) return { score: null, delta: null, count: 0, wpm: null, fillers: null, streak };

    const overalls = [...list].reverse().map((s) => s.overall || 0);
    const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const wpms = list.map((s) => s.wpm).filter((v) => typeof v === "number" && v > 0);
    const fillers = list.map((s) => s.fillerCount).filter((v) => typeof v === "number");

    return {
      score: overalls[overalls.length - 1],
      delta: seriesTrend(overalls),
      count: list.length,
      wpm: wpms.length ? mean(wpms) : null,
      fillers: fillers.length ? mean(fillers) : null,
      streak,
    };
  }, [scoped.list, sessions, store]);

  const wpmTone = hero.wpm == null ? undefined : describeWpm(hero.wpm).tone === "green" ? "pos" : describeWpm(hero.wpm).tone === "red" ? "neg" : undefined;

  // Enregistre une prise dans l'historique (en tête, limité à 100).
  const recordSession = ({ mode, r }) => {
    if (!r || !r.analysis) return;
    const entry = {
      id: uid(),
      date: new Date().toISOString(),
      mode,
      overall: r.analysis.overall != null ? r.analysis.overall : overallScore(r.analysis.scores),
      scores: r.analysis.scores,
      wpm: r.wpm,
      fillerCount: r.fillerCount,
      // Verdict des quatre repères, réduit à son statut : c'est ce qui sert au
      // suivi « repères tenus », et ça pèse quatre chaînes au lieu de quatre objets.
      checkStatus: Object.fromEntries((r.checks || []).map((c) => [c.id, c.status])),
      // Conseils et remarques du coach, conservés pour être revus avant la prochaine prise.
      summary: r.analysis.summary || "",
      strengths: Array.isArray(r.analysis.strengths) ? r.analysis.strengths : [],
      improvements: Array.isArray(r.analysis.improvements) ? r.analysis.improvements : [],
      tips: Array.isArray(r.analysis.tips) ? r.analysis.tips : [],
      vocabSuggestions: Array.isArray(r.analysis.vocabSuggestions) ? r.analysis.vocabSuggestions : [],
      // Chemin de l'enregistrement dans Supabase Storage (réécoute depuis l'historique).
      audioPath: r.audioPath || null,
      // Analyse du son : mesures acoustiques, sous-scores déterministes, écoute IA.
      audioMetrics: r.audioMetrics || null,
      audioScores: r.audioScores || null,
      voiceAnalysis: r.voiceAnalysis || null,
    };
    setStore((prev) => {
      const list = (prev && prev.sessions) || [];
      return { ...(prev || {}), sessions: [entry, ...list].slice(0, 100) };
    });
  };

  if (useFirstLoad(hydrated, ELOQ_STORAGE_KEY)) {
    return (
      <SkeletonScreen gap={28}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {/* Le score tient sur une ligne de 22 px, pas sur la boîte de 28. */}
            <Skeleton width={148} height={22} radius={8} />
            <Skeleton width={210} height={16} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {[104, 96, 118].map((w, i) => <Skeleton key={i} width={w} height={34} radius={999} />)}
          </div>
        </div>
        <SkeletonStats count={4} />
        <SkeletonCard><SkeletonList rows={4} avatar={false} /></SkeletonCard>
      </SkeletonScreen>
    );
  }

  return (
    <div className="anim-1" style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: "var(--font-sans)" }}>
      {/* ═══ 2. CHIFFRE HÉROS + MINI-KPI + SÉLECTEUR D'EXERCICE ═══ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Deux tons comme `HeroAmount` : le score en encre pleine, son
                dénominateur en gris — le « / 100 » n'est pas la valeur. */}
            <div style={{ fontSize: 28, fontWeight: 500, lineHeight: "22px", letterSpacing: -0.2, whiteSpace: "nowrap" }}>
              <span style={{ color: hero.score == null ? T.numMuted : scoreColor(hero.score) }}>
                {hero.score == null ? "—" : hero.score}
              </span>
              <span style={{ color: T.numMuted }}> / 100</span>
            </div>
            {hero.delta != null && hero.delta !== 0 && (
              <span
                title="Écart entre tes prises récentes et les plus anciennes"
                style={{ fontSize: 13, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: hero.delta > 0 ? T.pnlPos : T.pnlNeg }}
              >
                {hero.delta > 0 ? `▲ +${hero.delta}` : `▼ ${hero.delta}`}
              </span>
            )}
            <span style={{ fontSize: 13, color: T.textSub, whiteSpace: "nowrap" }}>{scoped.label}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
            <MiniKpi label="Prises" value={String(hero.count)} />
            <MiniKpi label="Régularité" value={hero.streak > 0 ? `${hero.streak} j` : "—"} tone={hero.streak >= 3 ? "pos" : undefined} />
            <MiniKpi label="Débit moyen" value={hero.wpm != null ? `${hero.wpm} mots/min` : "—"} tone={wpmTone} />
            <MiniKpi
              label="Tics de langage"
              value={hero.fillers != null ? String(hero.fillers) : "—"}
              tone={hero.fillers == null ? undefined : hero.fillers <= 2 ? "pos" : hero.fillers >= 6 ? "neg" : undefined}
            />
          </div>
        </div>

        {/* Sélecteur d'exercice : la brique des autres pages. Les trois libellés
            reposent sur le fond de la page ; seul l'actif porte un bloc blanc. */}
        <div className="scroll-thin" style={{ maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <PeriodPills value={tab} onChange={setTab} options={TABS} track size={14} />
        </div>
      </div>

      {/* ═══ 3. LES QUATRE REPÈRES ═══ toujours visibles : c'est la consigne
          permanente, et exactement ce qui sera mesuré sur la prise suivante. */}
      <SpeechRulesBar />

      {/* ═══ 4. L'EXERCICE ═══ le cœur de la page */}
      {tab === EXERCISE_MODES.articulation && (
        <ArticulationTab reps={reps} incRep={incRep} resetRep={resetRep} onSession={recordSession} />
      )}
      {tab === EXERCISE_MODES.reading && <ReadingTab onSession={recordSession} />}
      {tab === EXERCISE_MODES.speaking && <SpeakingTab onSession={recordSession} />}

      {/* ═══ 5. LE SUIVI ═══ la mesure à gauche, ce qui se lit à droite.
          `tr4de-eloq-follow` porte le repli en une colonne (globals.css). */}
      <div className="tr4de-eloq-follow" style={{
        display: "grid", gridTemplateColumns: "minmax(330px, 400px) minmax(0, 1fr)",
        gap: 12, alignItems: "start",
      }}>
        <ProgressPanel sessions={sessions} mode={tab} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <CoachPanel sessions={sessions} store={store} setStore={setStore} mode={tab} onOpenTab={setTab} />
          <RecordingsPanel sessions={sessions} mode={tab} />
        </div>
      </div>
    </div>
  );
}
