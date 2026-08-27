"use client";

/* ============================================================================
   « Activité » — la journée mesurée.

   ── Ce que la page raconte, dans l'ordre ──────────────────────────────────
     1. LA JOURNÉE : une phrase, quatre mesures, et le bandeau des heures. Tout
        ce qu'on vient chercher en ouvrant la page tient dans cette carte.
     2. OÙ EST PASSÉ LE TEMPS : une seule zone, trois lectures au choix
        (catégories, applications, rythme). C'est le même temps regardé sous
        trois angles — pas trois blocs à empiler.
     3. LE DÉTAIL : sessions de focus et pauses, replié par défaut.

   ── Pourquoi ce n'est plus dix blocs ──────────────────────────────────────
   La page alignait six tuiles de mesure, un bandeau, un anneau, un cadran, deux
   listes et un graphe d'heures, chacun dans sa carte. Onze objets de même poids
   visuel : aucun ne dit ce qu'il faut regarder en premier, et l'anneau demandait
   170 px pour comparer des angles là où une barre suffit. On a donc gardé les
   MÊMES mesures — rien n'a été retiré du calcul — en les hiérarchisant : une
   carte qu'on lit, une carte qu'on fouille, un tiroir qu'on ouvre rarement.

   ── Corriger un classement se fait ICI ────────────────────────────────────
   Chaque ligne d'application porte sa catégorie, et cette pastille se change en
   deux clics : la règle correspondante est écrite pour l'utilisateur, sur le bon
   champ (le titre pour un site, le nom pour une application). Tout l'historique
   se reclasse aussitôt (cf. `recategorize` dans lib/activity/stats).

   Les mesures viennent de lib/activity : la page ne calcule rien elle-même, elle
   ne fait que choisir ce qu'on lit et dans quel ordre.
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import { CARD, HAIRLINE, PeriodPills, StepperPill, PillButton } from "@/components/ui/da";
import { EmptyState } from "@/components/ui/EmptyState";
import { T } from "@/lib/ui/tokens";
import { PALETTE, GREY } from "@/lib/ui/palette";
import { getLocalDateString } from "@/lib/dateUtils";
import { dayStats, fmtClock, fmtDur } from "@/lib/activity/stats";
import { categoryLabel, isBrowser } from "@/lib/activity/categories";
import { useActivityLive, useActivitySettings, useDayLog } from "@/lib/hooks/useActivityTracker";
import {
  ActivityHeader, AppRows, BarLegend, CategoryRows, DayColumn, Disclosure, HourBars,
  Metric, SessionRows, SourceNotice, StackedBar, TrackingPill,
} from "@/components/activity/ActivityChrome";

const TODAY = () => getLocalDateString();

const VIEWS = [
  { id: "cats", label: "Catégories" },
  { id: "apps", label: "Applications" },
  { id: "rhythm", label: "Rythme" },
];

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

/**
 * La journée en une phrase.
 *
 * Un total ne dit pas ce qu'a été la journée : « 6 h 12 » est vrai d'une journée
 * pleine comme d'une journée hachée. On nomme donc ce qui a dominé, quand on a
 * été bon, et ce qui a coûté — trois faits, pas un jugement.
 */
function headline(stats) {
  const bits = [];
  const top = stats.byCategory[0];
  if (top) bits.push(`${top.label} en tête (${Math.round(top.pct)} %)`);
  const best = stats.hourly.reduce((b, h) => (h.productiveMs > b.productiveMs ? h : b), stats.hourly[0]);
  if (best?.productiveMs > 0) bits.push(`meilleure heure ${best.hour} h`);
  if (stats.focusSessions.length) {
    bits.push(`${stats.focusSessions.length} session${stats.focusSessions.length > 1 ? "s" : ""} de focus`);
  } else {
    bits.push("aucune session de focus");
  }
  if (stats.switchesPerHour >= 20) bits.push(`${Math.round(stats.switchesPerHour)} bascules par heure`);
  return bits.join(" · ");
}

