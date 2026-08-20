"use client";

/**
 * Statistiques de révision.
 *
 * Deux chiffres portent tout l'écran : la RÉTENTION CONSTATÉE, qui dit si
 * l'algorithme tombe juste, et la PRÉVISION DE CHARGE, qui dit si le rythme est
 * tenable. Le reste éclaire l'un ou l'autre.
 *
 * Rien n'est stocké : tout se recalcule depuis le journal à chaque affichage.
 */

import React, { useMemo, useState } from "react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE, GREY } from "@/lib/ui/palette";
import { CARD, MiniKpi, SectionTitle, PeriodPills } from "@/components/ui/da";
import {
  forecast, history, intervalHistogram, knownCount, ratingBreakdown, retention,
  stateBreakdown, streak,
} from "@/lib/srs/stats";

const WINDOWS = [
  { id: 30, label: "30 j" },
  { id: 90, label: "3 mois" },
  { id: 365, label: "1 an" },
];

/* Les commentaires de lecture des mesures. Un chiffre sans son mode d'emploi
   se lit de travers — « 97 % de rétention » ressemble à une réussite alors que
   c'est le signe qu'on révise trop. */
const COPY = {
  driftBelow: (observed, target) =>
    `Vous oubliez plus souvent que prévu (${observed} contre ${target} visé). Les intervalles `
    + "sont trop longs pour vous : lancez l'optimisation des paramètres dans les réglages, et "
    + "si l'écart persiste, montez la rétention visée.",
  driftAbove: (observed, target) =>
    `Vous réussissez plus souvent que prévu (${observed} contre ${target} visé). Ce n'est pas `
    + "une bonne nouvelle : vous révisez trop tôt, donc trop, pour un gain mémoriel faible. "
    + "Optimisez les paramètres, ou baissez la rétention visée.",
  forecastCaveat:
    "Un plancher, pas un emploi du temps : les nouvelles cartes à venir et les oublis qui "
    + "ramèneront des cartes plus tôt n'y figurent pas.",
  retentionCaveat:
    "Seules les cartes en régime de croisière comptent, et une seule fois par jour : les "
    + "paliers d'apprentissage sont faits pour qu'on rate.",
  ratingsCaveat:
    "« Facile » et « Difficile » sont des exceptions. Si l'un des deux dépasse le quart de vos "
    + "réponses, vous notez au ressenti plutôt qu'au résultat, et l'algorithme travaille sur "
    + "des données faussées.",
};

/** Étiquette d'un jour `AAAA-MM-JJ` en « 12/03 ». */
function shortDay(day) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/**
 * Diagramme en barres empilées.
 *
 * Écrit à la main plutôt qu'avec une bibliothèque : il n'y a que deux séries et
 * pas d'axe à négocier, et une dépendance de plus coûterait plus cher que ces
 * quarante lignes. La hauteur est FIXE et les barres se partagent la largeur —
 * une frise de trente jours reste lisible sur un téléphone.
 */
