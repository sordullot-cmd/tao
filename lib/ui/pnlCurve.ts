/**
 * Courbes de P&L cumulé — un point par TRADE, sur toutes les fenêtres.
 *
 * La maille a suivi la pastille pendant un temps : trade par trade sur la
 * semaine et le mois, un point par jour au-delà, pour qu'un semestre ne
 * devienne pas un peigne. Le prix était plus cher que le gain. En passant de
 * 1M à 3M, la courbe ne s'allongeait pas : elle CHANGEAIT DE NATURE. Le creux
 * traversé en séance, la série de pertes rattrapée avant la clôture, le trade
 * unique qui porte la journée — tout cela s'effaçait d'un coup, et deux
 * fenêtres voisines racontaient deux histoires du même compte. On ne comparait
 * plus rien.
 *
 * Le trade est l'unité de ce que fait un trader ; c'est donc l'unité de la
 * courbe, qu'on regarde sept jours ou douze mois. Une année dense y tient : les
 * points se serrent, la forme reste lisible, et c'est la même forme qu'en
 * zoomant.
 *
 * Le cumul quotidien n'est pas parti pour autant — il garde l'emploi où la
 * séance EST la bonne unité : le drawdown maximal des statistiques et le
 * calendrier. Il s'appelle alors directement (`cumulativeByDay`), sans passer
 * par la courbe.
 */

import { tradeInstant, type DatedTrade } from "@/lib/tradeOrder";

/** Un point de courbe. `label` et `delta` ne servent qu'à l'infobulle. */
export interface CurvePoint {
  date: string;
  cum: number;
  /** Libellé d'infobulle : la date seule ne suffit pas, deux trades d'une même
   *  séance porteraient le même jour. Absent des points produits par
   *  `cumulativeByDay`, où la date se formate toute seule. */
  label?: string;
  /** P&L du trade lui-même, à côté du cumul. */
  delta?: number;
}

interface CurveTrade extends DatedTrade {
  pnl?: unknown;
}

/* `entry_time` en repli : quelques trades importés n'ont pas de `date` propre
   mais un horodatage complet. Une heure seule (« 17:01 ») ne passe pas le
   contrôle de validité plus bas — elle est écartée, comme avant. */
const dayKey = (tr: CurveTrade): string =>
  String(tr?.date ?? (tr as { entry_time?: unknown })?.entry_time ?? "").slice(0, 10);

const pnlOf = (tr: CurveTrade): number => Number(tr?.pnl) || 0;

/**
 * Point d'ancrage à zéro, la VEILLE du premier point : sans lui la courbe
 * démarre au résultat du premier trade, et une première séance gagnante donne
 * l'illusion d'un compte qui n'est jamais parti de rien.
 */
function zeroAnchor(firstDate: string): CurvePoint | null {
  const d = new Date(String(firstDate).slice(0, 10));
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - 1);
  return { date: d.toISOString().slice(0, 10), cum: 0 };
}

/** Cumul du P&L, un point par jour tradé. */
export function cumulativeByDay(trades: CurveTrade[] | null | undefined): CurvePoint[] {
  const byDay = new Map<string, number>();
  for (const tr of trades || []) {
    const k = dayKey(tr);
    if (!k || isNaN(new Date(k).getTime())) continue;
    byDay.set(k, (byDay.get(k) || 0) + pnlOf(tr));
  }
  let cum = 0;
  return [...byDay.keys()].sort().map((date) => {
    cum += byDay.get(date) as number;
    return { date, cum };
  });
}

/**
 * Cumul du P&L, un point par trade.
 *
 * La date portée par le point est l'instant du trade (`2026-09-01T17:01:15`) et
 * non son seul jour : c'est ce qui permet à `windowSeries` de découper la
 * fenêtre et aux courbes d'arrière-plan de s'aligner sur le bon rang quand
 * plusieurs comptes tradent la même journée.
 */
export function cumulativeByTrade(trades: CurveTrade[] | null | undefined): CurvePoint[] {
  /* L'instant est calculé une fois par trade — il sert à trier, à situer le
     point sur l'axe et à l'étiqueter. `tradeInstant` le veut sur `date` : on lui
     donne le jour déjà résolu, repli sur `entry_time` compris. */
  const dated = (trades || [])
    .map((tr) => ({ tr, day: dayKey(tr) }))
    .filter(({ day }) => day && !isNaN(new Date(day).getTime()))
    .map(({ tr, day }) => ({ tr, instant: tradeInstant({ ...tr, date: day }) }))
    .sort((a, b) => a.instant.localeCompare(b.instant));

  let cum = 0;
  return dated.map(({ tr, instant }) => {
    const delta = pnlOf(tr);
    cum += delta;
    return { date: instant, cum, label: tradeLabel(instant), delta };
  });
}

/** « 1 sept. · 17:01 », ou la seule date quand l'heure n'est pas renseignée. */
function tradeLabel(instant: string): string {
  const d = new Date(instant);
  if (isNaN(d.getTime())) return instant.slice(0, 10);
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return instant.endsWith("T00:00:00")
    ? day
    : `${day} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * La courbe à tracer : le cumul, trade par trade.
 *
 * Le découpage en fenêtres ne se fait pas ici — `windowSeries` coupe la fin de
 * cette série selon la pastille. La séparation tient : ce module dit CE QUI est
 * tracé, la fenêtre dit JUSQU'OÙ on remonte.
 *
 * `anchorZero` ajoute le point de départ à zéro (cf. `zeroAnchor`). Il reste
 * une option : toutes les pages ne l'ont pas, et le poser d'office déplacerait
 * l'origine de courbes déjà en place.
 */
export function pnlCurve(
  trades: CurveTrade[] | null | undefined,
  { anchorZero = false }: { anchorZero?: boolean } = {},
): CurvePoint[] {
  const points = cumulativeByTrade(trades);
  if (!anchorZero || points.length === 0) return points;
  const anchor = zeroAnchor(points[0].date);
  return anchor ? [anchor, ...points] : points;
}
