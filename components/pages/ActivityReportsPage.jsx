"use client";

/* ============================================================================
   « Activité → Rapports » — la semaine, le mois, le trimestre.

   Une journée dit ce qui s'est passé ; une période dit ce qui se RÉPÈTE. La page
   ne réaffiche donc pas les mêmes blocs sur plus de jours : elle montre ce
   qu'une seule journée ne peut pas montrer — la régularité (barres par jour), le
   rythme de la semaine (heures × jours), la dérive (comparaison à la période
   précédente).
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { CARD, AllocationChart, FIELD_BG, PeriodPills, HAIRLINE } from "@/components/ui/da";
import { EmptyState } from "@/components/ui/EmptyState";
import { T } from "@/lib/ui/tokens";
import { PALETTE, GREY } from "@/lib/ui/palette";
import { getLocalDateString } from "@/lib/dateUtils";
import { loadRange } from "@/lib/activity/engine";
import { fmtDur, rangeStats } from "@/lib/activity/stats";
import { PRODUCTIVITY_COLOR } from "@/lib/activity/categories";
import { useActivityLive, useActivitySettings, useDayLog } from "@/lib/hooks/useActivityTracker";
import {
  ActivityHeader, AppRows, BlockTitle, CategoryRows, HourBars, Metric, SourceNotice,
} from "@/components/activity/ActivityChrome";

const RANGES = [
  { id: "7", label: "7 jours", days: 7 },
  { id: "30", label: "30 jours", days: 30 },
  { id: "90", label: "90 jours", days: 90 },
];

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

/**
 * Les journées calées sur des semaines entières : la première colonne est le
 * LUNDI de la semaine où la première mesure a eu lieu.
 *
 * Une fenêtre de trente jours commence n'importe quel jour ; les colonnes se
 * lisaient alors comme une file continue, où rien ne disait où une semaine
 * finissait. En partant du lundi, elles vont de lundi à dimanche puis
 * recommencent, et deux mardis se retrouvent toujours à sept colonnes l'un de
 * l'autre.
 *
 * On part de la première DONNÉE, pas du bord de la fenêtre : commencer au
 * premier lundi de la fenêtre coupait les jours mesurés d'avant (une mesure
 * qui existe ne doit disparaître d'aucune figure), et commencer au bord donnait
 * une semaine amputée. Quand ce lundi précède la fenêtre, les quelques jours
 * manquants sont ajoutés à VIDE : ils appartiennent à la semaine affichée, et
 * rien n'y a été mesuré — c'est exactement ce que dit une colonne à zéro.
 */
function fromMonday(days) {
  if (!days.length) return days;
  const firstMeasured = days.findIndex(d => d.activeMs > 0);
  if (firstMeasured < 0) return days;

  const start = new Date(`${days[firstMeasured].date}T00:00:00`);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const startKey = getLocalDateString(start);

  const pad = [];
  for (const d = new Date(start); getLocalDateString(d) < days[0].date; d.setDate(d.getDate() + 1)) {
    pad.push({ date: getLocalDateString(d), activeMs: 0, focusMs: 0, byCategory: [] });
  }
  return [...pad, ...days.filter(d => d.date >= startKey)];
}

/**
 * Barres empilées par jour : la régularité se voit là, pas dans une moyenne.
 *
 * Même dessin que le temps d'écran de l'onglet « Journée » — colonnes larges,
 * sommet arrondi, gouttière franche — parce que c'est la même figure : des jours
 * en colonnes. Elles se lisaient ici en traits de quatre pixels collés les uns
 * aux autres, là en barres respirées : deux styles pour un même objet obligent à
 * réapprendre le graphe en changeant d'onglet. Ce qui est empilé, en revanche, ne
 * change pas : ici les CATÉGORIES (une période sert à voir ce qui revient), là
 * la nature du temps.
 */
