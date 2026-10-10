import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Clé API OpenAI non configurée sur le serveur." },
      { status: 503 }
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Fichier audio manquant" },
        { status: 400 }
      );
    }

    // Whisper exige ISO-639-1 (2 lettres) — on tronque les variantes type "fr-FR" → "fr"
    const rawLang = (form.get("lang") as string) || "fr";
    const lang = rawLang.toLowerCase().split(/[-_]/)[0];

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const out = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: lang,
      response_format: "verbose_json",
    });

    return NextResponse.json({
      text: out.text || "",
      duration: (out as any).duration || 0,
    });
  } catch (err: any) {
    console.error("Eloquence transcribe error:", err);
    return NextResponse.json(
      { error: err?.message || "Erreur du serveur lors de la transcription" },
      { status: 500 }
    );
  }
}
