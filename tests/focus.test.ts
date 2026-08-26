import { describe, it, expect } from "vitest";
import {
  CATCH_UP_MIN, EXIT_PHRASE, MODES, canPause, closeSession, dayKey, emptyStore, focusedMs,
  hostOf, isDone, listSize, matchesDomain, nextRun, normalizeStore, pause, progress,
  remainingMs, resume, sessionFromPreset, sessionFromSchedule, shouldFire, startSession,
  targetLabel, verdictFor, weekday, type FocusSchedule, type FocusStore, type SessionLog,
} from "@/lib/focus/model";
import {
  byBlocklist, dayTotals, daySeries, fmtClock, fmtDur, focusScore, hourHistogram, streak,
  topTargets, MIN_MS, DAY_MS,
} from "@/lib/focus/stats";

/* ── Correspondance de domaines ───────────────────────────────────────────── */

describe("correspondance de domaines", () => {
  it("couvre les sous-domaines mais pas les homographes", () => {
    expect(matchesDomain("m.youtube.com", "youtube.com")).toBe(true);
    expect(matchesDomain("youtube.com", "youtube.com")).toBe(true);
    expect(matchesDomain("notyoutube.com", "youtube.com")).toBe(false);
    expect(matchesDomain("youtube.com.evil.fr", "youtube.com")).toBe(false);
  });

  it("ignore le www et les schémas non navigables", () => {
    expect(hostOf("https://www.Instagram.com/reels")).toBe("instagram.com");
    expect(hostOf("mailto:a@b.fr")).toBeNull();
    expect(hostOf("tel:+33")).toBeNull();
    /* Une ancre interne se résout sur l'hôte courant — donc sur l'app, que le
       verdict laisse toujours passer (cf. « laisse toujours passer l'app »). */
    expect(hostOf("#ancre")).toBe(window.location.hostname);
  });
});

/* ── Verdict de blocage ───────────────────────────────────────────────────── */

describe("verdict de blocage", () => {
  const store = emptyStore();

  it("coupe ce qu'une liste retient et laisse passer le reste", () => {
    const v = verdictFor("https://www.instagram.com/p/x", store, ["bl-social"]);
    expect(v.blocked).toBe(true);
    expect(v.target).toBe("instagram");
    expect(v.list?.id).toBe("bl-social");
    expect(verdictFor("https://arxiv.org", store, ["bl-social"]).blocked).toBe(false);
  });

  it("inverse la question en mode « seuls autorisés »", () => {
    const allow: FocusStore = {
      ...store,
      blocklists: [{ id: "only", name: "Travail", color: "green", itemIds: [], custom: [{ id: "c1", name: "Arxiv", domain: "arxiv.org" }], mode: "allow" }],
    };
    expect(verdictFor("https://arxiv.org/abs/1", allow, ["only"]).blocked).toBe(false);
    expect(verdictFor("https://reddit.com", allow, ["only"]).blocked).toBe(true);
  });

  it("laisse toujours passer l'app elle-même, y compris sous une liste inversée", () => {
    // jsdom sert l'app depuis localhost : c'est l'hôte courant.
    const allow: FocusStore = {
      ...store,
      blocklists: [{ id: "only", name: "Rien", color: "green", itemIds: [], custom: [], mode: "allow" }],
    };
    expect(verdictFor(window.location.href, allow, ["only"]).blocked).toBe(false);
    expect(verdictFor("/dashboard", allow, ["only"]).blocked).toBe(false);
  });

  it("suffit qu'une seule liste coupe", () => {
    expect(verdictFor("https://youtu.be/abc", store, ["bl-social", "bl-video"]).blocked).toBe(true);
  });

  it("nomme la cible pour l'écran de blocage", () => {
    expect(targetLabel("tiktok", store)).toBe("TikTok");
    expect(targetLabel("away", store)).toBe("Sortie de l'app");
  });
});

/* ── Cycle de vie d'une session ───────────────────────────────────────────── */

