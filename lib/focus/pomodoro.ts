"use client";

/**
 * Le minuteur pomodoro — son état, hors de la page qui le dessine.
 *
 * `FocusTimerPage` gardait ses clés et ses durées pour elle, ce qui allait tant
 * qu'elle était seule à les lire. Elle ne l'est plus : la barre d'état affiche
 * le décompte de la session en cours (cf. components/TrayTimer.jsx), et une
 * seconde copie des clés serait une divergence en attente — le jour où la page
 * change de format, le chronomètre de la barre lirait du vide sans rien dire.
 *
 * ⚠️ Rien ici ne fait AVANCER le minuteur. La vérité est un instant de fin
 * (`endAt`) ou de départ (`swStartAt`) posé dans localStorage : le temps se
 * déduit de l'horloge, il ne se compte pas. C'est ce qui permet de lire le
 * décompte juste depuis la coquille alors que la page, elle, est démontée —
 * seule la page courante l'est (cf. CLAUDE.md).
 *
 * Conséquence à ne pas perdre de vue : un compte à rebours arrivé à son terme
 * pendant que la page était fermée n'est clôturé par personne. `pomodoroClock`
 * rend alors `null` plutôt que `00:00` — un zéro figé dans la barre d'état
 * ressemblerait à une panne, et la page fera le solde à sa prochaine ouverture.
 */

/** État persisté du minuteur, tel que la page l'écrit. */
export interface PomodoroState {
  mode?: string;
  taskLabel?: string;
  /** Instant de fin du compte à rebours (ms epoch), `null` à l'arrêt. */
  endAt?: number | null;
  /** Reste au moment de la pause (s). */
  pausedRemaining?: number;
  /** Départ du chronomètre libre (ms epoch), `null` à l'arrêt. */
  swStartAt?: number | null;
  /** Temps déjà accumulé par le chronomètre avant sa pause (s). */
  swPausedElapsed?: number;
}

export interface PomodoroDurations {
  work: number;
  shortBreak: number;
  longBreak: number;
}

export const POMODORO_TIMER_KEY = "tr4de_focus_timer_v1";
export const POMODORO_DURATIONS_KEY = "tr4de_focus_durations_v1";

/** Durées d'origine (s) — celles qu'on retrouve tant qu'on n'a rien réglé. */
export const DEFAULT_DURATIONS: PomodoroDurations = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const loadTimer = (): PomodoroState | null => readJson<PomodoroState>(POMODORO_TIMER_KEY);
export const saveTimer = (s: PomodoroState): void => writeJson(POMODORO_TIMER_KEY, s);

export const loadDurations = (): Partial<PomodoroDurations> | null =>
  readJson<Partial<PomodoroDurations>>(POMODORO_DURATIONS_KEY);
export const saveDurations = (d: PomodoroDurations): void => writeJson(POMODORO_DURATIONS_KEY, d);

/** Les durées réglées, complétées par celles d'origine. */
export function resolveDurations(saved: Partial<PomodoroDurations> | null): PomodoroDurations {
  return {
    work: saved?.work ?? DEFAULT_DURATIONS.work,
    shortBreak: saved?.shortBreak ?? DEFAULT_DURATIONS.shortBreak,
    longBreak: saved?.longBreak ?? DEFAULT_DURATIONS.longBreak,
  };
}

/** Ce qu'il y a à montrer d'un minuteur : un temps, et s'il avance. */
export interface PomodoroClock {
  ms: number;
  paused: boolean;
}

/**
 * Le temps du minuteur à cet instant, ou `null` s'il n'y a rien en cours.
 *
 * Le cas délicat est le compte à rebours à l'arrêt : `pausedRemaining` vaut la
 * durée pleine quand personne n'a jamais appuyé sur lecture, et un reste plus
 * court quand on a mis en pause. Les distinguer demande les durées réglées —
 * sans quoi un minuteur au repos passerait pour une session suspendue, et la
 * barre d'état afficherait « 25:00 » à longueur de journée.
 */
export function pomodoroClock(
  state: PomodoroState | null,
  durations: PomodoroDurations,
  now: number = Date.now()
): PomodoroClock | null {
  if (!state) return null;
  const mode = state.mode || "work";

  if (mode === "stopwatch") {
    const acc = Math.max(0, state.swPausedElapsed || 0);
    if (state.swStartAt) {
      return { ms: (acc + Math.max(0, Math.floor((now - state.swStartAt) / 1000))) * 1000, paused: false };
    }
    /* Un chrono à zéro n'a pas été lancé : il n'est pas suspendu, il attend. */
    return acc > 0 ? { ms: acc * 1000, paused: true } : null;
  }

  if (state.endAt) {
    const left = Math.ceil((state.endAt - now) / 1000);
    return left > 0 ? { ms: left * 1000, paused: false } : null;
  }

  const rest = Math.max(0, state.pausedRemaining ?? 0);
  const full = durations[mode as keyof PomodoroDurations] ?? DEFAULT_DURATIONS.work;
  if (rest <= 0 || rest === full) return null;
  return { ms: rest * 1000, paused: true };
}
