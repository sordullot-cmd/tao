import { describe, it, expect } from "vitest";
import { DEFAULT_DURATIONS, pomodoroClock, resolveDurations } from "@/lib/focus/pomodoro";
import { trayClockLabel } from "@/lib/tray/timer";
import { startSession, pause, type RunningSession } from "@/lib/focus/model";

const AT = new Date("2026-03-04T10:00:00Z");
const plus = (min: number) => new Date(AT.getTime() + min * 60_000);

const session = (durationMin: number): RunningSession =>
  startSession({ name: "Deep work", durationMin, blocklistIds: [], mode: "normal" }, AT);

const D = resolveDurations(null);

describe("chronomètre de la barre de menus", () => {
  it("décompte la session de concentration, et non le temps passé", () => {
    expect(trayClockLabel(session(30), null, D, plus(5))).toBe("25:00");
  });

  it("compte À L'ENDROIT une session sans durée : il n'y a rien à décompter", () => {
    expect(trayClockLabel(session(0), null, D, plus(7))).toBe("07:00");
  });

  it("dit la pause plutôt que de figer un chrono qui passerait pour en panne", () => {
    const paused = pause(session(30), plus(5));
    expect(trayClockLabel(paused, null, D, plus(12))).toBe("⏸ 25:00");
  });

  it("se tait sur une session arrivée à son terme, que la sentinelle va solder", () => {
    expect(trayClockLabel(session(30), null, D, plus(30))).toBeNull();
  });

  it("laisse la session de concentration passer devant le pomodoro", () => {
    const timer = { mode: "work", endAt: plus(3).getTime() };
    expect(trayClockLabel(session(30), timer, D, plus(5))).toBe("25:00");
  });

  it("montre le pomodoro quand aucune session ne tourne", () => {
    const timer = { mode: "work", endAt: plus(3).getTime() };
    expect(trayClockLabel(null, timer, D, AT)).toBe("03:00");
  });

  it("n'affiche rien quand les deux minuteurs dorment", () => {
    expect(trayClockLabel(null, null, D, AT)).toBeNull();
  });
});

describe("lecture du pomodoro", () => {
  const now = AT.getTime();

  it("distingue un minuteur au repos d'un minuteur en pause", () => {
    /* Jamais démarré : le reste vaut la durée pleine. L'afficher mettrait
       « 25:00 » dans la barre à longueur de journée. */
    expect(pomodoroClock({ mode: "work", pausedRemaining: DEFAULT_DURATIONS.work }, D, now)).toBeNull();
    expect(pomodoroClock({ mode: "work", pausedRemaining: 900 }, D, now)).toEqual({ ms: 900_000, paused: true });
  });

  it("se tait sur un compte à rebours échu pendant que la page était fermée", () => {
    expect(pomodoroClock({ mode: "work", endAt: now - 1 }, D, now)).toBeNull();
  });

  it("additionne le chrono libre à ce qu'il avait déjà accumulé", () => {
    const state = { mode: "stopwatch", swStartAt: now - 30_000, swPausedElapsed: 90 };
    expect(pomodoroClock(state, D, now)).toEqual({ ms: 120_000, paused: false });
  });

  it("ne prend pas un chrono à zéro pour un chrono suspendu", () => {
    expect(pomodoroClock({ mode: "stopwatch", swPausedElapsed: 0 }, D, now)).toBeNull();
    expect(pomodoroClock({ mode: "stopwatch", swPausedElapsed: 42 }, D, now)).toEqual({ ms: 42_000, paused: true });
  });

  it("complète les durées manquantes par celles d'origine", () => {
    expect(resolveDurations({ work: 60 })).toEqual({ ...DEFAULT_DURATIONS, work: 60 });
  });
});