describe("session", () => {
  const t0 = new Date("2026-03-02T09:00:00");
  const at = (min: number) => new Date(t0.getTime() + min * MIN_MS);

  it("décompte le temps visé", () => {
    const s = startSession({ name: "Test", durationMin: 60, blocklistIds: [], mode: "normal" }, t0);
    expect(remainingMs(s, at(20))).toBe(40 * MIN_MS);
    expect(progress(s, at(30))).toBeCloseTo(0.5);
    expect(isDone(s, at(59))).toBe(false);
    expect(isDone(s, at(60))).toBe(true);
    expect(remainingMs(s, at(90))).toBe(0); // jamais négatif
  });

  it("ne compte pas les pauses comme du temps concentré", () => {
    let s = startSession({ name: "Test", durationMin: 60, blocklistIds: [], mode: "normal" }, t0);
    s = pause(s, at(10));
    expect(focusedMs(s, at(25))).toBe(10 * MIN_MS); // le temps s'arrête pendant la pause
    s = resume(s, at(25));
    expect(focusedMs(s, at(35))).toBe(20 * MIN_MS);
    expect(isDone(s, at(70))).toBe(false); // les 15 min de pause ont décalé la fin
    expect(isDone(s, at(85))).toBe(true);
  });

  it("un chronomètre libre n'a pas de fin", () => {
    const s = startSession({ name: "Chrono", durationMin: 0, blocklistIds: [], mode: "normal" }, t0);
    expect(remainingMs(s, at(200))).toBeNull();
    expect(isDone(s, at(200))).toBe(false);
  });

  it("le mode verrouillé n'accorde aucune pause", () => {
    const locked = startSession({ name: "Nuit", durationMin: 30, blocklistIds: [], mode: "locked" }, t0);
    expect(canPause(locked)).toBe(false);
    const normal = startSession({ name: "Jour", durationMin: 30, blocklistIds: [], mode: "normal" }, t0);
    expect(canPause(normal)).toBe(true);
    expect(canPause({ ...normal, breaks: MODES.normal.breaks })).toBe(false);
  });

  it("clôt sur une entrée de journal fidèle", () => {
    const s = startSession({ name: "Deep", durationMin: 60, blocklistIds: ["bl-social"], mode: "deep" }, t0);
    const early = closeSession(s, at(25));
    expect(early.completed).toBe(false);
    expect(early.focusedMs).toBe(25 * MIN_MS);
    expect(closeSession(s, at(60)).completed).toBe(true);
  });

  it("part d'un preset avec ses réglages", () => {
    const store = emptyStore();
    const preset = store.presets.find(p => p.id === "p-deep")!;
    const s = sessionFromPreset(preset, t0);
    expect(s.plannedMs).toBe(preset.durationMin * MIN_MS);
    expect(s.mode).toBe("deep");
    expect(s.blocklistIds).toEqual(preset.blocklistIds);
  });

  it("garde la phrase de sortie en minuscules, sans accent piégeux", () => {
    expect(EXIT_PHRASE).toBe(EXIT_PHRASE.toLowerCase());
  });
});

/* ── Programmes ───────────────────────────────────────────────────────────── */

describe("programmes", () => {
  const base: FocusSchedule = {
    id: "s1", name: "Matin", presetId: null, days: [0, 1, 2, 3, 4],
    startMin: 9 * 60, durationMin: 90, enabled: true, blocklistIds: ["bl-social"],
    mode: "deep", lastFired: null,
  };
  const monday9 = new Date("2026-03-02T09:00:00"); // lundi
  expect(weekday(monday9)).toBe(0);

  it("part à l'heure, et rattrape quelques minutes", () => {
    expect(shouldFire(base, monday9)).toBe(true);
    expect(shouldFire(base, new Date("2026-03-02T09:04:00"))).toBe(true);
    expect(shouldFire(base, new Date(`2026-03-02T09:${String(CATCH_UP_MIN).padStart(2, "0")}:30`))).toBe(false);
    expect(shouldFire(base, new Date("2026-03-02T08:58:00"))).toBe(false);
  });

  it("ne part pas deux fois le même jour, ni un jour non retenu, ni suspendu", () => {
    expect(shouldFire({ ...base, lastFired: dayKey(monday9) }, monday9)).toBe(false);
    expect(shouldFire(base, new Date("2026-03-07T09:00:00"))).toBe(false); // samedi
    expect(shouldFire({ ...base, enabled: false }, monday9)).toBe(false);
  });

  it("annonce sa prochaine occurrence", () => {
    expect(nextRun(base, new Date("2026-03-02T07:00:00"))).toBe("aujourd'hui 09:00");
    expect(nextRun(base, new Date("2026-03-02T10:00:00"))).toBe("demain 09:00");
    expect(nextRun({ ...base, enabled: false }, monday9)).toBeNull();
  });

  it("hérite du preset quand il n'a pas de réglages propres", () => {
    const store = emptyStore();
    const s = sessionFromSchedule({ ...base, presetId: "p-pomo", blocklistIds: [] }, store, monday9);
    expect(s.mode).toBe("normal");
    expect(s.blocklistIds).toEqual(store.presets.find(p => p.id === "p-pomo")!.blocklistIds);
  });
});

/* ── Magasin ──────────────────────────────────────────────────────────────── */

describe("magasin", () => {
  it("se complète depuis n'importe quelle valeur lue du stockage", () => {
    expect(normalizeStore(null).blocklists.length).toBeGreaterThan(0);
    expect(normalizeStore("bruit").presets.length).toBeGreaterThan(0);
    const partial = normalizeStore({ settings: { dailyGoalMin: 30 } });
    expect(partial.settings.dailyGoalMin).toBe(30);
    expect(partial.settings.notify).toBe(true); // les autres réglages reviennent
    expect(partial.running).toBeNull();
  });

  it("compte les cibles d'une liste, catalogue et entrées libres", () => {
    const store = emptyStore();
    const social = store.blocklists.find(b => b.id === "bl-social")!;
    expect(listSize(social)).toBe(social.itemIds.length);
    expect(listSize({ ...social, custom: [{ id: "c", name: "x", domain: "x.fr" }] })).toBe(social.itemIds.length + 1);
  });
});

