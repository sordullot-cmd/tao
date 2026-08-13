"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic, Square, Volume2, Loader2, Check, ChevronRight,
  Sparkles, RefreshCw, Lightbulb, Video, VideoOff, Clock, Ban, Eye, X,
} from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useAudioRecorder } from "@/lib/hooks/useAudioRecorder";
import { useEloquenceAudio } from "@/lib/hooks/useEloquenceAudio";
import { decodeAudioBlob, analyzeAudioBuffer, deriveAudioScores, encodeWav } from "@/lib/eloquenceAudioAnalysis";
import {
  ELOQ_STORAGE_KEY, ELOQ_CLOUD_KEY, LEVELS, LEVEL_BY_ID, SCORE_AXES, FIDELITY_AXIS, AUDIO_AXES,
  READING_TEXTS, TONGUE_TWISTERS, WARMUPS, TOPIC_THEMES, STRUCTURE_FRAMEWORKS,
  DRILLS, FRAMEWORK_BY_ID,
  EXERCISE_MODES, countWords, countFillers, countWordOccurrences, computeWpm, describeWpm, overallScore,
  getTopicsFromBank, pickRandomTopic, todayKey, buildDailyAggregate,
} from "@/lib/eloquenceData";
import { T } from "@/lib/ui/tokens";
import {
  CARD, SectionTitle, MiniKpi, PeriodPills, FIELD_BG,
} from "@/components/ui/da";

/* ─────────────── Helpers génériques ─────────────── */
// Couleur d'un score 0–100.
function scoreColor(v) {
  if (v == null) return T.textMut;
  if (v >= 80) return T.green;
  if (v >= 65) return T.blue;
  if (v >= 50) return T.amber;
  return T.red;
}
// Couleur d'un "tone" renvoyé par describeWpm.
function toneColor(tone) {
  return { green: T.green, blue: T.blue, amber: T.amber, red: T.red, mut: T.textMut }[tone] || T.textMut;
}
// Format mm:ss.
function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
// Identifiant unique côté client.
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* Styles partagés ───────────────────────────────────────────────────────────
   Portés à la nouvelle DA : la carte perd sa bordure au profit de l'ombre très
   douce `elevCard`, les boutons prennent la métrique 12 px / Medium des autres
   pages, et plus aucun blanc n'est écrit en dur — `#fff` sur un aplat `T.text`
   devenait invisible en thème sombre, où cet aplat s'éclaircit.
   `SURFACE` remplace l'ancien `T.bg` gris : la page est désormais POSÉE sur le
   gris du shell, un second gris opaque par-dessus ferait un bloc dans le bloc. */
const card = { ...CARD, padding: 20, boxSizing: "border-box" };
const SURFACE = FIELD_BG;
const pill = (active) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "6px 14px", borderRadius: 999, cursor: "pointer", border: "none",
  background: active ? T.text : FIELD_BG, color: active ? T.textInverted : T.text,
  fontSize: 12, fontWeight: 500, fontFamily: "inherit",
  transition: "background 120ms ease, color 120ms ease",
});
const ghost = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 14px", minHeight: 32, borderRadius: 999,
  border: `1px solid ${T.border}`, background: T.white, color: T.text,
  fontSize: 12, fontWeight: 500, fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  transition: "opacity 120ms ease",
});
const primary = (disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 16px", minHeight: 32, borderRadius: 999,
  border: "none", background: T.text, color: T.textInverted,
  fontSize: 12, fontWeight: 500, fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
  transition: "opacity 120ms ease",
});

