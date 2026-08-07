"use client";

import React, { useEffect, useRef, useState } from "react";
import { t, useLang } from "@/lib/i18n";
const TIMER_KEY = "tr4de_focus_timer_v1";
const loadTimer = () => {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(TIMER_KEY) || "null"); } catch { return null; }
};
const saveTimer = (s) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(s)); } catch {}
};
import { Play, Pause, RotateCcw, SkipForward, Square, Coffee, Focus, Flame, CheckCircle2, Pencil, Check, X } from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { notify, ensureNotifyPermission } from "@/lib/notify";
import { Stat } from "@/components/ui/Stat";
import { T as BaseT } from "@/lib/ui/tokens";

const T = { ...BaseT };

const LOG_KEY = "tr4de_focus_sessions";

const MODES = {
  work:       { id: "work",       label: "Focus",        color: "#16A34A", duration: 25 * 60 },
  shortBreak: { id: "shortBreak", label: "Pause",        color: "#3B82F6", duration: 5 * 60 },
  longBreak:  { id: "longBreak",  label: "Longue pause", color: "#6366F1", duration: 15 * 60 },
  stopwatch:  { id: "stopwatch",  label: "Chrono",       color: "#0D0D0D", duration: 0, manual: true },
};
const DURATIONS_KEY = "tr4de_focus_durations_v1";
const loadDurations = () => {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(DURATIONS_KEY) || "null"); } catch { return null; }
};
const saveDurations = (d) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(DURATIONS_KEY, JSON.stringify(d)); } catch {}
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtMMSS = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};
const fmtDuration = (secs) => {
  const m = Math.round(secs / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
  }
  return `${m} min`;
};