/* ── Statistiques ─────────────────────────────────────────────────────────── */

describe("statistiques", () => {
  const now = new Date("2026-03-10T18:00:00");
  const entry = (dayOffset: number, minutes: number, extra: Partial<SessionLog> = {}): SessionLog => {
    const start = new Date(now.getTime() - dayOffset * DAY_MS);
    start.setHours(10, 0, 0, 0);
    return {
      id: `e${dayOffset}-${minutes}`, name: "Session",
      startedAt: start.toISOString(),
      endedAt: new Date(start.getTime() + minutes * MIN_MS).toISOString(),
      plannedMs: minutes * MIN_MS, focusedMs: minutes * MIN_MS,
      mode: "deep", blocklistIds: ["bl-social"], breaks: 0, attempts: [], completed: true,
      ...extra,
    };
  };

  it("cumule une journée et rend la série de jours dans l'ordre", () => {
    const log = [entry(0, 60), entry(0, 30), entry(2, 90)];
    expect(dayTotals(log, now).focusedMs).toBe(90 * MIN_MS);
    expect(dayTotals(log, now).sessions).toBe(2);
    const series = daySeries(log, 3, now);
    expect(series).toHaveLength(3);
    expect(series[2].focusedMs).toBe(90 * MIN_MS); // aujourd'hui en dernier
    expect(series[0].focusedMs).toBe(90 * MIN_MS); // il y a deux jours
    expect(series[1].focusedMs).toBe(0);
  });

  it("ne casse pas la série sur une journée en cours", () => {
    const goal = 60 * MIN_MS;
    const log = [entry(1, 60), entry(2, 60), entry(3, 60)];
    // Rien aujourd'hui, mais les trois veilles sont pleines : la série tient.
    expect(streak(log, goal, now).current).toBe(3);
    expect(streak([...log, entry(0, 60)], goal, now).current).toBe(4);
    // Une journée trop courte rompt la chaîne.
    expect(streak([entry(1, 60), entry(2, 10), entry(3, 60)], goal, now).current).toBe(1);
  });

  it("garde le record même quand la série courante est retombée", () => {
    const goal = 60 * MIN_MS;
    const log = [entry(10, 60), entry(11, 60), entry(12, 60)];
    const s = streak(log, goal, now);
    expect(s.current).toBe(0);
    expect(s.best).toBe(3);
  });

  it("borne le score entre 0 et 100", () => {
    const settings = emptyStore().settings;
    expect(focusScore([], settings, now)).toBeGreaterThanOrEqual(0);
    const full = [0, 1, 2, 3, 4, 5, 6].map(d => entry(d, settings.dailyGoalMin));
    expect(focusScore(full, settings, now)).toBe(100);
    const noisy = full.map(e => ({ ...e, completed: false, attempts: new Array(20).fill({ target: "x", at: e.startedAt }) }));
    const score = focusScore(noisy, settings, now);
    expect(score).toBeLessThan(70);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("classe ce qui a été tenté", () => {
    const log = [entry(0, 60, {
      attempts: [
        { target: "tiktok", at: now.toISOString() },
        { target: "tiktok", at: now.toISOString() },
        { target: "away", at: now.toISOString(), awayMs: 60_000 },
      ],
    })];
    const top = topTargets(log, 7 * DAY_MS, now);
    expect(top[0]).toEqual({ target: "tiktok", count: 2 });
    expect(top.find(t => t.target === "away")?.count).toBe(1);
  });

  it("ventile le temps par liste et par heure", () => {
    const store = emptyStore();
    const log = [entry(0, 90)]; // commencée à 10 h
    expect(byBlocklist(log, store, 7 * DAY_MS, now)[0].id).toBe("bl-social");
    const bins = hourHistogram(log, 7 * DAY_MS, now);
    expect(bins[10]).toBe(60 * MIN_MS); // le débordement passe sur l'heure suivante
    expect(bins[11]).toBe(30 * MIN_MS);
  });

  it("écrit les durées comme on les lit", () => {
    expect(fmtDur(0)).toBe("—");
    expect(fmtDur(40 * MIN_MS)).toBe("40 min");
    expect(fmtDur(60 * MIN_MS)).toBe("1 h");
    expect(fmtDur(85 * MIN_MS)).toBe("1 h 25");
    expect(fmtClock(65_000)).toBe("01:05");
    expect(fmtClock(3_665_000)).toBe("1:01:05");
  });
});
