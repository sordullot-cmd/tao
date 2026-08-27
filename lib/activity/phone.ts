/**
 * Suivi d'activité sur Android — le pont côté front.
 *
 * Deux mondes, deux façons de mesurer, et il faut le dire clairement parce que
 * tout le reste en découle :
 *
 *  • Sur un POSTE, l'app échantillonne. Elle demande toutes les quelques
 *    secondes quelle fenêtre est devant et construit la journée au fil de l'eau
 *    (cf. lib/activity/engine).
 *  • Sur ANDROID, elle RECONSTRUIT. Le système gèle le WebView dès que tao
 *    passe en arrière-plan : une boucle s'arrêterait exactement quand il y
 *    aurait quelque chose à voir. Mais Android tient déjà le journal des
 *    passages au premier plan, et on le relit à l'ouverture. Rien ne tourne en
 *    fond, rien ne consomme, et il n'y a aucun trou — le temps passé pendant
 *    que tao était fermé est là aussi.
 *
 * Ce que la plateforme ne donne pas : le TITRE de la fenêtre. On sait « Chrome
 * pendant 2 h 10 », jamais quel site. L'interface doit donc parler
 * d'applications et ne rien promettre de plus.
 *
 * Les mesures restent locales à l'appareil, comme sur un poste : le téléphone a
 * son propre magasin de données, donc son propre journal. C'est voulu — mélanger
 * le temps d'écran du téléphone et les heures de travail du Mac dans une même
 * journée donnerait des totaux qui ne veulent rien dire.
 */

import { isTauri } from "@/lib/notify";
import { classifyPhoneApp, type ClassifyRule } from "@/lib/activity/categories";
import type { Segment } from "@/lib/activity/engine";

/** Un passage au premier plan, tel que le système l'a enregistré. */
export interface PhoneSegment {
  packageName: string;
  app: string;
  s: number;
  e: number;
}

export interface UsageAccess {
  /** Vrai si « accès aux données d'utilisation » est accordé. */
  granted: boolean;
  /** Faux hors Android : il n'y a alors rien à autoriser ni à lire. */
  supported: boolean;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(command, args);
  } catch {
    /* Version de l'app antérieure à la commande, ou plateforme sans téléphone :
       l'appelant traite ça comme « non pris en charge ». */
    return null;
  }
}

/** L'appareil sait-il lire son propre usage, et l'autorisation est-elle donnée ? */
export async function usageAccess(): Promise<UsageAccess> {
  const res = await call<UsageAccess>("phone_usage_access");
  return { granted: !!res?.granted, supported: !!res?.supported };
}

/**
 * Ouvre l'écran système d'autorisation.
 *
 * « Accès aux données d'utilisation » est une permission SPÉCIALE : aucune boîte
 * de dialogue ne peut la demander, l'utilisateur la donne écran par écran. On y
 * mène donc, au lieu de faire semblant de la demander.
 */
export async function openUsageSettings(): Promise<void> {
  await call<void>("phone_open_usage_settings");
}

/** Bornes locales d'une journée « YYYY-MM-DD ». */
function dayBounds(date: string): { from: number; to: number } {
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  // Une journée en cours s'arrête MAINTENANT : demander l'avenir au système ne
  // rend rien, mais fermerait le dernier segment sur une heure qui n'est pas
  // encore arrivée.
  return { from: start.getTime(), to: Math.min(end.getTime(), Date.now()) };
}

/**
 * La journée du téléphone, telle que le système l'a vécue.
 *
 * Rend `null` quand il n'y a rien à lire (hors Android, ou autorisation
 * refusée) : l'appelant garde alors ce qu'il avait, plutôt que d'écraser un
 * journal par une journée vide.
 */
export async function phoneDay(date: string, rules: ClassifyRule[] = []): Promise<Segment[] | null> {
  const { from, to } = dayBounds(date);
  if (to <= from) return null;

  const res = await call<{ segments: PhoneSegment[]; granted: boolean; supported: boolean }>(
    "phone_segments", { from, to }
  );
  if (!res?.supported || !res.granted) return null;

  const out: Segment[] = [];
  for (const raw of res.segments || []) {
    const s = Math.max(from, raw.s);
    const e = Math.min(to, raw.e);
    if (!(e > s)) continue;
    const shown = raw.app || raw.packageName;
    const { category } = classifyPhoneApp(shown, raw.packageName, rules);
    out.push({
      s, e,
      // `app` porte le nom BRUT donné par l'OS — ici le paquet, comme ailleurs
      // le nom de processus. C'est lui qu'une règle « dans l'application » vise.
      app: raw.packageName,
      label: shown,
      title: "",
      cat: category,
    });
  }
  return out.sort((a, b) => a.s - b.s);
}
