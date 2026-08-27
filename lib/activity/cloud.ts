/**
 * L'activité mesurée, rangée par COMPTE et non par machine.
 *
 * ── Ce qui a changé, et pourquoi ──────────────────────────────────────────
 * Les journées vivaient dans le localStorage du poste, délibérément : une
 * activité est celle d'une machine, et deux postes versés dans le même total
 * donnent des heures qui n'ont jamais existé. Le raisonnement tenait, mais il
 * répondait à la mauvaise question — on ne veut pas savoir ce qu'a fait un
 * poste, on veut savoir ce qu'on a fait de sa journée, et le lire de n'importe
 * où (le téléphone, un autre poste, plus tard).
 *
 * Le risque est donc traité plutôt qu'évité, en trois points :
 *
 *   1. UNE LIGNE PAR JOUR, une TRANCHE PAR POSTE. La ligne `activity_day_<date>`
 *      contient `{ devices: { <id>: { segments, awayMs } } }`. Un poste n'écrit
 *      jamais que sa tranche : deux machines qui mesurent le même jour ne
 *      s'écrasent pas.
 *   2. UNE MINUTE N'APPARTIENT QU'À UN APPAREIL, et c'est le mieux renseigné qui
 *      la prend (cf. lib/activity/merge). Le total reste une durée réelle, jamais
 *      une somme de deux vies parallèles — et la catégorie retenue est celle de
 *      l'appareil qui SAVAIT : l'app de bureau nomme l'application, une page web
 *      ne peut dire que « tao trade ».
 *   3. TOUS LES APPAREILS MESURENT, chacun selon ce qu'il voit. Le téléphone est
 *      la seule source d'une soirée où le poste était éteint — c'est la raison
 *      d'être de tout ce fichier. Il ne prend simplement pas le pas sur le poste
 *      quand les deux étaient allumés.
 *
 * ── Coût ──────────────────────────────────────────────────────────────────
 * Une journée pleine pèse quelques dizaines de kilo-octets (les titres de
 * fenêtres en font le gros). On ne va donc chercher QUE les dates demandées, et
 * une fois par session : le rapport à 90 jours tire quelques mégaoctets, la vue
 * du jour presque rien.
 */

import { createClient } from "@/lib/supabase/client";
import { hasNativeTracking } from "@/lib/activity/native";
import type { DeviceKind } from "@/lib/activity/merge";
import type { DayLog, Segment } from "@/lib/activity/engine";

/* ─── Ce poste ───────────────────────────────────────────────────────────── */

const DEVICE_KEY = "tr4de_activity_device";

interface DeviceStamp {
  id: string;
  label: string;
  /** Ce que cet appareil voit du poste — décide qui passe devant en cas de
   *  chevauchement (cf. lib/activity/merge). */
  kind: DeviceKind;
}

let stamp: DeviceStamp | null = null;

/**
 * Ce que cet appareil peut voir.
 *
 * `desktop` n'est pas une question de matériel mais de PORTÉE : c'est la coquille
 * de bureau, la seule qui lise les autres applications. Un navigateur sur le même
 * ordinateur ne voit que tao trade — il compte donc comme `web`.
 */
function guessKind(): DeviceKind {
  if (hasNativeTracking()) return "desktop";
  if (typeof navigator === "undefined") return "web";
  return /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent || "") ? "mobile" : "web";
}

/** Nom lisible du poste, deviné une fois pour toutes. */
function guessLabel(): string {
  if (typeof navigator === "undefined") return "Poste";
  const ua = navigator.userAgent || "";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "PC Windows";
  if (/Linux/.test(ua) && !/Android/.test(ua)) return "PC Linux";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iPhone";
  return "Poste";
}

/**
 * Identité de ce poste — stable, locale, et sans rien qui l'identifie ailleurs.
 *
 * Elle sert à deux choses : n'écrire que SA tranche de la journée, et pouvoir
 * dire « mesuré sur Mac » quand une journée vient d'ailleurs.
 */
export function device(): DeviceStamp {
  if (stamp) return stamp;
  if (typeof window === "undefined") return { id: "ssr", label: "Serveur", kind: "web" };
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) {
        /* La PORTÉE est relue à chaque démarrage, pas mémorisée : la même
           installation peut être ouverte un jour dans l'app de bureau et le
           lendemain dans un onglet, et ce n'est pas le même appareil du point de
           vue de ce qu'il voit. Le nom, lui, reste celui qu'on a donné. */
        stamp = { id: String(parsed.id), label: String(parsed.label || guessLabel()), kind: guessKind() };
        return stamp;
      }
    }
  } catch { /* stockage refusé : on repart d'une identité neuve */ }
  stamp = { id: `d-${Math.random().toString(36).slice(2, 10)}`, label: guessLabel(), kind: guessKind() };
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ id: stamp.id, label: stamp.label })); } catch {}
  return stamp;
}

