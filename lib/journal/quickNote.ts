"use client";

/**
 * Ajouter une ligne au journal du jour, depuis n'importe où.
 *
 * Écrit dans la MÊME entrée que la page Journal : `daily_session_notes`, une
 * ligne par date, doublée dans `tr4de_daily_notes` côté local (cf.
 * `lib/hooks/useDailySessionNotes.ts`). Le popover de la barre d'état écrit ici,
 * et la page Journal relit la même chose — sans quoi on aurait un second
 * journal, invisible depuis le premier.
 *
 * ── POURQUOI UN MODULE ET PAS LE HOOK ─────────────────────────────────────
 *
 * `useDailySessionNotes` tient un état React, chargé au montage. L'appeler
 * depuis `TrayBridge` — qui n'affiche rien — en monterait une seconde copie,
 * périmée dès que la page Journal écrit de son côté. Ici, le magasin est RELU
 * au moment d'écrire : deux notes envoyées à une seconde d'intervalle
 * s'ajoutent l'une après l'autre au lieu que la seconde efface la première.
 *
 * ── HORS LIGNE ────────────────────────────────────────────────────────────
 *
 * localStorage d'abord, Supabase ensuite, et un échec réseau n'est pas un
 * échec : la note est écrite, elle remontera. C'est le même contrat que le
 * reste de l'app (cf. CLAUDE.md, « Hors ligne »). Seul un stockage local
 * refusé fait rendre `ok: false` — là, il y a vraiment quelque chose à dire à
 * l'utilisateur.
 */

import { createClient } from "@/lib/supabase/client";
import { getLocalDateString } from "@/lib/dateUtils";

const LOCAL_KEY = "tr4de_daily_notes";

export interface AppendResult {
  ok: boolean;
  /** La note complète du jour après ajout — utile pour vérifier, et tester. */
  note: string;
  error: string | null;
}

/** `14:32` — l'heure suffit, la date est celle de l'entrée. */
function stamp(at: Date): string {
  return at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Colle la nouvelle ligne sous les précédentes.
 *
 * Horodatée, parce qu'une note de séance se relit pour comprendre l'ORDRE des
 * choses — ce qu'on s'est dit avant l'entrée, puis ce qu'on s'est dit après.
 * Sans heure, trois phrases empilées sont un paragraphe sans chronologie.
 */
export function mergeNote(existing: string, text: string, at: Date = new Date()): string {
  const line = `${stamp(at)} — ${text.trim()}`;
  const before = existing.trimEnd();
  return before ? `${before}\n${line}` : line;
}

function readLocal(day: string): string {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return typeof all?.[day] === "string" ? all[day] : "";
  } catch {
    return "";
  }
}

function writeLocal(day: string, note: string): boolean {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[day] = note;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ajoute une ligne au journal du jour.
 *
 * La remontée Supabase est tentée sans être attendue par l'appelant : au
 * popover, une note « part » dès qu'elle est dans le storage. Attendre le
 * réseau y ferait clignoter un champ pendant deux secondes pour un résultat
 * qui, hors ligne, n'arriverait jamais.
 */
export async function appendDailyNote(
  text: string,
  day: string = getLocalDateString(),
  at: Date = new Date()
): Promise<AppendResult> {
  const clean = text.trim();
  if (!clean) return { ok: false, note: "", error: "note vide" };

  const note = mergeNote(readLocal(day), clean, at);
  if (!writeLocal(day, note)) {
    return { ok: false, note, error: "stockage local refusé" };
  }

  void pushToCloud(day, note);
  return { ok: true, note, error: null };
}

/**
 * Remonte la note. L'absence de table est ignorée comme partout ailleurs dans
 * ce hook : `daily_session_notes` n'existe pas chez tout le monde, et son
 * absence ne doit pas faire passer une note écrite pour une note perdue.
 */
async function pushToCloud(day: string, note: string): Promise<void> {
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    const { data: existing } = await supabase
      .from("daily_session_notes")
      .select("id")
      .eq("user_id", userId)
      .eq("date", day)
      .single();

    if (existing?.id) {
      await supabase
        .from("daily_session_notes")
        .update({ notes: note, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("daily_session_notes")
        .insert([{ user_id: userId, date: day, notes: note }]);
    }
  } catch (e) {
    // Réseau coupé, table absente, session expirée : la note est déjà écrite
    // localement, et c'est la seule chose qui devait être garantie ici.
    console.warn("[journal] note non remontée", e);
  }
}
