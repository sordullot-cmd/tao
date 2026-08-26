"use client";

/* ============================================================================
   « Activité » — la journée mesurée.

   Réplique du tableau de bord quotidien de Rize, avec la même règle de lecture :
   on ne montre pas un total isolé, on montre le total ET sa forme. D'où l'ordre
   de la page :

     1. les mesures de la journée (actif, focus, distraction, pauses) ;
     2. le BANDEAU, qui dit où ce temps s'est posé et où sont les trous ;
     3. la répartition par catégorie et le score de focus ;
     4. les applications, puis les sessions de focus, qui nomment le détail ;
     5. le rythme horaire, qui répond à « quand suis-je bon ? ».

   Les mesures viennent de lib/activity : la page ne calcule rien elle-même, elle
   ne fait que choisir ce qu'on lit et dans quel ordre.
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import { CARD, AllocationChart, StepperPill, PillButton, HAIRLINE } from "@/components/ui/da";
import { EmptyState } from "@/components/ui/EmptyState";
import { T } from "@/lib/ui/tokens";
import { PALETTE, GREY } from "@/lib/ui/palette";
import { getLocalDateString } from "@/lib/dateUtils";
import { dayStats, fmtClock, fmtDur } from "@/lib/activity/stats";
import { useActivityLive, useActivitySettings, useDayLog } from "@/lib/hooks/useActivityTracker";
import {
  ActivityHeader, AppRows, BlockTitle, CategoryRows, HourBars, KpiTile,
  ScoreDial, SessionRows, SourceNotice, TimelineBand, Toggle,
} from "@/components/activity/ActivityChrome";

const TODAY = () => getLocalDateString();

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

function dateLabel(date) {
  if (date === TODAY()) return "Aujourd'hui";
  if (date === shiftDate(TODAY(), -1)) return "Hier";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long",
  });
}

/** Écart avec la veille — la seule comparaison qui a du sens sur une journée. */
function Delta({ ms, refMs }) {
  if (refMs <= 0) return null;
  const diff = ms - refMs;
  const pct = Math.round((diff / refMs) * 100);
  if (Math.abs(pct) < 3) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.textSub }}>
        <Minus size={11} /> comme hier
      </span>
    );
  }
  const up = diff > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.textSub }}>
      <Icon size={11} /> {up ? "+" : ""}{pct} % vs hier
    </span>
  );
}