export default function ActivityPage({ setPage }) {
  const [settings, setSettings] = useActivitySettings();
  const live = useActivityLive();
  const [date, setDate] = useState(() => TODAY());
  const [view, setView] = useState("cats");
  /* Filtre posé depuis la carte « non classé » : on n'envoie pas l'utilisateur
     dans une autre page pour ranger deux applications, on lui montre les
     applications concernées, ici. */
  const [onlyPending, setOnlyPending] = useState(false);

  const day = useDayLog(date);
  const prevDay = useDayLog(shiftDate(date, -1));

  const stats = useMemo(() => dayStats(day, settings), [day, settings]);
  const prev = useMemo(() => dayStats(prevDay, settings), [prevDay, settings]);

  const isToday = date === TODAY();
  const workGoalMs = settings.workGoalHours * 3600_000;
  const focusGoalMs = settings.focusGoalHours * 3600_000;

  const other = stats.byCategory.find(b => b.id === "other");
  const pendingApps = useMemo(() => stats.byApp.filter(a => a.cat === "other"), [stats.byApp]);

  /**
   * Ranger une application depuis sa ligne : on écrit la règle de l'utilisateur
   * à sa place, sur le champ qui convient. Un site ne se reconnaît qu'à son
   * titre — une règle sur « chrome » classerait tout le navigateur.
   */
  const assign = (bucket, category) => {
    const viaTitle = bucket.isSite;
    const match = (viaTitle ? bucket.label : bucket.app || bucket.label).trim().toLowerCase();
    if (!match) return;
    setSettings(s => ({
      ...s,
      rules: [
        ...s.rules,
        {
          id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          match,
          field: viaTitle ? "title" : "app",
          category,
        },
      ],
    }));
  };

  /* Une page de navigateur sans nom de site reconnaissable ne peut pas donner
     de règle sûre : le seul texte disponible est celui du navigateur lui-même,
     et une règle dessus classerait TOUTE la navigation. Ces lignes-là se règlent
     dans « Catégories & règles », sur un fragment choisi à la main. */
  const canAssign = (a) => !(a.isSite && isBrowser(a.label));
  const onPick = (a, c) => { if (canAssign(a)) assign(a, c); };

  const apps = onlyPending ? pendingApps : stats.byApp;
  const bestHour = stats.hourly.reduce((b, h) => (h.productiveMs > b.productiveMs ? h : b), stats.hourly[0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ActivityHeader
        page="activity"
        setPage={setPage}
        live={isToday ? live : null}
        right={
          <>
            <TrackingPill
              enabled={settings.enabled}
              onChange={(v) => setSettings(s => ({ ...s, enabled: v }))}
              hint={`Relevé toutes les ${settings.pollSeconds} s · inactivité comptée après ${Math.round(settings.afkSeconds / 60)} min sans clavier ni souris`}
            />
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

      {stats.activeMs === 0 ? (
        <div style={CARD}>
          <EmptyState
            icon={Activity}
            title="Rien de mesuré ce jour-là"
            description={
              settings.enabled
                ? "Le suivi tourne : laisse l'app ouverte, les premières minutes apparaîtront ici dans une poignée de secondes."
                : "Le suivi est en pause. Reprends-le depuis l'en-tête pour mesurer le temps passé sur ce poste."
            }
            size="lg"
          />
        </div>
      ) : (
        <>
          {/* ═══ 1. La journée ═══════════════════════════════════════════════
              À gauche, la journée DESSINÉE : la même grille horaire que le
              calendrier de l'agenda, parce que c'est le même objet mental — des
              heures, des pavés, et des trous. À droite, ce que ces pavés font
              une fois additionnés. Le dessin ne prend qu'un tiers de la carte :
              il montre la forme, il ne remplace pas les nombres. */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: T.textSub }}>{headline(stats)}</span>
              <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
                {stats.firstAt ? `${fmtClock(stats.firstAt)} → ${fmtClock(stats.lastAt)}` : ""}
              </span>
            </div>

            {/* `stretch` + `space-between` : le résumé s'aligne sur la hauteur de
                la grille et sa dernière ligne se pose à son pied, au lieu de
                laisser un vide sous une colonne deux fois plus haute. */}
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "stretch" }}>
              {/* La journée, heure par heure — la moitié de la carte : c'est le
                  dessin qu'on vient regarder, pas une vignette. */}
              <div style={{ flex: "1 1 380px", minWidth: 300, display: "flex", flexDirection: "column", gap: 6 }}>
                <DayColumn blocks={stats.blocks} date={date} />
                <span style={{ fontSize: 11, color: T.textMut, lineHeight: 1.45 }}>
                  Un pavé = une matière tant qu’elle dure, à la couleur de sa catégorie ; les blancs sont
                  les pauses. Survole un pavé pour voir ce qu’il contient.
                </span>
              </div>

              {/* Le résumé de la journée, à sa droite et de même largeur. */}
              <div style={{ flex: "1 1 380px", minWidth: 288, display: "flex", flexDirection: "column", gap: 16, justifyContent: "space-between" }}>
                <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))" }}>
                  <Metric
                    label="Temps actif"
                    value={fmtDur(stats.activeMs)}
                    valueMs={stats.activeMs}
                    goalMs={workGoalMs}
                    size={30}
                    sub={<Delta ms={stats.activeMs} refMs={prev.activeMs} />}
                  />
                  <Metric
                    label="Temps de focus"
                    value={fmtDur(stats.focusMs)}
                    valueMs={stats.focusMs}
                    goalMs={focusGoalMs}
                    size={30}
                    color={PALETTE.green}
                    sub={`${stats.focusSessions.length} session${stats.focusSessions.length > 1 ? "s" : ""} · plus longue ${fmtDur(stats.longestFocusMs)}`}
                  />
                  <Metric
                    label="Distractions"
                    value={fmtDur(stats.distractingMs)}
                    size={30}
                    color={stats.distractingMs > 0 ? PALETTE.red : T.text}
                    sub={`${Math.round(stats.activeMs ? (stats.distractingMs / stats.activeMs) * 100 : 0)} % du temps actif`}
                  />
                  <Metric
                    label="Qualité"
                    value={`${stats.focusScore}`}
                    valueMs={stats.focusScore}
                    goalMs={100}
                    size={30}
                    color={stats.focusScore >= 70 ? PALETTE.green : stats.focusScore >= 45 ? PALETTE.yellow : PALETTE.red}
                    sub="part du focus et stabilité, sur 100"
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <StackedBar parts={stats.byCategory} height={12} />
                  <BarLegend parts={stats.byCategory} limit={7} />
                </div>

                <div style={{
                  display: "flex", flexWrap: "wrap", gap: "6px 18px", paddingTop: 12,
                  borderTop: `1px solid ${HAIRLINE}`, fontSize: 11, color: T.textSub,
                }}>
                  <span>Amplitude <strong style={{ color: T.text, fontWeight: 600 }}>{fmtDur(stats.spanMs)}</strong></span>
                  <span>Pauses <strong style={{ color: T.text, fontWeight: 600 }}>{fmtDur(stats.breakMs)}</strong> ({stats.breaks.length})</span>
                  <span>Absence au poste <strong style={{ color: T.text, fontWeight: 600 }}>{fmtDur(stats.awayMs)}</strong></span>
                  <span>Bascules d’app <strong style={{ color: T.text, fontWeight: 600 }}>{stats.switches}</strong> ({stats.switchesPerHour.toFixed(1)} / h)</span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ 2. Où est passé le temps ════════════════════════════════════
              Trois lectures du même temps, dans une seule carte : on choisit
              l'angle au lieu de faire défiler trois blocs. */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <PeriodPills value={view} onChange={(v) => { setView(v); if (v !== "apps") setOnlyPending(false); }} options={VIEWS} track size={13} />
              <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
                {view === "apps"
                  ? `${apps.length} application${apps.length > 1 ? "s" : ""}`
                  : view === "cats"
                    ? `${stats.byCategory.length} catégorie${stats.byCategory.length > 1 ? "s" : ""}`
                    : bestHour?.productiveMs > 0 ? `meilleure heure : ${bestHour.hour} h` : null}
              </span>
            </div>

            {view === "cats" && (
              <>
                <StackedBar parts={stats.byCategory} height={14} />
                <CategoryRows buckets={stats.byCategory} limit={6} productivity={settings.productivity} />

                {/* La nature du temps, sous la répartition : c'est la même
                    matière regroupée en trois, et c'est elle qui décide du
                    score. Elle n'avait pas besoin d'une carte à part. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
                  <StackedBar
                    height={10}
                    parts={[
                      { id: "p", label: "Productif", color: PALETTE.green, ms: stats.productiveMs, pct: stats.activeMs ? (stats.productiveMs / stats.activeMs) * 100 : 0 },
                      { id: "n", label: "Neutre", color: GREY.grey500, ms: stats.neutralMs, pct: stats.activeMs ? (stats.neutralMs / stats.activeMs) * 100 : 0 },
                      { id: "d", label: "Distraction", color: PALETTE.red, ms: stats.distractingMs, pct: stats.activeMs ? (stats.distractingMs / stats.activeMs) * 100 : 0 },
                    ]}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 11, color: T.textSub }}>
                    <span><span style={dotStyle(PALETTE.green)} />Productif {fmtDur(stats.productiveMs)}</span>
                    <span><span style={dotStyle(GREY.grey500)} />Neutre {fmtDur(stats.neutralMs)}</span>
                    <span><span style={dotStyle(PALETTE.red)} />Distraction {fmtDur(stats.distractingMs)}</span>
                    <span style={{ color: T.textMut }}>La nature d’une catégorie se règle dans « Catégories & règles ».</span>
                  </div>
                </div>

                {other && other.pct >= 5 && (
                  <button
                    type="button"
                    onClick={() => { setView("apps"); setOnlyPending(true); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                      border: "none", background: T.amberBg, color: T.text, fontFamily: "inherit",
                      fontSize: 12, textAlign: "left", cursor: "pointer",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontWeight: 600 }}>{fmtDur(other.ms)} non classés</strong>{" "}
                      sur {pendingApps.length} application{pendingApps.length > 1 ? "s" : ""} — tant qu’elles ne sont pas rangées,
                      elles ne comptent ni comme travail ni comme distraction.
                    </span>
                    <ArrowRight size={14} style={{ flexShrink: 0 }} />
                  </button>
                )}
              </>
            )}

            {view === "apps" && (
              <>
                {pendingApps.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <PillButton
                      compact
                      variant={onlyPending ? "primary" : "ghost"}
                      onClick={() => setOnlyPending(v => !v)}
                    >
                      {onlyPending ? "Tout afficher" : `${pendingApps.length} à classer`}
                    </PillButton>
                    <span style={{ fontSize: 11, color: T.textSub }}>
                      Change la pastille d’une ligne : la règle est écrite pour toi et tout l’historique se reclasse.
                    </span>
                  </div>
                )}
                <AppRows
                  apps={apps}
                  limit={onlyPending ? 20 : 10}
                  onPick={onPick}
                  empty="Tout est classé sur cette journée."
                />
              </>
            )}

            {view === "rhythm" && (
              <>
                <HourBars hourly={stats.hourly} height={120} />
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.textSub, flexWrap: "wrap" }}>
                  <span><span style={dotStyle(PALETTE.green)} />productif</span>
                  <span><span style={dotStyle(GREY.grey500)} />neutre</span>
                  <span><span style={dotStyle(PALETTE.red)} />distraction</span>
                  <span style={{ color: T.textMut }}>
                    Un segment à cheval sur deux heures est réparti au prorata : une session de 11 h 50 à 12 h 40
                    ne se lit pas entièrement à 11 h.
                  </span>
                </div>
              </>
            )}
          </div>

          {/* ═══ 3. Le détail ════════════════════════════════════════════════ */}
          <Disclosure
            title="Sessions de focus et pauses"
            right={`${stats.focusSessions.length} session${stats.focusSessions.length > 1 ? "s" : ""} · ${stats.breaks.length} pause${stats.breaks.length > 1 ? "s" : ""}`}
          >
            <SessionRows sessions={stats.focusSessions} />
            {stats.breaks.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>Pauses</div>
                {stats.breaks.map(b => (
                  <div key={b.start} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSub, padding: "4px 0" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtClock(b.start)} – {fmtClock(b.end)}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDur(b.ms)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.5 }}>
              Une session de focus est une plage productive d’au moins {settings.focusMinMinutes} min, qu’une
              interruption de moins de {settings.focusGapMinutes} min ne casse pas. Le score pèse la part du temps
              passée en session et la stabilité (bascules d’app par heure) : une journée hachée le fait tomber même
              quand le total est bon.
              {stats.focusSessions.length > 0 && ` Catégorie dominante de la plus longue : ${categoryLabel(stats.focusSessions.reduce((b, s) => (s.ms > b.ms ? s : b), stats.focusSessions[0]).cat)}.`}
            </div>
          </Disclosure>
        </>
      )}
    </div>
  );
}

/** Pastille de légende — la même dans les trois listes de la page. */
function dotStyle(color) {
  return {
    display: "inline-block", width: 8, height: 8, borderRadius: 2,
    background: color, marginRight: 6, verticalAlign: "middle",
  };
}
