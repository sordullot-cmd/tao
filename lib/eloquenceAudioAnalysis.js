/**
 * eloquenceAudioAnalysis — analyse du signal audio côté navigateur.
 *
 * Boîte à outils purement côté client (Web Audio API) pour extraire des mesures
 * objectives d'un enregistrement vocal : hauteur (pitch), volume (loudness) et
 * rythme (pauses). Ces mesures alimentent les axes « Voix », « Mélodie » et
 * « Rythme » de la page Éloquence, en complément de l'analyse IA du texte.
 *
 * Aucune dépendance externe : tout est calculé à la main (fenêtrage, RMS,
 * autocorrélation) pour rester léger et fonctionner hors ligne.
 *
 * Le code est défensif : un enregistrement vide, très court ou muet ne doit
 * jamais provoquer d'erreur ni renvoyer de NaN/Infinity — on renvoie `null`
 * pour les mesures non calculables.
 */

/* ─────────────── Utilitaires internes ─────────────── */

// Remplace toute valeur non finie (NaN, Infinity) par null. Sert de garde-fou
// systématique avant de renvoyer une mesure vers l'interface.
function safeNumber(x) {
  return Number.isFinite(x) ? x : null;
}

// Médiane d'un tableau de nombres (copie triée). Renvoie null si vide.
function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Percentile (0–100) par interpolation linéaire. Renvoie null si vide.
function percentile(values, p) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// Moyenne arithmétique. Renvoie null si vide.
function mean(values) {
  if (!values || values.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

// Écart-type (population). Renvoie null si moins de 2 valeurs.
function stdev(values) {
  if (!values || values.length < 2) return null;
  const m = mean(values);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - m;
    acc += d * d;
  }
  return Math.sqrt(acc / values.length);
}

// Contraint une valeur dans [min, max].
function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// Interpolation linéaire entre a et b selon t ∈ [0, 1].
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* ─────────────── 1) Décodage d'un Blob audio ─────────────── */

/**
 * Décode un Blob (webm/ogg/wav…) en AudioBuffer via la Web Audio API.
 * @param {Blob} blob
 * @returns {Promise<AudioBuffer|null>} l'AudioBuffer décodé, ou null en cas d'échec.
 */
export async function decodeAudioBlob(blob) {
  if (!blob) return null;
  let ctx = null;
  try {
    const Ctor =
      (typeof window !== "undefined" &&
        (window.AudioContext || window.webkitAudioContext)) ||
      null;
    if (!Ctor) return null;
    ctx = new Ctor();
    const arr = await blob.arrayBuffer();
    // decodeAudioData résout avant que l'on ferme le contexte : l'AudioBuffer
    // reste utilisable même après ctx.close().
    const buffer = await ctx.decodeAudioData(arr);
    return buffer || null;
  } catch (e) {
    return null;
  } finally {
    // Fermeture propre du contexte pour libérer les ressources audio.
    try {
      if (ctx && typeof ctx.close === "function" && ctx.state !== "closed") {
        ctx.close();
      }
    } catch (e) {
      /* on ignore : la fermeture est un « best effort » */
    }
  }
}

/* ─────────────── 2) Analyse d'un AudioBuffer ─────────────── */

/**
 * @typedef {Object} AudioMetrics
 * @property {number|null} durationSec        Durée en secondes.
 * @property {number|null} voicedRatio        Part de frames voisées (0–1).
 * @property {number|null} pitchMean          Hauteur médiane en Hz.
 * @property {number|null} pitchVarSemitones  Écart-type de la hauteur en demi-tons.
 * @property {number|null} pitchRangeSemitones Étendue (p95–p5) de la hauteur en demi-tons.
 * @property {number|null} loudnessMean       RMS moyen des frames voisées.
 * @property {number|null} loudnessVar        Coefficient de variation du volume.
 * @property {number|null} pauseCount         Nombre de pauses internes ≥ 0.3 s.
 * @property {number|null} pauseRatio         Part de silence interne (0–1).
 * @property {number|null} longestPauseSec    Plus longue pause interne (s).
 * @property {number|null} noiseFloorRms      RMS médian des silences internes (bruit de fond).
 * @property {number|null} snrDb              Écart voix / bruit de fond, en dB.
 * @property {number|null} phraseCount        Groupes de souffle détectés (segments parlés).
 * @property {number|null} endingsAnalyzed    Fins de phrase exploitables (pitch fiable).
 * @property {number|null} fallingEndings     Fins de phrase à intonation descendante.
 * @property {number|null} risingEndings      Fins de phrase à intonation montante.
 * @property {number|null} flatEndings        Fins de phrase à intonation plate.
 * @property {number|null} fallingEndRatio    Part de fins descendantes (0–1).
 */