export default function FocusTimerPage() {
  useLang();
  const [sessions, setSessions] = useCloudState(LOG_KEY, "focus_sessions", []);

  // Custom durations per mode (persisted)
  const [durations, setDurations] = useState(() => {
    const saved = loadDurations() || {};
    return {
      work: saved.work ?? MODES.work.duration,
      shortBreak: saved.shortBreak ?? MODES.shortBreak.duration,
      longBreak: saved.longBreak ?? MODES.longBreak.duration,
    };
  });
  useEffect(() => { saveDurations(durations); }, [durations]);

  // Timer state — endAt is the source of truth when running
  const initial = (typeof window !== "undefined" ? loadTimer() : null) || {};
  const [mode, setMode] = useState(initial.mode || "work");
  const [taskLabel, setTaskLabel] = useState(initial.taskLabel || "");
  const [endAt, setEndAt] = useState(initial.endAt || null);
  const [pausedRemaining, setPausedRemaining] = useState(
    initial.pausedRemaining ?? (durations[initial.mode || "work"] || 0)
  );
  // Stopwatch state
  const [swStartAt, setSwStartAt] = useState(initial.swStartAt || null);
  const [swPausedElapsed, setSwPausedElapsed] = useState(initial.swPausedElapsed || 0);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationDraft, setDurationDraft] = useState("");
  const [durationUnit, setDurationUnit] = useState("min"); // "min" | "h"
  const [, setNowTick] = useState(Date.now());
  const completedRef = useRef(false);

  const isStopwatch = mode === "stopwatch";
  const running = isStopwatch ? swStartAt != null : endAt != null;
  const modeDuration = durations[mode] || 0;
  const elapsed = isStopwatch
    ? swPausedElapsed + (running ? Math.floor((Date.now() - swStartAt) / 1000) : 0)
    : 0;
  const remaining = isStopwatch
    ? elapsed
    : (running ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) : pausedRemaining);
  const modeConf = { ...MODES[mode], duration: modeDuration };

  // Tick (only while running)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  // Force-refresh display when the tab becomes visible again
  useEffect(() => {
    const refresh = () => setNowTick(Date.now());
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  // Auto-complete when remaining hits 0 (countdown only)
  useEffect(() => {
    if (!isStopwatch && running && remaining === 0 && !completedRef.current) {
      completedRef.current = true;
      onSessionComplete();
    }
    if (!running) completedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remaining]);

  // Persist
  useEffect(() => {
    saveTimer({ mode, taskLabel, endAt, pausedRemaining, swStartAt, swPausedElapsed });
  }, [mode, taskLabel, endAt, pausedRemaining, swStartAt, swPausedElapsed]);

  const logSession = (durationSec, label) => {
    if (durationSec <= 0) return;
    setSessions(prev => [{ id: Date.now(), date: todayIso(), label: label || "Session de focus", duration: durationSec, completedAt: new Date().toISOString() }, ...prev]);
  };

  const onSessionComplete = () => {
    if (mode === "work") logSession(durations.work, taskLabel.trim() || "Session de focus");
    void notify("tao trade — Timer", {
      body: mode === "work" ? "Session terminée, fais une pause !" : "Pause terminée, retour au focus.",
    });
    setEndAt(null);
    setPausedRemaining(durations[mode] || 0);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setEndAt(null);
    setPausedRemaining(durations[newMode] || 0);
    setSwStartAt(null);
    setSwPausedElapsed(0);
  };

  const toggleRun = () => {
    // Au premier démarrage, on s'assure d'avoir l'autorisation de notifier.
    void ensureNotifyPermission();
    if (isStopwatch) {
      if (running) {
        setSwPausedElapsed(elapsed);
        setSwStartAt(null);
      } else {
        setSwStartAt(Date.now());
      }
      return;
    }
    if (running) {
      setPausedRemaining(remaining);
      setEndAt(null);
    } else {
      completedRef.current = false;
      setEndAt(Date.now() + pausedRemaining * 1000);
    }
  };
  const reset = () => {
    if (isStopwatch) {
      setSwStartAt(null);
      setSwPausedElapsed(0);
      return;
    }
    setEndAt(null);
    setPausedRemaining(modeDuration);
  };
  const skip = () => {
    if (isStopwatch) {
      // Finish: log elapsed time as a session, then reset
      const total = elapsed;
      setSwStartAt(null);
      setSwPausedElapsed(0);
      logSession(total, taskLabel.trim() || "Chrono");
      void notify("tao trade — Chrono", { body: `Session enregistrée (${fmtMMSS(total)})` });
      return;
    }
    setEndAt(null);
    onSessionComplete();
  };

  const startEditDuration = () => {
    const mins = Math.round(modeDuration / 60);
    if (mins >= 60 && mins % 60 === 0) {
      setDurationUnit("h");
      setDurationDraft(String(mins / 60));
    } else {
      setDurationUnit("min");
      setDurationDraft(String(mins));
    }
    setEditingDuration(true);
  };
  const saveDuration = () => {
    const raw = parseFloat(String(durationDraft).replace(",", ".")) || 0;
    const mins = durationUnit === "h" ? Math.round(raw * 60) : Math.round(raw);
    const clamped = Math.max(1, Math.min(600, mins));
    const secs = clamped * 60;
    setDurations(prev => ({ ...prev, [mode]: secs }));
    if (!running) setPausedRemaining(secs);
    setEditingDuration(false);
  };

  const pct = isStopwatch
    ? (running ? 100 : 0)
    : (modeDuration > 0 ? 100 - (remaining / modeDuration) * 100 : 0);
  const radius = 120;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  // Aggregates
  const todaysSessions = sessions.filter(s => s.date === todayIso());
  const todayMinutes = Math.round(todaysSessions.reduce((s, x) => s + x.duration, 0) / 60);
  const weekSessions = sessions.filter(s => {
    const d = new Date(s.date + "T00:00:00");
    const diff = (new Date() - d) / (1000 * 60 * 60 * 24);
    return diff < 7;
  });
  const weekMinutes = Math.round(weekSessions.reduce((s, x) => s + x.duration, 0) / 60);

  // Streak : nombre de jours consécutifs (en remontant depuis aujourd'hui) avec ≥1 session
  const streak = (() => {
    const days = new Set(sessions.map(s => s.date));
    let count = 0;
    const cur = new Date();
    for (;;) {
      const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      if (days.has(iso)) { count++; cur.setDate(cur.getDate() - 1); }
      else break;
    }
    return count;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div id="tr4de-page-header-slot" style={{ marginLeft: "auto" }} />
      </div>

      {/* Header stats — 4 blocs collés dans un seul conteneur (séparateurs fins) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden" }}>
        <Stat flat icon={Focus}        label="Aujourd'hui"     countUp={todayMinutes} suffix="m"  subtext={`${todaysSessions.length} session${todaysSessions.length > 1 ? "s" : ""}`} size="sm" />
        <Stat flat icon={Coffee}       label="Cette semaine"   countUp={weekMinutes}  suffix="m"  subtext={`${weekSessions.length} session${weekSessions.length > 1 ? "s" : ""}`} size="sm" />
        <Stat flat icon={CheckCircle2} label="Sessions totales" countUp={sessions.length}         size="sm" />
        <Stat flat icon={Flame}        label="Streak"          countUp={streak}       suffix="j"  subtext={streak > 0 ? "jours consécutifs" : "aucun jour"} size="sm" positive={streak > 0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        {/* Timer card */}
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 6, padding: 4, background: T.accentBg, borderRadius: 999, marginBottom: 24 }}>
            {Object.values(MODES).map(m => (
              <button key={m.id} onClick={() => switchMode(m.id)}
                style={{
                  padding: "6px 14px", borderRadius: 999, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: mode === m.id ? T.white : "transparent",
                  color: mode === m.id ? T.text : T.textSub,
                  boxShadow: mode === m.id ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                  fontFamily: "inherit",
                }}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Donut */}
          <div style={{ position: "relative", width: 280, height: 280 }}>
            <svg width="280" height="280" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="140" cy="140" r={radius} fill="none" stroke={T.accentBg} strokeWidth="8" />
              {!isStopwatch && (
                <circle cx="140" cy="140" r={radius} fill="none" stroke={modeConf.color} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.25s linear" }} />
              )}
              {isStopwatch && (
                <circle cx="140" cy="140" r={radius} fill="none" stroke={modeConf.color} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${circ * 0.3} ${circ * 0.7}`}
                  style={{
                    opacity: running ? 1 : 0.3,
                    transition: "opacity .3s ease",
                    transformOrigin: "140px 140px",
                    animation: running ? "tr4de-chrono-spin 1.6s linear infinite" : "none",
                  }} />
              )}
            </svg>
            <style>{`@keyframes tr4de-chrono-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: T.text, letterSpacing: -1, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fmtMMSS(remaining)}</div>
              {taskLabel.trim() ? (
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginTop: 8, maxWidth: 200, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskLabel.trim()}</div>
              ) : (
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 }}>{modeConf.label}</div>
              )}
            </div>
          </div>

          {/* Duration editor (countdown modes only) */}
          {!isStopwatch && (
          <div style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSub }}>
            {editingDuration ? (
              <>
                <input
                  type="number" min="0" step={durationUnit === "h" ? "0.25" : "1"} autoFocus
                  value={durationDraft}
                  onChange={(e) => setDurationDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveDuration(); if (e.key === "Escape") setEditingDuration(false); }}
                  style={{ width: 60, padding: "4px 8px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, outline: "none", fontFamily: "inherit", color: T.text, background: T.white, textAlign: "center" }}
                />
                <div style={{ display: "inline-flex", padding: 2, background: T.accentBg, borderRadius: 6, gap: 1 }}>
                  {["min", "h"].map(u => (
                    <button key={u} onClick={() => setDurationUnit(u)}
                      style={{
                        padding: "2px 8px", border: "none", borderRadius: "var(--radius-field)",
                        background: durationUnit === u ? T.white : "transparent",
                        color: durationUnit === u ? T.text : T.textSub,
                        fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        boxShadow: durationUnit === u ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                      }}>
                      {u}
                    </button>
                  ))}
                </div>
                <button onClick={saveDuration} aria-label="Valider la durée" style={miniBtn(T.green, true)} title="Valider"><Check size={12} strokeWidth={2.5} /></button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 11, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>Durée</span>
                <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{fmtDuration(modeDuration)}</span>
                <button onClick={startEditDuration} disabled={running} aria-label="Modifier la durée" title={running ? "Mets en pause pour modifier" : "Modifier la durée"}
                  style={{ ...miniBtn(), opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer" }}>
                  <Pencil size={10} strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
          )}

          {/* Task label */}
          <input
            type="text" value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)}
            placeholder="Sur quoi tu travailles ?"
            style={{ marginTop: 14, width: "100%", maxWidth: 360, padding: "8px 14px", border: `1px solid ${T.border}`, borderRadius: 999, fontSize: 13, outline: "none", fontFamily: "inherit", textAlign: "center", color: T.text, background: T.white }}
          />

          {/* Controls */}
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button onClick={reset} aria-label="Réinitialiser" style={ctrlBtn(false)} title="Reset"><RotateCcw size={16} strokeWidth={1.75} /></button>
            <button onClick={toggleRun} aria-label={running ? "Mettre en pause" : "Démarrer"} style={{ ...ctrlBtn(true, modeConf.color), width: 56, height: 56 }} title={running ? "Pause" : "Start"}>
              {running ? <Pause size={20} strokeWidth={2} /> : <Play size={20} strokeWidth={2} style={{ marginLeft: 3 }} />}
            </button>
            <button onClick={skip} aria-label={isStopwatch ? "Terminer et enregistrer la session" : "Passer à la phase suivante"} style={ctrlBtn(false)} title={isStopwatch ? "Terminer & enregistrer" : "Skip"}>
              {isStopwatch ? <Square size={14} strokeWidth={2} /> : <SkipForward size={16} strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        {/* Log */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Historique</div>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {sessions.length === 0 ? (
                <div style={{ padding: "24px 14px", textAlign: "center", color: T.textSub, fontSize: 12 }}>Aucune session terminée pour le moment</div>
              ) : sessions.slice(0, 20).map((s, i) => (
                <div key={s.id} style={{ padding: "10px 14px", borderBottom: i < Math.min(sessions.length, 20) - 1 ? `1px solid ${T.border}` : "none", display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: T.textMut, marginTop: 1 }}>{new Date(s.completedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.green, flexShrink: 0 }}>{Math.round(s.duration / 60)}m</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function miniBtn(color, primary) {
  return {
    width: 22, height: 22, borderRadius: 6,
    border: primary ? "none" : `1px solid ${T.border}`,
    background: primary ? color : T.white,
    color: primary ? "#fff" : T.textSub,
    cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
}
function ctrlBtn(primary, color) {
  return {
    width: 44, height: 44, borderRadius: "50%",
    border: primary ? "none" : `1px solid ${T.border}`,
    background: primary ? (color || T.text) : T.white,
    color: primary ? "#fff" : T.textSub,
    cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
}
