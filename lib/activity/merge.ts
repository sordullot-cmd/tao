/**
 * Assembler la journée de plusieurs appareils en une seule.
 *
 * Le problème : un même moment peut être mesuré deux fois. Le poste tourne, le
 * téléphone est ouvert dans la poche, et les deux enregistrent. Mettre les deux
 * bout à bout donnerait huit heures pour quatre heures vécues, et tout ce qui en
 * découle (score, objectifs, moyennes, part de chaque catégorie) mentirait à
 * partir de là.
 *
 * La règle : une minute n'appartient qu'à UN appareil, et c'est le plus
 * RENSEIGNÉ qui la prend. L'app de bureau voit tout le poste — les applications,
 * les fenêtres, l'inactivité clavier ; une page web ne voit qu'elle-même. Quand
 * les deux parlent de la même minute, celle du bureau est la bonne, et c'est
 * surtout sa CATÉGORIE qui est juste : le téléphone n'aurait dit que « tao
 * trade » là où le poste sait dire « Développement ».
 *
 * Ce qui n'est PAS perdu : tout ce que les autres appareils ont mesuré en dehors
 * de ces minutes-là entre dans la journée. Le téléphone reste la seule source
 * d'une soirée où le poste était éteint — c'est même la raison de tout ceci.
 */

import type { Segment } from "@/lib/activity/engine";

/** Ce qu'un appareil voit du poste — donc ce que sa mesure vaut. */
export type DeviceKind = "desktop" | "web" | "mobile";

/**
 * Qui passe devant, du mieux renseigné au moins bien.
 *
 * `web` devant `mobile` non par principe mais par usage : un navigateur ouvert
 * sur un ordinateur accompagne une session de travail, un téléphone accompagne
 * autre chose. Les deux ne voient que tao trade ; à égalité d'information, on
 * garde celui qui est le plus probablement en train de travailler.
 */
export const DEVICE_PRIORITY: Record<DeviceKind, number> = {
  desktop: 3,
  web: 2,
  mobile: 1,
};

export interface DeviceSlice {
  kind: DeviceKind;
  segments: Segment[];
}

type Range = [number, number];

/** Fusionne une liste d'intervalles triés en intervalles disjoints. */
function normalize(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Le segment privé de ce qui est déjà pris — zéro, un ou plusieurs morceaux. */
function subtract(seg: Segment, taken: Range[]): Segment[] {
  const out: Segment[] = [];
  let cursor = seg.s;
  for (const [ts, te] of taken) {
    if (te <= cursor) continue;
    if (ts >= seg.e) break;
    if (ts > cursor) out.push({ ...seg, s: cursor, e: Math.min(ts, seg.e) });
    cursor = Math.max(cursor, te);
    if (cursor >= seg.e) break;
  }
  if (cursor < seg.e) out.push({ ...seg, s: cursor, e: seg.e });
  return out;
}

/**
 * La journée du compte : chaque appareil apporte ce qu'aucun mieux renseigné
 * n'avait déjà couvert.
 *
 * Une seule source ⇒ ses segments ressortent tels quels, à l'identité près.
 * C'est le cas courant, et il ne doit rien coûter ni rien changer.
 */
export function mergeSlices(slices: DeviceSlice[]): Segment[] {
  const live = slices.filter(s => s.segments.length > 0);
  if (live.length === 0) return [];
  if (live.length === 1) {
    return [...live[0].segments].sort((a, b) => a.s - b.s);
  }

  const ordered = [...live].sort((a, b) => DEVICE_PRIORITY[b.kind] - DEVICE_PRIORITY[a.kind]);
  const out: Segment[] = [];
  let taken: Range[] = [];

  for (const slice of ordered) {
    const mine = [...slice.segments].filter(s => s && s.e > s.s).sort((a, b) => a.s - b.s);
    for (const seg of mine) out.push(...subtract(seg, taken));
    // Le rang se joue APRÈS la tranche entière : deux segments du même appareil
    // ne se disputent pas leurs minutes entre eux.
    taken = normalize([...taken, ...mine.map(s => [s.s, s.e] as Range)]);
  }

  return out.sort((a, b) => a.s - b.s);
}