/* Mesures « vides » : renvoyées quand le signal n'est pas exploitable. Une seule
 * source pour les trois sorties de secours — un champ ajouté ici ne peut plus
 * manquer dans l'un des cas dégradés. */
function emptyMetrics(durationSec) {
  return {
    durationSec,
    voicedRatio: null,
    pitchMean: null,
    pitchVarSemitones: null,
    pitchRangeSemitones: null,
    loudnessMean: null,
    loudnessVar: null,
    pauseCount: null,
    pauseRatio: null,
    longestPauseSec: null,
    noiseFloorRms: null,
    snrDb: null,
    phraseCount: null,
    endingsAnalyzed: null,
    fallingEndings: null,
    risingEndings: null,
    flatEndings: null,
    fallingEndRatio: null,
  };
}

/**
 * Extrait les mesures acoustiques d'un AudioBuffer.
 * @param {AudioBuffer} audioBuffer
 * @returns {AudioMetrics|null} l'objet de mesures, ou null si le buffer est invalide.
 */
export function analyzeAudioBuffer(audioBuffer) {
  // Validation défensive du buffer.
  if (
    !audioBuffer ||
    typeof audioBuffer.getChannelData !== "function" ||
    !audioBuffer.sampleRate ||
    !audioBuffer.length
  ) {
    return null;
  }

  const sampleRate = audioBuffer.sampleRate;
  const durationSec = safeNumber(audioBuffer.duration);

  let data;
  try {
    data = audioBuffer.getChannelData(0);
  } catch (e) {
    return null;
  }
  if (!data || data.length === 0) return emptyMetrics(durationSec);

  // Fenêtrage : frame ~40 ms, hop ~20 ms (recouvrement 50 %).
  const frameSize = Math.max(1, Math.round(sampleRate * 0.04));
  const hopSize = Math.max(1, Math.round(sampleRate * 0.02));
  const hopSec = hopSize / sampleRate;

  // 1re passe : RMS de chaque frame.
  const frameRms = [];
  for (let start = 0; start + frameSize <= data.length; start += hopSize) {
    let acc = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = data[start + i];
      acc += s * s;
    }
    frameRms.push(Math.sqrt(acc / frameSize));
  }

  const nFrames = frameRms.length;
  if (nFrames === 0) return emptyMetrics(durationSec);

  // Seuil de silence relatif : proportionnel au RMS max, avec un plancher absolu.
  let rmsMax = 0;
  for (let i = 0; i < nFrames; i++) {
    if (frameRms[i] > rmsMax) rmsMax = frameRms[i];
  }
  const silenceThresh = Math.max(rmsMax * 0.12, 0.005);

  // Masque des frames voisées + RMS des frames voisées.
  const voicedMask = new Array(nFrames);
  const voicedRms = [];
  let voicedCount = 0;
  for (let i = 0; i < nFrames; i++) {
    const isVoiced = frameRms[i] >= silenceThresh;
    voicedMask[i] = isVoiced;
    if (isVoiced) {
      voicedCount++;
      voicedRms.push(frameRms[i]);
    }
  }

  const voicedRatio = safeNumber(voicedCount / nFrames);

  /* ── Estimation du pitch (f0) par autocorrélation ──
   * Plage recherchée : 80–400 Hz. On travaille en « lag » (décalage) :
   *   lag = sampleRate / f0  →  minLag = SR/400, maxLag = SR/80.
   * On ne retient un pic que si la clarté (autocorr normalisée) ≥ 0.5. */
  const minLag = Math.max(1, Math.floor(sampleRate / 400));
  const maxLag = Math.floor(sampleRate / 80);
  const pitches = []; // f0 fiables (Hz)
  /* Même piste de hauteur, mais indexée par frame : la liste plate `pitches`
     suffit aux statistiques globales, pas au contour d'une fin de phrase — il
     faut savoir QUAND chaque f0 a été mesurée. */
  const pitchByFrame = new Array(nFrames).fill(null);

  for (let f = 0; f < nFrames; f++) {
    if (!voicedMask[f]) continue;
    const start = f * hopSize;
    if (start + frameSize > data.length) continue;
    // Fenêtre d'analyse un peu plus large que la frame RMS pour couvrir les lags
    // longs (basses fréquences) sans sortir du signal.
    const winEnd = Math.min(data.length, start + Math.max(frameSize, maxLag * 2));
    const winLen = winEnd - start;
    if (winLen <= maxLag) continue;

    // Énergie (lag 0) pour normaliser l'autocorrélation.
    let energy = 0;
    for (let i = 0; i < winLen; i++) {
      const s = data[start + i];
      energy += s * s;
    }
    if (energy <= 0) continue;

    // Recherche du meilleur pic dans la plage de lags autorisée.
    let bestLag = -1;
    let bestCorr = 0;
    const searchMax = Math.min(maxLag, winLen - 1);
    for (let lag = minLag; lag <= searchMax; lag++) {
      let corr = 0;
      const count = winLen - lag;
      for (let i = 0; i < count; i++) {
        corr += data[start + i] * data[start + i + lag];
      }
      // Normalisation par l'énergie → clarté ∈ [-1, 1] environ.
      const norm = corr / energy;
      if (norm > bestCorr) {
        bestCorr = norm;
        bestLag = lag;
      }
    }

    // Clarté insuffisante → estimation non fiable, on saute la frame.
    if (bestLag < minLag || bestCorr < 0.5) continue;

    const f0 = sampleRate / bestLag;
    if (f0 >= 80 && f0 <= 400) {
      pitches.push(f0);
      pitchByFrame[f] = f0;
    }
  }

  // Statistiques de hauteur (en Hz puis converties en demi-tons relatifs).
  let pitchMean = null;
  let pitchVarSemitones = null;
  let pitchRangeSemitones = null;

  if (pitches.length > 0) {
    pitchMean = safeNumber(median(pitches));

    if (pitchMean && pitchMean > 0 && pitches.length >= 2) {
      // Conversion de chaque f0 en demi-tons par rapport à la médiane.
      const semis = pitches.map((f0) => 12 * Math.log2(f0 / pitchMean));
      pitchVarSemitones = safeNumber(stdev(semis));

      const p95 = percentile(semis, 95);
      const p5 = percentile(semis, 5);
      if (p95 !== null && p5 !== null) {
        pitchRangeSemitones = safeNumber(p95 - p5);
      }
    } else if (pitchMean && pitchMean > 0 && pitches.length === 1) {
      // Une seule valeur fiable : pas de variabilité mesurable.
      pitchVarSemitones = 0;
      pitchRangeSemitones = 0;
    }
  }

  // Statistiques de volume (loudness) sur les frames voisées.
  let loudnessMean = null;
  let loudnessVar = null;
  if (voicedRms.length > 0) {
    loudnessMean = safeNumber(mean(voicedRms));
    if (loudnessMean && loudnessMean > 0 && voicedRms.length >= 2) {
      const sd = stdev(voicedRms);
      if (sd !== null) {
        // Coefficient de variation borné à ≥ 0.
        loudnessVar = safeNumber(Math.max(0, sd / loudnessMean));
      }
    } else if (voicedRms.length === 1) {
      loudnessVar = 0;
    }
  }

  /* ── Détection des pauses internes ──
   * On repère les segments continus non voisés. On ignore le silence de tête et
   * de queue (avant la 1re frame voisée et après la dernière) : seules les pauses
   * « internes » comptent. Une pause est retenue si sa durée ≥ 0.3 s. */
  let pauseCount = null;
  let pauseRatio = null;
  let longestPauseSec = null;

  let firstVoiced = -1;
  let lastVoiced = -1;
  for (let i = 0; i < nFrames; i++) {
    if (voicedMask[i]) {
      if (firstVoiced === -1) firstVoiced = i;
      lastVoiced = i;
    }
  }

  /* Groupes de souffle : les segments parlés délimités par ces pauses. Ce sont
     eux qui portent les « phrases » dont on regarde la fin. */
  const MIN_PAUSE_SEC = 0.3;
  const phrases = []; // [{ startFrame, endFrame }] — bornes voisées incluses

  if (firstVoiced !== -1 && lastVoiced > firstVoiced) {
    let count = 0;
    let totalInternalSilenceSec = 0;
    let longest = 0;

    let runLen = 0; // longueur (en frames) du silence courant
    let phraseStart = firstVoiced;
    let lastVoicedSeen = firstVoiced;
    for (let i = firstVoiced; i <= lastVoiced; i++) {
      if (!voicedMask[i]) {
        runLen++;
      } else {
        if (runLen > 0) {
          const runSec = runLen * hopSec;
          if (runSec >= MIN_PAUSE_SEC) {
            count++;
            totalInternalSilenceSec += runSec;
            if (runSec > longest) longest = runSec;
            // La pause ferme le groupe de souffle en cours et en ouvre un autre.
            phrases.push({ startFrame: phraseStart, endFrame: lastVoicedSeen });
            phraseStart = i;
          }
          runLen = 0;
        }
        lastVoicedSeen = i;
      }
    }
    // Un silence qui se termine juste avant lastVoiced est déjà traité ci-dessus,
    // car lastVoiced est voisé (donc on clôture le run à cet index).
    phrases.push({ startFrame: phraseStart, endFrame: lastVoiced });

    pauseCount = safeNumber(count);
    longestPauseSec = safeNumber(longest);
    if (durationSec && durationSec > 0) {
      pauseRatio = safeNumber(clamp(totalInternalSilenceSec / durationSec, 0, 1));
    }
  } else if (firstVoiced !== -1) {
    // Une seule zone voisée, pas de pause interne possible.
    pauseCount = 0;
    pauseRatio = 0;
    longestPauseSec = 0;
    phrases.push({ startFrame: firstVoiced, endFrame: lastVoiced });
  }

  /* ── Bruit de fond ──
   * RMS médian des frames non voisées SITUÉES ENTRE la première et la dernière
   * frame parlée : c'est ce qui s'entend pendant les silences (ventilateur,
   * clavier, rue). On le compare au niveau de la voix → rapport signal/bruit.
   * On ignore la tête et la queue : elles contiennent souvent le clic de
   * démarrage de l'enregistrement, qui n'est pas du bruit de fond. */
  let noiseFloorRms = null;
  let snrDb = null;
  if (firstVoiced !== -1 && lastVoiced > firstVoiced) {
    const silentRms = [];
    for (let i = firstVoiced; i <= lastVoiced; i++) {
      if (!voicedMask[i]) silentRms.push(frameRms[i]);
    }
    if (silentRms.length >= 3) {
      noiseFloorRms = safeNumber(median(silentRms));
      if (noiseFloorRms !== null && loudnessMean !== null && loudnessMean > 0) {
        // Plancher numérique : un silence parfait donnerait un dB infini.
        const floor = Math.max(noiseFloorRms, 1e-6);
        snrDb = safeNumber(clamp(20 * Math.log10(loudnessMean / floor), 0, 80));
      }
    }
  }

  /* ── Contour des fins de phrase ──
   * Une phrase affirmative se termine en descendant ; une fin qui remonte ou
   * qui reste plate donne l'impression de ne jamais conclure. Pour chaque
   * groupe de souffle assez long, on ajuste une droite sur la hauteur des
   * dernières 600 ms (en demi-tons, donc perceptuellement linéaire) et on
   * regarde sa pente en demi-tons par seconde. */
  const END_WINDOW_SEC = 0.6;
  const MIN_PHRASE_SEC = 0.8;
  const SLOPE_THRESHOLD = 2; // demi-tons/seconde
  let endingsAnalyzed = null;
  let fallingEndings = null;
  let risingEndings = null;
  let flatEndings = null;
  let fallingEndRatio = null;

  if (phrases.length > 0 && pitchMean !== null && pitchMean > 0) {
    let analyzed = 0;
    let falling = 0;
    let rising = 0;
    let flat = 0;
    const windowFrames = Math.max(2, Math.round(END_WINDOW_SEC / hopSec));

    for (const ph of phrases) {
      if ((ph.endFrame - ph.startFrame + 1) * hopSec < MIN_PHRASE_SEC) continue;
      const from = Math.max(ph.startFrame, ph.endFrame - windowFrames + 1);
      const ts = [];
      const semis = [];
      for (let i = from; i <= ph.endFrame; i++) {
        const f0 = pitchByFrame[i];
        if (f0 === null) continue;
        ts.push(i * hopSec);
        semis.push(12 * Math.log2(f0 / pitchMean));
      }
      if (semis.length < 3) continue;

      // Régression linéaire (moindres carrés) : pente = Σ(t-t̄)(y-ȳ) / Σ(t-t̄)².
      const tBar = mean(ts);
      const yBar = mean(semis);
      let num = 0;
      let den = 0;
      for (let i = 0; i < ts.length; i++) {
        const dt = ts[i] - tBar;
        num += dt * (semis[i] - yBar);
        den += dt * dt;
      }
      if (den <= 0) continue;
      const slope = num / den;
      if (!Number.isFinite(slope)) continue;

      analyzed++;
      if (slope <= -SLOPE_THRESHOLD) falling++;
      else if (slope >= SLOPE_THRESHOLD) rising++;
      else flat++;
    }

    if (analyzed > 0) {
      endingsAnalyzed = analyzed;
      fallingEndings = falling;
      risingEndings = rising;
      flatEndings = flat;
      fallingEndRatio = safeNumber(falling / analyzed);
    } else {
      endingsAnalyzed = 0;
    }
  }

  return {
    durationSec,
    voicedRatio,
    pitchMean,
    pitchVarSemitones,
    pitchRangeSemitones,
    loudnessMean,
    loudnessVar,
    pauseCount,
    pauseRatio,
    longestPauseSec,
    noiseFloorRms,
    snrDb,
    phraseCount: phrases.length > 0 ? phrases.length : null,
    endingsAnalyzed,
    fallingEndings,
    risingEndings,
    flatEndings,
    fallingEndRatio,
  };
}

