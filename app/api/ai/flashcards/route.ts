import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Découpage d'un texte en cartes de révision.
 *
 * L'enjeu n'est pas de produire beaucoup de cartes : c'est d'en produire des
 * BONNES. Une carte mal formulée coûte des mois d'agacement et finit suspendue
 * en sangsue. Les règles imposées au modèle sont celles de la littérature sur
 * la répétition espacée (principe d'information minimale de Wozniak), et elles
 * sont contraignantes exprès.
 */

const CardSchema = z.object({
  kind: z.enum(["basic", "reversed", "cloze"]),
  // Recto ; pour un texte à trous, le texte porteur des {{c1::…}}.
  front: z.string(),
  // Verso. Vide pour un texte à trous.
  back: z.string(),
  // Précision, nuance ou source. Facultatif, affiché après la réponse.
  extra: z.string(),
  tags: z.array(z.string()).max(4),
});

const Schema = z.object({
  cards: z.array(CardSchema).min(1).max(60),
  /** Ce que le texte contient et ce qui a été retenu ou écarté. */
  summary: z.string(),
  /** Points du texte jugés inaptes à la mémorisation par cartes, et pourquoi. */
  skipped: z.array(z.string()).max(6),
});

const SYSTEM = `Tu es un concepteur de cartes de révision (répétition espacée, moteur FSRS).
Tu reçois un texte brut — un cours, des notes, un chapitre — et tu le découpes en cartes.

RÈGLES ABSOLUES, dans cet ordre de priorité :

1. UNE CARTE = UNE INFORMATION. Jamais deux faits sur la même carte. Si un
   paragraphe contient cinq idées, cela fait cinq cartes, pas une carte à cinq
   lignes. C'est la règle la plus importante : une carte à réponse multiple est
   ratée en boucle et finit abandonnée.

2. JAMAIS DE LISTE À RESTITUER. « Cite les 5 causes de X » est une mauvaise
   carte : on en oublie toujours une et on ne sait pas se noter. Transforme en
   cartes séparées, ou en textes à trous où chaque élément est un trou distinct.

3. LA QUESTION DOIT AVOIR UNE SEULE RÉPONSE POSSIBLE. Si deux réponses sont
   défendables, la question est trop vague : précise-la.

4. FORMULE COURT. Le recto tient en une phrase. Le verso tient en quelques mots
   quand c'est possible — un nom, un chiffre, une définition ramassée.

5. GARDE LE CONTEXTE. Une carte doit être compréhensible seule, des mois plus
   tard, sans le cours autour. « Quelle est la valeur ? » ne veut rien dire.

6. NE COPIE PAS, REFORMULE. Une phrase du cours recopiée telle quelle se
   reconnaît sans être comprise.

CHOIX DU TYPE :
- "basic" : la question a un sens dans un seul sens (une définition, une cause,
  un mécanisme, un « pourquoi »). C'est le cas le plus fréquent, par défaut.
- "reversed" : UNIQUEMENT pour les paires vraiment symétriques — un mot et sa
  traduction, un terme et son symbole, un auteur et son œuvre. N'en abuse pas :
  chaque carte inversée double la charge de révision.
- "cloze" : un fait pris dans sa phrase, une formule, une date, une valeur
  seuil. Syntaxe stricte : {{c1::la réponse}} ou {{c1::la réponse::indice}}.
  Numérote c1, c2, c3… Plusieurs trous dans une même phrase donnent plusieurs
  cartes qui partagent le contexte — c'est le meilleur rendement quand la phrase
  est dense. Ne masque jamais plus du tiers d'une phrase : il faut qu'il reste
  de quoi la situer.

CE QU'IL NE FAUT PAS TRANSFORMER EN CARTE, et signaler dans "skipped" :
- ce qui relève de la compréhension d'ensemble et pas du rappel ponctuel ;
- ce qui demande un raisonnement à dérouler (ça se travaille en exercices) ;
- l'anecdotique, le décoratif, ce qui n'est vrai que dans le contexte du texte ;
- ce qu'on ne peut pas comprendre sans avoir d'abord compris le reste.

Les étiquettes ("tags") sont en minuscules, sans accent ni espace, au plus deux
par carte, et décrivent le THÈME, pas le type de carte.

Rédige tout — questions, réponses, résumé — dans la langue du texte reçu.`;

interface Body {
  text?: string;
  /** Nombre de cartes visé. Le modèle peut rendre moins si le texte est mince. */
  maxCards?: number;
  /** Type privilégié quand plusieurs conviennent. */
  prefer?: "auto" | "basic" | "cloze";
  /** Thème du paquet, pour orienter les étiquettes. */
  topic?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (text.length < 40) {
    return NextResponse.json(
      { error: "Le texte est trop court pour en tirer des cartes." },
      { status: 400 },
    );
  }
  // Au-delà, on tronque plutôt que d'échouer : mieux vaut rendre les cartes du
  // début et le dire que de renvoyer une erreur sur un cours entier collé d'un bloc.
  const MAX_CHARS = 24000;
  const truncated = text.length > MAX_CHARS;
  const source = truncated ? text.slice(0, MAX_CHARS) : text;

  const maxCards = Math.min(Math.max(Number(body.maxCards) || 20, 1), 60);
  const prefer = body.prefer || "auto";

  const preferLine = prefer === "cloze"
    ? "Privilégie les textes à trous chaque fois qu'ils conviennent."
    : prefer === "basic"
      ? "Privilégie les cartes recto/verso ; n'emploie un texte à trous que si la carte recto/verso serait vraiment moins bonne."
      : "Choisis le type au cas par cas selon les règles.";

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Clé OpenAI absente : renseigne OPENAI_API_KEY pour utiliser l'atelier." },
      { status: 503 },
    );
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: Schema,
      system: SYSTEM,
      prompt: [
        body.topic ? `Thème du paquet : ${body.topic}` : "",
        `Vise environ ${maxCards} cartes — moins si le texte n'en contient pas autant qui vaillent la peine. Ne remplis JAMAIS pour atteindre le nombre.`,
        preferLine,
        "",
        "TEXTE :",
        source,
      ].filter(Boolean).join("\n"),
    });

    // Garde-fou de sortie : le modèle annonce parfois un texte à trous sans en
    // poser, ce qui donnerait une note sans aucune carte. On la rétrograde.
    const cards = object.cards.map(c => {
      const isCloze = c.kind === "cloze" && /\{\{c\d+::/.test(c.front);
      if (c.kind === "cloze" && !isCloze) {
        return { ...c, kind: "basic" as const, back: c.back || c.extra || "" };
      }
      return c;
    }).filter(c => c.front.trim() && (c.kind === "cloze" || c.back.trim()));

    return NextResponse.json({
      cards,
      summary: object.summary,
      skipped: object.skipped,
      truncated,
    });
  } catch (err) {
    console.error("[flashcards] génération échouée", err);
    return NextResponse.json(
      { error: "La génération a échoué. Réessaie, ou colle un extrait plus court." },
      { status: 502 },
    );
  }
}
