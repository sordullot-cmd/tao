"use client";

/**
 * Onglet « Bilan » — ce que les sessions ont produit.
 *
 * Rien de ce qui est affiché ici n'est stocké : tout est recalculé depuis le
 * journal (cf. lib/focus/stats.ts). Un chiffre de discipline qui se garde en
 * mémoire finit toujours par mentir, et un chiffre qui mente vaut moins que pas
 * de chiffre du tout.
 *
 * Les barres sont en CSS et non en SVG : quatorze rectangles n'ont pas besoin
 * d'une bibliothèque de graphiques, et le thème sombre les suit tout seul.
 */

import React, { useMemo, useState } from "react";
import { Flame, ShieldCheck, Clock, ShieldBan } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, Field, Input, PeriodPills, SectionTitle } from "@/components/ui/da";
import { MODES, targetLabel } from "@/lib/focus/model";
import {
  DAY_MS, MIN_MS, byBlocklist, daySeries, dayTotals, fmtDur, focusScore, hourHistogram,
  streak, topTargets,
} from "@/lib/focus/stats";

const RANGES = [
  { id: "7", label: "7 jours", days: 7 },
  { id: "30", label: "30 jours", days: 30 },
  { id: "90", label: "90 jours", days: 90 },
];

/** Grand chiffre d'en-tête, avec son libellé et son repère. */
function Kpi({ icon, label, value, hint, color }) {
  return (
    <div style={{ ...CARD, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: T.textSub }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: color || T.text, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>{hint}</div>
    </div>
  );
}

/** Barres verticales, une par jour. La barre de l'objectif est un trait posé en
 *  travers : sans elle, une colonne haute ne dit pas si la journée a suffi. */
function DayBars({ series, goalMs }) {
  const max = Math.max(goalMs, ...series.map(d => d.focusedMs), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, position: "relative" }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute", left: 0, right: 0, bottom: `${(goalMs / max) * 100}%`,
          borderTop: `1px dashed ${HAIRLINE}`,
        }}
      />
      {series.map(d => {
        const ratio = d.focusedMs / max;
        const reached = d.focusedMs >= goalMs;
        return (
          <div key={d.key} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
            title={`${d.key} — ${fmtDur(d.focusedMs)}`}>
            <div style={{
              height: `${Math.max(ratio * 100, d.focusedMs ? 3 : 1)}%`,
              borderRadius: 4,
              background: d.focusedMs ? (reached ? PALETTE.green : `color-mix(in srgb, ${PALETTE.green} 35%, transparent)`) : FIELD_BG,
              transition: "height 200ms ease",
            }} />
          </div>
        );
      })}
    </div>
  );
}

