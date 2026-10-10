import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const TopicsSchema = z.object({
  topics: z.array(
    z.object({
      title: z.string(), // le sujet, formulé comme une question ou une affirmation à défendre
      angle: z.string(), // un angle/accroche pour démarrer
      suggestedStructure: z.string(), // ex: "PREP", "3 arguments", court
    })
  ),
});

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
      kind,
      theme,
      difficulty,
      count,
    }: {
      kind: "topics";
      theme?: string;
      difficulty?: number;
      count?: number;
    } = body;

    const system =
      "Tu es un coach en éloquence qui crée des exercices d'entraînement à la prise de parole en français.";

    const difficultyLine =
      typeof difficulty === "number"
        ? `Niveau de difficulté visé : ${difficulty} (sur 10 si l'échelle n'est pas précisée).`
        : "";

    if (kind === "topics") {
      const n = typeof count === "number" && count > 0 ? count : 4;
      const themeLine =
        !theme || theme === "surprise"
          ? "Thème : libre — choisis des sujets variés, originaux et stimulants, couvrant des registres différents."
          : `Thème : ${theme}.`;

      const prompt = [
        `Génère ${n} sujets d'entraînement à l'impromptu (prise de parole improvisée).`,
        themeLine,
        difficultyLine,
        "Pour chaque sujet : un titre formulé comme une question ou une affirmation à défendre, un angle/accroche pour démarrer, et une structure suggérée courte (ex: PREP, 3 arguments).",
      ]
        .filter(Boolean)
        .join("\n");

      const { object } = await generateObject({
        model: openai("gpt-4o"),
        schema: TopicsSchema,
        system,
        prompt,
      });

      return NextResponse.json(object);
    }

    return NextResponse.json(
      { error: "Paramètre 'kind' invalide (attendu : 'topics')" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("Eloquence generate error:", err);
    return NextResponse.json(
      { error: err?.message || "Erreur du serveur lors de la génération" },
      { status: 500 }
    );
  }
}
