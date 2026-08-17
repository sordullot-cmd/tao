import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Schéma de sortie : bilan de séance + plan de travail (jour + semaine).
const Schema = z.object({
  summary: z.string(), // bilan honnête et concret de la séance du jour (3-5 phrases)
  // 1 à 2 phrases par axe, critiques et précises, appuyées sur les chiffres.
  axisReview: z.object({
    structure: z.string(),
    vocabulary: z.string(),
    clarity: z.string(),
    confidence: z.string(),
    diction: z.string(),
    rhythm: z.string(),
    voice: z.string(),
    melody: z.string(),
  }),
  priority: z.string(), // LE point n°1 à travailler en priorité
  dayPlan: z
    .array(
      z.object({
        title: z.string(), // tâche concrète pour la prochaine séance
        why: z.string(), // pourquoi (lié à une faiblesse mesurée)
        mode: z.enum(["articulation", "reading", "speaking"]), // onglet d'exercice à ouvrir
      })
    )
    .min(2)
    .max(4),
  weekPlan: z
    .array(
      z.object({
        title: z.string(), // objectif de fond de la semaine
        why: z.string(),
      })
    )
    .min(2)
    .max(3),
});

// Types du contrat d'entrée envoyé par la page Éloquence.
type AxisAverages = {
  structure: number | null;
  vocabulary: number | null;
  clarity: number | null;
  confidence: number | null;
  diction: number | null;
  rhythm: number | null;
};

type WeekAxisAverages = AxisAverages & {
  voice: number | null;
  melody: number | null;
};

type PlanBody = {
  date: string;
  sessionCount: number;
  byMode: {
    articulation: number;
    reading: number;
    speaking: number;
  };
  axisAverages: AxisAverages;
  audioAverages: {
    pitchVarSemitones: number | null;
    loudnessVar: number | null;
    pauseRatio: number | null;
    longestPauseSec: number | null;
    snrDb: number | null;
    fallingEndRatio: number | null;
    wpm: number | null;
  };
  derivedAudio: {
    voice: number | null;
    melody: number | null;
    rhythm: number | null;
  };
  voiceAverages: {
    voice: number | null;
    melody: number | null;
    expressiveness: number | null;
    warmth: number | null;
  } | null;
  recentImprovements: string[];
  weekAxisAverages: WeekAxisAverages;
};

