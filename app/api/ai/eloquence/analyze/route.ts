import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const Schema = z.object({
  scores: z.object({
    structure: z.number().min(0).max(100),
    vocabulary: z.number().min(0).max(100),
    clarity: z.number().min(0).max(100),
    confidence: z.number().min(0).max(100),
    diction: z.number().min(0).max(100),
    rhythm: z.number().min(0).max(100),
    fidelity: z.number().min(0).max(100).nullable(), // null si non applicable
  }),
  // Retour critique et technique, justifiant la note de CHAQUE axe :
  // ce qui marche, ce qui ne va pas, et le point précis à corriger.
  axisFeedback: z.object({
    structure: z.string(),
    vocabulary: z.string(),
    clarity: z.string(),
    confidence: z.string(),
    diction: z.string(),
    rhythm: z.string(),
    fidelity: z.string().nullable(), // null si non applicable
  }),
  strengths: z.array(z.string()).max(4),
  improvements: z.array(z.string()).max(4),
  tips: z.array(z.string()).max(4),
  vocabSuggestions: z
    .array(z.object({ original: z.string(), better: z.string() }))
    .max(5),
  summary: z.string(),
});

type Framework = { name: string; steps: { label: string; hint: string }[] };

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Clé API OpenAI non configurée sur le serveur." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const {
      mode,
      transcript,
      referenceText,
      topic,
      framework,
      drillGoal,
      durationSec,
      wpm,
      fillerCount,
      fillers,
      audioMetrics,
      paceTarget,
    }: {
      mode: "reading" | "freeSpeech" | "diction" | "structure";
      transcript: string;
      referenceText?: string;
      topic?: string;
      framework?: Framework;
      // Consigne d'un défi (onglet « Défis ») : oriente le jugement de l'IA sans
      // changer le mode d'analyse de base.
      drillGoal?: string;
      durationSec?: number;
      wpm?: number;
      fillerCount?: number;
      fillers?: Record<string, number>;
      audioMetrics?: {
        pitchMean?: number | null;
        pitchVarSemitones?: number | null;
        pitchRangeSemitones?: number | null;
        loudnessVar?: number | null;
        voicedRatio?: number | null;
        pauseCount?: number | null;
        pauseRatio?: number | null;
        longestPauseSec?: number | null;
        snrDb?: number | null;
        phraseCount?: number | null;
        endingsAnalyzed?: number | null;
        fallingEndings?: number | null;
        risingEndings?: number | null;
        fallingEndRatio?: number | null;
      } | null;
      /* Fourchette de débit propre à l'exercice. La lecture lente et le format
         « débit maîtrisé » cherchent VOLONTAIREMENT un débit bas : les juger sur
         la fourchette de conversation reviendrait à sanctionner la consigne. */
      paceTarget?: { wpmMin?: number; wpmMax?: number; wpmTooFast?: number } | null;
    } = body;

    if (!transcript || !transcript.trim()) {
      return NextResponse.json(
        { error: "Transcription vide" },
        { status: 400 }
      );
    }

    // Cible de débit : celle de l'exercice, sinon la fourchette de travail par défaut.
    const paceMin = paceTarget?.wpmMin ?? 110;
    const paceMax = paceTarget?.wpmMax ?? 130;
    const paceTooFast = paceTarget?.wpmTooFast ?? 150;

    const system =
      "Tu es un coach professionnel en éloquence, prise de parole et communication, exigeant et rigoureux. " +
      "Tu analyses une transcription de prise de parole et donnes un retour critique, technique, précis et actionnable, en français. " +
      "Sois honnête et exigeant : ne survends pas, ne distribue pas de notes flatteuses. Une note élevée (80+) doit être méritée ; " +
      "une prestation moyenne se situe autour de 50-65. Appuie chaque jugement sur des éléments concrets de la transcription (cite des mots, des tournures, des passages).\n" +
      "QUATRE REPÈRES priment sur tout le reste, et doivent apparaître explicitement dans ton retour dès qu'ils ne sont pas tenus :\n" +
      `1) Débit : cible ${paceMin}–${paceMax} mots/minute ; au-delà de ${paceTooFast}, c'est trop rapide.\n` +
      "2) Silences : de vraies pauses entre les idées, jamais de tic de langage pour les combler.\n" +
      "3) Bruits parasites : pas de bruit de fond, de souffle dans le micro ni de bruit de bouche.\n" +
      "4) Fins de phrase : l'intonation doit DESCENDRE en fin de phrase affirmative — une fin qui remonte ou reste plate fait douter du propos.";

    let modeInstructions = "";
    switch (mode) {
      case "reading":
        modeInstructions =
          "MODE LECTURE : l'utilisateur a lu à voix haute un texte de référence. " +
          "Compare attentivement la transcription au texte de référence et note `fidelity` (0-100) selon l'exactitude de la lecture (mots ajoutés, omis, déformés). " +
          "Évalue surtout la diction et la fluidité de lecture. " +
          "`structure` et `vocabulary` portent sur le texte source (que l'utilisateur n'a pas écrit) : note-les plutôt haut par défaut, sauf si des erreurs de lecture trahissent une mauvaise compréhension. " +
          "Concentre le feedback sur la qualité de lecture, le débit et l'articulation.";
        break;
      case "diction":
        modeInstructions =
          "MODE DICTION : il s'agit d'un virelangue / exercice d'articulation. " +
          "`fidelity` (0-100) = exactitude par rapport au texte de référence, `diction` = qualité de l'articulation, `rhythm` = maîtrise de la cadence et des pauses. " +
          "Les autres axes (structure, vocabulary, clarity, confidence) sont secondaires : donne-leur des valeurs cohérentes alignées sur le niveau de diction (le schéma exige des nombres pour tous les axes). " +
          "Concentre tout le feedback sur l'articulation, la netteté des consonnes et la maîtrise du rythme.";
        break;
      case "freeSpeech":
        modeInstructions =
          "MODE PRISE DE PAROLE LIBRE : pas de fidélité applicable, mets `fidelity` à null. " +
          "Évalue les 6 axes (structure, vocabulary, clarity, confidence, diction, rhythm) sur le fond ET la forme, en lien avec le sujet imposé.";
        break;
      case "structure":
        modeInstructions =
          "MODE STRUCTURE : pas de fidélité applicable, mets `fidelity` à null. " +
          "Évalue surtout si le discours respecte les étapes du cadre fourni (chaque step). " +
          "Le score `structure` doit être fortement pondéré selon le respect de ce cadre. Indique quelles étapes ont été couvertes ou manquées.";
        break;
      default:
        modeInstructions =
          "Évalue la prise de parole sur l'ensemble des axes disponibles.";
    }

    const metricsLines: string[] = [];
    if (typeof durationSec === "number")
      metricsLines.push(`- Durée : ${durationSec.toFixed(1)} s`);
    if (typeof wpm === "number")
      metricsLines.push(`- Débit : ${wpm} mots/minute`);
    if (typeof fillerCount === "number")
      metricsLines.push(`- Mots de remplissage (total) : ${fillerCount}`);
    if (fillers && Object.keys(fillers).length > 0) {
      const detail = Object.entries(fillers)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      metricsLines.push(`- Détail des tics de langage : ${detail}`);
    }

    const promptParts: string[] = [];
    promptParts.push(`Mode d'analyse : ${mode}`);
    promptParts.push(modeInstructions);
    // Consigne spécifique du défi : elle PRIME sur le cadrage générique du mode
    // et doit être au cœur du jugement et du feedback.
    if (typeof drillGoal === "string" && drillGoal.trim()) {
      promptParts.push(
        "CONSIGNE PRIORITAIRE DE L'EXERCICE (à placer au centre du jugement et du feedback) :\n" +
          drillGoal.trim()
      );
    }
    if (mode === "reading" || mode === "diction") {
      promptParts.push(
        `Texte de référence (ce qui aurait dû être dit) :\n"""${referenceText || "(non fourni)"}"""`
      );
    }
    if (mode === "freeSpeech") {
      promptParts.push(`Sujet imposé : ${topic || "(non précisé)"}`);
    }
    if (mode === "structure") {
      if (framework) {
        const steps = framework.steps
          .map((s, i) => `${i + 1}. ${s.label} — ${s.hint}`)
          .join("\n");
        promptParts.push(
          `Cadre à respecter (${framework.name}) :\n${steps}`
        );
      } else {
        promptParts.push("Cadre à respecter : (non fourni)");
      }
    }
    // Mesures acoustiques réelles (analyse du signal côté navigateur) : elles
    // décrivent le SON, pas le texte. On les fournit pour fiabiliser rhythm,
    // diction et confidence au lieu de tout déduire du seul WPM.
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
    if (audioMetrics) {
      const a = audioMetrics;
      const acousticLines: string[] = [];
      if (num(a.pitchVarSemitones) != null)
        acousticLines.push(
          `- Variation de hauteur (mélodie) : ${num(a.pitchVarSemitones)!.toFixed(1)} demi-tons ` +
            "(< 1 = très monotone, ~2-5 = expressif, > 8 = instable)"
        );
      if (num(a.pitchRangeSemitones) != null)
        acousticLines.push(`- Étendue mélodique : ${num(a.pitchRangeSemitones)!.toFixed(1)} demi-tons`);
      if (num(a.loudnessVar) != null)
        acousticLines.push(
          `- Stabilité du volume (coef. de variation) : ${num(a.loudnessVar)!.toFixed(2)} ` +
            "(élevé = voix instable/irrégulière)"
        );
      if (num(a.voicedRatio) != null)
        acousticLines.push(`- Proportion de parole (vs silences) : ${Math.round(num(a.voicedRatio)! * 100)} %`);
      if (num(a.pauseCount) != null)
        acousticLines.push(`- Nombre de pauses marquées : ${num(a.pauseCount)}`);
      if (num(a.pauseRatio) != null)
        acousticLines.push(
          `- Temps en pause : ${Math.round(num(a.pauseRatio)! * 100)} % ` +
            "(idéal ~12-30 % ; trop bas = pas de respiration, trop haut = discours haché)"
        );
      if (num(a.longestPauseSec) != null)
        acousticLines.push(`- Pause la plus longue : ${num(a.longestPauseSec)!.toFixed(1)} s`);
      if (num(a.snrDb) != null)
        acousticLines.push(
          `- Voix au-dessus du bruit de fond : ${Math.round(num(a.snrDb)!)} dB ` +
            "(≥ 25 = prise propre, < 15 = bruits parasites très audibles)"
        );
      if (num(a.endingsAnalyzed) != null && num(a.endingsAnalyzed)! > 0)
        acousticLines.push(
          `- Fins de phrase : ${num(a.fallingEndings) ?? 0} descendantes et ${num(a.risingEndings) ?? 0} montantes ` +
            `sur ${num(a.endingsAnalyzed)} phrases mesurées ` +
            "(une fin qui remonte sonne comme une question et affaiblit l'affirmation)"
        );
      if (acousticLines.length > 0) {
        promptParts.push(
          "Mesures acoustiques réelles (issues du signal audio, à intégrer au jugement) :\n" +
            acousticLines.join("\n") +
            "\nAppuie les notes de `rhythm` (cadence, pauses, débit), `diction` et `confidence` sur ces mesures : " +
            "une intonation monotone (faible variation de hauteur) doit être signalée dans le feedback ; " +
            "un temps de pause hors de la fourchette 12-35 % ou une pause très longue doit faire baisser `rhythm` ; " +
            "un bruit de fond audible ou une majorité de fins de phrase non descendantes doivent être nommés " +
            "explicitement dans `improvements` avec la correction à appliquer."
        );
      }
    }

    promptParts.push(`Transcription à analyser :\n"""${transcript}"""`);
    if (metricsLines.length > 0) {
      promptParts.push(
        "Métriques mesurées (à prendre en compte) :\n" +
          metricsLines.join("\n") +
          `\nLa cible de débit de CET exercice est ${paceMin}-${paceMax} mots/minute. Un débit hors de cette fourchette doit faire ` +
          `baisser le score de rythme (rhythm), et un débit supérieur à ${paceTooFast} mots/minute doit le faire baisser fortement ; ` +
          "de nombreux tics de langage doivent faire baisser la confiance (confidence) et le rythme. " +
          "Le score `rhythm` reflète la cadence, la régularité du débit et la gestion des pauses."
      );
    }
    promptParts.push(
      "Pour CHAQUE axe noté (structure, vocabulary, clarity, confidence, diction, rhythm" +
        (mode === "reading" || mode === "diction" ? ", fidelity" : "") +
        "), rédige dans `axisFeedback` une analyse critique et technique de 1 à 3 phrases qui JUSTIFIE la note : " +
        "explique précisément ce qui fonctionne et surtout ce qui ne va pas, en citant des éléments concrets de la transcription, et indique le point exact à corriger. " +
        "La justification doit être cohérente avec la note chiffrée (une note basse = des reproches explicites ; une note haute = ce qui est réussi). " +
        (mode === "freeSpeech" || mode === "structure"
          ? "Pour `axisFeedback.fidelity`, mets null. "
          : "") +
        "En plus, donne un retour structuré : points forts concrets, axes d'amélioration précis, conseils actionnables, et suggestions de vocabulaire (remplacer un mot/tournure par une meilleure)."
    );

    const prompt = promptParts.join("\n\n");

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: Schema,
      system,
      prompt,
    });

    const scoreValues = Object.values(object.scores).filter(
      (v): v is number => typeof v === "number"
    );
    const overall =
      scoreValues.length > 0
        ? Math.round(
            scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
          )
        : 0;

    return NextResponse.json({ ...object, overall });
  } catch (err: any) {
    console.error("Eloquence analyze error:", err);
    return NextResponse.json(
      { error: err?.message || "Erreur du serveur lors de l'analyse" },
      { status: 500 }
    );
  }
}