/* ─────────────── 3) Analyse directe d'un Blob ─────────────── */

/**
 * Raccourci : décode puis analyse un Blob audio.
 * @param {Blob} blob
 * @returns {Promise<AudioMetrics|null>}
 */
export async function analyzeAudioBlob(blob) {
  const buf = await decodeAudioBlob(blob);
  return buf ? analyzeAudioBuffer(buf) : null;
}

/* ─────────────── 4) Dérivation des scores (0–100) ─────────────── */

/**
 * Traduit les mesures acoustiques en trois scores lisibles.
 * @param {AudioMetrics|null} metrics
 * @returns {{voice:{score:number|null,label:string},melody:{score:number|null,label:string},rhythm:{score:number|null,label:string}}}
 */
export function deriveAudioScores(metrics) {
  // Aucune mesure disponible : on renvoie des scores neutres.
  if (!metrics) {
    return {
      voice: { score: null, label: "—" },
      melody: { score: null, label: "—" },
      rhythm: { score: null, label: "—" },
    };
  }

  return {
    voice: deriveVoiceScore(metrics),
    melody: deriveMelodyScore(metrics),
    rhythm: deriveRhythmScore(metrics),
  };
}

/* ── Mélodie : dérivée de la variabilité de hauteur (en demi-tons) ──
 * Une voix trop plate est monotone ; une variabilité modérée est expressive ;
 * une variabilité excessive paraît instable. */
