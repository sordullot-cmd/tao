/**
 * Page « Éloquence » — les quatre repères de la parole.
 *
 * Couvre les briques pures de la refonte : les deux mesures acoustiques ajoutées
 * (bruit de fond, contour des fins de phrase), la qualification du débit sur la
 * cible 110–130 mots/minute, la notation des quatre repères, et le réétiquetage
 * des séances enregistrées sous les six anciens onglets.
 */

import { describe, it, expect } from "vitest";
import { analyzeAudioBuffer } from "@/lib/eloquenceAudioAnalysis";
import {
  SPEECH_TARGETS, describeWpm, buildCoachChecks, coachChecksScore,
  migrateEloquenceStore, EXERCISE_MODES,
} from "@/lib/eloquenceData";

/* Fabrique un faux AudioBuffer : trois « phrases » d'1,5 s séparées par 0,6 s de
 * silence, chacune terminée par un glissando de 120 Hz sur ses 500 dernières ms.
 * `dir` = -1 fin descendante, +1 montante, 0 plate. `noise` règle l'amplitude du
 * bruit de fond, donc le rapport signal/bruit mesuré. */
function fakeBuffer(dir: number, noise = 0.002) {
  const sampleRate = 16000;
  const out: number[] = [];
  let phase = 0;
  for (let p = 0; p < 3; p++) {
    const durV = 1.5;
    const n = Math.round(sampleRate * durV);
    for (let i = 0; i < n; i++) {
      const remaining = durV - i / sampleRate;
      const f = remaining < 0.5 ? 200 + dir * (0.5 - remaining) * 120 : 200;
      phase += (2 * Math.PI * f) / sampleRate;
      out.push(0.3 * Math.sin(phase));
    }
    for (let i = 0; i < Math.round(sampleRate * 0.6); i++) out.push((i % 2 ? noise : -noise));
  }
  const data = Float32Array.from(out);
  return {
    sampleRate,
    length: data.length,
    duration: data.length / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("analyzeAudioBuffer — fins de phrase", () => {
  it("découpe les groupes de souffle et voit les fins descendantes", () => {
    const m = analyzeAudioBuffer(fakeBuffer(-1))!;
    expect(m.phraseCount).toBe(3);
    expect(m.pauseCount).toBe(2);
    expect(m.endingsAnalyzed).toBe(3);
    expect(m.fallingEndings).toBe(3);
    expect(m.fallingEndRatio).toBe(1);
  });

  it("distingue une fin montante d'une fin plate", () => {
    const rising = analyzeAudioBuffer(fakeBuffer(1))!;
    expect(rising.risingEndings).toBe(3);
    expect(rising.fallingEndRatio).toBe(0);

    const flat = analyzeAudioBuffer(fakeBuffer(0))!;
    expect(flat.flatEndings).toBe(3);
    expect(flat.fallingEndRatio).toBe(0);
  });

  it("mesure le bruit de fond : un fond fort écrase le rapport signal/bruit", () => {
    const propre = analyzeAudioBuffer(fakeBuffer(-1, 0.002))!;
    // 0,02 d'amplitude reste sous le seuil de silence (12 % du pic) : le fond est
    // donc bien vu comme du silence bruité, et non comme de la parole.
    const bruyant = analyzeAudioBuffer(fakeBuffer(-1, 0.02))!;
    expect(propre.snrDb).toBeGreaterThan(SPEECH_TARGETS.snrGood);
    expect(bruyant.snrDb).toBeLessThan(propre.snrDb!);
    expect(bruyant.snrDb).toBeLessThan(SPEECH_TARGETS.snrGood);
  });

  it("ne lève jamais sur un buffer inexploitable", () => {
    expect(analyzeAudioBuffer(null as unknown as AudioBuffer)).toBeNull();
    const vide = { sampleRate: 16000, length: 4, duration: 0.00025, getChannelData: () => new Float32Array(0) };
    expect(analyzeAudioBuffer(vide as unknown as AudioBuffer)!.fallingEndRatio).toBeNull();
  });
});

describe("describeWpm", () => {
  it("place la cible sur 110–130 mots/minute", () => {
    expect(describeWpm(120).label).toBe("Dans la cible");
    expect(describeWpm(110).label).toBe("Dans la cible");
    expect(describeWpm(130).label).toBe("Dans la cible");
  });

  it("signale un débit au-delà de 150 comme trop rapide", () => {
    expect(describeWpm(140).tone).toBe("amber");
    expect(describeWpm(151).label).toBe("Trop rapide");
    expect(describeWpm(200).tone).toBe("red");
  });

  it("juge sur la cible de l'exercice quand il en impose une", () => {
    const lente = { wpmMin: 70, wpmMax: 100, wpmTooFast: 120 };
    expect(describeWpm(85, lente).label).toBe("Dans la cible");
    expect(describeWpm(85).label).not.toBe("Dans la cible");
    expect(describeWpm(130, lente).label).toBe("Trop rapide");
  });
});

describe("buildCoachChecks", () => {
  const byId = (checks: ReturnType<typeof buildCoachChecks>, id: string) =>
    checks.find((c) => c.id === id)!;

  it("rend les quatre repères, dans l'ordre", () => {
    const checks = buildCoachChecks(null, 0);
    expect(checks.map((c) => c.id)).toEqual(["pace", "silences", "noise", "endings"]);
  });

  it("valide une prise dans tous les clous", () => {
    const checks = buildCoachChecks(
      { pauseRatio: 0.2, pauseCount: 4, snrDb: 32, fallingEndRatio: 0.8, endingsAnalyzed: 5, fallingEndings: 4 },
      120
    );
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    expect(coachChecksScore(checks)).toBe(100);
  });

  it("sanctionne un débit trop rapide, un fond bruyant et des fins qui remontent", () => {
    const checks = buildCoachChecks(
      { pauseRatio: 0.02, pauseCount: 0, snrDb: 9, fallingEndRatio: 0.1, endingsAnalyzed: 6, fallingEndings: 1 },
      185
    );
    expect(byId(checks, "pace").status).toBe("bad");
    expect(byId(checks, "silences").status).toBe("bad");
    expect(byId(checks, "noise").status).toBe("bad");
    expect(byId(checks, "endings").status).toBe("bad");
    expect(coachChecksScore(checks)).toBe(20);
  });

  it("marque « non mesurable » plutôt que de deviner, et l'exclut du score", () => {
    const checks = buildCoachChecks({ pauseRatio: 0.2, pauseCount: 3 }, 120);
    expect(byId(checks, "noise").status).toBe("unknown");
    expect(byId(checks, "endings").status).toBe("unknown");
    expect(coachChecksScore(checks)).toBe(100); // seuls débit et silences comptent
    expect(coachChecksScore(buildCoachChecks(null, 0))).toBeNull();
  });
});

describe("migrateEloquenceStore", () => {
  it("réétiquette les séances des six anciens onglets vers les trois modes", () => {
    const migrated = migrateEloquenceStore({
      sessions: [
        { id: "a", mode: "diction" },
        { id: "b", mode: "freeSpeech" },
        { id: "c", mode: "structure" },
        { id: "d", mode: "drills" },
        { id: "e", mode: "reading" },
      ],
    })!;
    expect(migrated.sessions.map((s: { mode: string }) => s.mode)).toEqual([
      EXERCISE_MODES.articulation,
      EXERCISE_MODES.speaking,
      EXERCISE_MODES.speaking,
      EXERCISE_MODES.speaking,
      EXERCISE_MODES.reading,
    ]);
  });

  it("rend la même référence quand rien n'a à changer, pour ne pas réécrire le cloud", () => {
    const store = { sessions: [{ id: "a", mode: EXERCISE_MODES.reading }] };
    expect(migrateEloquenceStore(store)).toBe(store);
    expect(migrateEloquenceStore(null)).toBeNull();
    expect(migrateEloquenceStore({})).toEqual({});
  });
});