/* ─────────────── Synthèse vocale (modèle à écouter) ─────────────── */
function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const speak = (text) => {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 0.95;
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

// Bouton « Écouter le modèle » réutilisable.
function ListenButton({ text }) {
  const { speaking, speak, stop, supported } = useSpeech();
  if (!supported || !text) return null;
  return (
    <button
      type="button"
      style={ghost(false)}
      onClick={() => (speaking ? stop() : speak(text))}
    >
      {speaking ? <Square size={15} /> : <Volume2 size={15} />}
      {speaking ? "Arrêter" : "Écouter le modèle"}
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

/* ─────────────── Panneau d'enregistrement + analyse IA ─────────────── */
function RecorderPanel({ mode, referenceText, topic, framework, drillGoal, onResult }) {
  const { recording, durationSec, error, supported, start, stop, reset } = useAudioRecorder();
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

      // 4) Analyse IA du texte (nourrie par les mesures) + 5) écoute réelle par le
      // modèle audio, en parallèle. L'analyse vocale est best effort (jamais bloquante).
      const analysisP = fetch("/api/ai/eloquence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, transcript: text, referenceText, topic, framework, drillGoal,
          durationSec: dur, wpm, fillerCount, fillers, audioMetrics,
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
        audioUrl, audioPath, audioMetrics, audioScores, voiceAnalysis,
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
        L'enregistrement audio n'est pas pris en charge par ce navigateur.
      </div>
    );
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {/* Animation de pulsation pour le micro */}
      <style>{`@keyframes eloqPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.45)}70%{box-shadow:0 0 0 16px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}`}</style>

      {phase === "analyzing" ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 0" }}>
          <Loader2 size={34} color={T.text} style={{ animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 14, color: T.textSub, fontWeight: 600 }}>Analyse en cours…</div>
          <div style={{ fontSize: 12, color: T.textMut }}>Transcription puis évaluation par l'IA.</div>
        </div>
      ) : (
        <>
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
            <span style={{ fontSize: 11, fontWeight: 600 }}>{recording ? "Arrêter" : "Commencer"}</span>
          </button>

          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: recording ? T.red : T.textMut }}>
            {fmtTime(durationSec)}
          </div>
          <div style={{ fontSize: 12, color: T.textMut, textAlign: "center" }}>
            {recording ? "Parle clairement, puis appuie sur Arrêter." : "Appuie pour démarrer l'enregistrement."}
          </div>
        </>
      )}

      {(error || netError) && (
        <div style={{ color: T.red, fontSize: 13, textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
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

/* ─────────────── Carte de résultats d'analyse ─────────────── */
function ResultCard({ result, showFidelity }) {
  const audioUrl = result && result.audioUrl;
  // Libère l'URL objet quand la carte disparaît ou quand l'enregistrement change.
  useEffect(() => {
    if (!audioUrl) return;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  if (!result || !result.analysis) return null;
  const { analysis, wpm, fillerCount, fillers, durationSec, transcript } = result;
  const audioRows = buildAudioRows(result.voiceAnalysis, result.audioScores);
  const heardByAI = !!result.voiceAnalysis;
  const overall = analysis.overall != null ? analysis.overall : overallScore(analysis.scores);
  const wpmInfo = describeWpm(wpm);

  // Axes à afficher (+ fidélité si pertinent et présent)
  const axes = [...SCORE_AXES];
  if (showFidelity && analysis.scores && analysis.scores.fidelity != null) axes.push(FIDELITY_AXIS);

  const topFillers = Object.entries(fillers || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
      {/* Score global */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{
          width: 92, height: 92, borderRadius: "50%", flexShrink: 0,
          background: scoreColor(overall), color: T.onSolid,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{overall}</span>
          <span style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>/ 100</span>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Score global</div>
          {analysis.summary && (
            <div style={{ fontSize: 13, color: T.textSub, marginTop: 4, fontStyle: "italic" }}>{analysis.summary}</div>
          )}
        </div>
      </div>

      {/* Barres par axe + retour critique justifiant chaque note */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {axes.map((ax) => {
          const v = analysis.scores ? analysis.scores[ax.id] : null;
          const val = typeof v === "number" ? v : 0;
          const fb = analysis.axisFeedback ? analysis.axisFeedback[ax.id] : null;
          return (
            <div key={ax.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 96, fontSize: 13, color: T.textSub, fontWeight: 600 }} title={ax.desc}>{ax.label}</div>
                <div style={{ flex: 1, height: 8, background: T.accentBg, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${val}%`, height: "100%", background: scoreColor(val), borderRadius: 999, transition: "width 400ms ease" }} />
                </div>
                <div style={{ width: 30, textAlign: "right", fontSize: 13, fontWeight: 700, color: scoreColor(val) }}>{val}</div>
              </div>
              {fb && (
                <div style={{ paddingLeft: 108, fontSize: 12.5, color: T.textSub, lineHeight: 1.5, borderLeft: `2px solid ${scoreColor(val)}`, marginLeft: 2, paddingTop: 1, paddingBottom: 1 }}>
                  {fb}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Analyse du son (voix, mélodie, +expressivité/chaleur si écoutée par l'IA) */}
      {audioRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={sectionTitle}>Analyse du son</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: heardByAI ? T.blue : T.textMut }}>
              {heardByAI ? "🎧 écoutée par l'IA" : "mesurée sur le signal"}
            </span>
          </div>
          {audioRows.map((ax) => (
            <div key={ax.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 96, fontSize: 13, color: T.textSub, fontWeight: 600 }}>{ax.label}</div>
                <div style={{ flex: 1, height: 8, background: T.accentBg, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${ax.score}%`, height: "100%", background: scoreColor(ax.score), borderRadius: 999, transition: "width 400ms ease" }} />
                </div>
                <div style={{ width: 30, textAlign: "right", fontSize: 13, fontWeight: 700, color: scoreColor(ax.score) }}>{ax.score}</div>
              </div>
              {ax.fb && (
                <div style={{ paddingLeft: 108, fontSize: 12.5, color: T.textSub, lineHeight: 1.5, borderLeft: `2px solid ${scoreColor(ax.score)}`, marginLeft: 2, paddingTop: 1, paddingBottom: 1 }}>
                  {ax.fb}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Métriques rapides */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={metricBox}>
          <div style={metricLabel}>Débit</div>
          <div style={{ ...metricVal, color: toneColor(wpmInfo.tone) }}>{wpm || 0} mpm</div>
          <div style={{ fontSize: 11, color: toneColor(wpmInfo.tone), fontWeight: 600 }}>{wpmInfo.label}</div>
        </div>
        <div style={metricBox}>
          <div style={metricLabel}>Durée</div>
          <div style={metricVal}>{fmtTime(durationSec)}</div>
        </div>
        <div style={metricBox}>
          <div style={metricLabel}>Mots de remplissage</div>
          <div style={{ ...metricVal, color: fillerCount > 5 ? T.amber : T.text }}>{fillerCount || 0}</div>
          {topFillers.length > 0 && (
            <div style={{ fontSize: 11, color: T.textMut }} title={topFillers.map(([w, n]) => `${w} ×${n}`).join(", ")}>
              {topFillers.map(([w, n]) => `${w} ×${n}`).join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Points forts / À améliorer / Conseils */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <FeedbackList title="Points forts" icon={<Check size={15} color={T.green} />} color={T.green} items={analysis.strengths} />
        <FeedbackList title="À améliorer" icon={<ChevronRight size={15} color={T.amber} />} color={T.amber} items={analysis.improvements} />
        <FeedbackList title="Conseils" icon={<Lightbulb size={15} color={T.blue} />} color={T.blue} items={analysis.tips} />
      </div>

      {/* Suggestions de vocabulaire */}
      {Array.isArray(analysis.vocabSuggestions) && analysis.vocabSuggestions.length > 0 && (
        <div>
          <div style={sectionTitle}>Dis plutôt</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {analysis.vocabSuggestions.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ color: T.textMut, textDecoration: "line-through" }}>{s.original}</span>
                <ChevronRight size={14} color={T.textMut} />
                <span style={{ color: T.green, fontWeight: 600 }}>{s.better}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Réécoute de l'enregistrement (disponible pour la session en cours) */}
      {audioUrl && (
        <div>
          <div style={sectionTitle}>Réécoute-toi</div>
          <audio controls src={audioUrl} style={{ width: "100%", height: 40 }} />
        </div>
      )}

      {/* Transcription repliable */}
      {transcript && (
        <details style={{ fontSize: 13 }}>
          <summary style={{ cursor: "pointer", color: T.textSub, fontWeight: 600 }}>Voir la transcription</summary>
          <p style={{ marginTop: 8, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{transcript}</p>
        </details>
      )}
    </div>
  );
}

/* Bloc de mesure : aplat d'encre sans bordure, libellé en minuscules atténuées
   et valeur en chiffres tabulaires — la métrique de `StatRow`/`MiniKpi`. Les
   capitales espacées et le 700 gras appartenaient à l'ancienne DA. */
const metricBox = { flex: 1, minWidth: 120, borderRadius: 8, padding: "10px 12px", background: SURFACE };
const metricLabel = { fontSize: 11, color: T.text, opacity: 0.5, fontWeight: 500 };
const metricVal = { fontSize: 18, fontWeight: 600, color: T.text, marginTop: 2, fontVariantNumeric: "tabular-nums" };
const sectionTitle = { fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 8 };

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

/* ─────────────── Pastilles de sélection de niveau ─────────────── */
function LevelFilter({ value, onChange, allLabel = "Tous" }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={pill(value === 0)} onClick={() => onChange(0)}>{allLabel}</button>
      {LEVELS.map((l) => (
        <button
          key={l.id}
          type="button"
          style={{ ...pill(value === l.id), background: value === l.id ? l.color : FIELD_BG, color: value === l.id ? T.onSolid : T.text }}
          onClick={() => onChange(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

// Badge de niveau (coloré).
function LevelBadge({ level }) {
  const l = LEVEL_BY_ID[level];
  if (!l) return null;
  return (
    <span style={{ fontSize: 11, fontWeight: 500, color: T.onSolid, background: l.color, padding: "2px 8px", borderRadius: 999 }}>
      {l.label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   ONGLET — Lecture
   ═══════════════════════════════════════════════════════════ */
function ReadingTab({ onSession }) {
  const [level, setLevel] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [result, setResult] = useState(null);

  const list = useMemo(
    () => READING_TEXTS.filter((tx) => level === 0 || tx.level === level),
    [level]
  );
  const selected = READING_TEXTS.find((tx) => tx.id === selectedId) || null;

  const handleResult = (r) => {
    setResult(r);
    onSession({ mode: "reading", r });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={lead}>Lis un texte à voix haute. L'IA évalue ta diction, ta clarté et ta fidélité au texte.</p>
      <LevelFilter value={level} onChange={(v) => { setLevel(v); }} />

      {/* Cartes de textes */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {list.map((tx) => {
          const active = tx.id === selectedId;
          return (
            <button
              key={tx.id}
              type="button"
              onClick={() => { setSelectedId(active ? null : tx.id); setResult(null); }}
              style={{
                ...card, textAlign: "left", cursor: "pointer", width: 240, fontFamily: "inherit",
                borderColor: active ? T.text : T.border, borderWidth: active ? 2 : 1,
                background: active ? T.accentBg : T.white,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: T.textMut, fontWeight: 600 }}>{tx.genre}</span>
                <LevelBadge level={tx.level} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{tx.title}</div>
            </button>
          );
        })}
      </div>

      {/* Texte sélectionné */}
      {selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.title}</div>
              <ListenButton text={selected.text} />
            </div>
            <p style={{ fontSize: 18, lineHeight: 1.8, color: T.text, margin: 0 }}>{selected.text}</p>
          </div>
          <RecorderPanel mode="reading" referenceText={selected.text} onResult={handleResult} />
          {result && <ResultCard result={result} showFidelity />}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ONGLET — Discours libre
   ═══════════════════════════════════════════════════════════ */
/* Aide-mémoire repliable des cadres de discours, à consulter pendant l'impro.
 * Réutilise STRUCTURE_FRAMEWORKS (les mêmes cadres que l'onglet « Structure »). */
function StructureCheatSheet() {
  return (
    <details style={{ ...card, padding: 0, overflow: "hidden" }}>
      <summary
        style={{
          listStyle: "none", cursor: "pointer", padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 14, fontWeight: 700, color: T.text,
        }}
      >
        <Lightbulb size={15} style={{ color: T.amber }} />
        Aide-mémoire : structures de discours
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500, color: T.textMut }}>
          Garde-en une sous les yeux
        </span>
      </summary>
      <div style={{ padding: "0 16px 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {STRUCTURE_FRAMEWORKS.map((f) => (
          <div
            key={f.id}
            style={{ flex: "1 1 280px", minWidth: 260, borderRadius: 8, padding: 14, background: SURFACE }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{f.name}</div>
            <div style={{ fontSize: 12, color: T.textMut, fontWeight: 600, marginBottom: 8 }}>{f.short}</div>
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {f.steps.map((s, i) => (
                <li key={i} style={{ fontSize: 12, color: T.textSub }}>
                  <span style={{ fontWeight: 700, color: T.text }}>{s.label}</span>{s.hint ? ` — ${s.hint}` : ""}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </details>
  );
}

function FreeSpeechTab({ onSession, presetTopic, clearPreset }) {
  const [topic, setTopic] = useState("");
  const [prep, setPrep] = useState(0); // 0 / 30 / 60
  const [countdown, setCountdown] = useState(0);
  const [result, setResult] = useState(null);

  // Pré-remplissage depuis l'onglet « Sujets ».
  useEffect(() => {
    if (presetTopic) { setTopic(presetTopic); setResult(null); clearPreset && clearPreset(); }
  }, [presetTopic, clearPreset]);

  // Compte à rebours de préparation.
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Tirage instantané depuis la banque locale (pas d'attente réseau).
  const drawTopic = () => {
    const tp = pickRandomTopic("surprise");
    if (tp) { setTopic(tp.title); setResult(null); }
  };

  const handleResult = (r) => {
    setResult(r);
    onSession({ mode: "freeSpeech", r });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={lead}>Choisis ou tire un sujet, prépare-toi, puis improvise. L'IA juge ta structure et ton vocabulaire.</p>

      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          value={topic}
          onChange={(e) => { setTopic(e.target.value); setResult(null); }}
          placeholder="Écris ton sujet, ou tire-en un au hasard…"
          style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 15, fontFamily: "inherit", color: T.text, outline: "none" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={ghost(false)} onClick={drawTopic}>
            <Sparkles size={14} /> Tirer un sujet
          </button>
          <span style={{ fontSize: 12, color: T.textMut }}>Préparation :</span>
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
          <div style={{ textAlign: "center", fontSize: 40, fontWeight: 800, color: T.amber }}>{countdown}</div>
        )}
      </div>

      {/* Aide-mémoire : structures de discours à garder sous les yeux pendant l'impro. */}
      <StructureCheatSheet />

      {topic.trim() && countdown === 0 && (
        <>
          <RecorderPanel mode="freeSpeech" topic={topic.trim()} onResult={handleResult} />
          {result && <ResultCard result={result} />}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ONGLET — Sujets (générateur)
   ═══════════════════════════════════════════════════════════ */
// Retrouve le framework de structure correspondant au libellé suggéré d'un sujet.
function findFramework(label) {
  if (!label) return null;
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const t = norm(label);
  if (!t) return null;
  return (
    STRUCTURE_FRAMEWORKS.find((f) => norm(f.name) === t) ||
    STRUCTURE_FRAMEWORKS.find((f) => t.includes(norm(f.name)) || norm(f.name).includes(t)) ||
    null
  );
}

function TopicsTab({ onPractice }) {
  const [theme, setTheme] = useState(TOPIC_THEMES[0].key);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [openStructure, setOpenStructure] = useState(null); // index de la carte dont la structure est déroulée

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

  // Pioche instantanée depuis la banque locale (sans IA).
  const pickFromBank = () => { setErr(null); setTopics(getTopicsFromBank(theme, 4)); };

  // Préchargement : on affiche d'emblée des sujets de la banque.
  useEffect(() => { setTopics(getTopicsFromBank(TOPIC_THEMES[0].key, 4)); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={lead}>Pioche dans la banque (instantané) ou génère des sujets sur mesure avec l'IA, puis lance-toi en discours libre.</p>

      {/* Grille de thèmes */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {TOPIC_THEMES.map((th) => (
          <button
            key={th.key}
            type="button"
            onClick={() => setTheme(th.key)}
            style={{ ...pill(theme === th.key), padding: "8px 14px", fontSize: 14 }}
          >
            <span>{th.emoji}</span> {th.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={ghost(false)} onClick={pickFromBank}>
          <RefreshCw size={14} /> Piocher dans la banque
        </button>
        <button type="button" style={primary(loading)} disabled={loading} onClick={generate}>
          {loading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={15} />}
          Générer avec l'IA
        </button>
      </div>

      {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}

      {/* Cartes de sujets */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {topics.map((tp, i) => {
          const fw = findFramework(tp.suggestedStructure);
          const open = openStructure === i;
          return (
            <div key={i} style={{ ...card, width: 280, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{tp.title}</div>
              {tp.angle && <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.4 }}>{tp.angle}</div>}

              {tp.suggestedStructure && (fw ? (
                <button
                  type="button"
                  onClick={() => setOpenStructure(open ? null : i)}
                  title="Voir le déroulé de la structure"
                  style={{
                    alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 11, fontWeight: 700, color: T.blue, background: T.blueBg,
                    padding: "3px 10px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <ChevronRight size={12} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }} />
                  {tp.suggestedStructure}
                </button>
              ) : (
                <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, color: T.blue, background: T.blueBg, padding: "2px 8px", borderRadius: 999 }}>
                  {tp.suggestedStructure}
                </span>
              ))}

              {/* Déroulé complet de la structure conseillée */}
              {fw && open && (
                <div style={{ background: SURFACE, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.4 }}>{fw.description}</div>
                  <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
                    {fw.steps.map((s, k) => (
                      <li key={k} style={{ fontSize: 12.5, color: T.textSub, lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700, color: T.text }}>{s.label}</span>{s.hint ? ` — ${s.hint}` : ""}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <button type="button" style={{ ...ghost(false), marginTop: 4, alignSelf: "flex-start" }} onClick={() => onPractice(tp.title)}>
                <Mic size={14} /> S'entraîner sur ce sujet
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ONGLET — Diction
   ═══════════════════════════════════════════════════════════ */
function DictionTab({ onSession }) {
  const [openWarmup, setOpenWarmup] = useState(null);
  const [level, setLevel] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [result, setResult] = useState(null);

  const twisters = useMemo(
    () => TONGUE_TWISTERS.filter((tw) => level === 0 || tw.level === level),
    [level]
  );
  const selected = TONGUE_TWISTERS.find((tw) => tw.id === selectedId) || null;

  const handleResult = (r) => {
    setResult(r);
    onSession({ mode: "diction", r });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Échauffements */}
      <div>
        <div style={blockTitle}>Échauffement</div>
        <p style={lead}>Prépare ta voix avant de t'entraîner. Pas d'enregistrement, juste à suivre.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WARMUPS.map((w) => {
            const open = openWarmup === w.id;
            return (
              <div key={w.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setOpenWarmup(open ? null : w.id)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <ChevronRight size={16} color={T.textMut} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{w.title}</span>
                  </span>
                  <span style={{ fontSize: 12, color: T.textMut }}>{w.duration}s</span>
                </button>
                {open && <div style={{ padding: "0 16px 14px 42px", fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>{w.instruction}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Virelangues */}
      <div>
        <div style={blockTitle}>Virelangues</div>
        <p style={lead}>Articule un virelangue le plus nettement possible. L'IA évalue ta diction et ta fidélité.</p>
        <div style={{ marginBottom: 12 }}>
          <LevelFilter value={level} onChange={setLevel} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {twisters.map((tw) => {
            const active = tw.id === selectedId;
            return (
              <button
                key={tw.id}
                type="button"
                onClick={() => { setSelectedId(active ? null : tw.id); setResult(null); }}
                style={{ ...card, width: 300, textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderColor: active ? T.text : T.border, borderWidth: active ? 2 : 1, background: active ? T.accentBg : T.white }}
              >
                <div style={{ marginBottom: 6 }}><LevelBadge level={tw.level} /></div>
                <div style={{ fontSize: 14, color: T.text, lineHeight: 1.4 }}>{tw.text}</div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
              <p style={{ fontSize: 22, lineHeight: 1.6, color: T.text, margin: 0, fontWeight: 600 }}>{selected.text}</p>
              <ListenButton text={selected.text} />
            </div>
            <RecorderPanel mode="diction" referenceText={selected.text} onResult={handleResult} />
            {result && <ResultCard result={result} showFidelity />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ONGLET — Structure
   ═══════════════════════════════════════════════════════════ */
function StructureTab({ onSession }) {
  const [selectedId, setSelectedId] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  const selected = STRUCTURE_FRAMEWORKS.find((f) => f.id === selectedId) || null;

  const genExercise = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/ai/eloquence/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "exercise" }),
      });
      if (!r.ok) throw new Error();
      const { exercise: ex } = await r.json();
      setExercise(ex || null);
      setResult(null);
    } catch {
      setErr("La génération a échoué. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  const handleResult = (r) => {
    setResult(r);
    onSession({ mode: "structure", r });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={lead}>Choisis un cadre, reçois un exercice, puis structure ton propos. L'IA juge le respect du plan.</p>

      {/* Cartes de frameworks */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {STRUCTURE_FRAMEWORKS.map((f) => {
          const active = f.id === selectedId;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => { setSelectedId(active ? null : f.id); setResult(null); }}
              style={{ ...card, width: 300, textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderColor: active ? T.text : T.border, borderWidth: active ? 2 : 1, background: active ? T.accentBg : T.white }}
            >
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{f.name}</div>
              <div style={{ fontSize: 12, color: T.textMut, fontWeight: 600, marginBottom: 6 }}>{f.short}</div>
              <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.4, marginBottom: 10 }}>{f.description}</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {f.steps.map((s, i) => (
                  <li key={i} style={{ fontSize: 12, color: T.textSub }}>
                    <span style={{ fontWeight: 700, color: T.text }}>{s.label}</span>
                    {s.hint ? ` — ${s.hint}` : ""}
                  </li>
                ))}
              </ol>
            </button>
          );
        })}
      </div>

      <div>
        <button type="button" style={primary(loading)} disabled={loading} onClick={genExercise}>
          {loading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={15} />}
          Générer un exercice
        </button>
      </div>
      {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}

      {/* Exercice généré */}
      {exercise && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4 }}>Exercice</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{exercise.prompt}</div>
          {exercise.framework && <div style={{ fontSize: 13, color: T.blue, fontWeight: 600 }}>Cadre conseillé : {exercise.framework}</div>}
          {Array.isArray(exercise.tips) && exercise.tips.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {exercise.tips.map((tp, i) => <li key={i} style={{ fontSize: 13, color: T.textSub }}>{tp}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Enregistrement guidé par le framework choisi */}
      {selected && (
        <>
          <div style={{ ...card }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Ton guide : {selected.name}</div>
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {selected.steps.map((s, i) => (
                <li key={i} style={{ fontSize: 13, color: T.textSub }}>
                  <span style={{ fontWeight: 700, color: T.text }}>{s.label}</span>{s.hint ? ` — ${s.hint}` : ""}
                </li>
              ))}
            </ol>
          </div>
          <RecorderPanel
            mode="structure"
            framework={{ name: selected.name, steps: selected.steps }}
            topic={exercise ? exercise.prompt : undefined}
            onResult={handleResult}
          />
          {result && <ResultCard result={result} />}
        </>
      )}
    </div>
  );
}

const lead = { fontSize: 14, color: T.textSub, lineHeight: 1.5, margin: 0 };
const blockTitle = { fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 };

/* ═══════════════════════════════════════════════════════════
   ONGLET — Défis (ateliers guidés)
   ═══════════════════════════════════════════════════════════ */
const drillInput = {
  width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 15, fontFamily: "inherit",
  color: T.text, outline: "none",
};
const drillInfoLine = {
  display: "flex", alignItems: "center", gap: 8, fontSize: 13,
  color: T.textSub, fontWeight: 600,
};
// Format d'une durée en secondes → « 1 min » / « 30 s ».
function fmtDuration(s) {
  return s >= 60 ? `${s % 60 === 0 ? s / 60 : (s / 60).toFixed(1)} min` : `${s} s`;
}

// Consigne d'un défi : accroche, description détaillée, conseils, structure conseillée.
function DrillBrief({ drill }) {
  const fw = drill.frameworkId ? FRAMEWORK_BY_ID[drill.frameworkId] : null;
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{drill.emoji}</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{drill.title}</div>
          <div style={{ fontSize: 12.5, color: T.textMut }}>{drill.tagline}</div>
        </div>
      </div>
      <p style={{ fontSize: 14, color: T.textSub, lineHeight: 1.6, margin: 0 }}>{drill.description}</p>
      {Array.isArray(drill.tips) && drill.tips.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {drill.tips.map((t, i) => (
            <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: T.textSub, lineHeight: 1.45 }}>
              <Lightbulb size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
      {fw && (
        <div style={{ background: SURFACE, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>Structure conseillée · {fw.name}</div>
          <div style={{ fontSize: 12, color: T.textMut }}>{fw.short}</div>
        </div>
      )}
    </div>
  );
}

// Bilan immédiat du défi « mot interdit » (comptage local sur la transcription).
function ForbiddenBadge({ word, count }) {
  const ok = count === 0;
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, borderColor: ok ? T.green : T.red, background: ok ? T.greenBg : T.redBg }}>
      {ok ? <Check size={20} color={T.green} /> : <Ban size={20} color={T.red} />}
      <div style={{ fontSize: 13.5, color: T.text }}>
        {ok ? (
          <>Bravo : le mot « <strong>{word}</strong> » n’est jamais sorti. 🎉</>
        ) : (
          <>Le mot interdit « <strong>{word}</strong> » est apparu <strong>{count}</strong> fois. Retente en le traquant.</>
        )}
      </div>
    </div>
  );
}

// Défi de type « record » : enregistrement + analyse IA, avec paramètres selon le défi.
function DrillRecord({ drill, onSession }) {
  const [topic, setTopic] = useState("");
  const [reference, setReference] = useState("");
  const [durationIdx, setDurationIdx] = useState(0);
  const [forbiddenWord, setForbiddenWord] = useState(drill.forbidden ? drill.forbiddenChoices[0] : "");
  const [customForbidden, setCustomForbidden] = useState("");
  const [result, setResult] = useState(null);

  const activeForbidden = drill.forbidden ? (customForbidden.trim() || forbiddenWord) : "";
  const targetSec = drill.durations ? drill.durations[durationIdx] : (drill.timerTargetSec || null);

  // Consigne finale envoyée à l'IA : base du défi + contraintes dynamiques.
  const goal = useMemo(() => {
    let g = drill.drillGoal || "";
    if (drill.durations && targetSec) g += ` Durée cible STRICTE : ${targetSec} secondes maximum.`;
    if (activeForbidden) g += ` Le mot précisément interdit est : « ${activeForbidden} ».`;
    return g;
  }, [drill, targetSec, activeForbidden]);

  const ready = drill.input === "topic" ? topic.trim().length > 0
    : drill.input === "reference" ? reference.trim().length > 0
    : true;

  const drawTopic = () => {
    const tp = pickRandomTopic("surprise");
    if (tp) { setTopic(tp.title); setResult(null); }
  };

  const handleResult = (r) => {
    const merged = activeForbidden
      ? { ...r, forbiddenWord: activeForbidden, forbiddenCount: countWordOccurrences(r.transcript, activeForbidden) }
      : r;
    setResult(merged);
    onSession({ mode: EXERCISE_MODES.drills, r: merged });
  };

  return (
    <>
      <DrillBrief drill={drill} />

      {/* Paramètres du défi */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        {drill.input === "topic" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setResult(null); }}
              placeholder={drill.topicPlaceholder}
              style={drillInput}
            />
            <button type="button" style={{ ...ghost(false), alignSelf: "flex-start" }} onClick={drawTopic}>
              <Sparkles size={14} /> Tirer un sujet
            </button>
          </div>
        )}

        {drill.input === "reference" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={reference}
              onChange={(e) => { setReference(e.target.value); setResult(null); }}
              placeholder={drill.referencePlaceholder}
              rows={5}
              style={{ ...drillInput, resize: "vertical", lineHeight: 1.5 }}
            />
            {reference.trim() && <ListenButton text={reference.trim()} />}
          </div>
        )}

        {drill.durations && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: T.textMut }}>Contrainte de temps :</span>
            {drill.durations.map((s, i) => (
              <button key={s} type="button" style={pill(durationIdx === i)} onClick={() => { setDurationIdx(i); setResult(null); }}>
                {fmtDuration(s)}
              </button>
            ))}
          </div>
        )}

        {drill.forbidden && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, color: T.textMut }}>Mot interdit :</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {drill.forbiddenChoices.map((w) => (
                <button
                  key={w}
                  type="button"
                  style={pill(!customForbidden.trim() && forbiddenWord === w)}
                  onClick={() => { setForbiddenWord(w); setCustomForbidden(""); setResult(null); }}
                >
                  {w}
                </button>
              ))}
            </div>
            <input
              value={customForbidden}
              onChange={(e) => { setCustomForbidden(e.target.value); setResult(null); }}
              placeholder="…ou saisis ton propre mot à bannir"
              style={drillInput}
            />
          </div>
        )}

        {/* Repères d'objectif */}
        {drill.targetWpmMax && (
          <div style={drillInfoLine}><Clock size={14} /> Débit cible : moins de {drill.targetWpmMax} mots/minute.</div>
        )}
        {drill.timerTargetSec && (
          <div style={drillInfoLine}><Clock size={14} /> Objectif : tiens {fmtTime(drill.timerTargetSec)} sans jamais t’arrêter.</div>
        )}
        {drill.durations && targetSec && (
          <div style={drillInfoLine}><Clock size={14} /> Vise {fmtDuration(targetSec)} maximum pour ce passage.</div>
        )}
        {activeForbidden && (
          <div style={drillInfoLine}><Ban size={14} color={T.red} /> Interdit d’urgence : « {activeForbidden} ».</div>
        )}
      </div>

      {ready && (
        <>
          <RecorderPanel
            mode={drill.analysisMode}
            topic={drill.input === "topic" ? topic.trim() : undefined}
            referenceText={drill.input === "reference" ? reference.trim() : undefined}
            drillGoal={goal}
            onResult={handleResult}
          />
          {result && drill.forbidden && result.forbiddenWord && (
            <ForbiddenBadge word={result.forbiddenWord} count={result.forbiddenCount || 0} />
          )}
          {result && <ResultCard result={result} showFidelity={drill.analysisMode === "reading"} />}
        </>
      )}
    </>
  );
}

// Défi « miroir » : webcam en mode miroir + minuteur, sans enregistrement ni analyse.
function MirrorDrill({ drill }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [err, setErr] = useState(null);
  const [remaining, setRemaining] = useState(drill.timerSec);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  const start = async () => {
    setErr(null);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) throw new Error("no-media");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setRemaining(drill.timerSec);
      setActive(true);
    } catch {
      setErr("Impossible d'accéder à la caméra. Autorise l'accès, ou fais l'exercice devant un vrai miroir.");
    }
  };

  // Branche le flux sur l'élément vidéo une fois celui-ci monté.
  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [active]);

  // Minuteur décroissant (non bloquant : la vidéo continue après 0).
  useEffect(() => {
    if (!active || remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [active, remaining]);

  // Coupe la caméra au démontage.
  useEffect(() => () => stop(), []);

  const done = active && remaining <= 0;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {active ? (
        <>
          <div style={{ position: "relative", width: "100%", maxWidth: 460, aspectRatio: "4 / 3", borderRadius: 14, overflow: "hidden", background: "#000" }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
            />
            <div style={{ position: "absolute", top: 10, right: 10, background: T.scrim, color: T.onSolid, padding: "4px 10px", borderRadius: 999, fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(remaining)}
            </div>
            <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", color: T.onSolid, fontSize: 13, textShadow: "0 1px 3px rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Eye size={14} /> Regarde tes yeux, uniquement.
            </div>
          </div>
          {done && (
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.green }}>Temps écoulé — bravo, tu as tenu 2 minutes.</div>
          )}
          <button type="button" style={ghost(false)} onClick={stop}>
            <VideoOff size={15} /> Arrêter la caméra
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={start}
            style={{
              width: 96, height: 96, borderRadius: "50%", cursor: "pointer",
              border: "none", fontFamily: "inherit", background: T.text, color: T.textInverted,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            }}
          >
            <Video size={28} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>Démarrer</span>
          </button>
          <div style={{ fontSize: 12.5, color: T.textMut, textAlign: "center" }}>
            La caméra reste sur ton appareil : rien n’est enregistré ni envoyé.
          </div>
          {err && <div style={{ color: T.red, fontSize: 13, textAlign: "center" }}>{err}</div>}
        </>
      )}
    </div>
  );
}

function DrillsTab({ onSession }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = DRILLS.find((d) => d.id === selectedId) || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={lead}>
        Des ateliers ciblés pour progresser vite : storytelling, débit, fluidité, synthèse, imitation… Choisis un défi et lance-toi.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {DRILLS.map((d) => {
          const active = d.id === selectedId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedId(active ? null : d.id)}
              style={{
                ...card, width: 240, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                borderColor: active ? T.text : T.border, borderWidth: active ? 2 : 1,
                background: active ? T.accentBg : T.white,
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              <div style={{ fontSize: 24, lineHeight: 1 }}>{d.emoji}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{d.title}</div>
              <div style={{ fontSize: 12.5, color: T.textMut, lineHeight: 1.4 }}>{d.tagline}</div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {selected.kind === "mirror" ? (
            <>
              <DrillBrief drill={selected} />
              <MirrorDrill drill={selected} />
            </>
          ) : (
            <DrillRecord key={selected.id} drill={selected} onSession={onSession} />
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Types d'exercice suivis ───────────────
 * Le score global est propre à chaque type (et au cumul global). Les sessions
 * sont déjà persistées avec leur `mode`, donc rien à stocker en plus — on
 * ventile simplement l'historique par catégorie. */
const SESSION_MODES = [
  { id: EXERCISE_MODES.reading,    label: "Lecture" },
  { id: EXERCISE_MODES.freeSpeech, label: "Discours libre" },
  { id: EXERCISE_MODES.diction,    label: "Diction" },
  { id: EXERCISE_MODES.structure,  label: "Structure" },
  { id: EXERCISE_MODES.drills,     label: "Défis" },
];

// Tendance d'une série : moyenne de la 2nde moitié (récent) moins la 1re (ancien).
function seriesTrend(vals) {
  if (!vals || vals.length < 2) return null;
  const mid = Math.floor(vals.length / 2);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return Math.round(mean(vals.slice(mid)) - mean(vals.slice(0, mid)));
}

/* ─────────────── Progression détaillée par critère ───────────────
 * Bloc de suivi du type d'exercice actuellement affiché (pas de sélecteur : il
 * suit l'onglet actif). On montre le score global propre à ce type (moyenne,
 * dernier, record, tendance + courbe) puis la moyenne et la tendance de chaque
 * critère. */
function ProgressByAxis({ sessions, mode }) {
  // Seuls les types d'exercice notés ont un suivi (« Sujets » n'enregistre rien).
  const catLabel = SESSION_MODES.find((m) => m.id === mode)?.label;
  if (!catLabel) return null;

  if (!sessions || sessions.length === 0) {
    return (
      <div style={{ ...card, fontSize: 13, color: T.textMut, textAlign: "center", padding: 32 }}>
        Commence ta première session pour suivre ta progression sur « {catLabel} ».
      </div>
    );
  }

  // Sessions de ce type d'exercice, remises en ordre chronologique
  // (l'historique est stocké du plus récent au plus ancien).
  const filtered = sessions.filter((s) => s.mode === mode);
  const chrono = [...filtered].reverse();
  const n = filtered.length;

  const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);

  // Score global unique de la catégorie.
  const overalls = chrono.map((s) => s.overall || 0);
  const avg = mean(overalls);
  const best = n ? Math.max(...overalls) : null;
  const last = n ? overalls[overalls.length - 1] : null;
  const delta = seriesTrend(overalls);

  // Moyenne + tendance par critère, calculées sur cette même catégorie.
  const allAxes = [...SCORE_AXES, FIDELITY_AXIS];
  const rows = allAxes
    .map((ax) => {
      const vals = chrono
        .map((s) => (s.scores ? s.scores[ax.id] : null))
        .filter((v) => typeof v === "number");
      if (vals.length < 1) return null;
      return { ax, avg: mean(vals), delta: seriesTrend(vals) };
    })
    .filter(Boolean);

  return (
    /* Carte, comme les blocs de statistiques des fiches de compte : ce suivi
       était posé à nu sous un filet, ce qui le faisait lire comme un pied de
       page alors que c'est la mesure des progrès. */
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={sectionTitle}>Progression · {catLabel}</div>
      {n === 0 ? (
        <div style={{ fontSize: 13, color: T.textMut }}>Pas encore de session pour « {catLabel} ».</div>
      ) : (
        <>
          {/* Score global unique de la catégorie sélectionnée */}
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
                <span>{n} session{n > 1 ? "s" : ""}</span>
                <span>Dernier <strong style={{ color: scoreColor(last) }}>{last}</strong></span>
                <span>Record <strong style={{ color: scoreColor(best) }}>{best}</strong></span>
                {delta != null && (
                  delta > 0 ? <span style={{ color: T.green, fontWeight: 700 }}>▲ +{delta}</span>
                  : delta < 0 ? <span style={{ color: T.red, fontWeight: 700 }}>▼ {delta}</span>
                  : <span style={{ color: T.textMut, fontWeight: 700 }}>= 0</span>
                )}
              </div>
              <Sparkline values={overalls} />
            </div>
          </div>

          {/* Tendance par critère */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(({ ax, avg: a, delta: d }) => (
              <div key={ax.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 96, fontSize: 13, color: T.textSub, fontWeight: 600 }} title={ax.desc}>{ax.label}</div>
                <div style={{ flex: 1, height: 8, background: T.accentBg, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${a}%`, height: "100%", background: scoreColor(a), borderRadius: 999 }} />
                </div>
                <div style={{ width: 30, textAlign: "right", fontSize: 13, fontWeight: 700, color: scoreColor(a) }}>{a}</div>
                <div style={{ width: 52, textAlign: "right", fontSize: 12, fontWeight: 700 }}>
                  {d == null ? (
                    <span style={{ color: T.textMut }}>—</span>
                  ) : d > 0 ? (
                    <span style={{ color: T.green }}>▲ +{d}</span>
                  ) : d < 0 ? (
                    <span style={{ color: T.red }}>▼ {d}</span>
                  ) : (
                    <span style={{ color: T.textMut }}>= 0</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.textMut }}>
            Moyenne sur les sessions de « {catLabel} » · tendance = écart entre tes sessions récentes et plus anciennes.
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────── Conseils de la dernière séance ───────────────
 * Rappelle, pour le type d'exercice affiché, les remarques du coach IA lors de
 * la dernière séance (résumé, points forts, axes d'amélioration, conseils,
 * suggestions de vocabulaire) pour les garder en tête avant de recommencer. */
function LastSessionAdvice({ sessions, mode }) {
  // Seuls les onglets notés ont un historique (« Sujets » n'enregistre rien).
  const catLabel = SESSION_MODES.find((m) => m.id === mode)?.label;
  if (!catLabel) return null;

  // L'historique est stocké du plus récent au plus ancien → find = dernière séance.
  const last = sessions.find((s) => s.mode === mode);
  if (!last) return null;

  const hasContent =
    !!last.summary ||
    (last.strengths && last.strengths.length > 0) ||
    (last.improvements && last.improvements.length > 0) ||
    (last.tips && last.tips.length > 0) ||
    (last.vocabSuggestions && last.vocabSuggestions.length > 0);
  if (!hasContent) return null;

  let when = "";
  try {
    when = new Date(last.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch { /* ignore */ }

  return (
    <details style={card}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Lightbulb size={16} color={T.blue} />
        Conseils de ta dernière séance « {catLabel} »
        {when && <span style={{ fontSize: 12, color: T.textMut, fontWeight: 500 }}>· {when}</span>}
      </summary>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
        {last.summary && (
          <div style={{ fontSize: 13, color: T.textSub, fontStyle: "italic" }}>{last.summary}</div>
        )}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <FeedbackList title="Points forts" icon={<Check size={15} color={T.green} />} color={T.green} items={last.strengths} />
          <FeedbackList title="À améliorer" icon={<ChevronRight size={15} color={T.amber} />} color={T.amber} items={last.improvements} />
          <FeedbackList title="Conseils" icon={<Lightbulb size={15} color={T.blue} />} color={T.blue} items={last.tips} />
        </div>
        {Array.isArray(last.vocabSuggestions) && last.vocabSuggestions.length > 0 && (
          <div>
            <div style={sectionTitle}>Dis plutôt</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {last.vocabSuggestions.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ color: T.textMut, textDecoration: "line-through" }}>{s.original}</span>
                  <ChevronRight size={14} color={T.textMut} />
                  <span style={{ color: T.green, fontWeight: 600 }}>{s.better}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

// Mini-courbe SVG (sparkline) d'une série de valeurs 0–100.
function Sparkline({ values }) {
  if (!values || values.length < 2) return null;
  const W = 100, H = 28, pad = 2;
  const max = 100, min = 0;
  const pts = values.map((v, i) => {
    const x = pad + (i * (W - 2 * pad)) / (values.length - 1);
    const y = pad + (1 - (v - min) / (max - min)) * (H - 2 * pad);
    return [x, y];
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 40, display: "block" }}>
      <polyline points={`${pad},${H - pad} ${pts.map((p) => p.join(",")).join(" ")} ${W - pad},${H - pad}`} fill="rgba(13,13,13,0.04)" stroke="none" />
      <path d={path} fill="none" stroke={scoreColor(last)} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={2.2} fill={scoreColor(last)} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════ */
const TABS = [
  { id: EXERCISE_MODES.reading,    label: "Lecture" },
  { id: EXERCISE_MODES.freeSpeech, label: "Discours libre" },
  { id: EXERCISE_MODES.topics,     label: "Sujets" },
  { id: EXERCISE_MODES.diction,    label: "Diction" },
  { id: EXERCISE_MODES.structure,  label: "Structure" },
  { id: EXERCISE_MODES.drills,     label: "Défis" },
];

/* ─────────────── Réécoute des enregistrements passés ───────────────
 * Liste les sessions de l'onglet courant qui ont un enregistrement cloud
 * (audioPath). L'URL signée n'est demandée qu'au clic sur « Écouter ». */
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

function RecordingsHistory({ sessions, mode }) {
  const { getAudioUrl } = useEloquenceAudio();
  const [urls, setUrls] = useState({});       // sessionId -> URL signée
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
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={blockTitle}>Tes enregistrements</div>
      {items.map((s) => (
        <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
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
                  ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  : <Volume2 size={14} />}
                Écouter
              </button>
            )}
          </div>
          {urls[s.id] && <audio controls autoPlay src={urls[s.id]} style={{ width: "100%", height: 38 }} />}
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Bilan de séance quotidien + plan (jour & semaine) ───────────────
 * Regroupe automatiquement les exercices de la journée, génère (une fois par
 * état) un bilan et un plan via /api/ai/eloquence/plan, et met le résultat en
 * cache dans le store (useCloudState) pour ne pas le régénérer à chaque rendu. */
function DailyReview({ sessions, store, setStore, onOpenTab }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const genGuard = useRef(null);

  const dateKey = todayKey();
  const aggregate = useMemo(() => buildDailyAggregate(sessions, dateKey), [sessions, dateKey]);
  const reviews = (store && store.dailyReviews) || {};
  const review = reviews[dateKey] || null;
  const stale = !!review && review.sessionCount < aggregate.sessionCount;

  // Fermeture du bilan, mémorisée par jour : une fois masqué il ne réapparaît
  // pas au rechargement. Réversible via la barre compacte « Afficher le bilan ».
  const dismissed = !!((store && store.dismissedReviews) || {})[dateKey];
  const setDismissed = (val) => setStore((prev) => ({
    ...(prev || {}),
    dismissedReviews: { ...((prev && prev.dismissedReviews) || {}), [dateKey]: val },
  }));

  const modeLabel = (m) => (SESSION_MODES.find((x) => x.id === m) || {}).label;

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

  // Auto-génération « bilan quotidien » : une seule fois par (jour + nb d'exercices).
  // Déclenchée hors du corps synchrone de l'effet (microtask) pour ne pas setState pendant le rendu.
  useEffect(() => {
    if (aggregate.sessionCount < 1) return;
    if (review && !stale) return;
    const key = `${dateKey}:${aggregate.sessionCount}`;
    if (genGuard.current === key) return;
    genGuard.current = key;
    Promise.resolve().then(generate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, aggregate.sessionCount, review, stale]);

  if (aggregate.sessionCount < 1 && !review) return null;

  // Bilan fermé : barre compacte discrète pour le rouvrir.
  if (dismissed) {
    return (
      <button type="button" onClick={() => setDismissed(false)}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start", padding: "8px 14px", border: `1px solid ${T.border}`, borderRadius: 999, background: T.white, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: T.textSub }}>
        <Eye size={14} /> Afficher le bilan du jour
      </button>
    );
  }

  const axisDefs = [...SCORE_AXES, ...AUDIO_AXES];

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14, borderColor: T.text }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Bilan du jour &amp; plan</div>
        <span style={{ fontSize: 12, color: T.textMut }}>
          {aggregate.sessionCount} exercice{aggregate.sessionCount > 1 ? "s" : ""} aujourd&apos;hui
        </span>
        <button type="button" style={{ ...ghost(false), marginLeft: "auto" }} onClick={generate} disabled={loading}>
          {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
          {review ? "Régénérer" : "Générer"}
        </button>
        <button type="button" title="Fermer le bilan" aria-label="Fermer le bilan" onClick={() => setDismissed(true)}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, border: `1px solid ${T.border}`, borderRadius: 999, background: T.white, cursor: "pointer", color: T.textMut, padding: 0 }}>
          <X size={16} />
        </button>
      </div>

      {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}
      {loading && !review && <div style={{ fontSize: 13, color: T.textSub }}>Analyse de ta séance en cours…</div>}

      {review && (
        <>
          {stale && (
            <div style={{ fontSize: 12, color: T.amber }}>
              De nouveaux exercices ont été faits depuis ce bilan — clique sur « Régénérer ».
            </div>
          )}
          {review.summary && <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55 }}>{review.summary}</div>}

          {review.priority && (
            <div style={{ background: FIELD_BG, borderRadius: 8, padding: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Sparkles size={16} color={T.text} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13.5, color: T.text }}>
                <span style={{ fontWeight: 700 }}>Priorité n°1 : </span>{review.priority}
              </div>
            </div>
          )}

          {Array.isArray(review.dayPlan) && review.dayPlan.length > 0 && (
            <div>
              <div style={sectionTitle}>À travailler à la prochaine séance</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {review.dayPlan.map((t, i) => (
                  <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{t.title}</div>
                      {t.why && <div style={{ fontSize: 12.5, color: T.textSub, marginTop: 2 }}>{t.why}</div>}
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
              <div style={sectionTitle}>Objectifs de la semaine</div>
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
                  <div key={ax.id} style={{ fontSize: 12.5, color: T.textSub }}>
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
    </div>
  );
}

export default function EloquencePage() {
  const [tab, setTab] = useState(EXERCISE_MODES.reading);
  const [store, setStore] = useCloudState(ELOQ_STORAGE_KEY, ELOQ_CLOUD_KEY, { sessions: [] });
  const [presetTopic, setPresetTopic] = useState(null);

  const sessions = (store && store.sessions) || [];

  /* ── Chiffre héros + mini-KPI ──────────────────────────────────────────────
     Même lecture que les fiches de compte : un chiffre qui résume, quatre
     mesures secondaires sous lui, et le sélecteur à droite. Le périmètre suit
     l'exercice choisi — comme le P&L suit le compte affiché. « Sujets »
     n'enregistre aucune séance : ce périmètre-là retombe sur toutes catégories. */
  const scoped = useMemo(() => {
    const noted = SESSION_MODES.some((m) => m.id === tab);
    const list = noted ? sessions.filter((s) => s.mode === tab) : sessions;
    const label = noted ? (SESSION_MODES.find((m) => m.id === tab) || {}).label : "Toutes catégories";
    return { list, label, noted };
  }, [sessions, tab]);

  const hero = useMemo(() => {
    const list = scoped.list;
    if (list.length === 0) return { score: null, delta: null, count: 0, wpm: null, fillers: null, streak: 0 };
    // L'historique est stocké du plus récent au plus ancien.
    const overalls = [...list].reverse().map((s) => s.overall || 0);
    const last = overalls[overalls.length - 1];
    const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const wpms = list.map((s) => s.wpm).filter((v) => typeof v === "number" && v > 0);
    const fillers = list.map((s) => s.fillerCount).filter((v) => typeof v === "number");

    /* Régularité : jours consécutifs travaillés en remontant depuis aujourd'hui.
       On compte des JOURS distincts, pas des séances — trois exercices le même
       jour ne font pas trois jours de suite. */
    const days = new Set(list.map((s) => String(s.date || "").slice(0, 10)));
    let streak = 0;
    const cur = new Date();
    for (;;) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      if (!days.has(key)) break;
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    }

    return {
      score: last,
      delta: seriesTrend(overalls),
      count: list.length,
      wpm: wpms.length ? mean(wpms) : null,
      fillers: fillers.length ? mean(fillers) : null,
      streak,
    };
  }, [scoped.list]);

  // Enregistre une session dans l'historique (en tête, limité à 100).
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
      // Conseils et remarques du coach IA, conservés pour être revus avant la prochaine séance.
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

  // Bascule vers « Discours libre » avec un sujet pré-rempli.
  const practiceTopic = (title) => {
    setPresetTopic(title);
    setTab(EXERCISE_MODES.freeSpeech);
  };

  return (
    <div className="anim-1" style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14, fontFamily: "var(--font-sans)" }}>
      {/* ═══ 1. TITRE ═══ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle action={<div id="tr4de-page-header-slot" />}>Éloquence</SectionTitle>
        <div style={{ fontSize: 14, lineHeight: "18.6px", color: T.textSub }}>
          Structure, vocabulaire, clarté, confiance &amp; diction
        </div>
      </div>

      {/* ═══ 2. CHIFFRE HÉROS + MINI-KPI + SÉLECTEUR D'EXERCICE ═══
          Les six exercices étaient un ruban d'onglets posé seul sous le titre, et
          le suivi vivait tout en bas de page. Ils partagent maintenant la même
          barre : on lit où on en est, et on choisit quoi travailler, au même
          endroit — c'est le bloc d'en-tête des fiches de compte. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
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
                title="Écart entre tes séances récentes et les plus anciennes"
                style={{
                  fontSize: 13, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                  color: hero.delta > 0 ? T.pnlPos : T.pnlNeg,
                }}
              >
                {hero.delta > 0 ? `▲ +${hero.delta}` : `▼ ${hero.delta}`}
              </span>
            )}
            <span style={{ fontSize: 13, color: T.textSub, whiteSpace: "nowrap" }}>{scoped.label}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
            <MiniKpi label="Séances" value={String(hero.count)} />
            <MiniKpi
              label="Régularité"
              value={hero.streak > 0 ? `${hero.streak} j` : "—"}
              tone={hero.streak >= 3 ? "pos" : undefined}
            />
            <MiniKpi label="Débit" value={hero.wpm != null ? `${hero.wpm} mots/min` : "—"} />
            <MiniKpi
              label="Tics de langage"
              value={hero.fillers != null ? String(hero.fillers) : "—"}
              tone={hero.fillers == null ? undefined : hero.fillers <= 2 ? "pos" : hero.fillers >= 6 ? "neg" : undefined}
            />
          </div>
        </div>

        {/* Sélecteur d'exercice : la brique des autres pages, sur sa piste
            arrondie. Il défile horizontalement en dessous de sa largeur — six
            entrées ne tiennent pas sur un écran de téléphone. */}
        <div className="scroll-thin" style={{ maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <PeriodPills value={tab} onChange={setTab} options={TABS} track size={14} />
        </div>
      </div>

      {/* ═══ 3. CE QU'IL FAUT TRAVAILLER AUJOURD'HUI ═══
          Le bilan du jour reste AVANT l'exercice : il dit quoi faire, l'exercice
          en dessous est le faire. */}
      <DailyReview sessions={sessions} store={store} setStore={setStore} onOpenTab={setTab} />

      {/* ═══ 4. L'EXERCICE ═══ le cœur de la page */}
      {tab === EXERCISE_MODES.reading && <ReadingTab onSession={recordSession} />}
      {tab === EXERCISE_MODES.freeSpeech && (
        <FreeSpeechTab onSession={recordSession} presetTopic={presetTopic} clearPreset={() => setPresetTopic(null)} />
      )}
      {tab === EXERCISE_MODES.topics && <TopicsTab onPractice={practiceTopic} />}
      {tab === EXERCISE_MODES.diction && <DictionTab onSession={recordSession} />}
      {tab === EXERCISE_MODES.structure && <StructureTab onSession={recordSession} />}
      {tab === EXERCISE_MODES.drills && <DrillsTab onSession={recordSession} />}

      {/* ═══ 5. LE SUIVI ═══
          Progression, conseils de la dernière séance et réécoute formaient trois
          bandeaux pleine largeur empilés sous l'exercice, qu'il fallait traverser
          l'un après l'autre. Deux colonnes : la mesure à gauche, ce qui se lit à
          droite. `tr4de-eloq-follow` porte le repli en une colonne (globals.css). */}
      {tab !== EXERCISE_MODES.topics && (
        <div className="tr4de-eloq-follow" style={{
          display: "grid", gridTemplateColumns: "minmax(330px, 400px) minmax(0, 1fr)",
          gap: 12, alignItems: "start",
        }}>
          <ProgressByAxis sessions={sessions} mode={tab} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <LastSessionAdvice sessions={sessions} mode={tab} />
            <RecordingsHistory sessions={sessions} mode={tab} />
          </div>
        </div>
      )}
    </div>
  );
}