function deriveMelodyScore(metrics) {
  const v = metrics.pitchVarSemitones;
  if (v === null || !Number.isFinite(v)) {
    return { score: null, label: "—" };
  }

  let score;
  let label;
  if (v < 1.0) {
    // Très monotone : de ~30 (0) à ~40 (1.0).
    score = lerp(30, 40, clamp(v / 1.0, 0, 1));
    label = "Monotone";
  } else if (v < 2.0) {
    // Peu expressif : ~50 → ~65.
    score = lerp(50, 65, clamp((v - 1.0) / 1.0, 0, 1));
    label = "Peu expressif";
  } else if (v < 5.0) {
    // Zone idéale, expressif : ~78 → ~88.
    score = lerp(78, 88, clamp((v - 2.0) / 3.0, 0, 1));
    label = "Expressif";
  } else if (v < 8.0) {
    // Très expressif mais on redescend un peu : ~80 → ~70.
    score = lerp(80, 70, clamp((v - 5.0) / 3.0, 0, 1));
    label = "Très expressif";
  } else {
    // Au-delà : perçu comme instable.
    score = lerp(58, 45, clamp((v - 8.0) / 4.0, 0, 1));
    label = "Instable";
  }

  return { score: Math.round(clamp(score, 0, 100)), label };
}