function StackedBars({ data, series, height = 120, labelEvery = 5, emptyLabel }) {
  const max = Math.max(1, ...data.map(d => series.reduce((s, k) => s + (d[k.key] || 0), 0)));
  const nonEmpty = data.some(d => series.some(k => d[k.key]));

  if (!nonEmpty) {
    return (
      <div style={{ height, display: "grid", placeItems: "center", fontSize: 12, color: T.textMut }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
        {data.map((d, i) => {
          const total = series.reduce((s, k) => s + (d[k.key] || 0), 0);
          return (
            <div
              key={d.day || i}
              title={`${d.day ? shortDay(d.day) : d.label} — ${total}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1, minWidth: 0, height: "100%" }}
            >
              {series.map(k => {
                const v = d[k.key] || 0;
                if (!v) return null;
                return (
                  <div
                    key={k.key}
                    style={{
                      height: `${(v / max) * 100}%`,
                      minHeight: 2,
                      background: k.color,
                      borderRadius: 2,
                    }}
                  />
                );
              })}
              {total === 0 && <div style={{ height: 2, background: FIELD_BG, borderRadius: 2 }} />}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={d.day || i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 10, color: T.textMut, whiteSpace: "nowrap", overflow: "hidden" }}>
            {i % labelEvery === 0 ? (d.day ? shortDay(d.day) : d.label) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Légende d'une série. Les pastilles sont assombries d'un cran : une puce de
 *  8 px en couleur d'aplat ne tient pas le contraste. */
function Legend({ series }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {series.map(s => (
        <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textSub }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Barre de répartition : un tout découpé en parts, sur une ligne. */
function SplitBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <div style={{ height: 8, borderRadius: 999, background: FIELD_BG }} />;
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", gap: 1 }}>
      {parts.filter(p => p.value > 0).map(p => (
        <div key={p.label} title={`${p.label} : ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

export default function RevisionStats({ store, cards }) {
  const now = useMemo(() => new Date(), []);
  const [window, setWindow] = useState(30);

  const breakdown = useMemo(() => stateBreakdown(cards, now), [cards, now]);
  const fc = useMemo(() => forecast(cards, now, store.dayCutoffHour, 30), [cards, now, store.dayCutoffHour]);
  const hist = useMemo(() => history(store, now, window), [store, now, window]);
  const ret = useMemo(() => retention(store, now, window), [store, now, window]);
  const sk = useMemo(() => streak(store, now), [store, now]);
  const known = useMemo(() => knownCount(cards, now, store.config), [cards, now, store.config]);
  const intervals = useMemo(() => intervalHistogram(cards), [cards]);
  const ratings = useMemo(() => ratingBreakdown(store, now, window), [store, now, window]);

  const target = store.config.desiredRetention;
  const observed = ret.overall.rate;
  // Trois points d'écart : en deçà c'est du bruit d'échantillonnage, au-delà le
  // calendrier est réellement mal calibré.
  const drift = observed != null ? observed - target : null;
  const driftColor = drift == null ? T.textMut
    : Math.abs(drift) < 0.03 ? PALETTE.green
      : drift < 0 ? PALETTE.red : PALETTE.orange;

  const totalMinutes = hist.reduce((s, d) => s + d.minutes, 0);
  const totalReviews = hist.reduce((s, d) => s + d.total, 0);
  const nextWeek = fc.slice(0, 7).reduce((s, d) => s + d.total, 0);

  const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")} %`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SectionTitle>Statistiques</SectionTitle>
        <PeriodPills value={window} onChange={setWindow} options={WINDOWS} track size={12} />
      </div>

      {/* Les quatre chiffres de tête. */}
      <div style={{ ...CARD, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: T.textSub, marginBottom: 4 }}>Rétention constatée</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: driftColor, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {pct(observed)}
          </div>
          <div style={{ fontSize: 11, color: T.textMut, marginTop: 3 }}>
            {`visée ${pct(target)} · ${ret.overall.total} révision${ret.overall.total > 1 ? "s" : ""}`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textSub, marginBottom: 4 }}>Cartes sues</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: T.text, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(known)}
          </div>
          <div style={{ fontSize: 11, color: T.textMut, marginTop: 3 }}>
            somme des probabilités de rappel
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textSub, marginBottom: 4 }}>Série en cours</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: T.text, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {sk.current} j
          </div>
          <div style={{ fontSize: 11, color: T.textMut, marginTop: 3 }}>record {sk.best} j · {sk.activeDays} jours actifs</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textSub, marginBottom: 4 }}>Charge à 7 jours</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: T.text, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {nextWeek}
          </div>
          <div style={{ fontSize: 11, color: T.textMut, marginTop: 3 }}>
            {Math.round(nextWeek / 7)} par jour en moyenne
          </div>
        </div>
      </div>

      {/* Lecture de l'écart : c'est la seule mesure qui appelle une DÉCISION,
          elle mérite d'être interprétée et pas seulement affichée. */}
      {drift != null && ret.overall.total >= 30 && Math.abs(drift) >= 0.03 && (
        <div style={{ ...CARD, borderLeft: `3px solid ${driftColor}`, fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          {drift < 0
            ? COPY.driftBelow(pct(observed), pct(target))
            : COPY.driftAbove(pct(observed), pct(target))}
        </div>
      )}

      {/* Prévision de charge. */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Prévision de charge</div>
          <div style={{ fontSize: 11, color: T.textMut }}>30 prochains jours</div>
        </div>
        <StackedBars
          data={fc}
          series={[
            { key: "young", label: "Jeunes", color: PALETTE.blue },
            { key: "mature", label: "Mûres", color: PALETTE.green },
          ]}
          emptyLabel="Rien de programmé pour l'instant."
        />
        <Legend series={[
          { key: "young", label: "Jeunes (< 21 j)", color: PALETTE.blue },
          { key: "mature", label: "Mûres (≥ 21 j)", color: PALETTE.green },
        ]} />
        <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
          {COPY.forecastCaveat}
        </div>
      </div>

      {/* Historique. */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Travail effectué</div>
          <div style={{ fontSize: 11, color: T.textMut }}>
            {totalReviews} réponse{totalReviews > 1 ? "s" : ""}
            {totalMinutes >= 1 ? ` · ${Math.round(totalMinutes)} min` : ""}
          </div>
        </div>
        <StackedBars
          data={hist}
          series={[
            { key: "learning", label: "Apprentissage", color: PALETTE.red },
            { key: "young", label: "Jeunes", color: PALETTE.blue },
            { key: "mature", label: "Mûres", color: PALETTE.green },
          ]}
          labelEvery={window > 60 ? 30 : 5}
          emptyLabel="Aucune révision sur la période."
        />
        <Legend series={[
          { key: "learning", label: "Apprentissage", color: PALETTE.red },
          { key: "young", label: "Jeunes", color: PALETTE.blue },
          { key: "mature", label: "Mûres", color: PALETTE.green },
        ]} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {/* Composition du paquet. */}
        <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Composition</div>
          <SplitBar parts={[
            { label: "Nouvelles", value: breakdown.new, color: GREY.grey500 },
            { label: "Apprentissage", value: breakdown.learning, color: PALETTE.red },
            { label: "Jeunes", value: breakdown.young, color: PALETTE.blue },
            { label: "Mûres", value: breakdown.mature, color: PALETTE.green },
            { label: "Suspendues", value: breakdown.suspended, color: GREY.grey300 },
          ]} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 14 }}>
            <MiniKpi label="Nouvelles" value={breakdown.new} />
            <MiniKpi label="Apprentissage" value={breakdown.learning} />
            <MiniKpi label="Jeunes" value={breakdown.young} />
            <MiniKpi label="Mûres" value={breakdown.mature} />
            <MiniKpi label="Suspendues" value={breakdown.suspended} />
            <MiniKpi label="Total" value={breakdown.total} />
          </div>
        </div>

        {/* Rétention détaillée. */}
        <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Rétention par maturité</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Cartes jeunes (< 21 j)", data: ret.young, color: PALETTE.blue },
              { label: "Cartes mûres (≥ 21 j)", data: ret.mature, color: PALETTE.green },
            ].map(row => (
              <div key={row.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSub, marginBottom: 5 }}>
                  <span>{row.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: T.text, fontWeight: 600 }}>
                    {pct(row.data.rate)}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(row.data.rate || 0) * 100}%`, background: row.color, borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>
                  {row.data.passed} / {row.data.total}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
            {COPY.retentionCaveat}
          </div>
        </div>

        {/* Intervalles. */}
        <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Intervalles en cours</div>
          <StackedBars
            data={intervals.map(b => ({ label: b.label, count: b.count }))}
            series={[{ key: "count", label: "Cartes", color: PALETTE.blue }]}
            height={90}
            labelEvery={1}
            emptyLabel="Aucune carte en révision."
          />
        </div>

        {/* Boutons. */}
        <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Vos réponses</div>
          <SplitBar parts={[
            { label: "À revoir", value: ratings[1], color: PALETTE.red },
            { label: "Difficile", value: ratings[2], color: PALETTE.orange },
            { label: "Correct", value: ratings[3], color: PALETTE.green },
            { label: "Facile", value: ratings[4], color: PALETTE.blue },
          ]} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <MiniKpi label="À revoir" value={ratings[1]} />
            <MiniKpi label="Difficile" value={ratings[2]} />
            <MiniKpi label="Correct" value={ratings[3]} />
            <MiniKpi label="Facile" value={ratings[4]} />
          </div>
          <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
            {COPY.ratingsCaveat}
          </div>
        </div>
      </div>
    </div>
  );
}
