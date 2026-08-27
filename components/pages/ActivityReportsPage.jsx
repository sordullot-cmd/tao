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
import { CARD, AllocationChart, PeriodPills, HAIRLINE } from "@/components/ui/da";
import { EmptyState } from "@/components/ui/EmptyState";
import { T } from "@/lib/ui/tokens";
import { PALETTE, GREY } from "@/lib/ui/palette";
import { getLocalDateString } from "@/lib/dateUtils";
import { loadRange } from "@/lib/activity/engine";
import { fmtDur, rangeStats } from "@/lib/activity/stats";
import { PRODUCTIVITY_COLOR } from "@/lib/activity/categories";
import { useActivityLive, useActivitySettings, useDayLog } from "@/lib/hooks/useActivityTracker";
import {
  ActivityHeader, AppRows, BlockTitle, CategoryRows, HourBars, KpiTile, SourceNotice,
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

/** Barres empilées par jour : la régularité se voit là, pas dans une moyenne. */
function DailyBars({ days, categories, goalMs }) {
  const max = Math.max(1, ...days.map(d => d.activeMs), goalMs || 0);
  const height = 150;
  const top = categories.slice(0, 6).map(c => c.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, position: "relative" }}>
        {goalMs > 0 && (
          <div
            title={`Objectif : ${fmtDur(goalMs)}`}
            style={{
              position: "absolute", left: 0, right: 0, bottom: (goalMs / max) * height,
              borderTop: `1px dashed ${T.border2}`, pointerEvents: "none",
            }}
          />
        )}
        {days.map(d => {
          const stacks = d.byCategory
            // Les catégories hors du haut du classement finissent dans une part
            // grise : six teintes suffisent à lire une colonne, douze la brouillent.
            .map(b => ({ ...b, color: top.includes(b.id) ? b.color : GREY.grey300 }))
            .sort((a, b) => b.ms - a.ms);
          return (
            <div key={d.date} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", height, gap: 0 }}
              title={`${new Date(`${d.date}T00:00:00`).toLocaleDateString()} — ${fmtDur(d.activeMs)} actif, ${fmtDur(d.focusMs)} de focus`}
            >
              {stacks.map((b, i) => (
                <div key={b.id} style={{
                  height: (b.ms / max) * height,
                  background: b.color,
                  borderRadius: i === 0 ? "3px 3px 0 0" : 0,
                  minHeight: b.ms > 0 ? 1 : 0,
                }} />
              ))}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {days.map(d => {
          const jd = new Date(`${d.date}T00:00:00`);
          const weekend = jd.getDay() === 0 || jd.getDay() === 6;
          return (
            <span key={d.date} style={{
              flex: 1, minWidth: 0, textAlign: "center", fontSize: 10,
              color: weekend ? T.textMut : T.textSub, fontVariantNumeric: "tabular-nums",
              overflow: "hidden", whiteSpace: "nowrap",
            }}>
              {days.length <= 14 ? `${WEEKDAYS[(jd.getDay() + 6) % 7][0]}${jd.getDate()}` : (jd.getDate() % 5 === 0 ? jd.getDate() : "")}
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
  const [rangeId, setRangeId] = useState("7");
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
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))" }}>
            <KpiTile
              label="Temps actif"
              value={fmtDur(stats.activeMs)}
              sub={<DeltaLine label="Actif" ms={stats.activeMs} refMs={prevStats.activeMs} />}
            />
            <KpiTile
              label="Temps de focus"
              value={fmtDur(stats.focusMs)}
              color={PALETTE.green}
              sub={<DeltaLine label="Focus" ms={stats.focusMs} refMs={prevStats.focusMs} />}
            />
            <KpiTile
              label="Moyenne par jour mesuré"
              value={fmtDur(stats.avgActiveMs)}
              valueMs={stats.avgActiveMs}
              goalMs={workGoalMs}
              sub={`${stats.activeDays} jour${stats.activeDays > 1 ? "s" : ""} sur ${range.days}`}
            />
            <KpiTile
              label="Focus moyen"
              value={fmtDur(stats.avgFocusMs)}
              valueMs={stats.avgFocusMs}
              goalMs={focusGoalMs}
              color={PALETTE.green}
              sub={`Objectif atteint ${goalDays} fois`}
            />
            <KpiTile
              label="Score moyen"
              value={`${stats.avgScore}`}
              sub="Sur 100, jours mesurés uniquement"
            />
            <KpiTile
              label="Distractions"
              value={fmtDur(stats.distractingMs)}
              color={stats.distractingMs > 0 ? PRODUCTIVITY_COLOR.distracting : T.text}
              sub={stats.bestDay ? `Meilleur jour : ${new Date(`${stats.bestDay.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}` : null}
            />
          </div>

          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
            <BlockTitle right={`${fmtDur(stats.activeMs)} sur ${range.days} jours`}>Jour par jour</BlockTitle>
            <DailyBars days={stats.days} categories={stats.byCategory} goalMs={workGoalMs} />
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
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
              <BlockTitle>Répartition de la période</BlockTitle>
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
              <BlockTitle>Applications & sites</BlockTitle>
              <AppRows apps={stats.byApp} limit={10} />
            </div>
          </div>

          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
            <BlockTitle>Quand la semaine travaille</BlockTitle>
            <WeekHeatmap days={stats.days} />
            <span style={{ fontSize: 11, color: T.textSub }}>
              Intensité = temps productif cumulé sur la période, par jour de la semaine et par heure.
            </span>
          </div>

          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
            <BlockTitle>Rythme moyen de la journée</BlockTitle>
            <HourBars hourly={stats.hourly} height={110} />
          </div>
        </>
      )}
    </div>
  );
}