export default function ActivityPage({ setPage }) {
  const [settings, setSettings] = useActivitySettings();
  const live = useActivityLive();
  const [date, setDate] = useState(() => TODAY());

  const day = useDayLog(date);
  const prevDay = useDayLog(shiftDate(date, -1));

  const stats = useMemo(() => dayStats(day, settings), [day, settings]);
  const prev = useMemo(() => dayStats(prevDay, settings), [prevDay, settings]);

  const isToday = date === TODAY();
  const workGoalMs = settings.workGoalHours * 3600_000;
  const focusGoalMs = settings.focusGoalHours * 3600_000;

  const parts = stats.byCategory.map(b => ({
    id: b.id, label: b.label, color: b.color, pct: b.pct, amount: b.ms,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ActivityHeader
        page="activity"
        setPage={setPage}
        live={isToday ? live : null}
        right={
          <>
            <StepperPill
              label={dateLabel(date)}
              onPrev={() => setDate(d => shiftDate(d, -1))}
              onNext={() => setDate(d => shiftDate(d, 1))}
              nextDisabled={isToday}
              prevLabel="Jour précédent"
              nextLabel="Jour suivant"
            />
            {!isToday && (
              <PillButton compact variant="ghost" onClick={() => setDate(TODAY())}>
                <RefreshCw size={13} /> Aujourd’hui
              </PillButton>
            )}
          </>
        }
      />

      {isToday && <SourceNotice live={live} />}

      {/* Interrupteur du suivi : à la vue de la journée, pas enfoui dans les
          réglages — c'est la commande qu'on cherche quand on veut arrêter de
          mesurer, et la seule qui change ce que la page raconte. */}
      <div style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <Toggle
          label={settings.enabled ? "Suivi actif" : "Suivi en pause"}
          checked={settings.enabled}
          onChange={(v) => setSettings(s => ({ ...s, enabled: v }))}
          hint={`Relevé toutes les ${settings.pollSeconds} s · inactivité comptée à partir de ${Math.round(settings.afkSeconds / 60)} min sans clavier ni souris`}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.textSub }}>
            Première activité <strong style={{ color: T.text, fontWeight: 600 }}>{stats.firstAt ? fmtClock(stats.firstAt) : "—"}</strong>
          </span>
          <span style={{ fontSize: 12, color: T.textSub }}>
            Dernière <strong style={{ color: T.text, fontWeight: 600 }}>{stats.lastAt ? fmtClock(stats.lastAt) : "—"}</strong>
          </span>
          <span style={{ fontSize: 12, color: T.textSub }}>
            Amplitude <strong style={{ color: T.text, fontWeight: 600 }}>{fmtDur(stats.spanMs)}</strong>
          </span>
        </div>
      </div>

      {stats.activeMs === 0 ? (
        <div style={CARD}>
          <EmptyState
            icon={Activity}
            title="Rien de mesuré ce jour-là"
            description={
              settings.enabled
                ? "Le suivi tourne : laisse l'app ouverte, les premières minutes apparaîtront ici dans une poignée de secondes."
                : "Le suivi est en pause. Active-le ci-dessus pour commencer à mesurer le temps passé sur ce poste."
            }
            size="lg"
          />
        </div>
      ) : (
        <>
          {/* ── Mesures de la journée ── */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))" }}>
            <KpiTile
              label="Temps actif"
              value={fmtDur(stats.activeMs)}
              valueMs={stats.activeMs}
              goalMs={workGoalMs}
              sub={<Delta ms={stats.activeMs} refMs={prev.activeMs} />}
            />
            <KpiTile
              label="Temps de focus"
              value={fmtDur(stats.focusMs)}
              valueMs={stats.focusMs}
              goalMs={focusGoalMs}
              color={PALETTE.green}
              sub={`${stats.focusSessions.length} session${stats.focusSessions.length > 1 ? "s" : ""} · plus longue ${fmtDur(stats.longestFocusMs)}`}
            />
            <KpiTile
              label="Distractions"
              value={fmtDur(stats.distractingMs)}
              color={stats.distractingMs > 0 ? PALETTE.red : T.text}
              sub={`${Math.round(stats.activeMs ? (stats.distractingMs / stats.activeMs) * 100 : 0)} % du temps actif`}
            />
            <KpiTile
              label="Pauses"
              value={fmtDur(stats.breakMs)}
              sub={`${stats.breaks.length} pause${stats.breaks.length > 1 ? "s" : ""} de 5 min ou plus`}
            />
            <KpiTile
              label="Bascules d'app"
              value={String(stats.switches)}
              sub={`${stats.switchesPerHour.toFixed(1)} par heure active`}
            />
            <KpiTile
              label="Absence au poste"
              value={fmtDur(stats.awayMs)}
              sub="Poste allumé, personne devant"
            />
          </div>

          {/* ── Le bandeau ── */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
            <BlockTitle right={`${fmtDur(stats.activeMs)} mesurés`}>La journée</BlockTitle>
            <TimelineBand segments={stats.segments} date={date} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 2 }}>
              {stats.byCategory.slice(0, 6).map(b => (
                <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textSub }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
                  {b.label} · {fmtDur(b.ms, { short: true })}
                </span>
              ))}
            </div>
          </div>

          {/* ── Répartition + score ── */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
              <BlockTitle right={`${stats.byCategory.length} catégories`}>Répartition</BlockTitle>
              <AllocationChart
                kind="ring"
                parts={parts}
                scale={100}
                size={168}
                thickness={20}
                ariaLabel="Répartition du temps par catégorie"
                centreLabel="Temps actif"
                centreValue={stats.activeMs}
                formatValue={(v) => fmtDur(v, { short: true })}
                showPct={false}
              />
              <CategoryRows buckets={stats.byCategory} limit={5} />
            </div>

            <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
              <BlockTitle>Qualité de la journée</BlockTitle>
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <ScoreDial value={stats.focusScore} />
                <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Productif", ms: stats.productiveMs, color: PALETTE.green },
                    { label: "Neutre", ms: stats.neutralMs, color: GREY.grey500 },
                    { label: "Distraction", ms: stats.distractingMs, color: PALETTE.red },
                  ].map(r => (
                    <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: T.textSub }}>{r.label}</span>
                        <span style={{ color: T.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtDur(r.ms)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "var(--color-hover-bg, #F0F0F0)", overflow: "hidden" }}>
                        <div style={{ width: `${stats.activeMs ? (r.ms / stats.activeMs) * 100 : 0}%`, height: "100%", background: r.color }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ paddingTop: 6, borderTop: `1px solid ${HAIRLINE}`, fontSize: 11, color: T.textSub, lineHeight: 1.45 }}>
                    Le score pèse la part du temps passée en session de focus et la stabilité
                    (bascules d’app par heure). Une journée hachée le fait tomber même quand le
                    total est bon.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Applications + sessions ── */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 10 }}>
              <BlockTitle right={`${stats.byApp.length} au total`}>Applications & sites</BlockTitle>
              <AppRows apps={stats.byApp} limit={8} />
            </div>
            <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 10 }}>
              <BlockTitle right={stats.focusSessions.length ? fmtDur(stats.focusMs) : null}>Sessions de focus</BlockTitle>
              <SessionRows sessions={stats.focusSessions} />
              {stats.breaks.length > 0 && (
                <>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: T.text }}>Pauses</div>
                  {stats.breaks.map(b => (
                    <div key={b.start} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSub, padding: "4px 0" }}>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtClock(b.start)} – {fmtClock(b.end)}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDur(b.ms)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ── Rythme ── */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
            <BlockTitle right={stats.hourly.reduce((best, h) => (h.productiveMs > best.productiveMs ? h : best), stats.hourly[0]).productiveMs > 0
              ? `meilleure heure : ${stats.hourly.reduce((best, h) => (h.productiveMs > best.productiveMs ? h : best), stats.hourly[0]).hour}h`
              : null}>
              Rythme de la journée
            </BlockTitle>
            <HourBars hourly={stats.hourly} />
            <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.textSub }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE.green }} /> productif
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: GREY.grey500 }} /> neutre
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE.red }} /> distraction
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