function DailyBars({ days, categories, goalMs }) {
  const max = Math.max(1, ...days.map(d => d.activeMs), goalMs || 0);
  const height = 260;
  const top = categories.slice(0, 6).map(c => c.id);
  /* La gouttière suit le nombre de jours : quatorze pixels entre trente colonnes
     ne laisseraient rien pour les colonnes elles-mêmes. */
  const gap = days.length <= 10 ? 14 : days.length <= 31 ? 5 : 2;
  const barW = days.length <= 31 ? "92%" : "100%";
  const barMax = days.length <= 10 ? 56 : 34;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap, height, position: "relative" }}>
        {goalMs > 0 && goalMs <= max && (
          <div
            title={`Objectif : ${fmtDur(goalMs)}`}
            style={{
              position: "absolute", left: 0, right: 0, bottom: (goalMs / max) * height,
              borderTop: `1px dotted ${T.border2}`, pointerEvents: "none",
            }}
          />
        )}
        {days.map((d, i) => {
          const stacks = d.byCategory
            // Les catégories hors du haut du classement finissent dans une part
            // grise : six teintes suffisent à lire une colonne, douze la brouillent.
            .map(b => ({ ...b, color: top.includes(b.id) ? b.color : GREY.grey300 }))
            .sort((a, b) => b.ms - a.ms);
          return (
            <div
              key={d.date}
              title={`${new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} — ${fmtDur(d.activeMs)} actif, ${fmtDur(d.focusMs)} de focus`}
              style={{
                flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-end",
                // Une respiration avant chaque lundi : c'est elle qui fait lire
                // « lundi → dimanche, puis on recommence ».
                marginLeft: i > 0 && new Date(`${d.date}T00:00:00`).getDay() === 1 ? gap : 0,
              }}
            >
              {/* La barre est plus étroite que sa colonne, comme dans l'onglet
                  « Journée » : c'est la colonne qui porte le survol. */}
              <div style={{
                width: barW, maxWidth: barMax, height: "100%", display: "flex",
                flexDirection: "column", justifyContent: "flex-end",
              }}>
                {stacks.length === 0 ? (
                  <div style={{ height: 2, background: FIELD_BG, borderRadius: 999 }} />
                ) : (
                  stacks.map((b, i) => (
                    <div key={b.id} style={{
                      height: (b.ms / max) * height,
                      background: b.color,
                      borderRadius: i === 0 ? "4px 4px 0 0" : 0,
                      minHeight: b.ms > 0 ? 1 : 0,
                    }} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap }}>
        {days.map((d, i) => {
          const jd = new Date(`${d.date}T00:00:00`);
          const weekend = jd.getDay() === 0 || jd.getDay() === 6;
          return (
            <span key={d.date} style={{
              flex: 1, minWidth: 0, textAlign: "center", fontSize: 10,
              color: weekend ? T.textMut : T.textSub, fontVariantNumeric: "tabular-nums",
              overflow: "hidden", whiteSpace: "nowrap",
              marginLeft: i > 0 && jd.getDay() === 1 ? gap : 0,
            }}>
              {/* L'initiale du jour tant qu'elle tient ; au-delà, seul le lundi
                  est nommé, par son quantième — les groupes de sept suffisent
                  alors à situer les autres. */}
              {days.length <= 35 ? WEEKDAYS[(jd.getDay() + 6) % 7][0] : (jd.getDay() === 1 ? jd.getDate() : "")}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Heures × jours de la semaine : quand la semaine travaille vraiment. */
function WeekHeatmap({ days }) {
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const d of days) {
      const wd = (new Date(`${d.date}T00:00:00`).getDay() + 6) % 7;
      for (const h of d.hourly) g[wd][h.hour] += h.productiveMs;
    }
    return g;
  }, [days]);

  const max = Math.max(1, ...grid.flat());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 3, paddingLeft: 34 }}>
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} style={{ flex: 1, minWidth: 12, textAlign: "center", fontSize: 10, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
      </div>
      {grid.map((row, wd) => (
        <div key={wd} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 34, fontSize: 11, color: T.textSub, flexShrink: 0 }}>{WEEKDAYS[wd]}</span>
          {row.map((ms, h) => {
            const pct = Math.round((ms / max) * 100);
            return (
              <span
                key={h}
                title={`${WEEKDAYS[wd]} ${h}h — ${fmtDur(ms)} productif`}
                style={{
                  flex: 1, minWidth: 12, height: 16, borderRadius: 3,
                  background: pct === 0
                    ? "var(--color-hover-bg, #F0F0F0)"
                    : `color-mix(in srgb, ${PRODUCTIVITY_COLOR.productive} ${Math.max(12, pct)}%, transparent)`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DeltaLine({ label, ms, refMs }) {
  if (refMs <= 0) return <span style={{ fontSize: 11, color: T.textSub }}>{label} : pas de période de référence</span>;
  const pct = Math.round(((ms - refMs) / refMs) * 100);
  const color = pct > 0 ? PALETTE.green : pct < 0 ? PALETTE.red : T.textSub;
  return (
    <span style={{ fontSize: 11, color: T.textSub }}>
      {label} : <strong style={{ color, fontWeight: 600 }}>{pct > 0 ? "+" : ""}{pct} %</strong> vs période précédente
    </span>
  );
}

export default function ActivityReportsPage({ setPage }) {
  const [settings] = useActivitySettings();
  const live = useActivityLive();
  /* Trente jours par défaut, et non sept : ce bloc-ci répond à « est-ce que je
     tiens dans la durée ? ». Sur sept jours il redisait la semaine que l'onglet
     « Journée » montre déjà, en moins bien — une habitude ne se lit pas sur
     cinq colonnes. */
  const [rangeId, setRangeId] = useState("30");
  const range = RANGES.find(r => r.id === rangeId) || RANGES[0];

  const today = getLocalDateString();
  const todayLog = useDayLog(today);

  /* Recalcul au plus une fois par minute : relire 90 jours à chaque échantillon
     (toutes les 5 s) coûterait cher pour un chiffre qui ne bouge pas à l'œil. */
  const minuteTick = useMemo(() => {
    const last = todayLog.segments[todayLog.segments.length - 1];
    return last ? Math.floor(last.e / 60_000) : 0;
  }, [todayLog]);

  const { stats, prevStats } = useMemo(() => {
    // `minuteTick` n'est pas lu : il ne sert qu'à rouvrir ce mémo au plus une
    // fois par minute quand la journée en cours s'allonge.
    void minuteTick;
    const from = shiftDate(today, -(range.days - 1));
    const logs = loadRange(from, today);
    const prevFrom = shiftDate(from, -range.days);
    const prevLogs = loadRange(prevFrom, shiftDate(from, -1));
    return { stats: rangeStats(logs, settings), prevStats: rangeStats(prevLogs, settings) };
  }, [range.days, settings, today, minuteTick]);

  const workGoalMs = settings.workGoalHours * 3600_000;
  const focusGoalMs = settings.focusGoalHours * 3600_000;
  const goalDays = stats.days.filter(d => d.focusMs >= focusGoalMs).length;

  // Les colonnes commencent au lundi de la semaine de la première mesure.
  const chartDays = useMemo(() => fromMonday(stats.days), [stats.days]);

  /* La régularité, chiffrée — c'est le propos du bloc, et l'œil ne compte pas
     seul une série de colonnes. Une moyenne de 4 h par jour décrit aussi bien
     quatre journées de 4 h qu'une de 16 h suivie de trois à zéro ; la série de
     jours tenus, elle, ne peut pas mentir là-dessus. */
  const rhythm = useMemo(() => {
    let best = 0;
    let run = 0;
    let met = 0;
    for (const d of stats.days) {
      const held = workGoalMs > 0 && d.activeMs >= workGoalMs;
      if (!held) { run = 0; continue; }
      met += 1;
      run += 1;
      if (run > best) best = run;
    }
    return { met, best };
  }, [stats.days, workGoalMs]);

  const bestHour = useMemo(() => {
    const best = stats.hourly.reduce((b, h) => (h.productiveMs > b.productiveMs ? h : b), stats.hourly[0]);
    return best?.productiveMs > 0 ? best : null;
  }, [stats.hourly]);

  const parts = stats.byCategory.map(b => ({ id: b.id, label: b.label, color: b.color, pct: b.pct, amount: b.ms }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ActivityHeader
        page="activity-reports"
        setPage={setPage}
        live={live}
        right={<PeriodPills value={rangeId} onChange={setRangeId} options={RANGES} size={12} />}
      />

      <SourceNotice live={live} />

      {stats.activeDays === 0 ? (
        <div style={CARD}>
          <EmptyState
            icon={CalendarRange}
            title="Pas encore d'historique"
            description="Les rapports se remplissent au fil des jours mesurés. Reviens demain : la première comparaison a besoin de deux journées."
            size="lg"
          />
        </div>
      ) : (
        <>
          {/* ── Les mesures de la période ──
              Six cartes blanches de 158 px alignées sur deux rangs : six objets
              de même poids pour six nombres, et autant de bords à traverser des
              yeux. C'est UNE carte — les mesures ne sont pas six sujets, elles
              sont les six faces du même. Les deux qui se comparent (actif,
              focus) portent leur écart avec la période précédente ; les deux qui
              se visent (moyennes, score) portent leur jauge. */}
          <div style={{ ...CARD, display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))" }}>
            <Metric
              label="Temps actif"
              value={fmtDur(stats.activeMs)}
              size={30}
              sub={<DeltaLine label="Actif" ms={stats.activeMs} refMs={prevStats.activeMs} />}
            />
            <Metric
              label="Temps de focus"
              value={fmtDur(stats.focusMs)}
              size={30}
              color={PALETTE.green}
              sub={<DeltaLine label="Focus" ms={stats.focusMs} refMs={prevStats.focusMs} />}
            />
            <Metric
              label="Moyenne par jour mesuré"
              value={fmtDur(stats.avgActiveMs)}
              valueMs={stats.avgActiveMs}
              goalMs={workGoalMs}
              size={30}
              sub={`${stats.activeDays} jour${stats.activeDays > 1 ? "s" : ""} sur ${range.days}`}
            />
            <Metric
              label="Focus moyen"
              value={fmtDur(stats.avgFocusMs)}
              valueMs={stats.avgFocusMs}
              goalMs={focusGoalMs}
              size={30}
              color={PALETTE.green}
              sub={`objectif atteint ${goalDays} fois`}
            />
            <Metric
              label="Score moyen"
              value={`${stats.avgScore}`}
              valueMs={stats.avgScore}
              goalMs={100}
              size={30}
              color={stats.avgScore >= 70 ? PALETTE.green : stats.avgScore >= 45 ? PALETTE.yellow : PALETTE.red}
              sub="sur 100, jours mesurés seulement"
            />
            <Metric
              label="Distractions"
              value={fmtDur(stats.distractingMs)}
              size={30}
              color={stats.distractingMs > 0 ? PRODUCTIVITY_COLOR.distracting : T.text}
              sub={stats.bestDay ? `meilleur jour : ${new Date(`${stats.bestDay.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric" })}` : null}
            />
          </div>

          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
            <BlockTitle right={`${fmtDur(stats.activeMs)} sur ${range.days} jours`}>Régularité</BlockTitle>
            <DailyBars days={chartDays} categories={stats.byCategory} goalMs={workGoalMs} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 4, borderTop: `1px solid ${HAIRLINE}` }}>
              {stats.byCategory.slice(0, 6).map(b => (
                <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textSub }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
                  {b.label}
                </span>
              ))}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textSub }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: GREY.grey300 }} /> autres
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 11, color: T.textSub }}>
              <span>
                <strong style={{ color: T.text, fontWeight: 600 }}>{stats.activeDays}</strong> jour{stats.activeDays > 1 ? "s" : ""} mesuré{stats.activeDays > 1 ? "s" : ""} sur {range.days}
              </span>
              {workGoalMs > 0 && (
                <>
                  <span>
                    Objectif de {fmtDur(workGoalMs)} tenu <strong style={{ color: T.text, fontWeight: 600 }}>{rhythm.met}</strong> fois
                  </span>
                  <span>
                    Meilleure série <strong style={{ color: T.text, fontWeight: 600 }}>{rhythm.best}</strong> jour{rhythm.best > 1 ? "s" : ""} d’affilée
                  </span>
                </>
              )}
              <span style={{ color: T.textMut }}>
                Une moyenne ne dit pas si les jours se ressemblent : c’est ce que ces colonnes montrent.
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
              <BlockTitle right={`${stats.byCategory.length} catégorie${stats.byCategory.length > 1 ? "s" : ""}`}>Répartition</BlockTitle>
              <AllocationChart
                kind="ring"
                parts={parts}
                scale={100}
                size={168}
                thickness={20}
                ariaLabel="Répartition du temps par catégorie sur la période"
                centreLabel="Temps actif"
                centreValue={stats.activeMs}
                formatValue={(v) => fmtDur(v, { short: true })}
                showPct={false}
              />
              <CategoryRows buckets={stats.byCategory} limit={6} />
            </div>

            <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 10 }}>
              <BlockTitle right={`${stats.byApp.length} au total`}>Applications & sites</BlockTitle>
              <AppRows apps={stats.byApp} limit={10} />
            </div>
          </div>

          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
            <BlockTitle right="heures × jours de la semaine">Semaine type</BlockTitle>
            <WeekHeatmap days={stats.days} />
            <span style={{ fontSize: 11, color: T.textSub }}>
              Intensité = temps productif cumulé sur la période, par jour de la semaine et par heure.
            </span>
          </div>

          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
            <BlockTitle right={bestHour ? `meilleure heure : ${bestHour.hour} h` : null}>Journée type</BlockTitle>
            <HourBars hourly={stats.hourly} height={110} />
          </div>
        </>
      )}
    </div>
  );
}
