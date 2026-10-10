import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Route d'analyse vocale : fait « écouter » un extrait WAV à un modèle audio
// OpenAI pour évaluer QUALITATIVEMENT la voix et la mélodie (intonation).
// Best-effort côté serveur : si le modèle audio est indisponible, on renvoie
// un 503 que le front ignore proprement.
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

    // Mode d'exercice et sujet parlé, tous deux optionnels.
    const mode = (form.get("mode") as string) || "";
    const topic = (form.get("topic") as string) || "";

    // Conversion du fichier WAV en base64 pour le champ input_audio.
    const buf = Buffer.from(await file.arrayBuffer());
    const b64 = buf.toString("base64");

    // Consigne utilisateur : on précise mode/sujet uniquement s'ils sont fournis.
    const contexte: string[] = [];
    if (mode) contexte.push(`Mode d'exercice : ${mode}.`);
    if (topic) contexte.push(`Sujet parlé : ${topic}.`);
    const consigne =
      "Écoute cet extrait vocal" +
      (contexte.length ? ` (${contexte.join(" ")})` : "") +
      " et renvoie une évaluation JSON. Sois honnête et exigeant : donne des" +
      " notes réalistes et un retour concret sur ce qui s'entend.";

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
      // Le SDK openai n'expose pas forcément « modalities » ni « input_audio »
      // dans ses types selon la version : on caste UNIQUEMENT l'argument de
      // create(...) en any pour compiler, tout en gardant la structure exacte.
      const completion = await client.chat.completions.create({
        model: "gpt-4o-audio-preview",
        modalities: ["text"],
        messages: [
          {
            role: "system",
            content:
              "Tu es un coach d'éloquence français exigeant. Tu évalues" +
              " UNIQUEMENT ce qui s'entend à l'oreille : le timbre, la" +
              " projection, la stabilité de la voix, l'intonation et la" +
              " mélodie, l'expressivité et la chaleur. Tu ne juges JAMAIS le" +
              " fond, le vocabulaire, la grammaire ni le contenu des propos." +
              " Deux points doivent être signalés dès qu'ils s'entendent, et" +
              " faire baisser la note correspondante : les BRUITS PARASITES" +
              " (bruit de fond, souffle dans le micro, bruits de bouche," +
              " claquements de langue) dans `feedback.voice`, et les FINS DE" +
              " PHRASE qui remontent ou restent plates au lieu de descendre" +
              " dans `feedback.melody`." +
              " Tu restes objectif, précis et bienveillant mais sans" +
              " complaisance.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: consigne },
              { type: "input_audio", input_audio: { data: b64, format: "wav" } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "voice_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                voice: { type: "integer", minimum: 0, maximum: 100 },
                melody: { type: "integer", minimum: 0, maximum: 100 },
                expressiveness: { type: "integer", minimum: 0, maximum: 100 },
                warmth: { type: "integer", minimum: 0, maximum: 100 },
                feedback: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    voice: { type: "string" },
                    melody: { type: "string" },
                    expressiveness: { type: "string" },
                    warmth: { type: "string" },
                  },
                  required: ["voice", "melody", "expressiveness", "warmth"],
                },
              },
              required: [
                "voice",
                "melody",
                "expressiveness",
                "warmth",
                "feedback",
              ],
            },
          },
        },
      } as any);

      // Récupération du texte JSON renvoyé par le modèle.
      const raw = completion.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || !raw.trim()) {
        return NextResponse.json(
          { error: "Analyse vocale indisponible" },
          { status: 503 }
        );
      }

      const parsed = JSON.parse(raw);
      return NextResponse.json(parsed);
    } catch (audioErr: any) {
      // Le modèle audio peut être introuvable / non supporté selon le compte
      // ou la région : dans ce cas, on renvoie un 503 « indisponible » que le
      // front traite en best-effort (il continue sans analyse vocale).
      const status = audioErr?.status ?? audioErr?.response?.status;
      const message = String(audioErr?.message || "").toLowerCase();
      const modeleIndisponible =
        status === 400 ||
        status === 404 ||
        message.includes("model");
      if (modeleIndisponible) {
        console.error("Eloquence voice model unavailable:", audioErr);
        return NextResponse.json(
          { error: "Analyse vocale indisponible" },
          { status: 503 }
        );
      }
      // Autres erreurs de l'appel audio : on relaie au catch externe.
      throw audioErr;
    }
  } catch (err: any) {
    console.error("Eloquence voice error:", err);
    return NextResponse.json(
      { error: err?.message || "Erreur du serveur lors de l'analyse vocale" },
      { status: 500 }
    );
  }
}