/* ── Voix : dérivée de la stabilité du volume (loudnessVar) et de la présence
 * de voix (voicedRatio). Une voix posée est régulière et bien présente. */
function deriveVoiceScore(metrics) {
  const lv = metrics.loudnessVar;
  const vr = metrics.voicedRatio;

  if ((lv === null || !Number.isFinite(lv)) && (vr === null || !Number.isFinite(vr))) {
    return { score: null, label: "—" };
  }

  // Composante stabilité (0–100) : loudnessVar bas = stable.
  // 0 → 100 ; 0.9 → ~40 ; 1.5+ → ~10.
  let stability;
  if (lv === null || !Number.isFinite(lv)) {
    stability = 60; // valeur neutre si non mesurable
  } else if (lv <= 0.9) {
    stability = lerp(100, 40, clamp(lv / 0.9, 0, 1));
  } else {
    stability = lerp(40, 10, clamp((lv - 0.9) / 0.6, 0, 1));
  }

  // Composante présence (0–100) : voicedRatio idéal ≥ 0.6.
  let presence;
  if (vr === null || !Number.isFinite(vr)) {
    presence = 60;
  } else if (vr >= 0.6) {
    presence = 100;
  } else if (vr >= 0.4) {
    presence = lerp(70, 100, clamp((vr - 0.4) / 0.2, 0, 1));
  } else {
    // En dessous de 0.4 : trop de blancs.
    presence = lerp(20, 70, clamp(vr / 0.4, 0, 1));
  }

  // Score combiné (pondération : stabilité 60 %, présence 40 %).
  const score = Math.round(clamp(stability * 0.6 + presence * 0.4, 0, 100));

  // Étiquette : priorité aux problèmes marquants.
  let label;
  if (vr !== null && Number.isFinite(vr) && vr < 0.4) {
    label = "Trop de blancs";
  } else if (lv !== null && Number.isFinite(lv) && lv > 0.9) {
    label = "Voix instable";
  } else if (score >= 80) {
    label = "Voix posée";
  } else {
    label = "Voix stable";
  }

  return { score, label };
}