/** Renommer ce poste — c'est ce nom qui s'affiche à côté d'une journée. */
export function renameDevice(label: string): void {
  const next = { id: device().id, label: label.trim() || guessLabel(), kind: device().kind };
  stamp = next;
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ id: next.id, label: next.label })); } catch {}
}

/* ─── Forme stockée ──────────────────────────────────────────────────────── */

export interface CloudSlice {
  label: string;
  /** Portée de l'appareil qui a écrit cette tranche. Absente sur les tranches
   *  écrites avant qu'on la note : on suppose alors le bureau, seul à mesurer
   *  à l'époque. */
  kind?: DeviceKind;
  segments: Segment[];
  awayMs: number;
  updatedAt: number;
}

export interface CloudDay {
  date: string;
  devices: Record<string, CloudSlice>;
}

const cloudKey = (date: string) => `activity_day_${date}`;

/* ─── Accès ──────────────────────────────────────────────────────────────── */

async function userId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function sane(raw: unknown, date: string): CloudDay {
  const devices: Record<string, CloudSlice> = {};
  const src = (raw as CloudDay | null)?.devices;
  if (src && typeof src === "object") {
    for (const [id, slice] of Object.entries(src)) {
      if (!Array.isArray(slice?.segments)) continue;
      devices[id] = {
        label: String(slice.label || "Poste"),
        kind: slice.kind === "mobile" || slice.kind === "web" ? slice.kind : "desktop",
        segments: slice.segments,
        awayMs: Number(slice.awayMs) || 0,
        updatedAt: Number(slice.updatedAt) || 0,
      };
    }
  }
  return { date, devices };
}

/** Les journées demandées, telles que le compte les connaît. */
export async function fetchDays(dates: string[]): Promise<CloudDay[]> {
  if (!dates.length) return [];
  const uid = await userId();
  if (!uid) return [];
  try {
    const { data, error } = await createClient()
      .from("user_productivity")
      .select("key, value")
      .eq("user_id", uid)
      .in("key", dates.map(cloudKey));
    if (error || !data) return [];
    return data.map(row => sane(row.value, String(row.key).replace("activity_day_", "")));
  } catch {
    return [];
  }
}

/**
 * Verse la journée de CE poste, sans toucher aux tranches des autres.
 *
 * Lecture puis écriture, et non un simple remplacement : la ligne appartient au
 * jour, pas au poste. Deux machines qui pousseraient dans la même seconde
 * pourraient encore se croiser — le cas demande deux postes mesurant la même
 * journée en même temps, et la fenêtre est celle d'une requête.
 */
export async function pushDay(day: DayLog): Promise<boolean> {
  const uid = await userId();
  if (!uid) return false;
  const me = device();
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("user_productivity")
      .select("value")
      .eq("user_id", uid)
      .eq("key", cloudKey(day.date))
      .maybeSingle();

    const current = sane(data?.value, day.date);
    const next: CloudDay = {
      date: day.date,
      devices: {
        ...current.devices,
        [me.id]: {
          label: me.label,
          kind: me.kind,
          segments: day.segments,
          awayMs: day.awayMs || 0,
          updatedAt: Date.now(),
        },
      },
    };
    const { error } = await supabase
      .from("user_productivity")
      .upsert(
        { user_id: uid, key: cloudKey(day.date), value: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
    return !error;
  } catch {
    return false;
  }
}

/**
 * Retire la tranche de ce poste des journées données ; la ligne disparaît quand
 * plus aucun poste n'y figure. Effacer son historique ne doit pas effacer celui
 * d'une autre machine.
 */
export async function forgetDevice(dates: string[]): Promise<void> {
  const uid = await userId();
  if (!uid || !dates.length) return;
  const me = device();
  const supabase = createClient();
  const rows = await fetchDays(dates);
  for (const row of rows) {
    if (!row.devices[me.id]) continue;
    const devices = { ...row.devices };
    delete devices[me.id];
    try {
      if (Object.keys(devices).length === 0) {
        await supabase.from("user_productivity").delete().eq("user_id", uid).eq("key", cloudKey(row.date));
      } else {
        await supabase
          .from("user_productivity")
          .upsert(
            { user_id: uid, key: cloudKey(row.date), value: { date: row.date, devices }, updated_at: new Date().toISOString() },
            { onConflict: "user_id,key" }
          );
      }
    } catch { /* hors ligne : la prochaine tentative repassera par là */ }
  }
}