// Formatte une valeur numérique éventuellement null en texte lisible pour le prompt.
function fmt(
  value: number | null | undefined,
  suffix = "",
  digits = 0
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "non travaillé aujourd'hui";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Clé API OpenAI non configurée sur le serveur." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as PlanBody;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Requête vide" }, { status: 400 });
    }

    const {
      date,
      sessionCount,
      byMode,
      axisAverages,
      audioAverages,
      derivedAudio,
      voiceAverages,
      recentImprovements,
      weekAxisAverages,
    } = body;

    if (!sessionCount || sessionCount <= 0) {
      return NextResponse.json(
        { error: "Aucune séance à analyser pour cette journée." },
        { status: 400 }
      );
    }

    const system =
      "Tu es un coach professionnel d'éloquence, exigeant et honnête, qui s'exprime en français. " +
      "Tu établis le bilan d'une journée d'entraînement à la prise de parole et tu construis un plan de travail concret pour la prochaine séance et pour la semaine. " +
      "Ne flatte JAMAIS : appuie chaque jugement sur les chiffres fournis (moyennes par axe 0-100 et mesures acoustiques réelles). " +
      "Interprète les mesures acoustiques ainsi : " +
      "la MÉLODIE reflète la variation de hauteur (intonation) — une faible variation (peu de demi-tons) = intonation monotone, à corriger par plus de relief mélodique ; " +
      "la VOIX reflète la stabilité et le volume (variation de force) — une voix instable ou trop plate manque de présence ; " +
      "le RYTHME reflète les pauses et le débit — un pauseRatio trop bas = l'orateur ne respire pas / n'aère pas son propos, un débit (wpm) hors de la fourchette 110-130 mots/minute est à corriger (trop lent en dessous, précipité au-dessus, franchement trop rapide au-delà de 150), une pause la plus longue excessive trahit une hésitation. " +
      "Deux mesures supplémentaires sont prioritaires : le RAPPORT VOIX/BRUIT en dB (sous 15 dB, des bruits parasites gâchent la prise : il faut d'abord corriger les conditions d'enregistrement) et la PART DE FINS DE PHRASE DESCENDANTES (sous 0,6, l'orateur laisse ses phrases remonter ou rester plates, ce qui affaiblit ses affirmations : il doit laisser la voix retomber sur les derniers mots). " +
      "Les tâches du plan du jour (dayPlan) doivent viser les axes les plus faibles et pointer le BON mode d'exercice, parmi trois seulement : " +
      "articulation = mécanique de la bouche (occlusives T·D·B·P répétées 20 fois chacune, virelangues répétés 10 fois en accélérant puis 10 fois en surarticulant, échauffement) ; " +
      "reading = lecture d'un texte à voix haute avec une intention (lente et exagérée, théâtrale, ou imitation d'un orateur modèle) ; " +
      "speaking = prise de parole sur un sujet, avec cadre de discours et contraintes (storytelling, débit maîtrisé, non-stop, résumé express, mot interdit). " +
      "Sois concret et actionnable : des tâches faisables dès la prochaine séance, et des objectifs de fond pour la semaine.";

    // Sérialisation lisible de l'agrégat reçu pour le prompt utilisateur.
    const parts: string[] = [];
    parts.push(`Date de la séance : ${date}`);
    parts.push(`Nombre d'exercices réalisés aujourd'hui : ${sessionCount}`);
    parts.push(
      "Répartition par type d'exercice :\n" +
        `- Articulation (articulation) : ${byMode.articulation ?? 0}\n` +
        `- Lecture (reading) : ${byMode.reading ?? 0}\n` +
        `- Prise de parole (speaking) : ${byMode.speaking ?? 0}`
    );

    parts.push(
      "Moyennes du jour par axe (0-100) :\n" +
        `- Structure : ${fmt(axisAverages.structure)}\n` +
        `- Vocabulaire : ${fmt(axisAverages.vocabulary)}\n` +
        `- Clarté : ${fmt(axisAverages.clarity)}\n` +
        `- Confiance : ${fmt(axisAverages.confidence)}\n` +
        `- Diction : ${fmt(axisAverages.diction)}\n` +
        `- Rythme : ${fmt(axisAverages.rhythm)}`
    );

    parts.push(
      "Mesures acoustiques moyennes du jour (mesurées par le navigateur) :\n" +
        `- Variation de hauteur / intonation : ${fmt(audioAverages.pitchVarSemitones, " demi-tons", 1)}\n` +
        `- Variation de volume : ${fmt(audioAverages.loudnessVar, "", 2)}\n` +
        `- Ratio de pauses : ${fmt(audioAverages.pauseRatio, "", 2)}\n` +
        `- Pause la plus longue : ${fmt(audioAverages.longestPauseSec, " s", 1)}\n` +
        `- Voix au-dessus du bruit de fond : ${fmt(audioAverages.snrDb, " dB", 0)}\n` +
        `- Part de fins de phrase descendantes : ${fmt(audioAverages.fallingEndRatio, "", 2)}\n` +
        `- Débit : ${fmt(audioAverages.wpm, " mots/minute", 0)}`
    );

    parts.push(
      "Sous-scores acoustiques déterministes moyens (0-100, calculés par le navigateur) :\n" +
        `- Voix (stabilité/volume) : ${fmt(derivedAudio.voice)}\n` +
        `- Mélodie (intonation) : ${fmt(derivedAudio.melody)}\n` +
        `- Rythme (pauses/débit) : ${fmt(derivedAudio.rhythm)}`
    );

    if (voiceAverages) {
      parts.push(
        "Analyse audio par le modèle (moyennes du jour, 0-100) :\n" +
          `- Voix : ${fmt(voiceAverages.voice)}\n` +
          `- Mélodie : ${fmt(voiceAverages.melody)}\n` +
          `- Expressivité : ${fmt(voiceAverages.expressiveness)}\n` +
          `- Chaleur : ${fmt(voiceAverages.warmth)}`
      );
    } else {
      parts.push(
        "Analyse audio par le modèle : non disponible aujourd'hui (s'appuyer sur les sous-scores déterministes)."
      );
    }

    parts.push(
      "Axes d'amélioration récurrents des jours précédents :\n" +
        (recentImprovements && recentImprovements.length > 0
          ? recentImprovements.map((s) => `- ${s}`).join("\n")
          : "- (aucun historique)")
    );

    parts.push(
      "Tendance sur les 7 derniers jours (moyennes 0-100, contexte) :\n" +
        `- Structure : ${fmt(weekAxisAverages.structure)}\n` +
        `- Vocabulaire : ${fmt(weekAxisAverages.vocabulary)}\n` +
        `- Clarté : ${fmt(weekAxisAverages.clarity)}\n` +
        `- Confiance : ${fmt(weekAxisAverages.confidence)}\n` +
        `- Diction : ${fmt(weekAxisAverages.diction)}\n` +
        `- Rythme : ${fmt(weekAxisAverages.rhythm)}\n` +
        `- Voix : ${fmt(weekAxisAverages.voice)}\n` +
        `- Mélodie : ${fmt(weekAxisAverages.melody)}`
    );

    parts.push(
      "Consignes de rédaction :\n" +
        "- `summary` : bilan honnête et concret de la séance du jour, en 3 à 5 phrases, appuyé sur les chiffres.\n" +
        "- `axisReview` : pour CHAQUE axe (structure, vocabulary, clarity, confidence, diction, rhythm, voice, melody), 1 à 2 phrases critiques et précises. Si un axe n'a pas été travaillé aujourd'hui, appuie-toi sur la tendance de la semaine ou indique qu'il n'a pas été mesuré, mais rédige toujours du texte.\n" +
        "- `priority` : LE point n°1 à travailler en priorité (l'axe ou la mesure la plus faible / la plus limitante).\n" +
        "- `dayPlan` (2 à 4 tâches) : chaque tâche vise un axe faible mesuré, avec un `mode` d'exercice cohérent (articulation / reading / speaking) et un `why` reliant la tâche à une faiblesse chiffrée.\n" +
        "- `weekPlan` (2 à 3 objectifs de fond) : objectifs plus larges pour la semaine, justifiés par la tendance."
    );

    const prompt = parts.join("\n\n");

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: Schema,
      system,
      prompt,
    });

    return NextResponse.json(object);
  } catch (err: any) {
    console.error("Eloquence plan error:", err);
    return NextResponse.json(
      {
        error:
          err?.message || "Erreur du serveur lors de la génération du plan",
      },
      { status: 500 }
    );
  }
}