/* ── Rythme : dérivé de la part de silence interne (pauseRatio) et de la plus
 * longue pause (longestPauseSec). Idéal : quelques respirations bien placées. */
function deriveRhythmScore(metrics) {
  const pr = metrics.pauseRatio;
  const longest = metrics.longestPauseSec;

  if (pr === null || !Number.isFinite(pr)) {
    return { score: null, label: "—" };
  }

  // Base selon pauseRatio : idéal entre 0.12 et 0.30.
  let base;
  let label;
  if (pr < 0.12) {
    // Pas assez de respirations : de ~55 (0) à ~90 (0.12).
    base = lerp(55, 90, clamp(pr / 0.12, 0, 1));
    label = "Pas assez de respirations";
  } else if (pr <= 0.3) {
    // Plage idéale.
    base = lerp(90, 95, clamp((pr - 0.12) / 0.18, 0, 1));
    label = "Bon rythme";
  } else if (pr <= 0.5) {
    // Trop de silence : discours haché.
    base = lerp(75, 45, clamp((pr - 0.3) / 0.2, 0, 1));
    label = "Trop haché";
  } else {
    base = lerp(45, 20, clamp((pr - 0.5) / 0.5, 0, 1));
    label = "Trop haché";
  }

  // Pénalité pour une pause unique excessivement longue (> 2.5 s).
  if (longest !== null && Number.isFinite(longest) && longest > 2.5) {
    const penalty = clamp((longest - 2.5) / 2.5, 0, 1) * 25; // jusqu'à -25 pts
    base = base - penalty;
    if (penalty >= 10) label = "Pause trop longue";
  }

  return { score: Math.round(clamp(base, 0, 100)), label };
}