/** Barre horizontale d'un classement (cibles tentées, temps par liste). */
function RankRow({ label, value, ratio, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 140, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 8, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
        <span style={{ display: "block", width: `${Math.max(2, ratio * 100)}%`, height: "100%", background: color, borderRadius: 999 }} />
      </span>
      <span style={{ width: 56, textAlign: "right", fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Objectif quotidien — le réglage qui gouverne les chiffres de cette page.
 *
 * Il vivait dans un onglet « Réglages » qu'on n'ouvrait jamais. Il est ici
 * parce que c'est lui qui décide de la série (les jours où il est atteint) et
 * du score (qui s'en sert de référence) : on le trouve au moment exact où l'on
 * juge la série sévère ou le score flatteur.
 *
 * Rendu AUSSI quand rien n'a encore été mesuré — c'est même le seul moment où
 * l'on a une raison d'y toucher avant d'avoir vu un seul résultat.
 */
function GoalCard({ store, setStore }) {
  return (
    <div style={{ ...CARD, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Objectif quotidien</div>
        <div style={{ fontSize: 12, color: T.textSub, marginTop: 3, lineHeight: 1.5 }}>
          Le temps concentré visé par jour. C&apos;est lui qui décide de la série et du score.
        </div>
      </div>
      <Field label="Minutes" style={{ width: 120 }}>
        <Input
          type="number" min={5} step={15} value={store.settings.dailyGoalMin}
          onChange={e => setStore(prev => ({
            ...prev, settings: { ...prev.settings, dailyGoalMin: Math.max(5, Number(e.target.value) || 0) },
          }))}
        />
      </Field>
    </div>
  );
}

export default function InsightsTab({ store, setStore, now }) {
  const [range, setRange] = useState("7");
  const days = RANGES.find(r => r.id === range)?.days || 7;
  const sinceMs = days * DAY_MS;
  const goalMs = Math.max(1, store.settings.dailyGoalMin) * MIN_MS;

  const series = useMemo(() => daySeries(store.log, days, now), [store.log, days, now]);
  const today = useMemo(() => dayTotals(store.log, now), [store.log, now]);
  const sk = useMemo(() => streak(store.log, goalMs, now), [store.log, goalMs, now]);
  const score = useMemo(() => focusScore(store.log, store.settings, now), [store.log, store.settings, now]);
  const targets = useMemo(() => topTargets(store.log, sinceMs, now), [store.log, sinceMs, now]);
  const lists = useMemo(() => byBlocklist(store.log, store, sinceMs, now), [store, sinceMs, now]);
  const hours = useMemo(() => hourHistogram(store.log, sinceMs, now), [store.log, sinceMs, now]);

  const periodMs = series.reduce((s, d) => s + d.focusedMs, 0);
  const periodSessions = series.reduce((s, d) => s + d.sessions, 0);
  /* Les sorties de l'app ne sont plus comptées — travailler ailleurs n'est pas
     une faute. Les journaux d'AVANT en contiennent encore : on les écarte du
     décompte plutôt que de les afficher, sans quoi le bilan de la semaine
     dernière et celui de cette semaine ne mesureraient pas la même chose. */
  const blocked = targets.filter(t => t.target !== "away");
  const blockedTotal = blocked.reduce((s, t) => s + t.count, 0);
  const maxHour = Math.max(...hours, 1);
  const bestHour = hours.indexOf(maxHour);

  if (store.log.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...CARD, padding: 26, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>Rien à mesurer encore</div>
          <div style={{ fontSize: 13, color: T.textSub, marginTop: 8, lineHeight: 1.6, maxWidth: 440, margin: "8px auto 0" }}>
            Le bilan se remplit à la première session terminée : temps tenu, série, ce qui
            a été tenté pendant. Rien n&apos;est compté avant.
          </div>
        </div>
        <GoalCard store={store} setStore={setStore} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SectionTitle size="sm">Bilan</SectionTitle>
        <PeriodPills value={range} onChange={setRange} options={RANGES} track size={12} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Kpi
          icon={<ShieldCheck size={13} />} label="Score de focus" value={score}
          hint="temps, sessions finies, calme"
          color={score >= 70 ? PALETTE.green : score >= 40 ? PALETTE.orange : PALETTE.red}
        />
        <Kpi icon={<Flame size={13} />} label="Série" value={`${sk.current} j`} hint={`record ${sk.best} j`} />
        <Kpi icon={<Clock size={13} />} label="Aujourd'hui" value={fmtDur(today.focusedMs)} hint={`objectif ${fmtDur(goalMs)}`} />
        <Kpi
          icon={<ShieldBan size={13} />} label="Blocages" value={blockedTotal}
          hint={blocked[0] ? `surtout ${targetLabel(blocked[0].target, store)}` : "sur la période"}
        />
      </div>

      <GoalCard store={store} setStore={setStore} />

      <div style={{ ...CARD, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <SectionTitle size="sm">Temps concentré</SectionTitle>
          <span style={{ fontSize: 12, color: T.textSub }}>
            {fmtDur(periodMs)} sur {days} jours — {periodSessions} session{periodSessions > 1 ? "s" : ""}
          </span>
        </div>
        <DayBars series={series} goalMs={goalMs} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMut }}>
          <span>{series[0]?.key.slice(5)}</span>
          <span>trait = objectif quotidien</span>
          <span>{series[series.length - 1]?.key.slice(5)}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {blocked.length > 0 && (
          <div style={{ ...CARD, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle size="sm">Ce qui a été tenté</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {blocked.slice(0, 6).map(t => (
                <RankRow
                  key={t.target}
                  label={targetLabel(t.target, store)}
                  value={t.count}
                  ratio={t.count / blocked[0].count}
                  color={PALETTE.red}
                />
              ))}
            </div>
          </div>
        )}

        {lists.length > 0 && (
          <div style={{ ...CARD, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle size="sm">Temps par liste</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lists.slice(0, 6).map(l => (
                <RankRow
                  key={l.id} label={l.name} value={fmtDur(l.ms)}
                  ratio={l.ms / lists[0].ms} color={PALETTE[l.color] || PALETTE.blue}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <GoalCard store={store} setStore={setStore} />

      <div style={{ ...CARD, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <SectionTitle size="sm">Vos heures</SectionTitle>
          <span style={{ fontSize: 12, color: T.textSub }}>
            {maxHour > MIN_MS ? `plus concentré vers ${String(bestHour).padStart(2, "0")} h` : "trop peu de données"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64 }}>
          {hours.map((ms, h) => (
            <div key={h} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }} title={`${h} h — ${fmtDur(ms)}`}>
              <div style={{
                height: `${Math.max((ms / maxHour) * 100, ms ? 3 : 1)}%`,
                borderRadius: 3,
                background: ms ? PALETTE.blue : FIELD_BG,
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMut }}>
          <span>00 h</span><span>12 h</span><span>23 h</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionTitle size="sm">Dernières sessions</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[...store.log].reverse().slice(0, 15).map(e => {
            const mode = MODES[e.mode] || MODES.normal;
            const start = new Date(e.startedAt);
            return (
              <div key={e.id} style={{ ...CARD, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: T.textMut, width: 96, fontVariantNumeric: "tabular-nums" }}>
                  {start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} {String(start.getHours()).padStart(2, "0")}:{String(start.getMinutes()).padStart(2, "0")}
                </span>
                <span style={{ flex: 1, minWidth: 120, fontSize: 13, fontWeight: 500, color: T.text }}>{e.name}</span>
                <span style={{ fontSize: 11, color: PALETTE[mode.color] }}>{mode.label}</span>
                {e.attempts?.length > 0 && (
                  <span style={{ fontSize: 11, color: T.textMut }}>{e.attempts.length} interruption{e.attempts.length > 1 ? "s" : ""}</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: e.completed ? PALETTE.green : T.textSub, fontVariantNumeric: "tabular-nums" }}>
                  {fmtDur(e.focusedMs)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
