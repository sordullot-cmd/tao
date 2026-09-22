"use client";

/**
 * Le chronomètre de la barre de menus — ce que l'icône affiche à côté d'elle.
 *
 * Une session qui tourne pendant que l'app est cachée ne se voit nulle part :
 * il faut rouvrir la fenêtre pour savoir combien il reste, c'est-à-dire
 * interrompre précisément ce que la session protège. D'où ce décompte, posé
 * à côté de l'icône de la barre d'état, seule surface visible sans rien ouvrir.
 *
 * DEUX MINUTEURS, UN SEUL TITRE. L'app en a deux, qui ne se connaissent pas :
 * la session de concentration avec blocage (`lib/focus/model.ts`, vivante dans
 * la coquille) et le pomodoro de la page Focus (`lib/focus/pomodoro.ts`). La
 * barre, elle, n'a qu'une ligne : la session de concentration passe devant,
 * parce qu'elle est l'engagement — le pomodoro n'est qu'un décompte.
 *
 * ⚠️ macOS SEULEMENT, et c'est assumé. `set_title` ne peint un texte que dans
 * la barre de menus ; ailleurs le plateau n'accueille qu'une icône et la
 * commande est inerte (cf. src-tauri/src/tray.rs). Rien à garder côté appelant.
 */

import { isTauri } from "@/lib/notify";
import { focusedMs, remainingMs, type RunningSession } from "@/lib/focus/model";
import { fmtClock } from "@/lib/focus/stats";
import { pomodoroClock, type PomodoroDurations, type PomodoroState } from "@/lib/focus/pomodoro";

/* Un chrono figé sans rien pour le dire ressemble à une horloge en panne. Le
   signe est collé au temps, pas séparé par une espace pleine : la barre de
   menus se décale déjà à chaque seconde qui change de chiffre. */
const PAUSED_MARK = "⏸ ";

/**
 * Le titre à afficher, ou `null` quand rien ne tourne — auquel cas l'icône
 * reste seule, comme avant.
 */
export function trayClockLabel(
  running: RunningSession | null | undefined,
  pomodoro: PomodoroState | null,
  durations: PomodoroDurations,
  now: Date = new Date()
): string | null {
  if (running) {
    const paused = Boolean(running.pausedAt);
    if (running.plannedMs) {
      const left = remainingMs(running, now) ?? 0;
      /* Terminée mais pas encore soldée : la sentinelle la clôt au tick
         suivant, inutile d'afficher le zéro entre-temps. */
      if (left > 0) return (paused ? PAUSED_MARK : "") + fmtClock(left);
    } else {
      return (paused ? PAUSED_MARK : "") + fmtClock(focusedMs(running, now));
    }
  }

  const clock = pomodoroClock(pomodoro, durations, now.getTime());
  if (!clock) return null;
  return (clock.paused ? PAUSED_MARK : "") + fmtClock(clock.ms);
}

/** Pose le titre à côté de l'icône. Sans coquille, ne fait rien. */
export async function traySetTimer(label: string | null): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("tray_set_timer", { label });
  } catch (e) {
    console.warn("[tray] chronomètre impossible", e);
  }
}