/* ─────────────── 5) Encodage WAV (PCM 16-bit mono) ─────────────── */

/**
 * Rééchantillonne le canal 0 vers `targetRate` et encode en WAV PCM 16-bit mono.
 * Utile pour envoyer un fichier léger et standard à un service de transcription.
 * @param {AudioBuffer} audioBuffer
 * @param {number} [targetRate=16000] fréquence d'échantillonnage cible (Hz).
 * @returns {Blob|null} un Blob "audio/wav", ou null si le buffer est invalide.
 */
export function encodeWav(audioBuffer, targetRate = 16000) {
  if (
    !audioBuffer ||
    typeof audioBuffer.getChannelData !== "function" ||
    !audioBuffer.sampleRate ||
    !audioBuffer.length
  ) {
    return null;
  }

  let input;
  try {
    input = audioBuffer.getChannelData(0);
  } catch (e) {
    return null;
  }
  if (!input || input.length === 0) return null;

  const srcRate = audioBuffer.sampleRate;
  const outRate =
    Number.isFinite(targetRate) && targetRate > 0 ? Math.round(targetRate) : srcRate;

  // Rééchantillonnage par interpolation linéaire (mono).
  let resampled;
  if (outRate === srcRate) {
    resampled = input;
  } else {
    const ratio = srcRate / outRate;
    const outLength = Math.max(1, Math.round(input.length / ratio));
    resampled = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const srcPos = i * ratio;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      const s0 = input[idx] || 0;
      const s1 = idx + 1 < input.length ? input[idx + 1] : s0;
      resampled[i] = s0 + (s1 - s0) * frac;
    }
  }

  // Construction du fichier WAV : header RIFF (44 octets) + données PCM 16-bit.
  const numSamples = resampled.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Helper d'écriture d'une chaîne ASCII.
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // ── En-tête RIFF ──
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // taille du fichier - 8
  writeString(8, "WAVE");

  // ── Sous-bloc « fmt  » ──
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // taille du sous-bloc fmt
  view.setUint16(20, 1, true); // format PCM = 1
  view.setUint16(22, 1, true); // nombre de canaux = 1 (mono)
  view.setUint32(24, outRate, true); // fréquence d'échantillonnage
  view.setUint32(28, outRate * bytesPerSample, true); // débit d'octets/s
  view.setUint16(32, bytesPerSample, true); // alignement de bloc
  view.setUint16(34, 16, true); // bits par échantillon

  // ── Sous-bloc « data » ──
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Conversion float [-1, 1] → int16 little-endian.
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = resampled[i];
    if (!Number.isFinite(s)) s = 0;
    s = Math.max(-1, Math.min(1, s));
    // Mise à l'échelle asymétrique classique du PCM 16-bit.
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
